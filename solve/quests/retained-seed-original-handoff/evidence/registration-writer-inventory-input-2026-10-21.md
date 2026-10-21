---
audience: development
documentClass: current
---

# Seed registration and writer activation inventory

Date: 2026-10-21. Author: subagent physical_custody_review.
Product examined: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Primary evidence HEAD at intake: `5a04a798fee867c582a7a8c20e2eed8442baff2c`;
source diff against393 was empty. This additive note is a pre-source design
input for retained-seed-original-handoff, not product/native approval or a
change to a seal. No tests, source, receipt, index or branch changed here.
The new unit's writer owns its isolated Quest and witness.

Inputs: original-handoff draft SHA256
`8be35255d43d3319ef6e002216c46fbe146973842bf7206a0b5a14728857d3b9`
and the adjacent independent-contract-review. Their permission extends to
red sealing/public witness preparation, not unrestricted implementation.
UNUSED/SUBMITTED/TRANSFERRED below are proposed rights;393 has no such fields.

## Decision the inventory settles

**All SERVICES and cluster-ID rights UNUSED cannot imply all metadata absent.**
The current seed registration owner writes MESSAGE_GROUPS first, before the
first SERVICES INSERT. Native lifecycle, membership, release origins and CDC
obligations can already exist. Birth rights must be consumed at each exact
actual submission, not merely when a surrounding phase reports completion.

Sequential registration is not a transaction across tables or replicas.
A thrown/lost answer does not undo earlier commits. Reentering the broad
registration phase can overwrite metadata through INSERT OR REPLACE, activate
SERVICES rows, or mint identity; none follows from an original-allocation grant
alone. The nonserving exact handoff must select only its reviewed owner effects
and must not run ordinary cache/control-plane/runtime finalization as a shortcut.

## Actual order and independent admission gates

`src/bootstrap/pipeline/seed-startup-plan.js:11-56` orders infrastructure,
message groups, partitions, then registration (first acquire CDC/state machine,
SQL, handler, release all seed participant cohorts, finally registration), then
cache hydration. `bootstrap-service-seed-workflow.js:333-478` adds
CONTROL_PLANE_READY, RUNTIME_READY and FINALIZED checkpoints. Those checkpoints
are workflow observations; they do not prove atomic absence or durable rollback.

The infrastructure router is created with externalAdmissionEnabled=false
(`phases/seed-infrastructure-phase.js:205-219`), but self-routing remains
available. `bootstrap-service-seed-workflow.js:463` opens remote transport in
RUNTIME_READY, before FINALIZED activates periodic ordinary writers. In contrast,
public BootstrapAPI is already listening before bootstrap begins
(`src/lagrange-runtime-startup.js:437-465`). These are different boundaries;
HTTP admission is not fenced by the router boolean. See the preceding public
handoff feasibility note for the explicit recovery-only public gate needed.

## Durable mutation spine and lost-answer ceiling

All registration writer calls below flow through the existing
`BootstrapSystemTableWriter` (`src/bootstrap/system-table-writer.js:14-55`)
and CDC mutation owner. Upsert is literally INSERT OR REPLACE
(`src/cdc/cdc-integration-service-mutations.js:165-219`); SERVICES upsert is
explicitly forbidden at :167-170. Generic upsert checks success then waits for
visibility (:220-258); bootstrap-mode cache waits return early
(`cdc-integration-service-cache-visibility-wait.js:122-127`). A fulfilled cache
wait is not independent durable application evidence.

Bootstrap SQL chooses the local target and prefers executeQuery
(`src/cdc/cdc-bootstrap-direct-sql.js:47-151`). Its code also attempts the
executeLocalQuery lane after a failed/throwing Raft lane (:152-175). This note
does not certify that branch is reachable or admitted for these writes.
`src/partition/partition-service-write-metrics-base.js:60-130,416-430,621-650`
passes normal mutations through statement admission and the existing committed
write owner; executeLocalQuery at :157-174 has its separate LOCAL admission.
The proof for a repaired handoff must observe the actual selected lane and its
native committed application. Do not equate method invocation, timeout, cache
projection, or generic success logging with that proof, or manufacture a new
entry ID after an unknown original write.

