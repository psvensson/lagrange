# Proximity-Spray CDC Propagation Overlay — Design

**Status:** BLOCKED at WS0 (2026-06-15). The WS0 ordering audit
(`ws0-ordering-audit.md`) returned **FAIL — not viable as designed**: the §4
mitigation (DELETE resurrection healed by the anti-entropy reconciler) is false —
that reconciler is unwired and no general healer deletes resurrected cache rows,
so dropped/reordered DELETEs would permanently diverge ~18 of 19 propagated
tables. A prerequisite **WS0.5 (overlay reliability substrate — per-origin
sequencing + gap-fill)** is now required before WS1. See `ws0-ordering-audit.md`
§Remediation. (Earlier: independently verified 2026-06-15; eight corrections
folded in — config-schema boot blocker, CDC apply semantics, `nodes` watermark,
two-place message-type edit, `refreshConfig` mode-collapse, PressureGovernor,
file-path fixes, WS1 efficiency-claim deferral.)
**Author:** design captured 2026-06-15
**Supersedes (eventually):** `_legacy_work/specs-archive/latency-aware-topology/` and the
runtime latency-group machinery under `src/topology/` (see §10 Migration).

---

## 1. Motivation

Today Lagrange exploits network locality with **latency groups**: the
`LatencyGroupManager` measures RTT, clusters nodes under a fixed
`groupThresholdMs` (100 ms), persists `latency_groups` /
`inter_group_latencies` / `nodes.latency_group_id` to the control plane, and
CDC fanout is routed through **one elected coordinator per group**
(`cdc-group-propagation-service.js` → `latency-tree-service.js`), falling back
to all-nodes broadcast when a coordinator is missing.

Two structural problems:

1. **The coordinator is a per-group SPOF and an elected, persisted,
   must-converge control-plane object.** `group-selection-service.js`
   deterministically elects a representative/coordinator and writes it to
   `latency_groups`; every node must then agree on it via CDC. This adds yet
   another thing that must *converge before it helps*, on top of the project's
   standing formation-vs-steady-state circular-dependency blocker. Coordinator
   loss is a capacity cliff, not a slope.

2. **Fixed thresholds and explicit tiers don't match reality.** Locality occurs
   at many scales at once — rack, pod, AZ, region — and should be *discovered*,
   not declared by a single 100 ms threshold or a static region label.

The lesson from flat-datacenter-network designs (Amazon RNG / expander graphs,
spatial gossip): **push randomization and structure-awareness into the overlay
itself** so no node is special, nothing must be elected, degradation is
proportional, and the fabric scales incrementally. RNG sprays *uniformly*
because inside one fat-tree fabric latency is ~uniform. We generalize: make the
spray bias *learned*, so RNG-uniform behavior falls out automatically when the
fabric is flat, and locality is exploited automatically when it isn't — **with
no tiers and no configured boundaries**.

## 2. Goal

Replace the coordinator-tree CDC fanout with a **single, tierless,
self-organizing proximity-biased spray overlay** that:

- discovers latency structure automatically at every length scale
  (rack → pod → AZ → region) with no thresholds and no declared groups;
- has **no elected/persisted coordinator state** — only soft, local, gossiped
  coordinates;
- is **fully functional from the first message** even with bad/absent coordinate
  data (no readiness gate, no formation barrier);
- degrades proportionally (a dead node costs ~1/N of fanout, not a subtree);
- preserves correctness via the existing LWW idempotent apply path;
- recovers uniform-RNG behavior automatically on a flat fabric;
- is flag-gated, reversible, and A/B-able against today's `safe`/`grouped`.

Non-goals: changing the CDC *source* ordering (Raft already orders at source);
changing the system-table apply semantics; WAN transport changes.

## 3. The one-kernel principle (why tierless works at all scales)

Every node propagates an update to **k** peers drawn with probability

```
p(j) ∝ 1 / d(i,j)^α
```

where `d(i,j)` is the *estimated* latency distance between nodes i and j and the
distribution keeps a heavy tail (a few long-range links). Properties:

- **Scale-free / tierless.** The kernel concentrates probability on the nearest
  cluster *regardless of that cluster's absolute radius*. A 1 ms rack gap and an
  80 ms region gap are handled by the same rule; no threshold anywhere declares
  one a "boundary." This is the spatial-gossip result (Kempe–Kleinberg–Demers):
  a `1/d^α` kernel is simultaneously sensitive at every length scale, and the
  tail's long links preserve `O(log N)` global coverage and graph expansion.
- **RNG is the flat-fabric limit.** Flat fabric → all `d` equal → kernel →
  uniform → pure RNG spray. Same code, no configuration.
- **No formation deadlock.** The tail never assigns zero probability to anyone,
  so even with garbage coordinates the overlay reaches every node (just less
  efficiently). Quality *improves* as coordinates settle; it is never *gated* on
  them.

`α` and `k` are the only tuning knobs, and they replace the entire
group-threshold + election + tree machinery.

## 4. Safety: why unordered, redundant spray converges here

CDC apply in `src/cache/system-table-cache.js` (`applySystemTableChange`) plus
`src/cache/system-table-cache-row-merge.js` (`isStaleForExistingRecord` /
`compareSchemaVersions`) is, for upserts, **last-writer-wins on a keyed row** —
state-based and convergent. That is the precondition that makes anti-entropy /
gossip safe: the overlay propagates **state rows**, not an operation log.
**But the apply path is not a pure idempotent no-op, and three details matter**
(this section was corrected after independent verification):

1. **UPSERT LWW is convergent, but freshness keys vary by table.** Most tables
   compare `updated_at`. The **`nodes`** table has *no* `updated_at`; its
   freshness is gated by `isNodeHeartbeatWatermarkRegression`
   (`src/topology/node-readiness-policy.js`) on `last_heartbeat` / lease /
   connection state. See §6 — coordinates must respect this, not a nonexistent
   `nodes.updated_at`.
2. **DELETE is not tombstoned → transient resurrection under reorder.**
   `applySystemTableChange` does `table.delete(key)` and *ignores* a DELETE for a
   missing key. Under unordered spray, a DELETE that arrives **before** the
   matching INSERT is dropped and the later INSERT resurrects the row. This is a
   **transient divergence that the 30 s anti-entropy reconciler
   (`src/topology/topology-anti-entropy-reconciler.js`) heals**, not a permanent
   corruption — but it is *not* order-free by itself. The correctness window is
   bounded by the reconciler cycle and must be tested (§11).
3. **`control_plane_publications` merges structurally, not by LWW.**
   `mergeControlPlanePublicationRows`
   (`src/control-plane/control-plane-publication-merge.js`) **unions** the
   ack/active/required node-ID sets at the same revision and derives status from
   coverage. Set union *is* commutative/idempotent, so it supports
   order-insensitivity — but the convergence argument is "CRDT-style union,"
   not "scalar LWW." Stale rows also run `applyStaleRowBackfill`, which *mutates*
   (null-field fill / structured merge), so a stale duplicate is not a literal
   no-op even when convergent.

**Net (REVISED by the WS0 audit — the reconciler backstop does not exist):**
order-insensitive convergence holds for UPSERTs (modulo the equal-ms tie below)
and for publication union/epoch merge, but **NOT for DELETE**. WS0 found the
anti-entropy reconciler this section assumed is **unwired and structurally
incapable**, and no general healer deletes a resurrected cache row, so a
dropped/reordered DELETE permanently diverges ~18/19 propagated tables. A second
permanent-divergence path exists at **equal-`updated_at` UPSERT ties**
(last-delivered-wins via `mergeRecords`). Pure convergent-state gossip is
therefore insufficient; the overlay needs a reliability substrate (WS0.5,
per-origin sequencing + gap-fill) so DELETEs are delivered reliably and in
per-source order. See `ws0-ordering-audit.md`.

