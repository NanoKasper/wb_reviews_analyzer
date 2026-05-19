import { ProductId } from '../../domain/valueObjects/ProductId.js';
import { Review } from '../../domain/entities/reviews.js';


export interface ReviewGateway {
  fetchReviews(productId: ProductId, skip: number, take: number): Promise<Review[]>;
}