---
audience: evidence
recorded: 2026-11-18
---

# coordinator-sqlite-merge WP1: SQL-value hop census and the command format v2 design record

Date: 2026-11-17. Status: **quest evidence for WP1, unsealed**. No production path was changed.

**Source.** Worktree `/mnt/data/peter/projects/lagrange-sqlmerge-wp1-20261117`, branch `claude/sqlmerge-wp1-20261117`, HEAD `19a2134c5`. Every `file:line` below is at that head and relative to `src/` unless it says otherwise.

**WP1 deliverables this census accompanies (uncommitted in that worktree):**
- `src/query/sql-value-codec.js`: the one typed wire encoding (TypedRowSet, TypedParams, strict decoder, byte accounting, D3 input typing);
- `src/query/sql-value-codec-constants.js`: its storage-class tags and refusal vocabulary;
- `test/query/sql-value-codec.test.js`: oracle layer B.

**Labels.** CONFIRMED means the line was read (by me or by a census reader whose key lines I re-read). PLAUSIBLE means inferred and not executed.

**Codec vocabulary used below.** A *cell* is the codec's canonical text of one value. *TypedParams* is `{v:1, classes, cells}`. *TypedRowSet* is `{v:1, columns, rows:[[classes, ...cells]]}`. *D3* is the input-typing table: BigInt is INTEGER, number is REAL, string is TEXT, Buffer or Uint8Array is BLOB, null is NULL, anything else is refused.

---

## 0. Summary

1. **Request and answer** are the only hops WP3 switches. Section 1 has their lines.
2. **Every durable hop goes through one codec**, the raft-rs JSON proposal codec (`raft/raft-rs-proposal-codec.js:33-45`; its only encode call is `raft/raft-rs-operation-port.js:468-470`).
   - The derived stores (`_participant_transactions.operations_text`, `_cdc_obligations.event_json`, `_partition_statement_outcomes`) are written at apply time.
   - Each carries a raft-index column, and each outlives log compaction inside snapshot images.
3. **No format version exists** on any proposal, derived row or CDC event. The only discriminator is the command `type`.
   - An unknown `type` fails the apply closed (`partition/partition-service-entry-apply-base.js:93-110`, `committedCommandGate`; message groups at `message-group/message-group-service-raft-timing.js:200-205`).
   - So **a new command type is a fail-closed carrier for v2**.
   - Re-encoding `params` inside an existing type would be misread silently by an old binary: a bind error consumed as `STATEMENT_FAILED`, so replicas diverge (PLAUSIBLE).
4. **A committed fence already has a precedent:** `PARTICIPANT_GENERATION_ORIGIN`.
   - It is proposed once (`partition/partition-participant-transaction-request.js:714-731`) and applied insert-once (`partition/partition-participant-transaction-apply.js:581-605`).
   - It is recorded in `_partition_write_generation.origin_index/origin_term` (`partition/partition-participant-transaction-constants.js:236-262`).
5. **Live findings outside WP1 (R17, routed in section 6):**
   - ±Infinity and NaN write NULL on every replica, with no error.
   - A Buffer param becomes `{type,data}` on the log.
   - The split-mirror live and restart paths carry different value forms.
   - A GSI backfill cursor resumes an INTEGER key as TEXT.

---

## 1. Request and answer hops (WP3 switches these)

Binding facts that hold for every row below (better-sqlite3 11.10.0, `node_modules/better-sqlite3/src/better_sqlite3.cpp`):
- **Binding** (`:1978`, `:2046`, `:2139-2150`):
  - every JS number binds as a double (REAL);
  - a BigInt binds as int64 when lossless;
  - a Buffer binds as a BLOB;
  - null and undefined bind as NULL;
  - a plain object is a named-parameter bag;
  - a boolean throws.
- **Reading** (`:1873`, `:964-966`): with `safeIntegers` off, an INTEGER column reads through `sqlite3_column_double`, and `run().lastInsertRowid` is a Number.
- **No `defaultSafeIntegers` call exists in `src`.** All CONFIRMED.

### 1.1 Read request (coordinator to partition)

| # | Hop | file:line | Today | Status |
| --- | --- | --- | --- | --- |
| R1 | Build | `query/query-executor-partition-request-builders.js:81-92` | `{type:'QUERY', sql, params}`; `params` is the caller's array, by reference | CONFIRMED |
| R1b | Send | `query/query-executor-partition-delivery.js:374-395` | `buildRequest(...)` then `messageRouter.deliver(address, request, …)` | CONFIRMED |
| R2 | Transport choice | `transport/message-router-delivery-pressure-routing.js:286-319` | a selected query message-group service re-delivers through the router (`message-group/message-group-service-outbound-dispatch-runtime-methods.js:222-231`); otherwise a same-node target is local. Encoding is the router's either way | CONFIRMED |
| R3 | Local delivery | `transport/message-router-delivery-behaviors.js:57-104` | **by reference**: `prepareMessage` is the identity unless set (`message-router-delivery-lifetime.js:143-149`); the answer returns verbatim (`:103`) | CONFIRMED |
| R4 | Remote delivery | `behaviors.js:381` → `message-router-ack-delivery.js:81-89` → `transport/message-router-delivery-encoding.js:73-81` | `JSON.stringify({...envelope, payload})`. The duration-field branch (`:83-104`, `serializeJsonData`) is used only by CDC callers | CONFIRMED |
| R5 | Raft-direct | `behaviors.js:230-273` (`JSON.stringify` at `:266`) | gated by `isRaftTransportPayload` (`:239`); query traffic never takes it | CONFIRMED |
| R6 | Inbound | `transport/message-router-inbound-dispatch.js:72` (`JSON.parse`, no reviver) | answers go back as `SERVICE_RESPONSE` through `sendRaw` (`:515-527`, `sendRaw` at `:524`) → `JSON.stringify` (`behaviors.js:574-578`). A stringify throw becomes an `error`-only answer (`inbound-dispatch.js:530-541`) | CONFIRMED |
| R7 | Partition, params in | `partition/partition-service-entry-apply-base.js:421-422` → `partition/partition-service-remote-query-methods.js:119-141` (`params = payload.params \|\| []`), `:321-376` → `partition/partition-service-write-metrics-base.js:160-192` → `executeAdmittedReadQuery` `:130-157` | `:132` sets `safeIntegers(options?.safeIntegers === true)`. The remote path never sets it, so it is **off**. The only `{safeIntegers:true}` caller is the local split-median read (`partition/partition-split-merge-manager-core-methods.js:430-434`). The design's "`safeIntegers(false)` at `:132`" is effectively true, but the line is an option, not a constant | CONFIRMED |
| R7b | Row collection and byte budget | `query/query-result-budget.js:62-107` | with no limits, `statement.all(...params)` (`:68`); otherwise `iterate`, with bytes = `Buffer.byteLength(JSON.stringify(row))` (`:86-89`). Object rows collapse duplicate column names | CONFIRMED |
| R7c | Transaction-session reads | `partition/partition-participant-transaction-staging.js:311-315,344-355` | the same collector, default integers | CONFIRMED |

### 1.2 Read answer (partition to coordinator)

