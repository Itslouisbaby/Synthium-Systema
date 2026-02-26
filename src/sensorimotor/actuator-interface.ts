/**
 * Actuator Interface - Action on environment
 * 
 * Actuators convert internal decisions into environmental effects.
 * This is the "motor" part of sensorimotor grounding.
 */

/** Action to be executed */
export interface Action {
  readonly actionId: string;
  readonly actionType: string;
  readonly target?: string;
  readonly parameters: Record<string, unknown>;
  readonly expectedOutcome?: unknown;
  readonly deadlineMs?: number;
}

/** Action execution result */
export interface ActionResult {
  readonly actionId: string;
  readonly success: boolean;
  readonly outcome: unknown;
  readonly durationMs: number;
  readonly timestampMs: number;
  readonly sideEffects?: string[];
}

/** Actuator configuration */
export interface ActuatorConfig {
  readonly actuatorId: string;
  readonly actuatorType: string;
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly validateBeforeExecute?: boolean;
}

/**
 * Base actuator interface
 * All actuators implement this contract
 */
export interface Actuator {
  readonly config: ActuatorConfig;
  
  /** Initialize the actuator */
  initialize(): Promise<void>;
  
  /** Validate if action can be executed */
  validate(action: Action): Promise<{ valid: boolean; reason?: string }>;
  
  /** Execute action */
  execute(action: Action): Promise<ActionResult>;
  
  /** Check if actuator is available */
  isAvailable(): boolean;
  
  /** Shutdown actuator */
  shutdown(): Promise<void>;
}

/**
 * Text Output Actuator - produces text output
 */
export class TextOutputActuator implements Actuator {
  readonly config: ActuatorConfig;
  private outputHandler: (text: string) => void;
  private available = true;

  constructor(
    outputHandler: (text: string) => void = console.log,
    config: Partial<ActuatorConfig> = {}
  ) {
    this.outputHandler = outputHandler;
    this.config = {
      actuatorId: config.actuatorId ?? 'text-actuator',
      actuatorType: 'text_output',
      timeoutMs: config.timeoutMs ?? 5000,
      retryCount: config.retryCount ?? 0,
      validateBeforeExecute: config.validateBeforeExecute ?? false,
    };
  }

  async initialize(): Promise<void> {
    this.available = true;
  }

  async validate(action: Action): Promise<{ valid: boolean; reason?: string }> {
    const content = action.parameters.content;
    if (typeof content !== 'string') {
      return { valid: false, reason: 'Content must be a string' };
    }
    if (content.length === 0) {
      return { valid: false, reason: 'Content cannot be empty' };
    }
    return { valid: true };
  }

