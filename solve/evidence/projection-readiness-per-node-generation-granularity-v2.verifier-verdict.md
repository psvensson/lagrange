# Independent verifier verdict — projection-readiness-per-node-generation-granularity-v2

Review `review-0f76ab4ed1324012c6471323`, candidate fingerprint
`sha256:04fb7ad1c263fef1ed9db416568d6823008e0ebd6690868847cae21b85419d49`,
base `d072cece0d96c2de6749d0519ce1914dc59bdfe5`, verifier
`subagent-per-node-generation-v2-verifier-1`.

**Verdict: REJECT** (one concrete in-bar defect in the sealed DEP-SCOPE
fail-closed invariant, category `adversarial-js-intrinsics`; the remaining
findings in the same category and in `harness-fidelity` are hardening items
that the corrective attempt must address or explicitly justify). The central
soundness argument of the candidate — that the semantic core is a pure function
of the six picked fields and that a content digest of those fields is a
complete generation on every production path — was re-derived from code and
HOLDS for every record shape the service builds today. The rejection is about
the safety net the seal promises for shapes it does NOT build today.

## What was re-run (one command at a time, shared machine)

| Command | Result |
| --- | --- |
| `node --test test/control-plane/projection-readiness-per-node-generation.receipt.test.js` | 294/294 pass |
| `node --test test/control-plane/projection-readiness-evidence-owner.receipt.test.js` | 537/537 pass |
| `node --test test/control-plane/projection-readiness-semantic-core-envelope.receipt.test.js` | 35/35 pass |
| `node --test test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js` | 38/38 pass |
| `node --test test/control-plane/publication-readiness-churn-liveness.test.js` (pair witness) | 104/104 pass |
| `node --test test/control-plane/readiness-per-change-reuse.test.js` | 26/26 pass |
| `node --test test/rebalancer/startup-authority-available-node-contract.test.js` (pair witness) | 15/15 pass |
| `node --test test/workflow/owner-key-reconcile-queue.test.js` (pair witness) | 146/146 pass |
| `node --test test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js` (contract test) | 88/88 pass |
| `node --test test/control-plane/control-plane-read-authority-token.test.js` (contract test) | 37/37 pass |
| `node --test test/control-plane/readiness-read-amplification-fast-paths.test.js` | 19/19 pass |
| `node --test test/control-plane/readiness-snapshot-services-version-arbitration.test.js` | 3/3 pass |
| `node --test test/control-plane/replica-dispatch-node-state-update-ready-node-retry-dispatch.test.js` | 44/44 pass |
| Red-on-revert `tables` probe (applied with `/tmp/revert-probe.py`, run, reverted) | 289 tests: 141 pass / 148 fail; ENGAGEMENT 65 builds / 8 reuses (12%), BOUNDED-WORK 55 builds; failing assertions are "exactly the initial build across 12 rounds", "same core reference", "reused on every round" — red through the named mechanism |
| Captured `planning` TAP (`/tmp/red-on-revert-v2-planning.tap`) inspected | 292 tests: 154 pass / 138 fail, same assertion families; BOUNDED-WORK (real clock) stays green under the planning revert, consistent with the receipt text |

Candidate bytes after all probes (`sha256sum -c candidate.sha256` from the
worktree root):

```
src/control-plane/control-plane-readiness-diagnostics-eligibility.js: OK
src/control-plane/control-plane-readiness-publication-diagnostics.js: OK
src/control-plane/control-plane-readiness-service-node-methods.js: OK
src/control-plane/projection-readiness-evidence-generation.js: OK
src/control-plane/projection-readiness-evidence-owner.js: OK
test/control-plane/projection-readiness-evidence-owner.receipt.test.js: OK
test/control-plane/projection-readiness-per-node-generation.receipt.test.js: OK
test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js: OK
test/control-plane/projection-readiness-semantic-core-envelope.receipt.test.js: OK
```

Scratch scripts (not in the repo): a seam dump on a production-shaped cluster
(real `SystemTableCache` + real `MembershipPublicationCoordinator`) listing every
key path in the six records whose name is in the exclusion set, a digest
canonicalization probe (22 cases), and an overflow probe. Their outputs are
quoted below.

## Principal attack: a mutation that changes core(N) without rotating key(N)

### (a) Seam source is exactly the six fields on every production path

- `buildDimensionsEvaluation` is the only caller of
  `resolveNormalizedProjectionReadinessContract`
  (`src/control-plane/control-plane-readiness-diagnostics-eligibility.js:414-484`),
  and `buildEvaluatedNodeReadinessSnapshot`
  (`src/control-plane/control-plane-readiness-evidence-reasons.js:341-352`) is
  its only caller. Every other `buildProjectionReadinessContract` call
  (`control-plane-readiness-evidence-reasons.js:324`, `readiness-transition-state.js:43`,
  `control-plane-readiness-runtime-authority-methods.js:440` missing-row FAIL_CLOSED,
  `eligibility-snapshot.js`) bypasses the owner entirely.
- The context literal on all four production paths
  (`control-plane-readiness-service-node-methods.js:492-548` async incl. the
  SELF_RUNTIME_GRACE branch, `:658-724` sync incl. SELF_RUNTIME_GRACE) carries
  `nodeId,nodeRow,nodeEvidence,lifecycleState,serviceRows,capacity,publication,
  membershipPublication,membershipPublicationPlanningSnapshot,[missingNodeReadinessState],
  persistSnapshot,observedAt,buildStartedAtMs,readinessPlanningOwnerBuild,
  readinessPlanningColdBootstrapBuild` plus `runtimeAuthority`. Intersected with
  `PROJECTION_READINESS_EVIDENCE_SOURCE_FIELDS`
  (`src/control-plane/projection-readiness-evidence-source.js:21-61`) that is
  `{membershipPublication, nodeEvidence, runtimeAuthority}`; the seam adds
  `dimensions, priorityControlPlaneRecovery, runtimeAuthority, runtimeServeEligible`.
  My seam dump confirmed on both the sync (5 nodes) and the async authoritative
  path: `source keys: dimensions,membershipPublication,nodeEvidence,
  priorityControlPlaneRecovery,runtimeAuthority,runtimeServeEligible`, same object
  references between `source.membershipPublication`/`context.membershipPublication`
  and `source.nodeEvidence`/`context.nodeEvidence`, generation `complete`.
