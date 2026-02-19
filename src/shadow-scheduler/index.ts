/**
 * M10 Shadow Scheduler - Main Entry Point
 * Export all modules for the Shadow Scheduler system
 */

// Types
export * from './types';

// Core
export { ShadowScheduler } from './core/scheduler';

// Persistence
export { SchedulerPersistence, PersistenceConfig } from './persistence';

// Notifications
export { NotificationManager, NotificationConfig, NotificationChannel } from './notifications';

// UI
export { SchedulerUI, UITheme } from './ui';

// Demo
export { SchedulerDemo, DemoConfig } from './demo';
