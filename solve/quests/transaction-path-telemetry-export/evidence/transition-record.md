# Transition record: transaction-path-telemetry-export

The shape as implemented (stage 4, after the first independent verification). Base
`ab347e9625a64ed24b7700b8f958bd54d8e3db06`; seal `86d4d392b716b015e9335b0d658e99212ea3d865`
(its `src` is byte-identical to the base). Rule set `docs/steering/rules.md` (last_reviewed
2026-11-26). Rulings: the lead's rulings 1-9 and 48-57 (D1-D13), the stage-3 answers Q1-Q4,
and the stage-4 rulings after the verifier's report (B1-B4, R1-R4). Every `path:line` is in
the candidate tree unless it names the base. [V] = read in code or measured; [I] = inferred.
Outputs are in the coordination directory under `lab/tb-telemetry-export-stage1/` (red
baseline) and `lab/tb-telemetry-export-stage4/` (this stage).

## 0. Red baseline (N3)

- At the seal, the guard measured **9** on the unchanged tree, each witness failing at the
  export after its scenario had run (`lab/tb-telemetry-export-stage1/`). [V]
- With the final witnesses on an export of the seal commit, the guard still measures **9**,
  one typed absence per property (`lab/tb-telemetry-export-stage4/base-red-guard.json`): W1
  stops at its node fixture ("src/admin/admin-transaction-telemetry-answer.js does not
  exist"), W2-W9, N1 and N2 at the collection contract they load first
  ("src/diagnostics/transaction-telemetry-collection.js does not exist"). Since stage 3 the
  node fixture binds the answer builder as production does, and since stage 4 the witnesses
  take the vocabulary from the contract, so W1-W4 are red before driving the path, not
  after. [V]
- The contract modules are loaded on demand with literal specifiers and named bindings
  (`test/diagnostics/transaction-telemetry-witness-node.js`): the product's exports are the
  one definition the witnesses use (the unused-export ratchet sees them), and a tree without
  them still yields nine typed failures instead of a crash of the sealed guard. [V]

## 1. Producer and consumer symbols

### New producers

- `src/diagnostics/telemetry-histogram.js`: the fixed base-2 histogram (23 buckets, upper
  bounds 2^k us for k = 4..25 plus overflow), snapshots and bucket-wise deltas, the one
  telemetry clock (`readTelemetryClockMs`), the time origin, `takeTelemetryEpoch`, and the
  most-recent ring (`createTelemetryRing`, `appendTelemetryRing`, `readTelemetryRingSince`,
  `retainedTelemetryRingValues`).
- `src/diagnostics/transaction-telemetry-collection.js`: the vocabulary (sections,
  availability, operation kinds, sub-phases, request operations and outcomes, purposes,
  `TRANSACTION_WITHOUT_SAMPLE_REASON`, failure refusal, node and window states, cursor
  parameters and refusals), the one catalogue (42 entries: 35 coordinator, 7 delivery), the
  answer validator, `deriveTransactionTelemetryWindow` and `collectTransactionTelemetry`.
- `src/query/distributed/distributed-transaction-telemetry.js`: the coordinator section.
  Every recording is an imported function taking the coordinator and the transaction or its
  ID (stage 4, B2); the coordinator carries one method, the section read
  `readTransactionTelemetrySection` (`:638`).
- `src/query/query-executor-delivery-telemetry.js`: the executor's own section (D2): one
  record per `executeOnPartition` call that built a request, histograms by operation, a ring
  of 16384 records that carry a transaction identity, the read-time index and join.
- `src/admin/admin-transaction-telemetry-answer.js`: `createTransactionTelemetryAnswerBuilder
  ({nodeId, bootIncarnation})` and `parseTransactionTelemetryCursor(query)`.
- `ADMIN_ROUTE.TRANSACTION_DIAGNOSTICS` (`admin-constants.js:23`), the route
  (`admin-websocket-api-base.js:432-434`) and `handleTransactionDiagnostics`
  (`admin-websocket-diagnostics-route-methods.js:277-316`); the builder is bound in
  `startAdminRuntimeComposition` (`entrypoint-runtime-admin-composition.js:618-623`) with the
  boot incarnation `lagrange-runtime-startup.js` reserves and passes at both calls (D3).

### Changed producers (observation points)

| Boundary | Site | What is recorded |
|---|---|---|
| B2 FIFO wait, B4 run time | `runTransactionOperation` (`distributed-transaction-statement.js:151-168`): queue stamp at the call, start inside the existing `.then`, settle inside the existing `.finally`; kinds named by the callers, RECOVERY at `distributed-transaction-recovery.js:290,396` (D1) | `fifoWaitMs.<kind>`, `runMs.<kind>`, the sample's operations |
| Statement counts | the WRITE and READ operations' settle, or the finalize when the statement itself ended the transaction (`distributed-transaction-telemetry.js:221-231,332-341`) | `writeStatementCount/Ms`, `readStatementCount/Ms` |
| Terminal sub-phases | FREEZE `distributed-transaction-participant-set.js:260`; PREPARE_FANOUT `decision-protocol.js:324`; PREPARED_STATUS `:264`; DECISION `:292`; COMMIT_FANOUT `:513`; ROLLBACK_FANOUT `:619`; SETTLEMENT `:487,535,587,637` | `commitSubPhaseMs.*`, `rollbackSubPhaseMs.*`, unattributed remainders |
| Failure (D11) | `noteRolledBackCommitFailure` (`decision-protocol.js:189-200`), called once before the rollback fan-out (`:454`) | `failure {stage, refusalCause, errorCode}`, first failure kept |
| B5 requests | `executeOnPartition` (`query-executor-partition-delivery.js:116-117,434,792`) | `participantRequestMs.<operation>`, the request ring |
| B5 retry backoff | `distributed-transaction-protocol.js:537-540`, around the existing sleep | `participantRetryBackoffMs` |
| B8 purposes handed | `setTransactionStatus(tx, status, purpose)` (`protocol.js:292-300`); `executeParticipantStage(..., {persistPurpose})` (`protocol.js:426`); admission (`participant-set.js:299`) | the handle's status and participant write purposes |
| B8 submissions | `coordinator.js:174,192` (workflow persistence callbacks), `:467,510`, `records.js:165`, `participant-set.js:175`, `decision-protocol.js:281`; elision `persistence-methods.js:547` | `submissionCountByPurpose` |
| B8 persistence | `persistence-methods.js:316,567,604,653`, `participant-set.js:185,187`, `decision-protocol.js:289` | `metadataPersistMs.<purpose>`, the handle's `persistMsByPurpose` |
| B8 readbacks | `readDistributedTransactionRow` (`persistence-methods.js:516`) | `metadataReadbackCount` |

### Removed symbols and their consumers

- Removed: `transactionBreakdownsById`, `lastTransactionBreakdown`, `getLastTransactionBreakdown`
  (D9), `getTransactionTelemetrySummary`, `noteMetadataRead`/`metadataReads` (no producer),
  `resolveNowMs`, the purpose inference from status in the telemetry and both persistence
  classifiers (D8), `beginMs`, `prepareConcurrency`, `commitConcurrency`.
- Consumers migrated to the export through `test/diagnostics/transaction-telemetry-sample-reader.js`:
  `scenario-a-transaction-coordination-fast-path.test.js`, `scenario-a-deep-stack-throughput-
  and-latency.test.js`, `transaction-participant-set-authority.test.js`,
  `tx-metadata-pgwire-and-result-representation.test.js`, and the tracer check of
  `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js` (R09 supersession).
  No reader of a removed symbol remains (verifier, item 5). [V]
- Signatures changed: `runTransactionOperation(sessionId, kind, operation)`,
  `setTransactionStatus(tx, status, purpose)`, `executeParticipantStage` option
  `persistPurpose`. Every `.call`/`.apply` consumer in `test/` and `scripts/` of a changed
  function was checked: `executeParticipantOperationWithRetry` and `abortTimedOutTransaction`
  (`distributed-transaction-wait-bound-spent.test.js`, partial owner), `resolveParticipantCommitMiss`
  (`partition-transaction-seam-falsifiers.test.js`, unchanged), `executeOnPartition`
  (`cdc-owner-fact-receiver-read-point.test.js`, a real executor). The partial owner records
  nothing because its transaction has no telemetry handle; its subtests 1 and 2 pass again
  and subtest 3 fails exactly as on main. [V]

## 2. Owner-defined shape

```text
GET /api/admin/diagnostics/transactions?sinceSequence=N[&bootIncarnation=B&telemetryEpoch=E]

200 {schemaVersion: 1, nodeId, bootIncarnation, capturedAtEpochMs, capturedAtMonotonicMs,
     timeOriginEpochMs, answerBuildMs, sinceSequence,
     sections: {coordinator: CoordinatorSection, delivery: DeliverySection}}
400 {error}  sinceSequence not a non-negative integer, or above 0 without both B and E
409 {error, reason: OTHER_BOOT_INCARNATION | OTHER_TELEMETRY_EPOCH, bootIncarnation,
     telemetryEpoch}  a cursor read in another window of this node
503 {error}  no answer builder bound, or the build threw (as the sibling routes answer)

Section = {availability: {state: 'unavailable', reason: 'NOT_COMPOSED'}}   (no SQL engine)
CoordinatorSection = {availability: {state: 'measured'}, telemetryEpoch, observationCount,
  observations: {<catalogue id>: {count, sumMs, bucketCounts[23]} | {count}},
  samples: {capacity: 512, firstRetainedSequence, lastCompletionSequence, droppedCount,
            entries: Sample[] (completionSequence > sinceSequence, ascending)},
  withoutSample: {capacity: 128, droppedCount, entries: WithoutSample[] (all retained)}}
DeliverySection = {availability, telemetryEpoch, observationCount, observations,
  requests: {capacity: 16384, retainedCount, droppedCount}}

Sample = {completionSequence, identity: {sessionId, transactionId, transactionEpoch},
  startedAtMonotonicMs, outcome, failure?, participantCount, operations: Operation[] (<= 64),
  operationsOmittedCount, writeStatementCount, writeStatementsMs, readStatementCount,
  readStatementsMs, metadata: Metadata, accounting: {totalMs, attributedMs,
  betweenOperationsMs, unattributedMs}, observationCount, participantRequests: Requests}
WithoutSample = {completionSequence, identity, startedAtMonotonicMs, outcome, failure?,
  reason: 'RECOVERED_FROM_ROWS', metadata: Metadata, observationCount,
  participantRequests: Requests}
Operation = {kind, startOffsetMs, fifoWaitMs, runMs, subPhases: [{phase, ms}],
  commitUnattributedMs (COMMIT) | rollbackUnattributedMs (ROLLBACK)}
Metadata = {submissionCountByPurpose{7}, persistMsByPurpose{7}, readbackCount,
  skippedParticipantSetMutationCount}
Requests = {state: 'measured', entries: [{partitionId, operation, startOffsetMs, ms,
  attempts, outcome}]} | {state: 'unavailable', reason: 'EVICTED'}
```

- Kinds: BEGIN, WRITE, READ, COMMIT, ROLLBACK, RECOVERY (RECOVERY has histograms, never a
  sample operation). ENLIST is not a kind (D4); `enlistParticipants` runs as WRITE.
- **COMMIT sub-phases.** A committed COMMIT runs six: FREEZE, PREPARE_FANOUT,
  PREPARED_STATUS, DECISION, COMMIT_FANOUT, SETTLEMENT; a COMMIT that decides ROLLBACK runs
  ROLLBACK_FANOUT in place of PREPARED_STATUS and COMMIT_FANOUT. The stage-1 draft listed
  eight, with PREPARING_STATUS and COMMITTING_STATUS. They are not phases on main: the
  PREPARING status is written in the same mutation as the participant-set freeze, and the
  COMMITTING status in the same mutation as the decision record. The base mutation sequence
  of a one-write commit shows it (`test/bootstrap/transaction-telemetry-production-baseline.js`,
  COMMIT_ONE_WRITE rows 5 and 8): `sql_transactions update PREPARING FROZEN` and
  `sql_transactions update COMMITTING decision COMMIT`. A separate stamp would time nothing.
- ROLLBACK sub-phases (D10): FREEZE, DECISION, ROLLBACK_FANOUT, SETTLEMENT.
- A phase that did not run is absent; an operation's time beyond its phases is its
  unattributed remainder, so no time vanishes.
- Request outcomes: ACCEPTED (`executeOnPartition` returned `success === true`), FAILED,
  THROWN. A call that never built a request is no participant request.
- **No NO_TRANSACTION_IDENTITY.** Ruling 49 named it; Q2 ruled that only EVICTED is
  defined. A sample's requests are joined by `transactionId`, and every request built for a
  transactional call carries one (control requests and stamped statements); records without
  one (autocommit statements, non-transactional reads) are counted in the histograms but
  never retained in the ring. So a sample's requests can be missing only because the ring
  evicted a record that may belong to it, which is EVICTED.
- **Failure** (D11, Q3): `{stage, refusalCause, errorCode}`. `stage` is the stage the failure
  was decided in: the stage a preparing drive reached, or, when COMMIT re-drives a ROLLBACK
  recorded earlier, the transaction's stage at that moment (ROLLING_BACK after a client
  ROLLBACK whose fan-out failed). It is recorded before the rollback fan-out can end the
  transaction; the COMMIT answer's own `stage` is still computed after the rollback, exactly
  where the base computes it (`decision-protocol.js:454-470`; B1). The first failure stays:
  a later drive of the same recorded decision does not replace it (S6).
