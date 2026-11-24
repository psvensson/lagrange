# TX1 Service-Time and Open-Loop Queueing Decomposition (GCP `b1e097b09` Smoke vs. Local NVMe & Comparators, Reconciled With Wave 5 `44eeb290a`)

**Date:** 2026-11-24
**Scope:** Quantitative decomposition for the GCP Scenario A smoke run (`b1e097b09912507b3f04d82dfca3bd1cf2e801df`, `europe-north1-a`, 6x `e2-standard-4`, `50GB pd-ssd`) against local NVMe (`#295` controller 3-node RF=3 profiling and `tv-dator-3node-smoke` on `b1e097b09`) and GCP comparators (`tidb-tikv` `v8.5.8`, `pg-single-primary` `postgres:17-alpine`), reconciled with the Wave 5 (`44eeb290a3cfd70ce211d8029d8214f9142ede4f`) implementation state.

**Authoritative Evidence Artifacts:**
- GCP `lagrange` `b1e097b09` smoke: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-bench-b1e097b09/{campaign-summary-lagrange-smoke.json,raw-observations-lagrange-smoke.ndjson,provision-create.log,vpc-rtt.log}`
- GCP `lagrange` `3908f1e59` pre-Part-A smoke: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-bench-3908f1e59/raw-observations-lagrange-smoke.ndjson`
- GCP comparators (`tidb-tikv`, `pg-single-primary`): `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-bench-b1e097b09/raw-observations-comparators-tidb-pg-single-smoke.ndjson`
- Local NVMe 3-container Docker smoke (`tv-dator`, `b1e097b09`): `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/lab-bench-b1e097b09/tv-dator-3node-smoke/{receipt.json,workload-record.json}`
- Controller bare-metal NVMe 3-node RF=3 per-phase profiling: board message `#295`

**Epistemic Classification Discipline Used Throughout This Report:**
- **(a) Directly measured intervals:** Timestamps, durations, and counts recorded directly in the run artifacts (`raw-observations-lagrange-smoke.ndjson`, `receipt.json`, `vpc-rtt.log`, and `#295` controller per-phase timers).
- **(b) Source-derived operation counts:** Deterministic callback, coordinator submission, Raft proposal, and RPC counts derived from the exact execution path in `src/query/` and `src/partition/` for `b1e097b09` and Wave 5 (`44eeb290a`).
- **(c) Modeled hypotheses / observational subgroup comparisons:** Sub-phase time projections on GCP `pd-ssd` (scaled from `#295` controller NVMe), observational comparisons between non-randomized request subgroups (`n = 3` isolated vs. `n = 37` overlapping `payment` requests), and projected speedup multipliers. These are explicitly labeled as hypotheses rather than direct sub-phase measurements on GCP.

---

## 1. Executive Summary: Why Open-Loop `p50` Was `90.82s` While Clean Execution `p50` Was `0.69s - 3.68s`

The GCP smoke campaign runs `scenario-a-smoke-v1` / `scenario-a-open-loop-v2` at `offeredRatePerSec = 5` over `2` per-worker serialized queues (`scheduledMs = 20,000 ms`, `100` measurement operations = `50` per worker, `400 ms` intended inter-arrival per worker).

1. **(a) Directly measured open-loop queueing (`workerQueueWaitMs = queueDelayMs - issueLagMs`) accounts for `95.66%` of summed GCP request latency (`96.35%` per-request nearest-rank `p50` over `N = 98` committed requests; `96.34%` over `N = 100` all requests):**
   - Across all `N = 100` issued measurement requests (`143` total attempts = `100` initial attempts + `43` actual retry attempts; `98` committed, `2` `conflictExhausted` after `45` total `40001` conflict attempts), total request latency (`latencyMs`) summed to **`10,822.034s`** (`10,822,034.33 ms`, mean `108,220.34 ms`, `N = 100` nearest-rank `p50 = 92,435.71 ms`; `N = 98` committed headline nearest-rank `p50 = 90,818.50 ms`).
   - Of that `10,822.034s` summed request latency:
     - **`10,352.168s` (`10,352,168.33 ms`, `95.66%` of summed latency)** is client-side worker-queue waiting (`workerQueueWaitMs = queueDelayMs - issueLagMs`),
     - **`0.098s` (`98.46 ms`, `0.001%` of summed latency)** is scheduler issue lag (`issueLagMs = issuedAtMs - intendedStartMs`), and
     - **`469.768s` (`469,767.55 ms`, `4.34%` of summed latency)** is actual database execution-start-to-completion (`execTimeMs = completedAtMs - executionStartedAtMs`).
   - **Exact per-request ratio quantiles (`r_i = workerQueueWaitMs_i / latencyMs_i`, dimensionless ratio of `ms / ms` computed per request before taking quantiles, avoiding any mixed-population ratio of separate medians):**
     - **Population `N = 98` committed requests:** nearest-rank `p50` (`rank 49 of 98`) = **`96.35%`** (`0.963516`); linearly interpolated median (`mean of sorted ranks 49 and 50 of 98`) = **`96.39%`** (`0.963879`); arithmetic mean of per-request ratios = **`90.36%`** (`0.903558`); nearest-rank `p95` = **`99.32%`** (`0.993199`); nearest-rank `p99` / `max` = **`99.65%`** (`0.996479`); ratio of summed worker-queue wait to summed latency (`10,075,388.81 ms / 10,506,881.81 ms`) = **`95.89%`**. (Including `issueLagMs_i`, `queueDelayMs_i / latencyMs_i` over `N = 98` has nearest-rank `p50 = 96.35%` [`0.963541`] and linearly interpolated median `= 96.39%` [`0.963897`].)
     - **Population `N = 100` all issued requests:** nearest-rank `p50` (`rank 50 of 100`) = **`96.34%`** (`0.963444`); linearly interpolated median (`mean of sorted ranks 50 and 51 of 100`) = **`96.35%`** (`0.963480`); arithmetic mean of per-request ratios = **`90.30%`** (`0.902968`); nearest-rank `p95` = **`99.18%`** (`0.991778`); nearest-rank `p99` = **`99.47%`** (`0.994708`); `max` = **`99.65%`** (`0.996479`); ratio of summed worker-queue wait to summed latency (`10,352,168.33 ms / 10,822,034.33 ms`) = **`95.66%`**. (Including `issueLagMs_i`, `queueDelayMs_i / latencyMs_i` over `N = 100` has nearest-rank `p50 = 96.35%` [`0.963451`] and linearly interpolated median `= 96.35%` [`0.963496`].)
   - Both worker promise queues (`workerQueues` in `test/distributed/harness/oltp-open-loop-step-owner.js:466-470`) stayed `100.00%` busy (`worker=1`: `225,634.7 ms` exec over `225,635.7 ms` wall span; `worker=2`: `244,132.8 ms` exec over `244,134.2 ms` wall span). Because the 2-worker saturation service rate (`2 / 4.698 s = 0.4257 req/s`) is `11.7x` below the `5.0 req/s` offered rate, arrivals during the `20s` issue window drained over `244.335 s` (`drainOverrunMs = 224,335.01 ms`, `0.4011 committed req/s`).
