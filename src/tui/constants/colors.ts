/**
 * Matrix Color Palette
 * Synth TUI - Phase 1: Foundation
 */

export const MatrixColors = {
  // Primary greens
  dimGreen: '#008F11',
  brightGreen: '#39FF14',
  matrixGreen: '#00FF41',
  darkGreen: '#003B00',
  
  // Accents
  black: '#0D0208',
  white: '#FFFFFF',
  gray: '#808080',
  dimGray: '#404040',
  
  // Status colors
  error: '#FF0000',
  warning: '#FFA500',
  info: '#00FFFF',
} as const;

export const ColorHex = {
  border: MatrixColors.dimGreen,
  accent: MatrixColors.brightGreen,
  text: MatrixColors.white,
  dimText: MatrixColors.gray,
  background: MatrixColors.black,
  synth: MatrixColors.brightGreen,
  user: MatrixColors.white,
  timestamp: MatrixColors.dimGreen,
  error: MatrixColors.error,
  warning: MatrixColors.warning,
} as const;
