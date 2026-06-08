# Implementation Plan: Metastable Convergence Resilience

Sequenced by risk/leverage. Phase 0 gates everything. Every runtime change is
default-off and accepted only against the Phase-0 statistical gate.

## Phase 0 — Measurement gate (prerequisite)

- [ ] 0.1 `scripts/rolling-restart-stat-gate.sh`: run the rolling-restart
  scenario N times (default 10) from clean containers; per run capture
  `missingPublishedCount`, `dominantReason`, convergence/duration.
- [ ] 0.2 Emit `test-output/reports/stat-gate-<ts>.{json,md}`: pass-rate,
  missing-count histogram, p50/p95 convergence time, dominant-reason tally.
- [ ] 0.3 Force clean containers between runs (remove reuse containers / network,
  or `--no-fast-local`) to avoid the warm-state confound.
- [ ] 0.4 Record the statistical acceptance gate in
  `architecture/contracts/active-gate-convergence.md` (e.g. ≥9/10 converge).
- [ ] 0.5 (stretch) Evaluate an in-process deterministic-simulation harness for
  the control plane (seeded scheduler, injected faults) — scope as follow-on.

## Phase 1 — Break the retry/re-init loop (highest leverage)

- [ ] 1.1 `applyBoundedJitter(delayMs, ratio, random)` shared util (+ unit tests).
- [ ] 1.2 Apply jitter at `scheduleReconnect` (`message-router-segment-2.js`).
- [ ] 1.3 Apply jitter at `deferOperationDispatchRetry` /
  `resolveCreatedOperationHandoffRetryDelayMs` (rebalancer retry paths).
- [ ] 1.4 Apply jitter at `owner-key-reconcile-queue.js` retry drain +
  `membership-publication-control-plane-convergence` retryAfterMs.
- [x] 1.5 Per-target-owner retry-rate token bucket (`src/transport/owner-retry-budget.js`)
  gating delivery-triggered reconnects in `ensureNodeConnection`; bounds each
  node's reconnect-attempt rate toward a saturated owner. Default-off
  (LAGRANGE_OWNER_RETRY_BUDGET).
- [ ] 1.6 Promote ack-timeout quarantine
  (`message-router-reconnect-behaviors.js`) into a circuit breaker with a
  half-open probe.
- [x] 1.7a `index.js` join re-attempt delay is jittered (decorrelate rejoin
  storms); the permanent `process.exit` self-destruct is already mitigated by the
  bounded re-attempt (`e61deebc`).
- [ ] 1.7b Keep the message router ALIVE on a retryable failed join (skip
  `messageRouter.shutdown()` in `_cleanupConnectingWebSocket`,
  `join-cleanup-handler.js`) so the node stays reachable across the retry gap.
  CONSTRAINT: this conflicts with the current re-compose retry (a fresh
  `startJoinNode` builds a new router → same-port bind conflict) and the join
  lifecycle machine is STOPPED-terminal after cleanup. Requires a *reuse-retry*
  path that re-drives the join on the existing router/runtime instead of
  re-composing — a larger lifecycle change, flag-gated, measured against the
  Phase-0 gate. Scope separately from 1.7a.
- [ ] 1.8 Audit all retry budgets for "give up → self-destruct"; convert hard
  give-ups to "back off long, stay alive, keep probing".
- [ ] 1.9 Gate via config flag; validate against Phase-0 distribution.

## Phase 2 — Learner / catch-up membership

- [ ] 2.1 Mark a rejoiner as a non-counted learner (exclude from
  `missingPublished`) until caught up; gate owner-load upserts behind catch-up.
- [ ] 2.2 Bound catch-up; replan a too-slow joiner via the learner-never-
  promotable decision instead of looping (`priority-recovery-snapshot-stage-9.js`).
- [ ] 2.3 Unify learner / not-caught-up with publication `WAIT_OWNER_RECOVERY`.
- [ ] 2.4 Gate via config flag; validate against Phase-0 distribution.

## Phase 3 — Disperse ownership; adaptive rebalancing

- [ ] 3.1 Proactive post-restart ownership transfer off the seed (hook into
  priority-spread recovery).
