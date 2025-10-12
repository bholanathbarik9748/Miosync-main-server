import { HttpStatus, HttpStatus as NestHttpStatus } from '@nestjs/common';
export { NestHttpStatus as HttpStatus };

export enum ResponseStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface ApiResponse<T = any> {
  status: ResponseStatus;
  statusCode: HttpStatus;
  message: string;
  data?: T;
  error?: {
    code: string;
    context?: string;
    details?: any;
    category?: string;
    stack?: string;
  };
  timestamp: string;
  path?: string;
}

export interface PaginationData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type PaginatedResponse<T> = ApiResponse<PaginationData<T>>;

export interface ErrorResponse extends ApiResponse {
  error: {
    code: string;
    context?: string;
    details?: any;
    category?: string;
    stack?: string;
  };
  data?: never;
}
