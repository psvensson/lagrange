---
id: service-data-affinity-placement
roadmapRow: null
status: sharpening
graduatesTo: null
---

# Epic: Service↔data affinity placement (the differentiator, made real)

## Intent (why now)

Lagrange's stated differentiator (README, post-`c091f6a8`) is not distributed
data — it is executing a distributed **service** so that its replicas sit as
near as possible to the replicas of the **data it accesses**. As of 2026-07-02
that thesis is represented nowhere in the system: placement is load + spread
only, and no structure records which data a service accesses. Before any
production mechanism is built, we need a way to *model* the problem — a
deterministic simulator to think with, sweep design alternatives in, and later
pin the chosen design against (red-on-revert), so the eventual `src/` change is
a transcription of a proven design rather than an experiment run live.

## Ground truth (surveyed + adversarially verified 2026-07-02)

- **Placement is load + spread only.** The single scorer
  (`src/rebalancer/placement-owner-decision.js:115-150`) weighs CPU/mem/disk +
  spread. Latency-group affinity dimensions exist
  (`calculateTopologyScoreDimensions` `:82-113`, `preferSameLatencyGroup` /
  `preferLatencyGroupDiversity`) but are **dormant** — no placement policy sets
  them, and they co-locate an entity's *own* replicas, not a service with data.
- **Falsified premise — reads do NOT route to the nearest replica.** Default
  read candidates are `routingSnapshot.routableServices` in snapshot order;
  `preferSameLatencyGroup` defaults false at every call site
  (`src/query/query-executor-partition-routing-candidates.js:65,92,119`) and
  nothing in prod enables it. Only writes have a locality gradient
  (leader-only). Consequence: **when data replicas are spread across latency
  groups (the fault-tolerant default), affinity placement alone cannot move
  the read-locality observable today** — the Tier-1a sim proves the hit rate
  is a placement-independent constant of the topology in that regime. (If a
  partition's replicas are all group-local, placement alone does recover
  locality even under uniform routing — the feature's value is coupled to the
  data spread policy; see census sweep A.) Prerequisite #0 for the production
  feature is enabling locality-aware read routing (mechanism partially built,
  dormant:
  `orderServicesByLatencyGroup` at `routing-candidates.js:282`, local-node
  block at `:242-249`).
- **The missing edge: no (service → partition) access representation.** Raw
  query counters exist (`src/query/execution-context.js`,
  `primitive-telemetry.js`) and per-partition traffic sampling already feeds
  split/merge (`src/partition/managed-split-metrics-provider.js`
  `trafficSamples`); the attribution join does not. Production A[s][p] should
  extend the existing sampler, not add parallel counters
  ([[avoid-secondary-tertiary-caches]] / research-existing-mechanisms-first).
- **Services are already first-class placement entities.** One
  `UnifiedRebalancer` per runtime service
  (`src/bootstrap/shared/runtime-service-rebalancer-setup.js`), same
  MovePlanner/scorer as partitions (`entityType RUNTIME_SERVICE`). A deployed
  service replica coordinates queries locally and ships per-partition
  sub-queries over the network
  (`sql-query-engine-lifecycle-and-callback-dispatch.js:273-281`,
  `query-executor-partition-delivery.js:298`) — so service placement *can*
  matter once routing exploits it. Partition callbacks (`DB.call`) are a
  separate compute-to-data mode; the movielens example exercises that mode, not
  deployed-service access.
- **Churn is the proven failure class.** `calculateMoves` turns any rank-set
  change into REPLACE/REMOVE
  (`move-planner-move-calculation-methods.js:356-381,483-553`); the one
  hysteresis lever (`retainHealthyIncumbents`) is dead code. The
  leadership-flap limit cycle is this repo's documented most-dangerous seam. An
  affinity dimension without an in-score movement-cost/hysteresis term is
  churn-generating by construction.
- **Two-sided pursuit risk is real.** Service rebalancers (all on the
  `service_definitions-p1` leader) and partition rebalancers run independently
  on their own cadences with CDC-lagged views; services chasing data while data
  rebalances (and raft leaders move) can oscillate.
- **Distance metric exists.** `src/topology/` measures RTT and assigns
  `nodes.latency_group_id` — the nearness signal (group-binary today).

## The model

Nodes with pairwise distance d (latency groups now; RTT later). Partitions with
replica sets + a raft leader; services with replica sets; an access matrix
A[s][p] split read/write. Placement quality is a potential:

    Φ_aff = Σ A[s][p] · cost(R_s, R_p)

where read cost per service replica models **what the router actually does**
(uniform over routable replicas today; nearest-replica once locality routing is
enabled) and write cost is distance to the partition **leader**. Full objective
trades Φ_aff against load imbalance, spread/fault-tolerance, and movement
cost/hysteresis. Two dynamics to answer, not assume: (1) does two-sided pursuit
under CDC lag converge or oscillate, and what hysteresis suffices; (2) when
does widen-data-replication + local reads dominate moving services
(the `MESSAGE_GROUP_LOCAL_ACCESS` "replicate everywhere" strategy is the
existing degenerate form of this alternative).

## Options under discussion

