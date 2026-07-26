# S6 Design — Live Rebuild Wiring and Certification

Scope: quest `raft-snapshot-live-rebuild` (R5; the final rung). Two phases
under one sealed statement: (A) close every zero-caller production link of
the S1-S5 chain with deterministic red-on-revert guards; (B) certify a
large replica rebuild under foreground writes against a sealed bar with the
live stat gate, emitting the scale program's P0 report slice. The
operational-ground-truth engagement-audit rule applies: ALL links close
before the first live run.

## The engagement audit (research-verified: six dead links + one gap)

1. NO checkpoint cadence — creation's only caller is the S4 create-fallback.
2. `onSnapshotCatchupNeeded` — zero production setters.
3. Bulk channel registry — never instantiated; `attachBulkChannelRegistry`
   never called in production; an inbound bulk IDENTIFY today is
   warned-and-closed.
4. No peer bulk dial (address resolution exists —
   `resolveNodeWebSocketAddress` over `node_endpoints` — but nothing calls
   it for bulk).
5. No follower offer router (nothing watches an adopted bulk connection for
   the first OFFER frame).
6. `registerReplacementService` — zero production callers; ReplicaHandler
   needs a `replaceLocalReplicaService` (its `registerExistingReplica` is
   idempotent-by-early-return and unusable for a swap).
Gap: the bulk connection API and the transfer socket contract do not
compose — a production adapter must route chunk frames through
`sendChunkFrame` so the token bucket and pending bound stay authoritative
(bypassing via the raw ws would silently void the S3 lane property).

## Phase A — production wiring, each link with a red-on-revert guard

1. **Checkpoint cadence owner** (`src/partition/partition-snapshot-cadence.js`
   or equivalent): a tick riding the existing 1s prepared-state-hold sweep
   (the durability-fitness precedent), nowMs-overridable. The sweep fires
   on ALL roles every 1s and creation is async and can exceed 1s — so the
   TICK owns its own role gate (leader-only, re-checked after any await
   since role can change mid-creation) AND an in-flight flag (the seam
   provides neither — verifier hazard). Typed refusal for
   in-memory/control-plane partitions (mirrors calculatePartitionSize's
   special cases). Triggers: entry-count over the (currently dead)
   `raft.snapshotThreshold` config key, byte threshold from the existing
   partition-size computation. On fire: create checkpoint, then retention
   sweep with the FULL pin set.
2. **Dispatcher wiring** at `ReplicaHandlerSetup.create` — NOT a single
   factory (verifier REFUTATION: there are TWO production factories, and
   the live-scenario's restarted non-seed node builds its replicas through
   the JOIN/durable-rejoin factory, not bootstrap; wiring only the
   bootstrap factory ships a half-wired link the gate would burn runs
   discovering). Set `service.onSnapshotCatchupNeeded` to a dispatcher
   closure
   assembling checkpointsRoot, identity (config clusterId + membership
   epoch selector over cached publication rows), `service.db`, and the
   bulk socketProvider. Guard: a factory-built service has the seam set
   (precondition witness), and reverting the setter reds the guard.
3. **Bulk registry bootstrap**: instantiate
   `createBulkTransferChannelRegistry({nodeId})` and attach it to the
   MessageRouter where the router is built in node bootstrap. Guard: a
   booted node adopts a `channel: bulk` IDENTIFY instead of
   warn-and-close.
4. **Peer bulk dial** (socketProvider): resolve the follower nodeId's ws
   address via `resolveNodeWebSocketAddress({targetNodeId,
   systemTableCache})` (the CDC node-join dial precedent), then
   `registry.getConnection(nodeId) || registry.dial(...)`. Typed
   `SOCKET_UNAVAILABLE` when unresolved.
5. **Transfer-socket adapter** (`bulkConnectionTransferSocket(connection)`):
   exposes the `.on('message')/.on('close')/.send()` contract, routing
   binary chunk frames through `connection.sendChunkFrame` and control
   through `sendControl`. Verifier MUST-CHANGE contract holes closed: the
   bulk connection API grows a consumer-facing CLOSE hook (drivers have no
   timeouts — a dropped connection would hang both ends forever); any
   non-`SENT` `sendChunkFrame` outcome (PENDING_LIMIT silent drop, CLOSED,
   CANCELLED) is treated as a FATAL abort, never ignored; and NO
   driver-level tokenBucket is passed from the dispatcher (chunks are
   already paced by `sendChunkFrame` — a second bucket double-charges every
   byte). Order safety: the protocol is strict lockstep (one chunk queued
   at a time; the only control frame that can overtake a queued chunk is a
   terminal ABORT, which is safe), so the two send methods preserve
   effective order. Guard: every served chunk byte transits the token
   bucket; lane isolation retained under transfer saturation.
6. **Follower offer router** — PEEK-THEN-REPLAY (verifier MUST-CHANGE:
   receiver-owns-from-frame-1 is impossible because the receiver needs the
   target replica, and the OFFER descriptor carries `raftGroupId`
   (partitionId) + `entity.id` (tableName), NO replicaId): on bulk-
   connection adoption, arm a first-frame watcher that BUFFERS the OFFER
   (and any interim frames); map `descriptor.raftGroupId` → the local
   replica via `localReplicas` metadata; construct the receiver and REPLAY
   the buffered frames into its inbox; run `orchestrateSnapshotCatchupInstall`
   with the production factory and `replaceLocalReplicaService(R, replacement)`
   (new ReplicaHandler method swapping `localServices` + `setLocalReplica`;
   `registerExistingReplica` is idempotent-by-early-return and unusable for
   a swap). The connection API also grows `offMessage` so a completed
   transfer's inbox listener does not accumulate and buffer unboundedly on
   a long-lived connection. CDC subscriber idempotency + `servicesCreated`
   noise across factory re-runs guarded. `needsReplicaRuntimeRepair` routes
   to snapshot install when the leader advertises a generation.
