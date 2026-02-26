/**
 * Social / Theory of Mind - Index
 * 
 * Components for modeling other agents' mental states:
 * - Beliefs (what they think is true)
 * - Goals (what they want to achieve)
 * - Intentions (what they plan to do)
 * - Knowledge (what they know)
 * - Preferences (how they like things)
 */

// Agent Modeling
export {
  AgentModeler,
} from './agent-model.js';

export type {
  AgentModelerConfig,
  AgentModel,
  AgentBelief,
  AgentGoal,
  AgentIntention,
  KnowledgeState,
  AgentPreference,
  InteractionRecord,
} from './agent-model.js';

// Intention Recognition
export {
  IntentionRecognizer,
} from './intention-recognition.js';

export type {
  BehaviorPattern,
  RecognizedIntention,
  RecognitionContext,
} from './intention-recognition.js';

// Communication Planning
export {
  CommunicationPlanner,
} from './communication-planner.js';

export type {
  CommunicationPlan,
  CommunicationContent,
  CommunicationPlannerConfig,
} from './communication-planner.js';

// Social Cognition Integration
export {
  SocialCognition,
} from './social-cognition.js';

export type {
  SocialReasoning,
  SocialContext,
} from './social-cognition.js';
