/**
 * M10 Shadow Scheduler - Persistence Layer
 * Task 2: Persistence - Save/Load Scheduler State
 */
import { Task } from '../types';
export interface PersistenceConfig {
    path: string;
    autoSaveIntervalMs?: number;
    encrypt?: boolean;
    compression?: boolean;
}
export declare class SchedulerPersistence {
    private config;
    private autoSaveTimer;
    constructor(config: PersistenceConfig);
    save(tasks: Map<string, Task>): Promise<void>;
    private serializeTask;
    load(): Promise<Task[]>;
    private deserializeTask;
    startAutoSave(getTasks: () => Map<string, Task>): void;
    stopAutoSave(): void;
    exists(): Promise<boolean>;
    delete(): Promise<void>;
    getLastSavedAt(): Promise<Date | null>;
}
export default SchedulerPersistence;
//# sourceMappingURL=index.d.ts.map