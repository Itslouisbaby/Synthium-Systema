/**
 * Abstractions - Concepts, Schemas, and Invariants
 * Section 8: Robust abstraction building
 */

export { ConceptRegistry, ConceptTagger, CommonConcepts } from './concepts.js';
export type { 
  ConceptRegistryConfig, 
  ConceptDetection, 
  ConceptTaggerInput 
} from './concepts.js';

export { SchemaRegistry, SchemaFiller, CommonSchemas } from './schemas.js';
export type { 
  SchemaRegistryConfig, 
  SlotFillingResult, 
  SchemaFillerInput 
} from './schemas.js';

export { InvariantRegistry, InvariantChecker, CommonInvariants } from './invariants.js';
export type { 
  InvariantRegistryConfig, 
  InvariantCheckResult, 
  InvariantCheckerInput 
} from './invariants.js';
