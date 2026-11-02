# Census: fixed bounds in src/ that measure our own work (2026-11-02)

Quest `fixed-work-bound-census`. Static analysis at `origin/main` `6d58fdba1`; no
source or test bound is changed by this record (owner rule: no test-bound
change).

## The hypothesis

R12 says load slows the system and never breaks it. A bound that is labelled as
a liveness bound ("the other party did not answer in time") but in fact
measures CPU work done on this node turns load into failure: a slower machine,
or the same machine under load, does the same work more slowly, the bound is
spent, the work is thrown away, and a re-drive repeats it under the same load.

Three measurements on 2026-11-02 point at this pattern:

1. **WASI cell startup (`STARTUP_TIMEOUT_MS`, 10 s).** The startup wait
   includes the jco transpile of the component: 3.5 s alone and 13 s with four
   concurrent on two cores. Owned by quest `wasi-component-startup-budget`
   (WASI agent, option (c): take the transpile out of the bounded wait). That
   repair is cited here and not duplicated.
2. **Query partition execution deadline (`partition_execution_deadline`,
   `boundMs` 2500).** In main's post-merge corpus at `b3b366573` (log
   `.git/lagrange-local-corpus/b3b3665736875a6d0df5d29edc8b52ab96c53344.log`),
   `test/integration/user-table-metadata-fanout.integration.test.js` was red on
   its first pass and on its retry. The run was under a six-agent load with
   thermal holds at 90 C.
3. **Partition runtime reconstruction (`GROUP_BUDGET_MS`, 10 s).** This is in
   `test/partition/partition-runtime-reconstruction-leadership.test.js`. W-B6-3
   failed under seven thermal holds and passed alone, in the verifier lane on
   2026-11-02. This bound is a test bound, outside this census's src scope; it
   is recorded as a measurement.

### Spent bounds in the b3b366573 post-merge corpus

These are all `wait_bound_spent` events in the corpus log, grouped by
`wait` and `boundMs`. The log interleaves every test; several tests exhaust
bounds on purpose (negative cases), so these counts are not all defects.

| wait | boundMs | spends | max elapsed ms | awaited |
| --- | --- | --- | --- | --- |
| partition_execution_deadline | 2500 | 117 | 2690 | successful partition delivery before the execution deadline |
| CACHE_WAIT_TIMEOUT_MS | 750 | 41 | 1243 | routed system-table write visible in the local cache |
| OPERATION_PERSIST_RETRY_TIMEOUT_MS | 15000 | 20 | 21431 | replica_operations mutation committed by the control plane |
| QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS | 2500 | 11 | 2589 | every partition result of one fan-out chunk |
| REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS | 1000 | 9 | 1185 | authoritative replica_operations read without a retryable failure |
| authoritative_visibility_repair_attempts | 1000 | 7 | 882 | authoritative confirmation of the cache visibility hole |
| REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS | 5000 | 4 | 5404 | persisted replica operation authoritatively visible |
| partition_execution_deadline | 30000 | 4 | 30024 | successful partition delivery before the execution deadline |
| table_partition_target_node_wait | about 10000 | 9 | 10075 | active provisioning target nodes for a partition |
| MESSAGE_TIMEOUT_MS (delivery ACK) | various (2 to 500, remaining budgets) | 10 | 558 | ACK for a sent SERVICE_MESSAGE |

Two observations:

- **Overshoot.** `elapsedMs` above `boundMs` by up to 43 percent (1243 for
  750) and 6.4 s past a 15 s bound. That is the event loop late to fire the
  bound's own timer, which is the same CPU starvation the work inside the
  bound suffers.
- **The 2500 ms deadline is not a src constant.** The bound reaches the
  executor through a caller-supplied `timeoutMs` (`resolvePartitionExecutionTimeoutMs`
  in `src/query/query-executor-partition-attempt-budget.js`). The src default is
  `queryTimeoutMs: 30000` (`src/config/config-definitions.js`). The source of the
  2500 in the fanout test path was not traced in this pass.

## Method

