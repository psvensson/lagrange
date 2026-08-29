---
audience: development
documentClass: current
---

# ACTIVE Definitions Inventory

> **Purpose.** Classify every current definition of "ACTIVE" in the system so
> that no two owners can independently answer the same semantic question. It
> backs the active-gate convergence invariant `no-ambiguous-active-owner`
> (the startup active-gate owner is the sole cluster-ACTIVE authority). It is
> code-comment-backed: each row cites the producing and consuming `file:line`
> so a drift in ownership is visible in review, not just in prose.

## Definitions table

| # | Meaning computed | Current producer (file:line) | Consumer(s) (file:line) | Treats as authority or evidence? | Should remain authority? |
| --- | --- | --- | --- | --- | --- |
| 1 | `nodes.status = 'active'` — one node's own lifecycle state machine projection (`TRAFFIC_READY` → legacy `active`) | `src/bootstrap/lifecycle-controller.js:583` (`phase === LIFECYCLE_PHASE.TRAFFIC_READY`), `:589` `resolveLegacyState`, `:682` (`state: this.resolveLegacyState(...)`); written into the `nodes` row by `src/control-plane/heartbeat-service-publication-methods.js:116-118` (`status: ... SERVICE_STATUS.ACTIVE`) | `src/node/node-readiness-policy.js:9` (`REQUIRE_ACTIVE_STATUS_DEFAULT`), readiness gating; heartbeat re-publication `src/control-plane/heartbeat-service-publication-methods.js:97-99` (reads `existing?.status === NODE_STATE.JOINING`) | **Node-only authority.** Consumers treat it as the node-local lifecycle fact, never as a cluster-ACTIVE answer. | **Yes** — the node lifecycle state machine is the sole owner of *this node's* status. It must never be promoted to a cluster-ACTIVE authority. |
| 2 | `publishedActive = N/M` membership — which node ids the publication owner has published ACTIVE with a durable readback | `src/control-plane/active-node-publication-snapshots.js:546` / `:571` / `:728` (`publishedActiveNodeIds: Object.freeze([...])`); assembled by `src/control-plane/active-node-projection.js:741` | `src/control-plane/membership-publication-acknowledgement.js:100`, `src/control-plane/membership-publication-candidate-derivation.js:370`, active-gate handoff evidence `src/control-plane/publication-active-gate-handoff-contract-evidence.js` | **Publication-only authority over the published set.** The active-gate owner consumes it as *evidence* (`publishedActiveNodeIds` / `missingPublishedNodeIds`), not as a convergence verdict. | **Yes** — the publication owner is the sole authority over *what is published*. It must never decide cluster-ACTIVE convergence by itself. |
| 3 | `snapshot active = N/M` — the snapshot-coverage projection (how many expected nodes the selected snapshot observes / covers) | `src/diagnostics/topology-convergence-active-gate-normalizers.js:42-44` (`completeCoverage = coverage.completeCoverage === true \|\| coverage.snapshotCoverageComplete === true`), `:60-65` (`snapshotCoverageNodeCount`); rendered by `src/diagnostics/topology-convergence-normalizers.js:328` (`progress = {`) | `src/diagnostics/topology-convergence-graph.js:331-336` (`completeCoverage`, `isRepairDeferred`), `src/diagnostics/topology-convergence-edge-resolvers.js:144` (`progress.snapshotCoverageComplete === true`) | **Projection evidence.** It is an observation the active-gate owner reads; it is not itself a cluster-ACTIVE decision (it can be stale / repair_deferred). | **No** — this is *evidence about coverage*, an input to the single active-gate authority, never the authority. It stays a projection. |
| 4 | `cluster-ACTIVE` gate — the sole startup convergence decision for the whole cluster | `src/diagnostics/topology-convergence-graph.js:351-362` (`progressContract` with `owner: OWNER.ACTIVE_GATE`, `boundary: BOUNDARY.SNAPSHOT_COVERAGE`); owner constant `src/diagnostics/topology-convergence-constants.js:184` (`ACTIVE_GATE: 'startup_active_gate_owner'`) | harness/analyzer consumers read the typed owner contract (e.g. `src/diagnostics/invariant-review.js:88-92` reads `publicationConvergence.activeGate.progress.activeNodeCount` as observed evidence) | **SOLE cluster authority.** Every consumer must *consume* this decision; none may re-derive cluster-ACTIVE from definitions 1-3. | **Yes** — this is the only definition that answers "is the cluster ACTIVE". Per `no-ambiguous-active-owner` it is the single owner. |

