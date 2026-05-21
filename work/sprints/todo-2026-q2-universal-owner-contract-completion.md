# Universal Owner Contract Completion Sprint

Status: todo. Activate this sprint only after
`work/packages/active-20260521-rolling-restart-active-gate-snapshot-quorum.md`
is closed, superseded, or explicitly moved out of the active blocker slot.

## Sprint Strategy Brief

- Goal state: owner outcomes, handoffs, reconciliation decisions,
  retry/backpressure, metadata/schema ingress, proof tooling, and guardrails are
  universal enough that future sprints inherit the pattern by default.
- Current causal thesis: rolling-restart exposed the repeated shape, but the
  remaining universal work is systemic: consumers and validators still allow
  owner-local contracts to drift into partial, caller-reinterpreted forms.
- Competing hypotheses: the remaining gaps are only local active-gate debt; the
  owner envelope is missing; consumer cutover is the true blocker; proof tooling
  is enough without runtime changes; guardrails are premature until more owners
  migrate.
- Confidence and evidence: medium. Existing code has strong local examples
  (`publication-active-gate-handoff-contract`, gateway outcomes, publication
  recovery state machine), but not one repo-wide contract.
- Expected green path: execute the package queue below in order, one active
  package at a time, with predecessor closure before successor activation.
- Wrong direction signals: any package widens into unrelated runtime work,
  reopens active rolling-restart proof without fresh evidence, closes from a
  timeout/count-only delta, or skips the predecessor contract it depends on.
- Next best package: `work/packages/todo-20260521-universal-owner-outcome-envelope.md`.
- Stop or escalate rule: if a package cannot preserve its owner/boundary or
  requires contradictory evidence, select/open an autonomous architecture
  experiment; use human escalation only for blocked, unavailable, or
  contradictory evidence.

## Activation Wiring

1. Keep this sprint `todo` while the current active rolling-restart package is
   still active.
2. When the sprint starts, move package 1 below to `active` with
   `npm run work:package:move -- --write`.
3. After each package closes, activate the next package in this queue. Each
   package also records the previous package in `predecessor`, so the execution
   order is durable even if this sprint document is read later.
4. Do not run these packages in parallel unless a package explicitly splits a
   child with disjoint write scope.

## Package Queue

1. [Universal Owner Outcome Envelope](../packages/todo-20260521-universal-owner-outcome-envelope.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: create the shared owner outcome envelope and adapt the first
     control-plane owners without losing local detail.
   - Acceptance: at least two owner-specific outcomes adapt into the envelope
     with state, reason, freshness, revision, retry, terminal, and evidence
     fields preserved.
2. [Owner Outcome Consumer Cutover](../packages/todo-20260521-owner-outcome-consumer-cutover.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: cut over the first consumer vertical slice so callers consume
     owner outcomes instead of reconstructing truth from rows, cache, or
     timeout text.
   - Acceptance: selected admin/bootstrap consumers branch only on normalized
     owner outcomes, with stale/deferred answers not cached as fresh truth.
3. [Cross Owner Handoff Contracts](../packages/todo-20260521-cross-owner-handoff-contracts.md)
   - Lane: `causal-escalation`
   - Purpose: make selected producer-consumer handoffs explicit across owner
     boundaries.
   - Acceptance: selected handoffs name producer outcome, consumer
     preconditions, freshness/revision rules, acknowledgement, retry/defer,
     terminal states, and diagnostics vocabulary.
4. [Owner Reconciliation State Machine Normalization](../packages/todo-20260521-owner-reconciliation-state-machine-normalization.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: normalize the first nonconforming owner to evidence snapshot,
     decision table/state machine, canonical outcome, and effects.
   - Acceptance: selected owner emits one canonical outcome from one normalized
     snapshot and blocks caller-local decision piles for that boundary.
5. [Bounded Retry Backpressure Contract](../packages/todo-20260521-bounded-retry-backpressure-contract.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: make deferred/backpressured outcomes carry bounded retry and
     lifetime facts.
   - Acceptance: selected outcomes expose retry-after, wake source, attempt key,
     maximum progress bound, deadline, terminal escalation, and plateau proof.
6. [System Table Metadata Schema Separation](../packages/todo-20260521-system-table-metadata-schema-separation.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: generalize the `assignment_id` schema-filtering lesson across
     system-table write ingress.
   - Acceptance: selected insert/update/upsert paths filter through canonical
     schema or an explicit metadata boundary.
7. [Contract Proof Tooling](../packages/todo-20260521-contract-proof-tooling.md)
   - Lane: `mechanical-maintenance`
   - Purpose: require owner-outcome or handoff-transition proof instead of
     symptom-only scenario proof.
   - Acceptance: validators/tests require named contract transition, focused
     fixture, affected consumer proof, and representative routing evidence when
     scenario work is involved.
8. [Owner Contract Guardrails](../packages/todo-20260521-owner-contract-guardrails.md)
   - Lane: `mechanical-maintenance`
   - Purpose: prevent old raw absence, mixed decision path, schema-unsafe,
     timeout-only, and local retry patterns from returning.
   - Acceptance: guardrails fail the converted anti-patterns without weakening
     existing scan scope or lint rules.

## Non-Goals

1. Do not finish or rerun the active rolling-restart package in this sprint
   queue.
2. Do not make Pro or Enterprise features part of this sprint.
3. Do not edit runtime files while this sprint remains `todo`.
