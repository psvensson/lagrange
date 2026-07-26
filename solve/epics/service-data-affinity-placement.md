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

- ~~Read-cost model per tier: cluster-wide vs per-service locality reads~~ —
  **DECIDED 2026-07-03 (user): per-service policy.** A `readLocality` field on
  `service_definitions` (CDC-propagated, cached for the read hot path),
  default off initially; long-term intent is to flip the default to locality
  once the load-concentration story is validated, then keep the field as
  durable per-service policy (some services legitimately want read
  spreading). Coherence obligation: the affinity planner must score each
  service with the read-cost model its routing policy actually uses (the sim's
  routing-mismatch finding), so planner and router read the SAME policy field.
- Objective composition: is write-to-leader affinity worth chasing given
  leaders move on elections, or should write affinity target the replica *set*
  and let leader placement follow (leaderRetention already exists)?
- ~~What hysteresis form: incumbent bonus in-score (revive
  `retainHealthyIncumbents`?), move-budget damping, or threshold-gated
  improvement (only move when Φ gain > cost)?~~ — **DECIDED 2026-07-03
  (Tier 1b): in-score incumbent movement-cost dimension**
  (`DATA_AFFINITY_INCUMBENT_RETENTION`, −4 vs affinity weight 10).
  Reservation-based `retainHealthyIncumbents` was examined and rejected
  for this role: reserved incumbents seed the intent FIRST
  (placement-owner-decision reserve phase), which freezes affinity
  movement regardless of gradient size — the sim's symmetric-high
  freeze. The in-score margin gives exactly "move iff gradient >
  margin". `retainHealthyIncumbents` stays as-is (dead through the
  wired path, documented by real-kernel harness claim 3).
- When does widen-replication dominate move-services (read-hot, many-consumer
  data)? Should the planner choose per-partition strategy?
- Where does A[s][p] attribution live so both service and partition planners
  read the SAME matrix (avoiding disagreeing objectives)?

## Decision log

- 2026-07-26 — **Comparative evidence consumes affinity; it does not redefine
  it:** `solve/specs/comparative-workload-efficiency-evidence/` owns workload
  equivalence, paired alternative runs, topology cost accounting, and relative
  claim projection. This epic retains access attribution, routing policy,
  placement scoring, decay, and hysteresis semantics. Comparative matrix cells
  measure those owners and must use the public request/WASM deployment surface
  for MovieLens product claims.
- 2026-07-25 — **Scale proof handed to the certification program:** this epic
  continues to own access attribution, policy composition, and affinity
  semantics through the existing runtime-service policy and
  `UnifiedRebalancer`. It does not add a global scheduler. The successor
  `solve/specs/large-scale-data-plane-certification/` owns feasibility-aware
  oracle comparison, remote-byte/weighted-distance thresholds, movement and
  post-convergence churn bounds, stale-evidence decay, topology-change
  interaction, and the large live profiles. The MovieLens terminal remains the
  newcomer-facing functional proof, not scale certification.
- 2026-07-21 — **Demo repositioned inside the three-rung deployment ladder
  (user decision):** the canonical deployment story is rung 1 (unchanged
  pg-talking app in an OCI container, managed and placed near its data),
  rung 2 (Lagrange-aware callbacks with a shared service context), rung 3
  (WASM components) — see
  [[lagrange-aware-callback-shared-context]] and the service-portability-ladder
  spec. The MovieLens demo is the **rung-1 showcase**: its point is an
  application-shaped service whose replicas the cluster places near the data.
  Today its service leg runs as kernel-internal `native_js`
  (`sql-query-loop-runtime`), which demonstrates the placement behavior but
  not the rung-1 deployment path; migrating that leg onto an installed OCI
  service follows the ladder's C-phase (tracked there). A rung-2 leg on the
  unified callback surface is ladder row K4, not this epic.

- 2026-07-11 — **Affinity is intrinsic, not a demo toggle:** a runtime
  service with fresh access evidence always receives production
  data-affinity placement weights. `read_locality` remains an independent
  query-routing policy and no longer enables/disables placement. The
  newcomer MovieLens surface is one three-way comparison: PostgreSQL
  grouped SQL, Lagrange distributed grouped SQL, and a replicated
  Lagrange service that learns placement while executing a documented
  confidence-adjusted Bayesian ranking. The service begins without an
  access profile; attribution-driven convergence is the before/after
  story. The older partition-callback MovieLens demo and its fetch-all
  PostgreSQL comparison are removed after their reusable download,
  loader, PostgreSQL, and cluster helpers move beneath the surviving
  service-data-affinity example. Performance ratios are intentionally
  omitted across unlike local topologies; correctness, transfer shape,
  bounded candidate exchange, and learned placement are the claims.

