import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { RealtimeIoAdapter } from './modules/realtime/realtime-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const appConfig = app.get(ConfigService);

  app.useWebSocketAdapter(new RealtimeIoAdapter(app, appConfig));
  configureApp(app);

  const port = appConfig.get<number>('PORT', 3000);

  await app.listen(port);
  Logger.log(`HTTP server running on http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Swagger docs available at http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
