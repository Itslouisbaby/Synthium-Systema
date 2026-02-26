/**
 * Glitch Effect Component
 * Synth TUI - Phase 4: Matrix Polish
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { MatrixColors } from '../constants/colors.js';

interface GlitchEffectProps {
  trigger?: boolean;
  onComplete?: () => void;
}

const GLITCH_CHARS = '▓▒░█▄▀■□▪▫▬►◄▲▼◊○●◘◙◦';
const GLITCH_SEQUENCE = [
  'INITIALIZING...',
  '▓▒░ INITIALIZING...',
  '▓▓▒ INITIALIZING...',
  '▓▓▓ INITIALIZING...',
  'SY▓▓▓ INITIALIZING...',
  'SYN▓▓ INITIALIZING...',
  'SYNT▓ INITIALIZING...',
  'SYNTH INITIALIZING...',
  'SYNTH // SYSTEM READY',
];

export const GlitchIntro: React.FC<GlitchEffectProps> = ({
  trigger = true,
  onComplete
}) => {
  const [step, setStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!trigger) return;

    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;

      if (currentStep >= GLITCH_SEQUENCE.length) {
        clearInterval(interval);
        setIsComplete(true);
        onComplete?.();
        return;
      }

      setStep(currentStep);
    }, 33); // ~300ms total

    return () => clearInterval(interval);
  }, [trigger, onComplete]);

  if (isComplete) return null;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height={10}
    >
      <Text color={MatrixColors.brightGreen} bold>
        {GLITCH_SEQUENCE[step]}
      </Text>

      {step > 0 && (
        <Box marginTop={1}>
          <Text color={MatrixColors.dimGreen}>
            {'[' + '█'.repeat(step) + '░'.repeat(GLITCH_SEQUENCE.length - step - 1) + ']'}
          </Text>
        </Box>
      )}
    </Box>
  );
};

interface MatrixRainProps {
  enabled?: boolean;
  density?: number;
  maxHeight?: number;
}

export const MatrixRain: React.FC<MatrixRainProps> = ({
  enabled = false,
  density = 5,
  maxHeight
}) => {
  const [drops, setDrops] = useState<Array<{ x: number; y: number; char: string; opacity: number }>>([]);

  useEffect(() => {
    if (!enabled) return;

    const chars = '0123456789ABCDEF';

    const interval = setInterval(() => {
      setDrops(prev => {
        // Move existing drops down
        const moved = prev
          .map(drop => ({ ...drop, y: drop.y + 1, opacity: drop.opacity - 0.1 }))
          .filter(drop => drop.opacity > 0 && (!maxHeight || drop.y < maxHeight));

        // Add new drops
        const newDrops = Array.from({ length: density }, () => ({
          x: Math.floor(Math.random() * 80),
          y: 0,
          char: chars[Math.floor(Math.random() * chars.length)],
          opacity: 1,
        }));

        return [...moved, ...newDrops].slice(-50); // Limit total drops
      });
    }, 100);

    return () => clearInterval(interval);
  }, [enabled, density]);

  if (!enabled) return null;

  return (
    <Box position="absolute" marginTop={0} marginLeft={0}>
      {drops.map((drop, i) => (
        <Box key={i}
          position="absolute"
          marginTop={drop.y}
          marginLeft={drop.x}>
          <Text
            color={MatrixColors.dimGreen}
            dimColor={drop.opacity < 0.5}
          >
            {drop.char}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export default GlitchIntro;
