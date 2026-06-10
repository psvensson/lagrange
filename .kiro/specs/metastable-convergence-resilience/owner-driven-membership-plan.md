# Implementation Plan: Owner-Driven Membership Publication

Two workstreams from the rolling-restart root cause + the scale-safety review:
**A) Liveness** — give the membership-publication *owner* an unconditional driver
(today every trigger is gated behind an operation that itself stalls).
**B) Scale-safety** — make membership ownership robust when `control_plane_publications`
shards in a large cluster (today a single-partition assumption is hardcoded and
enforced nowhere).

## Root cause (evidenced)

Membership is published by writing the `cluster_membership` row in
`control_plane_publications`. The write succeeds when the partition LEADER drives
it (local + Raft-quorum-commit) and fails when a non-leader drives it (it must hop
to the saturated leader → `ROUTER_MESSAGE_TIMEOUT` → retry forever → STALL).
Proven by diagnostics: on the leader during the stall, **no trigger fires the
owner reconcile** — the heartbeat tick (gated behind a successful heartbeat send)
and the rebalancer `enqueueMembershipPublicationReconcile` (gated behind
coordinator *progress*) both logged 0 times. So the owner has no driver that runs
independently of the progress it is meant to create. 0 correctness breaches across
all runs — pure liveness.

## Design principles (verified)

1. **Single source of truth = the Raft term fence**, NOT the gate, NOT the epoch
   column, NOT the reconcile-queue owner-key. The membership write goes
   client→leader→Raft propose/commit (`partition-replication-handler.js:161-205`);
   a stale leader cannot reach quorum under a superseded term, so two nodes that
   transiently *try* to drive cannot produce divergent committed membership. The
   `membership-epoch-contract` is an advisory read-side classifier (no write CAS;
   the upsert is `INSERT OR REPLACE`). **Credit Raft for safety; the leader-gate is
   only an optimization to avoid doomed writes.**
2. **No "seed".** "Seed" is a one-time startup-mode label
   (`membership-lifecycle-controller.js`). Steady-state ownership everywhere
   resolves to "current leader of the partition holding the `cluster_membership`
   row." A joining node may contact *any* node; the write forwards to that leader.
3. **The reconcile-queue owner-key is a per-node, in-memory work-dedup key**
   (`OwnerKeyReconcileQueue`), not a distributed lease — it cannot diverge as a
   second source of truth. The real issue it papers over is "every node runs its
   own reconcile," which the leader-gate suppresses.

## Prior work already committed (this is FINISH + RELOCATE, not greenfield)

Most of the owner-driven mechanics already exist, flag-gated and default-off:
`b1363bdd` (steady-state predicate `isControlPlanePublicationsWriteLeader`),
`7513ffe1` (heartbeat tick decoupled from the send outcome), `98d55204`
(diagnostics). The plan below is to make these actually *run* during the stall and
make them scale-safe — not to build from scratch.

## Workstream A — Unconditional periodic owner driver (liveness)

- [x] **A0 — Pin the host loop. THE TRAP (review finding): every existing host is
  gated behind the very metadata-publication readiness that is stalled.** Both
  candidate hosts are disqualified for the *same* reason, and it is NOT the reasons
  I first wrote:
  - Heartbeat: `start()` is reached via the startup runtime handoff, which is gated
    behind `waitForMetadataPublicationReadiness` (`control-plane-setup.js:126`) — so
    during a publication stall the heartbeat loop **never starts** (this is why the
    decoupled tick from `7513ffe1` logged 0 even after decoupling: the loop isn't
    running, not the tick early-returning).
  - Rebalancer periodic loop IS timer-driven and leader-gated (correct host
    cadence, 5s for priority partitions) — BUT `setLeader` is gated on
    `isBackgroundWorkReady()` (`partition-service-segment-1-part-1.js:404-408,442`),
    i.e. metadata-publication readiness again. So the rebalancer for
    `control_plane_publications` never becomes leader while publication is stalled.
  - **Conclusion:** use a **dedicated lightweight interval (option ii)** that is
    started UNCONDITIONALLY at node startup, **independent of metadata-publication
    readiness** — the one host that cannot be gated behind the progress it exists to
    create. This is the literal "liveness owner." Owned by the control-plane
    readiness service / membership coordinator; 5s cadence; `unref`'d.
- [x] **A1 — Extract the existing owner-reconcile logic into a reusable method.**
  `runScheduledMembershipPublicationReconcileTick`
  (`heartbeat-service-lifecycle-methods.js:352`) already has the correct body
  (owner check → if `missingPublishedCount>0`, drive
  `reconcileActiveGateMembershipPublication`) and depends only on `systemTableCache`,
  `nodeId`, `membershipPublicationService` + the pure
  `buildPublicationActiveGateHandoffContract`. Factor it onto the membership
  coordinator; call it from the A0 interval AND keep the heartbeat call (harmless
  when the heartbeat does run).
- [x] **A2 — Bounded / abortable reconcile (review finding — load-bearing).** The
  tick's in-flight guard `scheduledReconcileTickInFlight` (and the coordinator's
  own queue/lane dedup) means **if one reconcile blocks on a doomed write, every
  later tick no-ops** — an "unconditional" timer still wedges. In the owner-driven
  case the leader writes locally (should not block), but we MUST guarantee it:
  bound `reconcileActiveGateMembershipPublication` with a timeout/abort so the
  in-flight guard can never wedge the driver. Without this, neither host fixes the
  stall. The reconcile queue self-drains (`owner-key-reconcile-queue.js:313`); the
  interval only triggers, never blocks.
