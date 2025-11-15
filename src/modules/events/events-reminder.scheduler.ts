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
import { ExternalServiceException } from '../../common/exceptions/custom.exception';

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
      // Check for 12-hour reminders
      await this.handle12HourReminders();

      // Check for 3-hour reminders
      await this.handle3HourReminders();

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

  private async handle12HourReminders() {
    try {
      this.logger.log(
        'Checking for events that need reminders (12 hours before)...',
      );

      // Check for events where the difference between current time and event time is <= 12 hours
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
        await this.sendRemindersForEvent(event, '12hours');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to handle 12-hour reminders: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - continue with 3-hour reminders
    }
  }

  private async handle3HourReminders() {
    try {
      this.logger.log(
        'Checking for events that need reminders (3 hours before)...',
      );

      // Check for events where the difference between current time and event time is <= 3 hours
      const events: Event[] = await this.eventRepository.query(
        `SELECT * FROM "events" 
         WHERE "eventDateTime" > NOW()
         AND "eventDateTime" <= NOW() + INTERVAL '3 hours'
         AND "isActive" = true
         ORDER BY "eventDateTime" ASC`,
      );

      this.logger.log(
        `Found ${events.length} event(s) where (eventDateTime - NOW()) <= 3 hours that need reminders.`,
      );

      if (events.length === 0) {
        return;
      }

      // Process each event
      for (const event of events) {
        await this.sendRemindersForEvent(event, '3hours');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to handle 3-hour reminders: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - already logged
    }
  }

  private async sendRemindersForEvent(
    event: Event,
    reminderType: '12hours' | '3hours',
  ): Promise<void> {
    try {
      this.logger.log(
        `Processing reminders for event: ${event.eventName} (ID: ${event.id})`,
      );

      // Get all participants for this event who haven't received this type of reminder yet
      const reminderField =
        reminderType === '12hours' ? 'reminderSentAt' : 'reminder3HoursSentAt';
      const participants: EventParticipant[] =
        await this.participantRepository.query(
          `SELECT id, name, "phoneNumber" 
           FROM "event_participants" 
           WHERE "eventId" = $1 
           AND "phoneNumber" IS NOT NULL 
           AND "phoneNumber" != ''
           AND "${reminderField}" IS NULL`,
          [event.id],
        );

      this.logger.log(
        `Found ${participants.length} participant(s) for event ${event.eventName} who haven't received ${reminderType} reminders yet`,
      );

      if (participants.length === 0) {
        this.logger.log(
          `No participants need ${reminderType} reminders for event ${event.eventName} (all reminders already sent or no phone numbers)`,
        );
        return;
      }

      // Send reminder to each participant based on type
      for (const participant of participants) {
        if (reminderType === '12hours') {
          await this.send12HourReminderToParticipant(participant, event);
        } else {
          await this.send3HourReminderToParticipant(participant, event);
        }
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

  private async send12HourReminderToParticipant(
    participant: EventParticipant,
    event: Event,
  ): Promise<void> {
    if (!participant.phoneNumber) {
      this.logger.warn(
        `Skipping 12-hour reminder for participant ${participant.id} - no phone number`,
      );
      return;
    }

    try {
      // Format event date in IST (UTC+5:30) for display
      const eventDate = new Date(event.eventDateTime);
      const formattedDate = this.formatDateForIST(eventDate);

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
          `Invalid phone number format for 12-hour reminder: ${phoneNumber} (Participant: ${participant.name})`,
        );
        return;
      }

      // Validate required data
      if (!participant.name || !event.eventName) {
        this.logger.error(
          `Missing required data for 12-hour reminder: participant.name=${participant.name}, event.eventName=${event.eventName}`,
        );
        return;
      }

      // Prepare template payload for 12-hour reminder
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
        `📤 Sending 12-hour reminder to ${participant.name} (${phoneNumber}) for event: ${event.eventName}`,
      );

      const response = await this.whatsappService.sendTemplate(payload);

      if (response.messages?.[0]?.id) {
        this.logger.log(
          `✅ 12-hour reminder sent successfully to ${participant.name} - Message ID: ${response.messages[0].id}`,
        );

        // Mark reminder as sent to prevent duplicate sends
        await this.participantRepository.query(
          `UPDATE "event_participants" 
           SET "reminderSentAt" = NOW() 
           WHERE "id" = $1`,
          [participant.id],
        );

        this.logger.log(
          `✅ Marked 12-hour reminder as sent for participant ${participant.name} (ID: ${participant.id})`,
        );
      } else {
        this.logger.warn(
          `⚠️ 12-hour reminder may not have been sent to ${participant.name} - No message ID in response. Not marking as sent.`,
        );
      }
    } catch (error) {
      this.handleReminderError(error, participant, event, '12hours');
    }
  }

  private async send3HourReminderToParticipant(
    participant: EventParticipant,
    event: Event,
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
      if (!participant.name || !event.eventName || !event.venue) {
        this.logger.error(
          `Missing required data for 3-hour reminder: participant.name=${participant.name}, event.eventName=${event.eventName}, event.venue=${event.venue}`,
        );
        return;
      }

      // Format event date and time in IST (UTC+5:30) for display
      // Format: "28 Oct 2025, 10:00 AM"
      const eventDate = new Date(event.eventDateTime);
      const formattedDateTime = this.formatDateTimeForIST(eventDate);

      // Prepare template payload for 3-hour reminder
      // Template: reminder_event
      // Variables: {{1}} = name, {{2}} = event name, {{3}} = date and time, {{4}} = venue
      const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'reminder_event',
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
                  text: formattedDateTime.substring(0, 100),
                }, // {{3}} - Date and time
                {
                  type: 'text',
                  text: String(event.venue).substring(0, 100),
                }, // {{4}} - Venue
              ],
            },
          ],
        },
      };

      this.logger.log(
        `📤 Sending 3-hour reminder to ${participant.name} (${phoneNumber}) for event: ${event.eventName}`,
      );

      const response = await this.whatsappService.sendTemplate(payload);

      if (response.messages?.[0]?.id) {
        this.logger.log(
          `✅ 3-hour reminder sent successfully to ${participant.name} - Message ID: ${response.messages[0].id}`,
        );

        // Mark reminder as sent to prevent duplicate sends
        await this.participantRepository.query(
          `UPDATE "event_participants" 
           SET "reminder3HoursSentAt" = NOW() 
           WHERE "id" = $1`,
          [participant.id],
        );

        this.logger.log(
          `✅ Marked 3-hour reminder as sent for participant ${participant.name} (ID: ${participant.id})`,
        );
      } else {
        this.logger.warn(
          `⚠️ 3-hour reminder may not have been sent to ${participant.name} - No message ID in response. Not marking as sent.`,
        );
      }
    } catch (error) {
      this.handleReminderError(error, participant, event, '3hours');
    }
  }

  private handleReminderError(
    error: unknown,
    participant: EventParticipant,
    event: Event,
    reminderType: '12hours' | '3hours',
  ): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Check if it's an API access blocked error
    const isApiBlocked =
      error instanceof ExternalServiceException &&
      (errorMessage.toLowerCase().includes('api access blocked') ||
        errorMessage.toLowerCase().includes('access blocked'));

    if (isApiBlocked) {
      // Get WhatsApp error details if available
      const whatsappErrorCode =
        error instanceof ExternalServiceException &&
        error.details &&
        typeof error.details === 'object' &&
        'whatsappErrorCode' in error.details
          ? (error.details as { whatsappErrorCode?: string }).whatsappErrorCode
          : 'UNKNOWN';

      this.logger.error(
        `🚨 API ACCESS BLOCKED for ${reminderType} reminder - participant ${participant.name} (${participant.id})`,
      );
      this.logger.error(`   WhatsApp Error Code: ${whatsappErrorCode}`);
      this.logger.error(`   Event: ${event.eventName} (${event.id})`);
      this.logger.error(
        `   ⚠️ Reminder NOT marked as sent - will retry on next check`,
      );
      this.logger.error(`   Possible causes:`);
      this.logger.error(`   - WhatsApp Business API access restricted/blocked`);
      this.logger.error(`   - Rate limiting or account issues`);
      this.logger.error(`   - Template not approved or app not verified`);
      this.logger.error(
        `   - Check WhatsApp Business Manager: https://business.facebook.com/wa/manage/message-templates/`,
      );
    } else {
      // Other errors - log but don't mark as sent
      this.logger.error(
        `Failed to send ${reminderType} reminder to participant ${participant.id} (${participant.name}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // If it's an ExternalServiceException, log additional details
      if (error instanceof ExternalServiceException && error.details) {
        this.logger.error(
          `   Error details: ${JSON.stringify(error.details, null, 2)}`,
        );
      }
    }

    // Don't mark reminder as sent for any error - allows retry on next check
    // Don't throw - continue with other participants
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

  /**
   * Format date and time in IST (UTC+5:30) for display
   * Format: "28 Oct 2025, 10:00 AM"
   * Note: Since eventDateTime is stored as timestamptz in UTC, we format it for IST display
   */
  private formatDateTimeForIST(date: Date): string {
    try {
      // Use Intl.DateTimeFormat with Asia/Kolkata timezone for reliable IST formatting
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const parts = formatter.formatToParts(date);
      const day = parts.find((p) => p.type === 'day')?.value || '';
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const year = parts.find((p) => p.type === 'year')?.value || '';
      const hour = parts.find((p) => p.type === 'hour')?.value || '';
      const minute = parts.find((p) => p.type === 'minute')?.value || '';
      const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value || '';

      return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
    } catch (error) {
      this.logger.error(
        `Error formatting date/time: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
      return `${day} ${month} ${year}, ${hours}:${minutesStr} ${ampm}`;
    }
  }
}
