import { Controller, Get } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('/events')
  getHello(): string {
    return this.eventsService.getHello();
  }
}
