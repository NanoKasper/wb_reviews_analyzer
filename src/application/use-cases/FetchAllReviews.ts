import { ProductId } from '../../domain/valueObjects/ProductId';
import { Review } from '../../domain/entities/reviews';
import { ReviewGateway } from '../ports/ReviewGateway';
import { ReviewsSink } from '../ports/ReviewsSink';
import { EmptyResponseError } from '../../domain/errors/Domainerrors';

export class FetchAllReviews {
  constructor(
    private gateway: ReviewGateway,
    private sink: ReviewsSink,
  ) {
    console.log('FetchAllReviews constructor called');
    console.log('Gateway:', !!gateway);
    console.log('Sink:', !!sink);
  }

  async execute(productId: ProductId): Promise<Review[]> {
        console.log('FetchAllReviews.execute called with productId:', productId);
    
    if (!this.gateway) {
      throw new Error('Gateway is not initialized in FetchAllReviews');
    }
    
    const allReviews: Review[] = [];
    let skip = 0;
    const take = 100;
    let emptyPagesCount = 0;

    try {
      while (true) {
        console.log(`Fetching reviews: skip=${skip}, take=${take}`);
        const reviews = await this.gateway.fetchReviews(productId, skip, take);
        console.log(`Received ${reviews?.length || 0} reviews`);

        if ((!reviews || !reviews.length)) {
            throw new EmptyResponseError(productId);
        }

        allReviews.push(...reviews);

        // Продвигаем skip на фактическое количество полученных отзывов
        skip += reviews.length;
        emptyPagesCount++

        console.log(`loaded: ${allReviews.length}`);

        // Если получили меньше запрошенного - значит достигли конца
        if (reviews.length < take) break;

        // Ограничение по общему количеству отзывов товара
        if (allReviews.length >= allReviews.length) {
          const result = allReviews.slice(0, allReviews.length);
          await this.sink.save(productId, result);
          return result;
        }

        // Задержка между запросами
        await new Promise(r => setTimeout(r, 200));
      }

      console.log(`Saving ${allReviews.length} reviews`);
      await this.sink.save(productId, allReviews);
      console.log(`Total collected: ${allReviews.length} reviews`);
      console.log('Reviews saved successfully');
      return allReviews;


    } catch (error) {
      console.error('Error in FetchAllReviews.execute:', error);
      return allReviews;
    }
  }
}