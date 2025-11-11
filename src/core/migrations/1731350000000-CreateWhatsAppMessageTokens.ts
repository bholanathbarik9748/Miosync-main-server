import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWhatsAppMessageTokens1731350000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists
    const tableExists = await queryRunner.hasTable('whatsapp_message_tokens');

    if (!tableExists) {
      // Create table with correct schema
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
              isNullable: false,
            },
            {
              name: 'participantId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'eventId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'phoneNumber',
              type: 'varchar',
              length: '20',
              isNullable: false,
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
              isNullable: false,
            },
            {
              name: 'createdAt',
              type: 'timestamptz',
              default: 'NOW()',
              isNullable: false,
            },
            {
              name: 'updatedAt',
              type: 'timestamptz',
              default: 'NOW()',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Create indexes for better query performance
      await queryRunner.createIndex(
        'whatsapp_message_tokens',
        new TableIndex({
          name: 'IDX_WHATSAPP_MESSAGE_TOKENS_PHONE_NUMBER',
          columnNames: ['phoneNumber'],
        }),
      );

      await queryRunner.createIndex(
        'whatsapp_message_tokens',
        new TableIndex({
          name: 'IDX_WHATSAPP_MESSAGE_TOKENS_IS_PROCESSED',
          columnNames: ['isProcessed'],
        }),
      );

      await queryRunner.createIndex(
        'whatsapp_message_tokens',
        new TableIndex({
          name: 'IDX_WHATSAPP_MESSAGE_TOKENS_PARTICIPANT_ID',
          columnNames: ['participantId'],
        }),
      );

      await queryRunner.createIndex(
        'whatsapp_message_tokens',
        new TableIndex({
          name: 'IDX_WHATSAPP_MESSAGE_TOKENS_CREATED_AT',
          columnNames: ['createdAt'],
        }),
      );
    } else {
      // Table exists, check if columns need to be renamed from snake_case to camelCase
      const columns = await queryRunner.getTable('whatsapp_message_tokens');
      const columnNames = columns?.columns.map((col) => col.name) || [];

      // If created_at exists but createdAt doesn't, we need to rename
      if (
        columnNames.includes('created_at') &&
        !columnNames.includes('createdAt')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'created_at',
          'createdAt',
        );
      }

      if (
        columnNames.includes('updated_at') &&
        !columnNames.includes('updatedAt')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'updated_at',
          'updatedAt',
        );
      }

      if (
        columnNames.includes('message_id') &&
        !columnNames.includes('messageId')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'message_id',
          'messageId',
        );
      }

      if (
        columnNames.includes('participant_id') &&
        !columnNames.includes('participantId')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'participant_id',
          'participantId',
        );
      }

      if (
        columnNames.includes('event_id') &&
        !columnNames.includes('eventId')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'event_id',
          'eventId',
        );
      }

      if (
        columnNames.includes('phone_number') &&
        !columnNames.includes('phoneNumber')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'phone_number',
          'phoneNumber',
        );
      }

      if (
        columnNames.includes('template_name') &&
        !columnNames.includes('templateName')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'template_name',
          'templateName',
        );
      }

      if (
        columnNames.includes('is_processed') &&
        !columnNames.includes('isProcessed')
      ) {
        await queryRunner.renameColumn(
          'whatsapp_message_tokens',
          'is_processed',
          'isProcessed',
        );
      }

      // Add indexes if they don't exist
      const tableWithIndexes = await queryRunner.getTable(
        'whatsapp_message_tokens',
      );
      const indexNames =
        tableWithIndexes?.indices.map((idx) => idx.name) || [];

      if (!indexNames.includes('IDX_WHATSAPP_MESSAGE_TOKENS_PHONE_NUMBER')) {
        await queryRunner.createIndex(
          'whatsapp_message_tokens',
          new TableIndex({
            name: 'IDX_WHATSAPP_MESSAGE_TOKENS_PHONE_NUMBER',
            columnNames: ['phoneNumber'],
          }),
        );
      }

      if (!indexNames.includes('IDX_WHATSAPP_MESSAGE_TOKENS_IS_PROCESSED')) {
        await queryRunner.createIndex(
          'whatsapp_message_tokens',
          new TableIndex({
            name: 'IDX_WHATSAPP_MESSAGE_TOKENS_IS_PROCESSED',
            columnNames: ['isProcessed'],
          }),
        );
      }

      if (
        !indexNames.includes('IDX_WHATSAPP_MESSAGE_TOKENS_PARTICIPANT_ID')
      ) {
        await queryRunner.createIndex(
          'whatsapp_message_tokens',
          new TableIndex({
            name: 'IDX_WHATSAPP_MESSAGE_TOKENS_PARTICIPANT_ID',
            columnNames: ['participantId'],
          }),
        );
      }

      if (!indexNames.includes('IDX_WHATSAPP_MESSAGE_TOKENS_CREATED_AT')) {
        await queryRunner.createIndex(
          'whatsapp_message_tokens',
          new TableIndex({
            name: 'IDX_WHATSAPP_MESSAGE_TOKENS_CREATED_AT',
            columnNames: ['createdAt'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('whatsapp_message_tokens', true);
  }
}

