/**
 * Autonomous Learning Loop
 * 
 * Self-directed learning system that integrates with a local LLM.
 * The system identifies what it needs to learn, queries the LLM for knowledge,
 * and integrates that knowledge into its cognitive structures.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** LLM interface - to be implemented with user's local LLM */
export interface LLMInterface {
  query(prompt: string, context?: string[]): Promise<string>;
  embed(text: string): Promise<number[]>;
}

/** Learning objective */
export interface LearningObjective {
  readonly objectiveId: string;
  readonly topic: string;
  readonly question: string;
  readonly motivation: string;
  readonly priority: number;
  readonly depth: 'surface' | 'deep' | 'mastery';
  readonly relatedConcepts: string[];
  readonly createdAt: number;
  readonly status: 'pending' | 'learning' | 'learned' | 'failed';
}

/** Learned knowledge */
export interface LearnedKnowledge {
  readonly knowledgeId: string;
  readonly topic: string;
  readonly content: string;
  readonly source: 'llm' | 'experience' | 'inference' | 'user';
  readonly confidence: number;
  readonly embedding: number[];
  readonly relatedTo: string[];
  readonly learnedAt: number;
  readonly accessCount: number;
  readonly lastAccessed: number;
}

/** Learning session */
export interface LearningSession {
  readonly sessionId: string;
  readonly objectiveId: string;
  readonly queries: string[];
  readonly responses: string[];
  readonly insights: string[];
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly knowledgeIds: string[];
}

/** Knowledge gap detected */
export interface KnowledgeGap {
  readonly gapId: string;
  readonly description: string;
  readonly detectedIn: string;
  readonly blocking: boolean;
  readonly detectedAt: number;
}

/** Configuration for autonomous learning */
export interface AutonomousLearningConfig {
  readonly baseDir: string;
  readonly llm: LLMInterface;
  readonly maxConcurrentObjectives: number;
  readonly learningBatchSize: number;
  readonly minConfidenceThreshold: number;
  readonly reviewIntervalMs: number;
}

/**
 * Autonomous Learning Loop
 * 
 * Self-directed learning with LLM integration.
 */
export class AutonomousLearningLoop {
  private config: Required<Omit<AutonomousLearningConfig, 'llm'>> & { llm: LLMInterface };
  private objectives: Map<string, LearningObjective> = new Map();
  private knowledge: Map<string, LearnedKnowledge> = new Map();
  private sessions: Map<string, LearningSession> = new Map();
  private gaps: Map<string, KnowledgeGap> = new Map();
  private knowledgeGraph: Map<string, Set<string>> = new Map(); // concept -> related concepts
  private initialized = false;

  constructor(config: AutonomousLearningConfig) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/learning',
      llm: config.llm,
      maxConcurrentObjectives: config.maxConcurrentObjectives ?? 3,
      learningBatchSize: config.learningBatchSize ?? 5,
      minConfidenceThreshold: config.minConfidenceThreshold ?? 0.7,
      reviewIntervalMs: config.reviewIntervalMs ?? 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Detect knowledge gaps from experience
   */
  detectGap(context: {
    situation: string;
    unknownTerms: string[];
    failedReasoning: string;
    confidenceDrop: number;
  }): KnowledgeGap[] {
    const newGaps: KnowledgeGap[] = [];

    for (const term of context.unknownTerms) {
      const gapId = `gap-${term}-${Date.now()}`;
      const gap: KnowledgeGap = {
        gapId,
        description: `Unknown concept: ${term}`,
        detectedIn: context.situation,
        blocking: context.confidenceDrop > 0.5,
        detectedAt: Date.now(),
      };

      this.gaps.set(gapId, gap);
      newGaps.push(gap);

      // Create learning objective
      this.createObjective({
        topic: term,
        question: `What is ${term} and how does it work?`,
        motivation: `Detected gap in understanding during: ${context.situation}`,
        priority: context.confidenceDrop,
        depth: 'deep',
        relatedConcepts: [],
      });
    }

    // Detect conceptual gaps from failed reasoning
    if (context.failedReasoning) {
      const gapId = `gap-reasoning-${Date.now()}`;
      const gap: KnowledgeGap = {
        gapId,
        description: `Failed reasoning: ${context.failedReasoning.slice(0, 100)}`,
        detectedIn: context.situation,
        blocking: true,
        detectedAt: Date.now(),
      };

      this.gaps.set(gapId, gap);
      newGaps.push(gap);
    }

    return newGaps;
  }

