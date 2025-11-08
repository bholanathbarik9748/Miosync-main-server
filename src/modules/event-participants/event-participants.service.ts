import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventParticipant } from './event-participants.entity';
import { UpdateEventParticipantDto } from './dto/event-participants.dto';
import { mapExcelRow } from './utils/mapExcelRow';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Event } from '../events/events.entity';
import { EventsService } from '../events/events.service';
import { UploadDocumentService } from '../upload-document/upload-document.service';

export interface EventParticipantRow extends EventParticipant {
  id: string;
}

interface EventRow extends Event {
  id: string;
}

@Injectable()
export class EventParticipantsService {
  private readonly logger = new Logger(EventParticipantsService.name);

  constructor(
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly whatsappService: WhatsAppService,
    private readonly eventsService: EventsService,
    private readonly uploadDocumentService: UploadDocumentService,
  ) {}

  async findAll(): Promise<EventParticipantRow[]> {
    const participant = await this.participantRepository.query<
      EventParticipantRow[]
    >('SELECT * FROM "event_participants"');

    if (!participant || participant.length === 0) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async findOne(id: string): Promise<EventParticipantRow[]> {
    const participant = await this.participantRepository.query<
      EventParticipantRow[]
    >('SELECT * FROM "event_participants" WHERE "eventId" = $1', [id]);

    if (!participant || participant.length === 0) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async create(
    data: unknown[],
    eventId: string,
  ): Promise<EventParticipantRow[]> {
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
    const parameters: (string | Date | null)[] = participants.flatMap((p) => {
      return [
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
      ] as (string | Date | null)[];
    });

    // First, insert into DB (ensuring consistency)
    const insertedParticipants = await this.participantRepository.query<
      EventParticipantRow[]
    >(query, parameters);

    // Then, send WhatsApp reminders for each participant
    // Process in background to not block the response
    this.sendReminderMessages(insertedParticipants, eventId).catch(
      (error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to send reminder messages: ${errorMessage}`,
          errorStack,
        );
      },
    );

    return insertedParticipants;
  }

  private async sendReminderMessages(
    participants: EventParticipantRow[],
    eventId: string,
  ): Promise<void> {
    this.logger.log(
      `Sending reminder_event WhatsApp messages to ${participants.length} participants`,
    );

    const eventDetails = await this.eventRepository.query<EventRow[]>(
      'SELECT * FROM "events" WHERE id = $1',
      [eventId],
    );

    if (!eventDetails || eventDetails.length === 0) {
      this.logger.warn(`Event not found for eventId: ${eventId}`);
      return;
    }

    const event = eventDetails[0];

    for (const participant of participants) {
      if (!participant.phoneNumber) {
        this.logger.warn(
          `Skipping participant ${participant.id} - no phone number`,
        );
        continue;
      }

      try {
        // Format phone number (remove any non-digit characters except +)
        const phoneNumber = String(participant.phoneNumber).replace(
          /[^\d+]/g,
          '',
        );

        // Send reminder_event template
        // Note: Buttons should be pre-configured in the WhatsApp Business template
        // The template should have interactive buttons (Yes/No) that will be handled via webhook
        const payload = {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'template',
          template: {
            name: 'guest_invite_id_request',
            language: { code: 'en' },
            components: [
              {
                type: 'header',
                parameters: [{ type: 'text', text: String(participant.name) }],
              },
              {
                type: 'body',
                parameters: [{ type: 'text', text: String(event.eventName) }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  {
                    type: 'text',
                    text: String(participant.id),
                  },
                ],
              },
            ],
          },
        };

        await this.whatsappService.sendTemplate(payload);
        this.logger.log(
          `Sent reminder_event to ${phoneNumber} for participant ${participant.id}`,
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to send reminder to ${participant.phoneNumber}: ${errorMessage}`,
        );
        // Continue with other participants even if one fails
      }
    }
  }

  async update(
    id: string,
    eventId: string,
    data: Partial<UpdateEventParticipantDto>,
  ): Promise<EventParticipantRow[]> {
    const setClauses: string[] = [];
    const values: (string | Date | null)[] = [];
    let index = 1;

    // Dynamically add only fields that are not undefined or null
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        setClauses.push(`"${key}" = $${index}`);
        values.push(value as string | Date | null);
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

    return await this.participantRepository.query<EventParticipantRow[]>(
      query,
      values,
    );
  }

  async uploadDocument(
    participantId: string,
    eventId: string,
    frontFile: Express.Multer.File,
    backFile: Express.Multer.File,
  ): Promise<any> {
    // Validate files
    if (!frontFile) {
      throw new BadRequestException('Front image is required');
    }

    if (!backFile) {
      throw new BadRequestException('Back image is required');
    }

    // Validate file types (images only)
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];
    if (!allowedMimeTypes.includes(frontFile.mimetype)) {
      throw new BadRequestException(
        'Front image must be a valid image file (JPEG, PNG, or WebP)',
      );
    }

    if (!allowedMimeTypes.includes(backFile.mimetype)) {
      throw new BadRequestException(
        'Back image must be a valid image file (JPEG, PNG, or WebP)',
      );
    }

    // Get event data to calculate autoDeleteDate
    const eventData = (await this.eventsService.getEventData(
      eventId,
    )) as EventRow[];
    if (!eventData || eventData.length === 0) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    const event = eventData[0];

    // Calculate autoDeleteDate: 1 year from now, or event delete date if it exists
    // Since there's no event delete date field, we'll use 1 year from now
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    // Format as DD-MM-YY for the upload service
    const day = String(oneYearFromNow.getDate()).padStart(2, '0');
    const month = String(oneYearFromNow.getMonth() + 1).padStart(2, '0');
    const year = String(oneYearFromNow.getFullYear() % 100).padStart(2, '0');
    const autoDeleteDateStr = `${day}-${month}-${year}`;

    // Upload both documents
    const frontDocument = await this.uploadDocumentService.uploadFile(
      frontFile,
      autoDeleteDateStr,
    );

    const backDocument = await this.uploadDocumentService.uploadFile(
      backFile,
      autoDeleteDateStr,
    );

    // Update participant record with document URLs
    const updateResult = await this.participantRepository.query<
      EventParticipantRow[]
    >(
      `UPDATE "event_participants"
       SET "frontDocumentUrl" = $1, "backDocumentUrl" = $2
       WHERE id = $3 AND "eventId" = $4
       RETURNING *`,
      [
        frontDocument.cloudinaryUrl,
        backDocument.cloudinaryUrl,
        participantId,
        eventId,
      ],
    );

    if (!updateResult || updateResult.length === 0) {
      throw new NotFoundException(
        `Participant with id ${participantId} not found for event ${eventId}`,
      );
    }

    // Retrieve full participant data to ensure we have phoneNumber
    const participantData = await this.participantRepository.query<
      EventParticipantRow[]
    >(`SELECT * FROM "event_participants" WHERE id = $1 AND "eventId" = $2`, [
      participantId,
      eventId,
    ]);

    if (!participantData || participantData.length === 0) {
      throw new NotFoundException(
        `Participant with id ${participantId} not found for event ${eventId}`,
      );
    }

    const participant = participantData[0];

    // Send WhatsApp booking confirmation message if participant has phone number
    if (participant.phoneNumber) {
      this.sendBookingConfirmationMessage(participant, event).catch(
        (error: unknown) => {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `Failed to send booking confirmation message: ${errorMessage}`,
            errorStack,
          );
          // Don't throw - we don't want to fail the upload if WhatsApp fails
        },
      );
    } else {
      this.logger.warn(
        `Participant ${participantId} does not have a phone number. Skipping WhatsApp message.`,
      );
    }

