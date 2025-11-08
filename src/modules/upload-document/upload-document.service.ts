import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(UploadDocumentService.name);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            null, // autoDeleteDate
          ],
        );

      if (response.length === 0) {
        // If database save fails, delete from Cloudinary
        try {
          await this.cloudinary.uploader.destroy(uploadResult.public_id);
        } catch (destroyError) {
          // Log error but don't fail the request
          const errorMessage =
            destroyError instanceof Error
              ? destroyError.message
              : 'Unknown error';
          this.logger.error(
            `Failed to delete from Cloudinary during upload rollback: ${errorMessage}`,
            destroyError instanceof Error ? destroyError.stack : undefined,
          );
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
      this.logger.error(
        'Cloudinary is not properly configured for auto-deletion',
      );
      return;
    }

    try {
      const currentTime = new Date();
      this.logger.log(
        `Checking for expired documents. Current server time: ${currentTime.toISOString()}`,
      );

      // Debug: Check all documents with autoDeleteDate
      const allDocsWithDate: any[] = await this.uploadDocumentRepository.query(
        `SELECT id, "autoDeleteDate", "isActive", NOW() as "currentTime",
                  EXTRACT(EPOCH FROM ("autoDeleteDate" - NOW())) as "secondsUntilExpiry"
           FROM "upload_documents" 
           WHERE "autoDeleteDate" IS NOT NULL`,
      );

      this.logger.log(
        `Found ${allDocsWithDate.length} document(s) with autoDeleteDate set`,
      );

      if (allDocsWithDate.length > 0) {
        for (const doc of allDocsWithDate) {
          const secondsUntilExpiry = parseFloat(doc.secondsUntilExpiry || 0);
          const isExpired = secondsUntilExpiry <= 0;
          this.logger.log(
            `Document ID: ${doc.id}, autoDeleteDate: ${doc.autoDeleteDate}, isActive: ${doc.isActive}, ` +
              `Current DB Time: ${doc.currentTime}, Seconds until expiry: ${secondsUntilExpiry}, Is Expired: ${isExpired}`,
          );
        }
      }

      // Find all documents that should be deleted (autoDeleteDate <= now and isActive = true)
      // Using explicit timezone-aware comparison
      const expiredDocuments: UploadDocumentInterface[] =
        await this.uploadDocumentRepository.query(
          `SELECT * FROM "upload_documents" 
           WHERE "autoDeleteDate" IS NOT NULL 
           AND "autoDeleteDate" <= CURRENT_TIMESTAMP
           AND "isActive" = true`,
        );

      this.logger.log(
        `Query found ${expiredDocuments.length} expired document(s) to delete`,
      );

      if (expiredDocuments.length === 0) {
        this.logger.log('No expired documents found to delete');
        return;
      }

      // Delete each expired document from Cloudinary and update database
      for (const document of expiredDocuments) {
        try {
          this.logger.log(
            `Processing deletion for document ID: ${document.id}, File: ${document.originalFileName}, PublicId: ${document.cloudinaryPublicId}`,
          );

          // Delete from Cloudinary first
          this.logger.log(
            `Calling Cloudinary destroy API for publicId: ${document.cloudinaryPublicId}`,
          );
          const destroyResult = await this.cloudinary.uploader.destroy(
            document.cloudinaryPublicId,
          );

          this.logger.log(
            `Cloudinary destroy API completed. Result: ${JSON.stringify(destroyResult)}`,
          );

          // Verify Cloudinary deletion was successful
          if (
            destroyResult.result === 'ok' ||
            destroyResult.result === 'not found'
          ) {
            this.logger.log(
              `Cloudinary deletion confirmed. Result: ${destroyResult.result}`,
            );
          } else {
            this.logger.warn(
              `Cloudinary deletion returned unexpected result: ${JSON.stringify(destroyResult)}`,
            );
          }

          // Update database (soft delete) - use parameterized query
          const updateResult = await this.uploadDocumentRepository.query(
            `UPDATE "upload_documents" 
             SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP 
             WHERE "id" = $1 
             RETURNING id, "isActive"`,
            [document.id],
          );

          if (updateResult.length > 0) {
            this.logger.log(
              `Database updated successfully. Document ${document.id} marked as inactive. Update result: ${JSON.stringify(updateResult[0])}`,
            );
          } else {
            this.logger.error(
              `Failed to update database - no rows affected for document ${document.id}`,
            );
          }

          this.logger.log(
            `✓ Successfully deleted document ${document.id} (${document.originalFileName}) from Cloudinary and database`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to delete document ${document.id} from Cloudinary: ${errorMessage}`,
            error instanceof Error ? error.stack : undefined,
          );

          // Still mark as inactive even if Cloudinary deletion fails
          try {
            await this.uploadDocumentRepository.query(
              `UPDATE "upload_documents" 
               SET "isActive" = false, "updatedAt" = NOW() 
               WHERE "id" = $1`,
              [document.id],
            );
            this.logger.log(
              `Marked document ${document.id} as inactive despite Cloudinary deletion failure`,
            );
          } catch (dbError) {
            this.logger.error(
              `Failed to update database for document ${document.id}: ${dbError}`,
            );
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error in deleteExpiredDocuments: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
