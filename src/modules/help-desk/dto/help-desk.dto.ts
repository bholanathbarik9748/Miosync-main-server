import { IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  @MaxLength(100)
  @IsNotEmpty()
  name: string;

  @IsString()
  @MaxLength(20)
  @IsNotEmpty()
  roomNumber: string;

  @IsString()
  @MaxLength(15)
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  request: string;

  @IsString()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export class UpdateTicketStatusDto {
  @IsString()
  @IsIn(['open', 'inProgress', 'resolved', 'closed'])
  @IsNotEmpty()
  status: 'open' | 'inProgress' | 'resolved' | 'closed';
}
