import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhatsAppMessageTokensColumns1731440000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the table exists before renaming columns
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_message_tokens'
      );
    `);

    if (tableExists[0].exists) {
      // Check if old column names exist
      const createdAtExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'whatsapp_message_tokens' 
          AND column_name = 'createdAt'
        );
      `);

      const updatedAtExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'whatsapp_message_tokens' 
          AND column_name = 'updatedAt'
        );
      `);

      // Rename columns if they exist
      if (createdAtExists[0].exists) {
        await queryRunner.query(`
          ALTER TABLE "whatsapp_message_tokens" 
          RENAME COLUMN "createdAt" TO "created_at";
        `);
      }

      if (updatedAtExists[0].exists) {
        await queryRunner.query(`
          ALTER TABLE "whatsapp_message_tokens" 
          RENAME COLUMN "updatedAt" TO "updated_at";
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert column names back to camelCase
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_message_tokens'
      );
    `);

    if (tableExists[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "whatsapp_message_tokens" 
        RENAME COLUMN "created_at" TO "createdAt";
      `);

      await queryRunner.query(`
        ALTER TABLE "whatsapp_message_tokens" 
        RENAME COLUMN "updated_at" TO "updatedAt";
      `);
    }
  }
}

