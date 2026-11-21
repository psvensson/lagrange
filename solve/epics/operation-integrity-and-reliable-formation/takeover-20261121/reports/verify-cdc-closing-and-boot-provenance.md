# Verification: CDC plan-stamp closing commits, and the boot provenance cost

Independent read-only check, 2026-11-21. Nothing was executed on this machine
except light `git show` / `git diff` / `git grep` / `grep` reads. No tests ran.
VERIFIED = read in code or in a retained lab file. INFERRED = reasoned from
what was read.

## Check 1: `873570c54..5c412e839` on `work/cdc-currentness-stamp-20261121`

**Verdict: APPROVE-WITH-CONDITIONS** for merging
`5c412e83931fc871ae9a3f4e0afbfdb77a26ca2c`. The one condition is a static
gate I could not run (C1 below). No production defect was found.

Commits since the approved `873570c54` (VERIFIED, `git log`):
`ac0ed0193` (red witnesses), `4a1f3f11d` (repair), `8446194ab` and
`5c412e839` (two test router doubles).

### (a) The router refusal at `initialize` cannot fire in production

VERIFIED, line numbers at `5c412e839`.

- **One construction site.** `CDCGroupPropagationService` is constructed and
  initialized only in `src/bootstrap/shared/latency-topology-setup.js:97-109`.
  `initialize` has no other production caller, so there is no production
  re-initialization.
- **A missing router was already refused there.** The same function asserts
  `options.messageRouter` at `:45-48` (`MESSAGE_ROUTER_REQUIRED`). That file is
  unchanged since the pre-work base `23344cddc`, as is all of `src/bootstrap`
  and `src/transport`. A null router never reached the service in production,
  before or after.
- **Two callers of `LatencyTopologySetup.create`:**
  - seed: `src/bootstrap/owners/seed-runtime-bridge-owner.js:161-171`, router
    from `d.getMessageRouter()`;
  - joiner: `src/bootstrap/node-joining-publication-activation.js:682-691`,
    router from `this.messageRouter`.
- **Both routers are real `MessageRouter` instances.**
  - seed: `seed-infrastructure-phase.js:223-235` via `MessageRouterSetup.create`;
  - joiner: `connect-websocket-phase.js:221-252` via the same setup, with no
    router factory;
  - `message-router-setup.js:89-92` builds `new MessageRouter(options)` unless a
    `routerFactory` is supplied. In `src` the factory only comes from
    `BootstrapService` options (`bootstrap-service.js:191-193`). Its only
    suppliers are four test files, and each builds a real `MessageRouter`.
- **`deliver` is on the prototype.** `message-router.js:349` installs
  `message-router-delivery-delegation.js:61` on `MessageRouter.prototype` at
  module load. It is there whether or not the router has started its server,
  connected, or shut down.

So no construction order exists in which production wired a truthy router
without `deliver` and relied on `MESSAGE_ROUTER_UNAVAILABLE` at use. The
refusal is reachable only by doubles: two bootstrap tests did exactly that
(`service.messageRouter = {}`) and were given a `deliver`.

**The version-answer validation at wiring** also cannot fire in production:

| Source | Where | Answer |
| --- | --- | --- |
| `getTableMutationVersion` | `system-table-cache-observation-methods.js:172-175` | `Map.get(...) \|\| 0`, for a table of the static `SYSTEM_TABLES` list |
| `getRoutingGeneration` | `latency-tree-service.js:44,171,216` | integer counter from 0 |
| `getRevision` | `configuration-manager.js:115,124` | integer counter from 0 |

The four plan tables (`cdc-group-propagation-constants.js:12-17`) are system
tables.

**A wired router that later becomes undeliverable.** No behaviour change.

- The deleted `isMessageRouterDeliverable` also only checked that `deliver` is
  a function. A shut-down router was "deliverable" to the plan before as well.
- With a stopped router still referenced, the plan lists addressed targets and
  the failure surfaces at `router.deliver(...)` inside the durable wave, as
  before.
- In the cleanup paths the topology owners are stopped and dropped before the
  router is shut down: `seed-cleanup-handler.js:280-281,533-534` before
  `:415,673`; `join-cleanup-handler.js:614-615` inside `cleanup()` before
  `:777`. INFERRED from call order in those files; I did not trace every
  failure branch.
- A stopped service answers `PROPAGATION_STOPPED`
  (`cdc-group-propagation-service.js:186-189`), and the stamp holds the router
  identity.

