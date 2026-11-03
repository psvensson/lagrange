---
audience: development
documentClass: evidence
---

# Census pass 2: fixed bounds outside pass 1's regex, and the carried items (2026-11-02)

Quest `fixed-work-bound-census-pass-2`. Static analysis at `origin/main`
`81992f8a8`; the quest is sealed at `c88a06ab0`, a records-only declaration
commit on that base. No source or test bound is changed (owner rule).

**Why a new file beside pass 1's `CENSUS.md`, not an appended section.**
Pass 1's census was approved by its verifier (reject at `ddfe38745`, approve
at `c8984f915`) and landed with PR #195. Appending would change an approved,
landed artifact under a different verification. A separate file keeps each
pass's evidence bound to its own review. This file uses pass 1's columns and
classes, plus one new class, "attempt-count". Pass-1 rows are cited as
"pass 1 #n".

## Columns and classes

Same as pass 1:

- **Owner:** the module where the value is defined, and where it is consumed.
- **Waits for:** what the bound waits for.
- **Class:**
  - **liveness:** another party's progress.
  - **work:** our own CPU work.
  - **mixed:** a local drive with remote round trips.
  - **not a wait:** a clamp, margin, interval, sentinel or rate limit.
  - **dead:** no consumer in `src/`.
- **Spent outcome:** read at the site, or "not traced".
- **Re-drive:** whether the next attempt repeats discarded work, or "not traced".
- **Typed spend visibility:** a `wait_bound_spent` reporter for this bound
  (wait name), or "none in the consuming module".
- **History:** the commit that introduced the value; whether the value ever
  changed (`git log -G` on the defining line, values compared).

## 1. Object-member bounds (52) and the replica-operation repository bounds (3)

**The 52.** `grep -rnE "\b[A-Z0-9_]*(TIMEOUT|DEADLINE|BUDGET|BOUND)[A-Z0-9_]*_MS\s*[:=]\s*[0-9_]+" src`,
excluding pass 1's 30, gives 52 lines. They are object members such as
`TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS: 5000`, plus a few plain constants the
pass-1 regex missed because of their name shape.

**The 3.** The replica-operation repository bounds in
`src/rebalancer/replica-operation-repository.js` are computed from `TIME_MS`,
so neither regex finds them. They are added because they spent in main's
post-merge corpus.

**Values.** Every value below is the literal at its definition. Bounds read
through a config key fall back to that value when the key is unset.

