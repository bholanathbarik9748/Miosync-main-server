import { Injectable } from '@nestjs/common';

@Injectable()
export class EventsService {
  getHello(): string {
    return 'Welcome to Miosync Main Server. The API is up and running.......';
  }
}
