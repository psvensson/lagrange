# Stage 2 — DDL provisioning-target liveness re-point (design, NO code)

Disk-grounded DESIGN for repointing the DDL provisioning-target `connectionEligible`
gate off the CDC-lagged `connection_state` cache column and onto live transport
evidence. Bounded behavior-change fix in the hysteresis-consolidation epic
(`solve/epics/hysteresis-consolidation.md`). Stage 1 shipped the
`hasLiveTransportEvidence` atom (`d29bcbee`/`52f25c5f`/`4c7da847`/`4d282144`) and
EXPLICITLY deferred this DDL gate as future work.

**Verdict up front: SHIP — recommended option (a-as-rescue).** The single most
important disk finding overturns the task's stated "critical constraint" (see §0).

---

## 0. Premise correction (load-bearing) — the SQL engine DOES hold a live router

The task states, as a hard constraint: *"`src/query/sql-query-engine.js` holds NO
`messageRouter` (grep-confirmed)… option (a) requires threading a control-plane
transport dependency into the data-plane SQL engine — a possible LAYERING VIOLATION."*

**This is false.** The grep only checked the *facade* file `sql-query-engine.js`;
the engine is a composed/mixin class and its instance fields are set in the
initializer, not that file:

- `src/query/sql-query-engine-instance-initializer.js:40` —
  `engine.messageRouter = options.messageRouter || null;`
- `src/query/sql-query-engine-instance-initializer.js:55-57` —
  `engine.controlPlaneReadinessService = options.controlPlaneReadinessService || engine.rebalanceCoordinator?.controlPlaneReadinessService || …`
- Setters that keep them live: `sql-query-engine-lifecycle-and-callback-dispatch.js:125`
  (`this.messageRouter = router`) and `:134` (`this.controlPlaneReadinessService = …`).

The provisioning methods in `sql-query-engine-provisioning-methods.js` are prototype
methods mixed onto that same composed engine (`createSQLQueryEngineProvisioningMethods`
at `:494-502`), so **`this.messageRouter` and `this.controlPlaneReadinessService`
are already in scope on `this`** at the exact gate site (`:249-261`).

Every one of the three construction sites passes BOTH dependencies:

| Construction site | messageRouter | controlPlaneReadinessService |
|---|---|---|
| `entrypoint-runtime-admin-composition.js:340-354` | `options.messageRouter` (`:342`) | `resolveOwnerControlPlaneReadinessService(options.owner)` (`:346`) |
| `bootstrap/node-joining-publication-activation.js:615-627` | `this.messageRouter` (`:617`) | `this.rebalanceCoordinator?.controlPlaneReadinessService` (`:620`) |
| `bootstrap/phases/seed-cache-hydration-phase.js:214-226` | `d.getMessageRouter()` (`:216`) | `…controlPlaneReadinessService` (`:219`) |