Normal durable application belongs to the existing partition/Raft committed
write and SQLite owner. The registration caller does not add a cross-row commit
point or undo. Individual rows can therefore survive a phase failure. The
following inventory distinguishes actual caller readback from assumptions; it
is not a new claim that every existing retry is fully safe under cold restart.

## Seed registration mutations (complete phase call census)

All line references in this table are current393. `registration` abbreviates
`src/bootstrap/phases/seed-registration-phase.js`.

| Ordered action / exact owner | Actual write and durable boundary | Lost-answer/restart behavior at this caller | Phase/gate and relation to UNUSED |
| --- | --- | --- | --- |
| MESSAGE_GROUPS declaration; SeedRegistrationPhase.registerMessageGroup | One group_id row, replica-count declaration, leader node, policy/timestamps, generic upsert through mutation spine | Catch/rethrow only; no exact prior-intent readback; replay can replace fields/timestamps | registration:164-201, invoked first:121. Can commit while every proposed SERVICES/cluster-ID right is UNUSED |
| MG SERVICES births; MessageGroupServiceRowOwner | Sequential STOPPED INSERT per MG replica with generated birth identity | registerReplica:427-459 observes non-applied return through registration resolver; thrown INSERT is not caught there. No cross-cohort rollback. New durable grant/generation comparison is still needed | registration:226-268. Proposed right must become SUBMITTED before each INSERT; later peers can remain UNUSED after earlier commits |
| Partition SERVICES births; PartitionServiceRowOwner | Sequential STOPPED INSERT per partition replica; exact state owner owns lifecycle | row-owner:280-320 catches INSERT exception and authoritatively observes on non-applied/unknown; matching currently uses logical fields and any safe created_at (:105-162), not the proposed exact reserved generation/attempt token | registration:270-294. All UNUSED excludes these sends only if the new boundary consumes rights correctly; no inference from an empty cache |
| Partition canonical leadership side effect; PartitionServiceRowOwner.publishCanonicalLeaderNodeId | After an applied SERVICES INSERT, update PARTITIONS.leader_node_id for a leader; distinct mutation | row-owner:259-277,317-318. Leader-publication failure can follow successful SERVICES birth. Caller failure does not erase that birth | Occurs inside registerServices, before ordinary TABLES/PARTITIONS seed rows at registration:400+. A missing target can yield no update; no atomic SERVICES+PARTITIONS claim |
| Partition ACTIVE transition; activatePartitionServiceRows / lifecycle lane | Existing row-owner/lifecycle transition from STOPPED to ACTIVE, bound to exact registered handler; possible leader/role reassertion | activation helper retains transient failures via supplied onDeferredActivation, does not undo prior births; actual admission and row generation remain separate | registration:296-317. Runs before meta definitions, TABLES and CONFIG. Do not invoke this wholesale in a STOPPED-only nonserving transfer |
| Built-in SERVICE_DEFINITIONS; shared meta registration owner | sys-wasm-meta, sys-admin-meta, sys-postgres-wire serialized rows, sequential generic upserts | shared/meta-service-definition-registration.js:85-103 has no transaction/readback across definitions; partial rows survive | registration:329-341, after registerServices returns, before cluster-ID publication |
| Built-in SERVICE_ENDPOINTS; same shared owner plus endpoint incarnation authority | sys-wasm-meta and sys-admin-meta endpoints only; incarnation-stamped sequential upserts. Postgres wire endpoint deliberately excluded | meta helper:120-136; registration:342-358. Comment assumes virgin rows. Cache projection at :374-392 is best effort and not a commit; replay cannot rely on virgin assumption | Before TABLES/CONFIG and external transport admission. No new grant to overwrite a later endpoint incarnation |
| TABLES declarations; SeedRegistrationPhase | Per schema TABLES upsert including schema, partition_count=1, active version1 and transition fields reset to null | registration:405-435. Catch/rethrow; no exact-field preservation against an already evolved table | After SERVICES/meta, before each corresponding PARTITIONS row. Blind restart can replace a prior declared transition; original grant does not authorize that |
| PARTITIONS declarations; SeedRegistrationPhase | Per schema PARTITIONS upsert including version1, configured replica count, size0, leader=self, NORMAL | registration:437-465. Each follows its TABLES write; either half can have committed alone | Before CONFIG identity. Existing-row/lineage checks are prerequisites for any replay, not permission from UNUSED cluster right |
| Partition size; SeedRegistrationPhase + partition size observer | One UPDATE per unique partition with measured size and fresh updated_at | registration:476-517. Sequential, throws after earlier updates; no phase transaction/readback here | Follows TABLES/PARTITIONS seeds; still before cluster-ID right is consumed |
| CONFIG defaults; DynamicConfigService through canonical gateway | registration invokes seedConfiguration; actual implementation inserts each CONFIG_DEFINITIONS key with ignoreExisting:true, not unconditional replacement | dynamic-config-service.js:141-210 classifies applied vs skipped. Phase's preliminary COUNT at registration:533-557 skips all defaults if any CONFIG row exists; partial nonempty does not prove defaults complete | registration:529-591. Actual implementation ignores old skipExistingCheck/useDirectCdcMutations flags. Can partly commit before epoch/ID; do not infer all CONFIG absent from unused ID right |
| CONFIG assignment epoch; SeedRegistrationPhase / AssignmentEpochManager | If no observed epoch, generic upsert current serialized epoch | registration:597-636 checks successful nonempty query; no leader/non-proving result can proceed to write. Prior phase builds/restores in-memory epoch (seed-partitions-phase:694-733); that construction is not CONFIG publication | After defaults, before cluster-ID. Preserve existing epoch; original allocation does not grant epoch reset |
| CONFIG cluster identity; existing first-seed mint/publication responsibility | Current persistClusterIdIfMissing mints randomUUID and generic upsert after non-proving absence | registration:646-678 checks row existence, not value; missing leader/unsuccessful read can reach mint. Must be replaced in new unit by reserved identity + typed authoritative read/INSERT/readback contract | Last registration action:128. Earlier metadata may be complete despite UNUSED ID right; unknown or existing foreign ID never permits remint |

