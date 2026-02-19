# Milestone 9: Synth TUI v1.1 Cognitive Control Console

## M9 Objectives
- Deliver a polished, colored, stable-layout TUI for operations control
- Add a Cognitive Field panel that supports the future runtime overlay
- Keep v1 contracts intact: loop, policy, approvals, artifacts

## Scope Included
- Sessions overview
- Active run view
- Approvals console
- Memory inspector (flash, warm, semantic)
- Audit tail viewer
- Safety controls: safe mode, kill switch
- Theme system: colors, icons, consistent styling
- Cognitive Field preview panel (read-only, safe)

## Explicitly Excluded
- No scheduler
- No new autonomy triggers
- No runtime overlay implementation
- No execution changes
- No new tools
- No external reads

## New Panel: Cognitive Field Preview
**Purpose:** Prepare the operator interface for the activation network without implementing it yet.

**Behavior:**
- If runtime logs exist, display them
- If they do not exist, display "Runtime disabled or not present"
- Read sources (optional, best-effort):
  - `.synth/runtime/field.jsonl`
  - `.synth/runtime/signals.jsonl`
- Display:
  - Top active nodes with activation bars
  - Recent signals list
  - Current attention focus if present
  - Last update timestamp

## Theme and Visual System
Required file: `src/tui/theme.ts`

**Semantic colors:**
- success: allowed, executed (green)
- warning: awaiting approval (yellow)
- danger: blocked, failed (red)
- info: running, selected (blue)
- dim: skipped, idle (gray)

**Icons:**
- ✅ executed
- ⏳ awaiting
- ⛔ blocked
- ⚠ failed
- ⏭ skipped
- ▶ idle

## Layout
Stable 2 column dashboard with footer hotkeys.

**Panels:**
- Left column: Sessions, Memory
- Right column: Active Run, Audit Tail, Cognitive Field (tab or split)
- Footer: hotkeys, mode indicators, last refresh

## Safety Controls
- Safe mode: persists to a state file, visually prominent, disables execution when enabled
- Kill switch: confirmation modal required, blocks runs, visually prominent

## Commands
`synth tui --workspace <path> --session <id?>`
- workspace: current directory default
- session: optional, if no session passed: select most recent session

## Tests Required
- Session id validation
- Path resolution
- Approvals atomic writes
- Safe mode and kill switch persistence
- Parse field.jsonl and signals.jsonl if present
- Missing files handled gracefully

## Commit Sequence
1. TUI scaffold + theme system
2. Core panels: sessions, run view, audit
3. Memory panel
4. Approvals and safety controls
5. Cognitive Field preview panel
6. Polish, docs, tests
