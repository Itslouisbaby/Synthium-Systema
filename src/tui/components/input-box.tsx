/**
 * Input Box Component
 * Synth TUI - Phase 2: UI Components
 */

import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { MatrixColors } from '../constants/colors.js';

interface InputBoxProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  synthName?: string;
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  placeholder = 'Enter command...',
  disabled = false,
  synthName = 'SYNTH'
}) => {
  const [value, setValue] = useState('');
  const { exit } = useApp();

  const handleSubmit = (submittedValue: string) => {
    if (submittedValue.trim() && !disabled) {
      onSubmit(submittedValue);
      setValue('');
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={disabled ? MatrixColors.dimGray : MatrixColors.dimGreen}
      padding={1}
      marginTop={1}
    >
      <Box>
        <Text color={MatrixColors.brightGreen}>
          ▓▓▓ INPUT //
        </Text>
        <Text color={MatrixColors.dimGreen}>
          {' '}
        </Text>
      </Box>

      <Box marginLeft={2}>
        {disabled ? (
          <Text color={MatrixColors.dimGray}>
            {placeholder}
          </Text>
        ) : (
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            focus={true}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={MatrixColors.dimGray}>
          Press Enter to send, Esc to exit
        </Text>
      </Box>
    </Box>
  );
};

export default InputBox;
