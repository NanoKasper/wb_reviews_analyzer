import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsAnalyzeController } from './reviews-analyze.controller';
import { PersistenceModule } from '../../../infrastructure/persistance/persisstence.module';

@Module({
  imports: [PersistenceModule],
  
  controllers: [
    ReviewsController,
    ReviewsAnalyzeController],

  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}