**Consequence: there is NO layering violation and NO new threading required.** The
data plane already holds both a live router and the consolidated readiness authority.
The stage-1 deferral rationale in
`test/control-plane/no-inline-live-transport-copy.guard.test.js:64-72` ("a cache-only
consumer with NO live `messageRouter` in scope, structurally identical to the
membership projection") is **factually wrong about scope** — the router is present.
The guard comment should be corrected when this ships (it is documentation, not a
code gate; the SCAN_SET at `:74-78` deliberately excludes this file, so re-pointing
the gate does not by itself trip or satisfy that guard — see §5).

---

## 1. Blast radius of the gate

### The gate
`sql-query-engine-provisioning-methods.js:249-261`, inside
`resolveProvisionTargetNodeDiagnostics`:

```
const connectionState = String(row?.connection_state || row?.connectionState || '').toLowerCase();
const hasConnectionState = connectionState.length > 0;
const isConnectionReady = connectionState === CONNECTION_STATE_CONNECTED  // 'connected'
                       || connectionState === CONNECTION_STATE_READY;     // 'ready'
const connectionEligible = !hasConnectionState || isConnectionReady;      // <-- gate
...
activeNodeConnectionById.set(nodeId, connectionEligible);
```

`CONNECTION_STATE_CONNECTED='connected'`, `CONNECTION_STATE_READY='ready'`
(`sql-query-engine-shared.js:174-175`). `connectionEligible` feeds `strictNodeIds`
(`:264-271`: `ready===true && connectionEligible===true`) and the degraded
service-backed fallback (`:294-296`).

### Who calls it — DDL/provisioning ONLY, not steady-state up-replication
`resolveProvisionTargetNodeDiagnostics` / `…WithDiagnostics` / `…ForContext` /
`getActiveNodeIdsFromCache` callers (grep across `src`):

- `sql-query-engine-initial-partition-provisioning.js:96,99,172` —
  `provisionInitialTablePartition` (`:31`), the **CREATE TABLE** initial-replica
  provisioning path (`:129` "Quorum-minimum creates").
- `sql-query-engine-provision-target-methods.js:100-134` —
  `waitForProvisionTargetNodeIds` (`:89`), the provisioning-target **convergence
  wait** used by creates/splits.
- `partition/managed-split-topology-adapter.js:46-47,67` and
  `managed-split-workflow.js:274` — **managed split** child provisioning.
- `admin/admin-control-snapshot-local-diagnostics-methods.js:482-501` —
  **read-only diagnostics** (admin snapshot), no placement effect.

**It is provisioning/DDL + split child-cohort selection only.** Steady-state
up-replication runs through the *rebalancer* `available-nodes` path
(`unified-rebalancer-available-nodes.js`), which is a stage-1 atom-routed consumer
already — NOT this method. So this gate does not double-cover up-replication.

### Which node it runs on
The engine executing the DDL/split — the coordinator/owner running `CREATE TABLE`
or the split workflow. That node holds a live `messageRouter` (its own transport to
peers) per the construction table in §0. So the live router is exactly the right
scope: "can *this* coordinator currently reach peer N?" — the same question the
MODE-A bug got wrong via the stale column.

### Does the permissive default already save most cases?
Yes, partially: `connectionEligible = !hasConnectionState || isConnectionReady`.
When the column is **empty/unpopulated** (`hasConnectionState===false`) the node is
eligible regardless. **The gate only bites when the column is POPULATED-but-not-
connected/ready** — i.e. `connection_state ∈ {'disconnected','connecting',…}`.
That is precisely the MODE-A shape: a stale cached `'disconnected'` on a node that
is actually live-connected. So the bug is narrow (populated-stale-negative only),
which lowers the base rate but does not eliminate it — MODE-A (`a79b3728`) was
exactly a populated-stale case that stranded a table at 1/3.

---

## 2. Fix options

### (a) Route the gate through `hasLiveTransportEvidence` using the already-present `this.messageRouter`
No threading needed (§0). Two sub-shapes:

- **(a-replace) — wholesale**: `connectionEligible = hasLiveTransportEvidence(nodeId, {messageRouter: this.messageRouter})`.
  **Rejected**: the atom fails **closed** (`live-transport-evidence.js:31-45`: missing
  router / non-'connected' → false), whereas the current gate fails **open** on an
  empty column (`!hasConnectionState`). During early formation the router may not yet
  report `'connected'` for a node whose column is empty and whose readiness lease is
  valid; a-replace would flip that node eligible→ineligible = **narrowing** = the
  inverse regression / churn the epic warns about. Do not do this.

- **(a-rescue) — OR-term (RECOMMENDED)**: keep the permissive cached test, add the
  live atom as a rescue disjunct that can only WIDEN:
  ```
  const connectionEligible =
    (!hasConnectionState || isConnectionReady) ||
    hasLiveTransportEvidence(nodeId, {messageRouter: this.messageRouter});
  ```
  A node the stale column wrongly marks disconnected is rescued iff the LIVE router
  says `'connected'`. Monotone: the eligible set only grows relative to today, and
  only by genuinely-reachable nodes. This is the **exact shape of the MODE-A fix**
  (`isClusterMemberHealthy` `:517-534`: recent-heartbeat OR live atom) transplanted
  to the provisioning gate. Lowest blast radius, no layering issue, no cycle.

### (b) Consume the consolidated authority `controlPlaneReadinessService.isClusterMemberHealthy`
Available on `this.controlPlaneReadinessService` (§0). `isClusterMemberHealthy(nodeId,
nodeRow)` (`control-plane-readiness-node-service-rows.js:465-535`) is the
already-atom-backed authority (folds ready-lease, self-node fast path, transport-
connected, `connection_state===READY`, recent-heartbeat OR the live atom `:532-534`).
Aligns with the repo directive *"avoid secondary/tertiary caches; fix the gap in the
EXISTING mechanism; no new read paths."*

**Costs / why not primary:**
- **Semantic collapse.** The provisioning gate keeps readiness (`activeNodeReadinessById`,
  from `isNodeRecordReady`) and connection (`connectionEligible`) as *separate*
  conjuncts (`:264-271`). `isClusterMemberHealthy` already folds readiness in
  (`:478-479` returns true on a valid ready lease **without** any transport check).
  Substituting it for the connection sub-gate changes the truth table: a valid-lease
  node would pass connection-eligibility even with a genuinely disconnected router
  (because the lease branch short-circuits before the transport check). That is a
  larger, subtler behavior change than (a-rescue) and could itself widen onto a
  genuinely-dead-but-leased node.
- **Latent cycle risk.** The epic's explicit DO-NOT — *"Re-point `isClusterMemberHealthy`
  before cutting the projection↔provisioning-eligibility cycle"* (`epic` line 86;
  `active-node-projection.js:190-226`) — is about `isClusterMemberHealthy`'s own
  implementation later consuming the projection. Today it reads node rows + live
  router directly, so a NEW provisioning consumer is safe *now*, but it couples
  provisioning to a predicate the epic intends to re-point through the projection,
  re-creating the very provisioning→projection→isClusterMemberHealthy loop the epic
  is trying to keep orthogonal. (a-rescue) consumes only the leaf atom, so it is
  cycle-free by construction.