Registration readiness at :73-82,153-156 explicitly waits for PARTITIONS,
SERVICES, TABLES and MESSAGE_GROUPS leaders. CONFIG and meta-table leader
availability still belongs to their actual mutation/read owner. Do not turn
the four-table early gate into proof every later write was executable or safe.

## Pre-registration activity while all proposed rights remain UNUSED

- Public startup already reserves boot incarnation and obtains directory/process
  custody before constructing seed runtime. Original-grant persistence would
  add existing lifecycle-owned durable preparation, not a metadata-empty flag.
- Infrastructure starts the unified ServiceReconciler
  (`src/bootstrap/shared/startup-service-lifecycle-owner.js:20-74`) and explicitly
  triggers it (`seed-infrastructure-phase.js:193-196`). Its seed desired/actual
  catalogs drive real MG/partition lifecycle through existing adapters. This is
  an internal physical-progress owner, not the later placement coordinator.
- MG/partition constructors open native stores and election/reconstruction
  (`seed-message-groups-phase.js:153-189`, `seed-partitions-phase.js:250-300,
  327-350`). Native lifecycle/history, membership and durable release origins
  are real pre-SERVICES effects. The registration phase waits behind participant
  release, so the known release-expiry cut precedes its MESSAGE_GROUPS upsert;
  the broader all-rights-UNUSED extent also includes the later gap after that
  upsert but before the first SERVICES submission.
- Partition role/leader publication is event-driven, not protected by the
  final periodic-writer start. `partition-service-metadata-delivery-methods.js:
  26-38` queues it. Local leader seeding at :56-73 only updates an existing
  cache row and is not durable authority. Mutation helpers target SERVICES and
  PARTITIONS UPDATEs with current row guards/readback
  (`partition-service-metadata-mutation-helpers.js:199-255,285-345`). In the
  genuinely empty case these are not INSERT authorities; in a nonempty case,
  existing observed rows must be treated as evidence, not erased by the grant.
