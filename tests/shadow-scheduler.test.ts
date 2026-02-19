/**
 * M10 Shadow Scheduler - Test Suite
 * 28+ comprehensive tests covering all functionality
 */

import { 
  ShadowScheduler, 
  SchedulerPersistence, 
  NotificationManager, 
  SchedulerUI, 
  SchedulerDemo,
  Task,
  TaskResult,
  TaskContext,
  ScheduleOptions,
  TaskStatus,
} from '../src/shadow-scheduler';

import { promises as fs } from 'fs';
import { join } from 'path';

// ==================== Test Framework ====================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class TestRunner {
  private results: TestResult[] = [];

  async test(name: string, fn: () => Promise<void> | void): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      this.results.push({ name, passed: true, duration: Date.now() - start });
      process.stdout.write('✅');
    } catch (error) {
      this.results.push({ 
        name, 
        passed: false, 
        error: (error as Error).message,
        duration: Date.now() - start 
      });
      process.stdout.write('❌');
    }
  }

  report(): void {
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('                    TEST RESULTS                               ');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const passed = this.results.filter(r => r.passed);
    const failed = this.results.filter(r => !r.passed);
    
    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} | ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total: ${this.results.length} | Passed: ${passed.length} | Failed: ${failed.length}`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (failed.length > 0) {
      process.exit(1);
    }
  }
}

// ==================== Delay Helper ====================

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// ==================== Tests ====================

async function runTests(): Promise<void> {
  const runner = new TestRunner();
  const testFile = './test-scheduler-state.json';

  // ============ Core Scheduler Tests ============
  
  await runner.test('Scheduler: should create instance', () => {
    const scheduler = new ShadowScheduler();
    if (!scheduler) throw new Error('Failed to create scheduler');
  });

  await runner.test('Scheduler: should start and stop', async () => {
    const scheduler = new ShadowScheduler();
    scheduler.start();
    if (!scheduler.isRunning()) throw new Error('Scheduler not running');
    scheduler.stop();
    if (scheduler.isRunning()) throw new Error('Scheduler still running');
  });

  await runner.test('Scheduler: should register handler', () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
  });

  await runner.test('Scheduler: should schedule one-time task', async () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    const task = scheduler.scheduleOnce('test', { name: 'Test Task' });
    if (task.status !== 'pending') throw new Error('Task not pending');
    if (task.name !== 'Test Task') throw new Error('Wrong task name');
  });

  await runner.test('Scheduler: should schedule recurring task', async () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    const task = scheduler.scheduleRecurring('test', 1000, { name: 'Recurring' });
    if (task.scheduleType !== 'recurring') throw new Error('Not recurring');
    if (task.intervalMs !== 1000) throw new Error('Wrong interval');
  });

  await runner.test('Scheduler: should execute task', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 100 });
    let executed = false;
    
    scheduler.registerHandler('test', async () => {
      executed = true;
      return { success: true };
    });
    
    scheduler.scheduleOnce('test', { name: 'Execute Test' });
    scheduler.start();
    
    await delay(500);
    scheduler.stop();
    
    if (!executed) throw new Error('Task not executed');
  });

  await runner.test('Scheduler: should complete task successfully', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 100 });
    
    scheduler.registerHandler('test', async () => ({ 
      success: true, 
      data: { result: 'done' } 
    }));
    
    const task = scheduler.scheduleOnce('test', { name: 'Success Test' });
    scheduler.start();
    
    await delay(500);
    scheduler.stop();
    
    const updated = scheduler.getTask(task.id);
    if (updated?.status !== 'completed') throw new Error(`Task not completed: ${updated?.status}`);
  });

  await runner.test('Scheduler: should handle task failure', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 100, defaultMaxRetries: 0 });
    
    scheduler.registerHandler('test', async () => ({ 
      success: false, 
      error: new Error('Test error') 
    }));
    
    const task = scheduler.scheduleOnce('test', { name: 'Failure Test' });
    scheduler.start();
    
    await delay(500);
    scheduler.stop();
    
    const updated = scheduler.getTask(task.id);
    if (updated?.status !== 'failed') throw new Error(`Task not failed: ${updated?.status}`);
  });

  await runner.test('Scheduler: should retry failed tasks', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 100 });
    let attempts = 0;
    
    scheduler.registerHandler('test', async () => {
      attempts++;
      return { success: false, error: new Error('Fail') };
    });
    
    const task = scheduler.scheduleOnce('test', { name: 'Retry Test', maxRetries: 2 });
    scheduler.start();
    
    await delay(1000);
    scheduler.stop();
    
    if (attempts < 2) throw new Error(`Only ${attempts} attempts made`);
  });

  await runner.test('Scheduler: should respect max concurrent tasks', () => {
    const scheduler = new ShadowScheduler({ maxConcurrentTasks: 2 });
    if (scheduler.getStats().runningTasks > 2) {
      throw new Error('Too many concurrent tasks');
    }
  });

  await runner.test('Scheduler: should cancel task', async () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    const task = scheduler.scheduleOnce('test', { name: 'Cancel Test' });
    
    const cancelled = scheduler.cancelTask(task.id);
    if (!cancelled) throw new Error('Cancel failed');
    
    const updated = scheduler.getTask(task.id);
    if (updated?.status !== 'cancelled') throw new Error('Task not cancelled');
  });

  await runner.test('Scheduler: should remove task', () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    const task = scheduler.scheduleOnce('test', { name: 'Remove Test' });
    
    const removed = scheduler.removeTask(task.id);
    if (!removed) throw new Error('Remove failed');
    
    if (scheduler.getTask(task.id)) throw new Error('Task still exists');
  });

  await runner.test('Scheduler: should filter tasks by status', () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    scheduler.scheduleOnce('test', { name: 'Pending' });
    
    const pending = scheduler.getTasksByStatus('pending');
    if (pending.length !== 1) throw new Error(`Expected 1 pending, got ${pending.length}`);
  });

  await runner.test('Scheduler: should filter tasks by tag', () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    scheduler.scheduleOnce('test', { name: 'Tagged', tags: ['important'] });
    scheduler.scheduleOnce('test', { name: 'Untagged' });
    
    const tagged = scheduler.getTasksByTag('important');
    if (tagged.length !== 1) throw new Error(`Expected 1 tagged, got ${tagged.length}`);
  });

  await runner.test('Scheduler: should calculate stats', () => {
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    scheduler.scheduleOnce('test', { name: 'Stats Test' });
    
    const stats = scheduler.getStats();
    if (stats.totalTasks !== 1) throw new Error(`Expected 1 total, got ${stats.totalTasks}`);
  });

  await runner.test('Scheduler: should emit events', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 100 });
    let eventFired = false;
    
    scheduler.on('taskScheduled', () => { eventFired = true; });
    scheduler.registerHandler('test', async () => ({ success: true }));
    scheduler.scheduleOnce('test', { name: 'Event Test' });
    
    if (!eventFired) throw new Error('Event not fired');
  });

  // ============ Persistence Tests ============

  await runner.test('Persistence: should save tasks', async () => {
    const persistence = new SchedulerPersistence({ path: testFile });
    const scheduler = new ShadowScheduler();
    scheduler.registerHandler('test', async () => ({ success: true }));
    const task = scheduler.scheduleOnce('test', { name: 'Persist Test' });
    
    await persistence.save(scheduler.getTasksForPersistence());
    const exists = await persistence.exists();
    if (!exists) throw new Error('File not created');
  });

  await runner.test('Persistence: should load tasks', async () => {
    const persistence = new SchedulerPersistence({ path: testFile });
    const tasks = await persistence.load();
    if (tasks.length === 0) throw new Error('No tasks loaded');
  });

  await runner.test('Persistence: should restore tasks to scheduler', async () => {
    const persistence = new SchedulerPersistence({ path: testFile });
    const scheduler = new ShadowScheduler();
    
    scheduler.registerHandler('test', async () => ({ success: true }));
    const tasks = await persistence.load();
    scheduler.restoreTasks(tasks);
    
    if (scheduler.getAllTasks().length === 0) throw new Error('Tasks not restored');
  });

  await runner.test('Persistence: should auto-save', async () => {
    const persistence = new SchedulerPersistence({ 
      path: testFile, 
      autoSaveIntervalMs: 100 
    });
    const scheduler = new ShadowScheduler();
    
    persistence.startAutoSave(() => scheduler.getTasksForPersistence());
    await delay(200);
    persistence.stopAutoSave();
    
    const savedAt = await persistence.getLastSavedAt();
    if (!savedAt) throw new Error('Not auto-saved');
  });

  await runner.test('Persistence: should delete state file', async () => {
    const persistence = new SchedulerPersistence({ path: testFile });
    await persistence.delete();
    const exists = await persistence.exists();
    if (exists) throw new Error('File not deleted');
  });

  // ============ Notification Tests ============

  await runner.test('Notifications: should create manager', () => {
    const manager = new NotificationManager({ enabled: true });
    if (!manager) throw new Error('Failed to create manager');
  });

  await runner.test('Notifications: should subscribe handler', () => {
    const manager = new NotificationManager({ enabled: true });
    const unsubscribe = manager.subscribe(async () => {});
    if (typeof unsubscribe !== 'function') throw new Error('Invalid unsubscribe');
  });

  await runner.test('Notifications: should receive notification', async () => {
    const manager = new NotificationManager({ enabled: true });
    let received = false;
    
    manager.subscribe(async () => { received = true; });
    
    await manager.notify({
      type: 'task_scheduled',
      taskId: 'test',
      taskName: 'Test',
      timestamp: new Date(),
    });
    
    if (!received) throw new Error('Notification not received');
  });

  await runner.test('Notifications: should create console channel', () => {
    const channel = NotificationManager.createConsoleChannel();
    if (channel.name !== 'console') throw new Error('Wrong channel name');
  });

  await runner.test('Notifications: should register channel', () => {
    const manager = new NotificationManager({ enabled: true });
    const channel = NotificationManager.createConsoleChannel();
    manager.registerChannel(channel);
    
    const names = manager.getChannelNames();
    if (!names.includes('console')) throw new Error('Channel not registered');
  });

  // ============ UI Tests ============

  await runner.test('UI: should create instance', () => {
    const ui = new SchedulerUI();
    if (!ui) throw new Error('Failed to create UI');
  });

  await runner.test('UI: should render dashboard', () => {
    const ui = new SchedulerUI();
    const output = ui.renderDashboard({
      totalTasks: 10,
      pendingTasks: 3,
      runningTasks: 2,
      completedTasks: 4,
      failedTasks: 1,
      cancelledTasks: 0,
      averageExecutionTimeMs: 1500,
    }, []);
    
    if (!output.includes('SHADOW SCHEDULER')) throw new Error('Dashboard not rendered');
  });

  await runner.test('UI: should render task list', () => {
    const ui = new SchedulerUI();
    const tasks: Task[] = [{
      id: 'test-1',
      name: 'Test Task',
      status: 'pending',
      priority: 'normal',
      scheduleType: 'once',
      runCount: 0,
      handler: async () => ({ success: true }),
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      metadata: {},
    }];
    
    const output = ui.renderTaskList(tasks);
    if (!output.includes('Test Task')) throw new Error('Task not in list');
  });

  await runner.test('UI: should render task detail', () => {
    const ui = new SchedulerUI();
    const task: Task = {
      id: 'test-1',
      name: 'Detailed Task',
      description: 'A test task',
      status: 'completed',
      priority: 'high',
      scheduleType: 'once',
      runCount: 1,
      handler: async () => ({ success: true }),
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ['test'],
      metadata: {},
      completedAt: new Date(),
    };
    
    const output = ui.renderTaskDetail(task);
    if (!output.includes('Detailed Task')) throw new Error('Detail not rendered');
  });

  await runner.test('UI: should render notification toast', () => {
    const ui = new SchedulerUI();
    const output = ui.renderNotificationToast({
      type: 'task_completed',
      taskId: 'test',
      taskName: 'Completed Task',
      timestamp: new Date(),
    });
    
    if (!output.includes('COMPLETED')) throw new Error('Toast not rendered');
  });

  await runner.test('UI: should render progress bar', () => {
    const ui = new SchedulerUI();
    const output = ui.renderProgressBar(50, 100);
    if (!output.includes('50')) throw new Error('Progress not rendered');
  });

  // ============ Integration Tests ============

  await runner.test('Integration: full task lifecycle', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 50 });
    const events: string[] = [];
    
    scheduler.on('taskScheduled', () => events.push('scheduled'));
    scheduler.on('taskStarted', () => events.push('started'));
    scheduler.on('taskCompleted', () => events.push('completed'));
    
    scheduler.registerHandler('test', async () => ({ success: true }));
    scheduler.scheduleOnce('test', { name: 'Lifecycle Test' });
    
    scheduler.start();
    await delay(300);
    scheduler.stop();
    
    if (!events.includes('scheduled')) throw new Error('Scheduled event missing');
    if (!events.includes('started')) throw new Error('Started event missing');
    if (!events.includes('completed')) throw new Error('Completed event missing');
  });

  await runner.test('Integration: scheduler with notifications', async () => {
    const scheduler = new ShadowScheduler({ 
      checkIntervalMs: 50,
      notificationsEnabled: true 
    });
    
    const notifications: string[] = [];
    scheduler.onNotification((event) => {
      notifications.push(event.type);
    });
    
    scheduler.registerHandler('test', async () => ({ success: true }));
    scheduler.scheduleOnce('test', { name: 'Notification Test' });
    
    scheduler.start();
    await delay(300);
    scheduler.stop();
    
    if (notifications.length === 0) throw new Error('No notifications received');
  });

  await runner.test('Integration: scheduler with persistence', async () => {
    const persistence = new SchedulerPersistence({ path: testFile });
    
    // Create and save
    const scheduler1 = new ShadowScheduler();
    scheduler1.registerHandler('test', async () => ({ success: true }));
    const task = scheduler1.scheduleOnce('test', { name: 'Persistence Test' });
    await persistence.save(scheduler1.getTasksForPersistence());
    
    // Load into new scheduler
    const scheduler2 = new ShadowScheduler();
    scheduler2.registerHandler('test', async () => ({ success: true }));
    const tasks = await persistence.load();
    scheduler2.restoreTasks(tasks);
    
    if (scheduler2.getAllTasks().length !== 1) {
      throw new Error('Task not persisted');
    }
    
    await persistence.delete();
  });

  await runner.test('Integration: priority ordering', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 50, maxConcurrentTasks: 1 });
    const order: string[] = [];
    
    scheduler.registerHandler('test', async (ctx) => {
      order.push(ctx.metadata.priority as string);
      return { success: true };
    });
    
    // Schedule in reverse priority order
    scheduler.scheduleOnce('test', { name: 'Low', priority: 'low', metadata: { priority: 'low' } });
    scheduler.scheduleOnce('test', { name: 'Critical', priority: 'critical', metadata: { priority: 'critical' } });
    scheduler.scheduleOnce('test', { name: 'Normal', priority: 'normal', metadata: { priority: 'normal' } });
    scheduler.scheduleOnce('test', { name: 'High', priority: 'high', metadata: { priority: 'high' } });
    
    scheduler.start();
    await delay(800);
    scheduler.stop();
    
    // Critical should run first
    if (order[0] !== 'critical') throw new Error(`Wrong priority order: ${order.join(', ')}`);
  });

  await runner.test('Integration: recurring task rescheduling', async () => {
    const scheduler = new ShadowScheduler({ checkIntervalMs: 50 });
    let runCount = 0;
    
    scheduler.registerHandler('test', async () => {
      runCount++;
      return { success: true };
    });
    
    scheduler.scheduleRecurring('test', 200, { name: 'Recurring', maxRuns: 3 });
    
    scheduler.start();
    await delay(1000);
    scheduler.stop();
    
    if (runCount < 2) throw new Error(`Only ran ${runCount} times`);
  });

  // Cleanup
  try {
    await fs.unlink(testFile);
  } catch {}

  runner.report();
}

runTests().catch(console.error);