- 2026-07-11 — **Tier-3 completion reframed by user decision:** multiple
  latency domains are not a prerequisite for the service/data-affinity
  thesis. The primary demo is one latency domain with asymmetric
  node-level data weights, a controlled `read_locality=any` →
  `same_group` A/B on the same service, and production-equivalent
  weighted-locality evidence. The old zone-convergence Quest
  `movielens-affinity-placement-demo` and combined placement+CDC Quest
  `latency-group-zone-affinity-demo` closed EXHAUSTED as superseded
  decision closures; the successor is
  `service-data-affinity-parallel-reduce-demo`. Multi-zone CDC fan-out
  remains an optional independent topology direction, not an affinity
  completion dependency. The demo also distinguishes three stages that
  earlier prose conflated: SQL partition fan-out, disjoint reduce work
  on runtime-service replicas, and a bounded exact partial-result merge.
  **REUSED:** the production affinity-weight owner, service-scoped query
  executor, native runtime lifecycle, placement toggle, and existing
  row reducer. **EXTENDED:** runtime replica context now preserves the
  base service identity, failed driver starts fail the lifecycle owner,
  and the generic query loop supports parallel reduce. **NEW (after
  comparison):** a stable leased-slot/atomic-snapshot coordinator is
  required because the existing distributed SQL aggregation owner
  merges partition results inside one query execution; it does not own
  work assignment or exchange across independently placed runtime
  service replicas. Replica IDs cannot fill that role because REPLACE
  deliberately allocates new generations.

- 2026-07-03 — **A[s][p] attribution SHIPPED (`6646ff18`, quest
  `service-partition-access-attribution` SOLVED)** and **the production
  policy lift SHIPPED (`4c0101b9`, quest
  `runtime-service-affinity-policy-lift` SOLVED)** — the feature is now
  LIVE end to end: engine-side (issuingServiceId, partition, read|write)
  recording at the statement seams → per-(node, service) delta rows in
  the new CDC-propagated `service_partition_access` table (heartbeat
  publication pattern; single-flight publisher with merge-back on thrown
  AND resolved gateway failures) → `getRuntimeServicePolicy` aggregates
  fresh rows (120s bound), credits reads to replica-holding groups and
  writes to the leader group, and emits `dataAffinity.groupWeights` +
  `preferDataAffinity` iff `read_locality = same_group` (planner/router
  coherence on one field). **Epic assumption corrected** (recorded
  finding): A[s][p] could NOT extend the split-metrics sampler — it is
  leader-local and write-only, and the issuing identity exists only on
  the coordinator; the engine statement layer is the only seam where
  identity and partition set coexist. Where the matrix lives (open
  question answered): the CDC-propagated table, so every planner reads
  the SAME matrix from cache. Remaining: Tier-3 demo (deployed service
  issuing queries); write-affinity-to-leader-vs-set and per-partition
  widen-vs-chase stay open.
- 2026-07-03 — **Prerequisite #0 SHIPPED (`f594adb0`, quest
  `service-read-locality-policy` SOLVED)**: `service_definitions.read_locality`
  column (TEXT NOT NULL DEFAULT 'any', `SERVICE_READ_LOCALITY` enum
  'any'|'same_group'), CDC-propagated, validated on create/update; the
  service-scoped query executor factory passes `issuingServiceId`, the
  engine resolves the policy from the node-local cache (one Map.get per
  SELECT) and threads `preferSameLatencyGroup` into the previously
  dormant ordering, which now ranks local node → same latency group →
  rest. Policy-off routing is unchanged (verified byte-identical); the
  planner-coherence obligation (score with the same field) lands with the
  production policy lift. Guard: `test/query/service-read-locality-routing.test.js`
  (dt:prove red-on-revert), runner `scripts/run-placement-affinity-scenarios.js`.
- 2026-07-03 — **Tier 1b SHIPPED (`3ebff067`, quest
  `placement-data-affinity-tier1b` SOLVED)**: `DATA_AFFINITY` +
  `DATA_AFFINITY_INCUMBENT_RETENTION` score dimensions in the real
  kernel (`PLACEMENT_OWNER_DATA_AFFINITY_SCORE` affinity 10 /
  movement-cost 4), fed by policy-carried `dataAffinity.groupWeights`
  normalized into `evidence.dataAffinityContext`; fully gated (off =
  byte-identical output); proven through the REAL MovePlanner
  (`calculateTargetState`+`calculateMoves`, ordinal-non-degenerate
  scenarios): supra-margin gradients move the service toward its data,
  sub-margin gradients produce ZERO moves. No bridge changes needed —
  policy + currentReplicas already forwarded whole. Guard:
  `test/convergence/dt-placement-affinity-tier1b-kernel.test.js`
  (dt:prove red-on-revert; subagent-verified FAITHFUL, 3 low findings
  fixed). **Remaining production prerequisites**: A[s][p] access
  attribution (extend managed-split-metrics-provider), the
  `getRuntimeServicePolicy` lift (assemble groupWeights + set
  `preferDataAffinity`/read-cost model from `read_locality`), and the
  Tier-3 demo.
- 2026-07-03 — **Prerequisite #0 shape decided (user): per-service read-routing
  policy**, not a cluster-wide flip. Rationale: locality routing trades away
  uniform routing's implicit load spreading (census sweep D's loadStddev 47→156
  concentration), which is workload-dependent — a genuine per-service policy,
  not a temporary flag. Rollout: policy field default-off → opt in the demo +
  latency-sensitive services → flip the default once validated. Same session:
  solve.js repaired and `_legacy_work/` removed for good (`b67a27a4` — Solver
  deps now live in `scripts/solve/` + `solve/theory-ledger.md`).
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
