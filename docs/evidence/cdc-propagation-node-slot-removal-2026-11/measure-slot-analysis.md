---
audience: evidence
recorded: 2026-11-14
quest: cdc-propagation-node-slot-removal
---

# Slot-removal measurement: f3aa2f08 compared with 9991b450 and ed708dfd

This is one journey run on tv-dator. It measures; it does not judge acceptance.

The runs:
- **ed708dfd** is the original diagnostic run.
- **9991b450** is range shipping plus the lifecycle repair, with the slot still present.
- **f3aa2f08** is this run. It is candidate `551bf264` (slot removed) plus diagnostics.

The earlier note about the bundle size refusal is kept as `measure-slot-analysis.size-refusal-note.md`.

## Route

| item | value |
|---|---|
| measurement branch | `measure/slot-removal-20261114` = `f3aa2f082ed98460f436295c6c416ae3b521af1c`. It is two diagnostic commits on `551bf264`. It is throwaway and never pushed. |
| first head | `5b069678d`. The sanity job `92198678-cacb-4ddb-9abf-c34e51d7a013` (adams-gamla) failed 11/12. The removed-mechanism census flagged my own leftover, now-unused slot-era helpers in `src/cdc/formation-cdc-observation.js`. `f3aa2f08` deletes them; nothing else changed. |
| sanity | job `59903049-5dbb-4601-989d-2b3b355b5084`, adams-gamla: COMPLETE, exit 0, 85.6 s. 12/12 files and 224 assertions passed. Files: lane, range shipping, scan re-capture, typed backpressure, wave isolation (partition and topology), wave lifecycle, census, propagation service, cdc-handler, router critical source reserve, outbound saturation warn. |
| journey | job `80f31146-504f-412b-95e5-45d32551ad8d`, tv-dator: **COMPLETE, exit 0, 260.7 s**. Scenario `passed=True`, verdict **PASS**, duration 195.4 s. It waited about 2 minutes in the local queue first. Evidence is COMPLETE in `journey/measure-slot-f3aa2f08/`. |
| transport | The payload was 480 433 B. Tree `6430b6de42ed` of `f3aa2f08` travelled as the single commit `784c3b2bf64e71de43e674d404f2d36d5e3fd218` (`job.json`: commit, tree, transportCommit). The product's source fingerprint is the docker label `ddb.git-hash=784c3b2bf64e` in the raw log. That is the transport commit; it maps to `f3aa2f08` through `job.json`. |
| scripts and outputs | `journey/analysis/`: `load2.py`, `slotrun_lane.py`, `slotrun_waves.py`, `slotrun_loop.py`, `slotrun_loopcorr.py`, `slotrun_recv.py`, `slotrun_errs.py`, `warncensus.py` (renamed from `warnings.py` because that name shadowed the standard library). Outputs are in `analysis/slot-run/*.txt` and decompressed logs in `analysis/slot-run/logs/`. |

Nodes in this run:
- seed `70808e06`. It led every system partition and was the only sender.
- `84ee7b06`
- `96203c04`

## Diagnostics

- **Lane** (every table):
  - `source-drive`: the cut reason, the window before, the rows still owed after the cut, and the members.
  - `subscriber-answer` with its coverage state, and `source-shipped`.
  - `source-held`: disposition, hint, retry delay, source of the error, window before and after, and `tailRecaptured`.
  - `source-ack-backpressure`.
- **Waves:**
  - `wave-admitted`, `wave-result` and `wave-cleanup`. They record the size of `inFlightDurableWaves`, the depth of the source group's `cdcCommitWaiters` against its capacity, and the row count.
  - `propagation-leaf` with start and end times, the transport reason code, and the typed-backpressure classification.
- **Router:** `outbound-rejected` and `outbound-preempted`.
- **Event loop:** a per-second `loop-sample` on every node: the `monitorEventLoopDelay` histogram (10 ms resolution, values include the resolution), RSS and heap.
- **Receivers and cache:** these stages stay on `services` and `replica_operations`.
- **Persisted log rows** from propagation are derived from the log, not instrumented.

## Comparison

