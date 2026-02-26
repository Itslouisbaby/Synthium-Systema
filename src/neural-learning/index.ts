/**
 * Neural Learning Layer - Index
 */

// Original embedding network (64D, simple)
export {
  EmbeddingNetwork,
} from './embedding-network.js';

export type {
  EmbeddingNetworkConfig,
  Experience,
  Embedding,
  LearnedConcept,
  CausalLink,
} from './embedding-network.js';

// Scaled embedding network (512D+, multi-layer, attention)
export {
  ScaledEmbeddingNetwork,
} from './scaled-embedding-network.js';

export type {
  ScaledEmbeddingNetworkConfig,
  ScaledExperience,
  ScaledEmbedding,
  HierarchicalConcept,
  ScaledCausalLink,
} from './scaled-embedding-network.js';
