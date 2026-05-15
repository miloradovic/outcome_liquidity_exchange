import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeprecatedStatusEnumValues1780200000000 implements MigrationInterface {
  name = 'RemoveDeprecatedStatusEnumValues1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM "markets"
          WHERE "status"::text = 'CLOSED'
        ) THEN
          RAISE EXCEPTION 'Cannot remove status value CLOSED while markets rows still use it';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM "orders"
          WHERE "status"::text = 'EXPIRED'
        ) THEN
          RAISE EXCEPTION 'Cannot remove status value EXPIRED while orders rows still use it';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."markets_status_enum"
      RENAME TO "markets_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."markets_status_enum" AS ENUM('OPEN', 'RESOLVED')
    `);
    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "status" TYPE "public"."markets_status_enum"
      USING ("status"::text::"public"."markets_status_enum")
    `);
    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "status" SET DEFAULT 'OPEN'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."markets_status_enum_old"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."orders_status_enum"
      RENAME TO "orders_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."orders_status_enum" AS ENUM(
        'OPEN',
        'MATCH_PENDING',
        'MATCHED',
        'CANCELLED',
        'SETTLEMENT_FAILED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" TYPE "public"."orders_status_enum"
      USING ("status"::text::"public"."orders_status_enum")
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" SET DEFAULT 'OPEN'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."orders_status_enum_old"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."orders_status_enum"
      RENAME TO "orders_status_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."orders_status_enum" AS ENUM(
        'OPEN',
        'MATCH_PENDING',
        'MATCHED',
        'CANCELLED',
        'EXPIRED',
        'SETTLEMENT_FAILED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" TYPE "public"."orders_status_enum"
      USING ("status"::text::"public"."orders_status_enum")
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" SET DEFAULT 'OPEN'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."orders_status_enum_new"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."markets_status_enum"
      RENAME TO "markets_status_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."markets_status_enum" AS ENUM('OPEN', 'CLOSED', 'RESOLVED')
    `);
    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "status" TYPE "public"."markets_status_enum"
      USING ("status"::text::"public"."markets_status_enum")
    `);
    await queryRunner.query(`
      ALTER TABLE "markets"
      ALTER COLUMN "status" SET DEFAULT 'OPEN'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."markets_status_enum_new"
    `);
  }
}