| # | Hop | file:line | Today | Status |
| --- | --- | --- | --- | --- |
| A1 | Answer out | `partition/partition-service-remote-query-methods.js:143-165` (`remoteQueryAnswer`) | `rows: result.rows` verbatim (object rows). **No `columns`.** `lastInsertRowid` is not in the answer. Fields may be `undefined` | CONFIRMED |
| A2 | Frame | R3 (local, by reference) or R6 `sendRaw` → `JSON.stringify` (remote) | - | CONFIRMED |
| A3 | Coordinator receipt | `transport/message-router-pending-response-ledger.js:376-381` → `transport/transport-semantic-outcome.js:258-269` → `query/query-executor-partition-delivery.js:401,410-415` → `query/query-executor-partition-request-builders.js:150-153` (`rows: response.rows \|\| []`) | the single receipt point. The only `buildSuccessResult` override is transaction control (`query/sql-query-engine.js:507-508`), which carries no rows | CONFIRMED |
| A4 | Merge | `query/query-executor-base.js:478-494` (`executeOnPartitions`), `:524-530` (`mergePartitionResults`) | JS merge (deleted by WP3) | CONFIRMED |
| A5 | Raw QUERY bypassing QueryExecutor | `bootstrap/node-joining-backfill-merge-and-status.js:252` (`{type:'QUERY', sql, params:[]}`), `:273` (reads `response.rows`) | reads the partition answer directly | CONFIRMED |

### 1.3 Write request and answer (transport part; the durable part is section 2)

| # | Hop | file:line | Today | Status |
| --- | --- | --- | --- | --- |
| W1 | Coordinator | `query/distributed/distributed-write-coordinator.js:198-201,283-295,418-449` → `query/query-executor-sql-command-rendering.js:358-371` | params are copied; with no params, literals are pushed into params (`:487-513`, `extractLiteralValue` `:342-348`); then R1-R6 | CONFIRMED |
| W2 | Follower forward | `partition/partition-service-write-metrics-base.js:530-536` | `FORWARD_WRITE {operation: entry}`: by reference if local, JSON if remote | CONFIRMED |
| W3 | Replication | 2.1 | **every write's params pass through the proposal JSON, even when the leader is local** (`service/artifact-payload-store.js:9-11`: "raw binary SQL parameters do not survive replication") | CONFIRMED |
| W5 | Answer | `partition/partition-committed-statement-outcome-constants.js:150-155` → `partition-service-entry-apply-base.js:716-722` | `{changes, lastInsertRowid}` as Numbers. `remoteQueryAnswer` drops `lastInsertRowid`, and `request-builders.js:150-169` keeps `changes`. **The engine never returns `lastInsertRowid`** | CONFIRMED |

### 1.4 Ingress typing today (a second and third input-typing table)

- **Application database facade** (`query/application-database-input.js:136-155`, `snapshotBindValue`):
  - admits null, strings, Uint8Array (copied to a Buffer) and **finite safe-integer numbers only**, with -0 mapped to 0;
  - converts **booleans to 1/0**;
  - refuses non-integral numbers and BigInt.

  This contradicts D3: D3 types number as REAL (fractional included), refuses booleans and admits BigInt. CONFIRMED.
- **pgwire Bind** params arrive as UTF-8 strings or null (`runtime/pgwire-message-parsers.js:88-95`), so they are TEXT, as the design states. CONFIRMED.

### 1.5 Value fate today (local vs remote)

| Value | Params, local | Params, remote | Write params (always JSON through raft) | Rows, local | Rows, remote |
| --- | --- | --- | --- | --- | --- |
| BigInt | binds INTEGER | `JSON.stringify` TypeError (R4) | proposal UNENCODABLE | never produced (safeIntegers off) | if produced, the `sendRaw` throw becomes an error answer |
| Buffer | BLOB | `{type,data}`, a named-params bag, then a bind error | the same as remote | Buffer | `{type,data}`, not a Buffer |
| -0 | REAL -0 | 0 | 0 | -0 in an untyped column | 0 |
| ±Infinity | REAL inf | **null, so NULL is stored** | **NULL** | ±Infinity | **null** |
| NaN | NULL (SQLite) | null | null | - | - |
| integer > 2^53 | already lossy as a number; binds REAL | the same | the same | silently lossy double | the same |
| INTEGER vs REAL | every number binds REAL | the same | the same | REAL 3.0 reads as 3 | the same |

**The point of the table: today one value has two semantics, depending on whether delivery was local or remote.** The codec removes this: the same encoded object is used for both, and is JSON-safe by construction. CONFIRMED by mechanism; individual bind outcomes PLAUSIBLE where noted in the census source.

### 1.6 What WP3 changes on these hops

**R1/R7 (read request).**
- The request carries `params: encodeTypedParams(values)`.
- The partition decodes with `decodeTypedParams` before `executeAdmittedReadQuery` binds.
- The client values first pass D3 at the one input-typing owner (the codec). The application facade's own table (1.4) must then be reconciled with D3. **This is a design decision**, recorded as conflict C2 in the WP1 report.

**R7/R7b/A1 (read answer).**
- The partition reads with `safeIntegers(true)` + `.raw(true)` + `.columns()`, and answers a TypedRowSet.
- The byte budget charges encoded cells (`typedRowSetByteLength`; a per-row entry point is needed if the producer must refuse at the crossing row).
- The answer carries the engine identity envelope.
- `undefined` answer fields stay a transport-strictness matter, out of scope.

**A3 (receipt).** `decodeTypedRowSet` runs at `request-builders.js:150-153`, the single receipt point.

**A5 (raw QUERY).** The join backfill raw QUERY must move onto the decoder: it reads `response.rows` directly.

**Partition-direct readers.** These call `partitionService.executeQuery` and share `executeAdmittedReadQuery`:
- `node/participant-release-authorization-owner.js:175`
- `node/runtime-service-call-cell-handler.js:352`
- `cdc/cdc-routed-mutation-readiness.js:208`
- `cdc/cdc-integration-service-local-system-table-routing.js:495`
- `cdc/cdc-bootstrap-direct-sql.js:141`
- `index-management/index-service-partition-methods.js:42,144`
- `bootstrap/phases/seed-registration-phase.js:507,577`
- `partition/partition-split-merge-manager-core-methods.js:418,430`
- `service/call-shard-read-view-manager.js:201`

If WP3 changes that function's output, these all change with it. CONFIRMED (call sites); impact PLAUSIBLE.

**What WP-D changes here:** W1, W2 and W3 carry TypedParams. Section 5 has the details.

---

## 2. Durable hops (WP-D moves these to command format v2)

Loss legend used in the tables:
- **I/R:** INTEGER and REAL are conflated, because both are a JS number.
- **>2^53:** precision is lost.
- **BigInt!:** `JSON.stringify` throws.
- **Buf→obj:** a Buffer becomes `{type:'Buffer',data:[…]}`.
- **-0→0:** -0 becomes 0.
- **Inf/NaN→null:** ±Infinity and NaN become `null`.

### 2.1 Raft proposal (partition, control-plane and message groups)

