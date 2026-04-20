# Message-Group Raft Runtime Owner Collapse

## Why

Message-group runtime currently carries two separate Raft wrapper paths:

1. `src/message-group/message-group-service.js` embeds its own liferaft node,
   transport write path, packet-response path, and election lifecycle.
2. `src/worker/message-group-worker-service.js` already delegates those same
   concerns to `src/raft/raft-group.js`.

That is a direct violation of the steering rule that one concern has one owner
and one active path. It also makes transport bugs cluster at the message-group
boundary because fixes land in only one wrapper at a time.

The focused distributed reruns on April 13, 2026 changed the failure shape but
not the boundary. The system now passes the earlier bootstrap and split
deadlocks, then fails later with:

1. seed load-lane denials from `local_query_transport_not_ready` and
   `control_plane_write_unhealthy`
2. benchmark replica admission blocks from `leadership_unstable`
3. repeated `CDC forward to leader rejected`, `Raft CDC command failed`, and
   `Failed to deliver CDC event`
4. final scenario timeout `partition_growth_stalled` even though planner-side
   node selection and admission already see enough candidate nodes

That points to one porous runtime boundary:

`query-transport owner -> metadata ingress readiness -> strict CDC forwarding -> metadata publication visibility`

The remaining work in this package is therefore not just the old wrapper
collapse. It is the follow-on owner collapse required to make message-group
ingress, seed query transport, and metadata dissemination use one semantic
decision path.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Collapse message-group Raft transport/runtime ownership onto one owner.
2. Remove the inline liferaft wrapper from `MessageGroupService`.
3. Keep message-group-specific policy in `MessageGroupService` while reusing
   the shared Raft runtime owner.
4. Add focused regression coverage proving the shared owner path is used for
   message-group packet transport and lifecycle.
5. Unify seed query-transport readiness onto the canonical query-transport
   selection owner instead of a seed-only leader-service wrapper.
6. Collapse strict CDC ingress readiness, metadata-ingress readiness, and CDC
   apply/forward routing onto one normalized decision snapshot.
7. Contain repeated node-state publication retries so metadata recovery
   pressure becomes bounded coalescing rather than an unbounded retry storm.
8. Keep bootstrap leader-routing overlays available during bounded
   leader-service cache gaps instead of dropping routability as soon as
   leader metadata survives without its service rows.
9. Keep self-node readiness on one canonical runtime-evidence path when the
   local `nodes` row briefly disappears from cache during recovery pressure.

## Out Of Scope

1. Reworking worker-process architecture beyond the shared owner cutover.
2. Harness timeout tuning, threshold loosening, or triage wording changes.
3. Broad query/table-creation policy redesign beyond the owner-path fixes
   needed to restore publication visibility.

## Invariants

1. Message-group Raft packet transport has one runtime owner.
2. Packet handling, peer join, election start, and response delivery do not
   live in parallel wrappers.
3. Message-group-specific readiness and forwarding policy remains above the
   shared Raft runtime owner instead of forking it.
4. Seed and join query-transport readiness consume the same canonical
   selection owner.
5. Strict CDC ingress emits one canonical decision for:
   `canAcceptCDCEvent`, `getMetadataIngressReadiness`, and the CDC
   apply/forward execution path.
6. Pressure may defer or coalesce metadata publication, but it must not create
   a second publication ingress or a retry storm that hides convergence truth.
7. Late control-plane publication convergence is discussed and implemented as
   one owner chain, not as independent local bugs in join, readiness, repair,
   and routing.
8. Strict repair truth, topology provisioning truth, and placement truth are
   separate readiness projections with one explicit relationship:
   `repairEligible -> provisioningEligible -> placementEligible`.

## Discussion Model

The affected runtime slice is smaller than the file count suggests. The
current distributed failures live on one owner chain:

1. `ControlPlaneKernelIngress`
   chooses where metadata writes and repair-triggering reads should enter.
2. `ControlPlaneSystemTableGateway`
   chooses how a control-plane read or mutation is admitted, deferred,
   degraded, or executed.
3. `AuthoritativeNodeEvidenceReconciler`
   chooses whether authoritative node/service evidence should update cached
   discovery state.
4. Readiness, discovery, heartbeat, and join flows consume the resulting
   authority view.

That means the current problem is not "many unrelated moving parts". It is one
semantic pipeline with too many partially-overlapping local policies.

### Canonical Boundary Questions

To keep this slice discussable, every behavior in scope should reduce to one of
these questions:

1. `where should this control-plane action enter?`
   Owner: `ControlPlaneKernelIngress`
2. `may this action execute now, or must it defer/degrade/reject?`
   Owner: `ControlPlaneSystemTableGateway`
3. `what does authoritative evidence actually prove?`
   Owner: `AuthoritativeNodeEvidenceReconciler`
4. `is the resulting authority view good enough for readiness/routing?`
   Owner: downstream consumers, but only from the canonical evidence snapshot

### Canonical State Models

The owner chain is only discussable if each boundary emits a small explicit
state model instead of ad hoc booleans.

1. Ingress target state
   - local eligible
   - remote eligible
   - ingress not ready
   - routing not ready
   - suppressed target
2. Gateway execution state
   - execute
   - defer
   - degrade
   - reject
3. Authoritative evidence state
   - observed rows
   - observed empty confirmed
   - observed empty unconfirmed
   - unavailable
4. Downstream authority outcome
   - usable authority
   - stale but retained authority
   - unavailable authority

The current gap is that these state models exist only partially, and some
callers still infer semantics from raw row counts, target addresses, or retry
behavior.

### Current Structural Smells

The latest harness runs show three repeating smells:

1. Publication ingress is still too chatty.
   Joiners keep sending `NODE_STATE_UPDATE` while the priority
   `control_plane_publications-p1` partition is itself rebalancing under
   safety deferrals.
2. Gateway and repair are still too eager to "help".
   Nodes repeatedly trigger authoritative repair and cache refresh while the
   publication lane is under pressure, which makes the system harder to reason
   about.
