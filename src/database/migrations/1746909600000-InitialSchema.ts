import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1746909600000 implements MigrationInterface {
  name = 'InitialSchema1746909600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."markets_status_enum" AS ENUM('OPEN', 'CLOSED', 'RESOLVED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."outcomes_side_enum" AS ENUM('YES', 'NO');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."orders_side_enum" AS ENUM('YES', 'NO');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."orders_status_enum" AS ENUM(
          'OPEN',
          'MATCH_PENDING',
          'MATCHED',
          'CANCELLED',
          'EXPIRED',
          'SETTLEMENT_FAILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."trades_status_enum" AS ENUM(
          'PENDING_SETTLEMENT',
          'SETTLED',
          'FAILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."wallet_entries_entry_type_enum" AS ENUM(
          'DEPOSIT',
          'RESERVE',
          'RELEASE',
          'SETTLE_DEBIT',
          'SETTLE_CREDIT'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."wallet_entries_reference_type_enum" AS ENUM(
          'ORDER',
          'TRADE',
          'MANUAL_DEPOSIT'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "username" character varying(100) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "markets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" character varying(100) NOT NULL,
        "title" character varying(255) NOT NULL,
        "status" "public"."markets_status_enum" NOT NULL DEFAULT 'OPEN',
        "closes_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_markets_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_markets_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outcomes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "market_id" uuid,
        "side" "public"."outcomes_side_enum" NOT NULL,
        CONSTRAINT "PK_outcomes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_outcomes_market_id" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "currency_code" character varying(10) NOT NULL DEFAULT 'USD',
        "available_balance_cents" integer NOT NULL DEFAULT 0,
        "reserved_balance_cents" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user_id" UNIQUE ("user_id"),
        CONSTRAINT "CHK_wallets_available_non_negative" CHECK (available_balance_cents >= 0),
        CONSTRAINT "CHK_wallets_reserved_non_negative" CHECK (reserved_balance_cents >= 0),
        CONSTRAINT "FK_wallets_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "market_id" uuid NOT NULL,
        "side" "public"."orders_side_enum" NOT NULL,
        "price_cents" integer NOT NULL,
        "quantity" integer NOT NULL,
        "reserved_cents" integer NOT NULL,
        "status" "public"."orders_status_enum" NOT NULL DEFAULT 'OPEN',
        "idempotency_key" character varying(100) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_user_idempotency" UNIQUE ("user_id", "idempotency_key"),
        CONSTRAINT "CHK_orders_price_range" CHECK (price_cents >= 1 AND price_cents <= 99),
        CONSTRAINT "CHK_orders_quantity_positive" CHECK (quantity > 0),
        CONSTRAINT "CHK_orders_reserved_non_negative" CHECK (reserved_cents >= 0),
        CONSTRAINT "FK_orders_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_market_id" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trades" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "market_id" uuid NOT NULL,
        "yes_order_id" uuid NOT NULL,
        "no_order_id" uuid NOT NULL,
        "yes_price_cents" integer NOT NULL,
        "no_price_cents" integer NOT NULL,
        "quantity" integer NOT NULL,
        "status" "public"."trades_status_enum" NOT NULL DEFAULT 'PENDING_SETTLEMENT',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trades_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_trades_yes_order" UNIQUE ("yes_order_id"),
        CONSTRAINT "UQ_trades_no_order" UNIQUE ("no_order_id"),
        CONSTRAINT "CHK_trades_complementary_price" CHECK (yes_price_cents + no_price_cents = 100),
        CONSTRAINT "CHK_trades_quantity_positive" CHECK (quantity > 0),
        CONSTRAINT "FK_trades_market_id" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_trades_yes_order_id" FOREIGN KEY ("yes_order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_trades_no_order_id" FOREIGN KEY ("no_order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "wallet_id" uuid NOT NULL,
        "entry_type" "public"."wallet_entries_entry_type_enum" NOT NULL,
        "amount_cents" integer NOT NULL,
        "reference_type" "public"."wallet_entries_reference_type_enum" NOT NULL,
        "reference_id" character varying(255) NOT NULL,
        "idempotency_key" character varying(100) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallet_entries_wallet_idempotency" UNIQUE ("wallet_id", "idempotency_key"),
        CONSTRAINT "FK_wallet_entries_wallet_id" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_orders_market_status_created" ON "orders" ("market_id", "status", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_orders_user_created" ON "orders" ("user_id", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_trades_market_status_created" ON "trades" ("market_id", "status", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_wallet_entries_wallet_created" ON "wallet_entries" ("wallet_id", "created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_wallet_entries_wallet_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_trades_market_status_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_orders_user_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_orders_market_status_created"');

    await queryRunner.query('DROP TABLE IF EXISTS "wallet_entries"');
    await queryRunner.query('DROP TABLE IF EXISTS "trades"');
    await queryRunner.query('DROP TABLE IF EXISTS "orders"');
    await queryRunner.query('DROP TABLE IF EXISTS "wallets"');
    await queryRunner.query('DROP TABLE IF EXISTS "outcomes"');
    await queryRunner.query('DROP TABLE IF EXISTS "markets"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');

    await queryRunner.query('DROP TYPE IF EXISTS "public"."wallet_entries_reference_type_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."wallet_entries_entry_type_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."trades_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."orders_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."orders_side_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."outcomes_side_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."markets_status_enum"');
  }
}
