// Simplified NeuronWaves types for TUI integration
// This avoids complex import paths while maintaining type safety

export interface LoopInput {
  content: string;
  sessionKey: string;
}

export interface PlanStep {
  stepId: string;
  description?: string;
  actionClass: string;
  status: 'pending' | 'allowed' | 'blocked' | 'awaiting_approval' | 'executed' | 'failed';
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface Plan {
  id: string;
  sessionKey: string;
  createdAtMs: number;
  steps: PlanStep[];
  contextBundle?: ContextBundle;
}

export interface Evaluation {
  id: string;
  planId: string;
  sessionKey: string;
  result: 'success' | 'failure' | 'partial';
  summary: string;
  evaluatedAtMs: number;
}

export interface LoopOutput {
  plan: Plan;
  evaluation: Evaluation;
  artifactPaths: string[];
}

export interface ContextBundle {
  flash?: Array<{ content: string; timestamp: number }>;
  warm?: Array<{ content: string; timestamp: number }>;
  semanticFacts?: Array<{ statement: string }>;
}

export interface LoopConfig {
  artifactBaseDir: string;
  autonomyLevel?: number;
  enableMemory?: boolean;
}

// Mock implementation for standalone testing
export async function runNeuronWavesLoop(
  input: LoopInput,
  config: LoopConfig
): Promise<LoopOutput> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Create mock plan steps
  const steps: PlanStep[] = [
    {
      stepId: 'step-1',
      description: 'Read test file content',
      actionClass: 'local_only',
      status: 'executed',
      toolName: 'read',
      args: { path: 'test-file.txt' },
      result: 'File content: This is a test file for the smoke test.'
    }
  ];
  
  // Create mock plan
  const plan: Plan = {
    id: 'plan-' + Date.now(),
    sessionKey: input.sessionKey,
    createdAtMs: Date.now(),
    steps,
  };
  
  // Create mock evaluation
  const evaluation: Evaluation = {
    id: 'eval-' + Date.now(),
    planId: plan.id,
    sessionKey: input.sessionKey,
    result: 'success',
    summary: 'Successfully processed request with 1 tool execution',
    evaluatedAtMs: Date.now()
  };
  
  return {
    plan,
    evaluation,
    artifactPaths: []
  };
}