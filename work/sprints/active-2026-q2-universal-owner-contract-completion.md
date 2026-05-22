# Universal Owner Contract Completion Sprint

Status: active. Activated after
`work/packages/done-20260521-rolling-restart-active-gate-snapshot-quorum.md`
closed and moved out of the active blocker slot.

## Sprint Strategy Brief

- Goal state: owner outcomes, handoffs, reconciliation decisions,
  retry/backpressure, metadata/schema ingress, proof tooling, guardrails, and
  distributed release-gate verdicts are universal enough that future sprints
  inherit the pattern by default.
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
- Expected green path: execute the experiment/theory ledger package sequence
  first, then resume the paused representative/runtime successor work from the
  queue below, one active package at a time, with predecessor closure before
  successor activation.
- Wrong direction signals: any package widens into unrelated runtime work,
  reopens active rolling-restart proof without fresh evidence, closes from a
  timeout/count-only delta, or skips the predecessor contract it depends on.
- Next best package:
  `work/packages/done-20260522-experiment-theory-ledger-foundation.md`.
- Stop or escalate rule: if a package cannot preserve its owner/boundary or
  requires contradictory evidence, select/open an autonomous architecture
  experiment; use human escalation only for blocked, unavailable, or
  contradictory evidence.

## Current Edge Card

