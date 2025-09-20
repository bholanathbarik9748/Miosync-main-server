import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  ValidationPipe,
  UseGuards,
  Version,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EventParticipantsService } from './event-participants.service';
import {
  CreateEventParticipantDto,
  UpdateEventParticipantDto,
} from './dto/event-participants.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import * as XLSX from 'xlsx';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('event-participants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventParticipantsController {
  constructor(private readonly participantsService: EventParticipantsService) {}

  @Get()
  findAll() {
    return this.participantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.participantsService.findOne(id);
  }

  @Post(':id')
  @Version('2')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Param('id') id: string,
  ): Promise<any> {
    if (!file) {
      throw new Error('File not provided');
    }
    // Parse Excel/CSV file
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const participants: CreateEventParticipantDto[] =
      XLSX.utils.sheet_to_json(worksheet);

    return await this.participantsService.create(participants, id);
  }

  @Put(':eventId/:id')
  update(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(ValidationPipe) body: Partial<UpdateEventParticipantDto>,
  ) {
    return this.participantsService.update(id, eventId, body);
  }
}