| # | Bound | ms | Defined (src/) / consumed | Waits for | Class | Spent outcome | Re-drive | Typed spend visibility | History |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P2-1 | APPLICATION_DATABASE_LIMIT.STOP_TIMEOUT_MS | 30000 | query/application-database-constants.js / embedded-lagrange.js | the embedded database stops | mixed | not traced | no (stop) | `wait_bound_spent` (APPLICATION_DATABASE_LIMIT.STOP_TIMEOUT_MS) | cd6f6d525 2026-08-15; never changed |
| P2-2 | WAIT_BOUND_SPENT_FOLD_WINDOW_MS | 60000 | logging/wait-bound-spent.js | none: the reporter's flood-fold window | not a wait | n/a | n/a | n/a | 54dd2d7ce 2026-10-27 |
| P2-3 | REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS | 30000 | rebalancer/rebalancer-constants.js / replica-operation-liveness.js | a replica operation leaves PENDING or SENDING | liveness (stall detector on an operation's progress) | `wait_bound_spent`, then `failOperation` (operation-workflow-recovery-status-reconcile.js 745-777) | not traced past `failOperation` | `wait_bound_spent` (REBALANCE_OPERATION_STEP_TIMEOUT, operation-workflow-recovery-status-reconcile.js 79-82), one wait name for all step timeouts | 5b9c56b90 2026-01-30; never changed |
| P2-4 | REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS | 60000 | as P2-3 (`getTimeoutForStep`, operation-workflow-recovery-status-reconcile.js) | a replica operation leaves CREATING | mixed (the target node creates the replica) | `wait_bound_spent`, then `failOperation` (operation-workflow-recovery-status-reconcile.js 745-777) | not traced past `failOperation` | `wait_bound_spent` (REBALANCE_OPERATION_STEP_TIMEOUT, operation-workflow-recovery-status-reconcile.js 79-82), one wait name for all step timeouts | 5b9c56b90; never changed |
| P2-5 | REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS | 300000 | as P2-3, and rebalance-coordinator-lifecycle.js (config key fallback) | a replica finishes syncing its data. Clamped to at most 60 s on priority control-plane partitions (PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS, operation-workflow-recovery-status-reconcile.js 552-565, replica-operation-liveness.js 566-575) | **mixed, work-heavy** (data copy and apply grow with data size and load) | `wait_bound_spent`, then `failOperation` (operation-workflow-recovery-status-reconcile.js 745-777) | not traced past `failOperation` | `wait_bound_spent` (REBALANCE_OPERATION_STEP_TIMEOUT, operation-workflow-recovery-status-reconcile.js 79-82), one wait name for all step timeouts | 5b9c56b90; never changed |
| P2-6 | REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS | 60000 | as P2-3 | a replica operation leaves STOPPING (removal) | mixed | `wait_bound_spent`, then `failOperation` (operation-workflow-recovery-status-reconcile.js 745-777); a partition REPLACE at STOPPING is exempt and only records a diagnostic (738-744; `isReplaceExemptFromTimeBudget`, operation-workflow-replace-owner.js 714-722, applies at ACTIVE or STOPPING only) | not traced past `failOperation` | `wait_bound_spent` (REBALANCE_OPERATION_STEP_TIMEOUT, operation-workflow-recovery-status-reconcile.js 79-82), one wait name for all step timeouts | 5b9c56b90; never changed |
| P2-7 | REBALANCER_DEFAULT.COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS | 1000 | rebalancer-constants.js / rebalance-coordinator-lifecycle.js | none: the interval of the stall check | not a wait | n/a | n/a | n/a | 5b9c56b90 at 5000; **changed to 1000 by 8942e8675 2026-03-05** |
| P2-8 | REBALANCER_DEFAULT.UNIFIED.READINESS_PING_TIMEOUT_MS | 1000 | rebalancer-constants.js / unified-rebalancer-lifecycle-base.js | a readiness ping answers | liveness | not traced | not traced | none | 5b9c56b90; never changed |
| P2-9 | SNAPSHOT_RECORDER_DEFAULT.CAPTURE_TIMEOUT_MS | 250 | debug-runtime/snapshot-recorder-constants.js / snapshot-recorder.js | a debug snapshot capture completes | **work** (local capture) | not traced (debug runtime) | not traced | none | a4f4d8a70 2026-02-15; never changed |
| P2-10 | RUNTIME_INTROSPECTOR_DEFAULT.REQUEST_TIMEOUT_MS | 250 | debug-runtime/runtime-introspector-constants.js / runtime-introspector.js | a debug introspection request answers | mixed (own runtime, debug only) | not traced | not traced | none | a4f4d8a70; never changed |
| P2-11 | WASM_RUNTIME_DEFAULT.EXECUTION_TIMEOUT_MS | 30000 | debug-runtime/debug-runtime-constants.js / wasm-runtime-adapter.js | a debug wasm execution completes | **work** | not traced (debug runtime) | not traced | none | a4f4d8a70; never changed |
| P2-12 | FORWARD_TOPOLOGY_REPAIR_DEFAULT.QUERY_TIMEOUT_MS | 1500 | message-group/message-group-service-runtime-support.js / message-group-service-state.js | the forward-topology repair query answers | liveness | not traced | the next repair, after its cooldown, issues the query again; no local work is discarded | none | 59be096ae 2026-03-13 (moved to this module later); value history checked in the defining file only |
| P2-13 | CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS | 1000 | cdc/cdc-constants.js / cdc-integration-service.js | a routed system-table write becomes visible in the local cache | **mixed** (remote commit, then the local CDC apply under load) | `wait_bound_spent`, then the authoritative visibility repair (cdc-integration-service-cache-visibility-wait.js) | the repair reads again | `wait_bound_spent` (CACHE_WAIT_TIMEOUT_MS); 41 spends at 750 ms in the b3b366573 corpus | 5b9c56b90; never changed |
| P2-14 | WALL_BUDGET_EXHAUSTED_ACTUAL_OFFSET_MS | 1 | runtime/wasi-component-cell-runtime.js | none: an offset in a budget report | not a wait | n/a | n/a | n/a | 9b430a9a3 2026-07-23 |
| P2-15 | THREADING_DEFAULT.IDLE_TIMEOUT_MS | 30000 | threading/threading-constants.js / service-thread-manager.js | none: idle threads are reaped after it | not a wait (idle reaping) | n/a | n/a | n/a | 5b9c56b90; never changed |
| P2-16 | ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS | 30000 | runtime/endpoint-sync-constants.js / endpoint-sync-source-client.js | the endpoint-sync source query answers | liveness | `wait_bound_spent`; not traced further | not traced | `wait_bound_spent` (ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS) | 2df6f17d9 2026-02-16; never changed |
| P2-17 | PARTICIPANT_CUTOVER_BOUND.DRAIN_DEADLINE_MS | 30000 | partition/partition-participant-transaction-cutover-constants.js / node/replica-handler-release-recovery.js (the recovery path only: the seed path uses `leadershipWaitTimeoutMs`, section 2) | a recovery cutover attempt returns its canonical outcome (line 208); also the window that dedupes its log report (line 163) | mixed | the attempt answers a canonical outcome; `report` logs it at info | yes: anything but CUT_OVER is enqueued again after RECOVERY_RETRY_MS (line 210) | none: an info log (PARTICIPANT_RELEASE_LOG), no `wait_bound_spent` | 54dd2d7ce 2026-10-27; never changed |
| P2-18 | PARTICIPANT_CUTOVER_BOUND.REPLICA_CENSUS_DEADLINE_MS | 30000 | as P2-17 | none | **dead** (the definition says "no consumer in src/"; confirmed) | n/a | n/a | n/a | 54dd2d7ce |
| P2-19 | PARTICIPANT_CUTOVER_BOUND.REQUEST_TIMEOUT_MS | 5000 | as P2-17 / participant-release-client.js (capped by the remaining deadline) | the release request's transport answer | liveness | the request's transport outcome; not traced further | the caller's release loop issues the request again while its deadline holds | none | 54dd2d7ce |
| P2-20 | PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS | 30000 | partition/partition-constants.js / pending-request-tracker.js | a pending partition request is answered | liveness | `wait_bound_spent`; request rejected | not traced | `wait_bound_spent` (PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS) | 5b9c56b90; never changed |
| P2-21 | TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS | 5 | control-plane/timeout-budget.js / sql-query-engine-* | none: a floor for a remaining budget | not a wait (clamp) | n/a | n/a | n/a | 8942e8675 2026-03-05 |
| P2-22 | TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS | 300000 | control-plane/timeout-budget.js / rebalancer: operation-workflow-recovery-status-reconcile.js 708, operation-workflow-dispatch-rearm-evidence.js 283 and 330, operation-workflow-observed-progress-retention.js 52 and 218, operation-workflow-coordinator-created-handoff-scheduling.js 335, operation-workflow-transition-retry-grace.js 136, operation-workflow-transition-orchestration.js 39 | two uses: the top-level budget that caps each step of a rebalance operation (the sync step included), and the retry window of its dispatch, handoff and transition retries, measured from the operation's start | **mixed, work-heavy** (includes the sync) | by consumer: a step allocation refused fails the operation (typed timeout classification, as P2-3); a deferred retry rearm is dropped (`logDeferredRetryRearmDropped`, dispatch-rearm-evidence.js 309-313) and reported; an observed-progress retry is not armed | no: at spend the rearm is dropped, or the operation fails. Within the window, retries re-drive | `wait_bound_spent` (REBALANCE_OPERATION_BUDGET_MS) on the rearm and retention paths; REBALANCE_OPERATION_STEP_TIMEOUT on the step path | 2599d6b56 2026-03-06; never changed |
| P2-23 | TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS | 300000 | control-plane/timeout-budget.js / managed-split-workflow.js 131 and 296, managed-merge-workflow.js 187, managed-split-workflow-cutover-readiness-methods.js 183 | a managed split or merge completes | **mixed, work-heavy** | `TimeoutPolicy` refuses the budget allocation: `allocateOrThrow` throws a typed error carrying `timeoutClassification` (workflow/timeout-policy.js 107-118) | not traced | `wait_bound_spent` under QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS, on the split cutover readiness path only (managed-split-workflow-cutover-readiness-methods.js 24 and 37), where SPLIT_OPERATION_BUDGET_MS is the budget's fallback (175-186); elsewhere the typed `timeoutClassification` | 2599d6b56; never changed |
| P2-24 | TIMEOUT_BUDGET_DEFAULT.DISPATCH_OPERATION_BUDGET_MS | 60000 | timeout-budget.js | none | **dead** (no consumer in src/; only test/control-plane/timeout-budget.test.js reads it) | n/a | n/a | n/a | 2599d6b56 |
| P2-25 | TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS | 60000 | timeout-budget.js / distributed-transaction-coordinator.js | a distributed transaction completes | mixed | `wait_bound_spent`; not traced further | not traced | `wait_bound_spent` (TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS) | 12a52da9a 2026-03-08; never changed |
| P2-26 | TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS | 60000 | timeout-budget.js / partition-service-durability-fitness.js, partition-service-core-base.js | a prepared transaction's decision arrives | liveness (the coordinator's decision) | `wait_bound_spent`; not traced further | not traced | `wait_bound_spent` (TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS) | 12a52da9a; never changed |
| P2-27 | CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS | 5000 | timeout-budget.js | a control-plane SQL query answers | mixed | not traced | not traced | none | 8942e8675; never changed |
| P2-28 | INBOUND_DRAIN_DELAY_MS | 0 | raft/raft-rs-runtime-owner-constants.js / raft-rs-runtime-owner.js | none: the wake delay of the inbound drain | not a wait | n/a | n/a | n/a | 1aea11baf 2026-09-30 |
| P2-29 | PERSISTENCE_ADMISSION_WAIT.BOUND_MS | 120000 | raft/raft-rs-runtime-owner-constants.js / raft-rs-persistence-admission.js, raft-rs-runtime-owner.js | a user session's open transaction on the shared connection ends: `persistenceAdmission()` refuses only USER_TRANSACTION_OPEN (raft-rs-durable-store.js 403-414), so this is a wedged-session detector tied to P2-26's 60 s prepared hold | liveness | two paths: a held Ready reports and answers `groupHostFailure` (raft-rs-runtime-owner.js 326-333); the inbound drain reports, clears its deadline and stops retrying (2034-2048) | no | `wait_bound_spent` (PERSISTENCE_ADMISSION_WAIT.BOUND_MS, and "(inbound drain)"), via `reportWaitBoundExceeded` | 1aea11baf 2026-09-30; never changed |
| P2-30 | FUNCTION_DEFAULT.QUERY_TIMEOUT_MS | 30000 | function/function-constants.js / function-query-executor.js | a function's query answers | mixed | `wait_bound_spent`; not traced further | not traced | `wait_bound_spent` (FUNCTION_DEFAULT.QUERY_TIMEOUT_MS) | 5b9c56b90; never changed |
| P2-31 | BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS | 5000 | bootstrap/bootstrap-constants.js / service-leader-readiness-owner.js 211-215, seed-partitions-phase.js 501 | partition leaders appear: despite its name this is the fallback bound used when `leadershipWaitTimeoutMs` is not a positive number, not a cap | liveness | at service-leader-readiness-owner.js: `wait_bound_spent`, then the wait returns; seed-partitions-phase.js not traced | not traced | `wait_bound_spent` (leadershipWaitTimeoutMs) at service-leader-readiness-owner.js | 5b9c56b90; value history checked in the defining file only |
| P2-32 | MANAGEMENT_V1_CONTRACT.DEFAULT_NODE_UPGRADE_TIMEOUT_MS | 30000 | bootstrap/owners/management-v1-constants.js / rolling-upgrade-owner.js | an upgraded node comes back | liveness | not traced | not traced | none | 510babcf1 2026-10-31; never changed |
| P2-33 | AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS | 1500 | control-plane/control-plane-readiness-service-shared.js / control-plane-readiness-participation-base.js | the authoritative readiness repair query answers | liveness | not traced | the next repair, after its cooldown, issues the query again; no local work is discarded | none | d378c9083 2026-03-08 (moved later); value history checked in the defining file only |
| P2-34 | TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS | 5000 | constants/transport.js / message-router.js (and learner-promotion, heartbeat) | an ACK for a sent message, then its SERVICE_RESPONSE | liveness | `wait_bound_spent`; ROUTER_MESSAGE_TIMEOUT | caller-dependent, not traced | `wait_bound_spent` ("MESSAGE_TIMEOUT_MS (delivery ACK)", "(remaining SERVICE_RESPONSE grant after ACK)"); 11 + 1 spends in the b3b366573 corpus | 5b9c56b90; never changed |
| P2-35 | TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS | 30000 | transport.js / message-router.js | none: the window in which ACK timeouts quarantine a peer | not a wait (window) | n/a | n/a | n/a | b1ec24664 2026-06-10 |
| P2-36 | TRANSPORT_DEFAULT.PING_TIMEOUT_MS | 1000 | transport.js / message-router.js | a peer answers a ping | liveness | `wait_bound_spent`; peer liveness decision | not traced | `wait_bound_spent` (PING_TIMEOUT_MS, message-router-peer-liveness.js) | 5b9c56b90; never changed |
| P2-37 | TRANSPORT_DEFAULT.RPC_TIMEOUT_MS | 30000 | transport.js (re-exported as RPC_DEFAULT.TIMEOUT_MS) / transport/rpc-client.js | an RPC answer | liveness | `wait_bound_spent`; not traced further | not traced | `wait_bound_spent` (RPC_DEFAULT.TIMEOUT_MS (or call timeout)) | 5b9c56b90; never changed |
| P2-38 | TRANSPORT_DEFAULT.OUTBOUND_QUEUE_BACKPRESSURE_RETRY_AFTER_MS | 500 | transport.js / message-router-outbound-delivery-registry.js | none: a retry-after hint on a backpressure error | not a wait | n/a | n/a | n/a | 01d5ea6e2 2026-06-03 |
| P2-39 | CALL_CELL_INVOCATION_DEFAULT.DEADLINE_MS | 30000 | bootstrap/shared/call-cell-invocation-setup.js | a call-cell invocation completes | mixed (a remote cell executes the work) | not traced | not traced | none in the consuming module | c9fe4c4ad 2026-08-02; never changed |
| P2-40 | DISPATCH_DEFAULT.OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS | 1000 | control-plane/replica-dispatch-service-constants.js / replica-dispatch-replay-health-readiness.js | the dispatch readiness refresh answers | mixed | `wait_bound_spent` | not traced | `wait_bound_spent` (OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS) | 8f284ad8a 2026-04-13; never changed |
| P2-41 | ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS | 10000 | constants/entrypoint.js / entrypoint-runtime-shutdown-lifecycle.js | readiness drains at shutdown | mixed | not traced | no (shutdown) | none | 02b0c2b72 2026-02-22; never changed |
| P2-42 | ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_TIMEOUT_MS | 1000 | entrypoint.js / entrypoint-runtime-join-decision.js | the auto-rejoin probe answers | liveness | `wait_bound_spent`; the probe answers `ready: false` | not traced | `wait_bound_spent` (AUTO_REJOIN_PROBE_TIMEOUT_MS) | 28f413983 2026-03-30; never changed |
| P2-43 | REQUEST_CALL_BRIDGE_DEADLINE_DEFAULT_MS | 30000 | service/request-cell-call-bridge.js | a request-cell host call answers | mixed | not traced | not traced | none | 417b119a6 2026-08-03 |
| P2-44 | BOUNDED_SNAPSHOT_PROBE_DEADLINE_SAFETY_MARGIN_MS | 2000 | admin/admin-control-snapshot-local-diagnostics-methods.js | none: a margin | not a wait | n/a | n/a | n/a | 878d5280d 2026-06-04 |
| P2-45 | LATENCY_MEASUREMENT_CONFIG_MIN.PING_TIMEOUT_MS | 1 | topology/latency-measurement-service.js | none: a minimum for a configured ping timeout | not a wait (clamp) | n/a | n/a | n/a | 196c7ef85 2026-02-13 (moved and rewritten by 06273547c); value history not compared across the move |
| P2-46 | MIGRATION_DEFAULT.TIMEOUT_BUDGET_MS | 300000 | migration/migration-constants.js / migration-coordinator.js | a migration completes | **mixed, work-heavy** | as P2-23 (`TimeoutPolicy`, migration-coordinator.js 274-278) | not traced | none under this bound: the reporter in migration-coordinator-stage-methods.js covers MIGRATION_DEFAULT.MAX_RETRY_COUNT | 842e368f5 2026-03-08; never changed |
| P2-47 | ADMIN_DEFAULT.QUERY_TIMEOUT_MS | 30000 | admin/admin-constants.js / admin-websocket-* | an admin query answers | mixed | `wait_bound_spent` | not traced | `wait_bound_spent` (ADMIN_DEFAULT.QUERY_TIMEOUT_MS) | 5b9c56b90; never changed |
| P2-48 | LOAD_LANE_QUERY_TIMEOUT_CAP_MS | 15000 | admin/admin-websocket-api-shared.js / admin-websocket-api-base.js | none: a cap | not a wait (clamp) | n/a | n/a | n/a | first defined by 28f413983 2026-03-30 at 3000; **raised to 15000 by 28759d2cf 2026-05-25** |
| P2-49 | SQL_REQUEST_TIMEOUT_BUDGET_COMPLETION_MARGIN_MS | 250 | admin-websocket-api-shared.js | none: a margin | not a wait | n/a | n/a | n/a | e2797b6c8 |
| P2-50 | BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_WRITE_RETRY_TIMEOUT_MS | 2000 | bootstrap/bootstrap-api-constants.js / service-registration-handoff-owner.js | the service-registration write is accepted | mixed | not traced | the write is retried within the bound | none | e0bb7d64f 2026-03-23; value unchanged (06273547c rewrote `NUM.TWO * NUM.THOUSAND` to `2 * NUM.THOUSAND`) |
| P2-51 | CDC_REESTABLISHMENT.TIMEOUT_MS | 30000 | bootstrap/node-joining-constants.js / node-joining-cdc-subscription-and-backfill.js | CDC is re-established for a joining node | mixed | `wait_bound_spent` | not traced | `wait_bound_spent` (CDC_REESTABLISHMENT.TIMEOUT_MS) | 1acf781fd 2026-03-16; never changed |
| P2-52 | OUTBOUND_SATURATION_WARN_INTERVAL_MS | 1000 | transport/message-router-outbound-delivery-registry.js | none: a warning rate limit | not a wait | n/a | n/a | n/a | 2bfdca120 2026-06-11 (moved to this module later); value never changed |
| P2-53 | OPERATION_PERSIST_RETRY_TIMEOUT_MS | 15000 | rebalancer/replica-operation-repository.js / replica-operation-repository-mutation-gateway-methods.js | a replica_operations mutation is committed by the control plane | **mixed** (remote commit, retried) | `wait_bound_spent`; mutation failure | the mutation is retried within the bound; at spend the failed result is returned | `wait_bound_spent`; 20 spends in the b3b366573 corpus, max elapsed 21431 ms | 7e0c039d7 2026-02-10 at 5000; **raised to 15000 by a767c13ad 2026-04-06** |
| P2-54 | REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS | 5000 | replica-operation-repository.js | the persisted row reads back authoritatively and matches | liveness | `wait_bound_spent` | the read is retried within the bound | `wait_bound_spent`; 4 spends, max 5404 ms | 28f413983 2026-03-30; never changed |
| P2-55 | REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS | 1000 | replica-operation-repository.js / replica-operation-repository-read-methods.js | an authoritative replica_operations read without a retryable failure | liveness | `wait_bound_spent` | the read is retried within the bound | `wait_bound_spent`; 9 spends, max 1185 ms | a767c13ad 2026-04-06; never changed |