```text
Representative artifact: test-output/report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out
Active package: work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Implement the snapshot/watch owner handoff contract for WebSocket-closed selected snapshot source evidence by emitting a typed selectedSnapshotObservation and publication-active-gate handoff outcome before runtime promotion.
Representative status: reduced
Causal outcome: continue_local_fix
Architecture gate: watching / unknown
Expected delta: Handoff probe detects a typed publicationActiveGateHandoff or selectedSnapshotObservation contract for WebSocket-closed selected source evidence while runtimePromotionAllowed remains false until the contract allows promotion.
Current state: Architecture discriminator selected the snapshot/watch owner handoff contract route: handoff probe is absent with runtimePromotionAllowed=false while selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, and alternativeSnapshotWitnessAvailable=true.
Allowed edits: work/packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md, work/sprints/active-2026-q2-universal-owner-contract-completion.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json, work/model-ledger.jsonl, src/control-plane/publication-active-gate-handoff-contract.js, src/admin/admin-control-snapshot-class-part-1.js, src/admin/admin-control-snapshot-class-part-2.js, test/control-plane/publication-active-gate-handoff-contract.test.js, test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
Candidate runtime files: src/control-plane/control-plane-snapshot-owner.js
Forbidden edits: Runtime promotion remains blocked until a canonical snapshot/watch handoff owner contract is emitted and proven.
Required latest proof: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js, node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js, node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js, npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js, npm run analyze:topology-convergence -- test-output/report.json --handoff-probe, npm run analyze:topology-convergence -- test-output/report.json --replay-fixture
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Activation Wiring

1. Keep only one package in this sprint `active` at a time.
2. When the next sprint package starts, move that package to `active` with
   `npm run work:package:move -- --write`.
3. After each package closes, activate the next package in this queue. Each
   package also records the previous package in `predecessor`, so the execution
   order is durable even if this sprint document is read later.
4. Do not run these packages in parallel unless a package explicitly splits a
   child with disjoint write scope.

## Package Queue

Items 13-17 were inserted on 2026-05-22 to sharpen tracker focus. They are the
next non-runtime governance packages and do not override a fresh representative
successor required by the Current Edge Card.

Items 18-21 were promoted on 2026-05-22 to add a central experiment/theory
memory before more runtime stability work resumes. They are tracker-memory
packages and must preserve package/artifact evidence as source of truth.

1. [Universal Owner Outcome Envelope](../packages/done-20260521-universal-owner-outcome-envelope.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: create the shared owner outcome envelope and adapt the first
     control-plane owners without losing local detail.
   - Acceptance: at least two owner-specific outcomes adapt into the envelope
     with state, reason, freshness, revision, retry, terminal, and evidence
     fields preserved.
2. [Owner Outcome Consumer Cutover](../packages/done-20260521-owner-outcome-consumer-cutover.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: cut over the first consumer vertical slice so callers consume
     owner outcomes instead of reconstructing truth from rows, cache, or
     timeout text.
   - Acceptance: selected admin/bootstrap consumers branch only on normalized
     owner outcomes, with stale/deferred answers not cached as fresh truth.
3. [Cross Owner Handoff Contracts](../packages/done-20260521-cross-owner-handoff-contracts.md)
   - Lane: `causal-escalation`
   - Purpose: make selected producer-consumer handoffs explicit across owner
     boundaries.
   - Acceptance: selected handoffs name producer outcome, consumer
     preconditions, freshness/revision rules, acknowledgement, retry/defer,
     terminal states, and diagnostics vocabulary.
4. [Owner Reconciliation State Machine Normalization](../packages/done-20260521-owner-reconciliation-state-machine-normalization.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: normalize the first nonconforming owner to evidence snapshot,
     decision table/state machine, canonical outcome, and effects.
   - Acceptance: selected owner emits one canonical outcome from one normalized
     snapshot and blocks caller-local decision piles for that boundary.
5. [Bounded Retry Backpressure Contract](../packages/done-20260521-bounded-retry-backpressure-contract.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: make deferred/backpressured outcomes carry bounded retry and
     lifetime facts.
   - Acceptance: selected outcomes expose retry-after, wake source, attempt key,
     maximum progress bound, deadline, terminal escalation, and plateau proof.
6. [System Table Metadata Schema Separation](../packages/done-20260521-system-table-metadata-schema-separation.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: generalize the `assignment_id` schema-filtering lesson across
     system-table write ingress.
   - Acceptance: selected insert/update/upsert paths filter through canonical
     schema or an explicit metadata boundary.
7. [Contract Proof Tooling](../packages/done-20260521-contract-proof-tooling.md)
   - Lane: `mechanical-maintenance`
   - Purpose: require owner-outcome or handoff-transition proof instead of
     symptom-only scenario proof.
   - Acceptance: validators/tests require named contract transition, focused
     fixture, affected consumer proof, and representative routing evidence when
     scenario work is involved.
8. [Owner Contract Guardrails](../packages/done-20260521-owner-contract-guardrails.md)
   - Lane: `mechanical-maintenance`
   - Purpose: prevent old raw absence, mixed decision path, schema-unsafe,
     timeout-only, and local retry patterns from returning.
   - Acceptance: guardrails fail the converted anti-patterns without weakening
     existing scan scope or lint rules.
9. [Harness Verdict Taxonomy And Scenario Contracts](../packages/done-20260522-harness-verdict-taxonomy-and-scenario-contracts.md)
   - Lane: `scenario-release-gate`
   - Purpose: separate core invariant failures from incomplete evidence,
     harness-invalid results, performance blocks, and expected load
     backpressure.
   - Acceptance: reports and summaries expose typed release-blocking verdicts
     without weakening the gate.
10. [Harness Timeout Final Adjudication](../packages/done-20260522-harness-timeout-final-adjudication.md)
    - Lane: `scenario-release-gate`
    - Purpose: run a final drain/snapshot/query adjudication ladder before a
      timeout is labeled as a core system failure.
    - Acceptance: timeouts classify core contradictions separately from late or
      incomplete evidence.
11. [Topology Gate Matrix Executable Contracts](../packages/done-20260522-topology-gate-matrix-executable-contracts.md)
    - Lane: `scenario-release-gate`
    - Purpose: make declared owner reasons, fencing requirements, bounded
      progress, and evidence requirements executable assertions.
    - Acceptance: a topology gate pass proves the declared contract, not only
      scenario completion.
12. [Split Brain Scenario Safety Invariants](../packages/done-20260522-split-brain-scenario-safety-invariants.md)
    - Lane: `scenario-release-gate`
    - Purpose: prove partition-time safety, not only post-heal convergence.
    - Acceptance: the scenario fails on unsafe minority acceptance, competing
      leaders, or acknowledged write loss during/after partition.
13. [Stability Credit Progress Labels](../packages/done-20260522-stability-credit-progress-labels.md)
    - Lane: `mechanical-maintenance`
    - Purpose: make representative stability movement the progress currency
      for package accounting.
    - Acceptance: package metadata, templates, doctor/context output, and
      validation distinguish `representative-green`,
      `representative-migrated`, `representative-reduced`,
      `local-proof-only`, and `instrumentation-only`.
14. [Package Leverage Focus Gate](../packages/done-20260522-package-leverage-focus-gate.md)
    - Lane: `mechanical-maintenance`
    - Purpose: require active packages to state why they are the
      highest-leverage next move for the sprint goal or representative gate.
    - Acceptance: active runtime/scenario/governance packages surface a compact
      leverage statement tied to the current first frontier, sprint goal, or
      representative stability gate.
15. [Representative Rerun Cadence Gate](../packages/done-20260522-representative-rerun-cadence-gate.md)
    - Lane: `mechanical-maintenance`
    - Purpose: prevent chains of adjacent local runtime packages without fresh
      representative evidence or an explicit rerun decision.
    - Acceptance: after focused runtime proof, the tracker requires a fresh
      representative rerun, a scheduled rerun record, an invalid-rerun reason,
      or an architecture stop before another adjacent runtime package starts.
16. [Frontier Oscillation Escalation Rule](../packages/done-20260522-frontier-oscillation-escalation-rule.md)
    - Lane: `mechanical-maintenance`
    - Purpose: make repeated ping-pong between publication convergence,
      active-gate snapshot coverage, readiness, and operation handoff stop in
      an architecture experiment unless representative evidence moves.
    - Acceptance: tracker validation blocks same-family local patches after
      repeated adjacent-boundary oscillation without representative green,
      owner-boundary migration, metric reduction, or a selected architecture
      experiment.
17. [Code Quality Admission Gate](../packages/done-20260522-code-quality-admission-gate.md)
    - Lane: `mechanical-maintenance`
    - Purpose: keep generic cleanup from competing with current frontier work
      unless it buys owner-path clarity, evidence fidelity,
      duplicate-decision-path removal, regression prevention, or an active
      guardrail requirement.
    - Acceptance: code-quality packages entering an active stability sprint
      must name one of those stability-relevant effects before activation.
18. [Experiment Theory Ledger Foundation](../packages/done-20260522-experiment-theory-ledger-foundation.md)
    - Lane: `lightweight-maintenance`
    - Purpose: create a simple central evidence-linked ledger and entry
      template for theories and experiments.
    - Acceptance: `work/theory-ledger.md` and the entry template define IDs,
      statuses, scenario/gate, owner/boundary, hypothesis, probe, artifact,
      representative movement, linked packages, supersession, and next
      implication, while explicitly leaving package/artifact evidence as
      source of truth.
19. [Experiment Theory Ledger Tooling](../packages/done-20260522-experiment-theory-ledger-tooling.md)
    - Lane: `mechanical-maintenance`
    - Purpose: add minimal validation/list/append tooling so agents can use
      the ledger without inconsistent hand edits.
    - Acceptance: `npm run work:theory-ledger -- validate` catches missing
      required fields, invalid statuses, duplicate IDs, missing evidence links,
      and broken supersession references.
20. [Experiment Theory Ledger Tracker Integration](../packages/done-20260522-experiment-theory-ledger-tracker-integration.md)
    - Lane: `mechanical-maintenance`
    - Purpose: add package/context prompts for citing or updating theory
      entries at evidence-changing points.
    - Acceptance: package templates, package doctor/context output, and closure
      guidance expose theory-ledger refs without making them mandatory for
      legacy packages or replacing current-blocker authority.
21. [Experiment Theory Ledger Initial Seed](../packages/done-20260522-experiment-theory-ledger-initial-seed.md)
    - Lane: `diagnostic-classification`
    - Purpose: seed the ledger with only active/current sprint theories and
      immediate predecessor outcomes that have package/artifact evidence.
    - Acceptance: seed entries use conservative statuses, cite package/artifact
      evidence, include supersession links where known, and avoid invented
      historical proof.
22. [Node Failure Rebalance Startup Active Gate Snapshot Watch Handoff Contract](../packages/done-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md)
    - Lane: `causal-escalation`
    - Purpose: resume the paused startup active-gate snapshot/watch handoff
      contract successor after the ledger sequence is implemented and seeded.
    - Acceptance: focused owner proof emits a typed snapshot/watch handoff
      outcome without weakening active-gate admission.
23. [Node Failure Rebalance Acceptance Hardening](../packages/done-20260522-node-failure-rebalance-acceptance-hardening.md)
    - Lane: `scenario-release-gate`
    - Purpose: add acked-write, rebalance-closure, owner/fencing, and
      client-error classification proof to node-failure rebalance.
    - Acceptance: the scenario cannot pass from only total operations plus final
      consistency.

## Non-Goals

1. Do not finish or rerun the active rolling-restart package in this sprint
   queue.
2. Do not make Pro or Enterprise features part of this sprint.
3. Do not edit runtime files outside the active package write scope.
