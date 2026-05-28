import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReviewEntity } from './entities/review.entity';
import { ProcessingResultEntity } from './entities/processing-result.entity';
import { ReviewsStorageService } from './reviews-storage.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5433),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'wb_reviews'),
        entities: [ReviewEntity, ProcessingResultEntity],
        synchronize: configService.get('TYPEORM_SYNCHRONIZE', 'true') === 'true',
        logging: configService.get('TYPEORM_LOGGING', 'false') === 'true',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([ReviewEntity, ProcessingResultEntity]),
  ],
  providers: [ReviewsStorageService],
  exports: [ReviewsStorageService],
})
export class PersistenceModule {}