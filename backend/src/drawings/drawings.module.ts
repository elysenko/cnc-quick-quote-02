import { Module } from '@nestjs/common';
import { DrawingsService } from './drawings.service';
import { DrawingsController } from './drawings.controller';
import { BendsController } from './bends.controller';

@Module({
  controllers: [DrawingsController, BendsController],
  providers: [DrawingsService],
  exports: [DrawingsService],
})
export class DrawingsModule {}
