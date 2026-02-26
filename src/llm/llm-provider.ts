/**
 * LLM Provider Interface and Implementations
 * 
 * Abstracts LLM interactions for embeddings and generation.
 * Supports Ollama, OpenAI-compatible APIs, and mock for testing.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** LLM Provider interface */
export interface LLMProvider {
  /** Generate text from prompt */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;

  /** Generate with context */
  generateWithContext(prompt: string, context: string[], options?: GenerateOptions): Promise<string>;

  /** Get embedding for text */
  embed(text: string): Promise<number[]>;

  /** Batch embed multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Get model information */
  getModelInfo(): ModelInfo;

  /** Check if provider is available */
  healthCheck(): Promise<boolean>;
}

/** Generation options */
export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

/** Model information */
export interface ModelInfo {
  name: string;
  provider: string;
  contextWindow: number;
  embeddingDimensions: number;
  supportsStreaming: boolean;
}

/** Ollama provider configuration */
export interface OllamaConfig {
  endpoint: string;
  model: string;
  embeddingModel?: string;
  timeoutMs?: number;
}

/** OpenAI-compatible provider configuration */
export interface OpenAIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  timeoutMs?: number;
}

/**
 * Ollama LLM Provider
 * 
 * Local LLM via Ollama (http://localhost:11434)
 */
export class OllamaProvider implements LLMProvider {
  private config: Required<OllamaConfig>;
  private cache: Map<string, number[]> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'http://localhost:11434',
      model: config.model ?? 'mistral',
      embeddingModel: config.embeddingModel ?? config.model ?? 'mistral',
      timeoutMs: config.timeoutMs ?? 30000,
    };
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 2048,
            top_p: options.topP ?? 0.9,
            stop: options.stopSequences,
          },
        }),
      }
    );

    const data = await response.json() as any;
    return data.response ?? '';
  }

  async generateWithContext(prompt: string, context: string[], options: GenerateOptions = {}): Promise<string> {
    const fullPrompt = context.length > 0
      ? `Context:\n${context.join('\n\n')}\n\nQuestion: ${prompt}`
      : prompt;

    return this.generate(fullPrompt, options);
  }

  async embed(text: string): Promise<number[]> {
    // Check cache
    const cacheKey = this.hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return [...cached];
    }

    this.cacheMisses++;

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          prompt: text,
        }),
      }
    );

    const data = await response.json() as any;
    const embedding = data.embedding as number[];

    // Cache result
    if (this.cache.size < 10000) {
      this.cache.set(cacheKey, [...embedding]);
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch embeddings, so we do sequential
    const embeddings: number[][] = [];
    for (const text of texts) {
      embeddings.push(await this.embed(text));
    }
    return embeddings;
  }

  getModelInfo(): ModelInfo {
    return {
      name: this.config.model,
      provider: 'ollama',
      contextWindow: 32768, // mistral default
      embeddingDimensions: 4096, // typical for 7B models
      supportsStreaming: true,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getCacheStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        // Attempt to parse error as JSON to get more specific message
        try {
          const errorData = JSON.parse(error);
          throw new Error(`Ollama API error: ${(errorData as any).error || response.statusText}`);
        } catch {
          throw new Error(`Ollama API error: ${response.status} - ${error}`);
        }
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `emb_${hash}`;
  }
}

/**
 * OpenAI-Compatible Provider
 * 
 * Works with OpenAI, LocalAI, and other OpenAI-compatible APIs
 */
export class OpenAIProvider implements LLMProvider {
  private config: Required<OpenAIConfig>;
  private cache: Map<string, number[]> = new Map();

  constructor(config: OpenAIConfig) {
    this.config = {
      ...config,
      embeddingModel: config.embeddingModel ?? config.model,
      timeoutMs: config.timeoutMs ?? 30000,
    };
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          top_p: options.topP ?? 0.9,
          stop: options.stopSequences,
        }),
      }
    );

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  }

  async generateWithContext(prompt: string, context: string[], options: GenerateOptions = {}): Promise<string> {
    const fullPrompt = context.length > 0
      ? `Context:\n${context.join('\n\n')}\n\nQuestion: ${prompt}`
      : prompt;

    return this.generate(fullPrompt, options);
  }

  async embed(text: string): Promise<number[]> {
    const cacheKey = this.hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached) return [...cached];

    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/v1/embeddings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: text,
        }),
      }
    );

    const data = await response.json() as any;
    const embedding = data.data?.[0]?.embedding as number[];

    if (this.cache.size < 10000) {
      this.cache.set(cacheKey, [...embedding]);
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.fetchWithTimeout(
      `${this.config.endpoint}/v1/embeddings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: texts,
        }),
      }
    );

    const data = await response.json() as any;
    return data.data?.map((d: { embedding: number[] }) => d.embedding) ?? [];
  }

  getModelInfo(): ModelInfo {
    return {
      name: this.config.model,
      provider: 'openai',
      contextWindow: 128000, // GPT-4 default
      embeddingDimensions: 1536, // text-embedding-3-small
      supportsStreaming: true,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        // Attempt to parse error as JSON to get more specific message
        try {
          const errorData = JSON.parse(error);
          throw new Error(`OpenAI API error: ${(errorData as any).error?.message || response.statusText}`);
        } catch {
          throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `emb_${hash}`;
  }
}

/**
 * Mock LLM Provider for Testing
 * 
 * Returns deterministic responses without external calls
 */
export class MockLLMProvider implements LLMProvider {
  private responses: Map<string, string> = new Map();
  private embeddingDim: number;

  constructor(embeddingDim: number = 4096) {
    this.embeddingDim = embeddingDim;
  }

  setResponse(promptPattern: string, response: string): void {
    this.responses.set(promptPattern.toLowerCase(), response);
  }

  async generate(prompt: string): Promise<string> {
    const lowerPrompt = prompt.toLowerCase();

    for (const [pattern, response] of this.responses) {
      if (lowerPrompt.includes(pattern)) {
        return response;
      }
    }

    return `Mock response for: ${prompt.slice(0, 50)}...`;
  }

  async generateWithContext(prompt: string): Promise<string> {
    return this.generate(prompt);
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding based on text hash
    const hash = this.hashText(text);
    const embedding: number[] = [];

    for (let i = 0; i < this.embeddingDim; i++) {
      const v1 = Math.sin(hash * 0.01 + i * 0.001);
      const v2 = Math.cos(hash * 0.005 + i * 0.0005);
      embedding.push((v1 + v2) / 2);
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map(v => v / (norm + 1e-10));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  getModelInfo(): ModelInfo {
    return {
      name: 'mock',
      provider: 'mock',
      contextWindow: 32768,
      embeddingDimensions: this.embeddingDim,
      supportsStreaming: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private hashText(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
}

/**
 * LLM Provider Factory
 * 
 * Creates appropriate provider based on configuration
 */
export class LLMProviderFactory {
  static create(config: LLMProviderConfig): LLMProvider {
    switch ((config as any).provider) {
      case 'ollama':
        return new OllamaProvider(config as Partial<OllamaConfig>);
      case 'openai':
        return new OpenAIProvider(config as OpenAIConfig);
      case 'mock':
        return new MockLLMProvider((config as any).embeddingDim);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}

/** Provider configuration union type */
export type LLMProviderConfig =
  | ({ provider: 'ollama' } & Partial<OllamaConfig>)
  | ({ provider: 'openai' } & OpenAIConfig)
  | ({ provider: 'mock'; embeddingDim?: number });
