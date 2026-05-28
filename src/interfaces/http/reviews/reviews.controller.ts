import { 
    Controller, 
    Get, 
    Query, 
    HttpException, 
    HttpStatus, 
    Logger } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { FetchReviewsDto } from './dto/fetch-reviews.dto';
import { Review } from '../../../domain/entities/reviews';
import { ReviewsStorageService } from '../../../infrastructure/persistance/reviews-storage.service';
@Controller('reviews')
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly storageService: ReviewsStorageService) {}
  
  @Get()
  async fetchReviews(@Query() dto: FetchReviewsDto) {
    try {
      // Валидация дат если они указаны
      if (dto.dateFrom && dto.dateTo) {
        const dateFrom = new Date(`${dto.dateFrom}T00:00:00.000Z`);
        const dateTo = new Date(`${dto.dateTo}T23:59:59.999Z`);

        if (isNaN(dateFrom.getTime())) {
          throw new HttpException('Invalid dateFrom format', HttpStatus.BAD_REQUEST);
        }

        if (isNaN(dateTo.getTime())) {
          throw new HttpException('Invalid dateTo format', HttpStatus.BAD_REQUEST);
        }

        if (dateFrom > dateTo) {
          throw new HttpException('dateFrom must be before dateTo', HttpStatus.BAD_REQUEST);
        }
      } else if (dto.dateFrom || dto.dateTo) {
        // Если указана только одна дата - ошибка
        throw new HttpException(
          'Both dateFrom and dateTo must be provided or neither',
          HttpStatus.BAD_REQUEST
        );
      }

      if (!dto.refresh) {
        const lastCollection = await this.storageService.getLastCollectionTime(dto.productId);
        const needsRefresh = lastCollection 
          ? await this.storageService.hasNewReviewsSince(dto.productId, lastCollection)
          : true;

        if (needsRefresh) {
          this.logger.log('Data may be stale (>1 hour), auto-refreshing...');
          dto.refresh = true;
        }
      }

      this.logger.log(
        `Request: productId=${dto.productId}, ` +
        `period=${dto.dateFrom || 'all'}-${dto.dateTo || 'all'}, ` +
        `splitDays=${dto.splitDays || 90}, ` + 
        `refresh=${dto.refresh || false}`
      );

      const startTime = Date.now();
      const result = await this.reviewsService.fetchReviews(dto);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      return {
        success: true,
        data: {
          productId: result.productId,
          // Период сбора отзывов
          collectionPeriod: {
            from: result.collectionPeriodFrom,
            to: result.collectionPeriodTo,
          },
          // Период для разбиения на новые/старые
          splitPeriod: {
            days: dto.splitDays || 90,
            from: result.splitPeriodFrom,
            to: result.splitPeriodTo,
          },
          totalInCollection: result.totalCount,
          statistics: result.statistics,
          executionTime: `${elapsed}s`,
        //  ТУТ МЫ ВЫБОРОЧНО ВОЗВРОЩАЕМ НУЖНЫЕ НАМ ПОЛЯ
        //   newReviews: result.newReviews.map(review => ({
        //     id: review.get('id'),
        //     text: review.get('text'),
        //     rating: review.get('productValuation'),
        //     createdDate: review.get('createdDate'),
        //     userName: (review.get('wbUserDetails') as any)?.name || 'Anonymous',
        //     bables: (review.get('bables')),
        //     color: (review.get('color'))
        //   })),
        //   oldReviews: result.oldReviews.map(review => ({
        //     id: review.get('id'),
        //     text: review.get('text'),
        //     rating: review.get('productValuation'),
        //     createdDate: review.get('createdDate'),
        //     userName: (review.get('wbUserDetails') as any)?.name || 'Anonymous',
        //     bables: (review.get('bables')),
        //     color: (review.get('color'))
        //   })),

        // ТУТ ВОЗВРАЩАЕМ ВСЕ ПОЛЯ
        newReviews: result.newReviews.map((review: Review) => review.toJSON()),
        oldReviews: result.oldReviews.map((review: Review) => review.toJSON()),

        },
      };
    } catch (error) {
      this.logger.error('Error:', error);
      
      // Возвращаем пустой массив вместо ошибки
      return {
        success: true,
        data: {
          productId: dto.productId || 'unknown',
          collectionPeriod: {
            from: new Date(0).toISOString(),
            to: new Date().toISOString(),
          },
          splitPeriod: {
            days: dto.splitDays || 90,
            from: new Date(0).toISOString(),
            to: new Date().toISOString(),
          },
          totalInCollection: 0,
          statistics: {
            newCount: 0,
            oldCount: 0,
            newPercentage: 0,
            oldPercentage: 0,
          },
          executionTime: '0s',
          newReviews: [],
          oldReviews: [],
        },
      };
    }
  }
}