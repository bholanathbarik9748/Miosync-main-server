import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppDataSource } from '../../core/database.providers';
import { LoggerMiddleware } from '../../common/middleware/logger.middleware';
import { EventParticipantsModule } from '../event-participants/event-participants.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(AppDataSource.options),
    EventsModule,
    EventParticipantsModule,
    WhatsAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
