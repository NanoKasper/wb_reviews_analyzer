import { Review } from '../../domain/entities/reviews';
import { DateRange, createDateRange, createDateRangeFromDates } from '../../domain/valueObjects/DateRange'; 
import {
  ReviewCollection,
  createReviewCollection,
} from '../../domain/entities/reviewcollection';

export interface SplitReviewsOptions {
  productId: string;
  reviews: Review[];
  daysBack?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export class SplitReviewsByPeriod {
  execute(options: SplitReviewsOptions): ReviewCollection {
    const { productId, reviews, daysBack, dateFrom, dateTo } = options;

    let dateRange: DateRange;

    if (dateFrom && dateTo) {
      dateRange = createDateRangeFromDates(dateFrom, dateTo);
      console.log(`Using custom date range: ${dateRange.from.toISOString()} - ${dateRange.to.toISOString()}`);
    } else {
      dateRange = createDateRange(daysBack || 90);
      console.log(`Using default date range (${daysBack || 90} days back): ${dateRange.from.toISOString()} - ${dateRange.to.toISOString()}`);
    }

    // // Логируем первые несколько дат для проверки
    // if (reviews.length > 0) {
    //   console.log('Sample review dates:');
    //   for (let i = 0; i < Math.min(5, reviews.length); i++) {
    //     console.log(`  Review ${i + 1}: ${reviews[i].get('createdDate')}`);
    //   }
    // }

    const collection = createReviewCollection(productId, reviews, dateRange);
    console.log('Split completed:');
    console.log(`  Period: ${collection.period.from} - ${collection.period.to}`);
    console.log(`  Total: ${collection.totalCount}`);
    console.log(`  New: ${collection.statistics.newCount}`);
    console.log(`  Old: ${collection.statistics.oldCount}`);
    return collection;
  }
}