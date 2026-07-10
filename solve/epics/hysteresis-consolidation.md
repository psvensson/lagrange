---
id: hysteresis-consolidation
roadmapRow: null
status: active
graduatesTo: null
---

# Epic: consolidate the fragmented hysteresis mechanisms

Session s12 (2026-07-08). Design research: 5 parallel subagents (C0 first-principles floor, C1 liveness
authority, C2 phi-accrual, C3 suspect-tier-in-projection, C4 two-primitive minimalism). Prompted by the
MODE-A bug (`a79b3728`) being a direct symptom of fragmentation — the "trust live transport over a stale
signal" grace existed in 3-4 places but was MISSING at the one consumer (`isClusterMemberHealthy`) that
gated provisioning. **No code proposed here; this is the intent/options doc above a spec.**

## The answer to "as few as possible, no fewer": N ≈ 4-5 concerns
The five agents converged on the SHAPE and diverged only on GRANULARITY (whether to count a sub-mode as
its own primitive). The honest floor is a small range, not a single number:
- **N=3 (aggressive-but-defensible, C4):** liveness-veto + level-triggered-reconciler(carrying an
  outcome-dependent rate-limiter) + aggregate-safety-hold. Plus teardown as a base action.
- **N=5 (principled reference, C0):** the cleanest decomposition, each concern first-class.
- The difference is purely whether membershipFreeze folds into anti-flap (C0: P2 "aggregate mode";
  C4: distinct 3rd primitive), whether phase-grace folds into placement-retry, and whether the
  rate-limiter folds into the reconciler. **All five agree TWO is below the floor and phi-accrual is
  over-engineered for 5 nodes.**

## Canonical 5-primitive decomposition (C0 — the reference frame)
| # | Primitive | Signal / timescale | Owns |
|---|---|---|---|
| **P1** | Liveness / reachability detector | transport-ACK + heartbeat, FAST (s) | "peer may be dead" + **socket teardown** |
| **P2** | Node-trust-view stability / anti-flap | live-evidence veto + aggregate correlated-flap veto, SLOW (10s s) | set-mutation that drives re-replication/routing/eviction |
| **P3** | Level-triggered placement retry (purgatory) | unmet convergence goal + events | never edge-deny; re-drive to target |
| **P4** | Corrective-action rate-limiter | outcome-tiered cooldown + rebalance budget | ceiling on a shared actuator |
| **P5** | Lifecycle/phase grace | bounded self-terminating phase | suppress "broken" verdict during formation/handoff |
Merge-forbidden proofs (each concrete): **P3→P1 merge IS the MODE-A bug** (a liveness flap cancels
in-flight placement → table strands 1/3); P4→P3 merge re-creates the documented "9 repairs in 4s →
event-loop starvation"; P5→P2 merge breaks single-entity formation (freeze needs a population); folding
the hard raft-quorum invariant into "grace" = tunable data-loss (category error). Prior art forces the
axes: K8s ships THREE separate probes (liveness/readiness/startup = P1/P2/P5) + a split-out
taint-eviction controller (P1-action) + a zone circuit-breaker (P2-aggregate) + scheduler backoff (P3);
CRDB = liveness + purgatory-reconciler + throttle-layer; SWIM/Lifeguard populate only P1/P2/P5 (~3 axes)
because they don't place data.

## Mapping the current ~11 → primitives (the redundancy is concentrated in P2)
- **P1:** (1) ACK-quarantine [verdict folds to P2-input; **teardown ACTION is irreducible P1**], (10) self-node fast-path [P1-degenerate, observer-relative].
- **P2 — THE FRAGMENTATION:** (2) lease-sweep transport grace, (3) projection transport retention,
  (5) SWIM-alive protect, (9) heartbeat-staleness window, (11) transport-veto [**my MODE-A fix added
  the 5th copy**], + (4) membershipFreeze [aggregate mode / or its own primitive per C4]. **All five
  are the same rule — `transportAlive ∨ freshHeartbeatOrLease ∨ swimAlive` vetoes a stale-negative —
  evaluated in 5 places with drifting windows (30s vs 60s).** This drift IS the MODE-A bug class.