### (b) Probe deletions: no row data, no optional structure

VERIFIED. I checked every deleted guard in the diff, not ten.

- **The guarded values are wired collaborators.** Each deleted `?.`, `typeof`
  or `|| []` in `cdc-group-propagation-routing.js` guarded
  `systemTableCache.get/getAll/filter` or `latencyTreeService.getRoutingOrder`.
  All four are in `REQUIRED_CAPABILITIES`
  (`cdc-group-propagation-collaborators.js:23-30`).
- **Row guards are kept**: `row?.[…]`, `serviceRow?.[…]`, `nodeRow?.[…]`,
  `mgRow?.leader_node_id`, `s?.[SERVICE_ID]?.startsWith?.(…)`.
- **The collaborators always answer arrays.**
  - `filter` and `getAll` build a new array
    (`system-table-cache-observation-methods.js:474-489`); the read-only
    wrapper forwards (`read-only-system-table-cache.js:60-71`).
  - `getRoutingOrder` returns `[]`, `[sourceGroupId]` or a copy
    (`latency-tree-service.js:199-208`).
  So the deleted `|| []` and `Array.isArray(rawOrder)` were dead.
- **`domain.groupIdsByLatencyGroupId` is always a `Map`.** Every `domain`
  comes from `collectKnownMessageGroupDomain` (`routing.js:237-291`, a
  `new Map()` at `:240`): through the `domain || collect…` defaults, through
  `buildGroupedContext` (`:702`), and in `cdc-propagation-progress.js:68`. The
  line above the deleted guard already called `domain.knownGroupIds.has`
  unguarded (`:318`).
- **`options` is always an object with a cache.** The production entries are:
  - `buildGroupedContext(owner, …)` with the service itself
    (`cdc-group-propagation-durable-plan.js:38`);
  - `buildSafeTargets({… latencyTreeService, systemTableCache})` (`:45-50`);
  - the object literal in `cdc-propagation-progress.js:63-67`.
- **`progress.cache` and `progress.owner`.** `createCdcPropagationProgress`
  takes `owner.systemTableCache` (`cdc-propagation-progress.js:143-146`). Its
  only production callers pass the service inside a wave
  (`cdc-group-propagation-durable-delivery.js:38-41`,
  `partition-cdc-obligation-progress.js:103` via `bindTopology`), after
  `ensureInitialized()`.
- **The tree is reached only with a tree.** `readRawRoutingOrder`
  (`routing.js:403-411`) is reached only from the two plan builders, which
  both carry `latencyTreeService`. The three functions the progress calls do
  not reach it.

### (c) Lab files

VERIFIED by sha, file and case.

| Run | Sha / host | Result |
| --- | --- | --- |
| `cdcstamp-c3a-red` | `ac0ed01932dc`, tv-dator | 75 tests, 67 pass, 8 fail: cases 2 and 4 (ruled selection bounds) and cases 68-73, the six new witnesses |
| `cdcstamp-final` | `5c412e83931fc871…` (`selection.json`), adam-laptop | cases 68-73 `ok`; 73 of 75 pass, only cases 2 and 4 fail; `cache-hydration-strictness` and `create-self-hosted-registration` `ok` |
| `cdcstamp-mutant-table-outside-list` | `0dcbc4d361ff` (parent `873570c54`; adds a `getAll(TABLES.INTER_GROUP_LATENCIES)` read in routing) | 69 tests, 3 fail: cases 2, 4, and case 68 "the plan reads system tables only through CDC_PROPAGATION_PLAN_TABLE" with "the safe plan read inter_group_latencies (getAll) outside …" |
| `cdcstamp-c3c-router-census` | `8446194ab6c1` | 22 files, 20 ok, 2 not ok; no "refused wiring" line |
| `cdcstamp-census-base` | `23344cddc5f0` | the same two files fail in the same cases |

The two census failures, identical at both shas:
- `growth-promote-authoritative-completion-and-progress` case 7, sub-assertions
  40 and 42;
- `node-joining-service-message-group-activation` case 3, "Failed to register
  node: … outcome is not known".

Not independently verified: that the 22 files are *every* remaining router
double without `deliver`.

`cdcstamp-c3c` (43 files, `8446194ab6c1`): three files fail. They are the
witness file (cases 2 and 4 only), `create-self-hosted-registration` (fixed by
`5c412e839`) and the foreground-boundary first case. All four direct test
importers of the routing module were in this run.

