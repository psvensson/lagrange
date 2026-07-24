---
audience: development
---

# Autonomy-by-default + Parallel-first — steering change plan

Status: ARCHIVED (implemented; historical plan, not active steering)
Date: 2026-06-17
Current behavior: `--keep-alive` replays only a progress-bearing MAX_CYCLES
boundary. THEORY_REQUIRED, recoverable BLOCKED, and measurement repair return
once with a typed action for the external driver. Follow `AGENTS.md` and the
current compact packs, not the proposed wording retained below.
Theme: the machinery for both already exists (two-terminal contract, `run
--keep-alive`, soft-first quorum; subagents). What's missing is a **default
posture**. This plan adds that posture as additive steering, flips two presented
defaults, and preserves every honesty guardrail. No solver code changes in v1.

Recommended tracking: one **process-class** Quest
(`autonomy-and-parallel-defaults`) with an oracle `doneWhen`, two frontiers
(Change A, Change B), dogfooding `promote-finding` to turn each new norm into a
queryable rule.

---

## Why this is mostly additive (verified)

- Autonomy is fully built: `solver-quests.md` defines two true terminals and
  resumable typed stops; its Keep-Alive Supervisor replays progress-bearing
  MAX_CYCLES only, while THEORY_REQUIRED and recoverable BLOCKED return once.
- There is **no positive parallelism norm** anywhere. The only "parallel" mentions
  are prohibitions (no parallel system-data caches `ARCH-0096`; test-harness
  parallelism budget `harness.md:33`) or the narrow `decision-experiments.md:103`
  paragraph on parallel *Quest* execution — and that paragraph is source prose only:
  it is classified `info` and NOT emitted as a queryable rule (no MUST/SHOULD/NEVER
  keyword). Nothing tells the agent to fan out independent work.
- The honesty guardrails (sealed `doneWhen`, subagent-verify-before-handoff,
  measured-promotion-only, commit-per-attempt) constrain **what counts as done**,
  not **how many things run at once** — they are orthogonal and must be preserved.

So the changes are: (1) name the default posture, (2) reorder the two presented
defaults that currently lead with supervised `step`, (3) define the *stop* triggers
tightly so "ask the user" becomes a short, named exception list.

---

## Integration map (verified anchors)

| Target | File | Anchor | Pack effect |
| --- | --- | --- | --- |
| Always-loaded posture | `docs/steering/llm/core.md` | manual pack, `always_load: true`; sections North Star (17), Must-Not (30-62), Core Principles (87-105) | **Manual — edit directly.** Regen skips it because its `outputs` entry is `"manual": true` (generator reads-for-count then `continue`s without writing — `generate-steering-llm-pack.js:1215-1232`). |
| Presented default mode | `docs/steering/llm/boot.md` | manual pack; First Commands (43-86), Conflict Rule (88-101) | **Manual — edit directly.** Untouched because `boot` is not in the `outputs` array at all; the generator never references it. |
| Durable autonomy rules | `docs/steering/workflow-guidelines/solver-quests.md` | Operating Contract (18-34), Terminal/Blocking (478-498), Keep-Alive (658-685) | Canonical source → **governance pack** (config priority 110) via `npm run steering:llm:pack`. |
| Durable parallel rules | same file | new section near Attempt Flow (352) / Strategy Ladder (421) | Canonical → governance pack. |
| Execution-mode default | `docs/steering/workflow-guidelines/lifecycle.md` | Quest Lifecycle step 3 (24-25), First Commands (33-53) | Canonical → governance pack (`compiled_pack: governance.md`). |
| Consistency cross-ref | `docs/steering/doctrine/decision-experiments.md` | parallel-Quest rule (103-105) | Read-only; new parallel norm must not contradict it. |

---

## Change A — Autonomy by default + tight stop triggers

### A1. `core.md` — add a "Default Posture" section (highest leverage; always loaded)

Insert a new section after **North Star** (after line 21), before **Source Authority
Precedence**:

```md
## Default Posture: Autonomy

On a non-trivial task, drive the Quest to a true terminal (SOLVED or EXHAUSTED)
without pausing for confirmation. Non-terminal gates (MAX_CYCLES, THEORY_REQUIRED,
recoverable BLOCKED) are yours to resolve and resume — they are not handoff points.
Prefer `run ... --keep-alive` for longer work so progress-bearing MAX_CYCLES can
continue automatically; execute typed judgment and repair actions externally.

Stop and ask the user ONLY when one of these holds:

1. **Authorization** — an irreversible or outward-facing action (push, publish,
   delete, deploy, send) that is not already durably authorized.
2. **Goalpost ambiguity** — the success condition itself is genuinely undetermined
   and cannot be resolved from the repo, the Quest, or a sensible default; a wrong
   guess would change what "done" means. (A wrong guess about *how* to implement is
   NOT this: pick the obvious option, record a finding, proceed.)
3. **EXHAUSTED** — no honest remaining move.
4. **Safety / scope** — a destructive boundary, or work outside the sealed Quest
   scope.

Otherwise: choose the obvious default, record a finding stating the choice and why,
and keep going. Surface the decisions in the final report, not mid-run.
```

Rationale for placement: North Star → Posture → Authority is the natural reading
order; the posture is the first behavioral instruction after the goal statement.

### A2. `boot.md` — flip the presented First Command for non-trivial work

Current First Commands (45-50) lead with supervised `step`. Reorder so the
autonomous keep-alive run is the presented default for non-trivial work, with
supervised `step` named as the opt-in for human-paced/exploratory work. Concretely,
change the "For a new task" block to present:

```sh
# Non-trivial work — default to an autonomous, self-resuming run:
node scripts/solve.js new --id <id> --statement "<sealed result>"
node scripts/solve.js run --id <id> --executor agent --yes --keep-alive --max 20

# Human-paced or exploratory work — drive it step by step instead:
node scripts/solve.js step --id <id>
```

Keep the existing `theory`, supervised-commit, and `report` blocks unchanged. The
existing "To run autonomously" block (76-80) is now redundant with the new lead —
fold its `--max 20` guidance into the lead and remove the duplicate, OR keep it and
add `--keep-alive`; pick one (verifier to confirm no other doc references the old
block by line).

**Reconcile with the Conflict Rule (88-101).** Boot item 2 already says "Ask for
confirmation before weakening safety bounds, deleting guardrails, or bypassing
validation." That is consistent with stop-trigger #1/#4 and must stay. Add a single
sentence noting the Default Posture stop-list in `core.md` is the general rule and
this item is its safety-specific instance, so the two cannot be read as conflicting.

### A3. `solver-quests.md` — durable "Autonomy Default And Stop Triggers" section

Add a new `##` section immediately before **Terminal And Blocking Conditions**
(before line 478), so the rule sits next to the terminal taxonomy it depends on.
Phrase the stop triggers as normative sentences (so the generator lifts them as
governance rules):

```md
## Autonomy Default And Stop Triggers

The default execution posture for a non-trivial Quest is autonomous: the agent
SHOULD drive to SOLVED or EXHAUSTED and MUST treat non-terminal gates (MAX_CYCLES,
THEORY_REQUIRED, recoverable BLOCKED) as resume points, not handoffs. Longer work
SHOULD use `run --keep-alive` so progress-bearing MAX_CYCLES can continue
automatically; typed judgment and repair actions remain external-driver work.

The agent MUST stop and request user input only on: an unauthorized irreversible or
outward-facing action; a genuinely undetermined success condition that no repo
default resolves; EXHAUSTED; or a destructive/out-of-scope boundary. For any other
open choice the agent MUST pick a sensible default, record a finding, and continue
rather than pause.
```

This regenerates into governance-domain rules (e.g. new `GOV-####`) and is queryable
via `npm run rule -- --domain governance`. NOTE: the compact `governance.md` pack is
capped at `maxRules: 30` and is already saturated (30 surfaced of 80 in rules.json),
so a new rule is guaranteed **queryable in rules.json** but may not appear in the
compact pack unless it outranks the cap. Acceptance below is phrased accordingly.

### A4. `lifecycle.md` — make autonomous the presented default

