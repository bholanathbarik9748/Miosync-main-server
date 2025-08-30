import { NestFactory } from '@nestjs/core';
import { AppModule } from '../test/app.module';

async function App() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

App();
