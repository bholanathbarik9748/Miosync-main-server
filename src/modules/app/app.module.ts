import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { AuthModule } from '../auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppDataSource } from '../../core/database.providers';
import { LoggerMiddleware } from '../../middleware/logger.middleware';
import { EventParticipantsModule } from '../event-participants/event-participants.module';
import { HelpDeskModule } from '../help-desk/help-desk.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(AppDataSource.options),
    AuthModule,
    EventsModule,
    EventParticipantsModule,
    HelpDeskModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
