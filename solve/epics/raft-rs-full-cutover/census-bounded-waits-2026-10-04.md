# Census: bounded waits in src/ and where a spent bound is reported (2026-10-04)

Owner rule (2026-10-04): "A spent wait is a failure, and is visible. Every
timeout, backstop and exhausted retry logs one ERROR naming what was awaited
and the last observed state." The reason given: every earlier case of a fully
spent timeout hid a real bug. This week's evidence: a 60 s voter-ready timeout
whose expiry manufactured the failure, a 30 s consensus-exit backstop accepted
as normal, a raft-rs core trap that reached only stderr, and a last-voter
refusal that was not logged at all.

This record is filed under `raft-rs-full-cutover` because the evidence and the
waits are production consensus, membership and bootstrap paths on the cutover
line. The apparatus epic owns proof tooling, not production visibility.

Base: `origin/finalize/zero-liferaft-2026-10-02` at `2b4483f9f`. Branch:
`quest/spent-waits-are-failures`.

## How it was measured

- **Candidate files:** 524 files in `src/` match a timer, deadline, retry or
  poll pattern (`setTimeout|setInterval|Promise.race|timeoutMs|TIMEOUT|deadline|backstop|maxAttempts|maxRetries|retryBudget|exhausted|attempts >=|poll`).
  They were split by subsystem into six groups. Every hit in every file was
  read at its site and classified as one of:
  - `bounded_wait`: something is awaited, and a bound ends the wait if it does
    not arrive.
  - `scheduling`: the wait is expected to expire. This covers periodic ticks,
    debounces, TTLs, idle timers, sleeps between retries, yields, and
    `forwarded:<owner>` (the site only passes a timeout through to its owner).
- **Reporter:** `src/logging/wait-bound-spent.js` (`reportWaitBoundSpent`)
  emits one ERROR per spent bound:
  `{event:'wait_bound_spent', wait, awaited, boundMs, elapsedMs, lastObserved, scope, repeats}`.
- **`lastObserved = nothing`:** the site has no state to report. That is
  itself a finding.

## Totals

| Subsystem | Bounded waits | Scheduling | Wired | Deferred to merge | Not wired | Logged before (any level) | ERROR before | lastObserved = nothing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| admin | 7 | 6 | 6 | 0 | 1 | 3 | 0 | 0 |
| bootstrap | 31 | 43 | 31 | 0 | 0 | 19 | 5 | 0 |
| cdc | 9 | 7 | 3 | 0 | 6 | 5 | 0 | 0 |
| cli | 6 | 6 | 0 | 0 | 6 | 0 | 0 | 0 |
| config | 2 | 1 | 2 | 0 | 0 | 2 | 0 | 1 |
| constants | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| control-plane | 7 | 37 | 5 | 2 | 0 | 2 | 0 | 0 |
| debug-runtime | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 2 |
| diagnostics | 1 | 2 | 1 | 0 | 0 | 1 | 0 | 0 |
| function | 1 | 0 | 1 | 0 | 0 | 1 | 1 | 0 |
| live-query | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| logging | 1 | 7 | 0 | 0 | 1 | 0 | 0 | 0 |
| message-group | 3 | 10 | 3 | 0 | 0 | 1 | 0 | 0 |
| migration | 2 | 4 | 2 | 0 | 0 | 2 | 0 | 0 |
| node | 7 | 17 | 6 | 1 | 0 | 3 | 0 | 1 |
| partition | 11 | 29 | 11 | 0 | 0 | 8 | 2 | 0 |
| query | 23 | 25 | 20 | 0 | 3 | 2 | 1 | 3 |
| raft | 2 | 10 | 0 | 1 | 1 | 0 | 0 | 2 |
| rebalancer | 19 | 48 | 18 | 0 | 1 | 7 | 1 | 1 |
| root | 4 | 5 | 4 | 0 | 0 | 2 | 1 | 0 |
| runtime | 12 | 6 | 4 | 0 | 8 | 0 | 0 | 0 |
| service | 6 | 6 | 2 | 0 | 4 | 0 | 0 | 0 |
| storage | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| test-helpers | 2 | 3 | 0 | 0 | 2 | 0 | 0 | 1 |
| threading | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| time | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| topology | 5 | 7 | 5 | 0 | 0 | 4 | 0 | 0 |
| transport | 14 | 12 | 8 | 0 | 6 | 8 | 3 | 6 |
| utils | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| wasm-service | 1 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| workflow | 1 | 3 | 1 | 0 | 0 | 1 | 1 | 0 |
| **all** | **180** | **304** | **133** | **4** | **43** | **71** | **15** | **17** |

Bounded waits by how expiry was logged before this change: none 109, debug 4,
info 7, warn 45, error 15. Where a site already logged the expiry with
equivalent content, that line was replaced by the reporter, so no expiry
logs twice.

## Residual follow-up (verifier residuals on a3db6b353)

This section supersedes the rows it names in the tables below. Those rows
are kept as first recorded, so the history stays readable.

**Totals after the follow-up:**
- 174 bounded waits.
- 132 wired.
- 5 deferred to merge.
- 37 not wired.

**How the totals moved:**
- 12 wired rows were reclassified as scheduling (not a bounded wait).
- 6 rows were added: leader-publication, handoff x2, ready-drain cap, persistence stall at runtime owner :361, and publication ack.
- 6 core-path CDC rows were wired.
- The logs sink's own retry budget was wired.
- persist.js:157 was wired.

### Reporter (src/logging/wait-bound-spent.js)
- `lastObserved` and `scope` may be observer functions. The reporter evaluates them inside its own guard. A throwing observer becomes `{state:'observation_failed', error}`.
- The flood rule folds a (wait, subject, state) only within `WAIT_BOUND_SPENT_FOLD_WINDOW_MS` (60 s). After that, a later incident for an unchanged subject is visible again, with `repeats`.
- An observation is never dropped:
  - A circular or BigInt observation becomes `{state:'unserializable', keys}`.
  - An observation over `WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS` (4096) becomes `{state:'truncated', serializedChars, preview}`.
- A report whose scope names the logs table goes through `LoggingService.logConsoleOnly` and never back into the logs table. The scope names it through `tableName`/`tableId` `logs`, or through a logs-table `partitionId` resolved by `resolvePartitionTableId`. The logs sink's own waits pass `sink: CONSOLE_ONLY`.
- Residual: two waits on a logs write path do not carry the table, so their reports for a logs write can still persist:
  - the transport pending-response deadline (its `responseContext` is opaque);
  - the pending-request ACK tracker.
  - Each is bounded by `maxPendingWrites` and class-C shedding.

### Rows reclassified as scheduling (unwired; the base log line is restored)
| Site | Reclassification |
| --- | --- |
| src/entrypoint-runtime-shutdown-lifecycle.js:268 `SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS` | Time-box. A best-effort shutdown step is boxed at 3 s and its expiry is the designed exit path. The base WARN is restored. Declared `ends-on: n/a timebox`. |
| src/bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js:115 `READINESS_PROBE_ASYNC_TIMEOUT_MS` | Probe fallback. Async diagnostics are time-boxed for the HTTP probe, and the sync snapshot is the designed answer. The base DEBUG is restored. |
| src/control-plane/pressure-governor.js:767 `PRESSURE_ADMISSION_MAX_WAIT_MS` | Backpressure hint. Expiry resolves the plain DEFER, and the bound belongs to the caller's retry loop. The base logged nothing, and nothing is logged now. pressure-admission-wait-report.js is deleted. |
| src/bootstrap/phases/wait-for-leadership-phase.js:142, seed-contact-failure-owner.js:97 and :221, create-message-group-phase.js:558/593, query-system-state-phase.js:612, connect-websocket-phase.js:461 | Resume iteration. Each is one iteration of the join resume loop and throws a retryable error that the loop resumes. The spent wait is the loop's budget, already reported once at node-joining-admission-readiness.js:700/:724 (`retryableJoinResumePolicy.maxElapsedMs/maxAttempts`). The base lines are restored, and join-registration-wait-report.js is deleted. wait-for-leadership-phase.js:200 stays wired. |
| src/config/dynamic-config-startup-wiring.js:114 (x2: initial read 300 ms, controller init) | Startup time-box. Defaults apply now and CDC applies the stored values later. The base WARNs are restored. |
| src/rebalancer/operation-workflow-recovery-status-reconcile.js:743 (exempt REPLACE) | Not a bound. The budget of a time-exempt REPLACE is diagnostic only (`recordReplaceBudgetDiagnostic`) and never changes state. The failing-timeout row :762 stays wired. |

**Branches narrowed (rows stay wired):**
- message-router-peer-liveness.js ping: the alive-by-inbound branch is back to INFO `PING_TIMEOUT_SATISFIED_BY_INBOUND`. Only the dead branches (connection replaced, no recent inbound) report.
- message-router-connection-close-reconnect.js keepalive: the alive branch is back to INFO. Only the sever branch reports, with a stable `lastObserved` (the volatile `lastInboundAgoMs` is removed).
- rpc-client.js:132 is kept and folds on `subject = "<target> <requestType>"`.
- The four `runRetryableControlPlaneWrite` callers now pass logger, scope and wait:
  - system-metadata-owner-base `controlPlaneWriteRetryTimeoutMs`, with scope {ownerName, tableName, operation};
  - replica-handler-status `REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS`;
  - partition size `PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_TIMEOUT_MS`;
  - raft write commit `PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`.

### Rows added or newly wired
| Site | Kind | Wait | Awaited | Bound | On expiry | Logged before | Wiring | lastObserved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| src/partition/partition-service-metadata-mutation-helpers.js:400 | retry_exhausted | LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS | durable partitions.leader_node_id publication accepted | 8 scheduled retries (once per episode) | silently_continue (the retry continues at a capped cadence) | error (bespoke; replaced) | wired | typedEvent, leaderNodeId, attempts, nextDelayMs; scope nodeId/partitionId/replicaId |
| src/rebalancer/operation-workflow-owner-handoff-state.js:608 | timeout | COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT | coordinator-created operation handed off to its remote owner (arm path) | step timeout unless the operation budget is active | silently_continue (clear the retry, answer false) | none | wired (shared reporter in coordinator-created-handoff-scheduling.js:134, subject=operationId) | workflowStep, stepTimedOut, operationBudgetActive, deadline, type, status (observer) |
| src/rebalancer/operation-workflow-owner-ports.js:805 | timeout | COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT | same (remote-owner wake port) | same | same | none | wired (same reporter and subject: folds with :608) | same |
| src/raft/raft-rs-runtime-owner.js:922 | retry_exhausted | RAFT_RS_READY_DRAIN_MAX_CYCLES | core has no further Ready | 64 cycles | return_failure_state (hostFailure) | none | deferred_to_merge | cycles, maxCycles |
| src/raft/raft-rs-runtime-owner.js:361 | deadline | PERSISTENCE_ADMISSION_WAIT.BOUND_MS | store admits durable writes for a taken Ready | 120000 | return_failure_state (READY_PERSISTENCE / USER_TRANSACTION_OPEN) | none | deferred_to_merge (replaces the import-fence row of raft-rs-persistence-admission.js:54, which becomes not_wired:forwarded) | phase, reason |
| src/control-plane/membership-publication-acknowledgement.js:38 | deadline | publication ack timeout (options.timeoutMs) | every required node acknowledges | options.timeoutMs | return_failure_state (ACK_TIMEOUT) | none | not_wired:dormant (no production producer passes timeoutMs; if one is ever added, wire it in persist.acknowledgePublication) | nothing:dormant |
| src/cdc/cdc-routed-mutation-readiness.js:422/:441/:505 (were :352/:423), :580/:636 (was :494) | deadline | cdc_routed_mutation_retry_budget | routed system-table mutation accepted within the query execution budget | options.queryTimeoutMs | return_failure_state / throw_typed | none / warn per attempt | wired (one line per write, by latch) | phase, attempt, remainingBudgetMs, requestedDelayMs; scope nodeId/tableName |
| src/cdc/cdc-routed-mutation-readiness.js:617 (was :528) | retry_exhausted | CDC_DEFAULTS.RETRY_MAX_ATTEMPTS | routed system-table mutation accepted by the engine | 6 | throw_typed | warn per attempt | wired (retryable last error only) | attempts, maxAttempts, errorCode, retryAfterMs; scope nodeId/tableName |
| src/cdc/cdc-integration-service-authoritative-catchup.js:345 (was :316) | retry_exhausted | CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE | authoritative catch-up read of one system table hydrated | 3 deferred retries | return_failure_state | warn (kept) | wired (subject `<table>@<partitionId>`, folds) | attempts, lastFailure, retryAfterMs; scope nodeId/tableName/partitionId |
| src/cdc/cdc-integration-service-cache-visibility-wait.js:385 (was :358) | retry_exhausted | authoritative_visibility_repair_attempts | authoritative confirmation of the visibility hole | 2 within the remaining budget | fallthrough_alternative | none | wired (not on shutdown) | attempts, maxAttempts, remainingBudgetMs, visibilityState; scope nodeId/tableName/key |
| src/control-plane/membership-publication-coordinator-persist.js:186 (was :157) | retry_exhausted | PUBLICATION_WRITE_MAX_ATTEMPTS | durable publication row satisfying the desired state | 3 | silently_continue (returns the unconfirmed row as if persisted; unchanged) | none | wired | attempts, outcome `unconfirmed_row_returned_as_persisted`, status, publicationEpoch, acknowledgedCount |
| src/logging/logs-table-service-flush-helpers.js:111 | retry_exhausted | LOGS_TABLE_DEFAULT.MAX_RETRIES | one log entry written to the logs table | maxRetries | throw_typed | console.warn by the caller | wired (sink CONSOLE_ONLY: cannot re-enter the logs table) | attempts, retryDelayMs, lastError, lastErrorCode, pendingWrites |

**Classified, not a wait:** src/control-plane/readiness-planning-completion-admission-methods.js:349. This is a synchronous bounded re-capture (`INITIAL_BOOTSTRAP_RECAPTURE_LIMIT=1`): no time passes and no event is awaited. On exhaustion the queued macrotask build owns the record.

