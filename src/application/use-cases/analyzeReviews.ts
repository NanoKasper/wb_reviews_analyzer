import { LlmClient } from "../../infrastructure/llm/llmClient";

// Интерфейсы
export interface ReviewSummary {
  period: { from: string; to: string; };
  totalReviews: number;
  summary: string;
  pros: string[];
  cons: string[];
  commonIssues: Array<{
    issue: string;
    frequency: string;
    examples: string[];
  }>;
  averageRating?: number;
}

export interface ReviewComparison {
  newPeriod: { from: string; to: string; count: number; };
  oldPeriod: { from: string; to: string; count: number; };
  oldReviewsSummary: ReviewSummary;
  newReviewsSummary: ReviewSummary;
  differences: {
    newIssues: string[];
    resolvedIssues: string[];
    increasedIssues: string[];
    decreasedIssues: string[];
    stableIssues: string[];
    overallChanges: string;
  };
  ratingChange?: { old: number; new: number; difference: number; };
}

export class AnalyzeReviews {
  private readonly BATCH_SIZE = 50;
  private readonly MAX_TEXT_LENGTH = 1550;

  constructor(private readonly llmClient: LlmClient) {}

  /**
   * Полный анализ: сводка по старым, новым и сравнение
   */
  async fullAnalysis(
    newReviews: any[],
    oldReviews: any[],
    newPeriodLabel: string = 'новые',
    oldPeriodLabel: string = 'старые'
  ): Promise<ReviewComparison> {
    const plainNew = this.toPlainReviews(newReviews);
    const plainOld = this.toPlainReviews(oldReviews);

    const newWithText = this.filterWithText(plainNew);
    const oldWithText = this.filterWithText(plainOld);

    console.log(`Full analysis: ${oldWithText.length} old + ${newWithText.length} new reviews with text`);

    const newRating = this.calcAvgRating(plainNew);
    const oldRating = this.calcAvgRating(plainOld);

    if (newWithText.length === 0 && oldWithText.length === 0) {
      return this.emptyResult(plainNew, plainOld, newRating, oldRating);
    }

    try {
      // Шаг 1: Анализируем старые отзывы по батчам
      console.log('\n=== Analyzing OLD reviews ===');
      const oldSummary = await this.batchSummarize(oldWithText, oldPeriodLabel);

      // Шаг 2: Анализируем новые отзывы по батчам
      console.log('\n=== Analyzing NEW reviews ===');
      const newSummary = await this.batchSummarize(newWithText, newPeriodLabel);

      // Шаг 3: Сравниваем сводки
      console.log('\n=== Comparing summaries ===');
      const differences = await this.compareSummaries(
        oldSummary, newSummary,
        oldWithText.length, newWithText.length
      );

      return {
        newPeriod: {
          from: this.dateRange(plainNew).from,
          to: this.dateRange(plainNew).to,
          count: newReviews.length,
        },
        oldPeriod: {
          from: this.dateRange(plainOld).from,
          to: this.dateRange(plainOld).to,
          count: oldReviews.length,
        },
        oldReviewsSummary: {
          ...oldSummary,
          totalReviews: oldReviews.length,
          averageRating: oldRating,
        },
        newReviewsSummary: {
          ...newSummary,
          totalReviews: newReviews.length,
          averageRating: newRating,
        },
        differences,
        ratingChange: {
          old: oldRating,
          new: newRating,
          difference: Math.round((newRating - oldRating) * 10) / 10,
        },
      };
    } catch (error) {
      console.error('Full analysis failed:', error);
      return this.fallbackResult(plainNew, plainOld, newWithText, oldWithText, newRating, oldRating);
    }
  }