- [ ] 3.2 Replace fixed `maxConcurrentMoves`/transfer caps with a rate adaptive
  to `spreadGap`/`readyDistinctNodeCount`.
- [ ] 3.3 Gate via config flag; validate against Phase-0 distribution.

## Phase 4 — Leader-driven recovery establishment (the recovery-bootstrap) ★ primary

The deterministic root cause (see memory `rolling-restart-publication-nonconvergence-root`
and `recovery-as-second-bootstrap-impossibility`): membership publication is driven
by a *rejoiner* (non-authority) that must make a synchronous network hop to the
saturated seed-leader to propose a multi-partition quorum write — that hop times
out (`ROUTER_MESSAGE_TIMEOUT`) and the reconcile retries forever → STALL. It's the
same chicken-and-egg as cold-start bootstrap (the quorum it needs is what's being
recovered).

Fix shape: **keep Raft quorum commit (durability), change WHO drives the write** —
the membership-partition Raft leader (the stable seed) publishes membership for all
observed-active nodes from its LOCAL replica via `AuthoritativeRowMutationHelper`,
eliminating the congested remote-writer→leader hop. NOT async replication (that
would lose quorum durability on leader crash — verified via the sql-routed write
path, `partition-service-segment-3-part-1.js:608-715`).

- [ ] 4.0 VERIFY before building: (a) during the rolling restart, is a write
  quorum actually available (seed + ≥1 stable node), or do too many nodes go down
  at once? (b) does the membership-partition leader also lead the other partitions
  the reconcile touches (e.g. `replica_operations-p1`), so its reads/writes are
  local? (c) exactly what the multi-partition `DISTRIBUTED_PARTICIPANT_FAILURE`
  (all-participants) op needs vs. a leader-local equivalent.
- [x] 4.0 VERIFIED against the deterministic 3-node reproducer (run3): (a) seed
  published ITSELF while rejoiners did not → the SAME control_plane_publications
  write succeeds seed-driven, fails rejoiner-driven (quorum writes work; only the
  driver is wrong); (b) the seed is `isLeader:true` for ALL relevant partitions
  (control_plane_publications-p1, replica_operations-p1, sql_*-p1) → leader-driven
  serves the whole multi-partition op locally; (c) seed reaches followers
  (readinessState:ready). Design GREEN.
- [ ] 4.1 Route the membership reconcile to the `control_plane_publications` OWNER
  (`membershipPublicationRuntimeOwner.getControlPlanePublicationsOwner()`,
  membership-publication-coordinator-stage-2.js:138-141) instead of whoever's
  reconcile-queue claims it. ENCOURAGING: the candidate is ALREADY cluster-wide
  (`deriveMembershipPublicationCandidate` builds `publishedActiveNodeIds` as a list
  of all active nodes), so no target-selection rework — only the DRIVER and the
  WRITE path change. `reconcileClusterMembership` (stage-2:412) has NO leadership
  gate today — that is the gap to add.
- [ ] 4.2 Leader publishes membership for all observed-active nodes (it already has
  them via snapshot coverage) through an `AuthoritativeRowMutationHelper` wired for
  `control_plane_publications` (table-agnostic, same gateway/fence — confirmed
  composable, cf. `partition-service-segment-1-part-1.js:542-604`).
- [ ] 4.3 Fence: only the current Raft leader + current membership epoch
  (`CURRENT`/`STALE`/`FUTURE`) writes; deposed-leader writes fenced out → no
  split-brain. KEEP Raft quorum commit (no async).
- [ ] 4.4 Gate via config flag (default off); validate against the deterministic
  3-node reproducer + the correctness/progress gate. Win = STALLED→CONVERGED,
  corruptCount stays 0, invariants clean.

## Done-when

- Phase 0 produces a one-command distribution summary (correctness-first, then
  progress: CORRUPT/CONVERGED/SLOW/STALLED).
- The deterministic 3-node reproducer goes STALLED→CONVERGED with 0 corruption,
  then the 5-node distribution shifts to converged-or-slow (never STALLED, never
  CORRUPT) — the acceptance for the whole effort. Per the principle: slow is a
  pass, gave-up/corrupt is a fail.
