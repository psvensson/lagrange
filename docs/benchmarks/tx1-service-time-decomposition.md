# TX1 Service-Time and Open-Loop Queueing Decomposition (GCP `b1e097b09` Smoke vs. Local NVMe & Comparators)

**Date:** 2026-11-24
**Scope:** Quantitative decomposition requested in Review Section 7 for the GCP Scenario A smoke run (`b1e097b09912507b3f04d82dfca3bd1cf2e801df`, `europe-north1-a`, 6x `e2-standard-4`, `50GB pd-ssd`) against local NVMe (`#295` controller 3-node RF=3 profiling and `tv-dator-3node-smoke` on `b1e097b09`) and GCP comparators (`tidb-tikv` `v8.5.8`, `pg-single-primary` `postgres:17-alpine`).

**Authoritative Evidence Artifacts:**
- GCP `lagrange` `b1e097b09` smoke: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-bench-b1e097b09/{campaign-summary-lagrange-smoke.json,raw-observations-lagrange-smoke.ndjson,provision-create.log,vpc-rtt.log}`
- GCP `lagrange` `3908f1e59` pre-Part-A smoke: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-bench-3908f1e59/raw-observations-lagrange-smoke.ndjson`
- GCP comparators (`tidb-tikv`, `pg-single-primary`): `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-bench-b1e097b09/raw-observations-comparators-tidb-pg-single-smoke.ndjson`
- Local NVMe 3-container Docker smoke (`tv-dator`, `b1e097b09`): `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/lab-bench-b1e097b09/tv-dator-3node-smoke/{receipt.json,workload-record.json}`
- Controller bare-metal NVMe 3-node RF=3 per-phase profiling: board message `#295`

---

## 1. Executive Summary: Why Open-Loop `p50` Was `90.82s` While Clean Execution `p50` Was `0.69s - 3.68s`

The GCP smoke campaign runs `scenario-a-smoke-v1` / `scenario-a-open-loop-v2` at `offeredRatePerSec = 5` over `2` per-worker serialized queues (`scheduledMs = 20,000 ms`, `100` measurement operations = `50` per worker, `400 ms` intended inter-arrival per worker).

1. **Open-loop queueing (`queueDelayMs`) explains `95.66%` of total GCP latency (`98.0%` at `p50`):**
   - Total request latency across all `100` measurement operations summed to `10,822,034.33 ms` (`avg = 108,220.34 ms`, `attemptLatency p50 = 92,435.71 ms`; `committed n=98` headline `latency p50 = 90,818.50 ms`).
   - Of that `108.22s` mean latency, **`103.52s` (`103,522.67 ms` avg, `p50 = 89,057.09 ms`, `95.66%`) is client-side worker queue backlog (`queueDelayMs`)**, and only **`4.70s` (`4,697.68 ms` avg, `p50 = 3,206.54 ms`, `4.34%`) is actual database execution time (`completedAtMs - executionStartedAtMs`)**.
   - Both worker promise queues (`workerQueues` in `test/distributed/harness/oltp-open-loop-step-owner.js:466-470`) stayed `100.00%` busy (`worker=1`: `225,634.7 ms` exec over `225,635.7 ms` wall span; `worker=2`: `244,132.8 ms` exec over `244,134.2 ms` wall span). Because the 2-worker saturation service rate (`2 / 4.698 s = 0.4257 req/s`) is **`11.7x` below the `5.0 req/s` offered rate**, arrivals during the `20s` issue window drained over `244.335 s` (`drainOverrunMs = 224,335.01 ms`, `0.4011 committed req/s`).
2. **Aborted retries and `15s` row-key deadlock timeouts consume `32.50%` of total execution time (`152.68s` of `469.77s`):**
   - Headline per-kind medians reported in `integration-merge-record.md` Section 44 (`payment 1,955.8 ms`, `new_order 3,680.5 ms`, `delivery 2,512.3 ms`, `stock_level 694.6 ms`, `order_status 694.1 ms`) are **final committed attempt medians (`finalCommittedAttemptMs`)**, excluding failed retry attempts and retry backoffs.
   - All `35/35` `payment`, `5/5` `stock_level`, and `3/3` `order_status` operations committed on Attempt 1 (`0` retries).
   - Conversely, `new_order` (`50/52` committed) and `delivery` (`5/5` committed) incurred `45` `40001` retries (`42` on `new_order`, `3` on `delivery`), wasting `152,679.09 ms` (`32.50%` of execution time) plus `385.00 ms` client backoff, and triggering two `15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` deadlock timeouts across competing `stock` row keys (`17.4s - 19.7s` per stalled transaction).
