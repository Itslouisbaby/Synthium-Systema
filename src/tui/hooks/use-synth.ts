/**
 * Synth Runtime Hook
 * Synth TUI - Phase 3: Runtime Bridge
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageData } from '../components/message.js';

export interface SynthConfig {
  baseDir: string;
  ollamaUrl?: string;
  model?: string;
}

export interface ToneProfile {
  formality: number; // 0-1, casual to formal
  verbosity: number; // 0-1, concise to verbose
  enthusiasm: number; // 0-1, neutral to enthusiastic
}

export function useSynth(config: SynthConfig) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingProgress, setThinkingProgress] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [memoryNodes, setMemoryNodes] = useState(0);
  const [isLearning, setIsLearning] = useState(false);
  const [activeGoals, setActiveGoals] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [synthName, setSynthName] = useState('SYNTH');
  const [userName, setUserName] = useState('USER');
  const [isNamingCeremony, setIsNamingCeremony] = useState(false);
  const [namingStep, setNamingStep] = useState<'synth' | 'user' | 'complete'>('synth');

  const toneProfile = useRef<ToneProfile>({
    formality: 0.5,
    verbosity: 0.5,
    enthusiasm: 0.5,
  });

  // Check Ollama connection
  const checkOllama = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${config.ollamaUrl || 'http://localhost:11434'}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }, [config.ollamaUrl]);

  // Initialize runtime
  const initialize = useCallback(async () => {
    setIsOnline(await checkOllama());

    // Load names from memory (simulated)
    const storedSynthName = process.env.SYNTH_NAME;
    const storedUserName = process.env.USER_NAME;

    if (!storedSynthName || !storedUserName) {
      setIsNamingCeremony(true);
      setNamingStep('synth');
    } else {
      setSynthName(storedSynthName);
      setUserName(storedUserName);

      // Add greeting message
      const greeting = getTimeBasedGreeting(storedUserName, storedSynthName);
      addMessage('synth', greeting);
    }
  }, [checkOllama]);

  // Get time-based greeting
  const getTimeBasedGreeting = (user: string, synth: string): string => {
    const hour = new Date().getHours();
    let timeOfDay = 'morning';

    if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17) {
      timeOfDay = 'evening';
    }

    return `Good ${timeOfDay} ${user}, I'm ${synth}. Ready when you are.`;
  };

  // Add a message to the list
  const addMessage = useCallback((role: 'user' | 'synth' | 'system', content: string) => {
    const newMessage: MessageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      role,
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);
  }, []);

  // Process naming ceremony input
  const processNamingInput = useCallback((input: string) => {
    if (namingStep === 'synth') {
      setSynthName(input.toUpperCase());
      setNamingStep('user');
      addMessage('synth', 'And you are?');
    } else if (namingStep === 'user') {
      setUserName(input);
      setNamingStep('complete');
      setIsNamingCeremony(false);

      // Store names (simulated - would use CoreMemories)
      process.env.SYNTH_NAME = synthName;
      process.env.USER_NAME = input;

      const greeting = `Hello ${input}, I'm ${synthName}. Ready.`;
      addMessage('synth', greeting);
    }
  }, [namingStep, synthName, addMessage]);

  // Simulate thinking progress
  const simulateThinking = useCallback(async () => {
    setIsThinking(true);
    setThinkingProgress(0);

    // Reduced steps to prevent layout tearing through rapid re-renders
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      setThinkingProgress(Math.floor((i / steps) * 100));
    }

    setIsThinking(false);
  }, []);

  // Process user input
  const processInput = useCallback(async (input: string) => {
    // Handle commands
    if (input.startsWith('/')) {
      handleCommand(input);
      return;
    }

    // Add user message
    addMessage('user', input);

    // If in naming ceremony, handle specially
    if (isNamingCeremony) {
      await processNamingInput(input);
      return;
    }

    // Simulate thinking
    await simulateThinking();

    // Generate response (would connect to actual runtime)
    const response = await generateResponse(input);

    // Add synth response with typing animation
    await addTypingResponse(response);

    // Update tone profile based on user input
    updateToneProfile(input, response);

    // Update memory count (simulated)
    setMemoryNodes(prev => prev + 1);
  }, [addMessage, isNamingCeremony, processNamingInput, simulateThinking]);

  // Generate response (placeholder - would use actual LLM)
  const generateResponse = async (input: string): Promise<string> => {
    return 'Processing...';
  };

  // Add response with typing animation
  // Add response without rapid character-sequence layout rendering to prevent tearing
  const addTypingResponse = async (fullResponse: string) => {
    const messageId = `msg-${Date.now()}`;

    // Post the message instantly instead of cycling character logic
    setMessages(prev => [...prev, {
      id: messageId,
      role: 'synth',
      content: fullResponse,
      timestamp: new Date(),
      isTyping: false,
    }]);
  };

  // Update tone profile based on interaction
  const updateToneProfile = (userInput: string, synthResponse: string) => {
    const userLength = userInput.length;

    // If user gives short responses, become more concise
    if (userLength < 20) {
      toneProfile.current.verbosity = Math.max(0.2, toneProfile.current.verbosity - 0.05);
    } else if (userLength > 100) {
      toneProfile.current.verbosity = Math.min(0.8, toneProfile.current.verbosity + 0.05);
    }
  };

  // Handle commands
  const handleCommand = (command: string) => {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        addMessage('system', `
Available commands:
/help - Show this help
/status - Display system state
/clear - Clear message history
/learn - Force immediate learning
/memory - Memory nodes: ${memoryNodes}
/exit - Quit gracefully
        `.trim());
        break;

      case 'status':
        addMessage('system', `
System Status:
- Online: ${isOnline ? 'Yes' : 'No'}
- Memory Nodes: ${memoryNodes}
- Active Goals: ${activeGoals}
- Learning: ${isLearning ? 'Active' : 'Idle'}
- Tone: ${JSON.stringify(toneProfile.current)}
        `.trim());
        break;

      case 'clear':
        setMessages([]);
        break;

      case 'learn':
        setIsLearning(true);
        setTimeout(() => setIsLearning(false), 2000);
        addMessage('synth', 'Learning cycle initiated.');
        break;

      case 'memory':
        addMessage('system', `Memory nodes: ${memoryNodes}`);
        break;

      case 'exit':
        process.exit(0);
        break;

      default:
        addMessage('system', `Unknown command: ${cmd}. Type /help for available commands.`);
    }
  };

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    isThinking,
    thinkingProgress,
    isOnline,
    memoryNodes,
    isLearning,
    activeGoals,
    error,
    synthName,
    userName,
    isNamingCeremony,
    namingStep,
    setIsNamingCeremony,
    setNamingStep,
    exit: () => process.exit(0),
    initialize,
    processInput,
    processNamingInput,
    addMessage,
    addTypingResponse,
    clearError,
    setIsOnline,
    setMemoryNodes,
  };
}

export default useSynth;
