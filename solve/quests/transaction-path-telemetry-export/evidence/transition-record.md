# Transition record: transaction-path-telemetry-export

Stage-1 draft, unsealed. Base `ab347e9625a64ed24b7700b8f958bd54d8e3db06`. Rule set
`docs/steering/rules.md` (last_reviewed 2026-11-26). Loaded: `CLAUDE.md`, `rules.md`,
`router.md`, `solver-quests.md`, `test/guidelines/INDEX.md`, `fixtures.md`, the coordination
briefs `00-context.md`, `01-implementer-rules.md`, `tb-telemetry-export.md`, the design record
`reports/o1-observability-export-design.md` and `reports/lead-rulings.md` (rulings 1-9 win
over the design). Every `path:line` is at `ab347e962`. [V] = read in code or measured;
[I] = inferred. The open decisions at the end are ruled before dependent implementation.

## 0. Red baseline (N3) and the design's red reasons

Run on the unchanged source tree plus the stage-1 files, through the shared lock. Outputs
in the coordination dir `lab/tb-telemetry-export-stage1/`.

| Property | Failure text on the unchanged tree [V] |
|---|---|
| W1 route | `GET /api/admin/diagnostics/transactions?sinceSequence=0 answered HTTP 404: the route is not registered` |
| W2 accounting | same 404, reached after the PG-wire COMMIT and ROLLBACK blocks completed |
| W3 reads | same 404, reached after two transactional reads reached the participant |
| W4 FIFO wait | same 404, reached after BEGIN waited behind the RECOVERY re-drive |
| W7 window | `src/diagnostics/transaction-telemetry-collection.js does not exist: collectTransactionTelemetry, the observation catalogue, the answer validator and the window derivation are not implemented` |
| W8 collection | same module absence |
| W9 coverage | same module absence |
| N1 overrun rejected | same module absence |
| N2 undriven entry rejected | same module absence |

- `node scripts/checks/transaction-path-telemetry-export-guard.js --metric` with
  `LAGRANGE_PROBE=1`: **9**, exit 1, 1.1 s, clean exit (`guard-metric-unchanged-tree.txt`,
  `guard-json-unchanged-tree.json`). [V]
- `node --test test/diagnostics/transaction-telemetry-export.test.js`: 9 tests, 0 pass,
  9 fail (`witnesses-unchanged-tree.tap`). [V]
- Every scenario's preconditions hold on the unchanged tree: a scratch copy of the witness
  module whose export read throws a sentinel reaches that sentinel in W2 (both
  transactions), W3, W4, W7 and N1 (`witness-preconditions-unchanged-tree.tap`, 6/6). So
  each witness is red at the export, not at its fixture. [V]
- The design's named causes, measured through the existing breakdown on the same PG-wire
  path (`design-reasons-unchanged-tree.tap`) [V]:
  - rolled-back transaction: retained `rollbackPhaseMs` = **0** while its participant
    ROLLBACK fan-out took **8.23 ms** (accrual at `distributed-transaction-decision-protocol.js:606-608`
    after `endTransaction` at `:604`);
  - committed transaction with one write and one in-transaction read: retained
    `statementCount` = **1** (`distributed-transaction-statement.js:229-250` neither times nor
    counts reads).

## 1. Producer and consumer symbols

### New producers

- `src/diagnostics/telemetry-histogram.js`: `TELEMETRY_HISTOGRAM_BUCKET_COUNT` (23),
  `TELEMETRY_HISTOGRAM_BUCKET_UPPER_BOUNDS_US` (2^k us, k = 4..25), `createTelemetryHistogram`,
  `recordTelemetryHistogram(histogram, ms)` (`Math.clz32`, no allocation),
  `snapshotTelemetryHistogram`, `subtractTelemetryHistogramSnapshots(later, earlier)`, and the
  one telemetry clock read (today's `resolveNowMs`, `distributed-transaction-telemetry.js:59-61`,
  moves here, R06).
- `src/diagnostics/transaction-telemetry-collection.js`: `TRANSACTION_TELEMETRY_SCHEMA_VERSION`,
  `TRANSACTION_TELEMETRY_CATALOGUE`, the availability, node-state and window-state names,
  `validateTransactionTelemetryAnswer(answer) -> {valid, reason}`,
  `deriveTransactionTelemetryWindow(earlier, later)`, and
  `collectTransactionTelemetry({nodes: [{nodeId, adminUrl, sinceSequence}], deadlineMs, fetchAnswer})`.
  `fetchAnswer({nodeId, url, signal}) -> Promise<{status, body}>` is injected; the function
  builds `url` from `ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS` and the cursor.
