import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './events.entity';
import { EventDto, FoodType } from './dto/events.dto';

export interface EventInterface {
  id: string;
  eventName: string;
  eventDateTime: Date;
  venue: string;
  food: FoodType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventRepository: Repository<Event>,
  ) {}

  async getEvents(): Promise<any> {
    const response: EventInterface[] = await this.eventRepository.query(
      'SELECT * FROM "events"',
    );
    return response;
  }

  async getEventData(id: string): Promise<any> {
    const response: EventInterface[] = await this.eventRepository.query(
      'SELECT * FROM "events" WHERE id = $1',
      [id],
    );

    if (response.length === 0) {
      throw new NotFoundException(`Event not found`);
    }
    return response;
  }

  async createEvent(body: EventDto): Promise<any> {
    const { eventName, eventDateTime, food, venue } = body;

    const response: EventInterface[] = await this.eventRepository.query(
      `INSERT INTO "events" ("eventName", "eventDateTime", "food", "venue", "isActive", "createdAt", "updatedAt") 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
     RETURNING *`,
      [eventName, new Date(eventDateTime), food, venue, true],
    );

    if (response.length === 0) {
      throw new NotFoundException(`Event not found`);
    }

    return response[0];
  }

  async editEvent(id: string, body: EventDto): Promise<any> {
    const { eventName, eventDateTime, venue, food } = body;

    // Update with raw SQL and return updated row
    const response: EventInterface[] = await this.eventRepository.query(
      `
      UPDATE "events"
      SET
        "eventName" = COALESCE($1, "eventName"),
        "eventDateTime" = COALESCE($2, "eventDateTime"),
        "venue" = COALESCE($3, "venue"),
        "food" = COALESCE($4, "food"),
        "updatedAt" = NOW()
      WHERE "id" = $5
      RETURNING *;
      `,
      [
        eventName ?? null,
        eventDateTime ? new Date(eventDateTime) : null,
        venue ?? null,
        food ?? null,
        id,
      ],
    );

    if (response.length === 0) {
      throw new NotFoundException(`Event not found`);
    }

    return response[0]; // Return updated row
  }

  async deleteEvent(id: string): Promise<{ message: string }> {
    const response: EventInterface[] = await this.eventRepository.query(
      'DELETE FROM "events" WHERE "id" = $1 RETURNING *',
      [id],
    );

    if (response.length === 0) {
      throw new NotFoundException(`Event not found`);
    }

    return { message: `Event with id ${id} has been deleted successfully` };
  }
}
