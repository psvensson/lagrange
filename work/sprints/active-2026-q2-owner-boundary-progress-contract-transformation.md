# Owner Boundary Progress Contract Transformation Sprint

Status: active. Created on May 27, 2026.

## Goal

Transform rolling-restart-relevant owner boundaries so stranded distributed
work is represented by explicit progress contracts instead of scattered
pending, retryable, deferred, or timeout-only evidence.

Complete means:

1. rolling-restart-relevant owner boundaries emit or consume one contract shape
   for progress, retry, wake, terminal, and migration evidence;
2. diagnostics prefer that contract when selecting the first frontier;
3. workflow guardrails prevent new stranded progress states without a
   re-entry or terminal proof;
4. focused tests prove progress transitions, not only state capture;
5. a representative rolling-restart proof is green, reduced, migrated to one
   concrete frontier, or explicitly classified as an architecture gap.

## Sprint Strategy Brief

- Goal state: `rolling-restart` is green or every remaining red frontier is
  an explicit owner-boundary progress contract with a named wake/retry/terminal
  path and architecture stop rule.
- Current causal thesis: recent rolling-restart work found the same systemic
  shape across priority recovery, active-gate coverage, and startup readiness:
  work exists or evidence is retryable, but the owning boundary can strand
  progress without one durable contract for next action, wake source, retry
  budget, terminal state, and diagnostic evidence.
- Competing hypotheses: the remaining failures are isolated readiness/load
  admission bugs; diagnostics are sufficient if more fields are added; runtime
  owners already have enough local state but consumers reinterpret it; a
  shared contract is too broad and should stay per owner.
- Confidence and evidence: high that the repeated shape is systemic because
  the current sprint moved through `operation_workflow_owner /
  workflow_progress`, `startup_active_gate_owner / snapshot_coverage`, and
  `startup_readiness_owner / startup_support_evidence` while preserving the
  same stranded-progress pattern.
- Expected green path: define the minimal contract, add guardrails, cut over
  diagnostics, convert startup readiness, operation workflow, and active-gate
  coverage one boundary at a time, then run a representative rolling-restart
  proof and clean up duplicated vocabulary.
- Wrong direction signals: broad runtime rewrites, timeout increases, patches
  that only quiet downstream symptoms, diagnostics that infer owner state from
  unrelated fields, or another package that records pending/deferred/retryable
  state without a wake/retry/terminal path.
- Next best package:
  `work/packages/todo-20260527-owner-boundary-progress-contract-foundation.md`.
- Stop or escalate rule: if one conversion cannot preserve owner/boundary or
  needs contradictory semantics, open an autonomous architecture experiment for
  that boundary before broadening the sprint.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/done-20260527-progress-contract-cleanup-and-adoption.md
Active package owner: workflow_tooling_owner
Active package boundary: progress_contract_adoption
Selected cause: duplicate_progress_vocabulary_cleanup
Required action: Remove converted ad hoc progress vocabulary, document the adopted pattern, and leave future packages with contract-ready examples.
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: Created todo package for cleanup and adoption after representative proof selects the final progress-contract shape.
Allowed edits: work/RULES.md, .kiro/steering/llm/style.md, .kiro/steering/llm/testing.md, work/templates/sprint-strategy-brief.md, .kiro/steering/doctrine/state-encoding.md, .kiro/steering/workflow-guidelines/lifecycle.md, .kiro/steering/llm/rules.json, .kiro/steering/llm/architecture.md, .kiro/steering/llm/governance.md
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: regression: npm run steering:llm:pack, supporting: npm run work:validate -- --entry, supporting: npm run work:validate -- --pre-impl
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Sprint Systemic Insight Gate

1. Contradiction: rolling-restart can show bounded local progress while the
   representative gate remains red because the next owner boundary is only
   retryable or pending rather than contractually advancing.
2. Competing causal theories: producer progress is stranded; consumer gates
   reinterpret upstream symptoms; lifecycle wake/retry is missing; admission
   gates prove the wrong readiness surface; diagnostics do not preserve the
   owner contract; stale evidence drives the next package.
3. Missing system object: a small owner-boundary progress contract shared by
   runtime owners, diagnostics, package templates, and focused tests.
4. Next package as experiment: the foundation package proves whether a minimal
   contract can be introduced without runtime behavior changes.
5. Falsifier: a converted owner boundary still needs caller-local inference,
   timeout text, or unrelated downstream fields to select its next action.
6. Negative proof: converted tests must prove old symptom-only routes do not
   bypass the owner contract.
7. Representative checkpoint: after the three owner-boundary conversions, run
   one fresh rolling-restart artifact and route it before further local patches.
8. Stop rule: unchanged same-frontier evidence after a converted owner boundary
   opens/selects an autonomous architecture experiment; human escalation is
   only for blocked, unavailable, or contradictory evidence.

## Transformation Contract

Every converted boundary must expose these concepts, using local constants and
owner vocabulary rather than inline strings:

