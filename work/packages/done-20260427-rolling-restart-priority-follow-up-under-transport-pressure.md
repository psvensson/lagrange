# Rolling Restart Priority Follow-Up Under Transport Pressure

April 27 activation: this package is the current representative execution
owner for `rolling-restart --fast-local`. The prior post-active operation drain
and durable trim package is paused because this blocker occurs earlier during
load readiness.

## Why

The April 27 representative `rolling-restart --fast-local` rerun moved past
the previous publication ACK and post-published endpoint-visibility blockers,
but failed earlier during load readiness:

1. report:
   `test-output/reports/runtime-stability-rolling-restart-20260427-codex-priority-cleanup-first.report.json`
2. failure bundle:
   `test-output/reports/.playback/runtime-stability-rolling-restart-20260427-codex-priority-cleanup-first/rolling-restart/failure-bundle.md`
3. terminal error:
   `Cluster load readiness did not stabilize within 300000ms`
4. publication epoch `5` was `PUBLISHED`
5. pending ACK count was `0`
6. blocked publication node count was `0`
7. recovery protocol state was `priority_spread_pending`
8. unresolved priority partitions were `sql_transactions-p1` and
   `sql_write_operations-p1`
9. `sql_transactions-p1` had a terminal failed operation visible through the
   priority recovery witness
10. `sql_write_operations-p1` was `needs_operation` with
    `eligible_but_no_operation_created`
11. logs showed repeated router timeouts, outbound queue saturation,
    heartbeat/write-health degradation, authoritative discovery repair
    failures, and system-table update/query pressure

This is not the stale publication ACK blocker, not missing published
membership, and not the post-published `control_plane_publications-p1`
endpoint-visibility trim blocker. The next owner boundary is priority
follow-up creation/progression while transport and CDC-backed system-table
queries are saturated.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Define one owner outcome for priority follow-up creation when eligible
   nodes exist but system-table query/update pressure blocks operation
   persistence.
2. Make terminal failed priority operations with eligible replacements re-enter
   follow-up planning without relying on load-readiness polling.
3. Preserve backpressure semantics: do not hide router saturation or turn
   failed writes into fake progress.
4. Add focused coverage for `eligible_but_no_operation_created` under
   transport/query pressure.
5. Rerun `rolling-restart --fast-local` and record whether it reaches the
   post-active trim barrier again.

## Out Of Scope

1. Increasing load-readiness or convergence timeouts.
2. Harness-only readiness exemptions.
3. Pro or Enterprise features.

## Shared Boundary Contract

Semantic owner: priority recovery diagnostics and the unified rebalancer
follow-up planner.

Canonical contract shape:

1. priority recovery emits one normalized partition decision snapshot
2. follow-up planning emits one named move outcome with a state and reason
3. pressure-deferred observation stays explicit and does not become fake
   progress

Allowed consumers:

1. unified rebalancer priority follow-up planning
2. rebalancer admission and concurrent-budget checks
3. failure-bundle priority recovery classification
4. the active sprint tracker

Prohibited reinterpretations:

1. empty node lists must not mean unavailable owner evidence
2. terminal failed priority operations must not be treated as closed while
   eligible recovery targets exist
3. router, query, or CDC pressure must not be hidden by synthetic successful
   operation creation

## Residual Closure Inventory

1. Owner paths: priority recovery observation snapshots, unified rebalancer
   follow-up move planning, and rebalancer admission pressure handling.
2. Tail consumers: load-readiness failure bundles, active-gate classification,
   active sprint status, and post-active trim package sequencing.
3. Superseded paths: implicit `null`/empty-list unavailable evidence and
   predicate-only terminal-failed follow-up handling.
4. Required proof: focused priority follow-up coverage, decision-boundary and
   runtime grammar guardrails, scalar audit, and one representative
   `rolling-restart --fast-local` rerun.

## Done When

1. Priority recovery either creates one canonical follow-up operation or emits
   one canonical pressure-deferred owner outcome for each eligible unresolved
   priority partition.
2. `rolling-restart --fast-local` moves beyond load readiness without
   `eligible_but_no_operation_created`, or the next blocker is recorded as a
   separate named owner boundary.

## Validation Surface

1. Focused coverage for priority follow-up creation/progression under
   transport/query pressure.
2. Static guardrails for decision boundaries, runtime grammar, and scalar
   ownership.
3. Representative `rolling-restart --fast-local` rerun recorded in this package
   before closure or migration.

## Progress Notes

1. Done: wire transport/query pressure telemetry into priority-recovery
   pressure conditions and witness transport pressure state.
2. Done: add focused regression coverage for
   `eligible_but_no_operation_created` under transport/query pressure.
3. Done: rerun `rolling-restart --fast-local` and confirm the load-readiness
   boundary no longer blocks on `priority_recovery_progress`; the rerun failed
   at startup readiness timeout with zero unresolved priority partitions.

   - Report:
     `test-output/reports/runtime-stability-rolling-restart-20260427-codex-priority-followup-next.report.json`
     (252.3s, failed).
   - Dominant reason:
     `readiness_probe_timeout_fallback=Node readiness probe timed out for
     7493b0ab-a054-5fad-a91b-5e331db29304`.
   - Active gate last progress:
     `active=4/5, coverage=0/5, snapshot_error`
     with blocker signature:
     `inactive_nodes=1|snapshot_coverage=0/5|snapshot_error`.
   - Priority-recovery indicators:
     `priorityRecoveryUnresolvedClassCount=0`, `priorityRecoveryPartitionSummary`
     empty.

   - Done: prefer startup authority over partial readiness-based active cohorts
     in join readiness (`resolveCanonicalJoinActiveNodeAuthority`) and add focused
     regression coverage in
     `test/bootstrap/join-readiness-startup-authority.test.js`. The active-node
     authority path now remains on declared startup cohort truth when available.

	   Recorded boundary migration: this path moved from transport/query
	   pressure follow-up work to startup-readiness/snapshot gating.

## Closure Evidence

Closed on April 27, 2026.

1. Priority recovery pressure telemetry now records transport/query pressure in
   the priority recovery witness surface.
2. Terminal failed priority operations with eligible replacements re-enter
   follow-up planning.
3. Follow-up move planning now carries named move outcomes and reads the same
   eligible-node shape that the terminal-failed predicate accepts.
4. The representative rerun moved beyond the load-readiness priority recovery
   blocker. The new dominant blocker is startup-readiness/snapshot gating in
   [Rolling restart startup readiness snapshot gating](./active-20260427-rolling-restart-startup-readiness-snapshot-gating.md).
