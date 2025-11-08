import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventParticipantsService } from './event-participants.service';
import { EventParticipantsController } from './event-participants.controller';
import { EventParticipant } from './event-participants.entity';
import { Event } from '../events/events.entity';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { UploadDocumentModule } from '../upload-document/upload-document.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventParticipant, Event]),
    AuthModule,
    WhatsAppModule,
    EventsModule,
    UploadDocumentModule,
  ],
  providers: [EventParticipantsService],
  controllers: [EventParticipantsController],
})
export class EventParticipantsModule {}
