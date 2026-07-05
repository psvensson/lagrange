# Solve report: ledger-participant-transaction-zombie-lifecycle

**Goal:** An ACTIVE distributed-transaction participant hold on a raft partition never outlives its legal window, and healing it never destroys committed raft entries: in run-23 a participant-level BEGIN IMMEDIATE on the operation-ledger leader (tx-303af027:REMOVED:attempt1, delivered 08:02:59.119) was orphaned when the 2PC coordinator committed with an EMPTY participant set (executeParticipantStage silently skips missing participants, durable-workflow-coordinator.js:409-413, after recoverFromSystemTables replaced the live in-memory transaction with a cache-derived copy whose participants Map was rebuilt from CDC-lagging rows, distributed-transaction-recovery.js:431-496) — the open transaction then absorbed every later write on the connection (sessionless writes silently adopted via resolveActiveTransactionSessionId(null), partition-service-transaction-session-methods.js:26-37) making the whole ledger non-durable in silence. The fix bounds the ACTIVE participant hold (extend the existing prepared-state sweep, enforcePreparedStateHoldTimeouts / partition-service-transaction-base.js:272-313, to ACTIVE transactions at the same 60s legal-hold bound) with the heal GATED ON ROLE: a FOLLOWER (or post-step-down replica) rolls back crash-equivalently; a LEADER must NEVER bare-ROLLBACK (it re-mints acked indices and followers truncate committed entries without a committedIndex guard — the leadership-fitness quest's demotion is the prerequisite); plus the enabling-defect guards: 2PC never commits against an empty participant set it previously enlisted, recovery never replaces a live in-memory transaction's participant registry with a staler cache view, the rollback catch path never skips db.exec(ROLLBACK) while deleting bookkeeping (transaction-base.js:638-651), and sessionless absorption into a foreign transaction is removed or made explicit. Proven FIRST by deterministic in-process reproductions (abandoned participant BEGIN swept within the bound on a follower; leader defers to demotion; empty-set-commit and recovery-clobber guards red-on-revert), then by the live affinity demo.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/ledger-participant-transaction-zombie-lifecycle-2026-07-05T11-12-23-083Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: ledger-participant-transaction-zombie-lifecycle-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for ledger-participant-transaction-zombie-lifecycle-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 11
- Owner areas: scripts/run-ledger-participant-transaction-zombie-lifecycle-scenarios.js, src/partition, src/query, src/raft, src/workflow, test/convergence
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 6 owner areas: scripts/run-ledger-participant-transaction-zombie-lifecycle-scenarios.js, src/partition, src/query, src/raft, src/workflow, test/convergence
- Split plan:
  - src/partition: 4 file(s)
  - src/workflow: 2 file(s)
  - test/convergence: 2 file(s)
  - scripts/run-ledger-participant-transaction-zombie-lifecycle-scenarios.js: 1 file(s)
  - src/query: 1 file(s)
  - src/raft: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **ledger-participant-transaction-zombie-lifecycle-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **ledger-participant-transaction-zombie-lifecycle-main**: DESIGN VET + IMPLEMENTATION + SOURCE-CHANGE SUBAGENT VERIFICATION (both constraints satisfied; design vet vet-zombie-lifecycle-design.md AMEND->GO with Z1/Z2 critical amendments; implementation verifier verify-zombie-lifecycle-implementation.md verdict SHIP; both docs in the quest changes dir). REUSED vs EXTENDED vs NEW: REUSED — the existing prepared-state sweep function + its 1s timer and 60s bound (ACTIVE holds now collected by the same sweep), the landed leader-durability-fitness demotion as the leader-side heal prerequisite, isSingleReplica's solo predicate family (replicaIds + joined-peer conjunct), the existing recover() restart-restore semantics; EXTENDED — executeParticipantStage (empty-registry + requested-key-missing guards over a new monotonic enlistedParticipantCount witness), recover() (skip-LIVE clobber guards on all four seams: workflow replace, participant overwrite, recoveredTransactionIds enrollment, writeOperations duplication — via a restoredWorkflowIds return), rollbackTransaction's catch (role-gated ROLLBACK attempt; keeps the session REGISTERED when it cannot run — the stranded-invisible-tx source), the sqlite-log-adapter cache (refreshCommittedIndexCacheFromStore un-strands the CL-018 monotonic clamp post-heal); NEW — zero new src files. CRITICAL DESIGN AMENDMENTS IMPLEMENTED: Z1 — a swept rollback is NOT crash-equivalent for JS memory: the apply-dedup set and the adapter committed-index cache survive it and would make post-heal catch-up skip re-execution and clamp the durable watermark forever — both cleared/re-anchored in the heal; Z2 — the role gate blocks LEADER AND CANDIDATE (solicited votes reference the phantom in-memory head) with the SOLO carve-out (no follower exists to truncate; demotion impossible; the pinned solo property test stays green); the pre-existing prepared-path bare ROLLBACK now rides the same gate (it was leader-unsafe TODAY). Absorption: the single-foreign-session adoption arms removed (active + prepared resolvers); DEFAULT-session adoption kept (pinned by the ACID suite); verifier proved sessionless commit/rollback semantics identical pre/post (they normalize null->default before resolving — the adoption arm was only reachable via raw-null executeQuery and prepareTransaction(null), both now honest). VERIFIER CRITICAL CHECK CLEARED: no false abort — an empty options.participantKeys falls back to the full registry (pre-existing), so idempotent stage replays are shielded; the guard fires only when the REGISTRY is empty while enlistment happened = exactly the run-23 lost-enlistment state; post-restart the count is 0 and rows restore the registry (guard inert, correct). RESIDUALS RECORDED (all LOW): joining-LEARNER phantom-campaign window (degenerates to vet-accepted solo crash-equivalence), sweep exec-failure falls through to bookkeeping deletion (pre-existing shape; Z4 symmetry follow-up), optional raft-state belt in the gate, Z1 end-to-end re-delivery assertion at unit level only. PROOF: DT dt6-zombie-transaction-lifecycle 22/22 + both quests' DTs together 43/43; dt:prove red-on-revert across 8 src files (artifact dt6-zombie-transaction-lifecycle.test.js-2026-07-05T10-54-23-231Z.json); regressions partition/transaction/query/workflow 6193 + rebalancer/convergence/raft/node 8115 green (three distinct parallel-load flakes of timing/property tests, each green standalone and on batch rerun — two-strikes watch); pinned suites explicitly re-run by the verifier (solo prepared-sweep pin, routing pin, ACID, 717 raft); complexity ratchet and lint green locally; scenario-harness 3x PASS.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-05T11:13:07.374Z | ledger-participant-transaction-zombie-lifecycle-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/ledger-participant-transaction-zombie-lifecycle/fix-zombie-transaction-lifecycle.diff |
