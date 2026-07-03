import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { VECTOR_QUEUE } from './worker.constants';

@Injectable()
export class WorkerService {
  constructor(@InjectQueue(VECTOR_QUEUE) private readonly queue: Queue) {}

  enqueueSnapshotRecalculation(userId: string, fromDate: string, toDate: string) {
    return this.queue.add('snapshot.recalculate', { userId, fromDate, toDate });
  }

  enqueueProbabilityUpdate(userId: string, goalId: string) {
    return this.queue.add('probability.update', { userId, goalId });
  }

  enqueueNotification(notificationId: string) {
    return this.queue.add('notification.send', { notificationId });
  }
}
