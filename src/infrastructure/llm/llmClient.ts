export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class LlmClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly provider: 'openai' | 'ollama' | 'custom';

  constructor(config: {
    provider?: 'openai' | 'ollama' | 'custom';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } = {}) {
    this.provider = config.provider || 'openai';
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || '';
    this.model = config.model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
    this.baseUrl = config.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    
    console.log(`LlmClient: provider=${this.provider}, model=${this.model}`);
  }

  async chat(messages: LlmMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResponse> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
        console.log(`Attempt ${attempt}/${maxRetries} - Chars: ${totalChars}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        let url: string;
        let headers: Record<string, string>;
        let body: any;

        if (this.provider === 'ollama') {
          url = `${this.baseUrl}/api/chat`;
          headers = { 'Content-Type': 'application/json' };
          body = {
            model: this.model,
            messages,
            stream: false,
            options: {
              temperature: options?.temperature ?? 0.3,
              num_predict: options?.maxTokens ?? 1500,
            },
          };
        } else {
          // OpenAI и совместимые API
          url = `${this.baseUrl}/chat/completions`;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          };
          body = {
            model: this.model,
            messages,
            temperature: options?.temperature ?? 0.3,
            max_tokens: options?.maxTokens ?? 1500,
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error (${response.status}): ${errorText}`);
          
          if (response.status === 429) {
            console.log('Rate limited, waiting 5s...');
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          
          throw new Error(`API error: ${response.status}`);
        }

        const data: any = await response.json();
        
        let content: string;
        let usage: any;

        if (this.provider === 'ollama') {
          content = data.message?.content || '';
          usage = data.usage ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          } : undefined;
        } else {
          content = data.choices?.[0]?.message?.content || '';
          usage = data.usage ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          } : undefined;
        }

        console.log(`Response: ${content.substring(0, 100)}...`);
        
        return { content, model: this.model, usage };
      } catch (error: any) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    throw new Error(`API failed: ${lastError?.message}`);
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (this.provider === 'ollama') {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        return response.ok;
      }
      // Для API считаем доступным если есть ключ
      return !!this.apiKey;
    } catch {
      return false;
    }
  }
}

// Синглтон
let defaultClient: LlmClient | null = null;

export function getLlmClient(): LlmClient {
  if (!defaultClient) {
    const provider = (process.env.LLM_PROVIDER as any) || 'openai';
    
    defaultClient = new LlmClient({
      provider,
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL || (provider === 'ollama' ? 'llama3.1' : 'gpt-3.5-turbo'),
    });
  }
  return defaultClient;
}