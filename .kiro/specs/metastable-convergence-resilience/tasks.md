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
- [ ] 1.5 Per-target-owner retry-rate token bucket in the delivery layer (reuse
  `message-router-delivery-source-admission.js`); bound aggregate retries.
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

## Done-when

- Phase 0 produces a one-command distribution summary.
- The rolling-restart `missingPublishedCount` distribution shifts toward 0 with
  reduced variance, measured statistically — the acceptance for the whole effort.
