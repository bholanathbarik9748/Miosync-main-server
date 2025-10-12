import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUserTypeEnum1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, add the new enum values
    await queryRunner.query(`
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'superAdmin';
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'logistics';
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'rsvp';
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'helpDesk';
    `);

    // Update existing records that use 'admin' to 'superAdmin'
    await queryRunner.query(`
      UPDATE users SET "userType" = 'superAdmin' WHERE "userType" = 'admin';
    `);

    // Note: PostgreSQL doesn't support removing enum values directly
    // The 'admin' value will remain in the enum but won't be used by the application
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the changes
    await queryRunner.query(`
      UPDATE users SET "userType" = 'admin' WHERE "userType" = 'superAdmin';
    `);
  }
}
