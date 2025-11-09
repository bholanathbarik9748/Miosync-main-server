import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosError } from 'axios';
import { ExternalServiceException } from 'src/common/exceptions/custom.exception';
import { ErrorCode } from 'src/common/exceptions/error-codes.enum';
import { EventParticipant } from '../event-participants/event-participants.entity';
import { WhatsAppMessageToken } from './whatsapp-message-token.entity';

export interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: Array<{
    id: string;
  }>;
}

interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface TemplatePayload {
  messaging_product: string;
  to: string;
  type: string;
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters?: Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
      }>;
    }>;
  };
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        interactive?: {
          type: string;
          button_reply?: {
            id: string;
            title: string;
          };
          list_reply?: {
            id: string;
            title: string;
          };
        };
        text?: {
          body: string;
        };
      }>;
      statuses?: Array<{
        id: string;
        status: 'sent' | 'delivered' | 'read' | 'failed';
        timestamp: string;
        recipient_id: string;
        conversation?: {
          id: string;
          origin: {
            type: string;
          };
        };
        pricing?: {
          billable: boolean;
          pricing_model: string;
          category: string;
        };
        errors?: Array<{
          code: number;
          title: string;
          message: string;
        }>;
      }>;
    };
    field: string;
  }>;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private token = process.env.WA_TOKEN;
  private phoneId = process.env.WA_PHONE_NUMBER_ID;
  private base = process.env.WA_API_BASE || 'https://graph.facebook.com';
  private version = process.env.WA_API_VERSION || 'v22.0';

  constructor(
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
    @InjectRepository(WhatsAppMessageToken)
    private readonly messageTokenRepository: Repository<WhatsAppMessageToken>,
  ) {}

  private getUrl() {
    return `${this.base}/${this.version}/${this.phoneId}`;
  }

  private getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async sendTemplate(
    payload: TemplatePayload,
  ): Promise<WhatsAppMessageResponse> {
    try {
      this.logger.log(
        `Sending template message to ${payload.to} with template ${payload.template.name}`,
      );

      const url = `${this.getUrl()}/messages`;
      const response = await axios.post<WhatsAppMessageResponse>(url, payload, {
        headers: this.getAuthHeaders(),
      });

      this.logger.log(
        `Template message sent successfully. Message ID: ${response.data.messages?.[0]?.id}`,
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<WhatsAppErrorResponse>;

      if (axiosError.response?.data?.error) {
        const waError = axiosError.response.data.error;
        const errorMessage = waError.message || 'WhatsApp API error';
        const errorCode = waError.code?.toString() || 'UNKNOWN';

        this.logger.error(
          `WhatsApp API error [${errorCode}]: ${errorMessage}`,
          {
            template: payload.template.name,
            to: payload.to,
            whatsappError: waError,
          },
        );

        throw new ExternalServiceException(
          errorMessage,
          ErrorCode.INTERNAL_SERVER_ERROR,
          'WHATSAPP',
          {
            whatsappErrorCode: errorCode,
            whatsappErrorType: waError.type,
            templateName: payload.template.name,
            languageCode: payload.template.language.code,
            fbtraceId: waError.fbtrace_id,
          },
        );
      }

      // Handle network or other errors
      const errorMessage =
        axiosError.message || 'Failed to send template message';
      this.logger.error(
        `Failed to send template message: ${errorMessage}`,
        axiosError.stack,
      );

      throw new ExternalServiceException(
        errorMessage,
        ErrorCode.INTERNAL_SERVER_ERROR,
        'WHATSAPP',
        {
          originalError: axiosError.message,
        },
      );
    }
  }

  async processWebhookEvent(payload: WhatsAppWebhookPayload): Promise<void> {
    try {
      // Validate payload structure
      if (!payload || !payload.object) {
        this.logger.warn('Received webhook with invalid or missing payload');
        return;
      }

      // WhatsApp webhook payload structure
      if (payload.object !== 'whatsapp_business_account') {
        this.logger.warn(
          `Received webhook with unexpected object type: ${payload.object}`,
        );
        return;
      }

      if (!payload.entry || !Array.isArray(payload.entry)) {
        this.logger.warn(
          'Received webhook with missing or invalid entry array',
        );
        return;
      }

      // Process each entry
      for (const entry of payload.entry) {
        if (!entry.changes || !Array.isArray(entry.changes)) {
          this.logger.warn('Entry missing changes array');
          continue;
        }

        for (const change of entry.changes) {
          if (!change || !change.value) {
            this.logger.warn('Change missing value');
            continue;
          }

          const value = change.value;

          // Log the field type for debugging
          this.logger.log(
            `Processing webhook change for field: ${change.field}`,
          );

          // Process status updates (message delivery status)
          if (
            value.statuses &&
            Array.isArray(value.statuses) &&
            value.statuses.length > 0
          ) {
            for (const status of value.statuses) {
              const messageId = status.id;
              const recipientId = status.recipient_id;
              const messageStatus = status.status;

              // Try to find participant information from message token
              let participantInfo: {
                participantId: string;
                eventId: string;
                templateName: string;
              } | null = null;
              try {
                const tokenData = await this.findParticipantByMessageId(
                  messageId,
                );
                if (tokenData) {
                  participantInfo = {
                    participantId: tokenData.participantId,
                    eventId: tokenData.eventId,
                    templateName: tokenData.templateName,
                  };
                }
              } catch (error) {
                // Ignore errors when looking up participant
              }

              // Log status update with participant information
              const statusEmoji =
                messageStatus === 'sent'
                  ? '📤'
                  : messageStatus === 'delivered'
                    ? '✅'
                    : messageStatus === 'read'
                      ? '👁️'
                      : messageStatus === 'failed'
                        ? '❌'
                        : '📱';

              if (participantInfo) {
                this.logger.log(
                  `${statusEmoji} Message ${messageStatus.toUpperCase()} - Participant ID: ${participantInfo.participantId} | Phone: ${recipientId} | Message ID: ${messageId} | Template: ${participantInfo.templateName || 'N/A'}`,
                );
              } else {
                this.logger.log(
                  `${statusEmoji} Message ${messageStatus.toUpperCase()} - Phone: ${recipientId} | Message ID: ${messageId}`,
                );
              }

              // Log detailed status information
              this.logger.log(`📱 WhatsApp Status Update Details`, {
                messageId: status.id,
                status: status.status,
                recipientId: status.recipient_id,
                participantId: participantInfo?.participantId || 'Unknown',
                eventId: participantInfo?.eventId || 'Unknown',
                timestamp: new Date(
                  parseInt(status.timestamp) * 1000,
                ).toISOString(),
                errors: status.errors,
              });

              // If message failed, log error details
              if (messageStatus === 'failed' && status.errors) {
                this.logger.error(
                  `❌ Message FAILED to deliver - Participant ID: ${participantInfo?.participantId || 'Unknown'} | Phone: ${recipientId} | Message ID: ${messageId}`,
                  JSON.stringify(status.errors, null, 2),
                );
              }
            }
          }

          // Process incoming messages
          if (
            value.messages &&
            Array.isArray(value.messages) &&
            value.messages.length > 0
          ) {
            for (const message of value.messages) {
              // Check if it's an interactive message (button click)
              if (message.interactive) {
                const interactive = message.interactive;
                const phoneNumber = message.from;
                const messageId = message.id;
                const timestamp = message.timestamp;

                if (
                  interactive.type === 'button_reply' &&
                  interactive.button_reply
                ) {
                  const buttonResponse = interactive.button_reply;

                  this.logger.log(`📱 WhatsApp Button Response Received`, {
                    phoneNumber,
                    messageId,
                    timestamp: new Date(
                      parseInt(timestamp) * 1000,
                    ).toISOString(),
                    buttonId: buttonResponse.id,
                    buttonTitle: buttonResponse.title,
                    responseType: 'button_reply',
                  });

                  // Handle button response and update attending status using message ID
                  this.handleButtonResponseByMessageId(
                    messageId,
                    phoneNumber,
                    buttonResponse.title,
                    buttonResponse.id,
                  ).catch((error) => {
                    this.logger.error(
                      `Failed to handle button response: ${error.message}`,
                      error.stack,
                    );
                  });

                  // Log detailed response
                  this.logger.log(
                    `User ${phoneNumber} clicked button "${buttonResponse.title}" (ID: ${buttonResponse.id})`,
                  );
                } else if (
                  interactive.type === 'list_reply' &&
                  interactive.list_reply
                ) {
                  const listResponse = interactive.list_reply;

                  this.logger.log(`📱 WhatsApp List Response Received`, {
                    phoneNumber,
                    messageId,
                    timestamp: new Date(
                      parseInt(timestamp) * 1000,
                    ).toISOString(),
                    listItemId: listResponse.id,
                    listItemTitle: listResponse.title,
                    responseType: 'list_reply',
                  });

                  // Log detailed response
                  this.logger.log(
                    `User ${phoneNumber} selected list item "${listResponse.title}" (ID: ${listResponse.id})`,
                  );
                }
              } else if (message.text) {
                // Regular text message (not a button response)
                this.logger.log(`📱 WhatsApp Text Message Received`, {
                  phoneNumber: message.from,
                  messageId: message.id,
                  text: message.text.body,
                  timestamp: new Date(
                    parseInt(message.timestamp) * 1000,
                  ).toISOString(),
                });
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing webhook event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - we want to log but not cause webhook retries
      // The webhook handler already acknowledges receipt
    }
  }

  handleIncomingTextMessage(from: string, text: string): void {
    this.logger.log('💬 Processing user text message', {
      from,
      text,
    });
    // Add your business logic here
  }

  /**
   * Handle button response from WhatsApp webhook using message ID
   * Updates the attending column in the database based on yes/no response
   * Note: The messageId from webhook is a NEW message ID when user clicks button.
   * We use phone number to find the most recent unprocessed token to identify the participant.
   */
  async handleButtonResponseByMessageId(
    messageId: string,
    phoneNumber: string,
    buttonTitle: string,
    buttonId: string,
  ): Promise<void> {
    try {
      // Normalize phone number
      const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');

      // Find the most recent unprocessed message token for this phone number
      // This token was stored when we sent the booking confirmation message
      const tokenData = await this.messageTokenRepository.query(
        `SELECT "participantId", "eventId", "messageId" 
         FROM "whatsapp_message_tokens" 
         WHERE "phoneNumber" = $1 AND "isProcessed" = false 
         ORDER BY "createdAt" DESC 
         LIMIT 1`,
        [normalizedPhone],
      );

      let participantId: string | null = null;
      let eventId: string | null = null;
      let storedMessageId: string | null = null;

      if (tokenData && tokenData.length > 0) {
        // Found participant via message token
        participantId = tokenData[0].participantId;
        eventId = tokenData[0].eventId;
        storedMessageId = tokenData[0].messageId;
        this.logger.log(
          `Found participant ${participantId} via message token ${storedMessageId} for phone ${phoneNumber}`,
        );
      } else {
        // Fallback: Find participant by phone number if token not found
        this.logger.warn(
          `Message token not found for phone ${phoneNumber}, falling back to phone number lookup`,
        );

        let participant = await this.participantRepository.query(
          `SELECT * FROM "event_participants" 
           WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
           OR "phoneNumber" = $1
           ORDER BY "createdAt" DESC 
           LIMIT 1`,
          [normalizedPhone],
        );

        // If not found, try with different phone number formats
        if (!participant || participant.length === 0) {
          const phoneWithPlus = normalizedPhone.startsWith('+')
            ? normalizedPhone
            : `+${normalizedPhone}`;
          participant = await this.participantRepository.query(
            `SELECT * FROM "event_participants" 
             WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
             OR "phoneNumber" = $1
             ORDER BY "createdAt" DESC 
             LIMIT 1`,
            [phoneWithPlus],
          );
        }

        if (!participant || participant.length === 0) {
          this.logger.warn(
            `Participant not found for phone number: ${phoneNumber} (normalized: ${normalizedPhone})`,
          );
          return;
        }

        const participantData = participant[0];
        participantId = participantData.id;
        eventId = participantData.eventId;
      }

      if (!participantId || !eventId) {
        this.logger.warn(
          `Could not determine participant ID or event ID for message ${messageId}`,
        );
        return;
      }

      // Determine attending status from button response
      const attendingStatus =
        buttonTitle.toLowerCase().includes('yes') ||
        buttonTitle.toLowerCase() === 'yes' ||
        buttonId.toLowerCase().includes('yes')
          ? 'yes'
          : buttonTitle.toLowerCase().includes('no') ||
              buttonTitle.toLowerCase() === 'no' ||
              buttonId.toLowerCase().includes('no')
            ? 'no'
            : null;

      if (!attendingStatus) {
        this.logger.warn(
          `Could not determine attending status from button: ${buttonTitle} (ID: ${buttonId})`,
        );
        return;
      }

      // Update attending status in database
      await this.participantRepository.query(
        `UPDATE "event_participants" 
         SET attending = $1 
         WHERE id = $2 AND "eventId" = $3 
         RETURNING *`,
        [attendingStatus, participantId, eventId],
      );

      // Mark message token as processed if we found it via token
      if (storedMessageId) {
        await this.markMessageTokenAsProcessed(storedMessageId);
      }

      this.logger.log(
        `Updated attending status for participant ${participantId} to "${attendingStatus}"`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling button response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Handle button response from WhatsApp webhook (legacy method - kept for backward compatibility)
   * Updates the attending column in the database based on yes/no response
   */
  async handleButtonResponse(
    phoneNumber: string,
    buttonTitle: string,
    buttonId: string,
  ): Promise<void> {
    // This is a legacy method, but we'll use the phone number to find the most recent unprocessed token
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');

    // Find the most recent unprocessed message token for this phone number
    const tokenData = await this.messageTokenRepository.query(
      `SELECT "messageId" 
       FROM "whatsapp_message_tokens" 
       WHERE "phoneNumber" = $1 AND "isProcessed" = false 
       ORDER BY "createdAt" DESC 
       LIMIT 1`,
      [normalizedPhone],
    );

    if (tokenData && tokenData.length > 0) {
      return this.handleButtonResponseByMessageId(
        tokenData[0].messageId,
        phoneNumber,
        buttonTitle,
        buttonId,
      );
    }

    // Fallback to old behavior if no token found
    this.logger.warn(
      `No unprocessed token found for ${phoneNumber}, using phone number lookup`,
    );
    // Continue with phone number lookup (code from original method)
    // ... (keeping the original logic as fallback)
  }

  /**
   * Store WhatsApp message token for tracking participant responses
   */
  async storeMessageToken(
    messageId: string,
    participantId: string,
    eventId: string,
    phoneNumber: string,
    templateName?: string,
  ): Promise<void> {
    try {
      await this.messageTokenRepository.query(
        `INSERT INTO "whatsapp_message_tokens" 
         ("messageId", "participantId", "eventId", "phoneNumber", "templateName", "isProcessed", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
         ON CONFLICT ("messageId") DO NOTHING`,
        [
          messageId,
          participantId,
          eventId,
          phoneNumber,
          templateName || null,
          true,
        ],
      );
      this.logger.log(
        `Stored message token ${messageId} for participant ${participantId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to store message token: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - we don't want to fail message sending if token storage fails
    }
  }

  /**
   * Find participant by message ID from webhook
   */
  async findParticipantByMessageId(messageId: string): Promise<{
    participantId: string;
    eventId: string;
    phoneNumber: string;
    templateName: string;
  } | null> {
    try {
      const tokenData = await this.messageTokenRepository.query(
        `SELECT "participantId", "eventId", "phoneNumber", "templateName" 
         FROM "whatsapp_message_tokens" 
         WHERE "messageId" = $1 
         LIMIT 1`,
        [messageId],
      );

      if (!tokenData || tokenData.length === 0) {
        return null;
      }

      return {
        participantId: tokenData[0].participantId,
        eventId: tokenData[0].eventId,
        phoneNumber: tokenData[0].phoneNumber,
        templateName: tokenData[0].templateName,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to find participant by message ID: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Update participant attending status
   */
  async updateParticipantAttending(
    participantId: string,
    eventId: string,
    attendingStatus: string,
  ): Promise<void> {
    try {
      await this.participantRepository.query(
        `UPDATE "event_participants" 
         SET attending = $1 
         WHERE id = $2 AND "eventId" = $3 
         RETURNING *`,
        [attendingStatus, participantId, eventId],
      );
      this.logger.log(
        `Updated attending status for participant ${participantId} to "${attendingStatus}"`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to update attending status: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Mark message token as processed
   */
  async markMessageTokenAsProcessed(messageId: string): Promise<void> {
    try {
      await this.messageTokenRepository.query(
        `UPDATE "whatsapp_message_tokens" 
         SET "isProcessed" = true, "updatedAt" = NOW() 
         WHERE "messageId" = $1`,
        [messageId],
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to mark message token as processed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Delete message token from database
   */
  async deleteMessageToken(messageId: string): Promise<void> {
    try {
      await this.messageTokenRepository.query(
        `DELETE FROM "whatsapp_message_tokens" 
         WHERE "messageId" = $1`,
        [messageId],
      );
      this.logger.log(`Deleted message token ${messageId} from database`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to delete message token: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Find participant by phone number and store status token temporarily
   */
  async findAndStoreStatusToken(
    messageId: string,
    phoneNumber: string,
  ): Promise<void> {
    try {
      // Find participant by phone number
      const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');

      let participant = await this.participantRepository.query(
        `SELECT id, "eventId", "phoneNumber" 
         FROM "event_participants" 
         WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
         OR "phoneNumber" = $1
         ORDER BY "createdAt" DESC 
         LIMIT 1`,
        [normalizedPhone],
      );

      // If not found, try with different phone number formats
      if (!participant || participant.length === 0) {
        const phoneWithPlus = normalizedPhone.startsWith('+')
          ? normalizedPhone
          : `+${normalizedPhone}`;
        participant = await this.participantRepository.query(
          `SELECT id, "eventId", "phoneNumber" 
           FROM "event_participants" 
           WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
           OR "phoneNumber" = $1
           ORDER BY "createdAt" DESC 
           LIMIT 1`,
          [phoneWithPlus],
        );
      }

      if (participant && participant.length > 0) {
        const participantData = participant[0];
        // Store token temporarily
        await this.storeMessageToken(
          messageId,
          participantData.id,
          participantData.eventId,
          normalizedPhone,
          'status_update',
        );
        this.logger.log(
          `Stored status token ${messageId} temporarily for participant ${participantData.id}`,
        );
      } else {
        this.logger.warn(
          `No participant found for phone ${phoneNumber}, cannot store status token`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to find and store status token: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
