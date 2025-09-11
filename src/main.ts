import { NestFactory } from '@nestjs/core';
import { AppModule } from '../test/app.module';
import { VersioningType } from '@nestjs/common';

async function App() {
  const app = await NestFactory.create(AppModule);
  
  // Set global prefix for API
  app.setGlobalPrefix('api');
  
  // Enable API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '2',
  });
  
  await app.listen(process.env.PORT || 3000);
}

App();
