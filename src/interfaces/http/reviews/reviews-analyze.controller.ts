import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { getLlmClient } from '../../../infrastructure/llm/llmClient';
import { AnalyzeReviews } from '../../../application/use-cases/analyzeReviews';
import { JsonFileReviewsSink } from '../../../infrastructure/sinks/JsonFileReviewsSink';
import { ReviewsStorageService } from '../../../infrastructure/persistance/reviews-storage.service';

@Controller('reviews/analyze')
export class ReviewsAnalyzeController {
  private readonly logger = new Logger(ReviewsAnalyzeController.name);
  private readonly sink: JsonFileReviewsSink;

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly storageService: ReviewsStorageService
  ) {
    this.sink = new JsonFileReviewsSink('./output');
  }

@Get()
async analyze(@Query() query: any) {
  const startTime = Date.now();
  const refresh = query.refresh === true || query.refresh === 'true';


    try {
    // Проверяем свежесть данных
    const lastCollection = await this.storageService.getLastCollectionTime(query.productId);
    const needsRefresh = lastCollection 
      ? await this.storageService.hasNewReviewsSince(query.productId, lastCollection)
      : true;

    // Если данные устарели - принудительно обновляем
    if (needsRefresh) {
      this.logger.log('Data may be stale, forcing refresh');
    }
    const result = await this.reviewsService.fetchReviews(query);

    if (result.totalCount === 0) {
      return { success: true, data: { message: 'No reviews', newReviews: [], oldReviews: [] } };
    }

    // проверка кэша
    const processorVersion = process.env.LLM_MODEL || 'unknown';
    const inputData = {
      productId: query.productId,
      dateFrom: query.dateFrom || 'all',
      dateTo: query.dateTo || 'all',
      splitDays: String(query.splitDays || 90),
      totalReviews: String(result.totalCount),
      newCount: String(result.statistics.newCount),
      oldCount: String(result.statistics.oldCount),
    };
    
    const inputHash = this.storageService.computeInputHash(inputData);
    
    this.logger.log(`Looking for cached result: hash=${inputHash}`);
    
    // Ищем в кэше
    if (!refresh) {
    const cached = await this.storageService.findProcessingResult(
      'reviews.full_analysis',
      processorVersion,
      query.productId,
      inputHash,
    );

    // если нашли в кэше возвращаем
    if (cached?.result) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`Cache hit! Returning cached result in ${elapsed}s`);
      
      return {
        success: true,
        data: {
          ...cached.result,
          executionTime: `${elapsed}s`,
          fromCache: true,
        },
      };
    }
  }

    // если нет, анализ
    this.logger.log('Cache miss. Running analysis...');
    
    const llmClient = getLlmClient();
    const analyzer = new AnalyzeReviews(llmClient);
    const analysis = await analyzer.fullAnalysis(
      result.newReviews,
      result.oldReviews,
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const responseData = {
      productId: result.productId,
      collectionPeriod: { from: result.collectionPeriodFrom, to: result.collectionPeriodTo },
      splitPeriod: { days: query.splitDays || 90, from: result.splitPeriodFrom, to: result.splitPeriodTo },
      statistics: result.statistics,
      ratingChange: analysis.ratingChange,
      oldReviews: analysis.oldReviewsSummary,
      newReviews: analysis.newReviewsSummary,
      differences: analysis.differences,
      executionTime: `${elapsed}s`,
      metadata: {
        model: processorVersion,
        analyzedAt: new Date().toISOString(),
        totalReviews: result.totalCount,
      },
    };

    // сохраняем в кэш
    this.logger.log('Saving result to cache...');
    await this.storageService.saveProcessingResult({
      scope: 'product',
      productId: query.productId,
      inputHash,
      processorName: 'reviews.full_analysis',
      processorVersion,
      result: responseData,
      status: 'completed',
    });
    this.logger.log('Result cached for future requests');

    // Сохраняем в файл
    try {
      await this.sink.saveAnalysis(query.productId, responseData, 'full_analysis');
    } catch (saveError) {
      this.logger.error('Failed to save analysis:', saveError);
    }

    return { success: true, data: { ...responseData, fromCache: false } };
  } catch (error) {
      this.logger.error('Error:', error);
      
      // При любой ошибке возвращаем пустой результат
      return {
        success: true,
        data: {
          productId: query.productId || 'unknown',
          message: error instanceof Error ? error.message : 'Analysis failed',
          statistics: null,
          newReviews: [],
          oldReviews: [],
          differences: null,
        },
      };
    }
  }
}
