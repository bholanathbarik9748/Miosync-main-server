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
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { EventParticipantsService } from './event-participants.service';
import { UpdateEventParticipantDto } from './dto/event-participants.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import * as XLSX from 'xlsx';
import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { UserType } from 'src/utils/enums';
import { Roles } from 'src/common/decorators/roles.decorator';
import { multerConfig } from '../upload-document/config/multer.config';

@Controller('event-participants')
export class EventParticipantsController {
  constructor(private readonly participantsService: EventParticipantsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.SUPER_ADMIN)
  findAll() {
    return this.participantsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.participantsService.findOne(id);
  }

  @Post(':id')
  @Version('2')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Param('id') id: string,
  ): Promise<any> {
    if (!file) {
      throw new Error('File not provided');
    }

    try {
      // Parse Excel/CSV file with better options
      const workbook = XLSX.read(file.buffer, {
        type: 'buffer',
        cellDates: true, // Convert Excel dates to JavaScript dates
        cellNF: false, // Don't convert number formats
        cellText: false, // Don't convert to text
        raw: false, // Convert values to their proper types
      });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON as array of arrays
      const participants: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // Use first row as headers
        defval: null, // Default value for empty cells
      });

      // Filter out completely empty rows
      const dataRows = participants.filter((row: any[]) => {
        return row && row.length > 0 && !row.every((cell: any) => !cell);
      });

      if (dataRows.length === 0) {
        throw new Error('No valid data rows found in the file');
      }

      // Find the header row (first non-empty row)
      let headerRowIndex = 0;
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        // Check if this row contains header-like strings
        if (
          row.some(
            (cell: any) =>
              typeof cell === 'string' &&
              [
                'Name',
                'Category',
                'Mobile No.',
                'City',
                'Date Of Arrival',
              ].includes(cell),
          )
        ) {
          headerRowIndex = i;
          break;
        }
      }

      const headerRow = dataRows[headerRowIndex];
      const dataRowsOnly = dataRows.slice(headerRowIndex + 1);

      // Convert array format to object format for mapping
      const mappedParticipants = dataRowsOnly.map((row: any[]) => {
        const obj: any = {};
        headerRow.forEach((header: string, index: number) => {
          obj[header] = row[index];
        });
        return obj;
      });

      return await this.participantsService.create(mappedParticipants, id);
    } catch (error) {
      console.error('Error processing file:', error);
      throw new Error(`Failed to process file: ${error.message}`);
    }
  }

  @Put(':eventId/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(ValidationPipe) body: Partial<UpdateEventParticipantDto>,
  ) {
    return this.participantsService.update(id, eventId, body);
  }

  @Post('document/:eventId/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'back', maxCount: 1 },
      ],
      multerConfig,
    ),
  )
  async uploadDoc(
    @Param('id') participantId: string,
    @Param('eventId') eventId: string,
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      back?: Express.Multer.File[];
    },
  ): Promise<{
    frontDocumentUrl: string;
    backDocumentUrl: string;
    message: string;
  }> {
    if (!files.front || files.front.length === 0) {
      throw new BadRequestException('Front image is required');
    }

    if (!files.back || files.back.length === 0) {
      throw new BadRequestException('Back image is required');
    }

    const frontImage = files.front[0];
    const backImage = files.back[0];

    return await this.participantsService.uploadDocument(
      participantId,
      eventId,
      frontImage,
      backImage,
    );
  }
}
