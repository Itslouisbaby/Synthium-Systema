# Engineering Model Routing One-Pager (Operating Contract)

**Effective:** 2026-02-19 16:59 PST  
**Owner:** Apex (VP Engineering)  
**Scope:** 25-seat engineering org (24 agents + Apex)

## 0) Policy Statement (Non-Negotiable)

- **GPT-5.3 is escalation-only** and **MUST NOT** be used as a default model lane.
- Default execution uses lower-cost/high-throughput lanes: **GLM5, Qwen3 Coder, DeepSeek v3.2, Devstral, Step 3.5 Flash, MiniMax, Gemini (Cockpit), Kimi (PM)**.
- GPT-5.3 use requires:
  1. Trigger condition match (see §2), and
  2. Approval from **Apex** or **Architecture/Standards Lead** (see §3).

---

## 0.5) Approved Optional Lanes (Non-default)

These models are **approved for use** but are **not assigned as defaults to a seat**. Use them when they clearly fit the task, while still following the fallback ladder (§4) and keeping **GPT‑5.3 escalation-only**.

- **Code specialist lane**
  - `nvidia-codestral/mistralai/mamba-codestral-7b-v0.1` — fast code generation/scaffolding, small PRs
  - `nvidia-starcoder2/bigcode/starcoder2-7b` — code completion/transforms, boilerplate and repetitive edits

- **Generalist senior lane**
  - `nvidia-llama33/meta/llama-3.3-70b-instruct` — architecture drafts, integration reasoning, refactor planning
  - `nvidia-mixtral8x22b/mistralai/mixtral-8x22b-instruct-v0.1` — strong general instruction-following + implementation support

- **Heavy reasoning / big synthesis lane**
  - `nvidia-llama405b/meta/llama-3.1-405b-instruct` — deep system comprehension, complex design reviews
  - `nvidia-qwen35/qwen/qwen3.5-397b-a17b` — deep reasoning + long-context synthesis (when Qwen3 Coder isn’t the right fit)

---

## 1) 25-Seat Org → Default Model Mapping

| Seat | Role | Default Model |
|---|---|---|
| 01 | **Apex (VP Engineering)** | **DeepSeek v3.2** |
| 02 | Architecture/Standards Lead | **Qwen3 Coder** |
| 03 | Technical Program Manager | **Kimi** |
| 04 | Product Manager (Platform) | **Kimi** |
| 05 | Product Manager (Customer/Enterprise) | **Kimi** |
| 06 | Staff Engineer, Brain/AI Runtime (Python) | **GLM5** |
| 07 | Senior Engineer, Brain/AI Runtime (Python) | **GLM5** |
| 08 | Engineer, Brain/AI Runtime (Python) | **GLM5** |
| 09 | Staff Engineer, Vault/Spine (Rust) | **Qwen3 Coder** |
| 10 | Senior Engineer, Vault/Spine (Rust) | **Qwen3 Coder** |
| 11 | Engineer, Vault/Spine (Rust) | **Qwen3 Coder** |
| 12 | Staff Engineer, Operating Layer (Go) | **DeepSeek v3.2** |
| 13 | Senior Engineer, Operating Layer (Go) | **DeepSeek v3.2** |
| 14 | Engineer, Operating Layer (Go) | **Devstral** |
| 15 | Staff Engineer, Cockpit (TypeScript/UI) | **Gemini** |
| 16 | Senior Engineer, Cockpit (TypeScript/UI) | **Gemini** |
| 17 | Engineer, Cockpit (TypeScript/UI) | **Gemini** |
| 18 | QA/Automation Lead | **Step 3.5 Flash** |
| 19 | QA Engineer (Integration/E2E) | **Step 3.5 Flash** |
| 20 | QA Engineer (Regression/Release) | **Step 3.5 Flash** |
| 21 | DevEx/CI Lead | **Qwen3 Coder** |
| 22 | DevOps/SRE Lead | **DeepSeek v3.2** |
| 23 | Security Engineer | **Qwen3 Coder** |
| 24 | Data/Telemetry Engineer | **MiniMax** |
| 25 | Release Manager | **MiniMax** |

