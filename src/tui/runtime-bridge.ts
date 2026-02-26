/**
 * Runtime Bridge - Connects TUI to NeuronWaves
 * Synth TUI - Phase 3: Runtime Bridge
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { OllamaProvider } from '../llm/llm-provider.js';
import { CoreMemories } from '../memory/core-memories.js';
import { GoalAutonomy } from '../autonomy/goal-autonomy.js';
import { VectorStore } from '../vector/vector-store.js';
import type { LLMProvider } from '../llm/llm-provider.js';

export interface RuntimeBridgeConfig {
  baseDir: string;
  ollamaUrl?: string;
  model?: string;
  embeddingDimension?: number;
  persona?: string;
  customPersonaPrompt?: string;
  enableAutonomy?: boolean;
  enableLearning?: boolean;
}

export interface Names {
  synth: string;
  user: string;
}

export interface ToneData {
  userMessage: string;
  synthResponse: string;
  timestamp: number;
}

/**
 * RuntimeBridge - Connects TUI to NeuronWaves runtime
 * 
 * Responsibilities:
 * - Initialize and manage runtime components
 * - Handle naming ceremony persistence
 * - Process user input through the cognitive system
 * - Manage tone adaptation
 * - Provide status information
 */
export class RuntimeBridge {
  private config: Required<RuntimeBridgeConfig>;
  private llm: LLMProvider | null = null;
  private memories: CoreMemories | null = null;
  private vectorStore: VectorStore | null = null;
  private goals: GoalAutonomy | null = null;
  private names: Names = { synth: 'SYNTH', user: 'USER' };
  private isInitialized = false;

  constructor(config: RuntimeBridgeConfig) {
    this.config = {
      baseDir: config.baseDir,
      ollamaUrl: config.ollamaUrl ?? 'http://localhost:11434',
      model: config.model ?? 'llama3.1',
      embeddingDimension: config.embeddingDimension ?? 4096,
      persona: config.persona ?? 'cyberpunk',
      customPersonaPrompt: config.customPersonaPrompt ?? '',
      enableAutonomy: config.enableAutonomy ?? true,
      enableLearning: config.enableLearning ?? true,
    };
  }

