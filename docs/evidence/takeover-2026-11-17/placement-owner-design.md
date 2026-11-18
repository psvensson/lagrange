---
audience: evidence
recorded: 2026-11-18
---

# One level-triggered replica placement owner: design and Quest proposal (2026-11-17)

**Owner decision being implemented (2026-11-17, recommended option):** "Replace with one owner: open a sealed Quest; remove the wake/stagger/Phase-B series and build one level-triggered placement owner (e.g. the REPLICA_OPERATIONS ledger leader admits from durable deficits in priority order; completion triggers the next admission). GCP campaign only after a clean lab pre-gate."

**Inputs:**
- Rule-set revision 5 (`docs/steering/rules.md`, last reviewed 2026-10-30).
- Candidate `219c27bfe` in the read-only worktree `/mnt/data/peter/projects/lagrange-gcp-takeover-20261117`. All line numbers are at that HEAD unless marked otherwise.
- Fix A `f50344e98` (`claude/fix-a-replace-20261117`) and fix B `ff4318b24` (`claude/fix-b-ownerlane-20261117`). Each is one commit on top of `219c27bfe`; neither is an ancestor of it.
- Audit: `audit-candidate-4b0c8ec1d.md`. Pre-gate: `pregate-219c27bfe-summary.md`, plus its evidence `pregate-219c27bfe/analysis-replica-operations-inflight.txt`.

**Labels:** **C** = CONFIRMED by reading the code or evidence; **P** = PLAUSIBLE (inferred, or not yet executed).

Nothing in this document has been built or run. It proposes a Quest; it seals nothing.

---

## Revision 3 (2026-11-18): gate check passed for WP-E; WP-F gates, the D5 decision and the interfaces folded in

The gate check on rev. 2 cleared **WP-E to start**. Before editing I verified each item:
- the latch design: `formation-latch-design.md` §3.4 and §6.2: `answerFormation()`, `cluster_formation`, the four states and `FORMATION_NOT_LATCHED`;
- founding rev. 1 §2.12 (`founding-membership-design.md:831-864`);
- the provisioning persistence contract "advance after a terminal row" (`replica-operation-repository-mutation-persistence-methods.js:376-377`);
- `resolveJoinSupportEnvelopeConflict` (`support-envelope-owner.js`, called at `bootstrap-join-admission-owner.js:38, 266`);
- WP-D `fed85ec00` (C: `git show --stat`).

Inline edits are marked "(rev. 3)".

