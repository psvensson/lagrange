# Requirements Document: Metastable Convergence Resilience

## Introduction

During a `rolling-restart` the control plane reconverges **non-deterministically**:
the same code and scenario yield `missingPublishedCount` anywhere from 0 to 4
across runs. This is the signature of a **metastable failure** (Bronson et al.,
HotOS'21; Huang et al., OSDI'22): a transient trigger (the restart) ignites a
self-sustaining retry/work-amplification loop that keeps the system collapsed
after the trigger is gone. The surviving seed becomes the sole owner of the whole
control plane, is saturated by a re-init burst, cannot service rejoining peers'
handshakes, and some nodes exhaust a retry budget and tear themselves down.

Single-layer fixes (transport reconnect; join re-attempt) and an
admission-concurrency throttle did not move the outcome. The research-backed
direction (see
[architecture/future/metastable-convergence-resilience.md](../../../architecture/future/metastable-convergence-resilience.md))
is to (1) make convergence measurable, then (2) break the sustaining retry loop,
(3) keep rejoiners from loading the owner before catch-up, and (4) disperse
ownership adaptively.

## Requirements

### Requirement 0 — Measurable convergence gate (prerequisite)

A flaky liveness property cannot be fixed against single-run pass/fail.

- WHEN the rolling-restart scenario is run N times THEN the system SHALL emit a
  distribution summary: pass-rate, `missingPublishedCount` histogram, and
  convergence-time percentiles (p50/p95).
- The acceptance gate SHALL be statistical (e.g. ≥90% runs converge,
  p95 convergence < threshold), NOT single-run pass/fail.
- Matrix runs SHALL start from clean containers (no warm-state reuse confound).

### Requirement 1 — Break the retry / re-init sustaining loop

- All retry/backoff paths on the hot loops (transport reconnect, operation
  dispatch deferral, coordinator handoff, publication reconcile) SHALL apply
  bounded jitter so independent retriers do not synchronize into a storm.
- The aggregate retry rate toward a single owner SHALL be bounded by a
  coordinated (server-wide) retry budget, independent of caller count.
- A persistently-failing owner SHALL trip a circuit breaker (fast-fail + long
  backoff + half-open probe) rather than being hammered.
- A node SHALL NOT tear down its router / exit on a *retryable* (transport)
  failure; budget exhaustion SHALL back off and keep probing, not self-destruct.

### Requirement 2 — Learner / catch-up membership

- A rejoining node SHALL NOT be counted toward publication convergence
  (`missingPublished`) until it has caught up, so the owner is not pressured to
  publish a node still loading.
- Catch-up SHALL be bounded; a too-slow joiner SHALL be replanned/re-targeted,
  NOT looped to budget-exhaustion-and-self-destruct.
- "Learner / not-yet-caught-up" and publication `WAIT_OWNER_RECOVERY` SHALL be a
  single concept, not two racing notions of "not ready to publish".

### Requirement 3 — Disperse ownership; adaptive rebalancing

- After a restart, control-plane partition ownership SHALL disperse off the
  sole-surviving owner within a bounded time rather than concentrating.
- Rebalance/lease-transfer rate SHALL be adaptive to the post-restart spike
  (scale up when distribution headroom is low), NOT a fixed cap.

### Requirement 4 — Safe rollout

- Every behavior change SHALL be guarded by a config flag, default-off, so the
  baseline is unchanged until explicitly enabled.
- A change SHALL be accepted only if it shifts the Requirement-0 distribution,
  never on a single run.
