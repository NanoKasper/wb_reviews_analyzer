#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { asProductId } from '../../domain/valueObjects/ProductId.js';
import { WbFeedbackGateway } from '../../public/index.js';
import { JsonFileReviewsSink } from '../../public/index.js';
import { FetchAllReviews } from '../../application/use-cases/FetchAllReviews.js';
import { SplitReviewsByPeriod } from '../../application/use-cases/SplitReviewPeriod.js';
import { createDateRangeFromDates, createDateRange } from '../../domain/valueObjects/DateRange.js';

interface CliOptions {
  productId: string;
  dateFrom?: string;
  dateTo?: string;
  output?: string;
  splitDays?: number;
  help?: boolean;
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    options: {
      productId: {
        type: 'string',
        short: 'p',
      },
      dateFrom: {
        type: 'string',
        short: 'f',
      },
      dateTo: {
        type: 'string',
        short: 't',
      },
      output: {
        type: 'string',
        short: 'o',
        default: './output',
      },
      splitDays: {
        type: 'string',
        short: 's',
        default: '90',
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    strict: true,
    allowPositionals: false,
  });

  return {
    productId: values.productId as string,
    dateFrom: values.dateFrom as string,
    dateTo: values.dateTo as string,
    output: values.output as string,
    splitDays: values.splitDays ? parseInt(values.splitDays as string, 10) : 90,
    help: values.help as boolean,
  };
}

function showHelp(): void {
  console.log(`
WB Reviews Fetcher - Fetch and split reviews by period

Usage:
  npm run dev -- --productId <id> [options]

Required:
  -p, --productId <id>     Product ID from Wildberries

Options:
  -f, --dateFrom <date>    Start date for collection (YYYY-MM-DD)
  -t, --dateTo <date>      End date for collection (YYYY-MM-DD)
  -s, --splitDays <days>   Days to split new/old reviews (default: 90)
  -o, --output <dir>       Output directory (default: ./output)
  -h, --help               Show this help message

Examples:
  npm run dev -- -p 12345678
  npm run dev -- -p 12345678 -s 30
  npm run dev -- -p 12345678 -f 2025-01-01 -t 2025-05-11 -s 15
  `);
}

async function main() {
  const options = parseCliArgs();

  if (options.help || !options.productId) {
    showHelp();
    process.exit(options.help ? 0 : 1);
  }

  try {
    const productId = asProductId(options.productId);
    
    console.log(`Fetching reviews for product: ${productId}`);
    console.log(`Split period: ${options.splitDays} days`);
    
    if (options.dateFrom && options.dateTo) {
        console.log(`Collection period: ${options.dateFrom} to ${options.dateTo}`);
    } else {
        console.log(`Collection period: All reviews`);  
    }
    
    console.log(`Output: ${options.output}`);
    console.log('─'.repeat(50));

    const gateway = new WbFeedbackGateway();
    const sink = new JsonFileReviewsSink(options.output);
    const fetchAllReviews = new FetchAllReviews(gateway, sink);
    const splitReviewsByPeriod = new SplitReviewsByPeriod();

    const startTime = Date.now();

    // Получаем все отзывы
    const allReviews = await fetchAllReviews.execute(productId);
    console.log(`Collected ${allReviews.length} total reviews`);

    let reviewsInRange = allReviews;

    // Если указаны даты, фильтруем отзывы по периоду
    if (options.dateFrom && options.dateTo) {
      const collectionRange = createDateRangeFromDates(options.dateFrom, options.dateTo);
      reviewsInRange = allReviews.filter(review => {
        const createdDate = review.get('createdDate') as string;
        if (!createdDate) return false;
        const reviewDate = new Date(createdDate);
        return reviewDate >= collectionRange.from && reviewDate <= collectionRange.to;
      });
      console.log(`Reviews in collection period: ${reviewsInRange.length}`);
    }

    // В блоке где разбиваем на старые и новые:
    let referenceDate: Date | undefined;

    if (options.dateFrom && options.dateTo) {
      const collectionRange = createDateRangeFromDates(options.dateFrom, options.dateTo);
      referenceDate = collectionRange.to; 
    }

    // Создаем период для разбиения (последние N дней от referenceDate)
    const splitDateRange = createDateRange(options.splitDays, referenceDate);
    console.log(`Split range (new=last ${options.splitDays} days from reference):
    ${splitDateRange.from.toISOString()} - ${splitDateRange.to.toISOString()}`);
    // Разбиваем на старые и новые
    const collection = splitReviewsByPeriod.execute({
      productId: options.productId,
      reviews: reviewsInRange,
      dateFrom: splitDateRange.from,
      dateTo: splitDateRange.to,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('─'.repeat(50));
    console.log('Statistics:');
    console.log(`  Total collected: ${allReviews.length}`);
    console.log(`  In collection period: ${reviewsInRange.length}`);
    console.log(`  New reviews (last ${options.splitDays} days): ${collection.statistics.newCount}`);
    console.log(`  Old reviews: ${collection.statistics.oldCount}`);
    console.log(`  Execution time: ${elapsed}s`);
    console.log('─'.repeat(50));

    // Сохраняем результаты
    await sink.saveCollection(productId, {
      productId: options.productId,
      collectionPeriod: options.dateFrom && options.dateTo 
        ? { from: options.dateFrom, to: options.dateTo }
        : { from: 'all', to: 'all' },
      splitPeriodDays: options.splitDays,
      totalInCollection: reviewsInRange.length,
      statistics: collection.statistics,
      newReviews: collection.newReviews.map(r => r.toJSON()),
      oldReviews: collection.oldReviews.map(r => r.toJSON()),
      exportedAt: new Date().toISOString(),
    }, '_collection');

    if (collection.newReviews.length > 0) {
      await sink.write(productId, collection.newReviews);
    }

    if (collection.oldReviews.length > 0) {
      await sink.saveCollection(
        asProductId(`${options.productId}_old`),
        {
          productId: options.productId,
          count: collection.oldReviews.length,
          reviews: collection.oldReviews.map(r => r.toJSON()),
          exportedAt: new Date().toISOString(),
        },
        '_old'
      );
    }

    console.log(`✅ Completed successfully`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();