# Agent Workflow Directive

Default execution policy for any multi-step agentic task in this repo.

## Dispatch: serial cascade by default
- Default to a SERIAL CASCADE: one agent owns a large coherent chunk, completes it, hands off. Prefer fewer big handoffs over many small parallel ones.
- Do NOT fan out by default. Fan out ONLY if all hold: subtasks are genuinely independent, share no mutable state, and reconciliation cost < parallel setup cost saved. Any dependency between chunks = stay serial.
- Size each chunk as large as one agent can handle competently in one pass. Split only at natural seams.

## Shared ledger: append-only JSONL
- All agents communicate through one append-only ledger at `./.agent-ledger/<workflow-id>.jsonl`. The ledger IS the shared memory; context passes through the file, not by re-injecting full history.
- Append-only, one line per completed unit of work. Never edit another agent's entry.
- Line schema (one JSON object per line):
  `{ "ts", "workflow_id", "agent_id", "step", "task_chunk", "output", "notes", "dispatch_grade": {"score","rationale"}, "result_grade": {"score","rationale"}, "next_hint" }`
- Reference artifact paths in `output` instead of inlining large blobs.

## Context-cost bound
- Each agent reads the LAST 3 entries + the rolling summary line, NOT the full ledger.
- Maintain one rolling `summary` entry compressing everything before the last 3 steps; update it on each handoff.
- Read the full ledger only when debugging/auditing.

## Dual grading
- Each step records `result_grade` (did output meet the bar?) and `dispatch_grade` (was this routing the efficient choice?), each 0.0–1.0 + rationale. A good result via a wasteful path scores high result / low dispatch.
- At workflow end, append a final `summary` line with: mean result_grade, mean dispatch_grade, the single highest-leverage routing change for next time, and rough token cost vs. an equivalent fan-out.

## Per-step checklist
1. Read last 3 ledger entries + rolling summary.
2. Confirm serial is correct; fan out only if all criteria hold.
3. Do the largest coherent chunk in one pass.
4. Self-assign result_grade + dispatch_grade with rationale.
5. Append one JSONL line; update the rolling summary.
6. Set next_hint, or close with the efficiency outcome if last step.

---

## Applying this in this repo (maintainer-agent addendum — owner may amend)

This repo's reference content (shrine solutions, walkthroughs, battle guides, side quests, compendia)
is authored by **author→adversarial-verify Workflows** — one of the few places fan-out is justified,
because the per-item subtasks are genuinely independent and the project's honesty law requires an
*independent* verifier. The directive above still governs them; apply it concretely as follows.

- **Batch homogeneous items — the #1 token lever.** When you must fan out over many like items
  (e.g. 152 shrines, 173 side quests, 40 item cards), have ONE agent handle a GROUP of K items per
  call — never one agent per item. 152 shrines one-per-agent ≈ 300 agents (author+verify); in batches
  of ~12 ≈ 24 agents — a ~10× cut for the same coverage. Verification batches the same way. Size K to
  what one agent does competently in a single pass (smaller for deep per-item research, larger for
  shallow/structured items).
- **Keep the honesty law.** Author→adversarial-verify stays — the verify pass is a second serial (or
  batched) stage, not a license for per-item parallelism. Never drop verification to save tokens; drop
  *redundant agents*, not *rigor*.
- **≤2 Workflows running at once.** 3+ concurrent (~300+ agents in flight) trips server-side **529
  overload** and most agents fail (learned the hard way: a shrine run returned 2/152). Use
  `Workflow({scriptPath, resumeFromRunId})` to mop up failures cheaply — cached agents return instantly,
  only failed ones re-run.
- **Ledger scope.** `.agent-ledger/` is for **serial Agent-tool cascades and the human-auditable
  trail** — it's local and gitignored. The **Workflow tool already self-journals** (per-agent
  `agent-*.jsonl` transcripts + structured-output return values) and passes context via return values,
  not a shared file; concurrent agents can't safely append to one ledger anyway. So inside a Workflow
  run, don't duplicate per-agent ledger lines — instead append ONE closing ledger line for the whole
  run with its `dispatch_grade` + `result_grade` + a rough "tokens vs. equivalent one-per-item fan-out"
  note, so the efficiency feedback loop still happens.
- **Grading weight.** The end-of-workflow reflection (mean grades + the one routing change to make next
  time + token-vs-fan-out estimate) is the high-value, mandatory part. Per-step `dispatch_grade`/
  `result_grade` can be one terse line each — don't let grading overhead dwarf the work.
- **Before any fan-out, the decision test:** could one well-prompted agent (or a serial cascade of a
  few) do this competently? If yes, do that. Only reach for the Workflow tool when the volume genuinely
  exceeds what serial/batched work can carry — then batch, cap at ≤2 concurrent, and grade the dispatch.