  /**
   * Create a learning objective
   */
  createObjective(params: Omit<LearningObjective, 'objectiveId' | 'createdAt' | 'status'>): LearningObjective {
    const objective: LearningObjective = {
      ...params,
      objectiveId: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.objectives.set(objective.objectiveId, objective);
    return objective;
  }

  /**
   * Execute learning cycle
   */
  async learn(): Promise<{
    objectivesProcessed: number;
    knowledgeAcquired: number;
    insights: string[];
  }> {
    // Get pending objectives
    const pending = Array.from(this.objectives.values())
      .filter(o => o.status === 'pending')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.learningBatchSize);

    const insights: string[] = [];
    let knowledgeAcquired = 0;

    for (const objective of pending) {
      // Mark as learning
      this.objectives.set(objective.objectiveId, { ...objective, status: 'learning' });

      try {
        // Query LLM for knowledge
        const result = await this.queryLLM(objective);
        
        // Process and store knowledge
        const knowledgeIds = await this.integrateKnowledge(objective, result);
        knowledgeAcquired += knowledgeIds.length;

        // Mark as learned
        this.objectives.set(objective.objectiveId, {
          ...objective,
          status: 'learned',
        });

        // Extract insights
        const insight = await this.extractInsight(objective, result);
        if (insight) insights.push(insight);

      } catch (error) {
        // Mark as failed
        this.objectives.set(objective.objectiveId, {
          ...objective,
          status: 'failed',
        });
      }
    }

    await this.saveState();

    return {
      objectivesProcessed: pending.length,
      knowledgeAcquired,
      insights,
    };
  }

  /**
   * Query LLM for knowledge on a topic
   */
  private async queryLLM(objective: LearningObjective): Promise<{
    explanation: string;
    examples: string[];
    relatedConcepts: string[];
    applications: string[];
  }> {
    // Build prompt based on depth
    const depthPrompts = {
      surface: `Give me a brief overview of ${objective.topic}. 2-3 sentences.`,
      deep: `Explain ${objective.topic} in detail. Include: 1) Core concepts, 2) How it works, 3) Key examples, 4) Related ideas.`,
      mastery: `Provide a comprehensive explanation of ${objective.topic}. Include theory, implementation details, edge cases, common pitfalls, and advanced applications.`,
    };

    const prompt = `${depthPrompts[objective.depth]}\n\nSpecific question: ${objective.question}`;

    // Get related knowledge for context
    const context = await this.getRelatedKnowledgeContext(objective.relatedConcepts);

    // Query LLM
    const response = await this.config.llm.query(prompt, context);

    // Parse response (simplified - in practice would be more structured)
    const explanation = response;
    const examples = this.extractExamples(response);
    const relatedConcepts = await this.extractRelatedConcepts(response);
    const applications = this.extractApplications(response);

    return {
      explanation,
      examples,
      relatedConcepts,
      applications,
    };
  }

