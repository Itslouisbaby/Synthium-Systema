/**
 * Learning Module
 * 
 * Continuous pre-training and knowledge accumulation.
 */

export {
  ContinuousPretraining,
  type LearningExperience,
  type KnowledgeUnit,
  type ContinuousPretrainingConfig,
  type LearningStats,
  type ModelCheckpoint,
} from './continuous-pretraining.js';

export {
  LearningIntegration,
  type LearningIntegrationConfig,
} from './learning-integration.js';

export {
  LearningCategories,
  LearningCategory,
  LearningStatus,
  type VersionedResource,
  type LearningProposal,
  type ValidationResult,
  type LearningGap,
  type RollbackRecord,
  type LearningCategoriesConfig,
} from './learning-categories.js';
