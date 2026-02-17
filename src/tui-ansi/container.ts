// container.ts - Container component that holds and composes children

import { BaseComponent, Component, Bounds, KeyPress } from './component.js';

export interface LayoutDirection {
  type: 'vertical' | 'horizontal';
  spacing?: number;
}

export interface ChildSpec {
  component: Component;
  grow?: number; // Flex grow factor
  shrink?: number; // Flex shrink factor
  basis?: number; // Flex basis (in rows or cols)
  fixed?: number; // Fixed size (in rows or cols)
}

/**
 * Container component that holds children and composes their output
 */
export class Container extends BaseComponent {
  protected children: Map<string, ChildSpec> = new Map();
  protected layout: LayoutDirection = { type: 'vertical', spacing: 0 };

  constructor(id: string, layout?: LayoutDirection, bounds?: Bounds) {
    super(id, bounds);
    if (layout) {
      this.layout = layout;
    }
  }

  /**
   * Add a child component
   */
  addChild(child: Component, options?: Partial<ChildSpec>): void {
    const spec: ChildSpec = {
      component: child,
      grow: options?.grow ?? 0,
      shrink: options?.shrink ?? 1,
      basis: options?.basis ?? 0,
      fixed: options?.fixed,
    };
    child.setParent(this);
    this.children.set(child.getId(), spec);
    this.invalidate();
  }

  /**
   * Remove a child component by ID
   */
  removeChild(childId: string): void {
    const spec = this.children.get(childId);
    if (spec) {
      spec.component.setParent(null);
      this.children.delete(childId);
      this.invalidate();
    }
  }

  /**
   * Get a child component by ID
   */
  getChild(childId: string): Component | undefined {
    const spec = this.children.get(childId);
    return spec?.component;
  }

  /**
   * Get all children
   */
  getChildren(): Component[] {
    return Array.from(this.children.values()).map(s => s.component);
  }

  /**
   * Set layout direction
   */
  setLayout(layout: LayoutDirection): void {
    this.layout = layout;
    this.invalidate();
  }

  /**
   * Render - compose children's output based on layout
   */
  render(): string[] {
    const lines: string[] = [];
    const childEntries = Array.from(this.children.entries());

    if (childEntries.length === 0) {
      // Empty container - return blank lines
      return Array(this.bounds.height).fill(' '.repeat(this.bounds.width));
    }

    if (this.layout.type === 'vertical') {
      this.renderVertical(childEntries, lines);
    } else {
      this.renderHorizontal(childEntries, lines);
    }

    return lines;
  }

  /**
   * Render children vertically (stack top to bottom)
   */
  private renderVertical(childEntries: [string, ChildSpec][], lines: string[]): void {
    let currentRow = this.bounds.row;
    const availableHeight = this.bounds.height;

    // Calculate layout with fixed and flex children
    const layoutSpecs = this.calculateVerticalLayout(childEntries, availableHeight);

    for (const [childId, spec] of childEntries) {
      const child = spec.component;
      const layout = layoutSpecs.get(childId) ?? { height: 1, row: currentRow };

      // Set child bounds
      child.setBounds({
        row: layout.row,
        col: this.bounds.col,
        height: layout.height,
        width: this.bounds.width,
      });

      // Render child
      const childLines = child.render();

      // Pad or truncate to fit allocated height
      const paddedLines = this.padLines(childLines, layout.height, this.bounds.width);

      for (const line of paddedLines) {
        lines.push(line);
      }

      currentRow += layout.height;
    }

    // Fill remaining space if any
    while (lines.length < this.bounds.height) {
      lines.push(' '.repeat(this.bounds.width));
    }
  }

