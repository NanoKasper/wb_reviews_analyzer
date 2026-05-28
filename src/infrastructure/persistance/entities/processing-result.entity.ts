import { 
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
  ManyToOne, JoinColumn
} from 'typeorm';
import { ReviewEntity } from './review.entity';

@Entity('processing_results')
@Index(['processorName', 'productId', 'inputHash'])
@Index(['processorName', 'processorVersion'])
export class ProcessingResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  scope: 'review' | 'product';

  @Column({ type: 'uuid', nullable: true })
  reviewId: string | null | undefined;

  @ManyToOne(() => ReviewEntity, { nullable: true })
  @JoinColumn({ name: 'reviewId' })
  review: ReviewEntity | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  productId: string | null | undefined;

  @Column({ type: 'varchar', length: 32 })
  inputHash: string;

  @Column({ type: 'varchar', length: 100 })
  processorName: string;

  @Column({ type: 'varchar', length: 50 })
  processorVersion: string;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null | undefined;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'processing' | 'completed' | 'failed';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}