3. Readiness consumers still observe side effects instead of one authority
   verdict.
   The five-node failure collapses into heartbeat freshness divergence; the
   seven-node failure collapses into table visibility/routability divergence.
   Those are two symptoms of one late authority-convergence boundary.

### Structural Read Of The Latest Failures

The current failures are not best understood as bootstrap bugs or message-group
bugs anymore.

1. The five-node run now fails in `load` with heartbeat freshness invariants
   after heavy control-plane pressure.
2. The seven-node run now fails much later on `benchmark_events`
   visibility/routability after bootstrap, activation, and late replica work.
3. Both runs still show the same authority slice under stress:
   `control_plane_publications-p1` spread pressure, repeated control-plane
   repair, repeated node-state publications, and authority/cache divergence.

So the right discussion unit is:

`publication ingress -> gateway admission -> authoritative repair -> authority consumers`

not:

`bootstrap`, `heartbeat`, `service discovery`, `join`, and `table visibility`
as separate bug buckets.

### Execution Rule For The Rest Of This Package

From this point on, fixes in this package should only land if they make the
owner chain more explicit.

Acceptable changes:

1. collapse duplicate target-selection logic into `ControlPlaneKernelIngress`
2. collapse duplicate defer/degrade/reject logic into the gateway
3. tighten authoritative evidence application rules in the reconciler
4. make readiness consumers depend on the canonical authority outcome

Not acceptable:

1. adding one more caller-specific fallback
2. adding more retry cadence tweaks without owner simplification
3. adding another repair/read path beside the gateway and reconciler
4. solving a downstream symptom without naming which owner boundary was wrong

### 2026-04-14 Gateway Equality Update

The next structural reduction landed in the gateway owner:

1. `ControlPlaneSystemTableGateway.reconcileAuthoritativeCacheRows(...)`
   now owns canonical row equality by default instead of requiring each
   repair caller to inject `areRowsEqual(...)`.
2. That means authoritative repair can now be a true no-op when the cache
   already matches the authoritative snapshot, instead of replaying full-table
   UPSERT storms through the cache mutation path.
3. This is directly aimed at the late failure slice where repeated
   authoritative discovery repair kept reporting large repaired row counts
   during publication pressure.
4. Focused regressions now prove both:
   - unchanged `services` rows reconcile as `mutationCount=0`
   - canonical-equivalent `control_plane_publications` rows reconcile as
     `mutationCount=0` without caller-local comparator wiring

Expected effect:

1. repeated discovery/readiness repair should stop manufacturing mutation
   churn when authoritative rows already match cache state
2. publication pressure should become easier to reason about because gateway
   repair no longer amplifies it with redundant cache writes

## Hotspots

1. `src/message-group/message-group-service.js`
2. `src/raft/raft-group.js`
3. `src/message-group/message-group-forwarding-owner.js`
4. `src/bootstrap/phases/seed-infrastructure-phase.js`
5. `src/bootstrap/owners/bootstrap-message-group-selection-owner.js`
6. `src/control-plane/control-plane-readiness-service.js`
7. `src/admin/admin-websocket-api.js`
8. `src/admin/admin-service-discovery.js`
9. `src/bootstrap/owners/bootstrap-topology-snapshot-owner.js`
10. `test/message-group/message-group-service.test.js`
11. `test/bootstrap/seed-infrastructure-phase.test.js`
12. `test/bootstrap/bootstrap-topology-snapshot-owner.test.js`
13. `test/control-plane/control-plane-readiness-service.test.js`
14. `test/admin/admin-service-discovery.test.js`
15. `test/rebalancer/storage-admission-service.test.js`
16. `test/control-plane/topology-blocked-by-serve-readiness.test.js`
17. `test/control-plane/readiness-snapshot-persistence.test.js`

## Analysis Tasks

- [x] Enumerate the exact Raft concerns duplicated between the service and worker paths.
- [x] Define the smallest shared-owner surface `MessageGroupService` needs.
- [x] Confirm which message-group-specific hooks must remain above the shared owner.
- [x] Survey the late distributed failure after the initial owner-collapse fixes.
- [x] Confirm that planner/admission visibility is no longer the first blocker.
- [x] Identify the remaining porous boundary as query transport plus
  metadata-ingress plus strict CDC dissemination.
- [x] Confirm the seed/join asymmetry:
  seed query transport still binds through `getLeaderMessageGroupService(...)`
  while join uses the canonical query-transport selection owner.
- [x] Confirm strict CDC ingress still has split adjudicators across:
  live Raft leader checks, `canAcceptCDCEvent(...)`,
  `getMetadataIngressReadiness(...)`, and CDC apply/forward execution.
- [x] Confirm the final distributed failure is publication visibility stall:
  `partition_growth_stalled` with enough selected/admission-ready nodes but too
  few ready replica nodes.

## Implementation Tasks

- [x] Move `MessageGroupService` off its inline Raft node wrapper and onto `RaftGroup`.
- [x] Remove the duplicated packet-response and election-start wrapper code from the service path.
- [x] Preserve join-time suppression and message-group-specific lifecycle policy without reintroducing a second Raft wrapper.
- [x] Add focused tests that fail if the service regresses back to a private Raft wrapper.
- [x] Add a failing seed-side regression proving query-transport readiness must
  route through the canonical selection owner rather than
  `getLeaderMessageGroupService(...)`.
- [x] Update the seed infrastructure path to use the same query-transport
  owner contract as join runtime.
- [x] Add failing regressions proving strict CDC ingress uses one decision
  snapshot across `canAcceptCDCEvent(...)`,
  `getMetadataIngressReadiness(...)`, and CDC apply/forward execution.
- [x] Collapse strict CDC ingress and metadata-ingress readiness onto one
  canonical decision owner.
- [x] Add failing regressions proving repeated node-state publication attempts
  coalesce or defer through one owner instead of multiplying in-flight
  recovery pressure.
- [x] Contain node-state publication pressure at the owner boundary without
  adding a second mutation or dissemination path.
- [x] Add failing regressions proving repeated authoritative discovery repair
  failures reuse one deferred owner state instead of re-entering the same
  recovery lane on every poll.
