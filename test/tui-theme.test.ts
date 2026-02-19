/**
 * TUI Unit Tests
 * Tests for the Synth TUI v1.1 components
 */

import { describe, it, expect, vi } from 'vitest';
import { theme, getStatusColor, getStatusIcon, ExecutionStatus } from '../src/tui/theme.js';
import { TUIpanels, type SessionData, type MemoryData, type CognitiveNode } from '../src/tui/panels.js';
import { SynthTUI, type TUIConfig } from '../src/tui/index.js';

describe('TUI Theme System', () => {
  describe('theme', () => {
    it('should have all required colors', () => {
      expect(theme.colors).toHaveProperty('success');
      expect(theme.colors).toHaveProperty('warning');
      expect(theme.colors).toHaveProperty('danger');
      expect(theme.colors).toHaveProperty('info');
      expect(theme.colors).toHaveProperty('dim');
    });

    it('should have all required icons', () => {
      expect(theme.icons).toHaveProperty('executed');
      expect(theme.icons).toHaveProperty('awaiting');
      expect(theme.icons).toHaveProperty('blocked');
      expect(theme.icons).toHaveProperty('failed');
      expect(theme.icons).toHaveProperty('skipped');
      expect(theme.icons).toHaveProperty('running');
      expect(theme.icons).toHaveProperty('idle');
    });
  });

  describe('getStatusColor', () => {
    it('should return success color for executed', () => {
      expect(getStatusColor('executed')).toBe(theme.colors.success);
    });

    it('should return warning color for awaiting', () => {
      expect(getStatusColor('awaiting')).toBe(theme.colors.warning);
    });

    it('should return danger color for blocked', () => {
      expect(getStatusColor('blocked')).toBe(theme.colors.danger);
    });

    it('should return danger color for failed', () => {
      expect(getStatusColor('failed')).toBe(theme.colors.danger);
    });

    it('should return dim color for skipped', () => {
      expect(getStatusColor('skipped')).toBe(theme.colors.dim);
    });

    it('should return info color for running', () => {
      expect(getStatusColor('running')).toBe(theme.colors.info);
    });

    it('should return dim color for idle', () => {
      expect(getStatusColor('idle')).toBe(theme.colors.dim);
    });
  });

  describe('getStatusIcon', () => {
    it('should return correct icon for each status', () => {
      expect(getStatusIcon('executed')).toBe(theme.icons.executed);
      expect(getStatusIcon('awaiting')).toBe(theme.icons.awaiting);
      expect(getStatusIcon('blocked')).toBe(theme.icons.blocked);
      expect(getStatusIcon('failed')).toBe(theme.icons.failed);
      expect(getStatusIcon('skipped')).toBe(theme.icons.skipped);
      expect(getStatusIcon('running')).toBe(theme.icons.running);
      expect(getStatusIcon('idle')).toBe(theme.icons.idle);
    });
  });
});

describe('TUI Panels', () => {
  describe('renderSessions', () => {
    it('should render no sessions message when empty', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const panel = new TUIpanels();
      panel.renderSessions([]);
      expect(consoleSpy).toHaveBeenCalledWith('  No active sessions');
      consoleSpy.mockRestore();
    });
  });

  describe('renderMemory', () => {
    it('should render memory statistics', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const panel = new TUIpanels();
      const memory: MemoryData = { flash: 50, warm: 10, semantic: 25 };
      panel.renderMemory(memory);
      expect(consoleSpy).toHaveBeenCalledWith('  Flash:    50 entries');
      expect(consoleSpy).toHaveBeenCalledWith('  Warm:     10 entries');
      expect(consoleSpy).toHaveBeenCalledWith('  Semantic: 25 facts');
      consoleSpy.mockRestore();
    });
  });

  describe('renderCognitiveField', () => {
    it('should show disabled message when no runtime', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const panel = new TUIpanels();
      panel.renderCognitiveField([], false);
      expect(consoleSpy).toHaveBeenCalledWith('  Runtime disabled or not present');
      consoleSpy.mockRestore();
    });

    it('should show no active nodes message when empty', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const panel = new TUIpanels();
      panel.renderCognitiveField([], true);
      expect(consoleSpy).toHaveBeenCalledWith('  No active nodes');
      consoleSpy.mockRestore();
    });
  });
});

describe('SynthTUI', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const tui = new SynthTUI();
      expect(tui).toBeDefined();
    });

    it('should create with custom workspace', () => {
      const config: TUIConfig = { workspace: '/custom/path' };
      const tui = new SynthTUI(config);
      expect(tui).toBeDefined();
    });
  });

  describe('safe mode', () => {
    it('should default to disabled', () => {
      const tui = new SynthTUI();
      expect((tui as any).safeMode).toBe(false);
    });

    it('should enable safe mode', () => {
      const tui = new SynthTUI();
      tui.setSafeMode(true);
      expect((tui as any).safeMode).toBe(true);
    });
  });

  describe('kill switch', () => {
    it('should default to inactive', () => {
      const tui = new SynthTUI();
      expect((tui as any).killSwitch).toBe(false);
    });

    it('should activate kill switch', () => {
      const tui = new SynthTUI();
      tui.activateKillSwitch();
      expect((tui as any).killSwitch).toBe(true);
    });
  });
});
