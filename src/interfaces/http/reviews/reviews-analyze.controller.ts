import { Controller, Get, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { getLlmClient } from '../../../infrastructure/llm/llmClient';
import { AnalyzeReviews } from '../../../application/use-cases/analyzeReviews';
import { JsonFileReviewsSink } from '../../../infrastructure/sinks/JsonFileReviewsSink';

@Controller('reviews/analyze')
export class ReviewsAnalyzeController {
  private readonly logger = new Logger(ReviewsAnalyzeController.name);
  private readonly sink: JsonFileReviewsSink;

  constructor(private readonly reviewsService: ReviewsService) {
    this.sink = new JsonFileReviewsSink('./output');
  }

  @Get()
  async analyze(@Query() query: any) {
    const startTime = Date.now();

    try {
      const result = await this.reviewsService.fetchReviews(query);

      // Если отзывов нет - возвращаем пустой результат
      if (result.totalCount === 0 || (result.newReviews.length === 0 && result.oldReviews.length === 0)) {
        return {
          success: true,
          data: {
            productId: query.productId || 'unknown',
            message: 'No reviews found for this product',
            statistics: result.statistics,
            newReviews: [],
            oldReviews: [],
            differences: null,
          },
        };
      }

      // Если есть отзывы - делаем анализ
      if (result.newReviews.length > 0 || result.oldReviews.length > 0) {
        const llmClient = getLlmClient();
        const analyzer = new AnalyzeReviews(llmClient);

        const analysis = await analyzer.fullAnalysis(
          result.newReviews,
          result.oldReviews,
          'новые',
          'старые'
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        const responseData = {
          productId: result.productId,
          collectionPeriod: {
            from: result.collectionPeriodFrom,
            to: result.collectionPeriodTo,
          },
          splitPeriod: {
            days: query.splitDays || 90,
            from: result.splitPeriodFrom,
            to: result.splitPeriodTo,
          },
          statistics: result.statistics,
          ratingChange: analysis.ratingChange,
          oldReviews: analysis.oldReviewsSummary,
          newReviews: analysis.newReviewsSummary,
          differences: analysis.differences,
          executionTime: `${elapsed}s`,
          metadata: {
            model: process.env.LLM_MODEL || 'gpt-oss',
            analyzedAt: new Date().toISOString(),
            totalReviews: result.totalCount,
          },
        };

        // Сохраняем
        try {
          await this.sink.saveAnalysis(query.productId, responseData, 'full_analysis');
        } catch (saveError) {
          this.logger.error('Failed to save analysis:', saveError);
        }

        return { success: true, data: responseData };
      }

      // Fallback
      return {
        success: true,
        data: {
          productId: query.productId || 'unknown',
          statistics: result.statistics,
          newReviews: [],
          oldReviews: [],
          differences: null,
        },
      };
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