/**
 * Schema Registry + Slot Filler - Structured data extraction
 * Section 8.2: Schema filling and slot extraction
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Schema, ActiveSchema, Signal, SessionKey } from '../types.js';
import { deterministicId } from '../runtime/deterministic-id.js';

/** Schema registry configuration */
export interface SchemaRegistryConfig {
  /** Base directory for schema storage */
  readonly baseDir: string;
}

/** Slot filling result */
export interface SlotFillingResult {
  readonly schemaId: string;
  readonly concept: string;
  readonly filledSlots: Record<string, unknown>;
  readonly missingSlots: string[];
  readonly confidence: number;
}

/** Schema filler input */
export interface SchemaFillerInput {
  readonly content: string;
  readonly concept: string;
  readonly sessionKey: SessionKey;
  readonly existingData?: Record<string, unknown>;
}

/**
 * SchemaRegistry - Manages schema definitions
 */
export class SchemaRegistry {
  private readonly config: SchemaRegistryConfig;
  private readonly schemas: Map<string, Schema> = new Map();
  private loaded = false;

  constructor(config: SchemaRegistryConfig) {
    this.config = config;
  }

  /**
   * Get registry file path
   */
  private getRegistryPath(): string {
    return join(this.config.baseDir, 'schemas', 'registry.json');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(): Promise<void> {
    await mkdir(join(this.config.baseDir, 'schemas'), { recursive: true });
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const registryPath = this.getRegistryPath();
      const content = await readFile(registryPath, 'utf-8');
      const schemas: Schema[] = JSON.parse(content);

      for (const schema of schemas) {
        this.schemas.set(schema.schemaId, schema);
      }
    } catch {
      // Registry doesn't exist yet
    }

    this.loaded = true;
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    await this.ensureDir();
    const registryPath = this.getRegistryPath();
    const schemas = Array.from(this.schemas.values());
    await writeFile(registryPath, JSON.stringify(schemas, null, 2));
  }

  /**
   * Register a new schema
   */
  async registerSchema(schema: Omit<Schema, 'schemaId'>): Promise<Schema> {
    await this.load();

    const timestamp = Date.now();
    const schemaId = deterministicId.generateConceptId(timestamp, schema.concept);

    const newSchema: Schema = {
      ...schema,
      schemaId,
    };

    this.schemas.set(newSchema.schemaId, newSchema);
    await this.save();

    return newSchema;
  }

  /**
   * Get a schema by ID
   */
  getSchema(schemaId: string): Schema | undefined {
    return this.schemas.get(schemaId);
  }

  /**
   * Get schemas for a concept
   */
  getSchemasForConcept(concept: string): Schema[] {
    const lowerConcept = concept.toLowerCase();
    return Array.from(this.schemas.values()).filter(
      s => s.concept.toLowerCase() === lowerConcept
    );
  }

  /**
   * Get all schemas
   */
  getAllSchemas(): Schema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Remove a schema
   */
  async removeSchema(schemaId: string): Promise<boolean> {
    await this.load();
    const removed = this.schemas.delete(schemaId);
    if (removed) await this.save();
    return removed;
  }
}

/**
 * SchemaFiller - Extracts slot values from content
 */
export class SchemaFiller {
  private readonly registry: SchemaRegistry;

  constructor(registry: SchemaRegistry) {
    this.registry = registry;
  }