- [x] Contain authoritative discovery repair pressure at the owner boundary
  with one failure-cooldown snapshot and bounded backoff.
- [x] Add failing regressions proving an empty local bootstrap-authoritative
  partition read must not erase non-empty cached topology rows.
- [x] Retain cached bootstrap topology rows when local authoritative partition
  reads collapse to an empty snapshot during late recovery.
- [x] Add failing regressions proving bootstrap routing overlays stay usable
  when cache leader metadata survives but the cache temporarily loses the
  addressed leader service rows.
- [x] Retain bootstrap routing overlays as a bounded leader-service-gap bridge
  when the cached leader still matches the fresh bootstrap routing snapshot.
- [x] Add failing regressions proving self-node readiness uses live local
  runtime evidence instead of collapsing to `node_row_missing` when the local
  `nodes` row briefly disappears.
- [x] Collapse self missing-node readiness onto one explicit canonical state:
  fail closed for remote/inactive cases, or use live self runtime evidence
  when active control-plane services are already present.
- [x] Re-run the focused distributed scenarios after the owner fixes land.

## Validation

1. `test/message-group/message-group-service.test.js`
2. `test/raft/raft-provider-contract.test.js`
3. `test/raft/raft-group.test.js`
4. `test/bootstrap/seed-infrastructure-phase.test.js`
5. `test/control-plane/control-plane-readiness-service.test.js`
6. `test/bootstrap/connect-websocket-phase.test.js`
7. `test/admin/admin-service-discovery.test.js`
8. `test/admin/admin-control-snapshot.test.js`
9. `test/admin/admin-websocket-api.test.js`
10. `test/bootstrap/bootstrap-topology-snapshot-owner.test.js`
11. `test/control-plane/heartbeat-memory-trend.test.js`
12. Targeted distributed rerun:
   `seven-node-read-write-load-transaction-recovery`
13. Follow-on confirmation rerun if the first scenario clears the old boundary:
   `postgres-baseline-comparison`

## Done When

1. `MessageGroupService` and message-group worker code share one Raft runtime owner.
2. The inline service-local Raft transport wrapper is gone.
3. Seed and join query-transport readiness use one canonical owner path.
4. Strict CDC ingress and metadata-ingress readiness use one canonical
   decision snapshot.
5. Focused tests and the failing distributed scenario no longer regress into
   seed query-transport denial, CDC forward rejection storms, or stalled
   metadata visibility on the same boundary.

## 2026-04-13 Survey Update

### Latest Distributed Findings

1. The old seed bootstrap readiness failure is fixed.
2. The old same-node split dispatch deadlock is fixed.
3. Planner-side global occupancy is improved enough that the seven-node run
   now reaches benchmark table creation and load.
4. The latest seven-node rerun still fails after load with
   `partition_growth_stalled`.
5. Final diagnostics from the rerun show:
   - `selectedNodeIds=5`
   - `admissionReadyNodeIds=5`
   - `readyReplicaNodeIds=2`
   - repeated seed load-lane denials
   - repeated CDC forward failures and outbound queue saturation

### Code-Level Conclusions

1. Planner and admission are no longer the first blocker.
2. Publication visibility and CDC dissemination are now the active blocker.
3. The seed still uses a stricter and different query-transport owner path
   than join runtime.
4. Message-group strict CDC ingress still has overlapping leader/readiness
   adjudicators instead of one canonical decision model.
5. Repeated node-state publication retries are likely amplifying recovery
   pressure while `nodes/services` visibility is still incomplete.
6. Authoritative discovery repair currently reuses only successful repairs,
   so pressure/timeout failures can repeatedly re-enter the same `nodes`
   recovery lane from load-lane admission and forced control-snapshot probes.

### 2026-04-13 Repair Execution Update

1. Seed query-transport readiness now routes through the shared canonical
   selection owner used by join runtime.
2. Strict CDC ingress, metadata-ingress readiness, and the CDC
   apply/forward path now consume one normalized decision snapshot.
3. `ReplicaDispatchService` now applies one publication-pressure retry model
   for `NODE_STATE_UPDATE` instead of rearming a flat short retry cadence.
4. Retryable participant-failure node-state writes now back off through one
   deferred owner slot per node and keep only the latest payload for replay.
5. Focused verification is passing for:
   - `test/bootstrap/seed-infrastructure-phase.test.js`
   - `test/bootstrap/connect-websocket-phase.test.js`
   - `test/bootstrap/bootstrap-service-ready-signal.test.js`
   - `test/message-group/message-group-service.test.js`
   - `test/control-plane/replica-dispatch-node-state-update.test.js`
6. `AdminServiceDiscovery` now keeps one owner-held failure cooldown for
   authoritative discovery repair, so pressure/timeout failures defer repeat
   repair attempts instead of re-entering the same recovery lane on every
   250ms load-lane table-admission poll or repeated control-snapshot probe.
7. Focused verification also passes for:
   - `test/admin/admin-service-discovery.test.js`
   - `test/admin/admin-control-snapshot.test.js`
   - `test/admin/admin-websocket-api.test.js`
8. `BootstrapTopologySnapshotOwner` now retains cached topology rows when
   local bootstrap-authoritative partition reads collapse to an empty row set,
   so late-recovery seed nodes do not erase `partitions` ownership metadata
   and manufacture leader/service contradictions from one stale local replica.
9. `HeartbeatService` now treats deferred reporter-visibility proof misses as
   real heartbeat publication failures instead of diagnostics-only target
   updates.

### 2026-04-14 Strict-Forward Retry Update

1. The late `control_plane_publications` recovery-lane fix held; the next
   failure boundary was strict CDC forwarding after a concrete leader target
   had already been selected.
2. The active bug was not another `leader unknown` defer. It was a retryable
   target-delivery failure such as `Connection to node ... closed` being
   collapsed into the same terminal defer shape.
3. `MessageGroupForwardingOwner` now distinguishes:
   - non-retryable strict-target absence/defer
   - retryable strict-target delivery defer
4. Retryable strict-target delivery defers now preserve the transport error
   code and remain retryable so the provider can re-resolve leader routing
   instead of failing after the first closed-connection hit.
