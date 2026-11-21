# W3 - Leader identity has one authority: impact, contract and migration plan

Read-only investigation. Source read: `/tmp/lagrange-core-three-repairs-composed-20261121` at
`f580579a5` ("the collected runtime"). Physical evidence read: `/tmp/lagrange-physical-peerbytes-nov21`
(source `60fe32768`, run `3ed87e16`), `/tmp/lagrange-physical-querytrace-nov21` (`174398543`),
`/tmp/lagrange-physical-e3e0-nov21` (`e3e0164d6`). Nothing was run except greps and JSON reads.
No test was executed, so every behavioural statement below is from reading code or retained artifacts.

Legend: **VERIFIED** = read in the named file at the named line, or counted in a retained artifact.
**INFERRED** = follows from verified facts but one hop was not read. Paths are relative to the source tree
unless absolute.

---

## 0. Headline

1. The census premise is confirmed where it matters: **no partition SERVICES row ever carries `leader`**.
   In 52 + 40 + 64 retained cluster snapshots of three physical runs the published roles are
   `follower` 2504 / 1842 / 3038 and `learner` 193 / 8 / 88, `leader` **0** (VERIFIED, section 1.6).
2. **None of #2, #3, #4, #5 is shown to delay or block priority spread in the three-host formation, and none
   admits an unsafe leader removal on `f580579a5`.** This is the opposite of the working hypothesis, so the
   reasons are spelled out per consumer in section 1:
   - #2 is genuinely broken (38 of 38 recorded scheduling-owner decisions are `target_owner_fallback` with an
     empty candidate set) but is **behaviourally neutral** whenever every priority partition has a published
     leader on a recovery-active node, which the same snapshots show held at every sample.
   - #3 and #4 are **decision-dead**: for a partition REPLACE the remove-safety answer comes from a fresh
     membership witness (`lead === target`), not from the row-derived booleans.
   - #5 has a **correct live arm ahead of the dead role arm** (the planner's own `isLeader` + `replicaId`).
   - The three-host formation performs **only ADD operations** (no REPLACE, no REMOVE in any retained node
     log), so #3, #4 and #5 are not on that path at all.