- Coordinator section owner `src/query/distributed/distributed-transaction-telemetry.js`:
  operation kinds, COMMIT sub-phase names, participant request operations and outcomes,
  `SAMPLE_RING_CAPACITY = 512`, `MAX_OPERATIONS_PER_SAMPLE = 64`, and one synchronous read
  `transactionCoordinator.readTransactionTelemetrySection({sinceSequence})`.
- Admin: `ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS = '/api/admin/diagnostics/transactions'`
  (`admin-constants.js:9-37`), registered in `registerRoutes` (`admin-websocket-api-base.js:397-539`),
  handler in `admin-websocket-diagnostics-route-methods.js`, answer built by new
  `src/admin/admin-transaction-telemetry-answer.js` from `this.sqlQueryEngine.transactionCoordinator`
  and `this.bootIncarnation` (`admin-websocket-api-base.js:143-144`), read at request time.

### Changed producers (observation points)

| Boundary | Site [V] | Change |
|---|---|---|
| B2 FIFO wait, B4 run time | `runTransactionOperation` (`distributed-transaction-statement.js:141-153`) and its callers `coordinator.js:264,435,539,585`, `statement.js:167,230`, `distributed-transaction-recovery.js:287,392` | stamp at the call and at operation start inside the existing `.then`; each caller names its kind |
| B4 write statements | `statement.js:173,212-215` | `writeStatementsMs`, `writeStatementCount` |
| B4 read statements | `statement.js:229-250` | new `readStatementsMs`, `readStatementCount` |
| B4 COMMIT sub-phases | freeze `coordinator.js:562`; PREPARING `decision-protocol.js:216`; prepare fan-out `:275-302`; PREPARED `:229`; decision `:243-266`; COMMITTING `:467`; commit fan-out `:469-488`; settlement `:503-509` | sub-phase list in order, `commitUnattributedMs` |
| B4 rollback | `decision-protocol.js:553-608` | accounted before `endTransaction`; the finalize appends the sample |
| B5 requests | `executeOnPartition` (`query-executor-partition-delivery.js:80-791`) | ms, attempts (`lastAttempt`, `:159-166`), outcome per request |
| B5 retry backoff | `distributed-transaction-protocol.js:508-521` | `participantRetryBackoffMs` |
| B8 metadata persistence | `noteMetadataPersistElapsed` sites `persistence-methods.js:353-357,607-611,647-651,698-702`, `participant-set.js:177-187`, `decision-protocol.js:256-264`; purpose explicit at `coordinator.js:174,192,471,514` | per-purpose histogram, per-sample sums |
| B8 readbacks | `readDistributedTransactionRow` (`persistence-methods.js:551-571`) | `metadataReadbackCount` |

### Removed symbols and their complete consumer census

Census: `git grep` over the whole tree at `ab347e962` for `transactionBreakdownsById`,
`lastTransactionBreakdown`, `getLastTransactionBreakdown`, `getTransactionTelemetrySummary`,
`noteMetadataRead`, `metadataReads`, `avgMetadataReads`; plus the breakdown fields each
consumer reads. No mention in `architecture/`, `test/guidelines/`, `solve/specs/`, `docs/`, or
any `solve/**` record. [V]

