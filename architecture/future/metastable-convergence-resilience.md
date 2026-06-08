# Metastable Convergence Resilience (Rolling-Restart)

## Status

Planned / research. Spec at `.kiro/specs/metastable-convergence-resilience/`.
Motivated by the chronic `rolling-restart` non-convergence
documented in
[Active Gate Convergence Contract](../contracts/active-gate-convergence.md) and
[control-plane.md → Convergence Liveness Across Layers](../control-plane.md).
This note reframes that failure as a *metastable failure* and proposes three
directions plus a measurement gate. It is a design direction, not a committed
spec.

## Problem

During a rolling restart the cluster fails to reconverge **non-deterministically**:
the same code and scenario yield `missingPublishedCount` anywhere from 0 to 4
across runs, with the dominant blocker rotating between layers
(`publication_missing_active_node`, `priority_spread_pending`,
`node_state_publication_pressure`, `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`).
The surviving seed becomes the sole owner of the whole control plane and is
saturated by a re-init burst; rejoining peers' WebSocket handshakes time out and
their control-plane writes fail; some nodes exhaust a join retry budget and tear
their own router down, turning a transient transport problem permanent.

Prior single-layer fixes (transport reconnect, join re-attempt) and an
admission-concurrency throttle did **not** move the outcome. The variance is the
diagnostic: a deterministic deadlock gives a fixed result; a load/timing race
gives a distribution.

## Diagnosis: this is a metastable failure

A *metastable failure* (Bronson et al., HotOS'21; Huang et al., OSDI'22) is a
degraded state held in place by a **self-sustaining feedback loop** that persists
**after the original trigger is gone**, requiring a load drop or restart to
escape. The empirical signatures match exactly:

- **Sharp threshold.** Huang et al. found a ~2% load delta (78% vs 80% CPU)
  separating full recovery from permanent collapse in a Raft/MongoDB test. Our
  0–4 swing is the same cliff: we sit on the metastability boundary, so small
  timing differences flip the result.
- **Retries are the dominant sustaining mechanism.** Retry policy was the single
  most common sustaining effect (>half of studied incidents). Our reconnect,
  publication-reconcile, and join-retry loops are the analogue.
- **Admission throttling does not help.** Independently confirmed by Huang et al.
  and by our own reverted experiment — because rejoins are serialized, there is
  no concurrent admission to throttle; the load is sustained *work*, not request
  arrival.
- **Transient becomes permanent.** A node that retries and then self-destructs
  (router teardown on budget exhaustion) maximally amplifies the loop.

Corrected nuance (a strong "load-shedding is the cure" claim was refuted 0–3 in
verification): **breaking the sustaining loop is co-equal with shedding load**,
and reducing load to a *previously healthy* level will not stop a live cascade —
you must drop far below (1–10%) and ramp back up. The loop itself must break.

## Direction 1 — Break the retry / re-init sustaining loop (highest leverage)

The literature's first-ranked cure for metastability and cascading failure.
Concrete techniques (Bronson; Google SRE *Addressing Cascading Failures*; AWS
Builders' Library *Timeouts, Retries and Backoff with Jitter*):

- **Jittered exponential backoff** on every retry path so independent retriers do
  not synchronize into a thundering storm against the saturated owner.
- **Coordinated/server-wide retry budgets** (token bucket) rather than
  per-caller attempt counts, so the *aggregate* retry rate against an owner is
  bounded regardless of how many callers are retrying.
- **Circuit breakers** that stop hammering an owner that is failing fast and let
  it drain.
- **Remove the transient→permanent amplifier**: a node must not tear down its
  router / exit on retryable transport failure. (Our `index.js` join re-attempt
  is the right half of this; it needs jitter + a budget on the *retry* half.)

Highest leverage because it is the cure the evidence ranks first, it matches the
empirical signature (retries ≫ admission), and it is local — implementable
without re-architecting ownership.

## Direction 2 — Learner / catch-up membership

etcd and Raft add a rejoining node as a **non-voting learner** that **catches up
before counting toward quorum**, precisely to prevent "a new, empty member
overloads the leader" (etcd learner design; Ongaro Raft thesis). Catch-up is
**bounded by liveness checks that abort a too-slow joiner** rather than letting
it retry-storm. This is a direct structural match for "the rejoining node's
control-plane writes hammer the sole-owner seed": gate the rejoiner's owner-load
generation until it is caught up, bound catch-up, and replan/abort a too-slow
joiner instead of looping.

## Direction 3 — Disperse ownership; make rebalancing adaptive

Production systems deliberately avoid one node owning everything after a restart:
Nomad/Consul **transfer/pin leadership to the first upgraded node**; CockroachDB
**load-rebalances leases**. The precedent is exact — CockroachDB issue #19355:
after a multi-node restart, leases concentrate on one node **for hours** because
the **fixed** rebalance rate-limit (one transfer/sec) is too slow to disperse the
spike, and the cure is **adaptive throttling**. Map: disperse control-plane
ownership off the seed proactively after restart, and make priority-spread /
rebalancing **rate adaptive to the post-restart spike**, not a fixed cap.

## Measurement gate (prerequisite for all three)

A flaky liveness property cannot be fixed against single-run pass/fail. Turn it
into a measurable gate:

- **Statistical gate.** Track the *distribution* of `missingPublishedCount` and
  convergence time over N rolling-restart runs (pass-rate + percentiles), not one
  pass/fail. A fix is accepted only if it shifts the distribution.
- **Deterministic simulation testing (DST).** WarpStream, Antithesis, and the
  FoundationDB/TigerBeetle lineage run the system on a deterministic scheduler
  with injected faults and a fixed seed, making races reproducible and
  shrink-to-minimal. The harness already has seeded, controlled restart hooks;
  this direction makes the timing race reproducible instead of variance-masked.

Without this gate, every change to the directions above is a coin flip dressed as
progress (as the reverted admission throttle demonstrated).

## References

- Bronson et al., "Metastable Failures in Distributed Systems", HotOS'21.
- Huang et al., "Metastable Failures in the Wild", OSDI'22.
- Google SRE Book, "Addressing Cascading Failures".
- AWS Builders' Library, "Timeouts, Retries and Backoff with Jitter".
- etcd learner design; Ongaro, "Consensus: Bridging Theory and Practice" (Raft).
- CockroachDB issue #19355 (post-restart lease concentration; adaptive throttling).
- Kubernetes PodDisruptionBudget; WarpStream / Antithesis deterministic
  simulation testing.

Verification note: the metastability and membership-change claims here are
primary-sourced and adversarially verified (3-0); the control-loop, pacing, and
DST claims are sourced but not verified to the same bar; all cross-system
mappings are structural analogies, not drop-in designs.
