# Changelog

## v1.0.0 — 2026-02-13

**Synth v1.0.0 — Learning Digital Human Core**

This is the first production release of Synth, completing the foundational cognitive loop with end-to-end execution, policy enforcement, and semantic learning.

### Features

#### M1: Artifact Store
- JSONL append-only storage for observations, plans, evaluations
- Last-write-wins state snapshots
- Audit trail logging

#### M2: Policy Gate
- Three-tier autonomy (Assist, Delegated, Dev)
- Five action classes: local_only, external_read, external_write, irreversible, money_movement
- Hard blocks on dangerous actions
- Awaiting_approval for human oversight

#### M3: Planner Interface
- Abstract Planner interface
- HeuristicPlanner (deterministic, rule-based)
- Configurable planning strategies

#### M4: Local Memory
- Flash memory: recent observations (FIFO)
- Warm memory: weekly consolidated summaries
- Keyword-based recall
- Privacy-level tagging

#### M5: Terminal CLI
- `synth run --session <id> "<text>"`
- `synth status --session <id>`
- `synth show plan|memory --session <id>`
- `synth tail observations|plans|evaluations|audit --session <id>`
- `synth approve|deny --session <id> --step <stepId>`
- `synth sessions`

#### M6: Tool Execution Layer
- local_read: Read files with 1MB limit, 10MB hard cap
- local_write: Write files with overwrite/append modes
- local_search: Literal string search (NOT regex)
- Path traversal protection (../ encoded variants blocked)
- Timeout handling (30s default)
- Audit trail of every tool call

#### M7: LLM Planner (Optional)
- PromptedPlanner: LLM-powered with deterministic fallback
- Provider support: OpenAI, Anthropic, Ollama, custom
- Validation: Strict JSON schema checking
- Privacy: SHA-256 hashing for audit (no raw prompts logged)
- Failover: Always falls back to HeuristicPlanner on error

#### M8: Semantic Memory Consolidation
- Fact extraction from successful tool results
- SHA-256 based deduplication
- Confidence reinforcement (+0.05, cap 0.99)
- Global semantic fact store (1000 fact limit)
- Keyword recall into planner context
- Evidence linking to tool execution

### Security
- Path traversal: Blocked
- Null byte injection: Blocked
- Encoded traversal: Blocked
- Symlink escape: Realpath verification
- Size limits: Enforced
- Tool timeouts: Enforced

### Tests
- **132 passing** across 8 milestones
- Coverage: Unit, integration, security, CLI

### API Stability
- `LoopConfig` interface: Stable
- `Planner` interface: Stable
- `PlanStep` schema: Stable
- `SemanticFact` schema: Stable

### Not in v1 (Future Milestones)
- External web access
- External APIs
- Voice/avatar
- Multi-agent coordination
- Self-modification
- Embeddings/semantic similarity
- Browser automation
- External tool calling

---

## v0.1.0 — 2026-02-12 (Pre-release)

Development versions leading to v1.0.0.
