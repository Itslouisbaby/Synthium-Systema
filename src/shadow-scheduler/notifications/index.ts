/**
 * M10 Shadow Scheduler - Notifications
 * Task 2: Notification System
 */

import { NotificationEvent, NotificationHandler, Logger } from '../types';

export interface NotificationConfig {
  enabled: boolean;
  logToConsole?: boolean;
  webhookUrl?: string;
  emailRecipients?: string[];
  batchIntervalMs?: number;
}

export interface NotificationChannel {
  name: string;
  send(event: NotificationEvent): Promise<void>;
}

export class NotificationManager {
  private config: NotificationConfig;
  private channels: Map<string, NotificationChannel> = new Map();
  private handlers: Set<NotificationHandler> = new Set();
  private batchQueue: NotificationEvent[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;

  constructor(config: NotificationConfig, logger: Logger = console as unknown as Logger) {
    this.config = { enabled: true, logToConsole: true, batchIntervalMs: 0, ...config };
    this.logger = logger;

    if (this.config.batchIntervalMs && this.config.batchIntervalMs > 0) {
      this.startBatching();
    }
  }

  // ==================== Channels ====================

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
  }

  unregisterChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  getChannelNames(): string[] {
    return Array.from(this.channels.keys());
  }

  // ==================== Handlers ====================

  subscribe(handler: NotificationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // ==================== Sending ====================

  async notify(event: NotificationEvent): Promise<void> {
    if (!this.config.enabled) return;

    if (this.config.batchIntervalMs && this.config.batchIntervalMs > 0) {
      this.batchQueue.push(event);
      return;
    }

    await this.processEvent(event);
  }

  private async processEvent(event: NotificationEvent): Promise<void> {
    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(event);
    }

    // Send to all handlers
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error('Notification handler failed', { 
          error: (error as Error).message,
          eventType: event.type 
        });
      }
    }

    // Send to all channels
    for (const channel of this.channels.values()) {
      try {
        await channel.send(event);
      } catch (error) {
        this.logger.error(`Channel ${channel.name} failed`, { 
          error: (error as Error).message 
        });
      }
    }
  }

  private logToConsole(event: NotificationEvent): void {
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

  private getEventEmoji(type: NotificationEvent['type']): string {
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

  private startBatching(): void {
    if (this.batchTimer) return;

    this.batchTimer = setInterval(async () => {
      if (this.batchQueue.length === 0) return;

      const events = [...this.batchQueue];
      this.batchQueue = [];

      for (const event of events) {
        await this.processEvent(event);
      }
    }, this.config.batchIntervalMs);
  }

  stopBatching(): void {
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

  static createConsoleChannel(): NotificationChannel {
    return {
      name: 'console',
      async send(event: NotificationEvent): Promise<void> {
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

  static createWebhookChannel(url: string): NotificationChannel {
    return {
      name: 'webhook',
      async send(event: NotificationEvent): Promise<void> {
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

export default NotificationManager;
