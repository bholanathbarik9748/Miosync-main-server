import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('event_participants')
export class EventParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  eventId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  category: string;

  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'date', nullable: true })
  dateOfArrival: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modeOfArrival: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  trainFlightNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  time: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hotelName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  roomType: string | null;

  @Column({ type: 'date', nullable: true })
  checkIn: Date | null;

  @Column({ type: 'date', nullable: true })
  checkOut: Date | null;

  @Column({ type: 'text', nullable: true })
  departureDetails: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  departureTime: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  attending: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'text', nullable: true })
  remarksRound2: string | null;
}
