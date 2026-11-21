# Surrogate scheduling owner: corrected history, bounded repair, necessity comparison

Read-only investigation at `316671f87` (2026-11-21, core-integration line; `main` is not an ancestor).
Nothing was written in a git worktree and no test was run. Status markers: **VERIFIED** = read in the
code, log or commit named beside it; **INFERRED** = reasoned from verified facts, not observed.
The investigation was interrupted once for workstation load and resumed with scoped reads only, so Parts 2
and 3 rest on fewer whole-file reads than Part 1 (see "Not checked").

## 0. What the lead needs first

1. **The lane was live.** The quest log records, on 2026-07-16, a five-node production-path run in which
   "all 13 nonlocal priority-surrogate moves were emitted by the single declared replica_operations-p1
   owner" (VERIFIED, log entry 26). "Never reachable in production" is wrong.
2. **It went dark in two steps, not one, and neither step is the March flag or the August decision.**
   The March 2026 flag collapsed only the role-update lane; a second writer (the row owner) kept stamping
   `leader` and fed this consumer. `b68b0e19a` (2026-07-22) let the collapsed lane overwrite that stamp;
   `d1a099aaf` (2026-10-27) removed the stamp itself. The 2026-08-23 commit is a decision record with no
   `src` change, and it already lists this lane as a "dormant leader-witness reader".
3. **New finding that changes Parts 2 and 3: at `316671f87` the consumer of the decision is not constructed
   in production.** Since `ab901b40f` / `4ef9423c0` (2026-11-19, not on `main`) a partition service does not
   create a `UnifiedRebalancer` when placement admission is enabled, and production wiring enables it
   unconditionally. Placement for every partition is done by one `ReplicaPlacementOwner` on the leader of
   `replica_operations-p1`. On this line the scheduling-owner policy feeds admin diagnostics and tests only.
   On `main` the unified rebalancer still runs and the lane is dark only because of the role reader.
4. **The planning snapshot that carries `schedulingOwner` is recomputed on every node from that node's own
   cache; it is not computed once and published.** The W3 report inferred the opposite (its section 3.4).
   Re-keying the policy on the owner row therefore does not by itself make arbitration single.

---

## Part 1 - Corrected history

### 1a. The quest's own record

Source: `solve/quests/movielens-priority-surrogate-single-owner-arbitration/{quest.json,log.ndjson}` at
`316671f87` (33 log lines). All VERIFIED unless marked.

| Item | Content |
| --- | --- |
| Statement | "Every cluster-wide priority-recovery surrogate decision has one deterministic available rebalancer owner per planning generation, while each priority partition retains current-entity recovery, ownerless lost-wakeup fallback, operation safety, and the production five-node MovieLens milestone." |
| doneWhen | probe `scenario-harness`, scenario `movielens-lagrange-service-affinity-live`, `consecutive: 1`, metric `priority` |
| Epic / parent | `service-data-affinity-placement`; parent quest `movielens-create-budget-intent-serialization` |
| Sealed at | `5903c56100fd487a711978620d9a1b9db213b2d3` |
| Milestone constraint | `full-movielens-milestone`: "the production five-node MovieLens path" through schema admission, durable ratings creation, 100000-row preload, ratings-only split convergence and the three-way affinity report |
| Single-owner constraint | `single-surrogate-arbitration-owner`: "admit one cluster-wide surrogate decision through exactly one deterministic owner before move construction, capacity checks, or operation admission; bottom-level operation deduplication alone is not closure" |
| Policy constraint | `declarative-owner-policy`: one inspectable decision policy, no caller-local boolean |

Log entries that matter (line number, UTC timestamp):

| # | When | What it says |
| --- | --- | --- |
| 14 | 2026-07-16 06:41 (inherited) | The defect: "At 06:27:05 three priority rebalancers independently selected sql_write_operations-p1; at 06:27:17 four selected schema_operations-p1 ... every priority-partition rebalancer is eligible to synthesize the same cluster-wide surrogate; duplicate work is admitted before persistence deduplication." Run at checkpoint `27839875`. |
| 17 | 06:44 | Theory `snapshot_declared_priority_scheduling_owner`: "the target's live leader owns ordinary current work, otherwise one deterministically ranked live priority leader owns the surrogate; consumers reject non-matching surrogate work before move construction." Owned fix path `src/control-plane/priority-recovery-scheduling-owner-policy.js`. |
| 23 | 07:18 | Verifier approval of a 12-path delta: base failed seven assertions, patch passed 865 across 14 entrypoints, "13 TLC outcomes". |
| 26 | 07:39 | **"The changed live run at source checkpoint 59e6e031 proves snapshot-declared surrogate arbitration engaged: all 13 nonlocal priority-surrogate moves were emitted by the single declared replica_operations-p1 owner, eliminating the prior cross-rebalancer duplicate target scheduling."** Evidence archive `wave4-live-priority-surrogate-single-owner-arbitration-2026-07-16T07-24-56-083Z.tar.gz`, sha256 `dc3e6705...b2a61d`. The scenario still failed on a different owner (REPLACE bootstrap cohort). |
| 29 | 08:13 | Second run (`...2026-07-16T08-05-44-727Z.tar.gz`): "The single-owner surrogate arbitration is engaged in the changed live run: every nonlocal surrogate follows the one declared arbitration owner." Rules out "adding another procedural arbitration path". |
| 30-32 | 2026-07-20 10:47 | Reflection, then park as `exhausted`: "Reopen only if a run yields two surrogate owners in one planning generation". The doneWhen metric was 1 (FAIL) at every ingestion (lines 21, 24, 27). |

Three qualifications, each VERIFIED as a fact about the record:

