---
id: control-plane-write-wedge-leader-local-establishment
roadmapRow: RM-0.1-fs-rolling-restart
status: active
graduatesTo: null
---

> # 🚦 START HERE — RE-GROUNDED 2026-06-24 (supersedes the "extend lever (a)" aim below)
>
> The reactivation banner below aimed the lever at "extend the owner-local-seed primitive
> (lever (a), `applyLocalPriorityOperationProgressRow`) to a WEDGED priority `replica_operations`
> WRITE that won't drain." **Fresh-HEAD gate evidence REFUTES that premise** (two independent
> reads — direct failure-bundle inspection + an adversarial verification subagent, both agree):
>
> Reading the freshest gate's actual failure-bundle (`stat-gate-20260623T183833Z`, the SAME gate
> the reactivation banner cites — but it trusted the STALE `analyze:latent-blockers` peel-order,
> not this bundle):
> - **run1 binding witness** (`summary.failureClassification.signals`): `priorityRecoveryPartition=replica_operations-p1`,
>   `priorityRecoverySemanticState=spread_satisfied_in_flight`, **`priorityRecoveryLatestStep=REMOVED`,
>   `priorityRecoveryLatestStatus=removed`**. The op REACHED the REMOVED terminal transition — which
>   `LAGRANGE_PR_DRAIN_LOCAL_PROGRESS` (orchestration.js:686-704) ALREADY covers. **There is no
>   uncovered write transition for lever (a) to absorb.**
> - **run1 `priorityRecoveryObservation`**: `publicationStatus=PUBLISHED`, `prioritySpreadPending=false`,
>   `priorityPartitionSummary.satisfied=true` (readyEligible 5 / required 3), `priorityRecoveryClosureState=closure_satisfied_fresh`,
>   `pressureState=none`. **The control plane CONVERGES** — it just isn't queryable in time.
> - **The actual scenario-failing assertion** (both runs' `summary.error`, throw at `rolling-restart.js:353-361`):
>   a **30s acknowledged-write visibility query failing "SQL query engine not available"**
>   (`admin-websocket-query-execution-methods.js:327-331`, thrown when `this.sqlQueryEngine` is null).
>   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` is a PARALLEL heuristic label off a benign event-driven
>   wait (all three stability gates `closed`), NOT the throw.
>
> **ROOT (newly localized, under-explored):** the early admin runtime comes up DURING join with
> `sqlQueryEngine: null` (`index.js:262/267` join, `:529/534` seed — the authoritative engine is built
> from post-join artifacts at `index.js:384`). A still-joining node under write-backlog sits in that
> null window for the WHOLE readiness budget, so a visibility query routed to it fails
> `QUERY_ENGINE_UNAVAILABLE` for 30s. This is the literal scenario-failing assertion — which NO prior
> lever (write-wedge / voter-ready / zombie-redrive / spread-unmask) ever targeted.
>
> **LEVER LANDED (commit `9ebbd678`, default-off `LAGRANGE_EARLY_ADMIN_SQL_ENGINE`):** build a
> provisional cache-backed SQL engine for the early admin runtime (`startEarlyAdminSqlRuntime` in
> `entrypoint-runtime-admin-composition.js`), from the node's already-wired single instances
> (messageRouter/cache/partitionServices/owner — all populated by `initializeJoinInfrastructure()`
> before `onLocalAdminRuntimeReady` fires at `node-joining-admission-readiness.js:189`). Superseded
> post-join by the authoritative engine (`attachSqlEngineToAdminRuntime`) then disposed
> (`shutdownEarlyAdminSqlRuntime` → detach + `engine.shutdown()`, per-engine teardown only).
> Flag-off byte-identical. **Subagent-verified SAFE** (no shared-state teardown, no construction
> throw-risk at callback time, read parity between writable-singleton and message-group read-only
> caches, correct dispose ordering on success + join-failure/retry paths). Test
> `test/entrypoint/early-admin-sql-engine.test.js`; startup/admin suites 45/45.
>
> **✅ GATE VERDICT — PROMOTED DEFAULT-ON (commit `f68d1625`; gate `stat-gate-20260624T051927Z`,
> N=3 flag-on):** the dominant 30s `QUERY_ENGINE_UNAVAILABLE` visibility failure is **ELIMINATED**
> (0 occurrences across all 3 runs; it was THE binding scenario-failing assertion in `183833Z`).
> **run2 SCENARIO-PASSED — the FIRST scenario-PASS of this entire rolling-restart campaign** (every
> prior gate was 0/3). **SAFE 3/3** (CORRUPT/ORACLE_BLIND/NODE_EXIT/stale=0), no regression. Flag now
> defaults ON (`isEarlyAdminSqlEngineEnabled` = `!== 'false'`); set `LAGRANGE_EARLY_ADMIN_SQL_ENGINE=false`
> to opt out. (Flag auto-forwards to containers — verified live in `ddb-test-reuse-5-5`.)
>
> **NEXT FRONTIER (the honest residual, re-aimed):** runs 1 & 3 now fail on **`operation_drain_stalled`**
> (`rootCauseClass=topology`; signals `replica_operations_in_flight` + `critical_system_spread_open`
> + `operation_drain_stalled`) — a control-plane **quiescence stall**: a surplus/critical-system
> partition's drain doesn't settle within the 30s quiescence window. This is the genuine remaining
> PASS blocker (the surplus-drain + voter-ready-spread family — see the "ROOT CONSOLIDATED" /
> "ROOT REFRAMED" decision-log entries below, and `LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY` e975054c).
> NOT the refuted write-wedge, NOT the engine path. **Don't re-aim at "extend lever (a)" (op reached
> REMOVED) or the early-admin engine (now landed).** Belongs to `rolling-restart-core-stability` /
> topology-convergence-hardening; doneWhen needs 3 consecutive scenario-PASS (now 1/3).
>
> ---
> <details><summary>Superseded 2026-06-24 REACTIVATION banner (provenance)</summary>

> # 🚦 START HERE — REACTIVATED 2026-06-24 (this is the LIVE rolling-restart frontier)
>
> The frontier has come **full circle back to this epic.** The two heads it previously pivoted
> through are now cleared, so the control-plane WRITE-WEDGE is once again the genuine dominant
> blocker:
> - **slow-rejoiner remove-safety wedge** → RESOLVED (R1+R3 landed + promoted default-ON, gate
>   `stat-gate-20260623T164130Z`). See [`slow-rejoiner-progress-or-evict.md`](slow-rejoiner-progress-or-evict.md).
> - **`leadership_unstable` (Head A of [`convergence-timeout-leadership-settle.md`](convergence-timeout-leadership-settle.md))**
>   → diagnosed as raft leader-map churn from load-driven critical-system replica migration; the C-2
>   incumbency-stickiness lever (`LAGRANGE_PR_PRIORITY_INCUMBENT_STICKINESS`, commit 8fa06823) is landed
>   **flag-off but UNVALIDATED** (N=3 gate `stat-gate-20260623T183833Z` showed it did NOT mechanistically
>   engage — the apparent `leadership_unstable` absence was N=3 variance). **Do NOT get pulled into C-2; it
>   is a parked side-thread** with its own documented next step in that epic's decision-log.
>
> **CURRENT DOMINANT BLOCKER (gate `stat-gate-20260623T183833Z`, N=3, SAFE 3/3, PASS 1/3):**
> `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` (runs 1,2). `npm run analyze:latent-blockers` peel-order puts
> it at the latest centroid (0.755), with the deep root `replica_operations_in_flight` (×12) — i.e. an
> `"inFlightReplicaOperations":1` priority `replica_operations` row that won't drain, burning the 120s
> `joining:readiness-convergence` budget. **This is the W-1 write-wedge. It dominates regardless of C-2.**
>
> **CORRECTED TARGET (don't re-pay the refuted lever):** The tactical **Option A** membership-publication
> deferred-seed (`LAGRANGE_JOIN_DEFERRED_SEED`, default-off, landed at
> `node-registration-owner-publication-methods.js:653`) was already built AND **REFUTED** by a mechanistic
> flag-on mgmjf run (0 membership-write engagements — see [[mgmjf-formation-rebalancer-churn]]). The real
> wedge is the **priority-partition control-plane writes** (`control_plane_publications` + `replica_operations`),
> NOT the join-membership rows. So the live lever is one of:
>   1. **Extend the proven owner-local-seed primitive (lever (a), commit `64a18b76`,
>      `applyLocalPriorityOperationProgressRow`) to the WEDGED priority `replica_operations` /
>      `control_plane_publications` write** (the `inFlightReplicaOperations:1` row that won't drain) —
>      the "A on the priority-partition path" lever. See "The mechanism to extend" + "Options" below.
>   2. **Option B — structural:** make the joiner a routable local control-plane replica fast so writes/reads
>      spread off the single-active-replica seed (`deliverLocal` exists at
>      `message-router-delivery-pressure-routing.js:353` but never engages in formation). Deepest root,
>      larger blast radius. [[mgmjf-formation-rebalancer-churn]] calls this the corrected STRUCTURAL lever.
>
> **FIRST CONCRETE STEP (deterministic-first, gate-last):** build a directed below-gate DT repro that
> captures ONE wedged priority `replica_operations` write (the `inFlightReplicaOperations:1` that burns the
> readiness budget) in-process — red without the lever — BEFORE touching code (substrate map:
> `docs/deterministic-directed-testing-plan.md`; the wedge is raised at
> `distributed-write-coordinator.js:288-313` `DISTRIBUTED_PARTICIPANT_FAILURE`; the drain is read by
> `collectCanonicalInFlightReplicaOperationDetails`, `join-readiness-replica-operation-methods.js:34`).
> Then implement lever 1 or 2 flag-off, **subagent-verify the write-quorum/owner-identity safety invariant**
> (owner-identity + self-supersession + LWW/tombstone fence — see "The mechanism to extend"), then `npm run
> analyze:latent-blockers` and an N=3 gate vs the `183833Z` baseline (success = `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
> drops + PASS rises, SAFE 3/3 hard-held). All file:line below verified at HEAD `67f5a10c` / re-verify at
> `6ef60d36`+ — POSITIONAL, re-grep before trusting.
>
> ---
> <details><summary>Superseded 2026-06-23 PIVOT banner (provenance)</summary>
>
> ⛳ **PIVOTED 2026-06-23 → [`slow-rejoiner-progress-or-evict.md`](slow-rejoiner-progress-or-evict.md).**
> This epic's lever family (owner-local write establishment) was EXHAUSTED at the time: 6 SAFE default-off
> levers built, none the scenario-PASS lever; the consolidated root was the slow rejoiner `7493b0ab`
> un-drainable via a coupled remove-safety defer cluster. That head is now RESOLVED (R1+R3), so this epic
> is reactivated above.
> </details>
> </details>

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