5. `LiferaftProvider.proposeWithLeaderRouting(...)` now honors deferred
   `retryAfterMs` hints from retryable forward failures rather than consuming
   the remaining attempt budget immediately.
6. Focused verification passes for:
   - `test/raft/raft-provider-contract.test.js`
   - `test/message-group/message-group-service.test.js`
10. Node-heartbeat coalescing now consumes one explicit reporter-visibility
    state owner (`confirmed`, `pending`, `unverified`) so a fresh publish that
    loses canonical `nodes` visibility cannot be hidden by the min-update
    interval.
11. Focused heartbeat regressions now cover both the visibility-failure
    accounting path and the post-failure forced-retry path inside the
    heartbeat owner.
12. The fresh seven-node rerun on April 13, 2026 no longer regressed into the
    old global bootstrap/metadata-collapse shape; it reached late
    `benchmark_events` partition growth before failing with
    `replica_spread_stalled`.
13. The remaining failure boundary is now joiner `NODE_STATE_UPDATE`
    routability under pressure: at least one live joiner stayed container-live
    while its `nodes` row fell back to `disconnected`, and its routed
    `nodes-p1` updates failed with `DISTRIBUTED_PARTICIPANT_FAILURE` plus
    `reasonCode: no_service_rows`.

### 2026-04-14 Repair Execution Update

1. `SQLQueryEngine` now keeps bootstrap routing overlays alive through one
   bounded `leader_service_gap` state instead of expiring them immediately
   when cached leader metadata remains but the cache temporarily loses the
   addressed leader service rows.
2. The bootstrap routing overlay now fails closed when the cached leader and
   bootstrap snapshot disagree, and it still yields to the cache once active
   addressed leader service rows return.
3. Focused regressions now cover:
   - bootstrap overlay reuse during a cache leader-service gap
   - stale bootstrap routing snapshots being rejected when the cache leader
     changes
4. Focused verification passed for:
   - `test/query/sql-query-engine-routing-overlay-state.test.js`
   - `test/query/sql-query-engine.test.js`
   - `test/control-plane/control-plane-kernel-ingress.test.js`
   - `test/bootstrap/node-joining-service.test.js`
5. `ControlPlaneReadinessService` now resolves one explicit missing-node
   readiness state for self evaluation:
   - `fail_closed` for remote/inactive/no-local-control-plane cases
   - `self_runtime_grace` when the local node is alive and already hosts an
     active addressed message-group service
6. Self missing-node runtime grace no longer fabricates
   `serveEligible=false, reasons=node_row_missing` for the live local node.
   The same canonical readiness owner now emits real local transport reasons
   when transport is deferred, without forcing synchronous authoritative
   self-repair.
7. Focused regressions now cover:
   - self-node missing-row admission staying open on live local control-plane
     service evidence
   - self-node missing-row transport deferral surfacing
     `local_query_transport_not_ready` instead of `node_row_missing`
8. Focused verification passed for:
   - `test/control-plane/control-plane-readiness-service.test.js`
   - `test/admin/admin-websocket-api.test.js`
9. Fresh distributed validation is running for
   `seven-node-read-write-load-transaction-recovery` against the updated
   readiness owner path.

### 2026-04-14 Discovery Repair Contract Update

1. `ControlPlaneSystemTableGateway` now exposes one explicit authoritative
   cache-reconcile intent model:
   - `refresh_evidence`
   - `replace_cache`
2. Discovery-critical authoritative repairs now route through
   `refresh_evidence` so degraded empty reads cannot silently prune cached
   `nodes/services` evidence.
3. `AuthoritativeNodeEvidenceReconciler` now emits one explicit table-evidence
   state model per repaired table:
   - `unavailable`
   - `observed_rows`
   - `observed_empty_confirmed`
   - `observed_empty_unconfirmed`
4. Readiness repair now distinguishes:
   - empty but confirmed authoritative absence
   - empty but unconfirmed degraded reads
   - true owner-path unavailability
5. Only observed evidence is reconciled into cache, and readiness repair does
   so through the refresh-only reconcile contract instead of delete-missing
   cache replacement.
6. `AdminServiceDiscovery` now uses that same refresh-only reconcile contract
   for authoritative discovery repair, keeping one cache-repair semantic owner
   across load-lane admission and forced control-snapshot repair.
7. Focused verification passed for:
   - `test/control-plane/control-plane-system-table-gateway.test.js`
   - `test/control-plane/authoritative-node-evidence-reconciler.test.js`
   - `test/admin/admin-service-discovery.test.js`
   - `test/control-plane/control-plane-readiness-service.test.js`
   - `test/admin/admin-control-snapshot.test.js`
   - `test/admin/admin-websocket-api.test.js`

### 2026-04-14 Provisioning Projection Update

1. The next focused distributed reruns no longer failed first on bootstrap,
   split deadlock, or destructive empty-read repair. They failed on a tighter
   contract gap:
   - seven-node placement lost nodes to
     `control_plane_write_unhealthy` and `cluster_member_unhealthy`
   - five-node baseline comparison tripped
     `heartbeat_freshness_invariant_failed`
2. That exposed one remaining conflation inside readiness consumers:
   - strict repair truth
   - topology provisioning truth
   - final placement truth
   were still too close together for late convergence pressure.
3. `ControlPlaneReadinessService` now emits one explicit intermediate
   readiness projection:
   - `repairEligible` remains the strict repair/publication truth
   - `provisioningEligible` reopens only bounded topology work during active
     publication convergence while recovery stays available
   - `placementEligible` becomes
     `provisioningEligible && loadReady && capacityPlacementEligible`
4. `StorageAdmissionService` now consumes:
   - `controlPlaneRecoveryEligible` for critical system partition work
   - `provisioningEligible` for ordinary topology provisioning
5. This keeps the owner chain discussable:
   - critical repair remains strict
   - non-critical topology growth does not directly consume
     `repairEligible`
   - late convergence grace is named in one projection instead of being
     re-created as caller-local exceptions