- The fresher-stored-snapshot, missing-row FAIL_CLOSED and background-refresh
  paths never reach the seam or reach it through the same two builders. Any
  pick-allowlisted field that ever appears in a context (`status`, `deleted`,
  `projectionReadinessContract`, `repairEligible`, `publicationStream`, ...) is
  caught by `listUnclassifiedProjectionReadinessSourceFields`
  (`projection-readiness-evidence-generation.js`) and routed to
  `resolveContractUnowned` — verified by the receipt's injected-`status` case
  (5/5 unowned, ownedNodeCount 0).

### (b) Purity of `buildProjectionReadinessState`

`src/control-plane/projection-readiness-state.js:52-91`,
`projection-readiness-evidence.js:621-794`, `projection-readiness-decision.js`,
`publication-owner-state.js`, `priority-recovery-planning-intent.js`: no clock,
no `this`, no module state that influences output (grep for
`Date|now(|performance|Math.random|globalThis` = 0). The only module state is
identity caches keyed on deep-frozen inputs
(`projectionReadinessFrozenInputCache`, `evidence.js:69-72,118-133`), which are
sound because `copyStrictOwnDataRecord` (`src/utils/strict-own-data.js:61-93`)
rejects accessors, symbol and non-enumerable keys, so a frozen record admitted
by the cache cannot change content.

### (c) Excluded fields are not consumed from the core

Seam dump on the production-shaped cluster — every excluded-name path in the
six records: `membershipPublication.createdAt/updatedAt` (top level only),
`nodeEvidence.heartbeatAgeMs/readyLeaseAgeMs`,
`runtimeAuthority.publication.enteredAt`, `runtimeAuthority.visibility.enteredAt`,
`priorityControlPlaneRecovery.enteredAt`, `publication.enteredAt`. No
`observedAt`/`observedAtMs` at any depth. Consumers of the core:
`active-node-projection.js:190-208` (runtimeAuthority booleans/state),
`node-trust-state.js:219` (`evidence.projectionRevision`),
`control-plane-mutation-readiness.js`, `readiness-transition-state.js:124-131`,
`replica-dispatch-priority-recovery-bootstrap.js:87`,
`query-executor-priority-recovery-bootstrap-routing.js:117`,
`startup-authority-snapshot-*.js` — all read `state/ready/lanes/activeGate/
priorityRecovery.active/reasonCodes/publication.ready`. No production reader of
`evidence.raw`, `visibility.enteredAt`, `publication.enteredAt`,
`priorityRecovery.enteredAt`, or `heartbeatAgeMs`/`readyLeaseAgeMs` from the
core (`heartbeatAgeMs` readers in `node-trust-state.js:163-164`,
`control-plane-readiness-service-node-methods.js:94`,
`authoritative-node-evidence-reconciler.js:341` all read the envelope's
top-level `nodeEvidence`, which `createEligibilitySnapshot` refreshes per
evaluation). The 15 s grace wrapper
(`control-plane-readiness-evidence-reasons.js:85-108`) reads `enteredAt` from the
freshly built state and emits `inGracePeriod`, which IS digested. The row
fields the ages derive from (`lastHeartbeat`, `readyLeaseExpiresAt`) and the
clock-crossing booleans (`readyNow`, `clusterMemberHealthy`) stay in the key.
Verdict: exclusions are observation-time for every consumer.

### (d) Digest cache and digest-vs-normalizer coverage

- `MEMBERSHIP_PUBLICATION_DIGEST_BY_FROZEN_OBJECT` caches only when every
  visited container is frozen (`trace.trackFrozen`/`unfrozen`); the receipt's
  shallow-frozen case and my probe confirm an unfrozen nested container is
  re-digested. A frozen object with an enumerable getter IS cache-served
  (probe: same key across calls while the getter advanced) — unreachable for
  service-built literals, and the normalizer rejects accessors anyway
  (`strict-own-data.js:55-59`).
- Coverage: digest walks `Object.keys` (own enumerable string keys) and array
  indices `0..length-1`; the normalizer copies exactly own enumerable string
  data keys (`Reflect.ownKeys` + descriptor check, whole record INVALID on
  anything else) and dense indices. For every record the normalizer ADMITS,
  digest coverage equals normalizer coverage minus the exclusion names. The
  gap is records the normalizer REJECTS (see finding F2).
- Depth: cap 8 vs normalizer 16; overflow sets `trace.overflow`, the cached
  membership verdict remembers it, `buildProjectionReadinessGeneration` returns
  INCOMPLETE and the seam calls `resolveContractUnowned`, which never touches
  `entryByNodeId`. Verified in code and by the receipt (fail-closed test).

### (e) Canonicalization collisions (probe, 22 cases)

- `{a:'x', b:'y'}` and `{a:'x;b=s:y'}` produce the SAME key; `['a','b']` and
  `['a,s:b']` produce the same key (strings are concatenated without escaping
  or length prefix).
- `-0`/`0` same key (harmless: no consumer distinguishes).
- `Date` vs `{}`, class instance vs plain, symbol key vs none, non-enumerable
  key vs none, sparse `[,]` vs `[undefined]`: SAME key while the core flips
  between valid and `sourceInvalid` (see finding F2).
- `undefined` vs missing key, bigint vs number, null vs `'n'`, `{0:'a'}` vs
  `['a']`, nested `createdAt` inside membershipPublication: distinct keys
  (correct).
