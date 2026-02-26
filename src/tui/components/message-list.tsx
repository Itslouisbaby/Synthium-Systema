/** * Message List Component - Scrolling History */

import React, { useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Message, MessageData } from './message.js';
import { MatrixColors } from '../constants/colors.js';

interface MessageListProps {
  messages: MessageData[];
  maxMessages?: number;
  synthName?: string;
  userName?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  maxMessages = 50,
  synthName = 'SYNTH',
  userName = 'USER',
}) => {
  // Keep only the most recent messages that fit
  const displayMessages = messages.slice(-20); // Limit to prevent overflow

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={MatrixColors.dimGreen}
      padding={1}
      flexGrow={1}
    >
      {displayMessages.length === 0 ? (
        <Box flexDirection="column" alignItems="center" justifyContent="center">
          <Text color={MatrixColors.dimGreen}>System initialized. Awaiting input...</Text>
        </Box>
      ) : (
        displayMessages.map((msg) => (
          <Message
            key={msg.id}
            message={msg}
            synthName={synthName}
            userName={userName}
          />
        ))
      )}
    </Box>
  );
};

export default MessageList;