  /**
   * Integrate learned knowledge into system
   */
  private async integrateKnowledge(
    objective: LearningObjective,
    result: { explanation: string; examples: string[]; relatedConcepts: string[] }
  ): Promise<string[]> {
    const knowledgeIds: string[] = [];

    // Create main knowledge entry
    const embedding = await this.config.llm.embed(result.explanation);
    const mainKnowledge: LearnedKnowledge = {
      knowledgeId: `know-${Date.now()}-main`,
      topic: objective.topic,
      content: result.explanation,
      source: 'llm',
      confidence: 0.8, // LLM confidence
      embedding,
      relatedTo: result.relatedConcepts,
      learnedAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    this.knowledge.set(mainKnowledge.knowledgeId, mainKnowledge);
    knowledgeIds.push(mainKnowledge.knowledgeId);

    // Create knowledge entries for examples
    for (const example of result.examples) {
      const exEmbedding = await this.config.llm.embed(example);
      const exKnowledge: LearnedKnowledge = {
        knowledgeId: `know-${Date.now()}-ex-${Math.random().toString(36).slice(2, 7)}`,
        topic: `${objective.topic} - Example`,
        content: example,
        source: 'llm',
        confidence: 0.75,
        embedding: exEmbedding,
        relatedTo: [mainKnowledge.knowledgeId],
        learnedAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      this.knowledge.set(exKnowledge.knowledgeId, exKnowledge);
      knowledgeIds.push(exKnowledge.knowledgeId);
    }

    // Update knowledge graph
    this.updateKnowledgeGraph(objective.topic, result.relatedConcepts);

    return knowledgeIds;
  }

  /**
   * Retrieve knowledge on a topic
   */
  async retrieveKnowledge(query: string, options?: {
    minConfidence?: number;
    maxResults?: number;
    includeRelated?: boolean;
  }): Promise<LearnedKnowledge[]> {
    const queryEmbedding = await this.config.llm.embed(query);

    // Score all knowledge by similarity
    const scored = Array.from(this.knowledge.values())
      .filter(k => k.confidence >= (options?.minConfidence ?? 0.5))
      .map(k => ({
        knowledge: k,
        similarity: this.cosineSimilarity(queryEmbedding, k.embedding),
      }));

    // Sort by similarity
    scored.sort((a, b) => b.similarity - a.similarity);

    // Get top results
    const results = scored.slice(0, options?.maxResults ?? 5).map(s => s.knowledge);

    // Update access stats
    for (const k of results) {
      this.knowledge.set(k.knowledgeId, {
        ...k,
        accessCount: k.accessCount + 1,
        lastAccessed: Date.now(),
      });
    }

    // Include related if requested
    if (options?.includeRelated) {
      const relatedIds = new Set<string>();
      for (const k of results) {
        for (const relatedId of k.relatedTo) {
          relatedIds.add(relatedId);
        }
      }

      for (const id of relatedIds) {
        const related = this.knowledge.get(id);
        if (related && !results.find(r => r.knowledgeId === id)) {
          results.push(related);
        }
      }
    }

    return results;
  }

  /**
   * Review and consolidate knowledge
   */
  async review(): Promise<{
    consolidated: number;
    forgotten: number;
    strengthened: number;
  }> {
    const now = Date.now();
    let consolidated = 0;
    let forgotten = 0;
    let strengthened = 0;

    for (const [id, knowledge] of this.knowledge) {
      const age = now - knowledge.learnedAt;
      const timeSinceAccess = now - knowledge.lastAccessed;

      // Forgotten: old and rarely accessed
      if (age > 30 * 24 * 60 * 60 * 1000 && knowledge.accessCount < 3) {
        this.knowledge.delete(id);
        forgotten++;
        continue;
      }

      // Strengthened: frequently accessed
      if (knowledge.accessCount > 10) {
        this.knowledge.set(id, {
          ...knowledge,
          confidence: Math.min(0.95, knowledge.confidence + 0.05),
        });
        strengthened++;
      }

      // Consolidated: related knowledge merged
      if (timeSinceAccess < this.config.reviewIntervalMs) {
        const related = await this.findHighlyRelated(knowledge);
        if (related.length > 0) {
          await this.consolidateKnowledge(knowledge, related);
          consolidated++;
        }
      }
    }

    await this.saveState();

    return { consolidated, forgotten, strengthened };
  }

  /**
   * Get learning statistics
   */
  getStats(): {
    totalKnowledge: number;
    pendingObjectives: number;
    learnedObjectives: number;
    knowledgeGaps: number;
    avgKnowledgeConfidence: number;
    mostAccessedTopics: string[];
  } {
    const knowledge = Array.from(this.knowledge.values());
    const objectives = Array.from(this.objectives.values());

    // Most accessed topics
    const topicAccess: Record<string, number> = {};
    for (const k of knowledge) {
      topicAccess[k.topic] = (topicAccess[k.topic] ?? 0) + k.accessCount;
    }

    const mostAccessedTopics = Object.entries(topicAccess)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    return {
      totalKnowledge: knowledge.length,
      pendingObjectives: objectives.filter(o => o.status === 'pending').length,
      learnedObjectives: objectives.filter(o => o.status === 'learned').length,
      knowledgeGaps: this.gaps.size,
      avgKnowledgeConfidence: knowledge.length > 0
        ? knowledge.reduce((sum, k) => sum + k.confidence, 0) / knowledge.length
        : 0,
      mostAccessedTopics,
    };
  }

  // Private helper methods

  private async getRelatedKnowledgeContext(concepts: string[]): Promise<string[]> {
    const context: string[] = [];

    for (const concept of concepts) {
      const related = await this.retrieveKnowledge(concept, { maxResults: 2 });
      for (const k of related) {
        context.push(k.content);
      }
    }

    return context.slice(0, 5); // Limit context size
  }

  private extractExamples(text: string): string[] {
    const examples: string[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('example') || 
          line.toLowerCase().includes('for instance') ||
          line.toLowerCase().includes('such as')) {
        examples.push(line.trim());
      }
    }

    return examples.slice(0, 3);
  }

  private async extractRelatedConcepts(text: string): Promise<string[]> {
    // Query LLM to extract related concepts
    const prompt = `Extract 3-5 key related concepts from this text as a comma-separated list:\n\n${text.slice(0, 500)}`;
    const response = await this.config.llm.query(prompt);
    
    return response
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0)
      .slice(0, 5);
  }