### Totals (55)

| Class | Count | Rows |
| --- | --- | --- |
| work | 2 | P2-9, P2-11 |
| mixed | 21 | P2-1, P2-4, P2-5, P2-6, P2-10, P2-13, P2-17, P2-22, P2-23, P2-25, P2-27, P2-30, P2-39, P2-40, P2-41, P2-43, P2-46, P2-47, P2-50, P2-51, P2-53 |
| liveness | 17 | P2-3, P2-8, P2-12, P2-16, P2-19, P2-20, P2-26, P2-29, P2-31, P2-32, P2-33, P2-34, P2-36, P2-37, P2-42, P2-54, P2-55 |
| not a wait | 13 | P2-2, P2-7, P2-14, P2-15, P2-21, P2-28, P2-35, P2-38, P2-44, P2-45, P2-48, P2-49, P2-52 |
| dead | 2 | P2-18, P2-24 |

**Work-heavy mixed bounds.** Four bounds cover work that grows with data and
load, the repair-shape (3) candidates under R12: P2-5 SYNCING 300 s, P2-22
REBALANCE 300 s (as the cap over the sync step), P2-23 SPLIT 300 s and P2-46
MIGRATION 300 s. Each was read at its site. P2-22 is a cap and a retry window,
not a wait for the sync itself, and P2-5 is already clamped to 60 s on priority
control-plane partitions.

