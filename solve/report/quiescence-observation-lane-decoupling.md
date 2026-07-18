# Solve report: quiescence-observation-lane-decoupling

**Goal:** The movielens-lagrange-service-affinity-live quiescence gate consumes priority-placement observation evidence that remains available under formation control-plane pressure: a schema-admission decision can no longer be denied solely by admin snapshot-lane timeout (control_plane_pressure or snapshot_query_error with snapshot_lane_unavailable) while the underlying placement observation is satisfied, and the sealed live scenario semantics, budgets, and stability window remain byte-unchanged.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 0

## Links
- spec: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 0
- Change bytes: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **quiescence-observation-lane-decoupling-main** [parked {exhausted}] rung 0, attempts 0, metric ? -> ? — No honest remaining move: the sealed symptom does not reproduce on HEAD (two fresh-run repro-on-head findings), so any intervention would be unmeasurable against the sealed goal; falsifiable by a future fresh run emitting control_plane_pressure/snapshot_query_error with snapshot_lane_unavailable while placement observation is satisfied, which would justify reopen or a successor quest.

## Findings
- **quiescence-observation-lane-decoupling-main**: Sealed symptom does NOT reproduce on HEAD: fresh live run reached schema admission admitted=true with a QUIESCENT snapshot, stableElapsedMs 62125 within the unchanged budgets, totalSpreadGap 0, preload admitted; no control_plane_pressure or snapshot_query_error was emitted. HEAD includes the lifecycle-gated heartbeat activation fence, the structural read-authority token, and services-version snapshot-reuse arbitration; the run failed later at learned-affinity attribution stall, a different frontier. Single run - the 2026-07-17 blocker mix was known to rotate run-to-run. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-02-34-776Z.report.json]
- **quiescence-observation-lane-decoupling-main**: Second consecutive fresh run confirms non-repro: schema admission admitted=true, QUIESCENT, stableElapsedMs 63916 within unchanged budgets; no snapshot-lane timeout. Both post-fence runs fail only at the later learned-affinity attribution stall. The sealed symptom is not reproducible on HEAD; the quest's intervention (worker-isolated snapshot lane) is not currently motivated by live evidence and should exhaust as fixed-in-the-meantime, to be re-sealed only if the admin-timeout class returns. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
