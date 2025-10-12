import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { HelpDeskService } from './help-desk.service';
import {
  CreateSupportTicketDto,
  UpdateTicketStatusDto,
} from './dto/help-desk.dto';

@Controller('help-desk')
export class HelpDeskController {
  constructor(private readonly helpDeskService: HelpDeskService) {}

  @Post('/:id')
  async createTicket(
    @Body() body: CreateSupportTicketDto,
    @Param('id') id: string,
  ): Promise<any> {
    return await this.helpDeskService.createTicket(id, body);
  }

  @Get()
  async getTickets(): Promise<any> {
    return await this.helpDeskService.getTickets();
  }

  @Get('/:eventId')
  async getTicketsByEvent(@Param('eventId') eventId: string): Promise<any> {
    return await this.helpDeskService.getTicketsByEvent(eventId);
  }

  @Get('/:eventId/:id')
  async getTicketsDetails(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return await this.helpDeskService.getTicketsDetails(eventId, id);
  }

  @Patch('/:eventId/:id')
  async changeTicketStatus(
    @Param('eventId') eventId: string,
    @Param('id') id: string,
    @Body() body: UpdateTicketStatusDto,
  ): Promise<any> {
    return await this.helpDeskService.changeTicketStatus(eventId, id, body);
  }
}
