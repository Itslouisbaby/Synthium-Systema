# Phase 5 Evidence Pack (ANSI / Pi-TUI Chat Loop)

Goal: prove end-to-end chat wiring is working (local-only / heuristic ok), with inline memory recall + inline approvals + clean terminal teardown.

## Branch
- `phase5-wiring`

## Commit SHA
- ffb5795

## Smoke: build + launch + chat + approvals
Run from repo root:

```powershell
cd C:\Users\louis\.openclaw\workspace\synthium-systema

# Build
npm run build

# Launch ANSI TUI
$env:SYNTH_TUI_IMPL = "ansi"
node dist/cli/index.mjs tui --workspace . --session phase5_demo
```

### Expected observations
1) ANSI chat UI launches and renders within normal startup.
2) Type a plain-English prompt (e.g., `delete stale cache`) and press Enter.
3) You see:
   - a user line
   - an assistant/synth response line
   - at least one inline MEMORY recall line/block (minimal is fine)
4) Trigger an approval request (any irreversible step should do it).
5) Approve inline with **Y** (or deny with **N**) when the editor is empty.
6) You see an approval decision reflected inline, and resulting artifacts summary/tool results if applicable.
7) Exit with Ctrl+C or the normal exit path; terminal state is restored (cursor visible, raw mode off, no broken prompt).

## Optional automated smoke (non-interactive)
- `scripts/smoke/ansi-chat-simple.mjs`
- `scripts/smoke/ansi-chat.mjs`

(These should at minimum build and exercise the wiring without modifying NeuronWaves semantics.)

## Notes / Constraints
- No changes to NeuronWaves loop semantics, policy engine, or artifact formats.
- Single stdout sink remains enforced.
- No new UI panels/features; chat-first only.
