/**
 * Perception System - Part 5: Construct representations from raw input
 * 
 * Not just regex matching, but building structured representations
 * that capture meaning, relationships, and affordances.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Structured representation of input */
export interface Representation {
  readonly representationId: string;
  readonly source: string;
  readonly timestamp: number;
  readonly entities: RepEntity[];
  readonly relations: RepRelation[];
  readonly actions: RepAction[];
  readonly attributes: RepAttribute[];
  readonly affordances: RepAffordance[];
  readonly confidence: number;
}

/** Entity in representation */
export interface RepEntity {
  readonly entityId: string;
  readonly type: string;
  readonly name: string;
  readonly properties: Record<string, unknown>;
  readonly salience: number; // 0-1
  readonly span?: { start: number; end: number }; // Position in source
}

/** Relation between entities */
export interface RepRelation {
  readonly relationId: string;
  readonly type: string;
  readonly from: string;
  readonly to: string;
  readonly properties: Record<string, unknown>;
  readonly confidence: number;
}

/** Action mentioned or implied */
export interface RepAction {
  readonly actionId: string;
  readonly verb: string;
  readonly subject?: string;
  readonly object?: string;
  readonly instrument?: string;
  readonly intent?: string;
  readonly constraints: string[];
}

/** Attribute of an entity */
export interface RepAttribute {
  readonly attributeId: string;
  readonly entityId: string;
  readonly name: string;
  readonly value: unknown;
  readonly certainty: number;
}

/** Affordance - what actions are possible */
export interface RepAffordance {
  readonly affordanceId: string;
  readonly entityId: string;
  readonly action: string;
  readonly preconditions: string[];
  readonly outcomes: string[];
  readonly probability: number;
}

/** Configuration for representation builder */
export interface RepresentationBuilderConfig {
  readonly baseDir: string;
  readonly minEntitySalience: number;
  readonly maxEntities: number;
}

/**
 * Representation builder
 * Constructs rich structured representations from raw input
 */
export class RepresentationBuilder {
  private config: Required<RepresentationBuilderConfig>;
  private entityTypes: Map<string, EntityTypeDef> = new Map();
  private relationTypes: Map<string, RelationTypeDef> = new Map();
  private actionPatterns: Map<string, ActionPattern> = new Map();
  private representationHistory: Representation[] = [];
  private initialized = false;

  constructor(config: Partial<RepresentationBuilderConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/perception',
      minEntitySalience: config.minEntitySalience ?? 0.3,
      maxEntities: config.maxEntities ?? 20,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadTypeDefinitions();
    this.initialized = true;
  }

  /**
   * Build a representation from raw input
   */
  async buildRepresentation(input: string): Promise<Representation> {
    await this.initialize();

    const representationId = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Extract entities
    const entities = this.extractEntities(input);

    // 2. Extract relations between entities
    const relations = this.extractRelations(input, entities);

    // 3. Extract actions
    const actions = this.extractActions(input, entities);

    // 4. Extract attributes
    const attributes = this.extractAttributes(input, entities);

    // 5. Infer affordances
    const affordances = this.inferAffordances(entities);

    const representation: Representation = {
      representationId,
      source: input,
      timestamp: Date.now(),
      entities,
      relations,
      actions,
      attributes,
      affordances,
      confidence: this.calculateConfidence(entities, relations),
    };

    this.representationHistory.push(representation);
    await this.saveRepresentation(representation);

    return representation;
  }

  /**
   * Merge multiple representations
   */
  mergeRepresentations(representations: Representation[]): Representation {
    const mergedEntities: RepEntity[] = [];
    const mergedRelations: RepRelation[] = [];
    const mergedActions: RepAction[] = [];

    // Merge entities (deduplicate by name)
    const entityMap = new Map<string, RepEntity>();
    for (const rep of representations) {
      for (const entity of rep.entities) {
        const existing = entityMap.get(entity.name);
        if (existing) {
          // Merge properties
          entityMap.set(entity.name, {
            ...existing,
            properties: { ...existing.properties, ...entity.properties },
            salience: Math.max(existing.salience, entity.salience),
          });
        } else {
          entityMap.set(entity.name, entity);
        }
      }
    }
    mergedEntities.push(...entityMap.values());

    // Merge relations (deduplicate by type+from+to)
    const relationKey = (r: RepRelation) => `${r.type}:${r.from}:${r.to}`;
    const relationMap = new Map<string, RepRelation>();
    for (const rep of representations) {
      for (const relation of rep.relations) {
        const key = relationKey(relation);
        if (!relationMap.has(key)) {
          relationMap.set(key, relation);
        }
      }
    }
    mergedRelations.push(...relationMap.values());

    // Merge actions
    const actionKey = (a: RepAction) => `${a.verb}:${a.subject}:${a.object}`;
    const actionMap = new Map<string, RepAction>();
    for (const rep of representations) {
      for (const action of rep.actions) {
        const key = actionKey(action);
        if (!actionMap.has(key)) {
          actionMap.set(key, action);
        }
      }
    }
    mergedActions.push(...actionMap.values());

    return {
      representationId: `merged-${Date.now()}`,
      source: representations.map(r => r.source).join(' | '),
      timestamp: Date.now(),
      entities: mergedEntities,
      relations: mergedRelations,
      actions: mergedActions,
      attributes: [],
      affordances: [],
      confidence: representations.reduce((sum, r) => sum + r.confidence, 0) / representations.length,
    };
  }

