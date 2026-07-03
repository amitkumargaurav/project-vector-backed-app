import { Global, Module } from '@nestjs/common';
import { SyncRevisionService } from './sync-revision.service';

@Global()
@Module({
  providers: [SyncRevisionService],
  exports: [SyncRevisionService],
})
export class CommonModule {}