> **Load-bearing gate (WS0) — widened after verification.** Before building,
> certify all three: (a) no CDC consumer needs per-key *operation order* beyond
> convergent state (no delta/op-log requiring exactly-once in-order apply —
> current read: none; `transition_history` is read latest-row-wins, not
> appended); (b) DELETE-before-INSERT resurrection is acceptable as
> transient-and-reconciler-healed for every sprayed table; (c) stale-backfill
> mutation is benign for sprayed tables. If any fails, stop.

## 5. Owner model (single owner per concern)

New owners under `src/topology/`:

| Owner | Concern | Replaces |
|---|---|---|
| `NetworkCoordinateService` | each node's synthetic coordinate; update from RTT samples; expose `getCoordinate(nodeId)` / `estimateDistance(a,b)` | (new) |
| `ProximitySprayService` | proximity-biased peer selection + spray send/relay/dedup | grouped path of `CDCGroupPropagationService` + `LatencyTreeService` |
| `EmergentTreeService` (Phase 3, optional) | Plumtree eager/lazy edge sets (GRAFT/PRUNE/IHAVE) to cut redundant copies | the *efficiency* role of the coordinator tree |

Reused as-is:

- `LatencyMeasurementService.measureNodeLatency(targetNodeId, options)` →
  `{rttMs, attempt}|null` — feeds coordinate updates (no new probe traffic;
  piggyback where possible).
- `MessageRouter` for transport (`pingNode`, plus the existing send path used by
  `cdc-group-propagation-service`).
- `SystemTableCache` LWW apply (§4).
- `topology-anti-entropy-reconciler.js` as convergence backstop.

Deprecated and removed in WS6 (per the repo "remove dead code on contact"
policy, after proximity is proven): `LatencyGroupManager`,
`GroupSelectionService`, `LatencyTreeService`, the grouped path of
`CDCGroupPropagationService`, and the `latency_groups` / `inter_group_latencies`
tables.

## 6. Data model

Coordinates are *soft* state but must be readable by placement/query consumers,
so they ride the existing **`nodes`** row propagation.

> **Verified correction:** `nodes` has **no `updated_at`** column; row freshness
> is gated by `isNodeHeartbeatWatermarkRegression`
> (`src/topology/node-readiness-policy.js`) on `last_heartbeat` / lease /
> connection state. A *coordinate-only* publish that carries a stale
> `last_heartbeat` would be classed a watermark regression and **dropped**
> (only null-field backfill applies). Therefore coordinates **must piggyback on
> the heartbeat publish row** (`src/.../heartbeat-service-publication-methods.js`,
> which already sets `last_heartbeat`), or carry a non-regressing watermark —
> never publish coordinates as an independent stale-watermark `nodes` write.

Add columns to `nodes` (in `src/bootstrap/system-table-core-schema-definitions.js`,
`NODES_SCHEMA`):

- `coord_vector` (TEXT, JSON array of floats) — synthetic coordinate.
- `coord_height` (REAL) — Vivaldi height term (non-routable last-hop latency).
- `coord_error` (REAL) — confidence/error estimate (0..1).
- `coord_updated_at` (INTEGER) — last coordinate publish time.

**Chattiness control:** publish a node's coordinate only when it moves beyond
`proximity.coordinatePublishDelta` *and* no more often than
`proximity.coordinatePublishMinIntervalMs` (analogous to existing heartbeat
watermark handling). Coordinates self-bootstrap by riding the spray they
improve.

No new dedicated tables. `latency_groups` / `inter_group_latencies` remain until
WS6 removal so rollback stays trivial.

## 7. Wire protocol

Add to `src/topology/latency-topology-constants.js`
(`LATENCY_TOPOLOGY_MESSAGE_TYPE`):

```
PROXIMITY_SPRAY: 'latency.proximity.spray'
```

Register a handler beside the existing CDC handlers in
`src/message-group/message-group-service-inbound-ingress-runtime-methods.js`
(next to `handleLatencyCdcPropagationMessage`): `handleProximitySprayMessage`.

