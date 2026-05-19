import { ProductId } from '../../domain/valueObjects/ProductId.js';
import { Review } from '../../domain/entities/reviews.js';

export interface ReviewsSink {
  save(productId: ProductId, reviews: Review[]): Promise<void>;
}