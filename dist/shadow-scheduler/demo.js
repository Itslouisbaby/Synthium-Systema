"use strict";
/**
 * M10 Shadow Scheduler - Integration Demo
 * Task 3: Integration Demo - Full System Showcase
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerDemo = void 0;
const scheduler_1 = require("./core/scheduler");
const persistence_1 = require("./persistence");
const notifications_1 = require("./notifications");
const ui_1 = require("./ui");
const DEFAULT_DEMO_CONFIG = {
    persistencePath: './scheduler-state.json',
    enableNotifications: true,
    enablePersistence: true,
    demoDurationMs: 30000,
};
class SchedulerDemo {
    config;
    scheduler;
    persistence;
    notifications;
    ui;
    logger;
    constructor(config = {}) {
        this.config = { ...DEFAULT_DEMO_CONFIG, ...config };
        this.logger = {
            debug: (msg, meta) => console.log(`[DEBUG] ${msg}`, meta ?? ''),
            info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
            warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
            error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
        };
        const schedulerConfig = {
            maxConcurrentTasks: 3,
            defaultTimeoutMs: 10000,
            defaultMaxRetries: 2,
            checkIntervalMs: 500,
            persistenceEnabled: this.config.enablePersistence,
            notificationsEnabled: this.config.enableNotifications,
        };
        this.scheduler = new scheduler_1.ShadowScheduler(schedulerConfig, this.logger);
        this.ui = new ui_1.SchedulerUI();
        const notifConfig = {
            enabled: this.config.enableNotifications,
            logToConsole: true,
            batchIntervalMs: 0,
        };
        this.notifications = new notifications_1.NotificationManager(notifConfig, this.logger);
        if (this.config.enablePersistence) {
            this.persistence = new persistence_1.SchedulerPersistence({
                path: this.config.persistencePath,
                autoSaveIntervalMs: 5000,
            });
        }
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        // Connect scheduler events to notifications
        this.scheduler.onNotification((event) => {
            this.notifications.notify(event);
            console.log(this.ui.renderNotificationToast(event));
        });
        // Log task lifecycle
        this.scheduler.on('taskScheduled', (task) => {
            this.logger.info(`📅 Task scheduled: ${task.name}`);
        });
        this.scheduler.on('taskStarted', (task) => {
            this.logger.info(`▶️ Task started: ${task.name}`);
        });
        this.scheduler.on('taskCompleted', (task, result) => {
            this.logger.info(`✅ Task completed: ${task.name}`, { result: result.data });
        });
        this.scheduler.on('taskFailed', (task, error) => {
            this.logger.error(`❌ Task failed: ${task.name}`, { error: error.message });
        });
    }
    async run() {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║          🕐 M10 SHADOW SCHEDULER DEMO                        ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');
        // Register demo handlers
        this.registerHandlers();
        // Restore state if persistence enabled
        if (this.persistence) {
            await this.restoreState();
        }
        // Start scheduler
        this.scheduler.start();
        this.logger.info('Scheduler started');
        // Start auto-save if persistence enabled
        if (this.persistence) {
            this.persistence.startAutoSave(() => this.scheduler.getTasksForPersistence());
        }
        // Schedule demo tasks
        this.scheduleDemoTasks();
        // Run demo loop
        await this.runDemoLoop();
        // Cleanup
        await this.cleanup();
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║              DEMO COMPLETED                                  ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
    }
    registerHandlers() {
        // Quick task handler
        this.scheduler.registerHandler('quick-task', async () => {
            await this.delay(500);
            return { success: true, data: { duration: 500 } };
        });
        // Slow task handler
        this.scheduler.registerHandler('slow-task', async () => {
            await this.delay(2000);
            return { success: true, data: { duration: 2000 } };
        });
        // Random task handler (sometimes fails)
        this.scheduler.registerHandler('random-task', async () => {
            await this.delay(1000);
            if (Math.random() > 0.7) {
                return { success: false, error: new Error('Random failure') };
            }
            return { success: true, data: { lucky: true } };
        });
        // Counter task handler
        let counter = 0;
        this.scheduler.registerHandler('counter-task', async () => {
            counter++;
            await this.delay(300);
            return { success: true, data: { count: counter } };
        });
        // Data processing handler
        this.scheduler.registerHandler('data-processor', async (context) => {
            const batchSize = context.metadata.batchSize ?? 10;
            await this.delay(800);
            return {
                success: true,
                data: { processed: batchSize, timestamp: Date.now() }
            };
        });
        this.logger.info('Registered 5 task handlers');
    }
    async restoreState() {
        try {
            const tasks = await this.persistence.load();
            this.scheduler.restoreTasks(tasks);
            this.logger.info(`Restored ${tasks.length} tasks from persistence`);
        }
        catch (error) {
            this.logger.warn('Failed to restore state', { error: error.message });
        }
    }
    scheduleDemoTasks() {
        // Schedule various types of tasks
        // One-time tasks
        this.scheduler.scheduleOnce('quick-task', {
            name: 'Quick Setup',
            description: 'Fast initialization task',
            priority: 'high',
            tags: ['demo', 'setup'],
        });
        this.scheduler.scheduleOnce('slow-task', {
            name: 'Heavy Processing',
            description: 'CPU intensive work',
            priority: 'normal',
            tags: ['demo', 'processing'],
        });
        // Recurring tasks
        this.scheduler.scheduleRecurring('counter-task', 3000, {
            name: 'Heartbeat Counter',
            description: 'Recurring heartbeat task',
            priority: 'low',
            maxRuns: 5,
            tags: ['demo', 'recurring'],
        });
        this.scheduler.scheduleRecurring('random-task', 4000, {
            name: 'Random Check',
            description: 'Periodic random check',
            priority: 'normal',
            maxRuns: 3,
            tags: ['demo', 'random'],
        });
        // Data processing with metadata
        this.scheduler.scheduleOnce('data-processor', {
            name: 'Batch Processor',
            description: 'Process batch of data',
            priority: 'critical',
            metadata: { batchSize: 100 },
            tags: ['demo', 'data'],
        });
        this.logger.info('Scheduled 5 demo tasks');
    }
    async runDemoLoop() {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const stats = this.scheduler.getStats();
            console.clear();
            console.log(this.ui.renderDashboard(stats, this.scheduler.getAllTasks()));
            console.log('\n' + this.ui.renderTaskList(this.scheduler.getAllTasks()));
            if (Date.now() - startTime > this.config.demoDurationMs) {
                clearInterval(interval);
            }
        }, 1000);
        // Wait for demo duration
        await this.delay(this.config.demoDurationMs + 2000);
    }
    async cleanup() {
        this.logger.info('Cleaning up...');
        if (this.persistence) {
            this.persistence.stopAutoSave();
            await this.persistence.save(this.scheduler.getTasksForPersistence());
            this.logger.info('Final state saved');
        }
        this.scheduler.stop();
        this.notifications.stopBatching();
        // Print final stats
        const stats = this.scheduler.getStats();
        console.log('\n📊 Final Statistics:');
        console.log(`   Total Tasks: ${stats.totalTasks}`);
        console.log(`   Completed: ${stats.completedTasks}`);
        console.log(`   Failed: ${stats.failedTasks}`);
        console.log(`   Cancelled: ${stats.cancelledTasks}`);
        console.log(`   Avg Execution Time: ${stats.averageExecutionTimeMs}ms`);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // ==================== Static Demo Runners ====================
    static async runQuickDemo() {
        const demo = new SchedulerDemo({ demoDurationMs: 10000 });
        await demo.run();
    }
    static async runFullDemo() {
        const demo = new SchedulerDemo({ demoDurationMs: 60000 });
        await demo.run();
    }
    static async runNoPersistenceDemo() {
        const demo = new SchedulerDemo({
            enablePersistence: false,
            demoDurationMs: 15000
        });
        await demo.run();
    }
}
exports.SchedulerDemo = SchedulerDemo;
exports.default = SchedulerDemo;
//# sourceMappingURL=demo.js.map