- [x] **A3 — Leadership predicate.** Reuse
  `isControlPlanePublicationsWriteLeader(systemTableCache, nodeId)` (which already
  resolves the partition id via `INITIAL_PARTITION_IDS`, not a literal — correction
  to an earlier draft). Keep Tier-1 (partitions row `leader_node_id`) + Tier-2 (live
  services `raft_role=leader` witness). The real multi-partition hazard is the
  heartbeat tick's `.find()` first-match (`heartbeat-service-lifecycle-methods.js:334-337`),
  which matches ANY partition of the table — fix that in B2. Fail-safe (false on
  uncertainty) — safe because Raft backstops (principle 1).
- [x] **A4 — Keep the gate** (`shouldDeferMembershipReconcileToWriteLeader`,
  `membership-publication-coordinator-class-stage-2.js:439`) so non-leaders stop
  driving doomed writes; document it as an optimization, not the safety guarantee.
- [ ] **A5 — Validate** against the deterministic 3-node reproducer + the
  correctness/progress gate: STALLED→CONVERGED, corruptCount stays 0, no
  `PUBLICATION_DRAIN_DETERMINISTIC` invariant breach.

## Workstream B — Single-partition guarantee for the membership row (scale-safety)

- [x] **B4 (do FIRST — review finding: it's a prerequisite for A3, not a follow-on).**
  Add a startup/invariant assertion that the `publication_id='cluster_membership'`
  row resolves to exactly ONE partition; hard-fail if not. This guards A3's owner
  resolution: if the table ever became multi-partition without it, the predicate /
  `.find()` could pick the wrong fragment and split the brain. Land the assertion
  before enabling the driver.
- [x] **B1 — Make `control_plane_publications` non-splittable via per-table policy.**
  IMPLEMENTED (822aff6f) as an unconditional `isPriorityControlPlanePartition`
  early-return in `evaluateSplitCriteria` instead of policy thresholds — stronger
  (covers all priority control-plane tables, immune to policy-row loss/reset).
  `evaluateSplitCriteria` already honors per-partition policy overrides
  `splitStorageThreshold`/`splitTrafficThreshold` resolved via `getPolicyForPartition`
  (`partition-split-merge-manager-core-methods.js:150,468-470`); set them to Infinity
  for this table — cleaner than editing `loadEvaluationPartitions` and needs no new
  exclusion-list plumbing (there is NO existing system-table exclusion precedent).
  Default split trigger is `10GB` / `1000 qpm` (`partition-constants.js:367-368`),
  reachable for a hot control-plane table. Replica placement/rebalancing are
  independent of split eligibility, so this is low-risk.
- [x] **B2 — SATISFIED BY B1+B4 (no separate code).** The `.find()` first-match
  Fix the heartbeat tick's `.find()` first-match
  (`heartbeat-service-lifecycle-methods.js:334-337`) to resolve the partition that
  owns `publication_id='cluster_membership'` via the existing key-range routing
  (`PartitionResolver` `query/partition-resolver.js`, `KeyRangeManager`
  `partition/key-range-manager.js`, partition rows carry
  `partition_key_start`/`partition_key_end`) — a small key→partition helper, not new
  routing. With B1+B4 in place this is belt-and-suspenders, but it removes the
  silent-wrong-fragment hazard for good.
- [x] **B3 — Keep all membership writes on the Raft `proposeWrite` path.** The only
  fence is the Raft term. Ensure membership writes never take the SQL/cache fallback
  (`shouldUseSqlMutationFallback` fires on `skipCacheWait===true` + a `phaseScope`,
  `control-plane-system-table-gateway-segment-2-query-methods.js:212-222`), which
  would bypass the fence. Cheap guard; low priority/narrow path.

## Validation

- Deterministic 3-node reproducer + correctness-first/progress gate
  (`scripts/rolling-restart-stat-gate.sh`): the win is STALLED→CONVERGED with
  corruptCount 0; "slow" is acceptable, "gave up"/"corrupt" is not.
- Add a (separate, larger) scenario or unit test that forces/ simulates a
  `control_plane_publications` split to prove B1/B2/B4 prevent a split-brain owner.
- Confirm Raft term fence rejects a stale-leader membership write (unit/integration
  on `proposeWrite`).

## Open questions / risks

- A0 host choice is the load-bearing decision; resolve the heartbeat-vs-rebalancer
  "which loop actually runs" question with evidence before coding.
- B1 (non-splittable system table) may have implications for very large clusters
  (a single membership partition could itself become a throughput bottleneck);
  note as a known scale ceiling, acceptable for now, revisit if membership write
  qpm ever approaches the partition's limit.
- All runtime changes default-off, accepted only against the statistical gate.

## Rollout (revised order, per review)

1. **B4** — single-partition assertion (guards A3's correctness; cheap).
2. **A0/A1/A2** — dedicated always-on interval (started independent of publication
   readiness) + extracted reconcile + **bounded/abortable reconcile** (the
   load-bearing fix). Validate STALLED→CONVERGED on the reproducer, corruptCount 0.
3. **B1/B2/B3** — scale-safety hardening (non-splittable policy, partition
   resolution, Raft-path guard).

Each flag-gated, each validated against the gate. **Credit Raft (term fence) for
the single-source-of-truth property in all docs — not the gate, not the epoch
column, not the owner-key.** The dedicated interval must start UNCONDITIONALLY;
if it is ever gated behind metadata-publication readiness, the trap recurs.
