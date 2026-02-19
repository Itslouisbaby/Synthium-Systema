/**
 * M10 Shadow Scheduler - Core Types
 * Task 1: Scheduler Core - Type Definitions
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ScheduleType = 'once' | 'recurring' | 'cron';
export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface Task {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  scheduleType: ScheduleType;
  
  // Scheduling
  scheduledAt?: Date;
  nextRunAt?: Date;
  lastRunAt?: Date;
  completedAt?: Date;
  
  // Recurring task settings
  intervalMs?: number;
  cronExpression?: string;
  maxRuns?: number;
  runCount: number;
  
  // Task execution
  handler: TaskHandler;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  metadata: Record<string, unknown>;
}

export type TaskHandler = (context: TaskContext) => Promise<TaskResult> | TaskResult;

export interface TaskContext {
  taskId: string;
  attempt: number;
  abortSignal: AbortSignal;
  logger: Logger;
  metadata: Record<string, unknown>;
}

export interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  retryAfterMs?: number;
}

export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export interface SchedulerConfig {
  maxConcurrentTasks: number;
  defaultTimeoutMs: number;
  defaultMaxRetries: number;
  checkIntervalMs: number;
  persistenceEnabled: boolean;
  persistencePath?: string;
  notificationsEnabled: boolean;
}

export interface ScheduleOptions {
  name: string;
  description?: string;
  priority?: Priority;
  scheduledAt?: Date;
  intervalMs?: number;
  cronExpression?: string;
  maxRuns?: number;
  maxRetries?: number;
  timeoutMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SchedulerStats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  averageExecutionTimeMs: number;
}

export interface NotificationEvent {
  type: 'task_scheduled' | 'task_started' | 'task_completed' | 'task_failed' | 'task_cancelled';
  taskId: string;
  taskName: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export type NotificationHandler = (event: NotificationEvent) => void | Promise<void>;

export interface PersistedState {
  version: number;
  tasks: SerializedTask[];
  lastSavedAt: string;
}

export interface SerializedTask {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  scheduleType: ScheduleType;
  scheduledAt?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  completedAt?: string;
  intervalMs?: number;
  cronExpression?: string;
  maxRuns?: number;
  runCount: number;
  maxRetries: number;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  metadata: Record<string, unknown>;
  // Handler is not serialized - must be re-registered
  handlerId?: string;
}
