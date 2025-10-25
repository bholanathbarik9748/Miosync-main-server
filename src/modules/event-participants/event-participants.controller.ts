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
import { UserType } from 'src/utils/enums';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('event-participants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventParticipantsController {
  constructor(private readonly participantsService: EventParticipantsService) {}

  @Get()
  @Roles(UserType.SUPER_ADMIN)
  findAll() {
    return this.participantsService.findAll();
  }

  @Get(':id')
  @Roles(UserType.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.participantsService.findOne(id);
  }

  @Post(':id')
  @Version('2')
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
  @Roles(UserType.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(ValidationPipe) body: Partial<UpdateEventParticipantDto>,
  ) {
    return this.participantsService.update(id, eventId, body);
  }
}
