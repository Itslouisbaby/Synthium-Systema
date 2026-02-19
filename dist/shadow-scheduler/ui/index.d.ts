/**
 * M10 Shadow Scheduler - UI Components
 * Task 3: Notification UI
 */
import { Task, TaskStatus, SchedulerStats, NotificationEvent } from '../types';
export interface UITheme {
    primaryColor: string;
    successColor: string;
    errorColor: string;
    warningColor: string;
    backgroundColor: string;
    textColor: string;
}
export declare class SchedulerUI {
    private theme;
    constructor(theme?: Partial<UITheme>);
    renderDashboard(stats: SchedulerStats, recentTasks: Task[]): string;
    private renderStatsLine;
    private renderTaskLine;
    renderTaskList(tasks: Task[], filter?: TaskStatus): string;
    renderTaskDetail(task: Task): string;
    renderNotificationToast(event: NotificationEvent): string;
    renderLogEntry(event: NotificationEvent): string;
    renderProgressBar(completed: number, total: number, width?: number): string;
    private pad;
    private getStatusIcon;
    private getStatusColor;
    private getEventIcon;
    private getEventColor;
    private getEventLogLevel;
    private colorize;
}
export default SchedulerUI;
//# sourceMappingURL=index.d.ts.map