| Consumer | Lines | What it reads |
|---|---|---|
| `src/query/distributed/distributed-transaction-coordinator.js` | 220-221 | initialises `transactionBreakdownsById`, `lastTransactionBreakdown` |
| `src/query/distributed/distributed-transaction-telemetry.js` | 3, 17, 82, 202-207, 247, 274-280, 329-334, 336-346, 348-402 | the stores, `metadataReads`, `noteMetadataRead`, both accessors |
| `test/query/scenario-a-transaction-coordination-fast-path.test.js` | 148-158, 160-161 | `getLastTransactionBreakdown(id)`: `transactionId`, `statementCount` (2), `participantCount` (1), `typeof` of `beginMs`, `statementsMs`, `preparePhaseMs`, `decisionPersistMs`, `commitPhaseMs`, `totalMs`; `getTransactionTelemetrySummary().transactionCount` (1) |
| `test/query/scenario-a-deep-stack-throughput-and-latency.test.js` | 285-286 | `getLastTransactionBreakdown(id).skippedParticipantSetMutations >= 3` |
| `test/query/transaction-participant-set-authority.test.js` | 617-619 | `getLastTransactionBreakdown(id).metadataSubmissionsByPurpose.decisionAndCommitting` (1), `.settlement` (0) |
| `test/query/tx-metadata-pgwire-and-result-representation.test.js` | 373-397 | `getLastTransactionBreakdown()` (no id): `transactionId`, `metadataMutations` = gateway mutation count, every purpose of `metadataSubmissionsByPurpose` and `metadataPersistMsByPurpose` is a number, the seven exact submission counts (1, 2, 1, 1, 2, 1, 2), 10 mutations; `getTransactionTelemetrySummary()`: `transactionCount` (1), `avgMetadataSubmissionsByPurpose`, `avgMetadataPersistMsByPurpose` |
| `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js` | 268-269, 281-292 (check `payment-and-scenario-a-transaction-breakdown-tracer`, `:216,584`) | `typeof` of both accessors; `transactionId`; `typeof` of `beginMs`, `statementsMs`, `preparePhaseMs`, `decisionPersistMs`, `commitPhaseMs`, `totalMs`; `Number.isInteger(metadataMutations)`, `Number.isInteger(metadataReads)`; `participantCount === 1` |
| `scripts/checks/scenario-a-deep-stack-throughput-and-latency-guard.js` | none | reads no removed accessor or breakdown field; not edited [V] |

Signature consumers of `runTransactionOperation` if B2 adds the kind:
`test/query/transaction-participant-set-authority.test.js:797` calls it directly;
`test/query/transaction-owned-commit-mode-guard.test.js:64` source-matches
`/runTransactionOperation/` in the coordinator (unaffected by a new parameter). [V]

Assertions of the sealed fast-path guard that change (ruling 3, R09 supersession finding in
this quest's log): `:268-269` (accessor existence becomes the route answer and
`collectTransactionTelemetry`), `:281-289` (the breakdown becomes the sample; the six `typeof`
checks become the accounting identity over measured values), `:285` (`statementsMs` becomes
`writeStatementsMs`), `:290` (`metadataMutations` becomes the sum of
`metadata.submissionCountByPurpose`), `:291` (`metadataReads` had no producer and is removed),
`:292` (`participantCount` stays on the sample). Why: they asserted the type of values that
had no producer (`metadataReads`), a misleading name (`statementsMs` counts writes only) or a
value lost after it was produced (`rollbackPhaseMs`, not asserted there).

## 2. Owner-defined shape

Answer of `GET /api/admin/diagnostics/transactions?sinceSequence=N` (N a non-negative
integer; anything else is HTTP 400):

```text
{schemaVersion: 1, nodeId, bootIncarnation (positive integer), capturedAtEpochMs,
 capturedAtMonotonicMs, timeOriginEpochMs, answerBuildMs, sinceSequence,
 sections: {coordinator: CoordinatorSection}}

CoordinatorSection =
   {availability: {state: 'unavailable', reason: 'NOT_COMPOSED'}}     (no SQL engine)
 | {availability: {state: 'measured'}, observationCount,
    observations: {<catalogue id>: {count, sumMs, bucketCounts[23]} | {count}},
    samples: {capacity: 512, firstRetainedSequence, lastCompletionSequence, droppedCount,
              entries: Sample[] (completionSequence > sinceSequence, ascending)}}

Sample = {completionSequence, identity: {sessionId, transactionId, transactionEpoch},
  outcome (the transaction status at finalize), participantCount,
  operations: Operation[] (at most 64), operationsOmittedCount,
  writeStatementCount, writeStatementsMs, readStatementCount, readStatementsMs,
  metadata: {submissionCountByPurpose{7}, persistMsByPurpose{7}, readbackCount,
             skippedParticipantSetMutationCount},
  accounting: {totalMs, attributedMs, betweenOperationsMs, unattributedMs},
  observationCount}

Operation = {kind, startOffsetMs, fifoWaitMs, runMs,
  subPhases: [{phase, ms}] (COMMIT only, in order; a phase that did not run is absent),
  commitUnattributedMs (COMMIT only),
  participantRequests: [{partitionId, operation, ms, attempts, outcome}]}
```