- Pre-release SQL acquisition sets migrationAutoWire=false and
  autoStartDistributedTransactionRecovery=false
  (`owners/seed-runtime-bridge-owner.js:46-65`). The acquired handler is distinct
  from initializeReplicaHandler's startup scan
  (`bootstrap-service-replica-registration-methods.js:290-299`). Preserve this
  split: acquisition needed for release is not authorization to activate every
  ordinary handler/recovery writer.
- BootstrapAPI initialize starts its assignment-reservation sweep as well as
  the listener (`bootstrap-api-server-methods.js:34-66`). An empty initial
  reservation map is not a durable absence proof. The recovery-only gate must
  prohibit new public admissions independently; the sweep is not a seed
  registration transaction.

For a prospectively correct consume-before-send implementation, **all SERVICES
rights UNUSED** excludes this allocation's later SERVICES INSERTs and the
normal serial continuation that follows them. It does not establish that
MESSAGE_GROUPS/native/boot metadata is absent, that other identities never
wrote, or that current cached absence is authoritative. **Cluster-ID UNUSED
alone** excludes only that exact ID submission and permits every earlier
registration prefix. Existing393 does not implement either implication.

## Ordinary writer activation and later node publication

| Startup step | Existing activated owner/effect | Actual gating and lost-answer/custody consequence |
| --- | --- | --- |
| CACHE_HYDRATION | Reads local partitions, installs cache/CDC subscriptions, starts latency tree + CDC propagation, upgrades CDC routing and wires migration workflows | seed-cache-hydration-phase:130-209,216-274; seed-runtime-bridge-owner:146-171 starts tree/CDC immediately, before final topology start. These may replay already committed metadata; they are not evidence that registration is absent |
| CONTROL_PLANE_READY, initializeReplicaHandler | Ordinary retained CREATE scan/replica operations and release observation; registers hosted replicas | seed-workflow:415-423; replica-registration-methods:297 onward. Beyond mere pre-release handler acquisition. Must not accidentally resume unrelated retained operations under original-grant authority |
| CONTROL_PLANE_READY, ControlPlaneSetup.create | Rebalance coordinator listeners/timeouts/failed-create cleanup recovery; membership publication driver; SWIM; dispatch listeners and cached retry queues | control-plane-setup:337-361,469-476,531-556. Coordinator initialize at rebalance-coordinator-lifecycle:598-629 starts timeout checking and cleanup recovery; :681-700 reconciles timeouts/orphans/MG debt. Membership driver starts unconditionally and self-gates on current control-publications write leadership. Dispatch initialize at replica-dispatch-service-lifecycle:278-348 subscribes cache/readiness and enqueues existing ready-node/operation retries. These start before external transport opens; they are not all deferred by FINALIZED |
| CONTROL_PLANE_READY, seed NODES budget registration | NodeStorageBudgetSetup -> NodeStorageBudgetService -> node-registration incarnation owner writes JOINING birth or advances older incarnation | bootstrap-service-control-plane-runtime-methods:253-303; node-storage-budget-service:245-270 uses authoritative observe/INSERT/CAS, refuses newer incarnation. No generic NODES replacement. Unknown read/write stays with that owner; row can survive failed later heartbeat |
| CONTROL_PLANE_READY, initial heartbeat | HeartbeatService -> nodeLifecyclePublication; NODE_ENDPOINTS through endpoint incarnation owner | control-plane-runtime-methods:305-318; heartbeat-service-publication-methods:94-152,295-324,395-414. Initial heartbeat is explicit before periodic start; local readiness controls READY promotion; endpoint write/readback protects incarnation. Failure does not erase previously registered NODES/endpoint rows |
| CONTROL_PLANE_READY, MG ACTIVE | Exact MG row activation after endpoint publication and lifecycle-handler checks | seed-workflow:446; bootstrap-service-runtime-methods:44-83; message-group-service-row-owner:464-483. Separate from earlier STOPPED birth. A nonserving handoff must not silently count this as permitted |
| RUNTIME_READY | Guarded runtime-service handler, desired service placement attachment, then external MessageRouter admission opens | seed-workflow:456-464; control-plane-runtime-methods:134-161. Runtime-backed service definitions can now cause native/runtime placement and later endpoints. Not part of a STOPPED metadata transfer |
| FINALIZED | phase COMPLETE; SQL runtime handoff; periodic lease + heartbeat activation; distributed transaction recovery; full latency topology lifecycle | seed-workflow:216-241. startup-runtime-handoff-owner:133-185 waits publication readiness, starts lease/heartbeat and transaction recovery; retry owner retains defer. Lease initialize alone is inert (lease-service:221-235), start arms sweeps (:241-271). Endpoint initialize is inert (:57-73). Do not confuse these two inert constructors with the already-active coordinator/membership/dispatch owners |
| Deferred full latency start | Latency measurement, group assignment, tree and CDC propagation | seed-workflow:182-214; latency-topology-setup:126-139. Deferred scheduling checks shutdown; cleanup must cancel/drain existing owned work, not discard an already committed metadata obligation |
| Public startSeedNode after bootstrap return | Additional SQL/application runtime composition; dynamic config wiring; admin server; periodic hints; logs persistence | lagrange-runtime-startup:511-601. Dynamic config wiring failure is warned/returns null (entrypoint-runtime-shutdown-lifecycle:164-172); admin starts actual server (entrypoint-runtime-admin-composition:564-604); hints are best effort local persistence; logs attach only through readiness (shutdown-lifecycle:98-112). These are later steady-state paths, not prerequisites to nonserving exact handoff |

