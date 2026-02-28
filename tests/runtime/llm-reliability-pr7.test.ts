import { describe, expect, it } from 'vitest';

import {
  MockLLMProvider,
  createReliableLLMProvider,
  type LLMProvider,
} from '../../src/llm/llm-provider';

class SlowFailingLLM implements LLMProvider {
  async generate(): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 50));
    throw new Error('primary generate failed');
  }

  async generateWithContext(prompt: string): Promise<string> {
    if (prompt.includes('fail')) {
      throw new Error('primary context failed');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    return `PRIMARY:${prompt}`;
  }

  async embed(): Promise<number[]> {
    throw new Error('primary embed failed');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0, 1]);
  }

  getModelInfo() {
    return {
      name: 'slow-failing',
      provider: 'test-primary',
      contextWindow: 100,
      embeddingDimensions: 2,
      supportsStreaming: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('PR7 reliable LLM adapter', () => {
  it('falls back on primary failure and records degraded fallback event', async () => {
    const events: string[] = [];
    const fallback = new MockLLMProvider(16);
    fallback.setResponse('fail', 'FALLBACK:ok');

    const provider = createReliableLLMProvider(new SlowFailingLLM(), {
      timeoutMs: 10,
      fallbackProvider: fallback,
      onDegraded: event => events.push(event.type),
    });

    const output = await provider.generateWithContext('fail this prompt', ['ctx']);
    expect(output).toContain('FALLBACK:ok');
    expect(events).toContain('fallback');
  });

  it('falls back on timeout and records timeout degradation', async () => {
    const events: string[] = [];
    const fallback = new MockLLMProvider(16);
    fallback.setResponse('slow prompt', 'FALLBACK:timeout-ok');

    const provider = createReliableLLMProvider(new SlowFailingLLM(), {
      timeoutMs: 10,
      fallbackProvider: fallback,
      onDegraded: event => events.push(event.type),
    });

    const output = await provider.generateWithContext('slow prompt', ['ctx']);
    expect(output).toContain('FALLBACK:timeout-ok');
    expect(events).toContain('timeout');
    expect(events).toContain('fallback');
  });

  it('applies prompt/context truncation and token budget controls', async () => {
    const events: string[] = [];
    const provider = createReliableLLMProvider(new MockLLMProvider(8), {
      maxPromptChars: 20,
      maxContextChars: 15,
      maxInputTokensApprox: 5,
      onDegraded: event => events.push(event.type),
    });

    const output = await provider.generateWithContext(
      'this prompt should definitely be truncated hard',
      ['this context is very long and should be trimmed down']
    );

    expect(output.length).toBeGreaterThan(0);
    expect(events).toContain('budget_truncate');
    expect(events).toContain('context_truncate');
  });
});
