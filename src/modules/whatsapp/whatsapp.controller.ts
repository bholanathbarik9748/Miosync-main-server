import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
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
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send-template')
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
}
