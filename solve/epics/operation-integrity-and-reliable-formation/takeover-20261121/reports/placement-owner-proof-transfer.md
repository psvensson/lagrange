# Placement owner: authority as built, requirement gaps, proof transfer, retirement of the surrogate policy

Read-only design at `16300e756c68aa1b01b7f9cc37b2a1c873baf53b` (2026-11-21 12:12 +0100,
`work/core-integration-20261121`). Source was read with `git show 16300e756:<path>` and scoped `git grep`.
Nothing was written in a git worktree; no test, generator or cluster was run; no subagent was used.

Markers: **VERIFIED** = read at the path:line named beside it (all at `16300e756` unless a commit is given).
**INFERRED** = reasoned from verified facts, not observed. Every expected test result in this document is a
prediction; none was executed.

Inputs folded in: the owner's binding decisions (`lead-rulings.md`, "OWNER DECISION on D2" and "OWNER DECISIONS
(binding): placement owner as end state"), the coordinator's five refinements from the owner's external review
(construction invariant, snapshot facts versus owner field, no circular start, `LEADER_UNKNOWN` resume, negative
witness for the target leader), `surrogate-scheduling-owner.md`, `coupled-pairs-conventions.md`.

---

## 0. What the lead needs first

1. **The authority is a boolean, not a tenure.** The placement owner acts while `this.isLeader` is true. That
   boolean is set by the ledger partition service from its own raft role events. No term or tenure object is
   captured by a pass, carried in a proposal, or checked at apply. The fence that actually protects the ledger is
   raft itself plus a deterministic decision at apply (`PARTITION_BUSY`, capacity). Section 1.3, 1.4.
2. **The declared 60 s resync is not armed in production.** The owner arms the timer only when it is handed
   `setIntervalFn`; the production factory hands it none. The sealed placement-owner quest says the owner "arms
   exactly one timer". A missed wake therefore has no backstop in the production construction. Section 1.2.
3. **A pass that throws loses its triggers.** `drainQueue` has `try/finally` and no `catch`; the trigger set was
   already cleared. For a `LEADERSHIP_START` pass this also loses the one reconciliation of retained attempts for
   that tenure. Section 1.2.
4. **`LEADER_UNKNOWN` is computed and then discarded.** A waiting evaluation is not retained, not reported, and
   has no registered wake. It resumes only because any trigger re-runs a full pass. The fact that ends it is the
   owner row (`partitions.leader_node_id`), which arrives as `PARTITIONS_CHANGED`; the table declares
   `SERVICES_CHANGED`. Section 1.6, 2.
5. **The owner's own fixtures carry the old producer meaning.** They write `raft_role: leader` service rows. The
   production producer has emitted `follower` for every partition replica since `d1a099aaf`, so in production
   the owner learns a leader only through the fallback arm (`partitions.leader_node_id`). No test makes that arm
   the deciding one. This is the owner's lesson, repeated in the new owner. Section 1.6.
6. **The cutover is a flag, not a construction invariant.** Both code facts from the external review are
   confirmed (optional factory; existing-rebalancer branch before the guard). In the two production callers the
   order is safe; nothing proves it for every construction order. Section 1.1.
7. **The placement owner is not the only proposer of partition placement entries.** The provisioning path on any
   node can propose a `PLACEMENT`-kind ADD for a partition that already has routable replicas. Section 1.8.
8. **The surrogate policy is still computed for publication machinery**, but the `schedulingOwner` field it
   produces is read only by the unified rebalancer's partition follow-up lane. Section 4.

---

## 1. The production placement owner at `16300e756`

### 1.1 Construction

Production chain, all VERIFIED:

| Step | Code |
| --- | --- |
| Seed and join both call `ControlPlaneSetup.create` with `rebalanceCoordinator: this.rebalanceCoordinator` | `src/bootstrap/bootstrap-service-control-plane-runtime-methods.js:128-154`; `src/bootstrap/node-joining-publication-activation.js:424-446` |
| That field starts `null` on both paths | `src/bootstrap/bootstrap-service.js:315`; `src/bootstrap/node-joining-owner-construction.js:252` |
| The only `new RebalanceCoordinator(` in `src` | `src/bootstrap/shared/control-plane-setup.js:353-371` |
| Coordinator defaults: `replicaPlacementOwnerFactory = null`, `placementAdmissionEnabled = false` | `src/rebalancer/rebalance-coordinator-lifecycle.js:339-340` |
| Factory bound, 44 lines later, no `await` between | `src/bootstrap/shared/control-plane-setup.js:415-427` |
| Binding sets the flag | `src/rebalancer/rebalance-coordinator-operation-creation-support.js:603-608` |
| Partition services receive the coordinator after `create` returns | `src/bootstrap/shared/startup-runtime-surface-owner.js:46`; `bindControlPlaneServices()` at `bootstrap-service-control-plane-runtime-methods.js:178` |
| A ledger partition service attaches the owner | `src/partition/partition-service-rebalancer-methods.js:126-142` (`ensureReplicaPlacementOwnerAttached`), called first thing in `maybeInitializeRebalancer` `:147` |
| Coordinator side of the attach | `rebalance-coordinator-operation-creation-support.js:628-649` |
| Production attach helper | `src/bootstrap/shared/control-plane-setup.js:632-654` |
| Owner constructed and set as the ledger service's leadership sink | `src/rebalancer/replica-placement-owner.js:758-778` |
| With the flag set, no `UnifiedRebalancer` is built | `partition-service-rebalancer-methods.js:181-183` |

Attach preconditions (`:127-134`): the partition is `replica_operations-p1`, not shut down, no attachment yet, no
sink yet, a cache and a coordinator are present. The coordinator returns `null` (and the attach is retried on the
next `maybeInitializeRebalancer`) when the readiness service has no `serveEligibilityOwner` or there is no cache
(`support.js:632-634`). `maybeInitializeRebalancer` is called from raft init (`partition-service-raft-init-base.js:438`),
every leadership update while no rebalancer exists (`partition-service-leader-activation-methods.js:80-85`), the
dependency setters (`partition-service-split-accessor-base.js:677-783`) and readiness transitions
(`partition-service-core-base.js:466`).

**The two code facts from the external review, VERIFIED:**

- *Factory binding is optional.* The call is optional-chained (`control-plane-setup.js:415`,
  `bindReplicaPlacementOwnerFactory?.(`); the method returns without effect for a non-function
  (`support.js:604`); and a coordinator without a factory builds the owner itself
  (`support.js:636-648`). `registerLedgerPartitionService` also sets the flag (`support.js:617-618`), so the
  flag can become true late, when the first ledger replica appears on a node.
- *An existing rebalancer is handled before the guard.* `if (this.rebalancer) { ... return; }` is
  `partition-service-rebalancer-methods.js:149-180`; the placement guard is `:181-183`. A partition service that
  already holds a `UnifiedRebalancer` keeps it and keeps calling `setLeader` on it (`:173-177`), whatever the flag.

What this means. In the two production callers every coordinator is created at `:353` and bound at `:415` before
any partition service can hold it, so the flag is true before `maybeInitializeRebalancer` can reach `:184`
(VERIFIED for those two callers; INFERRED that no third path hands a partition service an unbound coordinator:
`PartitionService` accepts `options.rebalanceCoordinator` at `partition-service-core-base.js:241`, and the
runtime creators of partition services were not traced). The existing witness of the guard is a hand-built
object with a stub coordinator whose flag is already true
(`test/rebalancer/placement-removed-mechanism-and-caller-census.test.js:127-160`). It does not exercise flag-false,
the existing-rebalancer branch, or join order.

Two side differences between the factory path and the factory-less fallback (VERIFIED): neither passes a timer
(see 1.2); the fallback passes `workflowOwner: this.workflowOwner || null` and no resync options
(`support.js:639-648`), the factory path goes through `control-plane-setup.js:641-653`.

### 1.2 What starts a pass

All VERIFIED in `src/rebalancer/replica-placement-owner.js` unless noted.

| Trigger | Source | Code |
| --- | --- | --- |
| `LEADERSHIP_START` | `setLeader(true)` | `:282-295` |
| `LEDGER_COMMIT` | `ENTRY_COMMITTED` on the ledger service, own entries skipped; and a `replica_operations` cache change with a new row signature | `:304-308`, `:364-371` |
| `WRITE_PATH_RELEASED` | ledger service event | `:309-311` |
| `NODES_OR_FORMATION` | `nodeAuthority.subscribe` | `:321-325` |
| `SERVICES_CHANGED` | cache apply change on SERVICES | `:360-361` |
| `PARTITIONS_CHANGED` | cache apply change on PARTITIONS or TABLES | `:362-363` |
| `TARGET_CAPACITY_CHANGED` | storage accounting subscription | `:332-338` |
| `RESYNC` | `setIntervalFn`, only if supplied | `:339-344` |
| `PRESSURE_RELEASED` | declared, mapped, **never notified in `src`** | `replica-placement-owner-constants.js:164,224`; `git grep PLACEMENT_TRIGGER.PRESSURE_RELEASED -- src` has no producer |