- Realistic reachability of a collision: none found. Every digested record has
  a fixed key schema per level (`buildClusterMemberHealthDetails`,
  `buildMembershipPublicationDiagnostics`, `buildRuntimeAuthoritySnapshot`,
  `buildPriorityControlPlaneRecoveryProjection`), so an injected leaf string
  cannot fabricate a key that is otherwise absent, and node ids / reason codes
  / transport reasons never carry `;=` sequences shaped as digest pairs.

### (f) Timing and the sync memo stamp

- The async path may observe `membershipPublication` at t0 and `nodeRow` at t2
  across a t1 mutation; the core is built synchronously from exactly the
  digested objects inside `resolveContract` (no await between digest and
  build), so key(N) == digest(inputs the core was built from), and by purity a
  later evaluation whose key equals it would build the identical core. The key
  can never be newer than the content. The R6 bracket is therefore dead and
  its removal from `control-plane-readiness-service-node-methods.js` is safe.
- Memo stamp: `bumpTableMutationVersion` runs synchronously inside
  `applySystemTableChange` after every row set/delete and inside the
  anti-entropy eviction (`src/cache/system-table-cache.js:303,540`); every apply
  branch that mutates a row sets `recordForNotification`, so a sync reader can
  never see new rows under an old version. The row read
  (`membership-publication-coordinator-reads.js:227-242`
  `getLatestPublicationRowSync` -> `systemTableCache.getAll`) and the stamp
  read the same cache object in production
  (`src/bootstrap/shared/control-plane-setup.js:284-293,430-437`).
  `buildPublicationRecoveryProtocolSnapshot` is a pure function of the row.
  `SystemTableCache.clear()` resets the version counters (test-only API, no
  production caller) — the only way the stamp could alias.
- Joiners whose readiness service holds the read-only proxy
  (`src/cache/read-only-system-table-cache.js`, no `getTableMutationVersion`)
  get the constant stamp and keep the listener-cleared memo; the content key
  remains sound there (and repairs the v3/v4 latent under-invalidation the v1
  measurement recorded).

### (g) Planning derivation key removal

`membershipPublicationPlanningSnapshot` is in the context but is NOT a picked
field; the planning snapshot reaches the core only through
`runtimeAuthority` (`recoveryEligible`, `visibility.observationState/
publicationStatus`, `reasonCodes`, `priorityRecoveryActive` —
`control-plane-readiness-runtime-authority-methods.js:230-379`),
`priorityControlPlaneRecovery`
(`control-plane-readiness-startup-authority-health.js:398-600`: gate,
observation, summary, reason codes, epoch/status), `dimensions` and
`runtimeServeEligible` — all digested. `isControlPlaneRecoveryEligible` feeds
`recoveryEligible`. No other route found; removal is sound.

### (h) Coupled pair `readiness-freshness-macrotask-bound`

Contract `readiness-versioned-planning-liveness` (`test/shards/impact-contracts.json`)
is about complete-token freshness, macrotask-bounded planning and non-recursive
owner reads. The removed code in `control-plane-readiness-service-node-methods.js`
was a version snapshot threaded into the context and consumed only by the
eligibility seam; no token, scheduler or read path changed. Witness and
contract tests pass (table above). No remaining reference to
`projectionReadinessGenerationVersions`, `captureProjectionReadinessGenerationVersions`,
`snapshotProjectionReadinessTableVersions` or `PROJECTION_READINESS_GENERATION_TABLES`
in `src/`, `test/`, `docs/`, `architecture/`.

## Template categories

### admission-gating
Gate = the fail-closed admission of a generation (`buildProjectionReadinessGeneration`,
`projection-readiness-evidence-generation.js`) and the owner's
`resolveContract`/`resolveContractUnowned` split
(`projection-readiness-evidence-owner.js`). Reasons are string enums counted in
`unownedBuildCountByReason`; the evaluation is per decision from the observed
inputs (no TTL/clock). Precheck-predicts-enforcement: the unclassified check
runs on the SAME `source` object the build normalizes. Message honesty gap: the
dep-scope map §6 names `unclassified_source_skip`, the code emits
`unclassified_source_field` (doc drift, out-of-bar). Finding F1 below is the
admission's failure to fail closed on one overflow input.

### adversarial-js-intrinsics
Items 1-8 evaluated against `projection-readiness-evidence-generation.js`
(`canonicalScalarDigest`, `canonicalDigest`, `digestMembershipPublication`):
own-property discipline OK (`Object.keys`), prototype pollution OK for keys
(own only), array authenticity OK (indexed reads, `Array.isArray`), numeric
edge OK (`d:` prefix; `-0`==`0` harmless). Item 3/5/7 FAIL: see F1 and F2.
Item 6 (mutable intrinsics: `Object.keys().sort()`, `String()`, `Array.isArray`)
is unpinned; acceptable only because the module consumes service-built records
and the hardened boundary is the normalizer — note it in the module header.

### concurrency-serialization
TOCTOU after awaits on the async path is resolved by construction (section f);
the sync path has no awaits; the digest WeakMap set and the memo stamp read are
synchronous; no timers, no single-flight claims added.

### formation-circularity
No new readiness-internal owner read: the stamp is a version read on the cache
the service already observes through; the digest reads only the observed
context. The candidate does not bypass the ReadinessPlanningSnapshotOwner or
the stored-snapshot layer. Formation-window client operations (routing, CDC
forward selection, provisioning admission) see the same owner-built cores; the
live run's early `Insufficient admissible provisioning targets` errors were
investigated (out-of-bar finding O5) and the trust states match BEFORE's class.

