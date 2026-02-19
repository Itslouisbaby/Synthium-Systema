# Synth v1.0.0 — Learning Digital Human Core

**Synth** is a local-first cognitive planning system that acts, remembers, and learns from experience.

---

## What Synth v1 Guarantees

| Feature | Status |
|---------|--------|
| **End-to-end cognitive loop** | ✅ Input → Plan → Policy Check → Execute → Evaluate |
| **Policy-enforced autonomy** | ✅ 3 autonomy levels with hard policy boundaries |
| **Real local execution** | ✅ local_read, local_write, local_search tools |
| **Safety-first design** | ✅ Path traversal blocked, null bytes rejected, encoded attacks blocked |
| **Persistent memory** | ✅ Flash + Warm + Semantic facts |
| **Rule-based learning** | ✅ Extracts facts from tool results, reinforces confidence |
| **Full auditability** | ✅ Every action logged to JSONL with evidence |
| **Deterministic fallback** | ✅ HeuristicPlanner runs when LLM unavailable |
| **CLI interface** | ✅ synth run, status, show, tail, approve, deny, sessions |
| **Optional LLM intelligence** | ✅ PromptedPlanner enhances but never required |

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Build (library + CLI)
pnpm build

# Run a single session
npx synth run --session test-01 "Create a todo list" --level 1

# Check status
npx synth status --session test-01

# Show semantic memory
npx synth show memory --session test-01

# Run full test suite
pnpm test  # 132 tests
```

---

## Milestones Completed (v1.0.0)

| Milestone | Focus | Tests |
|-----------|-------|-------|
| M1 | Artifact Store (JSONL persistence) | 6 |
| M2 | Policy Gate (3-tier autonomy) | 20 |
| M3 | Planner Interface + HeuristicPlanner | 16 |
| M4 | Local Memory (Flash + Warm) | 11 |
| M5 | Terminal CLI | 9 |
| M6 | Tool Execution (local-only, secure) | 7 |
| M7 | LLM Planner (optional, failover-safe) | 22 |
| M8 | Semantic Memory (learning from experience) | 32 |
| **Total** | | **132** |

---

## Architecture

```
Input → Observation → Flash Memory
               ↓
         Planner (Heuristic or LLM)
               ↓
         Policy Gate evaluates steps
               ↓
         Tool Executor (local_only)
               ↓
         Consolidator extracts facts
               ↓
         Semantic Store dedupes/reinforces
               ↓
         Evaluation → Audit Trail
```

---

## What v1 Explicitly Does NOT Do

> **Important:** These are future milestones, not bugs.

| Feature | Status | Notes |
|---------|--------|-------|
| External web access | ❌ Not in v1 | No HTTP requests, no APIs |
| External APIs | ❌ Not in v1 | Local-only execution |
| Self-modification | ❌ Not in v1 | Code is read-only |
| Voice/avatar embodiment | ❌ Not in v1 | Text interface only |
| Multi-agent behavior | ❌ Not in v1 | Single agent per process |
| Autonomous delegation | ❌ Not in v1 | Human approval required |
| Embeddings/Semantic search | ❌ Not in v1 | Exact keyword match only |

---

## Configuration

### CLI Environment Variables

```bash
# Optional: Enable LLM planning
export OPENAI_API_KEY="sk-..."

# Optional: Custom base URL for Ollama
export OLLAMA_URL="http://localhost:11434"
```

### Autonomy Levels

| Level | Name | Behavior |
|-------|------|----------|
| 1 | Assist | All non-local requires approval |
| 2 | Delegated | Local tools auto-execute, others need approval |
| 3 | Dev | Local tools auto-execute, policy-gated |

---

## Security

- **Path traversal**: Blocked (`../`, `..\`, encoded variants)
- **Null bytes**: Rejected in all paths
- **Symlink escape**: Realpath verification
- **Size limits**: 1MB default, 10MB hard cap
- **Tool timeout**: 30s default
- **Max calls**: 10 per run

---

## License

MIT - See [LICENSE](./LICENSE) for details.

---

## Repository

`https://github.com/Itslouisbaby/Synthium-Systema`

**Tag:** `v1.0.0`

**Status:** Ready for production use.
