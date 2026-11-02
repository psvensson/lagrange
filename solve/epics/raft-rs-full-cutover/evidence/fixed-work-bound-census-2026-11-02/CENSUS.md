---
audience: development
documentClass: evidence
---

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
   (WASI agent, option (c): take the transpile out of the bounded wait),
   in progress on branch `work/wasi-component-startup-budget-20261102` and not
   landed. That repair is cited here and not duplicated.
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

The corpus log holds 253 `wait_bound_spent` events. The table covers 251
of them: the 2 `MESSAGE_GROUP_RETRY_MAX_ATTEMPTS (direct delivery)` events
bound an attempt count, not milliseconds, and are excluded. The rest are
grouped below by `wait`. A bound that is the remainder of a parent budget reports its
remaining `boundMs`, so one `wait` appears under many values; those
remaining-budget variants (about 19 distinct values) are folded into their
group with their range. The log interleaves every test, and several tests
exhaust bounds on purpose (negative cases), so these counts are not all
defects.

| wait | boundMs | spends | max elapsed ms | awaited |
| --- | --- | --- | --- | --- |
| partition_execution_deadline | 2500 | 117 | 2690 | successful partition delivery before the execution deadline |
| partition_execution_deadline | 30000 | 4 | 30024 | (same) |
| partition_execution_deadline | remaining budget 2370 to 2474 | 13 | 2574 | (same) |
| CACHE_WAIT_TIMEOUT_MS | 750 | 41 | 1243 | routed system-table write visible in the local cache |
| OPERATION_PERSIST_RETRY_TIMEOUT_MS | 15000 | 20 | 21431 | replica_operations mutation committed by the control plane |
| QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS | 2500 | 11 | 2589 | every partition result of one fan-out chunk |
| QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS | 30000 | 1 | 30019 | (same) |
| QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS | remaining budget 2456 to 2466 | 3 | 2574 | (same) |
| REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS | 1000 | 9 | 1185 | authoritative replica_operations read without a retryable failure |
| table_partition_target_node_wait | remaining budget 9985 to 9999 | 9 | 10075 | active provisioning target nodes for a partition |
| authoritative_visibility_repair_attempts | 1000 | 7 | 882 | authoritative confirmation of the cache visibility hole |
| REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS | 5000 | 4 | 5404 | persisted replica operation authoritatively visible |
| MESSAGE_TIMEOUT_MS (delivery ACK) | remaining budget 2 to 500 | 11 | 558 | ACK for a sent SERVICE_MESSAGE |
| MESSAGE_TIMEOUT_MS (remaining SERVICE_RESPONSE grant after ACK) | remaining budget 4926 | 1 | 4977 | SERVICE_RESPONSE for an acknowledged message |

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

- **Census set (30).** Every
  `const <NAME>(_TIMEOUT_MS|_DEADLINE_MS|_BUDGET_MS|BOUND_MS) = <number>` in
  `src/`. The quest's seal says 29: the first pass restricted the regex to
  `--include=*.js` and found 29; as printed below, without the restriction,
  it finds 30, the thirtieth in `src/admin/static/test-run-dashboard.html`
  (row 30). The correction is recorded as a finding; the seal is not edited.
  Found by
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
- **Out of the 30.** A further 52 object-member bounds
  (`NAME_MS: <number>` in constants objects, for example
  `CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS`, `QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS`,
  `TRANSPORT.MESSAGE_TIMEOUT_MS`) are outside the regex. The ones that spent in
  the post-merge corpus are covered in the table above. The rest are listed by
  name in the appendix, unclassified.
- **Prior census.** The bounded-wait census of 2026-10-04
  (`solve/epics/raft-rs-full-cutover/census-bounded-waits-2026-10-04.md`)
  established the spent-bound reporter (`src/logging/wait-bound-spent.js`) and
  wired visibility. It did not classify bounds as liveness or work.

## Table: the 30 fixed bounds

"Spent outcome" is what the site does when the bound expires, read at the site.
"Re-drive" is whether the next attempt repeats work the spent attempt threw
away. "not traced" means the outcome was not followed past the site in this
pass.

