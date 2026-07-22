# Solve report: movielens-parallel-reduce-result-chronology

**Goal:** The unchanged live MovieLens affinity scenario passes three consecutive fresh runs with a runtime-owner-published result-to-partial snapshot witness that remains valid while later periodic partial snapshots continue.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 7

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-parallel-reduce-result-chronology-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: observation_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json
- Selected theory: theory-20260722-result-phase-evidence-retention
- Next move: continue supervised step for movielens-parallel-reduce-result-chronology-main
- No longer current: PASS

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 8
- Change bytes: 66783
- Owner areas: examples, src/runtime, test/runtime
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: examples, src/runtime, test/runtime
- Split plan:
  - examples: 3 file(s)
  - test/runtime: 3 file(s)
  - src/runtime: 2 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-parallel-reduce-result-chronology-main** [solved] rung 3, attempts 7, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **movielens-parallel-reduce-result-chronology-main**: inherited from movielens-three-way-affinity-demo: At checkpoint 719020ce the changed five-node milestone formed the cluster and the explicit closed-world REPLACE cohort engaged: replace-op-e1ef completed target activation and source removal, then left the authoritative ledger. The run still failed the sealed 180000ms pre-schema gate with two later priority-partition REPLACE rows in flight. The canonical publication had reported prioritySpreadPending=false continuously since 08:02:51Z, but partition rebalancer owners created replica_operations work at 08:04:39Z and sql_transaction_participants/sql_write_operations work at 08:05:07Z and 08:05:24Z. Report sha256=68f2edfc45c2bb9963f3e8b8e1f99eb41998a7ba701cda93399c17b584b73855; comparison sha256=6c791c2ef7b0f4c11e840351ca642bba5087d70bd3858edd4783f2a04cf1dbb3; immutable archive sha256=9b2835878e44db6120a15e19be29cf78ce916b2058e3c4377a2518dbcaf53913. No unchanged live rerun. (rules out: Treating the closed-world target bootstrap cohort as dormant or still blocked; attributing post-08:05:29Z shutdown connection errors as the cause; extending the sealed deadline or weakening quiescence.) [data/examples/service-data-affinity-demo-archive/wave4-live-replace-bootstrap-cohort-authority-2026-07-16T08-05-44-727Z.tar.gz]
