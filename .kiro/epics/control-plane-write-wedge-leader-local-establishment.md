---
id: control-plane-write-wedge-leader-local-establishment
roadmapRow: null
status: discussing
graduatesTo: null
---

# L-write: owner-local durable establishment of control-plane writes during formation/recovery

> Handoff scope for the next agent. Everything below is evidence-grounded from the
> 2026-06-23 profiling session (file:line verified at HEAD `67f5a10c`, but POSITIONAL —
> re-grep before trusting). Read [`.kiro/steering/operational-ground-truth.md`](../steering/operational-ground-truth.md)
> first (deterministic-first / gate-last / research-existing / subagent-verify).

## Intent (why now)

One root underlies four separately-tracked symptoms: the **control-plane WRITE /
establishment path does not complete within budget under seed/owner event-loop
saturation** during multi-node formation and rejoin. Symptoms:

- **mgmjf 7th-node block** — the join `querying_state` phase (node/endpoint/service
  registration) balloons 0.26s → ~20s by the 4th joiner (per-phase timing probe,
  2026-06-23).
- **rolling-restart `convergence_timeout`** — the gate's dominant reason. Profiled:
  rejoining nodes burn the full **120s `joining:readiness-convergence` budget on
  `topology_not_ready`** then retry (≥2 nodes/run ≈ 240s of a 586s run). Driven by
  `"inFlightReplicaOperations":1` (×38 in run-1 full logs) — a `replica_operations`
  row that won't drain — plus `["priority_spread_gap","priority_partition_missing"]`
  (×216). See [[rolling-restart-donewhen-real-blocker]] (`replica_operations_in_flight`).
- **2-node load-root** — present even single-forming-node ([[load-root-2node-deterministic-repro]]):
  the priority partition is itself mid-spread/sub-quorum so its own durable
  `replica_operations` write can't land.
- **gate wall-time ~600s** (the calibration epic's parked **0.2 "tracked debt" target**,
  see [`hardware-relative-convergence-budget.md`](hardware-relative-convergence-budget.md)).

The L-hydrate lever (commits 84bc45b7 → 67f5a10c) removed the join read-path's
awaited ~28s catch-up — gate-validated safe (N=3 CONVERGED 3/3) — but did **not**
move gate wall-time and does not close mgmjf, because the binding cost is the
**write** path, not the read path. L-write is the shared lever.

## The mechanism to extend (lever (a), commit `64a18b76`)

`64a18b76` already proved the pattern for the SEED's own ops: when a priority
`replica_operations` durable distributed write **defers** (retryable control-plane
error under saturation), the **owner** seeds its locally-decided row into the local
system-table cache (LWW merge, tombstone-fenced), and the still-retrying distributed
write supersedes it once quorum is reached (CDC round-trip, newer `updated_at` wins).

- Primitive: `applyLocalPriorityOperationProgressRow` — `src/rebalancer/replica-operation-repository-row-methods.js:196`
- Decision seam (distributed-write `catch` → local path): `src/rebalancer/operation-workflow-transition-persistence.js:146-160`
- Gate predicates: `isPriorityControlPlanePartition` + `isOperationLocallyOwned`
  (`replica-operation-repository-row-methods.js:197-207`). **NOT seed/leader-only** —
  it is **owner-local + priority-scoped**. Owner = the op's source/target node, not a
  Raft role. It is seed-dominated *de facto* during formation only because the seed
  owns those ops then.

**Safety invariant that makes it correct (do not break it):** the seeder both *owns*
the op and is *driving the durable retry to quorum*, so the local row is provisional
and self-supersedes. Safe specifically because of **owner-identity + self-supersession
+ LWW/tombstone fence**, NOT because of leader status.

## The write-wedge path to target

