---
audience: evidence
recorded: 2026-11-14
quest: cdc-propagation-node-slot-removal
---

# Seed CPU profile during formation (47bf432f)

This is one journey run on tv-dator. It measures; it does not judge acceptance.

Each claim is marked:
- **[V]** verified: read directly from the profile, the logs or the code.
- **[I]** inferred.

## Route and outcome

| item | value |
|---|---|
| measurement head | `measure/slot-removal-20261114` = `47bf432fd2d3218d3115867915d26d2810229e5b`. It is `f3aa2f08` plus one commit that adds `src/diagnostics/formation-cpu-profile.js` and wires it into `src/index.js`. It is throwaway and never pushed. |
| sanity | job `64181e54-b6f8-404a-8c55-2ebb956a06a2`, adams-gamla: COMPLETE, exit 0, 86.4 s. 12/12 files and 224 assertions passed. |
| journey | job `6bae35c4-b72e-45ca-b891-a621b61e3953`, tv-dator: COMPLETE, exit 0, 258.9 s. It waited about 12 minutes in the local queue first. **Scenario PASS** (all predicates a-g and observation-integrity met), duration 191.8 s. |
| transport | Tree `268c638dc7ef` travelled as transport commit `6d8bae4d7289758154d8ae25fcd3492e4d5e5890`. The product fingerprint in the raw log is `ddb.git-hash=6d8bae4d7289`; it maps to `47bf432f` through `job.json` (commit, tree, transportCommit). |
| evidence | `journey/measure-prof-47bf432f/evidence.tar.gz` is 7.1 MB (the unpacked evidence is 47 MB). The seed's full log is 3.6 MB gz, of which the profile is 3.08 MB gz. |
| raw profile kept | Seed only: `journey/analysis/prof-run/profiles/4ff798f8-03c1-4121-8e81-1bec845de948.cpuprofile.gz`. It is 3.08 MB gz (29.7 MB JSON), with 135 273 samples and 127 697 nodes. |
| joiner profiles | **None.** The stop timer was set at T+170 s after each process started. The joiners started 29 s after the seed and were stopped by teardown at T+164 s, so they never reduced or wrote a profile. This is a flaw in my design: the timer should have been tied to the seed's or the scenario's clock. Nothing was dropped for size. |

## Profiler overhead [V]

| seed | f3aa2f08 (no profiler) | 47bf432f (profiler) |
|---|---|---|
| event-loop delay, mean per sample, p50 / p90 / max | 222 / 582 / 989 ms | 150 / 425 / **5 098** ms |
| event-loop delay, max per sample, p50 / p90 / max | 370 / 716 / 1 449 ms | 305 / 586 / **5 100** ms |
| samples with a max above 100 ms | 126 / 139 | 124 / 136 |
| "Event loop gap" (over 1 s) | 5 (1 at startup, 4 during the run) | 2: 2 104 ms at startup, and **4 977 ms at 13:22:28** |
| RSS start → end; heap max | 353 → 499 MB; 213 MB | 364 → **686** MB; **371** MB |
| joiners, mean per sample p50 | 11 ms | 12 / 13 ms |

- **Sampling overhead:** the 1 ms sampling did not raise the steady delay. This run's seed was even a little lower than in f3aa2f08, which is within run-to-run variance [I].
- **End-of-profile stall:** the 4 977 ms gap is **my own reduction** at T+170 s (stop at 13:22:24; stringify, gzip and base64 of a 29.7 MB profile, plus the tree walks). The RSS jump to 686 MB comes from the same work [V by timing; I by cause]. It fell about 20 s before the scenario ended, and the scenario still passed.

## Where the seed's time goes [V]

- **Sampled:** 169.0 s, of which 163.0 s were busy and only 6.0 s idle (**96.5 % busy**).
- **Fixed costs:** garbage collection 14.9 s (9.1 % of busy); `(program)` 0.75 s (0.5 %).
- **From window 4 (+40 s) to the end, every 10 s window is 99-100 % busy.** Windows 0-3 were 69-94 % busy.

### Top ten by self time, with their callers

