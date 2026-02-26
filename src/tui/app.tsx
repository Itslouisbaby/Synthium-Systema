/**
 * Main TUI App Component
 * Synth TUI - Complete Implementation
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { Header } from './components/header.js';
import { MessageList } from './components/message-list.js';
import { InputBox } from './components/input-box.js';
import { ThinkingIndicator } from './components/thinking.js';
import { StatusBar } from './components/status-bar.js';
import { GlitchIntro } from './components/glitch-effect.js';
import { ErrorDisplay, ErrorType } from './components/error-display.js';
import { useSynth } from './hooks/use-synth.js';
import { RuntimeBridge } from './runtime-bridge.js';
import { MatrixColors } from './constants/colors.js';

interface AppProps {
  baseDir?: string;
  ollamaUrl?: string;
  model?: string;
  persona?: string;
  customPersonaPrompt?: string;
  enableAutonomy?: boolean;
  enableLearning?: boolean;
  glitchLevel?: 'clean' | 'immersive';
}

const App: React.FC<AppProps> = ({
  baseDir = '.synth/tui',
  ollamaUrl = 'http://localhost:11434',
  model = 'llama3.2',
  persona = 'cyberpunk',
  customPersonaPrompt,
  enableAutonomy = true,
  enableLearning = true,
  glitchLevel = 'immersive'
}) => {
  const { exit } = useApp();
  const [showIntro, setShowIntro] = useState(true);
  const [error, setError] = useState<{ type: ErrorType; message?: string } | null>(null);
  const runtimeBridgeRef = useRef<RuntimeBridge | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const {
    messages,
    isThinking,
    thinkingProgress,
    isOnline,
    memoryNodes,
    isLearning,
    activeGoals,
    synthName,
    userName,
    isNamingCeremony,
    setIsNamingCeremony,
    namingStep,
    initialize,
    processInput,
    processNamingInput,
    addMessage,
    addTypingResponse,
    setIsOnline,
    setMemoryNodes,
  } = useSynth({ baseDir, ollamaUrl, model });

  // Initialize runtime bridge
  useEffect(() => {
    const init = async () => {
      try {
        const bridge = new RuntimeBridge({
          baseDir,
          ollamaUrl,
          model,
          persona,
          customPersonaPrompt,
          enableAutonomy,
          enableLearning
        });

        // Check Ollama
        const ollamaOnline = await bridge.checkOllama();
        if (!ollamaOnline) {
          setError({ type: 'ollama' });
          return;
        }

        await bridge.initialize();
        runtimeBridgeRef.current = bridge;

        // Check if naming ceremony needed
        const needsNaming = await bridge.needsNamingCeremony();
        if (needsNaming) {
          setIsNamingCeremony(true);
          addMessage('synth', 'I am a Synthetic Digital Human. How would you like to call me?');
        } else {
          const names = bridge.getNames();
          const greeting = bridge.getGreeting();
          addMessage('synth', greeting);
        }

        setIsInitialized(true);
      } catch (err) {
        setError({
          type: 'runtime',
          message: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    };

    if (!showIntro) {
      init();
    }
  }, [showIntro, baseDir, ollamaUrl, model, addMessage, setIsOnline, setMemoryNodes, setIsNamingCeremony]);

  // Poll runtime status periodically
  useEffect(() => {
    if (!isInitialized || !runtimeBridgeRef.current) return;

    const interval = setInterval(async () => {
      try {
        const status = await runtimeBridgeRef.current!.getStatus();
        setIsOnline(status.online);
        setMemoryNodes(status.memoryNodes);
      } catch (err) {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isInitialized, setIsOnline, setMemoryNodes]);

  // Handle intro completion
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Handle user input
  const handleInput = useCallback(async (input: string) => {
    if (!runtimeBridgeRef.current) return;

    try {
      // Display user message
      addMessage('user', input);

      if (isNamingCeremony) {
        // Delegate state advancement to hook
        processNamingInput(input);

        // Sync names with Runtime Bridge
        if (namingStep === 'synth') {
          await runtimeBridgeRef.current.setNames(input, 'USER');
        } else {
          const names = runtimeBridgeRef.current.getNames();
          await runtimeBridgeRef.current.setNames(names.synth, input);
        }
      } else {
        // Normal message processing
        const response = await runtimeBridgeRef.current.processInput(input);

        // Add response with typing animation
        addTypingResponse(response);
      }

      // Update status
      const status = await runtimeBridgeRef.current.getStatus();
      setIsOnline(status.online);
      setMemoryNodes(status.memoryNodes);
    } catch (err) {
      setError({
        type: 'unknown',
        message: err instanceof Error ? err.message : 'Failed to process input'
      });
    }
  }, [isNamingCeremony, namingStep, addMessage, processNamingInput, addTypingResponse]);

  // Handle keyboard shortcuts
  useInput((_input, key) => {
    if (key.escape) {
      exit();
    }
  }, { isActive: true });

  // Get input placeholder based on state
  const getPlaceholder = () => {
    if (isNamingCeremony) {
      return namingStep === 'synth'
        ? 'Enter my name...'
        : 'Enter your name...';
    }
    return 'Enter command or message...';
  };

  if (showIntro) {
    return (
      <Box flexDirection="column" height={20}>
        <GlitchIntro trigger={glitchLevel === 'immersive'} onComplete={handleIntroComplete} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={2}>
        <ErrorDisplay
          type={error.type}
          message={error.message}
          onRetry={() => setError(null)}
        />
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
    >
      {/* Header */}
      <Header version="2.4.0" synthName={synthName} glitchLevel={glitchLevel} />

      {/* Message List */}
      <Box flexGrow={1} overflowY="hidden">
        <MessageList
          messages={messages}
          synthName={synthName}
          userName={userName}
        />
      </Box>

      {/* Thinking Indicator */}
      {isThinking && (
        <ThinkingIndicator
          isThinking={isThinking}
          progress={thinkingProgress}
        />
      )}

      {/* Input Box */}
      <InputBox
        onSubmit={handleInput}
        placeholder={getPlaceholder()}
        disabled={isThinking}
        synthName={synthName}
      />

      {/* Status Bar */}
      <StatusBar
        memoryNodes={memoryNodes}
        isLearning={isLearning}
        activeGoals={activeGoals}
        isOnline={isOnline}
        synthName={synthName}
      />
    </Box>
  );
};

export default App;
