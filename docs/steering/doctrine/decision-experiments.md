---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: rules.json corpus (below architecture pack cap; query via npm run rule)
parent_index: ../doctrine/INDEX.md
last_reviewed: 2026-07-10
---

> **Canonical source.** Doctrine sub-file: causal escalation, sharpening, failure migration. Index: [`INDEX.md`](INDEX.md).

# Doctrine — Decisions And Experiments

## 8. Architectural Direction For Repeated Control-Plane Problems

When control-plane behavior becomes hard to reason about, move upward in
abstraction.

Prefer:

- immutable decision snapshots over ad-hoc booleans
- owner-key reconcile queues over inline progression
- canonical gateways over raw helper access
- snapshot/watch dissemination over repeated point-query discovery
- shared pressure governors over call-site-specific retry logic
- revisioned or freshness-explicit observation contracts over caller-local
  cache-gap interpretation

Do not respond to repeated distributed failures by adding more scattered local
special cases. Collapse the behavior into stronger shared building blocks.

## 9. Escalate Repeated Scenario Failures Into Causal Analysis

When a representative scenario remains red after multiple local fixes or
classification-only reductions, the next step is not another local exception.
The next step is a causal model that explains the whole failure chain.

A causal model must name:

- the end-to-end phases of the scenario
- the entities and cross-entity waits that form the critical path
- the nested budgets, retry windows, and deadlines that bound progress
- the invariants that must hold at each phase boundary
- the normalized failure classes observed in reports, diagnostics, and logs
- the stop conditions for continuing local fixes, migrating owner boundary,
  widening architecture work, or stopping for human direction

Runtime Quests that follow such a model should cite it as their scope basis
and proof surface. Otherwise the Quest is still patching symptoms.

Scenario-driven Quests must maintain scenario causal closure across the whole
chain, not only the current first frontier. Each Quest must
keep enough evidence for a new agent to understand:

- the full phase chain from the scenario/probe through the current first
  frontier
- which blockers are known downstream and why they are not first frontier yet
- the missing causal edge that still needs proof
- the focused probe command and artifact path that prove the missing edge
- the bounded-progress mechanism for retryable or backpressure states,
  including wake, retry, timeout, reconcile, drain, dispatch, delivery, timer,
  advance, or bounded progress
- the expected observable transition, maximum progress bound, and
  same-frontier fallback for retryable or backpressure states
- when repeated crossings of the same boundary require escalation to causal
  analysis or architecture work
- whether the result is a runtime fix, a classification-only closure, an
  architecture gap, a migration, or a contradiction

Classification-only is a valid result only when the causal chain is still
explicit, the focused probe command and artifact are named, the
bounded-progress proof has an observable transition and bound, and the stop
condition says why no local runtime patch should continue in that Quest.
Retryable or backpressure first frontiers cannot become bounded non-frontiers
through prose-only proof.

## 11a. Sharpen Work Before Changing Code

Implementation work should be as explicit and bounded as the runtime design.

- A human idea should first become either:
  - a sharpened roadmap item
  - or a bounded Quest
- Broad ideas must not go straight into code.
- Active implementation should target one executable concern per Quest.
- Quest status should live in the Solver event log and report rather than in
  parallel trackers.
- Every active Quest must name its residual-closure inventory before code is
  treated as complete. At minimum that inventory must cover:
  - owner-path cutovers
  - direct and tail consumers
  - status, diagnostics, and reporting surfaces
  - deletion of superseded paths or stale vocabulary
  - required proof layers
- Do not treat a Quest as SOLVED when only the hot path is fixed. A
  Quest is complete only when the hot path, tail consumers, diagnostics or
  reporting, deletion work, and required proof are all closed.
- Do not begin a new local patch on the same architectural boundary while the
  current Quest still has unresolved in-scope residuals. Either finish the
  residuals in the current Quest or author a new Quest/frontier before moving
  on.
- Parallel Quest execution on the same boundary is allowed only when the Quests
  have explicitly disjoint file and owner scope, or one Quest owns the combined
  closure plan.
- A Quest is not complete when the narrow change lands; it is complete only
  after a final deep dive across the affected owner boundaries confirms the
  area is free of known doctrine and system-guideline violations.
- Use the model ledger as an advisory feedback loop for future model,
  reasoning-effort, and output-profile choice when a Quest produces useful
  evidence. Output profile controls final-response and handoff verbosity, not
  reasoning depth. It must not replace validation, review, sequencing, or
  closure proof.

If the proposed change cannot be described as one bounded concern with clear
ownership, invariants, and completion criteria, it is not ready for active
implementation yet.

## 16. Treat Failure Migration As Boundary Evidence

When a focused fix changes the dominant failure without making the scenario
green, treat that shift as new evidence about the boundary rather than as
incidental noise.

Prefer:

- recording the previous dominant blocker and the new one as a Quest finding
- asking what boundary meaning allowed the new blocker to stay implicit
- adding or authoring the next frontier explicitly when the blocker has moved
  to a new owner seam

Do not treat hot-path green tests as analysis closure while the original
scenario now fails for a different named reason. Failure migration is often
proof that the previous fix worked and exposed the next missing contract.
Quests must never close from symptom movement alone (such as changed timeout
durations, timing offsets, or message counts); they must prove the named
contract transition or owner-boundary correctness.
