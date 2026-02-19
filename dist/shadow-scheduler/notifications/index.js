"use strict";
/**
 * M10 Shadow Scheduler - Notifications
 * Task 2: Notification System
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationManager = void 0;
class NotificationManager {
    config;
    channels = new Map();
    handlers = new Set();
    batchQueue = [];
    batchTimer = null;
    logger;
    constructor(config, logger = console) {
        this.config = { logToConsole: true, batchIntervalMs: 0, ...config };
        this.logger = logger;
        if (this.config.batchIntervalMs && this.config.batchIntervalMs > 0) {
            this.startBatching();
        }
    }
    // ==================== Channels ====================
    registerChannel(channel) {
        this.channels.set(channel.name, channel);
    }
    unregisterChannel(name) {
        return this.channels.delete(name);
    }
    getChannelNames() {
        return Array.from(this.channels.keys());
    }
    // ==================== Handlers ====================
    subscribe(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    // ==================== Sending ====================
    async notify(event) {
        if (!this.config.enabled)
            return;
        if (this.config.batchIntervalMs && this.config.batchIntervalMs > 0) {
            this.batchQueue.push(event);
            return;
        }
        await this.processEvent(event);
    }
    async processEvent(event) {
        // Log to console if enabled
        if (this.config.logToConsole) {
            this.logToConsole(event);
        }
        // Send to all handlers
        for (const handler of this.handlers) {
            try {
                await handler(event);
            }
            catch (error) {
                this.logger.error('Notification handler failed', {
                    error: error.message,
                    eventType: event.type
                });
            }
        }
        // Send to all channels
        for (const channel of this.channels.values()) {
            try {
                await channel.send(event);
            }
            catch (error) {
                this.logger.error(`Channel ${channel.name} failed`, {
                    error: error.message
                });
            }
        }
    }
    logToConsole(event) {
        const emoji = this.getEventEmoji(event.type);
        const message = `${emoji} [${event.type.toUpperCase()}] ${event.taskName} (${event.taskId})`;
        switch (event.type) {
            case 'task_failed':
                this.logger.error(message, event.data);
                break;
            case 'task_completed':
                this.logger.info(message, event.data);
                break;
            default:
                this.logger.info(message);
        }
    }
    getEventEmoji(type) {
        switch (type) {
            case 'task_scheduled': return '📅';
            case 'task_started': return '▶️';
            case 'task_completed': return '✅';
            case 'task_failed': return '❌';
            case 'task_cancelled': return '🚫';
            default: return '📌';
        }
    }
    // ==================== Batching ====================
    startBatching() {
        if (this.batchTimer)
            return;
        this.batchTimer = setInterval(async () => {
            if (this.batchQueue.length === 0)
                return;
            const events = [...this.batchQueue];
            this.batchQueue = [];
            for (const event of events) {
                await this.processEvent(event);
            }
        }, this.config.batchIntervalMs);
    }
    stopBatching() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
        // Process remaining events
        const events = [...this.batchQueue];
        this.batchQueue = [];
        for (const event of events) {
            this.processEvent(event);
        }
    }
    // ==================== Built-in Channels ====================
    static createConsoleChannel() {
        return {
            name: 'console',
            async send(event) {
                const emoji = {
                    'task_scheduled': '📅',
                    'task_started': '▶️',
                    'task_completed': '✅',
                    'task_failed': '❌',
                    'task_cancelled': '🚫',
                }[event.type] || '📌';
                console.log(`[${new Date().toISOString()}] ${emoji} ${event.type}: ${event.taskName}`);
            }
        };
    }
    static createWebhookChannel(url) {
        return {
            name: 'webhook',
            async send(event) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(event),
                });
                if (!response.ok) {
                    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
                }
            }
        };
    }
}
exports.NotificationManager = NotificationManager;
exports.default = NotificationManager;
//# sourceMappingURL=index.js.map