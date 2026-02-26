/**n * Glitchy Matrix Header
 * Synth TUI - Phase 1: Foundation
 */
import React from 'react';
import { Box, Text } from 'ink';
import BigText from 'ink-big-text';
import { MatrixColors } from '../constants/colors.js';

interface HeaderProps {
  version?: string;
  synthName?: string;
  glitchLevel?: 'clean' | 'immersive';
}

export const Header: React.FC<HeaderProps> = ({ version = '2.4.0', synthName = 'SYNTH' }) => {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle="single"
      borderColor={MatrixColors.dimGreen}
      padding={1}
      marginBottom={1}
    >
      {/* Big text with Matrix style - guard against empty strings */}
      <Box paddingX={2}>
        {synthName && synthName.trim().length > 0 ? (
          <Text color={MatrixColors.matrixGreen}>
            <BigText text={synthName} font="block" />
          </Text>
        ) : (
          <Text color={MatrixColors.matrixGreen} bold>{'SYNTH'}</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={MatrixColors.dimGreen}>{'// '}</Text>
        <Text color={MatrixColors.brightGreen} bold>
          v{version}
        </Text>
        <Text color={MatrixColors.dimGreen}>{' //'}</Text>
      </Box>
    </Box>
  );
};

export default Header;