- **Purposes.** Each submission's purpose is named by its site or handed by its caller
  right before the workflow coordinator writes the row (D8). For FAILED participant rows the
  handed purpose differs from what the base classifier computed: the base mapped every
  status other than ACTIVE, PREPARING/PREPARED and COMMITTED/ROLLED_BACK to
  `statementOutcome`; the export takes the purpose of the stage that wrote the row
  (`preparing` for the PREPARE stage, `settlement` for COMMIT and ROLLBACK stages). This is
  telemetry only: the purposes are read nowhere outside the telemetry module (verifier,
  item 1), and in all ten comparison scenarios every product observation is identical to the
  base while the per-purpose counts differ only in S3, S6, S7 and S8 and sum to the gateway
  mutation count (`lab/tb-telemetry-export-stage4/cmp/diff.txt`). [V]
- **Transactions without a sample** (B4). A transaction restored from rows has no BEGIN on
  this node, so no lane operations or accounting. Its first telemetry observation creates a
  handle without a sample (`distributed-transaction-telemetry.js:298-317`); its metadata
  writes are recorded at node level and in its handle; at its end it is counted in
  `completedWithoutSampleCount.RECOVERED_FROM_ROWS` and joins the `withoutSample` ring. Its
  participant request records are attributed to that entry by the same read-time join as a
  sample's, not left as orphans: the executor's section has no route to the coordinator
  (D2), so it cannot know at record time that a transaction has no sample, and attributing
  at read time keeps the record readable as that transaction's request. The entry's
  `startedAtMonotonicMs` is its first observation on this node, or its earliest retained
  request when that came first.
