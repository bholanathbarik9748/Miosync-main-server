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
  private readonly CHECK_INTERVAL = 60 * 60 * 1000;

  constructor(private readonly uploadDocumentService: UploadDocumentService) {}

  onModuleInit() {
    // Start checking for expired documents immediately
    this.handleExpiredDocuments();

    // Set up interval to check every hour
    this.intervalId = setInterval(() => {
      this.handleExpiredDocuments();
    }, this.CHECK_INTERVAL);

    this.logger.log(
      `Auto-deletion scheduler started. Will check for expired documents every ${this.CHECK_INTERVAL / 1000 / 60} minutes.`,
    );
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Auto-deletion scheduler stopped.');
    }
  }

  async handleExpiredDocuments() {
    this.logger.log('Checking for expired documents to delete...');
    await this.uploadDocumentService.deleteExpiredDocuments();
  }
}
