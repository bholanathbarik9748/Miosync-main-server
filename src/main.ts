import { NestFactory } from '@nestjs/core';
import { AppModule } from '../test/app.module';
import { VersioningType } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from './config/logger.config';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function App() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(loggerConfig),
  });
  
  // Set global prefix for API
  app.setGlobalPrefix('api');
  
  // Enable API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '2',
  });

  // Apply global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  // Apply global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  await app.listen(process.env.PORT || 3000);
}

App();
