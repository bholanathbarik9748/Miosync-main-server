import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket } from './help-desk.entity';
import {
  CreateSupportTicketDto,
  UpdateTicketStatusDto,
} from './dto/help-desk.dto';

@Injectable()
export class HelpDeskService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepository: Repository<SupportTicket>,
  ) {}

  async createTicket(id: string, body: CreateSupportTicketDto): Promise<any> {
    const { name, roomNumber, phoneNumber, request, priority } = body;
    const response: unknown = await this.ticketRepository.query(
      `INSERT INTO "support_tickets" ("eventId","name", "roomNumber", "phoneNumber", "request", "priority") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, name, roomNumber, phoneNumber, request, priority],
    );
    return response;
  }

  async getTickets(): Promise<any> {
    const response: unknown = await this.ticketRepository.query(
      'SELECT * FROM "support_tickets"',
    );
    return response;
  }

  async getTicketsByEvent(eventId: string): Promise<any> {
    const response: unknown = await this.ticketRepository.query(
      'SELECT * FROM "support_tickets" WHERE "eventId" = $1',
      [eventId],
    );
    return response;
  }

  async getTicketsDetails(id: string, eventId: string): Promise<any> {
    const response: unknown = await this.ticketRepository.query(
      'SELECT * FROM "support_tickets" WHERE "id" = $2 AND "eventId" = $1',
      [id, eventId],
    );
    return response;
  }

  async changeTicketStatus(
    eventId: string,
    id: string,
    body: UpdateTicketStatusDto,
  ): Promise<any> {
    const { status } = body;
    const response: unknown = await this.ticketRepository.query(
      'UPDATE "support_tickets" SET "status" = $3 WHERE "id" = $1 AND "eventId" = $2 RETURNING *',
      [id, eventId, status],
    );
    return response;
  }
}
