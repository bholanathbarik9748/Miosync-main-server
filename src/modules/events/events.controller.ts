import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  ValidationPipe,
  Version,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { EventDto } from './dto/events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserType } from '../../utils/enums';

@Controller('/events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Roles(UserType.LOGISTICS)
  getEvents(): Promise<any> {
    return this.eventsService.getEvents();
  }

  @Get('/:id')
  @Roles(UserType.SUPER_ADMIN)
  getEventsDetails(@Param('id') id: string): Promise<any> {
    return this.eventsService.getEventData(id);
  }

  @Post('')
  @Version('2')
  @Roles(UserType.SUPER_ADMIN)
  createEvent(@Body(ValidationPipe) body: EventDto): Promise<any> {
    return this.eventsService.createEvent(body);
  }

  @Put('/:id')
  @Roles(UserType.SUPER_ADMIN)
  editEvent(
    @Param('id') id: string,
    @Body(ValidationPipe) body: EventDto,
  ): Promise<any> {
    return this.eventsService.editEvent(id, body);
  }

  @Delete('/:id')
  @Roles(UserType.SUPER_ADMIN)
  deleteEvent(@Param('id') id: string): Promise<any> {
    return this.eventsService.deleteEvent(id);
  }
}
