import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ResponseStatus,
  ErrorResponse,
} from '../interfaces/api-response.interface';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errorDetails: any = null;

    this.logger.error(
      `Exception occurred: ${exception.message}`,
      exception.stack,
    );

    // Handle specific NestJS HTTP exceptions
    if (exception instanceof NotFoundException) {
      status = HttpStatus.NOT_FOUND;
      errorCode = 'NOT_FOUND';
      message = exception.message;
      errorDetails = {
        resource: (exception.getResponse() as any)?.error || 'Resource',
      };
    } else if (exception instanceof BadRequestException) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = 'BAD_REQUEST';
      const response = exception.getResponse();
      message = exception.message;
      errorDetails =
        typeof response === 'object' ? (response as any)?.message : null;
    } else if (exception instanceof UnauthorizedException) {
      status = HttpStatus.UNAUTHORIZED;
      errorCode = 'UNAUTHORIZED';
      message = exception.message;
    } else if (exception instanceof ForbiddenException) {
      status = HttpStatus.FORBIDDEN;
      errorCode = 'FORBIDDEN';
      message = exception.message;
    } else if (exception instanceof InternalServerErrorException) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
      message = 'An internal server error occurred';
      errorDetails =
        process.env.NODE_ENV === 'development' ? exception.message : null;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorCode = HttpStatus[status] || 'INTERNAL_SERVER_ERROR';
      message = exception.message;
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'object' && responseBody !== null) {
        const errorResponse = responseBody as Record<string, unknown>;
        errorDetails = errorResponse.error || null;
      }
    }
    // Handle database errors
    else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = 'DATABASE_ERROR';
      message = 'Database operation failed';
      errorDetails = {
        code: (exception as any).code,
        detail: (exception as any).detail,
      };
    }
    // Handle other types of errors
    else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
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
        details: errorDetails,
        ...(process.env.NODE_ENV === 'development' && {
          stack: exception.stack,
        }),
      },
      timestamp: new Date().toISOString(),
      path: request.url as string,
    };

    // Log error details
    this.logger.error(`[${errorCode}] ${message}`, {
      statusCode: status,
      path: request.url,
      error: errorDetails,
    });

    response.status(status).json(errorResponse);
  }
}
