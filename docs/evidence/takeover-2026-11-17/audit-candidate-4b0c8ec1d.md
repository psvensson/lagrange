---
audience: evidence
recorded: 2026-11-18
---

# Audit of integrated candidate 4b0c8ec1d (66 commits over merge base 49495f7e4), 2026-11-17

Independent audit agent; C = CONFIRMED in code, P = PLAUSIBLE. Line numbers at 4b0c8ec1d.

**Bottom line:** the formation commits from 11-16 23:26 to 11-17 11:05 do not repair a defect. They build a distributed scheduler out of edge-triggered wakes, stagger timers, a winner lottery and widened capacity, on top of a defect class the project has patched at least six times. None of them has a Quest or verification record. They break sealed constraints of `formation-ready-lease-independent-of-spread` ("no-timer-no-bound-no-retry: No timeout, bound, retry count, delay or polling interval is added or changed to obtain liveness"; "remove-safety-unchanged"). The ratchets stayed green only because the detectors are syntactic.

## Formation-path findings

| # | Commit(s) | file:line | Category | Description |
|---|---|---|---|---|
| F1 | f0dfc1a2b → 17194cf83 → 4c7b69804 → 540418614 → 380fc5f8b | rebalancer-local-mutation-readiness-wake.js:177-259, 590-645; continuation-wake-coordinator.js (new) | timer-as-fix | Continuation-wake scheduler: wakes on terminal-op events, one winner per op, the rest staggered at 8000+400·n ms (was 1000+120·n), up to 2 "handoff hops", plus a safety timer of 3×retry + jitter (rebalancer-planning-gate-methods.js:777). C |
| F2 | f0dfc1a2b, 17194cf83, 4c7b69804 | partition-service-rebalancer-methods.js:70-71; message-group-service-rebalancer-runtime-methods.js:15-16; readiness-wake:192-193, 318 | damping bypass | Wakes write `lastCheckAtMs=0` / `lastStateChangeTime=0` from outside the owner. This defeats the min-interval floor (planning-gate:719) and `isStabilized()` (policy-scheduler:319). C |
| F3 | 4c7b69804, widened in 540418614 | partition-service-rebalancer-methods.js:14-26, 72-81 | timer-as-fix | Traffic-ready wake hashed into 39 buckets at 12000+250·bucket ms (was 1000/80). C |
| F4 | f0dfc1a2b | message-group-service-rebalancer-runtime-methods.js:7-19 vs partition-service-rebalancer-methods.js:57-84 | duplicate-logic | `maybeWakeRebalancerOnTrafficReady` exists as two copies that have diverged. C |
| F5 | 4c7b69804 | partition-service-rebalancer-methods.js:28-33 | fallback | `isPartitionTrafficReady` returns true when the readiness state is absent. C |
| F6 | 4c7b69804, 540418614 | readiness-wake:123-164 (`host._slotWakeDispatchState`); continuation-wake-coordinator.js:17-39 (`host._armedContinuationWakeRebalancers`) | hidden state | Cross-rebalancer scheduling state lives as expando fields on another owner's object. C |
| F7 | 540418614 | readiness-wake:403 | symptom patch | `coordinator.setMaxListeners?.(0)`. C |
| F8 | f0dfc1a2b | readiness-wake:382-421, 98-121 | dual-path | One fact (an op reached terminal) is subscribed twice, via coordinator events and via cache REPLICA_OPERATIONS changes, and deduplicated with a 16-entry list. C |
| F9 | 540418614 | system-spread-transition-policy.js:237-317 | budget-widening | "Phase B": the per-target system-ADD slot cap goes 1 → 2 once NODES is spread. C |
| F10 | 540418614, de9fe14e8 | system-spread-transition-policy.js:43-64, 155, 183, 198, 269-299, 474-493, 530 | fallback | The host count is the union of committed rows and cache NODES rows, max with availableNodes. NODES RF defaults to 3. An empty op type counts as ADD/REPLACE. Op ids are synthesized. C |
| F11 | de9fe14e8 | rebalance-coordinator-concurrent-budget-gate.js:19-73 | four sources | Target-slot admission merges cache, `coordinator.operations`, `repository.lastIncompleteOperationObservation` and `recentOperationIntents`. The "atomic" lane is per process, not cross-node. C |
| F12 | de9fe14e8 | move-planner-state-methods.js (`buildPhaseBGlobalSystemTransitionNodeSet`) + F11 | duplicate-logic | The slot rule is enforced in both planner and admission. A refusal becomes BUDGET_EXCEEDED, which re-arms F1. C / loop P |
| F13 | de9fe14e8 | unified-rebalancer-control-plane-readiness-methods.js:40-55, 119-183; priority-publication-safety-rows.js:340-386 | retry hiding staleness | Readiness is reconciled, read fresh, then reconciled again before each evaluation and plan. "Deferred" is read from three alias fields. C |
| F14 | f0dfc1a2b | rebalancer-priority-recovery-planning-gate-methods.js:225, 235, 253, 268-275; unified-rebalancer-topology-drain-methods.js:49 | exemption | Every under-spread partition bypasses the 70 s priority-spread stability fence. **The physical pre-gate failure is caused by this.** C |
| F15 | 17194cf83+ | planning-gate:43-57, 683-690; unified-rebalancer-policy-scheduler-methods.js:249-258; rebalance-loop:28-96 | exemption/timer | A below-spread predicate (16 call sites) drives a minimum interval with forced retry, a fast leadership start, a move limit of 1, and an executor re-sort. C |
| F16 | 380fc5f8b | rebalance-loop:600-614; planning-gate:665-677 | re-arm loop | `finally` blocks re-arm the wake even when the pass threw. C |
| F21 | 4c7b69804 | replica-handler-transition-policy.js:26 | timer-as-fix | VOTER_READY_CHECK_INTERVAL_MS 250 → 50 ms polling instead of a raft promotion event. C |
| F22 | 8c7d59437, 4459f4fc5, 27ad27e5c | replica-status.js:258-326, 347-388; node-registration-owner-row-builder.js:190-234; endpoint-incarnation-authority.js:227-270 | duplicate/alias/fallback | Storage incarnation has two coherence rules that can disagree, three copies of the metadata parser that catch and return a default, a key defined twice, snake/camel aliases, and four storage places. NODES has no column for it. C |
| F23 | f67f16071 → 4459f4fc5 | unified-rebalancer-replica-state.js:433, 449-475 | flip-flop | An unknown incarnation is treated as "superseded", which drops the replica. C |
| F24 | ebd94a498 | operation-workflow-remove-safety-membership.js:16-28 | fail-open safety gate | The REMOVE floor treats absent/unknown as ready. **Fixed by fix A.** C |
| F25/F26 | da91d6236 → 6a09a3537 | operation-workflow-dispatch-rearm-evidence.js:161-185; rebalance-coordinator-operation-intent-methods.js:31, 461 | exemption / dual-path | **Fixed by fix B.** C |
| F28 | 89404602b, 1a5a9235d, 699d77ce5 | test/distributed/harness/real-product-deployer-lagrange.js:136-141; real-product-deployment-contract.js:94 | budget-widening | Lagrange gets 420 readiness attempts and a 420 s formation deadline, transport timeout 30 s (product default 5 s), leadership wait 240 s (default 30 s) and join HTTP timeout 60 s. **Owner decision 2026-11-17: run at product defaults.** C |
| F29 | 11bdbc115 | operation-workflow-recovery-timeout.js:59, 351-363 | cadence | Reservation reconcile is throttled to 30 s through a phantom config `??` chain. C |
| F31 | 540418614 | system-spread-transition-policy.js:66, 136-187 vs move-planner-move-calculation-methods.js:111, move-planner-priority-spread-cure.js:46 | duplicate-logic | Three distinct-host counters and two NODES-spread predicates. C |
| F32 | whole series | src/rebalancer | feature detection | 34 optional-call `x?.()` lines added. C |

