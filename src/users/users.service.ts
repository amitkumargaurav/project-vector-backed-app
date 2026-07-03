import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePrivacyDto, UpdateProfileDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preferences: true, privacySettings: true },
    });
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    const data = { ...dto, preferencesJson: dto.preferencesJson as Prisma.InputJsonValue | undefined };
    return this.prisma.userProfile.upsert({
      where: { userId },
      update: data as Prisma.UserProfileUpdateInput,
      create: { userId, ...data },
    });
  }

  updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    return this.prisma.privacySetting.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  updateNotificationSettings(userId: string, body: Record<string, unknown>) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: body,
      create: { userId, ...body },
    });
  }
}