### Condition and observations

- **C1 (condition, not run here).** The navigability ratchet baselines still
  list `src/topology/cdc-group-propagation-routing.js` and were not touched on
  the branch (only `global-owner-debt-inventory/inventory.json` changed outside
  `src` and `test`):
  - `scripts/check-guideline-navigability-baseline-owner_port_feature_detection.json:17269-17296` (4 entries);
  - `…-typeof_dual_paths.json:5056`;
  - `…-two_source_fallback_reads.json:13948`;
  - `scripts/checks/code-navigability-fallback-classification.json:34712-34731`.

  The probes those entries describe are deleted. Run the static ratchet
  checks at the head on a lab host before landing, and tighten if the checker
  prints the hint.
- **O1.** Wiring validates that the capabilities exist and that versions are
  integers, not that `getAll`/`filter`/`getRoutingOrder` answer arrays. The
  production classes always do. A double that answers `null` now throws in the
  plan build.
- **O2.** `resolveLatencyGroupRecipients` (`routing.js:340-343`) is exported
  with no production caller, and its `options = {}` default now throws. The
  other `options = {}` defaults in the file are equally misleading now.
- **O3.** `routerDeliverable = options.messageRouter !== null`
  (`routing.js:676`) treats `undefined` as deliverable. It is safe only because
  the service normalizes to `null` (`cdc-group-propagation-service.js:49`) and
  is the only caller.
- **O4.** `cdc-group-propagation-foreground-boundary` case 1 still times out
  under parallel load at `8446194ab`. It is pre-existing (paired at
  `8abec5e92`, record 20.6) and was not rerun at the final head. Its cause is
  the cost in check 2.

## Check 2: the first `runtimeBuildProvenance()` call

Code read at `23344cddc`.

### (a) Callers, and when the first call happens on a real node

VERIFIED.

| Caller | Context |
| --- | --- |
| `src/entrypoint-runtime-provenance.js:44` | `resolveBootSourceProvenance`, called by `logBootProvenance` (`lagrange-runtime-startup.js:655-656`), awaited in `acquireLagrangeRuntime` (`:727-731`) |
| `src/bootstrap/seed-original-allocation-startup.js:90` | `buildDigest` of the original allocation |
| `src/bootstrap/bootstrap-service-seed-workflow.js:290` | seed participant cohort release |
| `src/node/replica-handler-release-recovery.js:217,278` | cutover `targetBuildDigest`; fresh-create release |
| `src/partition/partition-participant-transaction-pause.js:138` | participant release facts |
| `scripts/participant-release-completion-audit.js:120,157` | audit script |

**On a real node the first call is at process boot, before the node serves
anything.** `acquireLagrangeRuntime` awaits `logBootProvenance` after the data
directory owner and the HLC clock exist, and before `startJoinNode` /
`startSeedNode` (`lagrange-runtime-startup.js:748-760`). At that point there
is no transport, no consensus and no bootstrap phase. Every later caller gets
the already-settled promise.

**The lazy first call through `readParticipantReleaseFacts` is a test-process
case.** The writer measured a process that never runs the entrypoint. There
the first reader pays.

**The entrypoint also walks `src/` a second time.**
`resolveBootSourceProvenance` first runs `computeSourceFingerprint(sourceDir)`
(`entrypoint-runtime-provenance.js:35`), separately from the measurement and
not memoized. It is called once. The writer's 3.1 s does not include it.

### (b) Main event loop or threads

VERIFIED from code; durations not measured here.

- **File I/O is on the libuv pool.** All of it is `node:fs/promises`
  (`realpath`, `readdir`, `stat`, `readFile`), awaited one call at a time
  (`runtime-content-fingerprint.js:17-41`). The loop is not blocked while a
  read is pending, and the main thread gets thousands of short turns.
- **Hashing is synchronous on the main thread:**
  - `computeContentRecordsFingerprint` (`source-fingerprint.js:100-110`) runs
    one uninterrupted loop over every record, once for source and once for all
    dependency files;
  - `digestFile` (`runtime-build-provenance.js:28-30`) hashes the whole
    executable buffer in one `update` call, about 125 MB in one block.
- **Every file body is held in memory until its set is hashed.** The records
  keep each `Buffer`, and the executable is one more 125 MB buffer.
- INFERRED: CPU above wall comes from pool threads and GC helpers overlapping
  the main thread. Under a 1-CPU limit they all draw on the node's one CPU.

