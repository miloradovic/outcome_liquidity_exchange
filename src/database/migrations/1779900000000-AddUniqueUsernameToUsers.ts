import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueUsernameToUsers1779900000000 implements MigrationInterface {
  name = 'AddUniqueUsernameToUsers1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'UQ_users_username'
        ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "UQ_users_username" UNIQUE ("username");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "UQ_users_username"
    `);
  }
}
