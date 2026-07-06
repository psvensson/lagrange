# Verify the model's lever against run-6's binding observable

Read-only. Purpose: before implementing the TLA+ model's (`dc141f50`) identified
lever — *make a fresh leader's re-plan idempotent w.r.t. an in-flight self-move
across a leadership flap* — confirm it maps to the **binding** wedge in run-6.
Per the standing E-cheap lesson (`96a0917f` revert): a DT-green lever on an
injected mock is not proof it moves the live binding observable. This trace
re-checks the live evidence FIRST.

Logs: `data/examples/service-data-affinity-demo/node-{0..4}.log` (run-6, boot
07:00:07→07:06:01Z, `bootedSrcFingerprint 201451d7c9053d76`). Same run the model
was authored from (`diagnose-run6-demo-stall.md`).

## TL;DR verdict — the model modeled a SECONDARY seam, not the binding one

**The idempotent-replan-across-flap lever does NOT target the wedge that kills
[2/4].** The binding 152s dead window (07:03:20→07:05:52) is a **self-referential
ledger-persistence quorum deadlock under STABLE leadership**, not a flap-driven
re-mint livelock. Implementing the model's lever would repeat the E-cheap
wrong-leg mistake.

## What the live binding wedge actually is

The dead window's stuck operation is a single REPLACE self-move on the ledger
partition:

- `op=a2950214-b92d-4a3d-87a4-85099ff27210`, `REPLACE replica_operations-p1 →
  4e1551aa`, created 07:03:23.786 on node 82b7bf0d.
- For ~2 minutes it repeatedly **fails to persist its own workflow progress**:
  `msg="Failed to update system table row"` / `"Failed to persist operation"` /
  `"Failed to insert system table row"`, every one with
  `reason="Distributed operation failed due to participant failures"`,
  `table=replica_operations`. Sample timestamps: 07:04:08.605, 07:04:23.34,
  07:04:26.29, 07:05:07.70, 07:05:22.37, 07:05:36.77, 07:05:51.56.
- It completes only at 07:05:52.75 (`"Operation completed"`) — right after
  leadership moves to the target node **4e1551aa** (term 22).

Mechanism: moving a `replica_operations-p1` voter degrades the quorum of the
**replica_operations** table — the very table where every operation (including
this self-move) writes its progress. So the self-move disrupts its own progress
writes. Same signature as the sibling quest
`formation-ledger-leader-local-persistence-wedge` (run-23:
`DISTRIBUTED_PARTICIPANT_FAILURE … firstFailedParticipant replica_operations-p1
Query timeout`).

## Why this refutes the flap/re-mint framing

| Model abstraction | Live run-6 reality |
| --- | --- |
| `Flap` (leadership re-election) drives the livelock | Leadership on `replica_operations-p1` is **STABLE** (rebalancer leader 82b7bf0d, liferaft **term 2**) from 07:00:55 to 07:05:35. The dense REPLACE thrash (r4/r5/r2, 07:01:18→07:03:20) and the 152s freeze both occur **inside** that stable window. |
| Flap resets progress → fresh leader **RE-MINTS** the self-move | Only **4** `replica_operations-p1` REPLACE creates in the whole run (07:00:38, 07:00:58, 07:02:48, 07:03:23), each to a **different** target (82b7bf0d / 4e1551aa / 0ab71d79 / 4e1551aa) — distinct legitimate spread targets, not identical-intent re-mints. The 34-count "thrash" is at the move-EXECUTION/dispatch level (dedup/interlock collapse most; 0 `DUPLICATE_OPERATION` logs). The binding freeze is **one** op stuck, not many re-minted. |
| The flap is the cause | The only leadership change during the freeze is a durability-fitness **self-demotion** at 07:04:17 (`"Replica local durability is unfit for leadership"` → `"Lost leadership, stopping rebalancing scheduler"`). The persistence failures **precede** it (first at 07:04:08.605, before 07:04:17) → persistence-failure-first, demotion-second. The term 2→21 re-election at 07:05:35 and handoff to the target at 07:05:52 **END** the freeze. |

