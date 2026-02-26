/**
 * Transfer Learning - Case-based reasoning and skill management
 * Section 7: Transfer learning across tasks
 */

export { TaskTraceManager } from './task-trace.js';
export type { TaskTraceConfig, TaskTraceInput } from './task-trace.js';

export { SimilarityRetriever, EmbeddingSimilarityRetriever } from './similarity.js';
export type { SimilarityConfig, SimilarityResult } from './similarity.js';

export { SkillsManager } from './skills.js';
export type { 
  SkillsConfig, 
  SkillActivation, 
  SkillEvaluation 
} from './skills.js';
