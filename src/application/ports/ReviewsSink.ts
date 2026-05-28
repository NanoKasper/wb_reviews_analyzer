import { ProductId } from '../../domain/valueObjects/ProductId';
import { Review } from '../../domain/entities/reviews';

export interface ReviewsSink {
  save(productId: ProductId, reviews: Review[]): Promise<void>;
}