- **P3:** (8) transient-shortfall allowlist + whole-cluster re-wait, DDL convergence wait.
- **P4:** (6) authoritative-repair cooldown ladder (5s/30s/15s/1s, outcome-tiered).
- **P5:** (7) CONVERGENCE_GRACE (currently gated on active-recovery ONLY — the gap: should also cover
  ordinary bounded formation blips).
Mechanisms 1,6,7,8,10 are ALREADY clean single representatives. The work is P2.

## Where the unified P2 predicate should live (design tension: C1 vs C3)
- **C1** → host in `ControlPlaneReadinessService` (already the per-node evidence aggregator; emits
  per-dimension booleans but re-derives the liveness fold ~6 ways).
- **C3** → host in `active-node-projection.js` (already the membership authority; already computes a
  latent SUSPECT set `suspectedOrTransitioningNodeIds` + `membershipFreeze` band). **More principled**,
  BUT requires a hard precondition: **cut the cycle** where the projection consumes provisioning/
  runtime-authority *eligibility* as an input (`active-node-projection.js:190-226`). Apply Akka's
  orthogonality — **liveness ⊥ membership/provisioning** — so the flow is `evidence → state → consumers`.
  Then `isClusterMemberHealthy` becomes a thin read of `stateOf(node) ∈ {ALIVE, SUSPECT}`.

## Recommended staged roadmap (strangler; each stage red-on-revert + 2-pre/2-post live)
1. **Unify P2 into one `nodeTrustState(node) → {ALIVE|SUSPECT|DEAD}` predicate** over raw reachability
   evidence, evaluated once. Expose as a pure derived view first (zero behavior change; assert it
   reproduces current membership). THIS is the highest-value, MODE-A-preventing step — it makes
   "grace missing at one consumer" structurally impossible. Absorbs mechanisms 2,3,5,9,11.
2. **Re-point consumers one at a time, lowest-blast-radius first** (admin snapshot → bootstrap readyNodes
   → rebalancer availableNodes → `isClusterMemberHealthy` LAST, only after the §orthogonality cut). Keep
   each old grace as flagged fallback until live parity holds.
3. **Keep P1-teardown, P4-cooldown, P3-purgatory, P5-phase-grace, and the aggregate-freeze/quorum-mutex
   as distinct primitives** — do NOT merge them (the "no fewer" floor). Optionally promote P5 to cover
   ordinary formation blips (the CONVERGENCE_GRACE gap) — that also independently helps MODE-A's
   provisioning half.
4. **BONUS (C2, small + high-value):** wire the existing self-disruption signals (`'Heartbeat failing
   repeatedly'`, control-plane heartbeat failures, reconciler event-loop-starvation) into the EXISTING
   Lifeguard Local-Health-Multiplier (`membership-swim-detector.js` `applyHealthDelta`) so a lagging
   observer inflates its OWN suspicion tolerance — the SYSTEMIC form of the MODE-A point-fix (which
   trusted transport at one site; this makes the whole detector self-aware). ~90% already built.

## Do NOT
- **Build phi-accrual** (C2): over-engineered at 5 nodes on a virtual clock; needs N≳20-50 heterogeneous
  nodes to pay off; the SWIM+Lifeguard graded model already fits better and is DT-replayable.
- **Collapse to 2** (C4): below floor on 3 independent counts (aggregate-hold, outcome-rate-limit,
  teardown-action).
- **Merge P3 (placement-retry) into P1 (liveness)** — that merge is literally the MODE-A bug.
- **Fold the aggregate safety-hold (membershipFreeze / quorum-concentration interlock) into per-node
  anti-flap** — inverse logic (distrust-the-observer vs trust-the-target); it's the circuit-breaker.
- **Re-point `isClusterMemberHealthy` before cutting the projection↔provisioning-eligibility cycle.**

