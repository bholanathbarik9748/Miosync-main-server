import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { ExternalServiceException } from 'src/common/exceptions/custom.exception';
import { ErrorCode } from 'src/common/exceptions/error-codes.enum';

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

  processWebhookEvent(payload: WhatsAppWebhookPayload): void {
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
              this.logger.log(`📱 WhatsApp Status Update Received`, {
                messageId: status.id,
                status: status.status,
                recipientId: status.recipient_id,
                timestamp: new Date(
                  parseInt(status.timestamp) * 1000,
                ).toISOString(),
                errors: status.errors,
              });
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
}