  private extractApplications(text: string): string[] {
    const applications: string[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('application') || 
          line.toLowerCase().includes('used for') ||
          line.toLowerCase().includes('use case')) {
        applications.push(line.trim());
      }
    }

    return applications.slice(0, 3);
  }

  private async extractInsight(objective: LearningObjective, result: { explanation: string }): Promise<string | null> {
    // Query LLM for key insight
    const prompt = `What is the single most important insight about ${objective.topic} from this explanation? One sentence.\n\n${result.explanation.slice(0, 300)}`;
    return await this.config.llm.query(prompt);
  }

  private updateKnowledgeGraph(concept: string, related: string[]): void {
    const existing = this.knowledgeGraph.get(concept) ?? new Set();
    
    for (const r of related) {
      existing.add(r);
      
      // Bidirectional
      const relatedSet = this.knowledgeGraph.get(r) ?? new Set();
      relatedSet.add(concept);
      this.knowledgeGraph.set(r, relatedSet);
    }

    this.knowledgeGraph.set(concept, existing);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  }

  private async findHighlyRelated(knowledge: LearnedKnowledge): Promise<LearnedKnowledge[]> {
    const related: LearnedKnowledge[] = [];

    for (const id of knowledge.relatedTo) {
      const k = this.knowledge.get(id);
      if (k) {
        const similarity = this.cosineSimilarity(knowledge.embedding, k.embedding);
        if (similarity > 0.85) {
          related.push(k);
        }
      }
    }

    return related;
  }

  private async consolidateKnowledge(
    primary: LearnedKnowledge,
    related: LearnedKnowledge[]
  ): Promise<void> {
    // Merge content
    const mergedContent = `${primary.content}\n\nAdditional context:\n${related.map(r => r.content).join('\n')}`;
    
    // Re-embed
    const newEmbedding = await this.config.llm.embed(mergedContent);
    
    // Update primary
    this.knowledge.set(primary.knowledgeId, {
      ...primary,
      content: mergedContent.slice(0, 2000), // Limit size
      embedding: newEmbedding,
      confidence: Math.min(0.95, primary.confidence + 0.05),
    });

    // Remove merged knowledge
    for (const r of related) {
      this.knowledge.delete(r.knowledgeId);
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      objectives: Array.from(this.objectives.entries()),
      knowledge: Array.from(this.knowledge.entries()),
      sessions: Array.from(this.sessions.entries()),
      gaps: Array.from(this.gaps.entries()),
      knowledgeGraph: Array.from(this.knowledgeGraph.entries()).map(([k, v]) => [k, Array.from(v)]),
    };
    await writeFile(
      join(this.config.baseDir, 'autonomous-learning.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'autonomous-learning.json'), 'utf-8');
      const state = JSON.parse(data);
      this.objectives = new Map(state.objectives);
      this.knowledge = new Map(state.knowledge);
      this.sessions = new Map(state.sessions);
      this.gaps = new Map(state.gaps);
      this.knowledgeGraph = new Map(
        (state.knowledgeGraph ?? []).map(([k, v]: [string, string[]]) => [k, new Set(v)])
      );
    } catch {
      // No state to load
    }
  }
}
