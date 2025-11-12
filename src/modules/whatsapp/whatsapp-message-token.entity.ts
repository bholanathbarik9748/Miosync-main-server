import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'whatsapp_message_tokens' })
export class WhatsAppMessageToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'messageId', type: 'varchar', length: 255, unique: true })
  messageId: string;

  @Column({ name: 'participantId', type: 'uuid' })
  participantId: string;

  @Column({ name: 'eventId', type: 'uuid' })
  eventId: string;

  @Column({ name: 'phoneNumber', type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({
    name: 'templateName',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  templateName: string | null;

  @Column({ name: 'isProcessed', type: 'boolean', default: false })
  isProcessed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
