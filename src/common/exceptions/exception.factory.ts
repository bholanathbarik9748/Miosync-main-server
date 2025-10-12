import { 
  BusinessException, 
  NotFoundException, 
  ConflictException, 
  ValidationException,
  UnauthorizedException,
  ForbiddenException,
  DatabaseException 
} from './custom.exception';
import { ErrorCode } from './error-codes.enum';

/**
 * Exception factory for creating standardized exceptions
 * Provides a centralized way to create exceptions with consistent formatting
 */
export class ExceptionFactory {
  /**
   * Create a business logic exception
   */
  static business(
    errorCode: ErrorCode,
    message: string,
    context?: string,
    details?: any
  ): BusinessException {
    return new BusinessException(message, errorCode, context, details);
  }

  /**
   * Create a not found exception
   */
  static notFound(
    resource: string,
    identifier?: string | number,
    context?: string,
    details?: any
  ): NotFoundException {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    return new NotFoundException(message, ErrorCode.NOT_FOUND, context, {
      resource,
      identifier,
      ...details
    });
  }

  /**
   * Create a conflict exception
   */
  static conflict(
    message: string,
    context?: string,
    details?: any
  ): ConflictException {
    return new ConflictException(message, ErrorCode.CONFLICT, context, details);
  }

  /**
   * Create a validation exception
   */
  static validation(
    field: string,
    value: any,
    reason: string,
    context?: string
  ): ValidationException {
    const message = `Validation failed for field '${field}': ${reason}`;
    return new ValidationException(
      message, 
      ErrorCode.VALIDATION_ERROR, 
      context,
      { field, value, reason }
    );
  }

  /**
   * Create an unauthorized exception
   */
  static unauthorized(
    message: string = 'Unauthorized access',
    context?: string,
    details?: any
  ): UnauthorizedException {
    return new UnauthorizedException(message, ErrorCode.UNAUTHORIZED, context, details);
  }

  /**
   * Create a forbidden exception
   */
  static forbidden(
    message: string = 'Access forbidden',
    context?: string,
    details?: any
  ): ForbiddenException {
    return new ForbiddenException(message, ErrorCode.FORBIDDEN, context, details);
  }

  /**
   * Create a database exception
   */
  static database(
    message: string,
    context?: string,
    details?: any
  ): DatabaseException {
    return new DatabaseException(message, ErrorCode.DATABASE_QUERY_ERROR, context, details);
  }

  /**
   * Create a user not found exception
   */
  static userNotFound(userId?: string): NotFoundException {
    return this.notFound('User', userId, 'USER');
  }

  /**
   * Create an event not found exception
   */
  static eventNotFound(eventId?: string): NotFoundException {
    return this.notFound('Event', eventId, 'EVENT');
  }

  /**
   * Create a participant not found exception
   */
  static participantNotFound(participantId?: string): NotFoundException {
    return this.notFound('Participant', participantId, 'PARTICIPANT');
  }

  /**
   * Create a ticket not found exception
   */
  static ticketNotFound(ticketId?: string): NotFoundException {
    return this.notFound('Ticket', ticketId, 'HELP_DESK');
  }

  /**
   * Create an email already exists exception
   */
  static emailAlreadyExists(email: string): ConflictException {
    return this.conflict(
      `User with email '${email}' already exists`,
      'USER',
      { email }
    );
  }

  /**
   * Create a phone already exists exception
   */
  static phoneAlreadyExists(phoneNumber: string): ConflictException {
    return this.conflict(
      `User with phone number '${phoneNumber}' already exists`,
      'USER',
      { phoneNumber }
    );
  }

  /**
   * Create an invalid credentials exception
   */
  static invalidCredentials(): UnauthorizedException {
    return this.unauthorized('Invalid email or password', 'AUTH');
  }

  /**
   * Create a token expired exception
   */
  static tokenExpired(): UnauthorizedException {
    return this.unauthorized('Token has expired', 'AUTH');
  }