- **Membership safety fence — RESOLVED 2026-06-23 (subagent classification, file:line).**
  All three join-time tables — `nodes` (incl. status/voter fields), `node_endpoints`,
  `services`/`service_endpoints` — are **SAFE** to owner-local-seed **without** the
  membership single-owner cutover. The B4 / `LAGRANGE_MEMBERSHIP_LEADER_DRIVEN` fence
  guards **`control_plane_publications`** (the membership *projection*, single Raft-leader
  writer at `membership-publication-coordinator-reconcile.js:57-63`), **not** the raw
  `nodes`/`services` rows. A local cache seed via `createBootstrapCacheHydrationApplier`
  emits **no outbound CDC** (`bootstrap-cache-hydration-applier.js:10-14` → in-process
  listeners only), and cross-node active-membership truth is computed by the publication
  leader from durable rows (`resolveActiveNodeViews()`), with raw `nodes.status` only one
  subordinate local-fallback input and voter role deriving from Raft `getTrackedReplicaRole`
  — so a joiner **cannot leak voter/active status** by seeding its own row. Extra belt:
  the join `nodes` seed sets `ready_lease_expires_at: null`
  (`node-registration-owner.js:104`), so even the local projection won't treat the seeded
  node as ready (`isNodeRecordReady` requires a live lease, `node-readiness-policy.js:160-168`).
  The fence is real but **orthogonal**. (The earlier "`nodes` likely UNSAFE" guess is retracted.)
- **LWW/tombstone merge — RESOLVED (same pass).** The cache merge (`applySystemTableChange`)
  applies the tombstone fence + LWW (`isStaleForExistingRecord`, in
  `system-table-cache-row-merge.js:33-69` — relocated from the cited `system-table-cache.js:646-657`,
  which is only the tombstone half) **generically for all tables** — no per-table exclusion.
  **Caveat to honor when building:** the join row-builder sets only `created_at`, not
  `updated_at`/`updated_at_hlc` (`node-registration-owner-row-builder.js:33-34`); LWW falls
  back to `created_at`. **The deferred seed MUST stamp `updated_at`/HLC** so the later
  durable CDC row deterministically wins the supersession on equal-ms ties.
- **Post-join re-drive — RESOLVED 2026-06-23 (subagent, file:line). The build MUST add
  re-drive for two of the three tables.** Verdict per table:
  - **`nodes` — SAFE as-is.** The 5s `HeartbeatService` (`heartbeat-service.js:72-73`,
    loop `heartbeat-service-lifecycle-methods.js:304`) sends `NODE_STATE_UPDATE` carrying the
    full `nodeRow` (`node-joining-publication-activation.js:386-401`); the handler does a
    durable `updateSystemTableRow(NODES)` and on `affectedRows===0` calls
    `tryBootstrapMissingNodeStateUpdateRow` → durable `upsertSystemTableRow(NODES, baseRow)`
    (`replica-dispatch-state-publication.js:212,421`). So a locally-seeded `nodes` row is
    re-established durably within ~5s. (Falsifier to add: the upsert is gated on
    `existing?.[NODE_ID]` falsy + valid node_address at `:404-413` — holds for a never-durably-
    written joiner; guard a regression test.)
  - **`node_endpoints` — PARTIAL.** Heartbeat re-UPSERTs the row durably
    (`heartbeat-service-publication-methods.js:198-203`) but gated by `endpointRefreshIntervalMs`
    = **300000ms / 5 min** (`heartbeat-service-constants.js:19`) unless the signature changes →
    a seeded-only row can stay local-only ~5 min. **Build must force an immediate first durable
    re-upsert when a row was seeded-not-durable.**
  - **`service_endpoints` — NO re-drive (correctness hole).** The 3 meta rows are written once
    at join (`meta-service-definition-registration.js:152`); the heartbeat loop never touches
    `service_endpoints` and no periodic durable writer exists (the `endpoint-sync-*`/
    `runtime-endpoint-writer` paths only READ or are event-driven). **Build MUST add a coalesced,
    refresh-gated `upsertSystemTableRow(SERVICE_ENDPOINTS,…)` for the node's own meta endpoints —
    smallest hook is the existing 5s heartbeat `sendHeartbeat` loop that already holds the gateway
    and re-upserts `node_endpoints`.**
  - Note: `seedJoinTimeCacheRow` is a pure LOCAL cache touch (`…publication-methods.js:588-608`);
    the gateway has no cache-only write path, so a real re-drive MUST go through the gateway, not
    the seed. The membership-publication-coordinator reconcile (5s) re-drives
    `control_plane_publications` only — NOT these three raw tables.
- **PRE-FLAG-PROMOTION HARDENING (from increment-1 subagent verify).** The deferred NODES
  seed currently uses the proven success-path row shape (created_at-only ordering). Subagent
  flagged that supersession then relies on wall-clock `updated_at` ordering and is sensitive
  to owner-clock *negative* skew (bounded, self-correcting via the 5s heartbeat re-stamp — not
  a permanent pin, but a convergence-latency risk). Before flipping the flag on by default,
  stamp the provisional seed with a deliberately-LOW ordering key (low `updated_at`, or an old
  `updated_at_hlc`) so the first authoritative durable row wins immediately regardless of skew.
  Keep `last_heartbeat = now` (local liveness) — only the LWW ordering key should be lowered.
  Audit nodes-row consumers for a low `updated_at` before applying. (Also: `isRetryableControl
  PlaneError` includes the very broad `'closed'` fragment — same predicate the retry loop uses,
  so no new risk, but note the wide net.)
- Separate co-blocker, NOT L-write: mgmjf also fails non-deterministically at
  `connecting_websocket` with `Self-connection failed: WebSocket connection timeout after
  5000ms` (the self-connect 5s budget exceeded under event-loop saturation). L-write will
  not fix this; it is a second independent saturation failure mode. Decide whether to
  raise/adaptively-scale that WS self-connect timeout or reduce the load that starves it.

## Validation plan (deterministic-first, gate-last)

1. **Reproduce deterministically first.** ⚠️ The 2-node `node-join-convergence-slo` repro
   is **CONTAMINATED — do not rely on it** (re-verified 2026-06-23): its failure is
   `sqlQueryEngine not provided` (transient seed pre-hydration / shutdown noise — both
   seed AND joiner self-wire the engine; the prior "joiner-left-null wiring gap" framing is
   REFUTED), NOT the membership write-wedge. **Build a fresh directed deterministic test
   instead**: a focused unit/integration test that injects a retryable
   `DISTRIBUTED_PARTICIPANT_FAILURE`/timeout on `upsertJoinNode/Endpoint`
   (`membership-publication-runtime-owner.js:136-155`) and asserts (a) the local cache row
   is seeded with a stamped `updated_at`/HLC, (b) the join phase proceeds without consuming
   the full `joinAdmissionWriteRetryTimeoutMs` budget, (c) a later durable row supersedes the
   seed via LWW. This avoids the contaminated test and directly exercises the L-write seam.
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