  /**
   * Compare two representations for similarity
   */
  compareRepresentations(a: Representation, b: Representation): {
    entityOverlap: number;
    relationOverlap: number;
    actionOverlap: number;
    overallSimilarity: number;
  } {
    const entityOverlap = this.calculateOverlap(
      a.entities.map(e => e.name),
      b.entities.map(e => e.name)
    );

    const relationOverlap = this.calculateOverlap(
      a.relations.map(r => `${r.type}:${r.from}:${r.to}`),
      b.relations.map(r => `${r.type}:${r.from}:${r.to}`)
    );

    const actionOverlap = this.calculateOverlap(
      a.actions.map(act => act.verb),
      b.actions.map(act => act.verb)
    );

    const overallSimilarity = (entityOverlap + relationOverlap + actionOverlap) / 3;

    return {
      entityOverlap,
      relationOverlap,
      actionOverlap,
      overallSimilarity,
    };
  }

  /**
   * Get representation history
   */
  getRepresentationHistory(): Representation[] {
    return this.representationHistory;
  }

  /**
   * Register an entity type
   */
  registerEntityType(type: EntityTypeDef): void {
    this.entityTypes.set(type.name, type);
  }

  /**
   * Register a relation type
   */
  registerRelationType(type: RelationTypeDef): void {
    this.relationTypes.set(type.name, type);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRepresentations: number;
    entityTypes: number;
    relationTypes: number;
    averageEntitiesPerRep: number;
  } {
    const totalEntities = this.representationHistory.reduce(
      (sum, r) => sum + r.entities.length, 
      0
    );
    
    return {
      totalRepresentations: this.representationHistory.length,
      entityTypes: this.entityTypes.size,
      relationTypes: this.relationTypes.size,
      averageEntitiesPerRep: this.representationHistory.length > 0
        ? totalEntities / this.representationHistory.length
        : 0,
    };
  }

  // Private helper methods
  private extractEntities(input: string): RepEntity[] {
    const entities: RepEntity[] = [];
    const tokens = this.tokenize(input);

    // Look for known entity types
    for (const [typeName, typeDef] of this.entityTypes) {
      for (const pattern of typeDef.patterns) {
        const matches = this.findMatches(input, pattern);
        for (const match of matches) {
          const entity: RepEntity = {
            entityId: `ent-${Date.now()}-${entities.length}`,
            type: typeName,
            name: match.text,
            properties: this.extractProperties(match.text, typeDef),
            salience: this.calculateSalience(match, input),
            span: match.span,
          };
          
          if (entity.salience >= this.config.minEntitySalience) {
            entities.push(entity);
          }
        }
      }
    }

    // Extract noun phrases as potential entities
    const nounPhrases = this.extractNounPhrases(tokens);
    for (const phrase of nounPhrases) {
      // Check if not already captured
      if (!entities.some(e => e.name.toLowerCase() === phrase.toLowerCase())) {
        entities.push({
          entityId: `ent-${Date.now()}-${entities.length}`,
          type: 'unknown',
          name: phrase,
          properties: {},
          salience: 0.5,
        });
      }
    }

    // Sort by salience and limit
    return entities
      .sort((a, b) => b.salience - a.salience)
      .slice(0, this.config.maxEntities);
  }

  private extractRelations(input: string, entities: RepEntity[]): RepRelation[] {
    const relations: RepRelation[] = [];

    for (const [relName, relDef] of this.relationTypes) {
      for (const pattern of relDef.patterns) {
        // Look for relation pattern between entities
        for (let i = 0; i < entities.length; i++) {
          for (let j = i + 1; j < entities.length; j++) {
            const entityA = entities[i];
            const entityB = entities[j];
            
            if (this.relationHolds(input, entityA, entityB, pattern)) {
              relations.push({
                relationId: `rel-${Date.now()}-${relations.length}`,
                type: relName,
                from: entityA.entityId,
                to: entityB.entityId,
                properties: {},
                confidence: 0.6,
              });
            }
          }
        }
      }
    }

    return relations;
  }