Join `querying_state` writes (`src/bootstrap/phases/query-system-state-phase.js:219` →
`registerNodeInCluster`) flow:
`NodeRegistrationOwner.registerNodeInCluster` (`src/bootstrap/shared/node-registration-owner.js:40`)
→ `upsertSystemTableRowWithRetry` (NODES / NODE_ENDPOINTS / SERVICE_ENDPOINTS)
→ `MembershipPublicationRuntimeOwner.upsertJoinNode/Endpoint` (`src/control-plane/owners/membership-publication-runtime-owner.js:136-155`)
→ `controlPlaneSystemTableGateway.submitMutation`
→ `DistributedWriteCoordinator.executePlan` (`src/query/distributed/distributed-write-coordinator.js`)
→ **`QueryExecutorBase.executeOnPartition` (`src/query/query-executor-partition-delivery.js:34`)** — the single chokepoint; *"Routes ALL queries through message router — no local vs remote distinction"*.
`DISTRIBUTED_PARTICIPANT_FAILURE` is raised in `distributed-write-coordinator.js:288-313`;
`"Failed to persist operation"` = `REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED`.

`replica_operations` rows: `persistNewOperationUnlocked` / `persistOperationUpdate`
(`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:43,122`)
→ `executeReplicaOperationGatewayMutation` → same gateway/coordinator path. The ~20s
balloon is the retry+visibility-confirm budget (`confirmReplicaOperationVisibility`,
same file `:362-423`).

`inFlightReplicaOperations` drain: computed in
`collectCanonicalInFlightReplicaOperationDetails`
(`src/bootstrap/join-readiness-replica-operation-methods.js:34`, reads
`systemTableCache.getAll(REPLICA_OPERATIONS)` + `isReplicaOperationInFlight`
`src/rebalancer/replica-operation-liveness.js:524`). A row drains only when its owner
durably advances it to terminal/settled **and that CDC-propagates into the joiner's
projected cache** — exactly what the wedge prevents.

## Options under discussion

- **Option A — tactical (mirror `64a18b76` at the membership-publication seam).**
  When the joiner's OWN `nodes`/`node_endpoints`/`services` upsert (and the rebalancer's
  self-owned `replica_operations` UPDATE) defers/times out with
  `DISTRIBUTED_PARTICIPANT_FAILURE`, apply an owner-local durable cache seed, superseded
  later by the durable CDC round-trip. `seedJoinTimeCacheRow`
  (`src/bootstrap/shared/node-registration-owner-publication-methods.js:588`) already
  seeds the cache on **success** — extend it to the **deferred/timeout** branch.
  *Trade-off:* surgical, reuses a proven primitive; but only unblocks the joiner's
  OWN-owned rows and rides the membership safety fence (see open questions).

- **Option B — structural (make the joiner a routable local replica fast).** A
  `deliverLocal` fast path ALREADY exists (`src/transport/message-router-delivery-pressure-routing.js:353`,
  `targetNodeId === this.nodeId`) but never engages in formation because the joiner is
  not a routable active replica of the control-plane partitions (single-active-replica =
  seed), so candidates resolve to the seed → `deliverRemote` → timeout. Make joiner
  discovery/control-plane replicas reach routable status fast so writes/reads spread off
  the seed naturally. *Trade-off:* attacks the deepest root (single-replica-on-seed) and
  helps reads too, but larger blast radius (placement/readiness activation) — this is the
  standing "F-structural" lever from [[mgmjf-formation-rebalancer-churn]].

- **Option C — reduce aggregate write VOLUME during formation** (coalesce/batch the
  registration writes; defer non-critical control-plane writers harder). Complementary,
  lower ceiling.

Recommended sequencing: **A first** (lowest-risk, validates the owner-local-seed
hypothesis on the write path), then **B** if A is insufficient. They compose.

## Open questions (block a sealed doneWhen)

