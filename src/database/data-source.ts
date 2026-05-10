import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

import { User } from '../modules/users/entities/user.entity';
import { Market } from '../modules/markets/entities/market.entity';
import { Outcome } from '../modules/markets/entities/outcome.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'exchange',
  password: process.env.DB_PASSWORD ?? 'exchange',
  database: process.env.DB_NAME ?? 'exchange',
  entities: [User, Market, Outcome],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});
