import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { asProductId } from '../../../domain/valueObjects/ProductId';
import { Review } from '../../../domain/entities/reviews';
import { WbFeedbackGateway } from '../../../infrastructure/gateways/WbFeedbackGateway';
import { JsonFileReviewsSink } from '../../../infrastructure/sinks/JsonFileReviewsSink';
import { FetchReviewsDto } from './dto/fetch-reviews.dto';
import { FetchAllReviews } from '../../../application/use-cases/FetchAllReviews';
import { InvalidProductIdError } from '../../../domain/errors/Domainerrors';
import { SplitReviewsByPeriod } from '../../../application/use-cases/SplitReviewPeriod';
import { createDateRangeFromDates, createDateRange } from '../../../domain/valueObjects/DateRange';
import { ReviewsStorageService } from '../../../infrastructure/persistance/reviews-storage.service';

interface FetchReviewsResult {
  productId: string;
  totalCount: number;
  collectionPeriodFrom: string;
  collectionPeriodTo: string;
  splitPeriodFrom: string;
  splitPeriodTo: string;
  statistics: {
    newCount: number;
    oldCount: number;
  };
  newReviews: Review[];
  oldReviews: Review[];
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);
  private readonly fetchAllReviews: FetchAllReviews;
  private readonly splitReviewsByPeriod: SplitReviewsByPeriod;
  private readonly sink: JsonFileReviewsSink;

  constructor(
    private readonly storageService: ReviewsStorageService,
  ) {
    this.logger.log('Initializing ReviewsService');
    const gateway = new WbFeedbackGateway();
    this.sink = new JsonFileReviewsSink('./output');
    this.fetchAllReviews = new FetchAllReviews(gateway, this.sink);
    this.splitReviewsByPeriod = new SplitReviewsByPeriod();
    this.logger.log('ReviewsService initialized successfully');
  }

  async fetchReviews(dto: FetchReviewsDto): Promise<FetchReviewsResult> {
    const refresh = dto.refresh === true;
    this.logger.log(`Fetching reviews for ${dto.productId}`);
    
    if (dto.dateFrom && dto.dateTo) {
      this.logger.log(`Collection period: ${dto.dateFrom} to ${dto.dateTo}`);
    } else {
      this.logger.log(`Collection period: ALL reviews`);
    }
    
    this.logger.log(`Split days: ${dto.splitDays || 90}`);

    let productId;
    try {
      productId = asProductId(dto.productId);
    } catch (error) {
      if (error instanceof InvalidProductIdError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    try {
      let allReviews: any[];

      if (!refresh) {
        // Пробуем взять из БД
        const hasCached = await this.storageService.hasReviews(String(productId));
        
        if (hasCached) {
          this.logger.log('Using cached reviews from DB');
          const cachedReviews = await this.storageService.getReviews(String(productId));
          allReviews = cachedReviews.map((r: any) => new Review(r));
        } else {
          this.logger.log('No cache found, fetching from WB');
          allReviews = await this.fetchAllReviews.execute(productId);
          
          if (allReviews.length > 0) {
            const plainReviews = allReviews.map(r => 
              typeof r.toJSON === 'function' ? r.toJSON() : r
            );
            await this.storageService.saveReviews(String(productId), plainReviews);
            this.logger.log(`Saved ${allReviews.length} reviews to database`);
          }
        }
      } else {
        // Принудительный сбор из WB
        this.logger.log('Refresh — fetching from WB');
        allReviews = await this.fetchAllReviews.execute(productId);
        
        if (allReviews.length > 0) {
          const plainReviews = allReviews.map(r => 
            typeof r.toJSON === 'function' ? r.toJSON() : r
          );
          await this.storageService.saveReviews(String(productId), plainReviews);
          this.logger.log(`Saved ${allReviews.length} reviews to database`);
        }
      }

      this.logger.log(`Collected ${allReviews.length} total reviews`);

      let reviewsInRange = allReviews;
      let collectionPeriodFrom: string;
      let collectionPeriodTo: string;

      // Если указаны даты, фильтруем отзывы по периоду
      if (dto.dateFrom && dto.dateTo) {
        const collectionRange = createDateRangeFromDates(dto.dateFrom, dto.dateTo);
        reviewsInRange = this.filterReviewsByDate(allReviews, collectionRange.from, collectionRange.to);
        collectionPeriodFrom = `${dto.dateFrom}T00:00:00.000Z`;
        collectionPeriodTo = `${dto.dateTo}T23:59:59.999Z`;
        this.logger.log(`Reviews in collection period: ${reviewsInRange.length}`);
      } else {
        // Если даты не указаны, получаем период от первой до последней даты отзыва
        const dateRange = this.getReviewsDateRange(allReviews);
        collectionPeriodFrom = dateRange.from;
        collectionPeriodTo = dateRange.to;
        this.logger.log(`Reviews date range: ${collectionPeriodFrom} to ${collectionPeriodTo}`);
      }

      // Разбиваем на новые и старые используя splitDays
      const splitDays = dto.splitDays || 90;
      const splitDateRange = createDateRange(splitDays);
      
      this.logger.log(`Split range (new=last ${splitDays} days): ${splitDateRange.from.toISOString()} - ${splitDateRange.to.toISOString()}`);

      const splitResult = this.splitReviewsByPeriod.execute({
        productId: dto.productId,
        reviews: reviewsInRange,
        dateFrom: splitDateRange.from,
        dateTo: splitDateRange.to,
      });

      const periodDescription = dto.dateFrom 
        ? `${dto.dateFrom} to ${dto.dateTo}` 
        : `${collectionPeriodFrom} to ${collectionPeriodTo}`;

      this.logger.log(
        `Split result for ${periodDescription}: ` +
        `${splitResult.statistics.newCount} new (last ${splitDays} days) + ` +
        `${splitResult.statistics.oldCount} old`
      );

      // Сохраняем все варианты
      await this.saveCollection(
        productId,
        splitDays,
        collectionPeriodFrom,
        collectionPeriodTo,
        splitDateRange.from.toISOString(),
        splitDateRange.to.toISOString(),
        splitResult,
      );

      return {
        productId: dto.productId,
        totalCount: splitResult.totalCount,
        collectionPeriodFrom,
        collectionPeriodTo,
        splitPeriodFrom: splitDateRange.from.toISOString(),
        splitPeriodTo: splitDateRange.to.toISOString(),
        statistics: splitResult.statistics,
        newReviews: splitResult.newReviews,
        oldReviews: splitResult.oldReviews,
      };
    } catch (error) {
      this.logger.error('Error fetching reviews:', error);
      throw error;
    }
  }

  private getReviewsDateRange(reviews: Review[]): { from: string; to: string } {
    if (reviews.length === 0) {
      return { from: new Date(0).toISOString(), to: new Date().toISOString() };
    }

    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    for (const review of reviews) {
      const createdDate = review.get('createdDate') as string;
      if (!createdDate) continue;

      const reviewDate = new Date(createdDate);
      if (isNaN(reviewDate.getTime())) continue;

      if (!oldestDate || reviewDate < oldestDate) {
        oldestDate = reviewDate;
      }

      if (!newestDate || reviewDate > newestDate) {
        newestDate = reviewDate;
      }
    }

    return {
      from: oldestDate ? oldestDate.toISOString() : new Date(0).toISOString(),
      to: newestDate ? newestDate.toISOString() : new Date().toISOString(),
    };
  }

  private filterReviewsByDate(reviews: Review[], from: Date, to: Date): Review[] {
    return reviews.filter(review => {
      const createdDate = review.get('createdDate') as string;
      if (!createdDate) return false;
      
      const reviewDate = new Date(createdDate);
      if (isNaN(reviewDate.getTime())) return false;
      
      return reviewDate >= from && reviewDate <= to;
    });
  }

  private async saveCollection(
    productId: any,
    splitDays: number,
    collectionFrom: string,
    collectionTo: string,
    splitFrom: string,
    splitTo: string,
    splitResult: any,
  ): Promise<void> {
    const pid = asProductId(splitResult.productId || productId);

    // Сохраняем полную коллекцию
    await this.sink.saveCollection(pid, {
      productId: String(productId),
      collectionPeriod: {
        from: collectionFrom,
        to: collectionTo,
      },
      splitPeriod: {
        days: splitDays,
        from: splitFrom,
        to: splitTo,
      },
      totalInCollection: splitResult.totalCount,
      statistics: splitResult.statistics,
      newReviews: splitResult.newReviews.map((r: Review) => r.toJSON()),
      oldReviews: splitResult.oldReviews.map((r: Review) => r.toJSON()),
      exportedAt: new Date().toISOString(),
    }, '_collection');

    // Сохраняем только новые отзывы
    if (splitResult.newReviews.length > 0) {
      await this.sink.write(pid, splitResult.newReviews);
      this.logger.log(`Saved ${splitResult.newReviews.length} new reviews`);
    }

    // Сохраняем только старые отзывы
    if (splitResult.oldReviews.length > 0) {
      await this.sink.saveCollection(
        asProductId(`${String(productId)}_old`),
        {
          productId: String(productId),
          collectionPeriod: {
            from: collectionFrom,
            to: collectionTo,
          },
          splitPeriod: {
            days: splitDays,
            from: splitFrom,
            to: splitTo,
          },
          count: splitResult.oldReviews.length,
          reviews: splitResult.oldReviews.map((r: Review) => r.toJSON()),
          exportedAt: new Date().toISOString(),
        },
        '_old'
      );
      this.logger.log(`Saved ${splitResult.oldReviews.length} old reviews`);
    }
  }
}