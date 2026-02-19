"use strict";
/**
 * M10 Shadow Scheduler - Core Scheduler Engine
 * Task 1: Scheduler Core - Main Implementation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShadowScheduler = void 0;
const events_1 = require("events");
const DEFAULT_CONFIG = {
    maxConcurrentTasks: 5,
    defaultTimeoutMs: 30000,
    defaultMaxRetries: 3,
    checkIntervalMs: 1000,
    persistenceEnabled: false,
    notificationsEnabled: true,
};
const DEFAULT_LOGGER = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};
class ShadowScheduler extends events_1.EventEmitter {
    tasks = new Map();
    handlers = new Map();
    runningTasks = new Map();
    config;
    logger;
    checkInterval = null;
    notificationHandlers = new Set();
    executionTimes = [];
    constructor(config = {}, logger = DEFAULT_LOGGER) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = logger;
    }
    // ==================== Lifecycle ====================
    start() {
        if (this.checkInterval)
            return;
        this.logger.info('ShadowScheduler starting', { config: this.config });
        this.checkInterval = setInterval(() => this.processTasks(), this.config.checkIntervalMs);
        this.emit('started');
    }
    stop() {
        if (!this.checkInterval)
            return;
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
    isRunning() {
        return this.checkInterval !== null;
    }
    // ==================== Task Registration ====================
    registerHandler(handlerId, handler) {
        this.handlers.set(handlerId, handler);
        this.logger.debug(`Registered handler: ${handlerId}`);
    }
    unregisterHandler(handlerId) {
        const result = this.handlers.delete(handlerId);
        if (result) {
            this.logger.debug(`Unregistered handler: ${handlerId}`);
        }
        return result;
    }
    // ==================== Task Scheduling ====================
    schedule(handlerId, options) {
        const handler = this.handlers.get(handlerId);
        if (!handler) {
            throw new Error(`Handler not found: ${handlerId}`);
        }
        const task = {
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
    scheduleOnce(handlerId, options) {
        return this.schedule(handlerId, { ...options, scheduledAt: options.scheduledAt ?? new Date() });
    }
    scheduleRecurring(handlerId, intervalMs, options) {
        return this.schedule(handlerId, { ...options, intervalMs, scheduledAt: new Date() });
    }
    scheduleCron(handlerId, cronExpression, options) {
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
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    getAllTasks() {
        return Array.from(this.tasks.values());
    }
    getTasksByStatus(status) {
        return this.getAllTasks().filter(t => t.status === status);
    }
    getTasksByTag(tag) {
        return this.getAllTasks().filter(t => t.tags.includes(tag));
    }
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
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
    removeTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        if (task.status === 'running') {
            this.cancelTask(taskId);
        }
        this.tasks.delete(taskId);
        this.logger.debug(`Task removed: ${taskId}`);
        return true;
    }
    // ==================== Execution ====================
    async processTasks() {
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
    async executeTask(task) {
        if (this.runningTasks.has(task.id))
            return;
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
        let result;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Task timeout')), task.timeoutMs);
            });
            const context = {
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
            }
            else {
                throw result.error ?? new Error('Task failed without error');
            }
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            task.retryCount++;
            if (task.retryCount <= task.maxRetries) {
                task.status = 'pending';
                const retryAfterMs = error?.retryAfterMs ?? 5000;
                task.nextRunAt = new Date(Date.now() + retryAfterMs);
                task.updatedAt = new Date();
                this.logger.warn(`Task failed, will retry: ${task.id}`, {
                    error: error.message,
                    retryAfterMs,
                    attempt: task.retryCount,
                });
            }
            else {
                task.status = 'failed';
                task.updatedAt = new Date();
                this.logger.error(`Task failed permanently: ${task.id}`, { error: error.message });
                this.notify({
                    type: 'task_failed',
                    taskId: task.id,
                    taskName: task.name,
                    timestamp: new Date(),
                    data: { error: error.message, attempts: task.retryCount },
                });
                this.emit('taskFailed', task, error);
            }
        }
        finally {
            this.runningTasks.delete(task.id);
            this.scheduleNextRun(task);
        }
    }
    scheduleNextRun(task) {
        if (task.status !== 'completed' && task.status !== 'cancelled')
            return;
        if (task.maxRuns && task.runCount >= task.maxRuns)
            return;
        if (!task.intervalMs)
            return;
        task.status = 'pending';
        task.nextRunAt = new Date(Date.now() + task.intervalMs);
        task.updatedAt = new Date();
        task.retryCount = 0;
        this.logger.debug(`Scheduled next run for task: ${task.id}`, { nextRunAt: task.nextRunAt });
    }
    // ==================== Notifications ====================
    onNotification(handler) {
        this.notificationHandlers.add(handler);
        return () => this.notificationHandlers.delete(handler);
    }
    notify(event) {
        if (!this.config.notificationsEnabled)
            return;
        for (const handler of this.notificationHandlers) {
            try {
                handler(event);
            }
            catch (error) {
                this.logger.error('Notification handler failed', { error: error.message });
            }
        }
    }
    // ==================== Stats ====================
    getStats() {
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
    generateId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    determineScheduleType(options) {
        if (options.cronExpression)
            return 'cron';
        if (options.intervalMs)
            return 'recurring';
        return 'once';
    }
    priorityToNumber(priority) {
        const map = { low: 1, normal: 2, high: 3, critical: 4 };
        return map[priority];
    }
    parseCronToMs(cronExpression) {
        // Simplified cron parsing - just handle "*/N * * * *" patterns
        const match = cronExpression.match(/^\*\/(\d+) \* \* \* \*$/);
        if (match) {
            return parseInt(match[1], 10) * 60 * 1000;
        }
        // Default to 1 minute if can't parse
        return 60000;
    }
    // ==================== Persistence Support ====================
    getTasksForPersistence() {
        return new Map(this.tasks);
    }
    restoreTasks(tasks) {
        for (const task of tasks) {
            // Restore handler reference if handlerId exists
            const handlerId = task.metadata?.handlerId;
            if (handlerId && this.handlers.has(handlerId)) {
                task.handler = this.handlers.get(handlerId);
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
exports.ShadowScheduler = ShadowScheduler;
exports.default = ShadowScheduler;
//# sourceMappingURL=scheduler.js.map