/**
 * Status Bar Component
 * Synth TUI - Phase 2: UI Components
 */

import React from 'react';
import { Box, Text } from 'ink';
import { MatrixColors } from '../constants/colors.js';

interface StatusBarProps {
  memoryNodes: number;
  isLearning?: boolean;
  activeGoals?: number;
  isOnline?: boolean;
  synthName?: string;
}

const formatTime = (): string => {
  return new Date().toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  });
};

const formatMemoryBar = (count: number, max: number = 100): string => {
  const filled = Math.min(Math.floor((count / max) * 10), 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

export const StatusBar: React.FC<StatusBarProps> = ({ 
  memoryNodes, 
  isLearning = false,
  activeGoals = 0,
  isOnline = true,
  synthName = 'SYNTH'
}) => {
  const [currentTime, setCurrentTime] = React.useState(formatTime());

  // Update time every second
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(formatTime());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box 
      flexDirection="row"
      borderStyle="single"
      borderColor={MatrixColors.dimGreen}
      paddingX={1}
      height={1}
      justifyContent="space-between"
    >
      {/* Memory indicator */}
      <Box>
        <Text color={MatrixColors.dimGreen}>MEM:[</Text>
        <Text color={MatrixColors.brightGreen}>
          {formatMemoryBar(memoryNodes)}
        </Text>
        <Text color={MatrixColors.dimGreen}>]</Text>
        <Text color={MatrixColors.brightGreen}> {memoryNodes} nodes</Text>
      </Box>

      {/* Center: Learning indicator and goals */}
      <Box>
        {isLearning && (
          <Text color={MatrixColors.matrixGreen}>
            ⟲ LEARNING
          </Text>
        )}
        {activeGoals > 0 && (
          <Text color={MatrixColors.dimGreen}>
            {' | '}GOALS: {activeGoals}
          </Text>
        )}
      </Box>

      {/* Right: Online status and time */}
      <Box>
        <Text color={isOnline ? MatrixColors.brightGreen : MatrixColors.error}>
          {isOnline ? '● ONLINE' : '● OFFLINE'}
        </Text>
        <Text color={MatrixColors.dimGreen}>
          {' | '}{currentTime}
        </Text>
      </Box>
    </Box>
  );
};

export default StatusBar;
