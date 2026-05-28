import { Review } from './reviews';
import { DateRange } from '../valueObjects/DateRange';

export interface ReviewCollection {
  productId: string;
  period: {
    from: string;
    to: string;
  };
  totalCount: number;
  newReviews: Review[];
  oldReviews: Review[];
  statistics: {
    newCount: number;
    oldCount: number;
  };
}

export function splitReviewsByDate(
  reviews: Review[],
  dateRange: DateRange
): { newReviews: Review[]; oldReviews: Review[] } {
  const newReviews: Review[] = [];
  const oldReviews: Review[] = [];


  const periodStart = new Date(dateRange.from);
  const periodEnd = new Date(dateRange.to);

  console.log(`Splitting reviews by period (UTC):`);
  console.log(`  From: ${periodStart.toISOString()}`);
  console.log(`  To:   ${periodEnd.toISOString()}`);

  for (const review of reviews) {
    const createdDateStr = review.get('createdDate') as string;
    
    if (!createdDateStr) {
      console.log(`Review without date, marking as old`);
      oldReviews.push(review);
      continue;
    }

    // Парсим дату отзыва (она приходит в UTC формате)
    const reviewDate = new Date(createdDateStr);
    
    if (isNaN(reviewDate.getTime())) {
      console.log(`Invalid date format: ${createdDateStr}, marking as old`);
      oldReviews.push(review);
      continue;
    }

    // Сравниваем UTC даты
    const isNew = reviewDate >= periodStart && reviewDate <= periodEnd;
    
    if (isNew) {
      newReviews.push(review);
    } else {
      oldReviews.push(review);
    }
  }

  // Выводим примеры для проверки
  // if (reviews.length > 0) {
  //   console.log(`\nSample reviews split:`);
  //   for (let i = 0; i < Math.min(3, reviews.length); i++) {
  //     const date = reviews[i].get('createdDate');
  //     const status = newReviews.includes(reviews[i]) ? 'NEW' : 'OLD';
  //     console.log(`  ${status}: ${date}`);
  //   }
  // }

  console.log(`\nSplit result: ${newReviews.length} new, ${oldReviews.length} old`);
  
  return { newReviews, oldReviews };
}

export function createReviewCollection(
  productId: string,
  reviews: Review[],
  dateRange: DateRange
): ReviewCollection {
  const { newReviews, oldReviews } = splitReviewsByDate(reviews, dateRange);
  const totalCount = reviews.length;

  return {
    productId,
    period: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    totalCount,
    newReviews,
    oldReviews,
    statistics: {
      newCount: newReviews.length,
      oldCount: oldReviews.length,
    },
  };
}