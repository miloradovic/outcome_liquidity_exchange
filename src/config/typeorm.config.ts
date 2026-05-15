import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export const typeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => {
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const dbSslEnabled = config.get<boolean>('DB_SSL', false);
  const dbSslRejectUnauthorized = config.get<boolean>(
    'DB_SSL_REJECT_UNAUTHORIZED',
    true,
  );

  return {
    type: 'postgres',
    host: config.getOrThrow<string>('DB_HOST'),
    port: config.getOrThrow<number>('DB_PORT'),
    username: config.getOrThrow<string>('DB_USER'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    database: config.getOrThrow<string>('DB_NAME'),
    ssl: dbSslEnabled ? { rejectUnauthorized: dbSslRejectUnauthorized } : false,
    autoLoadEntities: true,
    synchronize: nodeEnv === 'development',
    logging: nodeEnv === 'development',
    migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],
    migrationsRun: nodeEnv !== 'development',
  };
};