**Flip-flops (all C):**
- **Global system-target occupancy gate:** a bypass was added (17194cf83), then exempted (4f7fc3691), then removed (4c7b69804 "Restore"), then the cap was doubled (540418614).
- **Leadership-delay exemption:** added in 4f7fc3691, removed in 4c7b69804.
- **Learner-promotion wake:** added in 4c7b69804, removed in 540418614.
- **Check-floor reset rule:** changed 4 times.
- **Stagger constants:** widened within hours.

The tests pin the mechanism (e.g. rebalancer-distinct-spread-and-continuation-wake.test.js:1316-1345 asserts the 8000 ms stagger).

## Query/cdc/cache/raft/transport/pgwire findings
- **4f7fc3691:** `cdc-pipeline-readiness-gate.js:49-67`. Both CDC readiness timeouts are made retryable, so join resume loops on them.
- **f7e06609d / 5f84f0eff:** `partition-participant-transaction-session.js:40, 189-262`. An ALREADY_ACTIVE conflict sleeps up to 30 s (was 5 s), then refuses. `releaseEmptyWaiterSessionClaims` drops row-key claims without an operations check.
- **96d6aefb8 + 082b8fc8f:** `partition-cdc-obligation-ledger.js:36-121, 298-326`. An in-memory owed-bytes tally duplicates a durable SQL SUM, settled by three paths.
- **678b9492f + 19ff97346:** `system-table-cache-authoritative-reconciliation.js:437-445, 504-638`. A four-step `??` chain decides ordering authority over snake/camel aliases.
- **e65dcd3b6 / 5e20059d3:** two SCALAR_FN evaluators (`===` vs affinity-aware), a third affinity classifier, LIKE built twice, and AST aliases expr/expression/operand. **Owner decision 2026-11-17: SQLite evaluates the coordinator merge.**
- **5e20059d3 → 29e611157:** `residual-predicate-evaluator.js:587-725`. A second CREATE TABLE parser; affinity is read from schema constants, falling back to sqlite_master.
- **62dff15ab:** budget aliases. **Fixed by fix G.**
- **f7e06609d, 11bdbc115:** `distributed-transaction-recovery.js:72`. Sweep "hijacking" is guarded only by the timeout deadline. P
- **Should-fix:**
  - 41a7311b4 reverses 5e20059d3: any RETIRED state is accepted (`raft-rs-replica-lifecycle-owner.js:915`).
  - Boot incarnation is re-stamped onto live owners: `replica-state-machine.js:133` made configurable, and the transport keeps a copy.
  - pgwire SQLSTATE cascades: `pgwire-result-mapper.js:186-283`.
  - A fourth transient classifier: `schema-provisioning-job-owner.js:141`.
  - A swallowing socket terminate: `message-router-inbound-dispatch.js:332`.
  - A `readOnlyParticipants` side map.
  - A second control-snapshot builder: `admin-control-snapshot-serve-lane.js:78-113`.