> **Verified correction — two-place message-type edit.** Inbound dispatch keys
> on `MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE` (`src/message-group/constants.js`),
> which *aliases* `LATENCY_TOPOLOGY_MESSAGE_TYPE`. Adding `PROXIMITY_SPRAY`
> requires **both** edits: the type in `latency-topology-constants.js` *and* the
> alias entry in `src/message-group/constants.js`.

Spray envelope:

```
{
  type: 'latency.proximity.spray',
  originNodeId,
  messageId,            // for dedup
  hopCount, maxHops,    // bounded relay
  tableName, operation, data,   // the CDC row (same payload propagateCDCEvent uses)
}
```

Receiver algorithm:

1. `applyCDCEvent` to the local message-group / SystemTableCache (convergent
   state apply — §4, with the DELETE/publication caveats noted there). Same apply
   entry the grouped/safe paths use.
2. If `messageId` already in the dedup LRU (`proximity.dedupeCacheSize`), stop.
3. Else record `messageId`; if `hopCount < maxHops`, re-spray to `k'` peers
   (decreasing fanout per hop) chosen by the §3 kernel, with
   `hopCount+1`.

Coverage: `k ≈ ln N + c`, `maxHops ≈ O(log N)` gives expander coverage w.h.p.;
Plumtree lazy IHAVE (WS3) + anti-entropy reconciler close residual gaps.

> **Verified correction — flow control.** The grouped delivery path runs every
> send through a `PressureGovernor` defer gate plus bounded retry/batch
> (`src/topology/cdc-group-propagation-delivery-methods.js`). The spray relay
> (`k` × `maxHops`) is a traffic *amplifier* and must wire the **same
> `PressureGovernor`** on its send/relay step — `dedupeCacheSize` + `maxHops`
> bound copies but do not provide back-pressure under load.

## 8. Integration points (exact, from grounding)

**Entry / mode branch** —
`src/topology/cdc-group-propagation-service.js` `propagateCDCEvent(options)`
(~L185) and `refreshConfig()` (~L518) branch on
`config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE)`. Add a third value
`'proximity'` to the branch: when set, delegate to
`ProximitySprayService.propagate({tableName, operation, data,
sourceMessageGroupService})` instead of `propagateSafe` / grouped. The spray path
**must return the same result shape `propagateCDCEvent` already returns** — its
callers consume it. `safe` stays the default and the fallback.

> **Verified correction — mode-collapse (build correctness).** The constructor
> (~L57-61) and `refreshConfig` (~L518-539) currently coerce *any* non-`grouped`
> value to `SAFE`. Adding the `propagateCDCEvent` branch is not enough —
> `refreshConfig` and the constructor must be edited to *preserve* `'proximity'`,
> or `this.propagationMode` is never `'proximity'` and the branch is dead code.

**Config schema (BOOT-TIME BLOCKER)** —
`src/config/config-schema-constants.js` declares `latency: { …,
additionalProperties: false }` and `propagationMode: { enum:
Object.values(LATENCY_PROPAGATION_MODE) }`. Following §8's config block verbatim
**fails at boot**: a nested `proximity: {…}` under `latency` is rejected by
`additionalProperties:false`, and `'proximity'` is rejected by the enum. Required
edits: (1) add `PROXIMITY: 'proximity'` to `LATENCY_PROPAGATION_MODE` (the enum
derives from it); (2) add a `proximity` sub-schema under `latency` in
`config-schema-constants.js`; (3) register each setting as a flat dotted
`CONFIG_KEY.*` entry per repo convention (see `config-key-constants.js`), not only
as a nested default block.

**Bootstrap wiring** —
`src/bootstrap/shared/latency-topology-setup.js` `create(options)` (~L33) and
`start(...)` (~L125). Construct `NetworkCoordinateService` and
`ProximitySprayService`, `initialize` then `start` them, mirroring the existing
services. **DI shape is per-service, not uniform** — pass each only the deps it
uses (e.g. the existing `cdcGroupPropagationService` receives `latencyTreeService`
and *not* `cdcIntegrationService`); follow each constructor's `assertCritical`
requirements. Keep constructing the legacy services until WS6.