## ⚠️ RE-GROUNDING 2026-06-23 — mgmjf wedge is NOT the join membership writes (mechanistic, N=1)

A mechanistic mgmjf run with `LAGRANGE_JOIN_DEFERRED_SEED=true` (increments 1+2a active)
produced a decisive signal that **refutes the epic's core premise that the join
`querying_state` membership writes (nodes/node_endpoints/service_endpoints) are the mgmjf
wedge**:
- **0** deferred-seed engagements (`"deferred under saturation"` log) and **0** membership-table
  (nodes/node_endpoints/service_endpoints) write failures — the membership writes succeed
  within the short budget; they do NOT defer or fail under mgmjf load.
- All control-plane write failures were on the **priority partitions**: `control_plane_publications`
  (×36, the dominant), `replica_operations` (×8), plus `sql_write_operations` /
  `sql_transaction_participants` (rebalance-coordinator "Failed to persist operation",
  ROUTER_MESSAGE_TIMEOUT / "Query timeout after 1ms" to the starved seed
  `…440600/partition/…-r1`). This matches the load-root memory's list of 5 wedged priority
  partitions — NOT the join registration writes.

**Implication:** L-write increments 1+2a (membership-table deferred-seed) are CORRECT, SAFE,
unit-verified, and committed (a legitimate building block that hardens the join membership-write
path — likely relevant to the rolling-restart membership-publication wedge under rejoiner load),
**but they do NOT address the mgmjf wedge.** The binding mgmjf write-wedge is the control-plane
**priority-partition** writes — i.e. lever-(a) territory (`replica_operations`,
`applyLocalPriorityOperationProgressRow`, commit 64a18b76) extended to the OTHER priority
partitions — with the hard caveat that `control_plane_publications` is the **B4-fenced**
single-leader membership-projection table and CANNOT be owner-local-seeded without violating the
membership single-owner fence. So the real lever is closer to: extend lever (a)'s deferred-local
progress to the non-fenced priority partitions (`sql_transactions`, `sql_transaction_participants`,
`sql_write_operations`) and/or break the circular sub-quorum dependency that keeps those partition
writes routing to the starved seed (the standing structural Option B / [[circular-dependency-class-formation-vs-steady-state]]).
**Caveat:** N=1; the *which-tables-fail* signal is mechanistic and robust, but confirm with a
repeat run + the latent-blocker analyzer before fully re-committing the lever. **Do NOT build
the service_endpoints heartbeat re-drive (increment 2b) for mgmjf's sake — the data says it
won't move mgmjf.**

## CONFIRMATION PASS 2026-06-23 — re-grounding DECISIVELY confirmed; re-aimed lever ranked

Ran the confirmation pass (the deterministic/mechanistic check before re-committing the lever):
- **`npm run analyze:latent-blockers`** (N=**284 runs / 145 gates**, pass 0.31) — dominant blockers:
  `publication_missing_active_node` ×18, `convergence_timeout` ×28, `replica_operations_in_flight`
  ×12, `publication_epochs_disagree` ×16, `nodeSlotUnavailable` ×23, `priority_recovery_*`
  (×7+8+5+2), `priority_partitions_not_spread`. The join membership-table registration writes
  **do not appear as a blocker reason at all.** Cluster = **publication path
  (`control_plane_publications`) + priority-partition/rebalancer path (`replica_operations`/`sql_*`)**.
- **mgmjf N=2** (flag-on AND flag-off) — same wedge both runs: `control_plane_publications`
  ×83/×45 + `replica_operations` ×33/×9 dominant; membership-table writes negligible (0/2).

Verdict: **L-write (join membership deferred-seed) is confirmed NOT the lever** for mgmjf or the
rolling-restart corpus. Increments 1+2a stay as a safe default-off building block. The re-aimed
lever is the **surplus-drain priority-recovery op never draining → `convergence_timeout`**.

### Ranked lever (from the pre-computed census `test-output/latent-blocker-census-run3.json`, 48→4 survivors)
All 4 survivors are facets of the surplus-voter-never-drains wedge. Two peel-0 product-bugs, both
**verified LIVE at HEAD**:
1. **`pr-terminal-persisted-zombie-no-redrive`** (rank 1, product-bug, fixRisk med). Actuation
   `IN_FLIGHT_OPERATION` (`priority-recovery-snapshot-actuation.js:62`) fires BEFORE
   `TERMINAL_OPERATION` (`:87`) → split-context witness: one context drives
   `actuation.state=persisted_not_dispatched` while the latest context's terminal workflowStep
   resolves phase=TERMINAL (`priority-recovery-snapshot-observation.js:143-144`). Every re-drive
   predicate AND-gates on `actuation.workflowProgressPhaseId===DISPATCH_PENDING`
   (`operation-workflow-recovery-reconcile-dispatch-pending.js:418-425`) → `dispatchPending=false`
   → `resolvePriorityRecoveryDispatchPendingReentryState` (`:437`) → NOT_DISPATCH_PENDING → SKIP →
   op never re-armed (~229s past deadline). **Fix:** treat `persisted_not_dispatched` + terminal
   phase + passed `deadlineMs` as reconcilable stale — a coordinator-timer reconcile that
   re-dispatches/retires-and-reissues (the fix-sketch's `reconcileCompletedSyncingOperations`
   sibling name is STALE — find the current timeout-reconcile hook in
   `operation-workflow-recovery-timeout.js`), or let the dispatchPending predicate accept
   TERMINAL phase when `actuation.state=persisted_not_dispatched`.
2. **`rebalancer-surplus-remove-deferred-behind-adds-circular`** (peel-0, product-bug). Move-planner
   drops the SPREAD_REPLICAS surplus REMOVE whenever any ADD move is present (`addMoves>0` filter
   ~`:655-661`), so during ADD-heavy recovery the surplus voter never drains. **Fix:** promote the
   surplus REMOVE to 'critical' (survives the filter) when over-target beyond a threshold.
   (#3 `dp-surplus-remove-replace-transport-and-2pc-failure-loop`, #4 oracle-strictness
   `pr-spread-satisfied-in-flight-masks-stuck-surplus` are peel-1 layers.)

### Diagnostic tension to resolve FIRST (don't skip)
The newer 2026-06-20 N=8 memory ([[rolling-restart-donewhen-real-blocker]]) diagnoses the SAME
surplus-drain stall as the **LOAD / distributed-write-backpressure root**: the surplus REMOVE's
terminal `replica_operations` row write FAILS `DISTRIBUTED_PARTICIPANT_FAILURE` under rejoiner load
(the durable write can't land), and claims "REMOVEs actually COMPLETE" — which partially conflicts
with the census's "zombie never re-driven (gating bug)". These may be sequential layers (write
fails under load AND re-drive is gated out) or competing diagnoses. **Resolve empirically before a
fix:** (a) build the census-designed deterministic falsifier (unit on
`resolvePriorityRecoveryDispatchPendingReentryState` / `buildPriorityRecoveryDispatchPendingReentryEvidence`
with `actuation.state=persisted_not_dispatched` + `workflowProgressPhaseId=terminal` + passed
deadline; assert it currently resolves NOT_DISPATCH_PENDING = bug reproduced) — harness to reuse:
`test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js` (real snapshot
builders), and (b) the census flags run3 as PREDATING current HEAD — consider re-running the
census fan-out (`.kiro/epics/latent-convergence-blocker-census.md`) to refresh the frontier.
NOTE: this lever belongs to the `rolling-restart-core-stability` quest / `topology-convergence-
hardening` epic, not this L-write epic.

### UPDATE — falsifier + flag-gated fix LANDED (2026-06-23)
- **Falsifier** `test/rebalancer/priority-recovery-terminal-persisted-zombie-redrive.test.js`
  (commit fc2b28e9) empirically confirmed the gating bug LIVE at HEAD: the SAME
  `persisted_not_dispatched` op re-enters under DISPATCH_PENDING but is stranded
  (NOT_DISPATCH_PENDING → SKIP) under TERMINAL — phase is the sole discriminator.
- **Census-vs-LOAD tension RESOLVED:** `persisted_not_dispatched` = the durable WRITE
  succeeded but the DISPATCH never happened. So this is a DISTINCT bug from the 06-20
  LOAD-write-failure mode; re-arming re-attempts the dispatch (not a failing write).
  Likely necessary-but-not-sufficient (like lever a) — the dispatch can still time out
  under load (mgmjf ROUTER_MESSAGE_TIMEOUT on `coordinator_created_remote_handoff`).
