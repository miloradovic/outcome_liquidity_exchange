import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertCoreTimestampsToTimestamptz1780100000000 implements MigrationInterface {
  name = 'ConvertCoreTimestampsToTimestamptz1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "created_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "updated_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "created_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "wallets"
      ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "created_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "wallets"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "updated_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "created_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "updated_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "trades"
      ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "created_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "trades"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "updated_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "wallet_entries"
      ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
      USING "created_at" AT TIME ZONE 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallet_entries"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
      USING "created_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "trades"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP
      USING "updated_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "trades"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
      USING "created_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP
      USING "updated_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
      USING "created_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "wallets"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP
      USING "updated_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "wallets"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
      USING "created_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
      USING "created_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "updated_at" TYPE TIMESTAMP
      USING "updated_at" AT TIME ZONE 'UTC'
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "created_at" TYPE TIMESTAMP
      USING "created_at" AT TIME ZONE 'UTC'
    `);
  }
}
