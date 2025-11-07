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
              // Check for interactive messages (button clicks) first
              if (msg.interactive) {
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

          const statuses = change.value?.statuses;
          if (Array.isArray(statuses)) {
            for (const status of statuses) {
              this.logger.log('📦 Status Update', {
                id: status.id,
                status: status.status,
                timestamp: status.timestamp,
              });
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
