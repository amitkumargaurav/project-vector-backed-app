import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SyncRevisionService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, entityType: string, entityId: string, action: string, payload: Prisma.InputJsonValue = {}) {
    return this.prisma.syncChangeLog.create({
      data: { userId, entityType, entityId, action, payloadJson: payload },
    });
  }
}