| Item | Today (file:line) | Status |
| --- | --- | --- |
| Codec | `raft/raft-rs-proposal-codec.js:33-45` `encodeProposal` = `JSON.stringify` (a throw becomes `proposal_unencodable`); `:52-59` `decodeCommittedProposal` = `JSON.parse`. No version field (`raft-rs-proposal-codec-constants.js`) | CONFIRMED |
| Only encode call | `raft/raft-rs-operation-port.js:468-470` | CONFIRMED |
| Persistence | `_raft_rs_log.data TEXT`, base64 of the UTF-8 JSON (`raft/raft-rs-durable-store-constants.js:34-43`, decode `raft/raft-rs-durable-store.js:63,681-695`). **Position: the raft index** | CONFIRMED |
| SQL-bearing producers | `buildQueryOperation` `{type:'QUERY', sql, params, entryId, splitMirrorOrigin}` (`partition/partition-service-write-metrics-base.js:63-74`); `insertData/updateData/deleteData/upsertData` `{type, sql, params, data, whereClause}` (`:276-386`; `data`/`whereClause` repeat the values); `proposeWrite` → `buildPartitionWriteEntry` (`:478-490`, `partition/partition-write-kernel.js:247-263`); `MIGRATION_ALTER_TABLE {sql, params}` (`partition/partition-service-remote-query-methods.js:400-406`); `PARTICIPANT_PREPARE {operationsText: JSON.stringify([{entryId, sql, params}])}` (`partition/partition-participant-transaction-request.js:368-370`, `partition/partition-participant-transaction-bytes.js:246-258`); message-group `CDC`/`CDC_BATCH` row `data` (`message-group/message-group-service-cdc-replication-runtime-methods.js:250-268`) | CONFIRMED |
| Decode and rebind | `raft/raft-rs-operation-port.js:105-112` decodes for every apply, leader included → `partition-service-entry-apply-base.js:621` `applyCommittedEntry` → `:694` → `partition/partition-statement-admission.js:399-416` → `:354,371-385` `statement.run(...params)`. JS numbers bind REAL (N14); there is no safeIntegers on any write statement | CONFIRMED |
| Other readers of committed bytes | `raft/raft-rs-ingress.js:170-185`, `raft/raft-rs-retained-history.js:105`, `raft/raft-rs-snapshot-witness.js:169`, `raft/raft-rs-durable-store.js:681` (mirror replay), `partition/partition-cdc-owed-admission.js:44` | CONFIRMED |
| Losses | I/R, >2^53 (lost before the codec), BigInt! (proposal refused), Buf→obj (binds as a named-params bag; the bind error is consumed as `STATEMENT_FAILED`, PLAUSIBLE), -0→0, **Inf/NaN→null: a NULL is written on every replica with no error** | CONFIRMED by mechanism |

**WP3:** no change. Write params keep today's representation (interim I4).

**WP-D:**
- New v2 command types carry `params` as TypedParams, and row values (`data`, CDC row images) as TypedRowSet cells. The duplicated `data`/`whereClause` copies of the values are removed or carried once, typed.
- The apply decodes with `decodeTypedParams` and rebinds BigInt, number, string, Buffer and null. The JSON proposal codec stays: TypedParams are JSON-safe.
- Every reader in the "other readers" row learns the v2 types.
- `committedCommandGate` gains the positional rule (section 5).

### 2.2 Split and merge mirror

| Item | Today (file:line) | Status |
| --- | --- | --- |
| Live queue | Memory only: `handle.pendingEntries` holds shallow copies of the leader's **pre-encoding** entry (`partition/partition-split-routing.js:133-147`; enqueue `partition/partition-service-split-mirror-queue-methods.js:96-104`, merge `:454-462`; plan `partition/partition-write-kernel.js:531-560`) | CONFIRMED |
| Durable state | Only the replay cursor (barrier and watermark raft indices) is durable, in `tables.partition_transition_metadata` JSON (`partition/partition-mirror-replay-cursor.js:58-92`) | CONFIRMED |
| Restart replay | `loadDurableDeltasBehindWatermark` (`partition/partition-mirror-replay-cursor.js:131-150`) re-reads the source `_raft_rs_log` through `decodeCommittedProposal`. It keeps entries whose outcome row says APPLIED. **Position: the source raft index** | CONFIRMED |
| Replay into target | `replaySplitEntry` (`partition/partition-split-routing.js:149-163`), `replayMergeEntry` (`partition/partition-service-merge-replication-methods.js:632-640`) → `routeSplitMirroredWrite` (`:200-243`) → `queryExecutor.executeOnPartition(target, sql, params)` (JSON transport) → a new hop-2.1 proposal on the target | CONFIRMED |
| Snapshot backfill | `SELECT * … ORDER BY pk` `.iterate()` with no safeIntegers (`partition/partition-split-accessor-base.js:401-438`; merge `:358-392`), then positional params of `INSERT OR REPLACE` (`partition/partition-split-routing.js:249-298`) | CONFIRMED |
| Losses | The live path carries in-memory values; the restart path carries JSON-decoded ones. **The two paths give different value forms**: a Buffer survives live but becomes `{type,data}` after a restart. The backfill read loses >2^53 and I/R | CONFIRMED (forms); PLAUSIBLE (bind outcomes) |

**WP3:** no change. The mirror travels the write path (I4).

**WP-D:**
- The live queue holds the **encoded v2 cells** of the committed command, so live and restart replay are one semantics.
- The backfill reads with `safeIntegers(true)` + `.raw(true)`, and carries TypedParams into `INSERT OR REPLACE`.
- `executeOnPartition` mirror writes carry TypedParams.

### 2.3 Transaction session statements and PREPARE

| Item | Today (file:line) | Status |
| --- | --- | --- |
| Coordinator side | No SQL text or params are persisted. `sql_transactions` (`query/sql-query-engine-transaction-persistence-methods.js:107-120`), `sql_transaction_participants` (`:351-366`, `prepared_digest`), `sql_write_operations` (`:401-415`, `payload_hash` without values, `query/distributed/distributed-transaction-records.js:115-122`) | CONFIRMED |
| Participant session | Volatile, leader-only. `stageWrite` gates params with `isJsonScalar` (`partition/partition-participant-transaction-staging.js:103-106`, refusal `:270-271` `SESSION_WRITE_PARAM_UNSUPPORTED`) and stores `JSON.parse(JSON.stringify({entryId, sql, params}))` (`:283-285`) | CONFIRMED |
| PREPARE | `operationsText = JSON.stringify(session.operations)` (`partition/partition-participant-transaction-request.js:369`). `preparedDigest` = sha256 of the exact `operationsText` bytes (`partition/partition-participant-transaction-bytes.js:40-43`). Persisted in `_participant_transactions.operations_text TEXT` with `prepare_index/prepare_term` (`partition/partition-participant-transaction-constants.js:209-231`) | CONFIRMED |
| COMMIT | `commitPrepared` re-reads `row.operations_text`, not the DECISION command, and runs it at `decision_index` (`partition/partition-participant-transaction-apply.js:410-427,429-`). PREPARED rows survive restart and snapshot images (`raft/snapshot-application-content.js`). **Position: `prepare_index` on the row** | CONFIRMED |
| Losses | BigInt, Buffer, ±Inf, NaN, booleans and objects are refused at staging; -0→0; I/R and >2^53 as in 2.1 | CONFIRMED |

**WP3:** no change.