  /**
   * Fill slots for a concept
   */
  async fillSlots(input: SchemaFillerInput): Promise<SlotFillingResult[]> {
    await this.registry.load();

    const schemas = this.registry.getSchemasForConcept(input.concept);
    const results: SlotFillingResult[] = [];

    for (const schema of schemas) {
      const result = this.fillSchema(schema, input);
      results.push(result);
    }

    // Sort by confidence (most complete first)
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * Fill a single schema
   */
  private fillSchema(
    schema: Schema,
    input: SchemaFillerInput
  ): SlotFillingResult {
    const filledSlots: Record<string, unknown> = { ...input.existingData };
    const missingSlots: string[] = [];

    // Try to fill required slots
    for (const slot of schema.requiredSlots) {
      if (filledSlots[slot] === undefined) {
        const value = this.extractSlotValue(slot, input.content, schema);
        if (value !== undefined) {
          filledSlots[slot] = value;
        } else {
          missingSlots.push(slot);
        }
      }
    }

    // Try to fill optional slots
    for (const slot of schema.optionalSlots) {
      if (filledSlots[slot] === undefined) {
        const value = this.extractSlotValue(slot, input.content, schema);
        if (value !== undefined) {
          filledSlots[slot] = value;
        }
      }
    }

    // Calculate confidence
    const totalSlots = schema.requiredSlots.length + schema.optionalSlots.length;
    const filledCount = Object.keys(filledSlots).length;
    const confidence = totalSlots > 0 ? filledCount / totalSlots : 1.0;

    return {
      schemaId: schema.schemaId,
      concept: schema.concept,
      filledSlots,
      missingSlots,
      confidence,
    };
  }

  /**
   * Extract slot value from content
   */
  private extractSlotValue(
    slot: string,
    content: string,
    schema: Schema
  ): unknown | undefined {
    // Check for validation rules
    const rule = schema.validationRules.find(r => r.slot === slot);

    // Try to extract based on common patterns
    const patterns: Record<string, RegExp[]> = {
      file_path: [
        /(?:file|path)\s*(?::|is|=)\s*["']?([^"'\n]+)["']?/i,
        /["']([^"']+\.(?:txt|json|csv|md|js|ts))["']/i,
      ],
      url: [
        /(https?:\/\/[^\s]+)/i,
        /url\s*(?::|is|=)\s*["']?([^"'\n]+)["']?/i,
      ],
      number: [
        /(\d+(?:\.\d+)?)/,
        /(?:number|count|amount)\s*(?::|is|=)\s*(\d+)/i,
      ],
      name: [
        /(?:name|called)\s*(?::|is|=)\s*["']?([^"'\n]+)["']?/i,
      ],
      date: [
        /(\d{4}-\d{2}-\d{2})/,
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
      ],
      email: [
        /([\w.-]+@[\w.-]+\.\w+)/i,
      ],
    };

    const slotPatterns = patterns[slot.toLowerCase()] ?? [];

    for (const pattern of slotPatterns) {
      const match = content.match(pattern);
      if (match) {
        const value = match[1]?.trim();

        // Validate if rule exists
        if (rule && value) {
          const valid = this.validateValue(value, rule.rule);
          if (valid) return value;
        } else if (value) {
          return value;
        }
      }
    }

    return undefined;
  }

  /**
   * Validate a value against a rule
   */
  private validateValue(value: string, rule: string): boolean {
    switch (rule) {
      case 'non_empty':
        return value.length > 0;
      case 'is_number':
        return !isNaN(Number(value));
      case 'is_url':
        return /^https?:\/\//.test(value);
      case 'is_email':
        return /^[\w.-]+@[\w.-]+\.\w+$/.test(value);
      default:
        return true;
    }
  }

  /**
   * Create SLOTS_FILLED signal
   */
  createFilledSignal(
    result: SlotFillingResult,
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> & { signalId?: string } {
    return {
      sessionKey,
      type: 'SLOTS_FILLED',
      payload: {
        schemaId: result.schemaId,
        concept: result.concept,
        filledSlots: result.filledSlots,
        confidence: result.confidence,
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'SchemaFiller',
      priority: 'event',
    };
  }

  /**
   * Create SLOTS_MISSING signal
   */
  createMissingSignal(
    result: SlotFillingResult,
    schema: Schema,
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> & { signalId?: string } {
    const questions: Record<string, string> = {};

    for (const slot of result.missingSlots) {
      questions[slot] = schema.clarifyingQuestions[slot] ??
        `Please provide ${slot}`;
    }

    return {
      sessionKey,
      type: 'SLOTS_MISSING',
      payload: {
        schemaId: result.schemaId,
        concept: result.concept,
        missingSlots: result.missingSlots,
        suggestedQuestions: questions,
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'SchemaFiller',
      priority: 'event',
    };
  }

  /**
   * Convert to ActiveSchema
   */
  toActiveSchema(result: SlotFillingResult): ActiveSchema {
    return {
      schemaId: result.schemaId,
      concept: result.concept,
      filledSlots: result.filledSlots,
      missingSlots: result.missingSlots,
      confidence: result.confidence,
    };
  }
}

/** Predefined common schemas */
export const CommonSchemas = {
  FileRead: {
    concept: 'file_operation',
    requiredSlots: ['file_path'],
    optionalSlots: ['encoding', 'line_count'],
    validationRules: [
      { slot: 'file_path', rule: 'non_empty' },
    ],
    clarifyingQuestions: {
      file_path: 'Which file would you like me to read?',
      encoding: 'What encoding should I use (default: utf-8)?',
    },
  },

  WebRequest: {
    concept: 'web_request',
    requiredSlots: ['url'],
    optionalSlots: ['method', 'headers', 'body'],
    validationRules: [
      { slot: 'url', rule: 'is_url' },
    ],
    clarifyingQuestions: {
      url: 'What URL should I request?',
      method: 'Which HTTP method (GET, POST, etc.)?',
    },
  },

  DataQuery: {
    concept: 'data_analysis',
    requiredSlots: ['data_source'],
    optionalSlots: ['filters', 'aggregations', 'group_by'],
    validationRules: [
      { slot: 'data_source', rule: 'non_empty' },
    ],
    clarifyingQuestions: {
      data_source: 'What data would you like to analyze?',
      filters: 'Any filters to apply?',
    },
  },
};
