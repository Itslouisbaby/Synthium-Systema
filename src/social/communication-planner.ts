/**
 * Communication Planner
 * 
 * Plans what to say to an agent based on:
 * - Their knowledge state (don't explain what they know)
 * - Their goals (help them achieve their objectives)
 * - Their preferences (respect their communication style)
 * - Their attention (be concise or detailed as appropriate)
 */

import type { AgentModel, KnowledgeState, AgentPreference } from './agent-model.js';

/** Planned communication */
export interface CommunicationPlan {
  readonly planId: string;
  readonly recipientId: string;
  readonly message: string;
  readonly format: 'text' | 'structured' | 'code' | 'summary';
  readonly detailLevel: 'minimal' | 'standard' | 'detailed';
  readonly rationale: string;
  readonly alternativesConsidered: string[];
}

/** Content to communicate */
export interface CommunicationContent {
  readonly topic: string;
  readonly keyPoints: string[];
  readonly supportingDetails?: string[];
  readonly codeExamples?: string[];
  readonly warnings?: string[];
}

/** Configuration for communication planner */
export interface CommunicationPlannerConfig {
  readonly defaultDetailLevel: 'minimal' | 'standard' | 'detailed';
  readonly maxMessageLength: number;
  readonly assumeKnowledgeThreshold: number; // 0-1
}

/**
 * Communication Planner
 * 
 * Tailors messages to recipient's mental model.
 */
export class CommunicationPlanner {
  private config: Required<CommunicationPlannerConfig>;

  constructor(config: Partial<CommunicationPlannerConfig> = {}) {
    this.config = {
      defaultDetailLevel: config.defaultDetailLevel ?? 'standard',
      maxMessageLength: config.maxMessageLength ?? 2000,
      assumeKnowledgeThreshold: config.assumeKnowledgeThreshold ?? 0.7,
    };
  }

  /**
   * Plan communication to an agent
   */
  planCommunication(
    recipient: AgentModel,
    content: CommunicationContent,
    purpose: 'inform' | 'instruct' | 'warn' | 'ask' | 'confirm'
  ): CommunicationPlan {
    // Determine appropriate detail level
    const detailLevel = this.selectDetailLevel(recipient, content);

    // Determine format
    const format = this.selectFormat(recipient, content);

    // Build message
    const message = this.buildMessage(recipient, content, purpose, detailLevel, format);

    // Generate rationale
    const rationale = this.generateRationale(recipient, detailLevel, format);

    // Note alternatives
    const alternativesConsidered = this.considerAlternatives(recipient, detailLevel);

    return {
      planId: `comm-${Date.now()}`,
      recipientId: recipient.agentId,
      message,
      format,
      detailLevel,
      rationale,
      alternativesConsidered,
    };
  }

  /**
   * Adapt existing message for recipient
   */
  adaptMessage(
    recipient: AgentModel,
    originalMessage: string,
    targetDetailLevel?: CommunicationPlan['detailLevel']
  ): string {
    const detailLevel = targetDetailLevel ?? this.selectDetailLevel(recipient, {
      topic: 'adaptation',
      keyPoints: [originalMessage],
    });

    // If recipient is expert, remove explanations
    if (this.isExpert(recipient)) {
      return this.removeExplanations(originalMessage);
    }

    // If recipient is novice, add explanations
    if (this.isNovice(recipient)) {
      return this.addExplanations(originalMessage);
    }

    return originalMessage;
  }

  /**
   * Check if recipient likely knows a concept
   */
  knowsConcept(recipient: AgentModel, concept: string): {
    knows: boolean;
    confidence: number;
    reasoning: string;
  } {
    // Check direct knowledge
    for (const knowledge of recipient.knowledge.values()) {
      if (knowledge.knownConcepts.some(c => 
        c.toLowerCase() === concept.toLowerCase() ||
        concept.toLowerCase().includes(c.toLowerCase())
      )) {
        return {
          knows: true,
          confidence: 0.8,
          reasoning: `Concept "${concept}" in known concepts list`,
        };
      }
    }

    // Check beliefs
    for (const belief of recipient.beliefs.values()) {
      if (belief.proposition.toLowerCase().includes(concept.toLowerCase())) {
        return {
          knows: true,
          confidence: belief.confidence * 0.7,
          reasoning: `Agent has belief involving "${concept}"`,
        };
      }
    }

    // Check interaction history
    const mentions = recipient.interactionHistory.filter(rec =>
      rec.content.toLowerCase().includes(concept.toLowerCase()) ||
      rec.ourResponse?.toLowerCase().includes(concept.toLowerCase())
    );

    if (mentions.length > 2) {
      return {
        knows: true,
        confidence: 0.6,
        reasoning: `Concept "${concept}" mentioned ${mentions.length} times`,
      };
    }

    return {
      knows: false,
      confidence: 0.7,
      reasoning: 'No evidence of knowledge in model',
    };
  }

  /**
   * Suggest what to explain vs assume known
   */
  suggestExplanations(
    recipient: AgentModel,
    concepts: string[]
  ): {
    explain: string[];
    assumeKnown: string[];
    uncertain: string[];
  } {
    const explain: string[] = [];
    const assumeKnown: string[] = [];
    const uncertain: string[] = [];

    for (const concept of concepts) {
      const knowledge = this.knowsConcept(recipient, concept);

      if (knowledge.confidence > this.config.assumeKnowledgeThreshold) {
        if (knowledge.knows) {
          assumeKnown.push(concept);
        } else {
          explain.push(concept);
        }
      } else {
        uncertain.push(concept);
      }
    }

    return { explain, assumeKnown, uncertain };
  }

  // Private helper methods

