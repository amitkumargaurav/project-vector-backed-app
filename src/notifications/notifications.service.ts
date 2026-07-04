import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerService } from '../worker/worker.service';
import { NotificationPreferencesDto } from './dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly worker: WorkerService,
  ) {}

  list(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  preferences(userId: string) {
    return this.prisma.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async create(userId: string, data: { type: string; title: string; body: string; payloadJson: Record<string, unknown> }) {
    const [preferences, privacySettings] = await Promise.all([
      this.prisma.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } }),
      this.prisma.privacySetting.upsert({ where: { userId }, update: {}, create: { userId } }),
    ]);
    if (!preferences.notificationEnabled) throw new BadRequestException('Notifications are disabled for this user.');

    const maxPerDay = preferences.maxNotificationsPerDay || this.config.get<number>('MAX_NOTIFICATIONS_PER_DAY', 3);
    const scheduledAt = this.shiftOutOfQuietHours(new Date(), preferences.quietHoursStart, preferences.quietHoursEnd);
    const start = new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate()));
    const end = new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate(), 23, 59, 59, 999));
    const existingCount = await this.prisma.notification.count({
      where: { userId, status: { in: ['scheduled', 'sent'] }, scheduledAt: { gte: start, lte: end } },
    });
    if (existingCount >= maxPerDay) throw new BadRequestException('Daily notification cap reached for this user.');

    const content = privacySettings.sensitiveGoalModeEnabled
      ? { title: 'Vector reminder', body: 'Open Vector to review your plan.' }
      : { title: data.title, body: data.body };
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: data.type,
        title: content.title,
        body: content.body,
        payloadJson: data.payloadJson as Prisma.InputJsonValue,
        status: 'scheduled',
        scheduledAt,
      },
    });
    await this.worker.enqueueNotification(notification.id);
    return notification;
  }

  updatePreferences(userId: string, body: NotificationPreferencesDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: body,
      create: { userId, ...body },
    });
  }

  async mark(userId: string, notificationId: string, status: Extract<NotificationStatus, 'read' | 'clicked'>) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found.');
    if (notification.userId !== userId) throw new ForbiddenException('Notification does not belong to the current user.');
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: status === 'read' ? { status, readAt: new Date() } : { status, clickedAt: new Date() },
    });
  }

  private shiftOutOfQuietHours(now: Date, quietHoursStart?: string | null, quietHoursEnd?: string | null) {
    if (!quietHoursStart || !quietHoursEnd) return now;
    const current = now.getUTCHours() * 60 + now.getUTCMinutes();
    const start = this.minutesOfDay(quietHoursStart);
    const end = this.minutesOfDay(quietHoursEnd);
    if (start === null || end === null) return now;
    const inQuietHours = start < end ? current >= start && current < end : current >= start || current < end;
    if (!inQuietHours) return now;

    const shifted = new Date(now);
    shifted.setUTCHours(Math.floor(end / 60), end % 60, 0, 0);
    if (start > end && current >= start) shifted.setUTCDate(shifted.getUTCDate() + 1);
    return shifted;
  }

  private minutesOfDay(value: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
}