1. `owner`
2. `boundary`
3. `state`
4. `reason`
5. `nextAction`
6. `wakeSource`
7. `retryAfterMs`
8. `terminalState`
9. `evidencePath`
10. `blockingDependency`

Runtime packages may adapt the exact field names when a local owner already
has a stronger envelope, but the package must map each concept explicitly.

## Package Queue

1. [Owner Boundary Progress Contract Foundation](../packages/done-20260527-owner-boundary-progress-contract-foundation.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `diagnostics_owner / progress_contract_foundation`
   - Purpose: define the canonical progress contract vocabulary and minimal
     helpers for rolling-restart owner-boundary blockers.
   - Acceptance: diagnostics constants and focused topology tests can express
     owner, boundary, state, reason, next action, wake source, retry, terminal,
     evidence path, and blocking dependency without runtime behavior changes.
2. [Progress Contract Guardrails And Package Templates](../packages/todo-20260527-progress-contract-guardrails-and-package-templates.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / progress_contract_guardrails`
   - Purpose: require future runtime/scenario packages to name the progress
     contract they change before runtime promotion.
   - Acceptance: package validation or focused guardrail proof rejects new
     stranded progress states without wake/retry/terminal evidence.
3. [Diagnostics Progress Contract Consumer Cutover](../packages/todo-20260527-diagnostics-progress-contract-consumer-cutover.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `diagnostics_owner /
     topology_convergence_progress_contract`
   - Purpose: make topology convergence and causal routing prefer explicit
     progress contracts over scattered inferred fields.
   - Acceptance: diagnostics tests select the same or narrower first frontier
     from contract data and no longer need unrelated downstream symptoms for
     that choice.
4. [Startup Readiness Progress Contract Conversion](../packages/todo-20260527-startup-readiness-progress-contract-conversion.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_readiness_owner / startup_support_evidence`
   - Purpose: convert `readiness_retryable` startup support into contract
     state with wake/retry source and bounded terminal evidence.
   - Acceptance: focused bootstrap tests prove retryable readiness either
     re-enters, advances, or emits a terminal stop with diagnostic evidence.
5. [Operation Workflow Progress Contract Conversion](../packages/todo-20260527-operation-workflow-progress-contract-conversion.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `operation_workflow_owner / workflow_progress`
   - Purpose: convert priority recovery `dispatch_pending` / `planned` owner
     re-entry paths to explicit progress contracts.
   - Acceptance: focused rebalancer tests prove persisted-not-dispatched work
     wakes, retries, reconciles, or emits a terminal owner outcome.
6. [Active Gate Snapshot Coverage Progress Contract Conversion](../packages/todo-20260527-active-gate-snapshot-coverage-progress-contract-conversion.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Purpose: convert active-gate snapshot coverage to explicit bounded
     progress, retry, and terminal contract evidence.
   - Acceptance: active-gate and diagnostics tests prove coverage cannot mask
     upstream owner debt and emits one bounded next action.
7. [Rolling Restart Progress Contract Representative Proof](../packages/todo-20260527-rolling-restart-progress-contract-representative-proof.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `release_gate_owner /
     rolling_restart_progress_contract_gate`
   - Purpose: run rolling-restart after converted owner boundaries and route
     the artifact to green, reduced, migrated, or architecture-gap.
   - Acceptance: fresh representative artifact has no ambiguous stranded
     progress state; if red, the first frontier is one explicit contract edge.
8. [Progress Contract Cleanup And Adoption](../packages/done-20260527-progress-contract-cleanup-and-adoption.md)
   - Lane: `lightweight-maintenance`
   - Owner boundary: `workflow_tooling_owner / progress_contract_adoption`
   - Purpose: remove converted ad hoc progress vocabulary, document the
     adopted pattern, and leave future packages with contract-ready examples.
   - Acceptance: steering packs, rules, and package templates describe the
     pattern, focused validations pass, and no converted owner relies on the
     retired vocabulary.

## Activation Order

Packages 1 through 3 are ordered and must run first. Packages 4 through 6 may
be reordered only if the then-current representative frontier selects a
specific converted boundary first. Package 7 runs after the converted boundary
set is complete or explicitly deferred. Package 8 closes the sprint.

Only one package from this sprint should be active at a time. Do not activate
this sprint until the current rolling-restart priority recovery sprint either
closes or explicitly migrates its remaining work here.

## Non-Goals

1. Do not rewrite all owner code in the repository.
2. Do not broaden beyond rolling-restart-relevant owner boundaries.
3. Do not raise timeouts or relax release-gate verdicts as a substitute for a
   progress contract.
4. Do not make diagnostics the source of runtime truth; diagnostics consume
   owner evidence, they do not invent owner decisions.
5. Do not implement Pro or Enterprise behavior.

## Closure Rule

This sprint closes when packages 1 through 8 are done or explicitly superseded
with current evidence, and the representative rolling-restart proof is green,
reduced, migrated to one concrete frontier, or classified as an architecture
gap with a selected follow-on package.
