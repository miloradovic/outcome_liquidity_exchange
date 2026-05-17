import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleToUsers1780300000000 implements MigrationInterface {
  name = 'AddRoleToUsers1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "role" character varying(20) NOT NULL DEFAULT 'USER'
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_users_role'
        ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "CHK_users_role" CHECK ("role" IN ('USER', 'ADMIN'));
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "CHK_users_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "role"
    `);
  }
}