### Wire at merge: src/raft/raft-rs-runtime-owner.js (after merging origin/finalize/zero-liferaft-2026-10-02 at 585aaa93a)
Line numbers in steps 4-6 are those of the PR branch at 585aaa93a (this branch's numbers in parentheses, as in the rows above); the text anchors are authoritative.

Use the branch's fence-safe seam: `group.reportFault(kind, fields)`, which raft-rs-operation-port.js injects as `reportRaftRsRuntimeFault` (raft-rs-runtime-fault-log.js).

1. **raft-rs-runtime-owner-constants.js:** add these to `RUNTIME_FAULT_REPORT`:
   - `READY_DRAIN_BOUND_EXCEEDED`
   - `PERSISTENCE_ADMISSION_BOUND_EXCEEDED`
   - `INBOUND_DRAIN_ADMISSION_BOUND_EXCEEDED`
2. **raft-rs-runtime-faults.js:** add and export `reportWaitBoundExceeded(group, kind, fields)`. It forwards to `report`.
3. **raft-rs-runtime-fault-log.js:**
   - Import `reportWaitBoundSpent`.
   - Map the three kinds to `{wait, awaited, boundMs}`:
     - `RAFT_RS_READY_DRAIN_MAX_CYCLES`
     - `PERSISTENCE_ADMISSION_WAIT.BOUND_MS`
     - `PERSISTENCE_ADMISSION_WAIT.BOUND_MS (inbound drain)`
   - At the top of `reportRaftRsRuntimeFault`, when the kind is mapped, call `reportWaitBoundSpent(undefined, {...spent, elapsedMs, lastObserved: rest, scope: {groupId, replicaIdentity, peerId}})` and return.
4. **:931** (this branch :922; anchor `if (cycles >= RAFT_RS_READY_DRAIN_MAX_CYCLES) {` in `drainReady`): before `return hostFailure(`, insert `reportWaitBoundExceeded(group, RUNTIME_FAULT_REPORT.READY_DRAIN_BOUND_EXCEEDED, {cycles, maxCycles: RAFT_RS_READY_DRAIN_MAX_CYCLES});`.
5. **:1432** (this branch :1423; anchor `if (group.timers.now() >= group.inboundDrainDeadline) {` in `retryInboundDrainWhenAdmitted`): before `group.inboundDrainDeadline = null;`, insert `reportWaitBoundExceeded(group, RUNTIME_FAULT_REPORT.INBOUND_DRAIN_ADMISSION_BOUND_EXCEEDED, {elapsedMs: group.timers.now() - (group.inboundDrainDeadline - PERSISTENCE_ADMISSION_WAIT.BOUND_MS), queuedInbound: group.inbound.length});`.
6. **:369** (this branch :361; anchor `exceeded: () => groupHostFailure(group, RUNTIME_PHASE.READY_PERSISTENCE,` in `admissionWaitOutcomes`): make it a block body. It calls `reportWaitBoundExceeded(group, RUNTIME_FAULT_REPORT.PERSISTENCE_ADMISSION_BOUND_EXCEEDED, {phase, reason})` and then returns the unchanged `groupHostFailure(...)`.
7. **Witnesses:**
   - a fault-log unit test (each kind gives 1 `wait_bound_spent`; CORE_TRAPPED is unchanged);
   - persistence-admission.test.js variants with a manual clock past BOUND_MS for the taken Ready and for the inbound drain (same host failure, envelopes still queued, 1 line each);
   - the ready-drain cap through a core stub whose `has_ready` stays true.
   - Mutation-check each one.
   - Re-run restart-from-durable-record.test.js to prove the import fence holds.
- **membership-publication-coordinator-reconcile.js:787** `OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS`: as before, wire at the one-spread-authority merge.
- **replica-removal-consensus-exit.js:129:** as before. It stays reported once, at its caller.

### Expected in a healthy five-node formation: none
A formation's `wait_bound_spent` lines sort mechanically by `wait`. Any `wait` that is not in the findings table below is a regression. These values are wired and must not fire in health:
- `PING_TIMEOUT_MS` (dead branches only)
- `PING_TIMEOUT_MS x pingMaxMissed (keepalive)` (sever only)
- `REBALANCE_OPERATION_STEP_TIMEOUT` (failing timeout, :762)
- `retryableJoinResumePolicy.maxElapsedMs`
- `retryableJoinResumePolicy.maxAttempts`
- `controlPlaneWriteRetryTimeoutMs`
- `REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS`
- `PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_TIMEOUT_MS`
- `PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`
- `joinAdmissionWriteRetryTimeoutMs`
- `leadershipWaitTimeoutMs`
- `COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT`
- `cdc_routed_mutation_retry_budget`
- `CDC_DEFAULTS.RETRY_MAX_ATTEMPTS`
- `authoritative_visibility_repair_attempts`
- `PUBLICATION_WRITE_MAX_ATTEMPTS`
- `LOGS_TABLE_DEFAULT.MAX_RETRIES`
- every other wired row of the tables below

**No longer emitted:**
- `SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS`
- `READINESS_PROBE_ASYNC_TIMEOUT_MS`
- `PRESSURE_ADMISSION_MAX_WAIT_MS`
- `joinRetryPolicy.retryTimeoutMs`
- `seedContactEvidenceWindow.budget`
- `JOIN_NODE_REGISTRATION_MAX_ATTEMPTS`
- `DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS`
- `DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS`
- the metadata-ingress `leadershipWaitTimeoutMs` at wait-for-leadership-phase:142

### Known findings (owner)
These are kept wired, with behaviour unchanged.

| wait | Site (expiry branch) | Owner | Observed rate |
| --- | --- | --- | --- |
| `REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS` | replica-handler-voter-readiness-methods.js:234 (60 s voter-ready) | node/replica lifecycle | 0-4/run (judge 14, frozen 9) |
| `REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS` | replica-handler-remove-execution-methods.js:57 (`removal-commit-backstop-elapsed`) | membership/removal | 2 across all sets |
| `REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS` | replica-state-machine-timeouts.js:132 | rebalancer/replica state machine | 0-4/run |
| `CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS` (+ `BACKGROUND_MAX_ATTEMPTS`) | cdc-group-propagation-delivery-methods.js:120/:371/:407/:577 | CDC group propagation | 18 in f3 only |
| `FUNCTION_DEFAULT.QUERY_TIMEOUT_MS` | function-query-executor.js:167 | query/function | 0-4/run |
| `table_partition_target_node_wait` | sql-query-engine-select-execution.js:188 (provisioning target-node wait, via provision-target-methods.js:212/245) | query provisioning | 0-4/run |
| `CACHE_WAIT_TIMEOUT_MS` | cdc-integration-service-cache-visibility-wait.js:198 (fast path before the designed authoritative repair) | CDC | undetermined (unlogged at base) |
| `swimSuspicionTimeoutMs` | membership-swim-detector.js:379 (suspicion declares DEAD) | control-plane membership (SWIM) | undetermined |
| `LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS` | partition-service-metadata-mutation-helpers.js:400 | partition leader publication | 1 in judge/run3, 1 in f1 (base ERROR "Leader-row publication retry budget exhausted"; already an ERROR at base, not a new red) |
| `CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE` | cdc-integration-service-authoritative-catchup.js:345 (deferred reads only) | CDC catch-up; the untyped "Partition service not found" (a read or write racing a split or move) belongs to query routing | see the determination below; expected 0, at most 1 line per table and partition |

**Undetermined (would settle it):**
- `CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE`. Determination from the code (2026-10-05): the base WARN "CDC catch-up hydration table read failed" (14-34 per run in judge/run2 and frozen run-2/run-3, all "Partition service not found") is NOT this wait in the common case. A read with no routable service ends in query-executor-partition-delivery.js `buildFailureResult(PARTITION_SERVICE_NOT_FOUND)` with no details, so `retryAfterMs` is null and `deferRetry` false; the owner-RPC result passes them through unchanged (owner-rpc-read-execution.js `normalizeAuthoritativeQueryRowSet`), no SQL fallback runs, and catch-up breaks on the first attempt without reporting. It reports only when the same `executeOnPartition` call first delivered to a candidate that answered with `retryAfterMs > 0` or `deferRetry` (the `lastFailureDetails` carry-over at :267), or on the transport-preflight deferral. The report now has the subject `<table>@<partitionId>` and `partitionId` in scope, so a repeat folds. Settled by: one live formation on this head counting `wait_bound_spent` lines with this wait (expected 0; any line names its table and partition).
- `RPC_DEFAULT.TIMEOUT_MS (or call timeout)` (transport/rpc-client.js:123). It was a debug line at base, so the recorded runs carry no rate. Settled by: one live formation on this head.

**Logs-sink residual:** any report whose scope `partitionId` resolves to a `logs-*` partition goes console-only (stdout and the pino file), not into the logs table. That includes voter-ready, commit-deadline, removal-backstop and leader-publication reports for a logs-partition replica, not only logs-write waits. An operator who queries the logs table does not see them.

### Findings recorded by this follow-up
- **persist.js:157 (owner: membership publication).**
  - `persistPublicationRow` returns the unconfirmed row in the same shape as a confirmed one. This happens when every upsert is answered but no readback within `PUBLICATION_WRITE_MAX_ATTEMPTS` satisfies the desired state.
  - Callers such as `acknowledgePublication` cannot tell it from a durable row.
  - It is now visible, as one `wait_bound_spent` with outcome `unconfirmed_row_returned_as_persisted`.
  - The fix belongs to the owner: a typed unconfirmed answer, or a throw.
- **rebalance-coordinator-owner-facade.js:115 (owner: rebalancer).** This is a dead call, not a live TypeError.
  - `waitForReplicaOperationCacheVisibility` delegates unguarded to a repository method that no repository defines (removed in e2797b6c8).
  - Nothing in src calls the facade method. Only a test stub in call-activation-pin-planning.test.js:158 names it.
  - It would be a latent TypeError if a caller were added. Delete the facade method and the stub.
- **R4 premise.** `pending.proposal` at partition-service-cdc-stream-base never carried a write payload: it is the ProposalQueue state string. The site is hardened anyway (state name, or type plus serialized size). The function-query site now reports `statementKind` and `sqlChars` instead of a SQL snippet.
- **Cold-reconnect 1 ms delivery bounds** (`READ_/RECOVERY_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS`). These are timer-only waits, now in the one-way baseline (2). The skip is already decided from connection state, so the fix is to skip without a delivery. Whether that delivery kicks a reconnect is unverified.

## Wire at merge, done (2026-10-05)

This section supersedes the `deferred_to_merge` rows named below; those rows
are kept as first recorded. Done on `finalize/zero-liferaft-2026-10-02` after
the three owner-ordered merges (scenario-gates cf36fdf8f, one-spread-authority
875adb033, spent-waits 2e990a00b). Visibility only: no control flow, timeout
or return value changed at any site.

**Totals after the merge wiring:**
- 174 bounded waits.
- 137 wired (132 + the 5 deferred rows).
- 0 deferred to merge.
- 37 not wired. raft-rs-persistence-admission.js:54 moves from "import fence"
  to "forwarded": its expiry answer is the owner's `exceeded()` outcome,
  reported at runtime owner :369. The not-wired count is unchanged.

| Site (merged tree) | wait | Wiring | Witness |
| --- | --- | --- | --- |
| raft-rs-runtime-owner.js `drainReady` (`if (cycles >= RAFT_RS_READY_DRAIN_MAX_CYCLES) {`) | `RAFT_RS_READY_DRAIN_MAX_CYCLES` | `reportWaitBoundExceeded(group, READY_DRAIN_BOUND_EXCEEDED, {cycles, maxCycles})` before the unchanged `hostFailure` | test/raft/raft-rs-backend/runtime-wait-bound-spent.test.js (real Ready loop driven to the cap: each `has_ready` proposes the captured command again) |
| raft-rs-runtime-owner.js `retryInboundDrainWhenAdmitted` (`if (group.timers.now() >= group.inboundDrainDeadline) {`) | `PERSISTENCE_ADMISSION_WAIT.BOUND_MS (inbound drain)` | `reportWaitBoundExceeded(group, INBOUND_DRAIN_ADMISSION_BOUND_EXCEEDED, {elapsedMs, queuedInbound})` before the deadline is cleared | same file (VirtualTimeSource past the bound with a user transaction open; envelopes still queued) |
| raft-rs-runtime-owner.js `admissionWaitOutcomes.exceeded` | `PERSISTENCE_ADMISSION_WAIT.BOUND_MS` | block body: `reportWaitBoundExceeded(group, PERSISTENCE_ADMISSION_BOUND_EXCEEDED, {phase, reason})`, then the unchanged `groupHostFailure(...)` | same file (a taken Ready across an asynchronous send; the same host failure at the bound) |
| membership-publication-coordinator-reconcile.js `driveOwnerMembershipReconcile` race | `OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS` | `reportOwnerMembershipReconcileSpent` when `timedOut`; subject = nodeId (folds per node and state within the window); lastObserved missingCount, ownerAckCompletionPendingCount, publicationEpoch, leadershipTier | test/control-plane/owner-membership-reconcile-wait-bound-spent.test.js (mock timers; the drive still answers true and the transition warn still says reconcileTimedOut) |
| replica-removal-consensus-exit.js:129 backstop | `REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS` | reported ONCE at its caller (replica-handler-remove-execution-methods.js `logReplicaRemovalConsensusExit`); nothing added inside the wait | test/node/replica-removal-consensus-exit-reported-once.test.js (the wait answers BACKSTOP and writes nothing; the caller holds the one report) |

The three runtime kinds go through the group's injected `reportFault` seam
(raft-rs-runtime-faults.js `reportWaitBoundExceeded`), so the runtime owner's
import closure still never reaches logging (restore-path fence:
restart-from-durable-record.test.js green). raft-rs-runtime-fault-log.js
maps the three new `RUNTIME_FAULT_REPORT` kinds to one `wait_bound_spent`
each (scope groupId/replicaIdentity/peerId; the ready-drain cap's bound in
cycles is in lastObserved as `bound`, its `boundMs` is null) and leaves every
other fault line unchanged (unit case in the runtime witness file). Each
runtime wiring was mutation-checked: removing one call reddens exactly its
own witness. The reconcile wiring was mutation-checked the same way.

## Not wired (43) and deferred to merge (4)

| Reason | Count | Sites |
| --- | --- | --- |
| deferred_to_merge (file in flight on a sibling branch) | 4 | membership-publication-coordinator-reconcile.js:787 (`OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS`; on expiry it carries on with only a transition warn); membership-publication-coordinator-persist.js:157 (`PUBLICATION_WRITE_MAX_ATTEMPTS`; on exhaustion it returns the unconfirmed row as if persisted and logs nothing); replica-removal-consensus-exit.js:129 (30 s backstop: reported at its one caller, replica-handler-remove-execution-methods.js; at merge, do not report it again inside the file); raft-rs-runtime-owner.js:1423 (inbound-drain persistence deadline; stops polling silently) |
| time (one sitting) | 17 | cdc: cache-visibility repair attempts, authoritative catch-up per-table attempts, routed-mutation retry attempts and 3 retry-budget rows; admin control-snapshot retry limit; service: call-statement, request-cell-http and dispatcher deadlines, cell-ingress attempts; runtime: 2 WASI wall-time budgets; wasm-executor CPU limit; debug-runtime: 3 |
| cli_ui (interactive CLI; the user sees the failure) | 6 | cli/admin-cli-action-methods.js x4, cli/core/connection-manager.js x2 |
| no production constructor | 6 | transport/websocket-transport.js x3, websocket-transport-provider.js x3 |
| pure_decision_module (returns a typed outcome; the caller reports) | 5 | runtime/oci-host-agent-{admission-table x2, protocol x2, engine-translation} |
| test_helper | 2 | test-helpers/run-entrypoint.js, port-allocator.js |
| import fence | 1 | raft/raft-rs-persistence-admission.js:54. The restore path may not import logging-service.js, so the reporter has to be injected through the group object, which is built in the deferred runtime owner |
| already logged / dead / forwarded | 3 | query-executor-partition-delivery.js:272 (logNoServiceForPartition); query-execution-budget.js:199 (no caller); sql-query-engine-partition-routing-readiness.js:246 (forwarded to cdc visibility wait) |
| one boolean for several refusals | 1 | rebalancer/operation-workflow-transition-retry.js:89 |
| worker-thread blocking loop | 1 | runtime/cell-host-call-protocol.js:218 (`Atomics.wait`; the parent-side message timeout is wired) |
| recursion risk | 1 | logging/logs-table-service-flush-helpers.js:111. An ERROR here re-enters the logging pipeline that just failed; needs an owner decision |

## Findings

- **No observed state at expiry (wired):** 1 site,
  dynamic-config-startup-wiring.js (controller init). The site only knows
  that `initialize()` had not settled.
- **Unbounded waits (no exhaustion, so nothing to report):**
  - operation-workflow-executor-outcome-reconcile-methods.js:479 (backoff
    retry)
  - operation-workflow-terminal-transition-repair.js:141
  - partition-service-transaction-base.js:93 (`waitForRemovalServingDrain`)
  - runtime-service-rebalancer-setup.js:512 and
    service-installation-reconciler-setup.js:80 (sink-wiring polls)
- **raft-rs core trap:** caught in raft-rs-runtime-owner.js `invokeCore`
  (deferred file). Its ERROR carries only the wasm `RuntimeError` text. The
  Rust panic text reaches only stderr, through `console_error_panic_hook`
  (vendor/raft-rs-wasm/src/lib.rs:35). This is not a bounded wait.
- **Dead timeout fields** (2026-10-05: `MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS`, `REPLICA_LIFECYCLE_DEFAULT.{OPERATION,SYNC}_TIMEOUT_MS`, `REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS` and `ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS` were removed with their unread fields; see item 6):
  - `MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS`
  - `REPLICA_LIFECYCLE_DEFAULT.{OPERATION,SYNC}_TIMEOUT_MS`
  - `NODE_LIFECYCLE_DEFAULT.HEARTBEAT_TIMEOUT_MS`
  - `REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS`
  - `TRANSACTION_DEFAULT.TIMEOUT_MS`
  - `PENDING_REQUEST_SHUTDOWN_TIMEOUT_MS`
  - `system-cache-query-service.js` `queryTimeoutMs`
- **Unreachable exhaustion:** `ATTEMPTS_EXHAUSTED` in
  topology-owner-constants.js:109 is never reached from deferDispatchRetry or
  deferTransitionRetry, because neither passes `maxAttempts`.

## Named wait constants (item 6)

**Re-verification repair (2026-10-05):**
- `n/a dead` is checked by the audit: the bound must have no reference in src/ other than its declaration. A reference is a read of its name path, a computed read through a static prefix, or, once a prefix escapes as a value, any `.LEAF` read, `{LEAF}` pattern or `'LEAF'` string anywhere. Five dead claims were refuted: each was assigned to a field that nothing reads. The dead plumbing was removed (no reader, so behaviour is unchanged): `REPLICA_LIFECYCLE_DEFAULT.{OPERATION,SYNC}_TIMEOUT_MS` and the lifecycle manager's two unread fields; `REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS` and `moveTimeoutMs`; `MEMBERSHIP_PUBLICATION_PLANNING.REFRESH_TIMEOUT_MS` and its unread field; `ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS`, `ADMIN_CONFIG_KEY.CACHE_DUMP_TIMEOUT_MS` and the unread `cacheDumpTimeoutMs` field. The config keys (`lifecycle.*TimeoutMs`, `rebalancer.moveTimeoutMs`, `admin.cacheDumpTimeoutMs`) stay in the config schema and definitions; they were already ignored. Three dead claims hold: `NODE_LIFECYCLE_DEFAULT.HEARTBEAT_TIMEOUT_MS`, `TRANSACTION_DEFAULT.TIMEOUT_MS`, `PARTITION_SERVICE_VALUE.PENDING_REQUEST_SHUTDOWN_TIMEOUT_MS`.
- `n/a misnamed` needs a justification of at least three words.
- The timer refusal also matches the timer's own expiry anywhere in the text (`when the timer fires`, `timer expiry`, `timeout elapses`, `deadline expires`).
- The baseline ceiling (2 timer-only entries, may only shrink) is enforced by the audit itself (`TIMER_ONLY_BASELINE_CEILING`), not only by its test.

**Scope gap (follow-up for the lead):** the rule governs by name shape (`*_TIMEOUT*`, `*_BACKSTOP*`, `*_DEADLINE*`), so renaming a wait escapes it. Outside it (text counts over src/, 2026-10-05; a member count may include a non-bound value):

| Name shape | Declarators | Object members |
| --- | --- | --- |
| `*_BUDGET_MS` | 7 | 7 |
| `*_WAIT_MS` | 6 | 1 |
| `*_GRACE_MS` | 4 | 1 |
| camelCase `*Timeout/Deadline/Budget/Wait/Backstop[Ms]` defaults with a numeric value | - | 22 |
| camelCase class fields `this.*{Timeout,Deadline,Budget,Wait,Backstop}Ms =` (distinct names) | 28 | - |

That is about 76 bounds. Adjacent shapes that may hold waits too, not counted above: `*_WINDOW_MS` (7 + 7), `*_RETRY_DELAY_MS` (13 + 7, mostly delays), `*_BACKOFF_MS` (1).

`npm run audit:guidelines` (decision-boundary audit, R07) refuses any named
wait in `src/**/*.js` that lacks a `// ends-on: <event>` declaration on its
line or in the comment lines directly above it. Named waits are declarators
(`const`, `let`, `var`) and object-literal members (plain, `Object.freeze`,
nested; named `ROOT.NESTED.KEY`) whose name matches
`X_(TIMEOUT|BACKSTOP|DEADLINE)[_..._MS]`. Any `_MS` declarator is governed. A
member, or a name without `_MS`, is governed when it holds a bound: a number,
arithmetic, a call, or a non-wait-name reference such as `TIME_MS.MINUTE`.
Config-key strings, reason codes, message builders, shorthand properties and
aliases of a governed name are not bounds.

- **Declarations:**
  - An event must name something in at least three words.
  - `timer`, `the timer`, `Timer` and `its timer` are refused.
  - A bound that is not a wait declares `ends-on: n/a <kind>`. The kind is one of: clamp, margin, lookback, period, ttl, delay, timebox (a budget that is the designed normal exit of a best-effort step), dead (no consumer) or misnamed (not a time).
  - A bare `n/a` is refused.
- **Baseline:** only timer-only waits may be baselined. The audit ignores undeclared, unknown-kind and unnamed-event entries in the shared baseline, and the test refuses them. The timer-only entries are ceiling-guarded one-way.
- **Browser code:** `src/admin/static/test-run-dashboard.html` `REQUEST_TIMEOUT_MS`, a page fetch timeout, is out of scope.

**Counts:**
- **Total:** 47 declarators + 59 object members = 106 governed bounds (54 members and 101 in total after the 2026-10-05 removal of five dead members). The earlier "105-120" was a text count that included config-key strings, message builders and aliases.
- **Declarators:**
  - 30 name an ending event.
  - Non-wait: clamp 9, margin 3, lookback 1, delay 1, timebox 1 (`SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS`).
  - 2 are timer-only (baselined).
- **Members:**
  - 42 name an ending event. These include the 30 s consensus-exit backstop (`REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS`) and the 60 s voter-ready bound (`REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS`).
  - Non-wait: dead 3 (was 8; 5 removed in the 2026-10-05 repair), clamp 2, period 2, margin 1, lookback 1, delay 1, ttl 1, misnamed 1.
- **Dead (no reference in src/ but the declaration; checked by the audit):**
  - NODE_LIFECYCLE_DEFAULT.HEARTBEAT_TIMEOUT_MS
  - TRANSACTION_DEFAULT.TIMEOUT_MS
  - PARTITION_SERVICE_VALUE.PENDING_REQUEST_SHUTDOWN_TIMEOUT_MS
- **Misnamed:** PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS is a 100-character SQL log truncation length.
- **Unreachable consumers** (each is declared with its event):
  - RUNTIME_INTROSPECTOR_DEFAULT.REQUEST_TIMEOUT_MS
  - SNAPSHOT_RECORDER_DEFAULT.CAPTURE_TIMEOUT_MS
  - FUNCTION_DEFAULT.QUERY_TIMEOUT_MS
  - TRANSPORT_DEFAULT.RPC_TIMEOUT_MS
  - PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS
  - PARTITION_SERVICE_VALUE.DEFAULT_TIMEOUT_MS
- **Timer-only (baseline, 2, one-way):** `READ_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS` and `RECOVERY_CANDIDATE_COLD_RECONNECT_DEFER_TIMEOUT_MS`.
  - Site: query-executor-partition-attempt-budget.js:13/15, consumed at :257-258.
  - What they bound: a 1 ms delivery to a candidate that is not connected, cut by design so the next candidate is tried.
  - The event that should end them: none can be named truthfully. The fix is to skip the candidate without a delivery.

## Bounded waits (180)

| Site | Kind | Wait | Awaited | Bound | On expiry | Logged before | Wiring | lastObserved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| src/admin/admin-cache-owner-state.js:80 | retry_exhausted | ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS | a snapshot built under one unchanged cache owner | 2 attempts | throw_typed | none | wired | attempts, cacheOwnerGeneration; scope nodeId |
| src/admin/admin-control-snapshot-local-diagnostics-methods.js:614 | race_deadline | BOUNDED_SNAPSHOT_PROBE_DEADLINE | full local control snapshot resolve | resolveBoundedSnapshotProbeDeadlineMs(queryTimeoutMs) (min 2000 / half budget / margin 2000) | fallthrough_alternative | none | wired | fullResolveState:'in_flight', fallback:'bounded_observation_probe'; scope nodeId |
| src/admin/admin-preflight-snapshot.js:323 | race_deadline | PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS | authoritative discovery cache repair settled | this.authoritativeRepairWaitBudgetMs | return_failure_state | none | wired | repairState:'in_flight'; scope nodeId |
| src/admin/admin-websocket-diagnostics-route-methods.js:436 | deadline | control_snapshot_query_timeout | a pressure-free control snapshot within the caller deadline | options.queryTimeoutMs (caller deadline budget) | throw_typed | warn | wired | attempts, lastOutcome (error code/message / pressure_result / no_attempt_completed) |
| src/admin/admin-websocket-diagnostics-route-methods.js:462 | deadline | control_snapshot_query_timeout | a pressure-free control snapshot within the caller deadline | remaining caller budget <= CONTROL_SNAPSHOT_RETRY_DELAY_MS | return_failure_state | warn | wired | attempts, lastOutcome |
| src/admin/admin-websocket-diagnostics-route-methods.js:483 | retry_exhausted | CONTROL_SNAPSHOT_RETRY_LIMIT | a pressure-free control snapshot | 3 attempts (retry-decision rule retry_limit_exhausted) | return_failure_state | warn | not_wired:time | attempts, decision.reason available |
| src/admin/admin-websocket-query-execution-methods.js:371 | race_deadline | ADMIN_DEFAULT.QUERY_TIMEOUT_MS | SQL query engine answer to an admin query | timeoutMs (default this.queryTimeoutMs = ADMIN_DEFAULT.QUERY_TIMEOUT_MS 30s) | throw_typed | none | wired | queryState:'in_flight', executionMode; scope nodeId/sessionId |
| src/bootstrap/join-readiness-convergence-methods.js:56 | timeout | joinReadinessTimeoutMs | canonical join readiness snapshot ready | resolveJoinReadinessTimeoutMs() | throw_typed | error | wired | error.joinReadiness (reasons, schema versions, missingLeaders, in-flight ops, endpoints, target, epochs, promotion, snapshot revision, timeoutKind) - error log replaced |
| src/bootstrap/node-joining-admission-readiness.js:700 | deadline | retryableJoinResumePolicy.maxElapsedMs | join pipeline completion across retryable resumes | policy.maxElapsedMs | return_failure_state | warn | wired | attempts,maxAttempts,attemptBudgetMode,failureProfile,exhaustionReason,phase,lastError - warn replaced |
| src/bootstrap/node-joining-admission-readiness.js:724 | retry_exhausted | retryableJoinResumePolicy.maxAttempts | join pipeline completion across retryable resumes | policy.maxAttempts | return_failure_state | warn | wired | attempts,maxAttempts,attemptBudgetMode,failureProfile,exhaustionReason,phase,lastError - warn replaced |
| src/bootstrap/node-joining-backfill-merge-and-status.js:395 | timeout | httpTimeoutMs | HTTP POST response from seed/control-plane endpoint | options.timeoutMs // config.httpTimeoutMs | throw_typed | none | wired | url, phase (awaiting_response_headers/awaiting_response_body), status |
| src/bootstrap/node-joining-cdc-subscription-and-backfill.js:351 | retry_exhausted | CDC_REESTABLISHMENT.TIMEOUT_MS / CDC_REESTABLISHMENT.MAX_RETRIES | join CDC listeners registered for every cache-sync event type | 30000 ms / 10 retries | silently_continue | warn | wired | attempts,maxRetries,budgetSpentAtAttempt,lastError,tables,subscriptionStatus - both warns (timeout + exhausted) replaced by one line |
| src/bootstrap/node-joining-operation-ledger-formation-readiness.js:454 | deadline | priorityPlacementFormationTimeoutMs | engaged formation cohort startup authority ready (operation-ledger spread) | resolveOperationLedgerFormationBarrierTiming().timeoutMs | throw_typed | info | wired | state + buildOperationLedgerFormationBarrierLogFields(snapshot) (cohort counts, startup authority state/reasons, handoff, critical placement) |
| src/bootstrap/node-joining-ready-signal-readiness.js:514 | retry_exhausted | readySignalMaxAttempts | durably visible READY heartbeat publication | config.readySignalMaxAttempts | throw_typed | error | wired | attempts,lastError,lastFailureCode - READY_SIGNAL_FAILED error replaced |
| src/bootstrap/node-joining-ready-signal-readiness.js:560 | poll_max | CDC_REESTABLISHMENT.TIMEOUT_MS | CDC subscriptions active before advertising readiness | 30000 | fallthrough_alternative | warn | wired | cdcSubscriptionsActive,subscriptionStatus,pollMs - degraded warn replaced |
| src/bootstrap/owners/bootstrap-join-admission-owner.js:147 | deadline | bootstrapRequestExecutionBudgetMs | bootstrap request assignment work within the seed execution budget | timeoutBudget.configuredBudgetMs | throw_typed | warn | wired | stage=assignment_reservation only |
| src/bootstrap/owners/bootstrap-join-admission-owner.js:545 | race_deadline | bootstrapRequestExecutionBudgetMs | MOVE_REPLICA assignment reservation lock released by the previous holder | remaining execution budget | throw_typed | warn | wired | lock=previous_reservation_still_held (the holder identity is not tracked: partial) |
| src/bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js:115 | race_deadline | READINESS_PROBE_ASYNC_TIMEOUT_MS | async readiness diagnostics for an HTTP probe | 250 | fallthrough_alternative | debug | wired | asyncSettled=false,fallbackPhase,fallbackReady; subject=seed node (re-fires per probe) - debug replaced |
| src/bootstrap/owners/bootstrap-request-owner-handler.js:98 | race_deadline | clientAttemptDeadlineMs | bootstrap join admission snapshot within the joiner attempt deadline | clientAttemptDeadline.remainingBudgetMs - CLIENT_ATTEMPT_DEADLINE_RESPONSE_GUARD_MS | return_failure_state | warn | wired | reported at bootstrap-request-owner.js:601: deferStage, clientAttemptDeadlineState, executionBudgetConfiguredMs |
| src/bootstrap/owners/bootstrap-request-owner.js:574 | deadline | bootstrapRequestExecutionBudgetMs | bootstrap request execution within the seed execution budget (handler checkpoints 377/479/506/593) | timeoutBudget.configuredBudgetMs | return_failure_state | warn | wired | deferStage, clientAttemptDeadlineState, executionBudgetConfiguredMs; subject=joiner nodeId - deferral warn replaced |
| src/bootstrap/owners/bootstrap-request-owner.js:601 | deadline | clientAttemptDeadlineMs | bootstrap request admitted and answered within the joiner attempt deadline (handler checkpoints 141/164/266/322/350) | client deadline remainingBudgetMs at request start | return_failure_state | warn | wired | deferStage, clientAttemptDeadlineState, executionBudgetConfiguredMs; subject=joiner nodeId - deferral warn replaced |
| src/bootstrap/owners/service-leader-readiness-owner.js:233 | poll_max | leadershipWaitTimeoutMs | any live system partition leader among local partition services | config.leadershipWaitTimeoutMs // TIMEOUT_CAP_MS | silently_continue | none | wired | partitionServiceCount,partitionIds,liveLeaderTableCount,lastDelayMs |
| src/bootstrap/owners/service-registration-visibility-owner.js:343 | timeout | SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS | registered service row visible in the services cache | BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS (5000) | throw_typed | warn | wired | timeoutKind,attempts,lastVisibilityCheck (reason/expected/observed/mismatchFields) - warn replaced |
| src/bootstrap/phases/connect-websocket-phase.js:461 | deadline | leadershipWaitTimeoutMs | websocket connection to the seed node (or any cluster peer) | retryPolicy.retryTimeoutMs | throw_typed | warn | wired | attempts,lastError,lastErrorCode,connectedPeerCount,seedWsAddress |
| src/bootstrap/phases/create-message-group-phase.js:558 | deadline | joinRetryPolicy.retryTimeoutMs | message-group replica service registration accepted by the seed | resolveJoinRetryPolicy().retryTimeoutMs | throw_typed | error | wired | attempts,lastError,lastCode,lastStatusCode,retryAfterMs - error replaced for the spent-window case only |
| src/bootstrap/phases/query-system-state-phase.js:612 | retry_exhausted | JOIN_NODE_REGISTRATION_MAX_ATTEMPTS | join node registration accepted by the control plane | joinRegistrationMaxAttempts (2) | throw_typed | warn | wired | attempts,maxAttempts,lastErrorCode,lastError,retryAfterMs |
| src/bootstrap/phases/seed-cache-hydration-phase.js:595 | timeout | leadershipWaitTimeoutMs | seed system-table write leaders visible in the system table cache | config.leadershipWaitTimeoutMs // BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs | throw_typed | none | wired | timeoutKind,attempts,missingCount,missingLeaders |
| src/bootstrap/phases/seed-contact-failure-owner.js:97 | retry_exhausted | joinRetryPolicy.retryTimeoutMs / seedContactEvidenceWindow.budget | bootstrap admission from a seed-contact candidate (SURFACE action) | context.retryTimeoutMs / evidence retry budget | throw_typed | none | wired | attempts,candidateCount,lastError,lastCode,lastStatusCode,lastBootstrapErrorCode,evidenceRetryBudget |
| src/bootstrap/phases/seed-contact-failure-owner.js:221 | deadline | joinRetryPolicy.retryTimeoutMs | bootstrap admission from a seed-contact candidate (loop budget exhausted) | context.retryTimeoutMs | throw_typed | none | wired | attempts,candidateCount,lastError,lastCode,lastStatusCode,lastBootstrapErrorCode,evidenceRetryBudget |
| src/bootstrap/phases/seed-message-groups-phase.js:343 | poll_max | leadershipWaitTimeoutMs | a leader among the seed message-group replicas | config.leadershipWaitTimeoutMs // BOOTSTRAP_DEFAULT | throw_typed | none | wired | replicas[{replicaId,present,leaderId}],lastDelayMs |
| src/bootstrap/phases/seed-partitions-phase.js:506 | poll_max | leadershipWaitTimeoutMs | a live leader for every seed system-table partition | config.leadershipWaitTimeoutMs // TIMEOUT_CAP_MS | throw_typed | error | wired | totalPartitions,leadersFound,missingLeaders,lastDelayMs - error log replaced |
| src/bootstrap/phases/wait-for-leadership-phase.js:142 | poll_max | leadershipWaitTimeoutMs | a local message-group replica metadata-ingress ready | config.leadershipWaitTimeoutMs | throw_typed | none | wired | requiredTables,lastDelayMs,messageGroupReplicaCount,replicas[{replicaId,isLeader,leaderId}] |
| src/bootstrap/phases/wait-for-leadership-phase.js:200 | timeout | leadershipWaitTimeoutMs | system service write leaders visible in the system table cache | config.leadershipWaitTimeoutMs | throw_typed | none | wired | timeoutKind,attempts,missingCount,missingLeaders |
| src/bootstrap/shared/local-query-transport-readiness.js:195 | retry_exhausted | LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.MAX_ATTEMPTS | local query/data-plane transport ready before advertising READY | options.maxAttempts // 6 | throw_typed | none | wired | attempts,state,reason,reasonCode,errorCode,retryAfterMs |
| src/bootstrap/shared/node-state-publication-owner.js:689 | retry_exhausted | nodeStateUpdateTargetCandidates | node-state update delivered to a control-plane target | targetCandidates.length + 1 same-target retry (delivery budget resolveNodeStateUpdateTimeoutMs) | throw_typed | error | wired | attempts,sameTargetRetryCount,lastTargetAddress,lastErrorCode,lastError; subject=state (heartbeat re-fires) - error replaced only for retryable exhaustion |
| src/bootstrap/shared/retryable-control-plane-write.js:58 | deadline | runRetryableControlPlaneWrite.timeoutMs (caller-named via options.spentWait) | retryable control-plane write accepted | options.timeoutMs // 30000 | return_failure_state | none | wired | attempts,lastErrorCode,lastError,retryAfterMs |
| src/bootstrap/shared/startup-convergence-gate.js:341 | timeout | startup_convergence (caller-named via options.spentWait) | startup convergence evaluate() ready | options.timeoutMs | throw_typed | none | wired | attempts,timeoutKind,lastProgressElapsedMs,lastSignalKind,lastResultReady/Reason/MissingCount (or caller describeLastObserved) |
| src/bootstrap/traffic-readiness-utils.js:327 | retry_exhausted | TRAFFIC_READINESS_WAIT_DEFAULT.MAX_ATTEMPTS | lifecycle TRAFFIC_READY / metadata-publication readiness | options.maxAttempts // 6 | throw_typed | none | wired | attempts,phase,ready,reasons,retryAfterMs (subject from caller when re-armed) |
| src/cdc/cdc-confirmation-tracker.js:94 | timeout | CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS | CDC event applied to the local SystemTableCache | timeoutMs // CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS (5s) | throw_typed | warn | wired | confirmed:false, pendingConfirmations; scope tableName/primaryKey |
| src/cdc/cdc-integration-service-authoritative-catchup.js:316 | retry_exhausted | CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE | authoritative catch-up read of one system table hydrated | maxAttemptsPerTable (3) deferred retries | return_failure_state | warn | not_wired:time | lastFailure, tableName available |
| src/cdc/cdc-integration-service-cache-visibility-wait.js:172 | timeout | CACHE_WAIT_TIMEOUT_MS | routed system-table write visible in the local cache | cacheWaitBudgetMs = timeoutMs - authoritativeRepairBudgetMs (CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS 1000) | fallthrough_alternative | none | wired | recordPresent, expectPresent, fallbackPhase; scope nodeId/tableName/key |
| src/cdc/cdc-integration-service-cache-visibility-wait.js:358 | retry_exhausted | authoritative_visibility_repair_attempts | authoritative confirmation of the visibility hole | maxAttempts=2 within the remaining timeoutBudget | fallthrough_alternative | none | not_wired:time | lastResult.visibilityState available |
| src/cdc/cdc-pipeline-readiness-gate.js:186 | poll_max | CDC_PIPELINE_READINESS_TIMEOUT_MS | CDC subscriptions, propagation leader and a first delivery | timeoutMs // CDC_PIPELINE_READINESS_TIMEOUT_MS (30s) | throw_typed | warn | wired | unmetConditions, timeoutKind, lastProgressElapsedMs |
| src/cdc/cdc-routed-mutation-readiness.js:352 | deadline | cdc_routed_mutation_retry_budget | budget left before a retry delay | query execution budget | return_failure_state | none | not_wired:time | remainingBudgetMs available |
| src/cdc/cdc-routed-mutation-readiness.js:423 | deadline | cdc_routed_mutation_retry_budget | budget left for another routed mutation attempt | query execution budget | throw_typed | none | not_wired:time | attempt, tableName available |
| src/cdc/cdc-routed-mutation-readiness.js:494 | deadline | cdc_routed_mutation_retry_budget | retry delay within the remaining mutation budget | waitForRetryBudget(remaining budget) | throw_typed | warn | not_wired:time | attempt, error available |
| src/cdc/cdc-routed-mutation-readiness.js:528 | retry_exhausted | CDC_DEFAULTS.RETRY_MAX_ATTEMPTS | routed system-table mutation accepted by the engine | retryMaxAttempts (6) within queryTimeout budget | throw_typed | warn | not_wired:time | attempt, error, retryAfterMs available |
| src/cli/admin-cli-action-methods.js:34 | timeout | cli_query_timeout | SQL query result (CLI) | 30000 / 10000 / timeoutMs / 10000 | return_failure_state | none | not_wired:cli_ui | queryId |
| src/cli/admin-cli-action-methods.js:373 | timeout | cli_query_timeout | config update result (CLI) | 30000 / 10000 / timeoutMs / 10000 | return_failure_state | none | not_wired:cli_ui | queryId |
| src/cli/admin-cli-action-methods.js:448 | timeout | cli_query_timeout | admin action query result (CLI) | 30000 / 10000 / timeoutMs / 10000 | return_failure_state | none | not_wired:cli_ui | queryId |
| src/cli/admin-cli-action-methods.js:554 | timeout | cli_query_timeout | replica history query result (CLI) | 30000 / 10000 / timeoutMs / 10000 | return_failure_state | none | not_wired:cli_ui | queryId |
| src/cli/core/connection-manager.js:182 | timeout | cli_connection_timeout | admin websocket open | 10000 | throw_typed | none | not_wired:cli_ui | status |
| src/cli/core/connection-manager.js:312 | retry_exhausted | maxReconnectAttempts | CLI reconnect | TRANSPORT RECONNECT_MAX_ATTEMPTS-style maxReconnectAttempts | return_failure_state | none | not_wired:cli_ui | reconnectAttempts |
| src/config/dynamic-config-startup-wiring.js:114 | timeout | DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS | startup dynamic-config key read (per key, call sites 434/452) | options.initialReadTimeoutMs // 300 | fallthrough_alternative | warn | wired | key,promiseSettled=false (caller INITIAL_APPLY_FAILED warn retained: it also covers non-timeout read errors) |
| src/config/dynamic-config-startup-wiring.js:114 | timeout | DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS | adaptive timing controller initialize() (call site 483) | options.controllerInitTimeoutMs // 300 | fallthrough_alternative | warn | wired | nothing:only nodeId + promiseSettled=false - the site cannot see why initialize() stalled |
| src/control-plane/heartbeat-service-lifecycle-methods.js:257 | race_deadline | nodeStateReporterTimeoutMs | node-state reporter acknowledgement of the lifecycle request | resolveNodeStateReporterTimeoutMs(heartbeat write query timeout) = writeTimeout - min(1s, writeTimeout/5) | throw_typed | none | wired | reporterSettled=false, requestedState, publicationMode, requireDurableCompletion, publicationPath, targetNodeId, lastFailureStage, reporterVisibilityState; subject nodeId |
| src/control-plane/heartbeat-service-lifecycle-methods.js:599 | timeout | heartbeatAttemptTimeoutMs | heartbeat attempt completion (stats + node-state publication) | this.heartbeatAttemptTimeoutMs (resolveHeartbeatAttemptTimeoutMs: max(interval, lease/3, transport timeout+1s) capped at readyLease-interval) | return_failure_state | debug | wired | attemptStage(started/stats/publish), publicationPath, targetNodeId, lastFailureStage, reporterVisibilityState; scope nodeId, attemptId, consecutiveFailures; subject nodeId |
| src/control-plane/membership-publication-coordinator-persist.js:157 | retry_exhausted | PUBLICATION_WRITE_MAX_ATTEMPTS | durable publication row satisfying the desired state after upsert + readback | options.publicationWriteMaxAttempts // PUBLICATION_WRITE_MAX_ATTEMPTS = 3 | silently_continue | none | deferred_to_merge | persistedRow (merged durable row) available; nothing logged on exhaustion -- returns the unconfirmed row as if persisted |
| src/control-plane/membership-publication-coordinator-reconcile.js:787 | race_deadline | OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS | reconcileActiveGateMembershipPublication completion (owner-driver tier-0 write) | OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS = 15000 | silently_continue | warn | deferred_to_merge | missingCount, timedOut (warn is transition-only on missing/timedOut change) |
| src/control-plane/membership-swim-detector.js:379 | deadline | swimSuspicionTimeoutMs | refutation (alive at a newer incarnation) of a suspected member | Lifeguard suspicion timeout: max(Min, Max-(Max-Min)*log(C+1)/log(K+1)), Min=suspicionMult*nodeScale*scaledProbeIntervalMs | fallthrough_alternative | none | wired | memberState, incarnation, confirmers, localHealthMultiplier; scope memberNodeId; subject memberNodeId |
| src/control-plane/pressure-governor.js:767 | deadline | PRESSURE_ADMISSION_MAX_WAIT_MS | pressure admission capacity for a deferred work-class waiter | PRESSURE_ADMISSION_MAX_WAIT_MS[workClass] (500/500/1000/2000) | return_failure_state | none | wired | workClass, lastAction, lastReason, sensorThrew, backpressured; scope queuedWaiters; subject workClass |
| src/control-plane/replica-dispatch-replay-health-readiness.js:300 | race_deadline | OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS | authoritative readiness refresh for the dispatch target node | this.dispatchReadinessRefreshTimeoutMs (max(operationDispatchRetryAfterMs, 1000)) | throw_typed | none | wired | refreshSettled=false, decisionDimension, requestedMaxCachedAgeMs (thin: the race holds no state of the pending refresh); scope targetNodeId; subject targetNodeId |
| src/debug-runtime/runtime-introspector.js:204 | race_deadline | REQUEST_TIMEOUT_MS | runtime adapter inspect() | requestTimeoutMs (250ms) | throw_typed | none | not_wired:time | instanceHandle available |
| src/debug-runtime/snapshot-recorder.js:292 | race_deadline | CAPTURE_TIMEOUT_MS | debug snapshot capture | captureTimeoutMs (250ms) | throw_typed | none | not_wired:time | nothing:operation is opaque |
| src/debug-runtime/wasm-runtime-adapter.js:271 | race_deadline | WASM_RUNTIME_DEFAULT.EXECUTION_TIMEOUT_MS | debug runtime handler result | timeoutMs (default 30s) | throw_typed | none | not_wired:time | nothing:no state beyond the request |
| src/diagnostics/formation-attribution-window.js:207 | deadline | LAGRANGE_FORMATION_ATTRIBUTION_DEADLINE_MS | the seed formed signal ending the attribution window | env deadline // DEFAULT_DEADLINE_MS (300s) | silently_continue | info | wired | formedSignal, ended, measurementFailed (elapsedMs unmeasured: the window has no clock) |
| src/embedded-lagrange.js:178 | timeout | APPLICATION_DATABASE_LIMIT.STOP_TIMEOUT_MS | embedded runtime shutdownRuntime() settled | options.stopTimeoutMs // STOP_TIMEOUT_MS | throw_typed | none | wired | handleState only (facade has no logger: singleton fallback) |
| src/entrypoint-runtime-join-decision.js:256 | timeout | AUTO_REJOIN_PROBE_TIMEOUT_MS | auto-rejoin peer probe HTTP response | ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_TIMEOUT_MS | return_failure_state | none | wired | peerBaseUrl,path,responseReceived=false |
| src/entrypoint-runtime-join-startup-policy.js:136 | retry_exhausted | LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS | a successful join across process-level join reattempts | reattemptPolicy.maxAttempts | throw_typed | error | wired | attempts,maxAttempts,phase,lastError (FAILED_JOIN error per attempt retained: different event) |
| src/entrypoint-runtime-shutdown-lifecycle.js:268 | race_deadline | SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS | best-effort shutdown step settled | 3000 | fallthrough_alternative | warn | wired | step,signal,stepSettled=false - warn replaced |
| src/function/function-query-executor.js:153 | race_deadline | FUNCTION_DEFAULT.QUERY_TIMEOUT_MS | SQL engine result for one function query | options.timeout // function.queryTimeoutMs (30000) | throw_typed | error | wired | engineResultPending=true, paramCount, sql snippet (thin: the engine promise exposes no progress) |
| src/logging/logs-table-service-flush-helpers.js:111 | retry_exhausted | LOGS_TABLE_DEFAULT.MAX_RETRIES | log entry written to the logs table | maxRetries (LOGGING MAX_RETRIES 3) | throw_typed | none | not_wired:recursion_risk | lastError available |
| src/message-group/message-group-proposal-routing.js:139 | race_deadline | proposeTimeoutMs (MESSAGE_GROUP_DELIVERY_TIMEOUT_MS / attempts) | local raft port to append the proposed message-group command | computeCdcProposeTimeoutMs(budget) ~ (5000-buffer)/3 | throw_typed | none | wired | attempt, commandType, isCurrentRaftLeader, raftRole |
| src/message-group/message-group-service-outbound-dispatch-runtime-methods.js:271 | retry_exhausted | MESSAGE_GROUP_RETRY_MAX_ATTEMPTS (direct delivery) | acknowledged direct transport delivery to the target service | options.maxAttempts or retryMaxAttempts | fallthrough_alternative | none | wired | maxAttempts, envelopeAttempts, lastError, lastErrorCode, deferRetry |
| src/message-group/message-retry-handler.js:369 | retry_exhausted | MESSAGE_GROUP_RETRY_MAX_ATTEMPTS | an acknowledged delivery within the retry attempt budget | maxRetries+1 attempts (default 3+1; per call maxAttempts) | return_failure_state | warn | wired | maxAttempts, totalAttempts, lastTarget, triedTargetCount, lastError |
| src/migration/migration-coordinator-stage-methods.js:266 | retry_exhausted | MIGRATION_DEFAULT.MAX_RETRY_COUNT | migration cutover transaction committed | MAX_RETRY_COUNT (3) +1 attempts, exponential backoff | return_failure_state | info | wired | attempts, lastError, partitionCount; scope migrationId |
| src/migration/migration-coordinator-stage-methods.js:388 | retry_exhausted | MIGRATION_DEFAULT.MAX_RETRY_COUNT | partition migration operation succeeded | MAX_RETRY_COUNT (3) +1 attempts, exponential backoff | throw_typed | info | wired | attempts, lastError, statusOnFailure; scope migrationId/partitionId |
| src/node/replica-handler-remove-execution-methods.js:567 | backstop | REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS | retiring replica applied configuration no longer names it (removal committed) or group unavailable | 30000 | fallthrough_alternative | info | wired | exitReason, trackedRaftRole, lifecycleState (the last membership observation is held inside the deferred replica-removal-consensus-exit.js and is not visible here) |
| src/node/replica-handler-runtime-metadata-methods.js:108 | deadline | REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS | partition/table metadata visible to resolve the replica context | this.syncTimeoutMs (60000) | throw_typed | none | wired | lastError message, metadataHydratedRows, polls |
| src/node/replica-handler-voter-readiness-methods.js:221 | deadline | REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS | local replica promoted to a routable voter (voter-ready activation) | this.syncTimeoutMs (config REPLICA_HANDLER_SYNC_TIMEOUT_MS, default 60000) | throw_typed | warn | wired | trackedRaftRole, serviceRowPresent/Status/RaftRole/HasAddress, polls |
| src/node/replica-removal-consensus-exit.js:129 | backstop | REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS | removal committed / group unavailable | backstopMs (30000) | return_failure_state | none | deferred_to_merge | nothing:file has no logger; reported by caller replica-handler-remove-execution-methods.js:567 |
| src/node/replica-state-machine-timeouts.js:132 | timeout | REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS | replica left its transient lifecycle state (PENDING 30s / CREATING 60s / SYNCING 5m / REMOVING 60s) | stateMachine.timeouts[state] | return_failure_state | warn | wired | state, revision, previousState, triggerReason (subject=replicaId; REMOVING re-arms and re-fires, folded) |
| src/node/runtime-service-call-cell-handler.js:420 | deadline | Call Cell invocation deadlineMs | Call Cell invocation reached its local actual before its deadline | invocation.deadlineMs (caller-set) | throw_typed | none | wired | overdueMs, hostNodeId, serviceId (start unknown here: elapsedMs unmeasured) |
| src/node/runtime-service-request-cell-handler.js:168 | deadline | Request Cell invocation deadlineMs | Request Cell invocation reached its local actual before its deadline | invocation.deadlineMs (caller-set) | throw_typed | none | wired | overdueMs, hostNodeId, serviceId |
| src/partition/managed-merge-workflow-persistence-methods.js:505 | retry_exhausted | runMergeOwnerLaneStepWithSameOwnerResync.attempts | merge owner lane step accepted after same-owner durable re-sync (CAS) | attempts=2 | throw_typed | none | wired | attempts, stepName, lastError |
| src/partition/managed-split-workflow-cutover-readiness-methods.js:152 | poll_max | QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS | every split child canonical leader serve-routable before cutover | adapter execution budget (engine provisioning timeout) else SPLIT_OPERATION_BUDGET_MS | return_failure_state | warn | wired | refused readiness decision: reason, childPartitionId, leaderNodeId, routableNodeIds |
| src/partition/partition-service-cdc-stream-base.js:312 | deadline | PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS | consensus commit of one admitted partition write | options.timeoutMs // PENDING_REQUEST_TIMEOUT_MS | throw_typed | none | wired | proposal state, logIndex, role, pendingCommitCount |
| src/partition/partition-service-durability-fitness.js:263 | backstop | TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS | open transaction on the leader connection ending (legal hold over the 3-tick strike bound) | LEADER_DURABILITY_LEGAL_HOLD_MS x LEADER_DURABILITY_STRIKE_LIMIT ticks | fallthrough_alternative | error | wired | reason, strikes, role, successorViable, heldMs, candidacyDeferral, demotion |
| src/partition/partition-service-durability-fitness.js:304 | backstop | LEADER_DURABILITY_SUCCESSORLESS_DEMOTION_FALLBACK_MS | a viable durability successor (follower ack inside the viability window) | 15000 ms | fallthrough_alternative | error | wired | reason, strikes, role, successorViable=false, heldMs, candidacyDeferral, demotion |
| src/partition/partition-service-merge-replication-methods.js:766 | poll_max | PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_TIMEOUT_MS | durable merge cutover visible in the local system-table cache | 2 minutes, MERGE_CUTOVER_WAIT_INTERVAL_MS polls | throw_typed | none | wired | cutoverActive=false, transitionAborted=false, polls, targetPartitionVersion, role |
| src/partition/partition-service-transaction-base.js:427 | backstop | TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS | terminal commit or rollback of a held participant transaction (heal deferred on leader/candidate; re-fires per 1s sweep, subject=partitionId) | preparedStateHoldTimeoutMs | silently_continue | warn | wired | phase, outcome=heal_deferred_leader_or_candidate, role, expiredPrepared/ActiveSessionCount |
| src/partition/partition-service-transaction-base.js:457 | backstop | TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS | terminal commit/rollback of a PREPARED participant transaction | preparedStateHoldTimeoutMs | fallthrough_alternative | warn | wired | phase=prepared, outcome=rolled_back_and_marked_lost, role, preparedAt |
| src/partition/partition-service-transaction-base.js:468 | backstop | TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS | terminal commit/rollback of an ACTIVE participant transaction (run-23 zombie class) | preparedStateHoldTimeoutMs | fallthrough_alternative | warn | wired | phase=active, outcome=rolled_back_and_marked_lost, role, startedAt |
| src/partition/pending-request-tracker.js:201 | timeout | PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS | ACK for one tracked request | metadata.timeoutMs // defaultTimeoutMs | throw_typed | warn | wired | type, targetAddress, pendingCount |
| src/partition/pending-request-tracker.js:437 | backstop | PENDING_REQUEST_DEFAULT.STALE_REQUEST_BUFFER_MS | ACK or timeout callback for one tracked request (stale-cleanup backstop) | timeoutMs + STALE_REQUEST_BUFFER_MS | throw_typed | warn | wired | type, targetAddress, pendingCount |
| src/query/cancellation-token.js:122 | timeout | CancellationToken.withTimeout | cancellation-scoped work completing before the token timeout | ms argument | fallthrough_alternative | none | wired | childCancelled, parentCancelled, parentChildTokenCount (thin; no src caller of withTimeout today) |
| src/query/distributed/distributed-transaction-protocol.js:254 | deadline | TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS | distributed transaction commit protocol completion (budget checks in runCommitProtocol + participant-timeout aborts all funnel into abortTimedOutTransaction) | tx.timeoutBudget.configuredBudgetMs (coordinator transactionBudgetMs) | return_failure_state | none | wired | stage, status, commitMode, remainingBudgetMs, participantStatuses counts |
| src/query/distributed/distributed-transaction-protocol.js:606 | deadline | TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS | participant operation inside the transaction budget (pre-attempt/pre-retry budget checks throw QUERY_TIMEOUT) | transaction budget | throw_typed | none | wired | reported once downstream at abortTimedOutTransaction (the thrown QUERY_TIMEOUT becomes a timeout failure -> abort); stage/status/participantStatuses |
| src/query/distributed/distributed-transaction-protocol.js:632 | retry_exhausted | PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES | participant stage operation success | participantRetryMaxRetries (3) with exponential backoff | throw_typed | none | wired | stage, maxRetries, attempts, lastError, lastErrorCode |
| src/query/distributed/parallel-query-coordinator.js:376 | race_deadline | QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS | every partition result of one fan-out chunk (plain and hedged paths) | resolveTimeoutMs(options.timeoutMs) | throw_typed | none | wired | chunkPartitionCount, settledPartitionCount, pendingPartitionIds (<=8), speculativeExecutions |
| src/query/query-execution-budget.js:199 | deadline | createPartitionExecutionBudget execution deadline | partition delivery within executionOptions.timeoutMs | executionOptions.timeoutMs | return_failure_state | none | not_wired:createPartitionExecutionBudget has no src caller (dead duplicate of query-executor-partition-attempt-budget.js) | nothing:not wired (no live caller) |
| src/query/query-executor-partition-attempt-budget.js:325 | deadline | partition_execution_deadline | successful partition delivery (budget spent before router delivery) | execution deadline | return_failure_state | none | wired | site, attempts, lastError, lastErrorCode |
| src/query/query-executor-partition-attempt-budget.js:365 | deadline | partition_execution_deadline | successful partition delivery before the execution deadline (budget spent before retry) | min(parent timeoutBudget.deadlineMs, executionOptions.timeoutMs/queryTimeoutMs) | return_failure_state | none | wired | site, attempts, lastError, lastErrorCode, lastParticipantNodeId, awaitedRoutingRepair (once per executeOnPartition) |
| src/query/query-executor-partition-attempt-budget.js:371 | deadline | partition_execution_deadline | successful partition delivery (retry delay exceeds remaining budget) | execution deadline | return_failure_state | none | wired | site, retryDelayMs, remainingBudgetMs, attempts, lastError, lastErrorCode |
| src/query/query-executor-partition-attempt-budget.js:409 | deadline | partition_execution_deadline | successful partition delivery (budget spent during retry delay) | execution deadline | return_failure_state | none | wired | site, attempts, lastError, lastErrorCode |
| src/query/query-executor-partition-delivery.js:160 | deadline | partition_execution_deadline | successful partition delivery (budget spent before the next attempt) | execution deadline | return_failure_state | none | wired | site, attempts, lastError, lastErrorCode |
| src/query/query-executor-partition-delivery.js:272 | retry_exhausted | getReadRetryAttemptLimit | a routable partition service for a read (no candidates on the last attempt) | read attempt limit | return_failure_state | warn | not_wired:already logged by logNoServiceForPartition and the same branch also serves the no-partition-record (non-retry) case; separating them needs a branch in the 130-complexity executeOnPartition | nothing:not wired |
| src/query/query-executor-partition-delivery.js:806 | retry_exhausted | getReadRetryAttemptLimit | successful partition read within the read attempt limit (also lines 789, 798) | getReadRetryAttemptLimit() (writes: MAX_SAFE_INTEGER, deadline-only) | return_failure_state | none | wired | maxAttempts, attempts, lastError, lastErrorCode, lastParticipantNodeId |
| src/query/query-result-budget.js:39 | deadline | resultDeadlineMs | partition result rows collected before the request deadline | absolute options.deadlineMs (boundMs null: site knows no start) | throw_typed | none | wired | rowsCollected, bytesCollected, deadlineMs, overshootMs |
| src/query/schema-provisioning-job-owner.js:499 | deadline | schema_provisioning_request_deadline | schema provisioning job outcome within the request budget | timeoutBudget (already <=1 ms left) | return_failure_state | none | wired | phase=budget_spent_before_race, workflowStatus, scheduledRetry |
| src/query/schema-provisioning-job-owner.js:508 | race_deadline | schema_provisioning_request_deadline | schema provisioning job outcome within the request budget | options.timeoutBudget remaining - 1 ms | return_failure_state | none | wired | phase=race_timer_fired, workflowStatus, scheduledRetry |
| src/query/sql-query-engine-partition-routing-readiness.js:246 | timeout | table_partition_metadata_wait (cache-repair path) | CDC cache update for partitions/tables row | waitBudgetMs forwarded | throw_typed | none | not_wired:forwarded to src/cdc/cdc-integration-service-cache-visibility-wait.js (wired by its owner group) | nothing:forwarded; reported at the cache-visibility owner |
| src/query/sql-query-engine-partition-routing-readiness.js:274 | poll_max | table_partition_metadata_wait | table + partition metadata rows in local cache | tablePartitionProvisioningTimeoutMs (nested budget) | throw_typed | none | wired | hasPartitionRecord, hasTableRecord, polls (expiry reported in waitForCondition) |
| src/query/sql-query-engine-partition-routing-readiness.js:370 | poll_max | partition_service_metadata_wait | partition service row visible in local cache | tablePartitionProvisioningTimeoutMs (nested budget) | throw_typed | none | wired | usedCacheRepairWait, polls, classification (thin: predicate is a boolean row lookup) |
| src/query/sql-query-engine-partition-routing-readiness.js:485 | poll_max | partition_routing_wait | minimum routable partition service count | tablePartitionProvisioningTimeoutMs (nested budget) | throw_typed | none | wired | requiredCount, routableCount, routingReadinessDimension, polls |
| src/query/sql-query-engine-partition-routing-readiness.js:593 | poll_max | partition_leader_wait | routable leader service for the partition | tablePartitionProvisioningTimeoutMs (nested budget) | throw_typed | none | wired | leaderRouteFound=false, routableCount, routingReadinessDimension, polls |
| src/query/sql-query-engine-provision-target-methods.js:201 | poll_max | TABLE_PARTITION_TARGET_NODE_WAIT | enough admissible provisioning target nodes | min(maxWaitMs/adaptive, tablePartitionProvisioningTimeoutMs) | throw_typed | error | wired | requiredReplicaCount, resolvedNodeCount, activeNodeRowCount, usedDegradedFallback, maximumProvisionableReplicaCount, failOnTimeout (old error/warn line now only for failures waitForCondition did not report) |
| src/query/sql-query-engine-select-execution.js:188 | poll_max | <nestedOperation> (wait_for_condition default) | caller predicate (timeoutError text names it) | allocated control-plane budget (configuredBudgetMs) | throw_typed | none | wired | predicateSatisfied=false, polls, classification + caller observe() state when supplied |
| src/raft/raft-rs-persistence-admission.js:54 | deadline | PERSISTENCE_ADMISSION_WAIT.BOUND_MS | store admits durable writes again (user transaction released the shared connection) for a taken Ready | 120000 | return_failure_state | none | not_wired:restore-path import fence - raft-rs-runtime-owner.js import closure must not reach logging-service.js (test/raft/raft-rs-backend/restart-from-durable-record.test.js FORBIDDEN_SOURCE /service/); needs an injected reporter on the group, which is built in the deferred runtime owner | nothing:not wired |
| src/raft/raft-rs-runtime-owner.js:1423 | deadline | PERSISTENCE_ADMISSION_WAIT.BOUND_MS (inbound drain) | store admits persistence so queued inbound envelopes can drain | 120000 | silently_continue | none | deferred_to_merge | nothing:deferred |
| src/rebalancer/assignment-epoch-manager.js:364 | retry_exhausted | DEFAULT_RETRY_CONFIG.maxRetries | assignment epoch proposal accepted by compare-and-set | options.maxRetries ?? 3 (count bound, boundMs null) | return_failure_state | none | wired | attempts, maxRetries, expectedEpoch, currentEpoch, error (no logger on the manager: LoggingService fallback; proposeEpochWithRetry has no src caller today) |
| src/rebalancer/operation-owner-shutdown-join.js:123 | timeout | OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS | in-flight operation-owner lanes settled at shutdown | options.timeoutMs (coordinator shutdownJoinTimeoutMs) / 5_000 | return_failure_state | none | wired | pendingLanes, settleRounds; scope nodeId |
| src/rebalancer/operation-owner-shutdown-join.js:151 | race_deadline | OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS | in-flight operation-owner lanes settled at shutdown | remaining join budget (setTimeout vs Promise.allSettled race) | return_failure_state | none | wired | pendingLanes, settleRounds (reported only when lanes still pending) |
| src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js:416 | retry_exhausted | COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT | coordinator-created operation handed off to its remote owner | getTimeoutForStep(step), extended by REBALANCE_OPERATION_BUDGET_MS when the operation budget applies | return_failure_state | warn | wired | targetNodeId/handoffDestinationNodeId, workflowStep, degenerateSnapshot, operationBudgetDeadlineMs, type, status (retained-snapshot path; non-timeout stops keep the warn) |
| src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js:505 | retry_exhausted | COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT | coordinator-created operation handed off to its remote owner | getTimeoutForStep(step), extended by REBALANCE_OPERATION_BUDGET_MS when the operation budget applies | return_failure_state | warn | wired | targetNodeId/handoffDestinationNodeId, workflowStep, operationBudgetDeadlineMs, type, status (live-row path) |
| src/rebalancer/operation-workflow-dispatch-rearm-evidence.js:311 | retry_exhausted | REBALANCE_OPERATION_BUDGET_MS | deferred replica operation retry re-armed after re-initialization | TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS from operation createdAt | silently_continue | warn | wired | retryKind (dispatch_retry/safety_retry), workflowStep, type, initialized (drop for a non-retryable step keeps the warn) |
| src/rebalancer/operation-workflow-dispatch-response-reconcile.js:258 | race_deadline | REPLICA_OPERATION_DISPATCH_TIMEOUT_MS | replica operation dispatch response from the target node | this.replicaOperationDispatchTimeoutMs (default 5 s) | throw_typed | warn | wired | workflowStep, type, targetNodeId, sourceNodeId; scope nodeId/partitionId/operationId (downstream deferDispatchRetry warn kept: different event) |
| src/rebalancer/operation-workflow-observed-progress-retention.js:242 | deadline | REBALANCE_OPERATION_BUDGET_MS | delivered target create progress applied to the operation row | createdAt + REBALANCE_OPERATION_BUDGET_MS | silently_continue | none | wired | kind, tableName, workflowStep, status, targetNodeId (entries without a deadline report nothing) |
| src/rebalancer/operation-workflow-recovery-status-reconcile.js:743 | deadline | REBALANCE_OPERATION_STEP_TIMEOUT | replica operation progressed past its current workflow step | step timeout / operation budget of a time-exempt partition REPLACE (ACTIVE/STOPPING) | silently_continue | none | wired | same fields with exemptReplace=true; subject operationId (re-fires each timeout check; folded while unchanged) |
| src/rebalancer/operation-workflow-recovery-status-reconcile.js:762 | timeout | REBALANCE_OPERATION_STEP_TIMEOUT | replica operation progressed past its current workflow step | getTimeoutForStep(step) (PENDING/CREATING/SYNCING/REMOVING_TIMEOUT_MS) or REBALANCE_OPERATION_BUDGET_MS | return_failure_state | warn | wired | type, workflowStep, status, targetNodeId, stepExceeded, budgetExhausted, timeoutClassification (replaced OPERATION_TIMED_OUT warn); subject operationId |
| src/rebalancer/operation-workflow-replace-owner-wake.js:458 | poll_max | REPLACE_OWNER_WAKE_MAX_RUNS | REPLACE owner waited-on level stable after a re-drive | REPLACE_OWNER_WAKE_MAX_RUNS (16 runs; count bound, boundMs null) | fallthrough_alternative | none | wired | runs, workflowStep, waitedNodeIds, waitedLevelKey; subject operationId (only when the waiter is still unsettled after the last run) |
| src/rebalancer/operation-workflow-stopping-starvation.js:126 | retry_exhausted | STOPPING_OBSERVATION_STARVATION_MIN_ELAPSED_MS | authoritative stopping-replica observation | STOPPING_OBSERVATION_STARVATION_DEFERRAL_LIMIT (40) AND STOPPING_OBSERVATION_STARVATION_MIN_ELAPSED_MS (10 s) | return_failure_state | error | wired | observationState=unavailable, deferralCount, deferralLimit, workflowStep, sourceNodeId (replaced the starvation ERROR line) |
| src/rebalancer/operation-workflow-transition-retry.js:89 | retry_exhausted | TRANSITION_RETRY_GRACE | deferred transition retry re-armed after re-initialization | transition retry grace / step timeout ceiling | silently_continue | none | not_wired:mixed refusal reasons (no retained operation, non-retryable step, non-budget class, grace or handoff budget spent) in one boolean; the spent grace/step timeout is reported when the periodic timeout check reaches the operation (recovery-status-reconcile.js:762) | nothing:the drop helper only sees a boolean, not which bound was spent |
| src/rebalancer/rebalance-coordinator-operation-creation.js:811 | retry_exhausted | RUNTIME_TARGET_CLAIM_RETRY_LIMIT | runtime target claim without a conflicting replica id | RUNTIME_TARGET_CLAIM_RETRY_LIMIT (8 attempts; count bound, boundMs null) | throw_typed | none | wired | attempts, attemptLimit, collisionReplicaIds, conflictingReplicaId, targetClaimKey (missing-key/missing-id refusals report nothing) |
| src/rebalancer/rebalancer-planning-gate-methods.js:309 | timeout | CLUSTER_READINESS_TIMEOUT_MS | cluster readiness evidence before the first rebalance plan | this.clusterReadinessTimeoutMs | fallthrough_alternative | warn | wired | unmetConditions (replaced CLUSTER_READINESS_TIMEOUT warn) |
| src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:85 | retry_exhausted | OPERATION_PERSIST_RETRY_TIMEOUT_MS | replica_operations mutation committed by the control plane | min(OPERATION_PERSIST_RETRY_TIMEOUT_MS 15 s, caller timeoutBudget remaining) | return_failure_state | none | wired | errorCode, error, retryAttempt, callerBudgetBound, localBoundMs |
| src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:238 | retry_exhausted | OPERATION_PERSIST_RETRY_TIMEOUT_MS | replica_operations mutation committed by the control plane | min(OPERATION_PERSIST_RETRY_TIMEOUT_MS 15 s, caller timeoutBudget remaining) | return_failure_state | none | wired | errorCode, error, retryAttempt, callerBudgetBound, localBoundMs (gateway-mutation path) |
| src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:460 | deadline | REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS | persisted replica operation authoritatively visible | this.replicaOperationAuthoritativeVisibilityTimeoutMs (default 5 s) | return_failure_state | none | wired | expectedWorkflowStep, expectedStatus, polls, sawVisibilityMismatch, deferredOutcome |
| src/rebalancer/replica-operation-repository-read-methods.js:147 | retry_exhausted | REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS | authoritative replica_operations read without a retryable failure | REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS (1 s) | return_failure_state | none | wired | errorCode, error, attempts, coalescingKey |
| src/runtime/cell-host-call-protocol.js:218 | deadline | host_call_deadline | parent response to a worker host call (Atomics.wait) | deadlineMs | throw_typed | none | not_wired:worker_thread_blocking_loop | request id/state available |
| src/runtime/endpoint-sync-source-client.js:239 | retry_exhausted | ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES | one successful endpoint source query | maxRetries (3) +1 attempts, linear delay | throw_typed | none | wired | attempts, lastError, lastErrorCode; scope adminStreamUrl |
| src/runtime/endpoint-sync-source-client.js:289 | timeout | ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS | admin stream query_result for an endpoint source query | options.timeoutMs // SOURCE_QUERY_TIMEOUT_MS (30s) | throw_typed | none | wired | phase (connecting/query_sent); scope queryId/adminStreamUrl |
| src/runtime/oci-host-agent-admission-table.js:185 | deadline | admission_deadline | admission before the operation deadline | candidate.deadlineAtMs | return_failure_state | none | not_wired:pure_decision_module | candidate available |
| src/runtime/oci-host-agent-admission-table.js:296 | deadline | queue_deadline | admission of a queued OCI host-agent operation | candidate.deadlineAtMs | return_failure_state | none | not_wired:pure_decision_module | candidate operationId available |
| src/runtime/oci-host-agent-engine-translation.js:637 | deadline | dispatch_deadline | dispatch before the operation deadline | context.deadlineAtMs | return_failure_state | none | not_wired:pure_decision_module | context available |
| src/runtime/oci-host-agent-protocol.js:184 | deadline | request_deadline | request verified before its deadline | envelope.deadlineAtMs | throw_typed | none | not_wired:pure_decision_module | envelope available |
| src/runtime/oci-host-agent-protocol.js:308 | deadline | response_deadline | response completed before the deadline | options.deadlineAtMs | throw_typed | none | not_wired:pure_decision_module | envelope available |
| src/runtime/wasi-component-cell-runtime.js:324 | timeout | STARTUP_TIMEOUT_MS | component cell worker ready message | STARTUP_TIMEOUT_MS (10s) | throw_typed | none | wired | ready; scope serviceId |
| src/runtime/wasi-component-cell-runtime.js:362 | timeout | cell_worker_message_timeout | component cell worker reply to a posted message | timeoutMs (HEALTH_TIMEOUT_MS 1s for health; remaining wall budget for invoke) | throw_typed | none | wired | messageType, pendingMessages, busy; scope serviceId/messageId |
| src/runtime/wasi-component-cell-runtime.js:636 | deadline | WALL_TIME_MS_budget | wall budget remaining before a cell step | deadlineMs - now | throw_typed | none | not_wired:time | limitMs available |
| src/runtime/wasi-component-cell-runtime.js:658 | race_deadline | WALL_TIME_MS_budget | binding operation within the cell wall budget | remainingWallBudgetMs(deadlineMs, limitMs) | throw_typed | none | not_wired:time | limitMs available |
| src/service/call-cell-invoker.js:283 | deadline | CALL_INVOKER_ACTIVATION_DEFAULT.WAIT_MS | ready Call Cell on the shard host after an activation lease | min(now + activationWaitMs (15s), request.deadlineMs) | throw_typed | none | wired | lastErrorCode (HOST_CELL_UNAVAILABLE), publishedActivationLease; scope hostNodeId/partitionId/invocationId |
| src/service/call-cell-invoker.js:489 | deadline | call_invocation_deadline | admission of every shard run before the invocation deadline | request deadlineMs (pool stops admitting at deadline) | throw_typed | none | wired | admissionStop, settled, unadmitted; scope invocationId |
| src/service/call-cell-statement-adapter.js:235 | deadline | call_statement_deadline | Call statement dispatched before the invocation deadline | deadlineMs // now + this._deadlineMs | throw_typed | none | not_wired:time | attempt number available |
| src/service/cell-ingress-transport.js:95 | retry_exhausted | DEFAULT_MAX_ATTEMPTS | a retryable cell dispatch attempt succeeding | maxAttempts (2) | throw_typed | none | not_wired:time | failure code, attempt available |
| src/service/request-cell-http-adapter.js:251 | deadline | request_cell_deadline | request Cell dispatch before the request deadline | now + this._deadlineMs | throw_typed | none | not_wired:time | attempt number available |
| src/service/service-dispatcher.js:99 | deadline | service_dispatch_deadline | delivery to the target before the caller deadline | context.deadlineMs | throw_typed | none | not_wired:time | target.targetNodeId available |
| src/test-helpers/port-allocator.js:203 | retry_exhausted | PORT_ALLOCATOR_LOCK_ATTEMPTS | test port allocator lock directory acquired | PORT_ALLOCATOR_LOCK_ATTEMPTS x PORT_ALLOCATOR_LOCK_WAIT_MS | throw_typed | none | not_wired:test_helper | nothing:lock holder unknown |
| src/test-helpers/run-entrypoint.js:35 | timeout | runEntrypoint timeoutMs | entrypoint worker result message | timeoutMs (5000) | throw_typed | none | not_wired:test_helper | entryPath |
| src/topology/cdc-group-propagation-delivery-methods.js:155 | retry_exhausted | CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS | every target group acknowledged the CDC propagation wave (foreground) | deliveryRetryMaxAttempts (3) | fallthrough_alternative | warn | wired | tableName, operation, attempt, maxAttempts, failureCount |
| src/topology/cdc-group-propagation-delivery-methods.js:405 | retry_exhausted | CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS + BACKGROUND_MAX_ATTEMPTS | every target group acknowledged the CDC propagation wave (background) | 3+5 | silently_continue | warn | wired | tableName, operation, attempt, maxAttempts, failureCount |
| src/topology/cdc-group-propagation-delivery-methods.js:441 | retry_exhausted | CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS + BACKGROUND_MAX_ATTEMPTS | every target group acknowledged the CDC propagation wave (background) | 3+5 | silently_continue | warn | wired | tableName, operation, attempt, maxAttempts, failureCount |
| src/topology/cdc-group-propagation-delivery-methods.js:611 | retry_exhausted | CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS + BACKGROUND_MAX_ATTEMPTS | every target group acknowledged the CDC propagation wave (background) | 3+5 | silently_continue | warn | wired | tableName, operation, attempt, maxAttempts, failureCount |
| src/topology/latency-measurement-service.js:235 | retry_exhausted | LATENCY_PING_TIMEOUT_MS x (retryCount + 1) | one acknowledged ping to measure the node RTT | timeoutMs*(retryCount+1) | return_failure_state | none | wired | attempts, pingTimeoutMs, lastThrownError (subject=targetNodeId) |
| src/transport/message-router-connection-close-reconnect.js:220 | retry_exhausted | RECONNECT_MAX_ATTEMPTS | outbound connection to the node re-established | reconnectMaxAttempts | silently_continue | error | wired | attempts, maxAttempts, state, address (subject=nodeId) |
| src/transport/message-router-connection-close-reconnect.js:389 | poll_max | PING_TIMEOUT_MS x pingMaxMissed (keepalive) | keepalive PONG from the connected node | pingTimeoutMs * pingMaxMissed | fallthrough_alternative | info | wired | missedPings, answeredAliveByRecentInbound, lastInboundAgoMs, severed (subject=nodeId) |
| src/transport/message-router-connection-lifecycle-methods.js:339 | timeout | CONNECT_TIMEOUT_MS (+ per-attempt step, capped) | WebSocket OPEN to the node | min(30000, connectTimeoutMs + attempts*5000) | throw_typed | none | wired | readyState, connectionState, reconnectAttempts, address (subject=nodeId) |
| src/transport/message-router-delivery-behaviors.js:663 | timeout | MESSAGE_TIMEOUT_MS (delivery ACK) | ACK from the target node for a sent SERVICE_MESSAGE | deliveryTimeoutMs (caller timeoutMs or messageTimeoutMs) | return_failure_state | debug | wired | connectionId, activeConnectionId/State, sameConnection, quarantineOwnerChanged (subject=targetNodeId; folds while unchanged) |
| src/transport/message-router-peer-liveness.js:92 | timeout | PING_TIMEOUT_MS | PONG from the pinged node | caller timeoutMs or pingTimeoutMs | return_failure_state | info | wired | connectionReplaced, answeredAliveByRecentInbound, livenessWindowMs (subject=nodeId) |
| src/transport/message-router-pending-response-ledger.js:395 | timeout | MESSAGE_TIMEOUT_MS (SERVICE_RESPONSE after ACK) | SERVICE_RESPONSE from the target node for an acknowledged message | deliveryTimeoutMs | throw_typed | none | wired | targetConnectionState, deliverySource, responseContext, pendingResponses |
| src/transport/message-router-stats-shutdown.js:50 | race_deadline | TRANSPORT_DEFAULT.SHUTDOWN_WAIT_MS | every terminated peer socket emitted close at shutdown | 100 | fallthrough_alternative | none | wired | socketsTerminated, socketsClosed |
| src/transport/rpc-client.js:123 | timeout | RPC_DEFAULT.TIMEOUT_MS (or call timeout) | correlated RPC response from the target service | options.timeout // defaultTimeoutMs | throw_typed | debug | wired | requestType, pendingRequests, responsesReceived, timeouts |
| src/transport/websocket-transport-provider.js:187 | timeout | WebSocketTransportProvider connect timeout | connect timeout | messageTimeoutMs / reconnectMaxAttempts | return_failure_state | none | not_wired:no production constructor (only exported from src/transport/index.js) | nothing:not wired |
| src/transport/websocket-transport-provider.js:435 | retry_exhausted | WebSocketTransportProvider MAX_RECONNECTS_REACHED (already ERROR) | MAX_RECONNECTS_REACHED (already ERROR) | messageTimeoutMs / reconnectMaxAttempts | return_failure_state | error | not_wired:no production constructor (only exported from src/transport/index.js) | nothing:not wired |
| src/transport/websocket-transport-provider.js:537 | timeout | WebSocketTransportProvider message ACK timeout | message ACK timeout | messageTimeoutMs / reconnectMaxAttempts | return_failure_state | none | not_wired:no production constructor (only exported from src/transport/index.js) | nothing:not wired |
| src/transport/websocket-transport.js:248 | timeout | WebSocketTransport connect timeout | connect timeout | messageTimeoutMs / reconnectMaxAttempts | return_failure_state | warn | not_wired:no production constructor (WebSocketTransport only exported from src/transport/index.js) | nothing:not wired |
| src/transport/websocket-transport.js:514 | retry_exhausted | WebSocketTransport MAX_RECONNECTS_REACHED (already ERROR) | MAX_RECONNECTS_REACHED (already ERROR) | messageTimeoutMs / reconnectMaxAttempts | return_failure_state | error | not_wired:no production constructor (WebSocketTransport only exported from src/transport/index.js) | nothing:not wired |
| src/transport/websocket-transport.js:624 | timeout | WebSocketTransport message ACK timeout | message ACK timeout | messageTimeoutMs / reconnectMaxAttempts | return_failure_state | none | not_wired:no production constructor (WebSocketTransport only exported from src/transport/index.js) | nothing:not wired |
| src/wasm-service/wasm-executor.js:164 | race_deadline | cpuTimeLimitMs | WASM handler result | cpuTimeLimitMs | throw_typed | none | not_wired:time | functionId available |
| src/workflow/reconcile-queue-retry-ownership.js:284 | retry_exhausted | reconcile queue retryPolicy.maxAttempts | a successful drain of the owner key within its retry budget | retryPolicy.maxAttempts (default Infinity) | throw_typed | error | wired | failureCount, maxAttempts, failureReason, errorCode, errorMessage |

## Scheduling, by file (304 rows)

| File | Lines (reason) |
| --- | --- |
| src/admin/admin-control-snapshot-repair-orchestration.js | 271 forwarded:src/admin/admin-service-discovery* |
| src/admin/admin-service-discovery-readiness-context-methods.js | 484 forwarded:src/cdc (authoritative read) |
| src/admin/admin-service-discovery-replica-readiness-methods.js | 502 forwarded:replica-operation step-timeout owner |
| src/admin/admin-websocket-api-base.js | 195 forwarded:src/admin/admin-websocket-query-execution-methods.js |
| src/admin/admin-websocket-diagnostics-route-methods.js | 478 delay |
| src/admin/admin-websocket-load-lane-admission.js | 517 forwarded:src/admin/admin-websocket-query-execution-methods.js |
| src/bootstrap/bootstrap-api-runtime-methods.js | 381 periodic (MOVE_REPLICA assignment sweep) |
| src/bootstrap/bootstrap-api.js | 221 forwarded:src/service request-cell routing (requestCellDeadlineMs) |
| src/bootstrap/bootstrap-service-runtime-methods.js | 370 delay/yield (owned-clock sleep) |
| src/bootstrap/bootstrap-service-seed-workflow.js | 186 yield (setTimeout 0) |
| src/bootstrap/lifecycle-controller.js | 412 projection: drainDeadlineMs stored and published in the snapshot, never awaited here |
| src/bootstrap/node-joining-admission-readiness.js | 503 delay (retryable join resume backoff) |
| src/bootstrap/node-joining-backfill-merge-and-status.js | 785 delay (sleep helper) |
| src/bootstrap/node-joining-cdc-subscription-and-backfill.js | 258 periodic (CDC recovery diagnostic interval) |
| src/bootstrap/node-joining-operation-ledger-formation-readiness.js | 239 discovery_window: priorityPlacementFormationDiscoveryMs expected to expire for intentionally small (1-2 node) clusters -> BYPASSED_INSUFFICIENT_COHORT (logged info); UNSURE, see report; 469 delay (poll between barrier snapshots) |
| src/bootstrap/node-joining-owner-construction.js | 130 delay (sleep helper) |
| src/bootstrap/node-joining-publication-activation.js | 446 forwarded:src/control-plane/owners/membership-publication-runtime-owner.js (controlPlaneWriteRetryTimeoutMs; deferred owner) |
| src/bootstrap/node-joining-ready-signal-readiness.js | 510 delay (ready-signal heartbeat retry backoff); 557 delay (CDC readiness gate poll) |
| src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js | 342 delay (node-ready rebalance trigger debounce) |
| src/bootstrap/owners/service-leader-readiness-owner.js | 429 forwarded:src/control-plane/control-plane-system-table-gateway.js (AUTHORITATIVE_LEADER_REFRESH_QUERY_TIMEOUT_MS as queryTimeoutMs to readRows); 486 forwarded:src/bootstrap/owners/bootstrap-request-owner.js (parent execution budget already spent; reported by the request owner) |
| src/bootstrap/owners/service-registration-handoff-owner.js | 385 forwarded:src/bootstrap/shared/retryable-control-plane-write.js (registerServiceWriteRetryTimeoutMs, named via spentWait); 355 delay (sleep helper) |
| src/bootstrap/owners/startup-runtime-handoff-owner.js | 100 delay (background-writer activation re-arm; the readiness exhaustion it follows is reported in traffic-readiness-utils with subject) |
| src/bootstrap/phases/connect-websocket-phase.js | 499 delay (seed websocket retry backoff) |
| src/bootstrap/phases/contact-seed-phase.js | 261 forwarded:src/bootstrap/node-joining-backfill-merge-and-status.js (per-attempt request timeout -> httpPost) |
| src/bootstrap/phases/create-message-group-phase.js | 440 forwarded:src/bootstrap/node-joining-backfill-merge-and-status.js (per-request httpTimeout -> httpPost); 541 delay (registration retry backoff) |
| src/bootstrap/phases/query-system-state-phase.js | 244 forwarded:src/cdc/cdc-pipeline-readiness-gate.js (cdcReadinessGate.waitForReady); 786 delay (registration retry sleep) |
| src/bootstrap/phases/seed-cache-hydration-phase.js | 207 forwarded:src/cdc/cdc-pipeline-readiness-gate.js (cdcReadinessGate.waitForReady) |
| src/bootstrap/phases/seed-message-groups-phase.js | 325 delay (leadership backoff); 145 delay (createDelayMs between group creations) |
| src/bootstrap/phases/seed-partitions-phase.js | 488 delay (leadership backoff); 234 delay (createDelayMs between partition creations) |
| src/bootstrap/phases/wait-for-leadership-phase.js | 136 delay (leadership backoff) |
| src/bootstrap/rejoin-hints.js | 694 periodic (rejoin hints persistence) |
| src/bootstrap/shared/call-cell-invocation-setup.js | 157 forwarded:src/service/call-cell-* (CALL_CELL_INVOCATION_DEFAULT.DEADLINE_MS) |
| src/bootstrap/shared/control-plane-setup.js | 204 forwarded:src/control-plane (controlPlaneWriteRetryTimeoutMs) |
| src/bootstrap/shared/node-registration-owner-publication-methods.js | 464 forwarded:src/bootstrap/shared/retryable-control-plane-write.js (joinAdmissionWriteRetryTimeoutMs, named via spentWait) (also :511); 774 delay (sleep helper) |
| src/bootstrap/shared/node-state-publication-owner.js | 490 forwarded:src/transport (messageRouter.deliver timeoutMs); 632 delay (same-target retryAfterMs) |
| src/bootstrap/shared/retryable-control-plane-write.js | 20 delay (default sleep between write retries) |
| src/bootstrap/shared/runtime-service-rebalancer-setup.js | 223 periodic (binding reconcile); 512 periodic: UNBOUNDED poll for the rebalancer leadership sink (no max; finding: an absent partition service is retried forever, warned once) |
| src/bootstrap/shared/service-installation-reconciler-setup.js | 80 periodic: UNBOUNDED poll for the service-installation sink (no max; same finding) |
| src/cdc/cdc-integration-service-authoritative-catchup.js | 319 delay |
| src/cdc/cdc-integration-service-authoritative-read-flow.js | 619 forwarded:query engine |
| src/cdc/cdc-integration-service-cache-visibility-wait.js | 361 delay |
| src/cdc/cdc-integration-service-lifecycle.js | 195 delay |
| src/cdc/cdc-integration-service-owner-rpc-read-execution.js | 442 forwarded:src/cdc/cdc-integration-service-authoritative-read-flow.js |
| src/cdc/cdc-pipeline-readiness-gate.js | 223 delay |
| src/cdc/cdc-routed-mutation-readiness.js | 494 delay |
| src/cli/core/cdc-stream-handler.js | 257 ttl |
| src/cli/core/connection-manager.js | 323 delay |
| src/cli/core/error-handler.js | 297 ttl |
| src/cli/core/view-manager.js | 255 ttl |
| src/cli/core/visual-indicators.js | 442 periodic |
| src/cli/index.js | 137 delay |
| src/config/raft-adaptive-timing-controller.js | 357 periodic (adaptive timing evaluation interval) |
| src/constants/cdc-lifecycle-constants.js | 87 delay |
| src/control-plane/authoritative-control-plane-view.js | 354 forwarded:src/control-plane/control-plane-system-table-gateway*.js (queryTimeoutMs to the query owner) |
| src/control-plane/authoritative-node-evidence-reconciler.js | 549 forwarded:src/control-plane/authoritative-control-plane-view.js |
| src/control-plane/control-plane-readiness-evidence-reasons.js | 486 forwarded:src/control-plane/authoritative-control-plane-view.js |
| src/control-plane/control-plane-readiness-participation-base.js | 113 forwarded:src/control-plane/authoritative-control-plane-view.js (repair query timeout); 125 not a wait: dead field (membershipPublicationPlanningSnapshotRefreshTimeoutMs is assigned, never read) |
| src/control-plane/control-plane-readiness-publication-diagnostics.js | 60 forwarded:query owner (diagnostics read queryTimeoutMs) |
| src/control-plane/control-plane-readiness-publication-planning-resolution.js | 703 forwarded:query owner (diagnostics read queryTimeoutMs) |
| src/control-plane/control-plane-snapshot-owner.js | 241 forwarded:query owner (queryTimeoutMs option) |
| src/control-plane/control-plane-system-table-gateway-options.js | 20 forwarded:src/control-plane/timeout-budget.js (query timeout resolution) |
| src/control-plane/heartbeat-service-lifecycle-methods.js | 365 periodic |
| src/control-plane/heartbeat-service-publication-methods.js | 458 forwarded:src/control-plane/heartbeat-service-lifecycle-methods.js (reporter timeout computed and spent there) |
| src/control-plane/heartbeat-service-reporter-visibility-methods.js | 212 yield (setTimeout 0 deferral of the visibility proof); 399 forwarded:src/control-plane/authoritative-control-plane-view.js (reporterVisibilityQueryTimeoutMs) |
| src/control-plane/lease-service.js | 251 periodic (lease sweep); 314 ttl (ready lease expiry) |
| src/control-plane/membership-lifecycle-controller.js | 192 forwarded:drain intent consumer (drainDeadlineMs recorded on the intent, not awaited here) |
| src/control-plane/membership-publication-coordinator-reconcile.js | 910 periodic (owner-membership driver) |
| src/control-plane/membership-publication-row-helpers.js | 298 forwarded:src/control-plane/membership-publication-acknowledgement.js (hasPublicationTimedOut predicate; the abandon branch lives there; deferred file, not edited) |
| src/control-plane/membership-swim-prober.js | 207 periodic (probe cadence); 109 forwarded:src/transport (messageRouter.deliver timeoutMs for direct/indirect probes; outcome feeds the suspicion deadline row); 77 forwarded:src/transport (messageRouter.pingNode pingTimeoutMs) |
| src/control-plane/membership-swim-runtime.js | 27 forwarded:src/control-plane/membership-swim-prober.js (pingTimeoutMs) |
| src/control-plane/node-lifecycle-publication.js | 550 forwarded:control-plane system-table write owner (queryTimeoutMs = readyLease/3) |
| src/control-plane/node-liveness-semantic-projection-owner.js | 418 ttl (timer armed at the earliest semantic-change deadline; expiry is the expected freshness transition) |
| src/control-plane/node-liveness-semantic-projection.js | 339 ttl (freshness projection deadlines; pure computation, no wait) |
| src/control-plane/owners/membership-publication-runtime-owner.js | 124 forwarded:src/bootstrap/shared/retryable-control-plane-write.js |
| src/control-plane/owners/system-metadata-owner-base.js | 426 forwarded:src/bootstrap/shared/retryable-control-plane-write.js (controlPlaneWriteRetryTimeoutMs; exhaustion spent there) |
| src/control-plane/pressure-governor.js | 734 periodic (admission poll; waiter deadline is its own row) |
| src/control-plane/priority-recovery-snapshot-observation.js | 264 forwarded:src/rebalancer/replica-operation-liveness.js (step-timeout projection only; deferred file, not edited) |
| src/control-plane/readiness-planning-snapshot-owner.js | 146 forwarded:src/workflow/owner-key-reconcile-queue.js (READINESS_PLANNING_MAX_RETRY_ATTEMPTS) |
| src/control-plane/replica-dispatch-direct-wakeup.js | 74 forwarded:src/transport (replicaOperationDispatchTimeoutMs as messageRouter.deliver timeoutMs) |
| src/control-plane/replica-dispatch-replay-health-readiness.js | 551 delay (deferred membership-publication ack retry) |
| src/control-plane/replica-dispatch-retry-scheduling.js | 265 delay (deferred operation dispatch retry; unbounded re-arm, no exhaustion); 475 delay (backoff computation of retryAfterMs) |
| src/control-plane/replica-dispatch-service-lifecycle.js | 189 forwarded:src/workflow/owner-key-reconcile-queue.js (NODE_READY_RETRY_MAX_ATTEMPTS retry exhaustion is spent in the queue) |
| src/control-plane/timeout-budget.js | 84 forwarded:callers (budget arithmetic library; exhaustion is spent where callers act on remainingBudgetMs) |
| src/control-plane/topology-operator-witness.js | 248 forwarded:src/rebalancer/replica-operation-liveness.js (deadline projection for a witness, no wait) |
| src/diagnostics/event-loop-gap-watchdog.js | 547 periodic |
| src/diagnostics/formation-attribution-window.js | 194 periodic |
| src/entrypoint-runtime-join-config.js | 22 config: env JOINING_* timeouts copied into joining config (forwarded to the join owners) |
| src/entrypoint-runtime-join-startup-policy.js | 63 delay (join reattempt backoff; exhaustion row at :136) |
| src/entrypoint-runtime-shutdown-lifecycle.js | 306 forwarded:src/control-plane/membership-lifecycle-controller.js (READINESS_DRAIN_DEADLINE_MS as drainDeadlineMs); 336 forwarded:src/control-plane heartbeat reportNodeShutdown (reporterTimeoutMs); 493 periodic (startup liveness pulse, 10 pulses) |
| src/live-query/live-query-manager.js | 551 periodic |
| src/logging/log-retention-service.js | 150 delay; 157 periodic |
| src/logging/logging-service.js | 535 yield |
| src/logging/logs-persistence-startup.js | 99 delay |
| src/logging/logs-table-service-flush-helpers.js | 71 yield; 247 delay |
| src/logging/logs-table-service-pressure-helpers.js | 77 delay |
| src/message-group/cdc-handler.js | 406 debounce |
| src/message-group/message-group-forwarding-owner-constants.js | 173 forwarded:src/query/sql-query-engine-routing-metadata-methods.js |
| src/message-group/message-group-service-cache-and-lifecycle-runtime-methods.js | 139 delay |
| src/message-group/message-group-service-cdc-replication-runtime-methods.js | 312 forwarded:src/message-group/message-group-proposal-routing.js |
| src/message-group/message-group-service-metadata-publication.js | 37 forwarded:src/raft/authoritative-row-mutation-helper.js |
| src/message-group/message-group-service-outbound-dispatch-runtime-methods.js | 212 delay |
| src/message-group/message-group-service-peer-resolution.js | 219 yield |
| src/message-group/message-group-service-state.js | 169 forwarded:src/message-group/message-group-service-cdc-replication-runtime-methods.js |
| src/message-group/message-retry-handler.js | 532 delay |
| src/message-group/system-cache-query-service.js | 59 not_a_wait:dead field |
| src/migration/migration-coordinator-stage-methods.js | 262 delay; 384 delay |
| src/migration/migration-coordinator.js | 122 delay |
| src/migration/migration-recovery-trigger.js | 158 debounce |
| src/node/failure-detector.js | 197 periodic; 549 periodic |
| src/node/node-lifecycle-service.js | 284 periodic |
| src/node/node-readiness-policy.js | 300 forwarded:src/transport/message-router-peer-liveness.js |
| src/node/node-reintegration-service.js | 253 periodic; 358 delay; 534 ttl; 601 ttl |
| src/node/node-runtime-local-authorities.js | 102 yield |
| src/node/replica-handler-runtime-metadata-methods.js | 105 delay |
| src/node/replica-handler-status-methods.js | 42 forwarded:src/bootstrap/shared/retryable-control-plane-write.js |
| src/node/replica-handler-voter-readiness-methods.js | 218 delay |
| src/node/replica-lifecycle-manager.js | 126 not_a_wait:dead fields |
| src/node/replica-recovery-service.js | 301 periodic |
| src/node/replica-state-machine-timeouts.js | 55 periodic |
| src/node/runtime-service-call-cell-handler.js | 326 forwarded:src/query/query-result-budget.js |
| src/node/services-p1-diagnostic-logger.js | 89 not_a_wait:log helper (logTimeout) with no production constructor |
| src/partition/managed-merge-topology-adapter.js | 97 forwarded:src/query/sql-query-engine-partition-routing-readiness.js |
| src/partition/managed-merge-workflow.js | 197 forwarded:src/workflow/timeout-policy.js (execution budget passed to the step runner/lane) |
| src/partition/managed-split-topology-adapter.js | 90 forwarded:src/query/sql-query-engine-partition-routing-readiness.js |
| src/partition/managed-split-workflow-cutover-readiness-methods.js | 163 delay (poll interval) |
| src/partition/managed-split-workflow-topology-bindings.js | 109 delay (default sleep binding) |
| src/partition/managed-split-workflow.js | 117 forwarded:src/workflow/timeout-policy.js (execution budget passed to the step runner/lane) |
| src/partition/partition-cdc-delivery.js | 285 delay (CDC buffer replay backoff; unbounded retry, no exhaustion) |
| src/partition/partition-consensus-hold-log.js | 38 yield |
| src/partition/partition-service-cdc-stream-base.js | 752 yield |
| src/partition/partition-service-core-base.js | 846 yield; 244 forwarded:src/partition/pending-request-tracker.js (PENDING_REQUEST_TIMEOUT_MS) |
| src/partition/partition-service-learner-promotion-methods.js | 153 periodic (learner promotion recheck cadence) |
| src/partition/partition-service-learner-promotion-proof-methods.js | 282 forwarded:src/transport (MESSAGE_TIMEOUT_MS delivery timeout) |
| src/partition/partition-service-merge-replication-methods.js | 763 delay (poll interval of the merge cutover wait) |
| src/partition/partition-service-metadata-delivery-methods.js | 507 forwarded:src/partition/pending-request-tracker.js (deliverWithAck timeoutMs) |
| src/partition/partition-service-metadata-mutation-helpers.js | 53 forwarded:control-plane mutation retry owner (timer injection only) |
| src/partition/partition-service-raft-init-base.js | 386 forwarded:src/raft (election timeout min/max) |
| src/partition/partition-service-raft-write-commit.js | 86 forwarded:src/bootstrap/shared/retryable-control-plane-write.js (USER_TRANSACTION_WRITE_DEFER_BUDGET_MS) |
| src/partition/partition-service-size-cadence.js | 41 periodic |
| src/partition/partition-service-split-accessor-base.js | 98 forwarded:src/bootstrap/shared/retryable-control-plane-write.js; 341 yield |
| src/partition/partition-service-transaction-base.js | 93 delay (poll of waitForRemovalServingDrain: an UNBOUNDED wait with no bound by design - finding: it can wait forever if a session never terminates and the hold sweep is deferred on a leader); 528 periodic (prepared-hold / durability-fitness / snapshot sweep) |
| src/partition/partition-service-write-path-helpers.js | 78 forwarded:src/bootstrap/shared/retryable-control-plane-write.js (SIZE_PERSIST_RETRY_TIMEOUT_MS) |
| src/partition/partition-split-merge-manager-evaluation-methods.js | 42 periodic; 103 debounce |
| src/partition/partition-split-merge-manager-transition-methods.js | 322 delay (deferred managed-split retry due-time) |
| src/partition/pending-request-tracker.js | 394 periodic (stale cleanup sweep) |
| src/partition/proposal-queue.js | 141 forwarded:src/partition/partition-service-cdc-stream-base.js (queue only clears the commit-deadline timer) |
| src/query/distributed/distributed-transaction-coordinator.js | 141 delay (default sleep) |
| src/query/distributed/distributed-transaction-protocol.js | 657 delay (participant retry backoff) |
| src/query/distributed/distributed-transaction-recovery.js | 518 periodic (recovery sweep); 558 delay (sweep defer backoff; unbounded, no exhaustion) |
| src/query/distributed/distributed-write-coordinator.js | 367 forwarded:src/query/query-executor-partition-attempt-budget.js |
| src/query/distributed/parallel-query-coordinator-hedging-methods.js | 74 periodic (straggler hedge check); chunk timeout forwarded from parallel-query-coordinator.js |
| src/query/distributed/straggler-detector.js | 325 delay |
| src/query/query-executor-base.js | 84 forwarded:src/query/query-executor-partition-attempt-budget.js (queryTimeoutMs) |
| src/query/query-executor-cancellation-routing-install.js | 23 delay |
| src/query/query-executor-partition-attempt-budget.js | 359 delay (retry delay, unbudgeted path); 378 delay (retry delay); 257 clamp (READ/RECOVERY cold-reconnect defer delivery timeout = 1 ms floor) |
| src/query/query-executor-partition-request-builders.js | 43 forwarded:src/query/query-result-budget.js (resultDeadlineMs) |
| src/query/schema-provisioning-job-owner.js | 239 delay (scheduled job retry; persisted RETRY_AFTER_MS, unbounded); 163 ttl (owner lease LEASE_MS) |
| src/query/service-partition-access-publisher.js | 81 periodic |
| src/query/sql-query-engine-initial-partition-provisioning.js | 111 forwarded:src/query/sql-query-engine-partition-routing-readiness.js + provision-target-methods.js |
| src/query/sql-query-engine-instance-initializer.js | 121 forwarded:engine timeout configuration |
| src/query/sql-query-engine-provisioning-deadline-methods.js | 39 forwarded:src/query/sql-query-engine-provision-target-methods.js (budget pre-check before the one re-wait) |
| src/query/sql-query-engine-routing-metadata-methods.js | 552 forwarded:control-plane query timeout |
| src/query/sql-query-engine-select-execution.js | 171 delay (poll interval); 205 delay (sleep helper) |
| src/query/sql-query-engine-write-execution.js | 56 forwarded:src/query/query-executor-partition-attempt-budget.js |
| src/query/sql-query-engine.js | 483 forwarded:src/query/query-executor-partition-attempt-budget.js (PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS as executionOptions.timeoutMs) |
| src/query/table-creation-service-class.js | 65 forwarded:src/query/schema-provisioning-job-owner.js |
| src/raft/authoritative-row-mutation-helper.js | 617 delay; 605 forwarded:src/partition/partition-service-metadata-mutation-helpers.js |
| src/raft/leader-activation-gate.js | 88 debounce |
| src/raft/leader-activation-scheduler.js | 114 delay |
| src/raft/raft-rs-local-log-guard.js | 108 not_a_wait:raft TIMEOUT_NOW message type |
| src/raft/raft-rs-operation-port.js | 277 periodic |
| src/raft/raft-rs-persistence-admission.js | 60 delay |
| src/raft/raft-rs-runtime-owner.js | 1414 yield; 652 delay |
| src/raft/replica-raft-timing.js | 23 forwarded:raft core |
| src/rebalancer/assignment-epoch-manager.js | 385 delay (CAS retry backoff) |
| src/rebalancer/committed-membership-bootstrap-read.js | 95 forwarded:message router deliver (REPLICA_OPERATION_DISPATCH_TIMEOUT_MS as delivery timeoutMs) |
| src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js | 470 delay (handoff follow-up retry timer) |
| src/rebalancer/operation-workflow-dispatch-execution.js | 701 forwarded:src/rebalancer/operation-workflow-dispatch-response-reconcile.js (delegating wrapper) |
| src/rebalancer/operation-workflow-dispatch-rearm-evidence.js | 431 delay (dispatch retry backoff timer; its exhaustion is the step-timeout row); 645 delay (1 s remove-safety deferred retry fallback timer); 673 forwarded:src/rebalancer/operation-workflow-recovery-status-reconcile.js (isOperationStepTimedOut classifier) |
| src/rebalancer/operation-workflow-dispatch-response-reconcile.js | 811 delay (priority ACTIVE REPLACE resume timer) |
| src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js | 479 delay (exponential executor-outcome retry backoff; NOTE the loop has no exhaustion bound, retries until applied or shutdown) |
| src/rebalancer/operation-workflow-ledger-self-move-park-evidence.js | 203 ttl (park evidence freshness bound) |
| src/rebalancer/operation-workflow-observed-progress-retention.js | 121 delay (observed-progress retry re-arm); 136 delay (observed-progress retry timer) |
| src/rebalancer/operation-workflow-owner-handoff-state.js | 264 forwarded:message router deliver (replicaOperationDispatchTimeoutMs as delivery timeoutMs) |
| src/rebalancer/operation-workflow-owner-retry-registry.js | 454 ttl (handoff retry pending marker); 495 ttl (dispatch-service deferred retry marker); 543 ttl (dispatch-service deferred retry marker) |
| src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js | 911 yield (setTimeout 0 re-entry); 720 forwarded:src/rebalancer/operation-workflow-recovery-status-reconcile.js (step-age >= step-timeout classifier) |
| src/rebalancer/operation-workflow-recovery-reconcile.js | 378 ttl (expired storage reservations reconciled) |
| src/rebalancer/operation-workflow-recovery-timeout.js | 507 forwarded:src/rebalancer/operation-workflow-recovery-status-reconcile.js (orphan staleness gate); 687 forwarded:src/rebalancer/operation-workflow-recovery-status-reconcile.js (drain-step staleness classifier) |
| src/rebalancer/operation-workflow-replace-owner.js | 731 forwarded:src/rebalancer/operation-workflow-recovery-status-reconcile.js (REPLACE budget diagnostic; reported at :743) |
| src/rebalancer/operation-workflow-terminal-transition-repair.js | 141 delay (terminal repair backoff; NOTE unbounded retry, no exhaustion bound) |
| src/rebalancer/operation-workflow-transition-orchestration.js | 763 forwarded:src/rebalancer/replica-operation-repository-mutation-gateway-methods.js (mutation timeoutBudget) |
| src/rebalancer/operation-workflow-transition-retry-grace.js | 180 ttl (transition retry grace window; its expiry hands the operation to the step-timeout reaper) |
| src/rebalancer/operation-workflow-transition-retry.js | 184 delay (transition retry timer; resume clears into reconcileTimeoutOperation when the grace is spent) |
| src/rebalancer/rebalance-coordinator-lifecycle.js | 662 periodic (TIMEOUT_CHECK_INTERVAL_MS timeout check); 237 forwarded:src/rebalancer/operation-owner-shutdown-join.js (shutdownJoinTimeoutMs); 393 forwarded:src/rebalancer/operation-workflow-owner-retry-registry.js (setTimeoutFn seam) |
| src/rebalancer/rebalance-coordinator-owner-delegation-methods.js | 15 ttl (recent operation intent expiry) |
| src/rebalancer/rebalance-coordinator-priority-budget-helper.js | 379 forwarded:src/rebalancer/operation-workflow-recovery-status-reconcile.js (budget-admission staleness classifier) |
| src/rebalancer/rebalancer-planning-gate-methods.js | 96 periodic (jittered next rebalance check) |
| src/rebalancer/replica-operation-liveness.js | 615 forwarded:src/rebalancer/priority-recovery-observation.js (pure step-age classifier for observation) |
| src/rebalancer/replica-operation-repository-mutation-gateway-methods.js | 103 delay (persist retry backoff); 256 delay (gateway persist retry backoff); 665 forwarded:control-plane system-table gateway (REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS per-attempt query timeout) |
| src/rebalancer/replica-operation-repository-mutation-persistence-methods.js | 481 delay (visibility poll interval) |
| src/rebalancer/replica-operation-repository-read-methods.js | 162 delay (read retry backoff) |
| src/rebalancer/replica-operation-repository.js | 375 forwarded:control-plane system-table gateway (REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS) |
| src/rebalancer/storage-capacity-accounting-service.js | 101 forwarded:src/rebalancer/storage-capacity-semantic-projection-owner.js (setTimeoutFn seam); 67 ttl (storage reservation expiresAt) |
| src/rebalancer/storage-capacity-semantic-projection-owner.js | 509 scheduled deadline (reprojection at nextSemanticChangeAtMs; expiry is the expected event) |
| src/rebalancer/topology-owner-constants.js | 109 decision table (ATTEMPTS_EXHAUSTED state; deferDispatchRetry/deferTransitionRetry pass no maxAttempts, so unreachable from those callers) |
| src/rebalancer/unified-rebalancer-critical-topology-methods.js | 519 forwarded:query owner (queryTimeoutMs = criticalCheckDelayMs) |
| src/rebalancer/unified-rebalancer-policy-scheduler-methods.js | 343 debounce (stabilization period) |
| src/rebalancer/unified-rebalancer-rebalance-loop.js | 148 delay (inter-batch delay) |
| src/rebalancer/unified-rebalancer-replica-state.js | 190 forwarded:src/transport/message-router-delivery-delegation.js (readiness ping timeout); 257 forwarded:src/transport/message-router-delivery-delegation.js (readiness ping timeout) |
| src/runtime/call-cell-driver-invoke.js | 113 forwarded:src/runtime/wasi-component-cell-runtime.js |
| src/runtime/endpoint-sync-source-client.js | 69 delay |
| src/runtime/sql-query-loop-runtime-module.js | 486 periodic |
| src/runtime/wasi-component-cell-runtime.js | 697 periodic |
| src/runtime/wasi-component-cell-worker.js | 373 forwarded:src/runtime/cell-host-call-protocol.js |
| src/runtime/wasm-component-driver.js | 727 forwarded:src/runtime/wasi-component-cell-runtime.js |
| src/service/call-cell-invoker.js | 113 delay |
| src/service/call-shard-dispatch-pool.js | 113 forwarded:src/service/call-cell-invoker.js |
| src/service/request-cell-call-bridge.js | 137 forwarded:src/runtime/cell-host-call-protocol.js |
| src/service/service-installation-reconciler.js | 325 periodic |
| src/service/service-reconciler.js | 221 periodic; 49 yield |
| src/storage/data-directory-process-owner.js | 33 not a wait: SQLite busy_timeout = 0 (fail fast, no wait) |
| src/storage/sqlite-store.js | 179 forwarded:src/query/query-result-budget.js |
| src/test-helpers/managed-timers.js | 33 forwarded:test callers |
| src/test-helpers/port-allocator.js | 198 delay |
| src/test-helpers/worker/entry-runner.js | 109 yield |
| src/threading/service-thread-manager.js | 121 idle |
| src/time/pct-scheduler.js | 114 not_a_wait:bounded selection loop (test scheduler) |
| src/time/time-source.js | 44 not_a_wait:clock seam |
| src/topology/cdc-group-propagation-delivery-methods.js | 146 delay; 305 debounce; 464 delay |
| src/topology/cdc-group-propagation-lifecycle-methods.js | 66 delay |
| src/topology/cdc-group-propagation-service.js | 83 forwarded:src/topology/cdc-group-propagation-delivery-methods.js |
| src/topology/latency-group-manager.js | 688 periodic |
| src/topology/topology-anti-entropy-reconciler.js | 421 periodic |
| src/transport/bulk-transfer-channel.js | 107 delay |
| src/transport/connection-pool.js | 93 periodic |
| src/transport/message-router-connection-close-reconnect.js | 323 delay; 236 delay; 310 periodic |
| src/transport/message-router-reconnect-behaviors.js | 516 ttl |
| src/transport/message-router.js | 96 forwarded:src/transport/message-router-delivery-behaviors.js |
| src/transport/owner-retry-budget.js | 48 not_a_wait:token bucket |
| src/transport/websocket-transport-provider.js | 460 delay; 484 periodic |
| src/transport/websocket-transport.js | 537 delay; 566 periodic |
| src/utils/replica-creation-progress-reporter.js | 64 periodic |
| src/wasm-service/timer-manager.js | 194 delay |
| src/wasm-service/wasm-service-replica.js | 651 periodic |
| src/workflow/owner-key-reconcile-queue.js | 455 yield |
| src/workflow/reconcile-queue-retry-ownership.js | 225 delay |
| src/workflow/timeout-policy.js | 49 not_a_wait:budget allocator |