- **Tier 1a (this epic's first quest): standalone deterministic simulator** —
  `test/convergence/` home (Φ-fixpoint-test precedent `37175d73`), seeded
  (`SeededRandomSource`), closed plan→apply→replan loop over a modelled world;
  scoring function is a *parameter* so cost-function variants, weights, routing
  models, access shapes, topologies, CDC lag, and two-sided cadences sweep
  cheaply BEFORE touching `src/`. Census-style study script for wide grids.
- **Tier 1b: same sim, real kernel** — wire the winning design as a
  `DATA_AFFINITY` dimension beside `latencyGroupContext`
  (`placement-owner-evidence.js:239-266` insertion point), then drive the real
  `MovePlanner.calculateTargetState` + `calculateMoves` (scoring alone is not
  faithful — reservations + move-calculation guards decide whether rank change
  becomes movement; stub `moveStateProvider`, `move-planner.js:216`).
  Red-on-revert via `npm run dt:prove`.
- **Tier 3 (demo, not evidence): movielens upgraded** — corrected to a
  *deployed runtime service issuing queries* (not partition callbacks), with
  cross-node-access metrics, demonstrating live placement convergence.
- **Production prerequisites (recorded, not built here):** enable locality
  read routing (#0); access attribution by extending
  `managed-split-metrics-provider`; a per-service `placementConstraints`
  surface (runtime-service policy is hardcoded `replica_count`-only today,
  `unified-rebalancer-policy-scheduler-methods.js`); in-score hysteresis.

## Open questions

- Read-cost model per tier: is enabling `preferSameLatencyGroup` reads
  cluster-wide safe (staleness/consistency of follower reads), or per-service
  opt-in?
- Objective composition: is write-to-leader affinity worth chasing given
  leaders move on elections, or should write affinity target the replica *set*
  and let leader placement follow (leaderRetention already exists)?
- What hysteresis form: incumbent bonus in-score (revive
  `retainHealthyIncumbents`?), move-budget damping, or threshold-gated
  improvement (only move when Φ gain > cost)?
- When does widen-replication dominate move-services (read-hot, many-consumer
  data)? Should the planner choose per-partition strategy?
- Where does A[s][p] attribution live so both service and partition planners
  read the SAME matrix (avoiding disagreeing objectives)?

## Decision log

- 2026-07-02 — Epic authored from a three-way survey (placement machinery,
  movielens example, DT substrate) + adversarial vet. Pivotal correction: the
  "reads already prefer near replicas" premise is FALSE (routing is
  snapshot-order; locality flag dormant) → prerequisite #0 = locality read
  routing; movielens example is compute-to-data, not placement. Host decision:
  pure-kernel fixpoint sim (Φ-test pattern), NOT full DT6 (placement quality is
  not an ordering-race property; DT6 buys nothing here).
- 2026-07-02 — **Tier 1a SHIPPED**: `test/convergence/placement-affinity-sim.js`
  (+ 70-assert scenario suite `dt-placement-affinity-sim.test.js`, wide sweeps
  `scripts/census/placement-affinity-study.mjs`). Deterministic findings that
  now bound the design space:
  1. **Routing gates locality iff data is group-spread** (census sweep A):
     with spread replicas, uniform-routing hit rate is a placement-independent
     constant (exactly the same-group fraction) and the planner correctly
     emits ZERO moves; with group-local data, placement alone recovers
     locality even under uniform routing. Prerequisite #0 stands, scoped.
  2. **Load coupling without hysteresis is a limit cycle even ONE-SIDED**
     (load-self-shadow: the replica's own compute follows every hop). The
     churn boundary scales with wLoad (sweep B: h=0.05 tames wLoad 0.3, 0.1
     tames 0.6). Any DATA_AFFINITY dimension must ship with an in-score
     movement cost — reviving `retainHealthyIncumbents` is not optional.
  3. **Two-sided pursuit** (sweep C): symmetric-low hysteresis oscillates
     (period 2·cadence swap cycle), symmetric-high freezes at hit rate 0
     (stable but useless), ANY sufficient asymmetry converges in one move to
     full locality. Data-heavy/service-light asymmetry IS the thesis, encoded
     as per-entity-kind movement cost.
  4. **Widen-vs-chase** (sweep D): both reach hit rate 1 at equal move count,
     but chasing piles consumers into one group (loadStddev 156 vs 47–67) —
     for multi-group consumers, widening the hot partition dominates on load
     spread; the planner should choose per-partition strategy.
  5. **Real-kernel fidelity harness landed**
     (`test/convergence/dt-placement-affinity-real-kernel.test.js`, no src
     changes): the four ground-truth claims are now executable — latency-group
     scoring dormant under production constraint shapes; the lever works when
     enabled (−5 same-group bonus flips a 3-point load gap) with OWN-replica
     semantics and no input for accessed-data location; retainHealthyIncumbents
     works via direct call (incumbent_retention reservation) but is dropped by
     the MovePlanner bridge (enumerated options, top-level-only read) so the
     wired path REPLACEs a healthy incumbent for a 5-cpu-point challenger; and
     the Tier-1a sim's load dimension picks the same node set as the real
     kernel on a strict ordering (correspondence verified).
  6. **Adaptation-vs-stability band is wide** (census sweep E, hotspot
     rotation from a converged start): hysteresis 0.05–0.6 all re-converge to
     the shifted optimum in one planner pass (6–9 moves); 0 churns
     (oscillation, 45 moves); ≥ the affinity gradient (~0.85 here) stops
     tracking the workload (partial at 0.9, frozen at 2). The knob is bounded
     below by the load self-shadow and above by the affinity gradient — a
     forgiving range, so the eventual production constant need not be finely
     tuned.
  7. **Verdict machinery lessons** (both caught by adversarial verification,
     both pinned by regression scenarios): a fixpoint claim under CDC lag is
     only sound if quiet rounds planned against a view EQUAL to live placement
     (stale-view quiet windows fake fixpoints), and quiet must be tracked
     PER PLANNER KIND (a fast-cadence planner's quiet masks a slow one's
     pending move). Both transfer directly to any production
     convergence-detection for affinity placement.
