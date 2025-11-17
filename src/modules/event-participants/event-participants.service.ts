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

  async findAll(eventId?: string): Promise<EventParticipantRow[]> {
    let query: string;
    let parameters: string[] | undefined;

    if (eventId) {
      query = 'SELECT * FROM "event_participants" WHERE "eventId" = $1';
      parameters = [eventId];
    } else {
      query = 'SELECT * FROM "event_participants"';
      parameters = undefined;
    }

    const participant = await this.participantRepository.query<
      EventParticipantRow[]
    >(query, parameters);

    if (!participant || participant.length === 0) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async findOne(id: string): Promise<any> {
    const participant: unknown = await this.participantRepository.query(
      'SELECT * FROM "event_participants" WHERE "id" = $1',
      [id],
    );

    if (!participant) {
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

    // Track success and failure counts
    let successCount = 0;
    let failureCount = 0;
    const successfulParticipants: Array<{
      id: string;
      name: string;
      phoneNumber: string;
      messageId: string | null;
      sentAt: string;
    }> = [];
    const failedParticipants: Array<{
      id: string;
      phoneNumber: string;
      error: string;
    }> = [];

    // Helper function to delay execution
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Helper function to retry with exponential backoff
    const retryWithBackoff = async (
      fn: () => Promise<unknown>,
      maxRetries = 3,
      baseDelay = 1000,
    ): Promise<unknown> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          // Check for rate limit errors
          let isRateLimitError =
            errorMessage.toLowerCase().includes('rate limit') ||
            errorMessage.toLowerCase().includes('too many requests');

          // Check if it's an ExternalServiceException with WhatsApp error code
          if (
            error &&
            typeof error === 'object' &&
            'details' in error &&
            error.details &&
            typeof error.details === 'object' &&
            'whatsappErrorCode' in error.details
          ) {
            const whatsappErrorCode = String(
              (error.details as { whatsappErrorCode?: string })
                .whatsappErrorCode,
            );
            // WhatsApp rate limit error codes: 80007, 80008, 80009
            isRateLimitError =
              isRateLimitError ||
              whatsappErrorCode.includes('80007') ||
              whatsappErrorCode.includes('80008') ||
              whatsappErrorCode.includes('80009');

            // Don't retry for certain permanent errors
            const permanentErrors = [
              '190',
              '132001',
              '131008',
              '132000',
              '100',
            ];
            if (
              permanentErrors.some((code) => whatsappErrorCode.includes(code))
            ) {
              this.logger.error(
                `Permanent error detected (${whatsappErrorCode}). Not retrying.`,
              );
              throw error; // Don't retry permanent errors
            }
          }

          if (attempt === maxRetries) {
            throw error;
          }

          // If rate limited, use longer backoff
          if (isRateLimitError) {
            const backoffDelay = baseDelay * Math.pow(2, attempt) * 5; // 5s, 10s, 20s
            this.logger.warn(
              `Rate limit detected. Retrying in ${backoffDelay}ms (attempt ${attempt}/${maxRetries})`,
            );
            await delay(backoffDelay);
          } else {
            const backoffDelay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
            this.logger.warn(
              `Error sending message. Retrying in ${backoffDelay}ms (attempt ${attempt}/${maxRetries}): ${errorMessage}`,
            );
            await delay(backoffDelay);
          }
        }
      }
    };

    // Process participants with delay between each message
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];

      if (!participant.phoneNumber) {
        this.logger.warn(
          `Skipping participant ${participant.id} - no phone number`,
        );
        failureCount++;
        failedParticipants.push({
          id: participant.id,
          phoneNumber: 'N/A',
          error: 'No phone number',
        });
        continue;
      }

      try {
        // Validate and format phone number
        let phoneNumber = String(participant.phoneNumber)
          .trim()
          .replace(/[^\d+]/g, '');

        // Remove leading zeros (common input error)
        if (phoneNumber.startsWith('0') && !phoneNumber.startsWith('+')) {
          phoneNumber = phoneNumber.substring(1);
        }

        // Ensure phone number starts with + (required by WhatsApp API)
        if (!phoneNumber.startsWith('+')) {
          // Assume India (+91) if no country code provided
          phoneNumber = `+91${phoneNumber}`;
          this.logger.log(
            `Added country code +91 to phone number: ${phoneNumber}`,
          );
        }

        // Validate phone number format (should be +{country_code}{number})
        // Minimum for India: +91 (3) + 10 digits = 13 characters
        if (!phoneNumber || phoneNumber.length < 12) {
          this.logger.warn(
            `Skipping participant ${participant.id} - invalid phone number: ${phoneNumber} (too short)`,
          );
          failureCount++;
          failedParticipants.push({
            id: participant.id,
            phoneNumber,
            error: `Invalid phone number format (length: ${phoneNumber.length})`,
          });
          continue;
        }

        // Check if number contains only valid characters
        if (!/^\+\d{10,15}$/.test(phoneNumber)) {
          this.logger.warn(
            `Skipping participant ${participant.id} - invalid phone number format: ${phoneNumber}`,
          );
          failureCount++;
          failedParticipants.push({
            id: participant.id,
            phoneNumber,
            error:
              'Invalid phone number format (must be +country_code + digits)',
          });
          continue;
        }

        // Validate required participant data
        if (!participant.name || !participant.id) {
          this.logger.warn(
            `Skipping participant ${participant.id} - missing name or ID`,
          );
          failureCount++;
          failedParticipants.push({
            id: participant.id || 'unknown',
            phoneNumber,
            error: 'Missing participant name or ID',
          });
          continue;
        }

        // Validate event data
        if (!event.eventName) {
          this.logger.warn(
            `Skipping participant ${participant.id} - missing event name`,
          );
          failureCount++;
          failedParticipants.push({
            id: participant.id,
            phoneNumber,
            error: 'Missing event name',
          });
          continue;
        }

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
                parameters: [
                  {
                    type: 'text',
                    text: String(participant.name).substring(0, 60), // Limit to 60 chars
                  },
                ],
              },
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: String(event.eventName).substring(0, 100), // Limit to 100 chars
                  },
                ],
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

        // Retry with exponential backoff and capture response
        const response = (await retryWithBackoff(async () => {
          return await this.whatsappService.sendTemplate(payload);
        })) as {
          messages?: Array<{ id?: string }>;
          contacts?: Array<{ input?: string; wa_id?: string }>;
        } | null;

        // Extract message ID and WhatsApp ID from response
        const messageId =
          response &&
          typeof response === 'object' &&
          'messages' in response &&
          Array.isArray(response.messages) &&
          response.messages.length > 0 &&
          response.messages[0]?.id
            ? String(response.messages[0].id)
            : null;

        const waId =
          response &&
          typeof response === 'object' &&
          'contacts' in response &&
          Array.isArray(response.contacts) &&
          response.contacts.length > 0 &&
          response.contacts[0]?.wa_id
            ? String(response.contacts[0].wa_id)
            : null;

        // IMPORTANT: WhatsApp API can return 200 OK with messageId even when message won't deliver
        // This happens when app is not fully verified (24-hour messaging window)
        // The ONLY reliable way to know if message delivered is via webhook status updates

        if (messageId) {
          // API accepted the message - but delivery is NOT guaranteed
          successCount++;
          this.logger.log(
            `✅ [${i + 1}/${participants.length}] API ACCEPTED message - To: ${phoneNumber} (Participant: ${participant.name}, ID: ${participant.id}) | Message ID: ${messageId}${waId ? ` | WhatsApp ID: ${waId}` : ''}`,
          );
          this.logger.warn(
            `⚠️ [${i + 1}/${participants.length}] WARNING: API success does NOT guarantee delivery!`,
          );
          this.logger.warn(
            `⚠️ [${i + 1}/${participants.length}] If app is NOT fully verified, message may NOT deliver if user hasn't messaged you in last 24 hours`,
          );
          this.logger.log(
            `📱 [${i + 1}/${participants.length}] Check webhook logs for actual delivery status ('delivered' or 'failed')`,
          );
        } else {
          // API did not accept the message
          failureCount++;
          const errorMsg =
            'WhatsApp API did not accept the message - check app verification status, template approval, or 24-hour messaging window';
          this.logger.error(
            `❌ [${i + 1}/${participants.length}] ${errorMsg} (Participant: ${participant.name}, ID: ${participant.id})`,
          );
          failedParticipants.push({
            id: participant.id,
            phoneNumber,
            error: errorMsg,
          });
          continue; // Skip storing token for failed messages
        }

        // Store token for tracking delivery status via webhook
        // Even if API accepted, we need webhook to confirm actual delivery
        if (messageId) {
          // Track successful participant
          successfulParticipants.push({
            id: participant.id,
            name: String(participant.name || 'Unknown'),
            phoneNumber,
            messageId,
            sentAt: new Date().toISOString(),
          });

          // Store message token for tracking delivery status
          if (messageId && typeof messageId === 'string') {
            this.whatsappService
              .storeMessageToken(
                messageId,
                participant.id,
                eventId,
                phoneNumber,
                'guest_invite_id_request',
              )
              .catch((error: unknown) => {
                this.logger.error(
                  `Failed to store message token for participant ${participant.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              });
          }
        }

        // Add delay between messages to respect rate limits (1.5 seconds)
        // This helps avoid hitting WhatsApp API rate limits
        if (i < participants.length - 1) {
          await delay(1500);
        }
      } catch (error: unknown) {
        failureCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.logger.error(
          `[${i + 1}/${participants.length}] Failed to send reminder to ${participant.phoneNumber} (participant ${participant.id}): ${errorMessage}`,
          errorStack,
        );

        failedParticipants.push({
          id: participant.id,
          phoneNumber: String(participant.phoneNumber),
          error: errorMessage,
        });
        // Continue with other participants even if one fails
      }
    }

    // Log summary
    this.logger.log(
      `Completed sending reminder messages. Success: ${successCount}, Failed: ${failureCount}, Total: ${participants.length}`,
    );

    // Print JSON summary of participants who received messages
    const summary = {
      totalParticipants: participants.length,
      successCount,
      failureCount,
      successfulParticipants,
      failedParticipants,
      eventId,
      eventName: event.eventName,
      completedAt: new Date().toISOString(),
    };

    this.logger.log('📊 MESSAGE SENDING SUMMARY (JSON):');
    this.logger.log(JSON.stringify(summary, null, 2));

    if (failedParticipants.length > 0) {
      this.logger.warn(
        `Failed to send messages to ${failedParticipants.length} participants:`,
        JSON.stringify(failedParticipants, null, 2),
      );
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

    // Retrieve participant data first to get eventId
    const participantData = await this.participantRepository.query<
      EventParticipantRow[]
    >(`SELECT * FROM "event_participants" WHERE id = $1`, [participantId]);

    if (!participantData || participantData.length === 0) {
      throw new NotFoundException(
        `Participant with id ${participantId} not found`,
      );
    }

    const participant = participantData[0];
    const eventId = participant.eventId;

    // Get event data to calculate autoDeleteDate and for WhatsApp message
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
       WHERE id = $3
       RETURNING *`,
      [frontDocument.cloudinaryUrl, backDocument.cloudinaryUrl, participantId],
    );

    if (!updateResult || updateResult.length === 0) {
      throw new NotFoundException(
        `Participant with id ${participantId} not found`,
      );
    }

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
      // Validate and format phone number
      let phoneNumber = String(participant.phoneNumber)
        .trim()
        .replace(/[^\d+]/g, '');

      // Remove leading zeros (common input error)
      if (phoneNumber.startsWith('0') && !phoneNumber.startsWith('+')) {
        phoneNumber = phoneNumber.substring(1);
      }

      // Ensure phone number starts with + (required by WhatsApp API)
      if (!phoneNumber.startsWith('+')) {
        // Assume India (+91) if no country code provided
        phoneNumber = `+91${phoneNumber}`;
        this.logger.log(
          `Added country code +91 to phone number for booking confirmation: ${phoneNumber}`,
        );
      }

      // Validate phone number format
      if (!/^\+\d{10,15}$/.test(phoneNumber)) {
        this.logger.error(
          `Invalid phone number format for booking confirmation: ${phoneNumber}`,
        );
        return; // Skip sending if invalid
      }

      // Validate required data
      if (!participant.name || !event.eventName || !event.venue) {
        this.logger.error(
          `Missing required data for booking confirmation: participant.name=${participant.name}, event.eventName=${event.eventName}, event.venue=${event.venue}`,
        );
        return; // Skip sending if data missing
      }

      // Format event date and time with error handling
      let eventDateTime: Date | null = null;
      let formattedDateTime: string;
      try {
        eventDateTime = new Date(event.eventDateTime);
        if (isNaN(eventDateTime.getTime())) {
          throw new Error('Invalid date');
        }
        formattedDateTime = eventDateTime.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        this.logger.error(
          `Invalid event date time: ${String(event.eventDateTime)}`,
        );
        formattedDateTime = 'TBD';
        eventDateTime = null;
      }

      // Get check-in/entry time - prefer participant.time, then checkIn, then event time
      let checkInEntry = 'TBD';
      if (participant.time) {
        checkInEntry = String(participant.time).substring(0, 50);
      } else if (participant.checkIn) {
        try {
          const checkInDate = new Date(participant.checkIn);
          if (!isNaN(checkInDate.getTime())) {
            checkInEntry = checkInDate.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }
        } catch {
          // Use default 'TBD' if date parsing fails
        }
      } else if (eventDateTime !== null && !isNaN(eventDateTime.getTime())) {
        // Use event time as fallback
        checkInEntry = eventDateTime.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
      }

      // Prepare template payload with character limits
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
                {
                  type: 'text',
                  text: String(participant.name).substring(0, 60),
                }, // {{1}}
                {
                  type: 'text',
                  text: String(event.eventName).substring(0, 100),
                }, // {{2}}
                {
                  type: 'text',
                  text: formattedDateTime.substring(0, 100),
                }, // {{3}}
                { type: 'text', text: checkInEntry.substring(0, 50) }, // {{4}}
                { type: 'text', text: String(event.venue).substring(0, 100) }, // {{5}}
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
