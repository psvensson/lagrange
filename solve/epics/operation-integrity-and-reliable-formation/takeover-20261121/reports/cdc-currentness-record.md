# CDC currentness check: contract-first transition record (stage 1)

Repair: evaluate the CDC delivery currentness check against a change stamp
instead of recomputing the propagation plan and the operational selection on
every budget read. Stage 1 = this record plus executed red witnesses. No `src/`
change was made.

| Item | Value |
| --- | --- |
| Worktree / branch | `/mnt/data/peter/projects/.worktrees/cdc-currentness-stamp-20261121`, `work/cdc-currentness-stamp-20261121` |
| Base | `23344cddc5f07a597b93f8cd0f4f69a69be937c3` |
| Witness commit (pushed) | `29f2fab7f2647f2022b41f5993f0725a721752dc` |
| Witness file | `test/partition/partition-cdc-currentness-stamp-witness.test.js` |
| Lab run | see section 12 |
| Instruction sources loaded | `CLAUDE.md`; `docs/steering/rules.md` (R03, R05, R10, R11, R12, R19 and the rest); `architecture/contracts/authority-and-recovery.md`; `docs/steering/workflow-guidelines/solver-quests.md` (contract-first checklist); `test/guidelines/INDEX.md`, `fixtures.md`, `regression-policy.md` |
| Source of the defect | `reports/idle-raft-cpu-cost.md` sections 2, 5, 7(f) |

Labels: **VERIFIED** = read in source at the base, or executed on the lab
(section 12). **INFERRED** = my reading, not executed.

## 1. Claim boundary

This is a bounded repair of one owner path: the cost of the CDC delivery
currentness check. Its acceptance is the counting witness (section 12) going
green with every negative case still green. It does not claim the three-node
formation acceptance; that milestone stays red until its own run shows it.

## 2. Why the check exists (history, quoted)

`git log --oneline -8 -- src/cdc/cdc-delivery-invocation.js` at the base:

```
8803e617e cdc-propagation-node-slot-removal: The CDC group propagation service ad…   (2026-11-14)
cbcc131ab wip: temporary commit for clean docker image reuse during 3-run verification
f8a16904f fix(rebalancer,admin,cdc): complete operation visibility, startup inFlightCount, and CDC continuation scheduling credit
d1a099aaf WIP: Harden CDC causal confirmation, storage-budget CAS ownership, and seed READY publication
54dd2d7ce feat(release): 0.2.6 raft-rs cutover, SN1 snapshots, TX1 transactions, FreshMG, and deterministic SQL admission
```

`git log -S` on the three load-bearing symbols (`scopeCdcDeliveryInvocation`,
`topologyBindingCurrent`, `getCDCPropagationService`) finds only the 0.2.6
squash `54dd2d7ce`. The design came from quest `retained-seed-original-handoff`
(epic `raft-rs-full-cutover`), in the MG source-occurrence delivery work of
2026-10-23. The two review findings that made the check re-observe the plan and
the selection on every check are in
`solve/quests/retained-seed-original-handoff/evidence/REVIEW-mg-delivery-root-source-r1-2026-10-23.md`:

> **R2 — The new selected-service fence asks a different selection policy.**
> "The actual delivery selects through resolveOperationalMessageGroupSelectionAsync
> with preferredService and reuseCapturedIngress. The new currentness getter
> passes those same options to the synchronous selector, but that owner does
> not consume either option. [...] Consume one selection owner's exact
> binding/currentness decision, preserving its approved captured-ingress policy.
> Do not repair this by weakening service identity checks, accepting equal
> group text, or making a second selection algorithm in the progress helper."

> **R3 — Covered branches bypass route and requirement invalidation.**
> "A branch can therefore obtain complete provisional coverage in attempt one,
> while another responsible subscriber remains uncovered. Change the first
> branch's observed route or authoritative requirement population before attempt
> two. The first branch is skipped, so neither its targets nor its aggregate
> coverage is refreshed. When the second branch completes, the source can
> release the scan using obsolete weak coverage. [...] Add an owned
> requirement/route observation for all captured branches, including skipped
> ones [...]. Preserve the captured union on mere projection omission; do not use
> an unrelated cache update as a reason to restart all progress."

The approving re-review
(`REVIEW-mg-delivery-root-selection-topology-r2-2026-10-23.md`) records the fix
in these words: "`cdcPropagationProgressCurrent` now observes that plan before
reuse [...]. `topologyBindingCurrent` refreshes even a previously covered branch
[...]. Cache/tree/router object replacement and topology initialization lifetime
also fence reuse; **no global cache revision restarts otherwise stable
progress**." The last clause matters for the stamp. A stamp that only triggers
re-observation, and never resets coverage, keeps that ruling. A stamp that
discarded progress on any cache change would break it.

So the check exists to stop obsolete route or requirement coverage from
releasing source debt (R3), and to stop an object that is not the selected
owner from carrying the source binding (R2). Nothing in either finding asks for
the re-observation to happen on *every budget read*. Per-read evaluation is how
the fix was placed (inside `assertCurrent`), not a requirement the findings set.

## 3. Corrections to the causal report (VERIFIED)

1. **The raft status read is not `owner.isLeader`.** On the partition service
   `isLeader` is a plain field (`partition-service-core-base.js:221`, written by
   `replica-leadership-state.js:62-104`). The raft status read happens through
   `topologyBindingCurrent` → `branch.original.getCDCPropagationService()`
   (`partition-cdc-obligation-progress.js:39-40`). That is the subscriber's sync
   selection (`partition-cdc-propagation-subscriber.js:283-284`), which reaches
   the bootstrap selection owner (`bootstrap-message-group-selection-owner.js:18-23`)
   and then `resolveOperationalMessageGroupSelection`
   (`message-group-selection.js:308-351`) → `selectOperationalLeader` (:292-306).
   For a local MG replica whose published role is leader it calls
   `getMetadataIngressReadiness` (`message-group-forwarding-owner.js:425-435`) →
   `isCurrentRaftLeader()` (`message-group-service-leadership-state-runtime-methods.js:35-38`)
   → `readCoreStatus` → `service.raft.readStatus()` (:9-12). That is one raft
   status read per evaluation, executed in the selection anchor (section 12).
2. **The check is not read-only.** Each evaluation has side effects the stamp
   must keep (section 7):
   - `cdcPropagationProgressCurrent` calls `refreshCdcPropagationRoutes`
     (`cdc-propagation-progress.js:153`), which can add leaves, replace routes,
     drop pre-activation leaves and discard provisional coverage.
   - `topologyBindingCurrent` resets the branch tag (`partition-cdc-obligation-progress.js:36-38`).
   - `captureDurablePropagationPlan` calls `owner.refreshConfig()`
     (`cdc-group-propagation-durable-plan.js:15`), which writes the
     publication-mode diagnostics (`cdc-group-propagation-service.js:221-242`).
3. **The multiplier is larger than "three per read".** The check nests
   (section 4). One transport `remaining()` evaluates the full check six times,
   not three. A progress-bound read adds a second plan rebuild of its own.

## 4. The check today: who calls it, how often (VERIFIED)

### 4.1 The layered predicate

| Layer | Defined at | Evaluates | Plan rebuild / selection per call |
| --- | --- | --- | --- |
| Root invocation `assertCurrent` | `cdc-delivery-invocation.js:223-230` | refusal, dispatch closed, slot identity, `owner.isShutdown`, `isCurrent()` = `laneIsCurrent && subscribersCurrent` (`partition-cdc-obligation-delivery.js:533-535`, `:558-569`), budget | 0 / 0 |
| Subscriber scope `assertCurrent` | `cdc-delivery-invocation.js:83-90` | root + `cdcProgressCurrent(delivery, lane, cell)` (`partition-cdc-obligation-progress.js:43-50`, passed at :117-118) | 1 / 1 per subscriber branch whose topology is bound |
| Subscriber scope `remainingMs` | `:94-97` | scope `assertCurrent` + root `remainingMs` | 1 / 1 |
| Wave child scope `assertCurrent` | `:139-142` | subscriber scope `assertCurrent` + accepting | 1 / 1 |
| Wave child scope `remainingMs` | `:164-167` | child `assertCurrent` + scope `remainingMs` | **2 / 2** |
| Progress-bound `assertCurrent` (`next`, `observe`, `result`) | `cdc-propagation-progress.js:179-184` | scope `assertCurrent` + `cdcPropagationProgressCurrent(progress)` | **2 / 1** |
| Transport `remaining()` | `message-router-delivery-lifetime.js:96-126`, `parentDeliveryLimits` :34-43 | `assertCdcDeliveryInvocation(child)` + `child.remainingMs()` + `parentRemaining()` (= `child.remainingMs`, passed at `cdc-group-propagation-durable-delivery.js:154`) + `assertCdcDeliveryInvocation(child)` | **6 / 6** |
| Wave captures | `cdc-group-propagation-durable-delivery.js:281` (admission), `:288` (after success, safe mode) | `captureDurablePropagationPlan` | 1 + 1 / 0 |

`cdcProgressCurrent` → `topologyBindingCurrent` → `cdcPropagationProgressCurrent`
(`cdc-propagation-progress.js:142-155`) → `captureDurablePropagationPlan`
(`cdc-group-propagation-durable-plan.js:14-31`). In safe mode that runs
`buildSafeTargets` (`cdc-group-propagation-routing.js:580-617`); in grouped mode
`buildGroupedContext` (:715-776). Both run `collectKnownMessageGroupDomain`
(:242-296) at least twice per plan. Cache reads: `get` and `find` clone the
row; `getAll`, `filter` and `getShared` hand out the stored row itself, frozen
in place (`readView` → `deepFreeze`; corrected in the corrective round, see 20.7).

### 4.2 Call sites during one obligation-lane delivery

Lane: `driveOnce` begins the root invocation (`partition-cdc-obligation-delivery.js:533`).
`deliverShipRange` (:346-372) then runs these calls:

- `prepareCdcObligationProgress` (progress.js:68, reuse check).
- Per subscriber: `cdcSubscriberInvocation`, then `scoped.assertCurrent()` at :355 and :358.
- `deliverCDCEventToSubscriber` (`partition-cdc-delivery.js:463-477`): `assertCdcDeliveryInvocation` at :468, the wrapper again at :497, and `deliveryContext.run` at :474, which runs `assertCurrent` 3-5 times through `run`/`ownChild`.
- The subscriber (`partition-cdc-propagation-subscriber.js:244-278`): `assertCdcDeliveryInvocation` at :245, and `deliveryContext.run` for the async selection and for propagation.
- The topology owner (`propagateDurableCdcEvent`, `cdc-group-propagation-durable-delivery.js:269-297`):
  - :271 `assertCdcDeliveryInvocation`;
  - :274 open child scope (asserts the parent again, `cdc-delivery-invocation.js:132`);
  - :279 `assertCurrent`;
  - :281 plan capture;
  - `bindTopology`: scope `assertCurrent` twice plus route refresh (`partition-cdc-obligation-progress.js:110-115`);
  - `deliverUncoveredLeaves` (:163-194), per leaf: `assertCurrent` (:171), `progress.next()`, `context.run`, `remainingMs`, `assertCurrent` (:180), `progress.observe()`;
  - `wave.complete()` and `result()` → `progress.result()` twice;
  - :286 `assertCurrent`; :288 post-success capture.
- Each target leaf goes through the real router:
  - lifetime creation (:48);
  - `runDeliveryOperation`: `ownChild` (:188) and `remainingMs` (:210);
  - `deliver` (`message-router-delivery-behaviors.js:149-224`): `assertDeliveryOpen` ×2, `remainingMs`;
  - ACK delivery (`message-router-ack-delivery.js:70-140`): `assertDeliveryOpen`, the encoder's `prepareMessage` (`remaining()` ×2, lifetime :143-149), `assertDeliveryOpen`, `remainingDeliveryMs`, and `assertOpen` on resolve;
  - settle `remainingMs` (:199).

  Each transport `remaining()` is six full evaluations.
- The source leaf goes through the MG apply. Its triple pattern is the sibling
  in section 11: `captureCdcParentGrant`
  (`message-group-cdc-committed-acceptance.js:274-282`), `enclosingCdcRemainingMs`
  (`cdc-delivery-budget.js:28-34`) and `parentWaitIsLive`
  (`message-group-cdc-committed-acceptance.js:50-61`).
