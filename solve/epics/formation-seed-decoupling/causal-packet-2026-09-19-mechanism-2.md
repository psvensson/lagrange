# Causal packet, mechanism 2 (2026-09-19): the admission observer cannot obtain a usable control snapshot

Second packet, companion to [causal-packet-2026-09-18.md](causal-packet-2026-09-18.md)
and its [addendum](causal-packet-2026-09-19-addendum.md). This was a
read-only investigation; no behaviour was changed. Times are seconds from
`formationVerdict.window.startMs`.

## The pair

Runs 3 and 4 of the guard-inputs series were both local five-process
formations on the same lab machine with the same code. Neither run had a
single promotion count-check refusal, which isolates this mechanism from the
first.

| | verdict | observer observations | `observation_unavailable` |
| --- | --- | --- | --- |
| run 3 | FAIL | 55 | 53 |
| run 4 | PASS (quiescent at +153.5) | 71 | 1 |

In the FAIL run the seed is node-0 and the victim is node-1.

## The observer and the server side

- **What the driver polls.**
  - The demo driver polls the seed every 2 s.
  - Each poll opens a new admin websocket (`lane=snapshot`) and runs
    `SELECT * FROM control_snapshot_local()`.
  - When the row says `snapshotObservation.state === 'stale_usable'`, the
    driver re-queries with `control_snapshot_local(true)`, the forced repair
    (`examples/service-data-affinity/affinity-demo-preload-gate.js:328-376`).
  - Only `fresh` counts as usable.
- **Two labels, one failure.** `observation_unavailable` and
  `control_plane_pressure` are the same failure slot, classified by the
  wording of the error text
  (`src/diagnostics/control-plane-quiescence-snapshot.js:98-121, 406-458`).
  They are not two mechanisms.
- **`cache_stale_watermark` is not a timestamp and not about the cache.**
  `resolveControlSnapshotCacheStaleWatermark`
  (`src/admin/admin-control-snapshot-control-plane-diagnostics.js:413-458`)
  returns true for the first `nodes` row that is active or ready and whose
  `ready_lease_expires_at` has passed (`src/node/node-readiness-policy.js:151-170`).
- **The repair trigger.**
  - That boolean becomes the repair trigger.
  - It selects the default nine-table authoritative repair, with `nodes`
    read first.
  - The read is an owner-RPC-required, leader-required, complete-table read
    routed on the `controlPlaneRecoveryEligible` readiness dimension.
  - When that read carries no valid leader witness, it reports
    `authoritative_observation_read_incomplete`.
