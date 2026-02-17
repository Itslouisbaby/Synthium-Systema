# ANSI TUI Stabilization Sprint (Binding)

**Goal:** harden ANSI TUI until it passes the **Apex Go/No-Go Gate** end-to-end.

**Scope freeze (binding):**
- No UI polish
- No new UI features/panels
- No new commands (beyond what the gate requires)
- No autonomy work
- Do **not** flip default until gate passes with evidence
- Blessed TUI remains intact as safety net

---

## Org Chart (OpenClaw Agents + Responsibilities)

> Use these exact agent ids when spawning work.

### Executive / Governance
- **CEO / Product Owner:** Luis (human)
  - Owns product intent, scope, prioritization.
- **CTO / Integrator:** Lucas (this main session)
  - Owns integration, sequencing, merges, and ensuring we follow the binding gate.
- **VP Engineering / Quality Gate (Agent: `apex-vp-eng`)**
  - Owns architecture sanity, execution quality, delivery standards.
  - **Owns the Go/No-Go Gate** checklist and sign-off to flip ANSI default.

### Engineering
- **ANSI TUI Lead Engineer (Agent: `qwen3-engineer`)**
  - Phase 1–5 execution leadership: feature-flag routing, type/ESM hygiene, input lifecycle, frame sink wiring, NeuronWaves wiring.
- **Component Engineer (Agent: `coding-agent`)**
  - ChatLog / Editor / ToolExecution / Approval cards rendering and input behaviors (under scope freeze).
- **Code Reviewer (Agent: `dash-reviewer`)**
  - Reviews PRs/commits for correctness, maintainability, and regression risk.
- **DevOps / Runtime (Agent: `deacon-devops`)**
  - Gateway/runtime reliability, environment issues, CI/build tooling guidance when needed.

### Program Management
- **PM (Agent: `kimi-pm`)**
  - Sprint tracking, checklists, status reporting, sequencing recommendations.

---

## Communication / Escalation Matrix (Updated)

| Issue | Escalate To |
|------|-------------|
| Layout architecture decision | Lucas (CTO) + Apex (VP Eng) |
| Terminal lifecycle / raw mode bugs | qwen3-engineer → Apex if risk of terminal corruption |
| Differential renderer correctness / flicker | qwen3-engineer → Apex |
| NeuronWaves wiring semantics unclear | Lucas + qwen3-engineer |
| Review for regression risk | dash-reviewer |
| Environment / gateway / tooling problems | deacon-devops |
| Scope creep / new features | Luis (CEO) — redirect to v1.2 |
| Flip ANSI default decision | **Apex gate only** (apex-vp-eng) |

---

## Execution Plan (Authoritative Order)

### Phase 1 — Feature Flag Routing (P0)
**Owner:** `qwen3-engineer`
- Wire `SYNTH_TUI_IMPL=ansi|blessed` into the actual `synth tui` execution path.
- Blessed remains default.

**Deliverable:**
- `SYNTH_TUI_IMPL=ansi synth tui` launches ANSI cleanly
- `SYNTH_TUI_IMPL=blessed synth tui` launches legacy cleanly

### Phase 2 — Compile & Type Hygiene (P0)
**Owner:** `qwen3-engineer`
- Fix all ESM issues (no `require`)
- Normalize file casing + exports
- `pnpm build` and `tsc --noEmit` pass

### Phase 3 — Terminal Input Lifecycle (P0)
**Owner:** `qwen3-engineer` (consult `deacon-devops` if environment-specific)
- Raw mode enable/disable symmetrical
- Cleanup on Ctrl+C/Ctrl+D/uncaught exception/exit
- Always restore stdin + cursor

### Phase 4 — Frame Sink Wiring (P0)
**Owner:** `qwen3-engineer`
- Confirm **stdout-update + chalk** is the only render path
- No `console.log` during render loop
- Resize handling

### Phase 5 — NeuronWaves Chat Wiring (P0)
**Owner:** `qwen3-engineer` + `coding-agent` (UI surface)
- Remove stubbed replies
- Plain text input:
  - append user message
  - invoke NeuronWaves loop
  - render tool exec + approvals in chat
- **Do not change** NeuronWaves loop/policy/artifact formats

### Phase 6 — Runtime Checklist (P0)
**Owner:** Lucas + Apex
- Run the Apex runtime checklist steps 1–7 end-to-end with evidence.

### Phase 7 — Flip Default + Cut v1 (only if gate passes)
**Owner:** Apex authorizes; Lucas executes
- Flip default to ANSI
- Tag/release v1

---

## Gate Reference
The **Apex ANSI Go/No-Go Gate** is binding and is the sole authority for flipping ANSI to default.
