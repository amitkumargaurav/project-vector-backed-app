import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  create(userId: string, data: { type: string; title: string; body: string; payloadJson: Record<string, unknown> }) {
    return this.prisma.notification.create({
      data: { userId, ...data, payloadJson: data.payloadJson as Prisma.InputJsonValue, status: 'scheduled', scheduledAt: new Date() },
    });
  }

  updatePreferences(userId: string, body: Record<string, unknown>) {
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
}