  private extractActions(input: string, entities: RepEntity[]): RepAction[] {
    const actions: RepAction[] = [];
    const tokens = this.tokenize(input);

    for (const [patternName, pattern] of this.actionPatterns) {
      const matches = this.findActionMatches(input, pattern);
      for (const match of matches) {
        actions.push({
          actionId: `act-${Date.now()}-${actions.length}`,
          verb: match.verb,
          subject: match.subject,
          object: match.object,
          instrument: match.instrument,
          intent: match.intent,
          constraints: match.constraints || [],
        });
      }
    }

    // Fallback: extract verbs
    const verbs = this.extractVerbs(tokens);
    for (const verb of verbs) {
      if (!actions.some(a => a.verb === verb)) {
        actions.push({
          actionId: `act-${Date.now()}-${actions.length}`,
          verb,
          constraints: [],
        });
      }
    }

    return actions;
  }

  private extractAttributes(input: string, entities: RepEntity[]): RepAttribute[] {
    const attributes: RepAttribute[] = [];

    for (const entity of entities) {
      // Look for adjectives modifying this entity
      const adjectives = this.findAdjectivesForEntity(input, entity);
      for (const adj of adjectives) {
        attributes.push({
          attributeId: `attr-${Date.now()}-${attributes.length}`,
          entityId: entity.entityId,
          name: 'quality',
          value: adj,
          certainty: 0.7,
        });
      }

      // Look for numeric values
      const numbers = this.findNumbersForEntity(input, entity);
      for (const num of numbers) {
        attributes.push({
          attributeId: `attr-${Date.now()}-${attributes.length}`,
          entityId: entity.entityId,
          name: num.property,
          value: num.value,
          certainty: 0.9,
        });
      }
    }

    return attributes;
  }

  private inferAffordances(entities: RepEntity[]): RepAffordance[] {
    const affordances: RepAffordance[] = [];

    for (const entity of entities) {
      const typeDef = this.entityTypes.get(entity.type);
      if (typeDef?.affordances) {
        for (const affDef of typeDef.affordances) {
          affordances.push({
            affordanceId: `aff-${Date.now()}-${affordances.length}`,
            entityId: entity.entityId,
            action: affDef.action,
            preconditions: affDef.preconditions,
            outcomes: affDef.outcomes,
            probability: affDef.probability,
          });
        }
      }
    }

    return affordances;
  }

  private calculateConfidence(entities: RepEntity[], relations: RepRelation[]): number {
    if (entities.length === 0) return 0;
    const entityConfidence = entities.reduce((sum, e) => sum + e.salience, 0) / entities.length;
    const relationConfidence = relations.length > 0
      ? relations.reduce((sum, r) => sum + r.confidence, 0) / relations.length
      : 0.5;
    return (entityConfidence + relationConfidence) / 2;
  }

  private calculateOverlap(a: string[], b: string[]): number {
    const setA = new Set(a.map(s => s.toLowerCase()));
    const setB = new Set(b.map(s => s.toLowerCase()));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  // Tokenization and parsing helpers
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  private extractNounPhrases(tokens: string[]): string[] {
    // Simple noun phrase extraction
    const phrases: string[] = [];
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were']);
    
    for (let i = 0; i < tokens.length; i++) {
      if (!stopWords.has(tokens[i])) {
        phrases.push(tokens[i]);
        if (i < tokens.length - 1 && !stopWords.has(tokens[i + 1])) {
          phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
        }
      }
    }
    
    return [...new Set(phrases)];
  }

  private extractVerbs(tokens: string[]): string[] {
    // Simple verb detection
    const commonVerbs = ['read', 'write', 'create', 'delete', 'analyze', 'process', 
                        'send', 'receive', 'get', 'put', 'update', 'fetch'];
    return tokens.filter(t => commonVerbs.includes(t));
  }

  private findMatches(input: string, pattern: string): Array<{ text: string; span: { start: number; end: number } }> {
    const matches: Array<{ text: string; span: { start: number; end: number } }> = [];
    const regex = new RegExp(pattern, 'gi');
    let match;
    while ((match = regex.exec(input)) !== null) {
      matches.push({
        text: match[0],
        span: { start: match.index, end: match.index + match[0].length },
      });
    }
    return matches;
  }

  private findActionMatches(input: string, pattern: ActionPattern): Array<{
    verb: string;
    subject?: string;
    object?: string;
    instrument?: string;
    intent?: string;
    constraints?: string[];
  }> {
    // Simplified action extraction
    return [{ verb: pattern.verb }];
  }

  private relationHolds(input: string, entityA: RepEntity, entityB: RepEntity, pattern: string): boolean {
    // Check if the relation pattern appears between the two entities in the text
    const between = this.getTextBetween(input, entityA.span, entityB.span);
    return between.toLowerCase().includes(pattern.toLowerCase());
  }

  private getTextBetween(input: string, spanA?: { start: number; end: number }, spanB?: { start: number; end: number }): string {
    if (!spanA || !spanB) return '';
    const start = Math.min(spanA.end, spanB.end);
    const end = Math.max(spanA.start, spanB.start);
    return input.slice(start, end);
  }

  private extractProperties(text: string, typeDef: EntityTypeDef): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    for (const [propName, extractor] of Object.entries(typeDef.propertyExtractors || {})) {
      const match = text.match(extractor);
      if (match) {
        properties[propName] = match[1] || match[0];
      }
    }
    return properties;
  }