6. Focused verification passed for:
   - `test/control-plane/control-plane-readiness-service.test.js`
   - `test/rebalancer/storage-admission-service.test.js`
   - `test/control-plane/topology-blocked-by-serve-readiness.test.js`
   - `test/control-plane/readiness-snapshot-persistence.test.js`
   - `test/rebalancer/projection-boundary.guard.test.js`
   - `test/control-plane/eligibility-snapshot.test.js`
   - `test/bootstrap/bootstrap-topology-snapshot-owner.test.js`
   - `test/control-plane/heartbeat-memory-trend.test.js`

### 2026-04-14 Publication Lane And Heartbeat Routing Completion

1. `ControlPlaneReadinessService` now keeps two explicit membership-publication
   owner lanes:
   - diagnostics publication truth for `controlPlanePublished`
   - planning publication truth for `controlPlaneRecoveryEligible` and
     priority-recovery reasons
2. Readiness no longer reconstructs priority recovery from diagnostics rows.
   One canonical planning snapshot now owns:
   - publication pending recovery grace
   - priority partition spread reasons
   - sync and async recovery planning answers
3. `HeartbeatService` reporter-visibility verification remains on the strict
   authoritative diagnostics path, but its routing readiness dimension is now
   explicitly `controlPlaneRecoveryEligible` instead of the stricter
   repair-only lane.
4. This closes the late self-deadlock where reporter visibility proof and
   readiness recovery admission could disagree even though both were reading
   the same recovery-critical control-plane evidence.
5. Focused regressions now cover:
   - diagnostics/publication truth staying separate from planning/recovery
     truth
   - priority recovery reason codes coming only from the planning snapshot
   - reporter visibility verification staying on the recovery-eligible routing
     lane
   - reporter republish forcing another heartbeat even inside the min interval
     after a fresh visibility loss
6. Focused verification passed for:
   - `test/control-plane/control-plane-readiness-service.test.js`
   - `test/control-plane/heartbeat-memory-trend.test.js`

### 2026-04-14 Distributed Validation After Sprint Completion

1. Fresh reruns completed on both benchmark profiles:
   - `verify-publication-lanes-seven-node-read-write-load-transaction-recovery-20260414T133348Z.report.json`
   - `verify-publication-lanes-postgres-baseline-comparison-20260414T134134Z.report.json`
2. Both scenarios now clear the old startup/pre-load failure frontier:
   - seed bootstrap completes
   - cluster activation completes
   - benchmark table creation/load phases complete
   - `postgres-baseline-comparison` now reaches final `verify`
   - `seven-node-read-write-load-transaction-recovery` now reaches late
     `benchmark_events` split-policy application
3. The remaining failure cluster is later and narrower:
   - repeated `control_plane_publications-p1` routing snapshots fail closed on
     `repairEligible`
   - routed `nodes` / `node_endpoints` updates still hit
     `DISTRIBUTED_PARTICIPANT_FAILURE`
   - replica dispatch continues to defer as `publication_pressure`
   - joiners keep retrying `NODE_STATE_UPDATE` across alternate control-plane
     targets under the same late pressure
4. The seven-node failure is now a late control-lane visibility timeout, not a
   bootstrap or table-id stall:
   - `benchmark_events` partition exists
   - split-policy visibility never converges
   - one control-lane admin apply attempt times out during policy visibility
5. The five-node failure is now a late verification disagreement, not a
   preload readiness failure:
   - load, baseline comparison, and post-load drain all complete
   - final verification observes divergent active-node views across joiners
   - the same late logs show publication-pressure defers, failed routed node
     updates, and readiness-filtered `control_plane_publications-p1`
6. Current conclusion:
   - the implemented sprint repairs were correct and materially advanced the
     system
   - the next unsolved boundary is late control-plane publication convergence
     under recovery pressure
   - specifically, mutation/read visibility for
     `control_plane_publications` still falls behind enough to fragment
     cross-node authority during replica growth and final verification

### Ordered Repair Plan

1. Unify seed query transport with the canonical query-transport selection
   owner.
2. Collapse strict CDC ingress and metadata-ingress readiness onto one
   normalized decision snapshot.
3. Bound node-state publication pressure at the owner boundary through
   coalescing/defer semantics rather than repeated independent retries.
4. Bound authoritative discovery repair pressure at the same owner boundary
   through one deferred failure snapshot and bounded retry delay instead of
   repeated failed repair loops.

### 2026-04-14 Metadata-Ingress Dispatch Action Repair

1. The late five-node and seven-node reruns exposed one remaining owner split:
   `ReplicaDispatchService` was collapsing message-group metadata ingress to a
   boolean even though the message-group owner already emitted the canonical
   action snapshot:
   - `apply_local`
   - `forward`
   - `defer`
2. That mismatch let follower/self-targeted `NODE_STATE_UPDATE` traffic enter
   the local write lane during publication pressure even when the canonical
   owner wanted relay forwarding. This matched the harness evidence:
   acknowledged node-state delivery followed by deferred participant-failure
   writes, stale heartbeats, and late authority drift.
3. Repair implemented:
   - `ReplicaDispatchService` now resolves one canonical metadata-ingress
     decision through `resolveMetadataIngressForwardSelection()` whenever the
     message-group owner exposes it.
   - `NODE_STATE_UPDATE` handling now branches on the owner action instead of
     `ready !== true`.
   - Only `apply_local` reaches the local node-state queue.
   - `forward` and `defer` stay on the canonical metadata-ingress forward
     path.
   - Legacy doubles without the selection API keep one bounded fallback path
     so older call sites do not regress.
4. Focused verification passed for:
   - `test/control-plane/replica-dispatch-node-state-update.test.js`
5. Added regression:
   - canonical `action: forward` with `ready: true` still forwards instead of
     writing locally

### 2026-04-14 Captured CDC Ingress Owner Reuse

1. The remaining CDC propagation churn was still structurally awkward: seed
   and join re-entered shared operational selection on every CDC event, but
   the `preferredService` they passed was already a previously accepted
   subscription ingress owner.
2. The old shared owner treated that captured ingress like a fresh readiness
   probe and could fail closed whenever one transient metadata-ingress check
   churned, even though the inner message-group owner was already the canonical
   boundary for strict forwarding, repair, buffering, and defer semantics.
