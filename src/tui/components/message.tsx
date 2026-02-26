/**
 * Single Message Component
 * Synth TUI - Phase 2: UI Components
 */

import React from 'react';
import { Box, Text } from 'ink';
import { MatrixColors } from '../constants/colors.js';

export type MessageRole = 'user' | 'synth' | 'system';

export interface MessageData {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isTyping?: boolean;
}

interface MessageProps {
  message: MessageData;
  synthName?: string;
  userName?: string;
}

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

export const Message: React.FC<MessageProps> = ({ 
  message, 
  synthName = 'SYNTH',
  userName = 'USER'
}) => {
  const { role, content, timestamp, isTyping } = message;
  
  const getPrefix = () => {
    switch (role) {
      case 'user':
        return <Text color={MatrixColors.white}>{'>'}</Text>;
      case 'synth':
        return (
          <Text color={MatrixColors.brightGreen}>
            ▓▓▓ {synthName} //
          </Text>
        );
      case 'system':
        return <Text color={MatrixColors.warning}>⚠</Text>;
      default:
        return null;
    }
  };

  const getContentColor = () => {
    switch (role) {
      case 'user':
        return MatrixColors.white;
      case 'synth':
        return MatrixColors.brightGreen;
      case 'system':
        return MatrixColors.warning;
      default:
        return MatrixColors.white;
    }
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header with prefix and timestamp */}
      <Box>
        {getPrefix()}
        <Text color={MatrixColors.dimGreen}> {formatTime(timestamp)}</Text>
      </Box>
      
      {/* Message content - wrapped to prevent overflow */}
      <Box marginLeft={2} flexWrap="wrap">
        <Text color={getContentColor()} wrap="end">
          {isTyping ? content + '█' : content}
        </Text>
      </Box>
    </Box>
  );
};

export default Message;
