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
}