| # | Item | Resolution |
| --- | --- | --- |
| 1 | **D5 decided by the owner (2026-11-18):** RESYNC may admit under the four conditions | Marked decided in §2.3, §6 and the constraint `no-timer-no-bound-no-retry` |
| 2 | **R4:** the "not yet founded" rule forbade re-founding after every founder failed | **Founded = some GENESIS founder row incomplete or ACTIVE**; an all-FAILED history admits a new set (`replica-operation-repository-mutation-persistence-methods.js:376-377`, "advance after a terminal row"). System-catalog ids are refused by kind with **`SYSTEM_PARTITION_SEED_FOUNDED`** (founding's name; no seed marker). The pre-GENESIS corner (release 0.2.6 and earlier) is recorded and excluded by the version fence (§2.5 step 4). New checks F9b-F9d and A10. |
| 3 | **P4 interface** | It consumes **`answerCommittedNodes().formation`**, i.e. `ServeEligibilityOwner.answerFormation()` over `cluster_formation` with states FORMED / FORMING / UNDECLARED / UNAVAILABLE. The waiting reason is `FORMATION_NOT_LATCHED`, and `formationLatchEpoch` is carried on each command. **Not** `answerFormationAdmission()` / `formation_complete` (§2.1, §2.4, §2.6, §2.7, §2.8, §2.10, constraint). The owner decision 2026-11-18 is recorded: reads are allowed before formation, so `CLUSTER_FORMATION` is not a HARD `/readyz` dependency. Placement's gate is unaffected. |
| 4 | **P5** verified on both sides | §2.13 is now a per-item table. Agreed: entry, busy rule, apply-index ids, the GENESIS marker and retention, step sets (PROMOTE `PROMOTION_PENDING` / `PROMOTION_PROPOSED`, `TARGET_PROMOTING`, all outside `COPY_PHASE_STEPS`), the voter target, and the deficit kinds `LEARNER_DEFICIT` / `PROMOTION_READY` / `DEAD_LEARNER`. Adopted from founding: split and merge `foundingIntentId (workflowId, childPartitionId)`. **One mismatch remains on founding's side:** its `isPartitionFounded` ledger half must adopt the live-set rule of item 2. |
| 5 | **WP-D needs a release fence** before it merges | **P6:** this release boundary is fenced by the support-envelope owner (founding D7: a certified pair excluding pre-change sources, join refusal `OUTSIDE_SUPPORT_ENVELOPE`, the seed's founding-layout refusal), so no mixed-version `nodes-p1` exists. It is a precondition of WP-D merging. There is no capability-gated dual write. |

**One consequence I applied beyond the list; please confirm.** The same fence also guarantees that no `replica_operations-p1` replica lacks the `PLACEMENT_ADMIT` applier. The rev. 1/2 **capability fence** (`placement-admit-v1`, target capability, `LEDGER_REPLICAS_NOT_CAPABLE`) is therefore a second, placement-local version-compatibility authority that can never fire. It is retired in favour of P6:
- R01: version compatibility has one owner;
- the owner's "remove unused paths" rule;
- D6 is withdrawn, the V4 witness is removed, and F3 now documents only the wedge the fence prevents;
- WP-D writes no capability token.

If you want the capability fence kept as defence in depth, §2.2 and D6 of rev. 2 are the text to restore.

**Remaining gates for WP-F:**
- WP-B sealed;
- WP-E landed, including the four owner events (`TARGET_CAPACITY_CHANGED`, `WRITE_PATH_RELEASED` ×2, `PRESSURE_RELEASED`);
- WP-D merged behind **P6**;
- **P4**, the formation-latch Quest's S4 (`answerFormation()`) landed;
- **P5**, founding adopting the live-set rule in its `isPartitionFounded`;
- **P6**, the support-envelope fence in place.

D5 is decided. D2 is frozen by the WP-A sweep before WP-J, not before WP-F.

---

## Revision 2 (2026-11-17, night): re-review APPROVE-WITH-CHANGES, folded in

The three rev. 1 refinements are accepted: the apply-index `operation_id`, the hold release at copy-phase idle, and `comparative-smoke-setup` moved to the service Quest. Before editing I re-verified every finding at `219c27bfe` and re-ran the reviewer's `scratchpad/placement-vet/probe2.mjs`. Its output:
1. on an old replica, `PLACEMENT_ADMIT` is refused `partition_write_command_type_unknown`;
2. a typed command is admitted by CDC owed admission;
3. system-table schema ingress is refused (`SYSTEM_TABLE_WRITE_REFUSED`);
4. a replicated ALTER on a replica that already has the column fails `duplicate column name`, a deterministic failure;
5. at 4,096 owed events a SQL INSERT is refused while `PLACEMENT_ADMIT` is admitted.

My line numbers differ by a few lines from the reviewer's in places; mine are at `219c27bfe`. Inline edits are marked "(rev. 2)". R1-R3 gate WP-E; R4, R5 and R8 gate WP-F.

| # | Finding | Verified | Resolution |
| --- | --- | --- | --- |
| R1 HIGH | The replicated `MIGRATION_ALTER_TABLE` cannot run | C: `executeMigrationAlterQuery` → `resolveSystemTableSchemaRefusal` (`partition-service-remote-query-methods.js:386-393`); probe2 items 3 and 4 | `copy_source_node_id` (and `NODES.host_id`) are declared in the schema and created by the node-local ensure. The capability fence (every ledger voter and every target) guarantees the column exists before use (§2.2, §2.5, WP-D). Falsifier F10. |
| R2 HIGH | Idempotency and the reservation re-park must be inside the applier | C: typed commands return at `partition-service-entry-apply-base.js:651-660`, before the SQL branch's settled check; `applyCoordinatorSettlement` replays first (`:80-85`) and re-parks second (`:86-88`) | The applier's steps are 0 validate, 1 settled-key replay, 2 re-park, then its checks (§2.5). F5 commits the **same entryId twice** in the log; F7 covers the reservation. |
| R3 MED-HIGH | The CDC debt bound is bypassed | C: `requiredCdcSlots` (`partition-cdc-owed-admission.js:39-50`); probe2 item 5 | The command counts its rows at request and at apply, refusing typed `CDC_CAPACITY`, cleared by the acknowledgement commit. CDC goes through `recordCommittedOperationCdc` (`partition-cdc-obligation.js:227`, the participant model) (§2.5). F8 and witness A11. |
| R4 MED-HIGH | The entryId rule and FOUND identity were undefined | C: `durable-schema-planning-retention.js:22-36`; `spread-cure-transition-authorization.js:378-392`; `rebalance-replace-intent-identity.js` used only by the coordinator creation paths | An entryId names one attempt: reused only to re-propose after an unknown outcome, fresh after a definite one. FOUND gets the **not-yet-founded** rule (`ALREADY_FOUNDED{operationIds}`). `rebalance-replace-intent-identity.js` is deleted and its replica-id rule moves into the applier. The spread-cure authorization object is deleted; the destination checks the committed row. Provisioning retention is re-keyed to the returned founder ids (§2.5). F9 and A10. |
| R5 MED-HIGH | P4 and P5 cannot be met as written | C: the owner decision text, and `formation-admission-design-2026-11-11.md` at `origin/wip/formation-stability-20261111` (`22f9791e9`); founding design lines 334, 363, 484, 587, 675 | **P4** is now the owner's binding declared-size latch (`formation_complete`, `answerFormationAdmission()`), with its Quest opened by the lead; the sibling's sentence gets an R09 supersession. **P5** is an interface agreement only (§2.13): what this Quest provides and what it needs, with no build cycle. |
| R6 MEDIUM | The ledger move's own stall freezes everything, FOUND included | agreed; memory 29.9-57.8 s per self-move | Exclusive time per ledger move and time to latch are measured (WP-A, A6, WP-J). The stuck-STOPPING path is a prerequisite finding. Risk R14. |
| R7 MEDIUM | D6 understated; the old replica does not diverge | C: `committedCommandGate` throws `COMMITTED_COMMAND_UNRECOGNISED` (`partition-service-entry-apply-base.js:94-102`); probe2 item 1 | D6 and §2.2 corrected: the pause also stops FOUND (CREATE TABLE) and runtime-service placement, and an old replica wedges rather than diverges. The fence stays. F3 updated. |
| R8 MEDIUM | Three triggers do not exist | agreed (rev. 1 marked them P) | Marked "does not exist yet". Created in WP-E at four owners, an explicit widening (R16) named in the constraint `every-refusal-has-a-clearing-trigger`. They must exist before WP-F. F11. |
| R9 LOW | The remove-safety builder span was wrong | C: `:455-466` (`isVoterReadyFloorCountableReplica`) and async `getCriticalMinReplicaCount` at `:577` | Extract the whole `:445-585` derivation as one async builder (§2.8) |
| R10 LOW | Removal-serving type; outcome retention; id prefix | C: `isRemovalServingRequestType` (`:388-399`); no `DELETE FROM replica_operations` and no outcome retention | The message type is added. `operation_id = pl-<partitionId>-<applyIndex>-<n>`. `_partition_statement_outcomes` growth is recorded as finding R15. |
| D5 | ruling text | - | The reviewer's four conditions are written into §2.3, §6 D5 and the constraint `no-timer-no-bound-no-retry`, pending the owner's confirmation. |
| D2 | values | - | `K_src = 3`, `K_tgt = 2`, pending the WP-A sweep |

**Disagreement:** none.

**One addition beyond the review**, in §2.13 (b): seed-bootstrap founding cannot go through `PLACEMENT_ADMIT`, because `replica_operations-p1` cannot admit its own founding. The founding design must state how seed-founded partitions are marked as founded, so the not-yet-founded rule and the deficit model see them.

---

## Revision 1 (2026-11-17, evening): independent review APPROVE-WITH-CHANGES, folded in

The architecture stands: one level-triggered owner on the ledger leader, with admission decided at Raft apply. The review blocked WP-E on the rev. 0 §2.5 specification. Every finding was re-checked in code or by re-running the reviewer's probes (`scratchpad/placement-vet/probe1.mjs`, `drain.py`) before changing the design. The inline edits are marked "(rev. 1)".

**Owner decisions taken since rev. 0:**
- D1 = (b): a separate founding-membership Quest.
- D3 = a required, explicit host identity.
- D4 agreed, with a typed `UNSUPPORTED_ENTITY_KIND`.
- D2 is pending WP-A; the reviewer prefers `K_src = 3`.

| # | Finding | Verified | Resolution (section) |
| --- | --- | --- | --- |
| 1 | The conditional INSERT runs only on the leader-local leg; the routed path refuses INSERT…SELECT | C (probe output; `sql-parser.js:523-530`; `cdc-routed-mutation-readiness.js:211-217`; `cdc-integration-service-mutation-operations.js:240-245`) | Replaced by the typed committed command `PLACEMENT_ADMIT`, with a deterministic applier and a request routed as `COORDINATOR_SETTLEMENT_TYPE` is (§2.5). WP-E's falsifier F1 runs the routed path. |
| 2 | No primary key in CDC for the conditional statement | C (probe: `{}` plus count-mismatch warning; `system-table-cache.js:288-290`) | The applier records CDC from the inserted row image (§2.5). Falsifier F2. |
| 3 | A deterministic `operation_id` collides with retained terminal rows | C (probe op5; pre-gate 17:24:22 and 17:24:37) | `operation_id` is minted from the apply index; lost answers resolve by entryId (§2.5). Witnesses A7 and N5. *Equivalent to the reviewer's "add a per-entity generation" and somewhat stronger: unique by construction, with no generation bookkeeping.* |
| 4 | Founding conflicts with the lane and `K_tgt`; copy source undefined | C (`sql-query-engine-initial-partition-provisioning.js:390-420`; pre-gate 17:31:58) | A FOUND transition: one command for the whole set, exempt from copy capacity, identity owned by the founding-membership Quest (§2.5, P5). Witness A10. |
| 5 | Ledger starvation under IDLE_ONLY | agreed (history of the 2026-08 hold quests) | The ledger operation is committed engaged with a durable dispatch hold; DEFER from that commit (§2.5). *Refinement:* the hold releases at **copy-phase** idle, so a stuck removal-phase row (the STOPPING REMOVE, or the immortal rows at `operation-workflow-terminal-transition-repair.js:33`) cannot freeze ledger repair and, through DEFER, all placement. Witnesses A6 and N6. |
| 6 | Formation ran at one copy (`K_src − 1` for every HOST_SPREAD move) | C (my rev. 0 rule) | Classes 1-2 and repair use the full `K_src`; only non-repair moves of classes 3-5 use `K_src − 1` (§2.6). |
| 7 | Transient refusals lose their edge; "zero RESYNC" was unachievable | C (`partition-write-kernel.js:49-63`; `cdc-routed-mutation-readiness.js:383-395, 477-484`) | Applier refusals are committed outcomes that emit `ENTRY_COMMITTED`. Each write-kernel or input refusal maps to a clearing trigger (§2.7), with owner events added where missing (R11). Per-candidate RESYNC attribution (§2.3), ruling D5. Witness V5. |
| 8 | Columns added by node-local bootstrap diverge across versions | C (`partition-service-table-bootstrap.js:311`) | No lane column ("busy" derived from `isIncompleteOperationRowStep`). `copy_source_node_id` via the replicated `MIGRATION_ALTER_TABLE`. A capability fence for mixed versions (§2.2, §2.5, D6). |
| 9 | Census misses: two bypass inserts and timer-driven clearing-event producers | C (`…mutation-update-methods.js:455`; `…gate-operation-row-repair.js:41`; `membership-publication-coordinator-reconcile.js:597-621`; `replica-operation-step-policy.js:495-512`; `storage-capacity-semantic-projection-owner.js:500-540`) | §1.1 S9 and S10, §1.2(f), §2.3 and the WP-F evidence decision |
| 10 | The §1.7 / §2.11 window labels were inverted | C (`drain.py`: 9 completions at 22.2 s per copy versus 13 at 7.5 s per copy; a 52 s stall) | Corrected (§1.7, §2.11). The ">420 s" conclusion still holds: 600-1,310 s of drain. |
| 11 | `quest.json` still required the 3/3 journey | agreed | Replaced by `lab-formation-drain-mechanism-metrics`. *I also moved `comparative-smoke-setup` with the journey* (D1(b) moves the physical service claims, and the smoke setup depends on a clean pre-gate). Tell me if the owner wants it kept here. |
| 12 | Is FORMED latched or live? | C (`priority-recovery-partition-assessment.js:84-130`; no latch in src) | Latched, owned by membership publication (owner decision 2026-11-11 (1)); precondition P4; no live mode (§2.6) |
| 13 | The ledger leader can leave the seed by election | agreed; rev. 0 overclaimed | §2.2 corrected; WP-A measurement; R10 |
| 14 | An admitting RESYNC needs a ruling | agreed | D5, recommended (a) with a zero-count acceptance |
| 15 | The owner rebuilt `projectedVoterReadyRows` | agreed | An input builder exported by the remove-safety owner, extracted refactor-only (§2.8) |
| 16 | The memoization was circular | agreed | Reads are trigger-driven; positions memoize planning only (§2.3 step 1-2, §2.4) |

**No disagreement on substance.** The three refinements (3, 5, 11) are marked above.

---

## 0. Summary (rev. 1, amended rev. 2 and rev. 3)

- **One owner of one fact.** The fact is "which membership-changing replica operation is admitted next". Its owner is the `ReplicaPlacementOwner`, the provisional name from the binding direction of 2026-09-20. It runs only on the node that holds Raft leadership of `replica_operations-p1`, where every admission is committed.
- **Execution, safety floors and target scoring keep their current owners.** The owner only admits:
  - execution stays with `OperationWorkflowOwner`;
  - the REMOVE floor stays with `evaluateRemoveSafety` as amended by fix A (the owner uses its exported input builder and predicate);
  - target scoring stays with `placement-owner-decision.js`;
  - the per-partition precedence of moves stays with `effective-placement-serial-priority-planner.js`.
- **Admission is one typed committed command, `PLACEMENT_ADMIT`** (rev. 1; it replaces the conditional INSERT, which only the leader-local leg could run). A deterministic JS applier inside the Raft apply transaction (the `applyCoordinatorSettlement` pattern) checks, against all committed ledger rows at that log position:
  - the partition is not busy, where "busy" is derived from the step owner's predicate and needs no lane column;
  - no ledger transition is unresolved;
  - copy-phase occupancy per copy source and per target is below `K_src` and `K_tgt`.

  It then inserts the row with an apply-index operation id, records a typed outcome under the command's entryId, emits CDC from the full row image, and fires `ENTRY_COMMITTED` whether it admits or refuses.

  **(rev. 2)** Before any check the applier replays a settled entry key and re-parks on a partition reservation, as `applyCoordinatorSettlement` does. It counts its rows against the CDC owed bound at request and at apply. `copy_source_node_id` is declared in the schema, not added by a replicated ALTER. An entryId names one proposal attempt. **This applier is the one canonical owner of target-wide and source-wide occupancy.** That closes the cross-coordinator failure of §1.6 (an owner-scoped read behind a per-process mutex). Witness W-T pins it.
- **Passes are level-triggered.** Triggers are committed ledger entries, the committed node and formation answer (`answerCommittedNodes()`, rev. 3), SERVICES and PARTITIONS changes (the cache is a trigger only), target-capacity changes, write-path releases, leadership start, and one slow resync. Every refusal has a typed reason whose clearing trigger is in that set. RESYNC admissions are attributed per candidate and counted as lost-edge defects (ruling D5).
- **Priority order (a queue, not timers):**
  1. the ledger partition, engaged with a durable dispatch hold that blocks new admissions until it is released at copy-phase idle;
  2. the five other priority partitions;
  3. after the formation latch is FORMED (`answerCommittedNodes().formation`, from `ServeEligibilityOwner.answerFormation()`, rev. 3): `nodes-p1`;
  4. the other system partitions;
  5. user partitions.
- **Copy load is a capacity rule, not a timer.** At most `K_src` copy-phase operations per copy-source node and `K_tgt` per target.
  - Classes 1-2 and every repair may use all of `K_src`.
  - Non-repair moves of classes 3-5 may use `K_src − 1`.
  - Recommendation: `K_src = 3`, `K_tgt = 2` (D2, pending WP-A).
- **Founding is its own transition (`FOUND`).** It admits a new partition's whole founding set atomically, **once** (rev. 2: `ALREADY_FOUNDED` carries the existing ids), and is exempt from copy capacity. The interface with the founding-membership Quest is an agreement only (§2.13, P5).
- **Deleted, not disabled:** the wake/stagger/Phase-B series, the 70 s fence and its exemption, the per-partition placement timers, the four-source budget gate, the ledger interlock, the per-partition placement path and (subject to WP-F's evidence) two bypass inserts.
- **Feasibility (§2.11, D1 decided = (b)).** The owner is necessary but not sufficient for the 3/3 lab journey within 420 s on a 1-CPU seed. The corrected pre-gate rates (7.5-16.4 s per background copy) give 600-1,310 s of drain after the priority phase. The 3/3 journey stays with the service Quest. The larger lever, founding with one voter, is a separate Quest. This Quest's physical receipt is the formation drain's mechanism metrics.
- **Scope is partitions.** Message-group membership change is refused by design, so `mg-1` is listed in the owner snapshot as `UNSUPPORTED_ENTITY_KIND`. Its seed-loss exposure is recorded on the service Quest (D4, decided).

---

## 1. Current-state census

Sources:
- my own reading of the series commits and fixes A and B;
- a read-only census subagent over `src/rebalancer` and its callers;
- a read-only test and harness census subagent.

Both subagents read every line they cite. Their inferences are marked P.

### 1.1 Who decides placement today

Every ledger operation is persisted through one coordinator path, `RebalanceCoordinator.createOperation` (C):
1. `rebalance-coordinator-operation-creation.js:185-259`;
2. `createOperationInternal` (`:421-535`);
3. optionally `createOperationWithinConcurrentCreateBudgetTurn` (`rebalance-coordinator-concurrent-budget-gate.js:95-113`);
4. `createOperationRecordInternal` (`:550-`);
5. `persistNewOperationAtAdmissionBoundary` (`rebalance-coordinator-operation-creation-admission.js:439`).

The decision of what to create is spread over many callers on many nodes:

| # | Decision site (file:line) | Decides | Runs on | Triggered by | Verdict |
| --- | --- | --- | --- | --- | --- |
| S1 | MovePlanner `move-planner-move-calculation-methods.js:152-960` (called from `unified-rebalancer-rebalance-loop.js:353-357`), cure table `replica-placement-cure-policy.js:107-187` | FAILED_REPLICA REMOVE (310-351); UNDER_REPRESENTATION ADD (119-150, 446); over-target retention ADD (533); NODE_NOT_IN_TARGET / OVER_REPRESENTATION REMOVE (610-690, 868); priority-spread drain REMOVE including LEDGER_DRAIN (721; `move-planner-priority-spread-cure.js:187-266`); expand ADD or REPLACE including LEDGER_EXPAND (781; spread-cure 268+); PAIRED_RELOCATION REPLACE (798-842) | the entity's Raft leader node: all 46 on the seed at formation | `checkRebalance`, then `advanceCheckCadence`, then `rebalance()`, then `executeMoveViaCoordinator` (`unified-rebalancer-move-execution.js:263-323`) | **Move into the owner.** It becomes the owner's deficit kinds. The precedence function and the target scorer are consumed. |
| S2 | Priority-recovery follow-ups: `unified-rebalancer-follow-up-augmentation-methods.js:216-347`, `unified-rebalancer-follow-up-move.js:199-310, 606-686`, `unified-rebalancer-priority-recovery-follow-up-decisions.js:119-160`, `unified-rebalancer-follow-up-decision.js:571-652` | follow-up ADD or REPLACE; **surrogate** follow-ups that create operations for *other* priority partitions (304-347) | the leader of any priority partition | the same pass | **Move into the owner.** A surrogate is evidence that the problem is cross-entity. |
| S3 | `unified-rebalancer-failed-create-cleanup.js:69-106` | lifecycle precondition for the FAILED_REPLICA REMOVE | entity leader | each pass | **Move:** it becomes the `FAILED_OR_DEAD` deficit precondition |
| S4 | Ledger self-move cure: REPLACE, LEDGER_EXPAND, LEDGER_DRAIN via S1; capability from `rebalancer-priority-recovery-planning-gate-methods.js:509`, `rebalance-loop.js:326-350`; ordered first by `unified-rebalancer-budget-planning.js:289-304` | the ledger's own spread | the `replica_operations-p1` leader | its own checks | **Move:** it becomes class `LEDGER` with apply-time exclusivity |
| S5 | `src/query/sql-query-engine-initial-partition-provisioning.js:301-420`, then `sql-query-engine-provisioning-admission-methods.js:478-499` | founding ADDs of a new table's partitions | the node running the schema job (P) | CREATE TABLE and reconciliation | **Keep** (a separate fact: founding a new group). It uses the owner's `PLACEMENT_ADMIT` as the `FOUND` transition (rev. 1). |
| S6 | Runtime services: `src/bootstrap/shared/runtime-service-rebalancer-setup.js:484-540` (an owner bound to the `service_definitions-p1` leader by a leadership sink) | service placement (`sys-postgres-wire`) | `service_definitions-p1` leader | `service_definitions` cache change, plus a 5 s `setInterval` (`:57-58, 229, 522`) | **Keep** (no group copy). Inserts go through the `PLACEMENT_ADMIT` (`RUNTIME_SERVICE`, no copy capacity). Its 5 s interval is a finding (R17). |
| S7 | Split and merge dissolution: `managed-split-workflow-dissolution-methods.js:606-620`, `managed-merge-workflow-dissolution-methods.js:478-494`, `replica-handler-group-retirement-request-methods.js:126-136` | REMOVE_REPLICA messages sent directly; **not ledger-persisted** | split or merge workflow owner | dissolution | **Out of scope.** Retiring a whole group is not placement. It is recorded as a finding (R17): it is a membership change outside the ledger. |
| S8 | `user-table-leader-placement-cure.js:480-546` | leadership handoff only (`messageRouter.deliver`, 426-455); no ledger operation | user-table partition leader | quiescent pass (`rebalancer-planning-gate-methods.js:700, 744`) | **Keep, leader-local.** It loses its `UnifiedRebalancer` host (§2.9). |
| S9 (rev. 1, review 9) | CL-017(b) divergence re-insert: `replica-operation-repository-mutation-update-methods.js:448-460` calls `persistNewOperationUnlocked` (C) | re-inserts an existing operation whose row diverged or was lost | the updating workflow owner | an update that finds its row missing | **Bypass of admission.** Delete if WP-F proves its trigger cannot arise under entryId outcome records; else a restore mode of the applier |
| S10 (rev. 1, review 9) | dispatch-gate row repair: `operation-workflow-gate-operation-row-repair.js:34-45` calls `persistNewOperation` with `OPERATION_GATE_REPAIR_INSERT_OPTIONS` (C) | re-inserts the row of a gate-repaired reservation | the dispatching workflow owner | gate repair | **Bypass of admission.** As S9 |

**Who executes the result** (C): ADD and REMOVE take `sourceNodeId` from the creating coordinator's node (`rebalance-coordinator-operation-creation.js:444-447`). An unsettled system or priority REPLACE is owned by its target node (`replica-operation-repository-row-methods.js:267-304`).

**Scale at formation** (C):
- 46 system partitions (`system-table-schemas-constants.js:129-185`), each with r1-r3 on the seed (`:188-197`; `seed-registration-runtime-owner.js:20`). So **46 partition rebalancers start on the seed.**
- `mg-1` (`:383`) has a rebalancer that is **permanently parked**: `messageGroupMembershipChangeRefusal` / `isPlanningParked` (`unified-rebalancer-rebalance-loop.js:413-442`) refuses every message-group membership change "until the fresh-identity ADD/promote path for message groups exists". `mg-1` therefore stays seed-only today, in every run (D4).
- **Nothing identifies a "ledger leader".** No election or code path is dedicated to it. Only the `replica_operations-p1` partition's own rebalancer and `participant-release-authorization-owner.js:40, 135-185` act only there. The self-move hold lives on the *creating* node, not on the ledger leader (C).

### 1.2 Mechanism census and classification

**Verdicts:**
- **KEEP-SAFETY:** a true safety rule; it stays at execution or dispatch.
- **KEEP-EXEC:** an execution-side mechanism of the workflow owner, not placement and out of scope (class D3 debt is recorded, not touched).
- **MOVE:** its semantics become an owner rule.
- **DELETE:** removed with no successor, or with the owner's trigger as the successor.
- **DEAD:** no production caller; deleted under the "remove unused paths" rule (2026-11-11).

**(a) Per-entity placement cadences and timers (all in the per-entity scheduler)**

| file:line | Mechanism | Value | Verdict |
| --- | --- | --- | --- |
| `rebalancer-constants.js:101-103`; `config-definitions.js:137-139`; `unified-rebalancer-lifecycle-base.js:145-153, 248-250` | `PERIODIC_CHECK_INTERVAL_MS`, jitter, `CRITICAL_CHECK_DELAY_MS`, `currentInterval` / `maxInterval` | 60 s ±10 s; 5 s; cap 120 s | **DELETE**. Successor: owner triggers plus one resync. |
| `rebalancer-planning-gate-methods.js:61-99` | `scheduleNextCheck` (`setTimeout`, floor 1 s) | - | **DELETE** |
| `:144-160, 43-58, 184-226, 657-703, 771-781` | ×1.5 / ×1.25 backoffs; `applyQuiescentCheckCadence`; `advanceCheckCadence` (forced priority retry, under-spread reset, F15); `getRetryableFailureRetryDelayMs`; `scheduleNextCheckAfterCadence` | - | **DELETE** |
| `:715-725, 784-788` | min-interval floor via `lastCheckAtMs` (F2 resets it from outside) | 1 s / 5 s | **DELETE** |
| `rebalancer-local-mutation-readiness-wake.js:627-645` | continuation **safety timer**, 3 × 5 s + rand × 5 s (F1) | 15-20 s | **DELETE** |
| `:33-37, 253-257` | `SLOT_WAKE_STAGGER_BASE_MS` / `STEP_MS` 8,000 + 400·n; history 64; recent-op dedupe 16 (F8); `MAX_SLOT_RELEASE_HANDOFF_HOPS` 2 | - | **DELETE** |
| `partition-service-rebalancer-methods.js:14-17, 74-80` | `TRAFFIC_READY_STAGGER_*` 12,000 + 250 × (hash % 39) (F3) | 12.0-21.5 s | **DELETE** |
| `unified-rebalancer-policy-scheduler-methods.js:182-192, 199-204, 214-223, 234-242` | 70 s background priority-spread stable window; release delay 70 s + rand × 10 s; stable-release delay | 70-80 s | **DELETE**. Successor: the formation-fact gate (§2.6). |
| `:250-267`; `lifecycle-base.js:549-552` | leadership start delay (priority or under-spread: rand × 5 s; other: 60-120 s); immediate enqueue for priority | - | **DELETE**. Successor: `LEADERSHIP_START` of the one owner. |
| `:318-356` | `isStabilized`, `recordStateChange`, stabilization timer | 1 s, clamped to [1, 10] s | **DELETE** |
| `:286-311`; `rebalancer-constants.js:118-119` | rebalance start delay and eligibility jitter (inert at 0) | 0 / rand × 10 s | **DELETE** |
| `rebalancer-planning-gate-methods.js:284-333`; `cdc-lifecycle-constants.js:24` | cluster readiness gate, 30 s; `clusterReadinessSignal` never passed (`lifecycle-base.js:295`) | - | **DEAD**, then DELETE |
| `rebalancer-transport-pressure-methods.js:136-176` | transport backpressure gate (5 s, or ×1.5) | - | **DELETE**. Load is governed by the owner's capacity. |
| `unified-rebalancer-rebalance-loop.js:139-149, 211-232` | `MOVE_BATCH_SIZE` 2, `INTER_BATCH_DELAY_MS` 100 ms (ambient `setTimeout`) | - | **DELETE**. The owner admits per candidate. |
| `bootstrap-node-ready-rebalance-owner.js:74-101, 300-357`; `bootstrap-constants.js:132`; `bootstrap-service.js:223-227` | node-ready rebalance trigger, 5 s timer, then `recordStateChange` | 5 s | **DELETE**. Successor: `NODES_OR_FORMATION`. |
| `src/entrypoint-runtime-admin-composition.js:325-345` | `SPLIT_COMPLETED`, then `recordStateChange` on child partitions | - | **MOVE**. Successor: `PARTITIONS_CHANGED`. |
| `src/cdc/cdc-event-handler.js:410-425`; `rebalancer-node-event-methods.js:74-116, 167-201` | `onNodeStateChange` and `isCriticalCDCEvent`: no `setRebalancer` caller (`cdc-integration-service-cdc-event-delegates.js:59`), no `isCriticalCDCEvent` caller | - | **DEAD** (P from grep), then DELETE |
| `src/node/replica-handler-transition-policy.js:26-27` | `VOTER_READY_CHECK_INTERVAL_MS` changed 250 → 50 ms by 4c7b69804 (F21) | 50 ms | **Revert to the pre-series value** as part of the series deletion. Event-driven promotion is a finding for the replica-handler owner (audit sketch item 8). |

**(b) Budgets, slots and limits**

| file:line | Mechanism | Counts from / scope | Verdict |
| --- | --- | --- | --- |
| `unified-rebalancer-rebalance-loop.js:277-307`; `unified-rebalancer-budget-planning.js:111-151` | per-pass `rebalanceBudget` (10, ×2 critical) minus global in-flight; zero-budget bypass grants 1 (265-275) | SQL COUNT through the gateway; **fails open to 0 on a read failure** (132-151) | **DELETE**. Successor: apply-time capacity. |
| `unified-rebalancer-available-nodes.js:88-100`; `priority-recovery-snapshot-workflow.js:70-84` | reserved priority-recovery move slots | per process | **MOVE** (class order and repair reservation) |
| `rebalance-loop.js:80-103`; `rebalancer-constants.js:104` | `moveLimit` = min(5, budget), forced to **1** for under-spread non-priority partitions (F15), plus executor re-sort (`:28-78`) | - | **DELETE** |
| `effective-placement-serial-priority-planner.js:13-35`; `move-planner-state-methods.js:282-285`; `move-planner-move-calculation-methods.js:176-193` | at most one move per entity; exclusive progress while REMOVE / STOPPING is unresolved | entity in-flight operations (cache) | **MOVE / consume.** It becomes the per-partition precedence function and the applier's busy rule. |
| `unified-rebalancer-budget-planning.js:306-354`; `rebalance-loop.js:380-390` | ordinary priority-recovery serial gate (1) | `getConcurrentAddCountByPriorityClass` (OWNER_RPC_REQUIRED) | **DELETE**. Successor: class order and capacity. |
| `rebalance-coordinator-concurrent-add-budget.js:56-97`; `operation-workflow-owner-execution-lane.js:238-243` | `runConcurrentCreateBudgetGate`, serialized admission turn per scope (ADD / PRIORITY_ADD / EMERGENCY / REMOVE) | **per-process lane only** | **DELETE**. Successor: the `PLACEMENT_ADMIT` applier, atomic in log order. |
| `rebalancer-constants.js:90, 94-95`; `rebalance-coordinator-lifecycle.js:209-211`; `rebalance-coordinator-runtime-placement-slot-reservation.js:42-67`; `rebalance-coordinator-priority-budget-helper.js:451-696, 698-` | `maxConcurrentAdds` 5 minus reserves; runtime-placement reserve 1; priority-ADD 5 plus emergency overflow; `MAX_CONCURRENT_REMOVES` 5 | **local cache, or on an empty cache an owner-scoped SQL query** (`replica-operation-repository.js:170-176`, bound `[this.nodeId, this.nodeId]` at `replica-operation-repository-incomplete-read-methods.js:365-369`); per process | **DELETE**. Successor: `K_src`, `K_tgt` and the repair reservation. |
| `rebalance-coordinator-priority-budget-admission.js:78-170, 371-400, 533, 644` | `enforceConcurrentOperationBudget` switch; critical-partition create lane (no temporary 5-voter group); entity add-like lane; no REMOVE overlapping a REPLACE; priority remove lane | cache plus an authoritative entity read | **Lane semantics MOVE into the applier's busy rule** (one unresolved operation per partition, derived from the step owner's predicate, subsumes all of them). `ensureNoConflictingInFlightReplaceForRemove` is **KEEP-SAFETY** in effect (structurally guaranteed by the busy rule; the explicit check stays at dispatch). |
| `system-spread-transition-policy.js:237-319, 432-552`; `rebalance-coordinator-concurrent-budget-gate.js:19-75, 183-207` | **Phase B** per-target system-ADD cap, 1 or 2 (F9). The target-slot admission merges cache ∪ `coordinator.operations` (**never assigned: dead**) ∪ `repository.lastIncompleteOperationObservation` (**owner-scoped**, §1.6) ∪ `recentOperationIntents` (F11) | mixed, per process | **DELETE** |
| `rebalance-coordinator-operation-intent-methods.js:342-352, 531-549`; `rebalance-coordinator-shared.js:189, 215`; `operation-creation.js:228-258` | `recentOperationIntents` (TTL 15 s / 120 s), `criticalAddLikeIntentKey`, `operationsInCreation` | in-memory, per process | **DELETE**. Successor: the busy rule plus entryId outcome records and apply-index operation ids (§2.5). |
| `replica-dispatch-service-constants.js:84`; `replica-dispatch-operation-execution.js:116-152` | `PRIORITY_CONTROL_PLANE_DISPATCH_MAX_IN_FLIGHT` 8 | in-memory, per process | KEEP-EXEC (a dispatch concern; unreachable under `K_src = 2`) |
| `operation-workflow-owner-shared.js:348`; `operation-workflow-coordinator-handoff-retry.js:153` | handoff retries per target, 4 | per process | KEEP-EXEC |
| `storage-admission-service.js:370-446`; `storage-capacity-accounting-service.js:294-325`; `provisioning-admission-policy.js:335`; dispatch reservation gate | storage admission (soft 70 %, hard 85 %) | cache rows | **KEEP-SAFETY** (target capacity). The owner's target filter consumes it, and it is re-checked at dispatch. |

**(c) Fences, holds and interlocks**

| file:line | Mechanism | Census class | Verdict |
| --- | --- | --- | --- |
| `rebalance-coordinator-ledger-interlock-hold-state.js:21-58, 113-385`; `rebalance-coordinator-ledger-interlock-admission.js:173-343, 633`; `operation-workflow-dispatch-ledger-self-move-gate.js:126-310`; `operation-ledger-hold-policy.js:48-54, 220-326, 420-556` | ledger self-move hold (NONE / REGISTERED / ENGAGED), dispatch idle census, engagement table | liveness; per process on the creating node | **MOVE** into apply-time ledger exclusivity (§2.5). The 2026-08 quests' history (engagement, fairness, holder release, a second self-move via a null read) is subsumed: exclusivity is evaluated in log order on committed rows. |
| `operation-ledger-quorum-concentration.js:147-269, 325-371`; interlock-admission `502-546` | QUORUM_SPREAD hold (defers dependents while the ledger quorum is concentrated) | liveness | **MOVE.** The cure is class `LEDGER`, first in order. Dependent deferral is subsumed by exclusivity. The formation-fact consumer "ledger quorum hold" named in the sibling Quest is this hold; its protective meaning is preserved because nothing non-priority is admitted before FORMED. |
| `background-priority-spread-release-tracker.js:149-255`; `rebalancer-priority-recovery-planning-gate-methods.js:225-347` | 70 s background release fence, plus the under-spread **exemption** (`:272`, F14, the pre-gate cause) | liveness / ordering | **DELETE**. Successor: the formation-fact gate. |
| `priority-surplus-remove-placement-fence.js:94-235`; `rebalance-coordinator-topology-guard-methods.js:318-390` | priority surplus REMOVE requires an authoritative services read | **safety** | **KEEP-SAFETY** at dispatch |
| `rebalance-coordinator-topology-guard-methods.js:400-637` | topology guard (one replica per node; READY-lease target, `inventory_unusable`) | safety plus anti-churn | **KEEP-SAFETY** at dispatch. Its over-target anti-churn part becomes **MOVE** (the deficit model never plans over-target). |
| `operation-workflow-dispatch-epoch-gate.js:75-153` | membership-epoch stale-plan fence | safety | KEEP-SAFETY |
| `operation-workflow-dispatch-reservation-gate.js:59-151` | storage reservation at dispatch | capacity safety | KEEP-SAFETY |
| `operation-workflow-remove-safety-*.js`; `operation-workflow-committed-node-floor.js:45-105` | remove-safety tiers (fix A) | safety | **KEEP-SAFETY, unchanged** |
| `operation-creation.js:448-457` | retired-replace-source safety | safety | KEEP-SAFETY |
| `rebalance-coordinator-operation-creation-admission.js:230`; `rebalance-loop.js:255-261` | no placement into a retiring group | safety | KEEP-SAFETY (it becomes a deficit-model exclusion plus the dispatch check) |
| `provisioning-admission-policy.js:229-258` | `assertLocalControlPlaneMutationReady` (local readiness veto) | liveness | **DELETE** for placement (circular: readiness needs placement). Founding creates keep their owner's rule. |
| planning gates `rebalancer-planning-gate-methods.js:608-624` | stabilization, topology settling, traffic readiness (the lifecycle-latch gate of 2026-11-11), local serve (always null), local mutation, priority spread, transport backpressure | liveness | **DELETE** |
| `global-topology-blocking-operation-view.js:12-40` | memoized cache view of blocking operations | planning input | DELETE (only the deleted fence consumes it) |

**(d) Wakes (every external wake of a rebalancer)**

| file:line | Wake | Verdict |
| --- | --- | --- |
| `rebalancer-local-mutation-readiness-wake.js:177-213, 261-341, 382-421, 516-588, 590-625`; `continuation-wake-coordinator.js:27-47, 92-106, 131-308, 330-344` | continuation and slot-release wake. It listens to coordinator `OPERATION_COMPLETED` / `FAILED` **and** to cache `REPLICA_OPERATIONS` (F8, a dual path) and resets `lastCheckAtMs` and `lastStateChangeTime` (F2). It wakes one winner and staggers the rest, with a two-hop baton. Its registries are expandos on the coordinator (F6), and `setMaxListeners(0)` is applied (F7). | **DELETE**. Successor: `LEDGER_COMMIT`. |
| `rebalancer-local-mutation-readiness-wake.js:29-82, 436-514` | local-mutation readiness wake (cache listeners on publications and replica_operations, plus a planning-snapshot subscription) | **DELETE** |
| `partition-service-rebalancer-methods.js:57-84`; `message-group-service-rebalancer-runtime-methods.js:7-19` | traffic-ready rising-edge wake, two diverged copies (F4) with an absent-state fallback (F5, `:28-33`) | **DELETE** |
| `unified-rebalancer-priority-recovery-coordination.js:37-76, 107-127, 196-264` | priority-only progress wakes (coordinator events and the visibility cache listener) | **DELETE**. Successor: `LEDGER_COMMIT` and `SERVICES_CHANGED`. |
| `rebalancer-priority-recovery-planning-gate-methods.js:143-151`; `background-priority-spread-release-tracker.js:66-87, 224-255` | stable-release wake | **DELETE** |
| `rebalancer-node-event-methods.js:60-64`; `lifecycle-base.js:325-329` | per-entity `OwnerKeyReconcileQueue` drain | **DELETE.** The owner has one queue, one key. |
| `runtime-service-rebalancer-setup.js:144-154, 386-412` | runtime-service `_wakeRebalancer` (resets the interval and `lastCheckAtMs`) | out of scope (runtime-service owner); finding |
| ReplicaDispatchService wakes (`replica-dispatch-reconcile-callbacks.js:438-447`, `replica-dispatch-service-lifecycle.js:326-330, 544-579`) | dispatch of created operations | KEEP-EXEC |

**(f) Clearing-event producers owned elsewhere (rev. 1, review 9)**

These decide *when* a placement waiting reason clears. Each becomes a trigger of the owner, or is recorded as another owner's latency.

| file:line | Producer | Clears | Disposition |
| --- | --- | --- | --- |
| `membership-publication-coordinator-reconcile.js:597-621` (C) | 5 s `setInterval` owner-membership driver: derives and publishes the membership and the priority summary | the formation fact (FORMED) | The latch (P4) is written from this publication. The 5 s cadence is the publisher's; a finding goes to its owner (it should derive on committed SERVICES change). The reproducer names it as an external cadence. |
| `replica-operation-step-policy.js:495-512` (C) | deferred-local ACTIVE and STOPPING progress for priority partitions (local state ahead of the durable row) | the copy-phase exit (capacity) | Capacity frees only on the durable step. The lag is measured in WP-A. Removal of the local-ahead arms is a finding for the workflow owner (generator 2, 2026-11-11). |
| `src/node/replica-handler-transition-policy.js:26-27` (C); learner-promotion proof channel | voter-ready poll (50 ms after F21, reverted to the pre-series value) | the copy-phase exit | Execution owner. The event-driven promotion is a finding. |
| `storage-capacity-semantic-projection-owner.js:500-540` (C) | earliest-deadline timer of the storage projection | target eligibility | It becomes the `TARGET_CAPACITY_CHANGED` trigger. A subscription API is P; WP-E adds it at that owner if absent. |
| `serve-eligibility-owner.js:457-475` (C) | earliest READY-lease expiry refresh | node eligibility | already a notification (`NODES_OR_FORMATION`) |
| `partition-write-kernel.js:49-63` (C) | write-path refusals (pause, consensus session, backpressure, CDC capacity) | admission proposals | The §2.7 table maps each to a trigger. The pause-release and session-close events are P and are added at their owners in WP-E if absent. |
| `pressure-governor.js:397-401, 471-484` (C) | PressureGovernor decision with `retryAfterMs` only | governed reads, if any are on the owner's path (P) | A state-change subscription is added at the governor (WP-E). `retryAfterMs` is never used as a timer. |

**(e) Execution-side timers (KEEP-EXEC, listed for completeness; not placement)**
- step timeouts PENDING / CREATING / SYNCING / REMOVING 30 / 60 / 300 / 60 s (`rebalancer-constants.js:83-89`, `replica-operation-liveness.js:71-89`);
- the 1 s coordinator `TIMEOUT_CHECK_INTERVAL_MS` (`rebalance-coordinator-lifecycle.js:229-230, 676-700`);
- reservation reconcile 30 s (F29, `operation-workflow-recovery-timeout.js:59, 352-373`);
- dispatch, observed-progress, transition and executor-outcome retries of 250 ms to 30 s (`operation-workflow-owner-shared.js:341-353`, `operation-workflow-dispatch-rearm-evidence.js:410-490, 649-699`, `operation-workflow-executor-outcome-reconcile-methods.js:440-498`);
- persist and read retry loops (`replica-operation-repository.js:230-257`);
- owner lease 30 s;
- REPLACE escalation 60 / 300 s;
- STOPPING starvation (40 deferrals and 10 s);
- `SYNC_TIMEOUT_MS` 60 s (`replica-handler-constants.js:20-30`).

These are class D3 (liveness by elapsed time) at the execution owner. They are recorded and routed (R17); this Quest does not change them, and the reproducer steps them by name as the sibling's does.

### 1.3 The wake/stagger/Phase-B series, commit by commit (C)

| Commit (2026-11-16/17) | Placement mechanisms added | Non-placement hunks |
| --- | --- | --- |
| `f0dfc1a2b` 23:26 | traffic-ready rising-edge wake (partition and MG copies, F4); continuation wake (F1, first form); 70 s fence exemption for under-spread partitions (`isPartitionBelowDeclaredDistinctHostSpread`, F14); `lastCheckAtMs` / `lastStateChangeTime` resets (F2); dual subscription (F8) | `bootstrap-readiness-lifecycle-source.js` (338 lines): the lifecycle derives its dependencies from their owners, so the 2026-11-11 stale latch is gone. **Keep** (independent property, LCS tests). |
| `17194cf83` 01:13 | cold-start traffic-ready wake; concurrent distinct-host spread in the planner; armed continuation wake; below-spread cadence (F15) | ratchet tightening |
| `4f7fc3691` 02:01 | "Phase A serial goal-state" planner edits; leadership-delay exemption (later removed) | CDC readiness timeout made retryable (`cdc-pipeline-readiness-gate.js:49-67`): **finding** for the join/CDC owner, not removed here; harness logTail: keep |
| `4c7b69804` 03:08 | "Restore per-joiner system-add gating": slot-wake stagger, traffic-ready buckets 39 × 250 ms (F3), `isPartitionTrafficReady` fallback (F5), the `_slotWakeDispatchState` expando (F6), learner-promotion wake (removed later), `VOTER_READY_CHECK_INTERVAL_MS` 250 → 50 (F21) | - |
| `540418614` 05:10 | **Phase B** two-slot cap (F9) in the new `system-spread-transition-policy.js` (F10 host-count union, F31 three counters); `continuation-wake-coordinator.js` (depth-first ranking, baton, `_armedContinuationWakeRebalancers`); `setMaxListeners(0)` (F7); stagger widened 1,000 + 120·n → 8,000 + 400·n | harness `spreadSummary` diagnostic: keep |
| `de9fe14e8` 07:26 | "atomic" target-slot admission over four sources (F11) duplicated in the planner (F12); readiness reconcile twice (F13) | the monotonic visibility predicate, split by fix A into CAS and applied-write visibility: **keep as amended** |
| `380fc5f8b` 11:05 | Phase B slot saturation, `finally` re-arm (F16), check-floor scoping; complexity baselines moved | refactor-only parts: classify individually |

Flip-flops inside the series (audit, C): the global system-target occupancy gate was bypassed, then exempted, then restored, then doubled. The leadership-delay exemption was added and removed. The learner-promotion wake was added and removed. The check-floor reset rule changed four times. The stagger was widened within hours.

### 1.4 Tests that pin the series, and their disposition (C, test census)

| File (subtest lines) | Pins | Disposition |
| --- | --- | --- |
| `test/rebalancer/rebalancer-distinct-spread-and-continuation-wake.test.js` (1,491 lines): subtests 223-313, 315-443, 445-623, 625-769, 771-915, 917-1042, 1044-1220, 1222-1357 (the 8,000 ms stagger at **1316-1320**) | the mechanism | **Delete.** Surviving properties are restated against the owner: a deficit is admitted on the change that creates it; background never delays priority; a terminal commit admits the next move in the same step; one freed unit gives exactly one admission and redelivery adds none; `nodes-p1` goes first; capacity is held until terminal (including the drain step) for the lane, and until voter-ready for copy capacity; no idle capacity while a deficit exists. |
| same file, 1359-1491 | 1438-1447 and 1477-1486: mechanism. **1454-1471: readiness currency** (placement eligibility reads current readiness; a stale answer fails closed). | Delete the mechanism lines; **restate 1454-1471** against the `ServeEligibilityOwner` input. |
| `test/partition/partition-service-traffic-ready-rebalancer-wake.test.js` (152-587) | the mechanism | Delete. **Keep the property at 310-375** (non-leaders never plan): the owner is inactive off the ledger leader. |
| `test/rebalancer/rebalance-coordinator-create-budget-intent-serialization.test.js`: 81-180 (pre-series), 182-507 (de9fe14e8), 509-610 (0dd58de16) | 81-180: lane serialization, keep its property. 182-610: the Phase B gate and wake. | Restate "no over-admission under concurrent creates", "capacity counted from the authoritative ledger" and "create is idempotent" against the `PLACEMENT_ADMIT` applier and the entryId outcome record (WP-E). Delete the gate assertions. |
| `test/rebalancer/target-slot-authority-fixture.js` | uses `lastIncompleteOperationObservation` (101) and `recentOperationIntents` (108, 193); **one `SOURCE_NODE_ID` for both coordinators (`:22, 144, 176`)**, so it never exercises another coordinator's hidden occupancy (§1.6) | Delete. It is superseded by witness W-T (§4.2). |
| `test/rebalancer/replica-operation-confirmation-authority-read.test.js` 579-662 | applied-write visibility (fix A) | Keep |
| `test/bootstrap/owners/bootstrap-readiness-lifecycle-source.test.js` | the lifecycle follows recovery health | Keep |
| `test/rebalancer/user-table-leader-placement-cure.test.js:205` | a stub of the series API | Delete the line |
| Pre-series pins of the 70 s fence: `unified-rebalancer-planning-gate-decisions-test-cases.js:548-747` (683-737 pin the window), with cases 445, 749, 940 and 1103; `blocked-spread-release-event-wake.test.js:123, 283` (window and fallback), `458, 510, 551` (local-mutation wake) | the mechanism; the priority-order property survives (1103) | Delete the window tests; restate "non-priority waits while priority spread is pending" against the formation gate |
| `test/rebalancer/topology-owner-contracts.test.js:77, 101`; `move-planner-placement-owner-kernel.test.js:275` (`nodesWithGlobalSystemAddTransitional`) | the Phase B contract | Delete or retarget to the owner's capacity |
| Impact contracts: `test/shards/impact-contracts.json` `phase-b-system-spread-policy-admission` (2169-2192) and `readiness-lifecycle-traffic-ready-rebalancer-wake` (2193-2212); `coupledPairs` 4714-4747 and 4748-4779 | - | Delete (the first); retarget the second to the lifecycle source only. Dead edges fail closed (IC:4). |
| Ratchets and inventories: `scripts/check-guideline-literals-baseline.json:39553-39742` (22 entries, budget gate); `…owner_port_feature_detection.json:13435, 15361-15382, 16135`; `…identity_keyed_module_state.json:610`; `…inheritance_depth_over_two.json:493`; `solve/changes/priority-recovery-owner-inventory/inventory.json:5158-5179`; `solve/changes/global-owner-debt-inventory/inventory.json` | - | Removal only; never raised |

**Wider coupling** (C): 126 test files import `unified-rebalancer*`, 122 import `rebalance-coordinator*`, 73 use `createTestRebalancer`, and 82 use `createTestCoordinator` (2,665 test files in total). WP-G gives each one a verdict.

### 1.5 What fixes A and B change, and how the owner consumes them (C, `git show`)

**Fix A** (`f50344e98`: one fail-closed REMOVE voter floor; applied-write visibility split from CAS visibility):
- **The floor.** `projectQuorumAfterRemoval` loses `COMPLETION_SAFE_FLOOR` and the optimistic `effectiveProjectedVoterReadyCount`. Every removal, a REMOVE or a REPLACE source alike, requires the voter-ready rows on READY-lease nodes after the removal to be ≥ `minReplicaCount`. The completion-safe path may still hand off the source leader first, but the removal waits for the floor (`operation-workflow-remove-safety-evaluator.js`). `isNodeReadyInCommittedFloor`, which treated absent as ready (F24, fail open), is deleted from `operation-workflow-remove-safety-membership.js`.
- **Visibility.** `isReplicaOperationVisibilitySatisfied` (exact) is separated from `isAppliedReplicaOperationWriteVisible` (exact or monotonically progressed) in `replica-operation-repository-mutation-persistence-methods.js`, with confirmed observations recorded as observed.
- **How the owner consumes it:** the floor is the owner's `remove-safety-unchanged` constraint, and `projectQuorumAfterRemoval` is the pure predicate it calls at planning time.

**Fix B** (`ff4318b24`: the durable dispatch hold is the only dispatch authority):
- **Dispatch authority.** It removes `shouldEmitOperationCreated` as dispatch authority (`rebalance-coordinator-operation-intent-methods.js`, `-operation-creation.js`, `-operation-persistence-collision.js`).
- **Genesis creates.** It names founding creates by the GENESIS stamp kind (`isGenesisFoundingCreateOperation`, `replica-operation-constants.js`).
- **Participant granularity.** It makes participant granularity factory-owned (bootstrap).
- **Phase B reads.** It reads Phase B inputs only for eligible entities.
- **How the owner consumes it:** the owner relies on "the durable row decides dispatch", and the founding-create predicate distinguishes S5 from placement. The Phase B hunk is deleted with Phase B.

### 1.6 The cross-coordinator target-occupancy failure (external review 2026-11-17, verified C)

The Phase B rule allows two normal system-partition operations per target. Its admission (`rebalance-coordinator-concurrent-budget-gate.js:19-75`) counts target occupancy from four sources:
- the local cache;
- `coordinator.operations` (never assigned, so dead);
- `recentOperationIntents` (local);
- `repository.lastIncompleteOperationObservation`.

The fourth is recorded from the cache (`replica-operation-repository-incomplete-read-methods.js:358`), or from `SQL.SELECT_INCOMPLETE_OPERATIONS` (`replica-operation-repository.js:170-176`: `WHERE (source_node_id = ? OR target_node_id = ?)`), executed with **`[this.nodeId, this.nodeId]`** (`replica-operation-repository-incomplete-read-methods.js:365-369`, recorded at `:493`). It is the *calling coordinator's* view, not a census of the target.

**Failure schedule:**
1. Coordinator A owns two live system ADDs targeting B, and their durable rows have not reached coordinator C's cache.
2. C leads another system partition and plans an ADD to B.
3. C's authoritative read excludes A → B (neither endpoint is C), and its local maps lack them.
4. C admits a third operation onto B.

No concurrent request and no failed read are needed. Even with a correct cluster-wide SELECT, the admission mutex is per coordinator (`runConcurrentCreateBudgetGate`, a per-process lane), so check-then-insert still races across coordinators.

**The converse is also present:** a stale cached PENDING row delays admission after the authoritative row is terminal, until the terminal publication arrives.

**Test double bug (C):** `test/rebalancer/test-helpers.js:1150-1168`, inside `createTestCoordinator` (`:872`), applies every matched `= ?` equality filter in sequence. It therefore evaluates `(source_node_id = ? OR target_node_id = ?)` as **AND**. 82 test files use `createTestCoordinator`. The existing fixture `target-slot-authority-fixture.js` binds both coordinators to one `SOURCE_NODE_ID`.

**In this design:** target-wide and source-wide occupancy have **one canonical owner**, the `PLACEMENT_ADMIT` applier in `replica_operations-p1` (rev. 1; rev. 0 said a conditional INSERT, withdrawn in §2.5). Occupancy is counted over **all** committed rows at the entry's log position: no owner-scoped read, no per-process mutex, no cache. Witness W-T (§4.2) pins this, and WP-K repairs the double.

### 1.7 Measured behaviour on the pre-gate (rev. 1, corrected; C)

Source: `analysis-replica-operations-inflight.txt`, re-measured with the reviewer's `scratchpad/placement-vet/drain.py`.

**Priority phase.**
- The first operation was at 17:24:22. The phase ran as ADD and co-located REMOVE pairs plus the ledger REPLACE.
- One ledger REPLACE FAILED on a stale publication epoch at 17:24:22 and was re-created with the same source and target 15 s later. That is the pattern that would collide with a deterministic operation id (§2.5).
- One co-located REMOVE FAILED with "Unknown error".
- The ledger was quiet for 6 s at 17:27:59-17:28:05, during the serve-lane flaps.

**Background wave.** It started at 17:28:05, and every copy came from seed `f964`.

| Window | Completions | Wall time per copy | Copy-phase concurrency |
| --- | --- | --- | --- |
| 17:27:56-17:31:16 | 9 | 22.2 s | mostly 2. It contains a 52 s interval (17:30:21-17:31:13) with no ledger transition observed, the unacknowledged seed sends of mechanism C. |
| 17:31:16-17:32:53 | 13 | 7.5 s | mostly 3-4 |

**Rev. 0 had these labels inverted.** It read operation lifetimes instead of completions.

**End of run (17:32:53).** 22 background REPLACEs had completed. At that moment:
- 2 were removing/STOPPING, 2 active and 1 syncing;
- `service_endpoints-p1` was FAILED with `replace_target_dead_before_intent`, and its cleanup REMOVE was stuck in STOPPING;
- two founding `ADD tbl-5aa…-p1` rows were unresolved together at 17:31:58.

The ledger never went quiet again.

---

## 2. The design

### 2.1 The fact, the owner, and what stays where

| Fact / responsibility | Owner after this Quest | Today |
| --- | --- | --- |
| Which membership-changing operation (ADD / REMOVE / REPLACE) on an existing partition is admitted, and when; **target-wide and source-wide occupancy** | **`ReplicaPlacementOwner` (new), on the `replica_operations-p1` leader**, with occupancy decided by the `PLACEMENT_ADMIT` applier at Raft apply (§2.5) | 46 per-partition `UnifiedRebalancer`s plus priority-recovery planners, surrogate follow-ups, failed-create cleanup and ledger-quorum cure (§1.1), behind per-process budget lanes with owner-scoped reads (§1.6) |
| Message-group membership change | unchanged: refused by design (`unified-rebalancer-rebalance-loop.js:413-442`) until the fresh-identity message-group ADD path exists (D4) | same |
| Per-partition next move, one at a time (precedence FAILED REMOVE > TRUE DEFICIT ADD > SPREAD ADD > SAFE SURPLUS REMOVE > COUNT-NEUTRAL REPLACE) | `effective-placement-serial-priority-planner.js:19-25` (C), consumed for every partition class instead of priority-only | priority partitions only |
| Target choice (filter, score, data affinity, latency group) | `placement-owner-decision.js` (C, existing target scorer), extended with the declared host dimension (§2.10) | same, called from MovePlanner |
| Declared RF | `resolveDesiredReplicationFactor` (`bootstrap/replication-target-authority.js`, C) | same |
| Node eligibility (READY lease) and the formation fact | `ServeEligibilityOwner` committed record: `answerCommittedNodes()` (`serve-eligibility-owner.js:694-709`, C) and the committed `cluster_membership` publication with `priorityPartitionSummary` (`serve-eligibility-record-decision.js:122-130`, C) | about six re-derivations (F10, F31, `unified-rebalancer-priority-readiness.js:470-500` with snake/camel alias reads) |
| REMOVE safety floor | `evaluateRemoveSafety` at fix A (`f50344e98`): voter-ready rows on READY-lease nodes ≥ `minReplicaCount` for every removal, fail closed (C) | same after fix A |
| Execution of an admitted operation (claim, dispatch, CREATE / sync / promote / handoff / remove, terminal write, owner lease and successor adoption) | `OperationWorkflowOwner` plus `ReplicaDispatchService`, unchanged | same |
| Founding creates of new groups (CREATE TABLE founders, genesis stamp) | the schema-provisioning owner decides *when*. The `FOUND` transition (one `PLACEMENT_ADMIT` admitting the whole founding set, exempt from copy capacity) is the admission form. Its identity and system-partition founding belong to the founding-membership Quest (§2.5, P5). | one ADD per founder in a loop (`sql-query-engine-initial-partition-provisioning.js:390-420`) |
| Formation fact | the **formation latch** (`formation-latch-design.md`): membership publication's `cluster_formation` record, DECLARED → FORMED once; read through `ServeEligibilityOwner.answerFormation()`, which placement consumes as `answerCommittedNodes().formation` (P4; rev. 3). Consumed, never recomputed (§2.6). | a live, eligibility-dependent summary |
| Leadership placement (user-table leader spread) | stays leader-local per partition (`user-table-leader-placement-cure.js`). It moves leadership, not membership. | same |

The owner never executes and never decides a floor. Its whole decision is: given committed inputs at known positions, which deficits are admitted now, in what order, within capacity.

### 2.2 Where it runs, leadership, fencing and churn (rev. 1)

**Placement.** The owner runs on the node whose `replica_operations-p1` replica is the Raft leader. Every admission is a typed committed command to that group (§2.5), and every workflow transition of every operation is a committed entry in that group. The leader therefore observes every relevant ledger change by applying it locally (C: `PartitionService` emits `ENTRY_COMMITTED` per applied entry, `partition-service-entry-apply-base.js:725-729`). The typed CDC acknowledgement command emits it too (`partition-cdc-obligation.js:350-351`).

**Activation.** The owner reuses the cluster-singleton pattern of a leadership sink bound to one system partition (`setRebalancerLeadershipSink`, `partition-service-leader-activation-methods.js:54-75`, C). The RUNTIME_SERVICE rebalancer binds to `service_definitions-p1` this way. Differences:
- The predicate is Raft leadership of `replica_operations-p1` for the current term, after the existing leader-owned activation. It is deliberately **not** `isBackgroundWorkReady()` or the lifecycle phase (`partition-service-core-base.js:459-464`); gating placement on readiness would be circular.
- **Version fence (rev. 3; replaces the rev. 1/2 capability fence).** This release boundary is fenced by the **support-envelope owner** (`src/bootstrap/owners/support-envelope-owner.js`), as founding's D7 decides for the same boundary:
  - the certified version pair excludes pre-change sources;
  - join admission refuses a mixed-version peer with `OUTSIDE_SUPPORT_ENVELOPE` (`resolveJoinSupportEnvelopeConflict`, used by `bootstrap-join-admission-owner.js:38, 266`, C);
  - the rolling-upgrade owner refuses the pair through `validateVersionPairAdmission`.

  No cluster therefore holds old-code and new-code replicas of `replica_operations-p1` (or of `nodes-p1`, §5 WP-D) across this boundary. Every replica's applier knows `PLACEMENT_ADMIT`, and every replica's table declares `copy_source_node_id`.
  - **Why the capability fence is retired.** It is a second, placement-local version-compatibility authority that can never fire inside the envelope: an R01 duplicate and, under the owner's "remove unused paths" rule, dead logic. The `placement-admit-v1` token, the target-capability clause, `LEDGER_REPLICAS_NOT_CAPABLE` and D6 go with it.
  - **What still holds from rev. 2's correction:** an old replica that did receive the command would refuse it `COMMITTED_COMMAND_UNRECOGNISED` (`partition-service-entry-apply-base.js:94-102`, C) and wedge. The envelope is what prevents that.
  - **A future release boundary** across which the owner wants in-place rolling upgrade must bring its compatibility rule through the support-envelope owner, never as a placement-local capability flag.
- (rev. 2, R1; reason updated in rev. 3) **No schema step at activation.** `copy_source_node_id` is declared in `REPLICA_OPERATIONS_SCHEMA` and created by the node-local ensure (§2.5). The version fence guarantees every ledger replica runs the version that declares it. The rev. 1 replicated `MIGRATION_ALTER_TABLE` is withdrawn.

On activation: subscribe to every trigger (subscribe before read: class F), then enqueue one `LEADERSHIP_START` pass. On step-down, term change or shutdown: discard queue, memo and subscriptions.

**Fencing.** Safety does not rest on "one owner running". `PLACEMENT_ADMIT` is applied by a deterministic JS applier inside the apply transaction on every replica, in log order (§2.5). The pattern already exists for `COORDINATOR_SETTLEMENT_TYPE`: the request is `partition-coordinator-settlement.js:47-70` and the applier dispatch `partition-service-entry-apply-base.js:651-660` (C).
- A deposed leader's proposal is refused (`partition_write_not_leader`), never commits, or commits and is judged by the same applier as any other entry.
- raft-rs exports no ReadIndex (C: header of `serve-eligibility-owner.js:11-14`). So the owner's pre-proposal read of its local rows only chooses candidates; the applier decides.

**Churn without lost edges.** The owner keeps no edge state, and a new owner's first pass recomputes everything from durable rows:
- Proposals in flight at the change are either committed, with a recorded outcome under their entryId, or lost and re-derived.
- Admitted operations keep executing under their workflow owner's lease (`replica-operation-owner-lease.js`, TTL 30 s, adoption by a successor, C).
- If the first pass read a not-fully-applied state, later applies fire `ENTRY_COMMITTED` and trigger another pass.

**The ledger leader can leave the seed during formation (rev. 1, review 13).** The REPLACE source rule (never the leader replica while a co-located non-leader exists) keeps the owner's *own* moves from transferring ledger leadership. It does **not** prevent an election. Seed event-loop stalls of up to 2.1 s (pre-gate) against a Raft election timeout of about 1 s can depose the seed. The 2026-11-11 analysis saw the ledger leader leave the seed in 9 of 9 runs. My first revision claimed the owner "stays on the seed for the whole formation"; that was an overclaim.

Churn is correct by the argument above, and witness V1 covers it. Its frequency and cost (each churn costs a full re-read pass and moves admission to a joiner) are measured in WP-A and carried as risk R10.

### 2.3 Triggers, the pass, and the only cadence (rev. 1)

One `OwnerKeyReconcileQueue` (`src/workflow/owner-key-reconcile-queue.js`, C) runs passes under a single key, `placement`. It merges reasons; N triggers during a pass give exactly one follow-up pass.

| Trigger | Source | Notes |
| --- | --- | --- |
| `LEDGER_COMMIT` | local `ENTRY_COMMITTED` of `replica_operations-p1`: every placement outcome (admitted or refused), step change, terminal, CDC acknowledgement, hold release | committed, local |
| `NODES_OR_FORMATION` | `ServeEligibilityOwner.subscribe` (`serve-eligibility-owner.js:712-715`, C). It covers READY leases, including lease lapse on that owner's own expiry timer (`:457-475`), `host_id`, and every change of the formation answer (rev. 3: `answerFormation()`, §2.6). | committed |
| `SERVICES_CHANGED`, `PARTITIONS_CHANGED` | system-table cache apply-change notifications (`system-table-cache-observation-methods.js:388`, C) | trigger only (R05, R10) |
| `TARGET_CAPACITY_CHANGED` (rev. 1; **does not exist yet**, rev. 2 R8) | the storage-capacity projection owner's change notification. Its deadlines are that owner's timers (`storage-capacity-semantic-projection-owner.js:500-540`, C). It is created in WP-E at that owner. | projection owner |
| `WRITE_PATH_RELEASED` (rev. 1; **does not exist yet**, rev. 2 R8) | the ledger partition's participant cutover-pause release (`partition-participant-transaction-pause.js`) and the write kernel's consensus-session close (`partition-write-kernel.js`), for the refusals `CUTOVER_PAUSED` and `CONSENSUS_SESSION_OPEN` (`partition-write-kernel.js:49-63`, C). Both are created in WP-E at those owners. | owner events |
| `PRESSURE_RELEASED` (rev. 1; **does not exist yet**, rev. 2 R8) | PressureGovernor state change, for any owner input read the governor gates (P). Today `pressure-governor.js` offers only `retryAfterMs` (C, `:397-401, 471-484`), which must **not** be used as a timer. It is created in WP-E at the governor. | owner event |
| `LEADERSHIP_START` | activation | - |
| `RESYNC` | one timer, `PLACEMENT_RESYNC_INTERVAL_MS`, declared once (recommended 10 min) | safety net under D5 (decided 2026-11-18) |

**Clearing events produced by other owners' timers (rev. 1, review 9).** These reach the placement owner only through their committed effect. The latency they add is recorded and routed to their owners, not absorbed:
- the **formation publication** is derived by a 5 s `setInterval` membership driver (`membership-publication-coordinator-reconcile.js:597-621`, C);
- **copy-phase exit** depends on target-side learner promotion (a 50 ms poll, F21, reverted to its pre-series value) and, for priority partitions, on **deferred-local** ACTIVE / STOPPING progress that lets local state run ahead of the durable row (`replica-operation-step-policy.js:495-512`, C; generator 2 of 2026-11-11). Capacity is freed only when the durable step leaves the copy phase. That is conservative and correct, but it lags.

The reproducer names these as external cadences (A2), and WP-A measures the lag.

**RESYNC attribution (rev. 1, review 7/14).** Every waiting candidate records `(reason, clearingTrigger, sincePass)`, and every pass carries the set of reasons merged into it. An admission is attributed:
- to the candidate's `clearingTrigger`, if that trigger is in the merged set;
- for a newly appearing deficit, to the trigger of the input whose position advanced and created it;
- otherwise to `RESYNC`. It is then counted in `placementResyncAdmissions` and logged as a **lost-edge finding** naming the clearing trigger that never fired.

So merging `RESYNC` with other reasons neither hides a lost edge nor miscounts a real one.

**(rev. 2, R8) The widening is recorded.** The three triggers marked "does not exist yet" require edits in four other owners:
- the storage-capacity projection owner;
- the participant-pause owner;
- the write kernel (consensus session);
- the PressureGovernor.

This is an explicit scope widening (R16), named in the Quest constraint `every-refusal-has-a-clearing-trigger` and owned by WP-E. **All three must exist before WP-F.** Otherwise the waiting reasons they clear could only exit through RESYNC, which D5 forbids relying on.

**D5 ruling: DECIDED by the owner 2026-11-18 (rev. 3).** A RESYNC pass may admit, like an informer resync, **only if all of these hold:**
1. Every refusal's clearing trigger exists in code before WP-F. A WP-G static check verifies that each waiting reason's trigger has a live subscription, and that no waiting reason names `RESYNC` or `retryAfterMs` as its clearing event.
2. RESYNC runs the identical pass through the same decision algorithm. Its interval is one declared constant and is **never tuned in response to findings**.
3. Any production RESYNC admission raises a typed **lost-edge alarm** naming the clearing trigger that did not fire. It is fixed at that trigger's owner, never by changing the interval.
4. Zero RESYNC admissions is evidenced in the WP-J physical runs. The deterministic reproducer runs with RESYNC disabled, and the negative control N1 (the ledger-commit trigger disconnected) stays red.

This is what separates it from d75b01706's "fixed-cadence fallback timers remain as the safety net": that safety net was relied on.

**Pass algorithm (rev. 1; review 16, the memo was circular):**
1. **Read what changed.** Re-read each input whose trigger is in the merged set:
   - `LEDGER_COMMIT`: the local ledger;
   - `NODES_OR_FORMATION`: the committed node answer;
   - `SERVICES_CHANGED` or `PARTITIONS_CHANGED`: an authoritative read of that table;
   - `TARGET_CAPACITY_CHANGED`: the storage projection;
   - `RESYNC` and `LEADERSHIP_START`: all of them.

   Every other input reuses its previous read and that read's position. *Whether to read is decided by triggers, never by a position one has not read yet.*
2. **No-progress rule.** After reading, if every input position equals the previous completed pass's and no waiting candidate's clearing trigger is in the merged set, the pass ends after a diagnostic update.
3. **Effective placement.** Compute it for every partition, using the precedence function (at most one candidate per partition).
4. **Order** the candidates (§2.6).
5. **Walk.** For each candidate, propose `PLACEMENT_ADMIT` or record a typed waiting reason. One pass may propose several candidates. Each proposal's outcome returns as a committed entry, so its `LEDGER_COMMIT` drives the next pass.
6. **Publish the snapshot** (explicit function): positions, occupancy per source and target, admitted ids, and each waiting candidate with reason and clearing trigger. It also lists **`mg-1` with `UNSUPPORTED_ENTITY_KIND`** (D4).

### 2.4 Inputs and their freshness contract (rev. 1)

| Input | Read form | Position | Trigger | Unavailable |
| --- | --- | --- | --- | --- |
| `REPLICA_OPERATIONS` | local committed SQLite of the ledger leader | applied index `L` | `LEDGER_COMMIT` | cannot happen while leader |
| NODES (status, READY lease, `host_id`) | `ServeEligibilityOwner.answerCommittedNodes()`, a committed leader-required read with the cache as trigger only (C). (rev. 3) It returns `{nodeRows, formation}` from one read position. | epoch plus record signature | `NODES_OR_FORMATION` | `UNAVAILABLE`: no admissions, typed `NODE_AUTHORITY_UNAVAILABLE`, cleared by that owner's next notification |
| Formation fact, **the formation latch** (§2.6, rev. 3) | `answerCommittedNodes().formation`, i.e. `ServeEligibilityOwner.answerFormation()` decoding the committed `cluster_formation` row in the same committed read as nodes and publications (latch design §3.4, §6.2) | the same read position; `latchEpoch` when FORMED | `NODES_OR_FORMATION` (that owner's `subscribe` fires on every formation change) | `FORMING{…}`, `UNDECLARED{…}` or `UNAVAILABLE{…}`: only classes 1-2 admissible |
| SERVICES | `readAuthoritativeControlPlaneRows` (`control-plane-system-table-gateway.js:191-219`, C), with `readAuthorityWitness {term, appliedIndex}` (`control-plane-system-table-gateway-read-strategies.js:107-115`, C) | `S` | `SERVICES_CHANGED` | typed `SERVICES_READ_UNAVAILABLE`; cleared by the read path's own recovery event: `PRESSURE_RELEASED` if governed, otherwise the next SERVICES trigger |
| PARTITIONS | the same | `P` | `PARTITIONS_CHANGED` | the same |
| Target storage capacity | storage-capacity projection owner (KEEP-SAFETY, §1.2) | projection version | `TARGET_CAPACITY_CHANGED` | the target is excluded with typed `TARGET_STORAGE_UNKNOWN` |

**How this removes D2.** The owner never decides from a cache row. The four-source merge (F11), the owner-scoped SQL (§1.6), the three-alias reads (F13) and the host-count union (F10) have no successor. Positions memoize *planning*, not *reading* (pass step 2).

**The residual window (P).** As in rev. 0: a stale leader-local SERVICES read after a services-p1 leader change costs liveness only. A move that is already done or impossible is refused at dispatch by the KEEP-SAFETY guards with a typed outcome, and re-planned. No admission conjunct depends on SERVICES for safety.

### 2.5 Admission: one typed committed command, applied deterministically (rev. 1, amended rev. 2; replaces the conditional INSERT)

**Why the conditional INSERT of rev. 0 is withdrawn.** I re-ran the reviewer's `scratchpad/placement-vet/probe1.mjs` against the candidate worktree (C):
- **Only the leader-local leg runs it.** `runCommittedPartitionStatement` gives `changes` 1, 1, 0, 0 for admit, admit, target-full and lane-busy.
  - Routed system writes go through `SQLQueryEngine` / `SQLParser`, which refuses INSERT…SELECT (`sql-parser.js:523-530`, `INSERT_SELECT_UNSUPPORTED`; the probe prints the refusal).
  - The local leg falls through to that engine on reroutable failures (`cdc-routed-mutation-readiness.js:211-217, 249-256`).
  - The gateway builds only INSERT…VALUES (`cdc-integration-service-mutation-operations.js:240-245`).
  - So founding creates (S5), runtime services (S6) and W-T's node C would have hit a parser refusal: a false green.
- **CDC gets no row image.** `extractParamInsertData` maps parameters 1:1 to columns and returns `{}` for this statement (`partition-cdc-parameterized-sql.js:31-60`; the probe logs "Column/param count mismatch … columns 6, params 10"). Every receiver's `applySystemTableChange` then throws `primaryKeyMissing` (`system-table-cache.js:288-290`).
- **A deterministic `operation_id` collides with retained terminal rows.** The probe's op5 gives `SQLITE_CONSTRAINT_PRIMARYKEY`. The pre-gate re-created `REPLACE replica_operations-p1 f964->b03e` 15 s after its FAILED twin (17:24:22, 17:24:37). The result would be `STATEMENT_FAILED`, no `ENTRY_COMMITTED`, and the ledger never spreads.

**The command: `PLACEMENT_ADMIT`.** It is a new committed command type beside `COORDINATOR_SETTLEMENT_TYPE` and the CDC command types in the apply dispatch (`partition-service-entry-apply-base.js:651-660`).

**Request** `requestPlacementAdmission(service, payload)`, on the `replica_operations-p1` `PartitionService`. It mirrors `requestCoordinatorSettlement` (`partition-coordinator-settlement.js:47-70`, C):
1. a table check;
2. the command build;
3. `partitionWriteLeadershipRefusalOf`;
4. `admitCommittedCommand`;
5. settled-outcome replay by entryId;
6. **(rev. 2, R3) CDC owed admission, counting the command's rows.** Today `requiredCdcSlots` returns 0 for every non-SQL command except PREPARE (`partition-cdc-owed-admission.js:39-50`, C). The reviewer's probe2 shows that at 4,096 owed events a SQL INSERT is refused while a typed command is admitted. `PLACEMENT_ADMIT` therefore declares its slot count: the rows it would insert (N founders for FOUND, 1 otherwise; 1 for `PLACEMENT_RELEASE_HOLD`). Over the bound, the typed outcome is `CDC_CAPACITY`, cleared by the CDC acknowledgement commit, which emits `ENTRY_COMMITTED` (`LEDGER_COMMIT`). The same count is re-checked at apply (applier step 3);
7. `startPartitionRaftWriteCommit`.

The placement owner calls it locally. A remote proposer (S5, S6, or node C in W-T) reaches it through a new partition-service message type routed to the leader, exactly as `COORDINATOR_SETTLEMENT_TYPE` is (`partition-service-entry-apply-base.js:425-426`). **(rev. 2, R10)** That message type is added to `isRemovalServingRequestType` (`partition-service-entry-apply-base.js:388-399`, C), so it is fenced during removal like settlement. It never goes through `SQLQueryEngine` or the CDC routed-mutation path, so the PressureGovernor gate on routed system writes is not on the admission path.

**Payload:**
- `transitionKind` (`PLACEMENT` | `FOUND` | `RUNTIME_SERVICE`);
- the entity;
- the move and target(s);
- the source replica, for REPLACE or REMOVE;
- `copySourceNodeId` (null for FOUND);
- the class and the repair flag;
- `kSrc`, `kTgt`;
- `dispatchHold` (LEDGER only);
- for FOUND, the `foundingIntentId` (§2.13);
- the planned input positions.

K travels in the command, so every replica evaluates the same numbers.

**The entryId rule (rev. 2, R4).** A settled key replays its recorded answer for ever. So:
- the **entryId identifies one proposal attempt**;
- re-proposing **the same attempt** after an unknown outcome reuses its entryId;
- **after any definite outcome** (ADMITTED or REFUSED), every new attempt uses a **fresh** entryId.

A pass that re-plans a candidate refused earlier therefore proposes a fresh attempt. It is never answered by the old refusal.

**Applier `applyPlacementAdmission(service, committed)`**, deterministic, inside the apply transaction, on every replica. The order of its steps is the one `applyCoordinatorSettlement` uses (`partition-coordinator-settlement.js:72-89`, C):
0. **(rev. 2, R2) Validate the command** (table, partition, pinned shape); malformed input throws, as settlement does.
1. **(rev. 2, R2) Settled-key replay first.** If `readCommittedStatementOutcome(service, entryKey)` is SETTLED, the applier resolves the waiter with the recorded answer and returns REPLAYED.

   This is needed because the rev. 1 citation of `partition-service-entry-apply-base.js:676-683` covers only the `command.sql` branch; typed commands return at `:651-660` before it (C). Counterexample: after an unknown outcome, the same entryId re-proposed to a new leader commits twice. Without this step, the second apply answers `PARTITION_BUSY` against the first's ADMITTED, and FOUND founds twice.
2. **(rev. 2, R2) Re-park on reservation.** If `isPartitionReserved(service.db)` (a PREPARED participant transaction), return `settleReservedCommittedStatement(service, {command, afterCommit})`: the entry is consumed without effect and the key stays unsettled, as for SQL and settlement.
3. **(rev. 2, R3) CDC owed capacity at apply.** The same slot count as at the request; over the bound the outcome is `REFUSED{CDC_CAPACITY}`.
4. **(FOUND only; rev. 2, R4; rule corrected in rev. 3) Partition not yet founded.**
   - **(rev. 3) Not foundable by kind.** A partition id of the static system catalog (`classifySystemPartition`: BOOTSTRAP_CRITICAL) is refused `REFUSED{SYSTEM_PARTITION_SEED_FOUNDED}`, the name agreed with founding §2.12 (a). Provisioning never founds system partitions; the seed's write-once original allocation is their founding fact. No marker on seed-founded partitions is needed.
   - **(rev. 3) Founded means a live founding set.** The partition counts as founded while **any** founder row of it (carrying the GENESIS founding stamp that `isGenesisFoundingCreateOperation` reads; agreed in P5) is **incomplete** (`isIncompleteOperationRowStep`) **or terminal-successful** (ACTIVE). The outcome is then `REFUSED{ALREADY_FOUNDED, operationIds, foundingIntentId}`, carrying the live set's operation ids.
   - **(rev. 3) When every founder row of every earlier set is FAILED,** the partition is not founded, and a new FOUND admits a new founding set with fresh apply-index ids.
     - Rev. 2's "any founder row → ALREADY_FOUNDED" left a CREATE TABLE whose founders all failed stuck for ever. With zero members the deficit model cannot repair it either: there is no leader to copy from.
     - This matches provisioning's persistence contract that deterministic identities "advance after a terminal row" (`replica-operation-repository-mutation-persistence-methods.js:376-377`, C).
     - A partial failure (some founders FAILED, some ACTIVE) is founded; its missing members are an `UNDER_REPLICATED` deficit of the owner.
   - This makes FOUND idempotent at the founding level under fresh entryIds: after a lost answer, a new attempt learns the live set. It also avoids the deterministic-entryId trap, where a refusal such as `LEDGER_TRANSITION_UNRESOLVED` would replay for ever.
   - `replica_operations` has no row deletion today (C: no `DELETE FROM replica_operations` in src), so founder rows are retained. Any future retention owner must keep founder rows (a constraint on that owner, agreed in founding §2.12 (a)).
   - **(rev. 3) Corner case, recorded: pre-GENESIS tables.**
     - Tables founded before the GENESIS stamp existed (before about 2026-09-30, release 0.2.6) have founder rows without the marker. If their schema job were re-driven after the cutover, this rule would found them again.
     - This is excluded by the same support-envelope version fence (founding D7, P6): clusters founded before this change cannot upgrade in place across this boundary.
     - If the owner ever supports such an upgrade, its migration owner must establish the founded fact for those partitions first. Re-founding must never be the fallback.
5. **Partition busy.** If any row of the partition satisfies `isIncompleteOperationRowStep(type, workflow_step)` (the step owner's predicate, C), the outcome is `REFUSED{PARTITION_BUSY}`. There is no lane column.
6. **Ledger transition unresolved.** If an incomplete placement row on `replica_operations-p1` exists and this command is not it, the outcome is `REFUSED{LEDGER_TRANSITION_UNRESOLVED}` (DEFER). This applies to every transition kind, FOUND and RUNTIME_SERVICE included (R6).
7. **Capacity (PLACEMENT only).** Count the incomplete rows in `COPY_PHASE_STEPS` (PENDING, SENDING, CREATING, SYNCING; one exported set in the step policy) by `copy_source_node_id`, and separately by target. The limits are:
   - `kSrc` for classes 1-2 and for repair kinds;
   - `kSrc − 1` for non-repair moves of classes 3-5;
   - `kTgt` per target.

   A row without `copy_source_node_id` (written before the cutover) counts against **every** source until it leaves the copy phase. Over a limit, the outcome is `REFUSED{SOURCE_AT_CAPACITY | TARGET_AT_CAPACITY, occupancy}`.
8. **Admit.** Insert the row or rows built by the canonical row builder. **(rev. 2, R10)** `operation_id = pl-<partitionId>-<applyIndex>-<n>`: unique by construction, identical on every replica, and never colliding with a retained terminal row. The new replica's `replica_id` is derived from the `operation_id` by one rule in the applier's identity module, which absorbs the digest rule of `rebalance-replace-intent-identity.js` (deleted, §2.9).
9. **Record the typed outcome** `ADMITTED{operationIds}` or `REFUSED{reason, …}` as the entry's committed statement outcome. **(rev. 2, R3)** Record CDC for each inserted row through `recordCommittedOperationCdc(service, committed, events)` (`partition-cdc-obligation.js:227`, C), the participant-apply model, with the full row image and primary key. This is not the settlement model, which records no CDC.
10. **Emit `ENTRY_COMMITTED`** in every outcome except REPLAYED and re-parked, whose original apply already emitted it. A refusal is a committed fact with a trigger.

**Unknown outcome.** It is resolved by the entryId's committed outcome. Re-proposing the same attempt's entryId is idempotent because of step 1, which WP-E's F5 tests with the **same entryId committed twice in the log**. The clearing event is its own apply (`LEDGER_COMMIT`) or a term change.

**Schema (rev. 2, R1; replaces the rev. 1 replicated migration).**
- No lane column.
- `copy_source_node_id TEXT` is **declared in `REPLICA_OPERATIONS_SCHEMA`** (`system-table-runtime-schema-definitions.js:59-104`) and created by the existing node-local ensure (`ensureReplicaOperationsTableColumns`, `partition-service-entry-apply-base.js:114-`, C), as `target_claim_key` is.
- The rev. 1 replicated `MIGRATION_ALTER_TABLE` plan cannot run, for two reasons (C):
  - its producer refuses every system table (`resolveSystemTableSchemaRefusal` in `executeMigrationAlterQuery`, `partition-service-remote-query-methods.js:386-393`; `refuseSystemTableSchemaMutation`, probe2);
  - a replicated ALTER on a replica whose table already has the column fails with `duplicate column name`, a deterministic statement failure (probe2), so a fresh learner records a different outcome.
- Divergence of the node-local ensure across versions cannot arise. The support-envelope version fence (§2.2, rev. 3) keeps every ledger replica on the version that declares the column.

**One admission entry for every insert (review 9; rev. 2 re-keys).**
- S1-S4 (the owner), S5 (FOUND) and S6 (runtime services) all use `PLACEMENT_ADMIT`.
- **Bypass inserts S9 and S10** (`replica-operation-repository-mutation-update-methods.js:455`, `operation-workflow-gate-operation-row-repair.js:41`, C): delete on WP-F evidence, otherwise a restore mode of the applier.
- **Identity consumers broken by apply-minted ids (rev. 2, R4):**
  - **`rebalance-replace-intent-identity.js`: delete.** Its only consumers are the coordinator creation and collision paths being replaced (`rebalance-coordinator-operation-creation.js`, `rebalance-coordinator-operation-persistence-collision.js`, C). Its replica-id digest rule moves into the applier's identity module, so there is one version.
  - **`spread-cure-transition-authorization.js:378-392`: re-key, then delete the object.** It compares a planner-minted `authorization.operationId` with the executing operation. Under the owner, the committed admission row *is* the authorization. The destination's check reads its own operation's committed row (`operation_id`, destination node and replica, declared RF) instead of a separately minted object, which is deleted with a census.
  - **`durable-schema-planning-retention.js:22-36`: re-key.** It requires `operation.operationId === buildSchemaProvisioningChildIntent(...).operationIntentId` (C). Provisioning instead records the founder operation ids returned by FOUND (`ADMITTED{operationIds}`, or `ALREADY_FOUNDED{operationIds}`) in its durable job state and matches against those, keyed by the `foundingIntentId`.
- The pre-checks that disappear are as listed in rev. 0: intent dedupe, the four budget gates and the ledger interlock. The safety checks remain at dispatch.

**The ledger's own transition** (review 5; the rev. 1 refinement accepted).
- Admitted when first in order and its partition is not busy, with the durable dispatch hold `LEDGER_AWAITING_COPY_IDLE` (fix B's durable-hold authority).
- From its commit on, step 6 refuses every new admission, of every kind.
- The owner releases the hold with the committed `PLACEMENT_RELEASE_HOLD` (same applier family, same steps 0-3) once no other incomplete row is in a copy-phase step.
- Removal-phase rows of *other* partitions never delay the release.
- **(rev. 2, R6) What remains:** the ledger operation's *own* stall, for example its source REMOVE stuck in STOPPING, still freezes every admission, FOUND and runtime services included, until it ends. Memory `operation-ledger-self-move-hold-engagement` measured 29.9-57.8 s of exclusion per self-move. The design does not hide this:
  - WP-A and witness A6 record the exclusive time per ledger move and the time to latch;
  - the ledger's stuck-STOPPING path is routed as a **prerequisite finding** to the workflow and replica-handler owners;
  - risk R14.

**Founding is its own transition** (review 4; rev. 2, R4/R5).
- `FOUND` admits the whole founding set of a new partition in one `PLACEMENT_ADMIT`.
- It is idempotent through the not-yet-founded rule (step 4).
- It is exempt from copy capacity and `K_tgt`, but not from the partition-busy and ledger-unresolved rules.
- The FOUND applier and the provisioning switch are **this Quest's** (WP-E, WP-F). System-partition founding with one voter is the founding Quest's (its WP-F2). The **P5 interface agreement** between the two is §2.13.

### 2.6 Deficit model and priority order (rev. 1; formation gate amended rev. 2)

**Deficit kinds per partition.** Effective placement uses the declared RF `r`, the voter rows, the eligible nodes `N_e` (READY lease, declared `host_id`, not draining; rev. 3: no capability clause) and the eligible hosts `H_e` (declared `host_id`).

| Kind (severity order) | Condition | Move (one, via the precedence function) |
| --- | --- | --- |
| `FAILED_OR_DEAD` (repair) | a replica row FAILED, or on a node whose READY lease lapsed or whose row is gone | REMOVE of the failed replica if the voter floor allows, else REPLACE onto an eligible node |
| `UNDER_REPLICATED` (repair) | voters on distinct eligible nodes < `r`, and some eligible node does not host the partition | ADD |
| `HOST_SPREAD` | voters ≥ `r` but distinct hosts < `min(r, |H_e|)`, including co-located voters on one node | REPLACE. The source is a replica on the most over-represented host, never the leader replica if a co-located non-leader exists (§2.2). The target is an eligible node on an unused host. |
| `SURPLUS` | voters > `r` | REMOVE, only if `projectQuorumAfterRemoval` over the remove-safety owner's exported input builder would pass (§2.8). The workflow re-evaluates at the REMOVE step anyway. |
| `REBALANCE` | load or affinity scoring (`placement-owner-decision.js`) | count-neutral REPLACE, within the class-3-5 non-repair limit |

**Within a class:** deficit kind as above; then fewest distinct hosts holding voters; then fewest voters; then partition id.

**Class order:**
1. `LEDGER` (`replica_operations-p1`), with the engaged-hold rule of §2.5;
2. `PRIORITY` (the five other priority control-plane partitions, `system-partition-classification.js:50-57`, C);
3. `FORMATION_DEPENDENCY` (`nodes-p1`, `:65-67`, C);
4. `SYSTEM` (the 39 others; `services-p1`, `partitions-p1`, `tables-p1` first);
5. `USER`.

Classes 3-5 require `answerCommittedNodes().formation.state === FORMED` (the formation latch, rev. 3).

**Capacity per class (rev. 1, review 6).** In rev. 0 every non-repair move got `K_src − 1`. Every formation move is HOST_SPREAD, so formation, including the priority phase, would have run one copy at a time from the seed. Now:
- classes 1-2 and every repair kind (FAILED_OR_DEAD, UNDER_REPLICATED) may use all of `K_src`;
- only non-repair moves of classes 3-5 (HOST_SPREAD, SURPLUS, REBALANCE) are limited to `K_src − 1`;
- with the recommended `K_src = 3`, the priority phase gets 3 copies from the seed and the background drain gets 2, with 1 reserved for repair.

**The formation gate is latched, not live (rev. 1, review 12).**
- **The live summary flaps.** The published priority-partition summary is recomputed from an eligibility-dependent census (`priority-recovery-partition-assessment.js:84-130`, C). The pre-gate's five serve flaps could flip it. After a node death below RF, a live gate would freeze every class 3-5 move, including repair.
- **So the owner consumes a latched fact.**
  - **Rev. 3:** it consumes what the formation-latch Quest provides (`takeover-20261117/formation-latch-design.md`, §3.3-§3.4, §6.2), not rev. 2's `answerFormationAdmission()` / `formation_complete` from the 2026-11-11 WIP.
  - The latch implements the owner's binding decision of 2026-11-11 (1): "declared formation size given to the seed at bootstrap, one-time monotone latch". Membership publication owns one `cluster_formation` record per cluster, `DECLARED{D, revision}` → `FORMED{latchEpoch, hosts}`, committed once by a transition guarded at apply.
  - The record is read only through **`ServeEligibilityOwner.answerFormation()`**, with states `FORMED{clusterId, latchEpoch, declaredHostCount, formedHostIds, unit}`, `FORMING{…}`, `UNDECLARED{…}` and `UNAVAILABLE{reason}`.
  - Placement receives it as **`answerCommittedNodes().formation`**, from the same committed read position as the node rows.
  - The placement owner opens classes 3-5 only on `FORMED`. Every other state is the waiting reason `FORMATION_NOT_LATCHED` (the latch design's name), cleared by `NODES_OR_FORMATION`.
  - Every `PLACEMENT_ADMIT` carries `formationLatchEpoch` for audit.
  - Monotonicity is a write-side property. Placement keeps no reader-side "seen FORMED" flag (a second authority), and a restarting owner reads UNAVAILABLE until its committed read succeeds.
- **Why rev. 1's latch was wrong.** A summary satisfied at `min(3, eligible)` latches at 2 hosts when one joiner is late. The declared size `D` and the latch's `V(r_p, D)` condition prevent that.
- **Owner decision 2026-11-18 (recorded).** Reads are allowed before formation; only writes and DDL are refused. So `CLUSTER_FORMATION` is **not** a HARD `/readyz` dependency, unlike the latch design's §3.4 consumer table, which that design's author reconciles. Placement is unaffected: its gate is classes 3-5 only.
- **No producer exists in src today** (C: grep). It is precondition **P4** of WP-F: the formation-latch Quest's S4. There is no interim live-gate mode (no dual path).
- After the latch, repairs of priority partitions still come first by class order.

### 2.7 Refusal and completion (rev. 1)

Every candidate that is not admitted carries one typed reason and one clearing trigger, and every trigger is in §2.3. A refusal code reachable on the owner's path without an entry in this table is a defect; a static check in WP-G maps each code to its trigger in one table.

| Waiting reason | Clearing trigger |
| --- | --- |
| committed `REFUSED{PARTITION_BUSY}`, `{SOURCE_AT_CAPACITY}`, `{TARGET_AT_CAPACITY}`, `{LEDGER_TRANSITION_UNRESOLVED}` | `LEDGER_COMMIT` (the busy, occupying or ledger row's next step or terminal) |
| write kernel `BACKPRESSURE`, `CDC_CAPACITY`, `CDC_DEMAND_EXCEEDS_CAPACITY` (`partition-write-kernel.js:49-63`) | `LEDGER_COMMIT`. P: they count the ledger partition's own in-flight entries and CDC owed work, whose applies, including CDC acknowledgement commands, emit `ENTRY_COMMITTED` (C for the acknowledgement emission). The WP-E falsifier verifies each. |
| `RESERVED` (a PREPARED participant transaction holds the partition) | `LEDGER_COMMIT` (the decision's apply) |
| `CUTOVER_PAUSED`, `CONSENSUS_SESSION_OPEN` | `WRITE_PATH_RELEASED` |
| `COMMIT_DEADLINE_EXCEEDED`, `OUTCOME_UNKNOWN` | the entry's own apply (`LEDGER_COMMIT`), or a term change (`LEADERSHIP_START` of the next owner) |
| `NOT_LEADER`, `CONSENSUS_RECOVERY_REQUIRED`, `CONSENSUS_HOST_FAILURE`, `SERVICE_SHUTDOWN` | owner deactivation, then the next owner's `LEADERSHIP_START` |
| `FORMATION_NOT_LATCHED` (`answerCommittedNodes().formation.state !== FORMED`; the latch design's name, rev. 3) | `NODES_OR_FORMATION` |
| `CDC_CAPACITY` (request-side or applier refusal, rev. 2) | `LEDGER_COMMIT` (the CDC acknowledgement command's apply) |
| `ALREADY_FOUNDED` (FOUND, rev. 2; live set only, rev. 3) | none needed. It is a definite answer carrying the live set's founder ids; the provisioning owner adopts them. |
| `SYSTEM_PARTITION_SEED_FOUNDED` (FOUND, rev. 3) | none. It is a definite, permanent refusal by partition kind. |
| `NO_ELIGIBLE_TARGET` (count or host) | `NODES_OR_FORMATION` |
| `TARGET_STORAGE_CONSTRAINED`, `TARGET_STORAGE_UNKNOWN` | `TARGET_CAPACITY_CHANGED` |
| `LEADER_UNKNOWN` (copy source) | `SERVICES_CHANGED` |
| `NODE_AUTHORITY_UNAVAILABLE`, `SERVICES_READ_UNAVAILABLE`, `INPUT_READ_DEFERRED(pressure)` | that owner's notification, the next SERVICES trigger, or `PRESSURE_RELEASED` |
| `REMOVE_FLOOR_WOULD_FAIL` (planning-time) | `SERVICES_CHANGED` or `NODES_OR_FORMATION` |
| `LEDGER_AWAITING_COPY_IDLE` (the ledger operation's hold) | `LEDGER_COMMIT` (the copy-phase exits) |

**Completion triggers the next admission.** A terminal transition is a committed ledger entry, applied locally. Its `ENTRY_COMMITTED` enqueues a pass that admits the highest-priority waiting candidate. There is no lottery, stagger, baton or expando registry.

**Refusal is never a failure.** There is no `BUDGET_EXCEEDED`, no operation FAILED and no backoff. A refusal by the applier writes only its committed outcome record and leaves no operation row.

### 2.8 Consuming the remove-safety floor and the formation fact (rev. 1)

**Remove safety is unchanged, as amended by fix A.**
- The floor is `evaluateRemoveSafety` at `f50344e98` (`operation-workflow-remove-safety-evaluator.js`). One fail-closed voter floor applies to every removal: the partition's voter-ready rows on READY-lease nodes after the removal must be ≥ `minReplicaCount`.
- It runs where it runs today, in the workflow at the REMOVE or REPLACE-source step, from committed reads (`committed-node-remove-safety-wake`).
- The owner adds no floor. For planning only, it evaluates the exported pure predicate `projectQuorumAfterRemoval({scope: SIMPLE_FLOOR})`, so that it does not admit a REMOVE that would certainly park.
- A parked REMOVE keeps its partition busy, which is correct.
- The verifier attempts the sibling's counterexample: remove a seed replica while the only other voters are SYNCING.

**One input builder (rev. 1, review 15; span corrected in rev. 2, R9).** The owner does **not** rebuild the floor's inputs. The remove-safety owner exports one async builder, `buildRemoveSafetyProjectionInput(operation, serviceRows)`. It is extracted refactor-only from the **whole** inline derivation (`operation-workflow-remove-safety-evaluator.js:445-585` at `219c27bfe`, C):
- the committed node floor (`readCommittedNodeFloor`);
- `removeSafetyReadiness`;
- `currentVoterReadyRows` via `isVoterReadyFloorCountableReplica` (`:455-466`);
- the removed-replica identity;
- `projectedVoterReadyRows` (`:580`);
- the async `getCriticalMinReplicaCount` (`:577`).

The evaluator and the owner both call it and then `projectQuorumAfterRemoval`, so neither re-derives `currentVoterReadyRows`. The verifier checks that the extraction changes no decision (constraint `remove-safety-unchanged`).

**Formation fact: consumed, never recomputed.** The owner consumes the formation latch (§2.6, rev. 3) through `answerCommittedNodes().formation`. Any state other than `FORMED` admits only classes 1-2 (fail closed). The owner honours the sealed constraints of `formation-ready-lease-independent-of-spread`:
- `ready-means-node-can-serve`: the owner consumes the READY lease and never feeds back into it.
- `no-pre-ready-placement`: a target needs a valid READY lease in the committed node answer, re-checked at dispatch.
- `one-formation-fact-consumed-where-it-protects`: "ordinary placement" is classes 3-5. Rev. 2/3 change the consumed form of that fact from the live priority-partition summary to the formation latch (`cluster_formation`, written by the same owner, membership publication; rev. 3). The latch adds the declared host count `D`, the `V(r_p, D)` spread condition and monotonicity. This follows the BINDING owner decision of 2026-11-11 (1). It contradicts the sibling's sealed sentence "Its definition and its existing consumers … are unchanged", so it is recorded as an **R09 supersession** of that sentence (WP-C), not as a note.
- `remove-safety-unchanged`.
- `dead-ready-node-witnessed`: a lease lapse is a `NODES_OR_FORMATION` trigger, and repair (`FAILED_OR_DEAD`) proceeds after the latch.
- `join-core-coupling`: the DT witnesses stay green.

### 2.9 Fate of the per-partition rebalancers

`PartitionService.initializeRebalancer` (`partition-service-rebalancer-methods.js:269-336`, C) builds one `UnifiedRebalancer` per partition on its leader node. After this Quest:
- **No per-partition component creates a membership-changing operation.** The binding direction says detectors only observe or propose. `requestPlacementAdmission` has these callers only:
  - the owner;
  - FOUND from provisioning;
  - runtime services.
- **Moved into the owner's deficit kinds:**
  - move planning (`move-planner-move-calculation-methods.js`, `move-planner-priority-spread-cure.js`);
  - priority recovery and its surrogate follow-ups (`unified-rebalancer-priority-recovery-*.js`, `unified-rebalancer-follow-up-*.js`, `priority-recovery-*.js`);
  - failed-create cleanup (`unified-rebalancer-failed-create-cleanup.js`);
  - the ledger-quorum cure (`operation-ledger-quorum-concentration.js`).
- **Deleted with them:**
  - the per-entity scheduler (`unified-rebalancer-policy-scheduler-methods.js`);
  - the planning gates (`rebalancer-planning-gate-methods.js`, `rebalancer-priority-recovery-planning-gate-methods.js`);
  - the loop (`unified-rebalancer-rebalance-loop.js`);
  - the wakes (`rebalancer-local-mutation-readiness-wake.js`, `continuation-wake-coordinator.js`, `rebalancer-node-event-methods.js`);
  - the partition and message-group traffic-ready wakes (`partition-service-rebalancer-methods.js:14-84`, `message-group-service-rebalancer-runtime-methods.js:7-19`);
  - the 70 s release tracker (`background-priority-spread-release-tracker.js`);
  - the budget planning (`unified-rebalancer-budget-planning.js`);
  - the topology-drain observation (`unified-rebalancer-topology-drain-methods.js`; it served only the deleted fence);
  - the two bypass inserts (§2.5), subject to WP-F's evidence;
  - (rev. 2) `rebalance-replace-intent-identity.js` (its replica-id rule moves into the applier's identity module) and the planner-minted spread-cure authorization object (`spread-cure-transition-authorization.js`; the destination checks the committed admission row instead).
- **What remains per partition:** the leader-local leadership-placement cure (`user-table-leader-placement-cure.js`). It moves leadership, not membership, and becomes a small leader-local reconciler.
- **Message-group rebalancers stay parked** (D4). Their planner is not touched. The owner snapshot lists `mg-1` as `UNSUPPORTED_ENTITY_KIND`.
- **Runtime-service placement** keeps its owner on the `service_definitions-p1` leader and proposes through `PLACEMENT_ADMIT` (`transitionKind RUNTIME_SERVICE`; no copy capacity).

The exact list is the §1.2 classification. A census test pins absence by closure over identifiers, files, constants and log ids.

### 2.10 Fresh formation, step by step (rev. 1)

**Host identity** (D3, decided): a required, explicit node configuration value, persisted in `NODES.host_id` by the NODES lifecycle publication owner and never inferred. A missing value is refused typed at node start (WP-D).

**Timeline** (`K_src = 3`, `K_tgt = 2`):
1. **t0.** The seed holds 46 system partitions plus `mg-1`, each with three co-located voters (until the founding-membership Quest lands). The owner activates on ledger leadership. It finds HOST_SPREAD deficits everywhere and `NO_ELIGIBLE_TARGET`.
2. **j1 becomes READY.** Class 1: the ledger REPLACE (a non-leader source) is admitted with the dispatch hold. No copy-phase row exists, so the owner releases the hold in its next pass, and the REPLACE dispatches. Every other candidate waits on `LEDGER_TRANSITION_UNRESOLVED`.
3. **The ledger REPLACE goes terminal.** Then:
   - the second ledger REPLACE (to j2, if j2 is READY) is engaged;
   - if j2 is not READY, up to three class-2 copies are admitted from the seed, at most two per target.
4. **Each terminal commit** admits the next candidate in the same pass.
5. **The six priority partitions hold voters on `V(r_p, D)` hosts and `D` hosts are READY in an acknowledged publication** (rev. 3). Membership publication commits `cluster_formation` DECLARED → FORMED once, on its 5 s driver, and `answerFormation()` answers `FORMED`.
6. **FORMED:** `nodes-p1` first, then the system partitions in order, at most two spread copies from the seed, with one slot reserved for repair.
7. **The last terminal.** No deficit remains, the ledger has no incomplete row, and predicate (c) holds. `mg-1` remains on the seed (D4).

The ledger leader may move to a joiner during these steps by election (§2.2). The owner then continues there.

### 2.11 Copy load: capacity, who decides, and the arithmetic (rev. 1)

**Who decides:** unchanged (owner constants, evidence-based owner decision, no timer). The values travel in each `PLACEMENT_ADMIT`.

**Evidence, corrected (rev. 1, review 10).** I re-ran the reviewer's `scratchpad/placement-vet/drain.py` on `pregate-219c27bfe/analysis-replica-operations-inflight.txt` (C). Rev. 0 had read operation *lifetimes*, not *completions*, and its window labels were inverted.

| Window | Background REPLACE completions | Wall time per copy | Copy-phase concurrency from the seed |
| --- | --- | --- | --- |
| 17:27:56-17:31:16 | 9 | 22.2 s; about 16.4 s without the 52 s interval 17:30:21-17:31:13 in which no ledger transition was observed (unacknowledged seed sends, mechanism C) | mostly 2 |
| 17:31:16-17:32:53 | 13 | **7.5 s** | mostly 3-4 |
| whole | 22 | 13.5 s | - |

- Throughput **rose** with copy-phase concurrency up to 4 in this run.
- The stall is a failure mode (unacknowledged sends, then `replace_target_dead_before_intent`), not a concurrency knee.
- Rev. 0's "flat throughput, knee at 2" is withdrawn.
- **Recommendation (D2):** `K_src = 3` (two spread slots plus one repair slot), `K_tgt = 2`. This is pending WP-A's measurement at K = 1/2/3 on copy-phase-only counts, together with stall incidence per K.

**Drain-time arithmetic (P):**
- 80 background copies, at 7.5 s (best window, about 3 in copy phase) to 16.4 s (about 2, stall excluded) per copy: **600-1,310 s after FORMED**.
- The pre-gate reached priority 3/3 at 192 s, so the total is about 790-1,500 s, against the 420 s bound.
- Rev. 0's rule would have run formation at one copy (about 2,000 s; review 6).
- **The conclusion is unchanged:** the owner is necessary, not sufficient, for the 3/3 journey on `cpus: 1.0`. The owner decided **D1 = (b)**: a separate founding-membership Quest (one founding voter, up-replication by ADD; 141 → 47 Raft replicas on the seed; about half the steps per copy) carries the larger lever. The 3/3 journey stays with the service Quest (§4.4).

**Levers (P; WP-A measures each):**
1. per-partition planning load removed (this Quest);
2. founding membership (D1(b) Quest);
3. the seed CPU profile follow-ups;
4. **removal of deferred-local priority progress** (§2.3), so that copy-phase exit is durable promptly.

### 2.12 Contract-first transition record (rev. 1, amended rev. 2)

| Item | Record |
| --- | --- |
| 1. Producer and consumer symbols | **Producer:** `ReplicaPlacementOwner.runPass(trigger)`, then `requestPlacementAdmission` (local, or routed through the partition-service message type), then `applyPlacementAdmission` and `applyPlacementHoldRelease` (apply dispatch beside `applyCoordinatorSettlement`). **Consumers:** the `OperationWorkflowOwner` claim and dispatch of admitted rows (the existing post-insert path, honouring the durable dispatch hold); `ReplicaDispatchService`; every `SystemTableCache` through CDC with the full row image; `answerPlacementOwnerSnapshot()`. |
| 2. Owner-defined shape | `PLACEMENT_ADMIT` and `PLACEMENT_RELEASE_HOLD` command shapes and their outcome `{ADMITTED{operationIds} \| REFUSED{reason, occupancy}}`, in the owner's constants. Rows are built by the canonical row builder, plus `copy_source_node_id`. No untyped facade, alias field, `?.()` probe or SQL parameter extraction. |
| 3. Identity and generation | The command's entryId identifies one proposal attempt: reused only to re-propose that attempt after an unknown outcome, fresh after any definite outcome (rev. 2). `operation_id = pl-<partitionId>-<applyIndex>-<n>`, with `replica_id` derived from it (rev. 2). FOUND carries `foundingIntentId` (§2.13). Also: input positions, and (rev. 3) `formationLatchEpoch` from `answerFormation()`, carried on every `PLACEMENT_ADMIT` for audit (latch design §6.2). |
| 4. Ordering | The ledger log orders every admission, refusal and hold release. The single-key queue orders passes. |
| 5. Absent vs unavailable | A refusal is a committed typed outcome. Unavailable inputs have typed waiting reasons with triggers (§2.7). Not capable and not latched are typed. Null `copy_source_node_id` is counted conservatively. |
| 6. Durable commit | The apply of the `PLACEMENT_ADMIT` entry (row plus outcome record plus CDC image, in one apply transaction). |
| 7. Retained obligations | Incomplete rows keep their partition busy and their workflow lease. The engaged ledger row holds DEFER until it is released and then terminal. Lost proposals are re-derived. Founding sets are atomic. |
| 8. Wake and cleanup | Triggers in §2.3. Deactivation unsubscribes and drops the queue, memo and resync timer. No timer survives a step-down. |

### 2.13 P5: the interface agreement with the founding-membership Quest (rev. 2, R5; verified against founding rev. 1 §2.12 in rev. 3)

P5 is **an interface agreement only**, written into both designs. It is not a build dependency in either direction: founding's WP-F1 starts after this Quest's WP-F, and this Quest's WP-F needs only the agreed fields. The FOUND applier and the provisioning switch stay in this Quest (WP-E, WP-F). System-partition founding with one voter stays in founding's WP-F2.

**Rev. 3 check of both sides.** I read `founding-membership-design.md` rev. 1, §2.12 (`:831-864`) item by item.

| Item | This design | Founding §2.12 | Status |
| --- | --- | --- | --- |
| Entry | `requestPlacementAdmission`, the committed command `PLACEMENT_ADMIT`, `transitionKind ∈ {PLACEMENT, FOUND, RUNTIME_SERVICE}`. Founding's learner ADD, GROWTH_PROMOTE and REMOVE_LEARNER are `PLACEMENT` moves. | (e) "conditional ledger insert" and "lane" replaced by `PLACEMENT_ADMIT` and "busy rule" | **agreed** |
| Busy rule | busy while any row satisfies `isIncompleteOperationRowStep`; serializes ADD, ADD, PROMOTE | the ledger rule is consumed unchanged (founding §2.6) | **agreed** |
| Operation ids | `pl-<partitionId>-<applyIndex>-<n>` | "follow placement's apply-index rule" | **agreed** |
| (a) Founding marker | the GENESIS stamp on founder rows (`ReplicaOperationField.BOOTSTRAP_MEMBERSHIP`, `kind === GENESIS`), retained | the same, retained; constraint on any retention owner | **agreed** |
| (a) Seed-founded system partitions | **rev. 3:** refused by kind, `SYSTEM_PARTITION_SEED_FOUNDED`; no marker needed | refuse catalog ids with `SYSTEM_PARTITION_SEED_FOUNDED`; `isPartitionFounded` = system catalog partition **or** a ledger founder row with the GENESIS marker, one predicate owned by placement's FOUND module | **agreed, with one rev. 3 refinement for founding to adopt:** the ledger half of `isPartitionFounded` counts only a founder row that is incomplete or ACTIVE; a set whose rows are all FAILED is not founded (§2.5 step 4) |
| (a) Clusters before this change | the pre-GENESIS corner is excluded by the D7 fence (§2.5 step 4) | outside the support envelope (D7) | **agreed** |
| (b) `foundingIntentId` | user tables `(schemaJobId, partitionId)` | the same; plus **split and merge children `(workflowId, childPartitionId)`** through the provisioning founder path (whether they go through it is P); seed: none | **adopted in rev. 3.** The FOUND payload accepts both intent shapes. Whether split and merge founding goes through the provisioning path is verified in WP-F; if not, that path is a fourth `PLACEMENT_ADMIT` caller, named in the caller census. |
| (c) Step sets | PROMOTE outside `COPY_PHASE_STEPS`; `copySourceNodeId: null` | PROMOTE: `PROMOTION_PENDING`, `PROMOTION_PROPOSED` (plus COMPLETED, FAILED); REPLACE target promotion: `TARGET_PROMOTING`. All incomplete for the busy rule and disjoint from `COPY_PHASE_STEPS`. | **agreed**. Placement's `COPY_PHASE_STEPS` stays {PENDING, SENDING, CREATING, SYNCING}. |
| (d) Voter target | `resolveVoterTarget(r, H)`, consumed once it lands; never `min(3, n)` | single definition, shared with the latch Quest | **agreed** |
| Deficit extension | founding's WP-F1 adds its kinds to `replica-placement-owner-deficits.js` after placement WP-F | **`LEARNER_DEFICIT` (ADD), `PROMOTION_READY` (PROMOTE), `DEAD_LEARNER` (`REMOVE_LEARNER`, a repair class)** | **agreed.** `DEAD_LEARNER` and `LEARNER_DEFICIT` are repair kinds for the full-`K_src` rule (§2.6). `PROMOTION_READY` uses no copy capacity. |
| Version fence | **rev. 3:** support-envelope fence for this boundary (P6); no capability flag | D7: certified pair excluding pre-change sources, join refusal `OUTSIDE_SUPPORT_ENVELOPE`, the seed's `ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED` | **agreed** (one owner of version compatibility) |

**One mismatch left on the founding side.** Its `isPartitionFounded` ledger half must adopt the live-set rule above. I have not edited `founding-membership-design.md`; it is another author's document.

---

## 3. Comparable systems (verified by a research subagent against pinned sources; unverified items marked)

| System | Who decides | Capacity | Refusal and re-trigger | Resync | One change per group | Leader change |
| --- | --- | --- | --- | --- | --- | --- |
| **CockroachDB** (`release-26.2`) | Per range, on the leaseholder: "The replicate queue only operates on leaseholders, which means that only one node at a time is operating on a given range" (`allocator.go`, https://github.com/cockroachdb/cockroach/blob/release-26.2/pkg/kv/kvserver/allocator/allocatorimpl/allocator.go). A per-range `allocatorToken` is held while planning and executing. | Queue `maxConcurrency` "defaults to 1" (`queue.go`). Snapshot semaphores `kv.store.raft_snapshot.apply_limit` = 1 and `kv.store.raft_snapshot.send_limit` = 2 (`store.go`, `store_snapshot.go`). `kv.snapshot_rebalance.max_rate` 32 MiB/s. | No valid target: `allocatorError` is a `PurgatoryErrorMarker`, "retried quickly as soon as new stores come online". Purgatory re-processes all its replicas on `updateChan` (gossip store-descriptor or liveness callback, buffered to 1 so signals coalesce) or a 1 min ticker (`queue.go`, https://github.com/cockroachdb/cockroach/blob/release-26.2/pkg/kv/kvserver/queue.go). A declining store is throttled 5 s (`server.failed_reservation.timeout`). | Replica scanner, one full scan per `defaultScanInterval = 10 min` (`server/config.go`). Event enqueue on span-config update. | Learner, then snapshot, then joint-consensus promote/demote. Descriptor written by conditional put; a concurrent change fails `ConditionFailedError` (`replica_command.go`). | A new leaseholder removes stray learners first. |
| **TiKV PD** (`release-8.5`) | One elected PD leader owns all scheduling (`server.go` `campaignLeader`, then `createRaftCluster`). Operators in memory (`operator_controller.go`; that they are not persisted is the agent's inference). | Store limits: `storelimit` `AddPeer` / `RemovePeer` token buckets, default 15/min, plus a v2 sliding window with `Ack` on completion. `max-snapshot-count` 64, `max-pending-peer-count` 64, `replica-schedule-limit` 64. Docs: "store limit … mainly limits the consuming speed of operators" (https://docs.pingcap.com/tidb/stable/configure-store-limit/). | Over `replica-schedule-limit`, a region goes to the `pendingProcessedRegions` "waiting list" (3 min TTL), rechecked on patrol ticks. On operator SUCCESS, TIMEOUT or `EpochNotMatch`, `Dispatch` calls `RemoveOperator` then **immediately `PromoteWaitingOperator`**. If the store limit is exceeded at promotion, the operator is cancelled. `Urgent` bypasses store limits. | Patrol ticker (`patrol-region-interval` 10 ms batches). `PushOperators` every 500 ms. | One operator per region (`LoadOrStore`). An operator is replaced only by a strictly higher `PriorityLevel`. Steps check the region epoch. | New leader: `prepareChecker` blocks scheduling until 90 % of regions have heartbeated, or 5 min. The joint-state checker finishes learners first. |
| **etcd / raft** (`v3.6.9`, raft `v3.6.0`) | - | `DefaultMaxLearners = 1` | Promote only if `learnerMatch/leaderMatch ≥ 0.9`; otherwise `ErrLearnerNotReady` (`isLearnerReady`, https://github.com/etcd-io/etcd/blob/v3.6.9/server/etcdserver/server.go) | - | `pendingConfIndex`: "Only one conf change may be pending (in the log, but not yet applied) at a time" (https://github.com/etcd-io/raft/blob/v3.6.0/raft.go). A violating proposal becomes an empty entry. | `becomeLeader` sets `pendingConfIndex = lastIndex`, delaying conf changes until its tail commits. |
| **Kubernetes** (`v1.33.0`) | Leader-elected controllers and scheduler (`LeaderElect` true) | Rate-limited workqueue: per item exponential (5 ms-1000 s) with overall 10 qps / burst 100 | Workqueue is "Stingy": an item is never processed concurrently and is deduped while queued (dirty and processing sets, `doc.go`). Scheduler: a rejected pod goes to `unschedulablePods`. Node add/update and assigned-pod delete (freed capacity) call `MoveAllToActiveOrBackoffQueue`. `moveRequestCycle` and `inFlightEvents` prevent a lost wake for an event that lands during an attempt (`scheduling_queue.go`, https://github.com/kubernetes/kubernetes/blob/v1.33.0/pkg/scheduler/backend/queue/scheduling_queue.go). QueueingHints skip useless retries (KEP-4247). | "Level driven, not edge driven". Informer resync re-delivers cached objects (no storage reads). Controller-manager min resync 12 h (randomized ×1-2). Unschedulable flush every 30 s for pods older than 5 min. | - | (cache rebuild on a new leader not traced: unverified) |

**Adopted:**
- **(a) One owner,** PD's model: one elected owner and one operation per group. We do **not** adopt CockroachDB's per-range distribution. It needs tokens, conditional descriptor writes, throttling and local estimates to cope with stale views. Our ~46 racing rebalancers are that problem without those mitigations.
- **(b) Level-triggered passes with a slow resync** (CockroachDB scanner 10 min; Kubernetes resync), with the resync's admissions counted and required to be zero.
- **(c) A priority queue of deficits.** CockroachDB's ordering: finish in-flight transitions, then repair dead replicas, then add a missing voter (weighted by quorum distance), then remove, then rebalance. Do nothing without quorum.
- **(d) Owner-held capacity.** PD's take and ack: capacity freed on completion immediately promotes waiting work, with a reserved repair slot as in PD's Urgent window. CockroachDB's small fixed snapshot concurrency (send 2, apply 1) supports `K = 2` as a sane order of magnitude.
- **(e) Refused work waits for a named event.** Purgatory `updateChan`, the scheduler's `MoveAllToActiveOrBackoffQueue`. Our single-key queue with merged reasons gives Kubernetes' `inFlightEvents` property: an event during a pass schedules exactly one more pass.
- **(f) One membership change per group,** structurally enforced (raft `pendingConfIndex`, PD's one operator per region, our applier's busy rule), and guarded by a conditional write evaluated at commit (CockroachDB conditional put, PD `EpochNotMatch`, our `PLACEMENT_ADMIT` applier).
- **(g) The new owner rebuilds from durable state.** It needs no PD-style heartbeat-coverage wait, because the ledger is local and committed.

**Not adopted:**
- PD's cancel-on-limit followed by tick-driven re-patrol, and its 3 min TTL waiting list (time-driven).
- PD and CockroachDB per-step operator timeouts as a placement mechanism. Execution timeouts remain the workflow owner's existing concern.
- Token-bucket rates (time-based).
- CockroachDB's per-leaseholder distribution.

---

## 4. Quest proposal

### 4.1 Record (`solve/quests/replica-placement-admission-owner/quest.json`, rev. 3; unsealed until WP-B measures red)

```json
{
  "schema": "solve-quest/2",
  "id": "replica-placement-admission-owner",
  "class": "product",
  "epic": "operation-integrity-and-reliable-formation",
  "statement": "Exactly one owner admits membership-changing replica operations on partitions: the ReplicaPlacementOwner on the Raft leader of replica_operations-p1. Admission is one typed committed command, PLACEMENT_ADMIT, applied by a deterministic applier inside the Raft apply transaction on every replica; that applier is the one canonical owner of target-wide and source-wide occupancy. It first replays a settled entry key's recorded answer and re-parks on a partition reservation, counts its rows against the CDC owed bound, then, against all committed ledger rows at its log position, refuses for FOUND a system-catalog partition (SYSTEM_PARTITION_SEED_FOUNDED) or one with a live founding set (ALREADY_FOUNDED), a busy partition (an incomplete operation by the step owner's predicate), any admission while a ledger transition is unresolved, and copy-phase occupancy at or above K_src per copy-source node (K_src - 1 for non-repair moves of non-priority classes) or K_tgt per target; otherwise it inserts the rows with operation ids pl-<partitionId>-<applyIndex>-<n>, records a typed outcome under the command's entryId, records CDC from the full row images and fires ENTRY_COMMITTED. The owner recomputes every partition's placement deficit from committed inputs on any committed change to the ledger, the committed node and formation answer (answerCommittedNodes, carrying ServeEligibilityOwner.answerFormation), SERVICES, PARTITIONS or target capacity, and admits in one priority order (the ledger engaged under a durable dispatch hold, the other priority control-plane partitions, then after the formation latch is FORMED nodes-p1, system, user). Every refusal leaves the candidate waiting under a typed reason whose clearing trigger exists in code; a terminal commit triggers the next admission in the same step; the one resync is a counted safety net under the four conditions of owner decision D5 (2026-11-18). Spread is counted in declared hosts. Founding a new partition is its own transition (FOUND), admitted atomically, again only after every earlier founder row FAILED. No per-partition rebalancer, planner, follow-up, cleanup or repair re-insert creates an operation outside PLACEMENT_ADMIT. The wake/stagger/Phase-B series (f0dfc1a2b, 17194cf83, 4f7fc3691, 4c7b69804, 540418614, de9fe14e8, 380fc5f8b), the 70 s background priority-spread fence and its under-spread exemption, the per-partition placement scheduler, planning gates, wakes, budget gates and ledger interlock are removed from source, tests, contracts, baselines and documentation, not disabled.",
  "doneWhen": {
    "probe": "test-receipt",
    "args": {
      "file": "solve/quests/replica-placement-admission-owner/evidence/receipt.json",
      "requiredReceipts": [
        "reproducer-red-on-candidate",
        "cross-coordinator-target-census-witness",
        "typed-admission-routed-cdc-and-mixed-version",
        "reproducer-and-owned-roots-green",
        "negative-controls-red",
        "churn-host-topology-and-write-path-witnesses",
        "single-admission-path-and-removed-mechanism-census-zero",
        "lab-formation-drain-mechanism-metrics",
        "independent-verification"
      ]
    }
  },
  "constraints": [
    {"id": "bounded-repair-and-separate-claims", "statement": "Bounded repair of defect class D1 (no owner of the placement work queue) and of the pre-gate mechanism measured on 219c27bfe (background wave admitted from the seed at Phase B concurrency with no source capacity rule; capacity freed only by polling, stagger and safety timers). Owner decision D1(b), 2026-11-17: the three-consecutive physical journey fresh-formation-user-table-routability and the comparative smoke setup belong to the service Quest and the campaign, not to this Quest; this Quest's physical receipt is the formation drain's mechanism metrics on the lab. The journey's verdict on the same runs is recorded for the service Quest and not copied into this receipt. The per-copy seed cost and founding membership are owned by the separate founding-membership Quest and recorded as the remaining service blocker; this Quest's scope is not enlarged except by an explicit recorded widening (R16)."},
    {"id": "no-timer-no-bound-no-retry", "statement": "No timeout, bound, retry count, delay or polling interval is added or changed to obtain liveness. The placement owner arms exactly one timer, the resync (PLACEMENT_RESYNC_INTERVAL_MS, one declared constant never tuned in response to findings). Admissions are attributed per candidate to the clearing trigger recorded with its waiting reason; an admission whose clearing trigger did not fire is a RESYNC admission. D5, decided by the owner 2026-11-18: a RESYNC pass may admit only if (1) every refusal's clearing trigger exists in code before WP-F and a static check verifies each subscription, with no waiting reason naming RESYNC or retryAfterMs; (2) RESYNC runs the identical pass; (3) any production RESYNC admission raises a typed lost-edge alarm naming the missing trigger, fixed at that trigger's owner; (4) zero RESYNC admissions is evidenced in the WP-J runs, the reproducer runs with RESYNC disabled and the negative control N1 stays red. Named external cadences of other owners (the membership derivation driver, execution retries) are stepped by name and are not placement mechanisms."},
    {"id": "every-refusal-has-a-clearing-trigger", "statement": "Every refusal reachable on the admission path (applier outcomes including CDC_CAPACITY, partition write-kernel refusals, leadership, capability fence, formation latch, input unavailability including pressure-governed reads) maps in one table to a typed waiting reason and a clearing trigger the owner subscribes to. The three triggers that do not exist today are created in WP-E, an explicit widening into four owners: TARGET_CAPACITY_CHANGED at the storage-capacity projection owner, WRITE_PATH_RELEASED at the participant cutover-pause owner and at the write kernel (consensus session close), PRESSURE_RELEASED at the PressureGovernor. All exist before WP-F. No retryAfterMs or elapsed time is a clearing event. A static check pins the table against the refusal codes and the subscriptions."},
    {"id": "typed-committed-admission", "statement": "Admission is the PLACEMENT_ADMIT committed command: requested on the replica_operations-p1 leader, routed from other nodes through a partition-service message type that is also a removal-serving request type, never through SQLQueryEngine, SQLParser or the CDC routed-mutation path. Its applier runs inside the apply transaction in the order applyCoordinatorSettlement uses: settled-key replay of the recorded answer first, re-park on isPartitionReserved second; only then its checks. It counts the rows it would insert against the CDC owed bound at request and at apply (typed CDC_CAPACITY, cleared by the CDC acknowledgement commit) and records CDC for each inserted row through recordCommittedOperationCdc with the full row image. operation_id is pl-<partitionId>-<applyIndex>-<n> and replica_id derives from it by one rule. An entryId identifies one proposal attempt: reused only to re-propose that attempt after an unknown outcome, fresh after any definite outcome. There is no lane column; copy_source_node_id is declared in REPLICA_OPERATIONS_SCHEMA and created by the node-local ensure, never by a replicated ALTER. Version compatibility has one owner: this release boundary is fenced by the support-envelope owner (certified pair excluding pre-change sources, join refusal OUTSIDE_SUPPORT_ENVELOPE; founding D7), so no ledger replica without the applier exists; there is no placement-local capability flag."},
    {"id": "series-deleted-not-disabled", "statement": "The mechanisms of f0dfc1a2b, 17194cf83, 4f7fc3691, 4c7b69804, 540418614, de9fe14e8 and 380fc5f8b that schedule, wake, stagger, exempt or widen placement (continuation-wake-coordinator.js, the slot/continuation/traffic-ready wakes, TRAFFIC_READY_STAGGER_*, SLOT_WAKE_STAGGER_*, MAX_SLOT_RELEASE_HANDOFF_HOPS, the 3x safety cadence, the lastCheckAtMs/lastStateChangeTime resets from outside the owner, isPartitionTrafficReady's absent-state fallback, isPartitionBelowDeclaredDistinctHostSpread and its call sites, Phase B in system-spread-transition-policy.js, the four-source target-slot gate, the below-spread move limit and executor re-sort, VOTER_READY_CHECK_INTERVAL_MS 50 ms restored to its pre-series value pending its own event owner) are deleted together with the 70 s fence and release tracker. A census test pins their absence by closure over identifiers, constants, exports, log message ids and file names. Tests that pin only the mechanism are deleted and listed; tests that pin a surviving property are restated against the owner (design section 1.4). The impact contracts phase-b-system-spread-policy-admission and readiness-lifecycle-traffic-ready-rebalancer-wake and their coupled pairs are deleted or retargeted. Non-placement hunks of those commits are classified individually and routed to their owners."},
    {"id": "one-owner-one-admission-path", "statement": "One semantic owner decides which membership-changing operation on an existing partition is admitted next; requestPlacementAdmission is the only producer of new replica_operations rows, called by the placement owner, by the schema-provisioning owner for FOUND and by the runtime-service owner. No per-partition rebalancer, MovePlanner caller, priority-recovery follow-up, failed-create cleanup or ledger-quorum cure calls it. The CL-017(b) divergence re-insert (replica-operation-repository-mutation-update-methods.js:455) and the dispatch-gate row repair (operation-workflow-gate-operation-row-repair.js:41) are deleted, or, only on recorded evidence that their trigger survives, routed through the applier in a restore mode. rebalance-replace-intent-identity.js is deleted (its replica-id rule moves into the applier's identity module); the planner-minted spread-cure transition authorization object is deleted and the destination checks its committed admission row; durable-schema-planning-retention matches the founder ids returned by FOUND instead of deterministic child-intent ids. A static check proves the caller set."},
    {"id": "ledger-transition-engaged-hold", "statement": "The ledger's own placement operation is admitted as soon as it is first in order and its partition is not busy, inserted with the durable dispatch hold LEDGER_AWAITING_COPY_IDLE; from its commit no other admission of any kind (FOUND and runtime services included) commits until it is terminal; the owner releases the hold by a committed transition when no other incomplete row is in a copy-phase step, and removal-phase rows of other partitions never delay the release. The exclusive time per ledger move and the time to the formation latch are recorded (WP-A, witness A6, WP-J); the ledger move's own stuck-STOPPING path is routed as a prerequisite finding to its owners."},
    {"id": "founding-own-transition", "statement": "Founding a new partition is the FOUND transition: one PLACEMENT_ADMIT admits the whole founding set atomically. A system-catalog partition is refused SYSTEM_PARTITION_SEED_FOUNDED by kind. A partition with a live founding set (any GENESIS-marked founder row incomplete or ACTIVE) is refused ALREADY_FOUNDED with that set's ids; when every earlier founder row is FAILED a new set is admitted. FOUND is subject to the busy and ledger-unresolved rules and exempt from copy capacity and K_tgt; its foundingIntentId is (schemaJobId, partitionId) for user tables and (workflowId, childPartitionId) for split and merge children. The FOUND applier and the provisioning switch are this Quest's (WP-E, WP-F); P5 is the interface agreement with founding-membership-design.md section 2.12, verified on both sides. Pre-GENESIS tables (founded before release 0.2.6) are excluded by the support-envelope fence and are never re-founded as a fallback."},
    {"id": "formation-fact-latched-consumed", "statement": "Non-priority classes are admitted only when answerCommittedNodes().formation, the value of ServeEligibilityOwner.answerFormation() over membership publication's cluster_formation record (formation-latch-design.md), is FORMED; FORMING, UNDECLARED and UNAVAILABLE are the waiting reason FORMATION_NOT_LATCHED, cleared by NODES_OR_FORMATION; every PLACEMENT_ADMIT carries formationLatchEpoch. The latch is produced by the formation-latch Quest (its S4), a precondition of WP-F; the placement owner never recomputes it, keeps no reader-side flag and has no live-summary mode. Changing the sibling's 'ordinary placement' consumer from the live summary to this latch is recorded as an R09 supersession of formation-ready-lease-independent-of-spread's sentence 'Its definition and its existing consumers ... are unchanged by this quest'. Owner decision 2026-11-18 (reads allowed before formation, only writes and DDL refused) leaves this gate unchanged."},
    {"id": "no-fallback-alias-dual-path", "statement": "No cache read decides admission (the cache is a trigger only); no read merges two sources for one fact; no snake/camel alias reads, ?.() feature probes, defaulted counts or try/catch-return-default in the owner, its request or its applier; no old placement path behind a flag; no check-then-insert fallback if the typed command cannot be built (stop and report); no compatibility reader for removed state."},
    {"id": "capacity-from-committed-ledger", "statement": "K_src, K_tgt and COPY_PHASE_STEPS are declared once (owner constants, replica-operation-step-policy.js) and travel in each command. Capacity is evaluated by the applier over all committed replica_operations rows at the entry's log position, unscoped by node. No in-memory reservation, creation intent, owner-scoped repository observation, per-process lane or cache row contributes. A pre-activation row without copy_source_node_id counts against every source until it leaves the copy phase. The target-occupancy witness uses real coordinators sharing one durable store with delayed cache publication and does not use test/rebalancer/test-helpers.js createTestCoordinator, whose SQL interpreter (lines 1150-1168) evaluates OR as AND and is replaced in this Quest."},
    {"id": "remove-safety-unchanged", "statement": "The remove-safety floor as amended by fix A (f50344e98) and its committed-node authority are not changed. The remove-safety owner exports one async input builder extracted refactor-only from the whole inline derivation (operation-workflow-remove-safety-evaluator.js:445-585 at 219c27bfe: committed node floor, removeSafetyReadiness, currentVoterReadyRows via isVoterReadyFloorCountableReplica, projected rows, getCriticalMinReplicaCount), used by the evaluator and the placement owner; the verifier shows no decision changes and attempts the counterexample of removing a seed replica while the only other voters are SYNCING."},
    {"id": "sibling-formation-constraints-honoured", "statement": "The sealed constraints of formation-ready-lease-independent-of-spread hold: ready-means-node-can-serve, no-pre-ready-placement (a target needs a valid READY lease in the committed node answer, re-checked at dispatch), one-formation-fact-consumed-where-it-protects (consumed as its latch, see formation-fact-latched-consumed), dead-ready-node-witnessed and join-core-coupling (its DT witnesses stay green)."},
    {"id": "hosts-not-node-ids", "statement": "Spread is counted in declared hosts: NODES.host_id from a required, explicit node configuration value (owner decision D3; WP-D fed85ec00), never inferred from node id, provider id or missing topology; a node without it is refused at start, and a row of an older version reads HOST_UNDECLARED and is not a placement target. NODES.host_id is declared in the schema with the node-local ensure; WP-D merges only behind the support-envelope fence of this release boundary, so no mixed-version nodes-p1 exists, and there is no capability-gated dual write. Every report and receipt states its unit. A synthetic 5-node/4-host topology witnesses host-distinct placement."},
    {"id": "message-groups-excluded-typed", "statement": "Message-group membership change stays refused by design (owner decision D4). The owner snapshot lists every message group, including mg-1, as UNSUPPORTED_ENTITY_KIND, and no receipt claims message-group spread; mg-1's seed-loss exposure is recorded on the service Quest."},
    {"id": "supersessions-recorded-first", "statement": "Before any source change, R09 supersession records are appended for each sealed claim this Quest contradicts, quoting the sealed sentence (at least blocked-spread-evaluation-event-wake, effective-placement-serial-priority-planner (priority-only scope), hold-engagement-single-owner-table, operation-ledger-self-move-hold-engagement, operation-ledger-self-move-hold-fairness, operation-ledger-self-move-waiter-fairness v1-v3, operation-ledger-self-move-holder-release-on-engagement v1-v2, priority-recovery-add-dispatch-cadence, movielens-create-budget-intent-serialization, ledger-quorum-spread-hold-cure-drain-admission v1-v2, operation-ledger-quorum-authoritative-release, formation-ledger-quorum-spread-first, formation-control-plane-move-interlock, spread-fence-proven-local-leadership-read), plus the R09 supersession of formation-ready-lease-independent-of-spread's 'Its definition and its existing consumers ... are unchanged by this quest' (formation-fact-latched-consumed); the contract-first transition record (design section 2.12) is written to evidence/transition.md."},
    {"id": "static-gates-and-ratchets", "statement": "No ratchet baseline is raised; baselines and the fallback census change only by removed occurrences; nothing moves into a file near the size limit; every checker the Solver and the pre-commit hook run is clean on the change set."},
    {"id": "lab-execution-product-defaults", "statement": "Suites and live runs execute on the lab through scripts/lab.js under the machine lock with thermal headroom, at product default timeouts (owner decision 2026-11-17). Full node logs, the harness report and the authoritative ledger time series per copy source are retained per run."},
    {"id": "source-change-subagent-verification", "statement": "Any source change is verified on the exact candidate by a fresh independent verifier before audit and landing (note --verification ... --verifier subagent:<id> --verdict approve), against the templates listed below."}
  ],
  "verificationTemplates": [
    "admission-gating",
    "formation-circularity",
    "owner-interaction",
    "harness-fidelity",
    "concurrency-serialization",
    "recovery-replay",
    "retry-loops",
    "transport-delivery",
    "sweep-timer"
  ]
}
```

### 4.2 Deterministic reproducer (WP-B; rev. 2 additions marked)

**File:** a new `test/convergence/dt-placement-owner-formation-drain.test.js`. It builds on the existing formation-joint-admission harness:
- `test/convergence/formation-joint-admission-world.js` (WLD);
- `-rounds.js` (RND);
- `-scenario.js` (SCN);
- `test/simulation/formation-sim-node-hosts.js:308-479`.

That harness already runs real owners in frozen time: readiness, membership publication, coordinators with workflow owners, `ReplicaDispatchService`, serve eligibility and NODES registration. The `dt-formation-joint-admission-release-liveness` test (DT) must stay green throughout.

**What the harness has today, and why it cannot see the mechanism (C, subagent census):**
- It seeds all 46 system partitions × 3 replicas plus `mg-1` × 3 on the seed (WLD:693-748).
- It mounts planners **only for the six priority partitions** (WLD:923-925, 1066-1068).
- It polls them every round (`planPriorityPartitions`, RND:490-502).
- Its replica-runtime double promotes every learner in one step (WLD:578-610).
- So the background wave never exists in it.

**Extensions:**
1. **Population and production composition (tree-agnostic).**
   - On every tree, deciders are mounted as the production composition builds them. On the candidate, that is one `UnifiedRebalancer` per partition on the partition's leader node, as `PartitionService.initializeRebalancer` does (`partition-service-rebalancer-methods.js:269-336`). On the owner tree, it is the `ReplicaPlacementOwner` constructed by control-plane setup and activated by ledger leadership.
   - Detection of which composition exists lives in the harness, never in `src`.
   - Observers (SCN:99-113, 217-226, 269-300) are extended to all 46 partitions plus `mg-1`.
2. **No placement polling.** `planPriorityPartitions` is removed from `round()` (RND:550). The series' timers stay armed and never fire: the stagger at `rebalancer-local-mutation-readiness-wake.js:33-34`, the 3× safety cadence at `rebalancer-planning-gate-methods.js:776-777`, the 60 s periodic and the leadership-start delay. They fall into `armedBounds` (RND:333-334). Execution cadences stay stepped by name (RND:92-117).
3. **Copy-source accounting.** The copy source of each CREATE is the partition's leader node at the time of the CREATE, read by the harness from the leader fixture (WLD:333-362). The harness does not read the new column, so the measure is identical on both trees. The replica-runtime double is otherwise unchanged. The assertions measure admission concurrency, which needs no cost model (lesson of the formation-sim calibration: no calibrated cost in a pass/fail assertion).
4. **Causal attribution.** Wrap the production persistence seam (`repository.persistNewOperation` today; on the owner tree, `requestPlacementAdmission` together with the applier's committed outcome), as BUD:290-320 and `dt6-priority-recovery-add-dispatch-cadence.test.js:446-458` already do. Record `(round, driver step, entity, class, source, target)`, where the driver step is one of `commit-delivery`, `membership-tick`, `coordinator-tick`, `cadence:<name>`, `owner-pass:<trigger>` or `planner-poll`.
5. **A time series** of unresolved ledger rows by copy source, target, type and class at every `observe()` (SCN:412-424).

**Assertions:**

| Id | Assertion | Expected on 219c27bfe + fix A + fix B |
| --- | --- | --- |
| A1 capacity | At every observation, copy-phase operations per copy source are ≤ `K_src` for classes 1-2 and repair, and ≤ `K_src − 1` for non-repair moves of classes 3-5; per target they are ≤ `K_tgt`. Founder rows are excluded (§2.5). The test runs at the D2 values (recommended 3, 2 and 2), and the reproducer additionally sweeps K = 1, 2, 3. | **RED.** Phase B admits 2 per target × 2 joiners = 4 background copies from the seed (`system-spread-transition-policy.js:313`, MAIN:1302-1314, BUD:379-403). The pre-gate showed 3-4 in copy phase. That exceeds `K_src − 1 = 2` for background. |
| A2 causality | Every admission is attributed to a committed change delivered in that step (`commit-delivery`, `membership-tick`, `owner-pass:{LEDGER_COMMIT, NODES_OR_FORMATION, SERVICES_CHANGED, PARTITIONS_CHANGED, LEADERSHIP_START}`). There are zero `cadence:*` (other than the named external cadences of §2.3: `membership-tick` and the execution retries), zero `planner-poll` and zero RESYNC admissions under the §2.3 attribution rule. No placement timer is in `timersThatWouldHaveToExpire` (SCN:527). Every refusal recorded in the run names its clearing trigger, and that trigger fires before the candidate's admission (rev. 1, review 7). | **RED.** After the first terminal, the non-winners need the 8,000+400·n ms stagger or the 3× safety cadence; nothing polls; the run reaches a fixpoint with deficits open |
| A3 work conservation | After each owner pass, no copy source has free capacity while an admissible candidate on it exists | RED (follows from A2) |
| A4 quiescence and completeness | A fixpoint with zero unresolved ledger rows; all 46 system partitions at RF 3 on 3 distinct READY nodes; no surplus; `spentBounds = []`; within the round cap. `mg-1` is asserted unchanged, with no message-group operation admitted (D4). | **RED** (stall) |
| A5 no churn | M further rounds after quiescence, plus redelivery of every terminal row, admit nothing | - |
| A6 order | No class-3-5 admission before `answerCommittedNodes().formation` is `FORMED` (rev. 3). The exclusive time of each ledger move and the time to the latch are recorded (rev. 2, R6). From the commit of an engaged ledger operation until its terminal, no other admission commits. Its hold is released only when no other copy-phase row exists, and a removal-phase row does not delay the release (rev. 1, review 5). `nodes-p1` is the first background admission. Within a class, the admission order matches §2.6. | partly |
| A7 accounting | Exactly 2 placement operations per seed-only RF3 partition (80 background, 12 priority); zero FAILED placement operations; never two incomplete operations on one partition outside one FOUND set. **A FAILED move re-planned with membership unchanged is admitted under a new operation id** (the pre-gate shape of 17:24:22 and 17:24:37; review 3). | - |
| A8b routing and image (rev. 1) | Every admission proposed from a non-leader composition reaches the applier through the partition message route. No admission or refusal comes from `SQLQueryEngine` or `SQLParser`. Every node's `SystemTableCache` applies every admitted row with its primary key. | - |
| A10 founding (rev. 1, rev. 2) | A CREATE TABLE issued during the background drain admits its whole founding set in one FOUND command at once. It is not counted against `K_tgt` or copy capacity, and it never waits on `TARGET_AT_CAPACITY`. **(rev. 2)** After a lost answer, a fresh-entryId FOUND for the same partition gets `ALREADY_FOUNDED` with the original founder ids: the partition is founded exactly once, and provisioning adopts the ids. **(rev. 3)** If every founder of that set is FAILED (injected at the replica-handler double), the job's next FOUND admits a new set and the table becomes routable. | - |
| A11 CDC bound (rev. 2) | With the ledger partition's CDC owed ledger at its bound, `PLACEMENT_ADMIT` is refused `CDC_CAPACITY` (at request or apply), and the candidate is admitted in the step after the CDC acknowledgement commit, attributed to `LEDGER_COMMIT`. | - |
| A8 sweep and safety | Over DT's SWEEP of 9 arrival orders (DT:72-95), with `assertSafety` (no floor violation, no pre-READY target, no gate open before the summary) on every order | - |

**Paired witnesses on the owner tree** (each must be RED, proving that the assertions discriminate):
- **N1:** owner with the `LEDGER_COMMIT` trigger disconnected (resync only, never fired). A4 is red.
- **N2:** the capacity check removed from the applier. A1 is red.
- **N3:** the formation gate removed. A6 is red.
- **N4:** the busy check removed from the applier, with a terminal row redelivered and a proposal duplicated after `UNKNOWN` (same entryId). A7 is red.
- **N5 (rev. 1):** the operation id minted from a hash of (partition, kind, target, membership) instead of the apply index. The A7 re-plan case fails with a primary-key collision.
- **N6 (rev. 1):** the ledger hold released at admission (IDLE_ONLY at admission, the rev. 0 rule) while lower classes keep admitting. A6 is red: the ledger operation is overtaken.

**Variants:**
- **V1 owner churn:** transfer ledger leadership to j1 mid-drain, after the first background admissions, and back. A1, A4 and A7 hold; no entity is skipped; nothing is admitted twice.
- **V2 host topology:** 5 nodes on 4 declared hosts (two nodes share a host). Every system partition reaches 3 distinct hosts, never two replicas on the shared host while a third host is free (ruling 2026-10-04).
- **V3 dead READY joiner** (sibling witness restated): j2 dies after READY. Its lease lapse triggers `FAILED_OR_DEAD` deficits, and the floor is never violated. After the latch, classes 3-5 including their repair keep progressing; before it, the formation fact reports not FORMED.
- **V4 (rev. 3, replaces the rev. 1 capability witness):** none in this Quest. A mixed-version ledger cannot form inside the support envelope. That refusal is the support-envelope owner's witness (join admission `OUTSIDE_SUPPORT_ENVELOPE`), recorded as precondition P6 evidence (§5).
- **V5 write-path refusals (rev. 1):** inject `BACKPRESSURE`, `CUTOVER_PAUSED`, `CONSENSUS_SESSION_OPEN` and `COMMIT_DEADLINE_EXCEEDED` at the ledger partition's write kernel. Each candidate waits under its typed reason, and its admission is attributed to that reason's clearing trigger, never to RESYNC.

**Witness W-T: cross-coordinator target census** (receipt `cross-coordinator-target-census-witness`; the external review's schedule, §1.6). It is a focused test, `test/rebalancer/placement-admission-cross-coordinator-target-census.test.js`.

**World.**
- Three nodes A, B and C, each with **its own** `SystemTableCache` and **real** `RebalanceCoordinator` / `OperationWorkflowOwner`, built by the production composition (`createSimulatedNodeHosts`, `test/simulation/formation-sim-node-hosts.js:308-479`).
- **One shared durable `replica_operations` store:** a real `replica_operations-p1` `PartitionService` and its committed apply path (with the `PLACEMENT_ADMIT` applier on the owner tree), behind the real gateway and repository, with the canonical schema executed by SQLite (rev. 1).
- **Not** `createTestCoordinator` and **not** the `test-helpers.js` SQL interpreter.
- Cache publication to C is **held** at the CDC delivery boundary (the real cache-apply entry, as in the sibling harness's stage 1b).

**Schedule.**
1. Through the tree's admission entry on node A, two live system-partition ADDs targeting B are admitted. On the candidate that entry is `createOperation`; on the owner tree it is `requestPlacementAdmission`, proposed from A's composition through the partition message route to the ledger leader. The rows are durable, and C's cache lacks them.
2. Through the tree's admission entry on node C, a third ADD of a different system partition targeting B is attempted, with the same `K_tgt = 2` the candidate documents (Phase B 2 per target).
3. **Assert refusal:** no third unresolved row targets B in the durable store. On the owner tree, the refusal is the applier's committed outcome `REFUSED{TARGET_AT_CAPACITY}` for C's entryId, reached through the partition message route. **Any other refusal fails the witness:** a parser refusal (`INSERT_SELECT_UNSUPPORTED`), a routing refusal or a leadership refusal is a false green (rev. 1, review 1).
4. One of A's operations reaches a **genuine terminal release** through its real workflow transition (no row edit), on the **same retained** coordinator, repository and cache bindings (no rebuild).
5. C's cache is still held. Assert that **admission now proceeds**: the owner tree's `LEDGER_COMMIT` pass admits C's candidate. It is the same deficit, so on the candidate side the equivalent is a re-attempt through the same entry.
6. Release C's cache and assert that nothing changes: no duplicate operation and no second admission.

**Expected:**
- **RED on `219c27bfe` (plus fixes A and B) at step 3.** C's target-slot admission reads the cache (lacks A → B), `coordinator.operations` (never assigned), its own `recentOperationIntents`, and `lastIncompleteOperationObservation` from `SELECT_INCOMPLETE_OPERATIONS` bound to `[C, C]`, which excludes A → B. It admits a third (`rebalance-coordinator-concurrent-budget-gate.js:19-75`; `replica-operation-repository-incomplete-read-methods.js:365-369`).
- **GREEN under the owner:** the apply-time COUNT over all committed rows refuses at 2, and admits after the terminal.
- **Paired control on the owner tree:** an applier whose target count is scoped by the proposer's node id (the candidate's semantics re-encoded) makes step 3 red. This proves that W-T discriminates.

**Seal:** run on the lab on the composed base (`219c27bfe` plus fix A plus fix B). Record A1, A2, A4 and W-T step 3 red with the stuck-state digest, then `node scripts/solve.js start --id replica-placement-admission-owner`. The integration owner's WP-B is writing `quest.json` now; it must carry the rev. 1 record of §4.1.

### 4.3 Owned roots that must stay green

- `test/convergence/dt-formation-joint-admission-release-liveness.test.js` (all subtests)
- `test/convergence/dt6-priority-recovery-add-dispatch-cadence.test.js`, with its property restated: sibling priority ADDs are admitted concurrently up to capacity
- `test/rebalancer/coordinator-dedup-gap.test.js` and `rebalancer-own-create-memory-duplicate-replace.test.js` (their dedupe property is restated against the applier's busy rule and the entryId outcome record)
- the remove-safety suites changed by fix A (`*remove-safety-quorum-predicate*`, `*stopping-reconcile-source-handoff*`)
- `test/bootstrap/owners/bootstrap-readiness-lifecycle-source.test.js` (kept, independent)
- `replica-operation-confirmation-authority-read.test.js` (kept)
- the join-core wide net named in memory `join-core-systemic-coupling`: the `node-joining|operation-ledger|formation|spread|replica-recovery|learner-promotion` globs

### 4.4 Physical acceptance (WP-J, rev. 1 per D1(b))

**Receipt `lab-formation-drain-mechanism-metrics`.** Three consecutive lab runs on one commit:
- `node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes tv-dator,adam-laptop,adams-gamla`;
- the journey's own predicates and its 420 s bound are unchanged. Its verdict is recorded for the service Quest, not claimed here;
- the authoritative ledger is observed until quiescence, within an observation bound of this Quest. The bound is preregistered at seal (recommended 1,800 s, from the §2.11 model). It is not a change to the journey's bound.

Each run must show:
1. copy-phase operations per copy source ≤ the §2.6 per-class limits, and per target ≤ `K_tgt`, at every authoritative ledger sample;
2. `placementResyncAdmissions = 0`, with every admission attributed to its clearing trigger;
3. zero FAILED placement operations. A FAILED caused by an execution defect, for example mechanism C, fails the run and is routed to its owner; it is not excused;
4. quiescence with all 46 system partitions on 3 **declared hosts**, and `mg-1` listed as `UNSUPPORTED_ENTITY_KIND`;
5. the founding set of the journey's CREATE TABLE admitted in one FOUND command, never waiting on capacity;
6. recorded: time to the formation latch, time to quiescence, and ledger-leader changes during formation (R10).

**Moved with the journey (D1(b)):** the 3/3 journey receipt and the `comparative-smoke-setup` receipt now sit with the service Quest and the campaign. So do their tooling preconditions: P2, the lab target's `capability.thermalEndpoint` (`comparative-benchmark-lab-hosts.js:169`, produced by `scripts/lab/probe.js discoverFleet`); and P3, a thermal gate in `lab harness run`.

**P1 applies here too.** `local-three-node.json` drops `timeouts.joiningHttpTimeoutMs` (60000) and `joiningLeadershipWaitTimeoutMs` (240000), and the deployer's F28 widening is reverted (owner decision 2026-11-17).

---

## 5. Staged implementation plan (rev. 3)

Each WP lists the files it owns. Lanes marked ∥ run in parallel, in separate worktrees (memory `quest-worktree-isolation`). Merges into the Quest worktree are serial, one writer per interaction, and the tree is green (static gates plus owned roots) after every merge.

| WP | Lane | Depends on | Owns (writes) | Leaves the tree green because |
| --- | --- | --- | --- | --- |
| **WP-A** Measurement (no source change) | ∥ | - | evidence only: `solve/quests/replica-placement-admission-owner/evidence/seed-cost/` | Nothing changes. **Part 1, on `219c27bfe`:** <br>• seed CPU attribution during the background wave (planning and wakes, workflow and ledger writes, CDC, Raft ticks of co-located replicas, `db.prepare`); <br>• throughput per **copy-phase-only** concurrency from the authoritative ledger, with stall incidence; <br>• the copy source of a learner's catch-up confirmed in the replica handler (R3); <br>• **ledger-leader changes during formation**, with their election cause (review 13; pre-gate logs plus one profiled run); <br>• the lag of copy-phase exit caused by deferred-local priority progress; <br>• existence of the clearing events needed by §2.7 (pause release, session close, storage-projection subscription, governor state change). <br>**(rev. 2, R6)** the exclusive time per ledger move (from the engaged commit to terminal) and the time to the formation latch. <br>**Part 2, on WP-F's tree before WP-J:** a K sweep (`K_src` = 1, 2, 3) on the lab to freeze D2, also recording the exclusive time per ledger move. |
| **WP-B** Reproducer and W-T | ∥ | - | `test/convergence/formation-joint-admission-{world,rounds,scenario}.js` (shared with DT, so DT must stay green); the new `test/convergence/dt-placement-owner-formation-drain.test.js`; the new `test/rebalancer/placement-admission-cross-coordinator-target-census.test.js` (per-node caches, held CDC delivery, one real SQLite ledger, no `test-helpers.js`); `test/shards/*` metadata; **`quest.json` per §4.1 rev. 1** | Test-only. Measured red on the candidate (receipts 1 and 2), then sealed. |
| **WP-C** Supersession census and transition record | ∥ | - | Quest log, `evidence/transition.md`, `evidence/supersessions.md` (including the R09 note on the formation latch) | Records only. Precedes WP-E's source change. |
| **WP-D** Host identity (rev. 3: no capability token) | ∥ | D3 (decided); **P6 before it merges** | Landed as `fed85ec00` on its branch (C: `git show --stat`). It touches `NODES.host_id` in `NODES_SCHEMA` with the node-local ensure; `readNodeHostIdentity` as the one reader (`HOST_UNDECLARED` only for rows of older versions); the required `NODE_HOST_ID` / `node.hostId` with typed refusals `NODE_HOST_ID_REQUIRED` / `NODE_HOST_ID_INVALID`; the chart from `spec.nodeName`; every harness and start site, with a start-site census test. | An additive column, written by the owner of NODES. **(rev. 3) Merge precondition P6:** an upgraded node's NODES lifecycle write that references `host_id`, applied on an old-code `nodes-p1` replica, would fail "no such column" and diverge. This release boundary is therefore fenced by the support-envelope owner (founding D7: a certified pair excluding pre-change sources, join refusal `OUTSIDE_SUPPORT_ENVELOPE`, the seed's typed founding-layout refusal), so no mixed-version `nodes-p1` exists. **No capability-gated dual write.** The rev. 2 `placement-admit-v1` token is withdrawn. |
| **WP-K** Fix the coordinator test double | ∥ (test-only), merged before WP-G's G2/G3 | - | `test/rebalancer/test-helpers.js:872-` (`createTestCoordinator`): the hand-written `replica_operations` interpreter (`:1150-1168`, OR evaluated as AND) is replaced by executing the canonical SQL on an in-memory SQLite built from `REPLICA_OPERATIONS_SCHEMA` | The 82 users run. Each newly red file is classified as reliance on the bug (repaired in the test) or a masked product defect (finding, R17). |
| **WP-E** Typed admission command, the missing owner events, and the pure owner core (rev. 2) | after WP-C; ∥ with WP-B | WP-C | **New:** <br>• `src/partition/partition-placement-admission.js`: `requestPlacementAdmission`, `applyPlacementAdmission`, `applyPlacementHoldRelease`, in the step order of `applyCoordinatorSettlement` (§2.5), plus the identity module (operation and replica ids); <br>• pure modules `src/rebalancer/replica-placement-owner-{deficits,order,constants}.js`. <br>**Edited:** <br>• `src/partition/partition-service-entry-apply-base.js`: the apply dispatch beside `COORDINATOR_SETTLEMENT_TYPE`; the routed message case beside `:425-426`; `isRemovalServingRequestType` (`:388-399`); <br>• `partition-service-constants.js` (command and message types); <br>• `partition-committed-command-admission.js` (the type is known); <br>• `partition-cdc-owed-admission.js` (`requiredCdcSlots` counts the command's rows); <br>• `src/bootstrap/system-table-runtime-schema-definitions.js` (`copy_source_node_id` in `REPLICA_OPERATIONS_SCHEMA`) and the node-local ensure (`partition-service-entry-apply-base.js:114-`); <br>• `src/rebalancer/replica-operation-step-policy.js` (`COPY_PHASE_STEPS`); <br>• `operation-workflow-remove-safety-evaluator.js` (the async input builder over `:445-585`, refactor-only). <br>**The widening into four owners (R8; mandatory, recorded R16):** <br>• `storage-capacity-semantic-projection-owner.js` (a change subscription: `TARGET_CAPACITY_CHANGED`); <br>• `partition-participant-transaction-pause.js` (a pause-release event) and `partition-write-kernel.js` (a consensus-session-close event): together `WRITE_PATH_RELEASED`; <br>• `pressure-governor.js` (a state-change subscription: `PRESSURE_RELEASED`). <br>**Tests:** `test/partition/placement-admission-*.test.js`, `test/rebalancer/replica-placement-owner-*.test.js`, one test per new owner event. | **First falsifiers (rev. 2):** <br>**F1, routed:** a `PLACEMENT_ADMIT` from a non-leader composition reaches the leader's applier through the message route. It answers ADMITTED, ADMITTED, `REFUSED{TARGET_AT_CAPACITY}`, `REFUSED{PARTITION_BUSY}`, and never a parser, route or engine refusal. <br>**F2, CDC image:** through `recordCommittedOperationCdc` and real delivery, every receiver's `applySystemTableChange` applies the admitted row with its primary key. <br>**F3, why the version fence is needed (rev. 3):** a test shows that an applier without the type refuses the entry `COMMITTED_COMMAND_UNRECOGNISED` and wedges. The fence itself is the support-envelope owner's (P6), and no placement capability check exists. <br>**F4, re-plan:** a FAILED move with unchanged membership is re-admitted under a new id. <br>**F5, the same entryId committed twice in the log** (re-proposal to a new leader after an unknown outcome): the second apply replays the first answer. There is no `PARTITION_BUSY` clash and no second FOUND. <br>**F6:** every definite refusal emits `ENTRY_COMMITTED`. <br>**F7, reservation:** with a PREPARED participant transaction on the ledger, the entry is re-parked: consumed without effect, its key unsettled, and applied after the decision. <br>**F8, CDC bound:** with owed events at 4,096 (probe2's setup), the command is refused `CDC_CAPACITY` at request and at apply, and admitted after the acknowledgement. <br>**F9, FOUND twice** under fresh entryIds answers `ALREADY_FOUNDED{operationIds}`. **(rev. 3) F9b:** when every founder row of the first set is FAILED, a new FOUND admits a new set with new apply-index ids. **F9c:** a mixed set (one FAILED, one ACTIVE) still answers `ALREADY_FOUNDED`. **F9d:** a system-catalog partition id answers `SYSTEM_PARTITION_SEED_FOUNDED`. <br>**F10, schema:** a replica created by the new version has `copy_source_node_id`. No replicated ALTER is ever proposed. <br>**F11, the four owner events** fire on their state change, and the owner's pass consumes them. <br>**If F1-F11 cannot be made true, stop and report. There is no check-then-insert fallback.** Not wired to the owner yet. |
| **WP-F** Cutover (single writer, serial) | - | WP-B sealed; WP-E (including the four owner events) and WP-D; D5 (decided 2026-11-18); **P4** (the formation-latch Quest's S4 landed: `answerFormation()`); **P5** (agreement written into both designs, verified in rev. 3); **P6** (the support-envelope fence for this boundary) | `src/bootstrap/shared/control-plane-setup.js` (construct the owner); `src/partition/partition-service-leader-activation-methods.js`, `partition-service-rebalancer-methods.js` (ledger-leadership activation, capability fence, no placement rebalancer); `src/rebalancer/replica-placement-owner.js` (pass, triggers, attribution, snapshot including `UNSUPPORTED_ENTITY_KIND`); `rebalance-coordinator-operation-creation*.js` (post-admission claim and dispatch reused, honouring the durable hold); `unified-rebalancer*.js`, `move-planner*.js` (stop creating; precedence and scorer consumed); provisioning (`sql-query-engine-initial-partition-provisioning.js:390-420`, `sql-query-engine-provisioning-admission-methods.js:478-499`) switched to FOUND; runtime-service proposals; the evidence on bypass inserts S9 and S10 | Reproducer, W-T, DT and owned roots green; negative controls N1-N6 red. **One behaviour change, with no dual path at any point.** |
| **WP-G** Deletion and census | G1-G4 ∥ off WP-F's head, merged serially | WP-F, WP-K | **G1:** `src/rebalancer` and `src/partition` deletions per §1.2, S9 and S10 if proven, `rebalance-replace-intent-identity.js` and the spread-cure authorization object (rev. 2), `test/rebalancer/removed-placement-scheduler-census.test.js`, and the **refusal-to-trigger static check**. **G2:** `test/rebalancer/*` migration (the §1.4 dispositions). **G3:** `test/convergence`, `test/partition`, `test/integration` migration (126, 122, 73 and 82 coupled files; each gets a verdict). **G4:** `test/shards/impact-contracts.json` (IC:2169-2212, 4714-4779 and others), ratchet baselines (removal only), complexity baselines (tighten), `solve/changes/*inventory*`, `src/rebalancer/INDEX.md`, docs | Each lane is green against WP-F plus its own files; the merged result is green before the attempt is recorded. |
| **WP-H** Gates | - | WP-G | none (runs) | Lab full suite, pre-commit hook, `npm run -s test:duplication`, complexity ratchet, verification-freshness check. |
| **WP-I** Independent verification | - | WP-H | records | A fresh verifier with the nine templates, the remove-safety counterexample, the paired witnesses and the composed tree digest. |
| **WP-J** Physical | - | WP-I, WP-A part 2 (D2 frozen), P1 | evidence | The §4.4 receipt. A red run is diagnosed at its first divergence before any rerun. |

**Preconditions owned elsewhere (recorded, not absorbed):**
- **P1:** product-default timeouts in the lab configuration and deployer (F28).
- **P4 (rev. 3):** the formation-latch Quest (`formation-latch-design.md`, its S4): the `cluster_formation` record and `ServeEligibilityOwner.answerFormation()`, surfaced as `answerCommittedNodes().formation` with the states FORMED / FORMING / UNDECLARED / UNAVAILABLE. It must exist before WP-F, and there is no interim live mode.
- **P5 (rev. 2):** an **interface agreement only**, written into both designs before WP-F (§2.13): the founding marker and its retention, the `foundingIntentId` shape, the PROMOTE step set, voter-target consumption, and that seed-bootstrap founding is outside `PLACEMENT_ADMIT`. It is not a build dependency, so there is no cycle with founding's WP-F1, which follows this Quest's WP-F. The FOUND applier and the provisioning switch are this Quest's.
- **P6 (rev. 3): the support-envelope version fence for this release boundary**, through `support-envelope-owner.js` (founding D7):
  - a certified pair excluding pre-change sources;
  - join refusal `OUTSIDE_SUPPORT_ENVELOPE` (`resolveJoinSupportEnvelopeConflict`);
  - the seed's typed `ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED`.

  **It is a precondition of WP-D merging** (no mixed-version `nodes-p1` may apply a NODES write that references `host_id`) and of WP-E and WP-F (no ledger replica without the applier). There is no capability-gated dual write.

**Ordering rationale:**
- WP-A (part 1), WP-B, WP-C, WP-D and WP-K start together. WP-E starts after WP-C.
- WP-F needs the sealed reproducer, the typed command, the four owner events, D5 (decided), P4, P5 and P6.
- WP-G parallelizes the migration by disjoint file sets.
- WP-J runs only after WP-A's K sweep has frozen D2.

---

## 6. Risks and owner decisions (rev. 3)

### Decided by the owner (2026-11-17 and 2026-11-18)

- **D5 (2026-11-18).** RESYNC may admit, under the four binding conditions (§2.3). The text is kept below, under its original heading.
- **Reads before formation (2026-11-18).** Reads are allowed before formation; only writes and DDL are refused. `CLUSTER_FORMATION` is not a HARD `/readyz` dependency. Placement's class 3-5 gate is unchanged (§2.6).
- **D6** is withdrawn by rev. 3 (P6 fences the boundary).

- **D1 = (b).** The 3/3 journey and the comparative smoke setup stay with the service Quest and the campaign. The founding-membership Quest (one founding voter, up-replication by ADD) is separate, with its design in progress. This Quest's physical receipt is the formation drain's mechanism metrics (§4.4).
- **D3.** Host identity is a required, explicit node configuration value, persisted in `NODES.host_id`; a node without it is refused at start (WP-D).
- **D4.** Message groups are excluded and listed in the owner snapshot as `UNSUPPORTED_ENTITY_KIND`. **Action for the integration owner:** record `mg-1`'s seed-loss exposure on the service Quest's log. I have not written to any Quest log; the worktrees are read-only to me.

### Open (the owner's call only): D2; the D5 and D6 entries below are kept for history (rev. 3)

**D2. Capacity values** (the reviewer's preference, which I now share after the corrected data in §2.11; re-review agrees: `K_src = 3`, `K_tgt = 2`, pending the WP-A sweep). **Recommendation:**
- `K_src = 3`: classes 1-2 and repair may use 3; non-repair moves of classes 3-5 may use 2;
- `K_tgt = 2`;
- fixed owner constants, revisable only on evidence;
- frozen after WP-A part 2's K sweep (1, 2, 3) on copy-phase-only counts with stall incidence, before WP-J.

The corrected pre-gate window showed 7.5 s per copy at 3-4 in copy phase against 16.4 s at about 2 (stall excluded).

**D5. May a RESYNC pass admit? DECIDED by the owner, 2026-11-18:** yes, under the four conditions below, which are now binding (§2.3, constraint `no-timer-no-bound-no-retry`).
- Options:
  - (a) It may admit through the same decision algorithm, but each such admission is a counted lost-edge defect with a typed finding naming the clearing trigger that did not fire. Acceptance requires zero, and the reproducer runs with resync disabled.
  - (b) RESYNC only detects: it raises a typed alarm and admits nothing.
  - (c) No resync.
- **Decided: (a), under the four conditions** (rev. 2 wording, decided rev. 3):
  1. every refusal's clearing trigger exists in code before WP-F, verified by a WP-G static check, with no waiting reason naming RESYNC or `retryAfterMs`;
  2. RESYNC runs the identical pass, with one declared constant interval that is never tuned in response to findings;
  3. any production RESYNC admission raises a typed lost-edge alarm naming the missing trigger, fixed at that trigger's owner;
  4. zero RESYNC admissions is evidenced in the WP-J runs, the reproducer runs with RESYNC disabled, and N1 stays red.

  The authority-and-recovery contract allows periodic reconciliation through the same owner ("one decision algorithm, multiple legitimate triggers") and requires that recovery eventually resume. (b) would turn every lost edge into a permanent stall pending an operator, violating "fail-closed without an owned continuation is not completion".
- The difference from d75b01706's "fallback timers remain as the safety net" is that (a) is never relied on: zero RESYNC admissions is an acceptance criterion, every occurrence is a defect, and attribution is per candidate, so merged reasons cannot hide one.

**D6. Withdrawn (rev. 3).** The mixed-version placement pause cannot arise. In-place upgrade across this release boundary is unsupported and fenced by the support-envelope owner (founding D7, P6), so no ledger replica runs code without the `PLACEMENT_ADMIT` applier. The rev. 2 correction stands as the reason the fence is needed: an old replica would refuse the command `COMMITTED_COMMAND_UNRECOGNISED` and wedge.

### Risks (not decisions)

- **R1, throughput.** 600-1,310 s of background drain after the priority phase at the corrected rates (§2.11). It is addressed by D1(b), not by this Quest.
- **R2, the new committed command type (rev. 1; replaces "conditional insert support").**
  - Apply determinism: the applier reads only committed rows and command fields, never the clock, cache or locale.
  - Mixed versions: excluded by the support-envelope version fence (P6, rev. 3). F3 documents the wedge it prevents.
  - The routed request path: F1.
  - If F1-F6 cannot be made true, WP-E stops and reports.
- **R3, copy-source identification (P).** Catch-up may not come from the group leader. WP-A confirms it.
- **R4, stuck operations keep their partition busy.**
  - This is correct, and the ledger hold is scoped to the copy phase, so a stuck removal blocks only its own partition (§2.5).
  - Execution defects become visible as formation stalls: mechanism C (`replace_target_dead_before_intent` on a live node, `operation-workflow-recovery-status-reconcile.js:73-75`, after `replica-handler-release-recovery.js:296`) and a cleanup REMOVE stuck in STOPPING. They are routed to their owners (R17), and the §4.4 receipt fails on them, by design.
- **R5 and R5b, migration size** (126, 122, 73 and 82 coupled test files) and the test-double repair (WP-K).
- **R6, concentration on the ledger leader** (admission plus claim and execution). It is unchanged at formation and acceptable in steady state. Handing execution to the entity leader is a later change if needed.
- **R7, cost of authoritative SERVICES and PARTITIONS reads.** They are re-read only on their own trigger (§2.3). At large scale, a position-bounded cache read is the follow-up.
- **R8, residual stale-read window** after a services-p1 leader change. It costs liveness only, as a typed dispatch refusal followed by a re-plan.
- **R9, findings recorded, not absorbed (R17).**
  - the audit's non-formation findings;
  - the four-way feature detection in `readAuthoritativeControlPlaneRows`;
  - the alias reads in `effective-placement-serial-priority-planner.js:54-61`;
  - the per-group 20 ms Raft tick;
  - learner promotion as an event;
  - REMOVE_REPLICA outside the ledger during split and merge (S7);
  - the runtime-service reconciler's 5 s interval;
  - the execution-side elapsed-time decisions (§1.2(e));
  - the 5 s membership driver that produces the formation publication;
  - deferred-local priority progress;
  - mechanism C.
- **R10, the ledger leader leaves the seed by election** (review 13). Raft election timeout of about 1 s against seed stalls of up to 2.1 s; 9 of 9 runs on 2026-11-11. The owner is correct under churn (V1), but each churn moves admission and costs a full re-read pass. WP-A measures the frequency. Keeping the leader stable under seed stalls is the seed-load work of D1(b), not a timeout change.
- **R11, the missing owner events (rev. 2, R8: confirmed missing).** `WRITE_PATH_RELEASED`, `PRESSURE_RELEASED` and `TARGET_CAPACITY_CHANGED` do not exist. Creating them edits four owners' files: the participant-pause owner, the write kernel, the PressureGovernor and the storage-capacity projection owner. This is an explicit widening (R16), owned by WP-E and recorded in the constraint `every-refusal-has-a-clearing-trigger`. All must exist before WP-F, or RESYNC becomes the exit (forbidden by D5's condition 1). Never substitute `retryAfterMs`.
- **R12, P4 (the formation-latch Quest's S4, rev. 3) is on the critical path of WP-F.** If it is not ready, WP-F waits. There is no interim live-summary mode.
- **R13, P5 couples this Quest to the founding-membership Quest through an interface agreement only (rev. 2).** The provisioning switch in WP-F waits for the agreed fields (§2.13), not for founding's build. Founding's text still says "conditional ledger insert" and "lane" (§2.13 (e)).
- **R14, the ledger move's own stall (rev. 2, R6).** While a ledger operation is unresolved, every admission waits, FOUND and runtime services included. Its own removal-phase stall (a stuck STOPPING) extends that freeze; memory `operation-ledger-self-move-hold-engagement` measured 29.9-57.8 s of exclusion per self-move. It is measured (WP-A, A6, WP-J), and the ledger's stuck-STOPPING path is routed as a **prerequisite finding** to the workflow and replica-handler owners. The exclusivity itself is kept: it is the hold quests' protective intent.
- **R15, `_partition_statement_outcomes` has no retention (rev. 2, R10; pre-existing).** Every `PLACEMENT_ADMIT`, refusals included, adds a settled-outcome record, and settled keys replay for ever by design. Growth is proportional to proposals. It is recorded as a finding for the statement-outcome retention owner (the 2026-11-11 statement-outcome dedupe-horizon question). It is not repaired here.
