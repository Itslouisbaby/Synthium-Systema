/**
 * System Configuration
 * 
 * Centralized configuration for all Synth components
 * Loads from config.json with environment variable overrides
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** LLM configuration */
export interface LLMConfig {
  provider: 'ollama' | 'openai' | 'mock';
  model: string;
  embeddingModel?: string;
  endpoint: string;
  apiKey?: string;
  timeoutMs: number;
}

/** Memory configuration */
export interface MemoryConfig {
  baseDir: string;
  flashLimit: number;
  warmLimitPerWeek: number;
  recentLimit: number;
  archiveLimit: number;
  embeddingDim: number;
  compressionIntervalHours: number;
  consolidationIntervalHours: number;
  enableMemoryMdIntegration: boolean;
  emotionalThreshold: number;
}

/** Learning configuration */
export interface LearningConfig {
  baseDir: string;
  sandboxTests: number;
  sandboxImprovementThreshold: number;
  skillTraceThreshold: number;
  autoRollback: boolean;
  rollbackThreshold: number;
  degradationCheckIntervalMinutes: number;
}

/** Runtime configuration */
export interface RuntimeConfig {
  baseDir: string;
  targetTickRate: number;
  maxHistory: number;
  enableAllLoops: boolean;
  enableReplay: boolean;
}

/** Error handling configuration */
export interface ErrorConfig {
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  emitErrorSignals: boolean;
}

/** Full system configuration */
export interface SystemConfig {
  llm: LLMConfig;
  memory: MemoryConfig;
  learning: LearningConfig;
  runtime: RuntimeConfig;
  error: ErrorConfig;
}

/** Default configuration */
export const defaultConfig: SystemConfig = {
  llm: {
    provider: 'ollama',
    model: 'mistral',
    embeddingModel: 'mistral',
    endpoint: 'http://localhost:11434',
    timeoutMs: 30000,
  },
  memory: {
    baseDir: '.synth/core-memories',
    flashLimit: 250,
    warmLimitPerWeek: 200,
    recentLimit: 500,
    archiveLimit: 1000,
    embeddingDim: 4096,
    compressionIntervalHours: 6,
    consolidationIntervalHours: 24,
    enableMemoryMdIntegration: true,
    emotionalThreshold: 0.8,
  },
  learning: {
    baseDir: '.synth/learning',
    sandboxTests: 10,
    sandboxImprovementThreshold: 0.1,
    skillTraceThreshold: 3,
    autoRollback: true,
    rollbackThreshold: 0.9,
    degradationCheckIntervalMinutes: 1,
  },
  runtime: {
    baseDir: '.synth/runtime',
    targetTickRate: 10,
    maxHistory: 10000,
    enableAllLoops: true,
    enableReplay: true,
  },
  error: {
    maxRetries: 3,
    retryDelayMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 30000,
    emitErrorSignals: true,
  },
};

/**
 * Configuration Manager
 * 
 * Loads, validates, and provides access to system configuration
 */
export class ConfigManager {
  private config: SystemConfig;
  private configPath: string;
  private loaded = false;

