import { ProductId } from '../../domain/valueObjects/ProductId';
import { Review } from '../../domain/entities/reviews';


export interface ReviewGateway {
  fetchReviews(productId: ProductId, skip: number, take: number): Promise<Review[]>;
}