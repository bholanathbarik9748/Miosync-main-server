import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { UploadDocumentService } from './upload-document.service';

@Injectable()
export class UploadDocumentScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadDocumentScheduler.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 1 day interval

  constructor(private readonly uploadDocumentService: UploadDocumentService) {}

  async onModuleInit() {
    // Start checking for expired documents immediately
    await this.handleExpiredDocuments().catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error during initial expired documents check: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    // Set up interval to check every hour
    this.intervalId = setInterval(() => {
      // Wrap async call to handle errors properly
      void this.handleExpiredDocuments().catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Error checking for expired documents: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    }, this.CHECK_INTERVAL);

    this.logger.log(
      `Auto-deletion scheduler started. Will check for expired documents every ${this.CHECK_INTERVAL / 1000 / 60} minute(s).`,
    );
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Auto-deletion scheduler stopped.');
    }
  }

  async handleExpiredDocuments() {
    try {
      this.logger.log('Checking for expired documents to delete...');
      await this.uploadDocumentService.deleteExpiredDocuments();
      this.logger.log('Completed checking for expired documents.');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to handle expired documents: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw to let the caller handle it if needed
      throw error;
    }
  }
}