- **Census set (29).** Every
  `const <NAME>(_TIMEOUT_MS|_DEADLINE_MS|_BUDGET_MS|BOUND_MS) = <number>` in
  `src/`, found by
  `grep -rnE "^\s*(export )?const [A-Z0-9_]*(_TIMEOUT_MS|_DEADLINE_MS|_BUDGET_MS|BOUND_MS)\s*=\s*[0-9_]+" src`.
- **Classification.** Each constant was classified at its use site; the
  `ends-on:` comments these files carry name the awaited event. The classes:
  - **liveness:** waits for another party's progress (a remote answer, an
    ACK, an external signal).
  - **work:** waits for our own CPU work.
  - **mixed:** a local drive that contains both remote round trips and local
    CPU.
  - **not a wait:** a clamp, margin or sentinel.
  - **test-only:** in `src/test-helpers`, outside the product.
- **History.** `git log --reverse -S <NAME> -- src` gives the introducing
  commit; `git log -G "const <NAME> = "` on the owning file gives the value
  changes.
- **Out of the 29.** A further 52 object-member bounds
  (`NAME_MS: <number>` in constants objects, for example
  `CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS`, `QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS`,
  `TRANSPORT.MESSAGE_TIMEOUT_MS`) are outside the regex. The ones that spent in
  the post-merge corpus are covered in the table above. The rest are listed by
  name in the appendix, unclassified.
- **Prior census.** The bounded-wait census of 2026-10-04
  (`solve/epics/raft-rs-full-cutover/census-bounded-waits-2026-10-04.md`)
  established the spent-bound reporter (`src/logging/wait-bound-spent.js`) and
  wired visibility. It did not classify bounds as liveness or work.

## Table: the 29 fixed bounds

"Spent outcome" is what the site does when the bound expires, read at the site.
"Re-drive" is whether the next attempt repeats work the spent attempt threw
away. "not traced" means the outcome was not followed past the site in this
pass.

