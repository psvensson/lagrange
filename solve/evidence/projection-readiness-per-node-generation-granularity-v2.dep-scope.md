# DEP-SCOPE (v2) — mutation → affected-node impact map for the projection-readiness semantic generation

Quest: `projection-readiness-per-node-generation-granularity-v2` (A3 repair,
successor of the parked v1). Base: published `d072cece0`. Parent map:
`projection-readiness-per-node-generation-granularity.dep-scope.md`; the v1
measurement that drives this revision:
`projection-readiness-per-node-generation-granularity.effectiveness-measurement.md`.

What changed against v1: the v1 map kept TWO cluster-wide segments in the key
("conservative over-invalidation"): the whole-table CONTROL_PLANE_PUBLICATIONS
mutation version as the global revision, and the planning derivation version
key. Measured on the production-shaped fixture they were 50% + 43% of the
residual builds (reuse 8.8% → 14.5% only). v2 covers `membershipPublication`
by CONTENT as well and removes the planning segment (redundant, §2), so the
key is a pure function of S(N) and carries no cluster-wide version at all.

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
| `membershipPublication` (`buildMembershipPublicationDiagnostics(row, observedAt)`) | MembershipPublicationCoordinator over CONTROL_PLANE_PUBLICATIONS: `getLatestPublicationRow` = the cluster's highest-epoch MEMBERSHIP row; async path inclusion-filters by N, sync path serves one CLUSTER-scope memo shared by all nodes | any change to the winner row's SEMANTIC content (epoch, status, observation state, ack/required/published/missing lists, summaries, recovery gate, boundary outcome) | the publication graph in `core.evidence.raw` plus publication-derived lanes | v1: VERSION via the whole-table mutation version (measured: rotates ~19/s on the seed — refreshes, acks and timestamp-only writes, and rows of OTHER publication kinds, none of which change the diagnostics' semantic content) | CONTENT: canonical digest of the diagnostics (~6 KB, depth 5) with the top-level `createdAt`/`updatedAt` classified observation-time (production rows carry neither; they are observedAt-derived, and their only consumer is the visibility descriptor's `enteredAt`, already observation-time). The digest is CACHED per FROZEN diagnostics object (WeakMap — a pure cache on an immutable value, never an invalidation signal; unfrozen objects are digested each time), and the sync path memoizes one frozen diagnostics object per publication version (memo stamped with the synchronous table version, §5), so the graph is digested once per version, not once per evaluation | **cluster-wide BY CONTENT**: one row serves every node, so a semantic change rotates every node (A3) — and a table write that leaves the content unchanged rotates none (A3b). Not localizable; not attempted. |

Retained in the key (not part of S(N)): the metadata publication-mode
diagnostics digest (`publication`, v2 DEP finding C) — not a picked field, so
redundant with `runtimeAuthority.publication`; kept (cheap, conservative,
global-by-content).

REMOVED from the key in v2: the planning derivation version key. Proof of
redundancy: the planning snapshot reaches core(N) only through
`runtimeAuthority.recoveryEligible` / `.visibility.publicationObservationState`
/ `.visibility.publicationStatus`, `priorityControlPlaneRecovery`,
`dimensions` and `runtimeServeEligible` — all digested — and neither
`nodeEvidence` nor `membershipPublication` reads it. A planning tick that
changes none of them cannot change any core (receipt PLANNING); a planning
change that flips one rotates through the digest. Its measured production
cost (43% of residual builds) came from the planning latch flapping under
mixed clocks (v1 measurement finding 3) — a separate owner.

## 3. The six tables currently rotating every node's key

For each: how it reaches core(N), and therefore its impact scope.

| Table | Routes into core(N) | Coverage after | Impact scope of one row write |
| --- | --- | --- | --- |
| NODES | nodeRow(N) → `nodeEvidence` [CONTENT], `loadReady`/lifecycle/`runtimeAuthority`/`dimensions` [CONTENT]; all rows → planning snapshot → `recoveryEligible`/`priorityControlPlaneRecovery` [CONTENT + planning key] | CONTENT (+ planning latch) | row X: rotates X by content; rotates any other N only if N's verdicts change (e.g. a planning verdict) — which is exactly the semantic effect. Table version DROPPED from the key. |
| SERVICES | serviceRows(N) → `hasServeEligibleControlPlaneService` → `dimensions`/`runtimeAuthority` [CONTENT]; capacity(N) [CONTENT via `placementEligible`] | CONTENT | node whose verdicts change; version DROPPED |
| PARTITIONS | capacity(N) → `placementEligible` [CONTENT]; planning → [CONTENT + planning key] | CONTENT | nodes whose verdicts change; version DROPPED |
| STORAGE_RESERVATIONS | capacity(N) → `placementEligible` [CONTENT] | CONTENT | nodes whose verdicts change; version DROPPED |
| REPLICA_OPERATIONS | capacity(N) [CONTENT]; planning [CONTENT + planning key] | CONTENT | nodes whose verdicts change; version DROPPED |
| CONTROL_PLANE_PUBLICATIONS | `membershipPublication` [CONTENT, digest cached per frozen object]; `runtimeAuthority.visibility` [CONTENT] | CONTENT (the table version only stamps the sync diagnostics memo, §5) | every node when the membership diagnostics' semantic content changes; no node otherwise |

Why none of the six versions is load-bearing: `capacity`,
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
`membershipPublicationDiagnosticsMemo`, which v3/v4 cleared only from the
deferred listener, so a reconcile between a publication apply and its
listener observed STALE diagnostics. The memo is now stamped with the
synchronous table version (`snapshotProjectionReadinessPublicationMemoStamp`),
so the diagnostics object a sync build observes is never staler than the
cache. With a CONTENT key there is no version bracket to straddle: a build is
keyed by the content it actually observed, so it can never alias old evidence
to newer content (receipt A6, both interleavings on the REAL cache).

