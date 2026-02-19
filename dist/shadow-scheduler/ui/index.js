"use strict";
/**
 * M10 Shadow Scheduler - UI Components
 * Task 3: Notification UI
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerUI = void 0;
const DEFAULT_THEME = {
    primaryColor: '#3b82f6',
    successColor: '#22c55e',
    errorColor: '#ef4444',
    warningColor: '#f59e0b',
    backgroundColor: '#1f2937',
    textColor: '#f3f4f6',
};
class SchedulerUI {
    theme;
    constructor(theme = {}) {
        this.theme = { ...DEFAULT_THEME, ...theme };
    }
    // ==================== Dashboard ====================
    renderDashboard(stats, recentTasks) {
        const lines = [
            '╔══════════════════════════════════════════════════════════════╗',
            '║              🕐 SHADOW SCHEDULER DASHBOARD                   ║',
            '╠══════════════════════════════════════════════════════════════╣',
            this.renderStatsLine(stats),
            '╠══════════════════════════════════════════════════════════════╣',
            '║ RECENT ACTIVITY                                              ║',
            '╠══════════════════════════════════════════════════════════════╣',
        ];
        if (recentTasks.length === 0) {
            lines.push('║ No recent tasks                                              ║');
        }
        else {
            for (const task of recentTasks.slice(0, 5)) {
                lines.push(this.renderTaskLine(task));
            }
        }
        lines.push('╚══════════════════════════════════════════════════════════════╝');
        return lines.join('\n');
    }
    renderStatsLine(stats) {
        return [
            '║',
            `  Total: ${this.pad(stats.totalTasks, 3)}`,
            `  Pending: ${this.colorize(this.pad(stats.pendingTasks, 3), 'warningColor')}`,
            `  Running: ${this.colorize(this.pad(stats.runningTasks, 3), 'primaryColor')}`,
            `  Completed: ${this.colorize(this.pad(stats.completedTasks, 3), 'successColor')}`,
            `  Failed: ${this.colorize(this.pad(stats.failedTasks, 3), 'errorColor')}`,
            '  '.padEnd(3),
            '║',
        ].join('');
    }
    renderTaskLine(task) {
        const icon = this.getStatusIcon(task.status);
        const name = task.name.slice(0, 30).padEnd(30);
        const status = task.status.toUpperCase().padEnd(10);
        const priority = task.priority.toUpperCase().padEnd(8);
        return `║ ${icon} ${name} │ ${status} │ ${priority} ║`;
    }
    // ==================== Task List ====================
    renderTaskList(tasks, filter) {
        const filteredTasks = filter ? tasks.filter(t => t.status === filter) : tasks;
        const lines = [
            '┌─────────────────────────────────────────────────────────────┐',
            `│ TASK LIST ${filter ? `[${filter.toUpperCase()}]` : '[ALL]'.padEnd(20)}                    │`,
            '├─────────────────────────────────────────────────────────────┤',
            '│ ID        │ NAME                 │ STATUS    │ PRIORITY    │',
            '├─────────────────────────────────────────────────────────────┤',
        ];
        for (const task of filteredTasks) {
            const id = task.id.slice(0, 8).padEnd(9);
            const name = task.name.slice(0, 20).padEnd(20);
            const status = this.colorize(task.status.padEnd(9), this.getStatusColor(task.status));
            const priority = task.priority.padEnd(11);
            lines.push(`│ ${id}│ ${name} │ ${status} │ ${priority}│`);
        }
        if (filteredTasks.length === 0) {
            lines.push('│                    No tasks found                           │');
        }
        lines.push('└─────────────────────────────────────────────────────────────┘');
        return lines.join('\n');
    }
    // ==================== Task Detail ====================
    renderTaskDetail(task) {
        const lines = [
            '╔══════════════════════════════════════════════════════════════╗',
            `║ TASK: ${task.name.slice(0, 50).padEnd(50)} ║`,
            '╠══════════════════════════════════════════════════════════════╣',
            `║ ID:          ${task.id.padEnd(52)} ║`,
            `║ Status:      ${this.colorize(task.status.toUpperCase().padEnd(52), this.getStatusColor(task.status))} ║`,
            `║ Priority:    ${task.priority.toUpperCase().padEnd(52)} ║`,
            `║ Type:        ${task.scheduleType.padEnd(52)} ║`,
            `║ Run Count:   ${String(task.runCount).padEnd(52)} ║`,
            `║ Max Retries: ${String(task.maxRetries).padEnd(52)} ║`,
            `║ Tags:        ${task.tags.join(', ').slice(0, 52).padEnd(52)} ║`,
        ];
        if (task.nextRunAt) {
            lines.push(`║ Next Run:    ${task.nextRunAt.toISOString().padEnd(52)} ║`);
        }
        if (task.lastRunAt) {
            lines.push(`║ Last Run:    ${task.lastRunAt.toISOString().padEnd(52)} ║`);
        }
        if (task.completedAt) {
            lines.push(`║ Completed:   ${task.completedAt.toISOString().padEnd(52)} ║`);
        }
        lines.push('╚══════════════════════════════════════════════════════════════╝');
        return lines.join('\n');
    }
    // ==================== Notification Toast ====================
    renderNotificationToast(event) {
        const icon = this.getEventIcon(event.type);
        const color = this.getEventColor(event.type);
        const title = event.type.replace(/_/g, ' ').toUpperCase();
        return [
            '┌─────────────────────────────────────────┐',
            `│ ${icon} ${this.colorize(title.padEnd(36), color)} │`,
            '├─────────────────────────────────────────┤',
            `│ Task: ${event.taskName.slice(0, 33).padEnd(33)} │`,
            `│ Time: ${event.timestamp.toISOString().slice(0, 19).padEnd(33)} │`,
            '└─────────────────────────────────────────┘',
        ].join('\n');
    }
    // ==================== Log Output ====================
    renderLogEntry(event) {
        const timestamp = event.timestamp.toISOString();
        const level = this.getEventLogLevel(event.type);
        const message = `${event.type}: ${event.taskName}`;
        return `[${timestamp}] [${level}] ${message}`;
    }
    // ==================== Progress Bar ====================
    renderProgressBar(completed, total, width = 40) {
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        const pctStr = `${percentage.toFixed(1)}%`;
        return `[${bar}] ${pctStr} (${completed}/${total})`;
    }
    // ==================== Helpers ====================
    pad(num, width) {
        return String(num).padStart(width);
    }
    getStatusIcon(status) {
        switch (status) {
            case 'pending': return '⏳';
            case 'running': return '▶️';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'cancelled': return '🚫';
            default: return '❓';
        }
    }
    getStatusColor(status) {
        switch (status) {
            case 'pending': return 'warningColor';
            case 'running': return 'primaryColor';
            case 'completed': return 'successColor';
            case 'failed': return 'errorColor';
            case 'cancelled': return 'warningColor';
            default: return 'textColor';
        }
    }
    getEventIcon(type) {
        switch (type) {
            case 'task_scheduled': return '📅';
            case 'task_started': return '▶️';
            case 'task_completed': return '✅';
            case 'task_failed': return '❌';
            case 'task_cancelled': return '🚫';
            default: return '📌';
        }
    }
    getEventColor(type) {
        switch (type) {
            case 'task_scheduled': return 'primaryColor';
            case 'task_started': return 'primaryColor';
            case 'task_completed': return 'successColor';
            case 'task_failed': return 'errorColor';
            case 'task_cancelled': return 'warningColor';
            default: return 'textColor';
        }
    }
    getEventLogLevel(type) {
        switch (type) {
            case 'task_failed': return 'ERROR';
            case 'task_completed': return 'INFO';
            default: return 'DEBUG';
        }
    }
    colorize(text, colorKey) {
        // In a real terminal UI, this would apply ANSI color codes
        // For now, return plain text
        return text;
    }
}
exports.SchedulerUI = SchedulerUI;
exports.default = SchedulerUI;
//# sourceMappingURL=index.js.map