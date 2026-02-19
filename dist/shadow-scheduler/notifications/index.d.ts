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
export declare class NotificationManager {
    private config;
    private channels;
    private handlers;
    private batchQueue;
    private batchTimer;
    private logger;
    constructor(config: NotificationConfig, logger?: Logger);
    registerChannel(channel: NotificationChannel): void;
    unregisterChannel(name: string): boolean;
    getChannelNames(): string[];
    subscribe(handler: NotificationHandler): () => void;
    notify(event: NotificationEvent): Promise<void>;
    private processEvent;
    private logToConsole;
    private getEventEmoji;
    private startBatching;
    stopBatching(): void;
    static createConsoleChannel(): NotificationChannel;
    static createWebhookChannel(url: string): NotificationChannel;
}
export default NotificationManager;
//# sourceMappingURL=index.d.ts.map