| # | Constant | ms | Owner module (src/) | Waits for | Class | Spent outcome | Re-drive repeats discarded work | Typed spend visibility | History |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | STARTUP_TIMEOUT_MS | 10000 | runtime/wasi-component-cell-runtime.js | cell worker ready message, after the jco transpile of the component | **work** (measured: transpile 3.5 s alone, 13 s at four concurrent on 2 cores) | `wait_bound_spent` + `START_FAILED` | yes: a restart transpiles again from scratch | `wait_bound_spent` (wait STARTUP_TIMEOUT_MS) | 9b430a9a3 2026-07-23; value never changed. Repair owner: quest wasi-component-startup-budget, option (c) |
| 2 | HEALTH_TIMEOUT_MS | 1000 | runtime/wasi-component-cell-runtime.js | the cell worker answers PING | **mixed** (own worker thread; starved under CPU load) | health false and `_stop(serviceId)`: a slow pong kills a healthy cell | yes: the restart repeats startup, transpile included, adding load | `wait_bound_spent` under the generic name `cell_worker_message_timeout`, not its own | 9b430a9a3 2026-07-23; never changed |
| 3 | HOST_CALL_DEFAULT_WAIT_BUDGET_MS | 5000 | runtime/cell-host-call-protocol.js | the host answers a cell's nested binding call | mixed (the host executes the call) | host-call deadline; not traced | not traced | none typed in the owner module (host-call deadline not traced to a reporter) | 417b119a6 2026-08-03; never changed |
| 4 | DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS | 300 | config/dynamic-config-startup-wiring.js | startup read of one dynamic-config key (logging appliers and raft timing keys) | **mixed**, mostly local work at startup | warn `INITIAL_APPLY_FAILED`; the key's value is skipped and `applyRaftTimingConfig` runs with the configManager value; the read is not cancelled (`withTimeout` never cancels the wrapped promise) | no re-drive without a later config change: **load changes configuration** (a dynamic raft timing override is silently not applied) | `logger.warn` only (INITIAL_APPLY_FAILED); no typed spend | 9939b3ff6 2026-02-24; never changed |
| 5 | DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS | 300 | config/dynamic-config-startup-wiring.js | `RaftAdaptiveTimingController.initialize()` (loads config, registers watchers) | **mixed**, like row 4 | warn `ADAPTIVE_CONTROLLER_INIT_FAILED`; the wiring drops its reference (dynamic-config-startup-wiring.js 438-449) but `withTimeout` (76-107) never cancels the wrapped promise, so the in-flight `initialize()` (raft-adaptive-timing-controller.js 220-232) keeps running un-owned: loadConfig, registerWatchers (331-349), startLoop (355-366) when enabled, and a later `adaptiveTimingEnabled=true` starts the orphan's loop through its own watcher (606-613); shutdown (492-501) only shuts the controller it holds, so the orphan's interval and watchers are never shut down. `adaptiveTimingEnabled` defaults to false (config-definitions.js 41), so the default config sees no timing change | no re-drive; a re-drive would create a second controller beside the orphan | `logger.warn` only (ADAPTIVE_CONTROLLER_INIT_FAILED); no typed spend | 9939b3ff6 2026-02-24; never changed |
| 6 | READINESS_PROBE_ASYNC_TIMEOUT_MS | 250 | bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js | async readiness snapshot evaluation | **mixed** (local evaluation with its async diagnostics) | falls back to the synchronous snapshot (degrades, does not fail); the async evaluation is not cancelled | yes: the evaluation is redone synchronously beside the still-running async one | `logger.debug` only; no typed spend | 8f284ad8a 2026-04-13; never changed. A slow-not-break example |
| 7 | OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS | 15000 | control-plane/membership-publication-coordinator-reconcile.js | one `reconcileActiveGateMembershipPublication()` drive | mixed | `wait_bound_spent`; the raced drive is not cancelled and keeps running | the next interval starts a new drive, possibly beside the old one | `wait_bound_spent` (wait OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS) | a617fb59c 2026-06-08; never changed |
| 8 | OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS | 5000 | rebalancer/operation-owner-shutdown-join.js | in-flight owner-lane executions settle at shutdown | mixed | typed `timed_out` join + `wait_bound_spent` | no (shutdown) | `wait_bound_spent` (wait OPERATION_SHUTDOWN_JOIN_DEFAULT_TIMEOUT_MS) | c0c73cb06 2026-08-07; never changed |
| 9 | SHUTDOWN_BEST_EFFORT_STEP_TIMEOUT_MS | 3000 | entrypoint-runtime-shutdown-lifecycle.js | logs-table persistence shutdown flush | mixed (local flush and writes) | time-boxed best-effort step, logged; shutdown proceeds | no (shutdown) | `logger.info` shutdown-step line; no typed spend | e53544b7b 2026-06-18 (CL-030 fix C); never changed |
| 10 | AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS | 250 | cdc/cdc-integration-service-shared-constants.js | authoritative fallback repair of a CDC cache miss | mixed | fallback outcome (`AUTHORITATIVE_FALLBACK_OUTCOME`); not traced past it | the next read repeats the repair | none in the owner module; the cache-visibility wait reports CACHE_WAIT_TIMEOUT_MS and authoritative_visibility_repair_attempts, not this budget by name (not traced) | 8f284ad8a 2026-04-13; never changed |
| 11 | PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS | 1000 | admin/admin-preflight-snapshot.js | authoritative discovery-cache repair during admin preflight | mixed | not traced | not traced | none typed in the owner module | 8942e8675 2026-03-05; never changed |
| 12 | DEFAULT_DEADLINE_MS | 5000 | service/cell-ingress-transport.js | the cell dispatch response | mixed (the remote cell executes the request) | dispatch deadline; not traced | not traced | none typed in the owner module | af04c9855 2026-07-23; never changed |
| 13 | PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS | 15000 | query/sql-query-engine.js | delivery of a priority control-plane transaction to its partition | liveness (remote apply includes the remote node's CPU) | the executor's partition deadline path (`partition_execution_deadline`) | caller-dependent | `wait_bound_spent` through the executor as `partition_execution_deadline`, not by name | 86b7b178c 2026-04-23; never changed |
| 14 | AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS | 1500 | control-plane/authoritative-control-plane-view.js | the authoritative control-plane query answers | liveness | query timeout; caller retries | the read, not local work | none typed in the owner module (a routed query's delivery bound may report as `partition_execution_deadline`; not traced) | d378c9083 2026-03-08; never changed |
| 15 | AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS | 1500 | admin/admin-service-discovery.js | the authoritative repair query answers | liveness | query timeout | the read | none typed in the owner module (as row 14) | dc9927ec7 2026-03-03; never changed |
| 16 | AUTHORITATIVE_LEADER_REFRESH_QUERY_TIMEOUT_MS | 1500 | bootstrap/owners/service-leader-readiness-owner.js | the authoritative partitions/services read answers | liveness | query timeout | the read | none typed for this bound (the owner module's reporter covers another wait; as row 14) | eeffda99f 2026-07-15; never changed |
| 17 | DEFAULT_REPAIR_QUERY_TIMEOUT_MS | 1500 | control-plane/authoritative-node-evidence-reconciler.js | the node snapshot repair read answers | liveness | query timeout | the read | none typed in the owner module (as row 14) | 8f284ad8a 2026-04-13; never changed |
| 18 | REPORTER_VISIBILITY_QUERY_TIMEOUT_MS | 1000 | control-plane/heartbeat-service-runtime-state.js | the heartbeat reporter's visibility readback answers | liveness | query timeout; visibility decision state | the read | none typed in the owner module (as row 14) | d378c9083 2026-03-08; never changed |
| 19 | PRIORITY_RECOVERY_REPLACE_REMOVE_DISPATCH_SPREAD_STALL_BUDGET_MS | 60000 | control-plane/priority-recovery-snapshot-ingress.js | a REPLACE remove-dispatch step's age before it counts as stalled | liveness (stall detector) | unmasks the spread so the step re-drives | yes, by design (the stalled dispatch) | none: a stall threshold, not a wait; the re-drive is its visibility | 3aad76314 2026-06-29; never changed |
| 20 | DEFAULT_DEADLINE_MS | 300000 | diagnostics/formation-attribution-window.js | the formed signal (SIGUSR2) arrives | liveness (external signal, diagnostics only) | the attribution window closes | no | `wait_bound_spent` reporter in the owner module | af04c9855 2026-07-23; never changed |
| 21 | CDC_ROUTED_MUTATION_MIN_ATTEMPT_TIMEOUT_MS | 1000 | cdc/cdc-routed-mutation-readiness.js | floor of one attempt's slice of a routed system-table write budget (CL-017) | not a wait (clamp on a liveness wait) | the attempt times out; the next attempt runs | the routed write (idempotency key) | n/a (not a wait) | 0c852cf6c 2026-06-11; never changed |
| 22 | READ_CANDIDATE_MIN_DELIVERY_TIMEOUT_MS | 1 | query/query-executor-partition-attempt-budget.js | none: a 1 ms cut of a not-connected candidate, so the next is tried | not a wait | by design | no | n/a (not a wait) | 85dd012ef 2026-05-21 |
| 23 | BOUNDED_SNAPSHOT_PROBE_MIN_DEADLINE_MS | 2000 | admin/admin-control-snapshot-local-diagnostics-methods.js | clamp on an admin snapshot probe deadline | not a wait | clamp | no | n/a (not a wait) | 878d5280d 2026-06-04 |
| 24 | BOUNDED_SNAPSHOT_PROBE_MIN_SHORT_DEADLINE_MS | 1 | admin/admin-control-snapshot-local-diagnostics-methods.js | clamp | not a wait | clamp | no | n/a (not a wait) | 0e3c86db0 2026-06-06 |
| 25 | MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS | 1 | bootstrap/phases/contact-seed-failure-signals.js | clamp on a seed-contact request timeout | not a wait | clamp | no | n/a (not a wait) | 1173d3d21 2026-05-07 |
| 26 | MINIMUM_SEED_CONTACT_REQUEST_BUDGET_MS | 1 | bootstrap/phases/seed-contact-candidate-policy.js | clamp | not a wait | clamp | no | n/a (not a wait) | ab4d222e3 2026-07-31 |
| 27 | NO_BOUND_MS | 0 | rebalancer/operation-workflow-ledger-self-move-park-evidence.js | sentinel for "no bound" | not a wait | n/a | n/a | n/a (not a wait) | 50520f6b5 2026-08-30 |
| 28 | UNIT_TEST_TIMEOUT_MS | 2000 | test-helpers/test-timeout-constants.js | a unit test completes | test-only | n/a | n/a | n/a (test-only) | 62a1e525a 2026-02-09 |
| 29 | TEST_ACK_TIMEOUT_MS | 5000 | test-helpers/test-timeout-constants.js | a replica operation ACK in tests | test-only | n/a | n/a | n/a (test-only) | 62a1e525a 2026-02-09 |
| 30 | REQUEST_TIMEOUT_MS | 15000 | admin/static/test-run-dashboard.html (browser script) | an admin dashboard fetch answers | liveness (browser-side fetch bound) | the dashboard request fails in the browser | the user's next refresh | none (browser side, outside the node's reporter) | not traced in this pass |

### Totals

| Class | Count |
| --- | --- |
| work | 1 (#1) |
| mixed | 11 (#2 to #12) |
| liveness | 9 (#13 to #20, #30) |
| not a wait | 7 (#21 to #27) |
| test-only | 2 (#28, #29) |

**Rows without typed spend visibility.** A spent bound at these rows produces
no `wait_bound_spent` event of its own: #3, #4, #5, #6, #9, #10, #11, #12,
#14, #15, #16, #17, #18 (and #30, browser side). #2 and #13 report, but under a
generic or another bound's name.

**Cross-row pattern: the bound expires and the work keeps running.** Rows
#4, #5, #6 and #7 race their work against a timer (`withTimeout` or
`Promise.race`) and never cancel it. When the bound is spent, the node stops
waiting and moves on, but the work goes on un-owned beside whatever the node
does next. #5 is the sharpest case (an orphaned controller with live
watchers); #7 can run a second drive beside the first.

No value of the 29 src JavaScript constants has ever changed since it was introduced; every
"value change" in the history is a lint rewrite of the same number. Each
bound was calibrated once, on the machine of its day, and not revisited.

## Systemic analysis

Four repair shapes cover the work and mixed bounds. They are not
alternatives: each bound needs the one that matches what it waits for and
what happens to its work when it is spent.

1. **Take the work out of the bound.** This is the WASI quest's option (c):
   the bound then measures only liveness. It applies where the work can be done
   before the wait or cached across re-drives:
   - **#1 STARTUP_TIMEOUT_MS:** transpile once, outside the startup wait, and
     cache it. Owned by `wasi-component-startup-budget`, in progress on
     `work/wasi-component-startup-budget-20261102`, unlanded.
   - **#2 HEALTH_TIMEOUT_MS:** a missed pong must not trigger a restart that
     repeats the transpile; with (1) the restart is cheap. A separate
     decision for the WASI owner: one missed pong under load should not kill
     a cell (R12).
   - **#6 READINESS_PROBE_ASYNC_TIMEOUT_MS:** already degrades; its fallback
     repeats the evaluation synchronously beside the uncancelled async one. A
     cached last result would avoid the doubled CPU.
2. **Re-drive and apply, never silently default.** For **#4**
   (DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS) only.
   - Today a 300 ms read spent under load skips the key: the node runs with
     the configManager value instead of the dynamic override, with only a
     warning, until a later config change. Load changes configuration, not
     latency. This is the census's widest R12 exposure.
   - The repair is to complete or re-drive the read and apply the value when
     it arrives, not a larger number.
   - Owner: `src/config/dynamic-config-startup-wiring.js`.
3. **One node-level machine factor for the bounds that must stay
   wall-clock.**
   - **What it would cover:** #3 and #7 to #12, which measure a local drive
     together with remote work.
   - **What exists:**
     - *Measured and clamped, test harness only.* `scripts/calibrate-machine.js`
       probes the host and emits `LAGRANGE_MACHINE_FACTOR`;
       `test/distributed/harness/convergence-budget-calibration.js` clamps it
       to [1.0, 4.0] and scales only work-bound budgets. Doctrine: the legacy,
       resolved epic `hardware-relative-convergence-budget`, which keeps raft
       protocol timers in `src/` untouched.
     - *Configured, not measured.* `scripts/test-machine-factor.js` reads
       `LAGRANGE_TEST_MACHINE_FACTOR` from the environment, floor 1, no cap.
   - **What is missing:** the product has no equivalent. The recommended
     mechanism is one node-level owner with one input source: the
     `scripts/calibrate-machine.js` measurement, recorded per host into one
     configuration key and read once at node start. It is clamped as the
     harness clamps it and logged.
   - **How it would be used:** every work and mixed bound in `src` that stays
     wall-clock is scaled through it; liveness bounds never are. The spend
     reporter carries the factor and the reference bound, so a spent bound
     reads as "slow machine" or "missing answer" without guessing.
   - **What it does not cover:** a bound whose work can be moved out (1), and
     a bound whose spent work keeps running (4).
4. **Own or cancel the in-flight work when the bound expires (R13).** For
   **#5** (DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS), and as the
   shared shape behind the cross-row pattern (#4, #5, #6, #7).
   - At #5 a spent bound orphans a live `RaftAdaptiveTimingController`: its
     `initialize()` continues and its watchers and loop are never shut down.
     With `adaptiveTimingEnabled` false by default there is no timing change
     in the default configuration, but the orphan holds watchers and can
     start its own loop later.
   - The repair is to keep owning the controller (shut it down at shutdown,
     or cancel its initialize). It is **not** a re-drive: a re-drive would
     create a second controller beside the orphan.
   - **First red test of the future fix quest** (the verifier's deterministic
     witness, not written here):
     - stub `dynamicConfigService.get` to resolve after more than 300 ms;
     - call `createDynamicConfigStartupWiring`;
     - observe the controller's `initialized`/`loopRunning` after the late
       resolve;
     - observe that `shutdown()` leaves its interval alive.

**Liveness bounds (#13 to #20, #30).** These stay wall-clock. Under load they
also spend, because the other party is the same overloaded machine in
single-host tests. The fix there is backpressure and the test topology, not
scaling.

**Outside the 30.** The spends in the post-merge corpus are dominated by
object-member bounds (`partition_execution_deadline` at 2500,
`CACHE_WAIT_TIMEOUT_MS` at 750 or 1000, the replica-operation repository
bounds). These need the same classification. They are the next census row
set, listed in the appendix.

### Which repair for which row

| Repair | Rows |
| --- | --- |
| (1) take the work out of the bound | #1 (WASI quest, in progress, unlanded), #2, #6 |
| (2) re-drive and apply, never silently default | #4 |
| (3) node-level machine factor (one measured input source) | #3, #7, #8, #9, #10, #11, #12 |
| (4) own or cancel the in-flight work | #5; also the un-cancelled races at #4, #6, #7 |
| keep wall-clock (liveness) | #13 to #20, #30 |
| no action (not a wait / test-only) | #21 to #29 |

## Appendix: object-member bounds outside the 30 (not classified here)

Object-member constants matching `NAME_MS: <number>` in `src/`, grouped by
owner module. The full list is obtained with
`grep -rnE "\b[A-Z0-9_]*(TIMEOUT|DEADLINE|BUDGET|BOUND)[A-Z0-9_]*_MS\s*[:=]\s*[0-9_]+" src`
excluding the 30; it has 52 entries.

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