- The quest's source commit is `d021073e2` (2026-07-16 09:18 +0200), an ancestor of `316671f87`. The log's
  "checkpoint 59e6e031" is not a git object in this repository (`git cat-file -t 59e6e031` fails). INFERRED:
  it is a Solver checkpoint identifier for the same tree, since the commit sits between the 07:18 approval
  and the 07:24 run.
- Neither archive is in the tree at `316671f87` nor in the primary checkout's
  `data/examples/service-data-affinity-demo-archive/`. The log line and its hash are the evidence; the
  archive was not opened.
- The sealed acceptance (the five-node scenario) never went green. The mechanism was observed engaged; the
  milestone was not reached. The quest is terminal (`exhausted`), so under R21 the correction below is
  appended to a successor record, not to this log.

INFERRED from the policy's own rule (`candidates[0]` in sorted order): in July the priority set was
`control_plane_publications, replica_operations, sql_transactions, sql_transaction_participants,
sql_write_operations, schema_operations` (`d021073e2:src/bootstrap/system-partition-classification.js:27-34`),
and `control_plane_publications-p1` sorts before the owner the run recorded. So even on the day it worked,
at least one priority partition had no visible leader row: the evidence was partial, which is what the
two-writer mechanism below predicts.

### 1b. Producer timeline for PARTITION service rows

The policy's predicate reads `normalizedService.raftRole === RAFT_ROLE.LEADER`
(`src/control-plane/priority-recovery-scheduling-owner-policy.js:84-91`, VERIFIED). Whether it can ever be
true depends on each writer of `services.raft_role` for a partition replica.

| Writer | Began collapsing leader to follower | Evidence |
| --- | --- | --- |
| `queueRoleUpdate` (role-update lane) | **2026-03-18**, `46b65f8ab` "wip stabilizing node join under load" (then in `partition-service.js`; moved to `partition-service-metadata-delivery-methods.js` by `04e765a51`, 2026-05-24) | VERIFIED: diff of `46b65f8ab`; `git log -S collapseLeaderToFollower` on the file |
| `pendingRoleUpdate` setter | **2026-03-18**, same commit (moved to `partition-service-core-base.js` by `f6672cc93`, 2026-06-14) | VERIFIED: same diff |
| `src/node/replica-handler-create-status-methods.js` local cache seed | **2026-07-13**, `248050a10`; a second site 2026-11-08, `248f6707e` | VERIFIED: `git log -S` on the file |
| **Row owner** `resolvePartitionRaftRole` in `partition-service-row-owner.js` (registration, activation, status update) | **2026-10-27**, `d1a099aaf` "WIP: Harden CDC causal confirmation, storage-budget CAS ownership, and seed READY publication" | VERIFIED: the diff replaces `return RAFT_ROLE.LEADER;` with `normalizePublishedRaftRole(RAFT_ROLE.LEADER, {collapseLeaderToFollower: true})` and re-keys `publishCanonicalLeaderNodeId` on `isLeaderPartitionService(service)` |
| `partition-service-metadata-mutation-helpers.js` live-role resolver | 2026-11-05, `3d847d40a` | VERIFIED (`git log -S`); it is a comparison helper, not a new publisher (INFERRED from the 12 lines of diff read) |
| `src/node/replica-handler-class.js` live-role resolver | 2026-11-08, `248f6707e` | VERIFIED (`git log -S`) |
| Lifecycle upsert `replica-state-machine-lifecycle-observation.js` | no collapse call in the file at any commit; it writes the replica state's own role and drops a cached `leader` (`:364-380`, `:421-428`) | VERIFIED for the file; whether a replica state can carry `leader` into it was not traced |

The shadow writer is the row owner. At the quest's commit it returned the raw role:

```
d021073e2:src/partition/partition-service-row-owner.js:47-60
  if (isLeader) { return RAFT_ROLE.LEADER; }
```

and it fired from seed registration and from activation
(`d021073e2:src/bootstrap/phases/seed-registration-phase.js:229`,
`src/bootstrap/shared/partition-service-activation.js:108`), VERIFIED. That is the row the consumer read in
July: the role-update lane had been collapsing for four months, and the registration stamp carried the leader.

What ended it:

| Date | Commit | Effect | Status |
| --- | --- | --- | --- |
| 2026-07-16 | `d021073e2` | consumer lands; two live runs show it engaged | VERIFIED (log 26, 29) |
| 2026-07-22 | `b68b0e19a` "retained dependency-availability wake" in `src/raft/authoritative-row-mutation-helper.js` | the collapsed role-update now flushes after its dependency becomes available and overwrites the registration stamp | VERIFIED that the commit adds the wake (`setCdcIntegrationService` schedules a follow-up flush). VERIFIED that the August record names it by bisect: "git bisect names b68b0e19a ... as first bad commit"; "all 135 partition-service cache rows stuck raft_role=follower". The causal chain between the two is INFERRED; the bisect was not re-run |
| 2026-08-23 | `d5e18ea3f` | owner decision "end state B": owner row is the authority, `services.raft_role` never publishes leader. The commit changes one test, the decision table and solve records; **no `src` file** | VERIFIED (`--stat`: 8 files, none under `src/`). The quest note in that commit lists "priority-recovery surrogate lane" among "the dormant leader-witness readers" to migrate, and "retire the row-owner raft_role leader stamp" as a later item |
| 2026-09-06 | solve-v2 migration | the umbrella quest `partition-leader-role-publication-visibility` that tracked those items is "deleted (undeclared draft, no roadmap row)" | VERIFIED: `solve/epics/solve-v2/migration-report.md:993` |
| 2026-10-27 | `d1a099aaf` | the row owner collapses too: no partition writer can emit `leader`. Parent commit is `54dd2d7ce` "feat(release): 0.2.6 raft-rs cutover"; first tag containing it is `v0.2.6` | VERIFIED |
| 2026-11 | three physical runs | `leader` 0 of 2697 / 1850 / 3126 published roles; 38 of 38 recorded decisions `target_owner_fallback` | from the W3 report section 1.6, not re-read |

