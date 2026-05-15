import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

import { User } from '../modules/users/entities/user.entity';
import { Market } from '../modules/markets/entities/market.entity';
import { Outcome } from '../modules/markets/entities/outcome.entity';
import { Order } from '../modules/markets/entities/order.entity';
import { Trade } from '../modules/markets/entities/trade.entity';
import { Wallet } from '../modules/wallet/entities/wallet.entity';
import { WalletEntry } from '../modules/wallet/entities/wallet-entry.entity';

config();

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const dbSslEnabled = parseBoolean(process.env.DB_SSL, false);
const dbSslRejectUnauthorized = parseBoolean(
  process.env.DB_SSL_REJECT_UNAUTHORIZED,
  true,
);

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'exchange',
  password: process.env.DB_PASSWORD ?? 'exchange',
  database: process.env.DB_NAME ?? 'exchange',
  ssl: dbSslEnabled ? { rejectUnauthorized: dbSslRejectUnauthorized } : false,
  entities: [User, Market, Outcome, Order, Trade, Wallet, WalletEntry],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});
