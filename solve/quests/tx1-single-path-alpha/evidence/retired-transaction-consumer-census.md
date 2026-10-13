# Retired transaction consumer census

Date: 2026-10-13

This is a read-only diagnosis of the source candidate based on HEAD
`e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f` plus the uncommitted Quest
candidate. It records the correction boundary before any production or test
repair. It does not claim a gate pass or Quest acceptance.

## Deterministic observed failure

The immutable 775 source candidate failed two otherwise-current query retry
witnesses:

- `test/query/query-executor-session-binding-and-build-sql.test.js`: its first
  subtest returned failure after one leader delivery instead of succeeding
  after two deliveries to that leader. The failing assertion took about 39 ms;
  the remaining 66 assertions passed.
- `test/query/query-executor-executeonpartition-no-handler-repair.test.js`: its
  final subtest returned failure after one leader delivery instead of widening
  to `[leader, fallback]`. The failing assertion took about 25 ms; its actual
  no-handler cases passed.

The corresponding predecessor-source controls, with the same frozen tests,
were green on the physical hosts used for their control runs:

- `frozen-v3-red-control-carinas-windows.log`: the session-binding file passed
  68 assertions in 1411 ms.
- `frozen-v3-red-control-adams-gamla.log`: the no-handler-repair file passed 68
  assertions in 1138 ms.

The test files and `src/query/query-executor-write-retry-routing.js` are
byte-identical to the e6 predecessor. The changed input is
`src/partition/partition-service-constants.js`: it no longer defines
`PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE`. The unchanged test
doubles therefore return `{error: undefined}`. The retry classifier correctly
does not classify that shape, so each request stops after its first delivery.
Neither failure reaches the query executor's 30-second deadline or spends a
wait bound. The hosts and broad/focused cohorts differ, so this is strong,
deterministic candidate-integration evidence rather than a same-invocation
performance comparison.

Input hashes before correction:

| Path | SHA-256 |
| --- | --- |
| `src/partition/partition-service-constants.js` | `ebd64606c1216ff57e20e5066095cc9f0e50c80f05799a2c46af5708e28a3338` |
| `src/query/query-executor-write-retry-routing.js` | `ff43ad438ee38d4c1bfa19bfddb18336587a4ca510699f86cd143ee6714d754c` |
| `src/rebalancer/replica-operation-repository.js` | `5670de94cb90ab97ae5fd132e0aae229ce94ef9012387d0af9fdfc46003c8ec2` |
| `src/control-plane/control-plane-error-classification.js` | `728f957b552b18e1ea9536a7d683cec2e10b906019ade3cd91a4fee6fece3ce7` |
| session-binding query test | `8192ea68bf53467d73ba383acec8aa5a62b8fb5592841b770ddef249855fc241` |
| no-handler-repair query test | `6d7a13b63369982e2a274b228ea8cd28cc6db84016a09563bfa44174a4d41f58` |
| rebalancer tail-more test | `1f4073e22468212b0e1474f981ee797606697a2a88bca9d76319d36ee671d06b` |
| public facade integration test | `23ddf4c827c3e0e0e396e755cca2a8cebf154f0a59b3789740f0815c7c33cade` |

## Removed constant fields

The exact `partition-service-constants.js` deletion surface is:

- `PARTITION_SERVICE_DEFAULT.MAX_COMMITTED_WRITE_LOG_ENTRIES`;
- all of `PARTITION_TRANSACTION_PREPARED_STATE`, including `LOCAL_STAGING`;
- SQL fields `CREATE_TRANSACTION_OUTCOME_TABLE`,
  `SELECT_TRANSACTION_OUTCOME`, `UPSERT_TRANSACTION_OUTCOME`,
  `BEGIN_IMMEDIATE`, `SAVEPOINT_PREPARE`, `COMMIT`, and `ROLLBACK`;
- operation fields `BEGIN_TRANSACTION`, `PREPARE_TRANSACTION`, and
  `TRANSACTION_COMMIT`;
- all of `PARTITION_COMMITTED_MARKER_COMMAND_TYPES`;
- committed-command error fields `MARKER_NOT_ADMISSIBLE` and
  `SESSION_MISSING`;
- log fields `TRANSACTION_COMMIT_APPLIED`, `BEGINNING_TRANSACTION`,
  `PREPARING_TRANSACTION`, `PREPARED_STATE_RECONSTRUCTED`,
  `COMMITTING_TRANSACTION`, and `ROLLING_BACK_TRANSACTION`;
- error fields `TRANSACTION_ALREADY_ACTIVE`, `BEGIN_TRANSACTION_FAILED`,
  `PREPARE_CONFLICT`, `NO_ACTIVE_TRANSACTION_PREPARE`, `SNAPSHOT_EXPIRED`,
  `PREPARE_LOST`, `NO_ACTIVE_TRANSACTION_COMMIT`,
  `COMMIT_TRANSACTION_FAILED`, `NO_ACTIVE_TRANSACTION_ROLLBACK`,
  `ROLLBACK_TRANSACTION_FAILED`, `NO_ACTIVE_TRANSACTION`,
  `TRANSACTION_WRITE_FAILED`, and `TRANSACTION_COMMIT_RAFT_FAILED`;