### harness-fidelity
Red for the right reason: re-ran the `tables` revert myself (numbers above) and
inspected the captured `planning` TAP — both fail the named ENGAGEMENT
assertions through reuse collapse, not through a crash (one incidental
`getTableMutationVersion is not a function` in the unversioned-cache case is a
probe artifact). Stub honesty: real `SystemTableCache`, real
`MembershipPublicationCoordinator` sync read over a real membership row, real
`ControlPlaneReadinessService`; stubbed `messageRouter.getConnectionState`,
storage accounting, publication-mode diagnostics. Time: ENGAGEMENT uses a +40 ms
per-call fixture clock (planning latch keyed on `Date.now`, documented);
BOUNDED-WORK uses the wall clock. Reads are forced past the CL-012 stored
snapshot by a SERVICES touch each round — this measures the owner, not the
caller, and is stated. Live binding: the `projection_readiness_owner_build_*`
sync sections appear in the archived docker logs. Fidelity gap: the DEP-SCOPE
depth receipt (1/2/5/1/1/5) is measured on an idle cluster with no
priority-recovery witness content — see finding F3.

### recovery-replay
Cache/observation-owner replacement still calls `invalidateAll` and clears the
memo (`control-plane-readiness-participation-base.js:499-516`); the content key
cannot alias a stale core to a newer generation after replay; a memo built from
a previous cache is dropped on swap. Absence-proves-nothing: `nodeEvidence`
null (missing row) is digested as `u`, distinct from any record.

### sweep-timer
No timer or sweep added; the sync memo no longer depends on the `setImmediate`
listener when a version surface exists (the listener clear stays). The key uses
no clock (`DIGEST_OBSERVATION_TIME_FIELDS` excludes the only clock-derived
scalars; `readyNow`/`clusterMemberHealthy` crossings rotate through booleans).

### transport-delivery
Transport state enters the key through `nodeEvidence`
(`routerConnectionState`, `transportConnected`, local-query transport fields)
and the verdict booleans — strictly more invalidation than v4 (A5 receipt,
CONNECTED->READY rotates without a boolean flip). The fixture's router stub only
provides `getConnectionState`; no delivery/ack semantics are touched.

## Findings

### In-bar (category `adversarial-js-intrinsics`)

**F1 (blocking) — the fail-closed overflow branch throws instead of failing closed.**
`src/control-plane/projection-readiness-evidence-generation.js`,
`canonicalScalarDigest`: a container at `depth >= DIGEST_MAX_DEPTH` is rendered as
`DIGEST_TAG.OPAQUE_PREFIX + String(value)`. `String()` on a null-prototype
object throws `TypeError: Cannot convert object to primitive value`, and on any
object invokes user `toString`/`Symbol.toPrimitive`. Reproduction (scratch):

```js
let deep = Object.create(null); deep.leaf = true;
for (let i = 0; i < 8; i++) deep = {deep};
buildProjectionReadinessGeneration({...base, runtimeAuthority: deep}, classifiedSource)
// -> TypeError: Cannot convert object to primitive value   (plain object at the same depth -> {state:'incomplete', reason:'digest_depth_overflow'})
```

The sealed DEP-SCOPE invariant says the seam "fails CLOSED (build without
memoizing, counted) for ... digest depth overflow"; on this input the exception
propagates out of `computeProjectionReadinessGeneration` ->
`buildDimensionsEvaluation` -> `evaluateNodeReadiness`/`buildNodeReadinessSyncCurrent`
and the readiness evaluation fails outright. Null-prototype records are routine
in the digested graphs (`membership-publication-priority-partition-summary.js:604,675,696`
`exclusionReasonCounts`, `membership-publication-priority-partition-canonical-data.js:172`,
every `copyStrictOwnDataRecord` copy), today at depth <= 3, so the throw is not
reachable with current shapes — but the invariant exists precisely for shapes
that are not current. Fix: emit a constant opaque token for the overflow branch
(no coercion) and a `typeof`-tag for non-object non-primitives; keep
`trace.overflow = true`.

**F2 (must address or justify) — the digest is not injective over the normalizer's
input domain.** Same file. (i) String leaves are concatenated without escaping
or length prefix, so `{a:'x', b:'y'}` == `{a:'x;b=s:y'}` and `['a','b']` ==
`['a,s:b']`. (ii) Values the strict normalizer REJECTS (Date, class instance,
symbol or non-enumerable key, accessor, sparse array, proxy) digest identically
to their plain twins while `buildProjectionReadinessContract` flips between a
valid core and the degenerate `sourceInvalid` core — same key, different core.
Not reachable with service-built records (fixed key schemas, JSON-derived
values), but the seal claims "rotates iff it changes N's observed semantic
inputs" as a shape-independent invariant and the safety net does not mirror the
boundary it protects. Fix: length-prefix (or JSON-escape) strings and keys, and
mark the generation INCOMPLETE (new reason) whenever a visited value is one the
normalizer would reject (non-plain prototype, non-data or symbol key, hole), so
digest domain == normalizer domain.

### In-bar (category `harness-fidelity`)

**F3 (recommendation, address or justify) — depth headroom measured on an idle
cluster.** The DEP-SCOPE receipt pins depths 1/2/5/1/1/5 against cap 8 on a
five-node cluster with no in-flight priority recovery. Under live recovery,
`priorityControlPlaneRecovery.priorityRecoveryObservation.priorityRecoveryCurrentSummary
.partitionSnapshots[i].{operationOwnerObservation|topologyOperatorWitness}.<record>`
(`priority-recovery-observation-partition-witness.js:323,388-460`) reaches depth
6-7, one or two levels under the cap; an overflow is fail-closed (unowned build,
counted) so soundness holds, but the memo would silently switch off in exactly
the recovery window the quest targets. The normalizer already bounds depth at
16 (`PROJECTION_READINESS_MAX_OWN_DATA_DEPTH`); raising `DIGEST_MAX_DEPTH` to
match removes the cliff at no soundness cost (cycles still overflow), and the
receipt should measure depth on a fixture with witness content or state the
margin explicitly. The live run recorded 0 unowned builds, so this did not fire
there.

### Out-of-bar observations (recorded once, not waived)