The durability-fitness demotion is the *already-solved* sibling quest's fix
firing **correctly** (loud failure + demote instead of run-23's silent freeze).
But the demotion does not *heal* the wedge: the group stays effectively
leaderless ~78s (target 4e1551aa reaches voter-ready 07:04:29, yet no leader
until term 21 at 07:05:35). run-6 is the persistence-wedge class in its
**"loud + demoted but still deadlocked"** form.

## Consequence for the plan

Do NOT implement the model's idempotent-replan-across-flap lever as the demo
remedy — it is a symptom-level abstraction and would not move the binding
observable (the participant-failure persistence freeze fires regardless of
re-mint behaviour, under stable leadership). This is the E-cheap pattern again:
green on a flap-reset mock, inert on the live wedge.

## Where the real lever lives (forward)

The binding class is the **self-referential ledger-persistence quorum deadlock**
(`formation-ledger-leader-local-persistence-wedge` family, SOLVED for the
silent-freeze sub-case; run-6 is the loud+demoted-still-deadlocked sub-case).
Candidate levers to research (NOT yet chosen — research-first):
1. Why does a single *serialized* ledger self-move degrade its own quorum for
   minutes? (target voter-ready 07:04:29 but no leader until 07:05:35 — a ~66s
   post-voter-ready election gap on the ledger group.)
2. Recovery latency after a durability-fitness demotion of a *ledger* partition —
   the demotion is correct but leaves an ~78s leaderless window; faster reseat to
   a healthy voter would bound the wedge.
3. Whether a ledger self-move's own progress persistence can be routed so it does
   not depend on the partition being moved (break the self-reference).

## Adversarial verification (independent subagent, could not refute)

An independent subagent was tasked to REFUTE the self-referential-persistence
diagnosis and support the flap/re-mint hypothesis instead. It could not; all four
sub-claims held, with extra corroboration:

1. **Leadership stable / no flap** — CONFIRMED. Scoped to
   `partitionId=replica_operations-p1`, the ONLY liferaft leader installs are term
   1 (07:00:36), term 2 (07:00:55), term 21 (07:05:35), term 22 (07:05:52). **No
   leader wins at any term 3–20** — the 2→21 jump is ~19 *failed* election rounds
   (a wedged group that can't elect because candidates' logs aren't durable), not
   competing leaders flapping. The term-2 "Became leader" events during the window
   belong to *other* partitions.
2. **Single non-re-minted op** — CONFIRMED. a2950214 minted exactly once
   (07:03:23.786) and runs one continuous workflow to completion. Other
   operationIds present are distinct unrelated ops whose progress writes also route
   to (and fail on) replica_operations-p1 — not re-mints of the move.
3. **Participant failures are the binding quorum cause** — CONFIRMED. New evidence:
   right after the self-demotion the write fails with **`"No leader available for
   write operation"`** (07:04:26.294) — the write path needs a
   `replica_operations-p1` leader and there is none. Self-referential.
4. **Persistence-failure-first** — CONFIRMED. Cluster-wide ledger-write failures to
   replica_operations-p1 start at **07:03:37.679**, well before the 07:04:17
   demotion (whose reason literally reads "writes are not reaching durable
   storage"). a2950214's own first failure: 07:04:08.605.

Causal bookend: a2950214 completes at 07:05:52.754, immediately after the
STEP_DOWN handoff installs term-22 leader 4e1551aa at 07:05:52.081 — the handoff
*resolves* the wedge.

## Model deliverable status

`dc141f50` remains a valid formalization of a *real* secondary phenomenon (the
late REMOVE re-mint burst after the 07:05:35 flap storm), and `npm run model:tlc`
stays green. It is simply not the binding lever for [2/4]. The abstract-protocol
faithfulness caveat already flagged the flap-frequency assumption; this trace
shows the binding wedge sits in the abstracted-away region (progress writes
failing under stable leadership), not in the modeled flap-reset region.