3. The migration is therefore **hygiene and latent-defect removal, not the formation fix**. It is still
   worth doing under the "no legacy / one version of any logic" rule: 19+ sites keep a role arm, a fallback
   tier or a tie-break that either never fires or fires on a guess, the tests that cover them build rows the
   producer cannot emit, and one consumer (#2) silently lost a whole sealed feature (surrogate scheduling).
4. Six further role reads in `src` were found beyond the census (section 2.1), including one inside the
   "model" wake (`announcesLeader`), one in the canonical-leader **producer**, and the only admin readiness
   gate with a role arm. In the harness, the split-brain scenario reads leaders only from `raft_role` (it
   cannot observe one), and the formation simulator seeds the inverse of production (`leader_node_id: null`
   with role `leader`).
5. The fixture count reproduces (489 lines / 196 files) but the full write set is 614 lines in 256 files plus
   104 builder call sites; 17 lines are legitimate wasm/meta (section 5.3).

---

## 1. Live impact of #2, #3, #4, #5

### 1.1 Shared input fact

| Fact | Evidence | Status |
| --- | --- | --- |
| Every partition role writer collapses leader to follower | `src/partition/partition-service-row-owner.js:89-101`, `partition-service-core-base.js:364-366`, `partition-service-metadata-mutation-helpers.js:53-55`, `partition-service-metadata-delivery-methods.js:30`, `src/node/replica-handler-class.js:101-103`, `replica-handler-create-status-methods.js:579-580,682-684` | VERIFIED |
| `normalizePublishedRaftRole` returns FOLLOWER for LEADER when `collapseLeaderToFollower` | `src/raft/published-raft-role.js:17-25` | VERIFIED |
| `normalizeServiceRow` lower-cases `raft_role` into `raftRole` and does not re-derive it | `src/control-plane/system-row-normalizers.js:97-135` | VERIFIED |
| Physical rows: `leader` never published | section 1.6 | VERIFIED |

### 1.2 #2 - priority-recovery scheduling owner

| Step | What | Evidence |
| --- | --- | --- |
| Input rows | `planningSnapshot.serviceRows`: the SERVICES shadow of the system-table cache (`readProjectionRows(sourceRowsByTable, TABLES.SERVICES, ...)`) | `src/control-plane/readiness-planning-global-projection.js:400-431` VERIFIED; hop from there to `membership-publication-candidate-derivation.js:689` INFERRED (same field name, one intermediate builder not read) |
| Passed to | `buildPriorityRecoveryClosureEvidence` -> `buildPriorityRecoveryDecisionSnapshots({serviceRows})`, only when `replicaOperationRows.length > 0` and no retained closure witness | `src/control-plane/membership-publication-readiness-repair.js:157-193` VERIFIED |
| Policy call | `buildPriorityRecoverySchedulingOwnersByPartitionId({partitionIds, serviceRows, availableNodeIds: publicationContext.recoveryActiveNodeIds})` | `src/control-plane/priority-recovery-snapshot-closure.js:85-90` VERIFIED |
| Predicate | a row is a live leader iff node is available AND `status === active` AND `normalizedService.raftRole === RAFT_ROLE.LEADER` AND partition is priority control-plane | `src/control-plane/priority-recovery-scheduling-owner-policy.js:84-91` VERIFIED |
| Canonical conjunct | **none**. The policy never reads `partitions.leader_node_id` | same file, whole | VERIFIED |
| Outcome table | `CURRENT_OWNER` if target in candidates; else `SURROGATE_OWNER` = `candidates[0]` if any; else `TARGET_OWNER_FALLBACK` = target | `:25-66` VERIFIED |
| Consumer | `isPriorityRecoverySchedulingOwner(decisionSnapshot, this.entityId)`: declared owner partition must equal the consuming rebalancer's partition | `:156-177`; used at `src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js:171,196,225` VERIFIED |

**What goes wrong.** The candidate set is always empty, so the state is always
`LIVE_LEADER_EVIDENCE_UNAVAILABLE` and the owner of every decision is the target partition itself. Two
consequences:

- For a partition's **own** follow-up (`getCurrentPriorityRecoveryFollowUpDecisionSnapshot`, `:141-182`) the
  declared owner equals `this.entityId`, exactly as `CURRENT_OWNER` would. No change.
- For a **surrogate** follow-up (`appendPriorityRecoverySurrogateFollowUpDecision`, `:217-245`) the declared
  owner is the other partition, never `this.entityId`, so the function returns `false` every time. The whole
  surrogate lane sealed by quest `movielens-priority-surrogate-single-owner-arbitration` (2026-07-16,
  statement: "one deterministic available rebalancer owner per planning generation") **has no production
  path**. Its tests reach `surrogate_owner` only by writing `raft_role: RAFT_ROLE_LEADER`
  (`test/rebalancer/priority-recovery-surrogate-owner-arbitration.test.js:38,132,227`, VERIFIED).

**Which operation is affected.** The recovery ADD/REPLACE of a priority partition that has **no live leader of
its own** (its rebalance loop is leader-gated, `src/rebalancer/unified-rebalancer-rebalance-loop.js:161`):
nobody schedules it until that partition elects a leader. Not delayed: a partition with a live leader.

**Formation verdict.** In a fresh three-host formation the seed leads every priority partition and is
recovery-active, so a correct canonical candidate set would contain every partition and the outcome would be
`CURRENT_OWNER` with the same `partitionId` the fallback already yields. **#2 cannot delay or block spread in
that topology** (VERIFIED by predicate logic plus the evidence in 1.6: `leader_node_id` is non-null for every
priority partition at every retained sample). It cannot admit an unsafe removal (it only chooses who
schedules).

### 1.3 #3 and #4 - REPLACE remove-safety leadership booleans

| Step | What | Evidence |
| --- | --- | --- |
| Input rows | `removingReplicaRow`, `replacementReplicaRow`, `currentVoterReadyRows` from the authoritative-merged critical replica rows; `partitionRow` from `getCriticalPartitionRowForSafety` | `src/rebalancer/operation-workflow-remove-safety-evaluator.js:560-583,675-685`, `priority-publication-handoff.js:85-98` VERIFIED |
| #4 predicate | `getPriorityPublicationSourceRoleState`: `raft_role === follower` -> FOLLOWER; `resolvePriorityPublicationSourceRoleState` returns FOLLOWER **before** it compares `leader_node_id` with the source node | `src/rebalancer/priority-publication-safety-topology.js:233-242,263-270` VERIFIED |
| #4 use | `sourceLeadershipReleaseObserved = sourceRoleState === FOLLOWER` -> true for every published voter, the live leader included | `priority-publication-leader-safety.js:132-133` VERIFIED |
| #3 predicate | `hasCoLocatedLeaderSiblingEvidence`: another voter-ready row on the same node whose role state is LEADER -> never true | `priority-publication-leader-safety.js:28-56` VERIFIED |
| #3 use | `(partitionLeaderStillSource !== true \|\| coLocatedLeaderSiblingObserved === true)` in the follower-source SAFE row | `priority-publication-safety-shared.js:67-76` VERIFIED |
| Canonical conjuncts | `partitionLeaderMovedAwayFromSource`, `partitionLeaderStillSource`, `replacementLeaderOwnershipObserved` all read `partitionRow.leader_node_id` (node-level) | `leader-safety.js:101-152` VERIFIED |
| Snapshot result | `SAFE` or `LEADERSHIP_PENDING`, plus `NOT_APPLICABLE`, `PUBLICATION_STATUS_UNAVAILABLE`, `WAIT_PUBLICATION_PUBLISHED` | `leader-safety.js:202-315` VERIFIED |
| **Who decides** | `evaluatePriorityPublicationLeaderRemoveSafety`: `NOT_APPLICABLE` -> null; **`isPartitionReplace(operation) && state not a publication wait` -> `evaluateReplaceNamedHandoffSafety(operation)`**; the two publication waits -> deferred; the fall-through is again the named handoff | `priority-publication-handoff.js:100-161` VERIFIED |
| Named handoff | fresh `READ_REPLICA_MEMBERSHIP` witness; SAFE only if `witness.leaderReplicaId === targetReplicaId`; witness UNAVAILABLE -> wait; no leader -> wait; otherwise issue one named-target STEP_DOWN | `operation-workflow-replace-handoff-attempt.js:202-238`, `operation-workflow-replace-witness.js:196-212` VERIFIED |

**What goes wrong.** As written the booleans are wrong (one always true, one never true). If they decided
anything, the written logic would reduce to `SAFE iff sourceReplicaRemoved OR leader_node_id names another
node OR (completionSafe AND voterSufficient AND leader_node_id != sourceNode AND not publication partition)`,
which would (a) hold every co-located follower REPLACE on the seed until leadership left the seed node and
(b) pass a follower-source removal with `leader_node_id` NULL. **Neither happens**, because `SAFE` and
`LEADERSHIP_PENDING` are both routed to the witness decision and the snapshot's leadership fields are read by
nothing else (only `handoff.js:91` calls the builder; the only other effect is the debug trace at
`leader-safety.js:180-200`). VERIFIED by grep for every exported name of the family.

`isPartitionReplace` is true for `type === REPLACE` with entity type absent or PARTITION
(`operation-workflow-replace-intent.js:38-43`); `NOT_APPLICABLE` covers every non-REPLACE and every partition
outside the five ids in `REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS`
(`operation-workflow-owner-shared.js:372-378`). A message-group REPLACE carrying one of those five partition
ids does not exist (INFERRED).

**Verdict.** #3 and #4 are dead inputs on `f580579a5`. They delay nothing and admit nothing. They are legacy:
about 180 lines whose only observable output is a debug line, pinned in place by a structural check
(`scripts/check-runtime-grammar-contracts.js:336-345` requires `resolvePriorityPublicationSourceRoleState` to
contain `'partitionLeaderNodeId === sourceNodeId'`). The actual leadership rule (BR11: the target must lead
before the source is removed) is replica-level, fresh and typed. It is the right model for every other
effect-admitting consumer.

### 1.4 #5 - "is this removal candidate the leader"

| Step | What | Evidence |
| --- | --- | --- |
| Arm 1 (live) | `partitionLeaderReplicaId && candidateReplicaId === partitionLeaderReplicaId` -> true. The id is `moveStateProvider.replicaId` when `entityType === PARTITION` and `moveStateProvider.isLeader === true` | `src/rebalancer/move-planner-move-calculation-methods.js:364-378`, `move-planner-placement-tail-methods.js:114-128` VERIFIED |
| Provider | `moveStateProvider: this` = the unified rebalancer; `isLeader` set only by `setLeader` | `unified-rebalancer-lifecycle-base.js:305,522-531` VERIFIED |
| Arm 2 (role) | `role === RAFT_ROLE.LEADER` -> never true for a partition row | `:379-385` VERIFIED |
| Arm 3 | `isExplicitNonLeaderRaftRole(role)` -> return false. Taken for every published voter and learner | `:392-394` VERIFIED |
| Arm 4 (node) | `candidateNodeId === partitionLeaderNodeId`. Reachable only for a row with no recognised role, which `role-never-null` forbids | `:395-400` VERIFIED |

**What goes wrong.** Nothing on the leader-run planner: arm 1 names the exact leader replica, which is also
correct for co-located replicas. The census reading ("published follower returns false before the
`leader_node_id` arm") is accurate for arms 3 and 4 but missed arm 1. Arms 2 and 4 are dead; arm 3 is the
only one that ever returns after arm 1 misses. For a message-group or runtime-service planner arm 1 is
disabled (`entityType !== PARTITION`) and the answer comes from arm 2 reading a row the shadow writer may
have stamped LEADER (section 4), i.e. an unreliable preference.

**Verdict.** No formation impact (and formation has no surplus drain: section 1.6), no safety impact (the
function only orders candidates; the removal itself is decided by 1.3 and by the raft conf-change admission
in the leader's turn, `src/raft/raft-rs-conf-change-admission.js:66-68,341-343`).

### 1.5 Summary table

| # | Predicate as written | In production | Delays / blocks 3-host spread | Admits unsafe leader removal | Class after this trace |
| --- | --- | --- | --- | --- | --- |
| 2 | live leader = services row role | candidates always `[]`; owner always the target | **No** (same owner as the correct answer while each partition has a live published leader) | No | BROKEN, latent: surrogate lane has no production path |
| 3 | co-located leader sibling = sibling row role | never true | **No** (decision-dead) | No | DEAD legacy |
| 4 | source released = source row follower | always true | **No** (decision-dead) | No (witness `lead === target` decides) | DEAD legacy |
| 5 | leader candidate = row role, else node | arm 1 (live replica id) answers first | **No** | No | role and node arms DEAD; MG lane unreliable |

### 1.6 Retained physical evidence

All three runs are scenario `fresh-formation-user-table-routability`, three hosts (tv-dator, adam-laptop,
adams-gamla), verdict `BLOCK_EVIDENCE_INCOMPLETE / log_window_coverage_incomplete`. Files are under
`<run>/test-output/.playback/report/fresh-formation-user-table-routability/`.

**(a) Published roles** - `snapshots.ndjson`, `grep -o '"raft_role":"[a-z]*"' | sort | uniq -c`:

| Run | follower | learner | leader |
| --- | --- | --- | --- |
| peerbytes (60fe32768) | 2504 | 193 | 0 |
| querytrace (174398543) | 1842 | 8 | 0 |
| e3e0 (e3e0164d6) | 3038 | 88 | 0 |

**(b) #2 confirmed broken** - `events.ndjson`, every `schedulingOwner` object in each run (12 / 14 / 12
occurrences, the same strings again in `failure-bundle.json`):

```
"schedulingOwner":{"partitionId":"control_plane_publications-p1","mode":"target_owner_fallback","candidatePartitionIds":[],"evidenceSource":"target_partition_fallback"}
```

peerbytes, `cluster.stage` event at +29.6 s, all six priority partitions:

| partition | semanticState | blockerReasons | schedulingOwner.mode | candidates |
| --- | --- | --- | --- | --- |
| control_plane_publications-p1 | needs_operation | eligible_but_no_operation_created | target_owner_fallback | [] |
| replica_operations-p1 | recovering_in_flight | - | target_owner_fallback | [] |
| schema_operations-p1 | needs_operation | priority_operation_serial_wait | target_owner_fallback | [] |
| sql_transaction_participants-p1 | needs_operation | priority_operation_serial_wait | target_owner_fallback | [] |
| sql_transactions-p1 | needs_operation | priority_operation_serial_wait | target_owner_fallback | [] |
| sql_write_operations-p1 | needs_operation | priority_operation_serial_wait | target_owner_fallback | [] |

No `current_owner` or `surrogate_owner` appears in any run.

**(c) ... but neutral here** - same `snapshots.ndjson`, `partitions[].leader_node_id` for the priority
partitions: non-null in every snapshot of every run; one value (the seed: `f3ef...`, `5cda...`, `223e...`)
for the first 60-86 s, later two or three nodes as leadership follows the new replicas. `recoveryActiveNodeIds`
in the +29.6 s event lists all three nodes. A canonical candidate set would therefore have contained every
partition, giving `current_owner` with the identical `partitionId`. The evidence **does discriminate**: #2 did
not change a scheduling decision in these runs. Limit: snapshots are samples (peerbytes has none between
+86 s and +622 s), so a sub-interval with a NULL leader is not excluded.

**(d) Formation is ADD-only** - per-node logs (retained `*.log` plus `.full-logs/*.log.gz`), operation type
tokens:

| Run | `"type":"ADD"` | `"explicitOperationType":"ADD"` | REPLACE / REMOVE / PROMOTE |
| --- | --- | --- | --- |
| peerbytes | 2454 | 263 | 0 |
| querytrace | 3307 | 253 | 0 |
| e3e0 | 2212 | 134 | 0 |

Growth is 1 replica on 1 node to 3 on 3 (peerbytes: ledger `replica_operations-p1` 1/1 at +0 s, 3/3 at
+43 s; the other five partitions 1/1 until about +70 s, between 2/1 and 3/2 at +86 s, 3/3 at +622 s). So the
remove-safety family (#3, #4) and surplus-drain ordering (#5) are not exercised by this acceptance.

**(e) Strings these predicates emit** - searched in every node log (retained and full) of all three runs and
in `solve/quests/fresh-formation-user-table-routability/log.ndjson` (411 lines at `f580579a5`; 101 lines in
the main checkout): `leader-remove-safety decision`, `replacement leader ownership pending`,
`leadership released`, `would drop voter-ready`, `REPLACE_TARGET_LEADER_ELECTION`, `STEP_DOWN_REPLICA`,
`surrogate`, `service_role_derived`: **0 hits each**. Expected: the logs are info level (the remove-safety
trace is `debug`) and no REPLACE ran. The quest log line for run `3ed87e16` (line 374) reads
"formation false within 420000ms; 31 polls and 88 failed reads. d/e/f/g passed ... a/b/c and observation
integrity failed ... contention on the same stream and late replies; read provenance cannot identify a
single causal producer". It names no leadership or remove-safety reason. The sentence "at 117.249 s four
priority partitions still lacked spread" is not in either copy of the log I could read (not found; it may be
in another worktree).

**(f) Cheapest observation that would settle what (c) leaves open.** One line per decision generation at
info level from `buildPriorityRecoveryDecisionSnapshots`: for each priority partition
`{partitionId, schedulingOwner.mode, ownerRowLeaderNodeId, ownerRowLeaderRecoveryActive}`. A formation in
which some partition shows `needs_operation` while `ownerRowLeaderNodeId` is null or not recovery-active is
the only case where #2 costs time. It needs no new mechanism: `partitionRows` is already read by the same
projection (`readiness-planning-global-projection.js:419-425`).

**What the evidence does show on the formation path** (outside this assignment, recorded for the owner):
serialisation behind the ledger partition (`priority_operation_serial_wait` on four partitions while
`replica_operations-p1` grows first, about 43 s), then about 27 s with no visible row change, and control
snapshot read failures (88 failed reads). None of it is leader-role-derived.

---

## 2. Census gaps closed

Method: a delegated read-only census over `src/`, `scripts/`, `test/distributed`, `test/integration`,
`test/simulation`, `src/cli` and `src/admin`, then spot-verification by me of every row marked **V2**
(read at the cited lines). Rows marked V1 were read by the census agent only.

### 2.1 Readers the first census missed (src)

| Id | Site | Predicate | Canonical arm beside it | Decision fed | Class | Status |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | `src/partition/group-retirement-redrive.js:455-458` | `readStateField(row?.raft_role) === RAFT_ROLE.LEADER` on a SERVICES change | yes, next line | trigger label `GROUP_LEADER` vs `MEMBER_ROW_CHANGED`; both run the same redrive | COMPETING (label only). This is the "model" wake | V2 |
| N2 | `src/partition/partition-service-row-owner.js:267-268` | `isLeaderPartitionService(service) \|\| row?.raft_role === RAFT_ROLE.LEADER` | live arm | whether to publish `partitions.leader_node_id` at register / activate | COMPETING in a **producer** (row arm dead: the row is collapsed at `:89-101`) | V2 |
| N3 | `src/admin/admin-service-discovery-table-readiness-methods.js:359-371,427` | `advisoryLeader = raftRole.toLowerCase() === LEADER_RAFT_ROLE`; last fallback `advisoryLeaderPartitionIds.has(partitionId)` | yes: routing snapshot (`:403-411`), then `leader_node_id` (`:413-425`) | `leadershipStable` -> `topologyReady` / `benchmarkReady` / `workloadReady` -> **load-lane admission** (`admin-websocket-load-lane-admission.js:433`) | COMPETING, fails closed. **The one admin readiness gate with a role arm** | V2 (predicate and order); gate chain V1 |
| N4 | `src/bootstrap/owners/partition-quorum-authority.js:333-349,611-618` | `raftRole === LEADER` collects `explicitLeaderNodesByPartition`; veto if more than one or if it lacks `leader_node_id` | `leader_node_id` is primary (`:602-609`) | `hasPartitionQuorum` of the management-cluster snapshot authority | COMPETING veto that never fires; a single raw `leader` row on another node would fail it closed | V2 |
| N5 | `src/query/query-executor-partition-service-resolution.js:675-683` | `service?.raft_role === RAFT_ROLE.LEADER` | n/a | `staleLeaderNodeIds` in two warn logs | DIAGNOSTIC | V1 |
| N6 | `src/bootstrap/node-joining-backfill-merge-and-status.js:779-785` | `services.some(role === LEADER)` after the canonical check fails | it **is** the fallback of #11 | "a message-group leader exists" status | COMPETING (part of #11) | V2 |
| - | `src/node/replica-state-machine-lifecycle-observation.js:420-428` | cached role LEADER -> return null | n/a | refuses to carry a cached leader into a lifecycle rewrite | not a reader: it enforces the collapse. Becomes unreachable once the guard holds | V2 |
| - | `src/wasm-service/meta-service-router.js:47-51` | role LEADER and address | none by contract | meta-service leader address | LEGITIMATE (declared exception) | V2 |

### 2.2 camelCase `raftRole` behind `normalizeServiceRow`

`normalizeServiceRow` (`src/control-plane/system-row-normalizers.js:97-146`) emits `raftRole` lower-cased
and no `isLeader` / `role` / `leader` field (V2). It has 16 call sites in 8 files; **the only one that tests LEADER
is #2**. Other normalisers that emit a role (`normalizeCurrentVoterServiceRow`, `normalizeCensusServiceRow`,
`normalizeReplicaRow`, `decodeCanonicalObservedReplicaRow`, the bootstrap topology contract reader) are used
for voter / learner tests only, except the already-known #16 and #17 (V1). **Gap closed: no hidden camelCase
leader reader.**

### 2.3 `scripts/`

No script reads a services row's role as leader evidence (V1). Three things matter for the migration:

- `scripts/check-runtime-grammar-contracts.js:335-345` pins the dead #4 function (V2) and `:57-70` forbids
  `replicaRoles` inside the harness `extractControlSnapshotLeaders` (an existing canonical-only audit, V1).
- `scripts/calibrate-cost-model.js:123` writes `raft_role: v === 0 ? 'leader' : 'follower'` on partition
  rows (fixture, V1).
- `scripts/check-voter-readiness-single-owner.js` is the existing AST audit of role-set literals: the nearest
  structural precedent for the guard in section 5.

### 2.4 Distributed harness, non-self-test

| Site | Predicate | Canonical arm | Verdict fed | Class | Status |
| --- | --- | --- | --- | --- | --- |
| `test/distributed/scenarios/network-partition-split-brain.js:177-182`, used `:209-320`, asserted `:442-447` | `isActivePartitionLeader`: partition, active, `raft_role === leader` from `SELECT ... FROM services` on every node | **none** | `COMPETING_LEADERS`, `MINORITY_LEADER_PRESENT`, `MAJORITY_LEADER_MISSING`; also selects the majority leader for the accepted-write check. In `CANONICAL_SCENARIO_MATRIX` | **BROKEN**: observations always empty, so the verdict is always `majority_leader_missing` and the two split-brain detectors cannot fire. Whether it is currently red or skipped was not checked | V2 code; outcome INFERRED |
| `test/distributed/harness/assertions-control-snapshot-extraction.js:424-433` `extractLeaders` via `assertions-convergence-wait.js:302` | `role === 'leader'` -> `leaders.set(partition_id, address)` | none on this path | cross-node leader consistency comparison; reached only for a node handle without `getControlSnapshot` | **BROKEN** on that fallback path (leaders always empty) | V2 code; reachability V1 |
| same function via `assertions-convergence-wait.js:343` | same | yes (`:355-367` fills from `leader_node_id`) | `isConvergedSnapshot` | COMPETING (the role arm would store an address where the canonical arm stores a node id) | V1 |
| `test/distributed/harness/assertions-convergence-wait.js:1331-1338` | `raftRole === leader` | none | failure-message text | DIAGNOSTIC (always "none") | V1 |
| `test/distributed/harness/consistency-evaluator.js:196-240` | `inconsistentReplicaRoles` | canonical beside | `REPLICA_ROLE` mismatch | COMPETING, never fires; input probably always `{}` (field read at the wrong nesting) | V1 |
| `test/distributed/harness/root-cause-invariants.js:112-153` | `partition.leaderKnown !== true` from the preflight snapshot (#18b) | upstream has both | `CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE`, a strict benchmark preload gate | canonical in effect | V1 |
| `test/distributed/scenarios/table-distribution-helpers-distribution-query.js:545-550` | calls `evaluatePartitionReplicaTopology` (#18a) | inside | `topologyState` in `waitForPartitionGrowthAndSpread` | COMPETING (role arm dead) | V1 |
| `test/distributed/scenarios/snapshot-live-rebuild.js:302-308` | `nodeId !== leaderNodeId && raftRole !== LEADER` | yes | picks a follower to wipe | COMPETING (redundant) | V1 |
| `test/distributed/scenarios/postgres-baseline-comparison-constants-and-imports.js:850-861` | active and role leader | none | `missingLeaderPartitionIds` in a metadata snapshot, no consumer found | DIAGNOSTIC (every partition reported leaderless) | V1 |
| `test/integration/helpers/cluster-test-helpers.js:1108-1124` `waitForLeaders` | `s.raft_role === 'leader'` | none | none: no caller | dead helper | V1 |
| **`test/simulation/formation-sim-runner.js:220-231`** (writer) | seeds every priority partition with `leader_node_id: null` **and** `raft_role: RAFT_ROLE_LEADER` | - | the formation simulator's initial state | **fixture inverts production**: production starts with `leader_node_id` set and role follower (section 1.6). In the simulator the role arms of #2, #8, #10, #17 fire and the canonical arms do not. Effect on simulator verdicts not measured | V2 |

The physical acceptance path is canonical-only: `real-product-lagrange-readiness-evaluation.js:107-124,228-249`
reads `partition.leader_node_id` plus `isVoterRaftRole`, and `scenario-ground-truth.js:318-340` takes the
leader from `row.leader_node_id` (V1). **The 0/3 physical verdict is therefore not produced by a
role-derived harness read.**

### 2.5 CLI views

`src/cli/views/services-view.js:291-300,546` read `service.role`, a field no producer in `src/cli` sets, so
the role never renders; `partitions-view.js:384` reads `partition.raft_role`, not a PARTITIONS column. Leader
labels in `partitions-view.js` and `message-groups-view.js:280-282` come from `leader_node_id` (V1). No CLI
decision depends on a role. Dead display fields only.

### 2.6 Does an admin readiness gate consume #18?

| #18 part | Role-derived outputs | In-src gate consumer | Harness gate consumer | Class |
| --- | --- | --- | --- | --- |
| a `admin-shared-metadata-consistency.js:127-144` `evaluatePartitionReplicaTopology` | `leaderRoleNodeIds`, `leaderServiceVisible`, `leaderKnown`, `hasLeaderMetadata` | none (only caller in src is #18b) | `table-distribution-helpers-distribution-query.js:545` | COMPETING; the role arm can only upgrade a verdict and never fires |
| b `admin-preflight-snapshot.js:523-525` | `leaderNodeId = canonical \|\| leaderRoleNodeIds[0]`, `isLeaderLocal` | none | `root-cause-invariants.js:112-153` strict preload gate | COMPETING; canonical in effect |
| c `admin-control-snapshot-leadership-summary.js:326-345` | `replicaRoles`, `replicaRoleDiagnostics`, `replicaRoleConsistent`, `replicaLeaderNodeIds`; `leaders[pid]` itself is canonical-only (`:165-196`) | none | only the inert `REPLICA_ROLE` mismatch | **DIAGNOSTIC** |

**Classification of #18: COMPETING (a, b) and DIAGNOSTIC (c). None gates readiness inside src.** The admin
readiness gate that does carry a role arm is N3, which the first census did not list.

### 2.7 Callers of #13 `resolveBootstrapLeaderSelection`

Selection order inside (`src/query/bootstrap-leader-selection.js:17-77`, V2): exactly one row with role
leader -> `hintedLeaderNodeId` -> single visible service.

| Call site | Rows | Hint | Decision | Class |
| --- | --- | --- | --- | --- |
| `src/query/sql-query-engine-bootstrap-routing-overlay.js:337-340` | routable partition service rows from the snapshot or the cache | `cachedLeaderNodeId \|\| bootstrapLeaderNodeId \|\| partitionMetadata.leader_node_id` | the overlay entry's `leader_node_id`; skipped when a canonical leader is known and differs | COMPETING: the role arm outranks the canonical hint and never fires; the hint does the work |
| same file `:550-552` | rows synthesised from connected nodes **with no `raft_role` field** (`src/cdc/cdc-integration-service-owner-rpc-read-execution.js:336-346`) | none | overlay leader for a system-table partition after TABLE_NOT_FOUND / PARTITION_NOT_FOUND | BROKEN arm: the result is "the only connected node", else undefined |
| `src/query/query-executor-partition-service-resolution.js:570-575` | routable services: overlay first, then cache; the overlay carries the **live** role for locally hosted priority partitions (section 4) | none | sole write candidate while `leader_node_id` is unpublished | MIXED: LEGITIMATE-LIVE through the overlay row, BROKEN for cache rows (single-replica pick only) |

**Classification of #13: COMPETING.** Its role arm is alive only through the overlay producer. After the
overlay passes local leadership explicitly (section 4) the module reduces to "the hinted node if it hosts a
visible service", and the single-service pick becomes decision D3. All call sites verified by the census
agent (V1); the selector itself V2.

### 2.8 Net reader set after closing the gaps

Census #2-#19 (18 groups, 27 files) + N1-N6 (5 more files, N6 being inside #11) + 3 harness sites that decide
something (split-brain scenario, `extractLeaders`, formation-sim seed) + 3 producers (message-group row
owner, overlay, `resolveLiveReplicaRaftRole`). Not determined: whether an in-src client posts a raw `leader`
to `/register-service` (`src/bootstrap/bootstrap-api-registration-methods.js:15,107,128` writes the payload
role verbatim; reported by the census agent, not read by me).

---

## 3. Contract-first transition record: "leader identity has one authority"

Trigger: this changes which inputs reach scheduling, routing and safety owners (discovery filters, fallback
tiers, classifiers), so the 8-item checklist in `docs/steering/workflow-guidelines/solver-quests.md` applies.

### 3.0 The fact and its three owner-defined representations

The fact is "which replica of group G leads at term T". Its only authority is G's raft runtime. Nothing else
may decide it. Three representations already exist in the tree; the migration adds none and removes the
fourth (the role guess).

| Tier | Representation | Owner | Carries | Legitimate use | Unknown outcome |
| --- | --- | --- | --- | --- | --- |
| **L** local live | the hosting replica's own raft status (`service.isLeader`, `replicaId`, term) | the service object (`PartitionService`, `MessageGroupService`) | replica id, term | code running **as** that replica: leader-gated loops, `canWriteSystemTableLocally`, `resolveRemovalSourcePartitionLeaderReplicaId` | "not leader here" is an answer, not an unknown |
| **F** fresh remote | membership observation answered to `READ_REPLICA_MEMBERSHIP` | `src/raft/raft-committed-membership-stamp.js:554-590` (`canonicalReplaceMembershipObservation`), read through `src/rebalancer/operation-workflow-replace-witness.js:196-212` | `partitionId, replicaId, leaderReplicaId, term, commitIndex, appliedIndex, voterReplicaIds, votersOutgoingReplicaIds, learnerReplicaIds, role, gateOpen` | **every effect whose safety depends on who leads** (source removal, promotion administration) | typed `PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE` with a delivery reason; `leaderReplicaId === null` = no leader this term |
| **P** published | owner row `partitions.leader_node_id` / `message_groups.leader_node_id` plus `leader_claim_node_id`, `leader_claim_raft_term`, `leader_claim_minted_against_updated_at`, `updated_at(_hlc)` | producer: `partition-service-metadata-delivery-methods.js:300-362`, `partition-service-row-owner.js:266-287`, `message-group-service-metadata-publication.js:255-291`; reader: `src/query/canonical-leader-routing.js` | node id (not replica), claim term | routing first hop, scheduling arbitration, diagnostics, wakes. **A hint**: the consumer must be correct when it is wrong | `MISSING` (no owner row), `DEFERRED/owner_row_missing` (row, no leader), `DEFERRED/owner_row_stale` (leader node has no ACTIVE service row) |

`services.raft_role` is in none of the tiers for partition and message-group services. For wasm/meta services
it stays the declared authority (decision table rule `wasm-leader-raw`) with exactly one reader,
`src/wasm-service/meta-service-router.js:49` (VERIFIED).

### 3.1 Producer and consumer symbols

Producers (unchanged): the three rows above. Canonical read endpoints every consumer uses after the
migration:

| Endpoint | File | Use |
| --- | --- | --- |
| `resolveCanonicalLeaderIdentitySnapshot({partition \| ownerLeaderNodeId, retainedLeaderNodeId, partitionPresent})` | `src/query/canonical-leader-routing.js:125` | P, identity only. States after migration: `OWNER_CONFIRMED`, `RETAINED_RUNTIME`, `MISSING` |
| `resolveCanonicalPartitionLeaderObservation({... , serviceRows})` | `:230` | P plus "is the leader node's service row ACTIVE". States `AVAILABLE`, `DEFERRED`, `MISSING` with `reasonCode` |
| `readReplaceWitnessMembership(owner, operation)` | `src/rebalancer/operation-workflow-replace-witness.js:196` | F |
| the consumer's own service `isLeader` / `replicaId` | - | L |

`serviceRows` stays an input of the observation **only** to answer "does the named leader node host an ACTIVE
row" (`countCanonicalLeaderActiveServices`, `:195-209`), never to name a leader.

No new machinery is proposed. Census of what exists was done before proposing (items above are the actual
exported symbols; their 13 call sites are in `src/control-plane` (4), `src/query` (4), `src/admin` (2) and
`src/bootstrap` (3)).

### 3.2 Owner-defined shape

The owner shape of P is the frozen object built at `canonical-leader-routing.js:106-123`:
`{state, source, leaderReference: {state: 'available', nodeId} | {state: 'missing'}, leaderNodeId?, leaderWitnessNodeCount}`.
Migration changes to the shape, all deletions:

- delete states `SERVICE_ROLE_DERIVED`, `AMBIGUOUS_SERVICE_ROLE` and source `SERVICE_ROLE`;
- delete field `leaderWitnessNodeCount` (it only counts role witnesses; no reader outside the module, VERIFIED
  by grep) and its copy on the observation (`:222`);
- delete `readCanonicalLeaderServiceRole`, `isCanonicalLeaderRoleWitness` (`:79-92`) and the block `:161-185`.

Add one field, already available at the producer: `leaderClaimRaftTerm` (from `leader_claim_raft_term`, null
when the claim annotations are absent). It is the only term P can carry and it lets a consumer order two
hints. No consumer may hand-build this shape; tests construct it through the resolver from rows.

### 3.3 Identity and generation

| Hop | Identity carried | Note |
| --- | --- | --- |
| raft runtime | (group id, peer id -> replica id, term) | authority |
| L | replica id, term | exact |
| F | `leaderReplicaId`, `term`, `commitIndex`, `appliedIndex` | exact; `commitIndex` is the read version |
| P row | `leader_node_id` + claim `(node, raft term)`; row version `updated_at_hlc` | **node-level**: cannot distinguish co-located replicas |
| P in cache | the same row as CDC delivered it to this node | a local view, no cross-owner cut |
| routing epoch / membership publication epoch | **not** leader identity | must not be compared with a term |

The node-level gap is the systemic cause of the tie-breaks in #3, #5, #15 and #16: each tried to recover
replica identity from `raft_role`. Rule after migration: **P never names a replica**. A consumer that needs
the replica uses L (if it is that replica) or F. A consumer that only needs a first hop addresses any ACTIVE
addressed replica of the group on the leader node, chosen by a deterministic key that claims nothing, and the
replica answers or returns the existing not-leader refusal carrying `leaderReplicaId`
(`raft-rs-conf-change-admission.js:66-68`). Adding `leader_replica_id` to the owner row is the alternative
(decision D1); it is not needed by any consumer in the table below.

### 3.4 Ordering and freshness

- P is last-writer-wins on `updated_at_hlc`, written by a CAS whose where-clause names the previous
  `leader_node_id` (`partition-service-metadata-mutation-helpers.js:346-349`,
  `message-group-service-metadata-publication.js:261-265`). The leader also keeps a node-local projection of
  its own tenure in its cache (`partition-service-metadata-delivery-methods.js:300-362`) that a strictly newer
  durable successor supersedes.
- Two P observations are ordered by `(leaderClaimRaftTerm, updated_at_hlc)`; a lower pair never replaces a
  higher one in a consumer's memory.
- F is ordered by `(term, commitIndex)`.
- No consumer may claim a consistent cut across P of several partitions. #2 arbitrates over several
  partitions' P; it must state that it is a per-partition freshness fence evaluated at one node (the planning
  snapshot producer) and that the result is published once per planning generation, which is what makes the
  arbitration single (INFERRED from `readAvailablePriorityRecoveryPlanningSnapshot` being the read on the
  consumer side, `unified-rebalancer-priority-recovery-follow-up-decisions.js:144-148`).

### 3.5 Absent versus unavailable

| Outcome | Meaning | Never |
| --- | --- | --- |
| P `MISSING` | the group has no owner row in this view: the group is unknown here | scan SERVICES for a role |
| P `DEFERRED / owner_row_missing` | row present, `leader_node_id` empty: no leader published yet, or cleared (managed split and merge write `leader_node_id: null`, `src/partition/managed-split-workflow.js:539,554`, `managed-merge-workflow.js:664`) | pick "the only service", "-r1", "first voter" |
| P `DEFERRED / owner_row_stale` | leader node has no ACTIVE service row for the group | route to another voter and call it the leader |
| F `UNAVAILABLE` | witness not reachable or answer unreadable | infer from P |
| F `leaderReplicaId === null` | the group has no leader this term | - |

Every consumer in 3.9 has a named consequence for each outcome it can receive.

### 3.6 Durable commit

Leadership itself becomes true at the raft election (term) inside the group. P becomes authoritative **as a
publication** when the CAS UPDATE of the owner row commits in the partitions (or message-groups) system-table
group, named in the code as `'durable partitions.leader_node_id publication accepted'`
(`partition-service-metadata-mutation-helpers.js:40`). Between the two points P is stale by construction;
that interval is the reason P is a hint. The migration moves no commit point.

### 3.7 Retained obligations

| Obligation | Owner | Effect of the migration |
| --- | --- | --- |
| open REPLACE named-handoff attempt (`attemptByOperationId`) | `operation-workflow-replace-handoff-attempt.js` | none (already F) |
| pending role and leader-node mutation-helper flushes | row owners | none for partitions; message-group registration stamp changes value (section 4) |
| `RETAINED_RUNTIME` leader in the query executor (`resolveRetainedCanonicalLeaderNodeId`) | `src/query/query-executor-canonical-leader-routing-methods.js:129-141` | kept: it is a previous value of the same authority, bounded by "an ACTIVE service still exists on that node". Decision D4 if the owner wants it gone too |
| priority-recovery decisions already published with `target_owner_fallback` | planning snapshot | superseded at the next planning generation; no durable state names the mode |
| fresh-bootstrap routing grace window | bootstrap topology snapshot owner | today the window ends when a role witness appears or a single service is picked; after migration it ends on P `AVAILABLE` only |

### 3.8 Canonical wake and cleanup

A consumer waiting for a leader waits for **the owner-row publication**, delivered as a system-table cache
change of PARTITIONS / MESSAGE_GROUPS with a non-empty `leader_node_id` that differs from the value the
waiter last saw. The model is `announcesLeader` (`src/partition/group-retirement-redrive.js:455-461`),
**with its first arm deleted**: today it also returns true for a SERVICES row with `raft_role === LEADER`
(`:456-458`), which never fires for a partition group. After migration:

```
announcesLeader(tableName, row) = tableName === PARTITIONS_TABLE && String(row?.leader_node_id || '').length > 0
```

- Cancelling a wait: the waiter deregisters its cache subscription; nothing durable is touched.
- Periodic re-evaluation stays a legitimate trigger of the same decision (authority-and-recovery: "one
  decision algorithm, multiple legitimate triggers"); it is not a second algorithm.
- F has no wake: it is read at the moment of the effect.
- wasm/meta waiters keep the SERVICES wake, scoped by `service_type`.

### 3.9 Replacement per consumer

"UNKNOWN" below means the listed non-available outcomes of the tier used.

| # | Site | Tier | Canonical call | On UNKNOWN | DELETED |
| --- | --- | --- | --- | --- | --- |
| 2 | `src/control-plane/priority-recovery-scheduling-owner-policy.js:72-101` | P | candidates = priority partitions whose `resolveCanonicalPartitionLeaderObservation({partition, serviceRows}).state === AVAILABLE` and whose `leaderNodeId` is in `availableNodeIds`; needs `partitionRows` passed at `priority-recovery-snapshot-closure.js:85-90` | named state `LIVE_LEADER_EVIDENCE_UNAVAILABLE` stays, with its sealed consequence: the target partition's own leader (tier L, the leader-gated loop) is the only scheduler; wake = owner-row publication. Rename mode `TARGET_OWNER_FALLBACK` -> `TARGET_OWNER` (D2) | the `normalizedService.raftRole !== RAFT_ROLE.LEADER` conjunct; imports of `RAFT_ROLE`, `SERVICE_STATUS`, `normalizeServiceRow` |
| 3 | `src/rebalancer/priority-publication-leader-safety.js:28-56,141-147` + `safety-shared.js:61-94` | F (already) | none: `evaluateReplaceNamedHandoffSafety` decides | witness UNAVAILABLE / no leader -> deferred evaluation (exists) | `hasCoLocatedLeaderSiblingEvidence`, `decidePriorityPublicationFollowerSourceRemovalSafety` and its table and state enum, `coLocatedLeaderSiblingObserved`, `priorityRecoveryFollowerSourceRemovalSafe` |
| 4 | `src/rebalancer/priority-publication-safety-topology.js:223-288` + `leader-safety.js:93-177` | F (already) | none | as #3 | `normalizeReplicaRowRaftRole`, `isLeaderReplicaRow` (no caller), `getPriorityPublicationSourceRoleState`, `getPriorityPublicationReplacementRoleState`, `resolvePriorityPublicationSourceRoleState`, every `*RoleState` / `*Observed` / `sourceRemovalLeadershipSafe` field, state `LEADERSHIP_PENDING` and the unreachable `SAFE` return at `handoff.js:114-119`. The builder keeps three outcomes: `NOT_APPLICABLE`, the two publication waits, `LEADERSHIP_BY_NAMED_HANDOFF`. Update `scripts/check-runtime-grammar-contracts.js:336-345` and its test |
| 5 | `src/rebalancer/move-planner-move-calculation-methods.js:368-402` | L | `candidateReplicaId === this.resolveRemovalSourcePartitionLeaderReplicaId()`; drop the `entityType === PARTITION` guard in `move-planner-placement-tail-methods.js:114-128` so message-group planners get the same live answer (verify the MG rebalancer sets `replicaId`: not read) | not leader here -> no preference (the loop does not plan when not leader) | role arm `:379-385`, explicit-non-leader arm `:386-394`, node arm `:395-400`, import of `isExplicitNonLeaderRaftRole` |
| 6 | `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:196-213` | P | count partitions in the envelope's PARTITIONS snapshot with a non-empty `leader_node_id` | zero -> the same warning, now true only when no leader is published | the SERVICES role filter |
| 8 | `src/rebalancer/operation-workflow-growth-promote.js:257-287` | P then redirect | `partitions.leader_node_id` unless excluded; then the refusal's `leaderId` via `resolveLeaderNodeFromResponse` (`:246-255`, exists) | owner row unknown or excluded -> **no route**: typed deferral of the promote administration, wake = owner-row publication or the next redrive | role arm `:259-268`; "alternate voter" tier `:279-285` (a guess; decision D3 because it is on the ADD formation path) |
| 9 | `src/control-plane/control-plane-publications-leadership.js:16-18,92-112` | L then P | tier 0 `canWriteSystemTableLocally`, tier 1 owner row | both unavailable -> `LEADERSHIP_RESOLUTION_UNAVAILABLE` -> not leader (exists; "defers and waits for the real leader") | `isLeaderRaftRole`, `resolveServicesWitnessLeadership`, `LEADERSHIP_TIER.SERVICES_WITNESS` |
| 10 | `src/query/canonical-leader-routing.js:79-92,161-185` | P | section 3.2 | `MISSING` / `DEFERRED` already returned | the tier, two states, one source, `leaderWitnessNodeCount`. For message groups nothing replaces it (their owner row is read through `readCanonicalLeaderPartitionNodeId`, which already accepts a group row). For wasm/meta nothing in this module: add `resolveMetaServiceLeader(serviceRows)` beside `meta-service-router.js:49` with outcomes `available / ambiguous / missing`, which is where "ambiguous role" legitimately lives |
| 11 | `src/bootstrap/node-joining-backfill-merge-and-status.js:766-785` | P | `resolveCanonicalPartitionLeaderObservation({partition: group, serviceRows: groupServices}).state === AVAILABLE` | not available -> the status check answers "no canonical message-group leader yet" and the existing poll continues | trailing `services.some(role === LEADER)` at `:779-785` |
| 12 | `src/bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js:402-413`, `...-leader-identity.js:112-127` | P | the identity already computed at `leader-identity.js:70-86` | unknown inside the grace window -> no leader services; routing returns the typed `OWNER_MISSING` gap | `explicitLeaderServices` role filters in both functions and both `services.length === 1 ? [services[0]] : []` single-service picks (D3) |
| 13 | `src/query/bootstrap-leader-selection.js:25-42` | P (hint parameter) | `hintedLeaderNodeId` only | no hint -> see section 2 | `leader_role` branch; see section 2 for the remaining branches |
| 14 | `src/query/sql-query-engine-provisioning-methods.js:19-41` | plan / L | the planned leader of the new partition is a **declaration** made by the provisioning plan; a current leader is P | no declaration and no P -> typed provisioning refusal (not "-r1") | role `find` `:24-34`; the `-r1` suffix pick is a separate guess to remove with it (D3) |
| 15 | `src/cache/leader-readiness-gate.js:92-145` | P | owner row -> any ACTIVE (addressed) replica on the leader node by the existing deterministic key | no leader node -> `leaderService: null`; `allowLeaderServiceFallback` (`:185-194`) removed or renamed to what it is, "any observable replica" (D3) | `explicitLeaderServices` tie-break `:121-126` |
| 16 | `src/rebalancer/placement-owner-evidence.js:141-163`, `replica-placement-owner-deficits.js:186,202-206` | L / P | `leaderNodeId` argument only (from `resolveRemovalSourcePartitionLeaderNodeId`: live node if leader, else owner row) | none -> `''` -> no retention preference (exists) | `leaderReplica` role find `:160-163`; `isLeader: activeVoter && role === LEADER` at `:186` (keep only the node assignment at `:202-206`) |
| 17 | `src/control-plane/current-priority-placement-observation.js:216-226,294` | P | `leaderKnown = canonicalLeaderReplica` | not known -> partition listed in `missingLeaderPartitionIds` (exists) | `leaderRoleNodeIds` and its use as a reported leader at `:294` |
| 18 | `src/admin/admin-shared-metadata-consistency.js:127-144`, `admin-preflight-snapshot.js:524`, `admin-control-snapshot-leadership-summary.js:326-345` | P | owner row; replica roles stay a displayed column | see section 2 | `leaderRoleNodeIds`, `leaderServiceVisible`, the `|| leaderRoleNodeIds[0]` fallbacks |
| 19 | `src/message-group/message-group-target-resolver.js:130-135,222-229`, `src/topology/cdc-group-propagation-routing.js:65-79` | P + redirect | `message_groups.leader_node_id` (`getCanonicalLeaderNodeId`, `:137-141`); candidate order by owner-row node first, then the existing deterministic keys | no leader node -> existing "unroutable target debt" / candidate order without a leader preference | `findExplicitLeaderCandidate`, the LEADER comparator arms in both files |
| N1 | `src/partition/group-retirement-redrive.js:455-458` | P | section 3.8 | - | SERVICES arm of `announcesLeader` |
| N2 | `src/partition/partition-service-row-owner.js:266-268` (producer) | L | `isLeaderPartitionService(service)` only | not leader -> no publication | `\|\| row?.raft_role === RAFT_ROLE.LEADER` |
| N3 | `src/admin/admin-service-discovery-table-readiness-methods.js:359-371,427` | P | routing snapshot, then owner row (both exist) | neither -> `leadershipStable = false` -> reason `LEADERSHIP_UNSTABLE` (exists) | `advisoryLeader`, `advisoryLeaderPartitionIds` and the final fallback return |
| N4 | `src/bootstrap/owners/partition-quorum-authority.js:346-348,611-618` | P | `leader_node_id` hosted by a serving, load-routable voter (`:602-609`, exists) | fails that test -> `null` -> no quorum authority (exists) | `explicitLeaderNodesByPartition` and the veto |
| N5 | `src/query/query-executor-partition-service-resolution.js:675-683` | P | log the owner-row leader and whether its service is ACTIVE | - | `staleLeaderNodeIds` role filter |
| H1 | `test/distributed/scenarios/network-partition-split-brain.js:177-320` | P per node + L | per-node `partitions.leader_node_id` with claim term from each side's view (competing leaders = two sides naming different nodes at the same or adjacent claim term), or the admin leaders view the physical path already uses | a side with no published leader -> `MAJORITY_LEADER_MISSING` only if it is the majority side | `isActivePartitionLeader` |
| H2 | `test/distributed/harness/assertions-control-snapshot-extraction.js:424-433` | P | `leader_node_id` on both SQL paths (the fill at `assertions-convergence-wait.js:355-367` becomes the only source) | absent -> partition not converged (exists) | `extractLeaders` role arm; note it stored an address where the canonical arm stores a node id |
| H3 | `test/simulation/formation-sim-runner.js:220-231` | producer shape | seed `leader_node_id: seedId` and `raft_role: follower`, as production does | - | the inverted seed. Simulator-only change; no `src` edit (owner rule: simulator quests never touch src) |

---

## 4. Producer side

| Producer | Today | Contract breach | Change | Dependent consumers |
| --- | --- | --- | --- | --- |
| Message-group row owner | `resolveMessageGroupRaftRole` passes `collapseLeaderToFollower: false` and is used at registration and activation (`src/message-group/message-group-service-row-owner.js:69-87,251,387`), while the role lane collapses (`message-group-service-state.js:412-414`, `message-group-service-leadership-state-runtime-methods.js:102`, `message-group-service-metadata-publication.js:48-50`) | decision table `no-second-writer` and `message-group-leader-collapses`: a row-creation owner stamping leader is a shadow writer. Result: a LEADER row exists exactly for replicas that led at their last registration or activation and have not flushed a role since, i.e. a value that is sometimes true and can be stale | set `collapseLeaderToFollower: true` (one argument, three call sites) **in the same slice** that removes the readers below; the table requires it to land with "re-keying publishCanonicalLeaderNodeId off live leadership". For message groups the leader-node publication already runs through its own mutation helper (`message-group-service-metadata-publication.js:255+`, INFERRED to be keyed on live leadership: its inputs were not traced) | #19 (both files), #11, #15 for `service_type = message_group`, #5 for message-group planners, #18 |
| Partition row owner, publication trigger | `publishCanonicalLeaderNodeId` accepts `row.raft_role === LEADER` as leadership (`partition-service-row-owner.js:267-268`) though `buildServiceRow` collapses | dead arm that would turn any non-conforming row into a leader publication | delete the arm (N2) | every P consumer |
| Query-engine overlay | `getLocalRuntimeRoutingOverlayServices` builds SERVICES-shaped rows with `service.getRole()` raw for priority control-plane partitions (`src/query/sql-query-engine-routing-metadata-methods.js:440-487`) | a tier-L fact dressed as a published row; it is the only way a `leader` role reaches `resolveCanonicalLeaderIdentitySnapshot`, #13 and #14 in production | two parts: (1) the overlay rows publish `normalizePublishedRaftRole(rawRole, {collapseLeaderToFollower: true})` so the row shape has one contract; (2) the local leadership it used to smuggle is passed explicitly as the existing `ownerLeaderNodeId` / `retainedLeaderNodeId` input when a local service of that partition `isLeader` (the executor already has `resolveBootstrapCanonicalLeaderNodeId`, `query-executor-canonical-leader-routing-methods.js:48-56`) | #10, #13, #14 |
| `resolveLiveReplicaRaftRole` | returns `replicaState.raftRole ?? replicaState.role` unnormalised (`src/node/replica-state-machine-lifecycle-observation.js:364-371`); only the second branch goes through the collapsing resolver (`replica-handler-class.js:95-104`); `resolvePreservedReplicaRaftRole` rejects a cached LEADER (`:421-426`) but not a direct one | a lifecycle transition could write `leader` if a replica state ever carried it. No writer of `replicaState.raftRole` was found in `src/node/replica-state-machine*.js` (INFERRED inert; `replicaState.role` writers not traced) | normalise the first branch through the same projection owner; then the guard in section 5 makes "inert" a checked property instead of a belief | SERVICES row lifecycle writes (`replica-state-machine-transition.js:677,709`, `replica-handler-create-status-methods.js:573`) |
| wasm/meta lane | raw roles (`src/wasm-service/wasm-service-replica.js:655,702`) | none: declared exception | none. State the scope in the guard (section 5) so it cannot spread | `meta-service-router.js:49` only |

Uniform rule after the change, to be added to the decision table as an invariant
`published-role-single-projection`: every writer of `services.raft_role` for `service_type` in
`{partition, message_group}` obtains the value from `normalizePublishedRaftRole(role, {collapseLeaderToFollower: true})`;
in-memory rows shaped like SERVICES rows are writers for this purpose.

---

## 5. Fixture / producer-conformance guard and ratchet

### 5.1 What exists and why it is not enough

| Existing check | What it does | Fit |
| --- | --- | --- |
| `scripts/checks/check-contract-authoring-fidelity.js` (quest `contract-first-authoring-and-producer-fidelity`, commit `5d9993a1d`) | espree AST; two `BOUNDARY_SPECS` (`:81-106`); rejects phantom **keys** in a producer factory and in the consumer of its return value. Target always zero, no baseline. Fixture conformance is a runtime assertion in its witness test | cannot express a **value** rule ("`raft_role` is never leader on a partition row") and does not scan `test/`. Also: it is in no npm script, `run-static-audits.js`, or `proof-obligations.json`; it runs only through its witness test and receipt script (reported by the census agent, not re-read by me) |
| `scripts/checks/no-legacy-consensus-reference-{audit,ratchet}.js` + `...-baseline.json` | scanner + one-way count ratchet; replays every committed revision of the baseline and fails on any raise; `printRatchetTighteningHint` (`scripts/metric-check-helpers.js:17-24`) | the ratchet mechanics to copy |
| `scripts/check-guideline-navigability.js` + `scripts/check-guideline-navigability-baseline-<pattern>.json` | AST detectors, identity baselines (file + function + kind, line-independent), `--update-baseline` refuses to raise | the identity style to copy for fixtures |
| `scripts/checks/code-navigability-budget.js --metric --rows <row>` | prints one number per named row; used by `script` probes of several quests | the probe shape to copy |
| `scripts/check-voter-readiness-single-owner.js` | AST audit: `OWNER_MODULES` are the only place role-set literals are legal; exclusions are committed data with reasons | the "one owner, reasoned exclusions" shape to copy |
| `test/guidelines/fixtures.md`, section "Test Doubles Consume the Owner (One Version of Every Shape)" | policy: doubles build owner-shaped values through the owner's exported builder | the governing rule; this guard is its executable form for one column |

### 5.2 The check: `scripts/checks/leader-authority-budget.js`

One AST checker (espree, same module-load captures and named constants as its neighbours, so it passes the
literal and ambient-intrinsics audits), three detector families, rows selectable with `--rows`, `--metric`
prints the number of unmet rows' total count as the last stdout line, `--json` prints sites. Baselines beside
it. Exit 0 / 1 / 2 as in the legacy-consensus ratchet.

**Family R - role-derived leader reads in `src/`** (target 0, no baseline: it is the migration metric).
A site is a comparison (`===`, `!==`, `switch` case, `Set.has`) between a LEADER token (`'leader'`,
`RAFT_ROLE.LEADER`, or a module constant bound to either) and a value **tainted by a row role read**
(`x.raft_role`, `x[COLUMN.RAFT_ROLE]`, `x.raftRole` where `x` is not `this`, or a local bound from such a
read, or the return of a function whose body is such a read). `this.role`, `service.role`,
`readStatus().role`, `getRole()` are live reads and are not tainted. Legal owner modules, as committed data
with reasons: `src/wasm-service/meta-service-router.js` (declared exception) and
`src/node/replica-state-machine-lifecycle-observation.js:423` (enforces the collapse; removed in the last
slice). A line-window regex already finds 23 sites in 21 files and misses at least nine known multi-line
ones (`canonical-leader-routing.js`, `bootstrap-leader-selection.js`, `node-joining-backfill-merge-and-status.js`,
both bootstrap topology files, `priority-publication-leader-safety.js`, `admin-preflight-snapshot.js`,
`admin-control-snapshot-leadership-summary.js`, `replica-placement-owner-deficits.js`); expect roughly 35-45
with the AST form. The seal value is whatever it prints.

**Family W - non-conforming writers in `src/`** (target 0). A property `raft_role` / `[COLUMN.RAFT_ROLE]` in
an object literal, or an assignment to it, whose value is not (a) the result of the projection owner for a
partition or message-group service type, (b) a FOLLOWER / LEARNER constant, (c) a pass-through of the same
column from another row, or (d) inside `src/wasm-service/`. Today: 3 (`message-group-service-row-owner.js`
with `collapseLeaderToFollower: false`), the overlay (`sql-query-engine-routing-metadata-methods.js:456`),
`resolveLiveReplicaRaftRole`'s first branch, and `bootstrap-api-registration-methods.js:107,128` (verbatim
payload role, unverified). To make (a) checkable, replace the boolean option with the decision table's own
inputs: `publishedRaftRole(serviceType, trackedRole)` in `src/raft/published-raft-role.js`, table-driven
from `docs/specs/decision-tables/leadership-authority-projection.json`, and delete
`collapseLeaderToFollower` (its default is `false`, i.e. the unsafe value is the silent one, `:3-5`).

**Family F - fixtures in `test/` and `scripts/`** (one-way identity ratchet). A site is:

| Kind | Example | Count today (census agent, broad scan) |
| --- | --- | --- |
| `leader_role_row_literal` | `raft_role: 'leader'`, `[COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER`, `raftRole: 'leader'` in an object literal, incl. `RaftRole.LEADER`, alias constants, upper-case | 546 |
| `leader_role_row_conditional` | `raft_role: i === 0 ? 'leader' : 'follower'`, `fc.constantFrom('leader', ...)`, `options.raftRole \|\| 'leader'`, default parameter `raftRole = 'leader'`, `row.raft_role = 'leader'` | 68 (incl. 8 assignment / default forms) |
| `leader_role_builder_argument` | a registered row builder called with a leader role positionally or as `role:` | 104 call sites over 41 builders |
| `live_role_into_row` | `raft_role: service.raft.readStatus().role`, `raft_role: partition.role`, `[COLUMN.RAFT_ROLE]: newRole` in a role-lane double | 8 sites (the four named below plus four more) |
| `leader_role_json_fixture` | `"raft_role": "leader"` in JSON | 3 |

Service-type scoping: the enclosing literal's `service_type` / `entity_type` / `service_id:
META_SERVICE_ID.*` decides. wasm/meta rows are **counted and reported as exempt**, never a violation.
A row whose type cannot be resolved is a violation (fail closed). Message-group rows are a separate row of
the budget (`fixtures_message_group`) because the producer still emits them; that row is unmet but frozen
until the producer flips (slice S5), then ratchets to zero like the rest.

Baseline: `scripts/checks/leader-authority-fixture-baseline.json`,
`{"version": 1, "files": {"<path>": {"<kind>": n}}}`. Per-file keys, not one global count, so parallel
slices edit different lines of the file. One-way rule, enforced by replaying the baseline's git history as
`no-legacy-consensus-reference-ratchet.js` does: a per-file count may only fall; a new file key is refused;
a file at zero is removed; a missing baseline is refused. Failure text: `path:line kind` per site, then
`leader-authority-budget: N fixture rows publish a leader role no partition or message-group producer emits;
write the follower row and the owner row's leader_node_id instead of raising the baseline`. When below
baseline: the standard `Baseline can be tightened from B to C in ...` hint.

Exclusions (committed data, each with a reason, in the checker like the voter-readiness audit):

- tracked-role **inputs** of the projection owner's own tests and role-lane stale-flush tests (about 12
  lines: `test/node/replica-state-machine-registered-activation.test.js:549,598`,
  `test/partition/durable-voter-visibility-role-write.test.js:600,670`,
  `test/bootstrap/registered-service-row-raft-role.test.js:48`,
  `test/raft/authoritative-row-mutation-helper.test.js:42`, and similar);
- the two live-capture JSON files under `test/distributed/fixtures/fresh-formation-live-diagnosis-2026-11-01/`
  (historical evidence of the message-group stamp; they are data about production, not a fixture authoring
  a state).

Wiring (all inside the epic's `authorizes`): npm `audit:leader-authority` in the `test:static` chain and in
`STATIC_AUDIT_SCRIPTS` (`scripts/checks/run-static-audits.js:265-289`); a `test/manifests/proof-obligations.json`
entry with `"wholeTree": true`; `test/scripts/leader-authority-budget.test.js` proving it rejects each kind
(known-bad inputs, R19) and accepts a wasm/meta row; a tools-index regeneration; and a new contract plus
coupled pair in `test/shards/impact-contracts.json` (`leadership-authority-projection`: endpoint
`role-and-leader-producers` = `src/raft/published-raft-role.js`, both service row owners, the leader
publication methods; endpoint `canonical-leader-readers` = `src/query/canonical-leader-routing.js`,
`src/cache/leader-readiness-gate.js`). Today **no** contract or pair owns `published-raft-role.js`,
`canonical-leader-routing.js`, `leader-readiness-gate.js`, `message-group-target-resolver.js`,
`bootstrap-leader-selection.js`, `priority-recovery-scheduling-owner-policy.js`,
`current-priority-placement-observation.js`, `replica-placement-owner-deficits.js` or
`group-retirement-redrive.js`, which is why five interaction-blind fixes could each perturb this seam.

### 5.3 How the fixture lines break down

The census number reproduces: the literal spellings give **489 lines in 196 files** (my own pattern: 492 /
197; the one- to two-file difference from "195" is unexplained). The complete write set a guard must cover
is larger: **614 lines in 256 files**, plus 104 builder call sites. Classification is script-assisted with
more than 100 hits read in context; error rates: row type about 2 %, not-a-row 1.3 %, owner proximity
85-90 % precision.

| Class | Lines (of 614) | Files | Of the 489 | Migration |
| --- | --- | --- | --- | --- |
| Partition row, owner `leader_node_id` written within the same fixture | 192 | 106 | 168 | mechanical: role -> follower |
| Partition row, owner row only elsewhere in the file | 85 | 31 | 73 | treat as no owner (0 of 5 sampled were the same fixture): follower + add the PARTITIONS leader |
| Partition row, no owner write in the file | 174 | 87 | 132 | follower + add the PARTITIONS leader (about 14 of these already get one through a builder) |
| Partition row with an explicit `leader_node_id: null` | 13 | 9 | 7 | these are tests **of the role fallback**; rewritten with their reader (S3) |
| Message-group row (29 with owner, 1 null, 8 without) | 38 | 22 | 21 | frozen until the producer flips (S5); then follower + `message_groups.leader_node_id` |
| **wasm/meta row** | **17** | **6** | **17** | **legitimate, exempt by type** (`test/admin/wasm-meta-serviceized-routing.test.js`, `test/wasm-service/meta-service-router.test.js`, `test/runtime/runtime-adapter-ingress.test.js`, three admin adapter tests) |
| Dedicated test of a role-derived reader | 65 | 26 | 53 | rewritten or deleted in the slice that removes the reader |
| Producer test files | 22 | 9 | 12 | about 10 are ordinary partition rows (mechanical); about 12 are tracked-role inputs (excluded with reasons) |
| Not a services row (live service doubles, normaliser I/O) | 8 | 7 | 6 | not violations; the scanner's shape rule must not match them |

So of the 489: roughly 168 become follower rows with nothing else to do, roughly 205 become a follower row
**plus** a PARTITIONS leader row, 21 wait for the message-group producer, 17 are legitimate wasm/meta, 60
change with their reader, and 18 are exclusions or non-rows.

The four fixtures that pass a live raft role straight into a SERVICES row:
`test/partition/participant-release-query-engine-fixture.js:41` and
`test/raft/raft-rs-backend/runtime-completion-consumers-transfer-fixture.js:71` (both
`raft_role: service.raft.readStatus().role`, both already write the PARTITIONS leader a few lines above),
`test/partition/placement-retained-leadership-fixture.js:77` (`raft_role: peer.leader.role`),
`test/query/query-executor-recovery-read-lifetime.test.js:127` (`raft_role: partition.role`). Four more of the
same kind: `test/rebalancer/replica-placement-owner-test-support.js:426-430` (a role-lane double that writes
the new role unnormalised), `test/convergence/formation-joint-admission-world.js:724,964,1325` (a simulated
world that moves leadership by writing LEADER on the services row), `test/node/group-retirement-fences.test.js:473`,
and the two JSON captures. Fix for all: call the projection owner (`publishedRaftRole`) or
`PartitionServiceRowOwner.buildServiceRow`, as `test/rebalancer/placement-admission-cross-coordinator-target-census.test.js`
already does.

Leverage points (fix these first; number of test files that reach each): `test/query/sql-query-engine-test-support.js:61`
(44), `test/query/routing-repair-test-helpers.js:49,97` (13), `test/admin/admin-websocket-api-test-support.js:333,566,759,811`
(12), `test/query/query-executor-test-support.js:136` (12), `test/query/unknown-outcome-surface-fixture.js:279,565`
(7), `test/topology/cdc-group-propagation-service-harness.js:224` (13 importers, message group),
`test/distributed/harness/__tests__/assertions-test-helpers.js:190,221` (6). Also migrate
`test/rebalancer/test-helpers.js:588-597` (`fixtureWitnessLeader`), itself a role-derived reader in shared
test support (210 importers of the file).

---

## 6. Slice plan and quest proposal

### 6.1 Ordering principle

Section 1 does **not** confirm that #2-#5 affect formation or safety, so the instruction "slice 1 = the
broken live decisions" does not trigger. The order below puts the measuring instrument first, then the one
consumer whose repair changes behaviour (#2), then pure deletions, then the slices that remove a guess from
a path formation actually uses (highest risk, each needs a formation comparison). Slices S1, S2a, S2b, S2c,
S7 and the mechanical part of S8 have disjoint writer sets and can be built in parallel once S0 exists.

Writer conflict to resolve before starting: the main checkout (`candidate/reconciliation-20261119`) has
uncommitted edits in `src/rebalancer/priority-publication-safety-topology.js` and
`src/rebalancer/rebalance-coordinator-operation-creation-support.js`, and #1 / #7 are owned by other writers.
S2a touches the first file.

### 6.2 Slices

Size: S = under 100 changed src lines, M = 100-300, L = more. "Pairs" are the `coupledPairs` /
`contracts` of `test/shards/impact-contracts.json` whose owners include a touched file.

| Slice | Content | src files | Tests | Red witness today | Pairs / contracts | Risk | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **S0** instrument | checker of section 5, baselines, wiring, impact pair, decision-table invariant `published-role-single-projection` | none | `scripts/checks/leader-authority-budget.js`, `scripts/checks/leader-authority-fixture-baseline.json`, `test/scripts/leader-authority-budget.test.js`, `package.json`, `scripts/checks/run-static-audits.js`, `test/manifests/proof-obligations.json`, `test/shards/impact-contracts.json`, `docs/specs/decision-tables/leadership-authority-projection.json` | the metric prints a non-zero count per row | new pair `leadership-authority-projection` | low; it selects proof, so it needs independent review | M (new code) |
| **S1** #2 scheduling owner | re-key candidates on tier P; pass `partitionRows` | `src/control-plane/priority-recovery-scheduling-owner-policy.js`, `priority-recovery-snapshot-closure.js`, `membership-publication-readiness-repair.js`, `membership-publication-candidate-derivation.js`, `src/admin/admin-control-snapshot-control-plane-diagnostics.js` (second caller, `:620,730`) | `test/rebalancer/priority-recovery-surrogate-owner-arbitration.test.js`, `priority-recovery-surrogate-single-followup.test.js`, `unified-rebalancer-triggers-priority-surrogate-followup.test.js`, `unified-rebalancer-triggers-priority-surrogate-gates.test.js`, `unified-rebalancer-surrogate-followup-synthesis-test-cases.js`, `unified-rebalancer-priority-recovery-serial-wait-test-cases.js`, `unified-rebalancer-closure-witness-followup-test-cases.js` | new case in the arbitration test: follower rows + PARTITIONS `leader_node_id` on an available node must yield `current_owner`; today `target_owner_fallback`. Physical confirmation exists (section 1.6 b) | pair `readiness-freshness-macrotask-bound`; contracts `readiness-versioned-planning-liveness`, `CL-033` | **medium-high**: the surrogate lane becomes reachable in production for the first time. Needs decision D2 and a formation comparison | S src, M tests |
| **S2a** #3 #4 delete dead booleans | snapshot keeps `NOT_APPLICABLE`, the two publication waits, named handoff | `src/rebalancer/priority-publication-leader-safety.js`, `priority-publication-safety-shared.js`, `priority-publication-safety-topology.js`, `priority-publication-handoff.js`, `operation-workflow-owner-shared.js`, `operation-workflow-remove-safety-evaluator.js`; `scripts/check-runtime-grammar-contracts.js` | `test/scripts/check-runtime-grammar-contracts.test.js`, `test/convergence/dt-ledger-completion-continuity-discriminator.test.js`, `test/rebalancer/committed-node-remove-safety.test.js`, `operation-workflow-remove-safety-universal-floor.test.js`, `replace-real-group-completion.test.js`, `promoted-voter-voter-ready-routable-60s-axis.test.js`, `test/control-plane/cl-035-voter-ready-row-seed.test.js` | structural only (the code is decision-dead): row `remove_safety` of the metric; plus a new property test that the evaluation is invariant under any `raft_role` value of source, replacement and siblings (it passes today and pins the deletion) | pairs `committed-node-floor-and-retained-wake`, `router-envelope-rebalancer`, `partition-declaration-policy-and-placement`; contracts `CL-038`, `CL-035`, `serve-eligibility-committed-epoch` | low for behaviour; medium for churn in a file with a concurrent writer | M (about 200 lines removed) |
| **S2b** #5 move planner | exact live replica only | `src/rebalancer/move-planner-move-calculation-methods.js`, `move-planner-placement-tail-methods.js` | `test/rebalancer/surplus-drain-prefers-non-leader-source.test.js` (its `raft_role: role` leader rows at `:70,103,130` go) | new case: message-group planner with collapsed rows prefers its own non-leader replicas; today no preference | pair `priority-spread-planner-retention-admission-hold`; contract `priority-spread-planner-admission` | low | S |
| **S2c** #6, N1, N2 | diagnostic, wake arm, producer arm | `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js`, `src/partition/group-retirement-redrive.js`, `src/partition/partition-service-row-owner.js` | `test/node/group-retirement-redrive.test.js`, `group-retirement-as-a-unit-fixture.js`, `test/partition/partition-service-row-owner.test.js`, `partition-leader-row-publication-integrity.test.js` | #6: a healthy snapshot with published leaders warns "no partition leaders found"; N2: a non-conforming row triggers a leader publication | pairs `replica-durable-generation-cleanup`, `fresh-seed-original-publication-and-admission` | low | S |
| **S3** canonical module and query / bootstrap routing: #10, #11 (+N6), #12, #13, #14, N5, overlay producer | delete the tier; local leadership passed explicitly | `src/query/canonical-leader-routing.js`, `sql-query-engine-routing-metadata-methods.js`, `query-executor-canonical-leader-routing-methods.js`, `bootstrap-leader-selection.js`, `sql-query-engine-bootstrap-routing-overlay.js`, `query-executor-partition-service-resolution.js`, `sql-query-engine-provisioning-methods.js`, `src/bootstrap/owners/bootstrap-topology-snapshot-owner-authoritative-rows.js`, `...-leader-identity.js`, `src/bootstrap/node-joining-backfill-merge-and-status.js` | `test/query/query-executor-executeonpartition-leader-resolution.test.js`, `query-executor.test.js` (incl. `:1057` "fresh bootstrap leader fallback"), `query-executor-build-sql-and-routability.test.js`, `query-executor-session-binding-and-build-sql.test.js`, `query-executor-recovery-routing-test-cases.js`, `query-executor-executeonpartition-no-handler-repair.test.js`, `query-executor-recovery-owned-routing.test.js`, `sql-query-engine-routing-overlay-state.test.js`, `routing-overlay-complete-state-retirement.test.js`, `sql-query-engine-managed-split*.test.js`, `test/bootstrap/bootstrap-topology-snapshot-owner.test.js`, `system-leader-readiness-address-gate.test.js`; support `test/query/sql-query-engine-test-support.js`, `routing-repair-test-helpers.js`, `query-executor-test-support.js` | a cache row with role leader and no owner leader is routed to as the leader (`SERVICE_ROLE_DERIVED`); must be `MISSING` / `OWNER_MISSING` | pairs `sql-engine-cache-membership`, `router-envelope-service-bootstrap`; contracts `sql-engine-system-table-read`, `router-delivery-envelope`, `bootstrap-contract` | **high**: write routing in the fresh-bootstrap window before the first leader publication. Needs D3 | L |
| **S4a** #8 growth promote | owner row, then the refusal's leader; no alternate voter | `src/rebalancer/operation-workflow-growth-promote.js` | `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js`, `test/partition/placement-growth-dispatch-identity.test.js` | with the owner-row leader excluded and collapsed rows, the route is "some other voter"; must be a typed deferral | contract `replica-operation-state` | **high: this is on the ADD path of formation**. Needs D3 and a formation comparison | S |
| **S4b** #15 readiness gate | deterministic first hop, no role tie-break | `src/cache/leader-readiness-gate.js` | `test/cache/leader-readiness-gate.test.js`, `leader-readiness-gate.property.test.js`, `concurrent-services-table-writes.property.test.js` | two co-located replicas, one stamped leader: selection changes with the stamp; must not | none registered | medium | S |
| **S4c** #16 #17 placement evidence | owner-row node only | `src/rebalancer/placement-owner-evidence.js`, `replica-placement-owner-deficits.js`, `src/control-plane/current-priority-placement-observation.js` | `test/rebalancer/replica-placement-owner-core.test.js`, `test/control-plane/movielens-phantom-predicate-repro.test.js`, `membership-publication-first-epoch-members.test.js`, `test/admin/admin-control-snapshot-current-priority-placement.test.js` | `leaderKnown` true from a role row with no owner leader; must be false | contract `partition-topology` | medium | S |
| **S4d** #9 publications write leadership | tier 0 and 1 only | `src/control-plane/control-plane-publications-leadership.js` | `test/control-plane/control-plane-publications-leadership.test.js`, `membership-publication-native-ack-order.test.js`, `test/convergence/membership-publication-owner-driver-host.test.js`, `test/simulation/formation-sim-node-hosts.js` | a services witness alone makes a node the publications writer; must be unavailable | contract `active-gate-convergence` | medium (who drives membership publication) | S |
| **S4e** N3 N4 admin and quorum gates | owner row only | `src/admin/admin-service-discovery-table-readiness-methods.js`, `src/bootstrap/owners/partition-quorum-authority.js` | `test/admin/admin-websocket-api-service-discovery-query.test.js`, `test/bootstrap/management-v1-route-authority.test.js`, `contract-first-authoring-fidelity.test.js` | `leadershipStable` true from an advisory role row; quorum vetoed by a raw leader row on another node | pair `admin-notification-repair-cache-owner-handoff`; contract `active-gate-convergence` | medium (load-lane admission) | S |
| **S5** message group: producer flip, #19 | `resolveMessageGroupRaftRole` collapses; readers lose the role arm | `src/message-group/message-group-service-row-owner.js`, `message-group-target-resolver.js`, `src/topology/cdc-group-propagation-routing.js` | `test/message-group/message-group-service-row-owner.test.js` (`:163-168` asserts ACTIVE/leader), `message-group-target-resolver.test.js`, `message-group-native-provisional-route.test.js`, `message-group-native-w7-multi-target-route.integration.test.js`, `cdc-non-leader-propagation.test.js`, `message-group-service-role-publication-and-delivery.test.js`, `test/topology/cdc-group-propagation-stop-arms-nothing.test.js`; support `test/topology/cdc-group-propagation-service-harness.js`, `test/test-helpers/cdc-topology-progress-fixture.js` | the row owner publishes `leader` at activation of a live leader; must publish `follower` | pairs `cdc-source-native-delivery` (41 witness tests), `fresh-seed-original-publication-and-admission` | **high**: CDC coordinator and forward-target ordering change | M |
| **S6** admin diagnostics, harness, CLI: #18, H1, H2 | owner row only; role stays a displayed column | `src/admin/admin-shared-metadata-consistency.js`, `admin-preflight-snapshot.js`, `admin-control-snapshot-leadership-summary.js`, `src/cli/views/services-view.js`, `partitions-view.js` | `test/distributed/scenarios/network-partition-split-brain.js`, `snapshot-live-rebuild.js`, `postgres-baseline-comparison-constants-and-imports.js`, `test/distributed/harness/assertions-control-snapshot-extraction.js`, `assertions-convergence-wait.js`, `consistency-evaluator.js`, `test/integration/helpers/cluster-test-helpers.js` (delete `waitForLeaders`), their `__tests__` | the split-brain evaluation over conformant rows reports `majority_leader_missing` for a healthy majority | none registered | medium: it changes how proof is interpreted, so it needs review; the split-brain scenario gains teeth and may go red for real | M |
| **S7** simulator seed (H3) | seed `leader_node_id: seedId`, role follower | none (`test/simulation/formation-sim-runner.js`) | simulator witnesses | the seed row is one production never publishes | - | medium: simulator verdicts and calibration may move; apparatus-only | S |
| **S8** fixture burn-down | per directory, lowering only its own baseline keys | none | shared support first (7 files reaching about 100 tests), then `test/query` (158 lines / 53 files), `test/rebalancer` (95 / 40), `test/bootstrap` (60 / 28), `test/distributed` (54 / 18), `test/partition` (49 / 17), `test/admin` (46 / 20), `test/control-plane` (46 / 22), the rest (about 106 / 58) | the ratchet row for that directory | whatever each test witnesses | low per file; a test that goes red after the mechanical change was depending on a role arm and belongs to that reader's slice | L in total, parallel |
| **S9** writer uniformity | `publishedRaftRole(serviceType, trackedRole)`; normalise `resolveLiveReplicaRaftRole`; `/register-service` role; remove the lifecycle "cached leader" guard | `src/raft/published-raft-role.js` and its 12 call sites (listed in 1.1), `src/node/replica-state-machine-lifecycle-observation.js`, `src/bootstrap/bootstrap-api-registration-methods.js` | `test/partition/partition-service-role-metadata-publication.test.js`, `test/bootstrap/registered-service-row-raft-role.test.js`, `test/node/replica-state-machine-registered-activation.test.js`, `test/partition/durable-voter-visibility-role-write.test.js` | family W of the metric; a replica state carrying `leader` is written to SERVICES verbatim | pairs `fresh-seed-original-publication-and-admission`, `replica-durable-generation-cleanup` | medium | M |

Dependencies: S0 before everything. S3 before S6 (the admin readers consume the routing snapshot). S5
before the message-group part of S8. S9 last (it makes the collapse guard unreachable). `replace-real-group-completion.test.js`
is touched by S2a and witnesses S4a: serialise those two.

Each of S1, S3, S4a, S4d, S5 changes a decision on or next to the formation path and should retain a
three-host formation comparison (the lab, per the standing rule) before integration. **None of them should
be credited with fixing the 0/3 acceptance**; section 1 gives no evidence that they would.

### 6.3 Quest proposal

A single quest with target 0 over the whole migration cannot land slice by slice (`land` measures the sealed
probe). The repository's own pattern for this is one metric with rows and one quest per row
(`system-table-decoded-reads-query`, `system-table-decoded-reads-rebalancer` on
`code-navigability-budget.js --rows`). Probe kinds available: `test-receipt`, `scenario-harness`, `oracle`,
`script` (`scripts/solve/schema.js:75-80`); a `script` probe must live under `scripts/checks/` and print a
number.

Parent record (epic summary entry, not a sealed quest): **leader-identity-single-authority** under
`operation-integrity-and-reliable-formation` (its `authorizes` covers `src`, `test`, `scripts`, `docs`,
`architecture`, `solve/*`, `package.json`; VERIFIED at lines 88-103).

First quest, to be sealed once S0's checker exists (S0 itself is a proof-selecting direct change with
independent review, or a `test-receipt` quest of its own, because the probe cannot be red before it is
written):

```json
{
  "schema": "solve-quest/2",
  "id": "leader-identity-scheduling-owner-authority",
  "epic": "operation-integrity-and-reliable-formation",
  "statement": "The priority-recovery scheduling owner of a partition is decided from the partition owner row's canonical leader publication on a recovery-active node, with live-leader-evidence-unavailable as a named outcome whose consequence is that only the target partition's own live leader schedules; no SERVICES raft_role is read as leader evidence by the policy, and its tests build only rows the producers emit.",
  "doneWhen": {
    "probe": "script",
    "args": {
      "command": "node scripts/checks/leader-authority-budget.js --metric --rows scheduling_owner",
      "target": 0
    }
  },
  "constraints": [
    {"id": "no-new-guess", "statement": "Removing the role arm adds no other derivation of leader identity; an unavailable observation stays a named state."},
    {"id": "sealed-arbitration-preserved", "statement": "The three outcomes sealed by movielens-priority-surrogate-single-owner-arbitration remain; deleting the surrogate lane instead requires explicit supersession of that quest."},
    {"id": "formation-neutral", "statement": "A three-host formation comparison is retained before and after; this quest claims no formation acceptance."},
    {"id": "fixture-ratchet-one-way", "statement": "The fixture baseline for the touched test files is lowered in the same change and never raised."},
    {"id": "independent-verification", "statement": "Source changes are approved by a subagent verifier newer than the last attempt."}
  ]
}
```

Sibling quests, same shape, one row each: `remove_safety` (S2a), `move_planner` (S2b),
`wake_and_producer_arms` (S2c), `query_bootstrap_routing` (S3), `growth_promote` (S4a),
`leader_readiness_gate` (S4b), `placement_evidence` (S4c), `publications_leadership` (S4d), `admin_gates`
(S4e), `message_group` (S5), `admin_diagnostics_and_harness` (S6), `fixtures_<area>` (S8), `role_writers`
(S9). The program is done when `node scripts/checks/leader-authority-budget.js --metric` (all rows) prints
0, the fixture baseline file is deleted, and the decision table's note "readers still consuming the leader
witness are migration debt" is replaced by the invariant.

Reproducer for the first quest (already in hand): the `events.ndjson` lines of section 1.6 (b), and the
arbitration test case named in S1.

---

## 7. Prior art (only what changes the design)

- **CockroachDB.** The leaseholder is a replicated record (lease with sequence and epoch) and is distinct
  from the raft leader; gateways keep a range cache that is explicitly a hint. A request sent to the wrong
  replica is answered `NotLeaseHolderError` carrying the current lease, and the cache is updated only if the
  returned lease sequence is newer. Applies: tier P is the range cache, the not-leader refusal carrying
  `leaderReplicaId` is the correction, and hints are ordered by `(term, version)` (3.4). It also argues
  against "alternate voter" picks: the system sends to the hinted replica or to any replica and lets the
  replica redirect; it never labels its guess the leader.
- **TiKV / PD.** Leader identity is reported by the region itself in heartbeats as a **peer** (peer id and
  store id) together with the region epoch and term; PD discards heartbeats with a stale epoch or term, and
  clients treat PD's answer as a cache corrected by `NotLeader` and `EpochNotMatch`. Applies: the node-level
  owner row is the gap (3.3); TiKV shows the fix is replica-level identity plus an epoch, which tier F already
  has. PD's `remove-peer` on a leader is preceded by `transfer-leader` and the raftstore itself refuses to
  remove the leader peer: the check lives in the group, which is what the named handoff plus conf-change
  admission already do here and why #3/#4 are redundant.
- **etcd.** Only raft knows the leader (`Status().Lead`, term); clients do not need it because any member
  forwards; `MoveLeader` is executed by the current leader; a leader removed by a conf change steps down after
  the change commits. Applies: removing a leader is safe by construction in the consensus layer, so the
  planner's leader avoidance (#5) is a liveness preference and may be UNKNOWN without risk.
- **Kubernetes.** A Lease object holds `holderIdentity`, `leaseTransitions` and `renewTime`; it is written by
  compare-and-swap on `resourceVersion`; informers are caches that deliver **watch events**; a controller acts
  only while its own lease observation is fresh. Applies: one durable record with a monotonic transition
  counter (the claim term), a CAS writer (exists), and a watch as the canonical wake (3.8) instead of
  re-deriving from a second table.
- **Common rule adopted.** One record per group names the leader; every cache of it is a hint ordered by an
  epoch; the group validates at the point of effect and answers a typed redirect; unknown is a state the
  caller waits on. No system in this list derives the leader from a per-replica role column.

---

## 8. Decisions needed and what was not checked

### 8.1 Decisions needed from the lead

| Id | Decision | Options | My recommendation |
| --- | --- | --- | --- |
| D0 | Priority of this program, given section 1 | (a) run it now as planned; (b) run S0 + S2 (deletions) now and hold the behaviour-changing slices until formation is green | (b). Nothing here is shown to cause the 0/3; S1, S3, S4a, S4d and S5 each change a decision near the formation path while its acceptance is red, which would confound the formation diagnosis |
| D1 | Replica-level identity on the owner row | (a) keep `leader_node_id` node-level, replica identity only through tiers L and F; (b) add `leader_replica_id` to PARTITIONS / MESSAGE_GROUPS | (a). No consumer in 3.9 needs (b); (b) is a schema change with its own transition record |
| D2 | #2 surrogate lane | (a) re-key on the owner row, which **activates** surrogate scheduling in production for the first time; (b) delete the lane and supersede quest `movielens-priority-surrogate-single-owner-arbitration` | (a) if the sealed five-node milestone still needs it, with a leaderless-partition witness; otherwise (b), which is the smaller system. The owner must say which, because (a) is new production behaviour and (b) rewrites a seal |
| D3 | The four "pick something" tiers that are not role reads but sit beside them: alternate voter (#8, `growth-promote.js:279-285`), single visible service (#12, #13), `-r1` suffix (#14), any observable replica (#15 `allowLeaderServiceFallback`) | (a) delete with the role arm (leader unknown = typed deferral + wake); (b) keep as explicitly named non-leader first hops ("any replica, expect a redirect") | (a) for #8, #13, #14; (b) for #15 renamed, because a first hop that claims nothing is legitimate. Each (a) lengthens the window before the first leader publication, so each needs a formation comparison |
| D4 | `RETAINED_RUNTIME` tier in the query executor | keep (previous value of the same authority, bounded by an ACTIVE service) or delete | keep; record its bound and invalidation in the contract |
| D5 | Message-group producer flip (S5) | with the readers in one slice, as the decision table requires, or guard first scoped to partitions | one slice; the guard's message-group row stays frozen until then |
| D6 | The split-brain scenario (H1) | repair now (it currently cannot detect split brain), or record as a finding for its owner | record now, repair in S6; check first whether it is red or skipped in the matrix |

### 8.2 Findings to route (R17), outside this program's scope

- `test/simulation/formation-sim-runner.js:220-231` seeds the inverse of production leader evidence; any
  simulator-derived conclusion about the role-arm consumers is suspect.
- `test/distributed/scenarios/network-partition-split-brain.js` cannot observe a leader, so its split-brain
  safety verdict is not a proof.
- `scripts/checks/check-contract-authoring-fidelity.js` is reported to be in no gate.
- Formation evidence shows serialisation behind the ledger partition and failed control-snapshot reads, not
  a leadership-evidence defect (section 1.6).
- `src/bootstrap/bootstrap-api-registration-methods.js:107,128` is reported to write a client-supplied role
  verbatim.

### 8.3 Not checked

- No test, harness or checker was run; all "today red" witnesses are predicted from code.
- The hop from the SERVICES cache shadow to `planningSnapshot.serviceRows`, and whether the planning snapshot
  with `schedulingOwner` is computed once and published or recomputed per node (it decides whether #2's
  arbitration is single).
- Whether the message-group rebalancer sets `replicaId` / `isLeader` the way the partition one does (needed
  for S2b's generalisation), and how long a message-group `leader` stamp survives before the role lane
  overwrites it.
- Writers of `replicaState.role` (only `raftRole` was searched) for `resolveLiveReplicaRaftRole`.
- The inputs of the message-group leader-node mutation helper (assumed live leadership).
- Everything in section 2 marked V1 was read by the delegated census agent, not by me; I spot-verified N1-N4,
  N6, the split-brain predicate, `extractLeaders` and the simulator seed.
- The fixture classification is script-assisted (error rates in 5.3); the exact red numbers of the proposed
  checker are estimates until it exists.
- Branches other than `f580579a5`: `wip/q11-placement-route-nov21` (#7), the #1 repair, and the uncommitted
  edits in the main checkout were not read, so line numbers may have moved there.
- The sentence about 117.249 s was not found in either readable copy of the quest log; snapshots of run
  `3ed87e16` have a gap from +86 s to +622 s, so that interval was inspected only through node logs (operation
  types) and not through row state.
- 5-node and co-located-replica formations (where REPLACE and surplus drain do run) have no retained evidence
  here; for them the conclusions about #3-#5 rest on the code trace alone.
- Prior art is from knowledge of those systems' published designs, not re-fetched.
