import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Outcome Liquidity Exchange')
    .setDescription('V1 Modular Monolith - Binary outcome trading with exact-price exact-quantity matching')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('wallet', 'Wallet management')
    .addTag('markets', 'Market and order book information')
    .addTag('orders', 'Order placement and management')
    .addTag('health', 'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
}