Keep (b) as the eventual stage-3 convergence (once the projection cut lands and the
readiness authority is the single node-trust predicate), not this bounded stage-2 fix.

### (c) Drop the connection gate entirely (is it load-bearing?)
Checked: `isNodeRecordReady` (the `ready` conjunct) validates lease-not-expired +
active status — it does **NOT** consult transport (`isClusterMemberHealthy:478` and
the readiness lease semantics). So `ready` does **not** subsume `connectionEligible`:
a node can hold a valid ready-lease yet carry a stale `connection_state='disconnected'`,
and the gate excludes it — the MODE-A locus. Dropping the gate would fix MODE-A but
also remove the real check against a node whose column is *correctly* disconnected.
The atom rescue strictly dominates: it keeps the negative check for genuinely-dead
nodes (router not 'connected') while rescuing the stale-negative live ones. **Reject (c).**

### Recommendation: **(a-rescue)**
One-line change at `sql-query-engine-provisioning-methods.js:256`, using the
already-present `this.messageRouter`. No new dependency, no threading, no layering
violation, no cycle, monotone-widening-only (cannot invert safety). It is the
minimal transplant of the proven MODE-A fix onto its sibling cache-gate.

---

## 3. Correctness + MODE-A efficacy

**Failure prevented.** A node with a valid ready-lease and a live transport
connection but a **populated-stale** `connection_state` (e.g. `'disconnected'` from
CDC ingest lag under load) is currently excluded from `strictNodeIds` (`:256`,`:268`),
shrinking the provision-target set and stranding a freshly-created table (or split
child) below target replication — the exact MODE-A stranding (`a79b3728`) one layer
up in the DDL path.

**Cannot invert safety.** Direction check: the cached column can be stale in either
direction, but the live router source used by the atom **fails closed**
(`live-transport-evidence.js:31-45`: no router / not `'connected'` / throw → false)
and only reports `'connected'` when the transport state machine currently holds a
live connection; a cleanly-dead peer is torn down by the ACK-timeout quarantine so
the router leaves `'connected'` (documented `:521-534` of the readiness file). As an
**OR-rescue** the atom can ONLY add nodes the router affirmatively reports reachable —
it never removes a node and never provisions onto a node the live router says is not
connected. So it cannot start provisioning onto a genuinely-disconnected node; the
only new admits are genuinely-reachable nodes the stale column libeled.