2. **(a) Directly measured failed retry attempts (`152.679s`, `32.50%` of execution time) and `15s` row-key conflict-wait timeouts:**
   - Headline per-kind medians (`payment 1,955.8 ms`, `new_order 3,680.5 ms`, `delivery 2,512.3 ms`, `stock_level 694.6 ms`, `order_status 694.1 ms`) are **final committed attempt medians (`finalCommittedAttemptMs`)**, excluding failed retry attempts and retry backoffs.
   - All `35/35` `payment`, `5/5` `stock_level`, and `3/3` `order_status` operations committed on Attempt 1 (`0` retries).
   - Conversely, `new_order` (`50/52` committed, `2` `conflictExhausted`) and `delivery` (`5/5` committed) executed **`43` actual retry attempts** (`143` total attempts across `100` issued requests) and experienced **`45` failed `40001` attempts** (`42` on `new_order` including the `2` final exhausted attempts on `2:23` and `2:26`, plus `3` on `delivery`), consuming **`152.679s` (`152,679.09 ms`, `32.50%` of total execution time)** plus **`0.385s` (`385.00 ms`)** scheduled retry backoff, and triggering two `15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` timeout stalls across competing `stock` row keys (`17.4s - 19.7s` per stalled attempt).
3. **(b) Source-derived coordinator metadata & Raft proposal counts and (c) modeled `pd-ssd` WAL fsync hypothesis:**
   - **(b) Source-derived operation count formula:** On `b1e097b09`, for a write transaction with `P >= 1` enlisted write partitions and `W` write statements, `DistributedTransactionCoordinator` records **`7 + 6P + W` noted metadata callbacks** (`noteMetadataMutation`), of which `2P` transient participant status callbacks (`PREPARING`, `COMMITTING`) are elided before `submitMutation` (`src/query/sql-query-engine-transaction-persistence-methods.js:51-55`), yielding **`7 + 4P + W` actual coordinator metadata submissions** to the 3 control-plane Raft partitions (`sql_transactions-p1`, `sql_transaction_participants-p1`, `sql_write_operations-p1`), plus `2P` participant data-partition 2PC Raft proposals (`PREPARE` + `COMMIT`).
     - For a single-partition 1-write transaction (`P = 1, W = 1`): **`14` noted metadata callbacks vs. `12` actual coordinator metadata submissions** on `b1e097b09`, reduced in Wave 5 (`44eeb290a`) to **`12` noted callbacks vs. `10` actual coordinator metadata submissions** (`5 + 4P + W`) via atomic `manifest-freeze + PREPARING` and atomic `decision + COMMITTING`.
     - For `payment` (`P = 4, W = 4`): `35` noted metadata callbacks vs. **`27` actual coordinator metadata submissions** on `b1e097b09` (**`25`** in Wave 5 `44eeb290a`), plus `8` participant 2PC Raft proposals = `35` total Raft proposals on `b1e097b09` (`33` in `44eeb290a`).
     - For 12-item `new_order` (`P = 5, W = 27`): `64` noted metadata callbacks vs. **`54` actual coordinator metadata submissions** on `b1e097b09` (**`52`** in Wave 5 `44eeb290a`), plus `10` participant 2PC Raft proposals = `64` total Raft proposals on `b1e097b09` (`62` in `44eeb290a`).
     - For read-only transactions (`P = 0, W = 0`, `order_status` and `stock_level`): **`4` actual coordinator metadata submissions** (`BEGIN`, `freezeParticipantSet`, `recordTransactionDecision`, `COMMITTED`) and `0` participant Raft proposals.
   - **(c) Modeled WAL `fsync` serialization hypothesis:** Because intra-VPC ICMP RTT was directly measured at `0.051 - 0.613 ms` (`vpc-rtt.log`) and all three TX1 control-plane partition leaders were co-located on `node-3` (`10.166.0.13`, also hosting `sys-postgres-wire`), we hypothesize that uncontended per-attempt execution time on GCP `50GB pd-ssd` (`694.1 ms` `order_status`, `694.6 ms` `stock_level`, `1,955.8 ms` `payment`, `3,680.5 ms` `new_order`) is dominated by synchronous SQLite WAL `fsync` serialization inside `RaftRsDurableStore.commitDurably` (`PRAGMA synchronous = FULL`). Direct per-commit `totalSyncMs` / `syncCommitCount` instrumentation was added in Wave 5 (`44eeb290a`) to measure this sub-phase directly on GCP rather than inferring it by scaling bare-metal NVMe ratios.

---

## 2. Directly Measured Top-Level Latency & Throughput Decomposition (GCP `b1e097b09`, `N = 100`)

All values in Table 2.1 and Table 2.2 are **(a) directly measured intervals and counts** from `raw-observations-lagrange-smoke.ndjson` (`campaignId: bench-gcp-lagrange-smoke-b1e097b09-20261124`, `offered = 100`, `issued = 100`, `committed = 98`, `conflictExhausted = 2`, `totalAttempts = 143`, `actualRetries = 43`, `conflicts = 45`, `scheduledMs = 20,000 ms`, `drainMs = 244,335.01 ms`). Quantiles `p50`, `p95`, `p99` in Table 2.1 use nearest-rank (`ceil(p * N)`) in milliseconds (`ms`).

### 2.1 Additive Interval Decomposition Across `N = 100` Issued Requests

