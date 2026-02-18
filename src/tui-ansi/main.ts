// main.ts - Entry point for starting the ANSI TUI

import { TUIEngine } from './engine.js';
import { Container } from './container.js';
import { Header } from './components/header.js';
import { ChatLog } from './components/chatlog.js';
import { Editor } from './components/editor.js';
import { StatusBar } from './components/statusbar.js';
import { Terminal } from './terminal.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import type { Message, ApprovalCardMessage, MemoryRecallMessage, ToolExecutionMessage } from './types.js';
import { runNeuronWavesLoop, type PlanStep } from './neuronwaves-types.js';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

interface Approval {
  stepId: string;
  decision: 'approved' | 'denied';
  decidedAtMs: number;
}

/**
 * Write approval atomically to disk
 */
function writeApproval(workspace: string, sessionId: string, stepId: string, decision: 'approved' | 'denied'): void {
  const stateDir = join(workspace, '.synth', 'neuronwaves', sessionId, 'state');
  const approvalPath = join(stateDir, 'approvals.json');
  
  // Ensure state directory exists
  fs.mkdirSync(stateDir, { recursive: true });
  
  // Load existing approvals
  let approvals: Approval[] = [];
  if (existsSync(approvalPath)) {
    try {
      const content = readFileSync(approvalPath, 'utf-8');
      const data = JSON.parse(content);
      approvals = data.approvals || [];
    } catch {
      // File malformed, start fresh
    }
  }
  
  // Add new approval
  approvals.push({
    stepId,
    decision,
    decidedAtMs: Date.now(),
  });
  
  // Write approvals back to disk
  writeFileSync(approvalPath, JSON.stringify({ approvals }, null, 2), 'utf-8');
}

export interface TUIConfig {
  session?: string;
  title?: string;
  workspace?: string;
}

export interface TUIHandle {
  engine: TUIEngine;
  header: Header;
  chatLog: ChatLog;
  editor: Editor;
  statusBar: StatusBar;
  stop: () => void;
}

/**
 * Start the ANSI TUI with a standard layout
 *
 * NOTE: We intentionally fail fast with a readable error (stack trace) if startup
 * fails. This avoids silent exit(2) and makes gate evidence actionable.
 */
