import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const appConfig = app.get(ConfigService);
  const port = appConfig.get<number>('PORT', 3000);

  await app.listen(port);
  Logger.log(`HTTP server running on http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Swagger docs available at http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