- **O1 stored-snapshot-macrotask-inconsistency** —
  `control-plane-readiness-stored-snapshot-reuse.js:47-58` overrides the top-level
  `membershipPublication` with the fresh diagnostics while keeping the stored
  core/dimensions. Before this candidate the sync memo was stale in the same
  macrotask, so both halves were consistently old; with the version-stamped memo
  the window becomes mixed-freshness (top-level new epoch, core old epoch) until
  the listener invalidates. Already recorded by the author as a separate owner;
  noting that the candidate changes the shape of that window.
- **O2 counters-unbounded-growth** — `ProjectionReadinessEvidenceOwner.statsByNodeId`
  is populated for every nodeId seen and never pruned (`nodeCounters`), and
  `entryByNodeId` is never pruned in production (`invalidateNode` has no src
  caller). Node ids are per-boot UUIDs, so a long-lived seed accumulates one
  small record per join. Pre-existing for `entryByNodeId`; `statsByNodeId` is new.
- **O3 doc-drift** — `projection-readiness-evidence-generation.js` header comment
  above `GENERATION_TABLE_VERSION_KV` still says the membershipPublication graph
  is "covered by the global table version instead"; dep-scope §6 names the
  reason `unclassified_source_skip` (code: `unclassified_source_field`).
- **O4 landing-scope-shards** — `test/shards/primary-classes.json`,
  `resource-classes.json`, `subsystem-classes.json` are modified in the worktree
  (census for the new receipt file) but are not in the review manifest; the two
  previous quest landings (`50bfe369b`, `c81554f14`) committed them together with
  `test/shards/impact-graph-seal.json`, which is not yet regenerated here.