## Owner-boundary reading

- Definitions **1**, **2**, and **3** are *producer-local facts* (node lifecycle,
  publication membership, snapshot coverage). Each is the authority over its own
  narrow question and must remain so.
- Definition **4** is the *only* semantic answer to "is the cluster ACTIVE".
  The publishedActive=5/5 vs active=1/5 contradiction that motivated this
  inventory is precisely two of these definitions being read as competing
  answers to that one question: the harness observed definition 2 (publication
  evidence, all green) while definition 4 (the active-gate owner) still
  reported deferred because definition 3 (snapshot coverage) was stale under a
  bounded repair backoff. The fix is to re-drive definition 4's owner when its
  evidence advances — not to let the harness promote definitions 1-3 into a
  second cluster-ACTIVE authority.

## Authoritative-discovery repair owner (interaction boundary)

The startup active-gate owner interacts with the authoritative-discovery repair
owner through one typed boundary
(`StartupActiveGateOwner -> AuthoritativeDiscoveryRepairOwner`):

- Repair admission / failure backoff / retry timing / success-evidence reuse /
  whether a previous failure is still binding are owned **solely** by the repair
  owner: `src/admin/admin-service-discovery-repair-methods.js:37`
  (`ensureAuthoritativeDiscoveryCacheRepair`), `:263`
  (`storeFailedAuthoritativeDiscoveryRepair`),
  `src/admin/admin-service-discovery-repair-cache-methods.js:190-252`
  (`resolveRecentAuthoritativeDiscoveryRepairFailure` — the failure-deferral
  branch that has **no** `bypassReuse` guard by design, commit `e2797b6c8`).
- The repair owner answers with a typed disposition (`repaired` / `reused` /
  `deferred(retryAfterMs)` / `unavailable`); the active-gate owner alone decides
  whether that evidence suffices for the ACTIVE transition
  (`src/control-plane/control-plane-snapshot-owner.js:302` `resolveControlSnapshot`,
  `:341-351` the `forceAuthoritativeRepair === true` branch).
- `forceAuthoritativeRepair` maps to `bypassReuse: true`
  (`src/control-plane/control-plane-snapshot-owner.js:236`, `:607`), which skips
  **only** the success-reuse path
  (`src/admin/admin-service-discovery-repair-cache-methods.js:137-139`) — it never
  bypasses the failure-deferral. A caller's "force" therefore cannot break the
  anti-storm backoff, and must not.
- **Evidence-revision invalidation (the convergence level-trigger).** The typed
  disposition the repair owner hands the active-gate owner carries an
  `evidenceRevision` (the failed repair's own observation time,
  `resolveRecentAuthoritativeDiscoveryRepairFailure`). While a deferral is still
  binding, the active-gate owner may ask the repair owner — through
  `probeAuthoritativeDiscoveryEvidenceRevision`
  (`src/admin/admin-service-discovery-repair-cache-methods.js`) — for the current
  authoritative evidence revision of the **same failed table(s)** the deferral
  covers. The probe is observation-only: it admits **no** repair, records no
  repair attempt, and never touches the backoff (admission stays keyed by repair
  tables + failure class + time). When the probed authoritative
  `authoritativeObservedAtMs` is materially **newer** than the deferred repair's
  `evidenceRevision`, the deferred failure observation no longer governs the
  ACTIVE meaning, so the active-gate owner re-evaluates freshness against the
  advanced evidence watermark instead of the stale rebuilt snapshot
  (`probeRepairOwnerEvidenceAdvance` / `buildEvidenceAdvancedRepairObservation` in
  `src/control-plane/control-plane-snapshot-owner.js`). Same unchanged failed
  evidence → the backoff is honored and the observation stays deferred;
  materially newer owner evidence → the gate converges. This is the single-owner
  decision path: the repair owner stays the sole repair-admission owner, the
  active-gate owner stays the sole ACTIVE-decision owner, and neither derives
  cluster-ACTIVE from `nodes.status` / `publishedActive` / snapshot coverage.
