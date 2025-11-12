import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUserTypeEnum1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, temporarily convert the column to text to allow any value
    await queryRunner.query(`
      ALTER TABLE users ALTER COLUMN "userType" TYPE text;
    `);

    // Add 'admin' value if it doesn't exist (for backwards compatibility)
    await queryRunner.query(`
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'admin';
    `);

    // Add the new enum values
    await queryRunner.query(`
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'superAdmin';
    `);
    await queryRunner.query(`
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'logistics';
    `);
    await queryRunner.query(`
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'rsvp';
    `);
    await queryRunner.query(`
      ALTER TYPE users_usertype_enum ADD VALUE IF NOT EXISTS 'helpDesk';
    `);

    // Update existing records that use 'admin' to 'superAdmin'
    await queryRunner.query(`
      UPDATE users SET "userType" = 'superAdmin' WHERE "userType" = 'admin';
    `);

    // Convert the column back to enum
    await queryRunner.query(`
      ALTER TABLE users ALTER COLUMN "userType" TYPE users_usertype_enum USING "userType"::users_usertype_enum;
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
