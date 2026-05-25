# Future Sprint Release Gate Systemic Governance Sprint

Status: done. Marked done on May 14, 2026 during sprint backlog cleanup. This
sprint is intentionally separate from any active release-gate sprint and has no
active package assigned.

## Goal

Increase the probability that all future release-gate sprints reach green by
changing how release-gate work is planned, isolated, reviewed, and handed off.
This sprint owns workflow, governance, and architecture contracts. It does not
own runtime fixes for the latest active blocker.

The core goal is not clearer package boundaries by themselves. It is to force
release-gate work to start from the whole causal chain and the recurring
architecture gap that explains the chain. A future runtime package is valid only
after the sprint has named the repeated owner-boundary failure it is meant to
collapse.

## Scope Boundary

Allowed:

1. Work-tracking policy, package templates, sprint templates, and steering.
2. Reusable analyzer/fixture patterns that summarize blocker paths without
   changing runtime behavior.
3. Architecture decision records and owner-boundary contracts that future
   runtime packages can implement after they are explicitly activated.
4. Package queues for future work, with explicit lanes and forbidden files.

Forbidden:

1. Runtime `src/` edits.
2. Active rolling-restart package or sprint edits.
3. Scenario-specific timeout stretching, closure relabeling, or harness-only
   behavior.
4. Treating a current active blocker as implementation scope unless a later
   package explicitly changes lane to `runtime-owner-boundary` or
   `scenario-release-gate`.

## Operating Invariants

1. Systemic sprint work must use `scenario: none` unless the package is
   explicitly a scenario governance package.
2. Active scenario reports may be `handoffFiles`; they are not write scope.
3. A systemic package must name the active package/sprint it is not allowed to
   mutate.
4. Runtime architecture proposals must produce a contract first and a separate
   implementation package later.
5. A green release gate remains the responsibility of the active scenario
   sprint, not this governance sprint.
6. Higher-order analysis must precede runtime implementation. A future runtime
   package may not start from the newest local symptom alone.
7. Architecture backlog items must reconcile with the latest active
   release-gate proof before activation, so future-sprint contracts do not fork
   from current runtime evidence.

## Recent Problem Shape

The recent blocker path shows a repeat pattern that applies beyond
rolling-restart:

1. A representative gate fails.
2. The first frontier migrates across owners.
3. Local fixes reduce one symptom but leave a downstream or same-frontier edge.
4. Classified backpressure, retryable waits, or accepted residuals can be
   mistaken for closure.
5. Agents risk blending systemic improvement work with the live blocker fix.

This sprint treats that as a workflow and architecture problem: future packages
must preserve blocker lineage, isolate write scope, and convert architecture
ideas into explicit owner contracts before implementation.

The correction is a three-step execution gate:

1. **Blocker path first.** Record the recent sequence of owners, boundaries,
   residual states, migrations, and downstream blockers as one causal chain.
2. **Architecture contract second.** Convert repeated causal edges into one
   owner contract with vocabulary, consumers, prohibited reinterpretations,
   diagnostics, activation criteria, and active-proof reconciliation.
3. **Runtime package third.** Activate implementation only from the contract and
   ledger row, with focused fixture proof before representative reruns.

## Rolling-Restart Resume Maximization

Because this sprint intentionally paused the active `rolling-restart` sprint, it
must produce one resume-ready activation brief before runtime work continues.
The brief is governance-only: it cannot edit runtime files, but it must make the
first resumed runtime package obvious enough that the resumed sprint does not
spend another package rediscovering the same blocker.

The activation brief must carry:

1. The concrete blocker-path ledger from the recent `rolling-restart` history,
   not only an empty template.
2. A priority-recovery operation-progress contract seed naming the owner,
   canonical states, progress events, allowed consumers, prohibited local
   interpretations, and bounded progress mechanism.
3. A no-more-symptom-packages gate that rejects packages which fix only one
   witness without collapsing a repeated causal edge.
4. The exact focused fixture or analyzer proof for target-owned `PENDING`
   priority recovery operations before the next distributed rerun.
5. The green path sequence from `PENDING` operation progress through active-gate
   snapshot coverage and startup readiness to representative `rolling-restart`
   success.

Seeded blocker-path ledger for resume planning:

1. `topology_publication_owner / publication_convergence`: publication ACK debt
   reduced to satisfied/non-frontier with `PUBLISHED` and zero pending ACKs.
   Repeated risk: raw failure presentation can still look like publication
   convergence while canonical topology says priority recovery is first.
2. `operation_workflow_owner / rebalancer_handoff`: remote handoff and retry
   scheduling reduced several times, but same priority-recovery partitions kept
   resurfacing under workflow progress.
