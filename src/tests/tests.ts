import { asProductId } from '../domain/valueObjects/ProductId.js';
import { WbFeedbackGateway } from '../public/index.js';
import { JsonFileReviewsSink } from '../public/index.js';
import { FetchAllReviews } from '../application/use-cases/FetchAllReviews.js';
import {
  InvalidProductIdError,
  EmptyResponseError,
  SourceServerError,
  SourceClientError,
  InvalidResponseStructureError,
  NetworkError,
  DataCollectionError,
  DomainError
} from '../domain/errors/Domainerrors.js';

// Мок для тестирования ошибок
class MockErrorGateway extends WbFeedbackGateway {
  private errorType: string;
  private failOnPage: number;
  private pageCount: number = 0;

  constructor(errorType: string, failOnPage: number = 1) {
    super();
    this.errorType = errorType;
    this.failOnPage = failOnPage;
  }

  async fetchReviews(productId: any, skip: number, take: number): Promise<any[]> {
    this.pageCount++;

    // Имитация разных типов ошибок
    if (this.pageCount >= this.failOnPage) {
      switch (this.errorType) {
        case 'empty':
          return [];
        
        case 'invalid-structure':
          // Возвращаем данные с неправильной структурой
          throw new InvalidResponseStructureError(productId, 'Unexpected response format');
        
        case 'server-error':
          throw new SourceServerError(productId, 500);
        
        case 'client-error':
          throw new SourceClientError(productId, 404);
        
        case 'network-error':
          const error = new Error('ECONNABORTED');
          (error as any).code = 'ECONNABORTED';
          throw error;
        
        case 'timeout':
          const timeoutError = new Error('ETIMEDOUT');
          (timeoutError as any).code = 'ETIMEDOUT';
          throw timeoutError;
        
        default:
          throw new Error('Unknown error type');
      }
    }

    // Нормальный ответ для первых страниц
    return [
      { id: `review-${skip + 1}`, text: 'Test review 1', rating: 5 },
      { id: `review-${skip + 2}`, text: 'Test review 2', rating: 4 }
    ];
  }
}

// Тесты ошибок
async function testInvalidProductId() {
  console.log('\n📋 Test 1: Invalid Product ID');
  try {
    asProductId('');
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof InvalidProductIdError) {
      console.log('✅ Passed:', error.message);
    } else {
      console.log('❌ Failed: Wrong error type');
    }
  }

  try {
    asProductId('abc123');
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof InvalidProductIdError) {
      console.log('✅ Passed:', error.message);
    } else {
      console.log('❌ Failed: Wrong error type');
    }
  }
}

async function testEmptyResponse() {
  console.log('\n📋 Test 2: Empty Response');
  const gateway = new MockErrorGateway('empty');
  const sink = new JsonFileReviewsSink('./test-output');
  const fetcher = new FetchAllReviews(gateway, sink);

  try {
    await fetcher.execute(asProductId('12345'));
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof EmptyResponseError) {
      console.log('✅ Passed:', error.message);
    } else {
      console.log('❌ Failed: Wrong error type', error);
    }
  }
}

async function testInvalidStructure() {
  console.log('\n📋 Test 3: Invalid Response Structure');
  const gateway = new MockErrorGateway('invalid-structure');
  const sink = new JsonFileReviewsSink('./test-output');
  const fetcher = new FetchAllReviews(gateway, sink);

  try {
    await fetcher.execute(asProductId('12345'));
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof InvalidResponseStructureError) {
      console.log('✅ Passed:', error.message);
    } else {
      console.log('❌ Failed: Wrong error type', error);
    }
  }
}

async function testPartialCollection() {
  console.log('\n📋 Test 4: Partial Collection (error on page 3)');
  const gateway = new MockErrorGateway('server-error', 3);
  const sink = new JsonFileReviewsSink('./test-output');
  const fetcher = new FetchAllReviews(gateway, sink);

  try {
    await fetcher.execute(asProductId('12345'));
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof DataCollectionError) {
      console.log('✅ Passed:', error.message);
      console.log('   Partial data should be saved to ./test-output/');
    } else {
      console.log('❌ Failed: Wrong error type', error);
    }
  }
}

async function testSourceClientError() {
  console.log('\n📋 Test 5: Source Client Error (404)');
  const gateway = new MockErrorGateway('client-error');
  const sink = new JsonFileReviewsSink('./test-output');
  const fetcher = new FetchAllReviews(gateway, sink);

  try {
    await fetcher.execute(asProductId('12345'));
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof SourceClientError) {
      console.log('✅ Passed:', error.message);
    } else {
      console.log('❌ Failed: Wrong error type', error);
    }
  }
}

async function testServerError() {
  console.log('\n📋 Test 6: Server Error (500)');
  const gateway = new MockErrorGateway('server-error');
  const sink = new JsonFileReviewsSink('./test-output');
  const fetcher = new FetchAllReviews(gateway, sink);

  try {
    await fetcher.execute(asProductId('12345'));
    console.log('❌ Failed: Should have thrown error');
  } catch (error) {
    if (error instanceof SourceServerError) {
      console.log('✅ Passed:', error.message);
    } else {
      console.log('❌ Failed: Wrong error type', error);
    }
  }
}

async function testSuccessfulFetch() {
  console.log('\n📋 Test 7: Successful Fetch');
  class SuccessGateway extends WbFeedbackGateway {
    private callCount = 0;
    
    async fetchReviews(productId: any, skip: number, take: number): Promise<any[]> {
      this.callCount++;
      
      // Возвращаем 2 страницы по 2 отзыва, потом пустую
      if (this.callCount <= 2) {
        return [
          { id: `review-${skip + 1}`, text: 'Test review', rating: 5 },
          { id: `review-${skip + 2}`, text: 'Test review', rating: 4 }
        ];
      }
      return [];
    }
  }

  const gateway = new SuccessGateway();
  const sink = new JsonFileReviewsSink('./test-output');
  const fetcher = new FetchAllReviews(gateway, sink);

  try {
    const reviews = await fetcher.execute(asProductId('12345'));
    if (reviews.length === 4) {
      console.log('✅ Passed: Successfully fetched 4 reviews');
    } else {
      console.log(`❌ Failed: Expected 4 reviews, got ${reviews.length}`);
    }
  } catch (error) {
    console.log('❌ Failed: Should not have thrown error', error);
  }
}

// Запуск всех тестов
async function runAllTests() {
  console.log('🧪 Running Error Handling Tests\n');
  console.log('='.repeat(50));

  try {
    await testInvalidProductId();
    await testEmptyResponse();
    await testInvalidStructure();
    await testPartialCollection();
    await testSourceClientError();
    await testServerError();
    await testSuccessfulFetch();

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
  }
}

runAllTests();