- exports `PARTITION_COMMITTED_MARKER_COMMAND_TYPES` and
  `PARTITION_TRANSACTION_PREPARED_STATE`.

The direct member census across current `src` and `test` execution finds no
current consumer of those names except `TRANSACTION_ALREADY_ACTIVE`. Literal
`PREPARE_TRANSACTION` and `TRANSACTION_COMMIT` values in
`test/partition/committed-statement-outcome.test.js` are deliberate negative
controls: they prove retired marker commands are rejected as unknown. A
`PREPARE_LOST` test comment is descriptive only. Current
`PARTITION_SERVICE_OPERATION.COMMIT` and `.ROLLBACK` are TX1 participant wire
operations and are not part of this deletion. Query-owner
`NO_ACTIVE_TRANSACTION` and query parser `BEGIN_TRANSACTION` occurrences are
separate symbols.

The dynamic-member census finds no computed access to a removed key. The one
computed `PARTITION_COMMITTED_COMMAND_ERROR_CODE[shape.code]` access is a test
iteration over current error shapes.

`scripts/quest-evidence/tx1-historical-before-l6-witness.mjs` still names old
operation members and `leader.preparedTransactions`, but its header pins and
copies the historical 2a21e39 source before executing. The old
`measure-partition-tx1-admission-20261012.py` driver likewise asserts that the
checked-out source tree equals its pinned `34af50e` tree before it replaces
fixtures or mutates the legacy-fence file. Both are reproducibility records
for historical source, not current executable owners, and remain unchanged.

The deleted `src/transaction/transaction-constants.js` exported
`TRANSACTION_SUBSYSTEM`, `TRANSACTION_STATE`, `TRANSACTION_ISOLATION_LEVEL`,
`TRANSACTION_EVENT`, `TRANSACTION_CONFIG_KEY`, `TRANSACTION_DEFAULT`,
`TRANSACTION_LOG_MSG`, `TRANSACTION_ERROR_MSG`, and `TRANSACTION_REASON`.
There is no current import of that module or direct consumer of its removed
members; same-named query/coordinator concepts are independent owners.

## Removed public methods

The deleted legacy PartitionService surface comprised:

- `reconstructPreparedState`, `resolveTransactionPrimaryKeyColumn`,
  `resolveTransactionWriteSetKey`, `trackTransactionWriteSetKey`,
  `checkWriteConflicts`, `getOldestRetainedCommitEpoch`, `isSnapshotExpired`,
  `applySnapshotReadFilter`, `pruneCommittedWriteLog`,
  `collectExpiredPreparedSessions`, `collectExpiredActiveSessions`,
  `runPreparedStateHoldTimeoutSweep`, `isStuckTransactionHealPermitted`,
  `beginTransaction`, `prepareTransaction`, `commitTransaction`,
  `rollbackTransaction`, `isInTransaction`,
  `createTransactionOutcomeTable`, `recordTransactionCommitOutcome`,
  `resolveTransactionCommitOutcome`, `replicateTransactionCommit`,
  `proposeTransactionMarker`, and `replicateTransactionRollback`;
- session alias/state methods `normalizeTransactionSessionId`,
  `resolveActiveTransactionSessionId`, `syncLegacyTransactionAliases`,
  `resolveActiveTransactionState`, `resolvePreparedTransactionSessionId`,
  `resolvePreparedTransactionState`, `resolveOpenTransactionState`, and
  `buildPrepareLostResponse`;
- the standalone `PartitionTransactionHandler` class and its local
  `begin`/`commit`/`rollback`/state methods.

The current tree has no bound runtime consumer of those methods and no import
of the deleted handler. `beginTransaction` and `commitTransaction` text in
readiness planning are unrelated semantic-generation names. Current
`activeTransactions` uses belong to the SQL coordinator, not the removed
PartitionService maps. An inert fixture assignment to removed
`lastPreparedStateReconstructionTerm` in
`test/control-plane/cl-036-local-leader-row-seed.test.js` is exclusive residue
and is removed by this correction; the activation assertion remains.

The former transaction base also held current removal and durability methods.
They were extracted and remain live: `fenceServingAdmissionForRemoval`,
`waitForRemovalServingDrain`, `enforcePreparedStateHoldTimeouts`,
`isSoloReplicaGroup`, `startPreparedStateHoldTimeoutSweep`, and
`stopPreparedStateHoldTimeoutSweep`. Their retention is outside the cleanup.

## Remaining semantic consumers

### Query routing

`src/query/query-executor-write-retry-routing.js:507-516,545-583` is the only
producer of `RETRY_SAME_ADDRESS`. It recognizes only the retired English
session-active error. `src/query/query-executor-shared.js:164-169` declares the
state, and `src/query/query-executor-partition-delivery.js:335-340,530-535`
consume it. The generic `candidateState.requestRetryCurrentAddress()` primitive
is still live for unknown-outcome identity at partition-delivery lines 514 and
569; it must remain.

