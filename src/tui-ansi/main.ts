// main.ts - Entry point for starting the ANSI TUI

import { TUIEngine } from './engine.js';
import { Container } from './container.js';
import { Header } from './components/Header.js';
import { ChatLog } from './components/ChatLog.js';
import { Editor } from './components/Editor.js';
import { StatusBar } from './components/StatusBar.js';
import { Terminal, KeyPress } from './terminal.js';

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

  const chatLog = new ChatLog('chatlog', {
    maxHeight: Math.max(5, terminalSize.rows - 6), // Leave space for header, editor, status
  });

  const editor = new Editor('editor', {
    prompt: '> ',
    maxHeight: 3,
    multiline: true,
    events: {
      onSubmit: (text: string) => {
        // Handle user input
        const trimmedText = text.trim();
        if (trimmedText) {
          chatLog.addMessage({
            role: 'user',
            text: trimmedText,
          });

          // Update status to thinking
          statusBar.setStatus('thinking', 'Processing your request...');

          // In a real implementation, you would send to LLM here
          // For now, simulate a response
          setTimeout(() => {
            chatLog.addMessage({
              role: 'synth',
              text: `I received: ${trimmedText}`,
            });
            statusBar.setStatus('idle');
          }, 1000);
        }
      },
      onCancel: () => {
        statusBar.setStatus('idle');
      },
      onChange: (text: string) => {
        if (text.trim()) {
          statusBar.setStatus('awaiting', 'Press Enter to send');
        } else {
          statusBar.setStatus('idle');
        }
      },
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

  // Set up keyboard input
  engine.onKey((key: KeyPress) => {
    // Engine-level key handling
    if (key.ctrl && key.name === 'c') {
      // Let engine handle Ctrl+C for exit
    }
  });

  // Enable Ctrl+C to exit
  engine.enableExitOnCtrlC(true);

  // Start the TUI
  engine.start(16); // ~60 FPS (16ms intervals)

  // Add welcome message
  chatLog.addMessage({
    role: 'system',
    text: `Welcome to ${config.title || 'Synthium Systema'}! Type your message below.`,
  });

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
