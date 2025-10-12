import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventParticipantsService } from './event-participants.service';
import { EventParticipantsController } from './event-participants.controller';
import { EventParticipant } from './event-participants.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([EventParticipant]), AuthModule],
  providers: [EventParticipantsService],
  controllers: [EventParticipantsController],
})
export class EventParticipantsModule {}