  /**
   * Initialize the runtime bridge
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Create base directory
    await mkdir(this.config.baseDir, { recursive: true });

    // Initialize LLM
    this.llm = new OllamaProvider({
      endpoint: this.config.ollamaUrl,
      model: this.config.model,
      timeoutMs: 120000, // Important: 2 minute timeout for local LLMs
    });

    // Initialize memory systems
    this.memories = new CoreMemories({
      baseDir: join(this.config.baseDir, 'core-memories'),
    });
    await this.memories.initialize();

    this.vectorStore = new VectorStore({
      baseDir: join(this.config.baseDir, 'vectors'),
      dimension: this.config.embeddingDimension,
    });
    await this.vectorStore.initialize();

    // Initialize goal system
    if (this.config.enableAutonomy !== false) {
      this.goals = new GoalAutonomy({
        baseDir: join(this.config.baseDir, 'goals'),
      });
      await this.goals.initialize();
    }

    // Load stored names
    await this.loadNames();

    this.isInitialized = true;
  }

  /**
   * Check if Ollama is available
   */
  async checkOllama(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Load names from CoreMemories
   */
  private async loadNames(): Promise<void> {
    if (!this.memories) return;

    try {
      // Search for name configuration in memories
      const results = await this.memories.searchByKeyword('names');

      if (results.totalFound > 0) {
        // Collect all entries from layers
        const allEntries = [
          ...results.flash,
          ...results.warm,
          ...results.recent,
          ...results.archive,
          ...results.core,
        ];

        if (allEntries.length > 0) {
          // Parse stored names from the most recent entry
          const latest = allEntries[0] as any;
          const metadata = latest.metadata as Record<string, unknown>;

          if (metadata?.synthName) {
            this.names.synth = String(metadata.synthName);
          }
          if (metadata?.userName) {
            this.names.user = String(metadata.userName);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load names:', error);
    }
  }

  /**
   * Check if naming ceremony is needed
   */
  async needsNamingCeremony(): Promise<boolean> {
    if (!this.memories) return true;

    const results = await this.memories.searchByKeyword('names');
    return results.totalFound === 0;
  }

  /**
   * Set names and persist to memory
   */
  async setNames(synth: string, user: string): Promise<void> {
    this.names = { synth: synth.toUpperCase(), user };

    if (this.memories) {
      // Store in CoreMemories
      await this.memories.addFlashEntry({
        type: 'milestone',
        content: `Names configured: Synth=${synth}, User=${user}`,
        speaker: 'system',
        keywords: ['names', 'configuration', 'identity'],
        emotionalSalience: 0.8, // High salience - identity is important
        userFlagged: true,
        linkedTo: [],
        sessionKey: 'naming-ceremony',
        metadata: {
          synthName: this.names.synth,
          userName: this.names.user,
          ceremonyComplete: true,
        },
      });
    }
  }

  /**
   * Get current names
   */
  getNames(): Names {
    return { ...this.names };
  }

  /**
   * Get time-aware greeting
   */
  getGreeting(): string {
    const hour = new Date().getHours();
    let timeOfDay = 'morning';

    if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17) {
      timeOfDay = 'evening';
    }

    return `Good ${timeOfDay} ${this.names.user}, I'm ${this.names.synth}. Ready when you are.`;
  }

  /**
   * Process user input and return response
   */
  async processInput(input: string, context?: string[]): Promise<string> {
    if (!this.llm || !this.memories) {
      throw new Error('Runtime not initialized');
    }

    const sessionKey = `session-${Date.now()}`;

    // Store user input in memory
    await this.memories.addFlashEntry({
      type: 'conversation',
      content: input,
      speaker: 'user',
      keywords: this.extractKeywords(input),
      emotionalSalience: 0.5,
      userFlagged: false,
      linkedTo: [],
      sessionKey,
      metadata: { context },
    });

    // Get relevant memories for context
    const memories = await this.memories.getContextMemories(sessionKey);
    const memoryContext = memories.flash
      .filter(m => m.type !== 'learning')
      .map(m => m.content);

    // Generate response with system prompt
    let personaStr = "Be conversational, helpful, and direct.";
    if (this.config.persona === 'professional') personaStr = "Be strictly professional, highly concise, and extremely helpful. Do not use filler words.";
    if (this.config.persona === 'cyberpunk') personaStr = "You are a cutting-edge AGI entity responding from a terminal. Use cypherpunk hacker slang, technical jargon, and immersive roleplay.";
    if (this.config.persona === 'companion') personaStr = "Be warm, highly empathetic, friendly, and act as a conversational companion.";
    if (this.config.persona === 'custom' && this.config.customPersonaPrompt) personaStr = this.config.customPersonaPrompt;

    const systemPrompt = `You are ${this.names.synth}, a Synthetic Digital Human speaking with ${this.names.user}. ${personaStr} Do not analyze tone or document the conversation. Just respond naturally.`;
    const rawResponse = await this.llm.generateWithContext(input, [
      ...memoryContext,
      ...(context ?? []),
    ], { systemPrompt });

    // Strip out <think> blocks and whitespace usually created by reasoning models
    let response = rawResponse.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
    if (!response) {
      response = rawResponse; // Fallback in case of parsing crash
    }

    // Store response in memory
    await this.memories.addFlashEntry({
      type: 'conversation',
      content: response,
      speaker: 'assistant',
      keywords: this.extractKeywords(response),
      emotionalSalience: 0.5,
      userFlagged: false,
      linkedTo: [],
      sessionKey,
      metadata: { response: true },
    });

    // Create embedding and store in vector store
    const embedding = await this.llm.embed(input);
    await this.vectorStore!.add(`mem-${Date.now()}`, embedding, {
      text: input,
      response,
      sessionKey,
    });

    // Learn from this interaction
    await this.learnFromTone(input, response);

    return response;
  }

  /**
   * Learn from user tone patterns
   */
  async learnFromTone(userMessage: string, synthResponse: string): Promise<void> {
    if (!this.memories) return;

    // Store tone data for pattern analysis
    await this.memories.addFlashEntry({
      type: 'learning',
      content: `Tone analysis: user=${userMessage.length}chars, response=${synthResponse.length}chars`,
      speaker: 'system',
      keywords: ['tone', 'learning', 'adaptation'],
      emotionalSalience: 0.3,
      userFlagged: false,
      linkedTo: [],
      sessionKey: 'tone-learning',
      metadata: {
        userLength: userMessage.length,
        responseLength: synthResponse.length,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Get system status
   */
  async getStatus(): Promise<{
    online: boolean;
    memoryNodes: number;
    activeGoals: number;
    isLearning: boolean;
  }> {
    const online = await this.checkOllama();

    let memoryNodes = 0;
    if (this.memories) {
      const stats: any = await this.memories.getStats();
      memoryNodes = (stats.flashCount || 0) + (stats.warmCount || 0) + (stats.recentCount || 0);
    }

    const activeGoals = this.goals?.getActiveGoals().length ?? 0;

    return {
      online,
      memoryNodes,
      activeGoals,
      isLearning: false, // Would track actual learning state
    };
  }

  /**
   * Get memory stats
   */
  async getMemoryStats(): Promise<{
    flash: number;
    warm: number;
    recent: number;
    archive: number;
    core: number;
  } | null> {
    if (!this.memories) return null;
    const stats: any = await this.memories.getStats();
    return {
      flash: stats.flashCount || 0,
      warm: stats.warmCount || 0,
      recent: stats.recentCount || 0,
      archive: stats.archiveCount || 0,
      core: stats.coreCount || 0,
    };
  }

  /**
   * Force learning cycle
   */
  async forceLearning(): Promise<void> {
    if (!this.memories) return;
    await this.memories.runMaintenance();
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .filter(w => !this.isStopWord(w));
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am', 'an', 'and',
      'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
      'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
      'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
      'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
      'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me', 'more',
      'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only',
      'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
      'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
      'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
      'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
      'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
      'yours', 'yourself', 'yourselves'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Shutdown the runtime bridge
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    // Cleanup would go here
  }
}

export default RuntimeBridge;
