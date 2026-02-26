/**
 * Autonomy Module
 * 
 * Self-direction and autonomous behavior components.
 */

export { GoalAutonomy, type AutonomousGoal, type KnowledgeGap } from './goal-autonomy.js';
export { ExecutiveControl, type AttentionFocus, type ResourceAllocation } from './executive-control.js';
export { 
  AutonomousLearningLoop, 
  type LLMInterface,
  type LearningObjective,
  type LearnedKnowledge 
} from './autonomous-learning-loop.js';
