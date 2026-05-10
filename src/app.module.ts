import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { typeOrmConfig } from './config/typeorm.config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { MarketsModule } from './modules/markets/markets.module';
import { OrdersModule } from './modules/orders/orders.module';
import { MatchingEngineModule } from './modules/matching-engine/matching-engine.module';
import { JobsModule } from './modules/jobs/jobs.module';
//import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => typeOrmConfig(config),
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    WalletModule,
    MarketsModule,
    OrdersModule,
    MatchingEngineModule,
    JobsModule,
    //RealtimeModule,
  ],
})
export class AppModule {}
