import { 
  BusinessException, 
  NotFoundException, 
  ConflictException, 
  UnauthorizedException,
  ValidationException 
} from './custom.exception';
import { ErrorCode } from './error-codes.enum';

/**
 * Authentication related exceptions
 */
export class AuthException extends BusinessException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(message, errorCode, 'AUTH', details);
  }
}

export class InvalidCredentialsException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
  }
}

export class TokenExpiredException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token has expired');
  }
}

export class TokenInvalidException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_TOKEN_INVALID, 'Invalid token provided');
  }
}

export class TokenMissingException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_TOKEN_MISSING, 'Authentication token is required');
  }
}

export class AccountLockedException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_ACCOUNT_LOCKED, 'Account is locked due to multiple failed login attempts');
  }
}

export class AccountDisabledException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_ACCOUNT_DISABLED, 'Account is disabled');
  }
}

export class EmailNotVerifiedException extends AuthException {
  constructor() {
    super(ErrorCode.AUTH_EMAIL_NOT_VERIFIED, 'Email address is not verified');
  }
}

/**
 * User related exceptions
 */
export class UserException extends BusinessException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(message, errorCode, 'USER', details);
  }
}

export class UserNotFoundException extends NotFoundException {
  constructor(userId?: string) {
    super(
      `User ${userId ? `with ID ${userId}` : ''} not found`,
      ErrorCode.USER_NOT_FOUND,
      'USER',
      { userId }
    );
  }
}

export class UserAlreadyExistsException extends ConflictException {
  constructor(email?: string) {
    super(
      `User ${email ? `with email ${email}` : ''} already exists`,
      ErrorCode.USER_ALREADY_EXISTS,
      'USER',
      { email }
    );
  }
}

export class UserEmailAlreadyExistsException extends ConflictException {
  constructor(email: string) {
    super(
      `User with email ${email} already exists`,
      ErrorCode.USER_EMAIL_ALREADY_EXISTS,
      'USER',
      { email }
    );
  }
}

export class UserPhoneAlreadyExistsException extends ConflictException {
  constructor(phoneNumber: string) {
    super(
      `User with phone number ${phoneNumber} already exists`,
      ErrorCode.USER_PHONE_ALREADY_EXISTS,
      'USER',
      { phoneNumber }
    );
  }
}

export class UserInvalidTypeException extends ValidationException {
  constructor(userType: string) {
    super(
      `Invalid user type: ${userType}`,
      ErrorCode.USER_INVALID_TYPE,
      'USER',
      { userType }
    );
  }
}

export class UserInactiveException extends AuthException {
  constructor() {
    super(ErrorCode.USER_INACTIVE, 'User account is inactive');
  }
}

/**
 * Event related exceptions
 */
export class EventException extends BusinessException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(message, errorCode, 'EVENT', details);
  }
}

export class EventNotFoundException extends NotFoundException {
  constructor(eventId?: string) {
    super(
      `Event ${eventId ? `with ID ${eventId}` : ''} not found`,
      ErrorCode.EVENT_NOT_FOUND,
      'EVENT',
      { eventId }
    );
  }
}

export class EventAlreadyExistsException extends ConflictException {
  constructor(eventName?: string) {
    super(
      `Event ${eventName ? `with name ${eventName}` : ''} already exists`,
      ErrorCode.EVENT_ALREADY_EXISTS,
      'EVENT',
      { eventName }
    );
  }
}

export class EventInvalidDateException extends ValidationException {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.EVENT_INVALID_DATE, 'EVENT', details);
  }
}

export class EventRegistrationClosedException extends BusinessException {
  constructor() {
    super(
      'Event registration is closed',
      ErrorCode.EVENT_REGISTRATION_CLOSED,
      'EVENT'
    );
  }
}

export class EventRegistrationNotOpenException extends BusinessException {
  constructor() {
    super(
      'Event registration is not yet open',
      ErrorCode.EVENT_REGISTRATION_NOT_OPEN,
      'EVENT'
    );
  }
}

export class EventCapacityExceededException extends BusinessException {
  constructor(maxCapacity: number) {
    super(
      `Event capacity exceeded. Maximum capacity: ${maxCapacity}`,
      ErrorCode.EVENT_CAPACITY_EXCEEDED,
      'EVENT',
      { maxCapacity }
    );
  }
}