**Three value changes in this set.** Only three of the 55 values have changed
since they were first defined:

- P2-53 OPERATION_PERSIST_RETRY_TIMEOUT_MS: 5000 to 15000 (a767c13ad, 2026-04-06).
- P2-7 TIMEOUT_CHECK_INTERVAL_MS: 5000 to 1000 (8942e8675, 2026-03-05).
- P2-48 LOAD_LANE_QUERY_TIMEOUT_CAP_MS: 3000 to 15000 (28759d2cf, 2026-05-25).

Value history was compared across all of `src/` for the rows with a unique
name. Rows with a generic name (`QUERY_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS` and
the like) were compared in the defining file only, which the rows say.

**Dead entries.** P2-18 and P2-24 have no consumer. Their removal belongs to
their owners (R17), not to this census.

**Not traced.** Spent outcomes marked "not traced" were not followed past
the consuming site in this pass.

## 2. The seed participant release budget and the leader-metadata-validation file cap

### The "3000 ms seed release budget" is `leadershipWaitTimeoutMs`, a test value

- **What the budget is.** `bootstrap-service-seed-workflow.js` lines 314-345 set
  `budgetMs = this.config.leadershipWaitTimeoutMs`. That one deadline then
  covers every cohort's `completeParticipantRelease`, run in sequence.
