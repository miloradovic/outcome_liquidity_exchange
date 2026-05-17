import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWithdrawWalletEntryTypes1780400000000 implements MigrationInterface {
  name = 'AddWithdrawWalletEntryTypes1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."wallet_entries_entry_type_enum"
      ADD VALUE IF NOT EXISTS 'WITHDRAW'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."wallet_entries_reference_type_enum"
      ADD VALUE IF NOT EXISTS 'MANUAL_WITHDRAW'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM "wallet_entries"
          WHERE "entry_type"::text = 'WITHDRAW'
        ) THEN
          RAISE EXCEPTION 'Cannot remove enum value WITHDRAW while wallet_entries rows still use it';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM "wallet_entries"
          WHERE "reference_type"::text = 'MANUAL_WITHDRAW'
        ) THEN
          RAISE EXCEPTION 'Cannot remove enum value MANUAL_WITHDRAW while wallet_entries rows still use it';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."wallet_entries_entry_type_enum"
      RENAME TO "wallet_entries_entry_type_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."wallet_entries_entry_type_enum" AS ENUM(
        'DEPOSIT',
        'RESERVE',
        'RELEASE',
        'SETTLE_DEBIT',
        'SETTLE_CREDIT'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_entries"
      ALTER COLUMN "entry_type" TYPE "public"."wallet_entries_entry_type_enum"
      USING ("entry_type"::text::"public"."wallet_entries_entry_type_enum")
    `);
    await queryRunner.query(`
      DROP TYPE "public"."wallet_entries_entry_type_enum_new"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."wallet_entries_reference_type_enum"
      RENAME TO "wallet_entries_reference_type_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."wallet_entries_reference_type_enum" AS ENUM(
        'ORDER',
        'TRADE',
        'MANUAL_DEPOSIT'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_entries"
      ALTER COLUMN "reference_type" TYPE "public"."wallet_entries_reference_type_enum"
      USING ("reference_type"::text::"public"."wallet_entries_reference_type_enum")
    `);
    await queryRunner.query(`
      DROP TYPE "public"."wallet_entries_reference_type_enum_new"
    `);
  }
}