export class EventCannotDeleteWithParticipantsException extends BusinessException {
  constructor(participantCount: number) {
    super(
      `Cannot delete event with ${participantCount} participants`,
      ErrorCode.EVENT_CANNOT_DELETE_WITH_PARTICIPANTS,
      'EVENT',
      { participantCount }
    );
  }
}

export class EventCannotModifyPastEventException extends BusinessException {
  constructor() {
    super(
      'Cannot modify past events',
      ErrorCode.EVENT_CANNOT_MODIFY_PAST_EVENT,
      'EVENT'
    );
  }
}

/**
 * Event Participant related exceptions
 */
export class ParticipantException extends BusinessException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(message, errorCode, 'PARTICIPANT', details);
  }
}

export class ParticipantNotFoundException extends NotFoundException {
  constructor(participantId?: string) {
    super(
      `Participant ${participantId ? `with ID ${participantId}` : ''} not found`,
      ErrorCode.PARTICIPANT_NOT_FOUND,
      'PARTICIPANT',
      { participantId }
    );
  }
}

export class ParticipantAlreadyExistsException extends ConflictException {
  constructor(userId: string, eventId: string) {
    super(
      `User ${userId} is already registered for event ${eventId}`,
      ErrorCode.PARTICIPANT_ALREADY_EXISTS,
      'PARTICIPANT',
      { userId, eventId }
    );
  }
}

export class ParticipantAlreadyRegisteredException extends ConflictException {
  constructor() {
    super(
      'User is already registered for this event',
      ErrorCode.PARTICIPANT_ALREADY_REGISTERED,
      'PARTICIPANT'
    );
  }
}

export class ParticipantRegistrationClosedException extends BusinessException {
  constructor() {
    super(
      'Event registration is closed',
      ErrorCode.PARTICIPANT_REGISTRATION_CLOSED,
      'PARTICIPANT'
    );
  }
}

export class ParticipantInvalidStatusException extends ValidationException {
  constructor(status: string) {
    super(
      `Invalid participant status: ${status}`,
      ErrorCode.PARTICIPANT_INVALID_STATUS,
      'PARTICIPANT',
      { status }
    );
  }
}

export class ParticipantCannotModifyApprovedException extends BusinessException {
  constructor() {
    super(
      'Cannot modify approved participant registration',
      ErrorCode.PARTICIPANT_CANNOT_MODIFY_APPROVED,
      'PARTICIPANT'
    );
  }
}

/**
 * Help Desk related exceptions
 */
export class HelpDeskException extends BusinessException {
  constructor(errorCode: ErrorCode, message: string, details?: any) {
    super(message, errorCode, 'HELP_DESK', details);
  }
}

export class TicketNotFoundException extends NotFoundException {
  constructor(ticketId?: string) {
    super(
      `Ticket ${ticketId ? `with ID ${ticketId}` : ''} not found`,
      ErrorCode.TICKET_NOT_FOUND,
      'HELP_DESK',
      { ticketId }
    );
  }
}

export class TicketAlreadyExistsException extends ConflictException {
  constructor(ticketNumber?: string) {
    super(
      `Ticket ${ticketNumber ? `with number ${ticketNumber}` : ''} already exists`,
      ErrorCode.TICKET_ALREADY_EXISTS,
      'HELP_DESK',
      { ticketNumber }
    );
  }
}

export class TicketInvalidStatusException extends ValidationException {
  constructor(status: string) {
    super(
      `Invalid ticket status: ${status}`,
      ErrorCode.TICKET_INVALID_STATUS,
      'HELP_DESK',
      { status }
    );
  }
}

export class TicketCannotModifyClosedException extends BusinessException {
  constructor() {
    super(
      'Cannot modify closed tickets',
      ErrorCode.TICKET_CANNOT_MODIFY_CLOSED,
      'HELP_DESK'
    );
  }
}

export class TicketInvalidPriorityException extends ValidationException {
  constructor(priority: string) {
    super(
      `Invalid ticket priority: ${priority}`,
      ErrorCode.TICKET_INVALID_PRIORITY,
      'HELP_DESK',
      { priority }
    );
  }
}

export class TicketAssignmentFailedException extends BusinessException {
  constructor(assigneeId: string) {
    super(
      `Failed to assign ticket to user ${assigneeId}`,
      ErrorCode.TICKET_ASSIGNMENT_FAILED,
      'HELP_DESK',
      { assigneeId }
    );
  }
}