- Kinds: BEGIN, WRITE, READ, COMMIT, ROLLBACK, RECOVERY (ENLIST: open decision D4).
- COMMIT sub-phases: FREEZE, PREPARING_STATUS, PREPARE_FANOUT, PREPARED_STATUS, DECISION,
  COMMITTING_STATUS, COMMIT_FANOUT, SETTLEMENT.
- Request operations: QUERY_READ, QUERY_WRITE, BEGIN, PREPARE, COMMIT, ROLLBACK,
  TRANSACTION_OUTCOME. Request outcomes: ACCEPTED (`executeOnPartition` returned
  `success === true`), FAILED (returned otherwise), THROWN (rejected).
- Purposes: the seven of `TRANSACTION_METADATA_PERSIST_PURPOSE` (`telemetry.js:22-30`).
- Units end every name: `Ms` (float milliseconds), `Us` (bucket bounds), `Count`.
- The sample fields beyond design section 4 (`participantCount`, `metadata.*`, the statement
  counts) carry what the migrated consumers assert (section 1); `failure` of design section 4
  is open decision D12.

Catalogue (coordinator section; 37 entries, 39 with ENLIST):

| Entries | Kind, unit | Owner file | Witness |
|---|---|---|---|
| `fifoWaitMs.{BEGIN,WRITE,COMMIT,ROLLBACK}`, `runMs.{BEGIN,WRITE,COMMIT,ROLLBACK}` | histogram, Ms | `distributed-transaction-statement.js` | W2 |
| `fifoWaitMs.READ`, `runMs.READ` | histogram, Ms | same | W3 |
| `fifoWaitMs.RECOVERY`, `runMs.RECOVERY` | histogram, Ms | same | W4 |
| `commitSubPhaseMs.FREEZE` | histogram, Ms | `distributed-transaction-coordinator.js` | W2 |
| `commitSubPhaseMs.{the other seven}`, `commitUnattributedMs` | histogram, Ms | `distributed-transaction-decision-protocol.js` | W2 |
| `participantRequestMs.{QUERY_WRITE,BEGIN,PREPARE,COMMIT,ROLLBACK,TRANSACTION_OUTCOME}` | histogram, Ms | `query-executor-partition-delivery.js` | W2 |
| `participantRequestMs.QUERY_READ` | histogram, Ms | same | W3 |
| `participantRetryBackoffMs` | histogram, Ms | `distributed-transaction-protocol.js` | W2 |
| `metadataPersistMs.{seven purposes}` | histogram, Ms (overlapping work) | `distributed-transaction-telemetry.js` | W2 |
| `metadataReadbackCount` | counter, Count | `sql-query-engine-transaction-persistence-methods.js` | W2 |

W2 is three transactions through `PgWireProtocolHandler`: a commit, a rollback with a held
ROLLBACK fan-out, and a commit whose first PREPARE answer is a typed
`participant_transaction_not_active` (one protocol retry with backoff), whose first COMMIT
answer is a typed `NO_TRANSACTION` miss (one TRANSACTION_OUTCOME request) and whose first
participant-set update is applied but not certified (one readback). All three paths are
reached on the unchanged tree (`uncovered-entries-drivability-unchanged-tree.tap`). [V]

Node collection entry: `{nodeId, adminUrl, state}` plus `answer` (ANSWERED), `errorCode`
(UNREACHABLE: the request rejected before the deadline), `deadlineMs` (TIMED_OUT: the
deadline passed; the request's signal is aborted), `httpStatus` (HTTP_REFUSED: status other
than 200), `reason` (MALFORMED: the validator refused the body, including an answer whose
`nodeId` is not the node asked). One entry per node, in the order asked.

Window: `deriveTransactionTelemetryWindow(earlier, later)` returns
`{state: 'COMPARABLE', sections: {coordinator: {observations: <bucket-wise deltas>}}}` when
`bootIncarnation` is equal, else `{state: 'INCOMPARABLE_RESTARTED'}` with no delta.

## 3. Identity and generation

- `nodeId`: the admin API's node id. `bootIncarnation`: the durable per-boot reservation
  (`lagrange-runtime-startup.js:110-113`) [V]; how it reaches the answer is open decision D3.