**WP-D:**
- Staging admits the D3 domain through TypedParams instead of `isJsonScalar`. This removes `SESSION_WRITE_PARAM_UNSUPPORTED` for BigInt and Buffer.
- `operationsText` v2 embeds TypedParams. The digest is computed over the v2 bytes, and the coordinator's `prepared_digest` follows automatically.
- `commitPrepared` decodes `operations_text` **by the row's `prepare_index`** against the group's fence index (section 5).

### 2.4 Partition statement-outcome table

| Item | Today (file:line) | Status |
| --- | --- | --- |
| Table | `_partition_statement_outcomes` (`partition/partition-committed-statement-outcome-constants.js:22-51`): `entry_key, outcome, log_index, term, failure_code, failure_message, changes INTEGER, last_insert_rowid INTEGER, owner_result_text TEXT` (settlement JSON only, `partition/partition-coordinator-settlement.js:36-37,93`). **No params and no result rows.** Position: `log_index` | CONFIRMED |
| Writer and readers | `recordCommittedStatementOutcome` (`partition/partition-committed-statement-outcome.js:181-190`); `readCommittedStatementOutcome` (`:153-171`, plain `.get`, so Number); census (`:95-117`, safeIntegers) | CONFIRMED |
| Loss | `lastInsertRowid` comes from Number-mode run info, so rowids above 2^53 lose precision | CONFIRMED (mode) |

**WP3:** `lastInsertRowid` reaches clients through the presentation owner (an INTEGER, so it follows the safe-integer rule).

**WP-D:** no format change, because the storage is already typed SQLite INTEGER. The run info and the outcome read move to safeIntegers mode, so the value stays BigInt until presentation.

### 2.5 CDC row images

| Item | Today (file:line) | Status |
| --- | --- | --- |
| Scope | Durable obligations exist only for tables with internal cache propagation or external CDC (`cache/cdc-table-policy.js:547-551`). User tables are `USER_TABLE_NO_CDC_POLICY` (`:486-493`) | CONFIRMED |
| Capture | Inside the committed apply: `recordCommittedStatementCdc` / `captureCommittedOperationCdc` (`partition/partition-cdc-obligation.js:157-216`) → `extractCDCData` (`partition/partition-cdc-generator.js:338-404`). Sources: the decoded command's `data`/`whereClause`/params, and a re-read of the written row by `SELECT *…get()` **without safeIntegers** (`partition/partition-cdc-parameterized-sql.js:227-379`). There is no DELETE before-image | CONFIRMED |
| Persist | `eventJson: JSON.stringify({...cdcEvent, sourceScope})` (`partition/partition-cdc-obligation.js:179,214`) → `_cdc_obligations.event_json TEXT` with `log_index` + `ordinal` (`partition/partition-cdc-obligation-constants.js:137-149`). **Position: `log_index`** | CONFIRMED |
| Deliver | `eventOf` (`partition/partition-cdc-obligation-range.js:410-418`) `JSON.parse` + `captureCdcEvents` (`cdc/cdc-event-envelope.js:103-145`, JSON scalars only) → message-group CDC commands (2.1). The local cache is fed from the in-memory event (`partition/partition-cdc-obligation.js:96-108`) | CONFIRMED |
| Transient user-table path | `generateCDCEvent` after commit (`partition/partition-service-cdc-stream-base.js:131-221`). It is not durable, and delivers Buffers by reference (`partition/partition-cdc-delivery.js:463-476`) | CONFIRMED |
| Losses | >2^53, I/R, Buf→obj in `event_json`, -0→0, Inf→null; the local cache and the durable event disagree on the value form | CONFIRMED by mechanism |

**WP3:** no change.

**WP-D**, with WP7 as the consumer:
- Row images become TypedRowSet cells read with `safeIntegers(true)` + `.raw(true)`.
- `event_json` rows decode by `log_index` against the fence (section 5).
- The cache feed and the durable event carry the same decoded values.
- WP7 types the transient user-table path and evaluates live-query predicates over the decoded image.

### 2.6 Live-query snapshots (a wire hop, not durable)

- **Snapshot:** `sqlQueryEngine.executeQuery` (`live-query/live-query-manager.js:356-371`). It goes through the partition read (section 1), and its rows are held in `group.resultSet` (`:112-123`).
- **Changes:** they come from the partition CDC subscription (`live-query/live-query-startup-wiring.js:323-380`).
- **Output to clients:** `client.send(JSON.stringify(...))` (`live-query/live-query-manager.js:370`, `live-query/live-query-group-helpers.js:325-326`).
- All of the above is CONFIRMED.

**WP3:** the snapshot inherits the read switch. The rows it receives are the **presented** values from the one presentation owner. It is listed among the consumers in section 3.

**WP7:** the CDC side consumes codec-typed images (2.5).

**WP-D:** no change.

### 2.7 Other stores that hold SQL values

| Store | Today (file:line) | Position | WP-D |
| --- | --- | --- | --- |
| Pilot cutover post-writes | `_pilot_cutover_post_writes.row_json = JSON.stringify(rowObj)`, `primary_key_value TEXT` (`control-plane/owners/pilot-cutover-workflow-contract.js:51-54`; owner `:716-720,730`) | none | per-record `format_version` (section 5.6) |
| GSI backfill cursor | `_indices.backfill_cursor_pk` = `String(pk)` for a scalar, JSON for a tuple (`index-management/global-index-backfill-coordinator.js:33-60,343`). **An INTEGER key resumes as TEXT** | none | per-record version; the cursor becomes a TypedParams cell |
| Split key | The median is read with safeIntegers (`partition/partition-split-merge-manager-core-methods.js:431-440`) and persisted by `JSON.stringify` into `tables.partition_transition_metadata` (`partition/managed-split-workflow-provisioning-methods.js:150`). A BigInt there would throw (PLAUSIBLE: conversion not traced) | none | per-record version; a typed key cell (the boundary representation, `partition/partition-boundary-representation.js:82-160`, already decodes INTEGER from decimal text and BLOB from base64) |
| GSI maintenance writes | sql+params through 2.1 and 2.3 (`index-management/global-index-write-maintenance.js:39-66`) | raft index | covered by 2.1 |

Checked and **not durable**:
- unknown-outcome redelivery (`query/query-executor-unknown-outcome.js`);
- the proposal queue and `CDCEventBuffer`;
- the message-group operation ledger;
- control-plane held write instances;
- participant sessions;
- the system-table cache;
- the `FORWARD_WRITE`/`executeOnPartition` transports. These are JSON and lose values before the log, so they are covered by 2.1's producers.

**Snapshot images** are SQLite file images. They keep storage classes exactly, but they carry pre-fence `operations_text`, `event_json` and outcome rows past log compaction. Those rows are told apart only by their index columns against the fence index.

---

## 3. The `src` consumers of engine results (presentation census for WP3)

This answers design D3's "the reviewer counts 13". The reviewer's list was not recorded, so I enumerated the consumers again.
- **Result: 19 live in-process consumers that read cell values, plus one hub.** The hub is the control-plane system-table gateway, which passes rows to many repositories.
- **How 13 could arise (PLAUSIBLE).** The brief's candidate list, plus the admin WebSocket and the CLI results panel, gives 13. That list over-counts 4: three modules are unwired, and the CLI reads the admin JSON, not engine results. It also misses 10 live consumers.

