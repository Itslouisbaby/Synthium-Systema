import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules', 
      'dist',
      // Legacy Blessed TUI tests - excluded after M9.5 ANSI TUI migration
      // These tests depend on 'blessed' package which is no longer maintained
      // and causes test hangs. See docs/legacy-tui-tests.md for details.
      'test/tui-theme.test.ts',
    ]
  }
});