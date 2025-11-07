import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { AuthModule } from '../auth/auth.module';
import { EventParticipant } from '../event-participants/event-participants.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([EventParticipant])],
  providers: [WhatsAppService],
  controllers: [WhatsAppController],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