Listeners are attached only while leading (`:291`, `:318-345`) and removed on demotion (`:286-289`, `:347-356`).
Every trigger joins one set; one pass runs at a time (`:375-398`). A pass evaluates **every** partition
(`:556-583`), so triggers are not scoped: any trigger clears any wait.

**Resync is not armed in production (VERIFIED).** The constructor keeps `options.setIntervalFn` with no default
(`:243`); the timer is created only `if (this.setIntervalFn && this.resyncIntervalMs > 0)` (`:339`). The
production factory passes `nodeId, ledgerPartitionService, controlPlaneReadinessService, rebalanceCoordinator,
systemTableCache, storageAccountingService, now, logger` and no timer (`control-plane-setup.js:415-427`);
the helper forwards `options.setIntervalFn`, which is `undefined` (`:650-652`); the fallback passes none
(`support.js:639-648`). `git grep setIntervalFn -- src` shows no other caller for this owner. The sealed quest
`replica-placement-admission-owner` states "The placement owner arms exactly one timer, the resync"
(`solve/quests/replica-placement-admission-owner/quest.json`, constraint `no-timer-no-bound-no-retry`). Source and
record disagree.

**A thrown pass drops its triggers (VERIFIED structure, INFERRED reachability).** `drainQueue` copies and clears
the trigger set, awaits `runPass`, and has `finally` without `catch` (`:381-398`). If `runPass` rejects, the copied
set is gone, the drain restarts only if new triggers arrived meanwhile (`:392-394`), and `notify` ignores the
returned promise (`:375-379`), so the rejection is unhandled. Candidates for a throw inside a pass: a SQLite
error in the census or attempt store (`:713`, `:278`); the CDC drive, which rethrows
(`src/partition/partition-cdc-obligation-delivery.js:619-623`); `resolveStatementSourceNodeId`, which
dereferences `find(...).nodeId` for a REPLACE (`:587-589`); a workflow-owner read in `canAdmitRemove`
(`:509-524`). Which of these can throw in production was not traced.

### 1.3 What the scheduling authority is, in code

| Layer | Fact | Code |
| --- | --- | --- |
| Raft core | role of the local `replica_operations-p1` replica | `service.raft.readStatus().role` |
| Partition service | `isLeader` set by the LEADER / FOLLOWER / CANDIDATE / LEADER_CHANGE events; a **tenure object** `{term}` is minted at the leadership edge, renewed on a term change while leading, ended on demotion | `src/raft/replica-leadership-state.js:38-60,62-80,94-103,153-206` |
| Sink | for the ledger partition the desired value is `Boolean(this.isLeader && !this.isShutdown)`, not the broader readiness predicate used for other sinks | `src/partition/partition-service-leader-activation-methods.js:72-79` |
| Owner | `setLeader(next)`; `if (this.isLeader === next) return;` | `replica-placement-owner.js:282-295` |

VERIFIED consequences:

- The owner holds **no term and no tenure**. It does not read `ledgerPartitionService.leadershipTenure`. A pass
  does not capture anything that identifies the tenure it started in. (For contrast, the CDC delivery owner on the
  same service captures the tenure object and re-checks it by identity:
  `src/partition/partition-cdc-delivery.js:67-71`.)