- **O5 live-run-provisioning-cohort-errors** — the archived after-v2 seed log
  has four `Initial table partition provisioning failed: Unable to satisfy
  minimum routable provisioning cohort ... provisionable=0` errors at 20:13:21-43
  (55-80 s in) that the BEFORE run lacks (the v1 `after` run has eight). The
  node trust states at those instants (`planning_snapshot_refresh_pending`,
  `transport_unknown`, `freshness_unknown`, later
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`) are the same class BEFORE shows at
  19:34:22-24; the difference is that BEFORE's retries found an existing routable
  replica on the seed and v2's did not. I could not attribute this to the key
  from logs (the trust states are envelope-derived, not core-derived), but the
  receipt's "same downstream family" wording covers only the ratings failure,
  and the v2 run ended at 5.5 min vs 16 min for BEFORE. The seed numbers
  themselves re-extract exactly (85,163 -> 69,960 sync reads; 47,402 -> 7,627
  builds; 8.6% -> 81.4% reuse; 0 unowned; joiners 74/79/81/65%).
- **O6 joiner-memo-window** — readiness services holding the read-only cache
  proxy (no `getTableMutationVersion`) keep the deferred-listener memo window on
  the sync path; pre-existing CL-019 behavior, unchanged by the candidate, and
  the content key is sound there regardless.

## Sealed receipts of closed quests (edited files)

- v3 `projection-readiness-evidence-owner.receipt.test.js` DEP: the six-table
  assertion is replaced by the content classification plus a
  membership-publication rotation/timestamp-invariance pair; the transport /
  lifecycle / publication-mode rotations and the authoritative-refresh
  non-elision assertion are preserved. Claim preserved (the covered classes now
  rotate by content, which the receipt checks).
- v4 `projection-readiness-semantic-core-envelope.receipt.test.js` SEMANTIC-KEY:
  `tableVersions`/`planningVersionKey` rotations replaced by
  membership-publication content and node-evidence rotations; observation-time
  exclusion assertions unchanged; integration tests model "the generation
  moved" as a real heartbeat row change (`advanceNodeHeartbeat`), which is what
  the bare `bumpTableMutationVersion(NODES)` stood for. Claim preserved.
- B `projection-readiness-planning-consumption-owner.receipt.test.js` B4: the
  bare NODES bump becomes a node-row change with a different `lastHeartbeat`;
  the assertion that the new core is consumed immediately is unchanged. Claim
  preserved.

---

# Delta review (review-599d46d2) — corrective candidate

Review `review-599d46d2a6bd15063c08af33`, candidate fingerprint
`sha256:db975b7c26fd50e1bcc6aa77623fa53338ec729fd8399369dcf1f7017f3c212b`,
same base `d072cece0`, verifier `subagent-per-node-generation-v2-verifier-1`.

**Verdict: REJECT** (round 2). F1 and F3 are resolved; F2 is resolved for
every value under a DIGESTED key, but the domain mirror has a hole for values
under an EXCLUDED (observation-time) key: the digest validates the slot
descriptor and then skips the value entirely, while the strict normalizer walks
that value and rejects the whole source. Six reproduced shapes give the SAME
COMPLETE key for a valid core and for the degenerate `sourceInvalid` core —
exactly the alias the corrected receipt text and dep-scope §6.3 now claim can
never happen. Not reachable with production values (every excluded field is a
number, ISO string or null by construction), but the sealed receipt states
"INCOMPLETE for any value the strict own-data normalizer would reject" and that
statement is false as written. The fix is a few lines (walk the excluded value
for domain/depth with the same trace and discard the rendered text) or a
narrowed claim.

## Delta scope

Only three candidate files changed against review-0f76ab4e (sha diff of the two
candidate lists): `src/control-plane/projection-readiness-evidence-generation.js`
(digest section), `test/control-plane/projection-readiness-per-node-generation.receipt.test.js`
(DEP-SCOPE fail-closed test, cap import) and
`src/control-plane/projection-readiness-evidence.js` (one export line,
`PROJECTION_READINESS_MAX_OWN_DATA_DEPTH`; verified by `git diff HEAD`). The
other seven candidate files are byte-identical to the first review, so the
seam-source exactness, core purity, excluded-field consumer analysis,
planning-key removal, memo stamp and R6 removal verdicts carry over unchanged.

## Re-runs (one at a time)

| Command | Result |
| --- | --- |
| `node --test test/control-plane/projection-readiness-per-node-generation.receipt.test.js` | 311/311 pass |
| `node --test test/control-plane/projection-readiness-evidence-owner.receipt.test.js` | 537/537 pass |
| `node --test test/control-plane/projection-readiness-semantic-core-envelope.receipt.test.js` | 35/35 pass |
| `node --test test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js` | 38/38 pass |
| `node --test test/control-plane/readiness-per-change-reuse.test.js` | 26/26 pass |
| `node --test test/control-plane/publication-readiness-churn-liveness.test.js` (pair witness) | 104/104 pass |
| `node --test test/rebalancer/startup-authority-available-node-contract.test.js` (pair witness) | 15/15 pass |
| `node --test test/workflow/owner-key-reconcile-queue.test.js` (pair witness) | 146/146 pass |
| `node --test test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js` | 88/88 pass |

The revert probe script was not used (anchors no longer match); the first
review's red-on-revert evidence stands for the unchanged ENGAGEMENT /
BOUNDED-WORK mechanism (owner, seam and receipts are byte-identical).

## (1) Domain mirror vs `strict-own-data.js` / `normalizeProjectionReadinessOwnDataGraph`

Mirrored correctly (verified by probe, 30 shapes): Date / class instance /
boxed primitive / Map / typed array (prototype check), symbol key, accessor
(descriptor read, getter never invoked), non-enumerable key, sparse array,
subclassed array, function and symbol leaf, Proxy at root / nested / in an
array / proxy-of-function (`isProxy` before any trap-able operation; 0 trap
calls), module namespace object, `arguments` object; the frozen membership cache
replays `rejected` and `overflow` verdicts; a lying `Symbol.iterator` array is
accepted by both (indexed reads on both sides).

Divergences found:

- **F4 (blocking, false acceptance) — values under excluded keys are not
  validated.** `canonicalRecordDigest` calls `readOwnDataValue` for an excluded
  key and then `continue`s without digesting or walking the slot value. The
  normalizer (`normalizeProjectionReadinessOwnDataRecord`, evidence.js:174-213)
  knows no exclusions and recurses into every value. Probe (each pair: same
  COMPLETE key, core A `sourceInvalid=true`, core B `sourceInvalid=false`):
  `{a:1, observedAt: new Date(0)}` vs `{a:1, observedAt: 0}`;
  `runtimeAuthority {b:true, enteredAt: () => 1}` vs `{b:true, enteredAt:'x'}`;
  `{a:1, heartbeatAgeMs: new Proxy({}, {})}` vs `{a:1, heartbeatAgeMs: 5}`;
  `{a:1, observedAtMs: {get g(){}}}` vs `{a:1, observedAtMs: {}}`;
  membershipPublication `{publicationEpoch:1, createdAt: new Date(0)}` vs
  `{publicationEpoch:1, createdAt: 0}` (top-level exclusion, and the frozen
  digest cache would then replay the aliasing COMPLETE verdict);
  a 20-deep container under `observedAt` vs `observedAt: 0` (normalizer depth
  overflow, digest COMPLETE). Contradicts receipt
  `DEP-SCOPE-fail-closed-unclassified-and-overflow-never-memoized` ("INCOMPLETE
  ... for any value the strict own-data normalizer would reject") and dep-scope
  §6.3 ("a key must never alias it to a valid core"). Fix: for an excluded key
  still run `canonicalSlotDigest(slot, trace, depth + 1)` and discard the
  rendered string (the shared `trace` then carries `rejected`/`overflow`/
  `unfrozen`), and add the six shapes to the receipt; or narrow the sealed text
  to "any value under a digested key".
- **F5 (minor, inexact claim, sound) — depth off by one.** The normalizer is
  entered with the whole source at depth 0, so a field's value sits at
  normalizer depth 1 while the digest starts each field at depth 0. A container
  at field-relative depth 15 is therefore normalizer-INVALID
  (`depth >= 16` at 16) but digest-COMPLETE (probe: depth 14 COMPLETE/valid,
  depth 15 COMPLETE/`sourceInvalid`, depth 16 `digest_depth_overflow`). This is
  sound — any two sources sharing that key both carry a container at that path
  and both produce the same degenerate core; the probe `{x:1}` vs `{x:2}` at
  depth 15 gives distinct keys — but the receipt text "a graph it would fail
  closed on is INCOMPLETE" and "the digest cap IS the normalizer's cap" are off
  by one level. Use `PROJECTION_READINESS_MAX_OWN_DATA_DEPTH - 1` for the
  digest cap (field depth 0 == normalizer depth 1) or state the offset.
- **F6 (minor) — no early exit after a rejection.** `copyDenseOwnDataArray`
  returns at the first hole; `canonicalArrayDigest`/`canonicalRecordDigest`
  keep walking after `trace.rejected` is set. `new Array(5_000_000)` with one
  element takes 640 ms to reject (normalizer: microseconds). Hostile shapes are
  not this module's threat model, but the mirror should short-circuit on the
  first rejection.
- **F7 (note, false rejection only)** — a non-enumerable array index is
  accepted by `copyDenseOwnDataArray` (it checks only for a `value` field) but
  rejected by `readOwnDataValue` (`enumerable !== true`). Costs reuse only;
  document or align.

## (2) Injectivity of the length-prefixed serialization

Grammar: fixed tokens `n`, `u`, `bT`, `bF`, `x:rejected`, `x:overflow`; `d:<number text>`
(never contains `; , ] }`); `i:<digits>`; `s<len>:<text>`; keys `<len>:<key>=`;
arrays `a[ ... , ]`; records `o{ ... ; }` with sorted keys. Every token starts
with a distinct first character, strings and keys are pinned by their UTF-16
length, so the concatenation is prefix-free and injective. Probe: key/value
forging, array forging, `x:rejected`/`x:overflow` as genuine strings (rendered
`s10:x:rejected`), empty string vs `undefined`, empty key vs absent key, array
vs numeric-key record, `1` vs `'1'`, `1n` vs `1`, `true` vs `'bT'`, `null` vs
`'n'`, nested vs flattened key, `'a:b'` key vs nested, `1e21` vs `'1e+21'`,
newline in a value — all distinct. Only `-0` vs `0` collide (unchanged,
harmless: no consumer distinguishes them).

## (3) No user code invoked

Accessor: 0 getter calls (descriptor read only). Hostile `toString` /
`Symbol.toPrimitive` at the root and at the cap: 0 calls. Proxy with
`ownKeys`/`getOwnPropertyDescriptor`/`isExtensible`/`getPrototypeOf`/`get` traps
at root, nested and inside an array: 0 trap calls (`isProxyValue` runs before
`Object.isFrozen`, `Array.isArray`, `Reflect.ownKeys` and `getPrototypeOf`; a
proxy of a function is rejected by `typeof` first). `Reflect.ownKeys` is not
wrapped in try/catch as the normalizer's is, but it can only throw for proxies,
which are already rejected. Excluded-key values are never touched (which is
also the F4 hole).

## (4) Cost on production shapes

Micro-benchmark on the seam records of the real-cache five-node fixture (same
inputs to both modules; previous candidate reconstructed from the review-1
diff): per-evaluation generation with the membership digest cached (sync path)
**43 µs (new) vs 23 µs (old), 1.9x**; uncached membership digest (async path)
105 µs vs 63 µs; per segment (new): priorityControlPlaneRecovery 29 µs (5.4 KB),
runtimeAuthority 4.5 µs, nodeEvidence 2.5 µs, dimensions 1.8 µs, publication
0.8 µs. The normalize/freeze miss the digest guards costs 182 µs with fresh
verdict identities (208 µs incl. clone), so the digest is still ~4x cheaper
than a miss and the expected per-evaluation cost at 81% reuse is ~78 µs versus
182 µs before the quest. The extra ~20 µs per seam reach is ~0.8 s CPU over
the 5.5-minute seed window (~0.25% of wall) and lands in the caller's
`projection_readiness_sync_read_build` section, not the owner sections; the
LIVE receipt's reuse/builds-per-read bar is unaffected because rotation
semantics on production shapes are identical (both digests COMPLETE and
content-injective there). Key length 12,039 -> 13,543 bytes. Recorded as a
harness-fidelity note (the archived LIVE CPU figures predate the heavier digest).

## (5) Earlier verified claims

Unchanged by construction: the seven other candidate files hash-identical to
review-0f76ab4e; `projection-readiness-evidence.js` differs from HEAD by one
export line. Seam source exactness, purity, excluded-field consumers,
planning-key removal, memo stamp and R6 removal stand; pair witnesses and
contract tests re-run green above.

## Status of the first-round findings

- F1 resolved: overflow renders the constant `x:overflow`, function/symbol
  leaves `x:rejected`; null-prototype at the cap and throwing
  `toString`/`Symbol.toPrimitive` containers fail closed without a call
  (probe and receipt).
- F2 resolved for digested keys (domain mirror + length prefixes, receipts);
  open for excluded-key values (F4 above).
- F3 resolved: `DIGEST_MAX_DEPTH = PROJECTION_READINESS_MAX_OWN_DATA_DEPTH`
  (asserted equal), margin stated in dep-scope §6.2 — modulo the one-level
  offset in F5.

## Out-of-bar carried forward

O1 stored-snapshot mixed-freshness window, O2 counters never pruned, O4
`test/shards/*-classes.json` modified but outside the manifest, O5 live-run
provisioning-cohort errors, O6 joiner read-only-proxy memo window — all still
open and unchanged. O3 (doc drift) is resolved in this candidate.

## Candidate bytes after the delta review

```
sha256sum -c candidate2.sha256
src/control-plane/control-plane-readiness-diagnostics-eligibility.js: OK
src/control-plane/control-plane-readiness-publication-diagnostics.js: OK
src/control-plane/control-plane-readiness-service-node-methods.js: OK
src/control-plane/projection-readiness-evidence-generation.js: OK
src/control-plane/projection-readiness-evidence-owner.js: OK
src/control-plane/projection-readiness-evidence.js: OK
test/control-plane/projection-readiness-evidence-owner.receipt.test.js: OK
test/control-plane/projection-readiness-per-node-generation.receipt.test.js: OK
test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js: OK
test/control-plane/projection-readiness-semantic-core-envelope.receipt.test.js: OK
```

---

# Delta review (review-4c5a58e8) — round 3

Review `review-4c5a58e86513f211940c2a5b`, candidate fingerprint
`sha256:fb7a79ec5d6199f2cc762f5bc728f399f3fff3e8125d2e8a380ca22b0df5f3d8`,
same base `d072cece0`, same 10 paths, verifier
`subagent-per-node-generation-v2-verifier-1`.

**Verdict: APPROVE.** F4, F5 and F6 are repaired and re-attacked; the digest
domain now agrees with the strict normalizer on every shape I could construct
or generate (40,000 random differential shapes, 0 false acceptances, 0 false
rejections), the sealed receipt and dep-scope text are true as written, and
every earlier-verified claim is untouched.

## Delta scope

Hash comparison against `candidate2.sha256`: only
`src/control-plane/projection-readiness-evidence-generation.js` and
`test/control-plane/projection-readiness-per-node-generation.receipt.test.js`
changed; the other eight candidate files are byte-identical to review
599d46d2 (and, transitively, the seven non-generation files to review
0f76ab4e). The two evidence docs (dep-scope §6.2/§6.3, receipt JSON) carry the
F4/F5/F6 text and the cost caveat on the LIVE receipt.

## Re-runs (one at a time)

| Command | Result |
| --- | --- |
| `node --test test/control-plane/projection-readiness-per-node-generation.receipt.test.js` | 322/322 pass |
| `node --test test/control-plane/projection-readiness-evidence-owner.receipt.test.js` | 537/537 pass |
| `node --test test/control-plane/projection-readiness-semantic-core-envelope.receipt.test.js` | 35/35 pass |
| `node --test test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js` | 38/38 pass |
| `node --test test/control-plane/readiness-per-change-reuse.test.js` | 26/26 pass |
| `node --test test/control-plane/publication-readiness-churn-liveness.test.js` (pair witness) | 104/104 pass |
| `node --test test/rebalancer/startup-authority-available-node-contract.test.js` (pair witness) | 15/15 pass |
| `node --test test/workflow/owner-key-reconcile-queue.test.js` (pair witness) | 146/146 pass |

## Re-attack of the domain mirror (F4 fix in place)

Code (`projection-readiness-evidence-generation.js`, `canonicalRecordDigest`):
every own key's slot is read with `requireEnumerable=true`, its value is walked
through `canonicalSlotDigest` with the SHARED trace, the record returns
`REJECTED` as soon as `trace.rejected` is set, and only then is an excluded key's
rendered text dropped. `canonicalArrayDigest` reads indexes with
`requireEnumerable=false` (mirrors `copyDenseOwnDataArray`, which requires only
a `value` field) and returns at the first rejected slot. `DIGEST_MAX_DEPTH =
PROJECTION_READINESS_MAX_OWN_DATA_DEPTH - 1` (field depth 0 == normalizer depth 1).

Named probes (each pair compared on key equality AND on
`buildProjectionReadinessContract(...).evidence.sourceInvalid`):

- The six round-2 aliasing shapes (Date under `observedAt`, function under
  `enteredAt`, Proxy under `heartbeatAgeMs`, accessor inside a container under
  `observedAtMs`, Date under membership top-level `createdAt`, 20-deep
  container under `observedAt`): each now `digest_domain_violation` /
  `digest_depth_overflow`, plain twin COMPLETE, no alias.
- New: Date under `observedAt` inside an array element, symbol key inside a
  container under `enteredAt`, a non-enumerable `observedAt` slot: rejected.
- `{a:1, observedAt:5}` vs `{a:1, observedAt:9}`: equal keys (exclusion still
  works for admissible values).
- Frozen membership root with a Date under `createdAt`: rejected on both calls
  (the cache replays the rejection); a shallow-frozen root with a mutated
  unfrozen child is re-digested.
- Depth boundary, field-relative: container/array/excluded-key container at
  13 and 14 COMPLETE + valid, at 15 `digest_depth_overflow` + `sourceInvalid`
  (exact match with the normalizer at every depth tried).
- F6: 5,000,000-length sparse array rejected in 11 ms; a 200k-key record with
  a trailing symbol leaf in 197 ms (the symbol key rejects before any slot is
  walked); non-enumerable array index COMPLETE and normalizer-valid.

Differential fuzz: a generator over primitives (incl. `-0`, `NaN`, bigint),
Date / function / symbol / class instance / Map / Proxy /
`Object.create(Array.prototype)` leaves, plain and null-prototype records,
arrays with holes, non-enumerable and accessor indexes, subclassed arrays,
accessor / non-enumerable / symbol record keys, excluded key names at every
level, nestings of 13–17 levels, and (for the membership path) deep-frozen and
shallow-frozen roots. 20,000 shapes through `nodeEvidence` and 20,000 through
`membershipPublication` (cached path, each digested twice): **agree = 40,000,
false acceptances = 0, false rejections = 0, cache mismatches = 0, no
exception from either side.**

Reasoned residuals (not defects): `Reflect.ownKeys` is not wrapped in
try/catch as the normalizer's is, but only proxies can make it throw and those
are rejected first; `-0` and `0` still share a key (harmless, unchanged).

## Cost re-measure

Round-3 digest on the production-shaped seam records: 43.8 µs per evaluation
with the membership digest cached (review-1 candidate: 23.2 µs; normalize miss
with fresh identities: 180.5 µs) — unchanged from round 2, now recorded in
dep-scope §6.3 and as a caveat on the LIVE receipt (the reuse / builds-per-read
bar and the owner build CPU are unaffected because rotation semantics on
production shapes are identical).

## Status of all findings

- F1 (throw on overflow), F2 (injectivity + domain mirror for digested keys),
  F3 (depth headroom), F4 (excluded-key values), F5 (depth offset), F6 (early
  exit, array-index enumerability): resolved and sealed in the receipt file.
- Out-of-bar carried forward, unchanged and still open: O1 stored-snapshot
  mixed-freshness window (separate owner, recorded by the author), O2 owner
  counters never pruned, O4 `test/shards/*-classes.json` outside the manifest
  (landing should carry them and regenerate `impact-graph-seal.json` as the
  previous two landings did), O5 live-run early provisioning-cohort errors
  (not attributable to the key; LIVE numbers re-extract exactly), O6 joiner
  read-only-proxy memo window (pre-existing).

## Candidate bytes after the round-3 review

```
sha256sum -c candidate3.sha256
src/control-plane/control-plane-readiness-diagnostics-eligibility.js: OK
src/control-plane/control-plane-readiness-publication-diagnostics.js: OK
src/control-plane/control-plane-readiness-service-node-methods.js: OK
src/control-plane/projection-readiness-evidence-generation.js: OK
src/control-plane/projection-readiness-evidence-owner.js: OK
src/control-plane/projection-readiness-evidence.js: OK
test/control-plane/projection-readiness-evidence-owner.receipt.test.js: OK
test/control-plane/projection-readiness-per-node-generation.receipt.test.js: OK
test/control-plane/projection-readiness-planning-consumption-owner.receipt.test.js: OK
test/control-plane/projection-readiness-semantic-core-envelope.receipt.test.js: OK
```
