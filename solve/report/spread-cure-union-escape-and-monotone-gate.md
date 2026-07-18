# Solve report: spread-cure-union-escape-and-monotone-gate

**Goal:** Peer-system transplants for the critical-spread-gap terminal stall (evidence: live run 17-40-24, terminal topology sql_write_operations-p1 at [A,A,B] with free nodes and every spread ADD denied replica_inventory_unusable for 3 minutes). SEALED RESULT: a priority control-plane partition at target replica count with co-located replicas, free active nodes, and an UNAVAILABLE authoritative services read receives an admitted spread-restoring operation within one evaluation cycle - the topology guard's conservative-union escape (generalized from the concentrated-ledger cure, same provenance preconditions, union-proven need and safety, occupied/target-count rows still enforced) admits the planner's cure-typed spread move, whose typing now survives the coordinator operation-request boundary; the demo schema-admission stability window HOLDS accumulated evidence and confirmations through observer-side poll failures bounded by one stable window of blindness while regressing observations still reset both; and a critical-spread-open denial names the gapped partitions inline in its reason detail.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-26-57-941Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: formation-joining-ready-phase-fence-live

## Scope Pressure
- Changed files: 6
- Change bytes: 32711
- Owner areas: examples, scripts/run-spread-cure-union-escape-scenarios.js, src/rebalancer, test/rebalancer, test/runtime
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: examples, scripts/run-spread-cure-union-escape-scenarios.js, src/rebalancer, test/rebalancer, test/runtime
- Split plan:
  - src/rebalancer: 2 file(s)
  - examples: 1 file(s)
  - scripts/run-spread-cure-union-escape-scenarios.js: 1 file(s)
  - test/rebalancer: 1 file(s)
  - test/runtime: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **spread-cure-union-escape-and-monotone-gate-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **spread-cure-union-escape-and-monotone-gate-main**: Ingested evidence from spread-cure-union-escape-and-monotone-gate-2026-07-18T18-34-32-793Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-34-32-793Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: Ingested evidence from spread-cure-union-escape-and-monotone-gate-2026-07-18T18-34-32-793Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-34-32-793Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: Guard-suite-mandated tightening applied after the solving attempt, same files (change artifact solve/changes/spread-cure-union-escape-and-monotone-gate/attempt-2-tightened.diff is the authoritative tree snapshot): the priority spread-cure escape now excludes the operation-ledger partition (which keeps its own stricter cure relation) and its REPLACE arm requires the source replica to sit on an over-represented node (>=2 occupied union replicas) - relocating a lone replica keeps distinct-node count unchanged and must not ride the escape (rebalance-coordinator-topology-guard.test.js case 'a voter off the hottest node is not the quorum-spread cure' was red against the untightened shape). Post-tightening: guard suite 38/38, terminal-stall repro 6/6, scenario runner (now also pinning the guard suite) 3x consecutive PASS. [test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-34-32-793Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: independent verification passed: adversarial review APPROVED the union escape (all constructed unsafe-admission attempts closed by escape preconditions plus the still-enforced occupied/target-count rows; TOCTOU re-block confirmed live in the repro; ledger exclusion and lone-replica REPLACE rejection verified; message-group/runtime-service entities denied), the moveReason plumbing (no consumer misinterprets; not persisted; dedupe keys unaffected), and the monotone stability window (real churn cannot masquerade as observer failure; held polls never confirm; blind stretches bounded per contiguous span). Suites: repro 6/6, guard 38/38, unified-rebalancer 195/195, gate 95/95, runner 10/10 files. Artifact matches tree 6/6 blob hashes. [subagent:spread-cure-transplant-verifier-2026-07-18]
- **spread-cure-union-escape-and-monotone-gate-main**: independent verification passed (aggregate: the quest's cumulative change is the single solving attempt plus the guard-suite-mandated tightening, both covered by the adversarial verification which verified the tightened working tree directly - artifact attempt-2-tightened.diff matched 6/6 blob hashes - and re-ran all sealed-invariant suites green) [subagent:spread-cure-transplant-verifier-2026-07-18]
- **spread-cure-union-escape-and-monotone-gate-main**: Ingested evidence from spread-cure-union-escape-and-monotone-gate-2026-07-18T18-41-29-886Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-41-29-886Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: Ingested evidence from spread-cure-union-escape-and-monotone-gate-2026-07-18T18-41-29-886Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-41-29-886Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: First live run with the transplants (18-48-02): FAILED schema admission on replica_operations_in_flight=4 - a DIFFERENT residual from the fixed terminal stall. Forensics rule out escape-caused churn: 27 operation creations total, at most 2 per partition/type, zero failures, all priority-partition spread ops completed cleanly by 18:44:46 with no repeats (the TOCTOU re-block held live). The deadline blocker was ordinary bulk-rebalancing REPLACEs on non-priority tables (service_install_failures, live_queries, code, debug_breakpoints) created 18:47:23-26 inside the admission window - the pre-existing gate-vs-background-activity race family (same day: quiescence_candidate 07:27, control_plane_pressure 09:04, spread-gap 17:40). Retrying for signal per the paired-baseline discipline; clean HEAD failed earlier phases all day. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T18-48-02-439Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: Live validation of the transplant surface: run 19-03-43 PASSED schema admission through the monotone stability gate (stableElapsedMs 65079, two confirmations) with the union escape active - the quest's live-visible surface (admission gate + priority spread cure path) exercised without regression. The run's terminal FAIL is 'service replicas were not initially placed' (runtime service deployment), which is PRE-EXISTING: identical signature on clean HEAD run 06-51-59 the same day, before any of this quest's changes. Combined live evidence: 18-48-02 (no escape-caused churn, TOCTOU re-block held, priority partitions settled cleanly), 19-03-43 (admission passes through the transplanted gate). The demo's rotating residual catalogue for the fence lineage now spans: quiescence_candidate (07:27), control_plane_pressure (09:04), initial placement (06:51, 19:03), formation timeout (10:46, 15:01, baseline 17:35), spread-gap terminal stall (17:40 - FIXED by this quest), in-flight drain race (18:48). [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T19-03-43-610Z.report.json]
- **spread-cure-union-escape-and-monotone-gate-main**: Ingested evidence from spread-cure-union-escape-and-monotone-gate-2026-07-18T18-41-29-886Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/spread-cure-union-escape-and-monotone-gate-2026-07-18T18-41-29-886Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T18:27:56.806Z | spread-cure-union-escape-and-monotone-gate-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/spread-cure-union-escape-and-monotone-gate/attempt-1.diff |