- Sample identity: the existing `sessionId` (PG wire: `pgwire-<uuid>`,
  `pgwire-protocol-handler.js:366`), `transactionId` and `transactionEpoch`; no new tagging.
  The join from a client attempt's `serverConnectionId` (the handler's `_pid`,
  `:137,462-465`) to a `sessionId` needs the successor quest's wire records (B1): this quest
  exports no `_pid` (open decision D6). [V]
- `completionSequence` is per coordinator instance and the window key is
  (`bootIncarnation`, cursor). This holds because one coordinator serves a boot: the
  early-admin engine is retired (`entrypoint-runtime-admin-composition.js:500-502`) and
  `setSQLQueryEngine` (`admin-websocket-lifecycle-methods.js:71`) has no caller [V]. A second
  engine attached under one incarnation would restart the cursor (see D13).

## 4. Ordering

- One session's operations run serially on its FIFO. Per operation: `queuedAt` (the call),
  `startedAt` (start inside the existing `.then`), `endedAt` (settle; for the finalizing
  COMMIT or ROLLBACK, the finalize). `fifoWaitMs = startedAt - max(queuedAt, previous endedAt)`,
  `runMs = endedAt - startedAt`, `betweenOperationsMs = sum of max(0, queuedAt - previous endedAt)`,
  `startOffsetMs = queuedAt - transaction start`; the transaction starts at the `queuedAt` of
  the operation that registered it (BEGIN's FIFO wait is inside `totalMs`).
- `totalMs = finalize - start = sum(fifoWaitMs) + sum(runMs) + betweenOperationsMs + unattributedMs`
  within 0.5 ms; `attributedMs = sum(fifoWaitMs) + sum(runMs)`; `unattributedMs` holds the
  operations beyond 64 and is reported, never negative beyond 0.5 ms.
  `COMMIT.runMs = sum(subPhases.ms) + commitUnattributedMs`. Metadata persistence overlaps
  and stays outside the identity.
- `completionSequence` is assigned at finalize, monotonic from 1; `sinceSequence` returns
  entries after it in ascending order;
  `droppedCount = max(0, firstRetainedSequence - sinceSequence - 1)`.
- Each answer is a local view of one node; there is no cross-node cut.

## 5. Absent versus unavailable

- No SQL engine on the admin API: `{state: 'unavailable', reason: 'NOT_COMPOSED'}`, HTTP 200.
- `count: 0` inside a measured section means the event did not happen in this incarnation;
  that reading is admitted only because every entry is driven by its witness (W9, N2).
- A phase that did not run is absent from `subPhases` (emptiness inside the contract, R07).
- Sections of the successor quest (participant, Raft, PG wire) are absent, not
  `unavailable`.

## 6. Durable commit

Not applicable: telemetry is volatile and never persisted; it adds no durable write. The
production-defaults probe proves the gateway mutation sequence, purposes and Raft journal
writes unchanged.

## 7. Retained obligations

None. Bounds: ring 512 samples (about 2 MB), 64 operations per sample, 23 buckets per
histogram, 37 node observations. Evictions are counted (`droppedCount`,
`operationsOmittedCount`).

## 8. Wake and cleanup

No timer, await or async hook in the product path. Per-transaction state lives on the
transaction object and is released when the transaction ends (`endTransaction`,
`decision-protocol.js:180-191`); the finalize appends the sample and the ring overwrites the
oldest. The coordinator's section lives and dies with the coordinator. The collection
function, caller-side only, owns its deadline and aborts each pending request when it passes.

## Open decisions for the lead

- **D1.** `src/query/distributed/distributed-transaction-recovery.js` (callers at `:287,392`)
  must name the RECOVERY kind (W4); it is outside the writable paths.
- **D2.** B5 binding. `executeOnPartition` has no route to the coordinator: the QueryExecutor
  is built at `sql-query-engine-instance-initializer.js:266-281` without one, and the
  statement requests come from `sql-query-engine-write-execution.js` and the read path, all
  outside the writable paths. Per-transaction `participantRequests` need either an amendment
  (a telemetry sink bound at construction, keyed by `transactionIdentity.transactionId` or the
  control request's `transactionId`) or a narrower contract (node-level B5 only).
- **D3.** `bootIncarnation` does not reach the admin API in production:
  `startAdminRuntimeComposition` is called at `lagrange-runtime-startup.js:317-328,560-571`
  without it, and `createAdminAPIWithLiveQuery` (`entrypoint-runtime-admin-composition.js:171-190`)
  does not pass it although the API accepts it (`admin-websocket-api-base.js:143-144`). Inside
  the composition, `options.messageRouter.bootIncarnation` (`message-router.js:77`) and
  `options.owner.heartbeatService.bootIncarnation` (`heartbeat-service.js:52`) carry the
  issued value. The admin fallback `resolveCurrentNodeIncarnation`
  (`admin-websocket-load-lane-admission.js:475-485`) reads the nodes row from the system cache,
  which can still hold the previous incarnation after a restart; it must not be the window key.
- **D4.** ENLIST has no production producer: the only `src` caller of
  `enlistParticipants` is `bindTransactionToPartition` (`sql-query-engine.js:378-386`), which
  has no caller. Either the ENLIST entries leave the catalogue (and the dead method goes to its
  owner, R17) or a witness drives them through a path production never takes.
- **D5.** The design's W2-W8 drive neither `participantRequestMs.TRANSACTION_OUTCOME`,
  `participantRetryBackoffMs` nor `metadataReadbackCount`; this draft adds W2's third
  transaction (section 2) to drive them. To confirm.
- **D6.** The brief's statement clause "samples join to client attempts through existing
  identities" is not provable in this quest (no `_pid` to `sessionId` mapping without B1);
  the draft says "each sample carries the existing session and transaction identities".
- **D7.** The sealed fast-path guard measures **2** at `ab347e962`, not 0
  (`fast-path-guard-unchanged-tree.json`): `priority-1-reduced-durable-transaction-bookkeeping`
  ("executeWriteStatement must persist sql_write_operations once with outcome", 0 !== 1; since
  `49e9a4b75`, 2026-11-27, which batched write operations at freeze and updated the test but not
  the guard) and `priority-5-composite-partition-pruning-and-local-index` ("Missing canonical
  index idx_orders_customer_latest on orders"; since `1caf39d24`, 2026-11-15, the adapter
  verifies the index through a catalog query the guard's fake client cannot answer). The
  tracer check this quest changes passes. Ruling 3's "must still measure 0" cannot hold; the
  draft requires the tracer check to pass and the metric to stay no worse than 2. The deep-stack
  guard measures 0 (`deep-stack-guard-unchanged-tree.json`). [V]
- **D8.** Two purpose classifiers exist for one submission: the telemetry infers from the
  transaction's status (`telemetry.js:118-174`), the persistence methods derive from the
  persisted record (`persistence-methods.js:157-198`), and `noteMetadataPersistElapsed`
  re-books the count when they disagree (`telemetry.js:313-327`). "Explicit at the four sites"
  (`coordinator.js:174,192,471,514`) means one owner of the status-to-purpose mapping; the
  callbacks at `:173-193` are invoked by `DurableWorkflowCoordinator` (`src/workflow`, not
  writable) without a purpose. The stage-3 design of that single owner is to be confirmed.
- **D9.** `getLastTransactionBreakdown` is not named in ruling 7 but reads both removed stores;
  the draft removes it with its four test consumers.
- **D10.** The design does not enumerate ROLLBACK sub-phases; ROLLBACK carries `runMs` and its
  participant requests only.
- **D11.** `failure: {stage, refusalCause, sqlState}` (design section 4) has no driving witness
  among W2-W8; the draft leaves it out unless W2 gains a refused-PREPARE case.
- **D12.** Module placement within the writable paths is this draft's choice: histogram in
  `telemetry-histogram.js`; catalogue, validator, window and collection in
  `transaction-telemetry-collection.js`; answer builder in
  `src/admin/admin-transaction-telemetry-answer.js`.
- **D13.** If a second SQL engine is ever attached to the admin API within one boot, the
  cursor restarts under the same incarnation; the window state would then need the
  coordinator's identity. Today no caller does this (section 3).

## Findings for other owners (R17)

- Sealed probe rot: the `scenario-a-transaction-coordination-fast-path` probe is red at 2 on
  `ab347e962` (D7) and is run nowhere outside its seal (design record section 2), so two later
  changes broke it unseen. Owner: the closed epic's successor or `code-navigability-and-mistake-resistance`.
- `bindTransactionToPartition` (`sql-query-engine.js:378-386`) is dead (D4).
- From the design record, ruling 4: `pgwire-metrics.js`, `CommandMetrics`,
  `admin-trace-context.js` have no caller in `src` (routed by the lead).
