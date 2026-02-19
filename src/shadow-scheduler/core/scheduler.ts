/**
 * M10 Shadow Scheduler - Core Scheduler Engine
 * Task 1: Scheduler Core - Main Implementation
 */

import { EventEmitter } from 'events';
import {
  Task,
  TaskStatus,
  ScheduleType,
  Priority,
  TaskHandler,
  TaskContext,
  TaskResult,
  SchedulerConfig,
  ScheduleOptions,
  SchedulerStats,
  NotificationEvent,
  NotificationHandler,
  Logger,
} from '../types';

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrentTasks: 5,
  defaultTimeoutMs: 30000,
  defaultMaxRetries: 3,
  checkIntervalMs: 1000,
  persistenceEnabled: false,
  notificationsEnabled: true,
};

const DEFAULT_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class ShadowScheduler extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private handlers: Map<string, TaskHandler> = new Map();
  private runningTasks: Map<string, AbortController> = new Map();
  private config: SchedulerConfig;
  private logger: Logger;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private notificationHandlers: Set<NotificationHandler> = new Set();
  private executionTimes: number[] = [];

  constructor(config: Partial<SchedulerConfig> = {}, logger: Logger = DEFAULT_LOGGER) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  // ==================== Lifecycle ====================

  start(): void {
    if (this.checkInterval) return;
    
    this.logger.info('ShadowScheduler starting', { config: this.config });
    this.checkInterval = setInterval(() => this.processTasks(), this.config.checkIntervalMs);
    this.emit('started');
  }

  stop(): void {
    if (!this.checkInterval) return;
    
    this.logger.info('ShadowScheduler stopping');
    clearInterval(this.checkInterval);
    this.checkInterval = null;
    
    // Cancel all running tasks
    for (const [taskId, controller] of this.runningTasks) {
      controller.abort();
      this.logger.debug(`Aborted running task: ${taskId}`);
    }
    
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.checkInterval !== null;
  }

  // ==================== Task Registration ====================

  registerHandler(handlerId: string, handler: TaskHandler): void {
    this.handlers.set(handlerId, handler);
    this.logger.debug(`Registered handler: ${handlerId}`);
  }

  unregisterHandler(handlerId: string): boolean {
    const result = this.handlers.delete(handlerId);
    if (result) {
      this.logger.debug(`Unregistered handler: ${handlerId}`);
    }
    return result;
  }

  // ==================== Task Scheduling ====================

  schedule(handlerId: string, options: ScheduleOptions): Task {
    const handler = this.handlers.get(handlerId);
    if (!handler) {
      throw new Error(`Handler not found: ${handlerId}`);
    }

    const task: Task = {
      id: this.generateId(),
      name: options.name,
      description: options.description,
      status: 'pending',
      priority: options.priority ?? 'normal',
      scheduleType: this.determineScheduleType(options),
      scheduledAt: options.scheduledAt,
      nextRunAt: options.scheduledAt ?? new Date(),
      intervalMs: options.intervalMs,
      cronExpression: options.cronExpression,
      maxRuns: options.maxRuns,
      runCount: 0,
      handler,
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
      timeoutMs: options.timeoutMs ?? this.config.defaultTimeoutMs,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: options.tags ?? [],
      metadata: { ...options.metadata, handlerId },
    };

    this.tasks.set(task.id, task);
    this.logger.info(`Task scheduled: ${task.id}`, { name: task.name, priority: task.priority });
    
    this.notify({
      type: 'task_scheduled',
      taskId: task.id,
      taskName: task.name,
      timestamp: new Date(),
    });

    this.emit('taskScheduled', task);
    return task;
  }

  scheduleOnce(handlerId: string, options: Omit<ScheduleOptions, 'intervalMs' | 'cronExpression'>): Task {
    return this.schedule(handlerId, { ...options, scheduledAt: options.scheduledAt ?? new Date() });
  }

  scheduleRecurring(handlerId: string, intervalMs: number, options: Omit<ScheduleOptions, 'intervalMs'>): Task {
    return this.schedule(handlerId, { ...options, intervalMs, scheduledAt: new Date() });
  }

  scheduleCron(handlerId: string, cronExpression: string, options: Omit<ScheduleOptions, 'cronExpression'>): Task {
    // Simple cron parsing for basic patterns (e.g., "*/5 * * * *")
    const intervalMs = this.parseCronToMs(cronExpression);
    return this.schedule(handlerId, { 
      ...options, 
      cronExpression, 
      intervalMs,
      scheduledAt: new Date() 
    });
  }

  // ==================== Task Management ====================

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter(t => t.status === status);
  }

  getTasksByTag(tag: string): Task[] {
    return this.getAllTasks().filter(t => t.tags.includes(tag));
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'running') {
      const controller = this.runningTasks.get(taskId);
      if (controller) {
        controller.abort();
      }
    }

    task.status = 'cancelled';
    task.updatedAt = new Date();
    
    this.logger.info(`Task cancelled: ${taskId}`);
    this.notify({
      type: 'task_cancelled',
      taskId: task.id,
      taskName: task.name,
      timestamp: new Date(),
    });
    
    this.emit('taskCancelled', task);
    return true;
  }

  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'running') {
      this.cancelTask(taskId);
    }

    this.tasks.delete(taskId);
    this.logger.debug(`Task removed: ${taskId}`);
    return true;
  }

  // ==================== Execution ====================

  private async processTasks(): Promise<void> {
    const now = new Date();
    const pendingTasks = this.getAllTasks()
      .filter(t => t.status === 'pending' && t.nextRunAt && t.nextRunAt <= now)
      .sort((a, b) => this.priorityToNumber(b.priority) - this.priorityToNumber(a.priority));

    const availableSlots = this.config.maxConcurrentTasks - this.runningTasks.size;
    const tasksToRun = pendingTasks.slice(0, availableSlots);

    for (const task of tasksToRun) {
      this.executeTask(task);
    }
  }

  private async executeTask(task: Task): Promise<void> {
    if (this.runningTasks.has(task.id)) return;

    const controller = new AbortController();
    this.runningTasks.set(task.id, controller);
    
    task.status = 'running';
    task.lastRunAt = new Date();
    task.updatedAt = new Date();
    task.runCount++;

    this.logger.info(`Task started: ${task.id}`, { name: task.name, attempt: task.retryCount + 1 });
    this.notify({
      type: 'task_started',
      taskId: task.id,
      taskName: task.name,
      timestamp: new Date(),
      data: { attempt: task.retryCount + 1 },
    });
    
    this.emit('taskStarted', task);

    const startTime = Date.now();
    let result: TaskResult;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Task timeout')), task.timeoutMs);
      });

      const context: TaskContext = {
        taskId: task.id,
        attempt: task.retryCount + 1,
        abortSignal: controller.signal,
        logger: this.logger,
        metadata: task.metadata,
      };

      result = await Promise.race([task.handler(context), timeoutPromise]);
      
      const executionTime = Date.now() - startTime;
      this.executionTimes.push(executionTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift();
      }

      if (result.success) {
        task.status = 'completed';
        task.completedAt = new Date();
        task.updatedAt = new Date();
        
        this.logger.info(`Task completed: ${task.id}`, { executionTime });
        this.notify({
          type: 'task_completed',
          taskId: task.id,
          taskName: task.name,
          timestamp: new Date(),
          data: { executionTime, result: result.data },
        });
        
        this.emit('taskCompleted', task, result);
      } else {
        throw result.error ?? new Error('Task failed without error');
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      task.retryCount++;
      
      if (task.retryCount <= task.maxRetries) {
        task.status = 'pending';
        const retryAfterMs = (error as Error & { retryAfterMs?: number })?.retryAfterMs ?? 5000;
        task.nextRunAt = new Date(Date.now() + retryAfterMs);
        task.updatedAt = new Date();
        
        this.logger.warn(`Task failed, will retry: ${task.id}`, { 
          error: (error as Error).message,
          retryAfterMs,
          attempt: task.retryCount,
        });
      } else {
        task.status = 'failed';
        task.updatedAt = new Date();
        
        this.logger.error(`Task failed permanently: ${task.id}`, { error: (error as Error).message });
        this.notify({
          type: 'task_failed',
          taskId: task.id,
          taskName: task.name,
          timestamp: new Date(),
          data: { error: (error as Error).message, attempts: task.retryCount },
        });
        
        this.emit('taskFailed', task, error as Error);
      }
    } finally {
      this.runningTasks.delete(task.id);
      this.scheduleNextRun(task);
    }
  }

  private scheduleNextRun(task: Task): void {
    if (task.status !== 'completed' && task.status !== 'cancelled') return;
    if (task.maxRuns && task.runCount >= task.maxRuns) return;
    if (!task.intervalMs) return;

    task.status = 'pending';
    task.nextRunAt = new Date(Date.now() + task.intervalMs);
    task.updatedAt = new Date();
    task.retryCount = 0;
    
    this.logger.debug(`Scheduled next run for task: ${task.id}`, { nextRunAt: task.nextRunAt });
  }

  // ==================== Notifications ====================

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  private notify(event: NotificationEvent): void {
    if (!this.config.notificationsEnabled) return;
    
    for (const handler of this.notificationHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.error('Notification handler failed', { error: (error as Error).message });
      }
    }
  }

  // ==================== Stats ====================

  getStats(): SchedulerStats {
    const tasks = this.getAllTasks();
    const avgTime = this.executionTimes.length > 0
      ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
      : 0;

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      runningTasks: tasks.filter(t => t.status === 'running').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      cancelledTasks: tasks.filter(t => t.status === 'cancelled').length,
      averageExecutionTimeMs: Math.round(avgTime),
    };
  }

  // ==================== Helpers ====================

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineScheduleType(options: ScheduleOptions): ScheduleType {
    if (options.cronExpression) return 'cron';
    if (options.intervalMs) return 'recurring';
    return 'once';
  }

  private priorityToNumber(priority: Priority): number {
    const map: Record<Priority, number> = { low: 1, normal: 2, high: 3, critical: 4 };
    return map[priority];
  }

  private parseCronToMs(cronExpression: string): number {
    // Simplified cron parsing - just handle "*/N * * * *" patterns
    const match = cronExpression.match(/^\*\/(\d+) \* \* \* \*$/);
    if (match) {
      return parseInt(match[1], 10) * 60 * 1000;
    }
    // Default to 1 minute if can't parse
    return 60000;
  }

  // ==================== Persistence Support ====================

  getTasksForPersistence(): Map<string, Task> {
    return new Map(this.tasks);
  }

  restoreTasks(tasks: Task[]): void {
    for (const task of tasks) {
      // Restore handler reference if handlerId exists
      const handlerId = task.metadata?.handlerId as string | undefined;
      if (handlerId && this.handlers.has(handlerId)) {
        task.handler = this.handlers.get(handlerId)!;
      }
      
      // Reset running tasks to pending
      if (task.status === 'running') {
        task.status = 'pending';
        task.retryCount = 0;
      }
      
      this.tasks.set(task.id, task);
    }
    
    this.logger.info(`Restored ${tasks.length} tasks from persistence`);
  }
}

export default ShadowScheduler;
