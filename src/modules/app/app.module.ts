import { Module } from '@nestjs/common';

import { EventsController, EventsService } from '../events';
import { AppController, AppService } from '../app';

@Module({
  controllers: [AppController, EventsController],
  providers: [AppService, EventsService],
})
export class AppModule {}