3. Repair implemented:
   - `src/bootstrap/shared/message-group-selection.js` now models one explicit
     captured-owner state for CDC propagation:
     `preferred_captured`.
   - leader selection still wins when a current leader is available.
   - otherwise CDC propagation can reuse one initialized captured ingress owner
     instead of re-deriving outer readiness and failing closed.
   - seed and join CDC propagation now opt into that shared
     `reuseCapturedIngress` contract.
4. This intentionally narrows responsibilities:
   - outer bootstrap/join selection decides which owner to use
   - inner message-group forwarding owner decides whether that owner applies,
     forwards, buffers, or defers the CDC payload
5. Focused verification passed for:
   - `test/bootstrap/cdc-propagation-message-group-selection.test.js`
   - `test/bootstrap/cdc-initial-subscription-leader-fallback.test.js`
   - `test/bootstrap/node-joining-service.test.js`

### 2026-04-14 Node-State Publication Mode Owner Unification

1. The next late-pressure owner gap was in node-state publication urgency.
   `HeartbeatService`, `NodeJoiningService`, and `ReplicaDispatchService`
   were each inferring publication priority from different local signals such
   as `heartbeatOnly`, visibility loss, or retryable transport errors.
2. That violated the package discussion model:
   - ingress urgency was not one explicit owner state
   - sender routing priority and receiver defer behavior could disagree for
     the same `NODE_STATE_UPDATE`
3. Repair implemented:
   - `src/control-plane/control-plane-constants.js` now owns one explicit
     `nodeStatePublicationMode` state model:
     `heartbeat_steady`
     `heartbeat_recovery`
     `ready_transition`
     `lifecycle_background`
   - `HeartbeatService` now chooses one canonical publication mode before
     emitting node-state reporter payloads or direct local gateway writes.
   - `NodeJoiningService` now carries that same publication mode through the
     routed `NODE_STATE_UPDATE` message and uses the shared profile owner for
     delivery priority and retry posture.
   - `ReplicaDispatchService` now resolves write/defer behavior from the same
     canonical publication mode instead of re-deriving urgency from local
     booleans.
4. The deliberately strict case is only `heartbeat_recovery`:
   - write on the critical lane
   - bypass pressure deferral
   - fail closed on publication pressure at the receiver
   - broaden alternate-target retry at the sender
5. This is intended to make one specific boundary discussable:
   freshness-recovery heartbeat publication under late control-plane
   pressure.
   It does not introduce a second mutation path or widen strict behavior for
   unrelated publication classes.
6. Focused verification passed for:
   - `test/control-plane/heartbeat-storage-budget-preservation.test.js`
   - `test/control-plane/replica-dispatch-node-state-update.test.js`
   - `test/bootstrap/node-joining-service.test.js`
   - `test/control-plane/heartbeat-memory-trend.test.js`
   - `test/bootstrap/node-joining-control-plane-heartbeat.test.js`

### 2026-04-14 Holistic Problem Definition Update

1. The better name for the remaining problem area is not
   "late publication pressure" or "heartbeat freshness drift".
   It is:
   `control-plane authority establishment`
2. That is the end-to-end runtime path by which one node becomes:
   - publishable
   - visible
   - repairable
   - consumable by readiness, routing, discovery, and placement
3. The current code now has better explicit state than before, but the states
   are still partitioned by local mechanism:
   - ingress target state in `ControlPlaneKernelIngress`
   - publication urgency and reporter-visibility state in `HeartbeatService`
   - routed publication retry/target policy in `NodeJoiningService`
   - owner-lane defer/apply policy in `ReplicaDispatchService`
   - authoritative evidence and repair state in
     `AuthoritativeNodeEvidenceReconciler`
   - consumer eligibility projection in `ControlPlaneReadinessService`
4. The surprising distributed bugs are therefore mostly handoff bugs between
   those owners, not isolated defects inside any single local mechanism.

### Canonical Holistic Pipeline

1. `can this node publish control-plane truth?`
   Owners:
   `HeartbeatService`,
   `NodeJoiningService`,
   `ControlPlaneKernelIngress`
2. `did that publication become visible enough to count as truth?`
   Owners:
   `ReplicaDispatchService`,
   `ControlPlaneSystemTableGateway`,
   `HeartbeatService` reporter-visibility verification
3. `if visibility is degraded, what authoritative evidence actually proves?`
   Owners:
   `AuthoritativeControlPlaneView`,
   `AuthoritativeNodeEvidenceReconciler`,
   `ControlPlaneSystemTableGateway`
4. `what may downstream consumers do with that authority state?`
   Owner:
   `ControlPlaneReadinessService`

This package should now be discussed and executed against that pipeline,
not against separate symptom buckets like bootstrap, heartbeat, or
table-visibility failures.

### Simplification Direction

1. Keep one explicit state model for publication intent and urgency.
   Do not let heartbeat, join, and dispatch re-infer it from local booleans.
2. Keep one explicit state model for authority visibility.
   Reporter verification, publication health, authoritative repair, and cache
   reuse should not each invent their own visible/not-visible semantics.
3. Keep one explicit consumer projection layer.
   `repairEligible`, `provisioningEligible`, `placementEligible`, and
   `serveEligible` are useful only if they consume the same canonical
   authority outcome instead of raw side effects.
4. Keep ingress/write/read/repair concerns separate, but join them through
   one normalized authority snapshot per node instead of several partially
   overlapping snapshots.

### Working Rule For The Rest Of The Sprint

1. Good fixes:
   - reduce the number of owner handoffs needed to decide whether a node's
     control-plane presence is authoritative
   - replace local inference with one canonical authority snapshot
   - make downstream policy consume explicit authority states
2. Bad fixes:
   - more caller-local fallbacks
   - more retry cadence tuning without ownership collapse
   - more one-off visibility exemptions
   - more places that infer authority from row counts, target addresses,
     or transport side effects

### 2026-04-14 Runtime Authority Snapshot Implementation

1. The higher-level model is now implemented inside the existing canonical
   readiness owner instead of remaining package-only analysis.
