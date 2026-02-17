// main.ts - Entry point for starting the ANSI TUI

import { TUIEngine } from './engine.js';
import { Container } from './container.js';
import { Header } from './components/header.js';
import { ChatLog } from './components/chatlog.js';
import { Editor } from './components/editor.js';
import { StatusBar } from './components/statusbar.js';
import { Terminal } from './terminal.js';
import { randomUUID } from 'node:crypto';
import type { Message } from './types.js';

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
 */
export function startANSITUI(config: TUIConfig = {}): TUIHandle {
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

        // Stub response (replaced in Phase 5 NeuronWaves wiring)
        setTimeout(() => {
          chatLog.addMessage(mk({ type: 'synth', content: `I received: ${trimmedText}` }));
          statusBar.setStatus('idle');
        }, 250);
      } else if (event.type === 'abort') {
        statusBar.setStatus('idle');
      } else if (event.type === 'clear') {
        statusBar.setStatus('idle');
      } else if (event.type === 'autocomplete') {
        statusBar.setStatus('awaiting', 'Autocomplete (stub)');
      }
    },
  });

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

  // Set up keyboard input (engine handles key dispatch)

  // Enable Ctrl+C to exit
  engine.enableExitOnCtrlC(true);

  // Start the TUI
  engine.start(16); // ~60 FPS (16ms intervals)

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