- **Fix** (commit 54843bb4, default-off `LAGRANGE_PR_ZOMBIE_REDRIVE`): new evidence flag
  `staleTerminalDispatchable` (persisted_not_dispatched + terminal phase + `timeoutReconcileDue`
  + no-active-handoff-retry backoff) → state-table entry STALE_TERMINAL_REDRIVE (before the
  NOT_DISPATCH_PENDING skip) → ARM_NOW. 8/8 falsifier + 386/386 reentry suites; flag-off
  byte-identical. Subagent TRUSTED-WITH-CAVEATS: NO destructive double-execute
  (`armCoordinatorCreatedOperation` re-reads authoritative state + SKIPs on a genuinely-
  terminal op; lifecycle dispatch step-sets are disjoint from terminal steps). Caveat:
  efficacy (does ARM_NOW actually drain the surplus voter) rests on the gate run.
- **Gate validation DONE — fix is SAFE but INEFFECTIVE; gate pinpointed the REAL binding
  witness (stat-gate-20260623T100334Z, flag-on N=3).** passed=FALSE all 3 (dominantReason
  `convergence_timeout`, verdictReason `topology_progress_blocked`), but SAFE every run
  (CORRUPT/ORACLE_BLIND/NODE_EXIT/stale=0 — no regression) and convergeRate=1 (missing=0).
  The rank-1 fix NEVER engaged (`stale_terminal_redrive`=0) — and the gate revealed WHY.
