/**
 * Thinking Indicator Component
 * Synth TUI - Phase 2: UI Components
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { MatrixColors } from '../constants/colors.js';

interface ThinkingIndicatorProps {
  isThinking: boolean;
  progress?: number;
}

const THINKING_MESSAGES = [
  'Analyzing context...',
  'Retrieving memories...',
  'Formulating response...',
  'Processing signals...',
  'Synthesizing output...',
  'Checking invariants...',
];

const PROGRESS_BAR_WIDTH = 20;

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ 
  isThinking, 
  progress = 0 
}) => {
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle through thinking messages
  useEffect(() => {
    if (!isThinking) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isThinking]);

  if (!isThinking) return null;

  const filledBlocks = Math.floor((progress / 100) * PROGRESS_BAR_WIDTH);
  const emptyBlocks = PROGRESS_BAR_WIDTH - filledBlocks;
  
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

  return (
    <Box 
      flexDirection="column"
      borderStyle="single"
      borderColor={MatrixColors.dimGreen}
      padding={1}
      marginY={1}
    >
      <Box>
        <Text color={MatrixColors.brightGreen}>
          <Spinner type="dots" />
        </Text>
        <Text color={MatrixColors.brightGreen}>
          {' '}{THINKING_MESSAGES[messageIndex]}
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color={MatrixColors.dimGreen}>
          {progressBar} {Math.round(progress)}%
        </Text>
      </Box>
    </Box>
  );
};

export default ThinkingIndicator;
