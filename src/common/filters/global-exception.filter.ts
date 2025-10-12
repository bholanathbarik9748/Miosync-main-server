import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException as NestNotFoundException,
  BadRequestException,
  UnauthorizedException as NestUnauthorizedException,
  ForbiddenException as NestForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ResponseStatus,
  ErrorResponse,
} from '../interfaces/api-response.interface';
import { QueryFailedError } from 'typeorm';
import { 
  BaseException, 
  DatabaseExceptionHandler,
  ErrorCode,
  ErrorCategory,
  getErrorCategory 
} from '../exceptions';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let errorDetails: any = null;
    let context: string | undefined;

    this.logger.error(
      `Exception occurred: ${exception.message}`,
      exception.stack,
    );

    // Handle custom BaseException instances first
    if (exception instanceof BaseException) {
      status = exception.getStatus();
      errorCode = exception.errorCode as ErrorCode;
      message = exception.message;
      context = exception.context;
      errorDetails = exception.details;
    }
    // Handle specific NestJS HTTP exceptions
    else if (exception instanceof NestNotFoundException) {
      status = HttpStatus.NOT_FOUND;
      errorCode = ErrorCode.NOT_FOUND;
      message = exception.message;
      errorDetails = {
        resource: (exception.getResponse() as any)?.error || 'Resource',
      };
    } else if (exception instanceof BadRequestException) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = ErrorCode.VALIDATION_ERROR;
      const response = exception.getResponse();
      message = exception.message;
      errorDetails =
        typeof response === 'object' ? (response as any)?.message : null;
    } else if (exception instanceof NestUnauthorizedException) {
      status = HttpStatus.UNAUTHORIZED;
      errorCode = ErrorCode.UNAUTHORIZED;
      message = exception.message;
    } else if (exception instanceof NestForbiddenException) {
      status = HttpStatus.FORBIDDEN;
      errorCode = ErrorCode.FORBIDDEN;
      message = exception.message;
    } else if (exception instanceof InternalServerErrorException) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
      message = 'An internal server error occurred';
      errorDetails =
        process.env.NODE_ENV === 'development' ? exception.message : null;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = (HttpStatus[status] as ErrorCode) || ErrorCode.INTERNAL_SERVER_ERROR;
      message = exception.message;
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'object' && responseBody !== null) {
        const errorResponse = responseBody as Record<string, unknown>;
        errorDetails = errorResponse.error || null;
      }
    }
    // Handle database errors
    else if (exception instanceof QueryFailedError) {
      const dbException = DatabaseExceptionHandler.handleQueryFailedError(exception);
      status = dbException.getStatus();
      errorCode = dbException.errorCode as ErrorCode;
      message = dbException.message;
      context = dbException.context;
      errorDetails = dbException.details;
    }
    // Handle other types of errors
    else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      errorDetails =
        process.env.NODE_ENV === 'development'
          ? {
              name: exception.name,
              message: exception.message,
            }
          : null;
    }

    const errorResponse: ErrorResponse = {
      status: ResponseStatus.ERROR,
      statusCode: status,
      message,
      error: {
        code: errorCode,
        context,
        details: errorDetails,
        category: getErrorCategory(errorCode),
        ...(process.env.NODE_ENV === 'development' && {
          stack: exception.stack,
        }),
      },
      timestamp: new Date().toISOString(),
      path: request.url as string,
    };

    // Log error details with enhanced information
    this.logger.error(`[${errorCode}] ${message}`, {
      statusCode: status,
      path: request.url,
      context,
      category: getErrorCategory(errorCode),
      error: errorDetails,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    response.status(status).json(errorResponse);
  }
}