- Final aggregation: `cdcProgressCurrent` (`partition-cdc-obligation-delivery.js:365`).

The measured totals for one delivery are in section 12.

## 5. Complete input enumeration

"Read at" is where the check reads the input (all paths under `src/`). "Version"
says whether the input's owner already exposes a monotonic generation or
identity that changes exactly when the input changes. **Per read** means the
input is a cheap scalar or identity compare that stays evaluated on every read.
**Stamp** means it is part of the expensive plan or selection and must enter the
proposed stamp. "Case" is the negative-witness id in the test.

### 5.1 Partition delivery owner, invocation and lane (cheap; stay per read)

| Input | Read at | Owner | Version / identity | Treatment | Case |
| --- | --- | --- | --- | --- | --- |
| refusal / dispatch closed | `cdc-delivery-invocation.js:224-225` | the invocation | invocation-local flags (set by `retire`, :216-222) | per read | `invocation.retired` |
| slot identity `delivery.activeCdcInvocation === invocation` | :225 | partition CDC delivery owner | object identity | per read | `invocation.active-slot` |
| response deadline (budget) | :226, :289 | the invocation; configured once at begin (:60-67, :195) from `messageGroup.deliveryTimeoutMs` / `transport.messageTimeoutMs` | **time-dependent: no stamp possible** | per read | deadline anchor |
| `owner.isShutdown` | :225; `partition-cdc-obligation-progress.js:45`; `partition-cdc-obligation-lane.js:58` | partition service lifecycle | field | per read | `partition.is-shutdown` |
| `owner.isLeader` | progress.js:45; lane.js:58 | `replica-leadership-state.js:62-104` | field | per read | `partition.is-leader` |
| `owner.leadershipTenure` | progress.js:46; lane.js:58,69 | `replica-leadership-state.js:38-60` | **identity: a new frozen token per tenure** | per read (identity) | `partition.leadership-tenure` |
| `delivery.obligationLane` identity | progress.js:44; lane.js:68 | `resetCdcObligationLane` (lane.js:76-84) | identity | per read | `partition.obligation-lane` |
| `lane.currentObligation === cell` | progress.js:44 | lane (cleared at obligation-delivery.js:314,370,654; progress.js:100,139) | identity | per read | `partition.current-obligation` |
| subscriber set size | progress.js:47; obligation-delivery.js:565 | `partition-cdc-delivery.js:550,589` | none (Set size) | per read | `partition.subscriber-count` |
| subscriber membership `cdcSubscribers.has(wrapper)` | progress.js:26; obligation-delivery.js:566 | same | none | per read | `partition.subscriber-membership` |
| wrapper source `wrapper.cdcSourceSubscriber` | progress.js:27 (via `getCDCSubscriberSource`, partition-cdc-delivery.js:220-222) | `partition-cdc-delivery.js:548` | identity | per read | `partition.subscriber-source` |
| subscription state identity | progress.js:28; obligation-delivery.js:567 | `partition-cdc-delivery.js:546,591` | identity | per read | `partition.subscriber-state` |
| subscription epoch | progress.js:29; obligation-delivery.js:568 | `partition-cdc-delivery.js:535-539` (`cdcSubscriptionEpoch`, monotonic within a lifetime; reset to 0 at shutdown, `partition-service-lifecycle-methods.js:223`) | **monotonic epoch** | per read | `partition.subscriber-epoch` |

The direct (non-lane) path has its own root `isCurrent`
(`partition-cdc-delivery.js:69-71`: `isLeader`, tenure, `cdcSubscriptionEpoch`)
and no subscriber scope. It never reaches the plan or the selection.

### 5.2 Topology owner and source message group (cheap; stay per read)

| Input | Read at | Owner | Version / identity | Treatment | Case |
| --- | --- | --- | --- | --- | --- |
| `owner.durablePropagationLifetime` | `cdc-propagation-progress.js:144` | `cdc-group-propagation-service.js:64,109,148` | **identity: a new frozen token per lifetime** | per read | `topology.durable-lifetime` |
| `owner.isPropagationStopped()` | :144 | `cdc-group-propagation-lifecycle-methods.js:15-17` | state field | per read | `topology.stopped` |
| `owner.systemTableCache` identity | :145 | service ctor/initialize | identity | per read | `topology.cache-identity` |
| `owner.latencyTreeService` identity | :145 | same | identity | per read | `topology.tree-identity` |
| `owner.messageRouter` identity | :146 | same | identity | per read | `topology.router-identity` |
| `source.isShutdown`, `source.initialized` | :147 | MG lifecycle (`message-group-service-state.js:326-328`) | fields | per read | `source.is-shutdown`, `source.initialized` |
| `source.raft` identity | :147 | MG consensus port open (`message-group-consensus-port.js`) | identity | per read | `source.raft` |
| `source.cdcCommitLifetime` identity | :148 | `message-group-consensus-port.js:159,218` | identity | per read | `source.commit-lifetime` |
| `source.groupId` | :149 | MG ctor | value | per read | `source.group-id` |
| `typeof branch.original.getCDCPropagationService` | `partition-cdc-obligation-progress.js:39` | subscriber factory | constant per subscriber | per read | (constant) |

### 5.3 The propagation plan (expensive; must enter the stamp)

The plan is a pure function of these inputs plus the progress object's own
state (5.5). **Every row of a cache table below is covered by that table's
existing per-table mutation version**: `SystemTableCache.getTableMutationVersion(table)`
(`system-table-cache-observation-methods.js:172-175`), bumped by
`recordTableMutation` (:157-163) on every accepted apply that changes a row
(`system-table-cache.js:508-510`, including the stale-backfill and delete
branches that set `recordForNotification`) and by the authoritative-absence
sweep (`system-table-cache-authoritative-absence-sweep.js:152`). Readers cannot
mutate rows in place, but **not because they get clones** (corrected in the
corrective round, 20.7): only `get` and `find` clone
(`system-table-cache-observation-methods.js:446-466`); `getAll`, `filter` and
`getShared` return the stored row object itself, deep-frozen in place by
`readView` (:468-489). A reader holding such a row holds the cache's own
object; it cannot write through it (frozen), and the owner replaces rather than
mutates a stored row on every write (`table.set`), so a held row is a snapshot
of its version. **Defect in the version for this
use:** `clear()` resets it to 0 (`system-table-cache.js:576`), so a version
seen before `clear()` can recur with different content. Required owner-side
change: never reset the counter (or bump a cache-reset epoch on `clear()`).

| Input (table.field or fact) | Read at (`cdc-group-propagation-routing.js` unless named) | Version | Case |
| --- | --- | --- | --- |
| SERVICES.address | :52-54 (route filter), :604/:677 (route) | SERVICES version | `services.address` |
| SERVICES.node_id | :111, :275, :393, :509, :603 | SERVICES version | `services.node-id` |
| SERVICES.service_id | :70-72, :93-107, :150, :390 | SERVICES version | `services.service-id` |
| SERVICES.created_at | :152 | SERVICES version | `services.created-at` |
| SERVICES.create_attempt_token | :153 | SERVICES version | `services.create-attempt-token` |
| SERVICES.replica_id | :151 | SERVICES version | `services.replica-id` |
| SERVICES.raft_role | :65-86 (coordinator sort) | SERVICES version | `services.raft-role` |
| SERVICES.status | :51, :231, :515 | SERVICES version | `services.status` |
| SERVICES.service_type | :50, :230, :507 | SERVICES version | `services.service-type` |
| SERVICES.group_id | :89-92, :389, :508 | SERVICES version | `services.group-id` |
| NODES.boot_incarnation | :146, :154 | NODES version | `nodes.boot-incarnation` |
| NODES.latency_group_id (service and leader nodes) | :278-280, :382-384, :395-397, :634-635 | NODES version | `nodes.latency-group-id` |
| NODES.status (JOINING coordinator) | :499-502 | NODES version | `nodes.status` |
| NODES.latency_group_id of `owner.nodeId` | :523-525, :583-585 (safe, when no source group), :404-406, :716-717 (grouped) | NODES version | `nodes.local-latency-group-id` |
| LATENCY_GROUPS rows / group_id | :196-199, :303, :375 | LATENCY_GROUPS version | `latency-groups.row` |
| LATENCY_GROUPS.state (active, degraded, draining) | :167-179, :201-215 | LATENCY_GROUPS version | `latency-groups.state` |
| LATENCY_GROUPS.coordinator_node_id | :286, :327, :492, :542, :641 | LATENCY_GROUPS version | `latency-groups.coordinator` |
| LATENCY_GROUPS.representative_node_id | :287, :328, :493, :543, :642 | LATENCY_GROUPS version | `latency-groups.representative` |
| MESSAGE_GROUPS rows / group_id | :223-226, :268-270, :379, :631, :645 | MESSAGE_GROUPS version | `message-groups.row` |
| MESSAGE_GROUPS.status | :191 | MESSAGE_GROUPS version | `message-groups.status` |
| MESSAGE_GROUPS.state | :192 | MESSAGE_GROUPS version | `message-groups.state` |
| MESSAGE_GROUPS.leader_node_id | :269, :380, :632, :646 | MESSAGE_GROUPS version | `message-groups.leader-node-id` |
| config `latency.propagationMode` | `cdc-group-propagation-service.js:222` via `refreshConfig` (durable-plan.js:15-16) | **none**: `ConfigurationManager` has no version (`configuration-manager.js:316-376`; writers: `initialize`/`applyOverrides`, `setByPath`) | `config.propagation-mode` |
| `owner.nodeId` | durable-plan.js:25; routing :330, :404, :523, :545, :716 | field (also written by `initialize`, which also renews the lifetime) | `topology.node-id` |
| `owner.messageGroupReplicaSuffix` | durable-plan.js:28; routing :97-107; progress.js:59 | field; never assigned in production (the default suffix applies) | `topology.replica-suffix` |
| `source.groupId` (plan source) | durable-plan.js:17, :24 | MG ctor | (5.2) |
| tree routing order `getRoutingOrder(sourceId)` | :412-421 | `LatencyTreeService` (`latency-tree-service.js:195-204`) | `sourceViews` identity replaced and `stats.recomputeCount` incremented on every `recompute` (:138-180); no exported generation | `tree.routing-order` (non-discriminating) |
| router deliverability `typeof messageRouter.deliver` | :687-692 (grouped mode only) | router | identity covered by 5.2 | covered elsewhere |

**The routing order cannot change the predicate (VERIFIED by reading).** In
both modes the *set* of required target ids is
`collectCacheTargetGroupIds(...)` (:351-367), plus unmapped latency groups
(:519-561). Neither reads the tree. Every candidate the routing order
contributes (:423-449) is already in `domain.knownGroupIds`, because each
candidate branch of `resolveLatencyGroupTargetCandidates` (:314-344) returns
only known ids. So the tree only *orders* the plan.
`refreshCdcPropagationRoutes` is order-insensitive for existing leaves (lookup
by group id, `cdc-propagation-progress.js:111-127`). Order matters only for
where a new leaf is pushed, and that happens only when the set changes, which
is a cache change. The tree may therefore be left out of the stamp, or included
through an owner-exposed generation (smallest: export a `routingGeneration`
that `recompute` bumps). The witness case is executed but cannot discriminate.

### 5.4 The operational selection (expensive; must enter the stamp)

`getCDCPropagationService()` must return exactly `topology.source`
(`partition-cdc-obligation-progress.js:39-40`). In production it reads:

| Input | Read at | Owner | Version / identity |
| --- | --- | --- | --- |
| the node's MG service registry (membership and order) | `message-group-selection.js:30-42`; delegates `bootstrap-service.js:282,562`, `node-joining-owner-construction.js:228,285,588` | bootstrap (`seed-message-groups-phase.js:170`, `create-message-group-replica-lifecycle.js:150,243`, `move-replica-handoff-owner.js:496`, `join-cleanup-handler.js:640`) | **none** (plain `Map`). Smallest owner stamp: one owned registry with a generation bumped on set/delete/clear |
| each MG's published role (`isLeaderReplica`) | :151,295,323; `leadership-state-runtime-methods.js:134-136` | `replica-leadership-state.js:62-104`, wired by `message-group-service-raft-lifecycle.js:312-345` (role events; join-phase events are ignored) | field; no generation |
| each published-leader MG's `initialized` | `message-group-forwarding-owner.js:427` | MG lifecycle | field |
| each published-leader MG's core status (`outcome === CORE_OK && role === LEADER`) | `leadership-state-runtime-methods.js:9-12,35-38` → `raft-rs-operation-port.js:456` → runtime `readStatusNow` (`raft-rs-runtime-owner.js:1541-1570`) | raft-rs runtime owner | **none exposed.** The runtime replaces `group.statusObservation` on each completed entry (:1500-1506) and emits role/term/leader events only when they differ from `group.lastStatus`, and not on the first announce after reconstruction (`before` null, :1398-1415). Held/recovery outcomes are not role events at all |
| for a published leader whose core does not lead: the forwarding owner's ingress decision per required table (`resolveCdcIngressDecision`, `message-group-forwarding-owner.js:264-410`, including `resolveCDCForwardSelection`, strict-forwarding policy, router connectivity, cache rows), with a side effect: `requestAuthoritativeTopologyRepair` (:464-470) | :437-485 | MG forwarding owner | none; wide input surface |
| preferred service captured: `initialized`, `subscribeToCDC`/`sendMessage` presence | `message-group-selection.js:64-74,266-270` | MG | fields |
| relay readiness of non-leaders (only when the preferred service is not captured) | :102-116,322-341 | MG forwarding owner | none |

Witnesses: `selection.selected-service` changes the answer at the collaborator,
which is enough for the check's identity compare. The selection anchor executes
"one evaluation = one raft status read" on a real `MessageGroupService` through
the production selection. The selection's deeper inputs are not changed by a
negative case in this fixture (section 13, open question 3).

### 5.5 The progress object's own state (owner-local)

`refreshCdcPropagationRoutes` (`cdc-propagation-progress.js:109-131`) is a
function of (plan targets, `progress.targets`, each leaf's `route` and
`coverage`). `transferInvalidLatencyBindings` (:46-107) drops a pre-activation
leaf only while its coverage is UNCOVERED (:72-79). Coverage changes through
`observe` (:197-213). So an unchanged plan does **not** make the refresh a
no-op if `observe` changed a leaf's coverage since the last refresh. The stamp
must include a progress revision that `observe`, `refreshCdcPropagationRoutes`,
`transferInvalidLatencyBindings` and `discardProvisionalCoverage` bump. That
revision lives in the progress owner (`cdc-propagation-progress.js`), which is
the producer of the predicate, not a consumer.

## 6. Inputs that cannot be stamped

- The invocation's response deadline (`cdc-delivery-invocation.js:226,289`).
- The transport lifetime's local budget and the parent grants
  (`message-router-delivery-lifetime.js:101-121`).
- The MG wait's own deadline (`message-group-cdc-committed-acceptance.js:50-61`).

These are evaluated on every read today and must stay so. The deadline anchor
executes that requirement: the deadline passes with no timer dispatched and
nothing else changing, and the next read alone answers not current.

## 7. Side effects the stamp must preserve

| Effect | Where | Behaviour under an unchanged stamp |
| --- | --- | --- |
| route refresh: add leaf, replace route, drop pre-activation leaf, discard provisional coverage | `cdc-propagation-progress.js:109-131,153` | a no-op when the plan inputs and the progress revision (5.5) are unchanged (`sameObservedRoute` :24-29, find by group id :112) |
| branch tag reset when the topology coverage is UNCOVERED | `partition-cdc-obligation-progress.js:36-38` | depends only on progress coverage; cheap; stays per read |
| publication-mode diagnostics written by `refreshConfig` | `cdc-group-propagation-service.js:221-242` | idempotent under unchanged config: grouped writes only on a transition into grouped; safe always writes REPAIR_ONLY, the same mode the safe wave writes (`durable-delivery.js:256-260`, :283) |
| authoritative topology repair requested by the selection's ingress decision (non-core-leader path only) | `message-group-forwarding-owner.js:464-470` | **a per-read side effect today.** A stamped selection would request it once per stamp instead of once per read. Owner decision needed (open question 4) |

## 8. Proposed stamp and proof sketch (stage 2; not implemented)

**One algorithm.** `cdcProgressCurrent` keeps its shape. The expensive part,
`topologyBindingCurrent` (plan observation plus selection identity), is
re-evaluated **iff** a stamp moved. The stamp is computed fresh on every read,
from owner versions only. The cached value is the stamp together with the plan
result (targets, fallback, sourceMismatch) and the selected-service identity
observed at that stamp. There is no second decision path: a stale or unknown
stamp component means "re-evaluate", never "current".

Stamp components:

| Component | Owner | Exists today? | Smallest owner-side addition |
| --- | --- | --- | --- |
| `getTableMutationVersion` for SERVICES, NODES, LATENCY_GROUPS, MESSAGE_GROUPS, plus cache identity | `SystemTableCache` | yes (`system-table-cache-observation-methods.js:172`) | stop resetting on `clear()` (`system-table-cache.js:576`) |
| propagation-mode config | `ConfigurationManager` | no | a monotonic revision bumped in `applyOverrides` and `setByPath` (the only writers) |
| `owner.nodeId`, `owner.messageGroupReplicaSuffix`, `source.groupId` | topology owner / MG | values | compared as values inside the stamp |
| progress revision | `cdc-propagation-progress.js` | no | a counter bumped by every progress mutator (5.5) |
| MG registry generation | bootstrap registry | no | owned registry with a generation |
| per-MG selection-relevant state: published role, `initialized`, core status outcome and role | MG plus raft-rs runtime | no | a per-group **status generation** in the runtime, bumped whenever the readable `(outcome, raftState, lifecycle/runtime generation, health)` changes (in `recordStatusObservation`, `raft-rs-runtime-owner.js:1501-1506`, and in the health transitions), exposed through the port, plus a published-role generation bumped by `applyReplicaLeadership` / `applyReplicaDemotion` |
| non-core-leader ingress-decision inputs | MG forwarding owner | no | either (a) treat that path as unstampable and evaluate it per read (it only occurs while a published leader's core does not lead, a transient window), or (b) census its inputs in stage 2. I recommend (a) |
| tree routing order | `LatencyTreeService` | `sourceViews` identity, `recomputeCount` | optional (5.3 proof); if included, export the identity as a generation |

Proof sketch for "stamp unchanged ⇒ predicate result and effects unchanged":

1. The plan is a deterministic function of the inputs in 5.3. The cache inputs
   are rows of four tables; any accepted change to any row bumps that table's
   version (5.3, after the `clear()` fix). The config value, `nodeId`, suffix
   and `source.groupId` are in the stamp. The tree only orders the plan (5.3).
   So equal stamps give equal plan target sets, fallback and sourceMismatch.
2. Under an equal plan and an equal progress revision, `refreshCdcPropagationRoutes`
   is idempotent (7), so skipping it changes no progress state.
3. The selection's answer is a function of the registry, each MG's published
   role, `initialized`, core status, and (for a published-but-not-core leader)
   the ingress decision. Under option (a) that path is evaluated every time.
   Otherwise every component is in the stamp, so an equal stamp gives the same
   selected object.
4. All cheap inputs (5.1, 5.2) and all time-dependent inputs (6) are evaluated
   per read exactly as today.

## 9. What stays evaluated on every read

Everything in 5.1 and 5.2; the deadline and budgets (6); the branch tag reset
(7); the stamp computation itself (a handful of integer and identity reads).
Under option (a), also the selection whenever a local MG's published role is
leader but its last status generation says the core does not lead.

## 10. Consumers of the answer and what a stale positive would let them do

| Consumer | Where | A stale "current" would let it |
| --- | --- | --- |
| cell reuse | `partition-cdc-obligation-progress.js:68` | reuse covered leaves of an obsolete cell (R3 hole) |
| subscriber skip and observe | `partition-cdc-obligation-delivery.js:355-359` | skip a branch whose requirements grew; record coverage against an obsolete binding |
| final aggregation, then ACK | :365-371, then `acknowledgeShippedRange` :426-437 | propose CDC_DELIVERED for a range a newly required group never received: **a dropped acknowledged obligation (R12)** |
| `next` / `observe` / `result` | `cdc-propagation-progress.js:190-219` | dispatch to, or install coverage from, a replaced route; answer complete without a new leaf |
| `run` / `ownChild` / `remainingMs` | `cdc-delivery-invocation.js:98-120,143-180,231-279` | start or settle an effect, or grant time, for a retired owner, lane, subscriber or source |
| transport lifetime | `message-router-delivery-lifetime.js:96-126` | send or keep awaiting for an invocation that is no longer current |
| MG source apply | `message-group-cdc-committed-acceptance.js:50-61,274-282`; `cdc-delivery-budget.js:28-34` | return a native receipt as coverage for a non-current parent |

A stale negative only retires the invocation (`deferRetry`), and the owed rows
stay in the ledger (`partition-cdc-obligation-delivery.js:386-413`): the cost is
a retry, never a lost obligation.

## 11. Siblings: other per-call recomputations in the CDC delivery path (not changed)

| Sibling | Where | What it recomputes | Frequency |
| --- | --- | --- | --- |
| progress-bound `assertCurrent` | `cdc-propagation-progress.js:179-184` | a second plan observation after the full scope check | each `next`, `observe`, `result` (≥ 2 per leaf plus 2 per wave answer) |
| transport triple | `message-router-delivery-lifetime.js:34-43` | the full check four times plus two remaining reads | each `remaining()` (≥ 7 per target delivery) |
| MG parent grant / budget / wait liveness (the same triple) | `message-group-cdc-committed-acceptance.js:274-282,50-61,192-197`; `cdc-delivery-budget.js:28-34` | full check ×2-3 per call | per source apply, per wait re-arm and per settle |
| wave capture plus post-success capture | `cdc-group-propagation-durable-delivery.js:281,288` | the plan, twice per successful safe wave | per wave |
| subscriber readiness | `partition-cdc-delivery.js:261-270,469` → MG `canAcceptCDCEvent` (`message-group-forwarding-owner.js:419-423`) → `resolveCdcIngressDecision` → `resolveNativeCdcIngressDecision` (`message-group-forwarding-owner-routing-methods.js:127-139`: `nativeCdcObservation` `raft.readStatus()` :53-62, then `isCurrentRaftLeader()`, a second read) | 2 raft status reads plus the repair-request side effect | twice per subscriber delivery (wrapper and original, `partition-cdc-delivery.js:469,495-497`) |
| async selection | `message-group-selection.js:195-249,353-453` | `getMetadataIngressReadiness` (status read) plus `isCurrentRaftLeader` (:221) | once per subscriber delivery |
| MG durable apply | `message-group-service-cdc-replication-runtime-methods.js:170-219` → `applyDurableCdcBatch` (`message-group-cdc-committed-acceptance.js:309-332`) | leader checks through status reads | per source apply |
| `getCurrentTerm()` | `leadership-state-runtime-methods.js:158-161` | a status read | on each MG role event (`raft-lifecycle.js:316`) |

## 12. Witnesses and lab result

File `test/partition/partition-cdc-currentness-stamp-witness.test.js`, commit
`29f2fab7f`. Composition (real): the partition lane and root invocation, the
subscriber scope, the wave child scope, the production subscriber factory, the
topology owner over a real `SystemTableCache` (every change through
`applySystemTableChange`, with a setup guard that the owner applied it), and a
real `MessageRouter` delivery lifetime to an identified in-process peer that
answers ACK + SERVICE_RESPONSE. Controlled: the source MG (the harness's one
durable source double), the selection collaborator the factory takes, the tree
collaborator, and the peer's answers. Evidence ceiling: one process; no native
recipient commit; no raft-rs status read inside the full chain (the anchor
covers the mapping).

1. **Counting** (1 and 3 target groups): one delivery with nothing changing.
   Plan rebuilds are counted at the tree collaborator: exactly one
   `getRoutingOrder` per `captureDurablePropagationPlan`, in both modes
   (routing.js:419; durable-plan.js:17-29). Raft status reads of the check are
   counted as currentness selection evaluations (the collaborator is reached
   only by `getCDCPropagationService` while the preferred service is ready,
   `partition-cdc-propagation-subscriber.js:302-309`). Bound: ≤ 1 each.
2. **Negative family**: 49 cases generated from one list, plus a structural
   case over that list. *Corrected (corrective round, 20.4):* the structural
   case checks only that the list is well formed (every id once, every case
   names its kind, change, reads and observation); it cannot notice an input
   the code starts reading without a case, so "an input added without a case
   fails" did not hold. The corrective round adds a structural case at the
   cache seam for the one mechanically checkable class: a plan read of a system
   table outside the stamped list fails. Each case changes one
   input while the first target delivery is in flight (all scopes open), after
   a first check that answers current. The very next `assertCurrent()` must
   either throw the invocation's typed UNKNOWN, or answer current with the
   progress already showing the new fact.
3. **Deadline anchor**: two reads 1 ms apart differ by 1 ms. The clock is then
   moved past the deadline with no timer dispatched, and the next read alone
   refuses.
4. **Selection anchor**: the production `resolveOperationalMessageGroupSelection`
   over a constructed `MessageGroupService` (the established MG-test seam:
   `initialized`, leader role, a production-shaped port built by
   `createRaftOperationPort`) reads `raft.readStatus()` exactly once per
   evaluation.

### Lab run (EXECUTED)

| Item | Value |
| --- | --- |
| Command | `LAGRANGE_LAB_AGENT=claude:cdc-currentness node tools/focused.mjs 29f2fab7f2647f2022b41f5993f0725a721752dc adam-laptop 0dbed1718c2d07c1fcb8bbe56b87ac41763c262c lab/cdcstamp-r2 test/partition/partition-cdc-currentness-stamp-witness.test.js` |
| Output | `lab/cdcstamp-r2/` (selection.json, test-results.ndjson, placement log/err, exit.json) and `lab/cdcstamp-r2.console.log` |
| Earlier attempt | `lab/cdcstamp-r1`: runner failure "no lab machine is ready" (adam-laptop held by `claude:w2-compose`), not a test result |
| Result | 54 tests, **52 pass, 2 fail**, 6.7 s, stderr empty |

| Witness | Result | Today's measurement |
| --- | --- | --- |
| counting, 1 target group | **RED** (`ERR_ASSERTION`, intended) | **251 plan rebuilds, 243 currentness selection evaluations (= 243 raft status reads on a node whose local MG replica leads)**, 1 delivery selection, for one delivery of one range |
| counting, 3 target groups | **RED** (intended) | **697 plan rebuilds, 685 selection evaluations**, 1 delivery selection |
| structural (one complete list) | green | 49 cases plus 3 covered-elsewhere entries |
| 49 negative cases (12 not-current partition/invocation, 5 topology identity, 2 topology re-observed, 5 source, 1 selection, 1 config, 1 tree (non-discriminating), 10 SERVICES, 4 NODES, 4 LATENCY_GROUPS, 4 MESSAGE_GROUPS) | **all green today** | every changed input is seen by the very next check |
| deadline anchor | green | each read charges elapsed time; past the deadline with no timer dispatched, the read alone refuses |
| selection anchor | green | exactly 1 `raft.readStatus()` per production selection evaluation |

The counts decompose exactly as section 4.1 predicts.

- **Plan rebuilds minus selections:** 251 − 243 = 8 = 2 wave captures (`durable-delivery.js:281`, `:288`) + 6 extra observations by the progress-bound check. For 3 targets: 697 − 685 = 12 = 2 + 10.
- **Cost per extra target delivery:** (697 − 251) / 2 = **223 plan rebuilds** and **221 raft status reads**. That is the transport lifetime's six-fold multiplier on every `remaining()`, plus the child scope's double `remainingMs`.
- **No negative case failed today,** so there is no finding that the current check misses an input. The family is the safety net stage 2 must keep green.

## 13. Findings and open questions for the lead

### Findings

| # | Finding | Evidence | Owner |
| --- | --- | --- | --- |
| F1 | The raft status read in the check is the operational selection (`getCDCPropagationService` → `isCurrentRaftLeader` → `raft.readStatus()`), not `owner.isLeader`, which is a field. The causal report's attribution is corrected. | section 3; selection anchor (executed) | this repair |
| F2 | The real multiplier is 6 full evaluations per transport `remaining()` and 2 per child `remainingMs`, not 3. One delivery to one target does 251 plan rebuilds and 243 raft status reads; each extra target adds 223 and 221. | section 4.1; counting witness (executed) | this repair |
| F3 | The check has side effects: route refresh, branch-tag reset, publication-mode diagnostics, and (non-core-leader path only) an authoritative-topology repair request. | section 7 | this repair; F3's last item belongs to the MG forwarding owner |
| F4 | `SystemTableCache.getTableMutationVersion` is documented as "Version equality across two reads proves no apply landed between them" (`system-table-cache-observation-methods.js:166-175`), but `clear()` resets it to 0 (`system-table-cache.js:576`), so equality does not prove that across a clear. Existing consumers that key on it (`membership-planning-version-key.js:46-63`, `readiness-planning-semantic-generation.js:203-208`, `projection-readiness-evidence-generation.js:370-382`, `control-plane-readiness-snapshot-store.js:56`, `global-topology-blocking-operation-view.js:18-19`, `admin-control-snapshot-repair-orchestration.js:64-70`) carry the same latent stale-positive. Reachability today: the only production `clear()` caller is the failed-bootstrap cleanup (`seed-cleanup-handler.js:229-232`), which then drops the cache reference. So it is latent, not live, but a stamp must not rely on it. | read only | cache owner (R17: record, route; not absorbed here) |
| F5 | No owner exposes a version for: the propagation-mode config (`ConfigurationManager`), the node's MG service registry (plain `Map`, 5+ writers), the raft core status as read through the port, the MG published role, and the progress object's own state. | section 5 | stage 2: config, bootstrap, raft-rs runtime/port, MG, progress owners |
| F6 | The latency tree's routing order cannot change the predicate's answer or effects (order only). | section 5.3 proof; `tree.routing-order` case executed (non-discriminating) | none |
| F7 | All 49 negative cases pass today: no input the current check reads is missed. | lab run | none |
| F8 | The repo's pre-commit hook folded generated metadata into the witness commit: the global-owner-debt inventory, four `test/shards/*.json` files, and generated importer counts in `src/bootstrap/shared/INDEX.md` and `src/partition/INDEX.md` (`documentClass: generated`). No hand-written `src/` change. | `git show --stat 29f2fab7f` | none |

### Open questions for the lead before stage 2

1. **Scope of the "≤ 1 plan rebuild per delivery" bound.** The 251 includes
   the wave's own two captures (admission and post-success). The bound is
   reachable only if stage 2 serves the wave's captures from the same
   plan-at-stamp as the check (one plan per stamp, in the topology owner). I
   recommend that, since it is one algorithm. The alternative is restating the
   bound as "the check adds ≤ 1". Your call (R09: the bound is yours).
2. **Footprint and route.** A complete stamp needs owner-side additions in
   six owners:
   - the cache (`clear()` monotonicity, F4);
   - `ConfigurationManager` (a revision);
   - the bootstrap MG registry (a generation);
   - the raft-rs runtime and operation port (a per-group status generation; this changes the port's contract shape, R08);
   - MG leadership (a published-role generation);
   - `cdc-propagation-progress.js` (a progress revision).

   That is an owner-boundary contract change across several owners, so it
   points to a Quest (R15), not a direct change. A narrower first slice is
   possible: stamp only the **plan** (cache versions plus a config revision
   plus a progress revision) and keep the selection per read. That removes
   about 250 of the per-delivery plan rebuilds, but none of the 243 raft
   status reads. Choose: full stamp now, or plan first and selection second.
3. **The selection's negative witness for stage 2.** In this fixture the
   selection answer is changed at the factory collaborator. A stage-2 stamp
   keyed on owner generations (registry, role, status) would not see that
   change, so `selection.selected-service` would go red after a correct
   repair. If the selection is stamped, stage 2 must first add a negative
   fixture that runs the production selection over a real MG that is also the
   propagation source: its `applyCDCBatch` must commit, through
   `ControllableMessageGroupService` + `port.commit`, or the native fixtures.
   The tree stub has the same limitation if a tree generation enters the stamp
   (F6 says it need not).
4. **The non-core-leader selection path** (a published MG leader whose core no
   longer leads, or a held/non-`CORE_OK` status) reads the forwarding owner's
   whole ingress decision and requests topology repair as a side effect.
   - My recommendation: evaluate that path on every read (unstamped). It is a
     transient window, and the side effect's frequency then stays as today.
   - Stamping it needs a census of the forwarding owner's inputs, and the MG
     forwarding owner's consent to the changed repair-request frequency.
5. **Siblings (section 11).** These are separate units, not stage 2:
   - the subscriber readiness path's two raft status reads, twice per subscriber delivery;
   - the MG parent-grant/budget triple;
   - the async selection's double status read.

   They share the stamp's owner additions; I recommend recording them as
   follow-ups once the stamp API exists.

---

# Stage 2 (lead rulings of 2026-11-21)

Rulings received: 2a, then 2b; stop and report after 2b; the selection is not
stamped (Q2-Q4); siblings not changed (Q5). The 49 negative cases must stay
green after every step. The corrections in section 3 are accepted and kept.

## 14. Stage 2a: one evaluation per synchronous budget read. STOPPED at its premise

### 14.1 The duplicated evaluations are in one synchronous call (VERIFIED)

None of these call sites awaits between the duplicated evaluations:

| Read | Call sites, in order (all synchronous) | Full checks |
| --- | --- | --- |
| transport `remaining()` | `message-router-delivery-lifetime.js:96-126` → `parentDeliveryLimits` :34-43: `assertCdcDeliveryInvocation(child)` :37 (→ `cdc-delivery-invocation.js:73-76` → child `assertCurrent` :139-142 → scope `assertCurrent` :83-90); `child.remainingMs()` :38 (→ :164-167 = child `assertCurrent` + scope `remainingMs` :94-97 = scope `assertCurrent` + root `remainingMs` :287-290); `parentRemaining()` :40 (the same `child.remainingMs`, passed at `cdc-group-propagation-durable-delivery.js:154`); `assertCdcDeliveryInvocation(child)` :41 | 6 |
| child `remainingMs` (wave: `deliverTarget` `timeoutMs`, `prepareWait`) | `cdc-delivery-invocation.js:164-167` | 2 |
| progress-bound check (`next`, `observe`, `result`) | `cdc-propagation-progress.js:179-184`: `context.assertCurrent()`, then `cdcPropagationProgressCurrent(progress)` | 1 scope check + 1 extra plan observation |

### 14.2 But foreign code inside each evaluation can change the next one's inputs (VERIFIED)

Every full check evaluates the operational selection. Through the chain in
section 3.1 that ends in the message group's `raft.readStatus()`
(`raft-rs-operation-port.js:456`), which goes:

1. `readStatusNow` (`raft-rs-runtime-owner.js:1541-1563`) →
   `readStatusObserved` (:1565-1578).
2. When the group has delivered, undrained inbound envelopes
   (`group.inbound.length > 0`), the read enqueues and **performs
   synchronously** a READ_STATUS command (:1566-1570).
3. `perform` (:1983-2004) calls `drainInbound(group, generation, group.inbound.length, …)`
   (:2002, :1930-1960). That steps **every** pending envelope
   (`stepOneInbound` :1874-1897), and each step runs `drainReady`
   (:1329-1345) → `processReadyCycle` (:1306-1327: persist) → `finishReady`.
4. `finishReady` sends (:1234) and **applies committed entries** (`applyEntries`
   :1239-1240 → the message group's `applyCommittedEntry` → CDC application
   into the node's system table cache, the cache the plan reads).
5. Then `announce` (:1398-1421) emits ROLE, TERM_CHANGE and LEADER_CHANGE
   events. The message group's lifecycle wiring handles them synchronously and
   rewrites its published role (`message-group-service-raft-lifecycle.js:312-345`;
   `replica-leadership-state.js:62-104`), which is what the selection reads.
6. Before stepping, `ensureExecution` (:1024-1044) may also reconstruct or
   replace the runtime.

So the selection read inside evaluation *k* can change the cache rows the
plan reads and the published roles and core status the selection reads, and
evaluation *k+1* then sees different facts. By the ruling's own definition
("no await, **no callback into foreign code between them**") **no pair of the
duplicated expensive evaluations qualifies**. 2a is empty for the expensive
part, and no 2a source change was made.

The difference is not only a missing proof; collapsing would change answers:

- **Today:** the first selection read of a call drains the inbound queue.
  Later reads in the same call do not drain again, because network inbound is
  only delivered by event-loop callbacks. So the *last* evaluation returns
  facts observed after any drive the call caused.
- **One plan-then-selection evaluation:** it would return a plan read *before*
  its own selection drive. For example, a route replaced by an entry applied
  during that drive would not be re-observed before `observe` installs coverage.
- **Effect:** that is a stale positive within the call. The next check would
  heal it (a route replacement discards provisional coverage,
  `cdc-propagation-progress.js:121-126`), but healing is not identity.

What would make 2a valid (not done here):

- **(a)** A status read for the currentness selection that never drives the
  group: it answers the last recorded status observation, as `readStatusObserved`
  already does when idle. This is a raft port contract change (R08), so it
  belongs to the selection unit.
- **(b)** Reorder the single evaluation so that the selection is read first,
  and everything else after the only drive the call can cause. Its
  equivalence rests on a census of everything a drive can run synchronously
  (event listeners, apply-time cache listeners), which is not established here.

### 14.3 Side effects

2a was not implemented, so no side effect changed frequency in 2a. The side
effects that 2b skips are argued in section 15.4.

### 14.4 What 2a would still have saved after 2b

After 2b the duplicated plan observations reuse the owner's plan (section 15).
So 2a's remaining value is exactly the duplicated **selection** evaluations,
which is the part whose premise fails. A drive inside the first evaluation
writes the cache, which moves the stamp, which makes the next evaluation
rebuild. 2b therefore keeps today's "the later evaluation sees the drive"
behaviour without relying on the premise.

## 15. Stage 2b: the plan stamp (the narrow slice)

### 15.1 Owner-side additions

| Owner | File | Addition |
| --- | --- | --- |
| system table cache | `src/cache/system-table-cache.js` `clear()` | the per-table mutation version is no longer reset; `clear()` advances every table's version (clearing is itself a change). The version is monotonic for the life of the cache instance |
| configuration | `src/config/configuration-manager.js` | `getRevision()`: a counter advanced by every write of the configuration tree (`applyOverrides`, `setByPath`, and `initialize`'s own `node.id` write). These are the only writers (`deepMerge` is reached only from `applyOverrides`; `getAll`/`getCategory` return clones). Residual: `get(path)` hands out live nested objects; no caller writes through one (searched `src/`) |
| latency tree | `src/topology/latency-tree-service.js` | `getRoutingGeneration()`: advanced by every `recompute`, the only writer of the routing views `getRoutingOrder` answers from |
| propagation progress | `src/cdc/cdc-propagation-progress.js` | `progress.revision`, advanced by every change of its leaves, routes or coverage (route refresh, latency transfer, provisional discard, `observe`) |
| topology plan | `src/topology/cdc-group-propagation-durable-plan.js` (`propagationPlanAtStamp`); owner field `propagationPlansAtStamp` (a `WeakMap` per source) in `src/topology/cdc-group-propagation-service.js` | one plan per stamp: the owner holds, per source, the frozen plan it last observed and that observation's stamp, and answers that plan while the stamp is unchanged. The observation itself (`captureDurablePropagationPlan`) is unchanged. Callers: the progress check (`cdc-propagation-progress.js`) and the wave's admission and post-success captures (`cdc-group-propagation-durable-delivery.js:281,288`) |

**Why the tree is in the stamp** although the ruling did not list it: F6
showed the routing order cannot change the *check's* answer. Under the Q1
ruling, though, the wave's admission capture now takes the shared plan, and
its target order seeds a new progress's leaf order, which is the dispatch
order (`createCdcPropagationProgress` → `refreshCdcPropagationRoutes`,
`cdc-propagation-progress.js:111-116`). The tree recomputes on the turn after a
cache change, or on its own triggers, with **no further bump** of the four
table versions. A stamp without the tree would therefore keep a stale order
after a recompute, and the admission capture would not mean what it means
today. The tree owner exposes the generation. A tree without it (every
existing test stub) leaves the stamp unknown, so the plan is observed anew
exactly as today.

### 15.2 The stamp

Stamp components, all read on every check:

- **Identities:** cache, config, tree and router; plus the router's `deliver`
  function identity (the grouped mode reads its presence).
- **Plain values the observation reads:** `owner.nodeId`,
  `owner.messageGroupReplicaSuffix`, `owner.propagationMode` and
  `source.groupId`.
- **Owner versions:** the config revision, the tree generation, and the
  versions of SERVICES, NODES, LATENCY_GROUPS and MESSAGE_GROUPS.

*Superseded by the corrective round (section 20.1-20.3).* As committed in
`82295c47e`: any versioned owner that did not expose its version, or any
version that was not a safe integer ≥ 0, made the stamp **unknown** (observed
anew, not held), and versions were read by optional call (`getRevision?.()`,
`getRoutingGeneration?.()`, `getTableMutationVersion?.(table)`). Calling that
"the repo's navigability rule" was a misreading: the detector forbids
`typeof member === 'function'` probes, and an optional call is the same
capability probe in another spelling. The rule the repo prescribes
(`docs/development/code-style.md` ~:150-154) is a named collaborator validated
at its owned wiring point; the corrective round does that and converts the test
doubles. There was no path on which an unknown stamp answered from a held
plan. The plan reuse never decides currentness; every identity and field
check of sections 5.1 and 5.2 still runs on every read.

### 15.3 Proofs

**(P1) Equal stamp ⇒ identical plan.**
`captureDurablePropagationPlan` (`cdc-group-propagation-durable-plan.js`)
reads only:

- `refreshConfig`, i.e. the config value through the config identity and
  revision;
- `owner.propagationMode`, `owner.nodeId`, `owner.messageGroupReplicaSuffix`
  and `source.groupId`;
- the cache's four tables (section 5.3);
- `tree.getRoutingOrder` (routing views replaced only by `recompute`);
- the router's deliverability.

Every one is a stamp component. Reads during the observation are synchronous
and pure; the only writes, `refreshConfig`'s, settle `owner.propagationMode`
from the config. The stamp is therefore taken *after* the observation, so it
names exactly the facts that observation read.

**(P2) The post-success capture keeps its meaning.** It asks whether a safe
wave's inputs now make the plan grouped
(`cdc-group-propagation-durable-delivery.js:287-291`).

- If nothing changed, its stamp equals the admission capture's and it gets
  the identical plan. That is the same result a fresh observation of unchanged
  inputs gives (P1).
- If anything it reads changed, a stamp component moved and the plan is
  observed anew.

The admission capture is the same case.

**(P3) Skipping the route refresh is a no-op.**
`cdcPropagationProgressCurrent` refreshes a progress only when the owner's
plan object differs from the one that progress last refreshed against, or the
progress's revision moved since then.

`refreshCdcPropagationRoutes(progress, T)` is idempotent: a second application
with the same `T` and no intervening progress change pushes nothing, replaces
no route and discards nothing. Its inputs beyond `T`, which the latency
transfer reads, are the cache's four tables, `nodeId` and the suffix, all in
the plan's stamp, plus the progress's own leaves, which are in its revision.

**(P4) A stamp move never restarts stable progress.** A moved stamp only
causes a new observation and a refresh. The refresh adds leaves, replaces
routes, and discards *provisional* coverage on route replacement or
requirement growth, exactly as today. It never clears a committed or
unchanged leaf. This is the approving review's "no global cache revision
restarts otherwise stable progress"; the witness in section 16 checks it.

**(P5) Drives inside a call stay visible.** If the selection's raft read in
evaluation *k* applies committed entries into the cache (14.2), the table
version moves, so evaluation *k+1* observes the plan anew, as it does today.

### 15.4 Side effects the reuse skips

| Effect | Skipped when | Equivalent because |
| --- | --- | --- |
| `refreshConfig` (sets `propagationMode`, writes publication-mode diagnostics) | the plan is reused (equal stamp, so equal config revision) | under an unchanged configuration it writes nothing new: safe mode re-writes REPAIR_ONLY/CONFIG_SAFE_MODE, which the safe wave also writes (`durable-delivery.js:283`, `:256-260`); grouped mode writes only on a transition (`cdc-group-propagation-service.js:221-242`) |
| route refresh | equal plan object and equal progress revision | P3 (idempotent) |
| branch-tag reset | never skipped | still per check (`partition-cdc-obligation-progress.js:36-38`) |
| selection, and its topology-repair request on the non-core-leader path | never skipped | the selection is not stamped (ruling Q2-Q4) |

### 15.5 The cache version fix (F4)

- **Fix** (`src/cache/system-table-cache.js` `clear()`): the per-table mutation
  version is no longer reset, and `clear()` advances every table's version,
  because removing every row is a change. The version is monotonic for the life
  of the cache instance. A consumer must still key on the cache's identity as
  well, because a different instance has its own counter; the plan stamp does.
- **Red-first witness:**
  `test/cache/system-table-cache-mutation-version-survives-clear.test.js`. It
  inserts a row, clears, then inserts a different row (back to the same number
  of applies). The raw version, and the key of a real version-keyed consumer
  (`readMembershipPlanningDerivationVersionKey`), must differ from before the
  clear.
- **Other consumers keyed on this version.** They inherit the fix. None relies
  on the reset: every one compares for equality or concatenates the value into
  a key, and none treats 0 specially or expects a value after `clear()`.

  | Consumer | Location |
  | --- | --- |
  | membership-planning version key | `src/control-plane/membership-planning-version-key.js:46-63` |
  | readiness semantic generation | `src/control-plane/readiness-planning-semantic-generation.js:203-208` |
  | readiness semantic currency | `src/control-plane/readiness-planning-semantic-currency-methods.js:265` |
  | readiness snapshot owner | `src/control-plane/readiness-planning-snapshot-owner.js:360` |
  | projection readiness evidence generation | `src/control-plane/projection-readiness-evidence-generation.js:370-386` |
  | readiness snapshot store (SERVICES) | `src/control-plane/control-plane-readiness-snapshot-store.js:56` |
  | global topology blocking-operation view (REPLICA_OPERATIONS memo) | `src/rebalancer/global-topology-blocking-operation-view.js:18-21` |
  | priority-recovery follow-up decisions | `src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js:455-456` |
  | admin control snapshot repair | `src/admin/admin-control-snapshot-repair-orchestration.js:64-70` |
  | the cache's own revision watermarks | `src/cache/system-table-cache-cdc-observation.js:76-79` (records the current version; its watermarks are still cleared by `clear()`) |
  | read-only cache (forwards) | `src/cache/read-only-system-table-cache.js:116` |

  Tests: `test/cache/system-table-cache-observation.test.js` asserts watermark
  revisions 1 and 2 *before* `clear()` and that the watermarks are empty after
  it. Both still hold: per-instance counting is unchanged, and the watermarks
  are still cleared.
- **Reachability of the old hole:** the only production caller of `clear()`
  is the failed-bootstrap cleanup (`src/bootstrap/phases/seed-cleanup-handler.js:229-232`).

## 16. Stage 2b evidence (EXECUTED, adam-laptop)

| Step | Commit | Lab output | Result |
| --- | --- | --- | --- |
| red-first witnesses | `8abec5e92c64c38c7272ea1f8a97d52a29e541f6` | `lab/cdcstamp-2b-red/`, `lab/cdcstamp-2b-red.console.log` | witness file 59: 54 pass, 5 fail (2 plan bounds, 2 selection bounds, plan reuse "rebuilt 2"); cache witness **red** ("before 1, after clear and one apply 1") |
| 2b repair | `82295c47e5bc3825dcb301c20536decc8e1509c3` | `lab/cdcstamp-2b-fix/`, `lab/cdcstamp-2b-fix.console.log` | 26 files: 24 pass, 2 fail (see below) |
| rerun of the one unexpected failure, alone | `82295c47e` | `lab/cdcstamp-2b-fix-fgb/` | `cdc-group-propagation-foreground-boundary.test.js` passes (file 4.9 s) |

Counts for one delivery of one range with nothing changing:

| | Plan rebuilds before → after | Currentness raft status reads before → after |
| --- | --- | --- |
| 1 target group | **251 → 1** | 243 → 243 (selection not stamped) |
| 3 target groups | **697 → 1** | 685 → 685 |

The witness file after the repair: 59 tests, 57 pass, and the 2 failures are
exactly the two selection bounds, which stay red by ruling. Green:

- all 49 negative cases, on the real tree; `tree.routing-order` on its stub;
- the structural case;
- the deadline anchor and the selection anchor;
- the two plan bounds, plan reuse, the unrelated-change witness and the
  cross-turn witness.

The cache witness, the config revision test and the tree generation test are
green.

The fixture change for the negatives: the stage-1 fixture used a stub tree. A
stub cannot expose a routing generation, so the stamp would be unknown and
the negatives would never exercise it. The negatives therefore now run on the
real `LatencyTreeService` over the same cache. Every case's expectation is
unchanged; the routing-order case keeps the stub because its mutation *is*
the stub's order. All 49 were green on the red-first commit with the real
tree, before the repair, and are green after it.

Regression set run on the repair, all green apart from the two intended reds
and one load-dependent timeout:

- cache: `system-table-cache`, `-observation`, `-row-preview`,
  `read-only-system-table-cache`;
- config: `configuration-manager`;
- tree: `latency-tree-service`;
- partition: `partition-cdc-topology-progress-currentness`,
  `partition-cdc-lane-wave-isolation`, `partition-cdc-lane-typed-backpressure`;
- topology: `cdc-group-propagation-service`, `-wave-lifecycle`, `-wave-isolation`,
  `-stop-arms-nothing`, `-proposal-cost`, `-transport-outcome-failed-set`,
  `-foreground-boundary`, `cdc-recipient-domain-and-retained-debt`;
- message group: `message-group-cdc-receiver-admission`,
  `message-group-native-provisional-route`, `message-group-native-custody-handoff`;
- bootstrap: `seed-teardown-pending-cdc-delivery`, and
  `cdc-source-occurrence-delivery.integration`. That one is the only run of the
  stamp over the real cache, tree, config and router; it is green.

The one unexpected failure: `cdc-group-propagation-foreground-boundary.test.js`
"foreground consumer rechecks stop after actual ATTEMPTS_EXHAUSTED" failed with
`testTimeoutFailure` (6.3 s budget). That is the file's first case, which
carries its setup, during the 24-file parallel run; every later case in the
file took about 0.1 s. Its fixture (`topologyProgressFixture`: projection cache
without versions, stub tree) makes the plan stamp unknown, so the repaired
code observes the plan exactly as before. The file passes alone on the same
commit. Classified as load-dependent, not a regression. A paired run of the
base commit under identical load was not made.

## 17. What a selection stamp would require (not done; numbers for the decision)

After 2b the check still reads raft status **243 times per delivery to one
target group, 685 to three**: one read per currentness selection evaluation
on a node whose local MG replica leads (anchor). That is **221 more per extra
target delivery**. A selection stamp would bring this to ≤ 1 per delivery,
saving about 242 and 684. In the seed's formation profile the status read is
the `readStatus` subtree (8.8 % of formation samples, inclusive), plus most of
the 2.7 % status-shaping `deepFreeze` (attribution INFERRED, causal report §2).

What each owner would have to add:

| Owner | Addition |
| --- | --- |
| bootstrap MG registry (`bootstrap-service.js:282,562`; writers `seed-message-groups-phase.js:170`, `create-message-group-replica-lifecycle.js:150,243`, `move-replica-handoff-owner.js:496`, `join-cleanup-handler.js:640`; joining `node-joining-owner-construction.js:228,285,588`) | an owned registry with a generation advanced by every set, delete and clear, exposed through the selection owner (`bootstrap-message-group-selection-owner.js`) |
| MG leadership (`replica-leadership-state.js:62-121`, wired in `message-group-service-raft-lifecycle.js:312-345`) and MG lifecycle (`initialized`/`isShutdown`, `message-group-service-state.js:326-328`) | a per-MG published-role generation advanced by every role or leader write, and a lifecycle generation |
| raft-rs runtime and operation port (`raft-rs-runtime-owner.js` `recordStatusObservation` :1501-1506, health transitions, reconstruction; `raft-rs-operation-port.js`) | a per-group **status generation**, advanced whenever the readable (outcome, raftState, health, runtime/lifecycle generation) changes, exposed by a port operation **that never drives the group**. This is a port contract change (R08) for every port implementation, including `ControllableConsensusPort`. The non-driving read is also what would make 2a provable (14.2) |
| MG forwarding owner (`message-group-forwarding-owner.js:264-492`) | either the non-core-leader path stays evaluated per read (recommended), or a census of its inputs (strict-forwarding policy, cache rows already versioned, router connection state, which has no version today) plus consent to the changed repair-request frequency |
| proof | the negative fixture: the production selection over a real MG that is also the propagation source and commits on apply (`ControllableMessageGroupService` + `port.commit`, or the native fixtures) |

## 18. Siblings: follow-ups, not changed (counts)

| Sibling | Per delivery (one subscriber, one target) | Basis |
| --- | --- | --- |
| async operational selection | 1 evaluation (measured `deliverySelections` = 1); in production 1 raft status read when the leader is ready, 2 when it is not (`message-group-selection.js:195-221`). Correction to section 11: the second read happens only on not-ready | measured / source |
| subscriber readiness (`canAcceptCDCEvent`) | 2 calls (wrapper and original `deliverCDCEventToSubscriber`, `partition-cdc-delivery.js:469,495-497`). In production each reaches MG `canAcceptCDCEvent` → `resolveNativeCdcIngressDecision`: `nativeCdcObservation` `readStatus()` + `isCurrentRaftLeader()` `readStatus()` = **4 raft status reads** | source (this fixture's double answers readiness without a port) |
| MG source apply: `captureCdcParentGrant`, `enclosingCdcRemainingMs`, `parentWaitIsLive` | full checks ×2-3 per call, per source apply, wait re-arm and settle | source (the fixture's source double does not run them) |
| `getCurrentTerm()` | one status read per MG role event, not per delivery | source |
| the duplicated selection evaluations inside one read (transport triple, child `remainingMs`, progress-bound double) | part of the 243/685 above | measured |

## 19. Stage 2 findings for the lead

- **2a stopped at its premise** (14.2). The check's own raft status read can
  drain inbound synchronously: apply committed entries into the cache,
  announce role changes, possibly reconstruct. So the duplicated evaluations
  in one call are not provably equal. A single plan-then-selection evaluation
  would answer from a plan read before its own drive. 2a would need a
  non-driving status read (the selection unit's port change) or a census.
- **2b done:** 251 → 1 and 697 → 1 plan rebuilds per delivery. The 49
  negatives and both anchors are green. A moved stamp re-observes without
  touching stable progress (witnessed).
- **The tree joined the stamp**, which the ruling did not list. That is
  required by the Q1 ruling: the shared plan's order seeds new progress leaf
  order, and the tree recomputes with no further cache version.
- **Navigability.** *Superseded (section 20):* the optional-call reads were
  capability probes in another spelling; the corrective round requires each
  version source at wiring and converts the test doubles.
- **Cache `clear()` fix:** monotonic per instance. No consumer relied on the
  reset. Consumers must also key on the cache's identity; the plan stamp does.

# Corrective round (lead, after independent verification APPROVE-WITH-CONDITIONS)

## 20. Corrective round: required versions, load-bearing components, one table list

Commits (all on `work/cdc-currentness-stamp-20261121`, pushed):

| Step | Commit | Content |
| --- | --- | --- |
| C1 red-first witnesses | `f150ae13fe4981d944105093e0f02ddf9608b2d5` | wiring refusals (cache, tree), production composition, moved-during-build, per-component cases |
| C2 repair | `873570c54b7a32c779a061a50ca4f3fd52b853ff` | wiring validation, required reads, one table list, entry/after stamp comparison, fixture conversions, configuration refusal, structural seam case |

### 20.1 Item 1: required versions, validated once at wiring

- `src/topology/cdc-group-propagation-collaborators.js` (owner contract header,
  the readiness-collaborators pattern): `assertPropagationCollaborators(wiring)`
  requires of the cache `get`, `getAll`, `filter`, `getTableMutationVersion`;
  of the tree `getRoutingOrder`, `getRoutingGeneration`; of the configuration
  `get`, `getRevision`. A missing capability throws an `Error` with
  `code: 'cdc_group_propagation_collaborator_invalid'`, `collaborator`,
  `capability`, and a message naming both.
- Called from `CDCGroupPropagationService.initialize` **before** any field is
  taken: the wiring (current fields overridden by the options given) is
  asserted (the existing nodeId/cache/tree criticals, then the capabilities),
  and only then are the in-flight waves retired and the fields assigned. A
  refused wiring leaves the service as it was. Every production wiring goes
  through `initialize` (`LatencyTopologySetup.create`, the two bootstrap
  owners); `config` is the `ConfigurationManager` singleton taken at
  construction.
- The router is **not** validated: it is not a version source. The stamp holds
  its identity; an unwired router is the plan's own named
  `MESSAGE_ROUTER_UNAVAILABLE` outcome (routing.js:687-692, unchanged).
- `cdc-group-propagation-durable-plan.js` now reads every component directly:
  `owner.config.getRevision()`, `tree.getRoutingGeneration()`,
  `cache.getTableMutationVersion(table)`, `owner.propagationPlansAtStamp.get/set`.
  No optional call remains in the stamp, and there is no "unknown stamp".
- Converted fixtures (now supplying real versions):
  - `test/topology/cdc-group-propagation-service-harness.js`:
    `createTopologyCache` is the real `SystemTableCache` with INSERTs; one
    `createStatedRoutingTree(order)` (generation constant 0, since a stated
    order never changes) for tests whose subject is an order stated once;
    `composeWaveTopology` uses it.
  - `test/test-helpers/cdc-topology-progress-fixture.js`: the projection is the
    real cache with owner-path helpers (`putService`, `updateService`,
    `renameService` = DELETE + INSERT, `updateNode`, `putGroup`, `updateGroup`,
    `renameGroup`), each write a newer `updated_at`; the tree is the real
    `LatencyTreeService` over it (single and multi-lane).
  - `test/partition/partition-cdc-topology-progress-currentness.test.js`: every
    in-place mutation goes through those helpers; its last test's inline cache
    is `createTopologyCache`, its stub tree the stated tree.
  - `test/topology/cdc-recipient-domain-and-retained-debt.test.js`:
    `createDualDomainTopologyCache` is the real cache (edges keyed
    `latency_edge_id`); its two later rows are written through the owner.
  - `test/topology/cdc-group-propagation-wave-lifecycle.test.js`: the mutable
    inline cache and tree are a real cache written through the owner and a real
    tree; the second inline stub tree is the stated tree.
  - stub trees → stated tree: `cdc-group-propagation-service.test.js`,
    `seed-teardown-pending-cdc-delivery.test.js`,
    `cdc-group-propagation-proposal-cost.test.js`,
    `cdc-group-propagation-stop-arms-nothing.test.js`,
    `cdc-group-propagation-transport-outcome-failed-set.test.js`.
  - the stage witness file: the `tree.routing-order` negative now runs on the
    real tree (two latency groups; a latency edge, which is no plan table, plus
    a `recompute` reverses their order, asserted as setup); the
    `topology.tree-identity` case re-wires a real tree; the stub-tree fixture
    option is gone.
- Red-first: C1 run `lab/cdcstamp-c1-red/` (`.console.log`): 67 tests, 62 pass,
  5 fail. The failures were the two selection bounds (by ruling) and three
  red-first witnesses: the cache refusal and the tree refusal (both "Missing
  expected exception": the service accepted a versionless collaborator) and
  the moved-during-build case (20.5). Green after: C2 run `lab/cdcstamp-c2/`.
  The configuration refusal was added with the repair (C2): the configuration
  is the construction-time singleton, so its test replaces `service.config`
  before `initialize`; it has no red-before run.

### 20.2 Item 2: the production composition's stamp is known

`the production topology composition wires a known plan stamp: a second
identical delivery reuses the plan`: `LatencyTopologySetup.create` with a real
`SystemTableCache`, the `ConfigurationManager`, the real tree it constructs and
a real `MessageRouter` to an in-process peer. Two identical deliveries: the
first observes the plan once, and the second observes it zero more times. It
was green at C1 as well, because every production collaborator already exposed
its version at 82295c47e. Its job is to pin that: a production collaborator
without a version would now be refused at wiring, and before C2 it would have
made this count 2.

### 20.3 Item 3: every stamp component load-bearing

The stamp (C2), and the components removed with the reason each could not be
load-bearing:

| Removed | Why no owner path moves it independently |
| --- | --- |
| configuration identity | `this.config` is taken once in the constructor; no writer reassigns it (searched `src/`). The configuration revision stays |
| `router.deliver` identity | grouped mode reads only `typeof router.deliver === 'function'` (routing.js:689). `deliver` is a `MessageRouter` prototype method; no `src/` writer assigns `.deliver` on a router (the one `this.deliver =` is `wasm-writer-client.js`, not a router). A router with or without `deliver` is a different router identity, which stays |
| `owner.propagationMode` | written only by `refreshConfig` (service.js:226,238), from the configuration, at the start of every observation; covered by the configuration revision |
| `source.groupId` | plans are held per source object (`propagationPlansAtStamp` is keyed by the source), and a message group's `groupId` is fixed at construction. Renaming a held source is the `source.group-id` negative, which answers not current before the plan is read (progress.js:167-173) |

Per component, the case that fails when that component is dropped (each
changes exactly that input through its owner):

| Component | Case that catches its removal | Change |
| --- | --- | --- |
| SERVICES version | `services.*` negatives (e.g. `services.address`) | cache write |
| NODES version | `nodes.*` negatives (e.g. `nodes.boot-incarnation`) | cache write |
| LATENCY_GROUPS version | `latency-groups.*` negatives | cache write |
| MESSAGE_GROUPS version | `message-groups.*` negatives | cache write |
| configuration revision | `config.propagation-mode` | `setByPath` |
| tree routing generation | `stamp component: the tree routing generation (a recompute alone reorders the plan)` | latency edge (no plan table) + `recompute` |
| tree identity | `stamp component: the tree identity (a tree re-wired at an equal generation)` | `initialize({latencyTreeService})`, equal generation |
| cache identity | `stamp component: the cache identity (a cache re-wired at equal table versions)` | `initialize({systemTableCache})`, equal versions |
| router identity | `stamp component: the router identity (a router wired late makes grouped targets routable)` | `initialize({messageRouter})` |
| `owner.nodeId` | `topology.node-id` | field |
| `owner.messageGroupReplicaSuffix` | `topology.replica-suffix` | field |

The four component cases were added at C1 and were green there, because C1's
stamp held these components. Their red evidence is the mutants below.

### 20.4 Item 4: one declared table list, read by the routing and iterated by the stamp

- `CDC_PROPAGATION_PLAN_TABLE` (`src/topology/cdc-group-propagation-constants.js`):
  SERVICES, NODES, LATENCY_GROUPS, MESSAGE_GROUPS. The routing owner
  (`cdc-group-propagation-routing.js`) no longer imports `TABLES`. All 22
  table reads name `PLAN_TABLE.*`. The stamp iterates
  `Object.values(CDC_PROPAGATION_PLAN_TABLE)`.
- Structural case `the plan reads system tables only through
  CDC_PROPAGATION_PLAN_TABLE, the list its stamp iterates`. A real cache wrapped
  in a recording `Proxy` (every call whose first argument is a system-table
  name is recorded with its method; internal calls run on the cache itself)
  serves as the wired cache, beside a real tree. One real
  `propagationPlanAtStamp` runs in safe mode and one in grouped mode. It
  asserts three things:
  - every row read (any method but `getTableMutationVersion`) names a listed
    table;
  - the stamp's version reads are exactly the list in each mode;
  - the union of row reads over both modes equals the list (the list holds no
    unread table).
  It catches a routing read of a table outside the list whichever cache method
  it uses. It is a guard added with the list (C2), so it has no red-before run
  on the repair; its red evidence is the probe mutant below (a routing read of
  `INTER_GROUP_LATENCIES`).
- Not covered by it: a plan input that is not a cache table (a new owner
  field, a new collaborator). Those stay the stamp's enumerated components and
  the negative family's job; the enumeration's own structural case only checks
  the list is well formed (12, corrected).

### 20.5 Item 5: no plan is held across a move during its build

`propagationPlanAtStamp` takes the stamp **before** the observation, observes,
then takes it again. If the two differ, the plan is answered to this caller
but **not held**, and the source's held entry is deleted. The next read then
observes anew. If they are equal, the plan is held under the entry stamp.
This replaces 15.3 (P1)'s "the stamp is taken after the observation", which
would have held a plan read before a mid-build move under the stamp after it.

What makes it self-enforcing: the comparison is in the one function that holds
plans. Any input change reached through a call the observation makes moves a
stamp component, so it is caught: a raft drive applying into the cache, a
recompute, or a configuration write. Taking the stamp before the build
captures the configuration revision before `refreshConfig`, which never bumps
it (it only reads the configuration).

Witness: `a plan input moved during a plan observation is not held: the next
read observes anew`. During the first observation, a cache write is injected
through the counted tree read. Three direct reads follow: the first and second
both observe (count 2) and return different plan objects; the third (nothing
moved) returns the second's object. Red at C1 (`lab/cdcstamp-c1-red/`; the
stamp taken after the build held the first plan, count 1), green at C2.

### 20.6 Item 6: the foreground-boundary timeout, paired

The same selection was run at the pre-fix commit and at C2, back to back on
adam-laptop (`lab/cdcstamp-pair-files.txt`). It has 24 files: the 26-file
selection less `configuration-manager-revision` and
`latency-tree-routing-generation`. Those two were added in `82295c47e`, so
they do not exist at `8abec5e92` (the first attempt with 26 files was a runner
failure: "unclassified or missing test file").

| Run | Commit | Output | Files | `foreground consumer rechecks stop after actual ATTEMPTS_EXHAUSTED` |
| --- | --- | --- | --- | --- |
| base | `8abec5e92` (pre-fix) | `lab/cdcstamp-pair-base/` (finished 18:39:52) | 20 pass / 4 fail | **timeout**, 6454 ms (budget 6000) |
| head | `873570c54` (C2) | `lab/cdcstamp-pair-head/` (finished 18:41:42) | 22 pass / 2 fail | **timeout**, 6981 ms |

The C2 regression run (`lab/cdcstamp-c2/`, 28 files) also timed out at 6101 ms.

**Classification: pre-existing, load-dependent; not introduced by the stamp.**
The case times out at the pre-fix commit under the identical selection, on the
same host, back to back. It is the file's first case, which carries the
fixture setup. Every later case in the file runs in about 0.1 s, and the file
passed alone at `82295c47e` (`lab/cdcstamp-2b-fix-fgb/`).

Other failures in the pair:
- base: the red-first witnesses at that commit (cache version across
  `clear()`; the stamp file's plan bounds, selection bounds and plan reuse).
- base: `message-group-native-provisional-route` "SERVICES scan releases
  provisional relay to the real native leader" (17.6 s, `held_by_subscriber`
  where `drained` was expected). It is green at C2 in the pair, in the C2 run
  and in 2b-fix. It was observed once at the pre-fix commit and is not
  investigated here.
- head: only the two selection bounds (by ruling) and the timeout above.

### 20.7 Item 7: record corrections

- 4.1 and 5.3: readers do **not** all get clones. `get` and `find` clone;
  `getAll`, `filter` and `getShared` return the stored row itself, frozen in
  place (`readView` → `deepFreeze`,
  `system-table-cache-observation-methods.js:446-489`). Rows still cannot be
  written through a reader, and the owner replaces rather than mutates a stored
  row (`mergeRecords` builds a new object, `system-table-cache-row-merge.js:491-511`).
- 12: the enumeration's structural case does not catch an input added
  without a case (corrected in place; 20.4 adds the cache-seam case).
- 15.2 and 19: optional calls were a capability probe in another spelling, not
  the navigability rule (corrected in place; superseded by 20.1).

### 20.8 Probe mutants (detached at C2, local `probe/` refs, never pushed)

Each mutant is one change on `873570c54`, committed through the hook. The
stage witness file was run alone on adam-laptop.

| Mutant | Ref / commit | Change | Lab output | Killed by |
| --- | --- | --- | --- | --- |
| tree generation dropped | `probe/cdc-mutant-tree-generation` `24e8185e5c5dcc7dcecaecaa625d81b3aa45dc6d` | `tree.getRoutingGeneration()` removed from `planStampOf` | `lab/cdcstamp-mutant-tree-generation/` | **only** `stamp component: the tree routing generation`: 69 tests, 66 pass, 3 fail (it plus the two ruled selection bounds). The new progress kept the held plan's order `[stamp-lg-a, stamp-lg-b]` after the recompute reversed it |
| router identity dropped | `probe/cdc-mutant-router-identity` `1fddbf46bb7b247cf292845e6a62b1cd6b4fab0e` | `owner.messageRouter` removed from `planStampOf` | `lab/cdcstamp-mutant-router-identity/` | **only** `stamp component: the router identity`: 69 tests, 66 pass, 3 fail. With the late-wired router, the drive stayed `held_by_subscriber` (the held MESSAGE_ROUTER_UNAVAILABLE plan) instead of `drained` |

The lead named `router.deliver` for the second mutant. That component no
longer exists (20.3: no owner path moves `deliver` without moving the router
identity), so the mutant drops the router identity instead.
| routing reads a table outside the list | `probe/cdc-mutant-table-outside-list` `0dcbc4d361ff0f4acb1aec038b0b679494134be4` | `collectDrainingLatencyGroupIds` also calls `systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES)` | **not executed**: the one attempt was a runner failure (adam-laptop busy, held by another agent); handed back before a rerun | expected: the structural seam case only |

(Table row above belongs to 20.8's table.) To finish: rerun
`focused.mjs 0dcbc4d361ff0f4acb1aec038b0b679494134be4 adam-laptop … lab/cdcstamp-mutant-table-outside-list test/partition/partition-cdc-currentness-stamp-witness.test.js`.

## 21. Closing items (after the independent re-check approved 873570c54)

Commits (pushed): C3a red-first witnesses `ac0ed01932dca583e436f320de00a3798bccc219`,
C3b repair `4a1f3f11dc792cf295cd6be2943e84be355f9454`.

### 21.1 Third mutant (routing reads a table outside the list): killed

`probe/cdc-mutant-table-outside-list` `0dcbc4d361ff0f4acb1aec038b0b679494134be4`,
stage witness file alone, `lab/cdcstamp-mutant-table-outside-list/` (adam-laptop):
69 tests, 66 pass, 3 fail. The only failure besides the two ruled selection
bounds is the structural case: "the safe plan read inter_group_latencies
(getAll) outside CDC_PROPAGATION_PLAN_TABLE, so outside its stamp".

### 21.2 Dead collaborator probes deleted (C3b)

Line numbers are those at `873570c54`. Every site now calls the validated
collaborator directly.

`src/topology/cdc-group-propagation-routing.js`:

| Line(s) | Function | Deleted probe |
| --- | --- | --- |
| 46 | `resolveActiveMessageGroupServices` | `typeof options.predicate === 'function' ? … : null` → `options.predicate ?? null` (an internal parameter, not a collaborator; converted with the rest) |
| 47-49 | `resolveActiveMessageGroupServices` | `typeof options.systemTableCache?.filter !== 'function'` → `[]` |
| 147 | `observedServiceRoute` | `systemTableCache?.get?.(NODES, …)` |
| 198 | `collectActiveLatencyGroups` | `systemTableCache?.getAll?.(LATENCY_GROUPS) \|\| []` |
| 203 | `collectDrainingLatencyGroupIds` | `systemTableCache?.getAll?.(LATENCY_GROUPS) \|\| []` |
| 225 | `collectActiveMessageGroups` | `systemTableCache?.getAll?.(MESSAGE_GROUPS) \|\| []` |
| 237-240 | `collectActiveServiceRows` | `typeof systemTableCache?.filter !== 'function'` → `[]`; `filter(…) \|\| []` |
| 278-279 | `collectKnownMessageGroupDomain` | `nodeId && options.systemTableCache` (cache presence) and `.get?.(NODES, …)` |
| 304 | `resolveLatencyGroupRow` | `systemTableCache?.get?.(LATENCY_GROUPS, …)` |
| 319 | `resolveLatencyGroupTargetCandidates` | `options?.systemTableCache` |
| 340 | `resolveLatencyGroupTargetCandidates` | `domain.groupIdsByLatencyGroupId?.get?.(…)` (the domain is always built by `collectKnownMessageGroupDomain` with its Map) |
| 372-374 | `resolveSourceLatencyGroupId` | `if (!cache) return null` |
| 376, 380, 383, 396, 405 | `resolveSourceLatencyGroupId` | `cache.get?.(…)` ×5 |
| 388-392 | `resolveSourceLatencyGroupId` | `cache.filter?.(SERVICES, …) \|\| []` |
| 420-421 | `readRawRoutingOrder` | `options.latencyTreeService?.getRoutingOrder?.(…)` and `Array.isArray(rawOrder) ? rawOrder : []` |
| 483-485 | `isPreActivationLatencyGroup` | `if (!systemTableCache) return false` |
| 500 | `isPreActivationLatencyGroup` | `systemTableCache.get?.(NODES, …)` |
| 505-511 | `isPreActivationLatencyGroup` | `systemTableCache.filter?.(SERVICES, …) \|\| []` |
| 524 | `collectUnmappedLatencyGroupIds` | `options.systemTableCache?.get?.(NODES, …)` (the row's own `?.[…]` stays: a row may be absent) |
| 584 | `buildSafeTargets` | `options.systemTableCache?.get?.(NODES, …)` (row `?.[…]` stays) |
| 622-623 | `resolveGroupedTargetEntry` | `&& options.systemTableCache`; `domain.groupIdsByLatencyGroupId?.entries?.() \|\| []` |
| 632, 635 | `resolveGroupedTargetEntry` | `options.systemTableCache.get?.(…)` ×2 |
| 645-646 | `resolveGroupedTargetEntry` | `&& options.systemTableCache`; `.get?.(MESSAGE_GROUPS, …)` |
| 688-693 | `isMessageRouterDeliverable` (deleted) | `Boolean(messageRouter && typeof messageRouter.deliver === 'function')`. A wired router is now validated to deliver at wiring, so deliverability is `options.messageRouter !== null` |
| 717 | `buildGroupedContext` | `options.systemTableCache?.get?.(NODES, …)` |

`src/cdc/cdc-propagation-progress.js` (siblings, the latency transfer):

| Line | Deleted probe |
| --- | --- |
| 57 | `!systemTableCache \|\|`: `progress.cache` is the owner's validated cache, taken when the progress is created (:146) |
| 66-67 | `owner?.nodeId ?? null` → `owner.nodeId`; `owner?.messageGroupReplicaSuffix` → `owner.messageGroupReplicaSuffix` |

Kept, because these are row values and not collaborators: `row?.[…]`,
`serviceRow?.[…]`, and `s?.[COLUMN.SERVICE_ID]?.startsWith?.(…)` at
routing.js:391 (a row field that may be absent or not a string).

**Reachable before `initialize` validated the wiring?** No routing read is.
The routing functions are reached only through two paths:
- `captureDurablePropagationPlan` ← `propagationPlanAtStamp` ←
  (`cdcPropagationProgressCurrent`, the wave's admission and post-success
  captures);
- the progress latency transfer ← route refresh.

Both run only inside a wave of `propagateCDCEvent`, which calls
`ensureInitialized()` first (`cdc-group-propagation-service.js:181` at C2). A
refused `initialize` leaves the state unchanged (CREATED for a new service).

The one gap is the coordinator's K-gap. `stop()` on a never-initialized
service set STOPPED, which let `start()` (and then `propagateCDCEvent`)
through unwired, ending in a TypeError. It is fixed in 21.4.

Two direct test callers of `buildSafeTargets` passed no tree and relied on the
probe answering `[]`: `message-group-native-provisional-route.test.js:106` and
`message-group-native-w7-multi-target-route.integration.test.js:155,333`. They
now state that empty order through `createStatedRoutingTree([])`, which gives
the same answer as before.

### 21.3 K1: versions are answered, not only exposed

- **Wiring** (`cdc-group-propagation-collaborators.js`): each version source is
  called once and must answer a version: `Number.isSafeInteger(value) &&
  value >= 0` (`isOwnerVersion`, the one definition). The sources are the
  cache's `getTableMutationVersion` for every table of
  `CDC_PROPAGATION_PLAN_TABLE`, the tree's `getRoutingGeneration`, and the
  configuration's `getRevision`. Otherwise the wiring gets the typed refusal
  `cdc_group_propagation_collaborator_invalid`, whose message names
  `collaborator.capability()`.
- **Read time** (`cdc-group-propagation-durable-plan.js`): if any version
  answer is not a version, `planStampOf` answers `UNHOLDABLE`, and
  `sameStamp` is false whenever either side is `UNHOLDABLE`. That plan is
  returned, not held, and never compared equal.
- A **constant** integer answer cannot be told apart from an unchanged version
  by one call. Whether each version moves is what the per-component cases
  and mutants of 20.3/20.8 witness for the production owners.

### 21.4 K-gap: a never-initialized service cannot start

- `stop()` on a CREATED service now returns: there is nothing to stop, and
  the service stays unwired.
- `ensureInitialized()` throws an `Error` with `code:
  'cdc_group_propagation_not_initialized'` (and the existing message) in
  place of the untyped `assertCritical`. Both `start()` and
  `propagateCDCEvent()` refuse a never-initialized service, also after a
  `stop()`.

### 21.5 Red-first and green evidence

- C3a red (`lab/cdcstamp-c3a-red/`, **tv-dator**; adam-laptop was twice held
  by another agent, both runner failures): 75 tests, 67 pass, 8 fail. The 8
  are the two ruled selection bounds and all six new witnesses:
  - wired router without `deliver` ("Missing expected exception");
  - cache, tree and configuration version answering `undefined` (each
    "Missing expected exception");
  - read-time unanswered version ("2 !== 3": the second read reused a plan
    held under `undefined`);
  - unwired start after `stop()` ("Missing expected exception").

### 21.6 Item 3: what the foreground-boundary first case spends its time on

**Product work, done once per process: the release owner's boot build
measurement.** It is not a wall-clock wait in the test or the fixture, and not
the topology or the delivery. The budget is not raised; this is a finding about
cost.

- **Reading the path.** The case's fixture runs on a `VirtualTimeSource`
  (`test/test-helpers/cdc-topology-progress-fixture.js:160`). Its settles are
  `setImmediate` turns (`participant-transaction-fixture.js:147,927-931`), and
  `maxAttempts` 1 arms no retry sleep. The lab per-case durations show a cost
  paid once per process:
  - this file: case 1 6.1–7.0 s, while case 4 (the same fixture and the same
    drive) takes 58–121 ms;
  - the stage witness file: its first case takes 6402 ms and its twin 121 ms.
- **Probe 1** (`probe/cdc-first-case-cost` `b04d1f84b183ee48cc1e2e028769b50f9ecc934a`,
  solo, `lab/cdcstamp-first-case-probe/`), cold then warm, in ms: SQL parse 9
  then 1; first bare `startLeader` + shutdown **3195** then 14; topology fixture
  16 then 7; drive 15 then 3.
- **Probe 2** (`probe/cdc-first-case-cost-phases` `5f6a507e51abaad8f8536089b6dba649e7b4b4bf`,
  solo, `lab/cdcstamp-first-case-phases/`):
  - leader construct + `initialize` cold: 12 ms wall, 17 ms CPU;
  - the first full leader start (generation origin + participant admission):
    **3116 ms wall, 4417 ms CPU**;
  - the same again warm: 14 ms.
  CPU exceeds wall, so this is CPU work across threads, not waiting.
- **The work.** `startLeader` → `resumeFixtureParticipantAdmission`
  (`participant-transaction-fixture.js:466`) → `readParticipantReleaseFacts`
  (:546) → `runtimeBuildProvenance()`
  (`src/partition/partition-participant-transaction-pause.js:138`). That is a
  process-wide memo (`src/diagnostics/runtime-build-provenance.js:88-91`,
  `bootMeasurement ??= measureBoot()`) whose first call runs `measureBoot`
  (:66-86). It:
  - verifies the raft-rs binding;
  - fingerprints the whole `src/` tree plus every file of every production
    dependency in the lock (`runtime-content-fingerprint.js:68-83`,
    `productionDependencyRecords` :42-);
  - sha256-hashes the SQLite addon and the node executable (124,836,408 bytes
    on this host).
  In production it is paid once per node boot. In the test suites it is paid
  by whichever test of a process first reads the participant release facts.
  About 3.1 s solo on adam-laptop becomes more than 6 s under four-way
  parallel load (the 6 s budget is `scaleByMachineFactor(3000)`,
  `cdc-group-propagation-foreground-boundary.test.js:20-22,117-118`).

### 21.7 The base-only `message-group-native-provisional-route` failure (not chased)

At 8abec5e92 "SERVICES scan releases provisional relay to the real native
leader" failed at the redrive (test :408): the answer was
`held_by_subscriber` (B held, `retryDelayMs` 50), where `drained` was
expected. It is green at head in both head runs.

My stamp change did not fix a stale held plan there: 8abec5e92 is before the
stamp and **holds no plan at all**; every currentness check observes the plan
anew. So no stale plan exists at base to be held by a subscriber.

The fixture runs on virtual time, but its pump hands cache notifications a
real next-turn hop and races a real 2 ms idle timer
(`message-group-native-provisional-route-fixture.js:120-140,215-235`). The
redrive's outcome therefore depends on how real turns interleave with the
pump under load. The most likely reading is an independent load-sensitive
flake of that interleaving. Base's per-read cost (the defect this repair
removes: hundreds of plan rebuilds per delivery) may make that interleaving
more likely, but one sample cannot tell, and it is not chased.

### 21.8 Green after, and the router doubles the new wiring contract surfaced

- **C3b `4a1f3f11d`** (`lab/cdcstamp-c3b/`, 32 files): 29 pass, 3 fail.
  - The stage witness passes 73 of 75; the 2 failures are the ruled
    selection bounds. All six C3a witnesses are green.
  - The foreground-boundary first case timed out (21.6).
  - `cache-hydration-strictness` failed: its BootstrapService test wired
    `service.messageRouter = {}`, and the router validation refused it ("messageRouter must expose
    deliver()"). That router is incidental and never reached, so it now has a
    `deliver` that throws. **C3c `8446194ab`**.
- **C3c** (`lab/cdcstamp-c3c/`, 43 files: the 32 plus every bootstrap and
  query file that can build the topology owners): 40 pass, 3 fail.
  - The same two known failures as above.
  - `create-self-hosted-registration`: also a `service.messageRouter = {}`
    double, reached by `NodeJoiningService.phaseQuerySystemState`. It got the
    same fix in **C3d `5c412e839`**.
- **Router-double census** (`lab/cdcstamp-c3c-router-census/`). I ran every
  remaining test file that assigns a router double without `deliver` (22
  files). None is refused at wiring.
  - Two fail: `growth-promote-authoritative-completion-and-progress` (assertions
    40/42) and `node-joining-service-message-group-activation` ("Failed to
    register node: … outcome is not known").
  - Both fail identically at the pre-work base `23344cddc`
    (`lab/cdcstamp-census-base/`), so they predate this work and are not
    caused by it.
- **Final head `5c412e839`**: see the confirmation run below.
- **Final head `5c412e83931fc871ae9a3f4e0afbfdb77a26ca2c`** (`lab/cdcstamp-final/`):
  - the stage witness passes 73 of 75; the 2 failures are the ruled selection
    bounds (raft status reads 243 and 685);
  - `cache-hydration-strictness` and `create-self-hosted-registration` pass.

  Between C3c and the final head only one test file changed, so the 43-file
  C3c run stands for the rest.