- **BINDING WITNESS (all 3 runs):** the dominant stuck op is `spread_satisfied_in_flight`
  every run (run1 control_plane_publications-p1, run2 replica_operations-p1 stepAge **180s**,
  run3 sql_transaction_participants-p1 stepAge **92s**), under `transportPressureState:
  write_backlog` (pendingWrites ~515, growing). Runs 1–2 ARE the exact rank-1 zombie state
  (`actuationState=persisted_not_dispatched` + `phase=terminal`) — yet the fix didn't fire
  because **`spread_satisfied_in_flight` is a DRAIN-COMPLETION state that signs the op off
  UPSTREAM of the dispatch-pending reentry path** (it's in
  `PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_COMPLETION_STATES`). So the MASK (census survivor
  #4 `pr-spread-satisfied-in-flight-masks-stuck-surplus`) short-circuits before the gating fix
  (#1) can run. The census `maskedBy` relationship is **empirically confirmed: #4 masks #1**,
  over a `write_backlog` LOAD root.
- **RE-AIMED LEVER (peel order):** (1) census #4 — add a staleness guard to
  `spread_satisfied_in_flight` so a stalled surplus (stepAgeMs >> stepTimeoutMs; note
  stepTimeoutMs=0 in runs 1/3 ⇒ guard must handle the no-deadline case) is promoted to a
  stalled/unresolved state that stops the closure signing off AND routes to re-drive; THEN
  (2) the rank-1 re-drive (now reachable) + (3) the `write_backlog` / distributed-write-
  backpressure root (the op is dispatched/persisted but its writes can't drain — pendingWrites
  growing). The rank-1 fix stays committed default-off as a building block for step 2.
  Belongs to `rolling-restart-core-stability` / `topology-convergence-hardening`.
- **Census #4 deep-dive (2026-06-23): it is a multi-site PEEL, not the closer.**
  `spread_satisfied_in_flight` is signed off independently by THREE classifiers — semantic-state
  (`priority-recovery-snapshot-ingress.js:322-327` `resolvePriorityRecoverySemanticState`),
  completion-state (`priority-recovery-completion.js:177`), and the drain-completion short-circuit
  set (`operation-workflow-recovery-reconcile-dispatch-pending.js:111`) — so a staleness guard must
  thread a stall signal (use `resolvePriorityRecoveryWorkflowStepAgeMs >= fixed-threshold`;
  `stepTimeoutMs=0` ⇒ no per-step deadline; flag-gate) through all three. Even done it only renames
  `convergence_timeout → operation_stalled` + un-masks for re-drive; the op STILL can't drain under
  `write_backlog`, so **#4 does NOT PASS — it peels to the write_backlog root.** THE BINDING PASS
  LEVER is the **`write_backlog` / surplus-drain distributed-write-backpressure** itself (task #11):
  diagnose why the surplus-drain priority-partition writes won't drain; candidate = census survivor
  #3 (bound/re-plan/abandon the surplus drain cleanly — it's over-provision) OR make the quiescence
  oracle tolerate a stable over-target surplus. FIRST read the convergence/quiescence assertion to
  learn whether PASS REQUIRES exactly-target (i.e. whether abandoning the surplus could ever PASS).
- **DECIDED + BUILT (2026-06-23): the surplus MUST drain (can't abandon) → lever-(a) extension.**
  The oracle tolerates over-target only ≤`MAX_SUSTAINED_OVER_TARGET_MS=120000`
  (`test/distributed/harness/constants.js:79`), so PASS requires the surplus to actually DRAIN —
  abandoning it can't PASS. The drain op can't advance because its source-removal/terminal writes
  are write-backlogged, and lever (a)'s deferred-local-progress only covered CREATING. **Extension
  LANDED** (commit bb2a6ca2, default-off `LAGRANGE_PR_DRAIN_LOCAL_PROGRESS`): cover the surplus-drain
  ACTIVE(+REPLACE source-removal) + REMOVED transitions. Subagent-verified it genuinely drains the
  voter (the real REMOVE_REPLICA is dispatched off the LOCAL cache-resident ACTIVE op-row, so
  local-committing ACTIVE keeps the removal alive) — NOT a false-drained mask. Harness
  `priority-dispatch-deferred-local-progress-drain-coverage.test.js` 10/10; 823/825 transition
  suites; flag-off byte-identical. **Gate-validating now** (drain + zombie-redrive flags, N=3).

## ⚠️ CORRECTION 2026-06-23 (2nd gate) — census #4 (spread_satisfied_in_flight) is THE consistent binding mask, NOT a peel. The built levers don't engage.

Second gate (stat-gate-20260623T111430Z, flags `LAGRANGE_PR_DRAIN_LOCAL_PROGRESS` +
`LAGRANGE_PR_ZOMBIE_REDRIVE`, N=3): passRate **0/3** again; SAFE every run (no regression);
convergence_timeout dropped ×3→×1 but that's **N=3 variance** (run1 convergence_timeout, run2
nodeSlotUnavailable, run3 admin_reachability_refused), **NOT lever-attributable** — BOTH levers
engaged **0 times** (across 6 runs / 2 gates now). 

**The consistent binding factor across EVERY dominant convergence_timeout witness in both gates
is `semanticStateId: spread_satisfied_in_flight`** (the census #4 mask), over a WAITING op
(`nextRequiredAction: wait_for_operation_progress`, event-driven) — the specific sub-state VARIES
(gate-1: terminal + write_backlog; gate-2 run1: dispatch_pending + pressure none, stepAge 0). 

**This REFUTES my earlier "deprioritize #4 as a peel" call.** The levers (rank-1 zombie-redrive,
drain-extension) engage 0× precisely because **#4 signs the op off as "satisfied" UPSTREAM of every
re-drive path** — so they never get the chance to fire. #4 is the consistent MASK that (a) makes the
closure time out (false sign-off on a still-waiting op) and (b) blocks all re-drive. Fix #4 FIRST;
the other levers compose beneath it for the write_backlog/terminal sub-cases.

**Meta-lesson (operational-ground-truth): the gate is too NOISY to validate a narrow-condition
lever at N=3** (the binding reason varies run-to-run across the masked-blocker distribution; my
levers' preconditions weren't met in 6 runs). The census epic's own doctrine applies: "the gate is
the FINAL integration check, not the falsifier — confirm/kill candidates BELOW it." The proper
validation for #4 (and the re-drive levers) is a **DIRECTED deterministic repro** (DT4/5/6 substrate)
that FORCES `spread_satisfied_in_flight` over a stalled in-flight op — not the noisy gate.

**Re-aimed: build census #4 (un-mask `spread_satisfied_in_flight` when the in-flight op is stale)
as THE binding lever**, validated below the gate via a directed DT repro. The 3 built levers
(L-write, zombie-redrive, drain-extension) remain SAFE default-off building blocks that compose
once #4 un-masks. See task #10 (now re-prioritized) + #11.

➡️ **FRESH-AGENT START-HERE handoff:**
[`.kiro/epics/spread-satisfied-in-flight-staleness-unmask.md`](spread-satisfied-in-flight-staleness-unmask.md)
— self-contained scope for census #4 (exact 3 classifier seams + file:line, the staleness signal,
the flag, the directed-DT-repro validation plan, and how the 3 built levers compose). A fresh agent
can start there directly.

## 🔬 INVESTIGATION 2026-06-23 (subagent, file:line + failure-bundle) — the residual binder is a REDUNDANT NO-OP REPLACE, not a genuine write-wedge. READ FIRST.

Deep trace of run2's binding op (`7bad1358`, REPLACE on `control_plane_publications-p1`) REFRAMES it:
- **It is redundant.** A sibling REPLACE `418f3a09` on the SAME partition already reached terminal and
  satisfied 3-node spread (`spreadGap: 0`, `removeSafetyState: converged`) BEFORE `7bad1358` was created.
  `failure-bundle.json` `witnessIds: [418f3a09, 7bad1358, …]` confirms two co-located REPLACE contexts.
- **The "phase=terminal + steps planned" witness is a SELECTOR-SPLIT artifact**, not a real terminal:
  `priority-recovery-dispatch-snapshot.js:346-352` derives `workflowProgressPhaseId` from the MAX-timestamp
  context (the terminal sibling `418f3a09`) while `actuationState`/`operatorId` are pinned to the PENDING
  `7bad1358`. The witness step list defaults un-tracked steps to `planned` (`topology-operator-witness.js:204-222`).
- **Why it can't dispatch:** the op's owner-node IS its `targetNodeId` (`replica-operation-repository-row-methods.js:131-166`,
  `isPriorityReplace`→targetNodeId), so dispatch is a remote wake to `35a891b8` (`operation-workflow-owner-handoff-state.js:206-302`,
  `deliverySource: coordinator_created_remote_handoff`). That target is `connecting`/`reconnecting` ~40/41 samples →
  `ROUTER_CONNECTION_CLOSED`/"Message not acknowledged" → deferred forever at 1s cadence
  (`operation-workflow-dispatch-rearm-evidence.js:742-816`). **No abandon fires**: `shouldStop`
  (`dispatch-rearm-evidence.js:673-718`) needs `stepTimedOut`, but `stepTimeoutMs=0` (no per-step deadline) → spins
  indefinitely. The 506 `coordinator_created_remote_handoff` are cluster-wide defer churn (only **2** for this op);
  108 are on `sql_write_operations-p1`.
- **B4 note:** `control_plane_publications` is single-Raft-leader-writer; the spread-satisfied classification
  (`priority-recovery-completion.js:162-211`, `priority-recovery-snapshot-closure.js:405-407`) already SIGNS the op
  off as done (reporting) but **never RETIRES the un-dispatched `replica_operations` record** → it lingers.

### ⤷ MECHANISM FULLY PINNED 2026-06-23 (the lever is REDUNDANT-REPLACE RETIREMENT, not superseded-target)
Traced why the existing retirement never fires for `7bad1358` (file:line):
- The drain snapshot's `ownerAction` = `WAKE_REMOTE_OWNER` (owner-node = the op's `targetNodeId` `35a891b8`,
  resolved by `replica-operation-repository-row-methods.js:131-166` `isPriorityReplace`→targetNodeId). The
  timeout-reconcile loop (`operation-workflow-recovery-timeout.js:194-207`) calls
  `wakePriorityRecoveryRemoteOwnerFromDrainSnapshot` FIRST and `continue`s when a wake retry is active
  (`operation-workflow-recovery-drain.js:446-450 → return true`). **So the op perpetually tries to wake its
  DISCONNECTED remote owner and NEVER reaches any retirement branch.** (`isOperationTerminal` is false — the
  record is PENDING/persisted_not_dispatched — so the `:195` terminal-skip does not apply; phase=terminal is the
  selector-split artifact, not the record status.)
- The existing `SUPERSEDED_TARGET` retirement (`drain.js:94-142`) requires the target to be EXCLUDED from
  eligibility (`RECOVERY_ELIGIBLE_EXCLUDED` blocker AND target ∉ eligibleNodeIds). `7bad1358`'s target is still
  ELIGIBLE — just UNREACHABLE — so it is NOT a superseded target. The op is **redundant** (spread already
  satisfied by sibling `418f3a09`), a distinct condition with no existing retirement path.

**THE LEVER (precise, safety-sensitive — deserves its own focused cycle):** add a **redundant-REPLACE retirement**:
when a priority REPLACE is un-dispatched (`persisted_not_dispatched`/PENDING), its partition spread is already
satisfied (`spreadGap=0`) with remove-safety converged **by replicas independent of THIS op's target**, AND its
remote owner is unreachable (`WAKE_REMOTE_OWNER` perpetually deferring / N wake failures), retire it
(`failOperation`/cancel its own `replica_operations` row — B4-safe, no control_plane_publications write) INSTEAD
of the `WAKE_REMOTE_OWNER` continue. Gate it in the timeout-reconcile loop BEFORE the wake branch
(`operation-workflow-recovery-timeout.js:200-207`), flag-gated default-off.
- **Safety bar (high):** must confirm the 3-distinct-node spread holds WITHOUT counting this op's target (else
  retiring breaks spread). Reuse the completion/remove-safety contract (`removeSafetyState: converged`,
  `spreadGap: 0` already in the witness) — do NOT recompute spread truth locally. Subagent-verify the predicate.
- **Falsifier (below-gate):** two-context fixture — terminal sibling provides 3-node spread + a PENDING redundant
  REPLACE whose target is eligible-but-unreachable; assert flag-on retires it (not WAKE_REMOTE_OWNER spin),
  flag-off byte-identical, and a NON-redundant un-dispatched REPLACE (spreadGap>0) is NEVER retired.
- Composes with (b) wedged-handoff abandon for the general unreachable-owner case.

### Ranked lever (subagent recommendation) — RETIRE the no-op first
1. **(c) RETIRE the redundant un-dispatched REPLACE — RECOMMENDED, smallest, B4-safe.** When an authoritative
   sibling has already satisfied spread+remove-safety (spreadGap=0, removeSafetyState=converged) and this op is
   `persisted_not_dispatched`/PENDING, retire (mark terminal/cancel) the record instead of dispatching it. The op
   record is a `replica_operations` row (NOT the B4-fenced control_plane_publications table), and retiring a
   never-dispatched op needs no control_plane_publications write → B4-safe. Extend the existing spread-satisfied
   classification from a reporting short-circuit to record-level retirement. **B4 caveat: retirement must be driven
   by the proper authority (write-leader / owner), not an arbitrary owner-local terminal mark.** Deterministically
   testable below the gate (two-context priority-recovery snapshot fixture: one terminal, one PENDING, spreadGap=0).
   ⚠️ Research existing supersession machinery first (`buildPriorityRecoverySupersededOperationIdSet`,
   `priority-recovery-superseded-target.js`) — extend, don't rebuild.
2. **(b) Wedged-remote-handoff abandon (B4-safe, broader class).** `shouldStop` is inert at `stepTimeoutMs=0`; add an
   N-timeouts / age-past-threshold abandon to `buildCoordinatorCreatedRemoteHandoffTimeoutDecision` so a handoff
   spinning on a `connecting` target is re-planned/abandoned. Stops the spin for the general case; pairs with (c).
3. **(a) Structural Option B (largest, defer).** For LEGITIMATE priority REPLACEs the owner=target must become a
   routable connected voter before it can own dispatch — formation-ordering change, high effort. Defer behind (c)+(b).

## 🎯 GATE VERDICT 2026-06-23 (`stat-gate-20260623T131412Z`, all 3 levers, N=3) — convergence ADVANCED; residual = the STRUCTURAL publication remote-handoff write-wedge. READ FIRST.

With the zombie-redrive blind-spot fix (`c1f6d34f`) on top of census-#4 + drain-extension:
- **3/3 CONVERGED, missing=0 every run** (convergeRate 2/3→3/3; suggestive at N=3, not proven) and
  **`publication_missing_active_node` is GONE** (was the previous gate's run3 binder on
  `sql_write_operations-p1`). SAFE every run (CORRUPT/ORACLE_BLIND/NODE_EXIT/stale = 0).
- **Scenario-PASS still 0/3** (`topology_progress_blocked`) — the consistent fact across both gates.
  Residual dominant reasons: `priority_recovery_workflow_progress_event_driven` ×2, `…_retry_scheduled` ×1.

**The residual binding op (run2 witness) is now sharply localized and is NOT a re-drive-gap:**
a `REPLACE` op on **`control_plane_publications-p1`** (B4-fenced membership-projection table),
`persisted_not_dispatched` + `phase=terminal` + `stepAgeMs=188060` + `transportPressureState=write_backlog`,
target node `35a891b8`. Its step list shows `terminal` current while `dispatch_pending`/`target_creation`/
`target_sync`/`source_removal` are ALL still `planned` — the split-context zombie (terminal phase, work
never dispatched). Run2 logs: **506 `coordinator_created_remote_handoff` + 15 `ROUTER_MESSAGE_TIMEOUT`**.
So a remote handoff IS active and repeatedly timing out. The zombie-redrive correctly BACKS OFF
(`hasActiveCreatedOperationHandoffRetry !== true`, dispatch-pending.js:465) because a handoff is in flight —
re-arming would not help: **the remote write to the single-leader-fenced `control_plane_publications`
partition can't land while it routes to the starved seed under write_backlog.**

**FRONTIER (sharpened): the structural publication remote-handoff write-wedge.** This is Option B
territory (make the target a routable local replica so the publication write doesn't funnel to the seed)
and/or harden the publication-coordinator remote-handoff retry under write_backlog. **Option A
(owner-local-seed) does NOT apply** — `control_plane_publications` is B4-fenced (single Raft-leader writer);
seeding it locally would violate the membership single-owner fence. The re-drive + owner-local-seed levers
are exhausted for THIS op. NEXT lever choices:
1. **Option B structural** (epic body): joiner/target reaches routable active-replica status for the
   control-plane partitions fast, so writes spread off the seed. Larger blast radius (placement/readiness).
2. **Wedged-handoff detection** (smaller): detect a remote handoff retry that has exceeded a threshold
   without progress (the 15 ROUTER_MESSAGE_TIMEOUTs) and force a re-plan/re-route — but re-routing still
   hits the seed as the only routable replica, so this likely only helps if paired with (1).
3. **First read the publication-coordinator remote-handoff path** (`membership-publication-*`) to see why
   the REPLACE target-creation never dispatches under write_backlog (is it awaiting a quorum write that
   can't reach the seed?). Deterministic-first before building.

## 🧭 ROOT CONSOLIDATED 2026-06-23 (run2 remove-safety witness distribution) — the PASS blocker is the SLOW REJOINER `7493b0ab` that can't progress, surfacing as a COUPLED CLUSTER of remove-safety defers. NOT a single lever. ALTITUDE checkpoint. READ FIRST.

Drilling the run2 `replace_remove_safety_blocked` witnesses (56 total) shows the binder is NOT a single
zombie/serialization/promotion bug — it is a **cluster of distinct remove-safety defers, ~19/21 of them
removals from one node `7493b0ab` (the slow SWIM-protected rejoiner)**:
- `Quorum check failed: concurrent partition operation <id> is active` ×20
- `Quorum check failed: peer node <id> is uncontactable` ×8
- `projected voter-ready spread would fall below the published requirement (2/3)` ×6
- `recovery projection membership does not include projected voter-ready nodes` ×6
- `source leader <part-r> replacement leader ownership pending before safe removal` ×12 (control_plane_publications,
  sql_transaction_participants, sql_transactions) — the REPLACE moves the partition's RAFT LEADER off the slow
  rejoiner, and leadership won't hand off to the replacement under load
- `replacement replica <part-r> is not voter-ready` ×4

**The unified mechanism = [[post-swim-quiescence-heads-unified-root]] / [[circular-dependency-class-formation-vs-steady-state]]:**
the rejoiner `7493b0ab` survives (SWIM-protected) but can't make progress; the remove-safety gate CORRECTLY
refuses to drain its replicas (doing so would drop voter-ready spread below 2/3, or remove a leader before
handoff, or remove against an uncontactable peer) — but the node never becomes healthy enough to complete the
handoff/promotion that would let it be drained. A coupled circular dependency, NOT a bug a surgical lever fixes.
Each earlier "lever" diagnosis this session (learner-promotion → source-removal-serialization → leader-ownership-
handoff) was ONE facet of this cluster; the subagent passes kept refining into the same coupled root.

**ALTITUDE VERDICT (operational-ground-truth coupled-invariant rule): STOP single-frontier patching.** The 5
default-off levers built/confirmed this campaign (L-write seed, zombie-redrive, drain-extension, census-#4
stall-guard, redundant-replace-retire, spread-voter-ready un-mask) are all SAFE building blocks but none is the
PASS lever, because the PASS bar requires the slow rejoiner to either PROGRESS or be SAFELY DRAINED — a
membership/recovery-ownership problem, not a rebalancer-op problem. **The architectural lever is the one already
scoped in memory: finish the membership single-owner cutover ([[membership-single-owner-cutover-plan]]) +
SWIM-rejoiner-recovery so a stuck rejoiner is deterministically driven to progress-or-eviction** — that is what
breaks the coupling. This belongs to `rolling-restart-core-stability` / the membership cutover spec, NOT this
L-write epic. **Recommend: pause new levers; pivot to the rejoiner progress-or-evict architectural work, or
EXHAUST this epic and open a `slow-rejoiner-progress-or-evict` epic.**

## 🧭 ROOT REFRAMED 2026-06-23 (subagent file:line trace of the spread DISAGREEMENT) — the binder is NOT a write-wedge / not redundant zombies; it is a GENUINE under-spread MASKED by an optimistic recovery sign-off. The frontier LEAVES this epic. READ FIRST.

The active-gate-vs-priority-recovery spread disagreement (gate says `priority_control_plane_spread_pending`,
recovery says `gap=0`) was traced. **Verdict: the active gate is CORRECT; the recovery `gap=0` is the
optimistic/wrong view.** Mechanism (file:line):
- **Strict/correct (active gate):** `buildDerivedPriorityPartitionSummary`
  (`membership-publication-priority-partition-summary.js:255-284,370-371`) counts a node into
  `readyDistinctNodeCount` ONLY when its replica row is `status=ACTIVE` + non-empty `raftRole` + address +
  (if LEARNER) promotable; needs ≥3 distinct such nodes. New REPLACE replicas that haven't reached
  voter-ready are EXCLUDED → `spreadGap>0` → `prioritySpreadPending=true`.
- **Optimistic/wrong (priority-recovery):** `isPriorityRecoverySpreadSatisfyingOperationContext`
  (`priority-recovery-snapshot-ingress.js:62-86`, esp. **lines 79-80**) certifies a partition as
  spread-satisfied as soon as a REPLACE op is in its REMOVE-dispatch phase on an eligible target —
  **BEFORE the new replica becomes ACTIVE/voter-ready** — yielding `spread_satisfied_in_flight`/`gap=0`.
  That optimism freezes into the closure witness (`priority-recovery-snapshot-active-gate.js:380-491`),
  which `buildPrioritySpreadDecision` then PREFERS over the live replica rows
  (`publication-recovery-priority-spread.js:211-216`) — and the witness can be `SATISFIED_STALE_PUBLICATION`
  (the `publication_converged_priority_spread_pending` class, the CL-003 witness in our bundles).
- **The real PASS blocker:** the REPLACE-created learner/replica **never reaches voter-ready
  (ACTIVE+raft_role+promotable) within the ~60s budget under load** — CL-003 (`closure-ledger/CL-003.md`,
  status `guarded`, FALSIFICATION block already pinned exactly this: spread move IS planned/created, summary
  gap=0, but the learner fails voter-ready promotion and the CREATE wedges) → the learner-promotion /
  raft-append-starvation family (CL-009/CL-021). The optimistic sign-off MASKS this real blocker.

**Implication for THIS epic:** the L-write owner-local-seed + re-drive + redundant-replace-retire levers are
ALL exhausted — they address write-landing / zombie cleanup, but the binder is voter-ready PROMOTION, a
different subsystem. **The frontier leaves `control-plane-write-wedge-leader-local-establishment`.**

**CAVEAT on lever (c) (redundant-replace-retire):** its safety gate is `completion.state===CONVERGED`,
which derives from `planner.ready`/`planner.spreadGap===0`. Per this trace `buildPriorityRecoveryPlannerEntry`
(`priority-recovery-snapshot-ingress.js:478-487`) DEFAULTS `spreadGap:0,ready:true` for a partition ABSENT
from `blockedPartitions` — so CONVERGED can be optimistic if the summary is stale. The gate stayed SAFE
(missing=0, 0 breach) and the planner re-created any prematurely-retired op, so no observed harm; but the
lever should be considered to inherit the same optimism it cannot see past. Keep default-off.

### NEXT (two levers, deterministic-first):
1. **Un-mask (cheap, like census #4):** tighten `isPriorityRecoverySpreadSatisfyingOperationContext`
   (`priority-recovery-snapshot-ingress.js:79-80`) so a REPLACE in REMOVE-dispatch phase does NOT certify
   spread until the new replica is ACTIVE/voter-ready. This makes the recovery view honest → the gate's
   dominant reason flips from `priority_recovery_workflow_progress_event_driven` to the TRUE
   voter-ready-promotion failure. Flag-gated default-off; directed DT repro below the gate. Low blast radius.
2. **Fix the root (larger, different epic):** why the REPLACE learner replica fails voter-ready promotion
   within budget under load — CL-009/CL-021 raft-append-starvation / learner-promotion. This is the actual
   PASS lever and belongs to a learner-promotion epic, not here.

➡️ This belongs to the `rolling-restart-core-stability` quest under a learner-voter-ready-promotion epic.
Recommend: do #1 first (un-mask, confirm the honest reason below the gate), THEN scope #2.

### ✅ UN-MASK (#1) LANDED 2026-06-23 (commit `e975054c`, default-off `LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY`)
`isPriorityRecoverySpreadSatisfyingOperationContext` (`priority-recovery-snapshot-ingress.js:62-108`): flag-on, a
REPLACE in REMOVE-dispatch phase only certifies spread when its target is observed `ACTIVE_OPERATIONAL`
(voter-ready). Flag-off byte-identical. Subagent-verified TRUSTED: the un-mask only changes outcomes when
`plannerReady===false` (strict spread genuinely unmet) — it cannot manufacture a blocker on a truly-spread
partition and only DELAYS certification until voter-ready (no liveness wedge); composes cleanly with the
census-#4 stall guard; serial-wait caller unaffected. Directed test
`test/control-plane/priority-recovery-spread-require-voter-ready.test.js` 6/6 (15 assertions); adjacent
priority-recovery/spread suites 501/501 (3 skip) green. **Gate deferred:** the un-mask alone won't make PASS
(it relabels the blocker honest), so validate it together with the root fix (#2) in ONE gate rather than a
redundant intermediate run. **NEXT = scope/build #2 (learner voter-ready promotion under load, CL-009/CL-021).**

## 🎯 GATE VERDICT 2026-06-23 (`stat-gate-20260623T142955Z`, all 4 levers incl. redundant-replace-retire, N=3) — lever ENGAGES + SAFE, but NOT the PASS lever; binding root = structural `priority_control_plane_spread_pending` / write-backlog (Option B). READ FIRST.

First gate where a built lever actually fired: **`retire_redundant_replace` engaged (run1 29×, run2 15×, run3 0×)** — run1's `control_plane_publications-p1` witness shows the retired ops as `status=removed`. Result:
- **3/3 CONVERGED, missing=0, SAFE every run** (CORRUPT/ORACLE_BLIND/NODE_EXIT/stale=0). No regression: the
  `priority_recovery_readyz_closed_during_priority_recovery` invariant appears in BOTH this gate (runs 1–2)
  and the prior 131412Z gate (run3) — a pre-existing variable residual, NOT introduced by retirement.
- **Scenario-PASS still 0/3** (`priority_recovery_progress_blocked`, dominant `priority_recovery_workflow_progress_event_driven` ×3).
- **Why retirement didn't move PASS — CHURN, not a bug:** run1 shows **2837** `control_plane_publications-p1`
  log mentions while the partition stays `operation_stalled`. The planner keeps RE-CREATING priority
  REPLACEs on the spread-pending partitions faster than retirement clears the redundant ones, because the
  underlying condition persists: the active gate sees `priority_control_plane_spread_pending` /
  `priority_partitions_not_spread` (best `active=4/5`, run3 `active=0/5`) even though publication is PUBLISHED
  (epoch 15, missing=0) and the priority-recovery view reports `prioritySpread=ready#gap=0`. Retirement
  treats the SYMPTOM (no-op zombies); the disease is spread ESTABLISHMENT — the priority-partition writes
  can't durably land/spread off the starved seed (`write_backlog`, `handoffOutcome=write_deferred#reason=owner_reconcile_pending`).
- **Lever (c) verdict: a validated SAFE default-off building block that correctly engages and composes —
  but EXHAUSTED as a PASS lever.** It cleans redundant zombies; it cannot make a spread establish.

**FRONTIER (unchanged, now empirically reconfirmed): the structural publication/priority-partition
write-establishment wedge.** The active-gate-vs-priority-recovery spread DISAGREEMENT
(`priority_control_plane_spread_pending` while `prioritySpread=ready#gap=0`) is the coupling to chase —
this is the [[circular-dependency-class-formation-vs-steady-state]] / Option B territory. NEXT (one of):
1. **Resolve the spread DISAGREEMENT first (deterministic-first, cheaper than Option B).** Read why the
   active/publication gate computes `priority_control_plane_spread_pending` while priority-recovery reports
   `gap=0`. If the gate's spread predicate is stricter/staler than the recovery one, that mismatch is the
   PASS blocker and may be a calibration/projection bug, not a structural one. START HERE.
2. **Option B structural** (large blast radius): make the REPLACE target a routable active-replica of the
   control-plane partitions fast, so the durable write spreads off the seed. Defer behind #1.
- DO NOT run another gate until a NEW lever is built — N=3 is too noisy and this gate already named the layer.

## ✅ REDUNDANT-REPLACE RETIREMENT LANDED 2026-06-23 (default-off `LAGRANGE_PR_REDUNDANT_REPLACE_RETIRE`) — lever (c), the scoped NEXT LEVER, BUILT + unit/subagent-verified. Gate-validation pending.

The redundant-REPLACE retirement (the mechanism pinned in the two investigation blocks above)
is implemented, flag-gated default-off, mirroring the other convergence levers.

- **Seam (as scoped):** in `checkTimeouts` (`operation-workflow-recovery-timeout.js`), a new
  `retireRedundantPriorityReplaceFromDrainSnapshot(operation, drainSnapshot)` call is gated
  **BEFORE** the `wakePriorityRecoveryRemoteOwnerFromDrainSnapshot` branch — so the perpetual
  `WAKE_REMOTE_OWNER` of the unreachable owner no longer short-circuits the loop before the no-op
  zombie can retire.
- **Lever code:** `operation-workflow-recovery-drain.js` — flag constant
  `PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRE_FLAG` + getter, wall-clock stall floor
  `PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRE_MIN_STALL_MS = 45s` (handles the stepTimeoutMs=0
  no-deadline case), and methods `retireRedundantPriorityReplaceFromDrainSnapshot` /
  `isRedundantPriorityReplaceRetireStale` / `isRedundantPriorityReplaceSpreadConvergedIndependently`
  / `executeRedundantPriorityReplaceRetire`. New error literal
  `PRIORITY_RECOVERY_REDUNDANT_REPLACE_RETIRED` in `operation-workflow-owner-shared.js`.
- **Safety gates (all must hold to retire):** REPLACE + priority-control-plane partition +
  pre-sync step (un-dispatched) + non-terminal + `drainSnapshot.ownerAction === WAKE_REMOTE_OWNER`
  + target NOT MATERIALIZED + wedged past the 45s stall floor + **`completion.state === CONVERGED`**
  (the load-bearing gate — planner-ready spread from materialized replicas INDEPENDENT of this op's
  un-materialized target, strictly stronger than the `blocked !== true` that would also accept the
  in-flight-counted `SPREAD_SATISFIED_IN_FLIGHT`) + the op is NOT itself a counted
  `satisfyingOperationIds` member (belt). Retirement runs under the op single-flight lock with an
  AUTHORITATIVE re-read + full re-confirmation before `failOperation` (idempotent, no double-retire).
- **B4-safe:** `failOperation` writes ONLY the op's own `replica_operations` row — never the
  Raft-leader-fenced `control_plane_publications` table (subagent-confirmed: the only other side
  effects are a STORAGE_RESERVATIONS release for storage-increasing ops and an OPERATION_FAILED
  read/replan event). So retiring a never-dispatched op needs no membership-projection write.
- **Validation:** new directed below-gate falsifier
  `test/rebalancer/priority-recovery-redundant-replace-retire.test.js` (9 tests / 22 assertions:
  flag-on retires; flag-off byte-identical; SPREAD_SATISFIED_IN_FLIGHT NEVER retired; op-is-satisfier
  NEVER retired; MATERIALIZED target NEVER retired; non-WAKE_REMOTE_OWNER NEVER retired; fresh op
  NEVER retired; terminal-on-re-read aborts; non-REPLACE NEVER retired). Adjacent recovery/timeout/
  drain suites 595/595 + 301/301 green (flag-off → no regression). **Subagent-verified TRUSTED**
  (claims A–F all HOLD; CRITICAL engagement check confirmed: a `persisted_not_dispatched` record's
  `workflowStep` IS pre-sync PENDING/SENDING — the "phase=terminal" witness was a selector-split
  artifact that does NOT reach `operation.workflowStep`, so the lever DOES engage on the residual op).
- **Efficacy rests on the next gate.** This composes beneath the structural publication
  remote-handoff write-wedge (frontier above): for a LEGITIMATE (non-redundant) REPLACE whose write
  can't land, retirement correctly does NOT fire — that case still needs Option B (routable local
  replica) or publication-handoff hardening. Retirement only clears the REDUNDANT no-op zombies that
  hold quiesce open. **NEXT: N=3 gate with all built levers + `LAGRANGE_PR_REDUNDANT_REPLACE_RETIRE`**
  — grep `retire_redundant_replace` engagement + watch `priority_recovery_workflow_progress_event_driven`
  / scenario-PASS.

## ✅ ZOMBIE-REDRIVE stepTimeoutMs=0 BLIND SPOT FIXED 2026-06-23 (commit `c1f6d34f`) — why the lever engaged 0×, now reachable

The census-#4 gate (`stat-gate-20260623T121834Z`, all 3 levers on) un-masked the binding op but it
still didn't drain: run3 bound on `publication_missing_active_node` (`sql_write_operations-p1`, node
`11601fe0`) with the priority-recovery witness `actuationState: persisted_not_dispatched`,
`workflowProgressPhaseId: terminal`, `semanticStateId: operation_stalled` (census-#4 guard fired),
`stepAgeMs: 271965`, `stepTimeoutMs: 0`. This is EXACTLY the rank-1 zombie the zombie-redrive lever
(`LAGRANGE_PR_ZOMBIE_REDRIVE`, `54843bb4`) targets — yet it engaged **0×** across both 06-23 gates.

**Mechanistic root (subagent-traced):** `staleTerminalDispatchable` gated on
`actuation.timeoutReconcileDue === true`, but `timeoutReconcileDue` requires `stepTimeoutMs > 0`
(`priority-recovery-snapshot-observation.js:288-292`). Priority-recovery ops routinely have NO
per-step deadline (the resolver returns null → `stepTimeoutMs` omitted from the snapshot), so
`timeoutReconcileDue` is permanently false → the terminal zombie was never re-driven. Same
stepTimeoutMs=0 trap census-#4 had to design around.

**Fix:** `staleTerminalDispatchable` now uses `isPriorityRecoveryStaleTerminalReconcileDue(actuation)`
= `timeoutReconcileDue` OR (no per-step deadline AND `stepAgeMs >= 45s` fixed wall). Open per-step
deadlines are NOT pre-empted (owner wait window preserved). Under the same flag (first conjunct →
flag-off byte-identical); post-match ARM_NOW path unchanged. Subagent verdict: fixing this gate is
**SUFFICIENT** for the witnessed op to re-drive (op is in candidate set, reentry invoked
unconditionally, ownerAdvance true, drain doesn't interfere, no completion=converged exclusion).
**Efficacy (does ARM actually drain the surplus/un-wedge the publication) rests on the next gate** —
the persisted_not_dispatched op may still need its WRITE to land under `write_backlog` (this composes
with lever-(a) drain-extension + the structural Option B). 15/15 falsifier + 294/294 reentry suites.

➡️ **NEXT: re-run the N=3 gate with all built levers** (`LAGRANGE_PR_SPREAD_STALL_GUARD` +
`LAGRANGE_PR_ZOMBIE_REDRIVE` + `LAGRANGE_PR_DRAIN_LOCAL_PROGRESS`) to test whether the now-reachable
zombie-redrive actually drains the run3-class op (grep `stale_terminal_redrive` engagement + watch
`publication_missing_active_node`). If the op re-drives but still can't persist, the binding layer is
the `write_backlog` distributed-write-backpressure root (Option A/B below).

## Build seam — FULLY PINNED 2026-06-23 (all layers traced; next step is pure coding)

The joiner's membership write flows:
`registerNodeInCluster` (`node-registration-owner.js:40`) → three awaited
`upsertSystemTableRowWithRetry` calls (NODES `:87`; NODE_ENDPOINTS via `registerNodeEndpoint`
`:128`; SERVICE_ENDPOINTS via `registerMetaServiceEndpoints` `:142`) →
`membershipPublicationRuntimeOwner.upsertJoinNode/Endpoint/ServiceEndpoint`
(`membership-publication-runtime-owner.js:136-155`) → `nodesOwner.upsertNode` → `upsertRow`
→ `executeMutation` (`system-metadata-owner-base.js:411`) →
`runRetryableControlPlaneWrite(() => gateway.upsertSystemTableRow(...), {timeoutMs})`.

- **Awaited budget = `JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS = 30·SECOND`**
  (`node-registration-owner-constants.js:31`), threaded as `controlPlaneWriteRetryTimeoutMs`
  via `getJoinTimeUpsertOptions`/`buildJoinMutationOptions`. Under saturation the retry loop
  consumes this full budget (the observed ~20s `querying_state` balloon), then **THROWS**
  `buildSystemMetadataMutationError` at `system-metadata-owner-base.js:435` (the deferred
  branch surfaces as a THROW, not a `success:false` return; the `:95` success-check is
  defensive). The error carries `retryable` / `code` / `retryAfterMs`
  (re-propagated at `node-registration-owner.js:160-172`).
- **Interception point for the build:** wrap each `upsertSystemTableRowWithRetry` call in
  `registerNodeInCluster`. On a RETRYABLE error (`retryable !== false` AND a
  `DISTRIBUTED_PARTICIPANT_FAILURE`/timeout code — NOT a hard/`retryable:false` error, which
  must still throw): (1) seed the local cache row via `seedJoinTimeCacheRow` **with a stamped
  `updated_at`/HLC** (extend the builder — currently `created_at`-only), (2) hand the durable
  upsert to a background re-drive, (3) proceed. To kill the balloon, the AWAITED budget must
  shrink (short await) with the long retry moved to background (the L-hydrate fire-and-forget
  analog). Background re-drive: NODES via the existing 5s heartbeat (safe as-is);
  NODE_ENDPOINTS needs a forced immediate re-upsert (else ~5min local-only); SERVICE_ENDPOINTS
  needs a NEW refresh-gated heartbeat re-drive (no existing one — required before seeding it).

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
- 2026-06-23 (increment 1 LANDED, default-off) — Flag-gated `LAGRANGE_JOIN_DEFERRED_SEED`
  deferred-seed for the **NODES** write shipped: short awaited budget
  (`joinDeferredSeedAwaitMs`, default 3s) + seed-owner-local-and-proceed on a retryable defer
  (gated by the SAME `isRetryableControlPlaneError` the retry loop uses), durable write
  re-driven by the 5s heartbeat. `node-registration-owner.js` + `…-publication-methods.js`
  + new constants; directed deterministic test `test/bootstrap/node-join-deferred-membership-
  seed.test.js` (flag-on retryable→seed+proceed; flag-on permanent→still fails; flag-off→
  fail-narrowly preserved). 75/75 (new + register-node) green; 40/40 related; cache-write
  guardrail 2/2. Subagent verdict TRUSTED-WITH-CAVEATS (4 cluster-safety invariants hold;
  seed shape matches the proven success-path seed; one pre-promotion hardening recorded above).
  REMAINING for full lever: node_endpoints (forced immediate re-upsert) + service_endpoints
  (new heartbeat re-drive) deferred-seed, then mgmjf + gate validation.
- 2026-06-23 (increment 2a LANDED, default-off) — Extended the deferred-seed to the
  **node_endpoints** write (`registerNodeEndpoint` now returns the row + logs on a retryable
  defer instead of throwing; the caller already seeds NODE_ENDPOINTS from the return). KEY
  re-drive correction: `node_endpoints` is re-driven on the heartbeat's FIRST beat, not after
  5 min — `shouldUpsertEndpointRow` (`heartbeat-service-write-coalescing.js`) returns true when
  `lastEndpointUpsertAt` is unset, so the first ~5s heartbeat durably upserts it (the earlier
  "~5min local-only" worry applies only to subsequent refreshes). So node_endpoints is as safe
  as nodes with no heartbeat change. Test added (flag-on node_endpoints defer → seed+proceed);
  79/79 green. STILL REMAINING: `service_endpoints` — the heartbeat does NOT touch it, so its
  deferred-seed REQUIRES adding a new refresh-gated SERVICE_ENDPOINTS re-drive to the 5s
  heartbeat `sendHeartbeat` loop first (the join reconciler drives service-lifecycle owners,
  not membership rows, so it is not a usable hook). Then mgmjf (N≥2) + rolling-restart gate.
- 2026-06-23 (cont.) — **Membership fence CLEARED for all three join-time tables**
  (`nodes`/`node_endpoints`/`services`), subagent-classified with file:line: the fence
  protects `control_plane_publications`, not raw rows, and a local seed emits no outbound
  CDC, so Option A can proceed without the cutover. LWW/tombstone confirmed generic; the
  seed MUST stamp `updated_at`/HLC. **`node-join-convergence-slo` confirmed CONTAMINATED**
  (the `sqlQueryEngine` errors are transient, not a wiring gap — both seed+joiner self-wire;
  prior wiring-gap framing REFUTED) → validation step 1 switched to a fresh directed
  deterministic test. **New gating question before building:** confirm a post-join
  background re-drive re-asserts the joiner's membership rows to durable quorum (else
  seed-and-proceed has no correction path = unsafe). **Implementation design fork** at
  `node-registration-owner.js:87-105` (NODES upsert awaited, throws on failure; seeds cache
  only on success): (b) keep a SHORT retry budget, and on retryable defer/timeout seed the
  cache + continue the durable write in the background instead of throwing/blocking the full
  ~20s budget — preferred (safety-preserving, L-hydrate analog); (a) don't await visibility
  at all — lower latency, higher risk. Resolve the re-drive question first.
