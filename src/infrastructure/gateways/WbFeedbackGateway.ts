import { ReviewGateway } from '../../application/ports/ReviewGateway';
import { ProductId } from '../../domain/valueObjects/ProductId';
import { Review } from '../../domain/entities/reviews';
import { httpClient } from '../config/https';
import { AxiosError } from 'axios';

export class WbFeedbackGateway implements ReviewGateway {
  private readonly baseUrl = 'https://feedbacks1.wb.ru';
  private readonly maxRetries = 2;

  async fetchReviews(productId: ProductId, skip: number, take: number): Promise<Review[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`Fetching reviews: productId=${productId}, skip=${skip}, take=${take} (attempt ${attempt}/${this.maxRetries})`);

        const url = `${this.baseUrl}/feedbacks/v2/${productId}`;
             
        const response = await httpClient.get(url, {
          params: {
            skip,
            take,
            sort: 'dateDesc'
          },
          timeout: 15000,
        });

        if (!response || !response.data) {
          console.warn(`Empty response for product ${productId}`);
          return [];
        }

        const data = response.data;

        // Проверяем структуру
        if (!data || !data.feedbacks) {
          console.warn(`No feedbacks field in response for product ${productId}`);
          return [];
        }

        if (!Array.isArray(data.feedbacks)) {
          console.warn(`Feedbacks is not an array for product ${productId}`);
          return [];
        }

        const reviews = data.feedbacks
          .filter((raw: unknown) => raw && typeof raw === 'object')
          .map((raw: Record<string, unknown>) => new Review(raw));

        console.log(`Fetched ${reviews.length} reviews`);
        return reviews;

      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof AxiosError) {
          const status = error.response?.status;
          
          // 404 - товар не найден
          if (status === 404) {
            console.warn(`Product ${productId} not found (404)`);
            return [];
          }
          
          // 5xx - ошибка сервера
          if (status && status >= 500) {
            console.warn(`Server error ${status} for product ${productId}`);
            if (attempt < this.maxRetries) {
              await this.delay(2000);
              continue;
            }
            return [];
          }
          
          // Таймаут
          if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            console.warn(`Timeout for product ${productId}`);
            if (attempt < this.maxRetries) {
              await this.delay(1000);
              continue;
            }
            return [];
          }
        }

        console.error(`Error fetching reviews for ${productId}:`, error instanceof Error ? error.message : error);
        return [];
      }
    }

    console.error(`All attempts failed for product ${productId}`);
    return [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}