- Step 3 "Pick the execution mode" (24-25): reword so autonomous `run --keep-alive`
  is the default for non-trivial work and supervised `step` is the human-paced
  opt-in (currently neutral/step-first).
- First Commands (33-53): move the autonomous-run block above the supervised-step
  block for "a new implementation task," mirroring boot.md A2.

### A acceptance

- `core.md` shows the Default Posture section; `node --check`-equivalent: the file is
  still valid markdown and `npm run steering:check` is green after commit (regen does
  not touch manual packs).
- `npm run steering:llm:pack` ingests the new `solver-quests.md` section; the
  stop-trigger sentence is queryable in rules.json (`npm run rule -- --domain
  governance | grep -i "stop and request\|autonomous"`) at `must`/`should` strength
  (NOT `info`). It need not surface in the capped compact `governance.md`.
- boot.md / lifecycle.md lead with `run --keep-alive`; no dangling reference to the
  removed/duplicated autonomous block.

### A risk

Low. Pure prose/posture. The one real hazard is the stop-list being read as license
to take irreversible actions unprompted — mitigated by making **Authorization** the
first trigger and keeping boot.md item 2 intact. `--keep-alive` is an existing,
tested flag.

---

## Change B — Parallel-first execution norm

### B1. `core.md` — add parallel-first to the Default Posture

Extend the A1 section (or add a sibling `## Default Posture: Parallelism`) with:

```md
## Default Posture: Parallelism

When sub-tasks are independent, run them concurrently rather than in sequence:

- Batch independent reads/searches into one step; fan out read-only Explore or
  research subagents for breadth instead of reading serially.
- Verify N independent findings with N concurrent verifiers, not one at a time.
- For broad mechanical work (audits, migrations, sweeps over a known file list), use
  the Workflow harness to pipeline the work-list.

Serialize ONLY when outputs feed each other, or when workers would mutate the same
files (then isolate via worktrees or order the writes). Parallelism applies to the
work, never to the proof: the subagent-verify-before-handoff gate, measured theory
promotion, and one-Quest-per-commit stay serial and intact.
```

### B2. `solver-quests.md` — durable "Parallel-First Execution" section

Add a new `##` section after **Attempt Flow** (after the block ending near 370) or
after **Strategy Ladder**, as normative sentences:

```md
## Parallel-First Execution

Independent work within a Quest SHOULD run concurrently: batch independent reads,
fan out read-only research subagents, and verify independent findings with
concurrent verifiers rather than serially. Broad mechanical sweeps SHOULD use the
Workflow harness to pipeline the work-list.

Work MUST be serialized only when one step's output feeds another, or when workers
would mutate the same files; in the latter case workers MUST be isolated (worktrees)
or their writes ordered. Parallelism MUST NOT be applied to the proof path: subagent
verification before handoff, measured theory promotion, and one-Quest-per-commit
remain serial. Parallel Quest execution on one owner boundary remains allowed only
under disjoint file/owner scope or a single owning closure plan (see
`doctrine/decision-experiments.md`).
```

The final sentence explicitly defers to the existing
`decision-experiments.md:103-105` source paragraph (prose, not an emitted rule) so
the two cannot drift apart. Optional bonus: inject a `MUST`/`SHOULD` keyword into
that source line so it also becomes a queryable rule.

### B3. consistency check (no edit, just verify)

Confirm the new norm does not contradict `decision-experiments.md:103-105` (parallel
Quests need disjoint scope / single owner) or `ARCH-0096` (no parallel system-data
caches — a runtime-data rule, unrelated to work concurrency). Both are about
*data/ownership*, not *task concurrency*; the new norm is about task concurrency and
cross-references them.

### B acceptance

- `core.md` shows the Parallelism posture; `solver-quests.md` shows Parallel-First
  Execution.
- `npm run steering:llm:pack` ingests it; the new rule is queryable in rules.json
  (`npm run rule -- --domain governance | grep -i "concurrently\|parallel"`) at
  `must`/`should` strength. It need not surface in the capped compact `governance.md`.
- Manual read confirms no contradiction with `decision-experiments.md` or `ARCH-0096`.

### B risk