## Prior in-repo art (found by C2 — read before starting)
`solve/specs/membership-lifecycle-placement-hard-cutover/failure-detector-consolidation-scope.md`
already concluded the failure detector is "already consolidated; phi = optional upgrade, not de-dup."
This epic EXTENDS that: the FD (P1) is consolidated, but P2 (node-trust-retention) is NOT — it's the
5-way fragmentation above. That's the actual remaining consolidation work.

## Status
**Stage 1 SHIPPED** (commits `d29bcbee` atom+parity → `52f25c5f` 3-site switch → `4c7da847` guards →
`4d282144` scope nit): the `hasLiveTransportEvidence` atom now backs the readiness veto, lease-sweep,
and rebalancer live term (pure no-op DRY, parity + red-on-revert proven, 573+ tests green), with a
static guard (negative-control-proven) preventing a new cached-`connection_state` transport veto — the
MODE-A shape. Implemented by dependency-ordered subagents (foundation → switches → guards) + an
adversarial verification subagent (verdict: correct & complete; surfaced the DDL-provisioning cache-gate
as an excluded cache-only consumer, now documented + future-work-noted). Stage 1 spec + verification:
`solve/specs/node-liveness-veto-consolidation/`.

**Stage 2 SHIPPED** (commit `dd54c827`): the DDL provision-target connection gate
(`sql-query-engine-provisioning-methods.js` `resolveProvisionTargetNodeDiagnostics`) — the excluded
"cache-only consumer" stage 1 deferred — is now routed through `hasLiveTransportEvidence` as a MONOTONE
OR-rescue (`!hasConnectionState || isConnectionReady || hasLiveTransportEvidence(nodeId, {messageRouter})`).
This repairs the latent MODE-A shape (a stale-negative `connection_state` column excluding a live node
from provisioning targets) in the provisioning half, using the live router the SQL engine already holds
(the stage-1 guard's "no live router in scope" rationale was mistaken; corrected). Behavior change, not a
no-op DRY: proven by `test/query/provision-target-live-transport-rescue.test.js` (rescue / fail-closed /
permissive-empty) + `dt:prove` red-on-revert; blast radius = DDL-create/managed-split only (NOT
steady-state up-replication), so no live A/B gate. Design + adversarial verification (6/6 attacks survive):
`solve/changes/hysteresis-consolidation/stage2-ddl-provisioning-liveness-repoint-design.md`.

The **C2 self-disruption→LHM bonus was evaluated and REFUTED as low-value** and PARKED: only 1 of the 3
claimed signals exists+wireable, it does not fix MODE-A's root (SWIM suspicion timing is a different
layer; `suspect`/`dead` never trims), and the LHM is already self-aware via `recordMissedNack` +
failed-probe. Record: `solve/changes/hysteresis-consolidation/stage2-lhm-self-disruption-design.md`.

Remaining stage at epic level: **P5 formation-blip grace** (promote `CONVERGENCE_GRACE` beyond
active-recovery-only — touches MODE-A's provisioning half directly) until scoped. Higher-value non-epic
target for greening the affinity demo remains **MODE-B** (sibling
`formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`).

## (historical) Status
Design research. **Stage 1 spec written + verified: `solve/specs/node-liveness-veto-consolidation/`**
(3 adversarial review passes; ACCEPTABLE). The spec narrows stage 1 per the prior audit
(`failure-detector-consolidation-scope.md`): it does NOT re-consolidate the already-single-owner
projection or unify windows; it extracts the one live-transport atom (`hasLiveTransportEvidence`) shared
by the three already-live-strict eligibility sites (readiness `:529-530`, lease-sweep `:278-289`,
rebalancer live term `:306-312`) as a pure no-op DRY + a static guard against the cached-column MODE-A
mistake. The MODE-A fix (`a79b3728`) reused the lease-sweep pattern rather than block on this — it is the
concrete argument for the spec. Remaining stages (self-disruption→LHM wiring, P5 formation-blip grace)
stay at epic level until scoped.