  /**
   * Create a token invalid exception
   */
  static tokenInvalid(): UnauthorizedException {
    return this.unauthorized('Invalid token provided', 'AUTH');
  }

  /**
   * Create a token missing exception
   */
  static tokenMissing(): UnauthorizedException {
    return this.unauthorized('Authentication token is required', 'AUTH');
  }

  /**
   * Create an account locked exception
   */
  static accountLocked(): UnauthorizedException {
    return this.unauthorized(
      'Account is locked due to multiple failed login attempts',
      'AUTH'
    );
  }

  /**
   * Create an account disabled exception
   */
  static accountDisabled(): UnauthorizedException {
    return this.unauthorized('Account is disabled', 'AUTH');
  }

  /**
   * Create an email not verified exception
   */
  static emailNotVerified(): UnauthorizedException {
    return this.unauthorized('Email address is not verified', 'AUTH');
  }

  /**
   * Create an event registration closed exception
   */
  static eventRegistrationClosed(): BusinessException {
    return this.business(
      ErrorCode.EVENT_REGISTRATION_CLOSED,
      'Event registration is closed',
      'EVENT'
    );
  }

  /**
   * Create an event capacity exceeded exception
   */
  static eventCapacityExceeded(maxCapacity: number): BusinessException {
    return this.business(
      ErrorCode.EVENT_CAPACITY_EXCEEDED,
      `Event capacity exceeded. Maximum capacity: ${maxCapacity}`,
      'EVENT',
      { maxCapacity }
    );
  }

  /**
   * Create a participant already registered exception
   */
  static participantAlreadyRegistered(): ConflictException {
    return this.conflict(
      'User is already registered for this event',
      'PARTICIPANT'
    );
  }

  /**
   * Create a ticket cannot modify closed exception
   */
  static ticketCannotModifyClosed(): BusinessException {
    return this.business(
      ErrorCode.TICKET_CANNOT_MODIFY_CLOSED,
      'Cannot modify closed tickets',
      'HELP_DESK'
    );
  }

  /**
   * Create a validation exception for required fields
   */
  static requiredField(field: string): ValidationException {
    return this.validation(field, undefined, 'Field is required');
  }

  /**
   * Create a validation exception for invalid format
   */
  static invalidFormat(field: string, format: string): ValidationException {
    return this.validation(field, undefined, `Invalid format. Expected: ${format}`);
  }

  /**
   * Create a validation exception for invalid length
   */
  static invalidLength(field: string, min?: number, max?: number): ValidationException {
    let reason = 'Invalid length';
    if (min !== undefined && max !== undefined) {
      reason = `Length must be between ${min} and ${max} characters`;
    } else if (min !== undefined) {
      reason = `Length must be at least ${min} characters`;
    } else if (max !== undefined) {
      reason = `Length must be at most ${max} characters`;
    }
    
    return this.validation(field, undefined, reason, undefined);
  }

  /**
   * Create a validation exception for invalid email
   */
  static invalidEmail(email: string): ValidationException {
    return this.validation('email', email, 'Invalid email format');
  }

  /**
   * Create a validation exception for invalid phone number
   */
  static invalidPhoneNumber(phoneNumber: string): ValidationException {
    return this.validation('phoneNumber', phoneNumber, 'Invalid phone number format');
  }

  /**
   * Create a validation exception for invalid date
   */
  static invalidDate(field: string, date: string): ValidationException {
    return this.validation(field, date, 'Invalid date format');
  }

  /**
   * Create a validation exception for future date required
   */
  static futureDateRequired(field: string, date: string): ValidationException {
    return this.validation(field, date, 'Date must be in the future');
  }

  /**
   * Create a validation exception for past date required
   */
  static pastDateRequired(field: string, date: string): ValidationException {
    return this.validation(field, date, 'Date must be in the past');
  }
}