- Catalogue: 42 entries, each `{id, section, kind, unit, owner, witness}` and driven above
  zero by its witness (W9): `fifoWaitMs.*` and `runMs.*` (6 kinds, W2/W3/W4),
  `commitSubPhaseMs.*` (7), `commitUnattributedMs`, `rollbackSubPhaseMs.*` (4),
  `rollbackUnattributedMs`, `participantRetryBackoffMs`, `metadataPersistMs.*` (7),
  `metadataReadbackCount`, `completedWithoutSampleCount.RECOVERED_FROM_ROWS` (W4), and the
  delivery section's `participantRequestMs.*` (7).
- Node collection entry: ANSWERED (answer), UNREACHABLE (errorCode), TIMED_OUT (deadlineMs;
  the request is aborted), HTTP_REFUSED (httpStatus, and the cursor refusal's reason when
  the node named one), MALFORMED (reason, including NODE_ID_MISMATCH). One entry per node,
  in the order asked; a node entry with `sinceSequence` above 0 must name its window.

## 3. Identity and generation

- `bootIncarnation` is the durable per-boot reservation, handed by the composition to the
  builder (D3). The admin API's own `bootIncarnation` option was not removed: it remains at
  `admin-websocket-api-base.js:143-144`, read only by load-lane admission
  (`admin-websocket-load-lane-admission.js:476-477`); production does not pass it
  (`entrypoint-runtime-admin-composition.js:173-193`), and the telemetry never reads it.