- **Membership safety fence (CRITICAL).** Which of `{nodes, node_endpoints, services,
  replica_operations}` are safe to owner-local-seed? The `nodes` **ACTIVE membership**
  row is exactly the "active-membership truth has no owner / single-writer tripwire /
  Raft-term fence" surface ([[membership-single-owner-cutover-plan]],
  [`membership-single-owner-cutover.md`](membership-single-owner-cutover.md);
  `LAGRANGE_MEMBERSHIP_LEADER_DRIVEN`). A joiner durably self-asserting its own ACTIVE
  membership locally may violate that fence even though it "owns" its node row. Likely
  safe: `node_endpoints`, `service_endpoints`, the joiner's own `services` replica rows,
  and self-owned `replica_operations` progress. Likely UNSAFE without the cutover:
  `nodes` ACTIVE/voter status. **Classify per-table before building.**
- Does every target table have the LWW (`updated_at`) + tombstone merge the
  self-supersession guarantee needs? (`replica_operations` does; verify the others —
  `system-table-cache.js` merge `:646-657`.)
- Is the joiner genuinely `isOperationLocallyOwned` for the rows it would seed, AND is it
  the one re-driving the authoritative distributed write to quorum? If not, there is no
  correction path — do not seed.
- Separate co-blocker, NOT L-write: mgmjf also fails non-deterministically at
  `connecting_websocket` with `Self-connection failed: WebSocket connection timeout after
  5000ms` (the self-connect 5s budget exceeded under event-loop saturation). L-write will
  not fix this; it is a second independent saturation failure mode. Decide whether to
  raise/adaptively-scale that WS self-connect timeout or reduce the load that starves it.

## Validation plan (deterministic-first, gate-last)

1. **Reproduce deterministically first** — use the 2-node load-root repro
   ([[load-root-2node-deterministic-repro]]) where a single forming node's own priority
   `replica_operations` write can't land. The fix must drain `inFlightReplicaOperations`
   → 0 there before any gate.
2. **mgmjf** — `npx tap test/integration/message-group-multi-join-formation.integration.test.js`
   from `/home/peter/projects/something` (NOT the /media path — it breaks `npx tap` in
   this shell). Run from that dir. Watch `querying_state` phase duration + whether the
   7th node forms. mgmjf is NON-DETERMINISTIC — never conclude from N=1 (the L-hydrate
   "5→6 nodes" claim was N=1 variance; a 2nd identical run failed at the 5th node).
3. **Rolling-restart gate** — `npm run gate -- 3` first (a clean 3/3 satisfies
   `rolling-restart-core-stability`'s doneWhen), escalate to N≥8 only for a rate verdict.
   Success signals: `convergence_timeout` drops; per-node `joining:readiness-convergence`
   no longer hits the 120s `topology_not_ready` ceiling; wall p50 trends toward 6-7min
   (the calibration 0.2 target). **SAFE every run (0 corrupt/breach/exit/oracle-blind) is
   a hard, never-relaxed invariant** — a wall-time win that breaks safety is a regression.
   Run `npm run analyze:latent-blockers` before queuing a gate.
4. **Subagent-verify** the change before reporting (especially the membership-fence
   safety argument).

## Traps (paid for already — don't re-pay)

- **Research existing first.** `deliverLocal` and `seedJoinTimeCacheRow` already exist;
  the gap is they don't engage on the deferred/formation path. Extend, don't rebuild.
- **No new caches** — reuse the existing system-table-cache + CDC (user directive
  [[avoid-secondary-tertiary-caches]]).
- Read-offload is NOT the lever (two read-offload levers built + refuted; the reads
  funnel to the seed because it's the only routable replica).
- The membership safety fence is real (Raft-term fence is a SAFETY mechanism — don't
  bypass it to chase liveness).

## Decision log

- 2026-06-23 — Scoped from the gate-profiling session. Root pinned: control-plane
  write/establishment path under saturation → `topology_not_ready` 120s timeouts +
  `replica_operations` non-drain. Lever (a) `64a18b76` is the proven owner-local-seed
  pattern to extend. L-hydrate (67f5a10c) shipped as a gate-validated read-path building
  block but is not this lever. Recommended: Option A first, classify the membership
  fence per-table before building.