| # | Constant | ms | Owner module (src/) | Waits for | Class | Spent outcome | Re-drive repeats discarded work | History |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | STARTUP_TIMEOUT_MS | 10000 | runtime/wasi-component-cell-runtime.js | cell worker ready message, after the jco transpile of the component | **work** (measured: transpile 3.5 s alone, 13 s at four concurrent on 2 cores) | `wait_bound_spent` + `START_FAILED` | yes: a restart transpiles again from scratch | 9b430a9a3 2026-07-23; value never changed. Repair owner: quest wasi-component-startup-budget, option (c) |
| 2 | HEALTH_TIMEOUT_MS | 1000 | runtime/wasi-component-cell-runtime.js | the cell worker answers PING | **mixed** (own worker thread; starved under CPU load) | health false and `_stop(serviceId)`: a slow pong kills a healthy cell | yes: the restart repeats startup, transpile included, adding load | 9b430a9a3 2026-07-23; never changed |
| 3 | HOST_CALL_DEFAULT_WAIT_BUDGET_MS | 5000 | runtime/cell-host-call-protocol.js | the host answers a cell's nested binding call | mixed (the host executes the call) | host-call deadline; not traced | not traced | 417b119a6 2026-08-03; never changed |
| 4 | DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS | 300 | config/dynamic-config-startup-wiring.js | startup read of one dynamic-config key (logging appliers and raft timing keys) | **mixed**, mostly local work at startup | warn `INITIAL_APPLY_FAILED`; the value is not applied and the node runs on defaults | no re-drive: **load changes configuration** (a raft timing override silently not applied) | 9939b3ff6 2026-02-24; never changed |
| 5 | DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS | 300 | config/dynamic-config-startup-wiring.js | `RaftAdaptiveTimingController.initialize()` | **work**/mixed | warn; the controller is set to null for the life of the process | no re-drive: **load disables adaptive timing for the whole run** | 9939b3ff6 2026-02-24; never changed |
| 6 | READINESS_PROBE_ASYNC_TIMEOUT_MS | 250 | bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js | async readiness snapshot evaluation | **work** | falls back to the synchronous snapshot (degrades, does not fail) | yes: the evaluation is redone synchronously | 8f284ad8a 2026-04-13; never changed. A slow-not-break example |
| 7 | OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS | 15000 | control-plane/membership-publication-coordinator-reconcile.js | one `reconcileActiveGateMembershipPublication()` drive | mixed | `wait_bound_spent`; the raced drive is not cancelled and keeps running | the next interval starts a new drive, possibly beside the old one | a617fb59c 2026-06-08; never changed |
| 8 | OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS | 5000 | rebalancer/operation-owner-shutdown-join.js | in-flight owner-lane executions settle at shutdown | mixed | typed `timed_out` join + `wait_bound_spent` | no (shutdown) | c0c73cb06 2026-08-07; never changed |
| 9 | SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS | 3000 | entrypoint-runtime-shutdown-lifecycle.js | logs-table persistence shutdown flush | mixed (local flush and writes) | time-boxed best-effort step, logged; shutdown proceeds | no (shutdown) | e53544b7b 2026-06-18 (CL-030 fix C); never changed |
| 10 | AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS | 250 | cdc/cdc-integration-service-shared-constants.js | authoritative fallback repair of a CDC cache miss | mixed | fallback outcome (`AUTHORITATIVE_FALLBACK_OUTCOME`); not traced past it | the next read repeats the repair | 8f284ad8a 2026-04-13; never changed |
| 11 | PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS | 1000 | admin/admin-preflight-snapshot.js | authoritative discovery-cache repair during admin preflight | mixed | not traced | not traced | 8942e8675 2026-03-05; never changed |
| 12 | DEFAULT_DEADLINE_MS | 5000 | service/cell-ingress-transport.js | the cell dispatch response | mixed (the remote cell executes the request) | dispatch deadline; not traced | not traced | af04c9855 2026-07-23; never changed |
| 13 | PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS | 15000 | query/sql-query-engine.js | delivery of a priority control-plane transaction to its partition | liveness (remote apply includes the remote node's CPU) | the executor's partition deadline path (`partition_execution_deadline`) | caller-dependent | 86b7b178c 2026-04-23; never changed |
| 14 | AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS | 1500 | control-plane/authoritative-control-plane-view.js | the authoritative control-plane query answers | liveness | query timeout; caller retries | the read, not local work | d378c9083 2026-03-08; never changed |
| 15 | AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS | 1500 | admin/admin-service-discovery.js | the authoritative repair query answers | liveness | query timeout | the read | dc9927ec7 2026-03-03; never changed |
| 16 | AUTHORITATIVE_LEADER_REFRESH_QUERY_TIMEOUT_MS | 1500 | bootstrap/owners/service-leader-readiness-owner.js | the authoritative partitions/services read answers | liveness | query timeout | the read | eeffda99f 2026-07-15; never changed |
| 17 | DEFAULT_REPAIR_QUERY_TIMEOUT_MS | 1500 | control-plane/authoritative-node-evidence-reconciler.js | the node snapshot repair read answers | liveness | query timeout | the read | 8f284ad8a 2026-04-13; never changed |
| 18 | REPORTER_VISIBILITY_QUERY_TIMEOUT_MS | 1000 | control-plane/heartbeat-service-runtime-state.js | the heartbeat reporter's visibility readback answers | liveness | query timeout; visibility decision state | the read | d378c9083 2026-03-08; never changed |
| 19 | PRIORITY_RECOVERY_REPLACE_REMOVE_DISPATCH_SPREAD_STALL_BUDGET_MS | 60000 | control-plane/priority-recovery-snapshot-ingress.js | a REPLACE remove-dispatch step's age before it counts as stalled | liveness (stall detector) | unmasks the spread so the step re-drives | yes, by design (the stalled dispatch) | 3aad76314 2026-06-29; never changed |
| 20 | DEFAULT_DEADLINE_MS | 300000 | diagnostics/formation-attribution-window.js | the formed signal (SIGUSR2) arrives | liveness (external signal, diagnostics only) | the attribution window closes | no | af04c9855 2026-07-23; never changed |
| 21 | CDC_ROUTED_MUTATION_MIN_ATTEMPT_TIMEOUT_MS | 1000 | cdc/cdc-routed-mutation-readiness.js | floor of one attempt's slice of a routed system-table write budget (CL-017) | not a wait (clamp on a liveness wait) | the attempt times out; the next attempt runs | the routed write (idempotency key) | 0c852cf6c 2026-06-11; never changed |
| 22 | READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS | 1 | query/query-executor-partition-attempt-budget.js | none: a 1 ms cut of a not-connected candidate, so the next is tried | not a wait | by design | no | 85dd012ef 2026-05-21 |
| 23 | BOUNDED_SNAPSHOT_PROBE_MIN_DEADLINE_MS | 2000 | admin/admin-control-snapshot-local-diagnostics-methods.js | clamp on an admin snapshot probe deadline | not a wait | clamp | no | 878d5280d 2026-06-04 |
| 24 | BOUNDED_SNAPSHOT_PROBE_MIN_SHORT_DEADLINE_MS | 1 | admin/admin-control-snapshot-local-diagnostics-methods.js | clamp | not a wait | clamp | no | 0e3c86db0 2026-06-06 |
| 25 | MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS | 1 | bootstrap/phases/contact-seed-failure-signals.js | clamp on a seed-contact request timeout | not a wait | clamp | no | 1173d3d21 2026-05-07 |
| 26 | MINIMUM_SEED_CONTACT_REQUEST_BUDGET_MS | 1 | bootstrap/phases/seed-contact-candidate-policy.js | clamp | not a wait | clamp | no | ab4d222e3 2026-07-31 |
| 27 | NO_BOUND_MS | 0 | rebalancer/operation-workflow-ledger-self-move-park-evidence.js | sentinel for "no bound" | not a wait | n/a | n/a | 50520f6b5 2026-08-30 |
| 28 | UNIT_TEST_TIMEOUT_MS | 2000 | test-helpers/test-timeout-constants.js | a unit test completes | test-only | n/a | n/a | 62a1e525a 2026-02-09 |
| 29 | TEST_ACK_TIMEOUT_MS | 5000 | test-helpers/test-timeout-constants.js | a replica operation ACK in tests | test-only | n/a | n/a | 62a1e525a 2026-02-09 |

### Totals

| Class | Count |
| --- | --- |
| work | 3 (#1, #5, #6) |
| mixed | 9 (#2, #3, #4, #7 to #12) |
| liveness | 8 (#13 to #20) |
| not a wait | 7 (#21 to #27) |
| test-only | 2 (#28, #29) |

No value of the 29 has ever changed since it was introduced; every
"value change" in the history is a lint rewrite of the same number. Each
bound was calibrated once, on the machine of its day, and not revisited.

## Systemic analysis

Three repair shapes cover the work and mixed bounds. They are not
alternatives: each bound needs the one that matches what it waits for.

1. **Take the work out of the bound.** This is the WASI quest's option (c):
   the bound then measures only liveness. It applies where the work can be done
   before the wait or cached across re-drives:
   - **#1 STARTUP_TIMEOUT_MS:** transpile once, outside the startup wait, and
     cache it. Owned by `wasi-component-startup-budget`.
   - **#2 HEALTH_TIMEOUT_MS:** at the least, a missed pong must not trigger a
     restart that repeats the transpile. With (1) in place the restart is cheap.
     A separate decision for the WASI owner: one missed pong under load should
     not kill a cell (R12).
   - **#6 READINESS_PROBE_ASYNC_TIMEOUT_MS:** already degrades. Its fallback
     repeats the evaluation synchronously; a cached last result would avoid the
     doubled CPU.
2. **A failed startup step under load must not silently change behaviour.**
   - **#4 and #5 (dynamic config at startup):** today a 300 ms bound spent
     under load means the node runs with default raft timing and without its
     adaptive timing controller for its whole life, with only a warning. This
     is the R12 violation with the widest blast radius in the census: load
     changes configuration, not latency.
   - The repair is to complete or re-drive the read later and apply the value
     when it arrives, not a larger number.
   - Recommended owner: `src/config/dynamic-config-startup-wiring.js`.
3. **A node-level machine factor for the bounds that must stay wall-clock.**
   - **What it would cover:** #7 to #12 measure a local drive together with
     remote work.
   - **What exists:** a measured machine factor exists only for tests
     (`scripts/test-machine-factor.js`, `LAGRANGE_TEST_MACHINE_FACTOR`,
     doctrine in `solve/epics/hardware-relative-convergence-budget.md`:
     "scale WORK-BOUND budgets by a machine factor, never correctness";
     clamp at least 1.0, cap 4.0).
   - **What is missing:** the product has no equivalent. The authoritative
     mechanism this census recommends is one node-level owner: a measured,
     clamped and logged factor (from a startup calibration or a configured
     value). Every work and mixed bound in `src` would be scaled through it,
     and liveness bounds would never be.
   - **The spend reporter would carry the factor** (`boundMs` scaled and its
     reference value). A spent bound then reads as "slow machine" or "missing
     answer" without guessing.
   - **What it does not cover:** it is not a substitute for (1). A bound that
     contains work which can be moved out should not be scaled.

**Liveness bounds (#13 to #20).** These stay wall-clock. Under load they also
spend, because the other party is the same overloaded machine in single-host
tests. The fix there is backpressure and the test topology, not scaling.

**Outside the 29.** The spends in the post-merge corpus are dominated by
object-member bounds (`partition_execution_deadline` at 2500,
`CACHE_WAIT_TIMEOUT_MS` at 750 or 1000, the replica-operation repository
bounds). These need the same classification. They are the next census row
set, listed in the appendix.

### Which repair for which of the 29

| Repair | Bounds |
| --- | --- |
| (1) take the work out of the bound | #1 (WASI quest, in progress), #2, #6 |
| (2) re-drive and apply, never silently default | #4, #5 |
| (3) node-level machine factor | #7, #8, #9, #10, #11, #12, #3 |
| keep wall-clock (liveness) | #13 to #20 |
| no action (not a wait / test-only) | #21 to #29 |

## Appendix: object-member bounds outside the 29 (not classified here)

Object-member constants matching `NAME_MS: <number>` in `src/`, grouped by
owner module. The full list is obtained with
`grep -rnE "\b[A-Z0-9_]*(TIMEOUT|DEADLINE|BUDGET|BOUND)[A-Z0-9_]*_MS\s*[:=]\s*[0-9_]+" src`
excluding the 29; it has 52 entries.

- **transport** (`src/constants/transport.js`): MESSAGE_TIMEOUT_MS 5000,
  PING_TIMEOUT_MS 1000, RPC_TIMEOUT_MS 30000, the ACK quarantine window
  30000.
- **cdc** (`src/cdc/cdc-constants.js`): CACHE_WAIT_TIMEOUT_MS 1000. It spent
  41 times at 750 ms in the post-merge corpus.
- **rebalancer**: the rebalancer state timeouts (PENDING 30000,
  CREATING 60000, SYNCING 300000, REMOVING 60000, READINESS_PING 1000) in
  `rebalancer-constants.js`. In `replica-operation-repository.js`, the
  replica-operation repository bounds (OPERATION_PERSIST_RETRY 15000,
  AUTHORITATIVE_VISIBILITY 5000, READ_RETRY 1000) are computed from `TIME_MS`
  and are outside the regex; they spent in the post-merge corpus.
- **control-plane timeout budget** (`src/control-plane/timeout-budget.js`):
  operation, transaction, prepared-hold and SQL query budgets.
- **query and partition**: query coordinator (30000 default), partition
  cutover drain and census deadlines, partition request timeout, call-cell
  deadline.
- **admin, debug-runtime, migration, function, threading, entrypoint,
  bootstrap and raft-rs**: query, capture, execution, idle, drain, upgrade and
  request bounds.
