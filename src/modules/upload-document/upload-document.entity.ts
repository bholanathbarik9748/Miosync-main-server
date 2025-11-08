import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'upload_documents' })
export class UploadDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fileName', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'originalFileName', type: 'varchar', length: 255 })
  originalFileName: string;

  @Column({ name: 'cloudinaryUrl', type: 'varchar', length: 500 })
  cloudinaryUrl: string;

  @Column({ name: 'cloudinaryPublicId', type: 'varchar', length: 255 })
  cloudinaryPublicId: string;

  @Column({ name: 'mimeType', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'fileSize', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'uploadedBy', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @Column({ name: 'isActive', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'autoDeleteDate', type: 'timestamptz', nullable: true })
  autoDeleteDate: Date | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