- **Where 3000 comes from.**
  `test/raft/raft-rs-backend/single-path-partition-cutover.test.js:347` sets
  `leadershipWaitTimeoutMs: 3000`. The product default is 30000
  (`src/config/config-definitions.js:61`, `src/bootstrap/node-joining-constants.js:19`).
- **Owner and class.** The seed workflow owns the shared deadline. The wait is
  **mixed**: each release drains and observes the applied position on the
  participants.
- **Spent outcome.** The failing cohort answers `release_fact_unavailable`
  (`missingFact: replica_release_reply`,
  `participant-release-applied-position-observation.js:67-72`). The seed
  throws `SEED_PARTICIPANT_RELEASE_ERROR.FAILED_PREFIX` with a budget
  projection (`participantReleaseSeedBudgetObservation`). There is no
  `wait_bound_spent` under this budget's own name; the
  `leadershipWaitTimeoutMs` reporter in `service-leader-readiness-owner.js:40`
  covers the leadership wait, not the release.
- **Measured.**
  - Red twice on PR #184's hosted gate (run 41453311388), once each on two
    partitions: latency_groups-p1 at 3004 ms and schema_operations-p1 at
    3003 ms (read independently from the run by the verifier).
  - Red once on PR #194's (run 41467200945), the same shape.
  - Green on the lab and on this controller.