| | ed708dfd | 9991b450 | f3aa2f08 |
|---|---|---|---|
| scenario | failed (BLOCK_EVIDENCE_INCOMPLETE) | failed (BLOCK_EVIDENCE_INCOMPLETE) | **PASS** |
| predicates a-f, observation-integrity | met | met | met |
| g (bound 1000 ms) | 5 persistent | 2 persistent | **met, 0 persistent** |
| services commit → first drive p50 / p90 / max (ms) | 10 614 / 22 182 / 32 750 | 602 / 2 838 / 11 341 | **172 / 597 / 1 936** (startup idx 3 excluded, see note) |
| services commit → remote receipt p50 / p90 / max | 11 267 / 22 538 / 33 377 | 1 669-1 775 / 3 771-3 935 / 7 947 | **346-586 / 853-1 172 / 2 255** |
| replica_operations commit → drive p50 / p90 / max | 1 932 / 4 851 / 18 123 (de5a) | 611 / 2 974 / 6 561 | 408 / 885 / 1 897 |
| replica_operations commit → remote receipt p50 / p90 / max | - | 1 094-1 339 / 4 069-4 231 / 7 685 | 597-764 / 1 114-1 362 / 2 322 |
| commit → lane answer p50 / p90 / max: services, nodes, control_plane_publications, storage_reservations | - | 1 950/4 011/8 013; 2 047/4 173/9 035; 2 191/4 202/7 471; 1 999/5 468/8 404 | 772/1 564/2 912; 762/1 174/2 350; 1 045/1 630/2 571; 666/1 577/2 178 |
| commit → first drive p50/p90/max (no startup): nodes, control_plane_publications, storage_reservations | - | - | 97/255/1 773; 173/1 139/1 393; 146/628/1 047 |
| vectors (rows): services; replica_operations | 136 waves (1 row each); 197 | 67 (129 rows, max 6); 92 (200 rows, max 11) | 126 (140 rows, max 2); 148 (203 rows, max 4) |
| window max: services; replica_operations; control_plane_publications | - | 8; 16; 8 | 4; 4; 8 |
| window halvings | - | 0 | 0 |
| lane holds | 322 services refusals (slot) | 1 186, all typed backpressure from the slot | **0** |
| tail re-captures | - | - | 0 (nothing was held) |
| drive attempts per event: max; events with more than 1 attempt | 33; 31 | 28; 36 | 3; 3 (the startup events) |
| concurrent waves on the sender | 1 (slot) | 1 (slot) | peak 7 at +0.3 s (startup); after that a maximum of 3-5 per 10 s. Time-weighted: 0 waves 20 %, 1 wave 29 %, 2 waves 33 %, 3 waves 14 %, 4 or more 3.6 %. |
| wave duration p50 / p90 / max | 460 / 796 / 1 295 | 350 / 665 / 1 342 | 501 / 1 044 / 2 038 |
| wave cost by size | - | 328 + 42·rows | 563 + 14·rows (dominated by overlap, not size) |
| wave p50 by number of other overlapping waves (0 / 1 / 2 / 3 / 4-6) | - | - | 299 / 371 / 506 / 672 / 1 008 ms |
| leaf legs p50: source; target 1; target 2 | 94; 54; 151 | 72; 98; 154 | 122; 121; 195. By waves in flight (1 / 2 / 3 / 4-6): source 70 / 126 / 179 / 228, target 118 / 134 / 162 / 207. |
| leaf outcomes | - | - | 1 258 ok. 7 source `cdc_committed_acceptance_unknown` at +0.05-0.3 s (pre-join idx 3 of 7 tables, later retired by hydration). 3 `cdc_provisional_ingress`. **0 typed backpressure** from governor, commit queue or outbound queue. |
| outbound-queue rejections / preemptions (all traffic, all nodes) | - | - | **0 / 0** |
| commit waiters at admission p50 / max (capacity 1 000) | - | - | 0 / 6 |
| propagation warn lines (persisted candidates) | 3 | 1 | 2 ("Retrying CDC propagation delivery failures") |
| order inversions; drops | 0; 0 | 0; 0 | 0; 0 |
| catch-up-only deliveries | join-time services rows | join-time services 284-296 | join-time services 284-291 / 284-298, covered by the first or second catch-up. replica_operations: none. |
| `raft_role_missing`; lifecycle-reconciliation role mismatches | 1 episode | 0; 0 of 12 | 0; 0 of 4 |
| seed event-loop delay (mean per second) p50 / p90 / max | not sampled | not sampled | **222 / 582 / 989 ms** |
| seed event-loop delay (max per second) p50 / p90 / max | not sampled | not sampled | **370 / 716 / 1 449 ms** |
| seconds where the seed's loop delay exceeded 100 ms | - | - | 126 of 139 |
| follower event-loop delay | not sampled | not sampled | mean about 11 ms (≈ the resolution). Per-second max p50 about 30 ms, max 196 ms. Seconds above 100 ms: 5 and 7. |
| "Event loop gap detected" (1 s threshold) on the seed | 2 (one at startup, one of 1 381 ms) | 1 (startup) | **5** (2 050 ms at startup, then 1 107 / 1 038 / 1 007 / 1 094 ms, ELU 0.86-1.0) |
| seed RSS / heap | RSS 491 at end | RSS 157 → 472 | RSS 353 → 499 (max 499), heap 123 → 178 (max 213) |
| follower "Skipping ACK-timeout quarantine (slow, not dead)" | 16 / 2 | 1 / 1 | **23 / 19** |
| self-targeted replica ops failing with "Message not acknowledged" | 1 | 4 REMOVE | 3 REMOVE + 1 ADD (`sys-postgres-wire`) |

Note on commit → first drive: the services maximum with the startup row included is 11 161 ms. It is the pre-join idx 3, in the same anomaly as both earlier runs. The same pre-join idx 3 affects 6 more tables, each with a single 3.7-11.3 s event.

### Holds and what each lane did next