## 6. Fail-closed rules (mechanical DEP-SCOPE)

1. Seam allowlist: a picked source field outside `S(N)` ⇒ build WITHOUT
   memoizing (`unowned` build, reason `unclassified_source_field`, counted).
2. Digest depth: the digest cap tracks the normalizer's own-data cap exactly
   — `PROJECTION_READINESS_MAX_OWN_DATA_DEPTH` (16, imported) minus one,
   because the normalizer enters the whole picked source at depth 0 so a seam
   field's value sits at normalizer depth 1 while the digest walks it from
   depth 0 (verifier F5). Every graph the normalizer accepts is digested
   completely and a graph it would fail closed on is INCOMPLETE (reason
   `digest_depth_overflow`; a cached frozen membership digest remembers its
   verdict). The overflow token is a constant
   — no object is ever coerced to a string, so a null-prototype or hostile
   `toString`/`Symbol.toPrimitive` container at the cap fails closed instead
   of throwing (verifier finding F1, review-0f76ab4e). Production depths
   measured on the idle five-node fixture: dimensions 1, runtimeAuthority 2,
   priorityControlPlaneRecovery 5, publication 1, nodeEvidence 1,
   membershipPublication 5; the verifier measured live priority-recovery
   witness records at depth 6–7 — 9 levels of headroom under the cap.
3. Normalizer-domain mirror (verifier finding F2): the digest walk applies the
   strict own-data admission of `copyStrictOwnDataRecord` /
   `copyDenseOwnDataArray` — plain-or-null prototypes only, string enumerable
   data keys only (symbol, accessor and non-enumerable keys reject, even
   observation-time ones), dense canonical arrays only, no proxies, no
   function/symbol leaves. Any rejection ⇒ INCOMPLETE (reason
   `digest_domain_violation`): the core would be the degenerate
   `sourceInvalid` form and a key must never alias it to a valid core.
   Strings and keys are length-prefixed, so the serialization is injective
   over that domain (no value can forge a separator). Values under EXCLUDED
   (observation-time) keys are still walked for the shared trace — only their
   rendered text is discarded — because the normalizer knows no exclusions
   and fails the whole source on any of them (verifier F4: six aliasing
   shapes sealed). Rejection returns at the first offending slot like the
   normalizer (verifier F6), and array indexes mirror `copyDenseOwnDataArray`
   (a data slot suffices; only record keys must also be enumerable).
   Cost on production-shaped seam records (verifier measurement): ~43 µs per
   evaluation with the membership digest cached (vs ~23 µs before the domain
   mirror), against a ~182 µs normalize miss — still ~4× cheaper than the
   miss it guards; the extra ~20 µs per seam reach lands in the caller's
   `projection_readiness_sync_read_build` section.
4. No versioning API on the cache: nothing to fail closed on any more — the
   key is content, so joiners whose cache exposes no version surface during
   join (v1 measured 704/864 unowned builds there; v3/v4 memoized that window
   with membershipPublication UNCOVERED) are keyed soundly.
5. `invalidateAll` on cache/observation-owner replacement — unchanged.

## 6b. Empirical confirmations (receipt file `test/control-plane/projection-readiness-per-node-generation.receipt.test.js`)

- Seam source on both production paths is exactly the six classified fields;
  measured depths 1/2/5/1/1/5 against cap 8.
- A1/A2/A3/A3b/A4/A5/A6/PLANNING on the REAL `SystemTableCache` + REAL
  `MembershipPublicationCoordinator` sync read (five nodes).
- ENGAGEMENT (planning latch LIVE, moving fixture clock, 12 rounds of node-1
  churn, all five nodes read per round): 17 builds / 56 reuses over 65 reads
  (86% reuse); every unaffected node exactly one build. Red-on-revert:
  restoring the six table versions ⇒ 65 builds / 8 reuses (12%), 148
  assertions fail; restoring the planning segment ⇒ 65 builds / 7 reuses
  (11%), 138 assertions fail — both through the named mechanism.
- BOUNDED-WORK on the production wall clock: 15 builds for 20 cluster writes
  × 5 nodes; unaffected nodes exactly 1 build (their inputs never changed).

### Fixture caveat worth knowing (not a product change)
`readMembershipPlanningDerivationVersionKey` receives an ISO `observedAt`, so
its 250 ms latch keys on `Date.now()`; a fixture driving a fake service clock
therefore sees the planning segment rotate on EVERY write (the latch is
refreshed by the other clock). In production both are the wall clock. In v2 the
planning key is not a key segment, so the fixture clock cannot influence
reuse; the PLANNING receipt probes the latch with an advancing numeric clock
only to prove the key actually rotated.

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

Locality IS provable and needs no per-table row-attribution rules and no
cluster-wide version: every field of S(N) is CONTENT-covered, the only large
one (`membershipPublication`) through a per-frozen-object digest cache. The
resulting generation:

```text
semanticGeneration(N) = digest(membershipPublication \ {createdAt, updatedAt})
                      + digest(nodeEvidence(N) \ clock-derived ages)
                      + digest(dimensions, runtimeAuthority,
                               priorityControlPlaneRecovery, publication)
                      + runtimeServeEligible
```

No TTL, clock, evaluation count or object identity participates as an
invalidation signal. Source owners are not touched; the classification lives
in the generation owner (`projection-readiness-evidence-generation.js`) and
consumers only hand it observed inputs.
