import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResolvedOutcomeToMarkets1778800000000 implements MigrationInterface {
  name = 'AddResolvedOutcomeToMarkets1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "markets"
      ADD COLUMN IF NOT EXISTS "resolved_outcome" "outcomes_side_enum" NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "markets"
      DROP COLUMN IF EXISTS "resolved_outcome"
    `);
  }
}