**Amplification/churn trap (`692c9dbb`, `1ce80391`).** Eligibility *widening* is the
class that can add churn. Mitigants specific to this site: (1) it is a cold
provisioning/DDL path (see §6), not a hot per-operation retry loop, so there is no
per-transient-error escalation to amplify; (2) it only widens onto live-connected
nodes, which is the same population steady-state placement already targets; (3) it is
monotone vs today — it never removes a node, so it cannot destabilize an existing
cohort, only enlarge a candidate set that was wrongly shrunk. The residual risk is a
table being provisioned onto one more (live) node than before — the *intended* effect.

---

## 4. REUSED vs EXTENDED vs NEW

| Category | Item | Evidence |
|---|---|---|
| **REUSED** | `hasLiveTransportEvidence(nodeId, {messageRouter})` atom (stage-1 authority) | `src/control-plane/live-transport-evidence.js:31-45` |
| **REUSED** | `this.messageRouter` already on the engine instance (no new wiring) | `sql-query-engine-instance-initializer.js:40`; `…lifecycle-and-callback-dispatch.js:125` |
| **REUSED** | Fix *shape* = the shipped MODE-A rescue disjunct | `control-plane-readiness-node-service-rows.js:517-534` |
| **EXTENDED** | `connectionEligible` gate gains a live-router OR-rescue term | `sql-query-engine-provisioning-methods.js:256` |
| **EXTENDED** | guard-test comment corrected (scope claim now false) + optionally add this file to SCAN_SET with an atom-routed allowlist | `test/control-plane/no-inline-live-transport-copy.guard.test.js:64-72,74-78` |
| **NEW** | none (no new read path, no new dependency, no new module) | — |

Directive compliance: satisfies "avoid secondary/tertiary caches — fix the gap in
the existing mechanism; no new read paths" (the atom is the existing mechanism; no
new cache is introduced — in fact a stale cache read is demoted to a fallback).

---

## 5. Red-on-revert test plan (deterministic; `npm run dt:prove`-suitable)

**Test file:** `test/query/provision-target-live-transport-rescue.test.js` (new).

Unit-level, no cluster: construct the provisioning-methods behavior against a stub
`this` exposing `{ systemCache, nodeId, messageRouter, orderProvisionTargetNodeIds }`
and drive `resolveProvisionTargetNodeDiagnostics(1)` (or the public
`getActiveNodeIdsFromCache`). The gate is pure over `systemCache` rows + the injected
router, so it is fully deterministic.

**Case A — the fix (flips red on revert):** an active node `node-B` with
- a **valid ready-lease** row (`ready_lease_expires_at` in the future, `status='active'`)
  so `activeNodeReadinessById.get('node-B')===true`, AND
- `connection_state='disconnected'` (populated-stale-negative), AND
- a stub `messageRouter.getConnectionState('node-B') → 'connected'` (LIVE reachable).

Assertion that flips: `diagnostics.strictNodeIds` **includes `'node-B'`** (equivalently
`activeNodeConnectionById.get('node-B')===true`). On revert (remove the OR-rescue),
`connectionEligible` is `false` → `node-B` is dropped from `strictNodeIds` → assertion
fails **red**. This is the load-bearing red-on-revert assertion.

**Case B — safety inverse (must stay green both directions):** `node-C` with a valid
ready-lease, `connection_state='disconnected'`, and `messageRouter.getConnectionState
('node-C') → 'disconnected'` (genuinely unreachable). Assert `strictNodeIds` **excludes
`'node-C'`** — proves the rescue does not admit a genuinely-disconnected node (does not
invert safety). Green with and without the fix (the fix only adds the router-'connected'
case).

**Case C — monotonicity / no-narrowing:** `node-D` with empty `connection_state` and a
router that throws or returns `'connecting'`. Assert `node-D` stays eligible (the
permissive `!hasConnectionState` branch is preserved and evaluated first). Guards
against accidentally shipping (a-replace).

`dt:prove` invocation:
`npm run dt:prove -- --test test/query/provision-target-live-transport-rescue.test.js --src src/query/sql-query-engine-provisioning-methods.js`

