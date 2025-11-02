import { IsOptional, Matches, ValidateIf } from 'class-validator';

export class UploadDocumentDto {
  @Matches(/^\d{2}-\d{2}-\d{2}$/, {
    message: 'autoDeleteDate must be in DD-MM-YY format (e.g., 31-12-25)',
  })
  @IsOptional()
  @ValidateIf(
    (o: UploadDocumentDto) =>
      o.autoDeleteDate !== null && o.autoDeleteDate !== undefined,
  )
  autoDeleteDate?: string; // Example: "31-12-25"
}