Rows in this activation table identify *writer capability and actual startup
invocation*, not a claim every writer committed on every fresh boot. Each owner
still has its own readiness, leadership, incarnation, authoritative-row and
pressure guards. Conversely, a deferred heartbeat/lease pair does not imply all
other writers are inactive. Successful startup ordering is not an authorization
for running these owners in a new recovery-only mode.

## Required decisions for the new bounded handoff

1. Explicitly permit/retain the pre-SERVICES MESSAGE_GROUPS declaration as its
   own existing-owner effect, with an exact existing-row/conflict policy. A
   claim that all metadata must be absent at the known failure cut should name
   that *specific pre-phaseRegistration cut*, not broaden to all UNUSED states.
   Test the gap after actual MESSAGE_GROUPS commit and before SERVICES send.
2. Enumerate exactly which registration prerequisites the nonserving transfer
   needs. Do not replay phaseRegistration wholesale: it activates partitions,
   publishes meta endpoints, overwrites table/partition declarations and seeds
   CONFIG independently. Existing compatible metadata is not proof all those
   replacements are permitted. Any needed effect gets its own owner-correlated
   identity/readback policy; unused SERVICES/ID rights do not grant them.
3. Stop before CACHE_HYDRATION/CONTROL_PLANE_READY/RUNTIME_READY/FINALIZED unless
   a specific existing owner is proven necessary and admitted as part of the
   reviewed interaction. Do not construct ControlPlaneSetup merely to access
   one helper: it starts ordinary membership/recovery/dispatch activity.
   Preserve the pre-release SQL/release-handler construction that is already
   deliberately separated from ordinary initialization.
4. Existing role/leader publication and CDC replay needed for internal recovery
   remain under their own current authority. The unit must show they cannot
   promote missing original creation permission, create unrelated rows, or open
   public serving; it must not disable the very internal path that restores
   authorized release/registration evidence.
5. Lost-answer proof must include real native commit and same-live exact-row
   resolution for SERVICES/CONFIG, plus retained partial metadata prefixes.
   Generic upsert replay, successful cache projection, process-local registration
   evidence and a checkpoint are insufficient. Cold SUBMITTED remains the
   explicitly unresolved extent; retain all native/metadata obligations through
   orderly cleanup, not rollback-by-deletion.
6. Observe no ordinary node membership/READY/endpoint/placement/background
   writer activation before the bounded result. Assert public gate closure
   while real internal mutations commit. The typed handoff-complete result
   follows exact cleanup; it does not call ordinary bootstrap completion.

This census covers direct seed registration calls and startup activation sites,
with the source-bound transitive mutation spine and key autonomous writers.
It is not an exhaustive runtime trace of every Raft/WASM/SQL suboperation and
must not be presented as a physical absence proof. Independent frozen source
review and the new unit's real public positive/negative witnesses remain required.