### Replica-operation persistence

`src/rebalancer/replica-operation-repository.js:352-354` builds a one-element
retry list from the removed constant. The mutation gateway consumes the list,
defines `isOperationMutationPartitionContention` from the same removed value,
uses that predicate to rotate implicit sessions, and adds contention-only
jitter through `this.random`. The constructor's `this.random` is exclusive to
that obsolete jitter branch. Current classifier ownership remains in
`isRetryableControlPlaneError`, `isReroutableWriteFailureCode`, and
`isOperationMutationRouteRepairCandidate`; explicit sessions remain stable,
while implicit sessions rotate for a current route-repair candidate.

### Copied literal

The retired value `Transaction already active on this partition` remains in
one production file:

- `src/control-plane/control-plane-error-classification.js:37`, as a generic
  retryable text fragment.

It remains in these test families:

- `test/control-plane/control-plane-error-classification.test.js`;
- `test/cdc/cdc-integration-service-execute-sql-and-delivery.test.js`;
- `test/control-plane/system-metadata-owner-modules.test.js`;
- `test/control-plane/replica-dispatch-node-state-operation-dispatch-retry-test-cases.js`;
- `test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`;
- `test/query/sql-query-engine-provision-partition-quorum.test.js`;
- `test/rebalancer/storage-reservation-lost-outcome-idempotency.test.js`;
- `test/integration/public-application-database-transaction-facade.integration.test.js`.

The public facade witness is currently misattributed. The current participant
owner refuses a competing BEGIN with failure code
`participant_transaction_already_active` at
`partition-participant-transaction-request.js:306-308`, and builds its message
as `Participant transaction request refused:
participant_transaction_already_active`.
The witness's one-winner/one-refused and loser-left-no-writes safety checks are
current and must remain, but its old English message and untyped-old-engine
explanation are not current evidence.

`No active transaction to commit` is still a query-coordinator error owned by
`src/query/query-constants.js`. Its text match is not removed merely because an
old PartitionService constant once had the same value.

## Proposed atomic correction

1. Remove the query old-constant plumbing, the
   `shouldRetryTransactionActiveWriteOnSameAddress` branch, the
   `RETRY_SAME_ADDRESS` state, and its two delivery arms. Keep unknown-outcome
   same-address redelivery unchanged. Delete the obsolete same-address
   session-contention test. Refit the fallback retry witness to an existing
   typed `CUTOVER_PAUSED`/`deferRetry` partition-write answer, preserving its
   successful widening and exact `[leader, fallback]` deliveries.
2. Remove the rebalancer's one-element retired-message list, contention
   predicate and branch, contention-only jitter, and exclusive `random`
   dependency. Preserve the current typed retry classifier, route-repair
   candidate, explicit-session retention, implicit-session rotation on current
   route-shaped failures, retry identity, delay selection, and local/enclosing
   budgets. Refit old contention tests to actual current typed retry outcomes;
   retain exact attempt, stable/rotated session, original-failure, wait, and
   budget assertions.
3. Remove the retired English phrase from the control-plane classifier. Refit
   copied-literal tests to the existing typed failure-code, `deferRetry`,
   retry-after, transport, or unknown-outcome contracts their owner actually
   consumes. Do not add an alternate phrase predicate.
4. Keep the public facade's current conflict safety witness, but assert the
   actual current participant code/message exposed by the public error and
   correct its description. This is a current owner observation, not a retry
   classifier.

This correction was implemented after independent design and content-boundary
approval. It restores no retired marker, method, compatibility adapter, or
classifier and changes no timeout, retry count, or wait budget. The retired
English phrase remains only in one explicit negative classifier witness: text
alone must not grant retry. A normal delivered response now passes its existing
`failureCode` into the existing classifier; one reached code-only `NOT_LEADER`
case uses generic nonretryable text and no defer marker, while the same test
keeps a full `CUTOVER_PAUSED` positive.

The correction also removes one inert test assignment to deleted
`lastPreparedStateReconstructionTerm`, updates two comments that still named
the retired L6 owner, and removes exactly eight guideline allowances belonging
to deleted files. Historical pinned-source evidence drivers remain unchanged.

Validation at freeze:

- `node --check` passed for every changed JavaScript source and test;
- targeted ESLint passed for every normally included changed file and for the
  normally ignored changed `tail-more` module with `--no-ignore`;
- `git diff --check` passed;
- the three baseline JSON files parse and their counts decreased exactly
  `810 -> 806`, `1287 -> 1286`, and `97 -> 94`;
- the full literals audit remained red on 318 broader candidate findings, so
  no guideline-gate green is claimed; its first failing leg stopped the chained
  decision-boundary and silent-catch commands;
- no test was executed locally, per the locked-lab handoff boundary.
