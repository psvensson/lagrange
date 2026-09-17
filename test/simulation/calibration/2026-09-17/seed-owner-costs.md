# Seed owner costs during five-node cold formation (calibration run, 2026-09-17)

The replacement calibration run of `formation-calibration-run-2026-09-17`,
authorized after the F attribution frontier changed production's
formation-attribution semantics and the 2026-09-13 table was recorded as
historical evidence only. Same external scenario as that run: one fresh
five-node formation on GCP (one node per VM, `npm run health:formation -- --gcp`
with `LAGRANGE_FORMATION_ATTRIBUTION=1`, machine factor 3, 5 x n2-standard-4
in europe-central2-a) on head `73e8f8446`, seed version
0.2.5, booted `SRC_FINGERPRINT` `283c3683a7e7e760` (matched). The
formation formed and the schema was admitted (trend record: PASS, seed blocked
22145 ms of a 299550 ms demo window). The seed's attribution window
started at process start (05:51:45.441Z) and ended on its
210 s deadline (05:55:15.531Z); no signal reaches a GCP seed, so
the formed-mark figures below are the first 10 s snapshot at or after the
demo's formed mark (05:53:57.227Z) within the harvest's one-interval slack:
the snapshot taken at 05:54:02.907Z, 5.7 s after the mark, exactly as
`formationVerdict.attribution` harvested it (`source: snapshot`).
**Unattributed: 3.25 % of the window - the run counts.**

Every figure cites `seed-owner-costs.evidence.json` (the harvested buckets, the
complete deadline window, all 20 snapshots, artifact digests) and the committed
live report `seed-owner-costs.report.json` (sha256 `eeaa9b0f...eb2e43`).
The seed's sampling CPU profile (36,182,528 bytes, sha256 `030c7100...42f657e`)
sits in the run archive beside the node logs and is cited by digest; it
corroborates the buckets, it never replaces them.

What changed since 2026-09-13 is the ATTRIBUTION, not the scenario: the
protocol task tracker is handed its task inside the raft_protocol region, and
the seed pipeline's phase completion stays inside the bootstrap region. Turns
the old run measured as unattributed are measured as their owner here. No
figure below is compared with the old table as a target; the two were measured
under different semantics and the old lineage stays refused for correspondence.

## Per-owner cost, seed process start -> 05:54:02.907Z (formed mark + 5.7 s; 137,591 ms)

| owner | ms in window | share of window | dispatches | handoffs | mean us per turn segment | figure source |
| --- | --- | --- | --- | --- | --- | --- |
| raft_protocol | 52344.3 | 38.0 % | 4362293 | 329908 | 11.2 | evidence.json `harvested.owners[raft_protocol]` |
| rebalancer | 21246.3 | 15.4 % | 142385 | 3390 | 145.7 | evidence.json `harvested.owners[rebalancer]` |
| membership_publication | 19317.7 | 14.0 % | 383491 | 627 | 50.3 | evidence.json `harvested.owners[membership_publication]` |
| bootstrap | 9522.1 | 6.9 % | 225357 | 13 | 42.3 | evidence.json `harvested.owners[bootstrap]` |
| raft_apply | 7222.5 | 5.2 % | 0 | 22662 | 318.7 | evidence.json `harvested.owners[raft_apply]` |
| admin | 5407.8 | 3.9 % | 36877 | 198 | 145.9 | evidence.json `harvested.owners[admin]` |
| transport | 2847.9 | 2.1 % | 106210 | 31457 | 20.7 | evidence.json `harvested.owners[transport]` |
| readiness | 1394.5 | 1.0 % | 150 | 353 | 2772.3 | evidence.json `harvested.owners[readiness]` |
| worker_dispatch | 0.0 | 0.0 % | 0 | 0 | - | evidence.json `harvested.owners[worker_dispatch]` |

Partition of the window (evidence.json `harvested`): busy 123,772.0 ms
(90.0 %) = the nine owners above plus unattributed 4,468.9 ms (3.25 %,
`unattributedDurationUs`); idle 13,818.7 ms (10.0 %); `partitionDeltaUs` 0;
`overlapDurationUs` 0; 5,339,193 turns. "Dispatches" are turns that started
in the owner; "handoffs" are explicit owner entries inside another owner's
turn; a segment is either.

## The same owners over the complete deadline window (210,214 ms)

Cited from evidence.json `completeWindow.attribution`; the time after the
formed mark is schema admission, not formation, and is listed only so the
formation-window figures can be seen to be a prefix of a stable trend
(unattributed 2.88 %, idle 17,459 ms).

| owner | ms | dispatches |
| --- | --- | --- |
| raft_protocol | 82954.2 | 6784831 |
| rebalancer | 32709.2 | 203097 |
| membership_publication | 30530.8 | 595289 |
| bootstrap | 12631.3 | 286260 |
| raft_apply | 12599.8 | 0 |
| admin | 8206.3 | 52074 |
| transport | 5005.1 | 188304 |
| readiness | 2059.8 | 223 |
| worker_dispatch | 0.0 | 0 |

## What the snapshots show (evidence.json `snapshots`)

Unattributed stays between 2.69 % and 4.86 % in every 10 s snapshot from
14 s to 210 s, so the 10 % rule holds at every point, not only at the
mark. The first snapshot is bootstrap and raft_protocol; rebalancer and
membership_publication join raft_protocol as the owners that grow to the mark.

## Corroboration against the gap watchdog

Inside the demo window the event-loop gap watchdog logged 19 gaps totalling
35,449 ms, of which 22,145 ms were "unexplained" by its tagged synchronous
sections (evidence.json `seedGaps`; top tagged sites storage_reservation_reconcile 16,129 ms, raft_follower_commit_apply_slice 6,720 ms, publication_recovery_gate_snapshot_build 2,173 ms).
The two instruments disagree by construction: the watchdog attributes only
tagged synchronous sections, the seam attributes every event-loop turn to the
owner that dispatched it. The seam accounts for 100.0 % of the wall time.

## Standing: the current calibration

This lineage is the simulator's coefficient source
(`test/simulation/calibration/formation-seed-2026-09-17.json`,
`status: current_live_calibration`). Live and simulator now measure under the
same attribution semantics, which is the only reason the per-owner rates here
may be compared with the simulator's at all.
