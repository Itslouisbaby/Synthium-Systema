/**
 * Error Display Component
 * Synth TUI - Phase 4: Matrix Polish
 */

import React from 'react';
import { Box, Text } from 'ink';
import { MatrixColors } from '../constants/colors.js';

export type ErrorType = 'ollama' | 'runtime' | 'memory' | 'network' | 'unknown';

interface ErrorDisplayProps {
  type: ErrorType;
  message?: string;
  onRetry?: () => void;
}

const ERROR_MESSAGES: Record<ErrorType, { title: string; suggestion: string }> = {
  ollama: {
    title: '⚠ OLLAMA NOT RUNNING',
    suggestion: `Please start Ollama: ollama serve
Or install: curl -fsSL https://ollama.com/install.sh | sh`,
  },
  runtime: {
    title: '⚠ RUNTIME ERROR',
    suggestion: 'The cognitive runtime encountered an error.\nTry restarting the application.',
  },
  memory: {
    title: '⚠ MEMORY SYSTEM ERROR',
    suggestion: 'Unable to access CoreMemories.\nCheck disk space and permissions.',
  },
  network: {
    title: '⚠ NETWORK ERROR',
    suggestion: 'Unable to connect to external services.\nCheck your internet connection.',
  },
  unknown: {
    title: '⚠ UNKNOWN ERROR',
    suggestion: 'An unexpected error occurred.\nPlease check the logs for details.',
  },
};

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ 
  type, 
  message,
  onRetry 
}) => {
  const errorInfo = ERROR_MESSAGES[type];

  return (
    <Box 
      flexDirection="column"
      borderStyle="double"
      borderColor={MatrixColors.error}
      padding={2}
      margin={1}
      alignItems="center"
    >
      <Text color={MatrixColors.error} bold>
        {errorInfo.title}
      </Text>
      
      {message && (
        <Box marginY={1}>
          <Text color={MatrixColors.white}>
            {message}
          </Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text color={MatrixColors.dimGray}>
          {errorInfo.suggestion.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < errorInfo.suggestion.split('\n').length - 1 && <Text>{'\n'}</Text>}
            </React.Fragment>
          ))}
        </Text>
      </Box>
      
      {onRetry && (
        <Box marginTop={1}>
          <Text color={MatrixColors.brightGreen}>
            Press R to retry
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default ErrorDisplay;