- Each section has a `telemetryEpoch` taken when its store is created. The window identity
  is (`bootIncarnation`, the coordinator section's `telemetryEpoch`): a changed epoch is
  INCOMPARABLE like a restart (D13), and a cursor above 0 must name the window it was read
  in, or the route refuses it with its typed reason instead of answering an empty page.
- Sample identity is the existing `sessionId`, `transactionId` and `transactionEpoch`; no new
  tagging. Joining a client attempt's connection to its `sessionId` needs the successor
  quest's wire records (D6).

## 4. Ordering

- One session's operations run serially on its FIFO. `fifoWaitMs = startedAt -
  max(queuedAt, previous operation's end)`, `runMs = endedAt - startedAt`,
  `betweenOperationsMs = sum of max(0, queuedAt - previous end)`. The transaction starts at
  its BEGIN's call, so BEGIN's FIFO wait is inside `totalMs`.
- `totalMs = sum(fifoWaitMs) + sum(runMs) + betweenOperationsMs + unattributedMs` within
  0.5 ms; terminal `runMs = sum(subPhases) + the unattributed remainder`. Metadata
  persistence overlaps and stays outside the identity. The identity holds by construction
  (the remainder is computed); the witnesses therefore also bound each part from outside:
  fan-out phases span their held participant requests, every terminal phase is above zero,
  and a FIFO wait behind recovery is at least the recovery hold.
- The operation running at the finalize ends there; when it is a statement that ended its
  transaction (a wait-cycle victim) it is counted then, not lost.
- `completionSequence` is monotonic per store from 1; `droppedCount = max(0,
  firstRetainedSequence - sinceSequence - 1)`. Each answer is one node's local view.

## 5. Absent versus unavailable

- No SQL engine: both sections `{state: 'unavailable', reason: 'NOT_COMPOSED'}` (HTTP 200).
- `count: 0` in a measured section means the event did not happen in this window; that
  reading holds because every entry is driven by its witness (W9, N2).
- Evicted request records: the sample's requests are `unavailable / EVICTED`.
- A transaction restored from rows: no sample, a typed `withoutSample` entry and count.
- An open or in-doubt transaction has no sample until it ends; the export counts no open
  transactions (not in scope).

## 6. Durable commit

Not applicable: telemetry is volatile, never persisted, and adds no durable write. The
production-defaults probe (`test/bootstrap/transaction-telemetry-production-defaults.test.js`)
proves, for four one-participant scenarios (committed write, rolled-back write, refused
PREPARE, client ROLLBACK whose fan-out fails followed by COMMIT), that the gateway mutation
sequence, the router delivery sequence, the answer fields a client reads, the host timers
armed through the globals or `node:timers`, async hook creations, the promises the scenario
causes, metrics tags and the decision trace equal the base measurement. Raft journal writes
are not observed (participants answer through a recording router); their identity follows by
inference only: no file under `src/raft`, `src/partition`, `src/control-plane`,
`src/transport` or `src/workflow` changes, and the delivery sequence into them is identical.

## 7. Bounds

- Rings: 512 samples of at most 64 operations, 128 transactions without a sample, 16384
  request records; 23 buckets per histogram; 42 node observations. Evictions are counted
  (`droppedCount`, `operationsOmittedCount`, EVICTED).
- Retained memory at full rings (2026-11-28): the verifier measured about 9.5 MB with
  new_order-like samples (47 operations, 55 requests each) and 11 MB at 64 operations; the
  stage-1 comments said 2 MB and 1.5 MB, and ruling 6 accepted about 3 MB. Per ring, measured
  here: sample ring 6.0 MB (47 operations) and 7.6 MB (64 operations), request ring 3.2 MB,
  `withoutSample` ring 0.1 MB. The comments now state these numbers.
- Worst-case answer: 7,701,148 bytes through the route with every ring full and every
  request joined (`test/admin/transaction-diagnostics-payload-bounds.test.js`, bound 8 MiB),
  built in 12 ms on a cold process; the verifier measured 7.9 MB, about 3 ms to build warm,
  22-35 ms to serialize and about 45 ms for the caller-side validator.
- Cost per one-write commit: 50 clock reads against 29 on the base, 43 sample observations;
  `recordTelemetryHistogram` about 6 ns and a clock read about 22 ns (stage 3). No
  recording sits in a loop over rows.

## 8. Wake and cleanup

No timer, await, promise link or async hook in the product path (probe: armed timers and the
scenario's promise count equal the base). Per-transaction state lives on the transaction's
handle and is released with the transaction; the finalize appends the sample or the entry and
the rings overwrite the oldest. The sections live and die with their owners. The collection
function, caller-side only, owns its deadline and aborts each pending request when it passes.

## Findings for other owners (R17)

- The closed epic's fast-path probe is red at 2 on the base (priority-1 since `49e9a4b75`,
  priority-5 since `1caf39d24`) and is run nowhere outside its seal; this quest supersedes
  only its tracer check (R09) and leaves the other two results identical.
- `bindTransactionToPartition` (`sql-query-engine.js:378-386`) has no caller (D4).
- Navigability on main: `query-executor-partition-delivery.js` `executeOnPartition` carries
  two findings over its baseline (`owner_port_feature_detection` from `5e1e92600`,
  `two_source_fallback_reads` from `7dcff733c`); not repaired here.
- `scripts/checks/code-navigability-fallback-classification.json` and
  `data/fallback-census/census.json` keep entries for the rewritten telemetry module.
- `docs/admin-api-reference.md`, `architecture/runtime-lifecycle.md` and `DEBUGGING.md`
  list the diagnostics routes and not this one; they are outside the assignment.
