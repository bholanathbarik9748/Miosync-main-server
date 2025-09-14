import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FoodType } from './dto/events.dto';

@Entity({ name: 'events' })
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'eventName', type: 'varchar', length: 100 })
  eventName: string;

  @Column({ name: 'eventDateTime', type: 'timestamptz' })
  eventDateTime: Date;

  @Column({ name: 'venue', type: 'varchar', length: 150 })
  venue: string;

  @Column({ name: 'food', type: 'enum', enum: FoodType })
  food: FoodType;

  @Column({ name: 'isActive', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
