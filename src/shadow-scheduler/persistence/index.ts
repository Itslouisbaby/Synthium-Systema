/**
 * M10 Shadow Scheduler - Persistence Layer
 * Task 2: Persistence - Save/Load Scheduler State
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { Task, PersistedState, SerializedTask, TaskHandler } from '../types';

export interface PersistenceConfig {
  path: string;
  autoSaveIntervalMs?: number;
  encrypt?: boolean;
  compression?: boolean;
}

const CURRENT_VERSION = 1;

export class SchedulerPersistence {
  private config: PersistenceConfig;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: PersistenceConfig) {
    this.config = {
      autoSaveIntervalMs: 30000,
      ...config,
    };
  }

  // ==================== Save ====================

  async save(tasks: Map<string, Task>): Promise<void> {
    const serializedTasks: SerializedTask[] = [];

    for (const task of tasks.values()) {
      const serialized = this.serializeTask(task);
      if (serialized) {
        serializedTasks.push(serialized);
      }
    }

    const state: PersistedState = {
      version: CURRENT_VERSION,
      tasks: serializedTasks,
      lastSavedAt: new Date().toISOString(),
    };

    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(this.config.path, data, 'utf-8');
  }

  private serializeTask(task: Task): SerializedTask | null {
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
      handlerId: task.metadata?.handlerId as string | undefined,
    };
  }

  // ==================== Load ====================

  async load(): Promise<Task[]> {
    try {
      const data = await fs.readFile(this.config.path, 'utf-8');
      const state: PersistedState = JSON.parse(data);

      if (state.version !== CURRENT_VERSION) {
        throw new Error(`Unsupported persistence version: ${state.version}`);
      }

      return state.tasks.map(t => this.deserializeTask(t));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  private deserializeTask(serialized: SerializedTask): Task {
    // Placeholder handler - will be replaced during restore
    const placeholderHandler: TaskHandler = async () => ({ success: false, error: new Error('Handler not restored') });

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

  startAutoSave(getTasks: () => Map<string, Task>): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.save(getTasks());
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, this.config.autoSaveIntervalMs);
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ==================== Utility ====================

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.config.path);
      return true;
    } catch {
      return false;
    }
  }

  async delete(): Promise<void> {
    try {
      await fs.unlink(this.config.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async getLastSavedAt(): Promise<Date | null> {
    try {
      const data = await fs.readFile(this.config.path, 'utf-8');
      const state: PersistedState = JSON.parse(data);
      return state.lastSavedAt ? new Date(state.lastSavedAt) : null;
    } catch {
      return null;
    }
  }
}

export default SchedulerPersistence;
