import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventParticipantsService } from './event-participants.service';
import { EventParticipantsController } from './event-participants.controller';
import { EventParticipant } from './event-participants.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EventParticipant])],
  providers: [EventParticipantsService],
  controllers: [EventParticipantsController],
})
export class EventParticipantsModule {}