2. `ControlPlaneReadinessService` now builds one explicit
   `runtimeAuthority` snapshot before it emits readiness dimensions.
3. The runtime-authority snapshot is the steady-state analogue of the existing
   startup-authority snapshot. This sharpens one existing owner. It does not
   add a parallel subsystem.
4. Canonical runtime-authority states:
   - `confirmed`
   - `establishing`
   - `retained`
   - `unavailable`
5. Canonical sub-descriptors are now kept together:
   - publication health
   - visibility state
   - latest authoritative repair state
   - provisioning state
   - authority failure descriptor
6. Control-plane readiness dimensions now derive the authority slice from that
   snapshot instead of re-deriving `controlPlaneWritable`,
   `controlPlaneRecoveryEligible`, `repairEligible`, and
   `provisioningEligible` independently from raw side effects.
7. The resulting stable discussion unit is now present in code:
   raw evidence -> runtime authority snapshot -> readiness projections
8. Focused verification passed for:
   - `test/control-plane/control-plane-readiness-service.test.js`
   - `test/control-plane/readiness-snapshot-persistence.test.js`
   - `test/control-plane/topology-blocked-by-serve-readiness.test.js`
   - `test/control-plane/startup-authority-snapshot.test.js`

### 2026-04-14 Authority Snapshot Propagation

1. The higher-level model now exists in more than one local owner. It is no
   longer trapped inside `ControlPlaneReadinessService`.
2. The runtime-authority state model moved to the shared readiness constants
   owner so downstream consumers can use the same semantic states instead of
   retyping string scalars.
3. Compact readiness snapshots now retain a normalized `runtimeAuthority`
   summary. This means dispatch, routing, admission, and persistence paths can
   carry the canonical authority snapshot forward instead of flattening it to
   booleans and rebuilding meaning later.
4. `active-node-projection` now consumes `runtimeAuthority` directly when the
   full readiness snapshot is available:
   - cluster-member health is still the steady-state primary signal
   - convergence-time projection may now explicitly rely on
     `runtimeAuthority.state`
   - legacy `controlPlaneRecoveryEligible` remains only as the fallback path
     when richer authority state is unavailable
5. Projection diagnostics now make that handoff discussable by surfacing
   `runtimeAuthorityIncludedNodeIds` separately from the older
   `recoveryEligibleIncludedNodeIds`.
6. This is the current higher-level structure in code:
   raw evidence -> runtime authority snapshot -> compact authority summary ->
   projection/readiness consumers
7. Focused verification passed for:
   - `test/control-plane/eligibility-snapshot.test.js`
   - `test/control-plane/readiness-snapshot-persistence.test.js`
   - `test/control-plane/active-node-projection.test.js`
   - `test/control-plane/control-plane-readiness-service.test.js`
   - `test/control-plane/membership-publication-coordinator.test.js`

### 2026-04-14 Query And Admission Authority Propagation

1. Query and admin consumer edges no longer collapse readiness back down to only
   reason-code bags.
2. `QueryExecutor` routing denials now preserve a normalized runtime-authority
   summary inside per-node `readinessSummary` diagnostics.
3. `AdminWebSocketAPI` load-lane admission failures now preserve structured
   admission details, including runtime-authority state, instead of forcing the
   caller to infer everything from the error string alone.
4. This means the authority handoff is now visible on three levels:
   - canonical readiness owner
   - compact snapshot / projection consumers
   - consumer-facing routing and load-admission diagnostics
5. The stable discussion object is therefore becoming consistent across the
   stack:
   raw evidence -> runtime authority -> projection/admission decision ->
   consumer-visible diagnostics
6. Focused verification:
   - new query/admin propagation assertions passed in
     `test/query/query-executor.test.js`
     and `test/admin/admin-websocket-api.test.js`
   - both full suites still report one unrelated pre-existing failure outside
     this slice:
     bootstrap-fresh-routing behavior in `query-executor` and authoritative
     gateway routing expectation in `admin-websocket-api`

### 2026-04-14 Consumer Follow-On Closure

1. The last focused consumer-suite failures around the new authority path are
   now closed.
2. `QueryExecutor` fresh-bootstrap routing grace now treats
   `provisioningEligible` as one of the bounded bootstrap-time dimensions that
   may lag while transport-connected partition services are still valid.
3. That keeps bootstrap leader fallback aligned with the newer readiness
   projection model instead of excluding remote replicas only because
   `provisioningEligible` was added to the canonical failed-dimension set.
4. The admin authoritative-discovery consumer expectation has also been
   aligned with the current owner contract:
   table-scoped discovery repair stays on
   `controlPlaneRecoveryEligible` routing through the canonical gateway.
5. Focused verification passed for:
   - `test/query/query-executor.test.js`
   - `test/admin/admin-websocket-api.test.js`
   - `test/admin/admin-service-discovery.test.js`

### 2026-04-14 Control-Plane Mutation Defer Contract

1. The next bounded execution slice for the remaining seven-node failure is
   now implemented below the scenario/helper layer instead of chasing more
   table-policy special cases.
2. `ControlPlaneMutationReadiness` is now the shared owner for the local
   "authority establishment is still pending" defer state:
   - background gateway metadata mutations defer before adding more ingress
     churn
   - retryable routed system-table SQL DML canonicalizes to the same deferred
     result instead of surfacing only opaque timeout failures
3. The canonical deferred result now preserves one authority-establishment
   contract across those mutation paths:
   - `error = query_admission_deferred`
   - `outcome = deferred`
   - `reasonCode` / `reasonCodes`
   - `failedDimensions`
   - `runtimeAuthority`
   - bounded `retryAfterMs`
4. Admin and harness transport now preserve that structure on both failure and
   success envelopes, and the distributed table-policy helper defers
   authoritative repair when that canonical authority-establishment outcome is
   present.
5. While validating this slice, one import-cycle owner leak also surfaced:
   `CONTROL_PLANE_CACHE_RECONCILE_INTENT` was being imported from the gateway
   into readiness repair code. That shared intent is now owned by a small
   shared constants module instead of crossing the gateway/readiness boundary.
