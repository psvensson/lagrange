# Representative Stability Gate And Matrix Re-Entry

Status: done. The `node-join-under-load` representative gate is complete, and
secondary re-entry is now narrowed to one active `rolling-restart` package.

## Why

The repository has accumulated many full harness reruns while the dominant
blocker was still moving. That is expensive and makes the system harder to
understand because every rerun can expose a different next-order symptom.

The stabilization path needs a narrow gate:

1. fix the active runtime owner path
2. prove the representative 5-node scenario
3. confirm it once without code changes
4. only then re-enter secondary scenarios and the wider matrix

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Critical replace remove safety and convergence timeout](./done-20260424-critical-replace-remove-safety-and-convergence-timeout.md)
2. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)
3. [Harness canonical owner-state classification](./done-20260424-harness-canonical-owner-state-classification.md)

## In Scope

1. Define the acceptance ladder for re-entering the distributed matrix.
2. Capture the exact representative commands and required artifact reads.
3. Add or update a small summary surface if the current one cannot distinguish
   representative stability from old artifact noise.
4. Run the representative gate and record blocker migration if any failure
   remains.

## Out Of Scope

1. Full-matrix execution before the representative gate is stable.
2. Changing scenario semantics to hide runtime instability.
3. Product-facing documentation.

## Shared Boundary Contract

- Semantic owner:
  sprint-level validation sequencing for distributed harness stability.
- Canonical contract:
  one representative scenario owns blocker closure before broader matrix
  re-entry; broad matrix failures do not replace the representative gate until
  that gate is stable.
- Allowed consumers:
  active sprint, package validation sections, local test procedures, and
  failure summaries.
- Prohibited reinterpretations:
  treating one focused unit green as scenario closure, treating one broad
  matrix failure as a replacement for the current blocker, or rerunning the
  full matrix while the representative blocker is unnamed.

## Stability Ladder

1. Focused owner-path tests pass.
2. Harness classification tests pass.
3. `node-join-under-load` passes once.
4. `node-join-under-load` passes a no-code confirmation rerun.
5. `rolling-restart` rerun checks restart/load-pressure interaction.
6. 7-node transaction recovery rerun checks critical replacement convergence
   at larger scale.
7. 7-node partitioning rerun checks load/convergence under split pressure.

## Hotspots

1. `test/distributed/README.local.md`
2. `scripts/summarize-harness-runs.js`
3. `scripts/find-failing-reports.mjs`
4. `test-output/reports`
5. `work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md`

## Residual Closure Inventory

- [x] Validation ladder is reflected in the sprint.
- [x] Representative commands are recorded.
- [x] Latest representative artifacts are classified with current owner
      vocabulary.
- [x] Secondary matrix re-entry is explicit and ordered.
- [x] `rolling-restart` priority follow-up operation blocker is closed by
      blocker migration through
      [Priority recovery follow-up operation creation](./done-20260424-priority-recovery-followup-operation-creation.md).
- [x] `rolling-restart` recovery-ready/admin transport pressure blocker is
      closed through
      [Rolling restart recovery-ready and transport pressure](./done-20260424-rolling-restart-recovery-ready-and-transport-pressure.md).
- [x] `rolling-restart` post-restart ACTIVE gate and transport saturation
      blocker is closed through
      [Rolling restart post-restart ACTIVE gate and transport saturation](./done-20260424-rolling-restart-post-restart-active-gate-and-transport-saturation.md).
- [x] `rolling-restart` final leader-map consistency and CDC pressure blocker
      is closed through
      [Rolling restart final leader-map consistency and CDC pressure](./done-20260424-rolling-restart-final-leader-map-consistency-and-cdc-pressure.md).
- [x] `rolling-restart` restart-recovery priority spread pending was
      superseded by later convergence-timeout evidence through
      [Rolling restart restart-recovery priority spread pending](./superseded-20260424-rolling-restart-restart-recovery-priority-spread-pending.md).
- [x] `rolling-restart` convergence timeout truth and classification is complete
      through
      [Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).

## Validation

1. `node scripts/summarize-harness-runs.js`
2. `node scripts/find-failing-reports.mjs`
3. Representative `node-join-under-load` run and no-code confirmation run.

Executed during this sprint:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/runtime-stability-node-join-20260424-codex-completed-replace-placement.report.json --fast-local --verbose`
2. Result: passed.
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/runtime-stability-node-join-20260424-codex-completed-replace-placement-confirmation.report.json --fast-local --verbose`
4. Result: passed.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-superseded-stale-operation.report.json --fast-local --verbose`
6. Result: failed with named residual blocker `replica_operations-p1` /
   `needs_operation`.
7. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
8. Result: passed.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-priority-followup-created.report.json --fast-local --verbose`
10. Result: moved beyond `needs_operation`; exposed final leader comparison
    after load-mode soft active success.
11. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json --fast-local --verbose`
12. Result: failed at restarted-node recovery readiness with admin API
    `ECONNREFUSED`.
13. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-recovery-readiness-owner-blocker.report.json --fast-local --verbose`
14. Result: moved beyond per-restart recovery readiness and failed at strict
    post-restart ACTIVE convergence.
15. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json --fast-local --verbose`
16. Result: moved beyond strict post-restart ACTIVE convergence and failed at
    final leader-map consistency for `sql_transactions-p1`.
17. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun.report.json --fast-local --verbose`
18. Result: moved beyond final-consistency ownership and failed at strict
    ACTIVE convergence with `inactive_nodes=1`.
19. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
20. Result: passed; latest harness unit coverage is green while the runtime
    blocker remains in distributed `rolling-restart`.
21. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
22. Result: passed; scenario unit coverage is green while the distributed
    restart barrier remains open.
23. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-phase-adoption.report.json`
24. Result: failed at restarted-node recovery readiness with
    `priority_spread_pending`; this blocker is now superseded.
25. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
26. Result: failed after restart recovery and priority spread closed with
    `Convergence timeout after 120000ms`; this is now the named active blocker.

## Done When

1. The representative scenario is stable enough to stop chasing blocker
   migration blindly. Status: complete.
2. The next broad scenario to run is explicitly named.
   Status: complete; the next scenario is `rolling-restart`.
3. Any remaining instability is tied to a fresh package rather than buried in
   sprint commentary. Status: active via
   [Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).