- **Not an un-cancelled race.** The pass-2 declaration guessed this budget
  belonged to pass 1's un-cancelled-race family. It does not: the deadline is
  passed down (`deadlineAtMs: deadline`) and caps each request
  (`cappedRequestTimeoutMs`, `participant-release-client.js:50-52`), so the
  work ends with the bound. Nothing keeps running past it.
- **Repair shape.** The deadline is shared across a sequence of cohorts, so a
  fixed value scales neither with the cohort count nor with the machine. Two
  options:
  - shape (3), the machine factor, for the product default;
  - a per-cohort budget, owned by the seed workflow.

  The 3000 in the test is a test bound. Under the no-bound-change rule it is
  recorded, not changed. Owner of the test value: the test file.

### leader-metadata-validation's file cap

- **The bound.** `test/integration/leader-metadata-validation.integration.test.js:226`
  declares `{timeout: 60000}`, while its CDC readiness budget at line 210 is
  scaled by `scaleByMachineFactor(3000)`.
- **Class.** Work, mixed: the cap covers four subtests of cluster bootstrap.
- **Measured.**
  - Hosted (#194): subtests 1-3 took about 51.5 s, and the file was cut at
    60.1 s on both passes.
  - Locally: base 56.1 s; candidate 60.3 s red, then 43.2 s green.
- **Repair shape.** Scale the file cap through `scripts/test-machine-factor.js`
  as the readiness budget already is. That is a test-bound change, so it is
  recorded, not changed. Owner: the test.

## 3. Attempt-count bounds, their own class

An attempt-count bound limits retries, not milliseconds. Pass 1 excluded the
two `MESSAGE_GROUP_RETRY_MAX_ATTEMPTS (direct delivery)` spends of the
b3b366573 corpus for that reason.

**The bound.** It is defined by config key `messageGroup.retryMaxAttempts`
(`src/config/config-definitions.js:395`). Its reporters are
`message-retry-handler.js:34` (`MESSAGE_GROUP_RETRY_MAX_ATTEMPTS`) and
`message-group-service-outbound-dispatch-runtime-methods.js:12`
(`... (direct delivery)`).

**How it behaves under load.** A count limits how many times something is
tried, so it inherits the behaviour of what spends an attempt:

- **Time-spent attempts.** Each attempt ends on a per-attempt time bound or a
  fixed delay. The count then inherits the class of that bound: load spends
  each attempt faster in wall-clock terms and exhausts the count.
- **Failure-driven attempts.** Each attempt ends on a typed failure or a fast
  refusal, not a timer (for example `MAX_COMPARE_AND_SWAP_ATTEMPTS`, spent by
  lost compare-and-swaps). The count then measures contention, and it can
  exhaust in milliseconds with no time bound involved. Load raises the failure
  rate, so a time scale does not help; backoff or admission does.

**The class's members.** Typed reporters of an attempt, retry, cycle or run
count in `src/` (wait names, from all `wait:` strings):

Attempt counts (20):

- `LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS`
- `getReadRetryAttemptLimit`
- `MESSAGE_GROUP_RETRY_MAX_ATTEMPTS`, and its "(direct delivery)" variant
- `CATCHUP_DEFAULT.MAX_ATTEMPTS_PER_TABLE`
- `CDC_DEFAULTS.RETRY_MAX_ATTEMPTS`
- `authoritative_visibility_repair_attempts` (its attempts or the remaining
  budget; it reports the budget as `boundMs`, which is why it appeared in pass
  1's spent table)
- `reconcile queue retryPolicy.maxAttempts`
- `outstanding_split_proposal_attempts`
- `MAX_COMPARE_AND_SWAP_ATTEMPTS`
- `REDRIVE_DEFAULT.FALLBACK_ATTEMPTS`
- `LEADER_PUBLICATION_RETRY_BUDGET_ATTEMPTS`
- `PUBLICATION_WRITE_MAX_ATTEMPTS`
- `ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS`
- `CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS`
- `TRAFFIC_READINESS_WAIT_DEFAULT.MAX_ATTEMPTS`
- `retryableJoinResumePolicy.maxAttempts`
- `readySignalMaxAttempts`
- `LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.MAX_ATTEMPTS`
- `RECONNECT_MAX_ATTEMPTS`

Retry, cycle and run counts that have no "attempt" in the name (9):

- `CDC_REESTABLISHMENT.MAX_RETRIES`
- `DEFAULT_RETRY_CONFIG.maxRetries`
- `ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES`
- `LOGS_TABLE_DEFAULT.MAX_RETRIES`
- `MIGRATION_DEFAULT.MAX_RETRY_COUNT`
- `PARTICIPANT_RETRY_DEFAULT.MAX_RETRIES`
- `RAFT_RS_READY_DRAIN_MAX_CYCLES`
- `REPLACE_OWNER_WAKE_MAX_RUNS`
- `RUNTIME_TARGET_CLAIM_RETRY_LIMIT`

Classifying each member's per-attempt behaviour is left to the next pass.

**Time bounds with "attempt" in the name, not counts (4):**

- `heartbeatAttemptTimeoutMs`
- `clientAttemptDeadlineMs`
- `proposeTimeoutMs (MESSAGE_GROUP_DELIVERY_TIMEOUT_MS / attempts)`, a
  per-attempt time deadline
- `CONNECT_TIMEOUT_MS (+ per-attempt step, capped)`

## 4. Pass 1 rows 16 and 5, re-checked against the code at 81992f8a8

- **Row 16, `AUTHORITATIVE_LEADER_REFRESH_QUERY_TIMEOUT_MS`.**
  `service-leader-readiness-owner.js` has one reporter, wait
  `leadershipWaitTimeoutMs` (line 40, reported at 233). The 1500 ms constant
  (line 43) only caps a supplied query timeout (lines 423-431). So row 16 has
  no typed spend of its own. **Pass 1's correction holds.**
- **Row 5, `DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS`.**
  `src/config/dynamic-config-startup-wiring.js` at this base is unchanged
  since 54dd2d7ce: `withTimeout`, the dropped reference and the orphaned
  initialize are as pass 1 recorded. **Pass 1's mixed class holds.** The
  repair is quest `dynamic-config-startup-owned-initialization`, at attempt 1
  (1da1aedc2), under verification and not landed. After it lands, row 5's
  spend is typed and its controller owned.

## 5. The WASI derivation lane's online bound

- **Source.** The approved owner at `69a618984`, branch
  `work/wasi-component-startup-budget-20261102`, not yet landed at this base:
  `wasi-component-derivation.js` in `src/runtime/` at that commit, which is not on main at this base (`WasiComponentDerivationOwner`).
- **The CPU ceiling is a work bound measured in CPU time.** The ceiling is
  `DERIVATION_CPU_FIXED_MS` 5000 + 2000 ms per MiB (lines 54-55, 110-116),
  read with `worker.cpuUsage()` every `DERIVATION_CPU_SAMPLE_INTERVAL_MS`
  (250). Exceeding it is a typed REFUSED/EXHAUSTED outcome. It measures our
  own work in CPU time, not wall-clock, so load cannot spend it. This is the
  instrument the census recommends for work bounds.
- **No bound before 'online'.** The sampler is scheduled only by the worker's
  `online` event (around line 292). A derivation thread that wedges before
  going online, with no `error` or `exit`, holds the node's serial derivation
  lane without bound.
  - Class: a **missing liveness bound** on thread start.
  - Visibility: none.
  - This is the approving verifier's R17 finding (1), recorded in the WASI
    quest log.
- **Repair shape.** The verifier names a wall-clock liveness bound on
  `online`, of the `STARTUP_TIMEOUT_MS` class. This census adds one caution:
  thread start is itself delayed by load. Such a bound must be generous, or
  machine-scaled under shape (3), and its spend reported. Otherwise it
  reintroduces the pass-1 pattern. Owner: `WasiComponentDerivationOwner`. The
  decision is deferred to that owner.

## What is not covered

- **Attempt-count bounds:** each one's per-attempt bound is not classified
  (named only).
- **Other computed bounds:** 35 lines, not classified. The method is a grep of
  `src/*.js` for a line that starts with an optional `export`, an optional
  `const`, then a name containing TIMEOUT, DEADLINE, BUDGET or BOUND and ending
  in `_MS`, then `:` or `=` not followed by a second `=`. That gives 182 lines,
  with each right-hand side read (the next line when it is empty):

  | Bucket | Lines |
  | --- | --- |
  | numeric literal | 80 |
  | config keys, type names and objects | 53 |
  | computed (`TIME_MS.`, `NUM.`, or a number times something) | 39 |
  | aliases of another name | 10 |

  Of the 39 computed lines, 4 are classified here (P2-53, P2-54, P2-55,
  P2-50), which leaves 35. Examples: `REPLICA_OPERATION_DISPATCH_TIMEOUT_MS`,
  `DEFAULT_RETRY_TIMEOUT_MS`, `JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS`,
  `CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS`, `CDC_PIPELINE_READINESS_TIMEOUT_MS`
  and `CLUSTER_READINESS_TIMEOUT_MS`.
- **Reporter checks:** typed visibility was read by wait-name grep and the
  consuming module. A bound whose reporter uses a different name, in another
  module, may be shown here as "none" (P2-37's reporter was found that way on
  a second look).