Low–medium. The hazard is encouraging parallel *writes* that race or violate
single-writer/disjoint-scope. Mitigated by the explicit "serialize on write
conflict / isolate via worktrees" clause and the deferral to the existing
parallel-Quest rule.

---

## Guardrails that MUST NOT change (these make autonomy safe)

Verbatim-preserve every one of these; weakening any to "go faster" is the failure
mode:

- Sealed `doneWhen` / no goalpost moves — `core.md:34`, `solver-quests.md:33-34`.
- Subagent-verify before audit/handoff — `core.md:60-62`, Operating Contract item 5
  (`solver-quests.md:28-29`), Source Change Verification (`:385-401`).
- Measured promotion only — `solver-quests.md:191-194`.
- Commit-per-measured-attempt — `solver-quests.md:151-164`.
- Two-terminal honest closure; EXHAUSTED is a legitimate stop, not a bug to code
  around — `solver-quests.md:478-498`.
- One executable concern per Quest + residual-closure inventory —
  `decision-experiments.md:86-105`.

The plan adds posture; it touches none of these rule texts.

---

## Regeneration + verification mechanics

> **BUILD-BREAKER WARNING.** `steering:check` (= `steering:llm:pack && git diff
> --quiet -- docs/steering/llm`) is wired into `test:static` (`package.json:67,117`).
> So the canonical-source edits (`solver-quests.md`, `lifecycle.md`) MUST be
> committed **together with** their regenerated outputs (`rules.json`,
> `governance.md`, `rules-index.md`, `manifest.json`) in the same commit — otherwise
> `npm run test:static` and CI fail on a dirty diff. The manual-pack edits
> (`core.md`, `boot.md`) produce NO regen output and need no regen-commit discipline.

1. Edit manual packs directly: `core.md`, `boot.md` (regen leaves them untouched —
   verified: `core` output is `manual: true` so the generator reads-for-count and
   skips writing; `boot` is not an output at all).
2. Edit canonical sources: `solver-quests.md`, `lifecycle.md`.
3. `npm run steering:llm:pack` — regenerate governance pack + rules.json + index.
4. Inspect new rules: `npm run rule -- --domain governance`.
5. Optionally `promote-finding` is NOT needed here (the rules come from canonical
   source edits, not from quest findings) — but the dogfood quest can still record
   findings citing the new rule IDs.
6. `npm run steering:check` green AFTER commit (it regenerates then
   `git diff --quiet -- docs/steering/llm`; passes once the pack changes are
   committed). `steering:check` is now in `test:static`.

---

## Dogfood quest (`autonomy-and-parallel-defaults`)

- `class: process`, oracle `doneWhen` (`solve/oracle/autonomy-and-parallel-defaults.json`).
- `links.planDoc: docs/autonomy-and-parallel-defaults-plan.md`.
- Two frontiers: `change-a-autonomy-default`, `change-b-parallel-first`, each with a
  per-item oracle metric (1 → 0 when landed), aggregate done when both 0.
- Record a finding per change citing the new governance rule IDs; record the
  subagent-verification finding with evidence `subagent:<id>` (Operating Contract
  item 5 — there ARE source/steering changes).
- Close via `run --executor dry --yes`; solver auto-commits its scope-safe
  artifacts; commit the steering edits explicitly (same pattern as
  `workflow-linking-and-memory-loop`).

---

## Sequencing

1. Change A (core.md posture + solver-quests.md section) — highest leverage, sets the
   stop-trigger contract everything else assumes.
2. boot.md + lifecycle.md default flips (A2/A4) — small, depend on A's contract.
3. Change B (core.md + solver-quests.md) — independent of A; can land in parallel.
4. `steering:llm:pack` once, after all source edits, then verify rules + commit.

Changes A and B are independent edits to the same files; do them in one pass and
regenerate once.

## Explicitly out of scope (v1)

- Concurrent-frontier execution inside a single `run` (a real change to
  `scripts/solve/loop.js` + scheduler + per-attempt commit model) — separate spec.
- Any change to the honesty gates or the two-terminal contract.
- Auto-taking irreversible actions — Authorization stays a hard stop trigger.
- Editing the pack generator (no glob/front-matter work needed; canonical-source
  edits suffice).
