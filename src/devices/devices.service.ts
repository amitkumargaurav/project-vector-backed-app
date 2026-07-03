import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  register(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.device.create({
      data: { userId, ...dto, timezone: dto.timezone ?? 'UTC', lastSeenAt: new Date() },
    });
  }

  async update(userId: string, deviceId: string, data: Record<string, unknown>) {
    await this.assertOwner(userId, deviceId);
    return this.prisma.device.update({ where: { id: deviceId }, data: { ...data, lastSeenAt: new Date() } });
  }

  async remove(userId: string, deviceId: string) {
    await this.assertOwner(userId, deviceId);
    return this.prisma.device.update({ where: { id: deviceId }, data: { isActive: false, deletedAt: new Date() } });
  }

  private async assertOwner(userId: string, deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found.');
    if (device.userId !== userId) throw new ForbiddenException('Device does not belong to the current user.');
  }
}
