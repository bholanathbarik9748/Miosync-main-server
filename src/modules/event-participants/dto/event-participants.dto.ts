import { OmitType } from '@nestjs/mapped-types';
import { IsString, IsOptional, IsDateString, IsUUID } from 'class-validator';

export class CreateEventParticipantDto {
  @IsUUID()
  eventId: string;

  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  city: string;

  @IsOptional()
  @IsDateString()
  dateOfArrival?: string;

  @IsOptional()
  @IsString()
  modeOfArrival?: string;

  @IsOptional()
  @IsString()
  trainFlightNumber?: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  @IsString()
  hotelName?: string;

  @IsOptional()
  @IsString()
  roomType?: string;

  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsString()
  departureDetails?: string;

  @IsOptional()
  @IsString()
  departureTime?: string;

  @IsOptional()
  @IsString()
  attending?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  remarksRound2?: string;
}

export class UpdateEventParticipantDto extends OmitType(
  CreateEventParticipantDto,
  ['eventId'] as const,
) {}
