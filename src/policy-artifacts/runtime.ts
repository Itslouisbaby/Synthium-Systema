import type { PolicyArtifact, PolicyLoadOptions, PolicyLoadResult } from './types.js';
import { loadPolicy } from './load.js';
import { simulatePolicyDecision, type SimulationInput, type SimulationResult } from './simulate.js';

export class PolicyRuntime {
  private loaded?: PolicyLoadResult;
  private readonly loadOptions: PolicyLoadOptions;

  constructor(loadOptions: PolicyLoadOptions = {}) {
    this.loadOptions = loadOptions;
  }

  async reload(): Promise<PolicyLoadResult> {
    this.loaded = await loadPolicy(this.loadOptions);
    return this.loaded;
  }

  get policy(): PolicyArtifact {
    if (!this.loaded) {
      throw new Error('PolicyRuntime not loaded. Call reload() first.');
    }
    return this.loaded.policy;
  }

  simulate(input: SimulationInput): SimulationResult {
    return simulatePolicyDecision(this.policy, input);
  }
}
