import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ReviewEntity } from './entities/review.entity';
import { ProcessingResultEntity } from './entities/processing-result.entity';

@Injectable()
export class ReviewsStorageService {
  private readonly logger = new Logger(ReviewsStorageService.name);

  constructor(
    @InjectRepository(ReviewEntity)
    private readonly reviewRepo: Repository<ReviewEntity>,
    @InjectRepository(ProcessingResultEntity)
    private readonly processingRepo: Repository<ProcessingResultEntity>,
  ) {}

  // ========== Отзывы ==========

  async saveReviews(
    productId: string,
    reviews: any[],
    source: string = 'wildberries'
  ): Promise<number> {
    let saved = 0;

    for (const r of reviews) {
      try {
        const externalId = String(r.id || r.externalId || this.hash(JSON.stringify(r)));
        const rating = Number(r.productValuation || r.rating || 0);
        const author = (r.wbUserDetails as any)?.name || 'Anonymous';
        const text = r.text || '';
        const createdAt = r.createdDate ? new Date(r.createdDate) : undefined;

        // Проверяем существует ли уже
        const existing = await this.reviewRepo.findOne({
          where: { source, externalId },
        });

        if (existing) {
          continue; // Пропускаем дубликаты
        }

        // Создаем и сохраняем
        const entity = new ReviewEntity();
        entity.source = source;
        entity.externalId = externalId;
        entity.productId = productId;
        if (createdAt) entity.createdAt = createdAt;
        entity.rating = rating;
        entity.author = author;
        entity.text = text;
        entity.raw = r;
        entity.collectedAt = new Date();

        await this.reviewRepo.save(entity);
        saved++;
      } catch (error) {
        this.logger.warn(`Failed to save review: ${error}`);
      }
    }

    this.logger.log(`Saved ${saved}/${reviews.length} reviews for product ${productId}`);
    return saved;
  }

  async getReviews(productId: string): Promise<any[]> {
    const entities = await this.reviewRepo.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });

    return entities.map(e => ({
      ...e.raw,
      id: e.externalId,
      productId: e.productId,
      createdDate: e.createdAt?.toISOString(),
      text: e.text,
      productValuation: e.rating,
      _cached: true,
      toJSON: function() {
        return { ...this };
      }
    }));
  }

  async hasReviews(productId: string): Promise<boolean> {
    const count = await this.reviewRepo.count({ where: { productId } });
    return count > 0;
  }

  // ========== Результаты обработки ==========

  async findProcessingResult(
    processorName: string,
    processorVersion: string,
    productId: string,
    inputHash: string,
  ): Promise<ProcessingResultEntity | null> {
    return this.processingRepo.findOne({
      where: {
        processorName,
        processorVersion,
        productId,
        inputHash,
        status: 'completed',
      },
      order: { createdAt: 'DESC' },
    });
  }

  async saveProcessingResult(data: {
    scope: 'review' | 'product';
    reviewId?: string;
    productId?: string;
    inputHash: string;
    processorName: string;
    processorVersion: string;
    result?: Record<string, unknown>;
    error?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  }): Promise<ProcessingResultEntity> {
    const entity = new ProcessingResultEntity();
    entity.scope = data.scope;
    entity.reviewId = data.reviewId;
    entity.productId = data.productId;
    entity.inputHash = data.inputHash;
    entity.processorName = data.processorName;
    entity.processorVersion = data.processorVersion;
    entity.result = data.result || {};
    entity.error = data.error;
    entity.status = data.status;

    return this.processingRepo.save(entity);
  }

  // Добавляем методы для проверки свежести

async getLastCollectionTime(productId: string): Promise<Date | null> {
  const result = await this.reviewRepo.findOne({
    where: { productId },
    order: { collectedAt: 'DESC' },
    select: ['collectedAt'],
  });
  return result?.collectedAt || null;
}

async hasNewReviewsSince(productId: string, since: Date): Promise<boolean> {
  // Проверяем, мог ли WB добавить новые отзывы
  // Если последний сбор был более 1 часа назад - считаем что могли появиться новые
  const hoursSinceLastCollection = since 
    ? (Date.now() - since.getTime()) / (1000 * 60 * 60) 
    : 999;
  
  return hoursSinceLastCollection > 1;
}

  // ========== Утилиты ==========

  computeInputHash(data: Record<string, unknown>): string {
    const sorted = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(sorted).digest('hex').substring(0, 16);
  }

  private hash(input: string): string {
    return createHash('md5').update(input).digest('hex').substring(0, 12);
  }
}