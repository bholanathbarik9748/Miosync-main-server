import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './events.entity';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EventParticipant } from '../event-participants/event-participants.entity';
import { EventsReminderScheduler } from './events-reminder.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventParticipant]),
    AuthModule,
    WhatsAppModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventsReminderScheduler],
  exports: [EventsService],
})
export class EventsModule {}
