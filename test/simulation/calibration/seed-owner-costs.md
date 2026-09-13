# Seed owner costs during five-node cold formation (calibration run, 2026-09-13)

The single authorized calibration run of `formation-calibration-run`: one fresh
five-node formation on GCP (one node per VM, `npm run health:formation -- --gcp`
with `LAGRANGE_FORMATION_ATTRIBUTION=1`, machine factor 3) on head `8a6275a4d`,
seed version 0.2.5, booted `SRC_FINGERPRINT` `8f4ebe842cff5176` (matched). The
formation formed and the schema was admitted (trend record: PASS, seed blocked
63127 ms of a 340473 ms demo window). The seed's attribution window started at
process start (10:38:58.851Z) and ended on its 210 s deadline (10:42:31.501Z);
no signal reaches a GCP seed, so the formed-mark figures below are the first
10 s snapshot at or after the demo's formed mark (10:41:26.637Z) within the
harvest's one-interval slack: the snapshot taken at 10:41:30.824Z, 4.2 s
after the mark, exactly as `formationVerdict.attribution` harvested it
(`source: snapshot`). **Unattributed: 3.50 % of the window - the run counts.**

Every figure cites `seed-owner-costs.evidence.json` (the harvested buckets, the
complete deadline window, all 18 snapshots, artifact digests) and the committed
live report `seed-owner-costs.report.json` (sha256
`97f38aa5…50eda1`). The seed's sampling CPU profile (four inspector chunks,
38 709 760 bytes, sha256 `f72ea3b0…9ec9faa`) sits in the run archive beside
the node logs and is cited by digest; it corroborates the buckets, it never
replaces them.

## Per-owner cost, seed process start → 10:41:30.8 (formed mark + 4.2 s; 152 097 ms)

| owner | ms in window | share of window | dispatches | handoffs | mean µs per turn segment | figure source |
| --- | --- | --- | --- | --- | --- | --- |
| raft_protocol | 49830.5 | 32.8 % | 3123519 | 307765 | 14.5 | evidence.json `harvested.owners[raft_protocol]` |
| rebalancer | 37900.1 | 24.9 % | 336484 | 3747 | 111.4 | evidence.json `harvested.owners[rebalancer]` |
| membership_publication | 23615.6 | 15.5 % | 413850 | 882 | 56.9 | evidence.json `harvested.owners[membership_publication]` |
| bootstrap | 8962.1 | 5.9 % | 218890 | 13 | 40.9 | evidence.json `harvested.owners[bootstrap]` |
| raft_apply | 7843.1 | 5.2 % | 0 | 24680 | 317.8 | evidence.json `harvested.owners[raft_apply]` |
| admin | 3168.8 | 2.1 % | 45363 | 147 | 69.6 | evidence.json `harvested.owners[admin]` |
| transport | 2562.0 | 1.7 % | 104199 | 28045 | 19.4 | evidence.json `harvested.owners[transport]` |
| readiness | 620.4 | 0.4 % | 80 | 250 | 1880 | evidence.json `harvested.owners[readiness]` |
| worker_dispatch | 0.0 | 0.0 % | 0 | 0 | - | evidence.json `harvested.owners[worker_dispatch]` |

Partition of the window (evidence.json `harvested`): busy 139 821.5 ms
(91.9 %) = the nine owners above plus unattributed 5 318.9 ms (3.50 %,
`unattributedDurationUs`); idle 12 275.6 ms (8.1 %); `partitionDeltaUs` 0;
4 331 658 turns. "Dispatches" are turns that started in the owner; "handoffs"
are explicit owner entries inside another owner's turn; a segment is either.

## The same owners over the complete deadline window (212 774 ms)

Cited from evidence.json `completeWindow.attribution`; the 60 s after the
formed mark are schema admission, not formation, and are listed only so the
formation-window figures can be seen to be a prefix of a stable trend
(unattributed 3.31 %, idle 14 508 ms).

| owner | ms | dispatches |
| --- | --- | --- |
| raft_protocol | 72138.4 | 4545126 |
| rebalancer | 48281.5 | 398029 |
| membership_publication | 33001.6 | 574622 |
| bootstrap | 12771.7 | 296864 |
| raft_apply | 11908.4 | 0 |
| admin | 7437.3 | 81871 |
| transport | 4225.7 | 172860 |
| readiness | 1457.8 | 164 |
| worker_dispatch | 0.0 | 0 |

## What the snapshots show (evidence.json `snapshots`)

Unattributed stays between 2.7 % and 5.0 % in every 10 s snapshot from 13 s
to 206 s, so the 10 % rule holds at every point, not only at the mark. The
first 23 s are bootstrap and raft_protocol; from 35 s on, rebalancer and
membership_publication join raft_protocol as the three owners that grow
linearly to the mark (over the 63 s before the harvested snapshot:
raft_protocol +3.9 s per 10 s, rebalancer +2.4 s, membership_publication
+1.0 s).

## Corroboration against the gap watchdog

Inside the same window the event-loop gap watchdog logged 29 gaps totalling
78 831 ms, of which 63 727 ms were "unexplained" by its tagged synchronous
sections (evidence.json `seedGaps` for the demo window; the in-window census
is in the quest log). The two instruments disagree by construction: the
watchdog attributes only tagged synchronous sections, the seam attributes
every event-loop turn to the owner that dispatched it. The seam accounts for
96.5 % of the wall time, so the watchdog's "unexplained" 63.7 s is, by owner,
predominantly raft_protocol, rebalancer and membership_publication turns.

## Ranked mechanism list for the fix (input to formation-sim)

1. **raft_protocol, 32.8 %**: 3.1 M dispatched turns at 14.5 µs each. The cost
   is volume, not per-turn weight: every system-table replica's Raft group has
   its leader on the seed, and heartbeat/append traffic scales with the
   number of groups times the peer count. The simulator's coefficient is the
   per-segment cost with the segment rate driven by group count and peers.
2. **rebalancer, 24.9 %**: 336 k turns at 111 µs; planning cycles and
   operation dispatch (including the replica-dispatch queues charged here).
   Per-turn weight is high and the rate tracks membership events, so both a
   rate and a weight coefficient are needed.
3. **membership_publication, 15.5 %**: 414 k turns at 57 µs; publication
   reconcile plus the ready-node advance queue.
4. **bootstrap, 5.9 %** (front-loaded: 2.1 s of the first 13 s), then
   **raft_apply, 5.2 %** (24.7 k handoffs at 318 µs: the heaviest segment of
   all, the follower commit-apply slice), **admin 2.1 %**, **transport
   1.7 %**, **readiness 0.4 %** (330 segments at 1.9 ms: rare and heavy).
5. **worker_dispatch: no dispatch at all.** On this deployment no execution
   pool call reached the seed's main thread during formation; the owner's
   coefficient is zero for the simulator, and the row stays so the table
   covers the contract.

Idle time (8.1 %) is the seed's headroom during formation; the watchdog's
65 s of blocked time is therefore not idleness but owner work, and the fix
targets the top three owners' turn rates before their per-turn weight.
