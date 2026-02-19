/**
 * M10 Shadow Scheduler - Integration Demo
 * Task 3: Integration Demo - Full System Showcase
 */
export interface DemoConfig {
    persistencePath: string;
    enableNotifications: boolean;
    enablePersistence: boolean;
    demoDurationMs: number;
}
export declare class SchedulerDemo {
    private config;
    private scheduler;
    private persistence?;
    private notifications;
    private ui;
    private logger;
    constructor(config?: Partial<DemoConfig>);
    private setupEventHandlers;
    run(): Promise<void>;
    private registerHandlers;
    private restoreState;
    private scheduleDemoTasks;
    private runDemoLoop;
    private cleanup;
    private delay;
    static runQuickDemo(): Promise<void>;
    static runFullDemo(): Promise<void>;
    static runNoPersistenceDemo(): Promise<void>;
}
export default SchedulerDemo;
//# sourceMappingURL=demo.d.ts.map