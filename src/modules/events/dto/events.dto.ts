import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsDateString,
  Length,
} from 'class-validator';

export enum FoodType {
  VEG = 'veg',
  NON_VEG = 'non-veg',
  BOTH = 'both',
}

export class EventDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 100, {
    message: 'Event name must be between 3 and 100 characters',
  })
  eventName: string;

  @IsDateString(
    {},
    { message: 'eventDateTime must be a valid ISO date-time string' },
  )
  @IsNotEmpty()
  eventDateTime: string; // Example: "2025-09-14T18:30:00Z"

  @IsString()
  @IsNotEmpty()
  @Length(3, 150, { message: 'Venue must be between 3 and 150 characters' })
  venue: string;

  @IsEnum(FoodType, { message: 'Food must be veg, non-veg, or both' })
  food: FoodType;
}
