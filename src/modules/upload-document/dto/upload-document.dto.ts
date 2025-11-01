import { IsOptional, IsDateString, ValidateIf } from 'class-validator';

export class UploadDocumentDto {
  @IsDateString(
    {},
    { message: 'autoDeleteDate must be a valid ISO date-time string' },
  )
  @IsOptional()
  @ValidateIf(
    (o: UploadDocumentDto) =>
      o.autoDeleteDate !== null && o.autoDeleteDate !== undefined,
  )
  autoDeleteDate?: string; // Example: "2025-12-31T23:59:59Z"
}
