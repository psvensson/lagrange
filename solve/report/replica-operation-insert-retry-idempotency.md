# Solve report: replica-operation-insert-retry-idempotency

**Goal:** A replica-operation INSERT whose first attempt landed but whose outcome was lost (post-apply delivery failure, transport hiccup, coordinator retry) converges to already-applied SUCCESS instead of failing the operation: the retry's 'UNIQUE constraint failed: replica_operations.operation_id' collision — the strongest possible already-applied witness, since operation ids are minted once — is recognized (classification or INSERT OR IGNORE via the gateway's EXISTING ignoreExisting option, plus read-back verification through the EXISTING recoverPersistedReplicaOperationMutation machinery made reachable for this error class), so formation-time control-plane churn no longer kills rebalancer moves and client CREATE TABLE/load with 'Distributed operation failed due to participant failures' (affinity-demo runs 16-17, 2/2 modal: 379 UNIQUE warns, 36 fatal, load aborts seconds into phase 2). Proven by a deterministic red-on-revert reproduction (insert lands, outcome lost, retry collides, op still reports success and the row is intact) with no weakening of genuine-duplicate detection for DIFFERING row content under the same id.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/replica-operation-insert-retry-idempotency-2026-07-04T11-57-37-702Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: replica-operation-insert-retry-idempotency-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for replica-operation-insert-retry-idempotency-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 6
- Owner areas: scripts/run-replica-operation-idempotency-scenarios.js, src/partition, src/rebalancer, test/partition, test/rebalancer
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: scripts/run-replica-operation-idempotency-scenarios.js, src/partition, src/rebalancer, test/partition, test/rebalancer
- Split plan:
  - src/rebalancer: 2 file(s)
  - scripts/run-replica-operation-idempotency-scenarios.js: 1 file(s)
  - src/partition: 1 file(s)
  - test/partition: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **replica-operation-insert-retry-idempotency-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **replica-operation-insert-retry-idempotency-main**: Founding forensics (affinity-demo runs 16-17 post write-routing-fix, 2/2 reproducible): freeze class ELIMINATED (ops complete, CAS guard-refresh engaged 12-13x live, zero false rejections from the new stale-topology write guard) — demo now fails FAST in phase 2 with 'Distributed operation failed due to participant failures'. Modal signature: UNIQUE constraint failed: replica_operations.operation_id (379 warns + 36 level-50 in run 17; run 16 additionally had a non-modal 'Transaction already active' race, 0 occurrences run 17). Mechanism: op-row INSERT lands, outcome lost (post-apply delivery failure now HONESTLY surfaced by the f870f7a0 envelope fix instead of silently acked), coalesced-mutation layer blindly re-INSERTs up to 6x, every retry collides UNIQUE, wrapped as DISTRIBUTED_PARTICIPANT_FAILURE, op fails, rebalancer moves + client CREATE TABLE die. Code facts: 'UNIQUE constraint failed' appears in NO retryable classification (RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS = [NO_HANDLER] only, replica-operation-repository.js:370) and is handled NOWHERE in src/; the gateway ALREADY supports ignoreExisting -> INSERT OR IGNORE (cdc-integration-service-mutation-operations.js:244) but only dynamic-config-service.js:164 uses it; recoverPersistedReplicaOperationMutation (mutation-persistence-methods.js:330) is the designed already-applied read-back but is gated on isRetryableOperationPersistError AND shouldShortCircuitDeferredMutationRetry AND an OWNER_LOCAL_ONLY read that fails on non-hosting coordinators.
- **replica-operation-insert-retry-idempotency-main**: Adversarial verifier (constraint source-change-subagent-verification, subagent:idempotency-verifier): FAITHFUL with one atomic-commit requirement — the run-18 CDC parser fix (partition-cdc-parameterized-sql.js regex now accepts OR IGNORE; previously OR-IGNORE inserts fell to literal parsing and emitted CDC events with every column = the string '?' — 3712 errors, read-model garbage) MUST land in the same commit as the rebalancer ignoreExisting change; both are in-tree and dt:proven. Verifier confirmations: (1) replica_operations has exactly ONE uniqueness constraint (operation_id PK; all 7 indexes non-unique) so OR IGNORE cannot absorb a legitimately-different conflicting row; caveat: OR IGNORE also swallows NOT NULL violations -> degraded diagnostics + 5s visibility spin, same hard-failure outcome. (2) changes=0 survives every hop (better-sqlite3 -> routed response -> executeInsert numeric check -> CDC affectedRows -> gateway spread -> extractMutationChangeCount uses ?? not ||) — the null-true leg is only reachable with DEFERRED visibility which is HEAD-identical optimism. (3) all other replica_operations inserters safe: CL-017(b) re-insert routes through persistNewOperationUnlocked (inherits OR-IGNORE); bootstrap handoff inserts mint fresh uuids per attempt; dead constants INSERT_REPLICA_OPERATION + rebalance-coordinator-shared INSERT_OPERATION noted remove-on-contact. (4) no single-flight mixed-variant race (gateway keys differ; CDC-level key family has no mixed writers). (5) createOperation false-path = dedupe re-query then proceed, byte-identical to HEAD; bounded. (6) guard tests 6/6+309/309+3/3 real exit codes. All sibling SQL-prefix parsers already tolerate OR IGNORE (verifier swept).

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-04T11:58:58.546Z | replica-operation-insert-retry-idempotency-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/replica-operation-insert-retry-idempotency/fix.diff |