  private selectDetailLevel(
    recipient: AgentModel,
    content: CommunicationContent
  ): CommunicationPlan['detailLevel'] {
    // Check preferences
    for (const pref of recipient.preferences.values()) {
      if (pref.category === 'depth') {
        if (pref.value === 'minimal') return 'minimal';
        if (pref.value === 'detailed') return 'detailed';
      }
    }

    // Check knowledge level
    const avgKnowledge = this.getAverageKnowledgeLevel(recipient);
    if (avgKnowledge === 'expert') return 'minimal';
    if (avgKnowledge === 'novice') return 'detailed';

    // Check complexity of content
    if (content.keyPoints.length > 5 || content.supportingDetails) {
      return 'detailed';
    }

    return this.config.defaultDetailLevel;
  }

  private selectFormat(
    recipient: AgentModel,
    content: CommunicationContent
  ): CommunicationPlan['format'] {
    // Check preferences
    for (const pref of recipient.preferences.values()) {
      if (pref.category === 'format') {
        if (pref.value === 'code') return 'code';
        if (pref.value === 'structured') return 'structured';
      }
    }

    // Check content type
    if (content.codeExamples && content.codeExamples.length > 0) {
      return 'code';
    }

    if (content.keyPoints.length > 3) {
      return 'structured';
    }

    return 'text';
  }

  private buildMessage(
    recipient: AgentModel,
    content: CommunicationContent,
    purpose: string,
    detailLevel: CommunicationPlan['detailLevel'],
    format: CommunicationPlan['format']
  ): string {
    const parts: string[] = [];

    // Opening based on purpose
    switch (purpose) {
      case 'warn':
        parts.push(`⚠️ **${content.topic}**`);
        break;
      case 'instruct':
        parts.push(`📋 **${content.topic}**`);
        break;
      case 'ask':
        parts.push(`❓ **${content.topic}**`);
        break;
      default:
        parts.push(`**${content.topic}**`);
    }

    parts.push('');

    // Key points
    for (const point of content.keyPoints) {
      parts.push(`• ${point}`);
    }

    // Supporting details (if detailed level)
    if (detailLevel === 'detailed' && content.supportingDetails) {
      parts.push('');
      parts.push('**Details:**');
      for (const detail of content.supportingDetails) {
        parts.push(`  - ${detail}`);
      }
    }

    // Code examples (if code format)
    if (format === 'code' && content.codeExamples) {
      parts.push('');
      parts.push('**Example:**');
      for (const code of content.codeExamples) {
        parts.push('```');
        parts.push(code);
        parts.push('```');
      }
    }

    // Warnings
    if (content.warnings) {
      parts.push('');
      for (const warning of content.warnings) {
        parts.push(`⚠️ ${warning}`);
      }
    }

    let message = parts.join('\n');

    // Truncate if too long
    if (message.length > this.config.maxMessageLength) {
      message = message.slice(0, this.config.maxMessageLength - 3) + '...';
    }

    return message;
  }

  private generateRationale(
    recipient: AgentModel,
    detailLevel: CommunicationPlan['detailLevel'],
    format: CommunicationPlan['format']
  ): string {
    const parts: string[] = [];

    parts.push(`Selected ${detailLevel} detail level`);

    // Explain why
    const knowledge = this.getAverageKnowledgeLevel(recipient);
    parts.push(`because recipient appears to be ${knowledge}`);

    // Note preferences
    const relevantPrefs = Array.from(recipient.preferences.values())
      .filter(p => p.category === 'depth' || p.category === 'format');
    
    if (relevantPrefs.length > 0) {
      parts.push(`and has preferences: ${relevantPrefs.map(p => p.value).join(', ')}`);
    }

    parts.push(`; using ${format} format`);

    return parts.join(' ');
  }

  private considerAlternatives(
    recipient: AgentModel,
    selectedLevel: CommunicationPlan['detailLevel']
  ): string[] {
    const alternatives: string[] = [];

    const levels: CommunicationPlan['detailLevel'][] = ['minimal', 'standard', 'detailed'];
    
    for (const level of levels) {
      if (level !== selectedLevel) {
        alternatives.push(`Could use ${level} detail`);
      }
    }

    return alternatives;
  }

  private isExpert(recipient: AgentModel): boolean {
    const knowledge = this.getAverageKnowledgeLevel(recipient);
    return knowledge === 'expert';
  }

  private isNovice(recipient: AgentModel): boolean {
    const knowledge = this.getAverageKnowledgeLevel(recipient);
    return knowledge === 'novice';
  }

  private getAverageKnowledgeLevel(recipient: AgentModel): KnowledgeState['level'] {
    const levels = Array.from(recipient.knowledge.values()).map(k => k.level);
    
    if (levels.length === 0) return 'intermediate';

    const scores = levels.map(l => {
      if (l === 'expert') return 3;
      if (l === 'intermediate') return 2;
      return 1;
    });

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avg > 2.5) return 'expert';
    if (avg < 1.5) return 'novice';
    return 'intermediate';
  }

  private removeExplanations(message: string): string {
    // Simple heuristic: remove sentences with explanatory phrases
    const explanatoryPhrases = [
      'this means',
      'in other words',
      'to explain',
      'basically',
      'simply put',
    ];

    const sentences = message.split(/[.!?]+/);
    const filtered = sentences.filter(sent => {
      const lower = sent.toLowerCase();
      return !explanatoryPhrases.some(phrase => lower.includes(phrase));
    });

    return filtered.join('. ');
  }

  private addExplanations(message: string): string {
    // Add brief explanations after technical terms
    // This is a simplified version - in practice, you'd have a term database
    return message + '\n\n(If any terms are unclear, please ask for clarification.)';
  }
}
