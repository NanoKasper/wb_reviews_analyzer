import { asProductId } from '../domain/valueObjects/ProductId';
import { WbFeedbackGateway } from '../public';

async function testPagination() {
  const gateway = new WbFeedbackGateway();
  const productId = asProductId('628460737');

  console.log('Testing pagination limits...\n');

  // Тестируем разные значения skip
  for (const skip of [0, 100, 500, 1000, 1500, 2000]) {
    try {
      const reviews = await gateway.fetchReviews(productId, skip, 30);
      console.log(`skip=${skip}: Got ${reviews.length} reviews`);
      
      if (reviews.length > 0) {
        console.log(`  First review id: ${reviews[0].get('id')}`);
        console.log(`  Last review id: ${reviews[reviews.length - 1].get('id')}`);
      }
    } catch (error) {
      console.log(`skip=${skip}: ERROR - ${error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

testPagination();