**Transport** — `MessageRouter` send path (the same one
`cdc-group-propagation-service` uses to deliver to a target address) plus
`pingNode(nodeId, timeoutMs)` for RTT. Peer address resolution uses the existing
`services` table lookup pattern (`resolveActiveMessageGroupServices` /
`COLUMN.ADDRESS`); generalize `resolveCoordinatorAddress` →
`resolveNodeAddress(nodeId)`.

**RTT → coordinates** — `LatencyMeasurementService.measureNodeLatency` feeds the
Vivaldi update in `NetworkCoordinateService`.

**Config** — `src/config/config-constants.js` `latency` block (~L270) and the
key registry (~L698). Add `'proximity'` as a valid `propagationMode` and:

```
proximity: {
  fanout: 4,                       // k base
  fanoutDecay: 1,                  // subtract per hop, floor 1
  alpha: 1.0,                      // locality exponent (0 => uniform RNG)
  maxHops: 6,
  dedupeCacheSize: 4096,
  exploreEpsilon: 0.1,             // MVP epsilon-greedy far-peer probability
  coordinateDimensions: 4,
  coordinatePublishDelta: 0.15,    // fraction move before republish
  coordinatePublishMinIntervalMs: 5000,
}
```

All `requiresRestart: false`.

**Placement consumer** — `src/rebalancer/placement-owner-evidence.js`. Today
`buildLatencyGroupContext` (~L182) groups by `latencyGroupId` and
`normalizePlacementConstraints` (~L156) reads `preferSameLatencyGroup` /
`preferLatencyGroupDiversity`. Add `buildProximityContext` computing pairwise
coordinate distances (read `coord_vector` off candidate node rows, or via
`NetworkCoordinateService.estimateDistance`) and constraints
`preferProximityLocality` (minimize distance to local node) /
`preferProximityDiversity` (maximize min pairwise distance among replicas =
failure-domain spread). Add **hysteresis** so coordinate drift doesn't churn
replicas. Keep the latency-group path working in parallel until WS6.

**Query router** — `src/query/query-router.js`. `resolveNodeLatencyGroupId`
(~L342) + `orderServicesByLatencyPreference` → coordinate-distance ordering to
the local node. Keep `preferSameLatencyGroup` honored via coordinates during
migration.

**Introspection** — coordinates replace crisp group IDs. Provide an on-demand
clustering view (DBSCAN over `coord_vector`) for operators; **not** load-bearing.

## 9. Phased workstreams

Each phase is independently shippable, flag-gated, and reversible. See
`tasks.md` for the checklist and per-phase `doneWhen`.

- **WS0 — Confirm safety assumption (gate).** Independently verify no CDC
  consumer needs ordered op-delivery beyond LWW state (§4). If violated, stop.
- **WS1 — Proximity spray MVP (no coordinates).** `ProximitySprayService` with
  direct measured-RTT + epsilon-greedy near/far peer selection; dedup; bounded
  relay; `PROXIMITY_SPRAY` message + handler; `propagationMode: 'proximity'`
  behind the flag, defaulting off. Falls back to `safe` on any error.
- **WS2 — Network coordinates.** `NetworkCoordinateService` (Vivaldi), `nodes`
  coordinate columns with chattiness control, kernel switches from measured-RTT
  to `estimateDistance` (transitive — can aim long links at unmeasured peers).
- **WS3 — Emergent tree (Plumtree).** Eager/lazy edge sets, GRAFT/PRUNE/IHAVE to
  cut redundant copies while keeping no SPOF; self-heals on node loss.
- **WS4 — Placement + query consumers.** Coordinate-distance scoring with
  hysteresis; introspection view.
- **WS5 — Promotion gate.** Stat-gate proximity vs grouped/safe at N≥8
  (convergence-rate verdict); flat-topology equivalence; formation
  non-regression. Flip default to `proximity` only if all pass.