3. **Uncontended per-attempt execution (`694 ms` read-only, `1.96s` `payment`, `3.68s` `new_order`) is `>95%` Raft `SYNCED` WAL fsync serialization on `50GB pd-ssd`:**
   - Every read-only transaction (`order_status`, `stock_level`) executes **`4` sequential `sql_transactions-p1` Raft proposals** (`BEGIN`, `freezeParticipantSet`, `recordTransactionDecision`, `COMMITTED`) and `0` participant Raft proposals, explaining why `order_status` (`694.1 ms`) and `stock_level` (`694.6 ms`) have identical medians (`0.5 ms` apart).
   - Every `payment` executes **`27` real control-plane Raft proposals** (`11` `sql_transactions-p1` + `12` `sql_transaction_participants-p1` + `4` `sql_write_operations-p1`, with `8` transient participant updates elided) plus **`8` participant 2PC Raft proposals** (`4` `PREPARE` + `4` `COMMIT`) = **`35` Raft write proposals**.
   - Every `new_order` averages `22.69` SQL writes across `5` write partitions, executing **`~50 - 54` real control-plane Raft proposals** plus **`10` participant 2PC Raft proposals** = **`~60 - 64` Raft write proposals**.
   - Even with all three TX1 control-plane partition leaders co-located on `node-3` (`10.166.0.13`, the same node hosting `sys-postgres-wire`) and intra-VPC RTT at `0.05 - 0.61 ms`, each Raft `Ready` with `mustSync !== false` toggles `PRAGMA synchronous = FULL` in `commitDurably` (`src/raft/raft-rs-durable-store.js:176-192`), making GCP `50GB pd-ssd` WAL fsyncs **`~5 - 8x` slower** per synced Raft round than bare-metal controller NVMe (`#295`).

---

## 2. Top-Level Latency & Throughput Decomposition (GCP `b1e097b09` Measurement Window, `n = 100`)

Measured directly from `raw-observations-lagrange-smoke.ndjson` (`campaignId: bench-gcp-lagrange-smoke-b1e097b09-20261124`, `offered = 100`, `issued = 100`, `committed = 98`, `conflictExhausted = 2`, `scheduledMs = 20,000 ms`, `drainMs = 244,335.01 ms`):