### 3.1 Client- or user-facing (10)

| # | Consumer | file:line | Today | Effect of the D3 presentation (safe INTEGER → number, else refusal unless BigInt is requested; BLOB → Buffer) |
| --- | --- | --- | --- | --- |
| 1 | Application database facade | `query/application-database.js:185`, `query/application-database-result.js:83-104` | copies own data properties verbatim | becomes the declared output. Today a BLOB is a Buffer locally and `{type,data}` remotely, and ±Inf is a number locally and null remotely |
| 2 | pgwire result mapper | `runtime/pgwire-result-mapper.js:302-312,321-326` | `v ?? null`; already accepts array rows and `result.columns` | ready for raw rows plus columns |
| 3 | pgwire DataRow | `runtime/pgwire-message-builders.js:185-212` (`String(v)` at `:191,:203`), OID 25 at `:172`, loop `runtime/pgwire-protocol-handler.js:654-660` | a BLOB is decoded as UTF-8 (the remote form prints `[object Object]`); REAL 2.0 renders "2" | above 2^53 becomes a refusal (or exact digits from the typed cell, which the design prefers: "PG wire renders text from the typed cell"); BLOB rendering needs a decision |
| 4 | Admin WebSocket | `admin/admin-query-result-message-envelope.js:134-147,177-179` → `admin/admin-websocket-message-dispatch-methods.js:429-450` | `JSON.stringify(message)`; **a BigInt throws, the throw is logged as SEND_FAILED, and the client never gets the result** | needs the number presentation (or the typed cells) |
| 5 | Live-query manager | `live-query/live-query-manager.js:112-122,358-370` | resultSet keyed by pk; `JSON.stringify` to the client | BigInt breaks stringify, and a BigInt pk ≠ a number pk from CDC |
| 6 | Live-query group | `live-query/live-query-group.js:506-510,523-528,570-582`; `live-query/live-query-group-helpers.js:192-194,321-327` | the same | the same |
| 7 | Request-cell (WASM) context | `runtime/request-cell-component-context-owner.js:105-122` → `runtime/wasi-component-cell-runtime.js:84-91,512-519` → `runtime/request-cell-table-read-index.js:126-140,181-189` | keys must be a u32 number and values an s32 number; -0 is refused | unchanged for safe numbers; BigInt gives `ROW_INVALID` |
| 8 | Call-cell batch | `service/call-cell-batch-executor.js:272-297` (`queryExecutor.executeOnPartitions`) → `runtime/call-cell-value-mapping.js:37-62` | **REAL 3.0 is tagged INTEGER** | a typed storage class fixes the tag; it reads **below** executeSelect |
| 9 | SQL query loop | `runtime/sql-query-loop-runtime-module.js:193-230,242-246,464,512-521` | `Number(row[v])`; `sqlLiteral(BigInt)` gives a **quoted TEXT** literal; REAL 2.0 is written back as `2` | BigInt changes the stored type and splits group keys; design WP3 replaces `sqlLiteral` with typed params |
| 10 | Parallel reduce | `runtime/sql-query-loop-parallel-reduce.js:84-87,101-112,163-231,381` | `Number()`; `JSON.stringify(reduced)` | a BigInt groupKey throws at `:381` |

### 3.2 Internal (9, plus the gateway hub)

| # | Consumer | file:line | Today | Effect |
| --- | --- | --- | --- | --- |
| 11 | CDC authoritative read | `cdc/cdc-integration-service-authoritative-read-flow.js:57-122,162,213-238`; fed by `cdc/cdc-integration-service-owner-rpc-read-execution.js:245` (engine) and `:455` (`executeOnPartition`) | flat-JSON `===` equality and Map keys | BigInt throws or splits keys |
| 12 | Join backfill | `bootstrap/node-joining-backfill-merge-and-status.js:99-104,292-310` | Map by pk over snapshot rows, engine rows and the raw-QUERY rows (A5) | engine BigInt vs raw-QUERY number creates duplicates |
| 13 | Cache hydration | `cache/cache-hydration-service.js:178-190` | engine rows fed verbatim as CDC INSERTs | the type must match CDC event rows |
| 14 | Migration | `migration/migration-coordinator.js:297-366`; `migration/migration-coordinator-stage-methods.js:429-469`; `normalizeInteger` `migration/migration-coordinator.js:148-152` (`Number.isFinite`) | reached through `executeOnPartition` (`:602`) | a BigInt `row_id` falls back to the old cursor, so **the backfill never advances** (PLAUSIBLE) |
| 15 | Call-cell reduce coordinator | `runtime/call-cell-reduce-coordinator.js:381-395,457-461,565,631,664-667` | `Number()` | tolerant |
| 16 | Activation leases | `service/call-activation-lease-owner.js:63,81-89` | `Number()` | tolerant |
| 17 | Artifact payload store | `service/artifact-payload-store.js:216-224,365-436` | `Number()`; BLOBs kept as base64 TEXT | tolerant |
| 18 | Log retention | `logging/log-retention-service.js:269-293` | feeds `log_id` values back as params | BigInt needs W3 (WP-D) |
| 19 | Rebalancer budget | `rebalancer/unified-rebalancer-budget-planning.js:110-122` | `Number(config_value)` | tolerant |
| hub | Control-plane system-table gateway | `control-plane/control-plane-system-table-gateway-query-execution.js:381-430`; `control-plane/control-plane-system-table-gateway-read-strategies.js:396,511` | passes rows to many repositories (fan-out not enumerated) | with number presentation, only a refusal on a system INTEGER above 2^53; none found (PLAUSIBLE) |

### 3.3 Candidates that do not count

**Unwired in `src` (each CONFIRMED by its construction or caller):**
- `query/internal-sql-adapter.js` is only exported (`query/index.js:38`).
- `index-management/global-index-lifecycle-coordinator.js:186-212` and `index-management/global-index-read-router.js:298-310`:
  - the coordinator is built with only `{logger}` (`index-management/index-service-global-methods.js:86-90`);
  - its scans default to `async () => []`;
  - `planAndExecuteRead` has no caller.
  - This answers the design's open question for WP3 (§1.3 G): **no production caller**, so WP3 deletes rather than routes.
- `function/function-query-executor.js` is never instantiated.

**Remote clients, not in process:**
- `cli/sql/results-panel.js:227-247` reads the admin JSON.
- `cli/bulk-load-command.js:107` and `control-plane/owners/pilot-cutover-workflow-contract.js:570,586-609` go through a `pg` client.

**Pass-through or no cell reads:**
- `postgres-wire-adapter.js:254`, `wasm-service/meta-write-executor.js:61-66`, `log-query-service.js:471`;
- `call-shard-paged-execution.js:246-247` reads only `changes`;
- `index-service-partition-methods.js:174` is DDL;
- write call sites.

**Engine-internal row readers:**
- `query/table-creation-service-result-projection.js:56-80` (`stripPartitionDetails` spreads `{...row}`). It is applied at `query/sql-query-engine-statement-execution.js:432-436`, which makes it the natural single presentation hook.
- `query/lookup-primitive.js:158-163` (`JSON.stringify(row)`).
- The merge evaluators (deleted by WP3).

### 3.4 Consequence for "presentation at the QueryExecutor result boundary"