| # | function (self) | self ms | % busy | dominant caller chain |
|---|---|---|---|---|
| 1 | better-sqlite3 `prepare` (wrappers.js:4) | 25 374 | 15.6 | `readSnapshotIndexIn` ← `syncCompactedStorage` ← `ensureExecution` (8.7 s); `reservationOfPeerId` / `reservationFor` ← peer-identity resolution in status shaping and `deliverToPeer` (≈ 10.8 s) |
| 2 | (garbage collector) | 14 873 | 9.1 | - |
| 3 | better-sqlite3 `sqliteTransaction` | 9 315 | 5.7 | `commitDurably` ← `persistReady` ← `processReadyCycle` ← `drainReady` ← `stepOneInbound` (4.9 s) or `settlePrimitiveInvocation` (2.0 s) |
| 4 | `reservationOfPeerId` (raft-rs-peer-identity.js:174) | 5 029 | 3.1 | `resolveReplicaIdentity` ← `resolvePeerIdentity` / `resolvePeerAddress` ← `resolvePeerObservation` ← `peerSnapshot` / `followerProgressSnapshot` ← `shapeGroupObservation` |
| 5 | `readSnapshotIndexIn` (raft-rs-snapshot-witness.js:102) | 4 381 | 2.7 | `syncCompactedStorage` ← `ensureExecution` ← `perform` (ticks, commands) and `readStatusUndrained` |
| 6 | `deepFreeze` (raft-operation-port.js:30) | 3 535 | 2.2 | `shapeGroupObservation` ← `readGroupStatus` ← `readStatusUndrained` |
| 7 | `executeLocalQuery` | 2 513 | 1.5 | `executeSystemTableRead` ← authoritative system-table reads |
| 8 | `reservationFor` (raft-rs-peer-identity.js:164) | 2 048 | 1.3 | `committedNodeIdOf` ← `resolvePeerAddress` (status shaping, `deliverToPeer`) |
| 9 | `copyStrictOwnDataRecord` | 1 986 | 1.2 | `extractApplicationPayload` (transport ingress); membership-publication priority summaries |
| 10 | `fastJsonClone` | 1 858 | 1.1 | `deepClone` ← cache `get` ← `collectKnownMessageGroupDomain` / `observedServiceRoute` ← `buildSafeTargets` ← `captureDurablePropagationPlan` (the CDC currentness check) |

### Inclusive roots

| root | % of busy |
|---|---|
| raft code on the stack | 52.2 |
| `src/partition` | 35.1 |
| SQLite | 26.6 |
| router / transport | 21.0 |
| readiness / planning / projection | 19.0 |
| message group | 14.3 |
| CDC wave (`topology/cdc-group-propagation*`) | 7.5 |
| system-table cache | 4.7 |
| routing-plan capture | 3.0 |
| clone / copy | 1.2 |
| `applyCDCBatch` | 1.1 |
| logging | 0.8 |
| pressure governor | 0.4 |

JSON parse and stringify do not appear as frames of their own: they are inlined or counted as native [V: no match].

### Work types (each sample assigned to the first matching class) [V, by my classification rules]

| class | ms | % busy | kind |
|---|---|---|---|
| raft protocol: ticks, inbound drain, persist, status | 40 302 | 24.7 | periodic (ticks 18.4 s = 11.3 %) plus per message |
| CDC lane and propagation wave | 27 079 | 16.6 | per wave. **22.5 s of it is the currentness check alone, see cost 1** |
| readiness, planning and publication (control plane, rebalancer) | 26 266 | 16.1 | periodic |
| CDC receive and apply (coalesced mutation, authoritative read flow, cache observers) | 24 757 | 15.2 | per event and per reconciliation |
| GC | 14 873 | 9.1 | - |
| partition writes and apply | 12 874 | 7.9 | per write |
| authoritative reads and remote queries | 4 232 | 2.6 | periodic and per request |
| transport / router | 4 014 | 2.5 | per message |
| admin websocket | 1 458 | 0.9 | - |
| logging | 1 104 | 0.7 | - |
| my diagnostics, profiler excluded | 377 | 0.2 | - |
| other | 3 058 | 1.9 | - |

The per-10-s split is in `prof-run/classify.txt`. After +40 s, the CDC lane and readiness classes each take 1.5-2.6 s per window, and raft takes 1.4-3.4 s per window.

Split by kind [I, from the classes above]:
- **Per wave and per event:** about 40 % of busy time.
- **Periodic:** about 45 %. This is raft ticks and status, readiness and planning, and authoritative reconciliation reads.
- **Logging:** under 1 %.
- **GC:** 9 %.

## The three largest reducible costs

They overlap, because one sample can carry several. The union of the first three plus peer identity is **47.8 s = 29.3 % of busy** [V, `prof-run/union.txt`].

### 1. The CDC currentness check re-derives leader selection and the routing plan on every `assertCurrent`: 22.5 s, 13.8 % [V]

