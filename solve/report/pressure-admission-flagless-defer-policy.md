# Solve report: pressure-admission-flagless-defer-policy

**Goal:** The pressure governor's admission decision derives only from work class and measured pressure state: per-request allowPressureDegrade and allowPressureDefer are no longer consulted, non-critical work under transport backpressure is deferred with a retryAfterMs pacing hint instead of degraded or rejected, critical and readiness reserve semantics are unchanged, both gateway pressure contracts collapse to one flagless builder, and the live scenario still reaches schema admission.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json

**Attempts:** 2

## Links
- spec: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 18
- Change bytes: 124293
- Owner areas: scripts/run-pressure-admission-flagless-defer-policy-scenarios.js, src/control-plane, test/control-plane, test/raft
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (18 files)
- Action: land or separate 4 owner areas: scripts/run-pressure-admission-flagless-defer-policy-scenarios.js, src/control-plane, test/control-plane, test/raft
- Split plan:
  - src/control-plane: 11 file(s)
  - test/control-plane: 5 file(s)
  - scripts/run-pressure-admission-flagless-defer-policy-scenarios.js: 1 file(s)
  - test/raft: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **pressure-admission-flagless-defer-policy-main** [solved] rung 2, attempts 2, metric 0 -> 0

## Findings
- **pressure-admission-flagless-defer-policy-main**: Attempt 1 (flagless always-DEFER with 250ms default pacing hint, industry APF/CRDB shape) FALSIFIED by live evidence: cold-formation joins slowed ~9x (joiners completed at t+313s vs ~t+35s on passing runs), blowing the 180s active-nodes budget (run 2026-07-18T15-01). Mechanism: formation is a thundering-herd phase where the previous immediate-retryable DEGRADE failure let tight caller retry loops push through flickering backpressure; fixed-hint defer pacing serialized them. Unit evidence (1074 tests) passed while live formation failed - the policy needs formation-aware admission (true queueing with priority, or a formation-phase exemption), not a fixed pacing hint. Change reverted to committed bytes; quest remains open for a queue-based or phase-aware design. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T15-01-07-367Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: Attempt-2 live wedge root-caused to a masked deterministic bug, not the admission design: schema derivation stored string column defaults UNQUOTED (defaultValue: col.defaultValue?.value) while every DDL re-emitter interpolates the stored literal verbatim, so DEFAULT '{}' round-tripped as DEFAULT {} and EVERY first replica-provisioning attempt failed with SqliteError (unrecognized token '{') followed by a 15s redrive. Demo step 1 (15s client budget) could only ever pass through the deferred_by_pressure early-completion accident: under startup churn, pressure-degraded reads short-circuited the completion wait (~14.7s response on HEAD under load). The flagless admission queue parks those reads through the flicker so they SUCCEED, removing the accidental early-out and exposing the bug as a hard step-1 timeout (2x repro). Isolated step-1 repro: HEAD 30.0s, change 30.2s (identical - queue adds no latency), change+quoting-fix 1.4s with zero SQL errors. Quoting fix: derivation now stores SQL literals (quoted/escaped strings, bare numerics/booleans) matching the system-table schema convention already expected by CDC default materialization; guard test added (test/query/table-creation-service.test.js round-trip). Control: clean-HEAD full demo run TODAY fails at step 2 (active-nodes 180s timeout) - the live gate is flaky on HEAD under current machine conditions; paired baseline runs are required context for any live verdict. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T16-21-20-598Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: Live validation of attempt 2 (flagless table + derived pacing + admit-on-capacity queue + DDL default-literal fix): full run-affinity-demo run 2026-07-18T16-43-20 PASSED schema bootstrap (step 1 in seconds, zero SqliteErrors), cluster formation (5 nodes; clean-HEAD control run FAILED formation at 180s the same hour), and PRODUCTION SCHEMA ADMISSION (state=quiescent) - satisfying the quest statement's live clause - then loaded 100k ratings, spread partitions, ran Lagrange distributed SQL, and deployed the affinity service (top10Correct=true throughout). The run's terminal FAIL is the learned-affinity attribution stall (attributionRows=0 for 300s), which is PRE-EXISTING: identical failure signature on clean HEAD runs 2026-07-18T11-02-34 and 11-19-30 before any of this quest's changes; attribution rows for svc-movielens-topn DID land (published_at 16:42:13, verified in service_partition_access-p1-r1.db) but the first access window only opened 4.7min after service deploy - that residual belongs to the formation-joining-ready-phase-fence-live lineage, not to admission policy. No admission-related slowdown observed: joins completed within formation budget (contrast attempt 1's 9x slowdown). [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T16-43-20-162Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T15-48-43-022Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T15-48-43-022Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: independent verification passed: full-tree adversarial verification APPROVED the flagless admission cutover (attempt 2 core content) with no refutations; verdict archived at solve/artifacts/pressure-admission-flagless-defer-policy/verifier-approval-2026-07-18.md [subagent:flagless-admission-full-tree-verifier-2026-07-18]
- **pressure-admission-flagless-defer-policy-main**: independent verification passed: focused adversarial re-verification APPROVED attempt 3 (the poll-robustness hardening) - all four correctness claims verified live (no uncaught escape, unconditional re-arm, deadline guarantee under a forever-throwing sensor, healthy path byte-equivalent), attempt-3.diff exact against the working tree (18/18 blob match), suites 73/73 and guard scenario 5/5 green [subagent:flagless-admission-hardening-verifier-2026-07-18]
- **pressure-admission-flagless-defer-policy-main**: independent verification passed (aggregate: the quest's cumulative change is attempt 3, which supersedes attempt 2's identical core content plus the verified hardening; both were independently APPROVED - full-tree verdict archived at solve/artifacts/pressure-admission-flagless-defer-policy/verifier-approval-2026-07-18.md, focused re-verification confirmed the attempt-3 diff exact and all suites green) [subagent:flagless-admission-hardening-verifier-2026-07-18]
- **pressure-admission-flagless-defer-policy-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json]
- **pressure-admission-flagless-defer-policy-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T16:47:44.519Z | pressure-admission-flagless-defer-policy-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/pressure-admission-flagless-defer-policy/attempt-2.diff |
| 2026-07-18T16:57:12.137Z | pressure-admission-flagless-defer-policy-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/pressure-admission-flagless-defer-policy/attempt-3.diff |