| Decomposition Component | Count / Scope | Sum across 100 Reqs (ms) | Share of Total Latency | Share of Exec Time | `min` (ms) | `p50` (ms) | `avg` (ms) | `p95` (ms) | `p99` (ms) | `max` (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Total Request Latency (`latencyMs`)** | 100 issued (98 committed headline `p50 = 90,818.50`) | `10,822,034.33` | `100.00%` | -- | `1,753.01` | `92,435.71` | `108,220.34` | `215,461.64` | `224,146.24` | `224,535.01` |
| **(a1) Scheduler Issue Lag (`issueLagMs`)** | 100 issued (`intended -> issuedAt`) | `98.46` | `0.001%` | -- | `0.02` | `1.02` | `0.98` | `1.75` | `1.95` | `2.27` |
| **(a2) Worker Queue Backlog (`queueDelayMs - issueLagMs`)** | 100 issued across 2 serialized workers (`queueDelayMs p50 = 89,057.09`) | `10,352,168.33` | `95.66%` | -- | `0.04` | `89,056.08` | `103,521.68` | `212,726.07` | `221,388.45` | `223,745.45` |
| **Total Execution Time (`execTimeMs = completed - started`)** | 100 requests (`2` exhausted `new_order`) | `469,767.55` | `4.34%` | `100.00%` | `458.77` | `3,206.54` | `4,697.68` | `14,204.08` | `24,166.54` | `25,819.02` |
| **(b1) Failed `40001` Retry Attempts** | 45 failed attempts (`42` `new_order`, `3` `delivery`) | `152,679.09` | `1.41%` | `32.50%` | `0.00` | `0.00` | `1,526.79` | `7,900.86` | `22,351.30` | `24,130.51` |
| **(b2) Client Retry Backoff (`retryDelayMs`)** | 45 retries (`5 / 10 / 20 ms`, `retry-v2`) | `385.00` | `0.004%` | `0.08%` | `0.00` | `0.00` | `3.85` | `35.00` | `35.00` | `35.00` |
| **Adapter / Retry Wrapper Overhead** | `execTimeMs - attemptsSumMs - retryDelayMs` | `80.01` | `0.001%` | `0.02%` | -- | -- | `0.80` | -- | -- | -- |
| **(c)+(d)+(e)+in-place(b) Committed Attempt Exec** | `98` final committed attempts (`0` failed attempts included) | `316,623.45` | `2.93%` | `67.40%` | `458.57` | `2,862.31` | `3,230.85` | `5,159.92` | `19,652.70` | `19,652.70` |

Note on `(a)` worker queueing across the 2 workers:
- `worker=1` (`50` requests): `intended = 20,338.0 .. 39,938.0 ms`, `executionStarted = 20,338.3 ms`, `lastCompleted = 245,974.0 ms`, span = `225,635.7 ms`, `sum(execTimeMs) = 225,634.7 ms` (`99.9996%` busy).
- `worker=2` (`50` requests): `intended = 20,538.0 .. 40,138.0 ms`, `executionStarted = 20,538.9 ms`, `lastCompleted = 264,673.1 ms`, span = `244,134.2 ms`, `sum(execTimeMs) = 244,132.8 ms` (`99.9994%` busy).
- Because `oltp-open-loop-step-owner.js` serializes requests per `workerId`, a system with mean execution time `4.70s` and `2` workers saturates above `2 / 4.698 = 0.4257 req/s`. Under `5.0 req/s`, queue depth climbs by `~4.57 req/s` for all `20 s`, leaving ~`91` queued requests at `t = 40.1s` that drain linearly over the next `224.3s`.

---

## 3. Per-Operation-Kind Breakdown (GCP `b1e097b09` vs. `tv-dator` NVMe & GCP Comparators)

### 3.1 Lagrange GCP `b1e097b09` Per-Kind Execution (`finalCommittedAttemptMs` vs. Retries & Queueing)

| Operation Kind | Offered / Committed | Multi-Attempt / Failed Atts | `finalCommittedAtt` `p50` (ms) | `finalCommittedAtt` `avg` (ms) | `execAll` `p50` (ms) | `execAll` `avg` (ms) | `execAll` `max` (ms) | Failed Att Waste (ms) | `queueDelayMs` `p50` (ms) | Total `latencyMs` `p50` (ms) |
| --- | :---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `payment` | `35 / 35` | `0 / 0` | `1,955.85` | `2,159.33` | `1,956.05` | `2,159.55` | `4,889.32` | `0.00` | `137,552.90` | `139,769.88` |
| `new_order` | `52 / 50` | `21 / 42` | `3,680.54` | `4,457.89` | `4,637.82` | `7,069.76` | `25,819.02` | `144,300.73` | `83,336.89` | `92,435.71` |
| `delivery` | `5 / 5` | `2 / 3` | `2,512.30` | `2,537.48` | `2,689.48` | `4,217.81` | `7,562.11` | `8,378.37` | `14,511.24` | `17,538.10` |
| `stock_level` | `5 / 5` | `0 / 0` | `694.56` | `710.05` | `694.75` | `710.24` | `901.24` | `0.00` | `27,051.16` | `27,745.91` |
| `order_status` | `3 / 3` | `0 / 0` | `694.10` | `638.36` | `694.28` | `638.58` | `762.69` | `0.00` | `32,141.41` | `32,904.10` |

*Note:* In `delivery`, 1-district deliveries (`10` statements, `4` writes: `1:1`, `1:8 att3`) ran `1,752.2 - 2,177.9 ms`; 2-district deliveries (`16` statements, `8` writes: `2:2`, `1:48`, `1:35 att2`) ran `2,512.3 - 3,555.8 ms`.

### 3.2 Cross-Platform & Comparator Comparison (Same `scenario-a-smoke-v1` Workload)

| Metric | Controller NVMe (`#295`, unloaded RF=3) | `tv-dator` NVMe (`b1e097b09`, 3-container RF=3, 2 workers) | GCP `lagrange` `b1e097b09` (`pd-ssd`, 3-VM RF=3, 2 workers) | GCP `tidb-tikv` `v8.5.8` (same GCP VMs) | GCP `pg-single-primary` (`postgres:17-alpine`, same GCP VMs) |
| --- | --- | --- | --- | --- | --- |
| Committed / Offered | -- | `96 / 100` (`4` exhausted) | `98 / 100` (`2` exhausted) | `100 / 100` | `100 / 100` |
| Conflicts / Retry Rate | -- | `45` (`41` `new_order`, `4` `delivery`) | `45` (`42` `new_order`, `3` `delivery`) | `0` | `0` |
| Open-Loop Drain Window | -- | `129.194 s` (`0.743 committed/s`) | `244.335 s` (`0.401 committed/s`) | `20.000 s` (`5.000 committed/s`) | `20.000 s` (`5.000 committed/s`) |
| `queueDelayMs p50` | `~0 ms` | `34,139.5 ms` | `89,057.1 ms` | `1.18 ms` | `1.23 ms` |
| Headline `latency p50` | -- | `34,539.5 ms` | `90,818.5 ms` | `59.5 ms` | `23.5 ms` |
| `payment` clean `p50` | `279.1 - 387.7 ms` | `1,059.0 ms` (`0` retries) | `1,955.8 ms` (`0` retries) | `18.1 ms` | `6.3 ms` |
| `new_order` clean `p50` | `551.1 ms` (12 items) | `1,678.5 ms` (`execAll 2,388.1 ms`) | `3,680.5 ms` (`execAll 4,637.8 ms`) | `94.0 ms` | `37.7 ms` |
| `delivery` clean `p50` | -- | `996.9 ms` (`execAll 2,041.3 ms`) | `2,512.3 ms` (`execAll 2,689.5 ms`) | `53.2 ms` | `14.3 ms` |
| `stock_level` clean `p50` | `55.3 ms` (warm) | `261.3 ms` (`122.5 ms` isolated) | `694.6 ms` (`434.4 ms` warmup) | `13.7 ms` | `5.2 ms` |
| `order_status` clean `p50` | -- | `264.0 ms` | `694.1 ms` | `8.6 ms` | `2.9 ms` |

---

## 4. Component (b): Row-Key Contention Waits & `40001` Retry Breakdown

### 4.1 In-Place Settlement Waits vs. Prior Starvation (`3908f1e59` -> `b1e097b09`)

1. **`payment` (`0` `40001` aborts on `b1e097b09` vs. fatal starvation on `3908f1e59`):**
   - On `3908f1e59` (pre-Part-A), `warmup:2:2` (`payment`) failed all 4 attempts with `40001` (`1,206 ms`, `1,229 ms`, `1,584 ms`, `2,210 ms`; `3` on `UPDATE warehouse`, `1` on `UPDATE district`), terminating warmup (`9/10`).
   - On `b1e097b09` (`src/partition/partition-row-key-waiters.js`, `partition-service-remote-query-methods.js:70-112`, `partition-participant-transaction-staging.js`), `payment` executes `4` write statements across `4` distinct partitions without prior `SELECT`s (`!session.hasExecutedRead && session.operations.length === 0`). When a concurrent writer holds `warehouse:1` or `district:1,d`, `resolveParticipantRemoteQueryAnswer` waits in FIFO order in `waitForConflictingRowKeyHolderToSettle` and re-evaluates in place.
   - Effect on GCP `b1e097b09`: **`warmup:2:2` committed on Attempt 1 (`1,727.7 ms`, `0` retries)** and **`35/35` measurement `payment` ops committed with `0` retries**.
   - Quantifying the in-place wait cost inside `payment` on GCP (`warmup + measurement`, `40` ops):
     - Isolated `payment` (zero overlapping transactions, `n = 3`): `min = 1,126.6 ms`, `p50 = 1,506.9 ms`, `avg = 1,571.0 ms`, `max = 2,079.5 ms` (consistent with `3908f1e59` warmup committed `payment` `n = 4`: `p50 = 1,395.1 ms`, `avg = 1,431.6 ms`).
     - Concurrent `payment` overlapping an active writer (`n = 37`): `p50 = 1,955.8 ms`, `avg = 2,221.8 ms`, `max = 4,889.1 ms` (`measurement:1:44` overlapped `2:36` & `2:37` `new_order`). Thus, in-place FIFO settlement waiting adds **`~450 ms` at the median (`~650 ms` avg)** to `payment` while saving the entire `ROLLBACK` + retry penalty.

### 4.2 `new_order` & `delivery` Contention (`45` Failed Attempts, `152.68s`, and `15s` Deadlock Waits)

In `b1e097b09`, `session.hasExecutedRead` is a partition-wide boolean (`partition-participant-transaction-staging.js`). Whenever a transaction runs `SELECT` on a partition before writing on that same partition, `prepareWaitingRowKeySessionForReevaluation` pins `session.generationBase`, so any concurrent commit on that partition forces `40001` instead of advancing generation:

| Failing Operation & Statement (`40001`) | GCP Failed Atts | GCP Sum (ms) | GCP `p50 / max` (ms) | `tv-dator` Failed Atts | `tv-dator` Sum (ms) | Causal Mechanism |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `new_order` / `UPDATE district SET next_order_id = ...` | `23` | `56,543.1` | `2,405.6 / 4,067.2` | `24` | `27,776.3` | Preceded by `SELECT next_order_id FROM district`; concurrent `payment`/`new_order` committed `district` -> `hasExecutedRead = true` blocks advancement -> `40001` after settlement wait. |
| `new_order` / `UPDATE stock SET quantity = ...` | `5` | `29,253.0` | `3,232.2 / 17,435.6` | `4` | `6,466.8` | Preceded by `SELECT quantity FROM stock`; partition-wide `hasExecutedRead` triggers `40001` even on **disjoint** `item_id` commits, plus `15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` deadlock wait (`2:26 att2 = 17,435.6 ms`). |
| `new_order` / stripped intermediate attempts (`responseEvidence` trimmed or `COMMIT` `40001`) | `14` | `58,504.6` | `2,673.1 / 17,814.5` | `13` | `77,380.5` | Includes `2:1 att1` (`commitSent=true`, `6,944.2 ms`, `PREPARE_REFUSED` conflict at `COMMIT`) and `2:23 att2` (`17,814.5 ms`, `15,000 ms` stock-key deadlock timeout). |
| `delivery` / `UPDATE order_line` & `DELETE FROM new_order` | `3` | `8,378.4` | `2,866.0 / 3,010.7` | `4` | `4,905.4` | Preceded by `SELECT ... FROM new_order` / `SELECT ... FROM order_line` (`hasExecutedRead = true`). |
| **Total Failed `40001` Attempts** | **`45`** | **`152,679.1`** | -- | **`45`** | **`116,529.1`** | **`32.50%` of GCP exec time (`46.7%` on `tv-dator`).** |

**Two-Key `stock-p1` Deadlock Witnesses (`15,000 ms` `DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS` timeout):**
- On GCP, `new_order` `1:29` (`123,573.8 .. 143,226.5 ms`, **`19,652.7 ms`**, committed) and `2:23 att2` (`124,299.5 .. 142,114.0 ms`, **`17,814.5 ms`**, `40001`) blocked mutually on disjoint `stock` `item_id`s until `2:23 att2`'s `15,000 ms` wait timer expired, rolling back `2:23 att2` and unblocking `1:29`.
- Immediately afterward on GCP, `1:31` (`151,055.1 .. 170,290.1 ms`, **`19,235.1 ms`**, committed) and `2:26 att2` (`151,206.5 .. 168,642.1 ms`, **`17,435.6 ms`**, `40001` at statement `[23] UPDATE stock`) repeated the identical mutual wait (`17.4s` wasted in `2:26`, contributing to `2:26`'s `conflictExhausted` terminal failure, plus `~15s` added to `1:31`).
- The same pattern occurred on `tv-dator` (`2:26 att3 = 16,507 ms`, `2:26 att4 = 16,402 ms`, total `exec = 36,440.3 ms`).

---

## 5. Components (c), (d), and (e): Coordinator Staging, 2PC Settlement, Raft Persistence & Transport RTT

### 5.1 Exact Per-Transaction Raft Write & RPC Inventory (Source-Verified Against `src/query/` & `src/partition/`)

Every call to `submitMutation` on `sql_transactions-p1`, `sql_transaction_participants-p1`, or `sql_write_operations-p1`, and every participant `PREPARE` / `COMMIT`, executes a Raft `propose` across the RF=3 partition group. `sql-query-engine-transaction-persistence-methods.js:51-55, 346-349` elides `TRANSIENT_PARTICIPANT_STATUSES` (`PREPARING`, `COMMITTING`, `ROLLING_BACK`) at the SQL persistence boundary, though `DistributedTransactionCoordinator` still increments `metadataMutations` before that check (`35` noted vs `27` real control-plane Raft writes for `payment`; `64` noted vs `54` real for 12-item `new_order`):

| Phase / Owner Path | `order_status` (`1` read part., `0` writes) | `stock_level` (`3` read part., `0` writes) | `payment` (`4` write part., `4` writes) | `new_order` (`12` items: `5` write + `1` read part., `27` writes) | Avg GCP `new_order` (`22.69` writes, `~10` items) |
| --- | ---: | ---: | ---: | ---: | ---: |
| **BEGIN (`registerTransaction` -> `sql_transactions` INSERT)** | `1` Raft | `1` Raft | `1` Raft | `1` Raft | `1` Raft |
| **`SELECT`s (`enlistReadOnlyParticipants` -> volatile `beginParticipant` + read RPC)** | `0` Raft (`2` RPC) | `0` Raft (`5` RPC) | `0` Raft (`0` RPC) | `0` Raft (`26` RPC) | `0` Raft (`~21.7` RPC) |
| **(c1) New-Partition Write Enlistment (`retainParticipantSet` + `beginParticipant` + `upsertParticipant(ACTIVE)`)** | `0` | `0` | `8` Raft (`4` + `4`) + `4` RPC | `10` Raft (`5` + `5`) + `5` RPC | `10` Raft + `5` RPC |
| **(c2) Per-Statement Write (`stageWrite` + `markWriteOperationResult` -> `sql_write_operations-p1`)** | `0` | `0` | `4` Raft + `4` RPC | `27` Raft + `27` RPC | `22.7` Raft + `22.7` RPC |
| **(d1) `freezeParticipantSet` (`sql_transactions` UPDATE)** | `1` Raft | `1` Raft | `1` Raft | `1` Raft | `1` Raft |
| **(d2) `setTransactionStatus(PREPARING)` (`sql_transactions` UPDATE)** | `0` | `0` | `1` Raft | `1` Raft | `1` Raft |
| **(c3) `runPrepareStage` (`prepareParticipant` Raft + `upsertParticipant(PREPARED)` Raft; `PREPARING` elided)** | `0` | `0` | `4` Part. + `4` CP (`8` Raft, parallel) | `5` Part. + `5` CP (`10` Raft, parallel) | `10` Raft (parallel) |
| **(d3) `setTransactionStatus(PREPARED)` (`sql_transactions` UPDATE)** | `0` | `0` | `1` Raft | `1` Raft | `1` Raft |
| **(d4) `recordTransactionDecision` (`sql_transactions` `decision IS NULL` CAS UPDATE)** | `1` Raft | `1` Raft | `1` Raft | `1` Raft | `1` Raft |
| **(d5) `setTransactionStatus(COMMITTING)` (`sql_transactions` UPDATE)** | `0` | `0` | `1` Raft | `1` Raft | `1` Raft |
| **(d6) `completeCommitDecision` (`commitParticipant` Raft + `upsertParticipant(COMMITTED)` Raft; `COMMITTING` elided)** | `0` | `0` | `4` Part. + `4` CP (`8` Raft, parallel) | `5` Part. + `5` CP (`10` Raft, parallel) | `10` Raft (parallel) |
| **(d7) Volatile Read Cleanup (`releaseReadOnlyParticipants` -> `rollbackParticipant` RPC)** | `0` Raft (`1` RPC) | `0` Raft (`3` RPC) | `0` | `0` Raft (`1` RPC) | `0` Raft (`1` RPC) |
| **(d8) `setTransactionStatus(COMMITTED)` (`sql_transactions` UPDATE)** | `1` Raft | `1` Raft | `1` Raft | `1` Raft | `1` Raft |
| **Total Real Control-Plane Raft Writes (`metadataMutations` counter)** | **`4`** (`4`) | **`4`** (`4`) | **`27`** (`35`) | **`54`** (`64`) | **`~49.7`** (`~59.7`) |
| **Total Participant Data-Partition Raft Writes (`PREPARE` + `COMMIT`)** | **`0`** | **`0`** | **`8`** (`4`+`4`) | **`10`** (`5`+`5`) | **`10`** (`5`+`5`) |
| **Grand Total Real Raft Write Proposals** | **`4`** | **`4`** | **`35`** | **`64`** | **`~59.7`** |
| **Sequential Raft Critical-Path Steps (approx.)** | **`4`** | **`4`** | **`21`** (`19` CP + `2` 2PC) | **`45`** (`43` CP + `2` 2PC) | **`~40.7`** |

### 5.2 Per-Phase Measured Service-Time Breakdown (`#295` Controller NVMe vs. GCP `pd-ssd`)

Mapping the `#295` controller RF=3 live PG-wire per-phase measurements directly onto the GCP `b1e097b09` uncontended / clean execution times (`stock_level 694.6 ms` [warmup `338.6 - 434.4 ms`], `payment 1,506.9 ms` isolated / `1,955.8 ms` concurrent `p50`, `new_order 2,755.8 ms` isolated / `3,680.5 ms` clean `p50`):

| Transaction & Phase | `#295` Controller NVMe (ms) | Share (`#295`) | `#295` Raft / Sync Detail | GCP `b1e097b09` Equivalent (`pd-ssd` + Concurrency) | Primary Bottleneck |
| --- | ---: | ---: | --- | --- | --- |
| **`stock_level` (warm `#2`, 3 read partitions)** | **`55.31`** | **`100%`** | **`4` CP Raft (`syncTx = 15 - 16`)** | **`338.6 - 434.4 ms` (warmup) / `694.6 ms` (`p50`)** | **`4` sequential `sql_transactions` Raft writes** |
| - `BEGIN` (`INSERT sql_transactions`) | `12.50` (`9.86` Raft) | `22.6%` | `1` `sql_transactions-p1` Raft write | `~85 - 170 ms` | `commitDurably` WAL `fsync` |
| - `SELECT`s (`district`, `order_line JOIN stock`) | `9.64` (`3.95 + 5.69`) | `17.4%` | `0.13 - 0.14 ms` partition RPC; volatile `begin` | `~15 - 30 ms` | Volatile `beginParticipant` + 2 read RPCs |
| - `COMMIT` (`freeze` + `decision` + `COMMITTED` + read release) | `33.12` (`5.7 + 6.17 + 7.87` Raft + `7.5` volatile) | `59.9%` | `3` sequential `sql_transactions` Raft writes | `~240 - 495 ms` | `3` sequential `sql_transactions` Raft syncs |
| **`payment` (`#1` / `#2`, 4 write partitions, 4 writes)** | **`279.12` / `387.73`** | **`100%`** | **`35` Raft (`syncTx = 91 - 125`)** | **`1,506.9 ms` (isol.) / `1,955.8 ms` (`p50`)** | **`27` CP + `8` 2PC Raft syncs (+450ms wait)** |
| - `BEGIN` (`INSERT sql_transactions`) | `11.32` / `15.04` | `4.1% / 3.9%` | `1` `sql_transactions` Raft write | `~70 - 95 ms` | `1` Raft sync |
| - `(c) statementsMs` (`4` writes: enlist + stage + `write_ops`) | `113.22` / `186.38` | `40.6% / 48.1%` | `12` sequential CP Raft (`0.36 - 1.84 ms` write RPC) | `~750 - 950 ms` (incl. `~450 ms` row-key wait in `p50`) | `retainParticipantSet` + `ACTIVE` + `sql_write_ops` |
| - `(c) preparePhaseMs` (`4` parallel `PREPARE` + `PREPARED`) | `39.09` / `53.80` | `14.0% / 13.9%` | `4` parallel participant + `4` `sql_tx_participants` | `~220 - 270 ms` | `4` `PREPARE` Raft + `sql_transaction_participants` |
| - `(d) decisionPersistMs` (`decision IS NULL` CAS) | `13.52` / `18.16` | `4.8% / 4.7%` | `1` `sql_transactions` Raft write | `~75 - 95 ms` | `1` Raft sync |
| - `(d) commitPhaseMs` (`4` parallel `COMMIT` + `COMMITTED`) | `32.56` / `28.03` | `11.7% / 7.2%` | `4` parallel participant + `4` `sql_tx_participants` | `~180 - 220 ms` | `4` `COMMIT` Raft + `sql_transaction_participants` |
| - `(d) commitOwned` status/freeze + PG-wire framing | `~69.41` / `~86.32` | `24.9% / 22.3%` | `5` sequential `sql_transactions` (`freeze`, `PREPARING`, `PREPARED`, `COMMITTING`, `COMMITTED`) | `~350 - 430 ms` | `5` sequential `sql_transactions` Raft syncs |
| **`new_order` (`12` items, 6 partitions, 27 writes, 25 reads)** | **`551.14`** | **`100%`** | **`64` Raft (`syncTx = 133 - 134`)** | **`2,755.8 ms` (isol.) / `3,680.5 ms` (clean `p50`)** | **`27` sequential `sql_write_ops` + CP 2PC** |
| - `BEGIN` (`INSERT sql_transactions`) | `16.06` | `2.9%` | `1` `sql_transactions` Raft write | `~80 - 100 ms` | `1` Raft sync |
| - `25` `SELECT`s + PG-wire client round-trips | `~84.60` | `15.4%` | `0` Raft (`0.13 - 0.4 ms` partition RPC; volatile `begin`) | `~120 - 180 ms` | `25` PG-wire + partition read RPCs |
| - `(c) statementsMs` (`27` writes: `5` new part. + `27` `write_ops`) | `259.31` | `47.0%` | `37` sequential CP Raft (`0.25 - 0.45 ms` write RPC) | `~1,800 - 2,400 ms` | `22` extra sequential `sql_write_operations-p1` writes |
| - `(c) preparePhaseMs` (`5` parallel `PREPARE` + `PREPARED`) | `43.11` | `7.8%` | `5` parallel participant + `5` `sql_tx_participants` | `~230 - 280 ms` | `5` `PREPARE` + `sql_transaction_participants` |
| - `(d) decisionPersistMs` (`decision IS NULL` CAS) | `19.10` | `3.5%` | `1` `sql_transactions` Raft write | `~90 - 110 ms` | `1` Raft sync |
| - `(d) commitPhaseMs` (`5` parallel `COMMIT` + `COMMITTED`) | `72.02` | `13.1%` | `5` parallel participant + `5` `sql_tx_participants` | `~360 - 450 ms` | `5` `COMMIT` + `sql_transaction_participants` |
| - `(d) commitOwned` status/freeze + volatile read release | `~56.94` | `10.3%` | `5` sequential `sql_transactions` + `1` volatile `rollback` | `~290 - 360 ms` | `5` sequential `sql_transactions` Raft syncs |

*Note:* The `#295` proportions (`~4.9x - 6.7x` scaling from `#295` controller NVMe to GCP `pd-ssd`) are derived by scaling controller NVMe phases (`55.31 -> 338.6 - 434.4 ms` for `stock_level`, `279.1 - 387.7 -> 1,506.9 ms` for isolated `payment`, `551.1 -> 2,755.8 ms` for isolated `new_order`) and accounting for the measured `+450 ms` row-key wait in concurrent `payment` (`1,955.8 ms` `p50`).

### 5.3 Component (e): Raft `commitDurably` WAL `fsync` Amplification vs. Network Transport RTT

1. **Per-Entry Synchronous WAL `fsync` Mechanism (`src/raft/raft-rs-durable-store.js:176-192, 444-462`):**
   - Each partition SQLite database initializes with `journal_mode = WAL` and `synchronous = NORMAL` (`src/partition/partition-service-raft-init-base.js:247-248`, `src/storage/storage-constants.js:24-25`).
   - Whenever `raft-rs` emits a `Ready` with `mustSync !== false` (every appended log entry, vote, or term change on Leader and Followers), `RaftRsDurableStore.persistReady` calls `commitDurably(db, work)` which executes `PRAGMA synchronous = FULL`, runs the SQLite transaction (triggering synchronous OS `fsync` of the WAL on `COMMIT`), and restores `PRAGMA synchronous = NORMAL`.
   - In `#295`, a single `payment` triggered `91 - 125` `syncCommitCount` WAL fsyncs across the 3 replicas (`2.6 - 3.6` synced SQLite commits per Raft write across the RF=3 quorum), and a single `12`-item `new_order` triggered `133 - 134` `syncCommitCount` WAL fsyncs.
   - Across GCP (`50GB pd-ssd`, `e2-standard-4`), local `tv-dator` (3 Docker containers sharing 1 NVMe), and bare-metal controller NVMe (`#295`):
     - `stock_level` (`4` sequential Raft writes): `55.31 ms` (controller NVMe) -> `122.5 ms` isolated / `261.3 ms` `p50` (`tv-dator` 3-container NVMe) -> `338.6 - 434.4 ms` warmup / `694.6 ms` `p50` (GCP `50GB pd-ssd`). **GCP `pd-ssd` multiplies per-Raft-round fsync latency by `~6.1 - 7.8x` (unloaded) up to `12.6x` (under 2-worker control-plane load) vs. bare-metal NVMe, and `~2.65x` vs. `tv-dator` 3-container NVMe.**
     - Single-TX1 leader hotspot: on the GCP `b1e097b09` run (`deployment.readiness.evidence.leaders`), all three TX1 control-plane partitions (`sql_transactions-p1`, `sql_transaction_participants-p1`, `sql_write_operations-p1`) plus the `sys-postgres-wire` endpoint resided on `node-3` (`10.166.0.13`), serializing both workers' control-plane Raft `persistReady` fsyncs onto `node-3`'s single `50GB pd-ssd` volume (along with `node-1` and `node-2` follower `pd-ssd` fsyncs).
2. **Transport RTT Share (`vpc-rtt.log` & Leader Placement):**
   - Measured intra-VPC ICMP RTT (`vpc-rtt.log`): client `10.166.0.11 -> 10.166.0.14` `avg = 0.555 ms` (`min = 0.288 ms`), node-to-node `avg = 0.558 - 0.613 ms` (`min = 0.265 ms`), local loopback/bridge `0.051 ms`.
   - With `node-3` hosting `sys-postgres-wire` and all 3 TX1 control-plane partition leaders, control-plane RPCs were local to `node-3`, leaving only `6 - 58` client PG-wire round-trips, `4 - 32` user-partition RPCs (when leader != `node-3`), and `4 - 64` Raft `MsgAppend` replication RTTs (`~0.56 ms` each) -> **`~20 - 45 ms` total network RTT for `payment` (`~1 - 2%` of `1,955.8 ms`)** and **`~3 - 8 ms` for `order_status`/`stock_level` (`<1.2%` of `694 ms`)**.
   - On the identical GCP VMs and `50GB pd-ssd` disks, `tidb-tikv` (`v8.5.8`) completed `payment` in `18.1 ms`, `new_order` in `94.0 ms`, `stock_level` in `13.7 ms`, and `order_status` in `8.6 ms`, while `pg-single-primary` completed them in `6.3 ms`, `37.7 ms`, `5.2 ms`, and `2.9 ms` (`0` queue overrun, `5.00 req/s` achieved throughput). Thus the `~108x` (`payment`) to `~81x` (`order_status`) gap vs. `tidb-tikv` is overwhelmingly **TX1 Raft write amplification per SQL transaction (`4 - 64` synced Raft writes vs. `0 - 2` in TiDB/Percolator)** rather than network RTT or disk hardware alone.

---

## 6. Actionable Optimization Levers (Ordered by Measured Impact)

1. **Eliminate `hasExecutedRead` False Conflicts on Disjoint `stock` Keys (`@tx1-contention-owner`, Finding 7):**
   - Replacing partition-wide `session.hasExecutedRead` with per-key `session.readRowKeys` (`Set`) + `session.hasUnscopedRead` avoids `40001` aborts when concurrent `new_order` transactions touch disjoint `item_id` rows on `stock-p1`, directly targeting the `144.3s` (`30.7%` of all execution time) wasted in failed `new_order` attempts and the two `15s` mutual `stock` deadlock waits (`~64 - 74s`).
2. **Coalesce or Elide Non-Authoritative TX1 Control-Plane Raft Writes (`sql-query-engine-transaction-persistence-methods.js` & `DistributedTransactionCoordinator`):**
   - **`sql_write_operations-p1` (`22.7` Raft writes per `new_order`, `4` per `payment`):** `sql_write_operations` is documented as bookkeeping, not decision-bearing (`sql-query-engine-transaction-persistence-methods.js:383-384`), yet adds `1` sequential Raft fsync per `UPDATE`/`INSERT` (`~50%` of `new_order` `statementsMs`). Deferring/batching write-op bookkeeping or omitting synchronous Raft persistence per statement cuts `new_order` Raft proposals by `~38%`.
   - **Read-only (`tx.participants.size === 0`) fast commit (`order_status`, `stock_level`):** Avoiding `4` sequential `sql_transactions-p1` Raft writes for pure volatile read transactions drops `stock_level`/`order_status` from `~694 ms` toward `~15 - 30 ms` on GCP (`>20x`).
   - **Coalesced `sql_transactions` status transitions & `ACTIVE` participant upserts:** Folding `PREPARING`/`PREPARED`/`COMMITTING` status updates (where participant/decision rows already establish durability or where `participant_set_text` already retains the `ACTIVE` manifest) reduces sequential `sql_transactions-p1` critical-path fsyncs in `payment`/`new_order` `COMMIT` from `6` sequential `sql_transactions` Raft rounds toward `1 - 2` (`freeze + decision` + terminal `COMMITTED`).
3. **Avoid `15s` Undetected Wait Deadlocks on Multi-Key `stock` Writes (`DEFAULT_PARTICIPANT_CONFLICT_WAIT_MS`):**
   - `15,000 ms` per wait-cycle turns a 2-key inversion between two `new_order` workers into a `17 - 19s` stall per worker; a bounded deadlock/wait cap (or ordered wait-for detection / shorter wait bound when a session already holds active row keys) caps deadlock waste without hurting single-statement FIFO handoff (`payment`).