**Date range.** Demonstrated live: 2026-07-16 (runs at 07:24 and 08:05 UTC). Input broken for at least the
single-node bootstrap case from 2026-07-22 (`b68b0e19a`); recorded as dormant on 2026-08-23; structurally
impossible from 2026-10-27 (`d1a099aaf`). Between 2026-07-22 and 2026-10-27 the row owner could still stamp
`leader` when a replica was activated after its election (the August note observes exactly that for the
message-group row), so intermittent surrogate decisions in that window cannot be excluded. No recorded
observation of a multi-node cluster in that window was found, either way.

**Was anything red?** One test, for a different reason, a month late: the services-p1 self-referential
integration test asserted a leader row and failed after `b68b0e19a`; it was found on 2026-08-23 and migrated
to the owner row. Nothing guarding this consumer went red, for three verified reasons:

- `test/rebalancer/priority-recovery-surrogate-owner-arbitration.test.js` writes its own
  `raft_role: 'leader'` rows (`:34-41`) and has one commit in its history, the quest's.
- Six further test files never run the policy: they hand-write `schedulingOwner: {mode: 'surrogate_owner'}`
  on a planning snapshot (section 2.5).
- The quest's live acceptance was failing when it was parked, so it could not regress.

### 1c. Paragraph for the successor record

> Correction to the statement that the priority-recovery surrogate lane "has never been reachable in
> production". Quest `movielens-priority-surrogate-single-owner-arbitration` landed the snapshot-declared
> scheduling owner at `d021073e2` on 2026-07-16, and its log (entries 26 and 29) records two five-node
> production-path runs that day in which every nonlocal surrogate move, 13 in the first run, was emitted by
> the one declared owner, `replica_operations-p1`. The lane read `services.raft_role = leader`. That value
> was already collapsed in the role-update lane since `46b65f8ab` (2026-03-18) and reached this consumer
> only through the row owner's registration and activation stamp. `b68b0e19a` (2026-07-22) let the collapsed
> update overwrite that stamp (recorded by bisect in the 2026-08-23 decision commit `d5e18ea3f`, which
> changed no source and already listed this lane as a dormant reader), and `d1a099aaf` (2026-10-27) removed
> the stamp, after which no partition row can say leader. The consumer was never migrated: the program that
> tracked it lost its quest record in the solve-v2 migration of 2026-09-06, and its tests supply their own
> leader rows or hand-written owner declarations, so nothing turned red. The sealed five-node acceptance
> was not green at any point. The original record stays closed; this entry supersedes the earlier claim.

---

## Part 2 - Bounded repair (design only)

### 2.0 Two facts that bound the repair

**F1. Per-node recomputation (VERIFIED).** A rebalancer reads the decision through
`readAvailablePriorityRecoveryPlanningSnapshot` (`src/rebalancer/unified-rebalancer-available-nodes.js:365-385`)
with `publicationNodeId: this.nodeId`. That resolves to `getPriorityRecoveryPlanningAnswerSync`
(`src/control-plane/control-plane-readiness-publication-planning-snapshot.js:438-497`), a projection
memoised per node (`:382-432`) and derived by `deriveMembershipPublicationPlanningSnapshotSync`
(`control-plane-readiness-publication-diagnostics.js:275-328`) from that node's own cache with
`publisherNodeId = nodeId || service.nodeId`. Nothing publishes `schedulingOwner`. Two nodes with different
cache views compute two declarations.

**F2. No production consumer on this line (VERIFIED for the code, INFERRED for ordering).**
`src/partition/partition-service-rebalancer-methods.js:181-183` returns before constructing a
`UnifiedRebalancer` when `rebalanceCoordinator.placementAdmissionEnabled === true`.
`ControlPlaneSetup.create` calls `bindReplicaPlacementOwnerFactory` unconditionally
(`src/bootstrap/shared/control-plane-setup.js:415-427`), which sets the flag
(`src/rebalancer/rebalance-coordinator-operation-creation-support.js:603-608`). The gate arrived for system
partitions in `ab901b40f` (2026-11-19 19:14) and for all partitions in `4ef9423c0` (2026-11-19 20:41). The
only other constructors are message-group services, for which `isControlPlanePriorityPartition()` is false
(`unified-rebalancer-control-plane-readiness-methods.js:202-205`). INFERRED: no partition service can build a
rebalancer before the flag is set, because it needs the coordinator that the same setup creates.

Consequence: on `316671f87` the edit set below changes what admin snapshots report and what tests prove. It
changes cluster behaviour only on a line where the unified rebalancer still plans for partitions (`main`
today). The lead must say which line the repair targets before it is implemented.

### 2.1 Producer and consumer symbols

