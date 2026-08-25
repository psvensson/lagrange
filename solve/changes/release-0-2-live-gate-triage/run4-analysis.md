# Run 4 (2026-08-25T06:07) MovieLens live gate failure — analysis

Evidence: `solve/changes/release-0-2-live-gate-triage/run4-2026-08-25T06-07/` (immutable).
Failure: `Timed out waiting for 5 active nodes after 180000ms` (phase [2/5] cluster expansion).
Analysis date: 2026-08-25. HEAD ~4ec868418.

## 1. Per-node timeline and last blocking condition

The waiter (`examples/service-data-affinity/run-affinity-demo.js:386-413`,
`waitForActiveNodes`) polls `SELECT node_id, status FROM nodes` for
`status='active'`. A node's row flips to active only after it publishes its
READY lease. The run: seed started 06:01:32; four joiners started together
06:04:01; teardown 06:07:10-19.

| node | id | final lifecycle | last blocking condition |
| --- | --- | --- | --- |
| node-0 (seed) | 0b045b5d | active (seed) | Not blocked itself; as rebalancer-leader its critical-system planning logged 100x `Waiting for transitional cluster membership to settle` with `blockerReason=node_ready_lease_incomplete`, `unreadyNodeIds=[node-3, node-4]`, delayMs escalating 5000 -> 75000 (x39) -> 120000 (x38); plus 109x `Deferring spread-driven count-increasing ADD ... (no count-neutral REPLACE pairing)` |
| node-1 | 89087f54 | ACTIVE (released 06:04:20) | none — read startup authority while still `ready`; barrier state `ledger_spread_satisfied` at 06:04:20.841 |
| node-2 | 62627507 | ACTIVE (released 06:04:20); became control_plane_publications write-leader ~06:04:58 | none for join; as authority owner it then reported `recoveryProtocolState=priority_spread_pending`, `priorityRecoveryReasonCodes=[priority_partitions_not_spread]` unchanged from 06:04:54 to shutdown 06:07:10 |
| node-3 | f6478f41 | stuck `joining` (2nd attempt) | `Join priority-placement formation barrier` state `waiting_for_startup_authority`, `startupAuthorityState=recovery_pending`, reason `priority_partitions_not_spread`, gate `priority_spread_pending` — latched 06:04:30.524, fail-closed timeout after exactly 120s at 06:06:30.602 (`Timed out waiting for operation-ledger formation spread before publishing the node ready lease`), rejoin attempt 2 re-latched the same state at 06:06:30.893 |
| node-4 | b7e70590 | stuck `joining` (2nd attempt) | identical to node-3: latched 06:04:30.503, timed out 06:06:30.733, re-latched 06:06:30.994 |

All four joiners reached local lifecycle `ready` within ~20s (websocket, message
group, leadership, querying_state all fine). The stall is exclusively the
READY-lease hold: nodes 3 and 4 never published the lease, so `nodes.status`
never became `active` for them. node-2's `MEMBERSHIP_SWIM_DIVERGENCE` at
shutdown confirms: projectionCount=3, shadowCount=5, onlyInShadow=[node-3,
node-4] — the same 3/5-active signature as 2026-08-21.

### The stall window in detail

- 06:04:20.1-20.8 — nodes 1,2 pass the formation barrier: at their read the
  authority is `ready` (`startupAuthorityReady=true`, reasonCodes=[]). They
  publish leases and become active (cluster now 3 active).
- ~06:04:20.8-06:04:30.5 — activation of the 3rd node makes the 3-distinct-node
  priority spread target evaluable and violated (priority partitions were
  concentrated: e.g. sql_write_operations-p1 had activeCount=4 on
  activeDistinctNodeCount=2, target 3/3). The authority flips to
  `recovery_pending` / `priority_partitions_not_spread`.
