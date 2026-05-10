import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('DB_HOST', 'localhost'),
  port: config.get<number>('DB_PORT', 5432),
  username: config.get<string>('DB_USER', 'exchange'),
  password: config.get<string>('DB_PASSWORD', 'exchange'),
  database: config.get<string>('DB_NAME', 'exchange'),
  autoLoadEntities: true,
  synchronize: config.get<string>('NODE_ENV') !== 'production',
  logging: config.get<string>('NODE_ENV') === 'development',
  migrations: ['dist/database/migrations/*.js'],
  migrationsRun: config.get<string>('NODE_ENV') === 'production',
});