| Role | Symbol | Location |
| --- | --- | --- |
| Authority producer | owner row `partitions.leader_node_id` | unchanged |
| Canonical read | `resolveCanonicalPartitionLeaderObservation({partition, serviceRows, partitionPresent})` | `src/query/canonical-leader-routing.js:230-291` |
| Decision | `buildPriorityRecoverySchedulingOwnersByPartitionId` | `src/control-plane/priority-recovery-scheduling-owner-policy.js:131-154` |
| Decision call site 1 | `buildPriorityRecoveryDecisionSnapshots` | `src/control-plane/priority-recovery-snapshot-closure.js:85-90` |
| Its caller | `buildPriorityRecoveryClosureEvidence` | `src/control-plane/membership-publication-readiness-repair.js:157-203` |
| Row source | `planningSnapshot.partitionRows`, already read beside `serviceRows` | `src/control-plane/membership-publication-candidate-derivation.js:615,688-689` |
| Decision call site 2 | admin diagnostics | `src/admin/admin-control-snapshot-control-plane-diagnostics.js:601-632,730-735` |
| Carrier | `schedulingOwner` field | `src/control-plane/priority-recovery-dispatch-snapshot.js:438-440` |
| Consumers | `isPriorityRecoverySchedulingOwner`, `inheritPriorityRecoverySchedulingOwner` | `src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js:171,196,225,268`; `unified-rebalancer-follow-up-decision.js:267` |
| Wake | `buildPriorityRecoveryVisibilityRebalanceDecision` | `src/rebalancer/priority-recovery-visibility-decision.js:160-284` |

All VERIFIED. The observation already refuses to call a role-derived identity available: only
`OWNER_CONFIRMED` and `RETAINED_RUNTIME` reach `AVAILABLE` (`:247-283`), everything else falls to
`DEFERRED` or `MISSING` (`:285-290`). So the policy has no role arm once it goes through the observation,
even before the W3 slice that deletes the role tier from the identity resolver.

One trap in the canonical read: `countCanonicalLeaderActiveServices` counts any ACTIVE service on the leader
node (`:195-209`). The policy must pass only the target partition's service rows, or a node hosting some
other active replica would make a stale owner row look available.

### 2.2 Owner-defined shape and the one algorithm

Per priority partition `P` in the snapshot's partition set, one availability state from the observation and
the recovery cohort:

| State | Condition | Owned consequence |
| --- | --- | --- |
| `OWNER_ROW_ABSENT` | observation `MISSING` | `P` is not a candidate; wake on the owner row appearing |
| `LEADER_UNKNOWN` | `DEFERRED / owner_row_missing` | not a candidate; wake on owner-row leader publication |
| `LEADER_SERVICE_NOT_ACTIVE` | `DEFERRED / owner_row_stale` | not a candidate; wake on the SERVICES change of that replica or a new leader publication |
| `LEADER_NOT_RECOVERY_ACTIVE` | `AVAILABLE`, leader node not in `recoveryActiveNodeIds` | not a candidate; wake on the membership publication that changes the cohort |
| `LEADER_AVAILABLE` | `AVAILABLE` and leader node recovery-active | candidate |

Decision for target `T`, candidates sorted by partition id as today:

| Outcome | Condition | Declared owner |
| --- | --- | --- |
| `current_owner` | `T` is a candidate | `T` |
| `surrogate_owner` | `T` is not, at least one candidate exists | first candidate; the record carries `T`'s state |
| `no_scheduling_owner` | no candidate | none; the record carries every state |

`target_owner_fallback`, `target_partition_fallback` and `live_leader_evidence_unavailable` go. The record
also carries what it was decided on: for `T` and for the declared owner, `leader_claim_raft_term` and the
row's `updated_at_hlc`, so two declarations can be ordered and a test can tell a stale one from a competing
one. Tests build the record through the policy from rows; none hand-writes it.

Two existing silent paths have to be closed in the same change or it is not "one algorithm":

- `isPriorityRecoverySchedulingOwner` treats a snapshot with no declaration as owned by its target
  (`policy.js:166-176`). That is a second decision. A missing declaration becomes `no_scheduling_owner`.
- Declarations exist only when `replicaOperationRows.length > 0` and no closure witness is retained
  (`membership-publication-readiness-repair.js:165-184`). Follow-ups synthesised from the summary inherit
  nothing (`follow-up-decisions.js:262-272`) and so fall into the path above. The policy must run whenever a
  planning snapshot is derived, and the declaration map must sit on the snapshot, not only on per-operation
  decision snapshots. The arbitration test hides this today by calling the builder directly with
  `replicaOperationRows: []` (`:50-63`), which production never does.

Open design point for the lead (not decided here): under `no_scheduling_owner`, may `T`'s own leader still do
its current-entity work on its local leadership alone? The sealed constraint says current-entity recovery is
preserved; today the target-equality path provides it by accident. Stating it as "local leadership of `T`
is sufficient authority for `T`'s own work; the published decision arbitrates surrogates only" keeps the
constraint and removes the fallback, but it lets `T`'s leader and a surrogate both act during a publication
delay. That is scenario S2 of Part 3 and the reason F1 matters.

### 2.3 Identity, ordering, unavailability, commit

- Identity: the owner row is node-level (W3 ruling D1). The decision names partitions, never replicas.
- Ordering: one node's view per partition. No cut across partitions is claimed. A declaration is valid for
  the pair (claim term, row version) it carries; a consumer holding a lower pair for the same partition
  discards it.
- Absent versus unavailable: the five states above; no state defaults to another.
- Durable commit: unchanged. The declaration is a disposable projection; an effect becomes authoritative at
  the placement admission entry committed on `replica_operations-p1`
  (`src/partition/partition-placement-admission.js`, reached through
  `commitSingleCreatedPlacementOperation`, `rebalance-coordinator-operation-creation-support.js:564-566`).
- Retained obligations: decisions already computed with `target_owner_fallback` live only in per-node memos
  and are replaced at the next derivation; no durable row names a mode (VERIFIED: the only non-source
  occurrence of the mode strings in the tree is the quest log).

### 2.4 Wake and reconsideration

VERIFIED today:

- Recomputation is already driven by the owner row. A PARTITIONS change sets `rebuildPriorityPartitions`
  (`src/control-plane/readiness-planning-global-projection.js:376-377`) and the projected record carries
  `leaderNodeId` (`:147-153`), so the planning projection's identity moves when a leader is published.
- The rebalancer is not woken by it. The visibility decision has arms for SERVICES of its own partition,
  terminal REPLICA_OPERATIONS of its own partition, NODES ready leases and endpoints, and none for
  PARTITIONS (`priority-recovery-visibility-decision.js:209-270`; the file does not contain the table name).
  The cache listener forwards every table (`unified-rebalancer-priority-recovery-coordination.js:125-133`),
  so the event arrives and is dropped.

Design: one new arm. A PARTITIONS change for any priority partition whose `leader_node_id` differs from the
value last seen enqueues `RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS` on every priority-partition leader's
rebalancer. It cannot be scoped to "own partition": the declared owner of `T` is by definition another
partition. The periodic loop stays as a second trigger of the same decision, which the contract allows.
Cancelling: the listener is already unbound at `:136-149`; nothing durable to release.

### 2.5 Edit set

Source (line targets at `316671f87`):

| File | Change |
| --- | --- |
| `src/control-plane/priority-recovery-scheduling-owner-policy.js` | replace `resolveLivePriorityRecoverySchedulingOwnerPartitionIds` (`:72-101`) with the availability table of 2.2 over `partitionRows` plus per-partition `serviceRows`; new outcome `no_scheduling_owner`; delete the three fallback constants and the target-equality arm of `isPriorityRecoverySchedulingOwner` (`:169-176`); drop imports `RAFT_ROLE`, `SERVICE_STATUS` |
| `src/control-plane/priority-recovery-snapshot-closure.js` | pass `partitionRows` at `:85-90`; expose the declaration map on the snapshot summary |
| `src/control-plane/membership-publication-readiness-repair.js` | pass `partitionRows` at `:185-193`; declare before the shortcut at `:165-184` |
| `src/control-plane/membership-publication-candidate-derivation.js` | add `partitionRows: planningSnapshot.partitionRows` at `:673-695` |
| `src/admin/admin-control-snapshot-control-plane-diagnostics.js` | read PARTITIONS rows next to SERVICES at `:601-602`, pass them at `:620-632` |
| `src/control-plane/priority-recovery-dispatch-snapshot.js` | carry the widened record at `:438-440` |
| `src/rebalancer/priority-recovery-visibility-decision.js` | the PARTITIONS arm of 2.4 |
| `src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js`, `unified-rebalancer-follow-up-decision.js` | read the declaration from the snapshot for synthesised follow-ups (`:247-309`, `:267`); handle `no_scheduling_owner` |

Fixtures that must move from fabricated rows to the real publication shape (follower SERVICES rows plus a
PARTITIONS row with `leader_node_id`):

| File | Today |
| --- | --- |
| `test/rebalancer/priority-recovery-surrogate-owner-arbitration.test.js` | `buildLeaderServiceRow` writes `raft_role: 'leader'` (`:16,34-41`); asserts `evidenceSource: 'live_priority_partition_leaders'` (`:137,229`) |
| `test/rebalancer/priority-recovery-surrogate-single-followup.test.js` | hand-written `schedulingOwner` (`:15-17`) |
| `test/rebalancer/unified-rebalancer-closure-witness-followup-test-cases.js` | hand-written (`:166-168`) |
| `test/rebalancer/unified-rebalancer-priority-recovery-serial-wait-test-cases.js` | hand-written (`:141-144`) |
| `test/rebalancer/unified-rebalancer-surrogate-followup-synthesis-test-cases.js` | hand-written (`:321-323`) |
| `test/rebalancer/unified-rebalancer-triggers-priority-surrogate-followup.test.js` | hand-written (`:284-286,329-331`) |
| `test/rebalancer/unified-rebalancer-triggers-priority-surrogate-gates.test.js` | hand-written (`:487-489`) |

So one file reaches `surrogate_owner` by writing leader rows and six reach it by declaring it. All seven
are VERIFIED by line. Also touched: the two navigability baselines that count these identifiers
(`scripts/check-guideline-navigability-baseline-legacy_term_identifiers.json`,
`...-row_field_alias_reads.json`), which tighten, and one entry in `test/shards/historical-regression-corpus.json`.

Impact contracts: no entry of `contracts` (99) or `coupledPairs` (71) in
`test/shards/impact-contracts.json` names the policy, the closure builder, the follow-up decisions, the
visibility decision, the readiness repair, the candidate derivation or `canonical-leader-routing.js`
(VERIFIED by searching both maps). A change to the policy selects none of its seven tests through this
manifest today. The repair adds one contract, `priority-recovery-scheduling-owner-arbitration`, owning the
eight source files above plus `src/query/canonical-leader-routing.js`, with the seven tests and the new
witnesses.

### 2.6 Red witnesses on `316671f87`

All four are predicted from the code read; none was executed.

| # | Rows | Required | Today |
| --- | --- | --- | --- |
| W1 | follower ACTIVE rows for `control_plane_publications-p1` on node-a and `sql_write_operations-p1` on node-b; owner rows naming node-a and node-b; both nodes recovery-active | decision for `sql_write_operations-p1` is `current_owner` with both candidates | `{partitionId: 'sql_write_operations-p1', mode: 'target_owner_fallback', candidatePartitionIds: [], evidenceSource: 'target_partition_fallback'}` |
| W2 ownerless | as W1, but the target's owner row has no `leader_node_id` (second case: its leader node is outside the cohort) | `surrogate_owner` = `control_plane_publications-p1`, accepted by exactly that rebalancer | same fallback record; no rebalancer accepts, so nothing schedules the target |
| W3 wake | a PARTITIONS change publishing a leader for a priority partition, delivered to another priority partition's leader | `shouldEnqueue: true` | `false` |
| W4 two views | node X's cache has the target's leader published, node Y's does not | one declared owner at any instant | two (`current_owner` on X, `surrogate_owner` on Y). Red after W1-W3 are green as well: it measures F1, and it decides whether a per-node declaration can meet the sealed constraint at all |

