# DEP-SCOPE — mutation → affected-node impact map for the projection-readiness semantic generation

Quest: `projection-readiness-per-node-generation-granularity` (A3 repair).
Base: published `d072cece0` (Quest B landed; A characterization =
`solve/evidence/readiness-sync-read-fanout-characterization.md`).

This is the gate the operator required BEFORE any granularity change: every
dependency that participates in the readiness semantic generation is
classified with its source owner, change event, semantic effect and impact
scope, and every node-local claim carries the reason another node's normalized
semantic core cannot change. Anything not proven node-local stays GLOBAL.

## 0. What the semantic core is (the object being invalidated)

`core(N) = buildProjectionReadinessState(pick(context_N))`
(`projection-readiness-state.js:93` → `buildProjectionReadinessEvidence` +
`buildProjectionReadinessDecision`). It is a PURE function of its source
argument: no clock, no `this`, no module-mutable reads (grep receipt:
`Date.now|performance.now|new Date|Math.random` = 0 hits in
`projection-readiness-{state,evidence,decision}.js`; the only module state is
two identity registries that never influence the output).

`pick` is the allowlist `PROJECTION_READINESS_EVIDENCE_SOURCE_FIELDS`
(`projection-readiness-evidence-source.js`). On the OWNER path (the
`resolveNormalizedProjectionReadinessContract` seam reached from both
`evaluateNodeReadiness` and `buildNodeReadinessSyncCurrent`) the picked
source is EXACTLY:

```text
S(N) = { dimensions, runtimeAuthority, priorityControlPlaneRecovery,
         runtimeServeEligible, nodeEvidence, membershipPublication }
```

Pinned empirically on both paths (sync ×3 nodes + async authoritative refresh)
by instrumenting the seam: `sourceKeys` = those six, no more, no less. The
quest receipt `DEP-SCOPE-owner-path-source-fields-pinned` re-asserts this at
every run and the seam fails CLOSED (build without memoizing) if any other
field ever reaches it — so a future context field can never silently become
"node-local by omission".

Consequence (the load-bearing observation of this map): **a table write can
change `core(N)` only by changing one of the six fields of `S(N)`.** So the
generation key is complete iff every field of `S(N)` is covered, and the
impact scope of a write is exactly the set of nodes whose `S(N)` it changes.

## 1. Two coverage mechanisms

| Mechanism | Definition | Soundness condition |
| --- | --- | --- |
| CONTENT | the field as observed for THIS evaluation is canonically digested into `key(N)` (sorted keys, depth-capped, observation-time fields excluded) | the digest must be complete: no depth-cap overflow (fail-closed: overflow ⇒ the key is marked incomplete ⇒ no memo) |
| VERSION | a monotonic counter that the source owner bumps SYNCHRONOUSLY with the row mutation, before any observation can see the new content | the observation must read content that is at most as new as the captured version (cache read or version-keyed memo — never a memo cleared by a DEFERRED listener) |

CONTENT-covered fields are self-consistent by construction: whatever inputs
(cluster-wide or not) produced the verdict, the key reflects the verdict that
was actually used, so two evaluations share a core iff their verdicts are
equal. Their invalidation scope is therefore EXACTLY the nodes whose verdicts
changed — no per-table attribution rule is needed and none can be wrong.

## 2. Field-by-field classification of S(N)