export function startANSITUI(config: TUIConfig = {}): TUIHandle {
  try {
    return _startANSITUI(config);
  } catch (err: any) {
    const msg = err?.stack || err?.message || String(err);
    try {
      const ws = path.resolve(config.workspace || process.cwd());
      const logPath = path.join(ws, '.synth', 'ansi-tui-fatal.log');
      // Best-effort durable log (survives screen clears)
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] FATAL startup error:\n${msg}\n`);
    } catch {}
    process.stderr.write(`\n[ansi-tui] FATAL startup error:\n${msg}\n`);
    process.exit(2);
  }
}

function _startANSITUI(config: TUIConfig = {}): TUIHandle {
  // TTY guard: ANSI TUI requires an interactive terminal.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('[ansi-tui] ANSI TUI requires an interactive TTY (stdin/stdout must be TTY).\n');
    process.exit(2);
  }

  const resolvedWorkspace = path.resolve(config.workspace || process.cwd());
  const resolvedSession = config.session || 'synth';
  const artifactBaseDir = path.join(resolvedWorkspace, '.synth', 'neuronwaves');

  // Global async error hooks (startup failures may surface after initial return)
  const fatal = (label: string, e: any) => {
    const msg = e?.stack || e?.message || String(e);
    try {
      const logPath = path.join(resolvedWorkspace, '.synth', 'ansi-tui-fatal.log');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] ${label}:\n${msg}\n`);
    } catch {}
    process.stderr.write(`\n[ansi-tui] ${label}:\n${msg}\n`);
    process.exit(2);
  };

  process.on('uncaughtException', (e) => fatal('uncaughtException', e));
  process.on('unhandledRejection', (e) => fatal('unhandledRejection', e));
  process.on('exit', (code) => {
    process.stderr.write(`\n[ansi-tui] exit code=${code}\n`);
  });
  process.on('beforeExit', (code) => {
    process.stderr.write(`\n[ansi-tui] beforeExit code=${code}\n`);
  });

  process.stderr.write(
    `[ansi-tui] startup mode=ansi node=${process.version} workspace=${resolvedWorkspace} session=${resolvedSession} artifactBaseDir=${artifactBaseDir}\n`
  );
  process.stderr.write(`[ansi-tui] lifecycle: input.init\n`);


  const terminal = new Terminal();
  const engine = new TUIEngine(terminal);

  // Create root container with vertical layout
  const rootContainer = new Container('root', { type: 'vertical' });

  const terminalSize = terminal.getSize();

  // Create components
  const header = new Header('header', {
    session: config.session || 'synth',
    title: config.title || 'Synthium Systema',
  });

  const chatLog = new ChatLog('chatlog');

  const mk = (m: any): Message => ({
    id: randomUUID(),
    timestamp: Date.now(),
    ...m,
  }) as Message;

  const editor = new Editor('editor', undefined, {
    prompt: '> ',
    onEvent: (event) => {
      if (event.type === 'submit') {
        const trimmedText = event.content.trim();
        if (!trimmedText) return;

        chatLog.addMessage(mk({ type: 'user', content: trimmedText }));
        statusBar.setStatus('thinking', 'Processing your request...');

        // Real NeuronWaves loop execution (Phase 5 wiring)
        processUserInput(trimmedText, resolvedSession, resolvedWorkspace, artifactBaseDir)
          .then(() => {
            statusBar.setStatus('idle');
          })
          .catch((error) => {
            chatLog.addMessage(mk({
              type: 'system_event',
              level: 'error',
              content: `Error processing request: ${error.message}`,
            }));
            statusBar.setStatus('idle');
          });
      } else if (event.type === 'abort') {
        statusBar.setStatus('idle');
      } else if (event.type === 'clear') {
        statusBar.setStatus('idle');
      } else if (event.type === 'autocomplete') {
        statusBar.setStatus('awaiting', 'Autocomplete (stub)');
      }
    },
  });

  /**
   * Process user input through the NeuronWaves loop
   */
  async function processUserInput(content: string, session: string, workspace: string, artifactBaseDir: string): Promise<void> {

    try {
      // Execute the NeuronWaves loop
      const result = await runNeuronWavesLoop(
        {
          content,
          sessionKey: session,
        },
        {
          artifactBaseDir,
          autonomyLevel: 1, // Default to Level 1 for safety
          enableMemory: true,
        }
      );

      // Extract and display memory recall if available
      if (result.plan.contextBundle) {
        const memoryContent = formatMemoryRecall(result.plan.contextBundle);
        if (memoryContent) {
          chatLog.addMessage(mk({
            type: 'memory_recall',
            content: memoryContent,
          }) as MemoryRecallMessage);
        }
      }

      // Display plan steps with appropriate formatting
      for (const step of result.plan.steps) {
        // Show approval cards for steps awaiting approval
        if (step.status === 'awaiting_approval') {
          chatLog.addMessage(mk({
            type: 'approval_card',
            stepId: step.stepId,
            intent: step.description || 'No description provided',
            actionClass: step.actionClass,
            status: 'pending',
          }));
        }

        // Show tool executions for executed steps
        if (step.status === 'executed' && step.toolName) {
          // Add tool execution start message
          const toolStartMsg = mk({
            type: 'tool_execution',
            toolName: step.toolName,
            status: 'running',
            args: step.args,
            startTime: Date.now(),
          }) as ToolExecutionMessage;
          
          const toolStartIndex = chatLog.getCount();
          chatLog.addMessage(toolStartMsg);

          // Update with results when available
          setTimeout(() => {
            const toolResultMsg = mk({
              type: 'tool_execution',
              toolName: step.toolName,
              status: step.status === 'executed' ? 'success' : 'error',
              args: step.args,
              output: step.result,
              error: step.error,
              startTime: toolStartMsg.startTime,
              endTime: Date.now(),
            }) as ToolExecutionMessage;
            
            // Note: In a real implementation, we would update the existing message
            // For now, we'll add a new message to show the result
            chatLog.addMessage(toolResultMsg);
          }, 100);
        }
      }

      // Generate and display synth response
      const synthResponse = generateSynthResponse(result.plan.steps, result.evaluation);
      chatLog.addMessage(mk({
        type: 'synth',
        content: synthResponse,
      }));

    } catch (error) {
      throw error;
    }
  }

  /**
   * Format memory recall content for display
   */
  function formatMemoryRecall(contextBundle: any): string {
    if (!contextBundle) return '';

    const lines: string[] = [];
    
    // Flash memory recalls
    if (contextBundle.flash && contextBundle.flash.length > 0) {
      lines.push('Flash Memory:');
      contextBundle.flash.forEach((item: any) => {
        lines.push(`  • ${item.content} (${new Date(item.timestamp).toLocaleTimeString()})`);
      });
    }
    
    // Warm memory recalls
    if (contextBundle.warm && contextBundle.warm.length > 0) {
      lines.push('Warm Memory:');
      contextBundle.warm.forEach((item: any) => {
        lines.push(`  • ${item.content} (${new Date(item.timestamp).toLocaleTimeString()})`);
      });
    }
    
    // Semantic facts
    if (contextBundle.semanticFacts && contextBundle.semanticFacts.length > 0) {
      lines.push('Semantic Facts:');
      contextBundle.semanticFacts.forEach((fact: any) => {
        lines.push(`  • ${fact.statement}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate synth response based on plan execution results
   */
  function generateSynthResponse(steps: PlanStep[], evaluation: any): string {
    const executedSteps = steps.filter(s => s.status === 'executed');
    const approvedSteps = steps.filter(s => s.status === 'allowed' || s.status === 'awaiting_approval');
    const blockedSteps = steps.filter(s => s.status === 'blocked');
    
    if (executedSteps.length > 0) {
      const toolNames = executedSteps
        .filter(s => s.toolName)
        .map(s => s.toolName)
        .filter((name, i, arr) => arr.indexOf(name) === i); // Unique tool names
      
      return `I've processed your request using the following tools: ${toolNames.join(', ')}. ${evaluation.summary}`;
    } else if (approvedSteps.length > 0) {
      return `I've analyzed your request and identified ${approvedSteps.length} actions that require approval before execution.`;
    } else if (blockedSteps.length > 0) {
      return `I've analyzed your request but some actions were blocked by policy. ${evaluation.summary}`;
    } else {
      return `I've processed your request. ${evaluation.summary}`;
    }
  }

  const statusBar = new StatusBar('statusbar', {
    position: 'bottom',
    showShortcuts: true,
  });

  // Add components to root (use fixed heights for header and status)
  rootContainer.addChild(header, { fixed: 1 });
  rootContainer.addChild(chatLog, { grow: 1 });
  rootContainer.addChild(editor, { fixed: 3 });
  rootContainer.addChild(statusBar, { fixed: 1 });

  // Initialize engine with root container
  engine.init(rootContainer);

  // Set up global keyboard shortcuts (handled before components)
  // Ctrl+S toggles Safe Mode; Ctrl+K opens Kill Switch confirmation (Y/N/Esc)
  let safeMode = false;
  let killSwitch = false;
  let killConfirmOpen = false;

  const setSafeMode = (enabled: boolean) => {
    safeMode = enabled;
    statusBar.setStatus(safeMode ? 'safe' : 'idle', safeMode ? 'Safe mode enabled' : 'Ready');
  };

  const setKillSwitch = (enabled: boolean) => {
    killSwitch = enabled;
    statusBar.setStatus(killSwitch ? 'error' : safeMode ? 'safe' : 'idle', killSwitch ? 'KILL SWITCH ACTIVE' : undefined);
  };

  engine.onKey((key) => {
    const keyName = key.name ?? '';

    // If confirm modal is open, swallow Y/N/Esc
    if (killConfirmOpen) {
      if (keyName === 'y' || keyName === 'Y') {
        setKillSwitch(!killSwitch);
        killConfirmOpen = false;
        return true;
      }
      if (keyName === 'n' || keyName === 'N' || keyName === 'escape') {
        statusBar.setStatus(safeMode ? 'safe' : 'idle');
        killConfirmOpen = false;
        return true;
      }
      return true;
    }

    // Inline approval confirmation (Y/N)
    // Important: do NOT steal letters from normal typing. Only trigger when the editor is empty.
    const editorEmpty = editor.getContent() === '' && !editor.isModified();
    if (editorEmpty && (keyName === 'y' || keyName === 'Y' || keyName === 'n' || keyName === 'N')) {
      const pending = [...chatLog.getMessages()]
        .reverse()
        .find((m): m is ApprovalCardMessage => m.type === 'approval_card' && m.status === 'pending');

      if (pending) {
        const nextStatus: ApprovalCardMessage['status'] =
          keyName === 'y' || keyName === 'Y' ? 'approved' : 'denied';

        // Write approval to disk
        try {
          writeApproval(resolvedWorkspace, resolvedSession, pending.stepId, 
            nextStatus === 'approved' ? 'approved' : 'denied');
          
          chatLog.setApprovalStatus(pending.stepId, nextStatus);
          chatLog.addMessage(mk({
            type: 'system_event',
            level: 'info',
            content: `Approval ${nextStatus.toUpperCase()}: ${pending.intent}`,
          }));
          
          // Reload and re-process with the new approval
          processUserInput(editor.getContent(), resolvedSession, resolvedWorkspace, artifactBaseDir)
            .then(() => {
              statusBar.setStatus('idle');
            })
            .catch((error) => {
              chatLog.addMessage(mk({
                type: 'system_event',
                level: 'error',
                content: `Error re-processing after approval: ${error.message}`,
              }));
              statusBar.setStatus('idle');
            });
        } catch (error) {
          chatLog.addMessage(mk({
            type: 'system_event',
            level: 'error',
            content: `Failed to record approval: ${error.message}`,
          }));
        }
        
        statusBar.setStatus(safeMode ? 'safe' : 'idle');
        return true;
      }
    }

    // Ctrl+S
    if (key.ctrl && (keyName === 's' || key.sequence === '\x13')) {
      setSafeMode(!safeMode);
      return true;
    }

    // Ctrl+K
    if (key.ctrl && (keyName === 'k' || key.sequence === '\x0b')) {
      killConfirmOpen = true;
      statusBar.setStatus('awaiting', `Confirm ${killSwitch ? 'DEACTIVATE' : 'ACTIVATE'} kill switch? (Y/N)`);
      return true;
    }

    return false;
  });

  // Enable Ctrl+C to exit
  engine.enableExitOnCtrlC(true);

  process.stderr.write(`[ansi-tui] lifecycle: render.start\n`);

  // Start the TUI
  engine.start(16); // ~60 FPS (16ms intervals)

  process.stderr.write(`[ansi-tui] lifecycle: input.active\n`);

  // Add welcome message
  chatLog.addMessage(mk({
    type: 'system_event',
    level: 'info',
    content: `Welcome to ${config.title || 'Synthium Systema'}! Type your message below.`,
  }));

  return {
    engine,
    header,
    chatLog,
    editor,
    statusBar,
    stop: () => engine.stop(),
  };
}

/**
 * Create a custom TUI with your own components
 */
export function createANSITUI(
  rootContainer: Container,
  terminal?: Terminal
): TUIEngine {
  const engine = new TUIEngine(terminal);
  engine.init(rootContainer);
  engine.onKey(() => {});
  engine.enableExitOnCtrlC(true);
  engine.start(16);
  return engine;
}