  async execute(action: Action): Promise<ActionResult> {
    const startTime = Date.now();
    const content = String(action.parameters.content);
    
    try {
      this.outputHandler(content);
      
      return {
        actionId: action.actionId,
        success: true,
        outcome: { charactersWritten: content.length },
        durationMs: Date.now() - startTime,
        timestampMs: Date.now(),
      };
    } catch (error) {
      return {
        actionId: action.actionId,
        success: false,
        outcome: { error: String(error) },
        durationMs: Date.now() - startTime,
        timestampMs: Date.now(),
      };
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async shutdown(): Promise<void> {
    this.available = false;
  }
}

/**
 * API Call Actuator - makes API requests
 */
export class APICallActuator implements Actuator {
  readonly config: ActuatorConfig;
  private available = true;
  private requestHandler: (endpoint: string, params: unknown) => Promise<unknown>;

  constructor(
    requestHandler: (endpoint: string, params: unknown) => Promise<unknown>,
    config: Partial<ActuatorConfig> = {}
  ) {
    this.requestHandler = requestHandler;
    this.config = {
      actuatorId: config.actuatorId ?? 'api-actuator',
      actuatorType: 'api_call',
      timeoutMs: config.timeoutMs ?? 10000,
      retryCount: config.retryCount ?? 2,
      validateBeforeExecute: config.validateBeforeExecute ?? true,
    };
  }

  async initialize(): Promise<void> {
    this.available = true;
  }

  async validate(action: Action): Promise<{ valid: boolean; reason?: string }> {
    const endpoint = action.parameters.endpoint;
    if (typeof endpoint !== 'string') {
      return { valid: false, reason: 'Endpoint must be a string' };
    }
    if (endpoint.length === 0) {
      return { valid: false, reason: 'Endpoint cannot be empty' };
    }
    return { valid: true };
  }

  async execute(action: Action): Promise<ActionResult> {
    const startTime = Date.now();
    const endpoint = String(action.parameters.endpoint);
    const params = action.parameters.params ?? {};
    
    let retries = 0;
    const maxRetries = this.config.retryCount ?? 0;
    
    while (retries <= maxRetries) {
      try {
        const result = await this.requestHandler(endpoint, params);
        
        return {
          actionId: action.actionId,
          success: true,
          outcome: result,
          durationMs: Date.now() - startTime,
          timestampMs: Date.now(),
        };
      } catch (error) {
        retries++;
        if (retries > maxRetries) {
          return {
            actionId: action.actionId,
            success: false,
            outcome: { error: String(error), retries },
            durationMs: Date.now() - startTime,
            timestampMs: Date.now(),
          };
        }
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }
    
    // Should never reach here
    return {
      actionId: action.actionId,
      success: false,
      outcome: { error: 'Max retries exceeded' },
      durationMs: Date.now() - startTime,
      timestampMs: Date.now(),
    };
  }

  isAvailable(): boolean {
    return this.available;
  }

  async shutdown(): Promise<void> {
    this.available = false;
  }
}

/**
 * File Operation Actuator - performs file operations
 */
export class FileOperationActuator implements Actuator {
  readonly config: ActuatorConfig;
  private available = true;
  private fs: typeof import('node:fs/promises');

  constructor(
    fsModule: typeof import('node:fs/promises'),
    config: Partial<ActuatorConfig> = {}
  ) {
    this.fs = fsModule;
    this.config = {
      actuatorId: config.actuatorId ?? 'file-actuator',
      actuatorType: 'file_operation',
      timeoutMs: config.timeoutMs ?? 5000,
      retryCount: config.retryCount ?? 1,
      validateBeforeExecute: config.validateBeforeExecute ?? true,
    };
  }

  async initialize(): Promise<void> {
    this.available = true;
  }

  async validate(action: Action): Promise<{ valid: boolean; reason?: string }> {
    const operation = action.parameters.operation;
    const path = action.parameters.path;
    
    if (!['read', 'write', 'delete', 'append'].includes(String(operation))) {
      return { valid: false, reason: `Unknown operation: ${operation}` };
    }
    if (typeof path !== 'string' || path.length === 0) {
      return { valid: false, reason: 'Path must be a non-empty string' };
    }
    
    return { valid: true };
  }

  async execute(action: Action): Promise<ActionResult> {
    const startTime = Date.now();
    const operation = String(action.parameters.operation);
    const path = String(action.parameters.path);
    const content = action.parameters.content;
    
    try {
      let result: unknown;
      
      switch (operation) {
        case 'read':
          result = await this.fs.readFile(path, 'utf-8');
          break;
        case 'write':
          await this.fs.writeFile(path, String(content));
          result = { bytesWritten: String(content).length };
          break;
        case 'append':
          await this.fs.appendFile(path, String(content));
          result = { bytesAppended: String(content).length };
          break;
        case 'delete':
          await this.fs.unlink(path);
          result = { deleted: true };
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      
      return {
        actionId: action.actionId,
        success: true,
        outcome: result,
        durationMs: Date.now() - startTime,
        timestampMs: Date.now(),
        sideEffects: [`file:${operation}:${path}`],
      };
    } catch (error) {
      return {
        actionId: action.actionId,
        success: false,
        outcome: { error: String(error) },
        durationMs: Date.now() - startTime,
        timestampMs: Date.now(),
      };
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async shutdown(): Promise<void> {
    this.available = false;
  }
}

/**
 * Composite Actuator - combines multiple actuators
 */
export class CompositeActuator implements Actuator {
  readonly config: ActuatorConfig;
  private actuators: Map<string, Actuator> = new Map();

  constructor(
    actuators: Actuator[] = [],
    config: Partial<ActuatorConfig> = {}
  ) {
    actuators.forEach(a => this.actuators.set(a.config.actuatorType, a));
    this.config = {
      actuatorId: config.actuatorId ?? 'composite-actuator',
      actuatorType: 'composite',
      timeoutMs: config.timeoutMs ?? 10000,
      retryCount: config.retryCount ?? 1,
      validateBeforeExecute: config.validateBeforeExecute ?? true,
    };
  }

  async initialize(): Promise<void> {
    await Promise.all(Array.from(this.actuators.values()).map(a => a.initialize()));
  }

  async validate(action: Action): Promise<{ valid: boolean; reason?: string }> {
    const actuator = this.actuators.get(action.actionType);
    if (!actuator) {
      return { valid: false, reason: `No actuator for type: ${action.actionType}` };
    }
    return actuator.validate(action);
  }

  async execute(action: Action): Promise<ActionResult> {
    const actuator = this.actuators.get(action.actionType);
    if (!actuator) {
      return {
        actionId: action.actionId,
        success: false,
        outcome: { error: `No actuator for type: ${action.actionType}` },
        durationMs: 0,
        timestampMs: Date.now(),
      };
    }
    return actuator.execute(action);
  }

  isAvailable(): boolean {
    return Array.from(this.actuators.values()).some(a => a.isAvailable());
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.actuators.values()).map(a => a.shutdown()));
  }

  addActuator(actuator: Actuator): void {
    this.actuators.set(actuator.config.actuatorType, actuator);
  }

  getActuatorTypes(): string[] {
    return Array.from(this.actuators.keys());
  }
}
