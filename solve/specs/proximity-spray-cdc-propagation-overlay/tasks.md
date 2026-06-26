# Proximity-Spray CDC Propagation Overlay — Tasks

Phases are sequential by dependency but each is independently shippable behind
the `proximity` flag. `doneWhen` is the closure condition for each phase.
See `design.md` for rationale and integration detail.

---

## WS0 — Confirm safety assumption (hard gate) — ✅ DONE, VERDICT: FAIL

**Outcome (2026-06-15):** see `ws0-ordering-audit.md`. Criteria (b) DELETE
resurrection and (d) equal-ms UPSERT tie **FAIL** — permanent divergence under
reorder for ~18/19 propagated tables; the anti-entropy reconciler the design
relied on is unwired and no general healer deletes resurrected rows. (a) op-order
and (c) stale-backfill PASS. **STOP — WS1 blocked until WS0.5 lands.** Independent
finding: this is also a latent pre-existing resurrection bug → recommend its own
closure-ledger/Quest.

Original checklist (completed):


- [ ] Audit every consumer of CDC-applied system-table rows for a dependency on
      per-key *operation order* beyond convergent state (delta/op-log semantics).
      Grep `applyCDCEvent`, `applySystemTableChange` call sites; inspect each
      table's apply path in `src/cache/`.
- [ ] **(widened after verification)** Certify for every sprayed table that
      **DELETE-before-INSERT resurrection** is acceptable as transient and
      reconciler-healed (`topology-anti-entropy-reconciler.js`, ≤30 s), and that
      **stale-backfill mutation** (`applyStaleRowBackfill`) is benign.
- [ ] Confirm `control_plane_publications` structured union merge
      (`control-plane-publication-merge.js`) is commutative for the sprayed
      operations (it unions ack/active/required sets at equal revision).
- [ ] Document findings in this spec dir (`ws0-ordering-audit.md`).

**doneWhen:** written audit certifies (a) no consumer needs ordered exactly-once
op-delivery, (b) DELETE resurrection is transient/healed, (c) stale-backfill is
benign — for all sprayed tables. If any fails, STOP and record why the overlay is
not viable as designed.

## WS0.5 — Overlay reliability substrate (NEW prerequisite — blocks WS1)

Added after the WS0 FAIL. Pure convergent-state gossip cannot carry DELETEs
safely (no tombstone, no healer). Make the overlay a reliable, per-source-ordered
broadcast instead. **Design:** `ws0.5-reliability-substrate.md`. **Pairs with
Quest `cdc-cache-delete-resurrection`** (the system-wide anti-entropy sweep /
latent-bug fix) — both must land before WS1.

- [ ] **Verify FIRST:** single-owner-per-key lifecycle (a row's INSERT and DELETE
      always originate from the same publisher, incl. across ownership handoff). If
      false, per-origin ordering is insufficient → need a per-key version fence /
      tombstone instead. See `ws0.5-reliability-substrate.md` §"Load-bearing
      assumption".
- [ ] Check whether CDC events already carry a per-stream sequence to reuse as
      `originSeq` before minting a new envelope field.

- [ ] Per-origin monotonic sequence on every sprayed event (origin node id +
      seq); receivers track highest contiguous seq per origin.
- [ ] Gap detection + pull repair: on a missing seq, request the gap from a peer
      (Plumtree lazy-IHAVE / anti-entropy on sequence — this is the WS3 lazy layer
      pulled forward). Apply gap events in per-origin order so a DELETE is never
      applied before its prior INSERT/UPDATE.
- [ ] (Recommended, separate from overlay) periodic anti-entropy sweep that
      deletes cache-only rows absent from authoritative truth, generalizing the
      `services` forward-topology delete-missing pattern to all 19 tables (wire or
      replace the dead `topology-anti-entropy-reconciler`). Also fixes the latent
      pre-existing resurrection bug.
- [ ] Re-run the WS0 criteria against the amended design; confirm DELETE reorder
      and equal-ms tie no longer diverge.

**doneWhen:** a reorder/drop fuzz test (incl. DELETE-before-INSERT and equal-ms
UPSERT ties) shows all replicas converge identically; WS0 re-audit passes. Only
then is WS1 unblocked.

## WS1 — Proximity spray MVP (no coordinates) — BLOCKED on WS0.5

Files (new): `src/topology/proximity-spray-service.js`,
`src/topology/proximity-spray-service-constants.js`,
`src/topology/proximity-peer-selection.js`.
Files (edit): `latency-topology-constants.js` (+`PROXIMITY_SPRAY` type) **AND**
`src/message-group/constants.js` (+alias in
`MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE` — dispatch keys on the alias),
`message-group-service-inbound-ingress-runtime-methods.js`
(+`handleProximitySprayMessage`), `cdc-group-propagation-service.js`
(propagate branch **and** constructor + `refreshConfig` must *preserve*
`'proximity'`, not collapse it to `SAFE`; spray path returns the existing result
shape), `latency-topology-setup.js` (construct/start, per-service DI),
`config-constants.js` (+`proximity.*`, `'proximity'` mode value),
**`config-schema-constants.js` (BOOT BLOCKER: add `PROXIMITY` to
`LATENCY_PROPAGATION_MODE` enum + `proximity` sub-schema under `latency`, which is
`additionalProperties:false`)**, `config-key-constants.js` (flat dotted keys).

- [ ] `ProximitySprayService.propagate({tableName, operation, data,
      sourceMessageGroupService})`: select `k` peers (epsilon-greedy near/far on
      measured RTT via `LatencyMeasurementService.measureNodeLatency`), send
      `PROXIMITY_SPRAY` envelope; on any error fall back to `safe`.
