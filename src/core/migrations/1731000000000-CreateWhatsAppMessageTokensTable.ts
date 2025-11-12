import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWhatsAppMessageTokensTable1731000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Check if table already exists
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_message_tokens'
      );
    `);

    if (!tableExists[0].exists) {
      await queryRunner.createTable(
        new Table({
          name: 'whatsapp_message_tokens',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'messageId',
              type: 'varchar',
              length: '255',
              isUnique: true,
            },
            {
              name: 'participantId',
              type: 'uuid',
            },
            {
              name: 'eventId',
              type: 'uuid',
            },
            {
              name: 'phoneNumber',
              type: 'varchar',
              length: '20',
            },
            {
              name: 'templateName',
              type: 'varchar',
              length: '100',
              isNullable: true,
            },
            {
              name: 'isProcessed',
              type: 'boolean',
              default: false,
            },
            {
              name: 'createdAt',
              type: 'timestamptz',
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: 'timestamptz',
              default: 'now()',
            },
          ],
        }),
        true,
      );

      // Create index on messageId for faster lookups
      await queryRunner.query(`
        CREATE INDEX "IDX_whatsapp_message_tokens_messageId" 
        ON "whatsapp_message_tokens" ("messageId");
      `);

      // Create index on participantId for faster lookups
      await queryRunner.query(`
        CREATE INDEX "IDX_whatsapp_message_tokens_participantId" 
        ON "whatsapp_message_tokens" ("participantId");
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_whatsapp_message_tokens_participantId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_whatsapp_message_tokens_messageId"`,
    );

    // Drop table
    await queryRunner.dropTable('whatsapp_message_tokens', true);
  }
}

