# The simulator's production footprint: two read-only audits (2026-09-19)

The simulator is frozen (see the epic, "Simulator frozen"). These are the
file-by-file audits of what its quests put into `src/`.
- Both audits are by independent read-only auditors.
- The lead spot-checked the ranges and counts.
- Classes:
  - inert by construction: reachable only when a clock, random source,
    scheduler or seam is supplied, and production supplies none;
  - pinned;
  - pure refactor or clock-equivalent;
  - behaviour changed in production;
  - unclassified.
- A file nobody opened is unclassified, never inert.

## Audit 1: quest E (`formation-sim-production-replica-composition`)

- Range `3e52cd3a0..9c3595927`: 84 src files, every hunk read, 0 unclassified.
- The full account is the `evidence` finding on that quest's log.
- Production defaults are unchanged except the following:
  1. Remote Raft peers are `RemotePeerRepresentation` objects. The change
     is unconditional, and the new behaviour is pinned.
  2. The seed-hosted replica clock hand-down, on main from 35992c315 to
     595a3430e. It is repaired and pinned.
  3. The ServiceReconciler per-action yield, on main over the same window.
     It is repaired and pinned.
  4. The default diagnostic id of the node-local system-table cache.
  5. `NodeService` is captured once at construction in five owners.
  6. Registration and config-seed rows share one clock reading per call.
- Formation evidence from heads between 35992c315 and 595a3430e
  (2026-09-16 to 2026-09-19 08:56Z, including three nightlies) ran on the
  altered seed scheduling.

## Audit 2: the lineage outside E

- The audit was done at main 94e427713.
- The four commits named by audit 1 are confirmed:

  | commit | src files |
  | --- | --- |
  | 22420f874 | 27 |
  | ad913183d | 1 |
  | 6099852e3 | 1 |
  | 9a39af51b | 5 |

- **The auditor found the largest one was missing from that list:**
  **5da0d7348** (2026-09-15, 35 src files, +2300/-950).
  - Its subject is "rebalancer: remove safety reads the owner surface;
    narration keeps AVAILABLE".
  - Its paths match the recorded attempts of `formation-sim-calibrated`.
- Also found: the `formation-sim` quest's five commits of 2026-09-13
  (11 src files).
- Coverage: 67 distinct src files classified, 235 hunks read.
- Two attributions in audit 1 were corrected:
  - the cache's change-notification seam came in with 5da0d7348;
  - the reconcile queue's drain-scheduler option predates the whole
    lineage.

**Clock and seam work: inert in production** for all 67 files.
- Production never supplies a clock, random source, router id or scheduler.
- Every moved read resolves to the host clock, pinned by
  `test/time/time-source.test.js`.
- No compared pair changed clock domain in production, and no persisted
  stamp changed its source.
- One half-migrated domain exists, inert in production and live under a
  virtual clock.
  - `recentOperationIntents` stamps and checks `expiresAt` on the ambient
    clock.
  - Its prune reads the coordinator's clock.
  - This is the DT6 shape.

**Behaviour changed in production** (all from 5da0d7348 unless stated):
- **A. The AVAILABLE planning answer lost its async refresh.**
  - `getMembershipPublicationPlanningSnapshotBestEffort` used to race the
    sync answer against the async one under a 1000 ms deadline. It now
    returns the sync answer only.
  - The async resolve dropped its await and uses the memoized sync merge.
  - It is reached from two places:
    - node readiness evaluation;
    - startup authority health, which is the `node_ready_lease_incomplete`
      path.
  - `membershipPublicationPlanningSnapshotRefreshTimeoutMs` is now a dead
    option.
  - The commit says the change is deliberate.
  - Whether a test pins the new behaviour was not established.
- **B. The remove-safety read policy changed.**
  - Every priority-partition REMOVE-safety decision now reads the
    authoritative owner surface. That surface awaits a second async read.
  - A null answer defers the decision.
  - Narration for the publications partition dropped to AVAILABLE.
  - The effect is more IO and a fail-closed deferral on the spread's REMOVE
    leg.
- **C. Raft rejections are swallowed** (also ad913183d).
  - `RaftProtocolTaskTracker.track()` attaches a rejection handler to every
    inbound dispatch and every `promote()`.
  - Scratch-proven: a rejected promise passed through `track()` and
    discarded raises no `unhandledRejection`, where an untracked one raises
    one.
  - Production logs unhandled rejections at error level. An
    otherwise-unhandled Raft inbound fault now logs nothing.
  - No test pins either behaviour.
- **D. One extra microtask between startup phases** (6099852e3). The effect
  is negligible.

**Unclassified, not opened:**
- 1861c1b76 formation-calibration-run. It has 16 src files of attribution
  seams, including `lagrange-runtime-startup.js`,
  `message-router-inbound-dispatch.js` and `replica-worker-manager*.js`.
- 84fef212c (5 cdc files).
- 9bf8bc0df.

**Standing of A, B and C.**
- They are product behaviour that reached main under a simulator quest
  whose terminal state is superseded.
- No record of an independent verification of that delta was found.
- The second failure mechanism is older than 5da0d7348: the nightly of
  2026-09-13 shows it. So A did not cause it. Whether A aggravates it is
  not known.

## Pins

All seven pins proposed by audit 1 are true on main today. P1 is
scratch-proven; the rest were established by reading.

In `test/bootstrap/production-scheduling-defaults.test.js`:
- P1: a production node runtime's cache notifies on `setImmediate`.
- P2: a seed-hosted message-group replica's consensus stays on tick-tock.
- P3: a production seed hands out no clock, randomness or router factory.
- P4: the bootstrap shutdown turn is `setImmediate`.
- P5: a differential. The seed's CDC service arms the same primitives with
  and without the node's resolved clock.
- P6: a production router runs on the host clock and the process-global
  in-process environment.

In `test/raft/remote-peer-representation.test.js`:
- P7: `leave()` of a joined peer arms no host timer and draws no
  `Math.random`.

New from audit 2:
- P8: a rejected inbound Raft dispatch that the caller discards must
  surface, either logged or left unhandled. Whichever the owner chooses,
  pin it.
- P9: a default UnifiedRebalancer arms its timers through
  `globalThis.setTimeout` and draws its jitter from `Math.random`.
- P10: the three `recentOperationIntents` sites read one clock. This is red
  today under a virtual clock.

## What closing the freeze still needs

1. A hunk read of the three unclassified commits.
2. A retrospective independent verification of 5da0d7348's items A, B and C
   as product changes. The model is the retrospective verification of E on
   2026-09-18.
3. The pins.
4. The owner's decision on C: swallowed Raft rejections, or a logged
   surface.