7. **Scaled DT fixture**: lift the sealed-generation fixture to ~50k fat
   rows (tens of MiB, dozens of chunks) so multi-chunk transfer, resume
   across a verified chunk boundary, pacing, and the full attack battery
   are deterministically proven — this is where "large" is earned per
   deterministic-first; the live run then certifies, not discovers.
8. Guard scenario runner `scripts/checks/run-raft-snapshot-live-rebuild-scenarios.js`
   (fidelity `deterministic-guard`) covering the new guards + the S1-S5
   regression suites.

## Phase B — the live scenario and P0 report slice

- `test/distributed/scenarios/snapshot-live-rebuild.js` (auto-discovered)
  + `scenarios.snapshotLiveRebuild` config block + resolver. Phases: load
  readiness → preload the target partition to the declared row/byte floor
  (bulk INSERT batching pre-measurement) → `startLoad({...,
  trackAcknowledgedWrites: true})` → stop a non-seed follower → NEW
  `cluster.wipeReplicaData(nodeId, {partitionId, replicaId})` (chaos-shape
  execInContainer rm of the replica db + sidecars + checkpoints dir) →
  start node → observe dispatch → transfer → install → recreate → resume →
  convergence waits → acknowledged-write reconciliation. Optional
  restartability leg: kill mid-transfer, restart, resume from the verified
  boundary.
- Preload targeting (verifier MUST-CHANGE — generated keys spread across
  partitions): the preload phase uses key-range-aware generation to hit ONE
  partition's row/byte floor (or defines the floor as whole-table × N);
  batched multi-row INSERT via `node.query` over the admin lane, not the
  paced load lane, to reach a serious byte floor in bounded wall-clock.
- R5 evidence emitted ONLY through the real additive surfaces (verifier
  MUST-CHANGE — `buildScenarioEntry` is a closed allowlist, NOT arbitrary
  result passthrough): `loadMetrics.*`, `details.*`, and top-level
  `write(extraFields)`, kept under the degrade-strip cap (oversized entries
  drop loadMetrics/details) or lifted top-level. Fidelity stamp: the exact
  string `'live'` (the audit special-cases it; any other value keeps the
  non-gating warning firing) — added at the distributed run's report
  assembly. R5 items: transfer bytes/rate (descriptor +
  container rx/tx deltas), queue/retry bounds (bulkChannel stats +
  loadMetrics queueDelay/waitReasons), install state (marker states +
  typed outcome), log-prefix size (boundary before/after + retained rows),
  catch-up duration (wipe → INSTALLED_AND_RECREATED → first post-boundary
  apply), foreground throughput/latency (during-rebuild window vs
  baseline), resource bounds (samples.ndjson cpu/mem, leak analyzer
  ENFORCED failOnDetection for this scenario, watchdog, sampler
  write_bytes), acknowledged-write reconciliation. This IS the P0 slice of
  the scale program's evidence contract, recorded as such in both epics.

## Phase C — sealed bar and the gate

- New `snapshot-live-rebuild` row in convergence-sealed-bars.json (the
  Wilson half is additive) PLUS a consumer change to the hardcoded
  `buildGateVerdict` safety floor in rolling-restart-stat-gate-summary.js
  (verifier MUST-CHANGE — the extra safety clauses are NOT purely
  additive): the existing four zeros PLUS zero lost acknowledged writes,
  zero hard invariant breaches, install outcomes only
  INSTALLED_AND_RECREATED on the success path, zero INSTALL_STATE_CONFLICT,
  boundary monotonic. Foreground non-starvation ratios and resource
  fractions sealed after the calibration pass.
- Ordering (operational ground truth): (1) all Phase A guards green +
  scenario runner 3x; (2) mechanistic N=3-4 gate pass (does-it-engage;
  fresh containers, SRC_FINGERPRINT verified, analyzers not raw grep);
  (3) fix findings; (4) `npm run gate:preflight` (category 2 milestone
  certification, exact question + why-not-deterministic); (5) the N>=15
  certification run; (6) verdict via the gate-verdict summary; the report
  artifacts cited immutably.

## The scale-program schema reality (verifier-corrected)

The scale program's report schema is DECLARED but UNIMPLEMENTED (no L0
quest, no code). "Uses the scale program's report schema" therefore means:
S6 emits the R5 evidence fields additively and DEFINES the P0 slice of the
`scale-certification-evidence-contract`, recording that designation in BOTH
epics (raft-snapshot-transfer-install and large-scale-data-plane-
certification) — it does not consume a pre-existing schema. `tasks.md`
L4↔S6 coupling is bidirectional and stays recorded.

## Execution boundary (verifier-confirmed separability)

Phase A (all six links + adapter + scaled fixture) is deterministically
verifiable in-process and LANDS FIRST as guarded commits under the open
quest (the S1-S5 guarded-promotion precedent) — the quest itself cannot
close until the live terminal (the authoring bar + the audit live-fidelity
check both bind at closure). Two Phase A guards are bootstrap-level
engagement witnesses (a booted node adopts a bulk IDENTIFY; the seam is set
on the real join path), not live runs. Phase B/C — the N>=15 docker
certification, a >1hr commitment gated by preflight — is a cleanly
separable follow-on run once every Phase A guard is green and the
mechanistic N=3-4 engagement pass is clean.

## Out of scope / recorded

P1-P3 scale profiles and the full L0 quest (the scale program's own
ladder); authenticated transport; cross-cluster isolation beyond the
config clusterId; message-group/in-memory snapshots. The epic closes with
S6; residuals route to the scale program epic.