There were no holds and no slot. Every presented vector was admitted. 440 of 450 waves answered success. The remaining 10 were:
- 7 startup waves at +0.05-0.3 s, each refused by the source group with `cdc_committed_acceptance_unknown` before the followers joined. Their idx 3 rows were then acknowledged through hydration, so no `source-held` record followed.
- 3 `provisional_coverage` waves for services: idx 292 and 299, around +11-16 s, during join.

## Concurrency

- **Peak:** 7 concurrent waves at +0.3 s, startup only. During the scenario the maximum in flight at admission was 3-5 per 10 s.
- **Cost:** concurrency does slow each wave. A 1-row wave takes p50 299 ms alone, 371 ms with 1 other, 495 ms with 2, 679 ms with 3 and 975 ms with 4-6. Source and target legs rise the same way.
- **Throughput:** the slowdown is roughly proportional to the number of overlapping waves. So the gain is that no lane waits for another, not more work per second.
- **End-to-end:** latency still fell 2-3× at p50 and 3-4× at the maximum, because lanes no longer queue behind each other.

## Event loop

- **The seed's event loop is saturated:**
  - With 10 ms resolution, the histogram recorded only p50 4 timer fires per one-second record. The samples themselves arrived every 1.17 s p50.
  - The mean delay per sample correlates at **0.83** with the time-averaged number of waves alive in that sample. By waves alive: 0 waves gives 40 ms, 1 wave 156 ms, 2 waves 330 ms, 3 waves 716 ms.
  - Correlation with admissions is 0.44 and with log lines 0.34.
- **The watchdog agrees:** its sync-section samples name `raft_follower_commit_apply_slice` (about 1.3-2.3 s per minute), `publication_recovery_gate_snapshot_build` (0.5-1.0 s per minute) and `storage_reservation_reconcile` (up to 391 ms per call). Its 4 in-run gaps report ELU 0.86-1.0.
- **Followers are idle by comparison** (mean about 1 ms above resolution).

## Errors and warnings that are not backpressure

1. **Seed, self-targeted replica ops failing with "Message not acknowledged":** 3 REMOVE (`replica_operations-p1` +50.5 s, `control_plane_publications-p1` +120.7 s, `sql_write_operations-p1` +126.7 s) and 1 ADD (`sys-postgres-wire`, +165.1 s).
   - At those moments the seed's mean loop delay was 258 / 268 / 311 / 775 ms, against a run median of 222 ms.
   - At +49.3 s, "Replica removal completed" came 0.7 s before "Operation failed". The work was done but the dispatch ACK was missed, which fits an ACK lost to a busy loop.
   - The correlation is plausible but not proven: there are 4 events, and they also happened in 9991 with the slot in place.
2. **Seed, 7 "Raft CDC command failed" plus 7 "Out-of-order CDC event" at +0.7 s.** They are pre-join, one per table. The earlier runs had 1 (partitions), because the slot serialised the others.
3. **Seed, 9 "Query execution failed: no such column: partition_id" on `logs-p1` at +168 s.** These are new and come from the harness's closing log query. They are not CDC and are unexplained.
4. **Followers:**
   - "Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)": 23 / 19. The peers see the seed slow.
   - "Wait bound spent" 26 / 22: mostly dynamic-config startup reads (16), `REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS` (13), the remaining SERVICE_RESPONSE grant after ACK (11) and delivery ACK (8).
5. **Unchanged from earlier runs:** "Bootstrap snapshot diverged" (5), WebSocket and reconnect noise (3), shutdown.

## Cause attribution

Nothing fails. The two residual g episodes of 9991 were slot waits of 3-5 s. Without the slot, the worst observed commit → remote receipt is 2.3 s and every lane's p90 is 0.85-1.7 s, so the cause-2 attribution holds.

## Is a node-wide bound on concurrent waves indicated?

**Not by this data.** I looked for each reason a bound might be needed:
- **Starvation:** none. There were 0 holds and 1 attempt per event, and every table's maximum commit → answer was 2.9 s or less.
- **Queue overflow:** none. There were 0 outbound rejections or preemptions on any node, and the commit waiters peaked at 6 of 1 000.
- **Memory growth:** none beyond the earlier runs. Seed RSS ended at 499 MB against 472-491 MB before, with heap at most 213 MB.

What the data does show is that the seed is CPU-bound: ELU about 1, 4 one-second gaps, and loop delay tracking concurrency. A bound would not add capacity. It would put back the queueing that this run removed. Concurrency stayed at 3 or less 96 % of the time.

## Unexplained

- Whether the seed's event-loop saturation is new or was already there with the slot. Earlier runs had no sampler, but their watchdog sync-section rates were similar (2-3 s per minute).
- Whether the self-targeted "Message not acknowledged" failures are caused by that saturation.
- The `logs-p1` `partition_id` query error.

## One more measurement

1. Run the same per-second event-loop sampler on the 9991 composition, where the slot is present. That shows whether wave concurrency created the seed's saturation or only revealed it.
2. Repeat `f3aa2f08` once. That shows whether PASS and the ≤2.3 s receipt tail are stable.