- **WS6 — Decommission latency groups.** Remove `LatencyGroupManager`,
  `GroupSelectionService`, `LatencyTreeService`, grouped path, and the
  `latency_groups` / `inter_group_latencies` tables. Update docs.

## 10. Rollout, migration, rollback

- Default `propagationMode` stays `safe` through WS1–WS4. `proximity` is opt-in
  per config (`requiresRestart: false`).
- Rollback at any point = set `propagationMode` back to `safe`/`grouped`; legacy
  services and tables remain until WS6, so rollback is a config flip.
- WS6 is the only irreversible step and runs only after WS5's gate passes.

## 11. Test & verification strategy

- **Unit/property** (`test/topology/*.test.js`, `*.property.test.js`, `tap`):
  kernel probability distribution; dedup/relay bounding; LWW idempotence under
  duplicate + reordered delivery; coordinate convergence on a synthetic latency
  matrix; chattiness throttle.
- **Flat-topology equivalence** (deterministic): with `alpha: 0` (or uniform
  coordinates), proximity mode delivers to **100%** of nodes — proves the
  RNG-limit recovery.
- **Formation non-regression:** cold-start + rolling-restart form correctly with
  the coordinate layer cold (spray works on garbage coords). Run from clean
  containers; confirm `SRC_FINGERPRINT`.
- **Promotion stat-gate** (`scripts/rolling-restart-stat-gate.sh`, `N≥8`):
  proximity convergence ≥ grouped/safe baseline **and** fanout message count
  materially below `safe`. Per stat-gate guidance, N≥8 because this is a
  convergence-rate promotion verdict; mechanistic latency checks during
  development can use N=3–4 and stop early when conclusive.

## 12. Risks & open questions

| Risk | Mitigation |
|---|---|
| WS0 assumption false (op-order needed) | WS0 is a hard gate; abort if violated |
| DELETE-before-INSERT resurrection under reorder | reconciler-healed (≤30 s window); test the window (§11); use heartbeat-piggyback for `nodes` |
| Config schema rejects new mode/block at boot | edit `config-schema-constants.js` enum + `proximity` sub-schema (§8) — verified blocker |
| `nodes` watermark drops coordinate-only writes | piggyback coordinates on heartbeat row; never publish stale-watermark `nodes` (§6) |
| Coordinate oscillation/noise | Vivaldi height + error damping; smoothing; tune on stat-gate |
| Coordinate publish chattiness | movement-delta + min-interval throttle (§6) |
| Placement churn from drift | hysteresis on coordinate-distance scoring (§8) |
| Redundant-copy overhead vs tree | tunable `k`/`maxHops`; WS3 Plumtree |
| Dedup LRU memory | bounded `dedupeCacheSize`; size vs cluster size |
| Loss of crisp "node in group G" view | on-demand DBSCAN introspection (§8) |
| Stale-code/non-determinism traps | clean containers + `SRC_FINGERPRINT`; never edit gate/src mid-round; analyzers before raw logs |

## 13. References

- Current code: `src/topology/{cdc-group-propagation-service,cdc-group-propagation-delivery-methods,latency-tree-service,group-selection-service,latency-measurement-service,latency-group-manager,node-readiness-policy,topology-anti-entropy-reconciler}.js`;
  `src/cache/{system-table-cache,system-table-cache-row-merge}.js`;
  `src/control-plane/control-plane-publication-merge.js`;
  `src/bootstrap/{system-table-core-schema-definitions}.js`,
  `src/bootstrap/shared/latency-topology-setup.js`;
  `src/message-group/{constants,message-group-service-inbound-ingress-runtime-methods}.js`;
  `src/rebalancer/placement-owner-evidence.js`; `src/query/query-router.js`;
  `src/config/{config-constants,config-schema-constants,config-key-constants}.js`.
- External: flat datacenter networks at scale (RNG / expander graphs); spatial
  gossip (Kempe–Kleinberg–Demers); Vivaldi network coordinates; Plumtree
  (epidemic broadcast trees).
