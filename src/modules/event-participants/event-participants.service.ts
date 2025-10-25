import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventParticipant } from './event-participants.entity';
import { UpdateEventParticipantDto } from './dto/event-participants.dto';
import { mapExcelRow } from './utils/mapExcelRow';

@Injectable()
export class EventParticipantsService {
  constructor(
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
  ) {}

  async findAll(): Promise<any> {
    const participant: any[] = await this.participantRepository.query(
      'SELECT * FROM "event_participants"',
    );

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async findOne(id: string): Promise<any> {
    const participant: any[] = await this.participantRepository.query(
      'SELECT * FROM "event_participants" WHERE "eventId" = $1',
      [id],
    );

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async create(data: any[], eventId: string): Promise<any> {
    if (!Array.isArray(data)) {
      data = [data];
    }

    const participants = data.map((row) => mapExcelRow(row, eventId));

    // Prepare query placeholders
    const values = participants
      .map(
        (_, i) => `
      ($${i * 18 + 1}, $${i * 18 + 2}, $${i * 18 + 3}, $${i * 18 + 4},
       $${i * 18 + 5}, $${i * 18 + 6}, $${i * 18 + 7}, $${i * 18 + 8},
       $${i * 18 + 9}, $${i * 18 + 10}, $${i * 18 + 11}, $${i * 18 + 12},
       $${i * 18 + 13}, $${i * 18 + 14}, $${i * 18 + 15}, $${i * 18 + 16},
       $${i * 18 + 17}, $${i * 18 + 18})
    `,
      )
      .join(', ');

    const query = `
    INSERT INTO "event_participants"
    ("eventId", "name", "category", "phoneNumber", "city", "dateOfArrival",
     "modeOfArrival", "trainFlightNumber", "time", "hotelName", "roomType",
     "checkIn", "checkOut", "departureDetails", "departureTime",
     attending, remarks, "remarksRound2")
    VALUES ${values} RETURNING *
  `;

    // Flatten parameters
    const parameters: any[] = participants.flatMap((p) => [
      p.eventId,
      p.name,
      p.category,
      p.phoneNumber,
      p.city,
      p.dateOfArrival,
      p.modeOfArrival,
      p.trainFlightNumber,
      p.time,
      p.hotelName,
      p.roomType,
      p.checkIn,
      p.checkOut,
      p.departureDetails,
      p.departureTime,
      p.attending,
      p.remarks,
      p.remarksRound2,
    ]);

    const response: unknown = await this.participantRepository.query(
      query,
      parameters,
    );
    return response;
  }

  async update(
    id: string,
    eventId: string,
    data: Partial<UpdateEventParticipantDto>,
  ): Promise<any> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let index = 1;

    // Dynamically add only fields that are not undefined or null
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        setClauses.push(`"${key}" = $${index}`);
        values.push(value);
        index++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    // Add id and eventId as parameters
    values.push(id); // $index
    index++;
    values.push(eventId); // $index

    const query = `
    UPDATE "event_participants"
    SET ${setClauses.join(', ')}
    WHERE id = $${index - 1} AND "eventId" = $${index}
    RETURNING *;
  `;

    return await this.participantRepository.query(query, values);
  }
}
