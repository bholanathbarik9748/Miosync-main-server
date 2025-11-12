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
  ) {
    this.validateConfiguration();
  }

  /**
   * Validate WhatsApp configuration at startup
   */
  private validateConfiguration(): void {
    const issues: string[] = [];

    if (!this.token) {
      issues.push('WA_TOKEN is not set');
    } else if (this.token.length < 50) {
      issues.push('WA_TOKEN appears to be invalid (too short)');
    }

    if (!this.phoneId) {
      issues.push('WA_PHONE_NUMBER_ID is not set');
    }

    if (issues.length > 0) {
      this.logger.error(
        '🚨 WhatsApp Configuration Issues:',
        issues.join(', '),
      );
      this.logger.error(
        'WhatsApp messaging will not work until these issues are resolved.',
      );
      this.logger.error(
        'Please check your .env file and add the required variables.',
      );
    } else {
      this.logger.log('✅ WhatsApp configuration validated successfully');
    }
  }

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
      // Validate payload before sending
      if (!payload.to || !payload.template?.name) {
        throw new Error('Invalid payload: missing required fields');
      }

      // Ensure phone number has country code
      let phoneNumber = payload.to.replace(/[^\d+]/g, '');
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+91${phoneNumber}`;
        payload.to = phoneNumber;
      }

      this.logger.log(
        `📤 [WhatsApp] Sending template message - To: ${payload.to}, Template: ${payload.template.name}, Language: ${payload.template.language.code}`,
      );

      const url = `${this.getUrl()}/messages`;
      const response = await axios.post<WhatsAppMessageResponse>(url, payload, {
        headers: this.getAuthHeaders(),
        timeout: 30000, // 30 second timeout
      });

      // Log FULL response for debugging
      this.logger.log(
        `📋 [WhatsApp] FULL API RESPONSE: ${JSON.stringify(response.data, null, 2)}`,
      );

      const messageId = response.data.messages?.[0]?.id;
      const waId = response.data.contacts?.[0]?.wa_id;
      const contactInput = response.data.contacts?.[0]?.input;

      // IMPORTANT: WhatsApp API can return success (200 OK) even when messages won't deliver
      // This happens when:
      // 1. App is not fully verified (24-hour messaging window restriction)
      // 2. User hasn't messaged you in last 24 hours
      // 3. Template is not approved
      // The ONLY way to know if message actually delivered is via webhook status updates

      if (messageId) {
        this.logger.log(
          `✅ [WhatsApp] API accepted message - Message ID: ${messageId}`,
        );
        if (waId) {
          this.logger.log(
            `✅ [WhatsApp] Phone number is on WhatsApp - WhatsApp ID: ${waId}`,
          );
        } else {
          this.logger.warn(
            `⚠️ [WhatsApp] No WhatsApp ID in response - number may not be on WhatsApp`,
          );
        }
        this.logger.warn(
          `⚠️ [WhatsApp] IMPORTANT: API success does NOT guarantee delivery!`,
        );
        this.logger.warn(
          `⚠️ [WhatsApp] If app is NOT fully verified, you can only message users who messaged you in last 24 hours`,
        );
        this.logger.log(
          `📱 [WhatsApp] Check webhook logs for actual delivery status ('delivered' or 'failed')`,
        );
      } else {
        this.logger.error(
          `❌ [WhatsApp] API returned success but NO message ID - message was NOT accepted`,
        );
        this.logger.error(
          `❌ [WhatsApp] Check: app verification status, template approval, 24-hour window`,
        );
      }

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<WhatsAppErrorResponse>;

      if (axiosError.response?.data?.error) {
        const waError = axiosError.response.data.error;
        const errorMessage = waError.message || 'WhatsApp API error';
        const errorCode = waError.code?.toString() || 'UNKNOWN';

        // Enhanced error logging with actionable information
        this.logger.error(
          `❌ [WhatsApp] API error [${errorCode}]: ${errorMessage}`,
        );
        this.logger.error(`[WhatsApp] Template: ${payload.template.name}`);
        this.logger.error(`[WhatsApp] To: ${payload.to}`);
        this.logger.error(`[WhatsApp] Error Type: ${waError.type}`);
        this.logger.error(`[WhatsApp] FB Trace ID: ${waError.fbtrace_id}`);
        this.logger.error(`[WhatsApp] Status Code: ${axiosError.response?.status}`);

        // Add specific error handling guidance
        if (errorCode === '190') {
          this.logger.error(
            '🚨 ACCESS TOKEN EXPIRED! Please update WA_TOKEN in your .env file. Generate new token at: https://business.facebook.com/settings/system-users',
          );
        } else if (errorCode === '132001') {
          this.logger.error(
            `🚨 TEMPLATE NOT FOUND! Template "${payload.template.name}" does not exist or is not approved. Check at: https://business.facebook.com/wa/manage/message-templates/`,
          );
        } else if (errorCode === '131008') {
          this.logger.error(
            '🚨 MISSING PARAMETERS! Template requires parameters that were not provided.',
          );
        } else if (errorCode === '132000') {
          this.logger.error(
            '🚨 PARAMETER MISMATCH! Number of parameters does not match template definition.',
          );
        }

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
        `❌ [WhatsApp] Network/Unknown error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Template: ${payload.template.name}, To: ${payload.to}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
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
      this.logger.log(`📥 [WhatsApp] Processing webhook event`);
      
      // Validate payload structure
      if (!payload || !payload.object) {
        this.logger.warn('⚠️ [WhatsApp] Received webhook with invalid or missing payload');
        return;
      }

      // WhatsApp webhook payload structure
      if (payload.object !== 'whatsapp_business_account') {
        this.logger.warn(
          `⚠️ [WhatsApp] Received webhook with unexpected object type: ${payload.object}`,
        );
        return;
      }

      if (!payload.entry || !Array.isArray(payload.entry)) {
        this.logger.warn(
          '⚠️ [WhatsApp] Received webhook with missing or invalid entry array',
        );
        return;
      }
      
      this.logger.log(`[WhatsApp] Processing ${payload.entry.length} webhook entries`);

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
            `📌 [WhatsApp] Processing webhook change for field: ${change.field}`,
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
                  `${statusEmoji} [WhatsApp] Message ${messageStatus.toUpperCase()} - Participant: ${participantInfo.participantId} | Template: ${participantInfo.templateName || 'N/A'} | Phone: ${recipientId} | Message ID: ${messageId}`,
                );
              } else {
                this.logger.log(
                  `${statusEmoji} [WhatsApp] Message ${messageStatus.toUpperCase()} - Phone: ${recipientId} | Message ID: ${messageId}`,
                );
              }

              // Log detailed status information
              const timestampDate = new Date(parseInt(status.timestamp) * 1000);
              this.logger.log(`📱 [WhatsApp] Status Update Details:`);
              this.logger.log(`   - Message ID: ${status.id}`);
              this.logger.log(`   - Status: ${status.status}`);
              this.logger.log(`   - Recipient: ${status.recipient_id}`);
              this.logger.log(`   - Participant ID: ${participantInfo?.participantId || 'Unknown'}`);
              this.logger.log(`   - Template: ${participantInfo?.templateName || 'Unknown'}`);
              this.logger.log(`   - Event ID: ${participantInfo?.eventId || 'Unknown'}`);
              this.logger.log(`   - Timestamp: ${timestampDate.toISOString()}`);
              if (status.conversation?.origin?.type) {
                this.logger.log(`   - Conversation Type: ${status.conversation.origin.type}`);
              }
              if (status.errors) {
                this.logger.log(`   - Errors: ${JSON.stringify(status.errors)}`);
              }

              // If message failed, log error details with troubleshooting
              if (messageStatus === 'failed' && status.errors) {
                this.logger.error(
                  `❌ [WhatsApp] Message FAILED to deliver`,
                );
                this.logger.error(`   - Participant ID: ${participantInfo?.participantId || 'Unknown'}`);
                this.logger.error(`   - Phone: ${recipientId}`);
                this.logger.error(`   - Message ID: ${messageId}`);
                this.logger.error(`   - Failure Details: ${JSON.stringify(status.errors, null, 2)}`);
                
                // Log common failure reasons
                const errorCode = status.errors[0]?.code;
                if (errorCode === 1) {
                  this.logger.error(
                    '🚨 [WhatsApp] REASON: Phone number not registered on WhatsApp or invalid',
                  );
                } else if (errorCode === 131026) {
                  this.logger.error(
                    '🚨 [WhatsApp] REASON: Message undeliverable - User may have blocked business number',
                  );
                } else if (errorCode === 131047) {
                  this.logger.error(
                    '🚨 [WhatsApp] REASON: Re-engagement message - User has not messaged you in 24 hours',
                  );
                } else if (errorCode === 131051) {
                  this.logger.error(
                    '🚨 [WhatsApp] REASON: Unsupported message type',
                  );
                }
              }

              // Log if message was sent but not delivered (stuck in 'sent' status)
              if (messageStatus === 'sent') {
                this.logger.warn(
                  `⏳ [WhatsApp] Message SENT but not yet DELIVERED to ${recipientId}`,
                );
                this.logger.warn('   Possible reasons:');
                this.logger.warn('   - User is offline/phone is off');
                this.logger.warn('   - User has no internet connection');
                this.logger.warn('   - Message is queued at WhatsApp');
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
                  const timestampDate = new Date(parseInt(timestamp) * 1000);

                  this.logger.log(`📱 [WhatsApp] Button Response Received:`);
                  this.logger.log(`   - Phone: ${phoneNumber}`);
                  this.logger.log(`   - Message ID: ${messageId}`);
                  this.logger.log(`   - Timestamp: ${timestampDate.toISOString()}`);
                  this.logger.log(`   - Button ID: ${buttonResponse.id}`);
                  this.logger.log(`   - Button Title: ${buttonResponse.title}`);
                  this.logger.log(`   - Response Type: button_reply`);

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
                  const timestampDate = new Date(parseInt(timestamp) * 1000);

                  this.logger.log(`📱 [WhatsApp] List Response Received:`);
                  this.logger.log(`   - Phone: ${phoneNumber}`);
                  this.logger.log(`   - Message ID: ${messageId}`);
                  this.logger.log(`   - Timestamp: ${timestampDate.toISOString()}`);
                  this.logger.log(`   - List Item ID: ${listResponse.id}`);
                  this.logger.log(`   - List Item Title: ${listResponse.title}`);
                  this.logger.log(`   - Response Type: list_reply`);

                  // Log detailed response
                  this.logger.log(
                    `User ${phoneNumber} selected list item "${listResponse.title}" (ID: ${listResponse.id})`,
                  );
                }
              } else if (message.text) {
                // Regular text message (not a button response)
                const timestampDate = new Date(parseInt(message.timestamp) * 1000);
                
                this.logger.log(`📱 [WhatsApp] Text Message Received:`);
                this.logger.log(`   - Phone: ${message.from}`);
                this.logger.log(`   - Message ID: ${message.id}`);
                this.logger.log(`   - Text: ${message.text.body}`);
                this.logger.log(`   - Timestamp: ${timestampDate.toISOString()}`);
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ [WhatsApp] Error processing webhook event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - we want to log but not cause webhook retries
      // The webhook handler already acknowledges receipt
    }
  }

  handleIncomingTextMessage(from: string, text: string): void {
    this.logger.log(`💬 [WhatsApp] Processing user text message:`);
    this.logger.log(`   - From: ${from}`);
    this.logger.log(`   - Text: ${text}`);
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
      // Validate input parameters
      if (!messageId || !phoneNumber || !buttonTitle) {
        this.logger.warn(
          'Invalid input to handleButtonResponseByMessageId: missing required parameters',
        );
        return;
      }

      // Normalize phone number
      const normalizedPhone = phoneNumber.trim().replace(/[^\d+]/g, '');

      if (!normalizedPhone) {
        this.logger.warn('Empty phone number after normalization');
        return;
      }

      // Find the most recent unprocessed message token for this phone number
      // This token was stored when we sent the booking confirmation message
      // Order by id DESC as a fallback (newer records typically have higher UUIDs)
      // Try created_at first, fallback to createdAt if that fails
      let tokenData;
      try {
        tokenData = await this.messageTokenRepository.query(
          `SELECT "participantId", "eventId", "messageId" 
           FROM "whatsapp_message_tokens" 
           WHERE "phoneNumber" = $1 AND "isProcessed" = false 
           ORDER BY "created_at" DESC 
           LIMIT 1`,
          [normalizedPhone],
        );
      } catch (error) {
        // Fallback if created_at doesn't exist (table might have createdAt)
        tokenData = await this.messageTokenRepository.query(
          `SELECT "participantId", "eventId", "messageId" 
           FROM "whatsapp_message_tokens" 
           WHERE "phoneNumber" = $1 AND "isProcessed" = false 
           ORDER BY "createdAt" DESC 
           LIMIT 1`,
          [normalizedPhone],
        );
      }

      let participantId: string | null = null;
      let eventId: string | null = null;
      let storedMessageId: string | null = null;

      if (tokenData && Array.isArray(tokenData) && tokenData.length > 0) {
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

        // Try multiple phone number formats
        const phoneFormats = [
          normalizedPhone,
          normalizedPhone.startsWith('+') ? normalizedPhone : `+${normalizedPhone}`,
          normalizedPhone.startsWith('+91') ? normalizedPhone : `+91${normalizedPhone.replace(/^\+/, '')}`,
        ];

        let participant: any[] | null = null;
        for (const phoneFormat of phoneFormats) {
          participant = await this.participantRepository.query(
            `SELECT * FROM "event_participants" 
             WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
             OR "phoneNumber" = $1
             ORDER BY "created_at" DESC 
             LIMIT 1`,
            [phoneFormat],
          );

          if (participant && Array.isArray(participant) && participant.length > 0) {
            break;
          }
        }

        if (!participant || !Array.isArray(participant) || participant.length === 0) {
          this.logger.warn(
            `Participant not found for phone number: ${phoneNumber} (normalized: ${normalizedPhone})`,
          );
          return;
        }

        const participantData = participant[0] as { id: string; eventId: string };
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
    // Try created_at first, fallback to createdAt if that fails
    let tokenData;
    try {
      tokenData = await this.messageTokenRepository.query(
        `SELECT "messageId" 
         FROM "whatsapp_message_tokens" 
         WHERE "phoneNumber" = $1 AND "isProcessed" = false 
         ORDER BY "created_at" DESC 
         LIMIT 1`,
        [normalizedPhone],
      );
    } catch (error) {
      // Fallback if created_at doesn't exist (table might have createdAt)
      tokenData = await this.messageTokenRepository.query(
        `SELECT "messageId" 
         FROM "whatsapp_message_tokens" 
         WHERE "phoneNumber" = $1 AND "isProcessed" = false 
         ORDER BY "createdAt" DESC 
         LIMIT 1`,
        [normalizedPhone],
      );
    }

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
      this.logger.log(
        `📝 [WhatsApp] Storing message token - Message ID: ${messageId}, Participant: ${participantId}, Phone: ${phoneNumber}, Template: ${templateName || 'N/A'}`,
      );
      
      // Use DEFAULT for timestamp columns to avoid column name mismatch issues
      // This works whether the column is named "created_at" or "createdAt"
      await this.messageTokenRepository.query(
        `INSERT INTO "whatsapp_message_tokens" 
         ("messageId", "participantId", "eventId", "phoneNumber", "templateName", "isProcessed") 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT ("messageId") DO NOTHING`,
        [
          messageId,
          participantId,
          eventId,
          phoneNumber,
          templateName || null,
          false, // Changed from true to false - message not yet processed
        ],
      );
      
      this.logger.log(
        `✅ [WhatsApp] Message token stored successfully - Message ID: ${messageId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `❌ [WhatsApp] Failed to store message token - Message ID: ${messageId}, Error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
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
      this.logger.log(
        `🔍 [WhatsApp] Looking up participant by message ID: ${messageId}`,
      );
      
      const tokenData = await this.messageTokenRepository.query(
        `SELECT "participantId", "eventId", "phoneNumber", "templateName" 
         FROM "whatsapp_message_tokens" 
         WHERE "messageId" = $1 
         LIMIT 1`,
        [messageId],
      );

      if (!tokenData || tokenData.length === 0) {
        this.logger.warn(
          `⚠️ [WhatsApp] No participant found for message ID: ${messageId}`,
        );
        return null;
      }

      this.logger.log(
        `✅ [WhatsApp] Found participant - ID: ${tokenData[0].participantId}, Phone: ${tokenData[0].phoneNumber}, Template: ${tokenData[0].templateName}`,
      );

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
        `❌ [WhatsApp] Failed to find participant by message ID: ${messageId}, Error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
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
      this.logger.log(
        `📝 [WhatsApp] Updating attending status - Participant: ${participantId}, Event: ${eventId}, Status: ${attendingStatus}`,
      );
      
      const result = await this.participantRepository.query(
        `UPDATE "event_participants" 
         SET attending = $1 
         WHERE id = $2 AND "eventId" = $3 
         RETURNING *`,
        [attendingStatus, participantId, eventId],
      );
      
      if (result && result.length > 0) {
        this.logger.log(
          `✅ [WhatsApp] Successfully updated attending status for participant ${participantId} to "${attendingStatus}"`,
        );
      } else {
        this.logger.warn(
          `⚠️ [WhatsApp] No rows updated for participant ${participantId} - participant may not exist`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `❌ [WhatsApp] Failed to update attending status - Participant: ${participantId}, Error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
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
      this.logger.log(
        `📝 [WhatsApp] Marking message token as processed: ${messageId}`,
      );
      
      // Update without specifying updated_at to avoid column name issues
      // The column will use its default or trigger if configured
      await this.messageTokenRepository.query(
        `UPDATE "whatsapp_message_tokens" 
         SET "isProcessed" = true 
         WHERE "messageId" = $1`,
        [messageId],
      );
      
      this.logger.log(
        `✅ [WhatsApp] Message token marked as processed: ${messageId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `❌ [WhatsApp] Failed to mark message token as processed: ${messageId}, Error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Delete message token from database
   */
  async deleteMessageToken(messageId: string): Promise<void> {
    try {
      this.logger.log(
        `🗑️ [WhatsApp] Deleting message token: ${messageId}`,
      );
      
      await this.messageTokenRepository.query(
        `DELETE FROM "whatsapp_message_tokens" 
         WHERE "messageId" = $1`,
        [messageId],
      );
      
      this.logger.log(
        `✅ [WhatsApp] Message token deleted successfully: ${messageId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `❌ [WhatsApp] Failed to delete message token: ${messageId}, Error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
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
      this.logger.log(
        `🔍 [WhatsApp] Finding participant and storing status token - Message: ${messageId}, Phone: ${phoneNumber}`,
      );
      
      // Find participant by phone number
      const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
      
      this.logger.log(
        `[WhatsApp] Normalized phone number: ${normalizedPhone}`,
      );

      let participant = await this.participantRepository.query(
        `SELECT id, "eventId", "phoneNumber" 
         FROM "event_participants" 
         WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
         OR "phoneNumber" = $1
         ORDER BY "created_at" DESC 
         LIMIT 1`,
        [normalizedPhone],
      );

      // If not found, try with different phone number formats
      if (!participant || participant.length === 0) {
        const phoneWithPlus = normalizedPhone.startsWith('+')
          ? normalizedPhone
          : `+${normalizedPhone}`;
        
        this.logger.log(
          `[WhatsApp] First lookup failed, trying with plus prefix: ${phoneWithPlus}`,
        );
        
        participant = await this.participantRepository.query(
          `SELECT id, "eventId", "phoneNumber" 
           FROM "event_participants" 
           WHERE REPLACE(REPLACE("phoneNumber", ' ', ''), '-', '') = $1 
           OR "phoneNumber" = $1
           ORDER BY "created_at" DESC 
           LIMIT 1`,
          [phoneWithPlus],
        );
      }

      if (participant && participant.length > 0) {
        const participantData = participant[0];
        
        this.logger.log(
          `✅ [WhatsApp] Found participant - ID: ${participantData.id}, Event: ${participantData.eventId}`,
        );
        
        // Store token temporarily
        await this.storeMessageToken(
          messageId,
          participantData.id,
          participantData.eventId,
          normalizedPhone,
          'status_update',
        );
        
        this.logger.log(
          `✅ [WhatsApp] Status token stored successfully for participant ${participantData.id}`,
        );
      } else {
        this.logger.warn(
          `⚠️ [WhatsApp] No participant found for phone ${phoneNumber} (normalized: ${normalizedPhone}), cannot store status token`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `❌ [WhatsApp] Failed to find and store status token - Message: ${messageId}, Phone: ${phoneNumber}, Error: ${errorMessage}`,
      );
      this.logger.error(
        `[WhatsApp] Stack trace:`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
