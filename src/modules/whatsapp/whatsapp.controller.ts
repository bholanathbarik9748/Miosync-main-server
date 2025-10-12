import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsAppService } from './whatsapp.service';
import { multerConfig } from './config/multer.config';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from '../auth';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send-bulk')
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async sendBulk(
    @Body('numbers') numbers: string,
    @Body('message') message: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('image file is required');
    if (!numbers)
      throw new BadRequestException('numbers is required (JSON array string)');
    if (!message) throw new BadRequestException('message is required');

    let numArray: string[];
    try {
      numArray = JSON.parse(numbers);
      if (!Array.isArray(numArray) || numArray.length === 0) {
        throw new Error('numbers must be a non-empty array');
      }
    } catch (err) {
      throw new BadRequestException(
        'numbers must be stringified JSON array, e.g. ["+91...","+91..."]',
      );
    }

    // basic formatting/validation (optional)
    const normalized = numArray.map((n) => n.trim());

    return this.whatsappService.sendBulkWithImage(
      normalized,
      message,
      file.path,
    );
  }
}
