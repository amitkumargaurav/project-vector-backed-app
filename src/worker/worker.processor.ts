import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VECTOR_QUEUE } from './worker.constants';

@Processor(VECTOR_QUEUE)
export class WorkerProcessor extends WorkerHost {
  async process(job: Job) {
    return {
      job: job.name,
      status: 'accepted',
      note: 'Phase 0 worker hook registered. Add concrete recalculation/FCM/AI implementations behind this queue.',
    };
  }
}
