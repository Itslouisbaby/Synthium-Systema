/**
 * M10 Shadow Scheduler - Core Scheduler Engine
 * Task 1: Scheduler Core - Main Implementation
 */
import { EventEmitter } from 'events';
import { Task, TaskStatus, TaskHandler, SchedulerConfig, ScheduleOptions, SchedulerStats, NotificationHandler, Logger } from '../types';
export declare class ShadowScheduler extends EventEmitter {
    private tasks;
    private handlers;
    private runningTasks;
    private config;
    private logger;
    private checkInterval;
    private notificationHandlers;
    private executionTimes;
    constructor(config?: Partial<SchedulerConfig>, logger?: Logger);
    start(): void;
    stop(): void;
    isRunning(): boolean;
    registerHandler(handlerId: string, handler: TaskHandler): void;
    unregisterHandler(handlerId: string): boolean;
    schedule(handlerId: string, options: ScheduleOptions): Task;
    scheduleOnce(handlerId: string, options: Omit<ScheduleOptions, 'intervalMs' | 'cronExpression'>): Task;
    scheduleRecurring(handlerId: string, intervalMs: number, options: Omit<ScheduleOptions, 'intervalMs'>): Task;
    scheduleCron(handlerId: string, cronExpression: string, options: Omit<ScheduleOptions, 'cronExpression'>): Task;
    getTask(taskId: string): Task | undefined;
    getAllTasks(): Task[];
    getTasksByStatus(status: TaskStatus): Task[];
    getTasksByTag(tag: string): Task[];
    cancelTask(taskId: string): boolean;
    removeTask(taskId: string): boolean;
    private processTasks;
    private executeTask;
    private scheduleNextRun;
    onNotification(handler: NotificationHandler): () => void;
    private notify;
    getStats(): SchedulerStats;
    private generateId;
    private determineScheduleType;
    private priorityToNumber;
    private parseCronToMs;
    getTasksForPersistence(): Map<string, Task>;
    restoreTasks(tasks: Task[]): void;
}
export default ShadowScheduler;
//# sourceMappingURL=scheduler.d.ts.map