- A proposal carries no term: the command's fields are `type, entryId, partitionId, body, bodyText, timestamp,
  proposedBy, proposedAt` (`src/partition/partition-placement-admission-command.js:15-16,70-73`); the statement's
  fences are recorded data (`formationLatchEpoch`, `membershipPublicationEpoch`, `positions`:
  `src/rebalancer/replica-placement-owner-admission-statement.js:41-42`), and the owner fills only
  `positions.nodesEpoch` (`replica-placement-owner.js:673-675`).
- Apply checks no term, tenure or position. The decision is: ledger partition, entity busy, ledger transition
  unresolved, copy capacity, runtime-service claim, founding (`src/partition/partition-placement-admission-decision.js:202-239,316-333`).
- A new tenure on the same node that the role events did not separate (the case the tenure comment names:
  "a restored sole voter that campaigns again at a higher term", `replica-leadership-state.js:32-34`) leaves the
  owner's boolean true, so there is no `LEADERSHIP_START` pass and no reconciliation for the new term.
- The authority is local live consensus state. No cache row, no published owner field and no declaration takes
  part in deciding whether this node may schedule.

Activation delay: the LEADER event schedules activation behind a holdoff (default 250 ms) and the node's shared
activation scheduler (`src/raft/leader-activation-gate.js:7,39-93`;
`partition-service-leader-activation-methods.js:94-123`). `maybeInitializeRebalancer` also drives the sink
directly (`partition-service-rebalancer-methods.js:148`), so the owner can start earlier than the gate, never
later because of it.

### 1.4 One pass, and what a deposed node can still do

Steps of `runPass` (`replica-placement-owner.js:709-755`), with every `await`:

| # | Step | Reads | Await |
| --- | --- | --- | --- |
| s0 | guard `isLeader` and db | local boolean | |
| s1 | record seen operation signatures | cache `replica_operations` (`:404-412`) | |
| s2 | census | **local ledger db** (`:713`; `partition-placement-admission-decision.js:93-96`) | |
| s3 | `LEADERSHIP_START` only: drive the ledger's CDC obligations, re-read the census, hydrate and reconcile retained attempts | db (`:485-497`) | A1 |
| s4 | release an engaged ledger hold if no other copy runs | may **propose** (`:414-426`) | A2 |
| s5 | committed node answer; not READY means schedule a refresh and return | node authority (`:719-729`) | |
| s6 | busy set, copy occupancy, saturated targets | census (`:730-735`) | |
| s7 | storage exclusion per eligible node | storage accounting (`:527-539,736`) | |
| s8 | **move construction for every partition** | cache PARTITIONS and SERVICES (`:541-583,624-651`) | |
| s9 | per ordered candidate: stop check, re-evaluate saturated target, admissibility (`canAdmitRemove` reads the workflow owner), **propose** | (`:683-707`, `:653-681`) | A3, A4, A5 |
| s10 | `lastPassSnapshot = {state, admitted}` | (`:752-754`) | |

The owner's boolean is checked at s0 (`:710`), at the drain loop (`:385`) and once per candidate
(`shouldStopPlacementPass`, `:218-222,692`). It is **not** re-checked after A1 or A2 before s5-s8.

What a node that is no longer the ledger leader can still run, and what stops it:

| Work | Can it run on the deposed node? | What stops it |
| --- | --- | --- |
| Move construction (s8) | Yes. Before the demotion event reaches the owner, on any trigger; and once more after it, when a pass is parked at A1/A2 | Nothing at this step. Bounded by the event; the event is bounded by check-quorum step-down within an election timeout (`src/raft/raft-rs-group-constants.js:4-23`) |
| Capacity checks (s7, A3) | Same | Nothing at this step |
| Admission attempt (the call at A4) | Until the per-candidate check sees the boolean false | `replica-placement-owner.js:692` |
| Native proposal | Only while the local core still reports LEADER | `partitionWriteLeadershipRefusalOf` reads `raft.readStatus().role` (`src/partition/partition-service-raft-write-commit.js:420-431`), called first in `proposePlacementCommand` (`src/partition/partition-placement-admission.js:221-223`); typed `NOT_LEADER`, clearing trigger `LEADERSHIP_START` (`replica-placement-owner-constants.js:206`) |
| Commit of a stale proposal | Only if it reached a quorum in its own term; otherwise it is truncated. Its pending answer is released as leadership lost | INFERRED from raft; release at `src/partition/partition-service-raft-lifecycle-wiring.js:49-54,96,108` |
| Apply | Every replica applies the same deterministic decision | `partition-placement-admission-decision.js:316-333`. **No term or tenure check** |

So: fence at propose = local raft role; fence at apply = state-conditional decision, not a tenure fence; fence on
construction and capacity work = none.

During a graceful transfer the port defers proposals (`TRANSFER_IN_PROGRESS`,
`partition-service-raft-write-commit.js:59-71`), re-proposes within the deferral budget, then the write is
released: nothing enters consensus. The dirty case is the ungraceful one.

### 1.5 What survives restart

| State | Where | Durable? | Resumed how |
| --- | --- | --- | --- |
| Admitted operations | `replica_operations` rows, inserted at apply | Yes, replicated | Census at every pass (`:713`) |
| Outcome of every committed placement entry, admitted or refused | `_partition_statement_outcomes`, written at apply with the command fingerprint and the typed result | Yes, replicated (`partition-placement-admission.js:401-404`) | A re-proposal of the same `entryId` is answered from it (`:229-238`); a different command under the same id is refused `BYTES` |
| Unresolved attempts (`attempt_key, intent_key, entry_id, body_text`) | `_placement_owner_unresolved_attempts` in the proposing replica's ledger db | Yes, but **written locally outside raft** (`src/rebalancer/replica-placement-owner-attempts.js:10-58`; `replica-placement-owner.js:278,435`) | Hydrated only in a `LEADERSHIP_START` pass (`attempts.js:61-74,89-98`; `owner.js:485-497`), reconciled against settled outcomes and the census; an unsettled one is re-proposed with the same `entryId` and body when the same intent recurs (`owner.js:265-280,454-476`) |
| `uncertainEntryIds`, `ownEntryIds`, `seenRowSignatures`, `pendingTriggers`, `lastPassSnapshot`, `placementResyncAdmissions` | owner object | No | Rebuilt or lost |

Notes. The attempt key is `admit:<partitionId>` (`:456`); a new intent for the same partition overwrites the
retained one (`:265-279`). The intent key does not include the retirement scope of a REMOVE (`:224-227`), so a
retained REMOVE body is replayed with the scope it was built with; the receiving fences were not traced. Whether
a hydration image of the ledger db carries one node's attempt rows to another replica was not checked.

### 1.6 Decisions that read a local cache projection

| Read | Used for | Can it grant scheduling authority? |
| --- | --- | --- |
| `systemTableCache.getAll(PARTITIONS)` and `getAll(SERVICES)` (`owner.js:541-554`) | the set of partitions, replication factor, replica rows, **the copy source** | No. It decides *what* is proposed, not *who may propose*. But the premise is never re-checked at the commit point: no SERVICES or PARTITIONS position is recorded or compared at apply (1.3). The sealed quest says "from committed inputs at recorded positions"; only `nodesEpoch` is recorded |
| `partitions.leader_node_id` (`owner.js:571`; `replica-placement-owner-deficits.js:202-206`) | the leader of the target partition, when no service row says leader | No. Hint for the copy source |
| `services.raft_role === leader` (`deficits.js:186`) | the same, tried **first** | No. This is a leader-role reader. Production cannot satisfy it for a partition replica since `d1a099aaf` |
| Cache change events (`owner.js:358-373`) | triggers | No |
| `resolvePlacementLedgerRoute(cache)` (`src/rebalancer/replica-placement-owner-transport.js:28-43`) | where a coordinator on another node sends `PLACEMENT_ADMIT` | No. The receiver refuses unless its own core leads (`partition-placement-admission.js:221-223`; handler table `src/partition/partition-service-entry-apply-base.js:93-95`) |
| `resolveActiveLocalLedgerLeaderService` (`support.js:220-231`) | local shortcut | Not a cache read: the service's live `isLeader`, re-checked by the core role at propose |
| Committed node answer (`deficits.js:114-123`; `src/control-plane/serve-eligibility-owner.js:2-15,748-769`) | eligibility, formation | Not a cache read: a memo of a leader-required committed read; the cache only marks it stale |

Verdict for "authority from cache": **nothing in the placement owner's path treats a per-node recomputed
declaration as permission.** The only code that does is the old policy's consumer,
`isPriorityRecoverySchedulingOwner`, including its silent arm "no declaration means the target partition owns
itself" (`src/control-plane/priority-recovery-scheduling-owner-policy.js:156-177`). That code is reachable only
from a `UnifiedRebalancer` whose entity is a partition (`src/rebalancer/unified-rebalancer-control-plane-readiness-methods.js:202-214`).

**Fixture finding (VERIFIED).** The placement owner's fixtures write leader service rows:
`test/rebalancer/replica-placement-owner-core.test.js:511` (and `:242,:1176,:1200,:1244`),
`test/rebalancer/replica-placement-owner-test-support.js:153,:704,:1165`,
`test/raft/raft-rs-backend/formation-placement-lease-authority-fixture.js:257`,
`test/partition/placement-retained-row-repair-fixture.js:82`,
`test/convergence/formation-placement-drain-scenario.js:376`. They also set `leader_node_id`
(`core.test.js:501`), so both arms agree and the role arm answers first. `LEADER_UNKNOWN` is asserted only on the
pure function with a hand-written `isLeader` (`core.test.js:281-282`).

**Waiting is not retained (VERIFIED).** `evaluatePartitionDeficit` returns `WAITING` with a reason
(`deficits.js:304-308,330-332,409-411`). The pass keeps only `CANDIDATE` (`owner.js:636-645`).
`lastPassSnapshot` holds `{state, admitted}` (`:752-754`) and has no reader in `src`. The clearing table maps
`LEADER_UNKNOWN` to `SERVICES_CHANGED` (`constants.js:217`); the table is consulted in the pass only for the
node-authority case (`owner.js:725`).

### 1.7 The start path does not wait for its own publication, with two couplings

VERIFIED: leadership publication is queued, not awaited (`replica-leadership-state.js:70-79`); activation waits
only for the holdoff and scheduler (1.3); the owner proposes through a direct local call
(`replica-placement-owner.js:245-248`). The published owner row of `replica_operations-p1` is needed only by
coordinators on other nodes (`support.js:302-317`, typed `PLACEMENT_LEDGER_LEADER_UNAVAILABLE` when absent).

Two couplings on the start path that are not "own publication" but are publication:

- The `LEADERSHIP_START` pass **awaits one drive of the ledger's CDC obligations** before reconciling
  (`owner.js:485-489`). A not-ready subscriber ends the drive with an outcome and a retry timer
  (`partition-cdc-obligation-delivery.js:473-480,526-556`); the drive is page-bounded. Whether a subscriber call
  that never returns is bounded was not checked. Reconciliation itself reads only the db (`attempts.js:89-98`).
- The pass needs the committed node answer. That is a leader-required read of NODES and
  `control_plane_publications` (`serve-eligibility-owner.js:2-15`). The S0 stage-1 record states that such a read
  answers "unavailable" on a node hosting the leader replica while the projection names no leader
  (`lead-rulings.md`, "S0 stage 1"; not re-verified here). Until the S0 repair is in the composition, a delayed
  leader publication for either of those two partitions stops placement for **every** partition
  (`NODE_AUTHORITY_UNAVAILABLE`, `owner.js:720-729`), with an owned wake (`scheduleRefresh` and the subscription).

### 1.8 Who else proposes, and scopes

| Proposer | Scope | Code |
| --- | --- | --- |
| `ReplicaPlacementOwner` on the ledger leader | every partition's replica placement | 1.1-1.4 |
| Provisioning (SQL engine on the node that runs the DDL): `FOUND` for a new partition | founding | `src/query/sql-query-engine-initial-partition-provisioning.js:357-372,704-725` |
| Provisioning: **`PLACEMENT`-kind ADD** through `coordinator.createOperation` when the partition already has routable replicas | a partition that also appears to the placement owner as under-replicated | `src/query/sql-query-engine-provisioning-admission-methods.js:455-501`; `rebalance-coordinator-operation-creation.js:495-500`; `support.js:521-567` |
| Retained repair (`PLACEMENT_REPAIR`) | an existing operation, not new scheduling | `support.js:290-300` |
| Runtime-service owner on the `service_definitions-p1` leader | runtime services | `src/bootstrap/shared/runtime-service-rebalancer-setup.js:484-526` |
| Service-installation reconciler on the `service_installations-p1` leader | installations | `src/bootstrap/shared/service-installation-reconciler-setup.js:41-83` |
| Message-group `UnifiedRebalancer`, one per group leader | message groups (not placement-admission managed: `support.js:80-83`) | `src/message-group/message-group-service-rebalancer-runtime-methods.js:80-81` |

`.createOperation(` has two callers in `src`: provisioning and `unified-rebalancer-move-execution.js:312`
(VERIFIED by grep). A target partition's leader has no scheduler on this line. It keeps consensus, its own
publication (`queueLeaderNodeUpdate`), and execution of admitted work as the statement's source node
(`owner.js:585-593`). Under the flag it also defers learner promotion to the placement owner
(`src/partition/partition-service-learner-promotion-methods.js:457-465`). `placementAdmissionEnabled` is read as
a mode switch at 12 further sites (`git grep placementAdmissionEnabled -- src`).

---

## 2. Requirement-by-requirement gap table

Verdicts: **PROVEN-TODAY**, **HOLDS-BY-CODE-UNWITNESSED**, **GAP**. "Fixture" says what the named test builds.
The four requirements: R1 recovery of a temporarily ownerless priority partition; R2 five-node operation;
R3 single-owner scheduling; R4 no duplicated placement work.

| # | Schedule | What the owner does today | Existing witness and its fixture | Verdict |
| --- | --- | --- | --- | --- |
| G1 | Target partition loses its leader, nobody published (R1) | The scheduler is unchanged: the ledger leader evaluates the target in every pass. A copy-type move waits `LEADER_UNKNOWN` (`deficits.js:330-332`); a retirement that needs no copy source can proceed. Nobody else acts (1.8) | `core.test.js:271-288`: pure function, hand-written `isLeader`. No owner, no ledger | **HOLDS-BY-CODE-UNWITNESSED** for the wait. **GAP** against "explicit pending work with an owned wake": the wait is discarded (1.6) |
| G2 | Delayed publication of the target's new leader (R1) | Waits. The owner row reaches the ledger leader's cache, the cache apply event raises `PARTITIONS_CHANGED`, a full pass admits | None through the owner. All fixtures supply a leader role row (1.6) | **HOLDS-BY-CODE-UNWITNESSED**; the production arm of the leader read is untested |
| G3 | Leader published, then changed (R1) | Each PARTITIONS change re-runs a pass with the newer leader. An operation already admitted keeps the copy source it was admitted with | None | **HOLDS-BY-CODE-UNWITNESSED** at the pass. Execution with a stale copy source: not checked |
| G4 | Missed wake (R1) | No production resync (1.2). A pass that throws drops its triggers (1.2). Any later unrelated trigger recovers it | `replica-placement-owner-clearing-triggers.test.js:72` checks that every reason maps to a trigger with a subscription (table shape); the drain scenario fires timers itself | **GAP.** Interleaving: the target's leader row arrives while a pass is in flight and that pass throws (or the event is the only one); cluster then goes quiet; no timer exists; the deficit stays until an unrelated change |
| G5 | Ledger leadership transfer A to B with A's pass in flight (R3, R4) | A's entry either sits in B's log before B's first entry or is truncated. B's start pass reads **its local db** (s2); nothing requires B to have applied A's last entries. If B has not, B constructs a move for the same partition, checks capacity and proposes; at apply the second entry is `PARTITION_BUSY`. One admitted operation. Two actors did construction, capacity and proposal work | `core.test.js:932-1051` (Finding 3a): one real ledger `PartitionService` on a controllable port, `isLeader` set by hand, the commit "while inactive" applied on the same service. `test/partition/placement-retained-leadership.test.js:36-122`: two real appliers, but for retained **repair** requests | Single admitted operation: **HOLDS-BY-CODE-UNWITNESSED**. No duplicated work: **GAP**, bounded (one refused proposal and one construction pass per deficit per leadership change). Also the deposed node can run s5-s8 once after its demotion (1.4) |
| G6 | Ledger A to B to A (R3, R4) | A's memory survives; its second `LEADERSHIP_START` hydrates and reconciles: settled entries are dropped, an unsettled one is re-proposed under the same id when the same intent recurs | Same `core.test.js:932-1051`: reduced as above | **HOLDS-BY-CODE-UNWITNESSED** on two replicas. Not covered at all: a new tenure without a role edge (1.3) |
| G7 | Lost response, entry committed (R4) | Answer unknown; attempt stays; the next same-intent pass re-proposes the same id and is answered from the settled outcome; no second entry is appended (`admission.js:229-238`) | `core.test.js:717` (id reuse on `OUTCOME_UNKNOWN`), `placement-retained-leadership.test.js:87` (repair path): reduced | **HOLDS-BY-CODE-UNWITNESSED** through the production construction |
| G8 | Lost response, entry still in flight, next pass has a different intent for the same partition (R4) | A new id overwrites the retained attempt; both entries commit in order; first admitted, second refused | None counts the refused proposal | **HOLDS-BY-CODE-UNWITNESSED** for one admitted; duplicated proposal is uncounted |
| G9 | Retained work across restart (R1, R4) | Admitted operations and settled outcomes are in the ledger; unsettled attempts are in the local table and return at the first leadership of the restarted node (1.5) | `core.test.js:932-1051`: a second owner on the **same** service object and open db; not a new service over the file | **HOLDS-BY-CODE-UNWITNESSED** |
| G10 | Delayed publication of the **ledger's** leader (R1, R3) | The owner acts from its live role without the row (1.7). Coordinators on other nodes get a typed refusal until the row arrives | None | **HOLDS-BY-CODE-UNWITNESSED** |
| G11 | Useful progress after the disruption clears (R1) | One pass admits the waiting candidates in class order under capacity; each terminal commit raises the next pass | `test/convergence/dt-placement-owner-formation-drain.test.js:102,117,128` (A2-A4): the formation world, one shared row store, no leadership change | **HOLDS-BY-CODE-UNWITNESSED** after a disruption; PROVEN only for the formation drain in a reduced world |
| G12 | Five nodes (R2) | One ledger leader; nodes without a ledger replica attach nothing | `core.test.js:125-140`: five node rows into pure functions. The sealed five-node acceptance was never green (`surrogate-scheduling-owner.md` 1a) | **GAP in proof**: no witness builds the owner at five nodes |
| G13 | Exactly one scheduler object per node, on the ledger service (R3) | Attached once; other partition services attach nothing | `core.test.js:1386` via `test-support.js:1031-1140`: real `ControlPlaneSetup.create`, one real ledger service on a controllable port, a stub non-ledger object, `isLeader` set by hand | **PROVEN-TODAY** for that one order |
| G14 | No partition service holds a per-partition rebalancer in any construction order (R3) | Guarded by the flag only (1.1) | `placement-removed-mechanism-and-caller-census.test.js:127-160`: hand-built object, flag already true | **GAP in proof.** Interleaving that would break it: a partition service that leads and has its dependencies receives a coordinator whose flag is still false, builds a rebalancer at `:184-191`; the flag turns true later; `:149-180` keeps the rebalancer |
| G15 | Two actors construct moves for one deficit without any leadership change (R4) | The provisioning ADD path and the placement owner can both see the same under-replicated new partition (1.8); the ledger refuses the second | `test/rebalancer/placement-admission-cross-coordinator-target-census.test.js:435-492` proves the capacity census across coordinators, not this | **GAP candidate** (VERIFIED the path exists; INFERRED that both fire for the same partition) |
| G16 | Authority from cache (R3) | Nothing grants (1.6) | None negative | **HOLDS-BY-CODE-UNWITNESSED** |
| G17 | A target partition leader appoints itself (R3) | Impossible on this line unless a per-partition rebalancer exists (G14); then the old policy's silent arm does exactly that (`policy.js:169-176`) | Six tests declare the owner by hand; one writes leader rows | **HOLDS-BY-CODE-UNWITNESSED**, conditional on G14 |

Answers to the three points singled out in the brief:

- **(a) Two nodes both believing they lead.** Both can construct moves and run capacity checks. Both can call
  admission; only a node whose core still reports LEADER proposes. The stale proposal is fenced by raft (never
  after the new leader's entries) and by the apply decision (`PARTITION_BUSY`). It is not fenced by tenure
  anywhere. The duplicated work is real and hidden behind the deduplicated row: G5.
- **(b) No published owner.** Only the ledger leader's owner schedules partition replicas. Other proposers exist
  for other scopes, plus the provisioning ADD path for partitions (G15). The old policy's consumers are not
  constructed in production.
- **(c) Authority from cache.** None in the placement owner. The one place a recomputed declaration is treated as
  permission is the old policy's consumer.

---

## 3. Proof plan

Tests to be written by an implementer. Each witness goes through the production construction: a coordinator
produced by `ControlPlaneSetup.create` (or bound exactly as `:415-427` binds it), real `PartitionService`
instances, attachment by `maybeInitializeRebalancer`, leadership delivered as raft role events, never by
assigning `isLeader`. Leader identity in every fixture is the production shape: follower SERVICES rows plus a
PARTITIONS row with `leader_node_id`. A fixture that writes `raft_role: leader` is rejected by review.

### 3.1 Fixtures found

| Fixture | Provides | Limits |
| --- | --- | --- |
| `test/partition/placement-admission-fixture.js` (`onLedgerLeader`, `watchEntryCommitted`, `ledgerRows`) | one real ledger `PartitionService`, production apply, controllable consensus port; the `proposed` array records every proposal | single replica; leadership is the port's role |
| `test/partition/placement-retained-leadership-fixture.js` (`withRetainedLeadershipPair`) | **two** real file-backed ledger appliers, a port that mirrors commits and emits role events, `elect(next)`, held messages | "not rs-raft election/quorum behavior" (its header); built for the repair owner; no placement owner attached today |
| `test/raft/raft-rs-backend/partition-node-cluster.js` (`PartitionNodeCluster`) | real raft-rs operation ports for one group: `isolate`, `heal`, `restart`, `tick`, `leaderReplicaId`, `coreEntryCount` | peers are ports, not `PartitionService` objects |
| `test/rebalancer/replace-real-group-native-ledger-fixture.js` | real rs-raft **user** group with a file-backed ledger | ledger consensus transport is controlled |
| `test/raft/raft-rs-backend/formation-placement-lease-authority-fixture.js` | real `ServeEligibilityOwner`, real lease owners, placement owner on `onLedgerLeader` | single ledger replica; writes a leader role row |
| `test/simulation/formation-sim-node-hosts.js` (`createSimulatedNodeHosts`) | several nodes with real owners and **one cache per node**, publication to one node can be held | shared row store; still exports `createPriorityPartitionRebalancer` |
| `test/rebalancer/replica-placement-owner-test-support.js:1031-1140` | real `ControlPlaneSetup.create` | everything around it stubbed |

**Not found:** a fixture that runs the ledger partition as a real multi-replica rs-raft group of
`PartitionService` instances with a placement owner on each. The transfer witnesses need it. Two routes: attach
owners in `withRetainedLeadershipPair` (smallest step; decisive for custody and counts, not for election
behaviour), and a ledger group on `PartitionNodeCluster` ports for the witnesses marked "real group". Stating
which one a witness used is part of its record.

### 3.2 The three counts, per actor

| Count | Where it is readable without touching production | Missing |
| --- | --- | --- |
| **Proposals** that committed, admitted or refused | `_partition_statement_outcomes` on any ledger replica: one row per entry, typed result in the owner result text (`admission.js:401-404`). The proposer is in the entry id (`placement-owner:<nodeId>:admit:<partitionId>:...`, `owner.js:261-263`; coordinator ids `support.js:258-262`) and in `command.proposedBy` (`command.js:70-73`). `ENTRY_COMMITTED` is emitted at apply on every replica (`admission.js:413-414`); `watchEntryCommitted` already collects it | none |
| Proposals that never committed | the fixture's `proposed` array (controllable port); `setActualCoreEntryObserver` (`src/raft/raft-rs-runtime-owner.js:2384`, used by `PartitionNodeCluster.coreEntryCount`) on a real group | none |
| **Admitted operations** | `replica_operations` rows; the admitting entry id is in `steps_history[0].placementAdmission.entryId` (`decision.js:241-247,272-273`) | none |
| **Actual work**: construction passes, partitions evaluated, candidates, waits by reason | nothing. `lastPassSnapshot` has only `admitted` | **owner-side observation** (below) |
| Actual work: capacity checks | counting collaborators the owner already accepts: `storageAccountingService.getCapacitySemanticIdentity`, the workflow owner's four methods (`owner.js:74-83`), `nodeAuthority.answerCommittedNodes` | none |
| Actual work: admission attempts | attempts table rows and the proposals above | attempts that were refused before proposing (not leader, paused) are visible only in the answer: covered by the observation |
| Actual work: replica creations | the CREATE delivery at the transport seam of the fixture (as `replace-real-group-native-ledger-fixture.js:44-56` observes REMOVE effects); new SERVICES rows | none |

The smallest owner-side observation, diagnostic only (the file header already lists "lastPassSnapshot diagnostic
publication" as permitted post-commit work, `owner.js:6`): extend `lastPassSnapshot` and keep cumulative
counters beside the existing `placementResyncAdmissions` (`owner.js:257`):
`{passSequence, triggers, tenureTerm, evaluated, candidates, waiting: {reason: [partitionIds]}, capacityChecks,
proposals, admitted, refused: {reason: n}, stoppedAt}`. It also makes the waits explicit (G1) and gives the
admin snapshot something true to report (section 4). No authority is added.

Pass condition used by every witness: **for each deficit, each of the three counts has exactly one actor**, and
where a schedule allows more (G5, G8) the witness states the exact bound and fails above it.

### 3.3 Witnesses

"Success versus stall" is always: time from the disruption clearing to the first `ADMITTED` entry for the
deficit, bounded by one wake plus one pass in fixture time; number of nodes whose owner `isLeader` is true at
every observed instant never above one; final placement reaches replication factor and distinct-host spread.

| # | Schedule | Fixture | Observable and counts | Mutant that must turn it red |
| --- | --- | --- | --- | --- |
| P0 | **Construction, seed and join order** (G13, G14). Orders: coordinator before any partition service (seed); partition services initialised and leading before the coordinator arrives (join); a ledger replica created later on a joiner; the coordinator handed to a leading service while its flag is still false, flag set afterwards; a service that already holds a rebalancer | real `ControlPlaneSetup.create` (as `test-support.js:1031`), real partition services through `setRebalanceCoordinator` | after each order: exactly one owner, attached to the ledger service; `service.rebalancer === null` on every partition service; zero `UnifiedRebalancer` constructions with a partition entity | delete the guard `partition-service-rebalancer-methods.js:181-183`; skip the binding at `control-plane-setup.js:415`. The last two orders are expected **red today**: they are the reason for the deletion in 4.2 |
| P1 | Target ownerless, nobody published, then the leader row is published late (G1, G2) | `onLedgerLeader` with the production construction; follower rows only; the PARTITIONS row applied through the cache's apply entry | before: zero proposals for the target, the wait is reported as `LEADER_UNKNOWN` with the target named; after the row: first admitted entry within one pass; one actor for all three counts | drop the `PARTITIONS_CHANGED` notify (`owner.js:362-363`); remove the `leader_node_id` arm (`deficits.js:202-206`). With today's fixtures (leader role rows) the test would be vacuous: the anchor is that the role arm is absent from the fixture |
| P2 | Leader published, then changed before admission, and again after admission (G3) | as P1 | admitted move names the current leader as copy source; one admitted operation; after the post-admission change, the operation's outcome is typed (completes or fails with a reason), never silent | pin the first leader value in the pass |
| P3 | **Missed wake** (G4): (i) the only clearing event arrives while a pass is running and that pass throws once; (ii) the clearing event is never delivered as a trigger, the cache content is current | as P1 with a collaborator that throws once; (ii) with the listener bypassed | the obligation is admitted without any unrelated later trigger; bounded by the declared cadence | (i) keep today's `drainQueue` (expected **red today**); (ii) construct without a timer, as production does (expected **red today**) |
| P4 | **Ledger transfer A to B with A's pass in flight** (G5). Cuts: A parked at A1; at A2; between A3 and A4; A's entry appended and not yet applied on B when B activates | `withRetainedLeadershipPair` with an owner attached on each replica; repeated on a real group for the cut "appended, not applied on B" | one admitted operation per deficit; per actor: proposals, construction passes, capacity checks. Required bound stated by the ruling on Q2 below: zero duplicated work with the tenure fence, else at most one refused proposal and one construction pass | remove the per-candidate stop (`owner.js:692`); remove the leadership refusal at propose (`admission.js:222-223`); let B's first pass run before its applied index reaches its term start |
| P5 | Ledger A to B to A, and a new term on A without a role edge (G6) | as P4 | A's retained attempt is either replayed under its id or dropped because settled; never a second admitted operation; a reconciliation runs once per tenure (observed through `tenureTerm`) | skip hydration on the second start; treat the same-node new term as the old tenure (expected **red today** for the no-edge case) |
| P6 | Lost responses (G7, G8): committed and answer lost; in flight and answer lost, then a different intent | `onLedgerLeader`, production construction | entries appended: one in the first case, two in the second with exactly one admitted; refused proposals counted and attributed | mint a fresh id on unknown outcome; answer a replay without the fingerprint check |
| P7 | **Retained work across restart** (G9): owner and service discarded, a new `PartitionService` opened over the same file, leadership regained | file-backed ledger (`withRepairLedger` in `test/partition/placement-retained-row-repair-fixture.js`) | unsettled attempt replayed with identical id and bytes; admitted operations not duplicated; no proposal before the first `LEADERSHIP_START` reconciliation | hydrate lazily after the first proposal; drop the attempts table |
| P8 | Delayed publication of the ledger's own leader, and a start path that does not wait for publication (G10, 1.7): the owner row of `replica_operations-p1` withheld; separately, a CDC subscriber that stays not-ready | `createSimulatedNodeHosts` (per-node caches, held publication) or the pair fixture | the leader's owner admits from its live role with the row absent; a coordinator on another node gets the typed refusal and succeeds after the row; first admission is not delayed beyond a stated bound by the not-ready subscriber | require the route projection for the local proposal; make the start pass wait for a drained CDC lane |
| P9 | **Negative: a target partition leader does not schedule** (G17). A priority partition loses and regains a leader with no owner field anywhere, ledger leader on another node | pair fixture plus a real target partition service | the target's node proposes zero placement entries, constructs zero moves, holds no rebalancer; it does publish its leadership and executes the operation admitted by the ledger leader | re-enable `partition-service-rebalancer-methods.js:184-191` for that service; keep `policy.js:169-176` reachable |
| P10 | **Negative: authority from cache** (G16). (i) node X's cache names X as ledger leader, X's core is a follower; (ii) X's core leads, every cache names Y | pair fixture | (i) X's owner runs no pass and proposes nothing; (ii) X's owner admits; a remote proposer that follows the cache to Y is refused typed and retried | drive `setLeader` from the cache row; skip the role check at propose |
| P11 | Useful progress after the disruption clears (G11): three deficits in different classes behind one wait | as P1 | admissions follow class order and capacity; each terminal commit causes the next admission in the same step; no deficit left without a reported wait | drop the `LEDGER_COMMIT` notify (`owner.js:304-308`) |
| P12 | **Five nodes in process** (G12): five node hosts, ledger on three or five of them, three simultaneous deficits, one ledger leader change in the middle | `createSimulatedNodeHosts` with the production construction on every node | owners attached equals ledger replicas hosted; `isLeader` true on at most one at every instant; the three counts per actor for each deficit; nodes without a ledger replica: zero of everything | attach an owner on a non-ledger service; mount `createPriorityPartitionRebalancer` beside it |
| P13 | **Five nodes on the lab** (G12): formation, then kill and heal of one priority partition leader and of the ledger leader | lab, see 3.4 | counts from the committed ledger (proposals by proposer, admitted by admitting entry) and from each node's admin snapshot (the observation of 3.2); final placement | not a mutation test: its role is the count on real nodes. Anti-vacuity: the run must record at least one refused or replayed proposal class as observed-zero with the reader shown to work on a seeded refusal |
| P14 | **Producer, publication boundary, consumer** (the owner's lesson): the real leadership event (`applyReplicaLeadership` and `queueLeaderNodeUpdate`), the real row owner and CDC delivery into another node's cache, the placement owner's `context.leader` | pair fixture or node hosts; no hand-written PARTITIONS or SERVICES row | the copy source the owner proposes equals the node whose core leads; when the producer publishes `follower` roles only (as it does), the consumer still finds the leader | make the consumer read the role only (delete `deficits.js:202-206`): red. Make the producer stop publishing `leader_node_id`: red. Either change is what happened in July-October |
| P15 | Two constructors without a leadership change (G15): provisioning ADD for a new partition with routable replicas while the owner sees the same deficit | node hosts with the SQL provisioning path | per actor counts for the partition; the bound is the lead's ruling on Q3 | n/a until ruled |

Sixteen witnesses (P0-P15). P13 needs the lab. P4's "appended, not applied" cut and P5 should be repeated on a
real rs-raft ledger group once that fixture exists; everything else runs in process. P0 (two orders), P3 (both
parts) and P5 (no-edge case) are predicted red on `16300e756`.

### 3.4 Five-node formation on the lab

Found (VERIFIED):

- `test/distributed/scenarios/public-path-multinode-baseline.js:101-115`: the five-node formation acceptance,
  `SCENARIO_CERTIFICATION_REQUIREMENT` (`minNodes` five, one node per machine, host spread gate);
  `test/distributed/README.local.md:361`.
- `npm run -s health:formation`: the MovieLens formation-only phase, five local processes by default, one node
  per VM with `--gcp` (`scripts/checks/formation-health.js:1-26`). It injects no disruption.
- Kill and heal scenarios exist for other node counts: `node-failure-rebalance.js`,
  `partition-kill-heal-under-load.js`, `seed-restart-under-load.js`, `rolling-restart.js` (names only; not read).
- `node scripts/lab.js harness run --scenario <name> [--config <file>]` (`scripts/lab/harness.js`, from the prior
  report).

Not found: a five-node lab config file; a five-node scenario with a leader kill; the cost of one run. The nearest
measured figure is the three-host diagnostic run of today, 508.5 s, failed (`lead-rulings.md`). The sealed
scenario of the old quest, `movielens-lagrange-service-affinity-live`, is not a file under
`test/distributed/scenarios`. One node per machine needs five lab hosts at once; that needs the owner's ruling
against the household limit on concurrent lab hosts (Q6).

### 3.5 Contract-first record for the transfer (checklist of `solver-quests.md`)

1. **Producer and consumer symbols.** Producer of authority: the raft role events and
   `applyReplicaLeadership` / `applyReplicaDemotion` (`replica-leadership-state.js:62-103`), delivered by
   `driveRebalancerLeadershipSink` (`partition-service-leader-activation-methods.js:72-79`). Consumer:
   `ReplicaPlacementOwner.setLeader` and `runPass`. Commit: `requestPlacementAdmission` and
   `applyPlacementCommand`. No new machinery.
2. **Owner-defined shape.** The tenure token `{term}` already exists on the service. The pass observation of 3.2
   is the one new shape, owned by the placement owner.
3. **Identity and generation.** Scope is all partitions; authority is the ledger group's leadership; tenure is
   the frozen token (identity comparison), term inside it. Entry identity is `entryId` plus the command
   fingerprint. `positions.nodesEpoch` is a read position, not a membership epoch.
4. **Ordering.** One raft log orders every admission. The cache gives a per-node local view; no cut across
   SERVICES, PARTITIONS and the ledger is claimed or available.
5. **Absent versus unavailable.** Leader unknown, node authority unavailable, ledger leader unroutable are typed
   today. Absent tenure (not leading) must be a typed stop of the pass, not a fall-through.
6. **Durable commit.** The apply of the placement entry on `replica_operations-p1`.
7. **Retained obligations.** Unresolved attempts (local table), admitted operations (ledger), waits (to be
   reported). A pass interrupted by demotion leaves attempts whose outcome is unknown: owned by the next
   `LEADERSHIP_START` on the node that holds them and by the ledger's settled outcomes on every node.
8. **Wake and cleanup.** Triggers of 1.2; listeners removed on demotion and shutdown
   (`owner.js:286-289,297-299`; `src/partition/partition-service-lifecycle-methods.js:103-109`). The cadence
   question is Q1.

---

## 4. Retirement plan (execute only after the proofs exist)

### 4.1 What the snapshot carries, and what is obsolete

`buildPriorityRecoveryDecisionSnapshots` (`src/control-plane/priority-recovery-snapshot-closure.js:31-215`) has
two callers: the publication machinery
(`src/control-plane/membership-publication-candidate-derivation.js:673` through
`membership-publication-readiness-repair.js:157-203`) and the admin control snapshot
(`src/admin/admin-control-snapshot-control-plane-diagnostics.js:619-632,730-735`), which also uses the result to
schedule dispatch-pending re-entries on the workflow owner (`:633-640`). So the earlier statement "feeds only
admin diagnostics and tests" is corrected: the policy **is computed** on the publication path. VERIFIED.

Fields of one decision snapshot (`src/control-plane/priority-recovery-dispatch-snapshot.js:390-441`):
`partitionId, epoch, operationId, correlationKey, semanticState, completion, observation, conditions, actuation,
progress, planner, admission, spreadCompletion, coordinator, publication, readiness, blockerReasons`, and the
optional `schedulingOwner` (`:438-440`). Summary fields: counts, `blockerPartitionIdsByReason`,
`partitionIdsBySemanticState`, `partitionIdsByCompletionState`, unresolved semantic states, `closureWitness`
(`snapshot-closure.js:192-215`).

Consumers: the publication path takes the closure witness and the snapshots as recovery facts; the admin path
reports them and re-enters dispatch-pending work. **Only** `isPriorityRecoverySchedulingOwner` and
`inheritPriorityRecoverySchedulingOwner` read `schedulingOwner` (VERIFIED: `git grep schedulingOwner -- src`
lists the policy, the closure builder, the dispatch snapshot and the two unified-rebalancer files, nothing else).
Everything except that one field stays.

The inputs the policy takes are shared: `serviceRows` also feeds the operation contexts and learner promotion
(`snapshot-closure.js:56-75`), `recoveryActiveNodeIds` the publication context. The candidate derivation and the
readiness repair therefore have **nothing owner-specific to delete**. Whether any memo key or fingerprint
serialises a whole snapshot (and so changes value when the field disappears) was not checked.

### 4.2 Deletion set

**Stage B first: the retired per-partition scheduler's construction** (the sealed statement of
`replica-placement-admission-owner` already requires "the per-entity placement scheduler ... removed from source,
tests, contracts, baselines and documentation, not disabled"). Gate: P0 green.

| Path | Delete |
| --- | --- |
| `src/partition/partition-service-rebalancer-methods.js` | the `UnifiedRebalancer` construction path `:184-192,200-265`; the existing-rebalancer branch `:149-180`; the dependency bundle and its re-apply `:25-111`; keep `ensureReplicaPlacementOwnerAttached` `:126-142` and the sink drive |
| `src/partition/partition-service-leader-activation-methods.js` | the `this.rebalancer` arms `:39-46,81-88`; `resolveRebalancerLeadership` stays only if the other two sinks need it (`:76`) |
| `src/partition/partition-service-core-base.js:240`, `partition-service-lifecycle-methods.js:110` onward | the `rebalancer` field and its shutdown arm |
| `src/rebalancer/rebalance-coordinator-operation-creation-support.js` | the optional-factory branch: the `typeof` early return `:604`, the factory-less fallback `:639-648`, the flag assignment in `registerLedgerPartitionService` `:617-618` once the flag has one writer |
| `src/bootstrap/shared/control-plane-setup.js:415` | the optional chaining: binding becomes required |
| `test/rebalancer/placement-removed-mechanism-and-caller-census.test.js:127` onward | replaced by P0 |

Then the flag itself: `placementAdmissionEnabled` becomes constant-true and its forks collapse (13 read sites in
`src`, listed by `git grep placementAdmissionEnabled`). That is behaviour-preserving only where the false arm is
unreachable in production; it belongs to the necessity audit's deletion slices, one owner directory at a time.

**Stage A: the policy and what solely serves it.** Gate: P1-P12, P14 green and stage B landed (removing only the
owner check while a per-partition rebalancer can still be built would reopen the July defect in any composition
that builds one).

| Path | Change |
| --- | --- |
| `src/control-plane/priority-recovery-scheduling-owner-policy.js` | delete (197 lines) |
| `src/control-plane/priority-recovery-snapshot-closure.js` | delete the import `:27-29`, the computation `:85-90`, the argument `:147` |
| `src/control-plane/priority-recovery-dispatch-snapshot.js` | delete `:438-440` |
| `src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js` | delete the surrogate follow-up lane that the checks at `:169-177,:196-204,:223-228,:267-271` guard (lane, not only the check) |
| `src/rebalancer/unified-rebalancer-follow-up-decision.js` | delete the import `:10` and the inheritance at `:267` |
| `test/rebalancer/priority-recovery-surrogate-owner-arbitration.test.js` | delete (the witness that writes its own leader rows) |
| `test/rebalancer/priority-recovery-surrogate-single-followup.test.js`, `unified-rebalancer-triggers-priority-surrogate-followup.test.js`, `unified-rebalancer-triggers-priority-surrogate-gates.test.js`, `unified-rebalancer-surrogate-followup-synthesis-test-cases.js` | delete with the lane (surrogate-lane tests by name; bodies not read in full) |
| `test/rebalancer/unified-rebalancer-closure-witness-followup-test-cases.js`, `unified-rebalancer-priority-recovery-serial-wait-test-cases.js` | remove the hand-declared field (`:166,398,408,643`; `:141`); keep what they prove about closure and serial wait, or delete if the lane deletion empties them |
| `scripts/check-guideline-navigability-baseline-legacy_term_identifiers.json:8179,8188`, `...-row_field_alias_reads.json:1879,1882`, `test/shards/historical-regression-corpus.json:159` | tighten |
| `src/control-plane/INDEX.md:175` | regenerated |

Stage A is 16 paths: 1 source file deleted, 4 source files edited, 7 test files, 3 baseline or corpus files, 1
generated index. Stage B is 7 paths plus the 13 flag read sites.

**Stage C, not designed here:** the partition-only lanes of the unified rebalancer (54 occurrences
of `isControlPlanePriorityPartition()` under `src`) and the roughly 60 test files that construct a `UnifiedRebalancer`
directly, plus `createPriorityPartitionRebalancer` in `test/simulation/formation-sim-node-hosts.js:526` and the
planner mounting in `test/convergence/formation-joint-admission-world.js`. The rebalancer stays for message
groups and runtime services, so this is a per-lane necessity question.

Also in scope of the leader-authority work (W3), flagged because P14 depends on it: delete the role arm
`replica-placement-owner-deficits.js:186` and migrate the five fixtures of 1.6 to follower rows plus the owner row.

### 4.3 What each consumer reads instead

| Consumer | Today | After |
| --- | --- | --- |
| Unified rebalancer partition follow-up lane | the declared owner | nothing: the lane is gone |
| Publication candidate derivation and closure evidence | the snapshot's recovery facts | unchanged |
| Admin dispatch-pending re-entry | the snapshot's dispatch facts | unchanged |
| Admin diagnostics | a `schedulingOwner` per partition that is `target_owner_fallback` with no candidates in every recorded decision | **the actual placement owner**: per node, whether a ledger replica is hosted, whether the owner is attached, its `isLeader`, the service's tenure term, the pass observation of 3.2 (waits by reason, counts), the number of unresolved attempts, whether a cadence is armed. Separately and labelled as a projection: the route `resolvePlacementLedgerRoute` answers on that node. The owner's start must never read this block (1.7) |

### 4.4 Interaction contracts and coupled pairs to add

No entry of `test/shards/impact-contracts.json` names `src/rebalancer/replica-placement-owner*` or
`src/partition/partition-placement-admission*` (VERIFIED: zero hits for both stems). Per
`coupled-pairs-conventions.md`: a pair needs a contract, two endpoints whose owners do not cover each other,
witnesses listed in `primary-classes.json` and in the contract's `tests`; `src/raft/` is a core-metadata prefix;
the registry entry lands with the owner change; `npm run audit:impact-contracts` is run explicitly.

One contract, `replica-placement-single-scheduler`, and five pairs:

| Pair | Endpoint A (producer) | Endpoint B (consumer) | Witnesses |
| --- | --- | --- | --- |
| `ledger-leadership-tenure-and-placement-scheduler` | `src/raft/replica-leadership-state.js`, `src/partition/partition-service-raft-lifecycle-wiring.js`, `partition-service-leader-activation-methods.js` | `src/rebalancer/replica-placement-owner.js` | P4, P5, P10 |
| `partition-leader-publication-and-placement-copy-source` | the leadership publication producer (`queueLeaderNodeUpdate`, `src/partition/partition-service-row-owner.js`) and the cache apply boundary | `src/rebalancer/replica-placement-owner-deficits.js` | P1, P2, P14 |
| `placement-owner-construction-and-partition-scheduler` | `src/bootstrap/shared/control-plane-setup.js`, `rebalance-coordinator-operation-creation-support.js` | `src/partition/partition-service-rebalancer-methods.js` | P0, P9 |
| `placement-proposal-and-ledger-apply` | `replica-placement-owner.js`, `replica-placement-owner-attempts.js` | `src/partition/partition-placement-admission.js`, `partition-placement-admission-decision.js` | P6, P7 |
| `placement-ledger-route-projection-and-remote-proposer` | `src/rebalancer/replica-placement-owner-transport.js` | `src/partition/partition-service-entry-apply-base.js` | P8, P10 |

A source-count ratchet row for `schedulingOwner`, `surrogate_owner` and `raft_role: 'leader'` in placement
fixtures is supplementary, in the one checker the lead ruled.

### 4.5 The open owning record and the supersession text

How the records are organised (VERIFIED): the epic `solve/epics/operation-integrity-and-reliable-formation.md` is
`status: open`; its current summary is the section "Core integration handoff, 21 November 2026" (`:115`). The
quest `replica-placement-admission-owner` belongs to that epic, its statement is the single placement owner, and
its log has no terminal entry (two entries: a finding of 2026-11-20 and a verification). The superseded quest
`movielens-priority-surrogate-single-owner-arbitration` is terminal (parked exhausted 2026-07-20) under a
different epic, `service-data-affinity-placement`. Under R21 the correction and the supersession are appended to
**`solve/quests/replica-placement-admission-owner/log.ndjson`** as a finding, with one pointer row in the epic's
current summary. Q11 (`repository-legacy-fallback-closure`) is the alternative home if the lead wants all
retirements in one place (Q7).

Draft:

> Supersedes `movielens-priority-surrogate-single-owner-arbitration` (sealed at `5903c561`, parked exhausted
> 2026-07-20, epic `service-data-affinity-placement`). The original record stays closed.
>
> Corrected history. The statement that the priority-recovery surrogate lane "has never been reachable in
> production" was wrong. The quest landed a scheduling owner declared on the priority-recovery planning snapshot
> at `d021073e2` on 2026-07-16; its log (entries 26 and 29) records two five-node production-path runs that day in
> which every nonlocal surrogate move, 13 in the first run, was emitted by the one declared owner. The lane read
> `services.raft_role = leader`. The role-update lane had collapsed that value since `46b65f8ab` (2026-03-18); it
> reached the consumer only through the row owner's registration and activation stamp. `b68b0e19a` (2026-07-22)
> let the collapsed update overwrite the stamp; `d1a099aaf` (2026-10-27) removed the stamp. Nothing turned red:
> one witness wrote its own leader rows, six tests declared the owner by hand, and the sealed five-node
> acceptance was never green. The declaration was also recomputed on every node from that node's cache, so it
> was not single across nodes.
>
> Decision (owner, 2026-11-21). The end state is the placement owner of 2026-11-19: one `ReplicaPlacementOwner`
> on the leader of `replica_operations-p1` places every partition, from the ledger's existing consensus
> authority. The per-partition scheduler is not reactivated. A node may project the owner locally; a declaration
> recomputed from a local cache grants nothing. A target partition's leader keeps consensus, publication and the
> execution of admitted work, and acquires no scheduling authority from an absent owner.
>
> Requirements carried forward, each with its witness at `<head>`:
> 1. Recovery of a temporarily ownerless priority partition, as explicit pending work with an owned wake:
>    `<P1>`, `<P2>`, `<P3>`, `<P11>`.
> 2. Five-node operation: `<P12>` in process, `<P13>` on the lab (run id, head, verdict).
> 3. Single-owner scheduling for the scope and the leadership tenure: `<P0>`, `<P4>`, `<P5>`, `<P9>`, `<P10>`.
> 4. No duplicated placement work, counted as proposals, admitted operations and actual work per actor:
>    `<P4>`, `<P6>`, `<P7>`, `<P12>`, `<P15>`.
> The producer, publication boundary and consumer are held together by `<P14>` and the coupled pairs of contract
> `replica-placement-single-scheduler`.
>
> Removed in the same change: `priority-recovery-scheduling-owner-policy.js`, the `schedulingOwner` field of the
> decision snapshot, the surrogate follow-up lane of the unified rebalancer and the seven tests that reached it
> by fabricated input. The other facts of the decision snapshot stay with the publication machinery. The
> per-partition scheduler's construction path was removed in `<commit>` under this quest's sealed statement.

---

## 5. Prior art, only what changes the design

Stated from general knowledge of these systems; no source was fetched in this pass. INFERRED where it is applied
to Lagrange.

- **CockroachDB.** The replicate queue runs on the leaseholder, and a replica change is a transaction
  conditional on the range descriptor. Separately, every command carries the lease sequence it was proposed
  under and is rejected **below raft** if the lease has changed. *Change for the design:* Lagrange's descriptor
  equivalent is the ledger decision at apply; it has no equivalent of the second check, and does not need one for
  the leader's own proposals, because here the scheduler's authority **is** the raft leadership of the group that
  orders the entries: an entry from an older term in the committed log was proposed by the then-legitimate
  leader. It would need one only if scheduling authority and log leadership were ever separated.
- **TiKV and PD.** One PD leader schedules; an operator carries the region epoch it was computed against and the
  store rejects it when the epoch has moved. *Change:* this is the missing half in Lagrange. The statement
  records `positions` but apply ignores them, so a move computed from a stale SERVICES or PARTITIONS view is
  admitted if the partition is merely not busy (1.6). Making a premise conditional at apply is a contract change,
  not part of this transfer: Q9.
- **Kubernetes.** A leader-elected controller manager, no fencing token, harmless split brain because every write
  is conditional and every controller is level-triggered with a periodic resync. *Change:* the conditional write
  exists here; the periodic level-trigger does not in production (1.2). Either wire the declared resync or prove
  that no wake can be lost, which P3 shows is false today.
- **FoundationDB.** One data distributor per generation, recruited by the cluster controller; each relocation
  transaction reads a lock key that a new distributor overwrites, so the old one's work conflicts at commit.
  *Change:* the tenure is checked inside the commit, and the old distributor stops because its first write
  fails. Lagrange's old owner stops proposing at the role check but keeps computing until the event arrives:
  capture the existing tenure token per pass and re-check it after every await (the CDC owner on the same
  service already does this).
- **The rule they share:** the scheduler is single by election, it is stateless enough to be rebuilt, and safety
  never rests on its belief; it rests on a commit that is conditional on authoritative state and on an identity
  of the scheduler's tenure or of the premise. The ledger's term already provides the tenure half for the
  leader's own proposals. What is absent is carrying the tenure through a pass, an applied-index condition
  before a new leader's first pass, and (optionally) a premise condition at apply. None needs a new election
  mechanism, table or scheduler.

---

## 6. Not checked

- Nothing was executed. Every "red today" and every count is a prediction from the code.
- `docs/steering/router.md` was not read; of `solver-quests.md` only the causal-scope and contract-first sections.
- The workflow owner's execution of an admitted operation: dispatch, the receiving fences for a stale copy
  source or a replayed REMOVE scope, operation recovery after restart (owned by W1 and the strict-outcomes quest).
- Whether `getCriticalReplicaRowsForSafety` and the other collaborators can throw in production (1.2).
- Whether a subscriber call inside the CDC drive is bounded (1.7); why the start pass awaits the drive.
- Whether a hydration image carries `_placement_owner_unresolved_attempts` to another replica (1.5).
- The S0 finding about leader-required reads under a missing projection was taken from `lead-rulings.md`.
- Every runtime creator of a `PartitionService` and the coordinator it is given (1.1); the join path was read at
  the `ControlPlaneSetup.create` call only.
- raft behaviour (truncation of a deposed leader's entries, step-down under check-quorum) is from the algorithm
  and the constants file, not from a run.
- The bodies of the six tests that hand-declare the owner, the four distributed kill and heal scenarios, the
  drain scenario's node count, `scripts/lab/*`, lab configs. No five-node run cost was found.
- Whether any memo or fingerprint serialises a whole decision snapshot (4.1).
- The prior report's history (commits `46b65f8ab`, `b68b0e19a`, `d1a099aaf`, `d021073e2`) was not re-verified;
  the lead spot-checked existence and dates. Re-verified here: the policy, its call sites, the seven tests, the
  absence of impact contracts, the construction gate, the trigger list, `LEADER_UNKNOWN`.
- Prior art is from memory.

## 7. Questions for the lead or the owner

1. **Resync.** The sealed quest says the owner arms one timer; production arms none. Wire it in the production
   factory, or rule that production has no cadence and require the proof that no wake can be lost?
2. **Duplicate work in the transfer window (G5).** Is "one refused proposal and one construction pass per deficit
   per leadership change" acceptable under "no duplicated placement work", or must it be zero? Zero needs two
   local changes inside the owner: capture the service's tenure token per pass and stop after any await when it
   changed; start a new leader's first pass only when its applied index has reached its term start.
3. **The provisioning ADD path (G15).** Is a `PLACEMENT`-kind ADD proposed by the provisioner for a partition
   that already has routable replicas part of founding, or must it be left to the placement owner?
4. **The CDC drive on the start path.** Keep the await in the `LEADERSHIP_START` pass (and state its bound), or
   take it off the start path?
5. **Explicit waits.** May the pass observation of 3.2 land before the baseline as a diagnostic-only change, and
   should the clearing trigger of `LEADER_UNKNOWN` be corrected to `PARTITIONS_CHANGED`?
6. **Five nodes on the lab.** One node per machine needs five hosts at once. Which vehicle: the certification
   topology, or five local processes on one lab host for the counts only?
7. **Home of the supersession.** `replica-placement-admission-owner`'s log plus an epic summary row, or Q11?
8. **Order.** Construction-path removal (stage B) before the policy removal (stage A): confirm.
9. **Premise at apply.** Recorded positions are not compared at apply. In scope later, or accepted as "the cache
   schedules, the ledger admits on its own state"?