**Notes**
- “Gemini” lane is Cockpit-default by policy.
- “Kimi” lane is PM/TPM-default by policy.
- If a seat needs deep code synthesis outside its normal lane, follow fallback ladder (§4) before requesting GPT-5.3.

---

## 2) GPT-5.3 Escalation Trigger Rubric (Exact Allow Conditions)

GPT-5.3 is allowed **only** if **at least one** condition below is true and approval is granted (§3):

### A. Security-Critical
Use GPT-5.3 when the task involves any of:
1. **Active vulnerability triage** with potential exploitability (auth bypass, RCE, data exfiltration, privilege escalation).
2. **Cryptographic/signing trust-chain decisions** (key rotation incident response, signature-verification ambiguity, fail-open/fail-closed arbitration).
3. **Security release gate** where uncertainty could ship a known/likely high-severity risk.

### B. Contract Arbitration
Use GPT-5.3 when there is unresolved conflict in:
1. **Cross-layer interface contracts** (Brain↔Spine, Spine↔Operating, Operating↔Cockpit) where two approved interpretations conflict.
2. **Policy/spec vs implementation disputes** that block merge/release and cannot be resolved by Architecture/Standards in one review pass.
3. **Backward-compatibility break adjudication** requiring formal decision and documented precedent.

### C. Release Blocker
Use GPT-5.3 when all are true:
1. Blocker is **P0/P1** and on critical path to release,
2. At least **two non-GPT attempts** failed (from default/fallback ladder),
3. Time-to-resolution risk exceeds release SLA unless escalated.

### Explicit Non-Qualifiers (NOT allowed)
- “Need a better answer faster” without blocker evidence.
- Routine feature coding, refactoring, tests, docs, or grooming.
- Preference-based model switching without failed attempts.

---

## 3) Hard Caps + Approval Authority

## Daily hard cap (org-wide)
- **Max GPT-5.3 turns/day: 40** (all seats combined).
- **Soft warning at 30 turns/day** (75% threshold).
- **Automatic freeze at 40**; further usage requires explicit same-day exception by Apex.

## Approval authority (only)
- **Apex (VP Engineering)**
- **Architecture/Standards Lead**

No other role may approve GPT-5.3 escalation.

## Required escalation log (minimum fields)
Every GPT-5.3 use must log:
- ticket/incident id
- triggering rubric clause (A/B/C + item #)
- prior attempted models + outcomes
- approver (Apex or Arch/Standards)
- turns consumed
- decision/result artifact link

---

## 4) Fallback Ladder (When Model Fails)

If current model fails (timeout, low-quality output, hallucinated API, repeated compile/test failure), escalate **in this order** before GPT-5.3:

1. **Retry same model once** with tighter prompt + constraints + failing evidence.
2. **Switch within lane** (e.g., Qwen3 Coder ↔ DeepSeek v3.2 for backend code tasks).
3. **Switch to specialist lane by task type**:
   - PM/specs → Kimi
   - Cockpit/UI → Gemini
   - QA/test generation → Step 3.5 Flash
   - General code synthesis → Qwen3 Coder or DeepSeek v3.2
4. **Use Devstral or GLM5** as alternate synthesis pass for implementation variants.
5. **Peer-review pass** by Architecture/Standards Lead on non-GPT output.
6. If still blocked and rubric §2 matches, request **GPT-5.3 approval**.

### Failure criteria to move up ladder
Advance when one of these occurs twice:
- non-compiling patch
- test regression introduced
- incorrect contract interpretation
- unresolved blocker after two constrained iterations

---

## 5) Enforcement Summary

- Default is **cost-efficient non-GPT lanes**.
- GPT-5.3 is a **controlled exception path**, not a convenience path.
- Violations (unapproved GPT-5.3 use) are policy breaches and require postmortem entry.