  constructor(configPath: string = '.synth/config.json') {
    this.configPath = configPath;
    this.config = { ...defaultConfig };
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<SystemConfig> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      const userConfig = JSON.parse(content);
      
      // Deep merge with defaults
      this.config = this.deepMerge(defaultConfig, userConfig);
      
      // Apply environment variable overrides
      this.applyEnvOverrides();
      
      // Validate
      this.validate();
      
      this.loaded = true;
      console.log(`[ConfigManager] Loaded config from ${this.configPath}`);
      
      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[ConfigManager] No config file found, using defaults`);
        console.log(`[ConfigManager] Create ${this.configPath} to customize`);
        
        // Save default config for user to edit
        await this.saveDefault();
        
        this.loaded = true;
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Get full configuration
   */
  get(): SystemConfig {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }

  /**
   * Get LLM configuration
   */
  getLLM(): LLMConfig {
    return this.get().llm;
  }

  /**
   * Get memory configuration
   */
  getMemory(): MemoryConfig {
    return this.get().memory;
  }

  /**
   * Get learning configuration
   */
  getLearning(): LearningConfig {
    return this.get().learning;
  }

  /**
   * Get runtime configuration
   */
  getRuntime(): RuntimeConfig {
    return this.get().runtime;
  }

  /**
   * Get error handling configuration
   */
  getError(): ErrorConfig {
    return this.get().error;
  }

  /**
   * Update configuration (runtime)
   */
  async update(updates: Partial<SystemConfig>): Promise<void> {
    this.config = this.deepMerge(this.config, updates);
    await this.save();
  }

  /**
   * Save current configuration to file
   */
  async save(): Promise<void> {
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Save default configuration as template
   */
  private async saveDefault(): Promise<void> {
    const template = {
      _comment: 'Synth Configuration - Edit as needed',
      llm: {
        _comment: 'LLM Provider settings',
        provider: 'ollama',
        model: 'mistral',
        endpoint: 'http://localhost:11434',
      },
      memory: {
        _comment: 'CoreMemories settings',
        flashLimit: 250,
        embeddingDim: 4096,
      },
      learning: {
        _comment: 'Learning governance settings',
        autoRollback: true,
        rollbackThreshold: 0.9,
      },
    };

    try {
      await writeFile(this.configPath, JSON.stringify(template, null, 2));
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  // Private methods

  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key], source[key] as Partial<T[Extract<keyof T, string>]>);
        } else {
          result[key] = source[key] as T[Extract<keyof T, string>];
        }
      }
    }
    
    return result;
  }

  private applyEnvOverrides(): void {
    // LLM overrides
    if (process.env.SYNTH_LLM_PROVIDER) {
      this.config.llm.provider = process.env.SYNTH_LLM_PROVIDER as 'ollama' | 'openai' | 'mock';
    }
    if (process.env.SYNTH_LLM_MODEL) {
      this.config.llm.model = process.env.SYNTH_LLM_MODEL;
    }
    if (process.env.SYNTH_LLM_ENDPOINT) {
      this.config.llm.endpoint = process.env.SYNTH_LLM_ENDPOINT;
    }
    if (process.env.SYNTH_LLM_API_KEY) {
      this.config.llm.apiKey = process.env.SYNTH_LLM_API_KEY;
    }

    // Memory overrides
    if (process.env.SYNTH_MEMORY_FLASH_LIMIT) {
      this.config.memory.flashLimit = parseInt(process.env.SYNTH_MEMORY_FLASH_LIMIT);
    }
    if (process.env.SYNTH_MEMORY_EMBEDDING_DIM) {
      this.config.memory.embeddingDim = parseInt(process.env.SYNTH_MEMORY_EMBEDDING_DIM);
    }

    // Learning overrides
    if (process.env.SYNTH_LEARNING_AUTO_ROLLBACK) {
      this.config.learning.autoRollback = process.env.SYNTH_LEARNING_AUTO_ROLLBACK === 'true';
    }

    // Runtime overrides
    if (process.env.SYNTH_RUNTIME_TICK_RATE) {
      this.config.runtime.targetTickRate = parseInt(process.env.SYNTH_RUNTIME_TICK_RATE);
    }
  }

  private validate(): void {
    // Validate LLM config
    if (!['ollama', 'openai', 'mock'].includes(this.config.llm.provider)) {
      throw new Error(`Invalid LLM provider: ${this.config.llm.provider}`);
    }

    // Validate memory config
    if (this.config.memory.embeddingDim < 128 || this.config.memory.embeddingDim > 16384) {
      throw new Error(`Invalid embedding dimension: ${this.config.memory.embeddingDim}`);
    }

    // Validate learning config
    if (this.config.learning.rollbackThreshold < 0 || this.config.learning.rollbackThreshold > 1) {
      throw new Error(`Invalid rollback threshold: ${this.config.learning.rollbackThreshold}`);
    }

    // Validate runtime config
    if (this.config.runtime.targetTickRate < 1 || this.config.runtime.targetTickRate > 1000) {
      throw new Error(`Invalid tick rate: ${this.config.runtime.targetTickRate}`);
    }
  }
}

/** Global config manager instance */
export const configManager = new ConfigManager();

/** Example config.json */
export const exampleConfig = `{
  "_comment": "Synth Configuration File",
  
  "llm": {
    "provider": "ollama",
    "model": "mistral",
    "embeddingModel": "mistral",
    "endpoint": "http://localhost:11434",
    "timeoutMs": 30000
  },
  
  "memory": {
    "baseDir": ".synth/core-memories",
    "flashLimit": 250,
    "warmLimitPerWeek": 200,
    "recentLimit": 500,
    "embeddingDim": 4096,
    "compressionIntervalHours": 6,
    "enableMemoryMdIntegration": true,
    "emotionalThreshold": 0.8
  },
  
  "learning": {
    "baseDir": ".synth/learning",
    "sandboxTests": 10,
    "sandboxImprovementThreshold": 0.1,
    "autoRollback": true,
    "rollbackThreshold": 0.9,
    "degradationCheckIntervalMinutes": 1
  },
  
  "runtime": {
    "baseDir": ".synth/runtime",
    "targetTickRate": 10,
    "maxHistory": 10000,
    "enableAllLoops": true
  },
  
  "error": {
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "circuitBreakerThreshold": 5,
    "emitErrorSignals": true
  }
}`;