  /**
   * Render children horizontally (side by side)
   */
  private renderHorizontal(childEntries: [string, ChildSpec][], lines: string[]): void {
    const layoutSpecs = this.calculateHorizontalLayout(childEntries, this.bounds.width);
    const maxLineCount = this.bounds.height;

    // Collect all child lines
    const allChildLines: [string, string[]][] = [];
    for (const [childId, spec] of childEntries) {
      const child = spec.component;
      const layout = layoutSpecs.get(childId) ?? { width: 1, col: this.bounds.col };

      child.setBounds({
        row: this.bounds.row,
        col: layout.col,
        height: this.bounds.height,
        width: layout.width,
      });

      allChildLines.push([childId, child.render()]);
    }

    // Compose lines
    const currentLines: string[][] = [];
    for (let i = 0; i < allChildLines.length; i++) {
      const [childId, lines] = allChildLines[i];
      const spec = this.children.get(childId)!;
      const layout = layoutSpecs.get(childId)!;

      currentLines.push(lines);
    }

    // Merge lines horizontally
    for (let lineIdx = 0; lineIdx < maxLineCount; lineIdx++) {
      let composedLine = '';
      for (let i = 0; i < allChildLines.length; i++) {
        const [childId, lines] = allChildLines[i];
        const line = lines[lineIdx] ?? ' ';
        composedLine += line.padEnd(lines[lineIdx]?.length || 1);
      }
      // Truncate to container width
      lines.push(composedLine.slice(0, this.bounds.width).padEnd(this.bounds.width));
    }
  }

  /**
   * Calculate vertical layout for flex children
   */
  private calculateVerticalLayout(
    childEntries: [string, ChildSpec][],
    availableHeight: number
  ): Map<string, { height: number; row: number }> {
    const layouts = new Map<string, { height: number; row: number }>();
    let usedHeight = this.layout.spacing || 0;

    // First pass: assign fixed sizes
    let totalFlex = 0;
    for (const [childId, spec] of childEntries) {
      if (spec.fixed !== undefined) {
        layouts.set(childId, {
          height: spec.fixed,
          row: this.bounds.row + usedHeight,
        });
        usedHeight += spec.fixed + (this.layout.spacing || 0);
      } else {
        totalFlex += spec.grow || 0;
      }
    }

    // Second pass: distribute remaining space to flex children
    const remainingHeight = Math.max(0, availableHeight - usedHeight);
    let currentRow = this.bounds.row + usedHeight;

    for (const [childId, spec] of childEntries) {
      if (spec.fixed === undefined) {
        const flexRatio = totalFlex > 0 ? (spec.grow || 0) / totalFlex : 1;
        const childHeight = Math.max(0, Math.floor(remainingHeight * flexRatio));
        layouts.set(childId, { height: childHeight, row: currentRow });
        currentRow += childHeight + (this.layout.spacing || 0);
      }
    }

    return layouts;
  }

  /**
   * Calculate horizontal layout for flex children
   */
  private calculateHorizontalLayout(
    childEntries: [string, ChildSpec][],
    availableWidth: number
  ): Map<string, { width: number; col: number }> {
    const layouts = new Map<string, { width: number; col: number }>();
    let usedWidth = this.layout.spacing || 0;

    // First pass: assign fixed sizes
    let totalFlex = 0;
    for (const [childId, spec] of childEntries) {
      if (spec.fixed !== undefined) {
        layouts.set(childId, {
          width: spec.fixed,
          col: this.bounds.col + usedWidth,
        });
        usedWidth += spec.fixed + (this.layout.spacing || 0);
      } else {
        totalFlex += spec.grow || 0;
      }
    }

    // Second pass: distribute remaining space to flex children
    const remainingWidth = Math.max(0, availableWidth - usedWidth);
    let currentCol = this.bounds.col + usedWidth;

    for (const [childId, spec] of childEntries) {
      if (spec.fixed === undefined) {
        const flexRatio = totalFlex > 0 ? (spec.grow || 0) / totalFlex : 1;
        const childWidth = Math.max(0, Math.floor(remainingWidth * flexRatio));
        layouts.set(childId, { width: childWidth, col: currentCol });
        currentCol += childWidth + (this.layout.spacing || 0);
      }
    }

    return layouts;
  }

  /**
   * Pad or truncate lines to fit a target height
   */
  private padLines(lines: string[], targetHeight: number, width: number): string[] {
    if (lines.length >= targetHeight) {
      // Truncate
      const result = lines.slice(0, targetHeight);
      // Ensure proper width
      return result.map(line => line.padEnd(width).slice(0, width));
    } else {
      // Pad
      const result = [...lines];
      while (result.length < targetHeight) {
        result.push(' '.repeat(width));
      }
      return result;
    }
  }

  /**
   * Handle input - bubble down to children
   */
  handleInput(key: KeyPress): boolean {
    // Try each child; if one handles it, stop bubbling
    for (const spec of this.children.values()) {
      if (spec.component.handleInput(key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all children
   */
  clearChildren(): void {
    for (const spec of this.children.values()) {
      spec.component.setParent(null);
    }
    this.children.clear();
    this.invalidate();
  }
}
