import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './events.entity';
import { EventParticipant } from '../event-participants/event-participants.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class EventsReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsReminderScheduler.name);
  private intervalId: NodeJS.Timeout | null = null;
  // Check every 1 minute for better accuracy
  // Since we track reminderSentAt, duplicates are prevented
  private readonly CHECK_INTERVAL = 60 * 1000; // 1 minute

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async onModuleInit() {
    // Start checking for events immediately
    await this.handleEventReminders().catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error during initial event reminders check: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    // Set up interval to check every 1 minute
    this.intervalId = setInterval(() => {
      void this.handleEventReminders().catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Error checking for event reminders: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    }, this.CHECK_INTERVAL);

    this.logger.log(
      `Event reminder scheduler started. Will check for events 12 hours away every ${this.CHECK_INTERVAL / 1000} second(s).`,
    );
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Event reminder scheduler stopped.');
    }
  }

  async handleEventReminders() {
    try {
      this.logger.log(
        'Checking for events that need reminders (12 hours before)...',
      );

      // Check for events where the difference between current time and event time is <= 12 hours
      // This means: eventDateTime - NOW() <= 12 hours AND eventDateTime > NOW()
      // Using PostgreSQL interval arithmetic for precise calculation
      const events: Event[] = await this.eventRepository.query(
        `SELECT * FROM "events" 
         WHERE "eventDateTime" > NOW()
         AND "eventDateTime" <= NOW() + INTERVAL '12 hours'
         AND "isActive" = true
         ORDER BY "eventDateTime" ASC`,
      );

      this.logger.log(
        `Found ${events.length} event(s) where (eventDateTime - NOW()) <= 12 hours that need reminders.`,
      );

      if (events.length === 0) {
        return;
      }

      // Process each event
      for (const event of events) {
        await this.sendRemindersForEvent(event);
      }

      this.logger.log('Completed checking for event reminders.');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to handle event reminders: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async sendRemindersForEvent(event: Event): Promise<void> {
    try {
      this.logger.log(
        `Processing reminders for event: ${event.eventName} (ID: ${event.id})`,
      );

      // Get all participants for this event who haven't received a reminder yet
      // Only send reminder once per participant per event
      const participants: EventParticipant[] =
        await this.participantRepository.query(
          `SELECT id, name, "phoneNumber" 
           FROM "event_participants" 
           WHERE "eventId" = $1 
           AND "phoneNumber" IS NOT NULL 
           AND "phoneNumber" != ''
           AND "reminderSentAt" IS NULL`,
          [event.id],
        );

      this.logger.log(
        `Found ${participants.length} participant(s) for event ${event.eventName} who haven't received reminders yet`,
      );

      if (participants.length === 0) {
        this.logger.log(
          `No participants need reminders for event ${event.eventName} (all reminders already sent or no phone numbers)`,
        );
        return;
      }

      // Format event date in IST (UTC+5:30) for display
      const eventDate = new Date(event.eventDateTime);
      const formattedDate = this.formatDateForIST(eventDate);

      // Send reminder to each participant
      for (const participant of participants) {
        await this.sendReminderToParticipant(participant, event, formattedDate);
      }

      this.logger.log(
        `Completed sending reminders for event: ${event.eventName}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send reminders for event ${event.id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - continue with other events
    }
  }

  private async sendReminderToParticipant(
    participant: EventParticipant,
    event: Event,
    formattedDate: string,
  ): Promise<void> {
    if (!participant.phoneNumber) {
      this.logger.warn(
        `Skipping reminder for participant ${participant.id} - no phone number`,
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
      }

      // Validate phone number format
      if (!/^\+\d{10,15}$/.test(phoneNumber)) {
        this.logger.error(
          `Invalid phone number format for reminder: ${phoneNumber} (Participant: ${participant.name})`,
        );
        return;
      }

      // Validate required data
      if (!participant.name || !event.eventName) {
        this.logger.error(
          `Missing required data for reminder: participant.name=${participant.name}, event.eventName=${event.eventName}`,
        );
        return;
      }

      // Prepare template payload
      // Template: your_event_schedule
      // Variables: {{1}} = name, {{2}} = event name, {{3}} = schedule date
      const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'your_event_schedule',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: String(participant.name).substring(0, 60),
                }, // {{1}} - Participant name
                {
                  type: 'text',
                  text: String(event.eventName).substring(0, 100),
                }, // {{2}} - Event name
                {
                  type: 'text',
                  text: formattedDate.substring(0, 100),
                }, // {{3}} - Schedule date
              ],
            },
          ],
        },
      };

      this.logger.log(
        `📤 Sending reminder to ${participant.name} (${phoneNumber}) for event: ${event.eventName}`,
      );

      const response = await this.whatsappService.sendTemplate(payload);

      if (response.messages?.[0]?.id) {
        this.logger.log(
          `✅ Reminder sent successfully to ${participant.name} - Message ID: ${response.messages[0].id}`,
        );

        // Mark reminder as sent to prevent duplicate sends
        await this.participantRepository.query(
          `UPDATE "event_participants" 
           SET "reminderSentAt" = NOW() 
           WHERE "id" = $1`,
          [participant.id],
        );

        this.logger.log(
          `✅ Marked reminder as sent for participant ${participant.name} (ID: ${participant.id})`,
        );
      } else {
        this.logger.warn(
          `⚠️ Reminder may not have been sent to ${participant.name} - No message ID in response. Not marking as sent.`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send reminder to participant ${participant.id} (${participant.name}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - continue with other participants
    }
  }

  /**
   * Format date in IST (UTC+5:30) for display
   * Format: "30 Oct 2025"
   * Note: Since eventDateTime is stored as timestamptz in UTC, we format it for IST display
   */
  private formatDateForIST(date: Date): string {
    try {
      // Use Intl.DateTimeFormat with Asia/Kolkata timezone for reliable IST formatting
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      const parts = formatter.formatToParts(date);
      const day = parts.find((p) => p.type === 'day')?.value || '';
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const year = parts.find((p) => p.type === 'year')?.value || '';

      return `${day} ${month} ${year}`;
    } catch (error) {
      this.logger.error(
        `Error formatting date: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Fallback: format using UTC (better than nothing)
      const day = date.getUTCDate();
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const month = monthNames[date.getUTCMonth()];
      const year = date.getUTCFullYear();
      return `${day} ${month} ${year}`;
    }
  }
}
