# Solve report: movielens-ready-lease-maintenance-critical-owner-lane

**Goal:** Mandatory ready-lease maintenance displaces an older steady-heartbeat publication-pressure slot, enters the critical non-pressure-deferable control-plane write lane before acknowledgement, preserves transient retry coalescing and steady-heartbeat background containment, and the production five-node MovieLens milestone completes schema admission, durable ratings creation, 100000-row preload, ratings-only split convergence, and the successful three-way report.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-formation-alive-peer-keepalive-liveness
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-ready-lease-maintenance-critical-owner-lane-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: unknown
- Latest evidence: test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json
- Selected theory: theory-20260716-publication-owner-rebases-ready-lease
- Next move: continue supervised step for movielens-ready-lease-maintenance-critical-owner-lane-main
- No longer current: Do not rerun unchanged or continue by changing only dispatch priority; that intervention was live-engaged and insufficient.; Absence of heartbeat production, the prior logs-table topology gap, and publication-pressure lane selection are not the current blocker; discriminate authoritative lease rebasing at the publication owner with a delayed-delivery deterministic test.; The next changed-live run is justified by a red-on-current real-owner proof; do not substitute an injected gateway seam or weaken stale/non-READY semantics.

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-ready-lease-maintenance-critical-owner-lane-main
- Blocker: none

## Scope Pressure
- Changed files: 9
- Change bytes: 22376
- Owner areas: src/bootstrap, src/control-plane, test/bootstrap, test/control-plane
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/bootstrap, src/control-plane, test/bootstrap, test/control-plane
- Split plan:
  - src/control-plane: 3 file(s)
  - test/control-plane: 3 file(s)
  - test/bootstrap: 2 file(s)
  - src/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-ready-lease-maintenance-critical-owner-lane-main** [open] rung 1, attempts 2, metric 1 -> 1

## Findings
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T23-55-31-481Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-55-31-481Z.report.json]
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: Independent exact-patch verification approved attempt 1 with no blocking findings: only publication-pressure deferred slots are displaced; transient retry coalescing, steady-heartbeat background containment, bounded sender retries, silent-peer reconciliation, enqueue-before-ACK ownership, critical write-health classification, and model contracts remain valid. Eight focused/adjacent suites passed 542 assertions; exact lint, diff, size, runtime grammar, state-machine, contract, invariant, statechart, owner-trace, Alloy, and active-gate checks passed. [subagent:verify_wave4_lease_attempt1]
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json]
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json]
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: The sealed production symptom reproduces on changed HEAD 7bd3691f: five nodes formed, but schema admission timed out on cache_stale_watermark after the unchanged 60-second stability/evaluation policy. The live report SHA-256 is 0f2a9e1d2ee3e460e3de02f45d1ae4eccd9acd876ab7e5b7e0c854b4c10332e1 and the immutable log archive SHA-256 is 9d781908c1c6d1c2dc997b9c041243ab2a2c7db0d45234215b32b2f11c70c9e8. The critical-lane change was engaged but did not close the lease gap; no unchanged rerun is authorized. (rules out: Do not rerun unchanged or continue by changing only dispatch priority; that intervention was live-engaged and insufficient.) [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json]
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: The immutable changed-live archive shows authoritative nodes-row refresh gaps above the 15-second ready lease for four peers (approximately 17-19 seconds), while heartbeats recover and continue. Source trace shows the sender stamps the expiry at attempt start, then the canonical node-state publication owner advances last_heartbeat to owner receive time but preserves the earlier sender expiry whenever it remains future. Transport, queue, write, and CDC latency therefore consume the authoritative lease before visibility. (rules out: Absence of heartbeat production, the prior logs-table topology gap, and publication-pressure lane selection are not the current blocker; discriminate authoritative lease rebasing at the publication owner with a delayed-delivery deterministic test.) [data/examples/service-data-affinity-demo-archive/wave4-live-critical-ready-lease-2026-07-16T02-43-50-868Z.tar.gz]
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: The real ReplicaDispatchService.handleNodeStateUpdate owner seam reproduced the lease-shortening mechanism: with a lagged READY heartbeat and a still-future five-second sender expiry, the pre-change test stored only that shortened expiry and failed the full-lease assertion. After the owner change, the exact test passes and stores ready_lease_expires_at = owner-normalized last_heartbeat + readyLeaseMs. Eight serial adjacent suites pass 509 assertions; ESLint, runtime grammar, state-machine pressure, and the full contract/model stack pass. (rules out: The next changed-live run is justified by a red-on-current real-owner proof; do not substitute an injected gateway seam or weaken stale/non-READY semantics.) [test/control-plane/replica-dispatch-node-state-update-payload-wakeup-slow-write.test.js]

## Theories
- **theory-20260716-publication-owner-rebases-ready-lease** [supported] frontier, frontier movielens-ready-lease-maintenance-critical-owner-lane-main, layer ownership, mechanism The canonical node-state publication owner advances last_heartbeat to owner receive time but preserves a still-future sender-stamped expiry, so delivery and queue latency shorten the durable ready lease before commit and CDC visibility., owner replica-dispatch-node-state-publication-owner, boundary heartbeat sender to canonical nodes-row write owner, modelGate npm run model:contracts

## Selected Theories
- **movielens-ready-lease-maintenance-critical-owner-lane-main**: theory-20260716-publication-owner-rebases-ready-lease

## Theory Results
- **theory-20260716-publication-owner-rebases-ready-lease**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-55-31-481Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T02:29:49.065Z | movielens-ready-lease-maintenance-critical-owner-lane-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-ready-lease-maintenance-critical-owner-lane/attempt-1.diff |
| 2026-07-16T02:57:53.326Z | movielens-ready-lease-maintenance-critical-owner-lane-main | local-fix | 1 -> 1 | flat | no_previous | theory-20260716-publication-owner-rebases-ready-lease | diff:solve/changes/movielens-ready-lease-maintenance-critical-owner-lane/attempt-2.diff |