**The boundary has more than one exit.**
- `executeOnPartition(s)` results are consumed directly by #8, #11 (`:455`) and #14, and by split routing and index DDL.
- The raw QUERY (A5) and the partition-direct readers (1.6) do not pass through QueryExecutor at all.

If WP3 decodes to BigInt at the receipt (A3) but presents only at `executeSelect`/`executeQuery`, those callers receive BigInt. #14 would then stall the migration backfill, and #8 would change behaviour. **WP3 must present at every exit, or move these callers onto the engine API.** This is conflict C3 in the WP1 report.

---

## 4. What changes where (one table)

| Hop | WP3 (read switch, atomic) | WP-D (command format v2 + fence) |
| --- | --- | --- |
| Read request params | TypedParams: encode at the request builder, strict decode before bind | none |
| Read answer rows | `safeIntegers(true)` + `.raw(true)` + `.columns()` → TypedRowSet; byte budget on encoded cells; strict decode; presentation at the QueryExecutor boundary | none |
| Write request params | unchanged (I4) | TypedParams on `FORWARD_WRITE`/`executeOnPartition`; old format after the fence refused retryably (5.7) |
| Raft proposal | unchanged | new v2 command types carrying TypedParams/TypedRowSet cells; positional decoder |
| Split mirror | unchanged | live queue holds encoded cells; typed backfill; typed replay |
| Transaction PREPARE | unchanged | typed staging; v2 `operationsText`; decode by `prepare_index` |
| Statement outcomes | `lastInsertRowid` through presentation | safeIntegers run info and read |
| CDC row images | unchanged | typed images; decode by `log_index` (WP7 consumes) |
| Live-query snapshot | consumes presented rows | none (WP7 for the predicate) |
| Position-free stores | unchanged | per-record `format_version` |

---

## 5. Design record: command format v2 and the format fence (WP-D, D14)

Status: **draft for review**. It is owned by WP-D, which the design recommends as a child quest (D14). It changes an owner boundary in `src/raft` and `src/partition`, outside the epic's `authorizes` (D2).

### 5.1 Problem and invariant

Every durable hop in section 2 encodes SQL values as plain JSON. The census shows:
- the storage class is lost (I/R, >2^53);
- some values are refused (BigInt), and others are silently changed (±Inf/NaN→NULL, Buffer→object).

**Invariant.** After the fence, every SQL parameter or row value inside a durable command or derived record is a codec cell. Every entry is decoded by exactly one rule, chosen by its **position** relative to its group's committed fence. No decoder guesses a format.

### 5.2 Format

1. **New command types, not a version field inside old types.**
   - Old binaries discriminate only on `type` and fail the apply closed on an unknown type (`committedCommandGate`, `partition/partition-service-entry-apply-base.js:93-110`; message groups at `message-group/message-group-service-raft-timing.js:200-205`).
   - A v2 command therefore halts an old replica instead of being misapplied.
   - A v2 `params` inside the existing `QUERY` type would reach an old binary's `statement.run(...params)` as an object and be consumed as `STATEMENT_FAILED` on that replica only: silent divergence. That is rejected.
2. **v2 payload.**
   - `params` is TypedParams.
   - Row images and `data` are TypedRowSet rows, carried once (the v1 `data`/`whereClause` duplication goes).
   - `operationsText` embeds TypedParams per operation.
   - The proposal codec stays JSON, because the cells are JSON-safe.
3. **One type per kind.** After the fence, a kind has exactly one admitted type: the v2 one.

### 5.3 Capability and the propose-time check

- **Capability.** Release R, the first v2-capable build, decodes and applies v2 types and the fence entry but still writes v1. It publishes the capability `sql-command-format-v2` in its committed `nodes.capabilities` (the column at `bootstrap/system-table-core-schema-definitions.js:154`, written by the heartbeat at `control-plane/heartbeat-service-publication-methods.js:142-144`). The capability is read together with the row's `boot_incarnation`, so it is bound to the incarnation that published it, and a restart must publish it again.
- **Cluster epoch.** A control-plane decision records the format epoch (2) once **every registered node** advertises the capability. This covers SQL coordinators as well as replicas. If the check fails, the outcome is a deferred typed state naming the incapable nodes. It is re-evaluated when `nodes` rows change (an event, not a timer).
- **Per-group fence entry.** A `COMMAND_FORMAT_FENCE` command, modelled on `PARTICIPANT_GENERATION_ORIGIN`.
  - **Propose-time check** at the leader's port, before the core sees the entry (the same ingress discipline as `raft/raft-rs-conf-change-admission.js`): every **voter and learner** in the group's committed configuration (`raft/raft-rs-committed-membership-read.js`) maps to a node whose committed row for its current incarnation advertises the capability.
  - On failure there is a typed deferred refusal (`COMMAND_FORMAT_FENCE_MEMBER_INCAPABLE`, naming the members) and nothing is proposed.
  - **Apply:** the fence index and term are recorded insert-once in the group's durable state, in the same transaction as the applied index. This is the `RECORD_ORIGIN ... WHERE origin_index IS NULL` pattern. The record survives in snapshot images.

### 5.4 Old builds barred from membership and leadership after the fence

- **Membership.** Once a group's fence is applied, these refuse a target node whose committed capability for its current incarnation lacks v2:
  - conf-change admission at the leader's port (`raft/raft-rs-conf-change-admission.js`, `raft/raft-rs-group-membership-admission.js`);
  - the rebalancer's ADD, REPLACE and learner-promotion paths.

  The refusal is typed. It is deferred while the node can still upgrade, and terminal for the operation otherwise.
- **Leadership.** After its fence, an R+ replica grants **no vote and no pre-vote** to a candidate whose node lacks the capability.
  - The hook is the participation gate's inbound-envelope filter (`raft/raft-rs-participation-gate.js`). It already drops a delivered envelope as a lost message, never refusing its sender.
  - A pre-R candidate therefore cannot gather a quorum of R+ voters.
  - No pre-R leader exists at the fence, because of the propose-time check.
- **Downgrade below R after the fence** is unsupported, and it fails closed:
  - the downgraded replica's apply meets a v2 type, raises `UNRECOGNISED`, and halts that replica;
  - a downgraded majority halts the group rather than corrupting it.
  - This is documented as an operational constraint.

### 5.5 Forced snapshot and compaction at the fence

- **Trigger.** Applying the fence entry is the trigger (an event, not the threshold cadence). Each replica creates a checkpoint at an index ≥ the fence index and runs the proof-gated compaction to it (`partition/partition-snapshot-cadence.js` → `compactRaftRsCommittedPrefix`, `raft/raft-rs-snapshot-witness.js:228`).
- **Why.** After it, a joining learner receives a post-fence snapshot and only v2 entries, and the retained log stops holding v1 entries.
- **Gap (finding).** Today's cadence is **leader-only**, and refuses in-memory and control-plane partitions (the decision table in `partition/partition-snapshot-cadence.js`). WP-D must either compact on every replica, or have the witness (5.8) prove each replica's retained first index > its fence index. Control-plane and message-group groups need a compaction path, or stay on the positional decoder until they have one.

### 5.6 One positional decoder

`decodeCommittedCommand(command, index, groupFence)` is the only decoder:

| Position | Rule |
| --- | --- |
| fence not yet applied in this group, or `index < fenceIndex` | v1 rules: the existing types, JSON values as today |
| `index == fenceIndex` | the fence entry |
| `index > fenceIndex` | v2 types only; a v1 SQL-bearing type or an unversioned entry is the typed `COMMAND_FORMAT_FENCE_VIOLATION` host failure (fail closed; only a pre-R leader could produce it, and 5.4 excludes one) |

Notes on the decoder:
- Application is in log order, and the fence record is written in the fence's apply transaction. A replay after restart therefore always knows whether the fence is behind the entry.
- The same rule decodes **derived rows by their recorded position**:
  - `_participant_transactions.operations_text` by `prepare_index`;
  - `_cdc_obligations.event_json` by `log_index`;
  - `_partition_statement_outcomes` by `log_index`.
- A pre-fence PREPARE decided after the fence still executes with v1 rules, consistently on every replica.

**Per-record versions for stores without a log position** (2.7: pilot cutover `row_json`, the GSI backfill cursor, the split key):
- **Schema.** A migration adds `format_version INTEGER NOT NULL` and sets every existing row to 1 explicitly. This is a named state, not an "absent means v1" branch.
- **Writes.** After the cluster epoch, writers write 2 with codec cells, and the write owner refuses a version-1 write.
- **Reads.** Readers dispatch on the column: 1 is v1, 2 is the codec, and any other value is a typed refusal.
- **The codec's own `v`.** It versions the TypedRowSet/TypedParams record inside, so a mismatch there is also typed.

### 5.7 Old-format requests after the fence

- **Case.** A write request (`FORWARD_WRITE`/`executeOnPartition`) carrying v1 JSON params reaches a leader whose group fence is applied.
- **Recommended handling.**
  - The leader refuses it with the typed **retryable** `COMMAND_FORMAT_FENCE_VIOLATION`, carrying `{formatEpoch, fenceIndex}`.
  - The sender, an R coordinator that had not yet observed the epoch, treats the refusal itself as the observation. It re-encodes **its own original values** through D3 (`encodeTypedParams`) and resends. That is level-triggered from the refusal, with no timer.
  - The leader keeps one request decoder.
- **Alternative: the leader re-encodes v1 JSON params via D3.** This is exact for every v1 value that binds today (number→REAL is how v1 binds, N14; string→TEXT; null→NULL; everything else is refused, as it fails today). It is rejected because it keeps a second request decoder alive at the leader until R+1, against the owner's no-legacy rule.
- **Pre-R senders** can exist only by downgrade (5.4). They receive the same typed refusal.

### 5.8 Retiring v1 in release R+1, gated on a durable witness

- **Witness.** A control-plane record per raft group: `{groupId, formatEpoch, fenceIndex, per-replica retainedFirstIndex (from each replica's _raft_rs_snapshot), unsettledPreFenceRows, preFencePositionFreeRows}`.
- **Complete when**, for every group:
  - every replica's retained first index > fence index;
  - `unsettledPreFenceRows` is 0: no PREPARED `_participant_transactions` row with `prepare_index < fenceIndex`, and no undelivered `_cdc_obligations` row with `log_index < fenceIndex`;
  - no position-free row has `format_version = 1` (each owner rewrites or retires its rows).
- **R+1 start-up.** R+1 refuses to start, with the typed `COMMAND_FORMAT_V1_RETAINED`, on any store that hosts a group whose witness is incomplete. The operator finishes the drain on R.
- **R+1 deletes:**
  - the v1 branch of the positional decoder;
  - the v1 command types;
  - the per-record version-1 readers;
  - the capability check itself (every build is v2).

### 5.9 Comparable systems (PLAUSIBLE, from memory; not fetched for this record)

- **CockroachDB** cluster versions: a version gate activates only after every node runs a binary that supports it, and the active version is persisted. Binaries older than the active version refuse to start. Migrations run at finalization.
- **etcd**: the cluster version is the minimum of the members' versions, and features gate on it.
- **TiKV/PD** feature gates: a feature is enabled when every store reports at least the required version.

All three put the check where membership is known, and none decodes two formats without position or version. This record follows them, with one difference. Our v1 binaries have no start-up gate, so the bar on old builds comes from:
- the fail-closed unknown-type gate;
- R's vote filter;
- R's membership admission.

### 5.10 Open points for the WP-D review

1. Naming of the v2 types, and whether `operationsText` keeps a JSON-array-of-operations shape.
2. Whether every registered node, or only replicas, must advertise the capability before the epoch. The recommendation is every node, because coordinators send write requests.
3. The compaction gap in 5.5, for followers and for control-plane and message groups.
4. How the vote filter reads the capability. It must read committed `nodes` rows bound to the current incarnation, never a cached projection (R10).

---

## 6. Findings routed to owners (R17, not fixed here)