    return;
  }

  private async sendBookingConfirmationMessage(
    participant: EventParticipantRow,
    event: EventRow,
  ): Promise<void> {
    if (!participant.phoneNumber) {
      this.logger.warn(
        `Skipping booking confirmation for participant ${participant.id} - no phone number`,
      );
      return;
    }

    try {
      // Format phone number (remove any non-digit characters except +)
      const phoneNumber = String(participant.phoneNumber).replace(
        /[^\d+]/g,
        '',
      );

      // Format event date and time
      const eventDateTime = new Date(event.eventDateTime);
      const formattedDateTime = eventDateTime.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      // Get check-in/entry time - prefer participant.time, then checkIn, then event time
      let checkInEntry = '';
      if (participant.time) {
        checkInEntry = String(participant.time);
      } else if (participant.checkIn) {
        const checkInDate = new Date(participant.checkIn);
        checkInEntry = checkInDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      } else {
        // Use event time as fallback
        checkInEntry = eventDateTime.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      }

      // Prepare template payload
      const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'booking_confirmation',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: String(participant.name) }, // {{1}}
                { type: 'text', text: String(event.eventName) }, // {{2}}
                { type: 'text', text: formattedDateTime }, // {{3}}
                { type: 'text', text: checkInEntry }, // {{4}}
                { type: 'text', text: String(event.venue) }, // {{5}}
              ],
            },
          ],
        },
      };

      const response = await this.whatsappService.sendTemplate(payload);

      // Store the message token (message ID) for tracking participant responses
      if (
        response.messages &&
        response.messages.length > 0 &&
        response.messages[0]?.id
      ) {
        const messageId = response.messages[0].id;
        if (typeof messageId === 'string') {
          this.whatsappService
            .storeMessageToken(
              messageId,
              participant.id,
              event.id,
              phoneNumber,
              'booking_confirmation',
            )
            .catch((error: unknown) => {
              this.logger.error(
                `Failed to store message token: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            });
          this.logger.log(
            `Storing message token ${messageId} for participant ${participant.id}`,
          );
        }
      } else {
        this.logger.warn(
          `No message ID returned from WhatsApp API for participant ${participant.id}`,
        );
      }

      this.logger.log(
        `Sent booking confirmation to ${phoneNumber} for participant ${participant.id}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send booking confirmation to ${participant.phoneNumber}: ${errorMessage}`,
      );
      // Don't throw - we don't want to fail the upload if WhatsApp fails
    }
  }
}
