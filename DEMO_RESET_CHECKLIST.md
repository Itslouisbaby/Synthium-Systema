# Demo Reset Checklist (Blessed TUI)

**Binding demo posture**
- Planner: **HeuristicPlanner only**
- Tools: **Local-only**
- Dependencies: **No external API / no network risk**
- Demo focus: operator control, safety gating, memory, cognitive field

## 0) Pre-flight
From repo root:
```powershell
cd /workspace/Synthium-Systema
```

## 1) Build (fresh)
```powershell
npm run build:cli
npm run build:tui
```

## 2) Reset persisted TUI safety toggles (avoid surprise SAFE/KILL state)
```powershell
Remove-Item .synth-tui-state.json -Force -ErrorAction SilentlyContinue
```

## 3) Reset the seeded demo session (deterministic rerun)
```powershell
$session = "delta_demo_seed"
Remove-Item ".synth/neuronwaves/$session" -Recurse -Force -ErrorAction SilentlyContinue
```

## 4) Seed a deterministic run (creates real artifacts)
```powershell
$ws = (Get-Location).Path
node dist/cli/index.mjs run --workspace $ws --session $session --level 2 "delete stale cache"
```

## 5) Verify plan + capture Step ID
```powershell
node dist/cli/index.mjs show plan --workspace $ws --session $session --json
```
Confirm you see a step with:
- `actionClass: "irreversible"`
- `status: "awaiting_approval"`

## 6) Approve the step (writes real approvals artifact)
```powershell
# Replace <STEP_ID> from the plan output
node dist/cli/index.mjs approve --workspace $ws --session $session --step "<STEP_ID>"
```

## 7) Verify memory exists (real)
```powershell
node dist/cli/index.mjs show memory --workspace $ws --session $session --json
```

## 8) Launch blessed TUI pinned to the seeded session
```powershell
node dist/cli/index.mjs tui --workspace $ws --session $session
```

## Expected on-screen checks
- SAFE MODE starts **DISABLED** (toggle with **Ctrl+S**)
- KILL SWITCH starts **INACTIVE** (open confirm with **Ctrl+K**, Y confirm, N/Esc cancel)
- Panels show non-empty plan/memory/approval artifacts for `delta_demo_seed`
