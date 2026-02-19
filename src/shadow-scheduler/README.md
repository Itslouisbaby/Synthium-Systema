# M10 Shadow Scheduler

Advanced task scheduling system with persistence, notifications, and a terminal UI.

## Features

- **Task Scheduling**: One-time, recurring, and cron-based scheduling
- **Priority Queue**: Critical, high, normal, and low priority levels
- **Persistence**: Automatic state saving and restoration
- **Notifications**: Event-driven notification system with multiple channels
- **Terminal UI**: Beautiful ASCII dashboard and task views
- **Retry Logic**: Automatic retry with configurable attempts
- **Concurrency Control**: Limit simultaneous task execution

## Quick Start

```bash
# Install dependencies
npm install

# Run tests (28+ tests)
npm test

# Run the demo
npm run demo
```

## Usage

```typescript
import { ShadowScheduler } from './src/shadow-scheduler';

const scheduler = new ShadowScheduler({
  maxConcurrentTasks: 5,
  checkIntervalMs: 1000,
});

// Register a task handler
scheduler.registerHandler('email-sender', async (context) => {
  // Send email logic
  return { success: true };
});

// Schedule a task
scheduler.scheduleOnce('email-sender', {
  name: 'Welcome Email',
  priority: 'high',
});

scheduler.start();
```

## Architecture

```
src/shadow-scheduler/
├── core/           # Core scheduler engine
├── persistence/    # State saving/loading
├── notifications/  # Event notification system
├── ui/             # Terminal UI components
├── types/          # TypeScript type definitions
└── demo.ts         # Integration demo
```

## Tests

The test suite includes 28+ tests covering:
- Core scheduler functionality
- Persistence layer
- Notification system
- UI rendering
- Integration scenarios