  /**
   * Сводка по одной группе отзывов
   */
  async summarize(
    reviews: any[],
    periodLabel: string
  ): Promise<ReviewSummary> {
    const plain = this.toPlainReviews(reviews);
    const withText = this.filterWithText(plain);
    const rating = this.calcAvgRating(plain);

    if (withText.length === 0) {
      return {
        period: this.dateRange(plain),
        totalReviews: reviews.length,
        summary: 'Нет отзывов с текстом',
        pros: [],
        cons: [],
        commonIssues: [],
        averageRating: rating,
      };
    }

    const summary = await this.batchSummarize(withText, periodLabel);
    return {
      ...summary,
      totalReviews: reviews.length,
      averageRating: rating,
    };
  }

  /**
   * Батч-анализ: разбиваем на батчи, анализируем каждый, объединяем
   */
  private async batchSummarize(reviews: any[], label: string): Promise<{
    period: { from: string; to: string };
    summary: string;
    pros: string[];
    cons: string[];
    commonIssues: Array<{ issue: string; frequency: string; examples: string[] }>;
  }> {
    const batches: any[][] = [];
    
    // Разбиваем на батчи
    for (let i = 0; i < reviews.length; i += this.BATCH_SIZE) {
      batches.push(reviews.slice(i, i + this.BATCH_SIZE));
    }

    console.log(`Split ${reviews.length} reviews into ${batches.length} batches of ${this.BATCH_SIZE}`);

    // Если всего один батч - анализируем напрямую
    if (batches.length === 1) {
      return await this.analyzeBatch(batches[0], label);
    }

    // Анализируем каждый батч
    const batchResults = [];
    for (let i = 0; i < batches.length; i++) {
      console.log(`\n--- Batch ${i + 1}/${batches.length} (${batches[i].length} reviews) ---`);
      try {
        const result = await this.analyzeBatch(batches[i], `${label} (часть ${i + 1})`);
        batchResults.push(result);
      } catch (error) {
        console.error(`Batch ${i + 1} failed:`, error);
      }
      
      // Задержка между батчами чтобы не превысить лимиты API
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Объединяем результаты всех батчей
    return this.mergeBatchResults(batchResults, reviews);
  }

  /**
   * Анализ одного батча
   */
  private async analyzeBatch(reviews: any[], label: string): Promise<{
  period: { from: string; to: string };
  pros: string[];
  cons: string[];
  commonIssues: Array<{ issue: string; frequency: string; examples: string[] }>;
  summary: string;
}> {
  const reviewsText = reviews
    .map((r, i) => {
      const rating = r.productValuation || r.rating || '?';
      const text = (r.text || '').trim().replace(/\n/g, ' ').substring(0, this.MAX_TEXT_LENGTH);
      return `${i + 1}. [${rating}/5] ${text}`;
    })
    .join('\n');

  const systemPrompt = `Ты анализатор отзывов. Отвечай только валидным JSON, без текста до или после. Формат:
{
  "pros": ["плюс1", "плюс2"],
  "cons": ["минус1", "минус2"],
  "common_issues": [
    {"issue": "проблема", "frequency": "часто/средне/редко", "examples": ["пример из отзыва"]}
  ],
  "summary": "краткая сводка 1-2 предложения"
}
Максимум 5 пунктов в каждом списке. Пиши на русском.`;

  const userPrompt = `Проанализируй эти ${label} отзывы (${reviews.length} шт.):\n\n${reviewsText}\n\nОтветь ТОЛЬКО JSON:`;

  const response = await this.llmClient.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.1, maxTokens: 4096 }
  );

  const json = this.extractJson(response.content);
  
  if (!json) {
    console.log('Failed to parse JSON for batch, using empty result');
    return {
      period: this.dateRange(reviews),
      pros: [],
      cons: [],
      commonIssues: [],
      summary: '',
    };
  }

  return {
    period: this.dateRange(reviews),
    pros: Array.isArray(json.pros) ? json.pros.slice(0, 5) : [],
    cons: Array.isArray(json.cons) ? json.cons.slice(0, 5) : [],
    commonIssues: Array.isArray(json.common_issues) ? json.common_issues.slice(0, 5) : [],
    summary: json.summary || '',
  };
}

  /**
   * Объединение результатов батчей
   */
