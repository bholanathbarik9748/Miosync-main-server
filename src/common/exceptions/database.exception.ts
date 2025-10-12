import { DatabaseException, ValidationException } from './custom.exception';
import { ErrorCode } from './error-codes.enum';
import { QueryFailedError } from 'typeorm';

/**
 * Database related exceptions
 */
export class DatabaseExceptionHandler {
  /**
   * Handle TypeORM QueryFailedError and convert to appropriate custom exception
   */
  static handleQueryFailedError(error: QueryFailedError): DatabaseException {
    const errorCode = (error as any).code;
    const message = error.message;
    const detail = (error as any).detail;

    // Handle specific database constraint violations
    if (errorCode === '23505') { // Unique constraint violation
      return new DatabaseException(
        'Unique constraint violation',
        ErrorCode.DATABASE_CONSTRAINT_ERROR,
        'DATABASE',
        {
          code: errorCode,
          detail,
          constraint: this.extractConstraintName(detail),
        }
      );
    }

    if (errorCode === '23503') { // Foreign key constraint violation
      return new DatabaseException(
        'Foreign key constraint violation',
        ErrorCode.DATABASE_CONSTRAINT_ERROR,
        'DATABASE',
        {
          code: errorCode,
          detail,
          constraint: this.extractConstraintName(detail),
        }
      );
    }

    if (errorCode === '23502') { // Not null constraint violation
      return new DatabaseException(
        'Not null constraint violation',
        ErrorCode.DATABASE_CONSTRAINT_ERROR,
        'DATABASE',
        {
          code: errorCode,
          detail,
          constraint: this.extractConstraintName(detail),
        }
      );
    }

    if (errorCode === '23514') { // Check constraint violation
      return new DatabaseException(
        'Check constraint violation',
        ErrorCode.DATABASE_CONSTRAINT_ERROR,
        'DATABASE',
        {
          code: errorCode,
          detail,
          constraint: this.extractConstraintName(detail),
        }
      );
    }

    // Generic database error
    return new DatabaseException(
      'Database query failed',
      ErrorCode.DATABASE_QUERY_ERROR,
      'DATABASE',
      {
        code: errorCode,
        message,
        detail,
      }
    );
  }

  /**
   * Extract constraint name from error detail
   */
  private static extractConstraintName(detail: string): string | null {
    if (!detail) return null;
    
    const match = detail.match(/Key \(([^)]+)\)/);
    return match ? match[1] : null;
  }
}

/**
 * Database connection exception
 */
export class DatabaseConnectionException extends DatabaseException {
  constructor(message: string, details?: any) {
    super(
      message,
      ErrorCode.DATABASE_CONNECTION_ERROR,
      'DATABASE',
      details
    );
  }
}

/**
 * Database transaction exception
 */
export class DatabaseTransactionException extends DatabaseException {
  constructor(message: string, details?: any) {
    super(
      message,
      ErrorCode.DATABASE_TRANSACTION_ERROR,
      'DATABASE',
      details
    );
  }
}

/**
 * Database constraint exception
 */
export class DatabaseConstraintException extends DatabaseException {
  constructor(constraintName: string, details?: any) {
    super(
      `Database constraint violation: ${constraintName}`,
      ErrorCode.DATABASE_CONSTRAINT_ERROR,
      'DATABASE',
      { constraintName, ...details }
    );
  }
}

/**
 * Database query exception
 */
export class DatabaseQueryException extends DatabaseException {
  constructor(query: string, details?: any) {
    super(
      'Database query failed',
      ErrorCode.DATABASE_QUERY_ERROR,
      'DATABASE',
      { query, ...details }
    );
  }
}

/**
 * Validation exception for database operations
 */
export class DatabaseValidationException extends ValidationException {
  constructor(field: string, value: any, reason: string) {
    super(
      `Database validation failed for field '${field}': ${reason}`,
      ErrorCode.VALIDATION_ERROR,
      'DATABASE',
      { field, value, reason }
    );
  }
}
