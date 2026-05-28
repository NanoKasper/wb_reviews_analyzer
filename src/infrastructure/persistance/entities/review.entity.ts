import { 
  Entity, PrimaryGeneratedColumn, Column, 
  CreateDateColumn, UpdateDateColumn, Unique, Index 
} from 'typeorm';

@Entity('reviews')
@Unique(['source', 'externalId'])
@Index(['productId'])
@Index(['createdAt'])
export class ReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  source: string;

  @Column({ type: 'varchar', length: 100 })
  externalId: string;

  @Column({ type: 'varchar', length: 50 })
  productId: string;

  @Column({ type: 'timestamp', nullable: true })
  createdAt: Date | null;

  @Column({ type: 'int', nullable: true })
  rating: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author: string | null;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'jsonb', default: {} })
  raw: Record<string, unknown>;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  collectedAt: Date;

  @CreateDateColumn()
  dbCreatedAt: Date;

  @UpdateDateColumn()
  dbUpdatedAt: Date;
}