## Underlying defect classes (formation path)
- **D1. No owner holds the placement work queue (C).**
  - About 39 per-partition rebalancers, each on its leader's node, poll on their own timers (60 s+ jitter, ×1.5 backoff), plan from the cache, and race for cluster-wide budgets through a per-node in-process lane.
  - A refusal becomes BUDGET_EXCEEDED plus backoff, so freed capacity is used only when someone happens to poll.
  - F1-F3, F6, F9, F11, F12 and F16 rebuild a scheduler out of edges, timers and a lottery.
- **D2. Admission reads state with no freshness contract (C).** That is why there are merged sources and pulled reconciles (F8, F10, F11, F13, F23). It is generator #1 of the 2026-11-11 analysis.
- **D3. Liveness is decided by elapsed time (C).** It is generator #3.
- **D4. Node identity/incarnation is not one fact (C).** See F22.

**Prior occurrences of D1:**
- c98faf4b1 (06-26): ADD re-decision storm.
- ab15e03e4 (07-05): fair-share slot.
- b9053d69a (07-13): backstop timed retry.
- d75b01706 (08-10): timer turned into an event wake, with "fixed-cadence fallback timers remain as the safety net".
- 42fd6426e (09-13): stabilization horizon.
- 154628eed (10-01): dropped-wake lane.
- operation-workflow-recovery-timeout.js: "edges are LOST across owner/leadership churn… We kept discovering this one shape at a time".
- The 2026-11-11 memo: "do not accept another consumer-side poll/cooldown/throttle as a formation fix".

**Level-triggered design that removes F1-F16 (audit proposal):**
1. One placement owner per cluster. The natural choice is the REPLICA_OPERATIONS ledger leader, already the single writer of operations.
2. A pass is triggered by any committed change to SERVICES, NODES leases, REPLICA_OPERATIONS or policy, plus a slow resync. It computes every partition's deficit from durable state.
3. Priority is queue order: priority control-plane, then NODES, then other system, then user; within a class, fewest distinct hosts first.
4. Admission is atomic with the insert, and capacity is counted from the owner's own committed rows. A refusal waits in the queue; it is never a failure that needs a wake.
5. A terminal-op commit triggers the next pass, so completion admits the next item.
6. Per-entity rebalancers stop placing, or submit idempotent deficit intents.
7. Readiness answers are memoized by committed input position.
8. Learner promotion is an event driven by raft leader progress.

**How comparable systems do it:**
- **CockroachDB:** replicate queue with priorities and scanner resync, plus a purgatory re-processed when the store pool changes.
- **TiKV PD:** OperatorController owns per-store limit tokens and a waiting-operator queue, and advances operators on region heartbeats.
- **etcd:** learner promotion only once the learner has caught up; one membership change in flight at a time.
- **Kubernetes:** dedup/rate-limited workqueues with resync; the unschedulable queue is flushed on cluster events.

## Ratchets
No baseline entries were added; entries were only removed. But the detectors are syntactic (`scripts/checks/code-navigability-fallback-detectors.js:86-131`), so wrapped forms are invisible: `readX(a.x) ?? readX(a.y)`, ladders, loops over field lists, `?.()`. Literals baseline 1286 → 4729 was re-anchored by 2e5bc9c58, which may grandfather literals the candidate added (P).

## Clean or acceptable
- 5bc4d0769 (formation barrier/handoff deletion, quest-verified).
- fb634397f (cadence derived from the lease).
- de9fe14e8's monotonic visibility predicate, as a confirmation predicate only (fix A split it).
- Refactor-only parts of 380fc5f8b, 5f84f0eff and 11bdbc115.
- 6da899aae's fail-closed join.