### 2.7 What becomes live

- On `316671f87`: admin snapshots stop reporting `target_owner_fallback` with empty candidates and report
  the real state per partition. No placement behaviour changes, because no partition rebalancer exists to
  consume the declaration (F2).
- On a line where the unified rebalancer plans for partitions: for the first time since 2026-07-22 a
  priority partition whose owner row names no available leader is scheduled by another priority partition's
  leader, and the target's own leader defers while a surrogate is declared. In a five-node cluster with six
  priority partitions spread over several leaders that is one declared scheduler per target per view, where
  today it is "the target or nobody". The July defect (three and four rebalancers picking the same target)
  cannot recur through this lane within one view; across views W4 applies.

---

## Part 3 - Necessity comparison (test design)

### 3a. The two mechanisms at `316671f87`

**Mechanism S, the surrogate lane.** No durable state and no messages of its own. It is a field on a
per-node projection plus consumer logic in the unified rebalancer.

| Step | Where | Code |
| --- | --- | --- |
| 1 derive planning snapshot | every node, from its cache | `control-plane-readiness-publication-planning-snapshot.js:382-497` |
| 2 declare owner per target | same node | `priority-recovery-snapshot-closure.js:85-90`, the policy |
| 3 run the loop | each priority partition's leader replica; leader-gated | `unified-rebalancer-rebalance-loop.js:161-168` |
| 4 decide a follow-up is needed | each such rebalancer | `rebalancer-evaluation-methods.js:97-103`; `unified-rebalancer-follow-up-decision.js:571-581` |
| 5 construct the move | each rebalancer that passes the owner check | `unified-rebalancer-follow-up-augmentation-methods.js:216-346`; owner check `follow-up-decisions.js:217-245` |
| 6 capacity and budget | same rebalancer | `unified-rebalancer-rebalance-loop.js:183-215` (`computeRebalanceAvailableBudget`, `getGlobalInFlightOperationCount`, `canBypassGlobalBudgetForPriorityRecovery`) |
| 7 admit | coordinator, then a placement entry on the ledger partition when placement admission is enabled (the case on this line; without it, the older repository create path) | `rebalance-coordinator-operation-creation.js:495-500`; `rebalance-coordinator-operation-creation-support.js:492-567` |
| 8 deduplicate | ledger admission decision (intent key, `PARTITION_BUSY`) | `replica-placement-owner-constants.js:119-123` |
| wake | cache changes, coordinator progress, timer | `unified-rebalancer-priority-recovery-coordination.js:114-271` |

**Mechanism C, the canonical path.** One `ReplicaPlacementOwner`, attached as the leadership sink of
`replica_operations-p1` (`src/rebalancer/replica-placement-owner.js:762-778`;
`partition-service-rebalancer-methods.js:126-142`). It is the only partition placement path that runs in
production on this line (F2).

| Step | Code |
| --- | --- |
| 1 become owner: local raft leadership of the ledger partition; `LEADERSHIP_START` pass reconciles unresolved attempts | `replica-placement-owner.js:485-497,709-716` |
| 2 triggers: ledger commit, write path released, nodes or formation, SERVICES / PARTITIONS / TABLES cache change, capacity change, 60 s resync | `:301-345,358-373`; `PLACEMENT_RESYNC_INTERVAL_MS` `:47` |
| 3 read inputs: ledger census, committed node authority (not ready is a named state with a scheduled refresh) | `:713-729` |
| 4 construct: every partition, leader taken from `partitions.leader_node_id` | `:556-583`; `replica-placement-owner-deficits.js:190-208,443-478` |
| 5 capacity: saturated targets, storage exclusion, copy occupancy, remove floor | `:499-539,615-622` |
| 6 admit: one ledger entry per candidate, typed `ADMITTED` or `REFUSED` | `:454-476,653-681` |
| 7 deduplicate: attempt key `admit:<partitionId>`, intent key, persisted unresolved attempts, busy set from the census | `:455-463,730-733` |
| named waits | `PLACEMENT_WAITING_REASON`, including `LEADER_UNKNOWN`, each mapped to a clearing trigger | `replica-placement-owner-constants.js:140-152,205-226`; produced at `deficits.js:330-332,410` |

All VERIFIED. Three properties of C bear on the comparison:

- Its ownership fact is local live leadership of one raft group, not a published hint. There is at most one
  leader per term and a deposed leader's entries fail at the ledger, so "one owner before move construction"
  holds by construction in a way S cannot match across views (F1). INFERRED; scenario S4 tests it.
- It does not have S's ownerless case. The scheduler of every partition is the ledger leader, whether or not
  the target has a leader. A target with no known leader waits as `LEADER_UNKNOWN`, because the copy source
  is the leader (`deficits.js:330-334`).
- One wart to route: the clearing trigger declared for `LEADER_UNKNOWN` is `SERVICES_CHANGED`
  (`constants.js:217`), which names the retired witness. Any trigger runs a full pass, so it is probably
  harmless, but the declared wake is not the event that clears the wait.

### 3b. Scenario matrix

Seven scenarios by two mechanisms: 14 cells. "Target" is a priority partition with a spread or replica
deficit. S is evaluated as repaired per Part 2, on a composition where the unified rebalancer runs. Expected
behaviours are INFERRED predictions for the test to confirm or refute.