| Finding | Where | Owner |
| --- | --- | --- |
| ±Infinity and NaN params become `null` in the raft proposal JSON: **a NULL is written on every replica with no error** | `raft/raft-rs-proposal-codec.js:33-45` with any write producer in 2.1 | partition write path (fixed by WP-D; until then a silent value change) |
| A Buffer param becomes `{type:'Buffer',data}` on the log, and its bind failure is consumed as `STATEMENT_FAILED` | 2.1 | partition write path (WP-D) |
| The split-mirror live path and the restart replay path deliver different value forms for the same delta | `partition/partition-split-routing.js:133-147` vs `partition/partition-mirror-replay-cursor.js:131-150` | split/merge owner (WP-D) |
| The GSI backfill cursor resumes an INTEGER key as TEXT (`String(pk)`) | `index-management/global-index-backfill-coordinator.js:33-60,343` | GSI owner |
| `lastInsertRowid` is read in Number mode | `partition/partition-committed-statement-outcome.js:153-171` | partition outcome owner |
| The CDC local cache feed and the durable `event_json` disagree on value form | `partition/partition-cdc-obligation.js:96-108` vs `:179` | CDC owner (WP-D/WP7) |
| Snapshot compaction is leader-only, and control-plane partitions are refused | `partition/partition-snapshot-cadence.js` | raft snapshot owner (WP-D 5.5) |
| `lastInsertRowid` is never returned by the engine (dropped by `remoteQueryAnswer` and the result builder) | `partition/partition-service-remote-query-methods.js:143-165`, `query/query-executor-partition-request-builders.js:150-169` | query result owner (WP3 presentation decides whether it is a contract) |
| The admin WebSocket loses a whole result when a value cannot be stringified (logged SEND_FAILED; the client gets nothing) | `admin/admin-websocket-message-dispatch-methods.js:429-450` | admin owner |
| The application facade's input typing (booleans → 1/0, fractional numbers refused, -0 → 0) is a third classifier that contradicts D3 | `query/application-database-input.js:136-155` | application-database owner, via the D3 decision |
| The call-cell value mapping tags REAL 3.0 as INTEGER | `runtime/call-cell-value-mapping.js:37-62` | call-cell owner (fixed once rows are typed) |
| `migration-coordinator` `normalizeInteger` would stall on a BigInt cursor | `migration/migration-coordinator.js:148-152` | migration owner (WP3 presentation exit) |
| pgwire renders a BLOB as UTF-8 text and REAL 2.0 as "2" (already in the design's finding list) | `runtime/pgwire-message-builders.js:185-212` | pgwire owner |

---

## 7. The WP1 codec as delivered, and where it departs from the design

### 7.1 Module surface

**`src/query/sql-value-codec.js`** (no production importer; WP3 switches to it):
- `encodeTypedRowSet(columns, rows)` → `{v:1, columns, rows:[[classes, ...cells]]}`. Rows are better-sqlite3 `.raw(true)` rows read with `safeIntegers(true)`.
- `decodeTypedRowSet(wire)` → `{columns, rows}`, with values as BigInt, number, string, Buffer or null.
- `encodeTypedParams(values)` → `{v:1, classes, cells}`, using the D3 table.
- `decodeTypedParams(wire)` → `values[]`.
- `typedRowSetByteLength(rowSet)` → the exact UTF-8 bytes of `JSON.stringify(rowSet)`, counted from the cells.
- `SqlValueCodecError` (extends `BaseError`): `code`, `reason`, `row`, `column`.

**`src/query/sql-value-codec-constants.js`:**
- `SQL_STORAGE_CLASS` (`n i r t b`);
- `SQL_VALUE_CODEC_ERROR_CODE` (`INVALID` = `SQL_VALUE_CODEC_INVALID`, `UNREPRESENTABLE` = `SQL_VALUE_UNREPRESENTABLE`);
- `SQL_VALUE_CODEC_REFUSAL`: `version_unsupported`, `shape_invalid`, `arity_mismatch`, `storage_class_unknown`, `cell_not_canonical`, `integer_out_of_range`, `real_not_a_number`, `text_not_well_formed`, `value_type_unsupported`.

### 7.2 Encoding decisions

| Class | Cell | Why |
| --- | --- | --- |
| NULL | `null` | the one JSON null |
| INTEGER | decimal text in int64 range: no `+`, no leading zeros, no `-0`. Decoded to BigInt only. Out of range is `integer_out_of_range`. A length check first bounds the BigInt parse (a million digits cost about 76 ms) | a JS number binds REAL (N14), so an INTEGER must never decode to a number |
| REAL | ECMAScript `Number::toString` (shortest round trip) plus `"-0"`, `"Infinity"`, `"-Infinity"`. A cell is canonical exactly when `toString(Number(cell))` reproduces it, so `"2.0"`, `"1e21"`, `".5"` and `"9007199254740993"` are refused | unique text per double; ±Infinity and -0 cannot be JSON numbers |
| NaN | **no cell**: `real_not_a_number` on encode, `cell_not_canonical` on decode | SQLite stores a bound NaN as NULL (witnessed in the test), so a read never yields it, and a parameter NaN would otherwise silently become NULL |
| TEXT | the string itself, which must be **well-formed UTF-16** | an unpaired surrogate binds as invalid UTF-8 (`ED A0 80`) that reads back as U+FFFD (witnessed). Invalid UTF-8 already stored is replaced by better-sqlite3 at the read, before any codec: a binding limit |
| BLOB | padded standard base64 (RFC 4648 §4); empty is `""`; canonical exactly when re-encoding the decoded bytes reproduces the cell (refuses unpadded, url-safe, whitespace and non-zero trailing bits) | 4/3 frame bytes instead of hex's 2×, and the merge budget charges frame bytes; native encode and decode; JSON never escapes the alphabet |
| Frame | exact own keys (`v`,`columns`,`rows` / `v`,`classes`,`cells`; key order is not part of the contract, so a sorted-key durable serializer can carry it); `v === 1`, checked after the record test and before the field set (a future `v` is `version_unsupported`, not `shape_invalid`); row length is `1 + columns`; the class string length is `columns`; column names are well-formed strings, with duplicates and `""` kept | strict and order-independent |
| Byte accounting | `typedRowSetByteLength` adds the empty-frame bytes (derived from `JSON.stringify` at module load), each column's JSON string bytes (UTF-8 length plus escape overhead: +1 for `"` `\` `\b` `\t` `\n` `\f` `\r`, +5 for other control units), and each row's `[`, class string, separators and cells (null 4; INTEGER/REAL/BLOB length + 2; TEXT as for column names) | exact, and checked in the test against `Buffer.byteLength(JSON.stringify(frame))` |

The same D3 classifier types parameters and row values. Its intrinsics are captured at module load (`Function.call.bind`), and every loop is index-based.

### 7.3 Departures from the design and conflicts (for the lead and the design owner)

- **C1, TEXT well-formedness (an addition to D3).** D3 says "string → TEXT". The codec refuses a string with an unpaired surrogate (`text_not_well_formed`), because SQLite cannot store it faithfully. Today such a parameter silently becomes U+FFFD on read.
- **C2, the facade's input typing contradicts D3.** `query/application-database-input.js:136-155` maps booleans to 1/0, refuses fractional numbers and BigInt, and maps -0 to 0. D3 refuses booleans, types every number REAL and admits BigInt. WP3 must decide whether the facade consumes D3 or keeps a documented facade contract layered on it. Two independent tables are a second classifier.
- **C3, the presentation boundary has several exits** (3.4). These do not pass through `executeSelect`/`executeQuery` today:
  - `executeOnPartition(s)` consumers;
  - the join-backfill raw QUERY;
  - the partition-direct `executeQuery` readers.

  WP3 must present at each exit, or move those callers.
- **C4, the "13 consumers".** The recount gives 19 live consumers plus a hub. The GSI post-processing named in design §1.3 G has no production caller (3.3), so WP3 deletes it.
- **C5, the durable hop list.**
  - The design lists "split-mirror replay, transaction-session statement replay, statement-outcome table" as stores of values. In fact:
    - the statement-outcome table holds no params or rows;
    - the split mirror persists only a cursor and replays from the raft log;
    - the session is volatile; the durable form is `_participant_transactions.operations_text`.
  - The census adds stores the design did not list: three position-free stores (pilot cutover, the GSI backfill cursor, the split key) and message-group CDC commands.
- **C6, v1 retirement.** "Snapshot and compaction once no retained log holds pre-fence entries" is not sufficient:
  - derived rows with pre-fence positions survive compaction inside snapshot images;
  - today's compaction is leader-only and refuses control-plane partitions.

  The witness in 5.8 counts both.
- **C7, two files, not one.**
  - The repository's literal audit refuses exported literal constants outside a `*-constants.js` owner. The precedent is `raft/raft-rs-proposal-codec.js` with its `-constants.js`.
  - The codec is therefore `sql-value-codec.js` plus `sql-value-codec-constants.js`. The shape knowledge stays in the first.
- **C8, a second refusal code.**
  - The design names only `SQL_VALUE_CODEC_INVALID`.
  - The codec adds `SQL_VALUE_UNREPRESENTABLE` for encoder-side (D3) refusals, because consumers must decide on them differently. A client parameter refusal is the client's error; an invalid frame is a producer defect.
- **C9, a per-row byte entry point.**
  - Today the partition producer refuses at the row that crosses `resultMaxBytes`.
  - `typedRowSetByteLength` is whole-frame. WP3 adds a per-row encode and byte entry point if the producer keeps crossing-row refusal.
  - It was not exported now, so that no export lacks a consumer.