### (c) Once per process

VERIFIED. `bootMeasurement ??= measureBoot()`
(`runtime-build-provenance.js:26,88-91`) is a module-level promise memo.

- Concurrent callers share one measurement.
- A failure is memoized as `UNAVAILABLE` for the life of the process.
- It is not per partition service or per incarnation, and an in-process
  rejoin does not repeat it.
- The release path uses no worker thread or forked process that imports it
  (`new Worker` exists only in `src/runtime/wasi-component-*`; `fork` only in
  the coordinator merge process).
- A node process restart inside a formation pays it again, at that boot,
  before the node serves.

### (d) Evidence from the retained real-cluster seed profile

VERIFIED by name search only; no durations extracted.

- **Chunk 0** (`seed-main-thread-0.cpuprofile`, 13.5 MB) contains call-tree
  nodes for `logBootProvenance`, `resolveBootSourceProvenance`,
  `computeSourceFingerprint`, `runtimeBuildProvenance`, `measureBoot`,
  `measureRuntimeContent`, `productionDependencyRecords`, `contentRecords`,
  `computeContentRecordsFingerprint`, `updateHashWithRecord`, `digestFile`,
  `sqliteFacts` and `verifyRaftRsBinding`.
- **Chunk 1** contains none of them. Chunks 2-10 were not searched.
- This matches the entrypoint order: the profile window starts at
  `lagrange-runtime-startup.js:696`, before `logBootProvenance`.
- The node took the source-tree path (`measureRuntimeContent`), so the image
  runs `src/index.js` with `node_modules`, not a bundle.

Timing context:

- The seed container was at 1 CPU and 1 GiB (`docker-limits.log`:
  `NanoCpus=1000000000`, `Memory=1073741824`).
- `derived/profile-windows.json` starts the profile at 13:17:00Z. The poll
  "formation+100.275 s" is at 13:19:44.937Z, so the formation clock starts
  near 13:18:04.7Z (INFERRED from those two values).
- The joiner containers were first sampled at 13:17:33Z and 13:17:38Z
  (`docker-limits.log` on the other two VMs).
- The image manifest lists about 5,700 `node_modules` paths and about 2,300
  `src/` paths.

### (e) What it protects, and the options

**Use** (VERIFIED). The digest is the build identity of the release fence:

- the original allocation's `buildDigest`;
- the participant cutover's `targetBuildDigest`;
- `buildDigest` in the participant release facts;
- the refusal when the build is not measured.

The module's stated rule is that these facts are measured from the bytes that
run; "requests and environment values can compare with them, never supply
them" (`runtime-build-provenance.js:1-2`).

**Options** (no code proposed):

1. **Read the digest from a file written at image build.**
   - It removes almost all the cost.
   - It must preserve that the digest identifies the bytes actually running. A
     file can be stale or edited, so something must still bind it to the image
     (an image digest, a read-only layer, or a cheap spot check).
   - The packaged path already trusts a manifest for `sourceDigest`
     (`runtime-build-provenance.js:57-64`) while still measuring dependencies,
     the artifact and the executable. This would extend that trust.
2. **Keep measuring, before the node serves.** This is already what a real
   node does. What remains is the cost itself:
   - the second `src/` walk;
   - every body held in memory;
   - the one-block 125 MB hash;
   - the strictly sequential file reads.

   Reducing those changes no meaning, provided the same bytes enter the same
   digest in the same order.
3. **Tests only.** Test processes that skip the entrypoint pay it in whichever
   case first reads the release facts. A fixture could pay it before the first
   timed case; the foreground-boundary budget would not need raising.

### Estimate of the effect on a 1-CPU node

INFERRED, rough.

- **Per node boot:** at least the 4.4 CPU-seconds measured on adam-laptop,
  since one CPU serializes the threads. Add the unmeasured second `src/` walk.
  On a slower cloud core, roughly 5 to 12 s of boot.
- **In the 420 s formation bound: about zero in this run.** All three
  containers were up 27 to 65 s before the inferred formation clock start, so
  the measurement had finished before the clock ran. It does not explain 427 s
  against 420 s.
- **Consensus heartbeats:** not affected. The node has no transport or
  consensus yet when it measures.
- **Where it would count:** a node process that restarts inside the formation
  window returns roughly 5 to 12 s later than it otherwise would.
- **Memory:** a transient peak of a few hundred MB of buffers at boot, inside
  a 1 GiB limit. Not measured.
