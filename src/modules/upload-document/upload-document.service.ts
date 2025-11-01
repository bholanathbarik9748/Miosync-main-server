import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UploadDocument } from './upload-document.entity';
import { Readable } from 'stream';

export interface UploadDocumentInterface {
  id: string;
  fileName: string;
  originalFileName: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  mimeType: string;
  fileSize: number;
  description: string | null;
  uploadedBy: string | null;
  isActive: boolean;
  autoDeleteDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  url: string;
}

interface CloudinaryUploader {
  upload_stream: (
    options: { resource_type: string; folder: string },
    callback: (
      error: Error | null,
      result: CloudinaryUploadResult | undefined,
    ) => void,
  ) => NodeJS.WritableStream;
  destroy: (publicId: string) => Promise<any>;
}

interface Cloudinary {
  config: (config: {
    cloud_name: string | undefined;
    api_key: string | undefined;
    api_secret: string | undefined;
  }) => void;
  uploader: CloudinaryUploader;
}

@Injectable()
export class UploadDocumentService {
  private cloudinary: Cloudinary | null = null;
  private cloudinaryInitialized = false;

  constructor(
    @InjectRepository(UploadDocument)
    private uploadDocumentRepository: Repository<UploadDocument>,
    private configService: ConfigService,
  ) {
    void this.initializeCloudinary();
  }

  private async initializeCloudinary(): Promise<void> {
    if (this.cloudinaryInitialized) {
      return;
    }

    try {
      // Dynamic import to handle case where cloudinary might not be installed
      // Cloudinary package needs to be installed: npm install cloudinary
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const cloudinaryModule = await import('cloudinary').catch(() => {
        throw new Error(
          'Cloudinary package not found. Please install it: npm install cloudinary',
        );
      });

      // Type assertion needed - Cloudinary types will be available after package installation
      this.cloudinary = (cloudinaryModule as unknown as { v2: Cloudinary }).v2;

      if (this.cloudinary) {
        this.cloudinary.config({
          cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
          api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
          api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
        });

        this.cloudinaryInitialized = true;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to initialize Cloudinary: ${errorMessage}. Please install it: npm install cloudinary`,
      );
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    autoDeleteDate?: string,
  ): Promise<UploadDocumentInterface> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!this.cloudinary || !this.cloudinaryInitialized) {
      await this.initializeCloudinary();
    }

    if (!this.cloudinary) {
      throw new BadRequestException('Cloudinary is not properly configured');
    }

    try {
      // Convert buffer to stream for Cloudinary
      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);

      // Upload to Cloudinary
      const uploadResult = await new Promise<CloudinaryUploadResult>(
        (resolve, reject) => {
          const uploadStream = this.cloudinary!.uploader.upload_stream(
            {
              resource_type: 'auto',
              folder: 'documents',
            },
            (
              error: Error | null,
              result: CloudinaryUploadResult | undefined,
            ) => {
              if (error) {
                reject(new Error(error.message));
              } else if (!result) {
                reject(new Error('Upload failed: No result returned'));
              } else {
                resolve(result);
              }
            },
          );
          stream.pipe(uploadStream);
        },
      );

      // Validate autoDeleteDate if provided
      let deleteDate: Date | null = null;
      if (autoDeleteDate) {
        deleteDate = new Date(autoDeleteDate);
        if (isNaN(deleteDate.getTime())) {
          throw new BadRequestException(
            'Invalid autoDeleteDate format. Please use ISO date-time format (e.g., 2025-12-31T23:59:59Z)',
          );
        }
        // Ensure delete date is in the future
        if (deleteDate <= new Date()) {
          throw new BadRequestException('autoDeleteDate must be a future date');
        }
      }

      // Save metadata to database
      const response: UploadDocumentInterface[] =
        await this.uploadDocumentRepository.query(
          `INSERT INTO "upload_documents" ("fileName", "originalFileName", "cloudinaryUrl", "cloudinaryPublicId", "mimeType", "fileSize", "description", "uploadedBy", "isActive", "autoDeleteDate", "createdAt", "updatedAt") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) 
           RETURNING *`,
          [
            uploadResult.public_id,
            file.originalname,
            uploadResult.secure_url,
            uploadResult.public_id,
            file.mimetype,
            file.size,
            null, // description
            null, // uploadedBy
            true,
            deleteDate,
          ],
        );

      if (response.length === 0) {
        // If database save fails, delete from Cloudinary
        try {
          await this.cloudinary.uploader.destroy(uploadResult.public_id);
        } catch (destroyError) {
          // Log error but don't fail the request
          console.error('Failed to delete from Cloudinary:', destroyError);
        }
        throw new BadRequestException('Failed to save document metadata');
      }

      return response[0];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to upload file: ${errorMessage}`);
    }
  }

  async deleteExpiredDocuments(): Promise<void> {
    if (!this.cloudinary || !this.cloudinaryInitialized) {
      await this.initializeCloudinary();
    }

    if (!this.cloudinary) {
      console.error('Cloudinary is not properly configured for auto-deletion');
      return;
    }

    try {
      // Find all documents that should be deleted (autoDeleteDate <= now and isActive = true)
      const expiredDocuments: UploadDocumentInterface[] =
        await this.uploadDocumentRepository.query(
          `SELECT * FROM "upload_documents" 
           WHERE "autoDeleteDate" IS NOT NULL 
           AND "autoDeleteDate" <= NOW() 
           AND "isActive" = true`,
        );

      if (expiredDocuments.length === 0) {
        return;
      }

      console.log(
        `Found ${expiredDocuments.length} expired document(s) to delete`,
      );

      // Delete each expired document from Cloudinary and update database
      for (const document of expiredDocuments) {
        try {
          // Delete from Cloudinary
          await this.cloudinary.uploader.destroy(document.cloudinaryPublicId);

          // Update database (soft delete)
          await this.uploadDocumentRepository.query(
            `UPDATE "upload_documents" 
             SET "isActive" = false, "updatedAt" = NOW() 
             WHERE "id" = $1`,
            [document.id],
          );

          console.log(
            `Successfully deleted document ${document.id} from Cloudinary`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error(
            `Failed to delete document ${document.id} from Cloudinary: ${errorMessage}`,
          );

          // Still mark as inactive even if Cloudinary deletion fails
          try {
            await this.uploadDocumentRepository.query(
              `UPDATE "upload_documents" 
               SET "isActive" = false, "updatedAt" = NOW() 
               WHERE "id" = $1`,
              [document.id],
            );
          } catch (dbError) {
            console.error(
              `Failed to update database for document ${document.id}: ${dbError}`,
            );
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error in deleteExpiredDocuments: ${errorMessage}`);
    }
  }
}
