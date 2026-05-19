export { asProductId } from '../domain/valueObjects/ProductId.js';
export { Review } from '../domain/entities/reviews.js'
export { WbFeedbackGateway } from '../infrastructure/gateways/WbFeedbackGateway.js'
export { JsonFileReviewsSink } from '../infrastructure/sinks/JsonFileReviewsSink.js'
export { FetchAllReviews } from '../application/use-cases/FetchAllReviews.js';
export type { ReviewGateway } from '../application/ports/ReviewGateway.js';
export type { ReviewsSink } from '../application/ports/ReviewsSink.js';
export type { ProductId } from '../domain/valueObjects/ProductId.js';