6. Recording decision:
   - update `architecture/current-owner-maps.md`
   - update `architecture.md`
   - do not change `.kiro/steering/doctrine.md` or
     `.kiro/steering/system guidelines.md` in this slice, because the current
     doctrine already says to keep one owner, one normalized state model, and
     one canonical consumer-visible outcome
7. Focused verification passed for:
   - `test/control-plane/control-plane-mutation-readiness.test.js`
   - `test/control-plane/control-plane-system-table-gateway.test.js`
   - `test/query/sql-query-engine.test.js`
   - `test/admin/admin-websocket-api.test.js`
   - `test/distributed/harness/__tests__/cluster.test.js`
   - `test/distributed/harness/__tests__/table-distribution-helpers-scenario-policy.test.js`

### 2026-04-15 Transaction-Control Owner-Gap Defer Propagation

1. The next late-pressure collapse after the original mutation defer contract
   turned out to keep one more owner leak below the admin/helper layer:
   retryable routed system-table mutations could still enter transaction setup
   and CDC retry wrapping while the transaction-control partitions themselves
   (`sql_transactions`, `sql_transaction_participants`, and
   `sql_write_operations`) had a canonical leader owner/service gap.
2. That meant the system already had the right leader-gap vocabulary in query
   routing, but the mutation path was still degrading that shared state into
   generic distributed failures or repeated retries.
3. Repair implemented:
   - `ControlPlaneMutationReadiness` now owns one explicit
     transaction-control routing-gap defer classifier derived from the same
     canonical leader-gap routing snapshots.
   - `SQLQueryEngine` now canonicalizes retryable system-table INSERT/UPDATE/DELETE
     setup and execution failures through that owner before returning or
     persisting write-tracking results.
   - `CDCIntegrationService` now preserves that typed defer outcome instead of
     retrying it away after wrapping the routed SQL error.
4. Canonical effect:
   - transaction-control owner gaps now surface as one preserved
     `query_admission_deferred` owner outcome
   - routed system-table mutation callers stop mistaking
     owner-establishment lag for ordinary retryable participant failure
   - later consumers can make one explicit retry/defer decision from the
     shared contract instead of from timeout or retry side effects
5. Focused verification passed for:
   - `test/control-plane/control-plane-mutation-readiness.test.js`
   - `test/query/sql-query-engine.test.js`
   - `test/cdc/cdc-integration-service.test.js`

### 2026-04-14 Seven-Node Rerun After Mutation Contract

1. Reran:
   `seven-node-read-write-load-transaction-recovery`
   on `local-benchmark-7node.json`
   after the canonical mutation defer contract landed.
2. The old focused failure no longer reproduced:
   the scenario did not fail on
   `Timed out waiting for table split policies to become visible` and the
   earlier opaque `UPDATE tables SET table_policies ... lane control` timeout
   is no longer the package boundary.
3. The failure moved later and became structurally clearer:
   the run now times out on late convergence with over-target recovery
   partitions, especially:
   - `control_plane_publications-p1`
   - `replica_operations-p1`
   - `sql_transaction_participants-p1`
   - `sql_write_operations-p1`
4. The most useful evidence in the rerun bundle is:
   - repeated `would_exceed_target_replica_count` learner-promotion defers on
     late recovery partitions
   - repeated `Failed to update system table row` / `DISTRIBUTED_PARTICIPANT_FAILURE`
     for `nodes` updates
   - repeated `In-flight operation owner query indicates control-plane pressure`
   - authoritative discovery repair failures and diagnosed cache-visibility
     gaps during the same late window
5. That means the remaining unsolved boundary is now better named as:
   over-target recovery completion under control-plane authority pressure.
   It is no longer table-policy mutation visibility first.
6. The next bounded slice should therefore stay inside this package and focus
   on one completion contract for late recovery partitions:
   extra-voter creation, learner promotion, and remove-side completion must
   converge through one owner-visible state model instead of stalling behind
   repeated local retries and pressure-shaped side effects.

### 2026-04-15 Strict CDC Recovery-Routing Contract

1. The next late-stage seven-node failure after the leader-gap and priority
   recovery fixes was no longer plain "message-group leader unknown". The
   stronger reading was:
   strict CDC forwarding still failed closed as soon as the current
   message-group leader target disappeared, even when control-plane recovery
   routing still exposed a bounded remote recovery target or safe local
   system-table ingress.
2. That was the same owner-shape as the earlier fixes:
   - `getMetadataIngressReadiness(...)`
   - strict CDC forward-target selection
   - strict CDC apply-vs-forward execution
   were still sharing data, but not one canonical recovery-owned outcome.
3. Repair implemented:
   - `src/message-group/message-group-target-resolver.js` now exposes one
     ordered connected-candidate list for message-group forwarding instead of
     only a first-hit leader/forward target helper.
   - `src/message-group/message-group-forwarding-owner.js` now owns one
     explicit strict CDC recovery-routing contract,
     `MessageGroupStrictCdcRecoveryRouting`, derived from:
     - the strict system-table partition
       `controlPlaneRecoveryEligible` routing snapshot
     - ordered connected message-group forward candidates
     - bounded local system-table write availability
   - the owner emits one recovery-routing state:
     `none`, `remote_targets_available`, or `local_only`
   - `resolveCdcIngressDecision(...)` now keeps one ingress decision model for
     strict CDC:
     `forward_strict_target`
     `forward_strict_recovery_target`
     `local_strict_convergence_ingress`
     `local_strict_recovery_ingress`
     `defer_strict_target_unknown`
   - bootstrap/join propagation, metadata-ingress readiness, and direct
     strict CDC forwarding therefore reuse the same decision snapshot instead
     of treating leader-target loss as an immediate terminal defer
4. Recording decision:
   - update `architecture/current-owner-maps.md`
   - update `architecture.md`
   - keep `.kiro/steering/doctrine.md` unchanged in this slice because the
     existing doctrine already requires one owner, one normalized state
     model, and one canonical consumer-visible outcome
5. Focused verification passed for:
   - `test/message-group/message-group-target-resolver.test.js`
   - `test/message-group/message-group-service.test.js`