**Guard-test note (`no-inline-live-transport-copy.guard.test.js`):** this file's
SCAN_SET (`:74-78`) deliberately excludes the provisioning module, and the change adds
an atom call (exempt by the `ATOM_CALL_RE` rule `:179,235`), so re-pointing does not
trip the guard. Two follow-ups: (i) correct the stale scope claim in the comment
(`:64-72`); (ii) optionally ADD `sql-query-engine-provisioning-methods.js` to SCAN_SET
so a *future* bare-column veto here would be caught — but only after this ships (adding
it before would require the atom call to already be present).

---

## 6. Live A/B need — honest call

**Not required. Deterministic red-on-revert + regression suffices.** Rationale:
- This is a **cold provisioning/DDL path** (`provisionInitialTablePartition`, split
  child cohort selection), not a hot per-operation loop. The MODE-A A/B gate
  (`hotpath-failure-fix-needs-aggregate-live-validation`, revert `692c9dbb`) exists
  because that fix widened a **hot** gate (`isClusterMemberHealthy`) evaluated on the
  lease-sweep / every-op eligibility path, where load-amplification could regress
  aggregate throughput. This gate runs at table-create / split time, orders of
  magnitude less frequently, with no per-transient-error escalation to amplify.
- The change is **monotone-widening only** onto live-reachable nodes — it cannot
  destabilize an existing cohort (it never removes a node), removing the main live-
  regression vector.
- The efficacy is directly and deterministically observable (Case A red-on-revert).

**Honest caveat / cheap insurance:** MODE-A's own efficacy was "dt-proven + suggestive,
not A/B-isolated" because the mode is rare and MODE-B-gated. If a demo run happens to
exercise a stranded-table-at-create scenario, folding one before/after affinity-demo
observation into the *next scheduled* live run (opportunistic, not a gating 2-pre/2-post)
would upgrade efficacy evidence at ~zero marginal cost. But it is **not** a ship
prerequisite here. If forced to choose, deterministic red-on-revert + full regression
is the correct, sufficient bar for this cold path.

---

## 7. Adversarial self-check (strongest case against)

1. **"The column is rarely populated-stale, so the gate almost never bites."** Partly
   true — the `!hasConnectionState` default already saves the empty-column case (§1),
   so the base rate is low. But MODE-A (`a79b3728`) is an existence proof that it DOES
   bite under CDC ingest lag at load, and it strands a table below replication when it
   does. Low base rate + high per-incident cost + one-line monotone fix = worth it.
   Does not reach DON'T-SHIP.
2. **"`ready` already subsumes the connection gate."** Refuted in §2(c):
   `isNodeRecordReady` does not consult transport; a valid-lease node can carry a stale
   disconnected column. The gate is load-bearing.
3. **"Threading a router into the data plane is too invasive / a layering violation."**
   Refuted in §0: the router is ALREADY on `this.messageRouter` at all three
   construction sites. Zero threading. The task's premise was based on a grep of the
   facade file only.
4. **"This re-introduces the exact churn MODE-A had to be A/B-gated for."** Mitigated
   in §3/§6: this is a cold DDL path, not the hot lease-sweep; the change is monotone
   (never removes a node); no per-error escalation exists to amplify. The A/B gate was
   specific to a hot gate.
5. **"Option (b) is more aligned with 'reuse the consolidated authority'."** True in
   spirit, but (b) collapses readiness+connection and risks the projection↔provisioning
   cycle the epic explicitly forbids re-pointing across (§2b, epic line 86). (a-rescue)
   consumes only the leaf atom — same authority, none of the coupling. (b) is the
   right stage-3 move after the projection cut, not this bounded stage-2.

**None reach DON'T-SHIP or NARROW.** The only correction is to the task's own premise
(router IS in scope), which makes the fix *smaller and safer* than framed.

---

## Verdict

**SHIP — option (a-rescue):** add `hasLiveTransportEvidence(nodeId, {messageRouter:
this.messageRouter})` as a monotone OR-rescue disjunct to `connectionEligible` at
`sql-query-engine-provisioning-methods.js:256`, reusing the already-present
`this.messageRouter`. Prove with the Case-A red-on-revert deterministic test (+ Cases
B/C for safety-inverse and no-narrowing). No live A/B prerequisite (cold DDL path,
monotone widening). Correct the stale scope claim in the stage-1 guard comment
(`no-inline-live-transport-copy.guard.test.js:64-72`) as part of the change.