private mergeBatchResults(batchResults: any[], allReviews: any[]): {
  period: { from: string; to: string };
  summary: string;
  pros: string[];
  cons: string[];
  commonIssues: Array<{ issue: string; frequency: string; examples: string[] }>;
} {
  const allPros: string[] = [];
  const allCons: string[] = [];
  const allIssues: any[] = [];
  const summaries: string[] = [];

  for (const batch of batchResults) {
    if (batch.pros) allPros.push(...batch.pros);
    if (batch.cons) allCons.push(...batch.cons);
    if (batch.commonIssues) allIssues.push(...batch.commonIssues);
    if (batch.summary) summaries.push(batch.summary);
  }

  const uniquePros = this.deduplicate(allPros, 5);
  const uniqueCons = this.deduplicate(allCons, 5);
  const uniqueIssues = this.deduplicateIssues(allIssues, 5);

  const finalSummary = summaries.length > 0
    ? summaries.join(' ')
    : `Проанализировано ${allReviews.length} отзывов`;

  return {
    period: this.dateRange(allReviews),
    summary: finalSummary,
    pros: uniquePros,
    cons: uniqueCons,
    commonIssues: uniqueIssues,
  };
}

  /**
   * Сравнение двух сводок
   */
  private async compareSummaries(
    oldSummary: any,
    newSummary: any,
    oldCount: number,
    newCount: number
  ): Promise<ReviewComparison['differences']> {
    const prompt = `Сравни сводки старых и новых отзывов.

СТАРЫЕ (${oldCount} отзывов):
Плюсы: ${(oldSummary.pros || []).join(', ') || 'нет'}
Минусы: ${(oldSummary.cons || []).join(', ') || 'нет'}
Проблемы: ${(oldSummary.commonIssues || []).map((i: any) => i.issue).join(', ') || 'нет'}

НОВЫЕ (${newCount} отзывов):
Плюсы: ${(newSummary.pros || []).join(', ') || 'нет'}
Минусы: ${(newSummary.cons || []).join(', ') || 'нет'}
Проблемы: ${(newSummary.commonIssues || []).map((i: any) => i.issue).join(', ') || 'нет'}

Ответь ТОЛЬКО JSON:
{
  "new_issues": ["появившаяся проблема"],
  "resolved_issues": ["исчезнувшая проблема"],
  "increased_issues": ["усилившаяся проблема"],
  "decreased_issues": ["уменьшившаяся проблема"],
  "stable_issues": ["стабильная проблема"],
  "overall_changes": "краткое описание 1-2 предложения"
}`;

    try {
      const response = await this.llmClient.chat(
        [
          { role: 'system', content: 'Отвечай только JSON. Пиши на русском.' },
          { role: 'user', content: prompt }
        ],
        { temperature: 0.1, maxTokens: 800 }
      );

      const json = this.extractJson(response.content);
      
      if (!json) {
        return {
          newIssues: [],
          resolvedIssues: [],
          increasedIssues: [],
          decreasedIssues: [],
          stableIssues: [],
          overallChanges: `Сравнение ${oldCount} старых и ${newCount} новых отзывов`,
        };
      }

      return {
        newIssues: json.new_issues || [],
        resolvedIssues: json.resolved_issues || [],
        increasedIssues: json.increased_issues || [],
        decreasedIssues: json.decreased_issues || [],
        stableIssues: json.stable_issues || [],
        overallChanges: json.overall_changes || '',
      };
    } catch (error) {
      console.error('Comparison failed:', error);
      return {
        newIssues: [],
        resolvedIssues: [],
        increasedIssues: [],
        decreasedIssues: [],
        stableIssues: [],
        overallChanges: 'Не удалось выполнить сравнение',
      };
    }
  }

  // ========== Вспомогательные методы ==========

  private toPlainReviews(reviews: any[]): any[] {
    return reviews.map(r => 
      typeof r.toJSON === 'function' ? r.toJSON() : r
    );
  }

  private filterWithText(reviews: any[]): any[] {
    return reviews.filter(r => {
      const text = (r.text || r.description || '').trim();
      return text.length > 10;
    });
  }

  private calcAvgRating(reviews: any[]): number {
    const ratings = reviews
      .map(r => Number(r.productValuation || r.rating || 0))
      .filter(r => r > 0);
    
    return ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
      : 0;
  }

  private dateRange(reviews: any[]): { from: string; to: string } {
    const dates = reviews.map(r => r.createdDate).filter(d => d).sort();
    return {
      from: dates[0] ? new Date(dates[0]).toISOString().split('T')[0] : '',
      to: dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString().split('T')[0] : '',
    };
  }

  private extractJson(content: string): any {
    try {
      // Ищем JSON в блоке кода
      const blockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (blockMatch) return JSON.parse(blockMatch[1]);

      // Ищем JSON объект
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;

      let json = match[0]
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private deduplicate(items: string[], max: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    
    for (const item of items) {
      const normalized = item.toLowerCase().trim();
      // Проверяем, нет ли уже похожего
      const isDuplicate = [...seen].some(s => 
        s.includes(normalized) || normalized.includes(s)
      );
      
      if (!isDuplicate) {
        seen.add(normalized);
        result.push(item);
        if (result.length >= max) break;
      }
    }
    
    return result;
  }

  private deduplicateIssues(issues: any[], max: number): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    
    for (const issue of issues) {
      const key = (issue.issue || '').toLowerCase().trim();
      const isDuplicate = [...seen].some(s => 
        s.includes(key) || key.includes(s)
      );
      
      if (!isDuplicate && key) {
        seen.add(key);
        result.push(issue);
        if (result.length >= max) break;
      }
    }
    
    return result;
  }

  private emptyResult(
    newReviews: any[], oldReviews: any[],
    newRating: number, oldRating: number
  ): ReviewComparison {
    return {
      newPeriod: { ...this.dateRange(newReviews), count: newReviews.length },
      oldPeriod: { ...this.dateRange(oldReviews), count: oldReviews.length },
      oldReviewsSummary: { period: this.dateRange(oldReviews), totalReviews: oldReviews.length, summary: '', pros: [], cons: [], commonIssues: [], averageRating: oldRating },
      newReviewsSummary: { period: this.dateRange(newReviews), totalReviews: newReviews.length, summary: '', pros: [], cons: [], commonIssues: [], averageRating: newRating },
      differences: { newIssues: [], resolvedIssues: [], increasedIssues: [], decreasedIssues: [], stableIssues: [], overallChanges: 'Недостаточно данных' },
      ratingChange: { old: oldRating, new: newRating, difference: Math.round((newRating - oldRating) * 10) / 10 },
    };
  }

  private fallbackResult(
    newReviews: any[], oldReviews: any[],
    newSample: any[], oldSample: any[],
    newRating: number, oldRating: number
  ): ReviewComparison {
    const diff = Math.round((newRating - oldRating) * 10) / 10;
    const text = diff > 0 ? `выросла на ${diff}` : diff < 0 ? `снизилась на ${Math.abs(diff)}` : 'не изменилась';

    return {
      newPeriod: { ...this.dateRange(newReviews), count: newReviews.length },
      oldPeriod: { ...this.dateRange(oldReviews), count: oldReviews.length },
      oldReviewsSummary: { period: this.dateRange(oldReviews), totalReviews: oldReviews.length, summary: '', pros: [], cons: [], commonIssues: [], averageRating: oldRating },
      newReviewsSummary: { period: this.dateRange(newReviews), totalReviews: newReviews.length, summary: '', pros: [], cons: [], commonIssues: [], averageRating: newRating },
      differences: {
        newIssues: [], resolvedIssues: [], increasedIssues: [], decreasedIssues: [], stableIssues: [],
        overallChanges: `Средняя оценка ${text} балла. Проанализировано ${oldSample.length} старых и ${newSample.length} новых отзывов.`,
      },
      ratingChange: { old: oldRating, new: newRating, difference: diff },
    };
  }
}