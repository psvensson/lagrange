# Design Document: Metastable Convergence Resilience

## Overview

This is the historical metastability design model for chronic
`rolling-restart` non-convergence. It remains reusable research input, but July
20 evidence in `solve/epics/topology-convergence-hardening.md` is the current
frontier authority and must be re-established before selecting a mechanism
below. Full framing, citations, and historical verification status are in
[architecture/future/metastable-convergence-resilience.md](../../../architecture/future/metastable-convergence-resilience.md).
The empirical signature (0–4 `missingPublishedCount` swing; retries as the
dominant sustaining mechanism; admission-throttling proven ineffective) is
documented in
[architecture/contracts/active-gate-convergence.md](../../../architecture/contracts/active-gate-convergence.md).

## Phase 0 — Measurement gate (prerequisite)

A statistical matrix runner executes the scenario N times from clean containers
and aggregates `missingPublishedCount`, `dominantReason`, and convergence time
into a pass-rate + histogram + percentile summary. Acceptance becomes
distributional, not single-run. This must land first; every other phase is
validated against it.

Component: `scripts/rolling-restart-stat-gate.sh` →
`test-output/reports/stat-gate-<ts>.{json,md}`.

## Phase 1 — Break the retry/re-init loop

Reuse: `applySeedContactRetryJitter` (`node-joining-service-segment-2.js`) as the
jitter pattern; existing `retryAfterMs`/backoff fields; `ackTimeoutStreak` +
quarantine (`message-router-reconnect-behaviors.js`) as the breaker substrate;
per-source admission (`message-router-delivery-source-admission.js`) as the
budget substrate.

- `applyBoundedJitter(delayMs, ratio)` shared util; applied at: `scheduleReconnect`
  (`message-router-segment-2.js`), `deferOperationDispatchRetry`,
  `resolveCreatedOperationHandoffRetryDelayMs`, `owner-key-reconcile-queue.js`
  retry drain.
- Per-target-owner **retry-rate token bucket** in the delivery layer (distinct
  from the pending-depth cap), bounding aggregate retries toward a saturated
  owner.
- Promote the ack-timeout quarantine into a **circuit breaker** with a half-open
  probe.
- `handleJoiningFailure` (`join-cleanup-handler.js`) distinguishes retryable vs
  fatal; retryable failures back off (jittered, budgeted) and keep the router
  alive instead of `process.exit`. Builds on the existing `index.js` re-attempt.

## Phase 2 — Learner / catch-up membership

Reuse: the existing Raft-learner machinery —
`buildPriorityRecoveryLearnerPromotion`, `PRIORITY_RECOVERY_RAFT_ROLE_LEARNER`,
learner-hold reasons (`priority-recovery-snapshot-burndown.js`); readiness
`PLACEMENT_ELIGIBLE`/`PROVISIONING_ELIGIBLE`; `STARTUP_ADMISSION_*`
(`rejoin-reconciliation-contract.js`).

- A rejoiner is a non-counted learner (excluded from `missingPublished`) until
  caught up; gate its owner-load-generating upserts behind catch-up.
- Bounded catch-up; the learner-never-promotable decision replans a too-slow
  joiner instead of looping.
- Unify "learner / not-caught-up" with publication `WAIT_OWNER_RECOVERY`
  (`publication-active-gate-handoff-contract-decision.js` rule 4).

## Phase 3 — Disperse ownership; adaptive rebalancing

Reuse: priority-spread recovery (`publication-recovery-priority-spread.js`,
`buildDerivedPriorityPartitionSummary` → `readyDistinctNodeCount`/`spreadGap`);
rebalancer concurrency budgets (`rebalance-coordinator-concurrent-add-budget.js`,
`rebalance-coordinator-priority-budget-helper.js` `maxConcurrentMoves/Removes`).

- Proactive post-restart ownership transfer off the seed (Nomad/Consul leadership
  transfer + CockroachDB lease rebalancing analogue), hooked into priority-spread
  recovery.
- Replace fixed `maxConcurrentMoves`/transfer caps with a rate adaptive to
  `spreadGap`/`readyDistinctNodeCount` (CockroachDB #19355 lesson).

## Cross-cutting

- Temporary experiment controls are allowed only within a landing session; the
  selected behavior is promoted with the control removed or removed entirely.
- Phases 1–3 are mutually reinforcing (each frees load the others need) but
  sequenced by risk/leverage; Phase 1 alone may shift the distribution enough to
  confirm the metastability thesis.