- **No repair can clear it.**
  - After a repair the same evaluation runs again on the repaired snapshot
    (`src/control-plane/control-plane-snapshot-owner.js:202-234`).
  - The trigger is a fact about the cluster (a node's lease lapsed), not
    about the cache, so the snapshot stays `stale_usable`.
  - 27 of 28 successful repairs in the FAIL run reported
    `repairedRowCount: 0`; the cache was never wrong.
- **The producer that would clear it never landed a write.** The per-node
  heartbeat rewrites `nodes.ready_lease_expires_at`. In the FAIL run it ran
  every 5 s and no write landed for 178 s.

## Timeline, FAIL run

| t | node | event |
| --- | --- | --- |
| +26.1 | n1 | last successful heartbeat write; lease expiry set to +41.1 |
| +29.9 to +42.5 | n0 | the run's only event-loop gaps (6.4 s total) |
| +32.0 | n1 | first distributed write failure (query timeout 2500 ms) |
| **+34.09** | n1 | n1's readiness record for the seed is stamped and never changes again for 173 s |
| +34.14 | n1 | first `Partition routing candidates filtered by readiness`: all services filtered on `controlPlaneRecoveryEligible`, routable 0 of 3, the seed denied for `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` and `planning_snapshot_refresh_pending` |
| +36.4 / +37.4 | n1 | first `nodes-p1` denial, then first `nodes-p1` write failure (`DISTRIBUTED_PARTICIPANT_FAILURE`) |
| +37.7 | driver | last usable observation |
| **+41.1** | - | n1's ready lease expires and is never renewed |
| +42.8 | n0 | first authoritative nine-table repairs of the run |
| **+42.9** | driver | first `observation_unavailable`; every one of the remaining 53 observations is the same |
| +45.9 on | n0 | `Skipped lease disconnect for transport-connected node` for n1 every 5 s (33 times) |
| +51.0 on | n1 | `Heartbeat failing repeatedly` (stage register, participant failures), reaching 38 consecutive |
| +59.2 on | n0 | repair failures `nodes:authoritative_observation_read_incomplete` (25 of 53 repairs) |
| +209.9 | driver | wait ends; witness: n1 `active`, `ready`, lease 166 s past expiry |

The PASS run shows none of this:
- no heartbeat failures;
- three repairs in the whole run;
- final witness `no_stale_active_node`.

## First divergence and the wrong arrows

A node stays `status=active, connection_state=ready` in the `nodes` table
while its ready lease lapses. Its heartbeat write to `nodes-p1` is filtered
out by `controlPlaneRecoveryEligible` routing, and the seed's lease sweeper
declines to reconcile the row while the transport is up. Three boundaries
compose into the trap.

**A. A cluster-liveness fact is routed into a cache-freshness contract.**
- "Some active node's lease lapsed" is answered with "repair the cache",
  which can never clear it.
- What is missing is a distinct observation state for that fact. The
  admission observer could then reason about it and would not be blinded.

**B. The lease-disconnect grace is unbounded.**
- `LeaseService.sweepExpiredLeases` (`src/control-plane/lease-service.js:185-214`)
  skips a transport-connected node with no time bound.
- The sibling grace in the publication projection is bounded at 60 s
  (`src/control-plane/active-node-projection.js:290-302`).
- So `{active, ready, lease 166 s expired}` is a stable state.

**C. A deferred readiness snapshot presents inherited evidence as a current
verdict, and the refresh path is gated by the verdict it would refresh.**
- When the planning owner cannot serve an admitted record, it returns a
  deferred snapshot
  (`src/control-plane/readiness-planning-publication-contract.js:354-396`).
- That snapshot forces every dimension false, inherits the previous reason
  set, and carries the old `observedAt` over verbatim.
- The reuse fuse is the 30 s live-evidence veto
  (`clusterMemberStaleHeartbeatMaxAgeMs`). After it expires, every read is
  deferred until a new build is admitted.
- The routing layer never checks the age of what it trusts: `observedAt`
  reaches diagnostics only.
- The authoritative evidence-repair read sets
  `allowReadinessAuthoritativeRefresh: false`
  (`src/control-plane/authoritative-control-plane-view.js:370-375`) while
  routing on the same dimension. The read that would repair the record goes
  through the filter it is trying to repair.
- The stored-snapshot bridge cannot help on the recovery lane either.
- The system-table leader fail-open exists for exactly this case
  (`src/query/query-executor-partition-routing-snapshot.js:78-99`).
  - It admits the canonical leader only when every denial reason is
    evidence-absent.
  - The inherited `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` is not such a
    reason, so a stale record disqualifies itself from the fail-open that
    exists for stale records.

## Competing explanations

| explanation | verdict |
| --- | --- |
| seed too busy | falsified as the cause, kept as a plausible trigger: the only gaps end at +42.5 and all 53 failed observations fall in the 165 quiet seconds after |
| `nodes` partition lost its leader or moved | falsified: the seed leads `nodes-p1` from +9.9 until teardown, `leaderKnown: true` throughout, and no replica is removed |
| authoritative read denied by recovery-eligible routing | **confirmed**: the seed's own `nodes-p1` reads are denied 30 times, each followed within a second by a repair failure |
| a cache watermark that stops advancing | falsified as stated: the watermark is the lease predicate above, not a timestamp |
| admin connection churn | an effect, not a cause: the second socket per poll is the forced-repair query |
| the repair times out | falsified: all 25 failures carry only `authoritative_observation_read_incomplete`, with local transport ready |
| an artefact of five local processes | falsified: the GCP nightlies share it (below) |

## GCP shares it

| nightly | verdict | `Heartbeat failing repeatedly` | final witness |
| --- | --- | --- | --- |
| 34735728337 | FAIL | 42 | stale active node |
| 35052200699 | FAIL | 4 | stale active node |
| 35303538995 | FAIL | 23 | websocket timeout, witness unavailable |
| 35418756637 | FAIL | 16 | websocket timeout, witness unavailable |
| 34803119771, 34925405521, 35178550079 | PASS | 0, 0, 0 | `no_stale_active_node` |

I re-counted the heartbeat lines in a spot check and they match. In the 18
interleaved local runs of 2026-09-19 the separation is strong but not
perfect:
- 13 of the 15 failures show repeated heartbeat failures.
- The 3 passes show 0, 0 and 2.
- Both failures without them are on the slowest 8-thread laptop, and one of
  those was a starved seed.
- Machines of that class have additional failure modes, and their runs
  should not be pooled with the others.

## Not demonstrated

1. Which of three silent conditions stops builds being admitted on the
   victim:
   - transport topology invalid;
   - planning identity saturated;
   - every build refused as not current.
   Two others were eliminated with data: queue drops, and
   planning-source-observer failure. All three remaining conditions are
   unobservable by construction, and that is itself the finding.
2. Why the seed stays `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` for the whole
   FAIL run and clears at about +68 in the PASS run.
   - A ring through n1's stuck `replica_operations-p1` learner is plausible
     but untraced.
   - It may connect this mechanism to the first one.
3. Whether the seed's early gaps are necessary for the freeze.
4. Sub-second seed blocking (the watchdog threshold is 1 s).

## Observability that would close the gaps (no behaviour change)

1. Log the planning owner's admission verdict once per transition: which
   term failed, and for how long the record has been deferred.
2. Carry `observedAgeMs` beside `observedAt` in the routing denial, and flag
   a deferred record.
3. Log the control-snapshot watermark decision with the node and its lease
   age (the admin control snapshot has no logger today).
4. Distinguish "filtered by readiness" from "Partition service not found" in
   the error the caller sees.
5. Log the lease-disconnect skip with the lease age and whether a bounded
   grace would have been exceeded.
6. Carry the ready-lease witness on every observer transition, not only on
   the final snapshot.

Nothing here argues for raising a timeout, retry count, budget or window.
The 30 s veto is not a budget to raise. The defect is that expiry yields a
confident denial carrying a stale timestamp rather than an explicit
"unknown", and that the refresh path is gated by the verdict it would
refresh.
