import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppWebhookPayload } from './whatsapp.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from '../auth';

interface TemplateRequestBody {
  messaging_product?: string;
  to: string;
  type?: string;
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

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send-template')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async sendTemplate(@Body() body: TemplateRequestBody) {
    this.logger.log(
      `Received template send request for ${body.to} with template ${body.template.name}`,
    );

    // Build payload matching WhatsApp API format exactly
    const payload = {
      messaging_product: 'whatsapp',
      to: body.to,
      type: 'template',
      template: {
        name: body.template.name,
        language: {
          code: body.template.language.code || 'en_US',
        },
        ...(body.template.components && body.template.components.length > 0
          ? {
              components: body.template.components,
            }
          : {}),
      },
    };

    return await this.whatsappService.sendTemplate(payload);
  }

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const VERIFY_TOKEN =
      process.env.WA_WEBHOOK_VERIFY_TOKEN || 'miosync_webhook_verify_token';

    this.logger.log('🔍 Webhook Verification Triggered', {
      mode,
      token,
      challenge,
    });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('✅ Webhook Verified Successfully');
      return res.status(200).send(challenge);
    }

    this.logger.error('❌ Webhook Verification Failed', {
      mode,
      token,
      expected: VERIFY_TOKEN,
    });
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  handleWebhook(@Body() body: WhatsAppWebhookPayload, @Res() res: Response) {
    try {
      this.logger.log('✅ Webhook event received');

      if (!body?.entry || !Array.isArray(body.entry)) {
        this.logger.error('❌ Invalid webhook payload');
        return res.sendStatus(200);
      }

      for (const entry of body.entry) {
        const changes = entry?.changes;
        if (!changes || !Array.isArray(changes)) continue;

        for (const change of changes) {
          if (!change?.field) continue;

          this.logger.log(`📌 Change detected: ${change.field}`);

          const messages = change.value?.messages;
          if (Array.isArray(messages)) {
            for (const msg of messages) {
              // Check for button type messages (Yes/No responses)
              /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
              const msgAny = msg as any;
              if (
                msg.type === 'button' &&
                msgAny.button &&
                typeof msgAny.button === 'object' &&
                'text' in msgAny.button &&
                typeof msgAny.button.text === 'string'
              ) {
                const buttonText: string = msgAny.button.text;
                const phoneNumber = msg.from;
                const contextMessageId =
                  msgAny.context &&
                  typeof msgAny.context === 'object' &&
                  'id' in msgAny.context &&
                  typeof msgAny.context.id === 'string'
                    ? msgAny.context.id
                    : null;
                /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

                // Only process if button text is "Yes" or "No"
                if (buttonText === 'Yes' || buttonText === 'No') {
                  this.logger.log('📱 WhatsApp Button Response Received', {
                    phoneNumber,
                    messageId: msg.id,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    contextMessageId,
                    buttonText,
                  });

                  // Use context.id (original message ID) to find participant
                  if (
                    contextMessageId &&
                    typeof contextMessageId === 'string'
                  ) {
                    void this.whatsappService
                      .findParticipantByMessageId(contextMessageId)
                      .then((tokenData) => {
                        if (tokenData) {
                          console.log(tokenData);
                          if (
                            tokenData?.templateName == 'booking_confirmation'
                          ) {
                            const attendingStatus =
                              buttonText === 'Yes' ? 'Yes' : 'No';
                            this.logger.log(
                              `Found participant ${tokenData.participantId} for message ${contextMessageId}, updating attending to ${attendingStatus}`,
                            );
                            void this.whatsappService
                              .updateParticipantAttending(
                                tokenData.participantId,
                                tokenData.eventId,
                                attendingStatus,
                              )
                              .then(() => {
                                // Delete the token from whatsapp_message_tokens after updating
                                return this.whatsappService.deleteMessageToken(
                                  contextMessageId,
                                );
                              })
                              .catch((error: unknown) => {
                                this.logger.error(
                                  `Failed to update attending status or delete token: ${error instanceof Error ? error.message : 'Unknown error'}`,
                                );
                              });
                          } else {
                            this.logger.warn(
                              `No participant found for context message ID: ${contextMessageId}`,
                            );
                          }
                        }
                      })
                      .catch((error: unknown) => {
                        this.logger.error(
                          `Failed to find participant by message ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        );
                      });
                  } else {
                    this.logger.warn(
                      `No context message ID found for button response from ${phoneNumber}`,
                    );
                  }
                }
              }
              // Check for interactive messages (button clicks) - legacy format
              else if (msg.interactive) {
                const interactive = msg.interactive;
                const phoneNumber = msg.from;

                if (
                  interactive.type === 'button_reply' &&
                  interactive.button_reply
                ) {
                  const buttonResponse = interactive.button_reply;

                  this.logger.log('📱 WhatsApp Button Response Received', {
                    phoneNumber,
                    messageId: msg.id,
                    buttonId: buttonResponse.id,
                    buttonTitle: buttonResponse.title,
                  });

                  // Handle button response (this will update the DB)
                  void this.whatsappService
                    .handleButtonResponse(
                      phoneNumber,
                      buttonResponse.title,
                      buttonResponse.id,
                    )
                    .catch((error: unknown) => {
                      this.logger.error(
                        `Failed to process button response: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        error instanceof Error ? error.stack : undefined,
                      );
                    });
                }
              } else {
                // Handle text messages
                const text = msg.text?.body;
                const from = msg.from;

                this.logger.log('📩 Incoming Message', {
                  from,
                  type: msg.type,
                  text: text ?? '(Not text message)',
                });

                if (text && from) {
                  this.whatsappService.handleIncomingTextMessage(from, text);
                }
              }
            }
          }

          // Handle statuses - only if messages object doesn't exist
          // If messages exist, we already handled it above and deleted the token
          const statuses = change.value?.statuses;
          const hasMessages =
            change.value?.messages &&
            Array.isArray(change.value.messages) &&
            change.value.messages.length > 0;

          if (Array.isArray(statuses) && !hasMessages) {
            // Only store in whatsapp_message_tokens if messages don't exist
            for (const status of statuses) {
              const messageId = status.id;
              const recipientId = status.recipient_id;

              this.logger.log(`Message ID from status: ${messageId}`);

              if (messageId && recipientId) {
                // Check if token already exists
                void this.whatsappService
                  .findParticipantByMessageId(messageId)
                  .then((tokenData) => {
                    if (!tokenData) {
                      // Token doesn't exist, find participant by phone and store temporarily
                      const normalizedPhone = String(recipientId).replace(
                        /[^\d+]/g,
                        '',
                      );
                      this.logger.log(
                        `Token not found for message ${messageId}, finding participant by phone ${normalizedPhone} to store temporarily`,
                      );
                      // Find participant by phone number and store token
                      this.whatsappService
                        .findAndStoreStatusToken(messageId, normalizedPhone)
                        .catch((error: unknown) => {
                          this.logger.error(
                            `Failed to store status token: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          );
                        });
                    } else {
                      // Token exists, update attending status
                      this.logger.log(
                        `Found participant ${tokenData.participantId} for message ${messageId}`,
                      );
                      this.whatsappService
                        .updateParticipantAttending(
                          tokenData.participantId,
                          tokenData.eventId,
                          'Not responded',
                        )
                        .catch((error: unknown) => {
                          this.logger.error(
                            `Failed to update attending status: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          );
                        });
                    }
                  })
                  .catch((error: unknown) => {
                    this.logger.error(
                      `Failed to find participant by message ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    );
                  });
              }
            }
          } else if (Array.isArray(statuses) && hasMessages) {
            // Messages exist, so we already handled it - just log status
            for (const status of statuses) {
              this.logger.log(
                `Status update (messages already processed): ${status.id} - ${status.status}`,
              );
            }
          }
        }
      }

      return res.sendStatus(200);
    } catch (err) {
      this.logger.error(
        '🔥 Webhook processing error:',
        err instanceof Error ? err.message : 'Unknown error',
      );
      return res.sendStatus(200);
    }
  }
}