- **Chain:** `assertCurrent` (cdc-delivery-invocation.js:83) → `cdcProgressCurrent` (partition-cdc-obligation-progress.js:43) → `topologyBindingCurrent` (:32). That in turn:
  - calls `branch.original.getCDCPropagationService()` (partition-cdc-propagation-subscriber.js:283) → `resolveOperationalMessageGroupSelection` → `selectOperationalLeader` → `getMetadataIngressReadiness` → `isCurrentRaftLeader` → `readCoreStatus` (message-group-service-leadership-state-runtime-methods.js:9) → a full `raft.readStatus()`. **16.6 s.**
  - calls `cdcPropagationProgressCurrent` (cdc-propagation-progress.js:142) → `captureDurablePropagationPlan` → `buildSafeTargets`. This scans the cache and deep-clones `message_groups`, `services` and `latency_groups` rows through `fastJsonClone`. **5.1 s.**
- **Why it is paid:**
  - `isCurrentRaftLeader` needs only the role, but `readStatus()` shapes the whole group observation. That means every peer's identity through two SQLite lookups per peer, `syncCompactedStorage`, and a `deepFreeze` of the result [V, code and profile].
  - The routing plan is recomputed from the cache on every check [V]. The cache rows it reads did not change between checks inside one wave [I].
- **Size:** 321 waves in the run, so about **70 ms per wave** [I: the sampler cannot count calls].
- **Saving if paid once per wave or per leadership change:** up to 22.5 s, 13.8 % [I]. About 8.5 s of this overlaps cost 2.

### 2. Every `db.prepare` call compiles its statement again (no prepared-statement reuse): 25.4 s, 15.6 % self [V]

- **Locations:**
  - `readSnapshotIndexIn`, raft-rs-snapshot-witness.js:106/:109: two statements per call. One counts the snapshot table in `sqlite_master`, the other selects the index.
  - `reservationOfPeerId` and `reservationFor`, raft-rs-peer-identity.js:164/:174.
  - Smaller users: partition statement admission, committed-statement outcome, durable store.
- **Why it is paid:** each call compiles the same SQL text again [V, code]. better-sqlite3 does not cache statements [I: library behaviour, not checked in this tree].
- **Saving if prepared once:** most of the 25.4 s. The `.get` execution remains, for example the 4.4 s self of `readSnapshotIndexIn` [I].

### 3. The snapshot-index check on every raft turn and status read (`syncCompactedStorage`, raft-rs-runtime-owner.js:1020, called from `ensureExecution` :1057): 13.1 s, 8.1 % [V]

- **Why it is paid:**
  - Every `perform` (all tick timers: 18.4 s of entries from raft-rs-operation-port.js:438) and every `readStatusUndrained` reads the durable snapshot index. That is two SQL statements, each prepared again.
  - It only does anything when the index has advanced past `compactedSnapshotIndex`. That happens on compaction, not on every tick [V, code].
  - 138 groups on the seed [V, log count].
- **Saving if it ran only after a compaction:** about 13 s [I]. 8.7 s of this overlaps cost 2.

### Next largest

Peer-identity resolution in status shaping (`resolveReplicaIdentity`, raft-rs-peer-identity.js:345) costs 19.9 s in total, 12.2 %. It reads an append-only map [V, code comment] once per peer, per status read and per `deliverToPeer`.

## Seed versus joiner

There is no joiner profile (see Route and outcome).
- **Event-loop sampler:** joiner mean delay is about 12-13 ms per sample (about 2-3 ms above the 10 ms resolution), with maximum per sample p50 43-72 ms. The seed is at 150 / 305 ms [V].
- **Earlier run:** in f3aa2f08 the watchdog sync-section on the joiners named almost only `raft_follower_commit_apply_slice` [V].
- **Reading:** a joiner leads no system partition, so it runs no CDC lane, no currentness checks and no leader-side status reads [I].

## What the profile cannot attribute

- How many times each function is called: a sampler gives time, not call counts. The "per wave" figures are time divided by wave count [I].
- 26.4 s (16.2 %) of self time is native or VM (`url` empty: GC, `writev`, `decodeUTF8`, `runMicrotasks`). It is attributed through its callers, not by itself.
- 7.1 s of self time inside raft-rs WASM (`wasm-function[n]`) has no symbols.
- The first 1.1 s of the process before the profile started, and everything after T+170 s.
- The joiners.

## Files

- `journey/analysis/prof-run/`:
  - `extract.txt`: the in-process summary, top self and inclusive functions, files and directories, callers, and 10-second windows.
  - `classify.txt`, `union.txt`, `callers1.txt`, `descend-*.txt`, `entry-*.txt`, `outer-*.txt`.
  - `profiles/` (seed `.cpuprofile.gz`) and `logs/`.
- Scripts in `journey/analysis/`: `prof_extract.py`, `prof_callers.py`, `prof_descend.py`, `prof_entry.py`, `prof_outermost.py`, `prof_classify.py`, `prof_union.py`, `loop_compare.py`.
