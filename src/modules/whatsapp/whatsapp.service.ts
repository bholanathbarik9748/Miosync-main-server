import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data'; // ✅ fixed import
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private token = process.env.WA_TOKEN;
  private phoneId = process.env.WA_PHONE_NUMBER_ID;
  private base = process.env.WA_API_BASE || 'https://graph.facebook.com';
  private version = process.env.WA_API_VERSION || 'v16.0';

  private url() {
    return `${this.base}/${this.version}/${this.phoneId}`;
  }

  private authHeaders(extra = {}) {
    return {
      Authorization: `Bearer ${this.token}`,
      ...extra,
    };
  }

  async uploadMedia(filePath: string) {
    const form = new FormData();
    form.append('file', fsSync.createReadStream(filePath));
    form.append('messaging_product', 'whatsapp');

    const headers = { ...this.authHeaders(form.getHeaders()) };
    const res = await axios.post(`${this.url()}/media`, form, { headers });
    return res.data; // { id: 'MEDIA_ID' }
  }

  async sendText(to: string, body: string) {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    };

    const res = await axios.post(`${this.url()}/messages`, payload, {
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
    });
    return res.data;
  }

  async sendImageByMediaId(to: string, mediaId: string, caption?: string) {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { id: mediaId, caption },
    };

    const res = await axios.post(`${this.url()}/messages`, payload, {
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
    });
    return res.data;
  }

  async sendBulkWithImage(
    numbers: string[],
    message: string,
    imagePath: string,
  ) {
    const results: Array<any> = [];
    let mediaId: string | undefined;

    try {
      // 1) Upload image once
      const uploadRes = await this.uploadMedia(imagePath);
      mediaId = uploadRes.id;

      // 2) Send to each number
      for (const to of numbers) {
        try {
          await this.sendText(to, message);

          if (!mediaId) throw new Error('Media ID missing');
          const res = await this.sendImageByMediaId(
            to,
            mediaId,
            'Garba Ni Raat 2025 🎉',
          );

          results.push({ to, status: 'success', response: res });
        } catch (error) {
          this.logger.error(
            `Send failed for ${to}`,
            error?.response?.data || error?.message,
          );
          results.push({
            to,
            status: 'failed',
            error: error?.response?.data || error?.message,
          });
        }

        // small delay to prevent rate-limit issues
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (err) {
      this.logger.error(
        'Image upload or sending failed',
        err?.response?.data || err?.message,
      );
      throw err;
    } finally {
      try {
        if (imagePath) await fs.unlink(imagePath);
      } catch (e) {
        this.logger.warn('Failed to delete uploaded file', e?.message);
      }
    }

    return results;
  }
}