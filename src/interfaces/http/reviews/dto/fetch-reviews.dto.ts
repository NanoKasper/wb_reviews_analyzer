import { IsString, Matches, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FetchReviewsDto {
  @IsString()
  productId: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be in YYYY-MM-DD format' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be in YYYY-MM-DD format' })
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  splitDays?: number = 90;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  take?: number = 100;
}