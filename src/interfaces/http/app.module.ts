import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReviewsModule } from './reviews/reviews.module';
import { PersistenceModule } from '../../infrastructure/persistance/persisstence.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    ReviewsModule,
  PersistenceModule],
})
export class AppModule {}