import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpDeskController } from './help-desk.controller';
import { HelpDeskService } from './help-desk.service';
import { SupportTicket } from './help-desk.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket])],
  controllers: [HelpDeskController],
  providers: [HelpDeskService],
  exports: [HelpDeskService],
})
export class HelpDeskModule {}
