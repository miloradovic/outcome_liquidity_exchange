import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export const typeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => {
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USER', 'exchange'),
    password: config.get<string>('DB_PASSWORD', 'exchange'),
    database: config.get<string>('DB_NAME', 'exchange'),
    autoLoadEntities: true,
    synchronize: nodeEnv === 'development',
    logging: nodeEnv === 'development',
    migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],
    migrationsRun: nodeEnv !== 'development',
  };
};