3. `rebalancer_leader / operation_scheduling`: missing or stale priority
   recovery operation creation was reduced, but operation progress remained the
   representative frontier.
4. `operation_workflow_owner / workflow_progress`: repeated
   `coordination_mismatch`, `recovering_in_flight`, serial-wait, event-driven
   wait, dispatch-pending, stale-timeout, and target-owned `PENDING` residuals
   show one repeated causal edge: priority recovery lacks one canonical
   operation-progress owner path from desired action to dispatch, retry,
   reconcile, timeout, or completion.
5. `startup_active_gate_owner / snapshot_coverage`: remains downstream while
   priority recovery is unresolved; it may only become first frontier after
   priority recovery operation progress is proven closed.

Resume green path:

1. Target-owned `PENDING` priority recovery operations advance through one
   owner-owned dispatch, retry, reconcile, timeout, or completion path.
2. Priority recovery partitions stop blocking active topology progress.
3. Active-gate snapshot coverage can advance from the priority-recovery
   dependency instead of timing out behind it.
4. Startup readiness consumes the active-gate outcome instead of fronting as
   terminal readiness evidence.
5. The representative `rolling-restart` run passes, or the first frontier moves
   with fresh owner evidence that remains in the same sprint loop.

## Package Queue

1. [Future Sprint Release Gate Systemic Governance](../packages/done-20260513-future-sprint-release-gate-systemic-governance.md)
   - Lane: `lightweight-maintenance`
   - Purpose: create the isolation contract, sprint plan, README rule, and
     package-template fields.
2. [Release Gate Blocker Path Ledger Template](../packages/todo-20260513-release-gate-blocker-path-ledger-template.md)
   - Lane: `lightweight-maintenance`
   - Purpose: add a reusable blocker-path ledger template that records the
     latest path of blockers, not only the active blocker.
   - Higher-order result: every future release-gate sprint begins by naming the
     repeated causal edge behind package ping-pong.
3. [Rolling Restart Resume Activation Brief](../packages/done-20260513-rolling-restart-resume-activation-brief.md)
   - Lane: `read-review-doc-only`
   - Purpose: produce the concrete package-ready brief that resumed
     `rolling-restart` runtime work must reconcile before implementation.
   - Higher-order result: the first resumed package starts from the repeated
     priority-recovery operation-progress edge, not the newest local witness.
4. [Release Gate Architecture Contract Template](../packages/todo-20260513-release-gate-architecture-contract-template.md)
   - Lane: `read-review-doc-only`
   - Purpose: define the ADR shape for owner kernels, active-gate dependency
     contracts, direct-wake transport contracts, and budget inheritance.
   - Higher-order result: runtime packages implement a named owner contract
     instead of another local symptom fix.
5. [Release Gate Fixture First Policy](../packages/todo-20260513-release-gate-fixture-first-policy.md)
   - Lane: `lightweight-maintenance`
   - Purpose: make every scenario sprint start from a focused fixture or
     analyzer proof before another full distributed run.
   - Higher-order result: distributed reruns confirm an owner contract after
     focused proof; they are not the first discovery loop.
6. [Release Gate Bounded Progress Governance](../packages/todo-20260513-release-gate-bounded-progress-governance.md)
   - Lane: `lightweight-maintenance`
   - Purpose: require a named wake/retry/timeout/reconcile/drain/dispatch/
     delivery/timer/advance mechanism before retryable or backpressure
     evidence can be classified.
   - Higher-order result: retryable and accepted residuals cannot be mistaken
     for closure unless the progress mechanism and bound are proven.
7. [Release Gate Runtime Architecture Backlog](../packages/todo-20260513-release-gate-runtime-architecture-backlog.md)
   - Lane: `read-review-doc-only`
   - Purpose: queue runtime-owner packages for the operation-progress kernel,
     active-gate dependency contract, transport priority contract, and budget
     inheritance without implementing them here.
   - Higher-order result: runtime implementation starts from a reconciled
     backlog item, not parallel architecture guesses.

## Detailed Plan

Phase 0: Scope isolation.

1. Add an explicit work-tracking rule for systemic/future-sprint requests.
2. Require active package/sprint files and runtime directories to appear in
   `Forbidden files` when the package is not supposed to fix the active
   blocker.
3. Keep this sprint under `todo` until a human explicitly activates it, so
   current-blocker generation still points at the live scenario sprint.

Phase 1: Blocker-path ledger.

1. Add a compact ledger shape: blocker, owner, boundary, evidence artifact,
   first frontier, downstream blockers, residual semantic state, next required
   action, and whether the item is implementation or governance only.
2. Require the ledger to include the last several blockers, not only the active
   blocker.
3. Require each item to state whether it should drive runtime work, tooling, or
   architecture documentation.
