import { LlmClient } from "../../infrastructure/llm/llmClient";
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
  private readonly MAX_TEXT_LENGTH = 500; // Длина одного отзыва

  constructor(private readonly llmClient: LlmClient) {}

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

    console.log(`Analysis: ${oldWithText.length} old + ${newWithText.length} new reviews with text`);

    const newRating = this.calcAvgRating(plainNew);
    const oldRating = this.calcAvgRating(plainOld);

    if (newWithText.length === 0 && oldWithText.length === 0) {
      return this.emptyResult(plainNew, plainOld, newRating, oldRating);
    }

    try {
      // Отправляем ВСЕ отзывы с текстом
      const oldText = this.formatReviews(oldWithText);
      const newText = this.formatReviews(newWithText);

      console.log(`Sending ALL reviews: ${oldWithText.length} old + ${newWithText.length} new`);
      console.log(`Old text length: ${oldText.length} chars`);
      console.log(`New text length: ${newText.length} chars`);

      const systemPrompt = `Ты — система аналитики отзывов. Проведи анализ и верни ТОЛЬКО JSON, без текста до или после.

Формат ответа:
{
  "old_reviews_summary": {
    "pros": ["плюс1", "плюс2"],
    "cons": ["минус1", "минус2"],
    "common_issues": [
      {"issue": "проблема", "frequency": "часто/средне/редко", "examples": ["цитата из отзыва"]}
    ],
    "summary": "краткая сводка 2-3 предложения"
  },
  "new_reviews_summary": {
    "pros": [], "cons": [], "common_issues": [], "summary": ""
  },
  "differences": {
    "new_issues": ["появившаяся проблема"],
    "resolved_issues": ["исчезнувшая проблема"],
    "increased_issues": ["усилившаяся проблема"],
    "decreased_issues": ["ослабшая проблема"],
    "stable_issues": ["стабильная проблема"],
    "overall_changes": "общее описание изменений 2-3 предложения"
  }
}

Правила:
- Максимум 10 пунктов в каждом списке
- Пиши на русском языке
- Основывайся ТОЛЬКО на переданных отзывах
- Не придумывай факты`;

      const userPrompt = `СТАРЫЕ отзывы (${oldWithText.length} шт.):
${oldText}

НОВЫЕ отзывы (${newWithText.length} шт.):
${newText}

Ответь ТОЛЬКО JSON:`;

      console.log(`Total prompt size: ${(systemPrompt + userPrompt).length} chars`);

      const response = await this.llmClient.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        { temperature: 0.2, maxTokens: 4000 }
      );

      console.log('Response received, length:', response.content.length);
      console.log('First 300 chars:', response.content.substring(0, 300));

      const analysis = this.extractJson(response.content);

      if (!analysis) {
        console.log('Failed to parse JSON, using fallback');
        return this.fallbackResult(plainNew, plainOld, oldWithText, newWithText, newRating, oldRating);
      }

      console.log('Successfully parsed JSON');

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
          ...this.extractSummary(analysis.old_reviews_summary, plainOld),
          totalReviews: oldReviews.length,
          averageRating: oldRating,
        },
        newReviewsSummary: {
          ...this.extractSummary(analysis.new_reviews_summary, plainNew),
          totalReviews: newReviews.length,
          averageRating: newRating,
        },
        differences: {
          newIssues: analysis.differences?.new_issues || [],
          resolvedIssues: analysis.differences?.resolved_issues || [],
          increasedIssues: analysis.differences?.increased_issues || [],
          decreasedIssues: analysis.differences?.decreased_issues || [],
          stableIssues: analysis.differences?.stable_issues || [],
          overallChanges: analysis.differences?.overall_changes || '',
        },
        ratingChange: {
          old: oldRating,
          new: newRating,
          difference: Math.round((newRating - oldRating) * 10) / 10,
        },
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      return this.fallbackResult(plainNew, plainOld, [], [], newRating, oldRating);
    }
  }

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

    const text = this.formatReviews(withText);

    const systemPrompt = `Проанализируй отзывы и верни ТОЛЬКО JSON:
{
  "pros": ["плюс"],
  "cons": ["минус"],
  "common_issues": [{"issue": "", "frequency": "часто/средне/редко", "examples": [""]}],
  "summary": "сводка 2-3 предложения"
}
Максимум 10 пунктов. Пиши на русском.`;

    const userPrompt = `Отзывы (${periodLabel}, ${withText.length} шт.):\n\n${text}\n\nОтветь ТОЛЬКО JSON:`;

    try {
      const response = await this.llmClient.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        { temperature: 0.2, maxTokens: 2000 }
      );

      const analysis = this.extractJson(response.content);

      if (!analysis) {
        return {
          period: this.dateRange(plain),
          totalReviews: reviews.length,
          summary: 'Не удалось выполнить анализ',
          pros: [],
          cons: [],
          commonIssues: [],
          averageRating: rating,
        };
      }

      return {
        period: this.dateRange(plain),
        totalReviews: reviews.length,
        summary: analysis.summary || '',
        pros: Array.isArray(analysis.pros) ? analysis.pros.slice(0, 10) : [],
        cons: Array.isArray(analysis.cons) ? analysis.cons.slice(0, 10) : [],
        commonIssues: Array.isArray(analysis.common_issues) ? analysis.common_issues.slice(0, 10) : [],
        averageRating: rating,
      };
    } catch (error) {
      console.error('Summarize failed:', error);
      return {
        period: this.dateRange(plain),
        totalReviews: reviews.length,
        summary: 'Ошибка анализа',
        pros: [],
        cons: [],
        commonIssues: [],
        averageRating: rating,
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

  private formatReviews(reviews: any[]): string {
    return reviews
      .map((r, i) => {
        const rating = r.productValuation || r.rating || '?';
        const text = (r.text || '').trim().replace(/\n/g, ' ').substring(0, this.MAX_TEXT_LENGTH);
        const date = r.createdDate 
          ? new Date(r.createdDate).toLocaleDateString('ru-RU')
          : '';
        return `${i + 1}. [${rating}/5]${date ? ' ' + date : ''} ${text}`;
      })
      .join('\n');
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

  private extractSummary(data: any, allReviews: any[]): {
    period: { from: string; to: string };
    summary: string;
    pros: string[];
    cons: string[];
    commonIssues: Array<{ issue: string; frequency: string; examples: string[] }>;
  } {
    return {
      period: this.dateRange(allReviews),
      summary: data?.summary || '',
      pros: Array.isArray(data?.pros) ? data.pros : [],
      cons: Array.isArray(data?.cons) ? data.cons : [],
      commonIssues: Array.isArray(data?.common_issues) ? data.common_issues : [],
    };
  }

  private extractJson(content: string): any {
    try {
      let cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        console.log('No JSON found');
        return null;
      }

      cleaned = match[0]
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

      return JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse error:', e);
      return null;
    }
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