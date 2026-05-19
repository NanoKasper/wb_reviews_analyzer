import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsAnalyzeController } from './reviews-analyze.controller';

@Module({
  controllers: [
    ReviewsController,
    ReviewsAnalyzeController

  ],

  providers: [ReviewsService,

  ],
  exports: [ReviewsService],
})
export class ReviewsModule {
  private readonly logger = new Logger(ReviewsModule.name);
  
  constructor() {
    this.logger.log('ReviewsModule initialized');
  }
}