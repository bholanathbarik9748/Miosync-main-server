import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiResponse,
  ResponseStatus,
  HttpStatus,
} from '../interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    return next.handle().pipe(
      map((data) => {
        // If the response is already in our ApiResponse format, return it as is
        if (data && data.status && data.statusCode) {
          return data;
        }

        // Transform the response to our standard format
        const response: ApiResponse<T> = {
          status: ResponseStatus.SUCCESS,
          statusCode: HttpStatus.OK,
          message: 'Operation successful',
          data,
          timestamp: new Date().toISOString(),
          path: request.url,
        };

        return response;
      }),
    );
  }
}