- **movielens-parallel-reduce-result-chronology-main**: inherited from movielens-three-way-affinity-demo: Changed Wave4 engaged the terminal-hold repair twice: ledger self-move replace-op-691efb46c505c2053b80785456cab438 reached authoritative Operation completed at 12:20:58.605, the next ledger self-move replace-op-e1ef0ada4127812f28bfef5a314c48df reached authoritative Operation completed at 12:21:53.865, and the first dependent batch operation was created only at 12:21:54.081 (216ms later). The sealed run failed earlier than preload on a distinct cache_stale_watermark snapshot-observation blocker with totalSpreadGap=0, so the ledger lifecycle defect did not recur. Report sha256=2f3a3a7faff6afa97d1988b2961e3c4eea0e36383279cde3541bfd5ce95b51fd; immutable archive sha256=7f27943debfd6b59eaa919d35165d7c0ff37c32f4e113dbd8b577cbd1d11d74c. (rules out: Rules out premature terminal-hold release as the blocker in this run; do not widen timeouts or alter the live scenario.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: The sealed live symptom reproduces on the current source: formation and preload admit, two runtime replicas start, base-service attribution replicates, production-weighted locality is optimal, two current fresh bounded partials exist, and the stored top-10 exactly matches a fresh aggregate over all 100000 ratings; completion remains false only because slot 2's later periodic computed_at overtakes the already-published exact result, so resultFresh is false. (rules out: Do not revisit formation readiness, runtime replica creation, issuing-service identity, attribution publication/replication, placement scoring, result correctness, timeout widening, or freshness removal for this witness.) [solve/changes/movielens-parallel-reduce-result-chronology/live-2026-07-18-chronology-forensics.md]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/sql-query-loop-parallel-reduce-sql.test.js [dt:solve/changes/dt-prove/sql-query-loop-parallel-reduce-sql.test.js-2026-07-18T14-28-33-916Z.json]
- **movielens-parallel-reduce-result-chronology-main**: Fresh committed-source PASS preserves the result chronology witness: resultFresh=true after later partial updates, two current replica identities, two fresh bounded partials, 20 merge candidates, and exact top-10 agreement. This is the second measuring PASS in the current streak; the sealed third consecutive PASS remains unspent evidence debt. (rules out: Do not declare the three-run chronology bar closed and do not spend another unchanged live run solely to complete the streak.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T08-33-52-292Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: Independent verifier approves the source attempt only: the exact six-path patch applies cleanly to recorded base 23c7244530f03b99ee8dcba2eb35db4524335b81 and reverses cleanly from the current workspace; the red-on-revert artifact is fix=0/revert=1/restore=0; an independent real-SQL rerun passed 13 assertions. The fresh live PASS exercises non-retroactive chronology (current slot computedAt is later than both witnessed and result computedAt). This is not terminal approval: the sealed three-consecutive-live-PASS predicate remains false. [subagent:movielens_remaining_verifier]
- **movielens-parallel-reduce-result-chronology-main**: Independent verifier approves the exact aggregate source fingerprint. The base-23c7244530f03b99ee8dcba2eb35db4524335b81-to-current-HEAD full-index binary diff over all six sealed attempt paths reproduces sha256:e8a14d66e3c20a2757f4b28c049e02819fba37545b25762ec8ebc6947a2281c0. Five paths are byte-identical to attempt-1 applied state; run-affinity-demo.js differs only by compatible later committed host-scheduling evidence and ADMIN_WS_PORT naming changes. Chronology, wiring, host-scheduling, config, environment-entrypoint, and cluster-lifecycle checks passed 249 assertions; targeted ESLint and diff-check pass. This approval is source aggregate only; the Quest remains open for the sealed third consecutive live PASS. [subagent:movielens_remaining_verifier]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification rejected the exact chronology attempt: its snapshot availability/invalidity contract encodes runtime and diagnostic state with null in both the demo observer and runtime owner, violating the no-state-nulls owner contract; a bare approval of the later aggregate cannot supersede the attempt. [subagent:verify_chronology_current]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/sql-query-loop-parallel-reduce-sql.test.js [dt:solve/changes/dt-prove/sql-query-loop-parallel-reduce-sql.test.js-2026-07-22T09-54-10-865Z.json]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/movielens-affinity-demo-wiring.test.js [dt:solve/changes/dt-prove/movielens-affinity-demo-wiring.test.js-2026-07-22T09-54-17-308Z.json]
- **movielens-parallel-reduce-result-chronology-main**: The 2026-07-22 live FAIL does not reproduce the chronology defect: the sealed result is downstream of both witnessed partials. Completion stays false because a completed runtime-service REPLACE left its replace-replica target loop running; a later canonical ADD started r3 on the same node, so slot/result identity names the temporary target while placement names r3. (rules out: Do not weaken result chronology or identity equality, widen the stall timeout, or spend another unchanged live run; route the temporary REPLACE target lifecycle leak to its runtime-service owner.) [solve/changes/movielens-parallel-reduce-result-chronology/live-2026-07-22-replace-identity-forensics.md]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification rejected attempt-2: parseResultSnapshotWitness adds two independent semantic invalid-state returns; the diagnostic summary accepts '{}' while the runtime owner rejects it, creating a second snapshot grammar; state plus valid redundantly aliases availability; and the targeted test has an ESLint indentation error. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: The demo_result_produced regression label is explained, not accepted as a product regression: the failure report omits result after the observer throws, while the stopped authoritative result row contains the exact correct top-10 and a chronologically valid two-slot witness. Completion failed on the leaked runtime-service REPLACE target identity, which is outside this Quest's owner boundary. (rules out: Do not weaken or remove demo_result_produced; the next fresh measuring sample must still restore it before terminal closure.) [solve/changes/movielens-parallel-reduce-result-chronology/live-2026-07-22-replace-identity-forensics.md]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/sql-query-loop-parallel-reduce-sql.test.js [dt:solve/changes/dt-prove/sql-query-loop-parallel-reduce-sql.test.js-2026-07-22T10-04-39-862Z.json]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/movielens-affinity-demo-wiring.test.js [dt:solve/changes/dt-prove/movielens-affinity-demo-wiring.test.js-2026-07-22T10-04-45-792Z.json]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification approves exact attempt-3: the same-base six-path aggregate reproduces 504f4964, supersedes both rejected attempts, exports one available/invalid/unavailable owner grammar reused by resultFresh and summarizePhase, introduces no redundant validity alias, and passes decision-boundary, ESLint, runtime-grammar, boundary-mode, six focused suites (331 assertions), fresh 0/1/0 revert proofs, complexity, diff, Quest lint, and file-size checks. This approves source integrity only; live closure remains open on the out-of-scope REPLACE leak. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/movielens-live-report-partial-evidence.test.js [dt:solve/changes/dt-prove/movielens-live-report-partial-evidence.test.js-2026-07-22T10-23-14-452Z.json]
- **movielens-parallel-reduce-result-chronology-main**: The fresh 10:20 live run restored the underlying result witness continuously—two partial replicas, 20 merge candidates, and exact top-10 correctness—but the failure-report boundary erased it by serializing result:null after the independent affinity-placement stall. The report owner now retains the last observed result in phase evidence; the next fresh sample must demonstrate that restoration in the sealed report. (rules out: Do not treat the placement failure as chronology failure or waive demo_result_produced; require the next fresh report to contain the observed result.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-20-20-873Z.report.json]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification rejected exact attempt-4: unconditional per-poll result retention lets unavailable reads falsely satisfy demo_result_produced and overwrite earlier exact evidence, the focused test does not replay never-produced or valid-to-absent behavior, the live PASS bypasses the fallback, and report-builder complexity increased from 31 to 34. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/movielens-live-report-partial-evidence.test.js [dt:solve/changes/dt-prove/movielens-live-report-partial-evidence.test.js-2026-07-22T10-42-07-295Z.json]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification rejected exact attempt-5 on proof integrity only: the DT revert fails during ESM linking because the base runner lacks the new named retainObservedDemoResult export, so red occurs before behavioral assertions; the durable test also lacks valid-to-older replay coverage. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: DT red-on-revert proven for test/runtime/movielens-live-report-partial-evidence.test.js [dt:solve/changes/dt-prove/movielens-live-report-partial-evidence.test.js-2026-07-22T10-57-35-970Z.json]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification approved exact attempt-6: exact apply/reverse identity; behavioral revert reaches valid-retention, monotonic-older, and report-fallback assertions without ESM failure; never-produced remains absent; 0/1/0 proof, 343 assertions, strict metrics, audits, explicit snapshot grammar, and fresh live metric-zero PASS all hold. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification approved the canonical five-path aggregate from base 23c72445: exact fingerprint 55e31687, compatible attempt lineage, 343 assertions, behavioral 0/1/0 proof, strict metrics and audits, and fresh metric-zero live evidence; this is aggregate source approval only, not terminal closure. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification rejects attempt-3 for current checkpoint landability, not historical function: its approved six-path payload 504f4964 no longer equals its live same-base delta e61afc6f after later compatible report-retention work; require the canonical same-base eight-path superset 6bc9a356. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification approved exact attempt-7: canonical eight-path same-base delta 6bc9a356, forward/reverse identity, complete rejected-attempt-3 superset, 343 assertions, concurrency/timer lifecycle checks, strict audits, behavioral 0/1/0 proof, and fresh metric-zero live evidence. [subagent:verify_chronology_attempt2]
- **movielens-parallel-reduce-result-chronology-main**: Independent verification confirms attempt-7 preserves the already-approved canonical five-path aggregate unchanged at 55e31687; this is aggregate source approval only, not terminal closure. [subagent:verify_chronology_attempt2]

## Theories
- **theory-20260722-live-result-failure-retention** [active] system, mechanism The observer owns the latest result state, but the terminal catch passes null and the report reads only the terminal return value., owner service-data-affinity demo report owner, modelGate npm run model:contracts
- **theory-20260722-result-phase-evidence-retention** [supported] frontier, frontier movielens-parallel-reduce-result-chronology-main, layer observation, mechanism Persist each owner-parsed result observation into the existing phase-evidence accumulator before evaluating later placement convergence., owner service-data-affinity demo report owner, boundary observer-to-live-report handoff, modelGate npm run model:contracts

## Selected Theories
- **movielens-parallel-reduce-result-chronology-main**: theory-20260722-result-phase-evidence-retention

## Theory Results
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=done, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-34-26-277Z.report.json]
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=done, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json]
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=done, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json]
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=fresh live metric-zero PASS retained exact current fresh bounded chronology evidence, theory=behavioral proof and exact verifier approval confirm monotonic result retention without false production, movement=narrowed) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json]
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json]
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json]
- **theory-20260722-result-phase-evidence-retention**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T10-52-52-585Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T14:34:25.234Z | movielens-parallel-reduce-result-chronology-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-1.diff |
| 2026-07-22T09:55:17.938Z | movielens-parallel-reduce-result-chronology-main | local-fix | 1 -> 1 | flat | unknown |  | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-2.diff |
| 2026-07-22T10:04:19.377Z | movielens-parallel-reduce-result-chronology-main | widen-scope | 1 -> 1 | flat | unknown |  | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-3.diff |
| 2026-07-22T10:35:08.352Z | movielens-parallel-reduce-result-chronology-main | model | 1 -> 0 | progress | same | theory-20260722-result-phase-evidence-retention | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-4.diff |
| 2026-07-22T10:53:01.262Z | movielens-parallel-reduce-result-chronology-main | model | 0 -> 0 | flat | same | theory-20260722-result-phase-evidence-retention | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-5.diff |
| 2026-07-22T10:57:50.672Z | movielens-parallel-reduce-result-chronology-main | model | 0 -> 0 | flat | same | theory-20260722-result-phase-evidence-retention | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-6.diff |
| 2026-07-22T11:09:46.092Z | movielens-parallel-reduce-result-chronology-main | model | 0 -> 0 | flat | solved | theory-20260722-result-phase-evidence-retention | diff:solve/changes/movielens-parallel-reduce-result-chronology/attempt-7.diff |