- [ ] Receiver `handleProximitySprayMessage`: `applyCDCEvent`, node-level dedup
      LRU (separate from the per-message-group `acknowledgedMessages` dedup),
      bounded relay (`hopCount`/`maxHops`, decaying fanout).
- [ ] Wire the existing `PressureGovernor` into the spray send/relay step (the
      grouped path has a defer gate the spray must not skip).
- [ ] Send via the generic node-addressed path
      (`messageRouter.deliver(address, payload, {targetNodeId})`), resolving
      address from the `services` table (generalize `resolveCoordinatorAddress`
      → `resolveNodeAddress`).
- [ ] Mode branch in `propagateCDCEvent`; constructor + `refreshConfig` preserve
      `'proximity'`; default remains `safe`; spray returns the existing result
      shape; falls back to `safe` on error.
- [ ] Unit/property tests: peer-selection distribution; relay bounding;
      convergence under duplicate + reordered delivery (incl. DELETE-before-INSERT
      → resurrection heals via reconciler within the bounded window).

**doneWhen:** with `propagationMode: proximity`, a single-row change reaches
100% of nodes in a local multi-node test; duplicates/reorders converge (DELETE
window healed); `safe` fallback verified; `tap` green. **Efficiency/message-count
claims are deferred to WS2/WS5** — WS1 uses per-candidate measured-RTT pinging,
so its fanout budget is not yet representative.

## WS2 — Network coordinates

Files (new): `src/topology/network-coordinate-service.js` (+constants),
`src/topology/vivaldi-update.js`.
Files (edit): `system-table-core-schema-definitions.js` (`nodes` coordinate
columns), node heartbeat publish path (coordinate piggyback + throttle),
`proximity-peer-selection.js` (kernel uses `estimateDistance`).

- [ ] `NetworkCoordinateService`: Vivaldi update from RTT samples;
      `getCoordinate(nodeId)`, `estimateDistance(a,b)`; height + error damping.
- [ ] `nodes` columns `coord_vector/coord_height/coord_error/coord_updated_at`;
      publish throttled by `coordinatePublishDelta` + `MinIntervalMs`.
- [ ] Kernel switches from measured-RTT to `estimateDistance` (transitive long
      links).
- [ ] Tests: coordinate convergence on a synthetic latency matrix; publish
      throttle; kernel still reaches all nodes with cold coordinates.

**doneWhen:** coordinates converge (relative error below threshold) on synthetic
2/3/region topologies; overlay reaches 100% with both cold and converged
coordinates; chattiness within budget; `tap` green.

## WS3 — Emergent tree (Plumtree)

Files (new): `src/topology/emergent-tree-service.js` (+constants).
Files (edit): `proximity-spray-service.js` (eager-push along tree edges, lazy
IHAVE otherwise), message types (+GRAFT/PRUNE/IHAVE).

- [ ] Eager/lazy edge sets over the proximity overlay; GRAFT on missing message,
      PRUNE on redundant; lazy IHAVE repair.
- [ ] Self-heal on node loss (no SPOF; proportional degradation).
- [ ] Tests: redundant-copy count drops vs WS1 at equal coverage; tree heals
      after a peer drop.

**doneWhen:** equal coverage to WS1/2 with materially fewer messages; coverage
holds across a single-node failure; `tap` green.

## WS4 — Placement + query consumers

Files (edit): `placement-owner-evidence.js`
(+`buildProximityContext`, `preferProximityLocality/Diversity`, hysteresis),
`query-router.js` (coordinate-distance ordering), introspection meta-action
(on-demand DBSCAN view).

- [ ] Placement scoring uses coordinate distance; hysteresis prevents churn;
      latency-group path still works in parallel.
- [ ] Query routing orders candidates by coordinate distance to local node.
- [ ] Operator introspection: cluster view derived on demand (not load-bearing).
- [ ] Tests: diversity spreads replicas across coordinate clusters; locality
      prefers near; hysteresis suppresses churn under drift.

**doneWhen:** placement/query parity-or-better vs latency-group scoring on a
multi-cluster fixture; no replica churn under bounded coordinate drift;
`tap` green.

## WS5 — Promotion gate

- [ ] Flat-topology equivalence: `alpha: 0` (or uniform coords) → 100% delivery
      (RNG-limit recovery), deterministic test.
- [ ] Formation non-regression: cold-start + rolling-restart from clean
      containers (`SRC_FINGERPRINT` confirmed) with coordinate layer cold.
- [ ] `scripts/rolling-restart-stat-gate.sh` at `N≥8`: proximity convergence ≥
      grouped/safe baseline AND fanout message count materially below `safe`.

**doneWhen:** all three pass; flip default `propagationMode` to `proximity`.
If the stat-gate verdict is inconclusive, keep default `safe` and record the
distribution — do not move the goalpost.

## WS6 — Decommission latency groups (irreversible — only after WS5)

Files (remove): `latency-group-manager*.js`, `group-selection-service.js`,
`latency-tree-service.js`, grouped path of `cdc-group-propagation-service.js`,
`latency_groups` / `inter_group_latencies` schema + reads.
Files (edit): docs (`docs/latency-topology-operations.md`), `platform-doctrine`
references, archived spec pointer.

- [ ] Remove dead owners + tables; delete now-unreachable code paths (verify call
      paths first per repo policy).
- [ ] Remove `grouped` mode value; keep `safe` as the fallback.
- [ ] Update docs and steering; refresh the LLM pack
      (`npm run steering:llm:pack`) if any packed source changed.

**doneWhen:** `knip` clean (no dead code), `tap` green, docs updated, stat-gate
still green post-removal.
