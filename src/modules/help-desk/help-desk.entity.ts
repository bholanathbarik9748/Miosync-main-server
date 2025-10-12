import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Event } from '../events/events.entity'; // Adjust import path if needed

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Foreign key to Events table
  @Column({ type: 'uuid', nullable: true })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventID' })
  event: Event;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  roomNumber: string;

  @Column({ type: 'varchar', length: 15 })
  phoneNumber: string;

  @Column({ type: 'text' })
  request: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'low',
  })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Column({
    type: 'varchar',
    length: 20,
    default: 'open',
  })
  status: 'open' | 'inProgress' | 'resolved' | 'closed';

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