| Decomposition Component (Category: Directly Measured) | Count / Population | Sum Across 100 Reqs (ms) | Share of Summed Latency | Share of Summed Exec Time | `min` (ms) | `p50` (ms) | `avg` (ms) | `p95` (ms) | `p99` (ms) | `max` (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Total Request Latency (`latencyMs`, all issued)** | `N = 100` issued requests | `10,822,034.33` | `100.00%` | -- | `1,753.01` | `92,435.71` | `108,220.34` | `215,461.64` | `224,146.24` | `224,535.01` |
| **Total Request Latency (`latencyMs`, committed only)** | `N = 98` committed requests | `10,506,881.81` | -- | -- | `1,753.01` | `90,818.50` | `107,213.08` | `218,041.69` | `224,535.01` | `224,535.01` |
| **(a1) Scheduler Issue Lag (`issueLagMs`)** | `N = 100` issued (`issuedAt - intended`) | `98.46` | `0.001%` | -- | `0.02` | `1.02` | `0.98` | `1.75` | `1.95` | `2.27` |
| **(a2) Worker Queue Waiting (`workerQueueWaitMs = queueDelayMs - issueLagMs`)** | `N = 100` issued across 2 serialized workers | `10,352,168.33` | `95.66%` | -- | `0.09` | `89,056.75` | `103,521.68` | `212,726.02` | `221,388.47` | `223,744.32` |
| **Total Execution Time (`execTimeMs = completed - executionStarted`)** | `N = 100` requests (`143` attempts, `43` retries) | `469,767.55` | `4.34%` | `100.00%` | `458.77` | `3,206.54` | `4,697.68` | `14,204.08` | `24,166.54` | `25,819.02` |
| **(b1) Failed `40001` Attempt Execution** | `45` failed attempts (`43` retried + `2` terminal exhausted) | `152,679.09` | `1.41%` | `32.50%` | `0.00` | `0.00` | `1,526.79` | `7,900.86` | `22,351.30` | `24,130.51` |
| **(b2) Scheduled Client Retry Backoff (`retryDelayMs`)** | `43` retries across `23` multi-attempt requests (`5/10/20 ms`) | `385.00` | `0.004%` | `0.08%` | `0.00` | `0.00` | `3.85` | `35.00` | `35.00` | `35.00` |
| **Client Adapter / Attempt Wrapper Overhead** | `execTimeMs - attemptsSumMs - retryDelayMs` | `80.01` | `0.001%` | `0.02%` | -- | -- | `0.80` | -- | -- | -- |
| **Final Committed Attempt Execution (`finalCommittedAttemptMs`)** | `N = 98` committed final attempts (`0` failed attempts) | `316,623.45` | `2.93%` | `67.40%` | `458.57` | `2,862.31` | `3,230.85` | `5,159.92` | `19,652.70` | `19,652.70` |

### 2.2 Per-Request Queue-Wait Share Quantiles (`workerQueueWaitMs_i / latencyMs_i` and `queueDelayMs_i / latencyMs_i`)

To avoid dividing a quantile over `N = 100` requests by a quantile over `N = 98` committed requests, Table 2.2 reports the quantiles of the per-request ratio computed over each homogeneous population:

| Per-Request Ratio Definition | Population (`N`) | Units | `min` | Nearest-Rank `p50` (`ceil(0.50 * N)`) | Linear-Interpolated Median | Arithmetic Mean of Ratios | Nearest-Rank `p95` | Nearest-Rank `p99` | `max` | Ratio of Population Sums (`sum(num) / sum(den)`) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `workerQueueWaitMs_i / latencyMs_i` | `N = 98` committed requests | `%` (`ms / ms`) | `0.0006%` | **`96.35%`** (`0.963516`) | **`96.39%`** (`0.963879`) | `90.36%` | `99.32%` | `99.65%` | `99.65%` | `95.89%` (`10,075.389s / 10,506.882s`) |
| `workerQueueWaitMs_i / latencyMs_i` | `N = 100` all issued requests | `%` (`ms / ms`) | `0.0006%` | **`96.34%`** (`0.963444`) | **`96.35%`** (`0.963480`) | `90.30%` | `99.18%` | `99.47%` | `99.65%` | `95.66%` (`10,352.168s / 10,822.034s`) |
| `queueDelayMs_i / latencyMs_i` | `N = 98` committed requests | `%` (`ms / ms`) | `0.0056%` | **`96.35%`** (`0.963541`) | **`96.39%`** (`0.963897`) | `90.36%` | `99.32%` | `99.65%` | `99.65%` | `95.89%` (`10,075.485s / 10,506.882s`) |
| `queueDelayMs_i / latencyMs_i` | `N = 100` all issued requests | `%` (`ms / ms`) | `0.0056%` | **`96.35%`** (`0.963451`) | **`96.35%`** (`0.963496`) | `90.30%` | `99.18%` | `99.47%` | `99.65%` | `95.66%` (`10,352.267s / 10,822.034s`) |

**Directly Measured Per-Worker Utilization:**
- `worker=1` (`50` requests): `intendedStartMs = 20,338.0 .. 39,938.0 ms`, `executionStartedAtMs = 20,338.3 ms`, `lastCompletedAtMs = 245,974.0 ms`, wall span = `225,635.7 ms`, `sum(execTimeMs) = 225,634.7 ms` (`99.9996%` busy).
- `worker=2` (`50` requests): `intendedStartMs = 20,538.0 .. 40,138.0 ms`, `executionStartedAtMs = 20,538.9 ms`, `lastCompletedAtMs = 264,673.1 ms`, wall span = `244,134.2 ms`, `sum(execTimeMs) = 244,132.8 ms` (`99.9994%` busy).

---

## 3. Directly Measured Per-Operation-Kind Breakdown (GCP `b1e097b09` vs. `tv-dator` NVMe & GCP Comparators)

### 3.1 Lagrange GCP `b1e097b09` Per-Kind Execution (`finalCommittedAttemptMs` vs. Retries & Queueing - Category: Directly Measured)

| Operation Kind | Offered / Committed | Multi-Attempt Reqs / Actual Retries / Failed `40001` Atts | `finalCommittedAtt` `p50` (ms) | `finalCommittedAtt` `avg` (ms) | `execAll` `p50` (ms) | `execAll` `avg` (ms) | `execAll` `max` (ms) | Failed Att Time (ms) | `queueDelayMs` `p50` (ms) | Total `latencyMs` `p50` (ms) |
| --- | :---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `payment` | `35 / 35` | `0 / 0 / 0` | `1,955.85` | `2,159.33` | `1,956.05` | `2,159.55` | `4,889.32` | `0.00` | `137,552.90` | `139,769.88` |
| `new_order` | `52 / 50` | `21 / 40 / 42` | `3,680.54` | `4,457.89` | `4,637.82` | `7,069.76` | `25,819.02` | `144,300.73` | `83,336.89` | `92,435.71` |
| `delivery` | `5 / 5` | `2 / 3 / 3` | `2,512.30` | `2,537.48` | `2,689.48` | `4,217.81` | `7,562.11` | `8,378.37` | `14,511.24` | `17,538.10` |
| `stock_level` | `5 / 5` | `0 / 0 / 0` | `694.56` | `710.05` | `694.75` | `710.24` | `901.24` | `0.00` | `27,051.16` | `27,745.91` |
| `order_status` | `3 / 3` | `0 / 0 / 0` | `694.10` | `638.36` | `694.28` | `638.58` | `762.69` | `0.00` | `32,141.41` | `32,904.10` |

*Note:* In `delivery`, 1-district deliveries (`10` statements, `4` writes: `1:1`, `1:8 att3`) ran `1,752.2 - 2,177.9 ms`; 2-district deliveries (`16` statements, `8` writes: `2:2`, `1:48`, `1:35 att2`) ran `2,512.3 - 3,555.8 ms`.

### 3.2 Cross-Platform & Comparator Comparison (Same `scenario-a-smoke-v1` Workload - Category: Directly Measured)

| Metric | Controller NVMe (`#295`, unloaded RF=3) | `tv-dator` NVMe (`b1e097b09`, 3-container RF=3, 2 workers) | GCP `lagrange` `b1e097b09` (`pd-ssd`, 3-VM RF=3, 2 workers) | GCP `tidb-tikv` `v8.5.8` (same GCP VMs) | GCP `pg-single-primary` (`postgres:17-alpine`, same GCP VMs) |
| --- | --- | --- | --- | --- | --- |
| Committed / Issued / Offered | -- | `96 / 100 / 100` (`4` exhausted) | `98 / 100 / 100` (`2` exhausted) | `100 / 100 / 100` | `100 / 100 / 100` |
| Total Attempts / Actual Retries / Conflicts | -- | `141 / 41 / 45` (`41` `new_order`, `4` `delivery` conflicts) | `143 / 43 / 45` (`42` `new_order`, `3` `delivery` conflicts) | `100 / 0 / 0` | `100 / 0 / 0` |
| Open-Loop Drain Window | -- | `129.194 s` (`0.743 committed/s`) | `244.335 s` (`0.401 committed/s`) | `20.000 s` (`5.000 committed/s`) | `20.000 s` (`5.000 committed/s`) |
| `queueDelayMs p50` (`N = 100`) | `~0 ms` | `34,139.5 ms` | `89,057.1 ms` | `1.18 ms` | `1.23 ms` |
| Headline `latency p50` (committed) | -- | `34,539.5 ms` (`N = 96`) | `90,818.5 ms` (`N = 98`) | `59.5 ms` (`N = 100`) | `23.5 ms` (`N = 100`) |
| `payment` clean `p50` | `279.1 - 387.7 ms` | `1,059.0 ms` (`0` retries) | `1,955.8 ms` (`0` retries) | `18.1 ms` | `6.3 ms` |
| `new_order` clean `p50` | `551.1 ms` (12 items) | `1,678.5 ms` (`execAll 2,388.1 ms`) | `3,680.5 ms` (`execAll 4,637.8 ms`) | `94.0 ms` | `37.7 ms` |
| `delivery` clean `p50` | -- | `996.9 ms` (`execAll 2,041.3 ms`) | `2,512.3 ms` (`execAll 2,689.5 ms`) | `53.2 ms` | `14.3 ms` |
| `stock_level` clean `p50` | `55.3 ms` (warm) | `261.3 ms` (`122.5 ms` isolated) | `694.6 ms` (`434.4 ms` warmup) | `13.7 ms` | `5.2 ms` |
| `order_status` clean `p50` | -- | `264.0 ms` | `694.1 ms` | `8.6 ms` | `2.9 ms` |

---

## 4. Component (b): Row-Key Contention Waits & `40001` Retry Breakdown

### 4.1 In-Place Settlement Waits vs. Prior Starvation (`3908f1e59` -> `b1e097b09`)

1. **(a) Directly measured `payment` commit rate (`0` `40001` aborts on `b1e097b09` vs. fatal warmup starvation on `3908f1e59`):**
   - On `3908f1e59` (pre-Part-A), `warmup:2:2` (`payment`) failed all 4 attempts with `40001` (`1,206 ms`, `1,229 ms`, `1,584 ms`, `2,210 ms`; `3` on `UPDATE warehouse`, `1` on `UPDATE district`), terminating warmup (`9/10`).
   - On `b1e097b09` (`src/partition/partition-row-key-waiters.js`, `partition-service-remote-query-methods.js:70-112`, `partition-participant-transaction-staging.js`), `payment` executes `4` write statements across `4` distinct partitions without prior `SELECT`s (`!session.hasExecutedRead && session.operations.length === 0`). When a concurrent writer holds `warehouse:1` or `district:1,d`, `resolveParticipantRemoteQueryAnswer` waits in FIFO order in `waitForConflictingRowKeyHolderToSettle` and re-evaluates in place.
   - Directly measured outcome on GCP `b1e097b09`: **`warmup:2:2` committed on Attempt 1 (`1,727.7 ms`, `0` retries)** and **`35/35` measurement `payment` ops committed with `0` retries**.
2. **(c) Observational subgroup comparison for in-place wait cost inside `payment` (`warmup + measurement`, `40` ops total):**
   - Non-overlapping subgroup (`payment` requests whose execution interval overlapped zero active writer on the other worker, `n = 3`): `min = 1,126.6 ms`, `p50 = 1,506.9 ms`, `avg = 1,571.0 ms`, `max = 2,079.5 ms` (compare `3908f1e59` warmup committed `payment` `n = 4`: `p50 = 1,395.1 ms`, `avg = 1,431.6 ms`).
   - Overlapping subgroup (`payment` requests overlapping an active writer on the other worker, `n = 37`): `p50 = 1,955.8 ms`, `avg = 2,221.8 ms`, `max = 4,889.1 ms` (`measurement:1:44` overlapped `2:36` & `2:37` `new_order`).
   - *Attribution caveat (Category c):* The **`+448.9 ms` median difference (`+650.8 ms` mean difference)** between the `n = 3` non-overlapping subgroup and the `n = 37` overlapping subgroup is an **observational subgroup comparison**, not a direct timer around `waitForConflictingRowKeyHolderToSettle`. It reflects both in-place row-key holder settlement waiting and concurrent control-plane Raft disk contention on `node-3` when both workers execute transactions simultaneously.

### 4.2 Directly Measured `new_order` & `delivery` Contention (`45` Failed Attempts, `43` Retries, `152.68s`, and `15s` Timeout Witnesses)

In `b1e097b09`, `session.hasExecutedRead` was a partition-wide boolean (`partition-participant-transaction-staging.js`). Whenever a transaction ran `SELECT` on a partition before writing on that same partition, `prepareWaitingRowKeySessionForReevaluation` pinned `session.generationBase`, so any concurrent commit on that partition forced `40001` instead of advancing generation:

| Failing Operation & Statement (`40001` - Directly Measured) | GCP Failed Atts | GCP Sum (ms) | GCP `p50 / max` (ms) | `tv-dator` Failed Atts | `tv-dator` Sum (ms) | Causal Mechanism in `b1e097b09` (Repaired in Wave 5 `44eeb290a`) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `new_order` / `UPDATE district SET next_order_id = ...` | `23` | `56,543.1` | `2,405.6 / 4,067.2` | `24` | `27,776.3` | Preceded by `SELECT next_order_id FROM district` on the same `(warehouse_id, district_id)` row key; concurrent `payment`/`new_order` committed `district` -> `40001` after settlement wait. |
| `new_order` / `UPDATE stock SET quantity = ...` | `5` | `29,253.0` | `3,232.2 / 17,435.6` | `4` | `6,466.8` | Preceded by `SELECT quantity FROM stock`; partition-wide `hasExecutedRead` in `b1e097b09` triggered `40001` even on **disjoint** `item_id` commits, plus `15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` timeout wait (`2:26 att2 = 17,435.6 ms`). |
| `new_order` / stripped intermediate attempts (`responseEvidence` trimmed or `COMMIT` `40001`) | `14` | `58,504.6` | `2,673.1 / 17,814.5` | `13` | `77,380.5` | Includes `2:1 att1` (`commitSent=true`, `6,944.2 ms`, `PREPARE_REFUSED` conflict at `COMMIT`) and `2:23 att2` (`17,814.5 ms`, `15,000 ms` stock-key wait timeout). |
| `delivery` / `UPDATE order_line` & `DELETE FROM new_order` | `3` | `8,378.4` | `2,866.0 / 3,010.7` | `4` | `4,905.4` | Preceded by `SELECT ... FROM new_order` / `SELECT ... FROM order_line`. |
| **Total Failed `40001` Attempts (`43` Retries + `2` Exhausted)** | **`45`** | **`152,679.1`** | -- | **`45`** | **`116,529.1`** | **`32.50%` of GCP exec time (`46.7%` on `tv-dator`).** |

**Directly Measured Two-Key `stock-p1` Mutual-Wait Timeout Witnesses (`15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` on `b1e097b09`):**
- On GCP `b1e097b09`, `new_order` `1:29` (`123,573.8 .. 143,226.5 ms`, **`19,652.7 ms`**, committed) and `2:23 att2` (`124,299.5 .. 142,114.0 ms`, **`17,814.5 ms`**, `40001`) blocked mutually on `stock` row keys until `2:23 att2`'s `15,000 ms` wait timer expired, rolling back `2:23 att2` and unblocking `1:29`.
- Immediately afterward on GCP `b1e097b09`, `1:31` (`151,055.1 .. 170,290.1 ms`, **`19,235.1 ms`**, committed) and `2:26 att2` (`151,206.5 .. 168,642.1 ms`, **`17,435.6 ms`**, `40001` at statement `[23] UPDATE stock`) repeated the identical `15,000 ms` wait timeout (`17.4s` wasted in `2:26`, contributing to `2:26`'s `conflictExhausted` terminal failure, plus `~15s` added to `1:31`).
- The same pattern occurred on `tv-dator` `b1e097b09` (`2:26 att3 = 16,507 ms`, `2:26 att4 = 16,402 ms`, total `exec = 36,440.3 ms`).

---

## 5. Components (c), (d), and (e): Source-Derived Operation Counts vs. Measured NVMe & Modeled GCP Sub-Phases

### 5.1 Category (b): Exact Source-Derived Coordinator Metadata & Raft Proposal Inventory (`b1e097b09` vs. Wave 5 `44eeb290a`)

In `src/query/distributed-transaction-coordinator*.js` and `src/query/sql-query-engine-transaction-persistence-methods.js`:
- `DistributedTransactionCoordinator.noteMetadataMutation()` increments the coordinator's `metadataMutations` callback counter on every persistence hook invocation.
- `sql-query-engine-transaction-persistence-methods.js:51-55` elides `TRANSIENT_PARTICIPANT_STATUSES` (`PREPARING`, `COMMITTING`, `ROLLING_BACK`) before calling `submitMutation`, so `2P` noted participant callbacks per committed transaction do not submit Raft mutations.
- **Closed-form operation count formulas for a committed write transaction with `P >= 1` enlisted write partitions and `W` write statements:**
  - **On `b1e097b09`:**
    - Noted coordinator metadata callbacks = **`7 + 6P + W`** (for `P = 1, W = 1`: **`14`**; for `payment` [`P = 4, W = 4`]: **`35`**; for 12-item `new_order` [`P = 5, W = 27`]: **`64`**).
    - Actual coordinator metadata submissions (`submitMutation` to `sql_transactions-p1`, `sql_transaction_participants-p1`, `sql_write_operations-p1`) = **`7 + 4P + W`** (for `P = 1, W = 1`: **`12`**; for `payment` [`P = 4, W = 4`]: **`27`**; for 12-item `new_order` [`P = 5, W = 27`]: **`54`**).
    - Participant data-partition 2PC Raft proposals (`PREPARE` + `COMMIT`) = **`2P`** (`2` for `P = 1`; `8` for `payment`; `10` for `new_order`).
  - **In Wave 5 (`44eeb290a`):**
    - Atomic `freezeParticipantSet(..., {nextStatus: PREPARING})` coalesces `(d1) + (d2)` into `1` `sql_transactions-p1` Raft write, and atomic `recordTransactionDecision(..., {nextStatus: COMMITTING})` coalesces `(d4) + (d5)` into `1` `sql_transactions-p1` Raft write (`-2` sequential `sql_transactions-p1` Raft writes per write transaction).
    - Noted coordinator metadata callbacks = **`5 + 6P + W`** (for `P = 1, W = 1`: **`12`**; for `payment`: **`33`**; for 12-item `new_order`: **`62`**).
    - Actual coordinator metadata submissions = **`5 + 4P + W`** (for `P = 1, W = 1`: **`10`**; for `payment`: **`25`**; for 12-item `new_order`: **`52`**).
  - **For a committed read-only transaction (`P = 0, W = 0`, `order_status` and `stock_level`):**
    - Both `b1e097b09` and Wave 5 (`44eeb290a`) execute **`4` actual coordinator metadata submissions** (`registerTransaction`, `freezeParticipantSet`, `recordTransactionDecision`, `setTransactionStatus(COMMITTED)`) and `0` participant data-partition Raft proposals.

| Phase / Owner Path (Category b: Source-Derived Counts) | Single-Write Baseline (`P = 1, W = 1`) `b1e097b09 -> 44eeb290a` | `order_status` (`P = 0, W = 0`, `1` read part.) `b1e097b09 -> 44eeb290a` | `stock_level` (`P = 0, W = 0`, `3` read part.) `b1e097b09 -> 44eeb290a` | `payment` (`P = 4, W = 4`) `b1e097b09 -> 44eeb290a` | `new_order` (`12` items: `P = 5, W = 27`, `1` read part.) `b1e097b09 -> 44eeb290a` | Avg GCP `new_order` (`P = 5, W = 22.69`) `b1e097b09 -> 44eeb290a` |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **BEGIN (`registerTransaction` -> `sql_transactions` INSERT)** | `1 -> 1` | `1 -> 1` | `1 -> 1` | `1 -> 1` | `1 -> 1` | `1 -> 1` |
| **`SELECT`s (`enlistReadOnlyParticipants` -> volatile `beginParticipant` + read RPC)** | `0` Raft | `0` Raft (`2` RPC) | `0` Raft (`5` RPC) | `0` Raft (`0` RPC) | `0` Raft (`26` RPC) | `0` Raft (`~21.7` RPC) |
| **(c1) New-Partition Write Enlistment (`retainParticipantSet` + `upsertParticipant(ACTIVE)`)** | `2 -> 2` (`1+1`) | `0 -> 0` | `0 -> 0` | `8 -> 8` (`4+4`) | `10 -> 10` (`5+5`) | `10 -> 10` |
| **(c2) Per-Statement Write (`markWriteOperationResult` -> `sql_write_operations-p1`)** | `1 -> 1` | `0 -> 0` | `0 -> 0` | `4 -> 4` | `27 -> 27` | `22.69 -> 22.69` |
| **(d1) `freezeParticipantSet` (`sql_transactions` UPDATE)** | `1` (merged w/ d2 in `44eeb290a`) | `1 -> 1` | `1 -> 1` | `1` (merged w/ d2 in `44eeb290a`) | `1` (merged w/ d2 in `44eeb290a`) | `1` (merged w/ d2 in `44eeb290a`) |
| **(d2) `setTransactionStatus(PREPARING)` (`sql_transactions` UPDATE)** | `1 -> 0` (atomic w/ d1) | `0 -> 0` | `0 -> 0` | `1 -> 0` (atomic w/ d1) | `1 -> 0` (atomic w/ d1) | `1 -> 0` (atomic w/ d1) |
| **(c3) `runPrepareStage` (`upsertParticipant(PREPARED)` CP Raft; `PREPARING` elided)** | `1 -> 1` (`+1` Part. 2PC) | `0 -> 0` | `0 -> 0` | `4 -> 4` (`+4` Part. 2PC) | `5 -> 5` (`+5` Part. 2PC) | `5 -> 5` (`+5` Part. 2PC) |
| **(d3) `setTransactionStatus(PREPARED)` (`sql_transactions` UPDATE)** | `1 -> 1` | `0 -> 0` | `0 -> 0` | `1 -> 1` | `1 -> 1` | `1 -> 1` |
| **(d4) `recordTransactionDecision` (`sql_transactions` `decision IS NULL` CAS UPDATE)** | `1` (merged w/ d5 in `44eeb290a`) | `1 -> 1` | `1 -> 1` | `1` (merged w/ d5 in `44eeb290a`) | `1` (merged w/ d5 in `44eeb290a`) | `1` (merged w/ d5 in `44eeb290a`) |
| **(d5) `setTransactionStatus(COMMITTING)` (`sql_transactions` UPDATE)** | `1 -> 0` (atomic w/ d4) | `0 -> 0` | `0 -> 0` | `1 -> 0` (atomic w/ d4) | `1 -> 0` (atomic w/ d4) | `1 -> 0` (atomic w/ d4) |
| **(d6) `completeCommitDecision` (`upsertParticipant(COMMITTED)` CP Raft; `COMMITTING` elided)** | `1 -> 1` (`+1` Part. 2PC) | `0 -> 0` | `0 -> 0` | `4 -> 4` (`+4` Part. 2PC) | `5 -> 5` (`+5` Part. 2PC) | `5 -> 5` (`+5` Part. 2PC) |
| **(d7) Volatile Read Cleanup (`releaseReadOnlyParticipants` -> `rollbackParticipant` RPC)** | `0` Raft | `0` Raft (`1` RPC) | `0` Raft (`3` RPC) | `0` | `0` Raft (`1` RPC) | `0` Raft (`1` RPC) |
| **(d8) `setTransactionStatus(COMMITTED)` (`sql_transactions` UPDATE)** | `1 -> 1` | `1 -> 1` | `1 -> 1` | `1 -> 1` | `1 -> 1` | `1 -> 1` |
| **Noted Coordinator Metadata Callbacks (`7 + 6P + W` -> `5 + 6P + W`)** | **`14 -> 12`** | **`4 -> 4`** | **`4 -> 4`** | **`35 -> 33`** | **`64 -> 62`** | **`~59.69 -> ~57.69`** |
| **Actual Coordinator Metadata Submissions (`7 + 4P + W` -> `5 + 4P + W`)** | **`12 -> 10`** | **`4 -> 4`** | **`4 -> 4`** | **`27 -> 25`** | **`54 -> 52`** | **`~49.69 -> ~47.69`** |
| **Participant Data-Partition 2PC Raft Proposals (`2P`)** | **`2 -> 2`** | **`0 -> 0`** | **`0 -> 0`** | **`8 -> 8`** | **`10 -> 10`** | **`10 -> 10`** |
| **Grand Total Real Raft Write Proposals (`7 + 6P + W` -> `5 + 6P + W`)** | **`14 -> 12`** | **`4 -> 4`** | **`4 -> 4`** | **`35 -> 33`** | **`64 -> 62`** | **`~59.69 -> ~57.69`** |
| **Sequential Raft Critical-Path Steps (approx.)** | **`12 -> 10`** | **`4 -> 4`** | **`4 -> 4`** | **`21 -> 19`** | **`45 -> 43`** | **`~40.69 -> ~38.69`** |

### 5.2 Category (a) Directly Measured Controller NVMe Sub-Phases (`#295`) vs. Category (c) Modeled GCP `pd-ssd` Sub-Phase Hypothesis

In Table 5.2:
- **Columns 2-4 (`#295` Controller NVMe)** are **(a) directly measured sub-phase durations and `syncCommitCount` totals** captured on the controller 3-node RF=3 harness in `#295`.
- **Column 5 (Modeled GCP `b1e097b09` Sub-Phase Hypothesis)** is a **(c) modeled hypothesis** obtained by proportionally scaling the `#295` NVMe sub-phases to the directly measured GCP whole-transaction medians (`338.6 - 434.4 ms` warmup / `694.6 ms` measurement `stock_level`; `1,506.9 ms` non-overlapping / `1,955.8 ms` overall `payment` `p50`; `2,755.8 ms` minimum / `3,680.5 ms` clean `new_order` `p50`). Because `b1e097b09` did not emit per-sub-phase coordinator timers or `RaftRsDurableStore.totalSyncMs` in `raw-observations-lagrange-smoke.ndjson`, Column 5 must be read as a proportional model rather than a direct GCP sub-phase measurement.

| Transaction & Sub-Phase | `#295` Controller NVMe (ms) [Category a: Measured] | Share (`#295`) [Category a: Measured] | `#295` Raft / Sync Detail [Category a/b] | Modeled GCP `b1e097b09` Equivalent (`pd-ssd`) [Category c: Modeled Hypothesis] | Hypothesized Primary Mechanism [Category c] |
| --- | ---: | ---: | --- | --- | --- |
| **`stock_level` (warm `#2`, 3 read partitions)** | **`55.31`** | **`100%`** | **`4` CP Raft (`syncTx = 15 - 16`)** | **Measured total: `338.6 - 434.4 ms` (warmup) / `694.6 ms` (`p50`)** | **`4` sequential `sql_transactions` Raft writes** |
| - `BEGIN` (`INSERT sql_transactions`) | `12.50` (`9.86` Raft) | `22.6%` | `1` `sql_transactions-p1` Raft write | `~85 - 170 ms` *(modeled)* | `commitDurably` WAL `fsync` |
| - `SELECT`s (`district`, `order_line JOIN stock`) | `9.64` (`3.95 + 5.69`) | `17.4%` | `0.13 - 0.14 ms` partition RPC; volatile `begin` | `~15 - 30 ms` *(modeled)* | Volatile `beginParticipant` + 2 read RPCs |
| - `COMMIT` (`freeze` + `decision` + `COMMITTED` + read release) | `33.12` (`5.7 + 6.17 + 7.87` Raft + `7.5` volatile) | `59.9%` | `3` sequential `sql_transactions` Raft writes | `~240 - 495 ms` *(modeled)* | `3` sequential `sql_transactions` Raft syncs |
| **`payment` (`#1` / `#2`, 4 write partitions, 4 writes)** | **`279.12` / `387.73`** | **`100%`** | **`27` CP + `8` 2PC = `35` Raft (`syncTx = 91 - 125`)** | **Measured total: `1,506.9 ms` (`n=3` non-overlap) / `1,955.8 ms` (`n=35` `p50`)** | **`27` CP + `8` 2PC Raft syncs (+concurrency wait)** |
| - `BEGIN` (`INSERT sql_transactions`) | `11.32` / `15.04` | `4.1% / 3.9%` | `1` `sql_transactions` Raft write | `~70 - 95 ms` *(modeled)* | `1` Raft sync |
| - `(c) statementsMs` (`4` writes: enlist + stage + `write_ops`) | `113.22` / `186.38` | `40.6% / 48.1%` | `12` sequential CP Raft (`0.36 - 1.84 ms` write RPC) | `~750 - 950 ms` *(modeled, incl. `~449 ms` subgroup delta)* | `retainParticipantSet` + `ACTIVE` + `sql_write_ops` |
| - `(c) preparePhaseMs` (`4` parallel `PREPARE` + `PREPARED`) | `39.09` / `53.80` | `14.0% / 13.9%` | `4` parallel participant + `4` `sql_tx_participants` | `~220 - 270 ms` *(modeled)* | `4` `PREPARE` Raft + `sql_transaction_participants` |
| - `(d) decisionPersistMs` (`decision IS NULL` CAS) | `13.52` / `18.16` | `4.8% / 4.7%` | `1` `sql_transactions` Raft write | `~75 - 95 ms` *(modeled)* | `1` Raft sync |
| - `(d) commitPhaseMs` (`4` parallel `COMMIT` + `COMMITTED`) | `32.56` / `28.03` | `11.7% / 7.2%` | `4` parallel participant + `4` `sql_tx_participants` | `~180 - 220 ms` *(modeled)* | `4` `COMMIT` Raft + `sql_transaction_participants` |
| - `(d) commitOwned` status/freeze + PG-wire framing | `~69.41` / `~86.32` | `24.9% / 22.3%` | `5` sequential `sql_transactions` on `b1e097b09` (`3` in `44eeb290a`) | `~350 - 430 ms` *(modeled)* | Sequential `sql_transactions` Raft syncs |
| **`new_order` (`12` items, 6 partitions, 27 writes, 25 reads)** | **`551.14`** | **`100%`** | **`54` CP + `10` 2PC = `64` Raft (`syncTx = 133 - 134`)** | **Measured total: `2,755.8 ms` (`min`) / `3,680.5 ms` (clean `p50`)** | **`27` sequential `sql_write_ops` + CP 2PC** |
| - `BEGIN` (`INSERT sql_transactions`) | `16.06` | `2.9%` | `1` `sql_transactions` Raft write | `~80 - 100 ms` *(modeled)* | `1` Raft sync |
| - `25` `SELECT`s + PG-wire client round-trips | `~84.60` | `15.4%` | `0` Raft (`0.13 - 0.4 ms` partition RPC; volatile `begin`) | `~120 - 180 ms` *(modeled)* | `25` PG-wire + partition read RPCs |
| - `(c) statementsMs` (`27` writes: `5` new part. + `27` `write_ops`) | `259.31` | `47.0%` | `37` sequential CP Raft (`0.25 - 0.45 ms` write RPC) | `~1,800 - 2,400 ms` *(modeled)* | `22` extra sequential `sql_write_operations-p1` writes |
| - `(c) preparePhaseMs` (`5` parallel `PREPARE` + `PREPARED`) | `43.11` | `7.8%` | `5` parallel participant + `5` `sql_tx_participants` | `~230 - 280 ms` *(modeled)* | `5` `PREPARE` + `sql_transaction_participants` |
| - `(d) decisionPersistMs` (`decision IS NULL` CAS) | `19.10` | `3.5%` | `1` `sql_transactions` Raft write | `~90 - 110 ms` *(modeled)* | `1` Raft sync |
| - `(d) commitPhaseMs` (`5` parallel `COMMIT` + `COMMITTED`) | `72.02` | `13.1%` | `5` parallel participant + `5` `sql_tx_participants` | `~360 - 450 ms` *(modeled)* | `5` `COMMIT` + `sql_transaction_participants` |
| - `(d) commitOwned` status/freeze + volatile read release | `~56.94` | `10.3%` | `5` sequential `sql_transactions` on `b1e097b09` (`3` in `44eeb290a`) | `~290 - 360 ms` *(modeled)* | Sequential `sql_transactions` Raft syncs |

### 5.3 Component (e): Measured Network RTT vs. Modeled WAL `fsync` Share on `50GB pd-ssd`

1. **(a) Directly Measured Network RTT & Leader Co-Location (`vpc-rtt.log` & `deployment.readiness.evidence.leaders`):**
   - Directly measured intra-VPC ICMP RTT (`vpc-rtt.log`): client `10.166.0.11 -> 10.166.0.14` `avg = 0.555 ms` (`min = 0.288 ms`), node-to-node `avg = 0.558 - 0.613 ms` (`min = 0.265 ms`), local loopback/bridge `0.051 ms`.
   - Directly observed leader placement on GCP `b1e097b09`: all three TX1 control-plane partitions (`sql_transactions-p1`, `sql_transaction_participants-p1`, `sql_write_operations-p1`) plus the `sys-postgres-wire` listener resided on `node-3` (`10.166.0.13`).
   - Combining the measured `~0.56 ms` intra-VPC RTT with the source-derived RPC and Raft replication round counts yields an estimated **`~20 - 45 ms` network transport RTT for `payment` (`~1 - 2%` of `1,955.8 ms`)** and **`~3 - 8 ms` for `order_status`/`stock_level` (`<1.2%` of `694 ms`)**.
2. **(b/c) Synchronous WAL `fsync` Mechanism and Modeled Disk Share Hypothesis:**
   - **(b) Source mechanism (`src/raft/raft-rs-durable-store.js:176-192, 444-462`):** Each partition SQLite database runs in `WAL` mode with default `synchronous = NORMAL`, and every `raft-rs` `Ready` with `mustSync !== false` calls `commitDurably(db, work)` which toggles `PRAGMA synchronous = FULL` around the SQLite `COMMIT` (forcing an OS `fsync` of the WAL) before restoring `PRAGMA synchronous = NORMAL`. In `#295` (Category a), one `payment` triggered `91 - 125` `syncCommitCount` WAL fsyncs across the 3 replicas (`2.6 - 3.6` synced SQLite commits per Raft write across the RF=3 quorum), and one 12-item `new_order` triggered `133 - 134` `syncCommitCount` WAL fsyncs.
   - **(c) Modeled hypothesis for GCP `pd-ssd` latency:** Comparing `stock_level` (`4` sequential control-plane Raft writes) across bare-metal controller NVMe (`55.31 ms`), `tv-dator` 3-container NVMe (`122.5 ms` isolated / `261.3 ms` `p50`), and GCP `50GB pd-ssd` (`338.6 - 434.4 ms` warmup / `694.6 ms` `p50`), we hypothesize that synchronous WAL `fsync` serialization on `node-3`'s single `50GB pd-ssd` volume (plus follower `pd-ssd` acknowledgment) accounts for the majority (`>90%`) of uncontended per-attempt service time. Wave 5 (`44eeb290a`) instruments `RaftRsDurableStore` with `totalSyncMs`, `syncCommitCount`, and `syncFailureCount` so subsequent runs measure WAL `fsync` time directly.
   - **(a) Directly measured comparator baseline on the identical GCP VMs and `50GB pd-ssd` disks:** `tidb-tikv` (`v8.5.8`) completed `payment` in `18.1 ms`, `new_order` in `94.0 ms`, `stock_level` in `13.7 ms`, and `order_status` in `8.6 ms`, while `pg-single-primary` completed them in `6.3 ms`, `37.7 ms`, `5.2 ms`, and `2.9 ms` (`0` queue overrun, `5.00 req/s` achieved throughput).

---

## 6. Optimization Status Reconciled With Wave 5 Source (`44eeb290a`) & Remaining Prerequisite Contracts

### 6.1 Implemented in Wave 5 (`44eeb290a3cfd70ce211d8029d8214f9142ede4f`)

The following eleven optimizations and diagnostic sensors identified during the `b1e097b09` / `887007107` investigation are **implemented in Wave 5 (`44eeb290a`)**:

1. **Per-key `readRowKeys` footprint tracking (`Implemented in Wave 5, 44eeb290a`):**
   - `src/partition/partition-participant-transaction-staging.js` replaces partition-wide `session.hasExecutedRead` boolean conflict escalation with per-key `session.readRowKeys` (`Set`) + `session.hasUnscopedRead`, preventing false `40001` aborts when concurrent transactions read and write disjoint primary keys on the same partition (such as disjoint `item_id` rows on `stock-p1`).
2. **Durable `PREPARE` read-dependency preservation (`Implemented in Wave 5, 44eeb290a`):**
   - `src/partition/partition-service-transaction-prepare.js` and `src/partition/partition-transaction-intent-validation.js` persist `readRowKeys` and `hasUnscopedRead` into the durable `PREPARE` record and enforce the full read/write conflict predicate `(W_1 \cap W_2) \lor (W_1 \cap R_2) \lor (R_1 \cap W_2)` across re-evaluation, prepare validation, and follower/restart replay.
3. **Footprint AST plan caching (`Implemented in Wave 5, 44eeb290a`):**
   - `src/partition/partition-row-key-footprint.js` caches compiled primary-key extraction plans across repeated parameterized SQL templates so per-statement row-key footprint extraction avoids re-parsing SQL ASTs on hot OLTP statements.
4. **Incremental staged byte accounting (`Implemented in Wave 5, 44eeb290a`):**
   - `src/partition/partition-participant-transaction-staging.js` maintains incremental staged byte totals as operations are appended rather than re-serializing the full staged operation list on every write statement.
5. **Disjoint-read replay bypass (`Implemented in Wave 5, 44eeb290a`):**
   - `src/partition/partition-service-remote-query-methods.js` allows a waiting session whose `readRowKeys` and `writeRowKeys` are disjoint from an intervening committed transaction's `writeRowKeys` to advance its generation baseline without full read-set replay or `40001` abort.
6. **Local wait-for-cycle detection & victim claim release (`Implemented in Wave 5, 44eeb290a`):**
   - `src/partition/partition-row-key-waiters.js` tracks directed waiter->holder edges across active row-key claims on a partition, detects wait-for cycles (such as 2-worker `stock-p1` key-order inversions) immediately instead of stalling for the `15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` timeout, and releases victim row-key claims cleanly on rollback/abort.
7. **Storage-owned `observePersistedPartitionTerm` (`Implemented in Wave 5, 44eeb290a`):**
   - `src/storage/sqlite-persisted-term-observer.js` and `src/raft/raft-coordinator.js` replace per-poll readonly SQLite open/close handles with a storage-owned persistent prepared-statement term observer, eliminating formation-time file-descriptor churn.
8. **`RaftRsDurableStore` `totalSyncMs` / `syncCommitCount` / `syncFailureCount` instrumentation (`Implemented in Wave 5, 44eeb290a`):**
   - `src/raft/raft-rs-durable-store.js` directly measures cumulative synchronous WAL `fsync` commit elapsed time (`totalSyncMs`), count (`syncCommitCount`), and failures (`syncFailureCount`) inside `commitDurably`.
9. **Narrow $O(1)$ pressure sensor (`Implemented in Wave 5, 44eeb290a`):**
   - `src/network/pressure-governor-release-watch.js` and `src/network/message-router-inbound-dispatch.js` short-circuit unchanged pressure-governor release passes in $O(1)$ using a 3-integer revision check without allocating signature strings or re-scanning pending waiter arrays.
10. **Partition-indexed `servicesForPartition(partitionId)` lookup (`Implemented in Wave 5, 44eeb290a`):**
    - Control-plane service-instance lookups index services by `partitionId` rather than scanning all service instances linearly on each partition routing/rebalance check.
11. **Atomic coordinator status transitions (`manifest-freeze + PREPARING` and `decision + COMMITTING`) & async PG-wire flush (`Implemented in Wave 5, 44eeb290a`):**
    - `src/query/distributed-transaction-coordinator-commit.js` and `src/query/sql-query-engine-transaction-persistence-methods.js` atomically combine `freezeParticipantSet` with `status = 'PREPARING'` and `recordTransactionDecision` with `status = 'COMMITTING'`, reducing actual coordinator metadata submissions per write transaction from `7 + 4P + W` (`12` for `P = 1, W = 1`; `27` for `payment`; `54` for 12-item `new_order`) to **`5 + 4P + W` (`10` for `P = 1, W = 1`; `25` for `payment`; `52` for 12-item `new_order`)**.

### 6.2 Remaining Future Levers and Their Required Prerequisite Contracts

The following items are **not** active in `44eeb290a` and remain future architectural candidates subject to explicit prerequisite contracts (any projected speedup numbers below are **Category c modeled hypotheses**):

1. **Read-Only Transaction (`P = 0, W = 0`) Metadata Elision (`order_status`, `stock_level`):**
   - *Current behavior in `44eeb290a`:* Read-only transactions execute `4` sequential `sql_transactions-p1` Raft writes (`registerTransaction` at `BEGIN`, `freezeParticipantSet` at `COMMIT`, `recordTransactionDecision` at `COMMIT`, and `setTransactionStatus(COMMITTED)` at `COMMIT`).
   - *Prerequisite contract for eliding `BEGIN` persistence:* Under standard SQL `BEGIN`, the coordinator cannot know at `BEGIN` time whether subsequent statements will enlist write participants. Eliding `registerTransaction` at `BEGIN` (or deferring `sql_transactions` row creation until the first write statement) requires either:
     - (i) an explicit `BEGIN READ ONLY` / `SET TRANSACTION READ ONLY` contract that rejects write enlistment with a typed read-only violation, or
     - (ii) lazy `sql_transactions` registration on first write enlistment paired with a verified session-id/transaction-id uniqueness and diagnostic visibility contract for in-flight volatile read transactions.
   - *Prerequisite contract for single-write or zero-write read-only `COMMIT`:* If a transaction reaches `COMMIT` with `tx.participants.size === 0` (`hasWriteParticipants === false`), collapsing `freezeParticipantSet + recordTransactionDecision + COMMITTED` into a single terminal `sql_transactions` mutation (or eliding durable commit metadata when `BEGIN` was lazy) requires proving that recovery scanning never mistakes an un-frozen or single-step read-only row for an interrupted write transaction.
2. **Deferring or Coalescing Per-Statement `sql_write_operations-p1` Bookkeeping (`W` Raft writes per transaction) and Further `sql_transactions` / `sql_transaction_participants` Coalescing:**
   - *Current behavior in `44eeb290a`:* Every write statement (`W = 4` in `payment`, `W = 27` in 12-item `new_order`) persists a `sql_write_operations-p1` row via `markWriteOperationResult` before returning to the client, and each new write partition (`P`) persists `retainParticipantSet` (`sql_transactions-p1`) + `upsertParticipant(ACTIVE)` (`sql_transaction_participants-p1`) before staging, followed by `upsertParticipant(PREPARED)`, `setTransactionStatus(PREPARED)`, `upsertParticipant(COMMITTED)`, and `setTransactionStatus(COMMITTED)`.
   - *Prerequisite contract for changing `sql_write_operations-p1` or participant/status boundaries:*
     - `sql_write_operations` rows record per-operation execution status (`APPLIED`/`FAILED`); batching or eliding per-statement `sql_write_operations-p1` Raft proposals requires verifying that no recovery path, duplicate-operation guard, or administrative diagnostic contract reads intermediate `sql_write_operations` rows prior to `PREPARE`.
     - Any further coalescing of `retainParticipantSet`, `upsertParticipant(ACTIVE/PREPARED/COMMITTED)`, or `setTransactionStatus(PREPARED/COMMITTED)` must preserve the authoritative recovery invariant in `architecture/contracts/authority-and-recovery.md`: the frozen participant manifest and `PREPARED` participant evidence must be durably committed before the `recordTransactionDecision` CAS (`decision IS NULL`) can succeed, and terminal `COMMITTED` status may only be recorded after all enlisted write participants acknowledge `commitParticipant`.