  private calculateSalience(match: { text: string; span: { start: number; end: number } }, input: string): number {
    // Salience based on position (earlier = more salient) and length
    const position = match.span.start / input.length;
    const length = match.text.length;
    return (1 - position * 0.3) * Math.min(1, length / 10);
  }

  private findAdjectivesForEntity(input: string, entity: RepEntity): string[] {
    // Simplified adjective extraction
    const before = input.slice(0, entity.span?.start || 0);
    const words = before.split(/\s+/).slice(-3);
    const commonAdjectives = ['large', 'small', 'important', 'critical', 'new', 'old', 'main'];
    return words.filter(w => commonAdjectives.includes(w.toLowerCase()));
  }

  private findNumbersForEntity(input: string, entity: RepEntity): Array<{ property: string; value: number }> {
    const numbers: Array<{ property: string; value: number }> = [];
    const regex = /(\d+)\s*(\w+)/g;
    let match;
    while ((match = regex.exec(input)) !== null) {
      numbers.push({
        property: match[2],
        value: parseInt(match[1], 10),
      });
    }
    return numbers;
  }

  private async loadTypeDefinitions(): Promise<void> {
    // Register default entity types
    this.registerEntityType({
      name: 'file',
      patterns: ['\\w+\\.(csv|txt|json|xml|pdf|doc)', 'file[s]?', 'document[s]?'],
      affordances: [
        { action: 'read', preconditions: ['exists'], outcomes: ['content_accessible'], probability: 0.9 },
        { action: 'write', preconditions: ['writable'], outcomes: ['content_modified'], probability: 0.8 },
        { action: 'delete', preconditions: ['exists'], outcomes: ['file_removed'], probability: 0.95 },
      ],
      propertyExtractors: {
        extension: /\\.(\\w+)$/,
      },
    });

    this.registerEntityType({
      name: 'data',
      patterns: ['data', 'information', 'records', 'entries', 'rows'],
      affordances: [
        { action: 'analyze', preconditions: ['accessible'], outcomes: ['insights_generated'], probability: 0.8 },
        { action: 'transform', preconditions: ['accessible'], outcomes: ['data_modified'], probability: 0.9 },
      ],
    });

    this.registerEntityType({
      name: 'user',
      patterns: ['user', 'person', 'admin', 'customer', 'client'],
      affordances: [
        { action: 'authenticate', preconditions: ['has_credentials'], outcomes: ['authenticated'], probability: 0.9 },
        { action: 'notify', preconditions: ['has_contact'], outcomes: ['notification_sent'], probability: 0.8 },
      ],
    });

    // Register default relation types
    this.registerRelationType({
      name: 'contains',
      patterns: ['contains', 'has', 'includes', 'with'],
    });

    this.registerRelationType({
      name: 'depends_on',
      patterns: ['depends on', 'requires', 'needs', 'uses'],
    });

    // Register default action patterns
    this.actionPatterns.set('read', { verb: 'read' });
    this.actionPatterns.set('write', { verb: 'write' });
    this.actionPatterns.set('analyze', { verb: 'analyze' });
    this.actionPatterns.set('send', { verb: 'send' });
  }

  private async saveRepresentation(rep: Representation): Promise<void> {
    await writeFile(
      join(this.config.baseDir, `rep-${rep.representationId}.json`),
      JSON.stringify(rep, null, 2)
    );
  }
}

// Type definitions
interface EntityTypeDef {
  name: string;
  patterns: string[];
  affordances?: Array<{
    action: string;
    preconditions: string[];
    outcomes: string[];
    probability: number;
  }>;
  propertyExtractors?: Record<string, RegExp>;
}

interface RelationTypeDef {
  name: string;
  patterns: string[];
}

interface ActionPattern {
  verb: string;
}
