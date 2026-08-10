# Design decisions: partition-callback-read-failure-typed-outcome

Status: working notes during implementation (2026-08-10, base 5da367c47
lineage, implemented on current main).

Prior art: the silent-continue closure-ledger class (CL-029, CL-030,
CL-013, CL-008 — components that swallowed a failed sub-step and
continued as if it succeeded), and the sibling `executeSelect` path,
which already propagates partition read failure as a typed outcome
(`buildDistributedFailureSummary` / `firstFailedParticipant`,
src/query/sql-query-engine-select-execution.js:587-593 single-partition
precedent: `!first.success` becomes `{success:false, error, errorCode}`).
ARCH-0139 (docs/steering/system-guidelines.md §6): missing rows must
surface as typed owner outcomes or diagnostics.

## D1 — Dispatcher partitions results; the typed entry reuses the

existing participant-failure owner

`PartitionCallbackDispatcher.dispatch` no longer filters
per-partition results to the successful subset. It partitions them:
successes become batches, failures become typed entries built by
`buildParticipantFailureEntry` (src/query/query-execution-budget.js) —
the SAME builder the executeSelect distributed-failure summary uses, so
partitionId/error/errorCode/participantNodeId/retryAfterMs/deferRetry/
backpressured/failedTable have one owner and one shape. No new
failure-entry grammar was invented.

- All-reads-failed (`batches.length === 0 && failedPartitions.length >
  0`): non-success typed outcome `{success:false, error:
  ADAPTER_ERROR_MSG.PARTITION_CALLBACK_ALL_READS_FAILED, errorCode:
  QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE, failedPartitions,
  deferRetry?, retryAfterMs?}`. `DISTRIBUTED_PARTICIPANT_FAILURE` is the
  errorCode the write path already uses for participant failure — reused,
  not minted.
- Partial failure: `{success:true, batches, failedPartitions}` — the
  fail-closed floor from the sealed statement: partial success stays a
  typed partial outcome, never all-or-nothing data loss.
- Retry semantics (deferRetry/retryAfterMs) are lifted from the FIRST
  typed entry, following the `firstFailedParticipant` precedent in
  `buildDistributedFailureSummary`.

## D2 — hostResult carries the read failures; empty-because-failed is

distinguishable from succeeded-with-zero-rows

`executePartitionCallback` folds `dispatchResult.failedPartitions` into
the host aggregate via `mergePartitionReadFailuresIntoHostResult`:
`totalPartitions`/`failedPartitions` count every RESOLVED partition (not
only partitions that produced a batch), `state` flips to `failed`, and
the typed entries ride `hostResult.failedPartitionReads`. On total read
failure the host is never invoked (no batch exists; the callback must
not run) and `buildPartitionReadFailureHostResult` synthesizes the
aggregate so artifacts record "N partitions, N failed" instead of the
pre-fix `totalPartitions 0`. The two zero-row shapes now differ:

- succeeded-with-zero-rows: `state completed, failedPartitions 0`, no
  `failedPartitionReads`.
- empty-because-failed: `success false` at the request level, `state
  failed, failedPartitions N, failedPartitionReads` populated.

The helpers live in partition-callback-dispatcher.js (read-failure
ownership stays with the component that observed the failures); the
CallbackExecutionHost contract (callback INVOCATION results) is
untouched.

## D3 — Delivery-lane parity with executeSelect

The dispatcher's `executeOnPartition` call previously passed NO
executionOptions, so callback reads of system tables rode the default
lane with no `failedTable` attribution. It now passes `{tableName,
deliveryPriority: resolveRoutedDeliveryPriority(tableName)}` — the same
resolver `executeSelect` uses (system tables → critical lane,
transaction-bookkeeping tables → background). The resolver is injected
at engine construction (sql-query-engine-instance-initializer.js) like
the existing `isSystemTable`/`getTablePartitions` deps; the dispatcher
does not re-derive routing policy (owner decides, caller observes).
`preferSameLatencyGroup` stays effectively false — no locality change
was smuggled in.

## D4 — Where the failover throw lives (caller survey)

Consumers of the dispatch result / hostResult shape:

- `executePartitionCallback` (engine): handles non-success dispatch,
  returns the typed failure result (D2). Its `failedPartitions` field is
  the typed entries array (the sealed statement's shape); note
  `hostResult.failedPartitions` remains a COUNT — pre-existing host
  naming kept to avoid breaking `partition-callback-integration.test.js`
  and admin consumers.
- Admin envelope (admin-query-result-message-envelope.js):
  `success:false` already routes to the ERROR envelope kind and copies
  `error/errorCode/deferRetry/retryAfterMs` — no change needed; the new
  outcome flows through as a typed error frame.
- Harness node handle (cluster-node-handle-layer.js
  `_resolvePendingQuery`): rejects the `partitionCallback` promise on an
  error frame with `code/deferRetry/retryAfterMs` attached — so the
  examples-catalog scenario's `partitionCallbackAcrossNodes` failover
  engages on the thrown rejection WITHOUT any consumer weakening the
  typed outcome (no `success` sniffing added).
- Examples runner (scripts/examples: admin-ws-client.js rejects on
  `message.error`; validate-output.js / run-examples-catalog.js read
  `hostResult.partitionResults` — tolerant of the added fields).
- No other `dispatch(`/`hostResult` consumers exist in src/ or scripts/
  (grep survey recorded in the quest log).

## D5 — Harness anti-affinity inversion

`buildCandidateNodeOrder` special-cased "preferred node is the seed" by
iterating `preferredReadNodes` (non-seed-first), demoting the RESOLVED
replica host to last exactly when all of a table's replicas live on the
seed. Fix: the resolved host is unconditionally the first candidate;
remaining nodes stay failover candidates. The kept test "prefers
non-seed callback routes when the seed is degraded" encodes the real
fallback contract (replica resolution finds nothing → non-seed-first
preference) and still passes; the new test "routes to the seed when the
seed is the only replica host" locks the inversion fix.
