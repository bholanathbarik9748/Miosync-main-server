import { Logger } from '@nestjs/common';

interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class EnvValidator {
  private static readonly logger = new Logger('EnvValidator');

  /**
   * Validate required environment variables on application startup
   */
  static validateEnvironment(): EnvValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // WhatsApp Configuration (Critical)
    const waToken = process.env.WA_TOKEN;
    const waPhoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!waToken || waToken.trim() === '') {
      errors.push(
        'WA_TOKEN is not set. WhatsApp messaging will not work. ' +
          'Get token from: https://business.facebook.com/settings/system-users',
      );
    } else if (waToken.length < 50) {
      warnings.push(
        'WA_TOKEN seems too short. Expected a long access token (200+ characters). ' +
          'Are you sure this is a valid System User Token?',
      );
    }

    if (!waPhoneNumberId || waPhoneNumberId.trim() === '') {
      errors.push(
        'WA_PHONE_NUMBER_ID is not set. WhatsApp messaging will not work. ' +
          'Get it from: https://developers.facebook.com/apps → WhatsApp → API Setup',
      );
    }

    // WhatsApp Configuration (Optional but recommended)
    if (!process.env.WA_BUSINESS_ACCOUNT_ID) {
      warnings.push(
        'WA_BUSINESS_ACCOUNT_ID is not set. Template management features may not work.',
      );
    }

    if (!process.env.WA_WEBHOOK_VERIFY_TOKEN) {
      warnings.push(
        'WA_WEBHOOK_VERIFY_TOKEN is not set. Using default value. ' +
          'Consider setting a secure custom token.',
      );
    }

    // Database Configuration
    if (!process.env.DATABASE_HOST) {
      errors.push('DATABASE_HOST is not set');
    }

    if (!process.env.DATABASE_PORT) {
      warnings.push('DATABASE_PORT is not set. Using default: 5432');
    }

    if (!process.env.DATABASE_NAME) {
      errors.push('DATABASE_NAME is not set');
    }

    if (!process.env.DATABASE_USER) {
      errors.push('DATABASE_USER is not set');
    }

    if (!process.env.DATABASE_PASSWORD) {
      errors.push('DATABASE_PASSWORD is not set');
    }

    // JWT Configuration
    if (!process.env.JWT_SECRET) {
      errors.push(
        'JWT_SECRET is not set. Authentication will not work properly.',
      );
    } else if (process.env.JWT_SECRET.length < 32) {
      warnings.push(
        'JWT_SECRET is too short. Use at least 32 characters for security.',
      );
    }

    // Cloudinary Configuration (for document uploads)
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      warnings.push(
        'CLOUDINARY_CLOUD_NAME is not set. Document upload features may not work.',
      );
    }

    if (!process.env.CLOUDINARY_API_KEY) {
      warnings.push(
        'CLOUDINARY_API_KEY is not set. Document upload features may not work.',
      );
    }

    if (!process.env.CLOUDINARY_API_SECRET) {
      warnings.push(
        'CLOUDINARY_API_SECRET is not set. Document upload features may not work.',
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Log validation results and exit if critical errors found
   */
  static validateAndLog(): void {
    this.logger.log('🔍 Validating environment configuration...');

    const result = this.validateEnvironment();

    // Log warnings
    if (result.warnings.length > 0) {
      this.logger.warn('⚠️  Environment Warnings:');
      result.warnings.forEach((warning, index) => {
        this.logger.warn(`   ${index + 1}. ${warning}`);
      });
    }

    // Log errors
    if (result.errors.length > 0) {
      this.logger.error('❌ Environment Configuration Errors:');
      result.errors.forEach((error, index) => {
        this.logger.error(`   ${index + 1}. ${error}`);
      });

      this.logger.error(
        '\n' +
          '═'.repeat(60) +
          '\n' +
          '🚨 CRITICAL: Application cannot start due to missing configuration!\n' +
          '═'.repeat(60) +
          '\n' +
          'Please check your .env file and set all required variables.\n' +
          'See README.md or WHATSAPP_FIX_SUMMARY.md for setup instructions.\n' +
          '═'.repeat(60),
      );

      // Exit process with error code
      process.exit(1);
    }

    // Success message
    if (result.warnings.length === 0) {
      this.logger.log('✅ All environment variables are properly configured!');
    } else {
      this.logger.log(
        '✅ Required environment variables are set (with warnings)',
      );
    }
  }

  /**
   * Get WhatsApp configuration summary (for diagnostics)
   */
  static getWhatsAppConfigSummary(): {
    hasToken: boolean;
    tokenLength: number;
    hasPhoneId: boolean;
    hasBusinessAccountId: boolean;
    apiVersion: string;
    apiBase: string;
  } {
    const token = process.env.WA_TOKEN || '';

    return {
      hasToken: token.length > 0,
      tokenLength: token.length,
      hasPhoneId: (process.env.WA_PHONE_NUMBER_ID || '').length > 0,
      hasBusinessAccountId:
        (process.env.WA_BUSINESS_ACCOUNT_ID || '').length > 0,
      apiVersion: process.env.WA_API_VERSION || 'v22.0',
      apiBase:
        process.env.WA_API_BASE || 'https://graph.facebook.com',
    };
  }
}