Observables, the same for both columns:

- **T-admit**: time from the disruption clearing to the first `ADMITTED` ledger entry for the deficit.
  Bound: one wake plus one pass, and never beyond the periodic backstop (60 s resync for C; the priority
  retry interval for S).
- **Owners(t)**: number of distinct schedulers for the target at an instant. S: distinct declared owners
  across all nodes' planning snapshots plus any rebalancer acting on local leadership. C: nodes whose
  placement owner has `isLeader` true.
- **Final placement**: replication factor and distinct-host spread met; summary `satisfied`.
- **Work counts** of 3c.

| # | Scenario | S expected | C expected | Stall signature |
| --- | --- | --- | --- | --- |
| 1 | Target's scheduling owner lost: target leader killed, no successor yet | surrogate declared within one derivation; the surrogate constructs the move, which then needs a copy source | target waits `LEADER_UNKNOWN`; a pass runs on the successor's publication | no `ADMITTED` entry within the backstop after a leader exists |
| 2 | Delayed publication: successor elected, owner row not yet durable | target's leader sees its own tenure locally, other nodes do not: **Owners = 2** unless Part 2's open point is settled | scheduler unchanged; waits until the row reaches the ledger leader's cache | Owners > 1 (S); T-admit above backstop (C) |
| 3 | Missed wake: the PARTITIONS change is dropped at the scheduler | recovered only by the periodic loop | recovered by the 60 s resync; `placementResyncAdmissions` increments | admission only after an unrelated event, or never |
| 4a | Ownership change A to B during recovery | S: the declared surrogate's leader moves, or the target regains a leader. C: ledger leadership moves A to B | old owner stops on its next owner check; new owner starts from the snapshot | B's `LEADERSHIP_START` pass reconciles A's unresolved attempts; A's late entry is refused | two admissions for one deficit; an attempt abandoned with outcome unknown |
| 4b | A to B to A | declaration returns to A; pair (claim term, row version) must discard the stale one | A reconciles again; persisted attempts decide | a stale declaration acted on; duplicate copy |
| 5 | Progress after the disruption clears | target's own leader resumes; surrogate declaration ends at the next derivation | one pass admits the remaining candidates in order | deficit remains with no named wait |
| 6 | Five nodes, several rebalancers active, three simultaneous deficits | six priority-partition leaders evaluate; one declared owner per target per view | one owner, one ordered pass | construction or admission work by more than one actor per deficit |

Row 4a applies the same disturbance to each mechanism's own ownership fact, which is the fair comparison:
S's owner is a partition's leader, C's is the ledger's.

### 3c. The duplication measure

For each cell, count per deficit and per actor, not surviving operations:

| Work | S: where | C: where | How a test counts it without touching production |
| --- | --- | --- | --- |
| Move construction | `buildPriorityRecoveryFollowUpMove` via `augmentMovesWithPriorityRecoveryFollowUp` (`follow-up-augmentation-methods.js:262-346`) | `evaluatePartitionDeficit` returning `CANDIDATE` (`deficits.js:443-478`) | S, live: the `'Executing rebalancing move'` log event (`rebalancer-constants.js:161`) grouped by emitting `entityId` and `movePartitionId`, the correlation the July analysis used (log entry 14). S, in process: the fixtures already build rebalancers with `Object.create(UnifiedRebalancer.prototype)` and replace methods, so a counting wrapper is a fixture change. C: **no counter exists**; `lastPassSnapshot` records admitted ids only (`replica-placement-owner.js:752-754`) |
| Capacity checks | `computeRebalanceAvailableBudget`, `getGlobalInFlightOperationCount` (`rebalance-loop.js:194-215`) | `readStorageExcludedTargets`, `isCandidateAdmissibleNow` (`:527-539,615-622`) | both read injected collaborators (`storageAccountingService.getCapacitySemanticIdentity`; the coordinator's in-flight count), so the test passes counting collaborators |
| Admission attempts | coordinator create, then the ledger entry | `submitCandidateAdmission` | both end as a committed ledger entry whose result is `ADMITTED` or `REFUSED` (`:464-466,677-678`). Count `ENTRY_COMMITTED` events on the ledger partition service (`:304-311`), **including refusals**, grouped by proposer. Refused entries are the admission work that final deduplication hides |

The one missing observation, owner-side and diagnostic: extend `lastPassSnapshot` with counts
`{evaluated, candidates, capacityChecked, proposed, refused}` for the pass. The file's header already lists
"lastPassSnapshot diagnostic publication" as permitted post-commit work, so this adds no authority.

Pass condition for "no duplication": for every deficit in every cell, each of the three counts has exactly
one actor.

### 3d. Existing coverage and harnesses

| Asset | Exercises | Reaches `surrogate_owner` how |
| --- | --- | --- |
| `test/rebalancer/priority-recovery-surrogate-owner-arbitration.test.js` (quest witness) | policy plus consumer, single view, scenario 1 and part of 6 | by writing leader rows |
| the six files in 2.5 | consumer behaviour once an owner is declared | by declaring it |
| `test/control-plane/priority-recovery-*` (31 files) | decision snapshots, serial wait, closure | none mentions an owner mode (VERIFIED by search); whether they pass rows that would now yield one was not checked |
| `test/rebalancer/replica-placement-owner-core.test.js`, `replica-placement-owner-clearing-triggers.test.js`, `test/convergence/dt-placement-owner-formation-drain.test.js` | mechanism C, including clearing triggers | not applicable |
| `test/convergence/dt6-priority-recovery-add-dispatch-cadence.test.js`, `dt6-priority-recovery-drain-parked-self-move.test.js`, `dt6-rebalancer-timeout-*` | cadence and drain under a simulated network | not read |
| distributed scenarios `node-failure-rebalance`, `partition-kill-heal-under-load`, `seed-restart-under-load`, `rolling-restart`, `in-cluster-chaos-injection` | candidates for scenarios 1, 4, 5 on real nodes | not read; none asserts an owner count (INFERRED from the search above) |

VERIFIED: no existing test exercises scenario 2, 3 or 4 for S, and none measures 3c for either mechanism.

Harnesses:

- `node scripts/lab.js harness run --scenario <name> [--config <file>]` (`scripts/lab/harness.js:66-69`).
  It refuses with fewer than two Linux Docker hosts (`:58,131`), holds every node before starting and waits
  up to 30 minutes for them (`:75,376-387`). A five-node run needs a config that places five nodes; no
  five-node lab config was located in this pass.
- `npm run -s health:formation` runs the MovieLens formation-only phase with five local processes by
  default, or one node per GCP VM with `--gcp`, and appends a verdict to `data/formation-health/trend.ndjson`
  (`scripts/checks/formation-health.js:4-11`). It forms a cluster; it injects no disruption, so it serves as
  the baseline cell and for scenario 6 only.
- Cost of one run: **not measured**. The only figures found are the sealed budgets in the quest (180 s
  schema, 60 s stability) and the 30-minute node-hold budget.

Proposed execution order: (1) in process, single view, both mechanisms, scenarios 1, 3, 5, 6 with counting
collaborators; (2) in process, two cache views, scenarios 2, 4a, 4b, which is where W4 lives; (3) one
five-node lab run per mechanism for scenario 6 and one kill-and-heal run for 1 and 5. Stage 3 for S needs a
build in which partition rebalancers exist, which this line does not provide (F2).

### 3e. Decision rule

**Redundancy is established** if, in all seven scenarios, C shows T-admit within its bound, Owners never
above 1, final placement satisfied, and exactly one actor for each of the three work counts; and no scenario
exists in which S admits and C stalls. Then: delete the consumer logic of 3a steps 4-5, the policy, the
field and the seven tests; keep and promote to C the scenario tests that carry the requirements. Draft
supersession text:

> Supersedes `movielens-priority-surrogate-single-owner-arbitration` (sealed at `5903c561`, parked
> exhausted 2026-07-20). Its mechanism, a scheduling owner declared on the priority-recovery planning
> snapshot from published partition leader roles, was observed engaged on 2026-07-16 and lost its input
> between 2026-07-22 (`b68b0e19a`) and 2026-10-27 (`d1a099aaf`). Its requirements are carried forward
> unchanged and re-homed on the placement owner hosted by the leader of `replica_operations-p1`: (1) one
> scheduler per deficit before move construction, capacity checks or admission; (2) recovery of a priority
> partition whose own leader is temporarily absent, with a named wait and an owned wake; (3) no loss of
> progress on a missed wake; (4) the production five-node MovieLens milestone. Evidence: the necessity
> matrix of `surrogate-scheduling-owner.md` section 3, run at `<head>`, with per-actor work counts. The
> declared-owner policy, its consumers and their fixtures are removed in the same change.

**A stalled recovery case is exposed** if any scenario shows C with T-admit beyond its bound or a deficit
left without a named wait. Then repair the single owner that exists, and add no second scheduling path. The
likely repairs, in the order the code suggests: the `LEADER_UNKNOWN` clearing trigger (3a); a pass on
owner-row leader publication for a waiting partition if the cache trigger proves insufficient; reconciliation
of unresolved attempts across an A to B to A change.

**If S passes and C fails a scenario that only a second scheduler could serve** (a target that needs
scheduling while the ledger partition itself has no leader), that is not grounds to keep S: S admits through
the same ledger on this line, so it cannot make progress there either (VERIFIED for `316671f87` with
placement admission enabled: step 7 of S; not true of a line without placement admission). Record it as a
ledger availability finding.

---

## Not checked

- The two July evidence archives; the quest's attempt diff (archived in `solve-v1-archive.tar.gz`).
- The `b68b0e19a` bisect was not re-run; its causal mechanism is inferred from the diff and the August note.
- Any multi-node observation of published roles between 2026-07-22 and 2026-10-27.
- Whether the lifecycle upsert can receive a replica state carrying `leader`.
- Whether `main` (`428a27fc6`) is otherwise identical in the surrogate consumer; only the absence there of
  `ab901b40f` and of `replica-placement-owner.js` was verified.
- Construction ordering behind F2 (a rebalancer built before the flag is set).
- `docs/steering/router.md` and the full text of `architecture/contracts/authority-and-recovery.md` (headings
  and the principles section were read); the W3 report sections 1.3-1.5.
- The convergence and distributed tests named in 3d beyond their file names; lab configs; run cost.
- The W3 physical-run figures were taken from that report, not recounted.

## Open questions for the lead

1. Which line does the repair target? On `316671f87` partition rebalancers are not constructed, so the
   repaired policy has no production consumer. Is the 2026-11-19 placement cutover the intended end state?
   If yes, the owner's "repair, then compare" order turns into "compare C against the requirements, then
   delete or re-home", and the repair reduces to making the admin report truthful or removing it.
2. If the unified rebalancer is to return for partitions, is a per-node declaration acceptable given W4, or
   must the declaration be computed at one node and published?
3. Under `no_scheduling_owner`, may the target's own leader act on local leadership alone (2.2)?
4. May `lastPassSnapshot` gain the pass counts of 3c before the baseline, as a diagnostic-only change?
5. The correction of 1c needs an open successor record to be appended to. Which one?
