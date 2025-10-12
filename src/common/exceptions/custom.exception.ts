import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception class for all custom exceptions
 * Provides consistent error structure and logging capabilities
 */
export abstract class BaseException extends HttpException {
  public readonly errorCode: string;
  public readonly context?: string;
  public readonly details?: unknown;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: HttpStatus,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(
      {
        message,
        errorCode,
        context,
        details,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );

    this.errorCode = errorCode;
    this.context = context;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get the error response object
   */
  getErrorResponse() {
    return {
      message: this.message,
      errorCode: this.errorCode,
      context: this.context,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Business logic exception for domain-specific errors
 */
export class BusinessException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.BAD_REQUEST, errorCode, context, details);
  }
}

/**
 * Validation exception for input validation errors
 */
export class ValidationException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.BAD_REQUEST, errorCode, context, details);
  }
}

/**
 * Not found exception for resource not found errors
 */
export class NotFoundException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.NOT_FOUND, errorCode, context, details);
  }
}

/**
 * Unauthorized exception for authentication errors
 */
export class UnauthorizedException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.UNAUTHORIZED, errorCode, context, details);
  }
}

/**
 * Forbidden exception for authorization errors
 */
export class ForbiddenException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.FORBIDDEN, errorCode, context, details);
  }
}

/**
 * Conflict exception for resource conflicts
 */
export class ConflictException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.CONFLICT, errorCode, context, details);
  }
}

/**
 * Database exception for database-related errors
 */
export class DatabaseException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode,
      context,
      details,
    );
  }
}

/**
 * External service exception for third-party service errors
 */
export class ExternalServiceException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.BAD_GATEWAY, errorCode, context, details);
  }
}

/**
 * Rate limit exception for rate limiting errors
 */
export class RateLimitException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    context?: string,
    details?: unknown,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, errorCode, context, details);
  }
}
