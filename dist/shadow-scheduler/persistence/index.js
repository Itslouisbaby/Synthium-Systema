"use strict";
/**
 * M10 Shadow Scheduler - Persistence Layer
 * Task 2: Persistence - Save/Load Scheduler State
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerPersistence = void 0;
const fs_1 = require("fs");
const CURRENT_VERSION = 1;
class SchedulerPersistence {
    config;
    autoSaveTimer = null;
    constructor(config) {
        this.config = {
            autoSaveIntervalMs: 30000,
            ...config,
        };
    }
    // ==================== Save ====================
    async save(tasks) {
        const serializedTasks = [];
        for (const task of tasks.values()) {
            const serialized = this.serializeTask(task);
            if (serialized) {
                serializedTasks.push(serialized);
            }
        }
        const state = {
            version: CURRENT_VERSION,
            tasks: serializedTasks,
            lastSavedAt: new Date().toISOString(),
        };
        const data = JSON.stringify(state, null, 2);
        await fs_1.promises.writeFile(this.config.path, data, 'utf-8');
    }
    serializeTask(task) {
        // Don't serialize running tasks - they'll restart as pending
        if (task.status === 'running') {
            return null;
        }
        return {
            id: task.id,
            name: task.name,
            description: task.description,
            status: task.status,
            priority: task.priority,
            scheduleType: task.scheduleType,
            scheduledAt: task.scheduledAt?.toISOString(),
            nextRunAt: task.nextRunAt?.toISOString(),
            lastRunAt: task.lastRunAt?.toISOString(),
            completedAt: task.completedAt?.toISOString(),
            intervalMs: task.intervalMs,
            cronExpression: task.cronExpression,
            maxRuns: task.maxRuns,
            runCount: task.runCount,
            maxRetries: task.maxRetries,
            timeoutMs: task.timeoutMs,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            tags: task.tags,
            metadata: task.metadata,
            handlerId: task.metadata?.handlerId,
        };
    }
    // ==================== Load ====================
    async load() {
        try {
            const data = await fs_1.promises.readFile(this.config.path, 'utf-8');
            const state = JSON.parse(data);
            if (state.version !== CURRENT_VERSION) {
                throw new Error(`Unsupported persistence version: ${state.version}`);
            }
            return state.tasks.map(t => this.deserializeTask(t));
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return []; // File doesn't exist yet
            }
            throw error;
        }
    }
    deserializeTask(serialized) {
        // Placeholder handler - will be replaced during restore
        const placeholderHandler = async () => ({ success: false, error: new Error('Handler not restored') });
        return {
            id: serialized.id,
            name: serialized.name,
            description: serialized.description,
            status: serialized.status,
            priority: serialized.priority,
            scheduleType: serialized.scheduleType,
            scheduledAt: serialized.scheduledAt ? new Date(serialized.scheduledAt) : undefined,
            nextRunAt: serialized.nextRunAt ? new Date(serialized.nextRunAt) : undefined,
            lastRunAt: serialized.lastRunAt ? new Date(serialized.lastRunAt) : undefined,
            completedAt: serialized.completedAt ? new Date(serialized.completedAt) : undefined,
            intervalMs: serialized.intervalMs,
            cronExpression: serialized.cronExpression,
            maxRuns: serialized.maxRuns,
            runCount: serialized.runCount,
            handler: placeholderHandler,
            retryCount: 0, // Reset retry count on load
            maxRetries: serialized.maxRetries,
            timeoutMs: serialized.timeoutMs,
            createdAt: new Date(serialized.createdAt),
            updatedAt: new Date(serialized.updatedAt),
            tags: serialized.tags,
            metadata: serialized.metadata,
        };
    }
    // ==================== Auto Save ====================
    startAutoSave(getTasks) {
        if (this.autoSaveTimer)
            return;
        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.save(getTasks());
            }
            catch (error) {
                console.error('Auto-save failed:', error);
            }
        }, this.config.autoSaveIntervalMs);
    }
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
    // ==================== Utility ====================
    async exists() {
        try {
            await fs_1.promises.access(this.config.path);
            return true;
        }
        catch {
            return false;
        }
    }
    async delete() {
        try {
            await fs_1.promises.unlink(this.config.path);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    async getLastSavedAt() {
        try {
            const data = await fs_1.promises.readFile(this.config.path, 'utf-8');
            const state = JSON.parse(data);
            return state.lastSavedAt ? new Date(state.lastSavedAt) : null;
        }
        catch {
            return null;
        }
    }
}
exports.SchedulerPersistence = SchedulerPersistence;
exports.default = SchedulerPersistence;
//# sourceMappingURL=index.js.map