4. Require same-owner or cross-owner repetition to name the suspected
   architecture gap before another runtime package is activated.
5. Require each runtime package to cite the exact ledger row it implements.
6. Seed the ledger with the recent `rolling-restart` path before this sprint is
   allowed to declare itself useful for resuming the paused runtime sprint.

Phase 2: Resume activation brief.

1. Produce a package-ready `rolling-restart` resume activation brief before
   runtime work continues.
2. Require the brief to name the current owner boundary, repeated causal edge,
   exact residual state, forbidden closure modes, focused fixture proof, and
   green path sequence.
3. Require a stale-proof check against the latest active artifact. If the active
   sprint has newer evidence, the brief must be refreshed before runtime package
   activation.
4. Require the next runtime package to cite the activation brief, not only the
   active current-blocker file.

Phase 3: Architecture contract backlog.

1. Record architecture contracts separately from implementation packages.
2. Use one contract per semantic boundary:
   - operation progress kernel
   - active-gate dependency contract
   - direct wake-up transport contract
   - budget inheritance contract
   - fixture-first release-gate contract
3. Require each contract to name allowed consumers, prohibited
   reinterpretations, diagnostics, and activation criteria.
4. Require each contract to cite the blocker-path ledger rows it collapses.
5. Require an active-proof reconciliation note before activation. If the active
   release-gate sprint has newer evidence, the contract must be updated,
   deferred, or superseded rather than implemented stale.

Phase 4: Fixture-first release-gate policy.

1. Require a focused fixture or canonical extractor proof before raw JSON,
   logs, or another full distributed rerun.
2. Require packages to record which extractor was tried and why any fallback
   was needed.
3. Keep the representative distributed run as confirmation, not the first
   debugging surface.
4. If no focused fixture or extractor can represent the repeated edge, create a
   tooling package before runtime implementation.

Phase 5: Bounded-progress governance.

1. Require retryable/backpressure evidence to name a bounded mechanism.
2. Require maximum owner-cycle, timer, retry, or dispatch bounds before a
   package can classify a residual.
3. Prohibit closure by classification while the active release gate is red.
4. Treat retryable or accepted evidence without a named bounded progress
   mechanism as an active causal edge, not a non-frontier classification.

Phase 6: Model and subagent policy.

1. Keep governance packages in `lightweight-maintenance` or
   `read-review-doc-only` unless they touch runtime, shared contracts, or
   representative scenario evidence.
2. Escalate to runtime/scenario lanes only in separate packages with the
   required subagent sequencing ledger.
3. Record model-fit evidence only after validation adds useful signal.

Phase 7: Activation rule.

1. This sprint can be activated only after the human chooses to pause or finish
   the active release-gate implementation lane.
2. Runtime architecture contracts from this sprint may be implemented only by
   later runtime-owner packages with focused write scope.
3. The active rolling-restart sprint remains responsible for green
   rolling-restart evidence.
4. Before activating any runtime backlog item, run the current active-sprint
   evidence extractors and update the contract/backlog if the first frontier,
   downstream blockers, or owner boundary changed.

## Executed Slice

1. Created the first governance package scaffold:
   [Future Sprint Release Gate Systemic Governance](../packages/done-20260513-future-sprint-release-gate-systemic-governance.md).
2. Added a global workflow rule to `work/README.md`.
3. Added an active-sprint isolation section to
   `work/templates/work-package-template.md`.
4. Reverted in-progress runtime dispatch edits from this clarification so this
   sprint stays governance-only.
5. Materialized the higher-order package queue as explicit todo packages so the
   future sprint has executable work for blocker-path lineage, architecture
   contracts, fixture-first policy, bounded-progress governance, and runtime
   backlog reconciliation.
6. Added a concrete rolling-restart resume activation brief so the paused active
   sprint can restart from the repeated priority-recovery operation-progress
   edge with a focused fixture, no-symptom gate, and green path sequence.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md`
2. `npm run work:validate -- --entry work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md`
3. `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/done-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md`
4. `git diff --check -- work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/done-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/README.md work/templates/work-package-template.md`

## Done When

1. Future-sprint systemic work has a reusable isolation rule and template.
2. The systemic package queue is materialized as executable todo packages
   without altering the active rolling-restart blocker lane.
3. The first executable package after activation is blocker-path lineage, not
   runtime implementation.
4. The paused `rolling-restart` sprint has a resume activation brief that names
   the concrete blocker path, operation-progress contract seed, focused fixture,
   no-symptom gate, stale-proof check, and green path sequence.
5. Any future runtime architecture idea is represented as a contract plus
   reconciled backlog item first, not as an accidental current-blocker patch.
6. Runtime package activation requires a cited blocker-path ledger row,
   architecture contract, focused proof surface, and latest active-proof
   reconciliation.