- 06:04:30.5 — nodes 3,4 (10s behind: their `querying_state` took 17.7s vs
  node-2's 2.9s) engage the barrier with the cohort condition satisfied
  (candidateNodeCount=3, preReadyCandidateNodeCount=2 >= targetReplicaCount-1)
  and read `recovery_pending` -> latched, fail-closed, 120s budget
  (`priorityPlacementFormationTimeoutMs = TIME_MS.MINUTE * 2`,
  `src/bootstrap/node-joining-constants.js:37`).
- 06:04:36 -> 06:05:07 -> 06:06:25 — the cure crawls in bursts separated by
  ~70-110s dead windows: replica_operations-p1 spread cured by 06:05:07
  (3/3 distinct, `prioritySpreadGapOpen=false`), but sql_transactions-p1 /
  sql_transaction_participants-p1 cure ADDs only complete ~06:06:28-31 (on
  node-3 itself — barrier-holding joiners ARE accepted as placement targets),
  and sql_write_operations-p1 is STILL 2/3 distinct at 06:06:55 with a
  just-retained cure ADD (`overTargetCapAddDecision=retain_spread_cure_adds`).
- 06:06:30.6-30.9 — nodes 3,4 exhaust the 120s barrier budget, tear down to
  `stopped`, rejoin (attempt 2/4, `preserveForResume=true`), re-read the same
  `recovery_pending` and re-latch.
- ~06:07:0x — the demo's 180s active-node waiter (started ~06:04:0x) expires;
  report written 06:07:19; SIGTERM teardown.

## 2. First violated invariant (closure grammar)

**Invariant**: the joiner READY-lease hold (operation-ledger formation barrier)
must have a release path reachable within its own fail-closed budget: the
priority-spread cure owner (rebalancer-leader) must actuate cure operations at
event cadence when the gap is open and eligible targets exist, and must never
classify the hold's own subjects (barrier-holding joiners) as planning
blockers.

**First violation**: from ~06:04:36 the rebalancer-leader (node-0), with an
open priority spread gap, free pre-ready target nodes (3,4) that demonstrably
accept CREATE_REPLICA, and an event-driven wait contract, created no cure
operation for the still-gapped priority partitions for ~70-110s at a time
(timer-paced blocked-branch re-evaluation), while simultaneously deferring
critical-system planning 75-120s with `node_ready_lease_incomplete` naming
exactly the two nodes whose readiness awaited the cure.

**Mechanism loci (src/)**:

- Hold side: `src/bootstrap/node-joining-operation-ledger-formation-readiness.js`
  — `awaitOperationLedgerFormationBarrier()` (:221-276) engages when
  `candidateNodeIds >= 3 && preReadyCandidateNodeIds >= 2`
  (`hasSufficientOperationLedgerFormationCohort`, :169-179), releases only on
  `startupAuthorityReady === true` (:41-54), and fails closed at
  timeout (:264-266) with `deferRetry` -> rejoin loop.
- Cure-pacing side: blocked spread evaluation sleeps a flat [70000,80000)ms
  (`getBackgroundPrioritySpreadReleaseDelayMs`,
  `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js:208`, consumed
  by `rebalancer-priority-recovery-planning-gate-methods.js:277`); observed as
  the 39x 75000ms deferrals.
- Circular-classification side:
  `src/rebalancer/unified-rebalancer-critical-topology-methods.js` —
  `buildTransitionalNodeBlocker` (:144-172) returns
  `NODE_READY_LEASE_INCOMPLETE` when any active-authority node lacks the ready
  lease; the quorum escape (:154-160,
  `isRecoveryLanePartition() && !shouldRequireFullControlPlanePublicationEndpointVisibility() && hasRequiredHealthyNodes`)
  is **inert for the publications partition exactly while the spread gap is
  open**, because `shouldRequireFullControlPlanePublicationEndpointVisibility()`
  (`unified-rebalancer-control-plane-readiness-methods.js:379-401`) returns
  true whenever `priorityRecoveryActive` — which is true by construction during
  cold-formation spread recovery. CL-036's own adversarial verification
  recorded this inertness ("the fix is INERT exactly when the summary still
  shows the gap").
- Authority side: `src/control-plane/publication-recovery-gate.js:371-383` and
  `recovery-protocol-snapshot.js:352` produce
  `priority_partitions_not_spread` / `priority_spread_pending`, mirrored to
  joiners via `getStartupAuthoritySnapshotSync`.

## 3. Known-class ledger check (done BEFORE the verdict)

- **CL-036** (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-036.md`,
  status `guarded`): "Control-Plane Publications Spread Recovery Must Not Be
  Gated On A Node-Readiness That Is Itself Gated On Publications Recovery" —
  the same circular class (`[[circular-dependency-class-formation-vs-steady-state]]`),
  with the same `node_ready_lease_incomplete` planner signature. But CL-036's
  instance was a rolling-restart readiness-DIMENSION regression of
  already-active nodes, and its landed fix (the quorum escape via
  `shouldRequireFull`) is inert here because recovery is genuinely active
  during cold formation. Run 4 is a **new edge of the CL-036 class**: the
  cold-formation joiner READY-lease barrier vs the settle gate.
- **CL-021/CL-020/CL-003/CL-014** know `priority_spread_pending` sub-modes;
  CL-022 owns `cache_stale_watermark` (the 2026-08-21 surface symptom — a
  repair-trigger, not this run's blocker; run 4 shows zero stuck
  cache_stale_watermark reasons).
- **Quest ledger prior art**: `over-target-cap-spread-cure-wipe` (solved —
  `retain_spread_cure_adds` observed working in run 4),
  `priority-spread-cure-add-hold-exemption` (solved),
  `spread-cure-at-target-minting-gap` (solved),
  `readiness-formation-liveness-circularity-closure` (attempted, gate-decision
  recorded) — the class has a long fix train; run 4 shows the cure lane now
  functions but is **too slow for the joiners' 120s fail-closed budget**.
- **theory-ledger.md**: only the 2026-05-25 priority-spread triage stub —
  superseded by the closure ledger.

### The two named open quests

- `solve/quests/partition-leader-role-publication-visibility.json` (leadership
  authority end-state B): does **NOT** own this blocker. The binding chain
  contains no leader-identity misread — the authority snapshot, barrier, and
  planner deferrals all fire on spread/readiness state. (node-0 shows heavy
  raft-transition logging and 113x refused-truncation lines, but partition
  leaders resolved and cure operations did execute; the report's per-node gap
  budget passed, `exceeded=false`.)
- `solve/quests/blocked-spread-evaluation-event-wake.json`: **OWNS the binding
  pacing half**. Its statement is literally this run's mechanism: formation
  mints a burst of CREATE_REPLICA then stalls a flat 70-80s dead window with
  `blockedPartitionCount` high and `largestSpreadGap=2`; parked entities have
  no wake edge on operation-terminal/eligibility events. Run 4's cure bursts at
  06:04:0x-36, ~06:05:07, ~06:06:25-55 with dead windows in between are the
  quest's exact signature — and two dead windows exceed the barrier's 120s
  budget. It does not, however, name the second (circular-classification) half.

The GCP 7-node soak attempt-2 blocker
(`priority_recovery_actuation_state_action_required`, four system partitions
`eligible_but_no_operation_created`, owner rebalancer-leader, wait mode
`event_driven`, `create_recovery_operation` never actuated) is the same owner
failing the same actuation obligation — corroborating that this class, not the
leadership quest, is the live release-0.2 blocker.

## 4. Green run 1 comparison — race or deterministic?

Run 1 (05:20:37 report): converged=true, schema admission `quiescent`,
`prioritySpreadGap: 0`, `totalSpreadGap: 0`, `blockedPartitions: []`,
`stableElapsedMs: 63471`, no priority items. In run 1 the same phase either had
all four joiners read the authority inside the pre-flip `ready` window, or the
spread cure completed inside one evaluation burst — the receipts show the gap
fully closed with a stable 63s quiet window to spare.

**Verdict on flakiness: a race with a deterministic-given-state core.** The
single racy point is whether >=2 joiners are still pre-ready when the startup
authority flips `ready -> recovery_pending` (the flip happens when the 3rd
node activates while priority partitions are concentrated on <3 distinct
nodes). In run 4 the four simultaneous joiners split 2/2 across that flip
(nodes 3,4 ran `querying_state` ~15s slower). Once that state exists, the
stall is deterministic: the barrier latches fail-closed (120s), the cure is
timer-paced at 70-120s granularity so it cannot close all six priority-partition
gaps inside 120s, the rejoin re-latches into the unchanged authority state, and
the demo's 180s waiter expires. Run 3's contended-box failure
(`replica_operations_in_flight=4` schema-admission timeout) is the same cure
lane crawling one phase later; contention just widens the losing window.

## 5. VERDICT

- **Owner boundary**: the cross-owner seam between the bootstrap joining
  readiness owner (operation-ledger formation barrier, withholds the READY
  lease on `priority_spread_pending`) and the rebalancer-leader's
  priority-spread cure planning (release-path actuator). Two interacting
  defects on that seam:
  1. **Pacing (binding)**: cure evaluation is timer-paced (flat 70-80s blocked
     branch, 75/120s settling deferrals) instead of event-woken, so the
     documented release path is slower than the hold's 120s fail-closed budget.
  2. **Circular classification (aggravating)**: the settle gate counts the
     barrier-holding joiners as `node_ready_lease_incomplete` blockers, and the
     CL-036 quorum escape is inert precisely while the spread gap is open.
- **Match**: NOT `partition-leader-role-publication-visibility`. The pacing
  half is owned by the open `blocked-spread-evaluation-event-wake` quest; the
  circular half is a **new edge of the CL-036 closure class**
  (cold-formation joiner ready-lease barrier, vs CL-036's recorded
  rolling-restart readiness-dimension edge). Recommended disposition: drive
  the fix through `blocked-spread-evaluation-event-wake` (it names the exact
  dead-window law) and record the run-4 evidence as a new CL entry (CL-042
  candidate) for the cold-formation edge, cross-linked to CL-036 — since
  CL-036's guard cannot go red on this edge, it needs its own witness.
- **Deterministic reproduction** (to build):
  - **Layer**: rebalancer planning-gate + joining-readiness barrier seam,
    driven headless (no docker) via the real planner loop with a fake clock;
    plus one live scenario-harness variant for the witness.
  - **Injected state**: system-table cache with 3 active nodes; six priority
    control-plane partitions at target replica count but concentrated on 2
    distinct nodes (over-target: 4 replicas / 2 nodes for one of them); two
    joiner node rows pre-ready with no ready lease; startup authority snapshot
    `recovery_pending` / `priority_partitions_not_spread`.
  - **Assertions**: (1) on an operation-terminal or placement-eligibility edge
    the blocked spread evaluation re-evaluates immediately — no flat
    [70000,80000)ms sleep is consumed (the event-wake invariant; fake clock
    proves no timer wait is load-bearing); (2)
    `buildCriticalSystemTopologySettlingDecision` does not return a
    `NODE_READY_LEASE_INCOMPLETE` deferral for a priority partition whose only
    unready nodes are pre-ready barrier-holding joiners that are valid spread
    targets; (3) end-to-end with the real barrier: all six gaps close and the
    barrier releases well inside `priorityPlacementFormationTimeoutMs`.
  - **Live witness** (harness): stagger two joiners' start by ~10-15s behind
    the first two, deterministically putting them on the losing side of the
    authority flip; assert 5/5 active within the 180s window and zero
    `node_ready_lease_incomplete` deferrals persisting while the named nodes
    sit in `waiting_for_startup_authority`.