| Field | Source owner | Change events | Semantic effect on core(N) | Coverage today | Coverage after | Impact scope |
| --- | --- | --- | --- | --- | --- | --- |
| `dimensions` (12 booleans, `buildDimensionsEvaluation`) | readiness diagnostics tier; inputs: nodeRow(N), serviceRows(N), capacity(N), transport(N), self lifecycle, planning snapshot, publication mode | any input flip | lanes/readiness booleans | CONTENT (digested) | CONTENT (unchanged) | node-local BY CONTENT: the digest is of N's own verdict record; another node's key cannot move unless its own verdicts move |
| `runtimeAuthority` (`buildRuntimeAuthoritySnapshot`) | same tier | nodeRow(N)/serviceRows(N)/lifecycle/transport/publication/repair changes | processAlive, clusterMemberHealthy, routingReady, provisioning, visibility, writeEligible, recoveryEligible, repairEligible, publication.healthy, repair | CONTENT (digested; `repair.recordedAt` kept = repair identity, v2 finding E) | CONTENT (unchanged) | node-local BY CONTENT (as above) |
| `priorityControlPlaneRecovery` (`getPriorityControlPlaneRecoveryState`) | readiness priority-recovery planning (cluster-wide planning snapshot, memoized on the planning version key) | planning snapshot / recovery gate changes | priorityRecoveryActive, durableSpreadPending, reasonCodes | CONTENT (digested; `enteredAt` excluded, v4) | CONTENT (unchanged) | cluster-wide INPUT, node-local BY CONTENT: a planning change rotates exactly the nodes whose projected record changes (all of them when the recovery verdict is cluster-wide — legitimate) |
| `runtimeServeEligible` | serve admission (`buildServeAdmissionSnapshot`) | admission flip | serve lane input | CONTENT | CONTENT (unchanged) | node-local BY CONTENT |
| `nodeEvidence` (`buildClusterMemberHealthDetails(nodeId, nodeRow)`, 17 scalars) | NODES row N (`getNodeRow(N)` = primary-key lookup), `messageRouter.getConnectionState(N)`, self local-query transport (`nodeId === this.nodeId` only), `now` (ages), config const | NODES row N write (heartbeat, status, lease, connection_state); transport state change for N | raw evidence embedded in `core.evidence.raw.nodeEvidence`; `readyNow`/`readyWhenWritten`/transport fields | VERSION via the CLUSTER-WIDE `NODES` table version (over-invalidates every node on any node's heartbeat) | CONTENT: digest of nodeEvidence(N) with the two clock-derived ages (`heartbeatAgeMs`, `readyLeaseAgeMs` = `now − rowField`) classified as observation-time and excluded (same class as `observedAt`; the row fields they derive from — `lastHeartbeat`, `readyLeaseExpiresAt` — stay in the digest, so every real row change still rotates) | **node-local, PROVEN**: every input is keyed by N — `getNodeRow(N)` cannot return row X≠N; `getConnectionState(N)` is N's connection; local-query transport applies to self only. A NODES write to row X therefore leaves `nodeEvidence(N)` byte-identical for every N≠X, and X's own key rotates by content. Transport changes that today do NOT flip a boolean (CONNECTING→CONNECTED) now rotate N's key too — strictly MORE invalidation than v4 for live transport (A5). |
| `membershipPublication` (`buildMembershipPublicationDiagnostics(row, observedAt)`) | MembershipPublicationCoordinator over CONTROL_PLANE_PUBLICATIONS: `getLatestPublicationRow` = the cluster's highest-epoch MEMBERSHIP row; async path inclusion-filters by N (`publicationRowIncludesNode`), sync path serves one CLUSTER-scope memo shared by all nodes | any publication row INSERT/UPDATE/DELETE (new epoch, status, acks, inclusion lists) | the ~0.5MB publication graph in `core.evidence.raw`, plus publication-derived lanes | VERSION via `CONTROL_PLANE_PUBLICATIONS` table version — correct scope, but the SYNC path's diagnostics memo is invalidated by the DEFERRED (`setImmediate`) cache listener, so a sync read between the row apply and the listener observes STALE diagnostics under the NEW version (see §5) | VERSION: `CONTROL_PLANE_PUBLICATIONS` table version = the GLOBAL readiness revision, read by the generation owner; the sync diagnostics memo becomes keyed on that same version (synchronous), closing the stale window | **GLOBAL, by the source owner's own definition**: one row serves every node (the snapshot store already says "Publication rows carry publication_id, not node_id, so this invalidates cluster-wide"). A publication write may change the winner row, its inclusion list, or its ack/missing sets — any of which can change ANY node's membershipPublication (or flip it between row/null). Not localizable; not attempted. |

Also in the key (retained, not part of S(N)):

| Segment | Why it stays | Scope |
| --- | --- | --- |
| planning version key (`readMembershipPlanningDerivationVersionKey`: NODES, NODE_ENDPOINTS, SERVICES, PARTITIONS, CONTROL_PLANE_PUBLICATIONS, REPLICA_OPERATIONS versions, 250 ms latch) | operator instruction: "existing planning semantic generation" stays. Redundant by §1 (the planning snapshot reaches core(N) only through the digested `runtimeAuthority.recoveryEligible` / `priorityControlPlaneRecovery`), so it is conservative over-invalidation, bounded to ≤ 4 rotations/s cluster-wide by its latch. Its rotation share is measured and reported separately. | GLOBAL (legitimately: planning is cluster-wide) |
| `publication` (metadata publication mode diagnostics, v2 finding C) | folded in v3; not a picked field, so redundant with `runtimeAuthority.publication`; kept (cheap, conservative) | global-by-content (same value for every node on one service) |

## 3. The six tables currently rotating every node's key

For each: how it reaches core(N), and therefore its impact scope.

| Table | Routes into core(N) | Coverage after | Impact scope of one row write |
| --- | --- | --- | --- |
| NODES | nodeRow(N) → `nodeEvidence` [CONTENT], `loadReady`/lifecycle/`runtimeAuthority`/`dimensions` [CONTENT]; all rows → planning snapshot → `recoveryEligible`/`priorityControlPlaneRecovery` [CONTENT + planning key] | CONTENT (+ planning latch) | row X: rotates X by content; rotates any other N only if N's verdicts change (e.g. a planning verdict) — which is exactly the semantic effect. Table version DROPPED from the key. |
| SERVICES | serviceRows(N) → `hasServeEligibleControlPlaneService` → `dimensions`/`runtimeAuthority` [CONTENT]; capacity(N) [CONTENT via `placementEligible`] | CONTENT | node whose verdicts change; version DROPPED |
| PARTITIONS | capacity(N) → `placementEligible` [CONTENT]; planning → [CONTENT + planning key] | CONTENT | nodes whose verdicts change; version DROPPED |
| STORAGE_RESERVATIONS | capacity(N) → `placementEligible` [CONTENT] | CONTENT | nodes whose verdicts change; version DROPPED |
| REPLICA_OPERATIONS | capacity(N) [CONTENT]; planning [CONTENT + planning key] | CONTENT | nodes whose verdicts change; version DROPPED |
| CONTROL_PLANE_PUBLICATIONS | `membershipPublication` [VERSION]; `runtimeAuthority.visibility` [CONTENT] | VERSION = GLOBAL revision | every node (GLOBAL) |

Why the five dropped versions were never load-bearing: `capacity`,
`serviceRows`, `nodeRow`, `lifecycleState`, `membershipPublicationPlanningSnapshot`
are in the evaluation context but are NOT picked fields — they cannot enter the
core except through the digested verdicts. (This is the v2 DEP census's
"covered by cheap in-memory signals" list re-derived at field granularity: the
census chose whole-table versions as an over-approximation; the over-
approximation is what A3 measured.)

## 4. Live (non-table) dependencies established by v2 DEP / v4 — must not regress

| Finding | Dependency | After |
| --- | --- | --- |
| A transport/router | `getConnectionState(N)`, local-query transport | `dimensions`/`runtimeAuthority` CONTENT (as v4) + `nodeEvidence` CONTENT (new, stronger: raw transport fields rotate the key even when no boolean flips) |
| B self lifecycle | `nodeLifecycleStateMachine.getState()` | `runtimeAuthority`/`dimensions` CONTENT (unchanged) |
| C publication mode | `getPublicationDiagnostics()` | `publication` digest + `runtimeAuthority.publication` CONTENT (unchanged) |
| E repair | `runtimeAuthority.repair` incl. `recordedAt` | CONTENT (unchanged) |
| v4 observation-time exclusion | `enteredAt`/`observedAt`/`observedAtMs` | unchanged; `heartbeatAgeMs`/`readyLeaseAgeMs` added to the same class (each is `now − rowField`, and the row field itself stays digested) |

## 5. Publication race (A6) and the sync-path stale window

Cache listeners fire via `setImmediate` (`system-table-cache-observation-methods.js:267`);
the table mutation version bumps synchronously BEFORE that
(`system-table-cache.js:540`). The sync readiness path reads
`membershipPublicationDiagnosticsMemo`, which is cleared only by the deferred
listener (`control-plane-readiness-snapshot-store.js:handleCacheChange`). So a
reconcile that runs between a publication apply and its listener observes the
STALE memo with the NEW version and memoizes a stale core under the new global
generation — a latent A2/A6 hole in v3/v4, masked today only because the five
other cluster-wide versions rotate every key within ~50 ms. Once those are
gone the mask is gone, so this quest keys that memo on the
CONTROL_PLANE_PUBLICATIONS version itself (synchronous), restoring the VERSION
soundness condition of §1. Receipt `A6-publication-race-sync-memo-never-stale`
drives exactly this interleaving on the REAL `SystemTableCache`.

The R6 bracket (before/after version compare, volatile ⇒ no memo) is kept for
the global segment; the CONTENT segments cannot straddle (the key IS the
observed content).

## 6. Fail-closed rules (mechanical DEP-SCOPE)

1. Seam allowlist: a picked source field outside `S(N)` ⇒ build WITHOUT
   memoizing (`unclassified_source_skip`, counted).
2. Digest overflow: a container at the depth cap ⇒ key incomplete ⇒ build
   WITHOUT memoizing (`digest_overflow_skip`, counted). Production depths
   measured: dimensions 1, runtimeAuthority 2, priorityControlPlaneRecovery 5,
   publication 1, nodeEvidence 1 (cap 8).
3. No versioning API on the cache ⇒ the GLOBAL segment is unavailable ⇒ build
   WITHOUT memoizing (v3 used a constant token there; that silently made
   `membershipPublication` uncovered in such fixtures).
4. `invalidateAll` on cache/observation-owner replacement — unchanged.

## 6b. Empirical confirmations (receipt file `test/control-plane/projection-readiness-per-node-generation.receipt.test.js`)

- Seam source on both production paths (5 sync reads via
  `buildNodeReadinessSyncCurrent`, 1 async authoritative refresh) is exactly
  the six classified fields; measured verdict depths 1/2/5/1/1 against cap 8.
- A1/A2/A3/A4/A5/A6 on the REAL `SystemTableCache` + REAL
  `MembershipPublicationCoordinator` sync read over a real membership
  publication row (five nodes): see the receipt JSON details.
- ENGAGEMENT (12 rounds of node-1 heartbeat + service churn, all five nodes
  read per round): 17 builds / 51 reuses over 65 reads (78% reuse); every
  unaffected node exactly one build. Red-on-revert with the six table versions
  restored: 65 builds / 5 reuses (8% — the production 11% reproduced), 111
  assertions fail through the named mechanism.
- BOUNDED-WORK on the production wall clock (planning segment live): 15 builds
  for 20 cluster writes x 5 nodes; unaffected nodes 1 build each.

### Fixture caveat worth knowing (not a product change)
`readMembershipPlanningDerivationVersionKey` receives an ISO `observedAt`, so
its 250 ms latch keys on `Date.now()`; a fixture driving a fake service clock
therefore sees the planning segment rotate on EVERY write (the latch is
refreshed by the other clock). In production both are the wall clock. The
ENGAGEMENT receipt holds the planning segment constant (it is the retained,
legitimately global rotator); BOUNDED-WORK runs it live and bounds it
independently.

### Separate-owner finding surfaced by A6 (recorded, NOT fixed here)
The CL-012 stored-snapshot reuse layer
(`control-plane-readiness-stored-snapshot-reuse.js`) gates on the SERVICES
version and on invalidation timestamps set by the DEFERRED listener, not on
the publication version. Between a CONTROL_PLANE_PUBLICATIONS apply and its
listener it serves the stored `projectionReadinessContract` (old epoch) under
a freshly overridden top-level `membershipPublication` (new epoch) — an
internally inconsistent snapshot for one macrotask. Same hole class as §5, a
different owner (a `readiness-freshness-macrotask-bound` pair file); the
receipt therefore drives the race through the owner seam by touching a
SERVICES row in the same synchronous step. Follow-up: key that reuse gate on
the same global revision.

## 7. Verdict

Locality IS provable, and the proof needs no per-table row-attribution rules:
five of the six table versions were redundant with CONTENT coverage; the only
non-digestable field (`membershipPublication`) is GLOBAL by its owner's
definition and keeps a synchronous whole-table version as the global readiness
revision; the only other non-digested field (`nodeEvidence`) is node-local by
construction and small enough to BE its own node-scoped generation stamp.
Resulting shape:

```text
semanticGeneration(N) = {
  globalReadinessRevision   = mutationVersion(CONTROL_PLANE_PUBLICATIONS)
  nodeReadinessRevision[N]  = digest(nodeEvidence(N) \ clock-derived ages)
  planningSemanticGeneration = planning version key (retained)
  liveSemanticVerdicts       = digest(dimensions, runtimeAuthority,
                               priorityControlPlaneRecovery, publication),
                               runtimeServeEligible
}
```

No TTL, clock, evaluation count or object identity participates. Source
owners are not touched; the classification lives in the generation owner
(`projection-readiness-evidence-generation.js`) and consumers only hand it
observed inputs.
