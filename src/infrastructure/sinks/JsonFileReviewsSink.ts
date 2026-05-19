import { writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { ReviewsSink } from '../../application/ports/ReviewsSink.js';
import { ProductId } from '../../domain/valueObjects/ProductId.js';
import { Review } from '../../domain/entities/reviews.js';

export class JsonFileReviewsSink implements ReviewsSink {
  constructor(private readonly outputDir: string = './output') {}

  async write(productId: ProductId, reviews: Review[]): Promise<void> {
    await this.saveToFile(productId, reviews);
  }

  async save(productId: ProductId, reviews: Review[]): Promise<void> {
    await this.saveToFile(productId, reviews);
  }

  async saveCollection(productId: ProductId, data: any, suffix: string = ''): Promise<void> {
    const filename = `${this.outputDir}/reviews_${productId}${suffix}.json`;
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Saved to ${filename}`);
  }

  async saveAnalysis(productId: string, data: any, type: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.outputDir}/analysis_${productId}_${type}_${timestamp}.json`;
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Analysis saved to ${filename}`);
    return filename;
  }

  private async saveToFile(productId: ProductId, reviews: Review[]): Promise<void> {
    const output = {
      productId: productId,
      count: reviews.length,
      reviews: reviews.map(review => review.toJSON()),
      exportedAt: new Date().toISOString()
    };

    const filename = `${this.outputDir}/reviews_${productId}.json`;
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(filename, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`Reviews saved to ${filename}`);
  }
}