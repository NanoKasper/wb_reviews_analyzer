import { asProductId } from './domain/valueObjects/ProductId.js';
import { WbFeedbackGateway } from './public/index.js';
import { JsonFileReviewsSink } from './public/index.js';
import { FetchAllReviews } from './application/use-cases/FetchAllReviews.js';

async function main() {
  const productId = asProductId('');
  
  const gateway = new WbFeedbackGateway();
  const sink = new JsonFileReviewsSink('./reviews');
  const fetchAllReviews = new FetchAllReviews(gateway, sink);

  await fetchAllReviews.execute(productId);
}

main().catch(console.error);