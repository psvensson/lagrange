# Overflow-budget decision matrix

Generated from `overflow-budget-decision-matrix.json` by `test/rebalancer/overflow-budget-audit-render.js`. Do not edit by hand: the matrix validator re-renders and compares.

- **quest**: critical-spread-overflow-budget-audit
- **epic**: formation-seed-decoupling
- **measured at head**: 902714be831a8dea3963b0e6cc098932e6b5457b
- **purpose**: Enumerate every production path whose success can currently depend on the bootstrap overflow budget, and determine what explicit authority would have to replace that budget before enforcement can remove it.

## Method

- **what the budget is**: The count check's cap is targetReplicaCount + (one replacement voter or single-voter expansion) + temporaryOverflowVoterBudget. On the promotion path the budget comes only from resolvePriorityRecoveryTemporaryOverflowVoterBudget, which returns the constant 2 when priority recovery is active, the target is positive, there is at least one learner, the voter count is at or above target, and either an active operation is counted or the planner is unresolved.
- **correction**: The completion owner also accepts an allowTemporaryOverflowPromotion option that SHORT-CIRCUITS all of those conditions (src/control-plane/priority-recovery-completion.js:110-115). It is a disjunction, not a conjunct. The promotion guard's own call site never passes it (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177), so on this path the five conditions are the whole rule - but a brief or a repair that reads the option as a required conjunct is reading the code wrongly.
- **grid**: 18432 rows, 3000 with a non-zero budget, 600 budget-admitted
- **grid domain**: targetReplicaCount 0..5, activeVoterCount 0..7, learnerCount 0..3, isJoiningExistingGroup, hasOwnedAddLikeOperation and isCriticalSystemPartition over both values, activeOperationCount 0..2, plannerReady and priorityRecoveryActive over both values.
- **completeness argument**: Nothing outside the domain adds a class. The budget the completion owner returns is either 0 or the single constant 2, and it enters the cap as one additive term (allowances.additionalVoters), so a row admitted with it and refused without it is over the budget-free cap by exactly 1 or 2 for any counts whatever. The only other dimension the cap has is whether a replacement or single-voter-expansion allowance is in force. Four classes therefore exhaust the arithmetic.
- **the even-voter gate**: The budget also feeds anyAllowance in resolveCountCheckRefusal, so it could in principle open the even-voter gate. MEASURED over the whole grid: it never does. The budget's own precondition activeVoterCount >= targetReplicaCount makes the cap comparison refuse first whenever no allowance is in force, and whenever an allowance IS in force that allowance has already opened the even gate. Every budget-admitted row is refused for would_exceed_target_replica_count and never for would_cause_even_voter_count.
- **the partition domain**: The guard treats all 45 declared system-table first partitions as bootstrap-critical, but the budget can only be non-zero on the 6 priority-control-plane ones. resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane is true, and its other disjunct is itself only reachable for such a partition, so for the other 39 the budget input is undefined and the cap is identical with and without it. Six of the owner's seven named partitions are in that 39.
- **row identity**: Rows are producer-differentiated, because the owner's path column asks for the production producer path. The GRID has no producer dimension, so the lead ruled how receipt 2's sealed wording is met; the ruling is recorded under leadRulings below and implemented by the grid test.

## Limits of this method

- READ-ONLY with respect to production: no file under src, examples, .github or .githooks changed, and the landed carry stage's semantics are untouched.
- Frequency of observation is never a proof criterion here. Every formationEvidence field is separate from the disposition and upgrades nothing, and the validator refuses frequency language in every free-text field of a row.
- Formation counts are PER MACHINE and never pooled. The four-core machine added on 2026-09-19 is a separate, adversarial class and is not included in any count here.
- The lab lines cited come from the ROUND-1 carrier (scratch commit ca8e7fa67), which supplied a membership epoch to the evaluation. The LANDED carrier supplies none, so no landed run can produce an honoured or a stale reading. Lines about honoured and stale are therefore evidence about a superseded tree.
- No formation was run for this quest. No corpus, no npm test.
- The producer census is a call-site census over src. It cannot see a producer that reaches an operation row by a shape none of its patterns match; what it does guarantee is that a new call to any of the censused sinks turns the receipt red.
- Seventeen of the twenty-seven rows are still-unclassified. Each states what would classify it, and none of them is counted as classified anywhere in the gate. Where the answer was in doubt the row is still-unclassified, including where round 2 had classified it.
- Reachability is reported in TWO fields. guardReachable yes means the state was driven on the real guard; producerReachable yes means the REAL producer reached that guard through the real operation representation and the real coordinator and repository path, with nothing hand-built in between. A hand-built grid proves guard behaviour only, and rows whose producer is not driven say unproven.
- No lab line in this matrix attributes a transition to a producer. Each formation entry that records one reads "lab witness: transition observed; producer unattributed" and upgrades nothing.
- This audit chooses no canonical epoch reader, no membership-ceiling formula and no name for the authorized count, and it claims no completeness for the epoch domain.
- The twenty admission classes partition the COUNT CHECK's arithmetic decision space, measured on the real evaluation over the whole stated grid. They are NOT a claim that each class is separately occupied by a production-shaped state driven through the full guard: a row's admissionClasses list says which classes its state SHAPE selects. An independent probe that drives the full guard over a narrower construction reaches 4 of the 20, and that is a property of the construction, not a refutation of the partition. Per-class end-to-end occupancy is an open question this audit does not claim to have settled.

## The measured partition sets

- **bootstrap-critical**: 45 partitions
- **mintable**: 5: control_plane_publications-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, schema_operations-p1
- **budget-evaluated**: 6: control_plane_publications-p1, replica_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, schema_operations-p1
- **critical without a mint**: 40
- **the owner's seven**: replica_operations-p1, services-p1, nodes-p1, partitions-p1, message_groups-p1, tables-p1, config-p1
- **the remainder**: 33: indices-p1, logs-p1, live_queries-p1, contexts-p1, code-p1, node_endpoints-p1, service_definitions-p1, service_bindings-p1, service_endpoints-p1, service_timers-p1, service_packages-p1, service_revisions-p1, service_installations-p1, service_install_failures-p1, module_manifests-p1, package_registry_mappings-p1, package_registry_overrides-p1, module_dependency_locks-p1, wasm_operations-p1, schema_migrations-p1, schema_migration_partitions-p1, debug_sessions-p1, debug_breakpoints-p1, debug_snapshots-p1, storage_reservations-p1, latency_groups-p1, inter_group_latencies-p1, service_partition_access-p1, call_cell_reduce_slots-p1, call_cell_reduce_results-p1, call_activation_leases-p1, artifact_payloads-p1, artifact_payload_chunks-p1

## Admission classes

- `allowance__over_by_1__owned_operation_visible__joining__counted_operation` (over by 1) - A replacement voter or single-voter expansion is allowed, the promotion is 1 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is joining, and the completion owner counted at least one active operation.
- `allowance__over_by_1__owned_operation_visible__joining__no_counted_operation` (over by 1) - A replacement voter or single-voter expansion is allowed, the promotion is 1 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is joining, and the completion owner counted no active operation.
- `allowance__over_by_1__owned_operation_visible__not_joining__counted_operation` (over by 1) - A replacement voter or single-voter expansion is allowed, the promotion is 1 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is not joining, and the completion owner counted at least one active operation.
- `allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation` (over by 1) - A replacement voter or single-voter expansion is allowed, the promotion is 1 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is not joining, and the completion owner counted no active operation.
- `allowance__over_by_1__no_owned_operation__joining__counted_operation` (over by 1) - A replacement voter or single-voter expansion is allowed, the promotion is 1 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted at least one active operation.
- `allowance__over_by_1__no_owned_operation__joining__no_counted_operation` (over by 1) - A replacement voter or single-voter expansion is allowed, the promotion is 1 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted no active operation.
- `allowance__over_by_2__owned_operation_visible__joining__counted_operation` (over by 2) - A replacement voter or single-voter expansion is allowed, the promotion is 2 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is joining, and the completion owner counted at least one active operation.
- `allowance__over_by_2__owned_operation_visible__joining__no_counted_operation` (over by 2) - A replacement voter or single-voter expansion is allowed, the promotion is 2 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is joining, and the completion owner counted no active operation.
- `allowance__over_by_2__owned_operation_visible__not_joining__counted_operation` (over by 2) - A replacement voter or single-voter expansion is allowed, the promotion is 2 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is not joining, and the completion owner counted at least one active operation.
- `allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation` (over by 2) - A replacement voter or single-voter expansion is allowed, the promotion is 2 voter(s) above that cap, the guard can see an add-like operation this learner owns, the learner is not joining, and the completion owner counted no active operation.
- `allowance__over_by_2__no_owned_operation__joining__counted_operation` (over by 2) - A replacement voter or single-voter expansion is allowed, the promotion is 2 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted at least one active operation.
- `allowance__over_by_2__no_owned_operation__joining__no_counted_operation` (over by 2) - A replacement voter or single-voter expansion is allowed, the promotion is 2 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted no active operation.
- `no_allowance__over_by_1__no_owned_operation__joining__counted_operation` (over by 1) - No allowance applies, the promotion is 1 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted at least one active operation.
- `no_allowance__over_by_1__no_owned_operation__joining__no_counted_operation` (over by 1) - No allowance applies, the promotion is 1 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted no active operation.
- `no_allowance__over_by_1__no_owned_operation__not_joining__counted_operation` (over by 1) - No allowance applies, the promotion is 1 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is not joining, and the completion owner counted at least one active operation.
- `no_allowance__over_by_1__no_owned_operation__not_joining__no_counted_operation` (over by 1) - No allowance applies, the promotion is 1 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is not joining, and the completion owner counted no active operation.
- `no_allowance__over_by_2__no_owned_operation__joining__counted_operation` (over by 2) - No allowance applies, the promotion is 2 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted at least one active operation.
- `no_allowance__over_by_2__no_owned_operation__joining__no_counted_operation` (over by 2) - No allowance applies, the promotion is 2 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is joining, and the completion owner counted no active operation.
- `no_allowance__over_by_2__no_owned_operation__not_joining__counted_operation` (over by 2) - No allowance applies, the promotion is 2 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is not joining, and the completion owner counted at least one active operation.
- `no_allowance__over_by_2__no_owned_operation__not_joining__no_counted_operation` (over by 2) - No allowance applies, the promotion is 2 voter(s) above that cap, the guard can see NO add-like operation this learner owns, the learner is not joining, and the completion owner counted no active operation.

## Add-like operation producers

- `planner-over-target-spread-cure-add` - src/rebalancer/move-planner-priority-spread-cure.js:applyOverTargetCapAddRetention
  - sink: classifyPriorityOverTargetSpreadCureCondition; types: ADD; mints: true
  - partition scope (non_ledger_priority): replica-placement-cure-policy.js:isNonLedgerPriorityPlacementCurePartition (src/rebalancer/replica-placement-cure-policy.js:200-204), reached through classifyPriorityOverTargetSpreadCureCondition (:355-379)
- `planner-priority-expand-for-spread-add` - src/rebalancer/move-planner-priority-spread-cure.js:applyPrioritySpreadExpandCure
  - sink: classifyPriorityExpandForSpreadCureCondition; types: ADD; mints: false
  - partition scope (non_ledger_priority): replica-placement-cure-policy.js:classifyPriorityExpandForSpreadCureCondition (src/rebalancer/replica-placement-cure-policy.js:265-295)
- `planner-ledger-expand-for-spread-add` - src/rebalancer/move-planner-priority-spread-cure.js:applyPrioritySpreadExpandCure
  - sink: classifyLedgerExpandForSpreadCureCondition; types: ADD; mints: false
  - partition scope (operation_ledger): replica-placement-cure-policy.js:classifyLedgerExpandForSpreadCureCondition -> isOperationLedgerPartition (src/rebalancer/replica-placement-cure-policy.js:207-232)
- `planner-under-representation-add` - src/rebalancer/move-planner-move-calculation-methods.js:calculateMoves (deficit cure)
  - sink: resolvePlacementCure; types: ADD; mints: false
  - partition scope (any_rebalanced_entity): no partition-class predicate on the ADD itself; the entity scope is the rebalancer instance (src/rebalancer/move-planner-move-calculation-methods.js:326-353)
- `planner-paired-relocation-replace` - src/rebalancer/move-planner-move-calculation-methods.js:calculateMoves (relocation pairing)
  - sink: resolvePlacementCure; types: REPLACE; mints: false
  - partition scope (any_rebalanced_entity): no partition-class predicate; priority partitions are only serialization-capped (src/rebalancer/move-planner-move-calculation-methods.js:679-725)
- `follow-up-deficit-add` - src/rebalancer/unified-rebalancer-follow-up-move.js:buildDeficitFollowUpMove
  - sink: resolvePlacementCure; types: ADD; mints: false
  - partition scope (priority_control_plane): the augmentation entry returns early unless isControlPlanePriorityPartition() (src/rebalancer/unified-rebalancer-follow-up-augmentation-methods.js:218-220)
- `follow-up-unhealthy-source-replace` - src/rebalancer/unified-rebalancer-follow-up-move.js:buildRelocationFollowUpMove
  - sink: classifyPriorityRecoveryFollowUpCureCondition; types: REPLACE; mints: false
  - partition scope (priority_control_plane): same augmentation gate; the surrogate entry emits for other priority partitions (src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js:314-316)
- `coordinator-create-operation` - src/rebalancer/unified-rebalancer-move-execution.js:executeMoveViaCoordinator
  - sink: createOperation; types: ADD/REPLACE; mints: false
  - partition scope (funnel_any_entity): the single execution funnel for every planned move; it carries the producer intent and adds none of its own
- `provisioning-create-operation` - src/query/sql-query-engine-initial-partition-provisioning.js:provisionInitialTablePartition
  - sink: createOperation; types: ADD; mints: false
  - partition scope (no_partition_class_predicate): the module carries no system/user predicate; the partition id is whatever the DDL caller supplies
- `coordinator-target-claim-retry` - src/rebalancer/rebalance-coordinator-operation-creation.js:createOperationRecordInternal (target-claim retry)
  - sink: createOperationRecordInternal; types: ADD/REPLACE; mints: false
  - partition scope (runtime_service_only): a target claim key is built only for entityType RUNTIME_SERVICE with ADD or REPLACE (src/rebalancer/rebalance-coordinator-operation-creation.js:724-733), and the retry requires operation.targetClaimKey (:838)
- `coordinator-successor-replace` - src/rebalancer/rebalance-coordinator-operation-persistence-collision.js:createSuccessorReplaceOperation
  - sink: createOperationRecordInternal; types: REPLACE; mints: false
  - partition scope (any_entity_with_replace_intent): requires context.replaceIntentIdentity, built only for REPLACE moves (src/rebalancer/rebalance-coordinator-operation-creation.js:173-180)
- `coordinator-concurrent-budget-turn` - src/rebalancer/rebalance-coordinator-concurrent-budget-gate.js:createOperationWithinConcurrentCreateBudgetTurn
  - sink: createOperationRecordInternal; types: ADD/REPLACE; mints: false
  - partition scope (funnel_any_entity): a second entry into the record path inside the createOperation flow; it carries the same move
- `dispatch-gate-operation-row-repair` - src/rebalancer/operation-workflow-gate-operation-row-repair.js:repairOperationRowForGateRepairedReservation
  - sink: persistNewOperation; types: ADD/REPLACE; mints: false
  - partition scope (any_entity_storage_increasing): gated only on isStorageIncreasingOperationType, i.e. ADD or REPLACE (src/rebalancer/operation-workflow-dispatch-reservation-gate.js:27-32, :86); no partition-class predicate on the path
- `repository-divergence-reinsert` - src/rebalancer/replica-operation-repository-mutation-update-methods.js:persistNewOperationUnlocked (CL-017(b) re-insert)
  - sink: persistNewOperation; types: ADD/REPLACE; mints: false
  - partition scope (any_entity_any_type): no type or partition predicate; reached from the zero-rows-affected plus invisible-authoritative-row condition
- `coordinator-persist-funnel` - src/rebalancer/rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> persistNewOperation
  - sink: persistNewOperation; types: ADD/REPLACE; mints: false
  - partition scope (funnel_any_entity): the canonical persistence hop of the creation path
- `repository-persist-funnel` - src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:persistNewOperation
  - sink: persistNewOperation; types: ADD/REPLACE; mints: false
  - partition scope (funnel_any_entity): the single INSERT_OPERATION execution site
- `coordinator-owner-facade-persist` - src/rebalancer/rebalance-coordinator-owner-facade.js:persistNewOperation
  - sink: persistNewOperation; types: ADD/REPLACE; mints: false
  - partition scope (funnel_any_entity): the facade hop the coordinator persists through
- `operation-not-visible-to-the-guard` - src/partition/partition-service-learner-promotion-methods.js:readInFlightAddLikeOperationRowsForPromotion
  - sink: readInFlightAddLikeOperationRowsForPromotion; types: ADD/REPLACE; mints: false
  - partition scope (any_rebalanced_entity): not a creator: the operation that made this learner is filtered out of the guard's own traversal because its status is terminal, or its row is not in this node's cache (src/partition/partition-service-learner-promotion-methods.js:560-584)

## The rows

### five-minted-spread-cure-add

- **path**: move-planner-move-calculation-methods.js:calculateMoves -> move-planner-priority-spread-cure.js:applyOverTargetCapAddRetention -> replica-placement-cure-policy.js:classifyPriorityOverTargetSpreadCureCondition + authorizeSpreadCureTransition -> spread-cure-transition-authorization.js:stampSpreadCureTransitionAuthorization -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-over-target-spread-cure-add
- **triggering state**: A non-ledger priority partition over its voter target with an unmet distinct-node floor, no in-flight REPLACE and at least one ADD move: the planner retains the spread-cure ADD, and the learner it creates reaches the guard while the voter census is already at or above target. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The state the producer itself creates, carried the whole real chain: four voters on two nodes at target three, the retained spread-cure ADD created through the real coordinator, and its learner put to the real guard. Granted with the budget at its actual value, refused with only the budget forced to zero. (test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **yes** - witness: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: src/rebalancer/replica-placement-cure-policy.js
- **semantic owner reason**: The owner decision of 2026-09-18 makes this module the single authority for whether a spread cure may temporarily exceed the replica target; classifyPriorityOverTargetSpreadCureCondition is the spread-cure condition and authorizeSpreadCureTransition is its mint.
- **proposed authorization kind**: critical_spread_cure
- **proposed kind note**: Exists today. No new kind is proposed. The owner's decision 2 refuses a second kind merely because the mechanism differs, and verification confirmed the premise: the priority-recovery follow-up decides the SAME distinct-node spread condition the cure policy classifies for ADD. Mechanism is not authority. The proposal is to establish ONE spread-recovery decision owner and have both the ADD and the REPLACE mechanism consume its bounded authorization. That authorization must bind the operation shape strongly enough that an ADD authorization cannot authorize an unrelated REPLACE.
- **minting evidence available**: The cure policy holds, at decision time, the placement evidence it classified, the partition row's own declared replication factor through resolveDesiredReplicationFactor, the planner's observed membership publication epoch and the destination node (src/rebalancer/replica-placement-cure-policy.js:415-436).
- **validation evidence available**: Exactly what evaluateSpreadCureTransitionAuthorization compares today: the receiving replica's own operation row, node, replica id and declared replication factor. It reconstructs nothing and reads nothing new.
- **enforcement disposition**: **explicit-authority-required**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1, producer-reachability/planner-over-target-spread-cure-add/sql_transactions-p1
- **policy cure condition**: priority_over_target_spread_cure
- **producer operation types**: ADD
- **repair group (nothing started)**: unify-spread-recovery-authority
- **formation evidence (never upgrades a disposition)**: Per machine on the carry stage (scratch commit ca8e7fa67, series *-authority-carry): adam-laptop 7, lenovo-laptop 11, tv-dator 11 promotions measured as budget-dependent on these five partitions, each line carrying a decoded spread-cure authorization record. The four-core machine is a separate class and is not included. Formation evidence only: it upgrades no disposition, and the round-1 carrier is not the landed one.
  - producer attributed: true; attribution form: payload-uniquely-attributable-to-one-producer
  - attribution argument: The decoded spread-cure authorization record on the operation row can only be written by authorizeSpreadCureTransition through the coordinator stamp, and the producer census shows the mint has exactly one call site outside its own module.
- **evidence**: 
  - **MEASURED** - authorizeSpreadCureTransition mints for exactly these five partitions: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - The real producer, the real coordinator and the real guard in one chain: granted today, refused with the budget forced to zero: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **CODE** - The cap arithmetic that spends the budget.
  - **INFERRED** - That the carried authorization covers every legitimate over-target transition of this route. It is not proved for a membership that changed between the mint and the promotion, nor for the two windows in which the mint is silent; those are their own rows.

### five-establishing-window-unminted-cure-add

- **path**: same hops as five-minted-spread-cure-add, with authorizeSpreadCureTransition returning null because context.observedMembershipEpoch is null
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-over-target-spread-cure-add
- **triggering state**: The over-target spread-cure condition holds and the planner RETAINS the ADD, but the planning owner's epoch reader returns null - which it does while any newer publication is in a status other than PUBLISHED, or excludes the planning node - so the cure policy mints nothing. The learner is created anyway and reaches the guard over target carrying no authorization. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The guard-visible state this window leaves behind - an over-target learner owning an add-like operation that carries no authorization - is admitted with the budget and refused with it at zero, measured on the real guard. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: The spread-cure owner decided the TRANSITION but could not state one of the facts its authorization must carry, so it minted nothing. Whether some OTHER owner may authorize this transition is exactly the open question, and the spread-cure owner never infers publication or formation semantics on its behalf.
- **proposed authorization kind**: none
- **proposed kind note**: No kind is proposed. The owner's decision 4 forbids minting an authorization merely to keep today's admission alive.
- **minting evidence available**: Everything except the epoch: the placement evidence, the partition row's declared factor and the destination node are all available. Only observedMembershipEpoch is null.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1
- **policy cure condition**: priority_over_target_spread_cure
- **producer operation types**: ADD
- **still-unclassified because**: The owner's decision 4: this is a FINDING, not an automatically missing authority. It is one of two things and the audit has not determined which - a legitimate bootstrap transition with some other explicit owner, or an old fail-open path that enforcement should intentionally eliminate. For the establishing window the publication or formation owner is the one that actually knows why the transition is safe.
- **what would classify it**: Obtain from the publication or formation owner whether a partition may exceed its voter target while a newer membership publication is establishing, and on what evidence that owner would state it. If it may, that owner mints a bounded authorization and the spread-cure owner never infers it. If it may not, this admission is a fail-open path enforcement removes, and the retained ADD must be withheld rather than left unauthorizable.
- **repair group (nothing started)**: establishing-publication-semantics
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Driving the REAL applyOverTargetCapAddRetention with observedMembershipEpoch null retains the ADD (retainedSpreadCureAddCount 1) and mints nothing: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - The planner-side reader returns null in five of the ten measured publication row sets: test/control-plane/membership-epoch-reader-divergence.test.js:the two epoch readers diverge on real owners over the stated row sets
  - **CODE** - authorizeSpreadCureTransition validates its own record through readSanctionedSpreadCureTransitionPolicy, whose epoch rule is isBoundMembershipPublicationEpoch; a null epoch fails it (src/rebalancer/replica-placement-cure-policy.js:418-436).

### five-undeclared-partition-row-unminted-cure-add

- **path**: same hops as five-minted-spread-cure-add, with authorizeSpreadCureTransition returning null because resolveDesiredReplicationFactor(resolvePartitionRow()) declares no replication factor
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-over-target-spread-cure-add
- **triggering state**: The over-target spread-cure condition holds and the planner RETAINS the ADD, but the partition row carries no declared replica_count in the PLANNER's cache, so the cure policy cannot state a desiredReplicationFactor and mints nothing. The learner reaches the guard over target carrying no authorization - and it depends on the budget only when the LEARNER's cache does declare the row, because on an unreadable row the guard's own target falls to 0 and the completion owner returns a zero budget as well. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The same guard-visible state, measured on the real guard: an over-target learner with an unauthorized owned operation is admitted with the budget and refused with it at zero. The state only arises when the LEARNER can read the partition row, which is the cache-disagreement condition below. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: The spread-cure owner decided the TRANSITION but could not state one of the facts its authorization must carry, so it minted nothing. Whether some OTHER owner may authorize this transition is exactly the open question, and the spread-cure owner never infers publication or formation semantics on its behalf.
- **proposed authorization kind**: none
- **proposed kind note**: No kind is proposed. The owner's decision 4 forbids minting an authorization merely to keep today's admission alive.
- **minting evidence available**: Everything except the replication factor: the placement evidence, the observed epoch and the destination node are available.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1
- **policy cure condition**: priority_over_target_spread_cure
- **producer operation types**: ADD
- **still-unclassified because**: The owner's decision 4 again: a finding, not a missing authority. It is either a legitimate transitional state - the two caches disagree during formation and some owner knows the transition is safe - or an old fail-open path. The audit has not determined which.
- **what would classify it**: Determine whether a planner and a learner may legitimately disagree about a partition row's declared replication factor at this point in formation. If they may, name the owner that knows the transition is safe while they do, and have it mint. If they may not, this is a cache-coherence defect and the repair is at the row-visibility boundary, not an authorization.
- **repair group (nothing started)**: undeclared-row-cache-disagreement-semantics
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Driving the REAL applyOverTargetCapAddRetention with a resolver returning an empty row retains the ADD and mints nothing: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - On the real guard an unreadable partition row makes the target undeclared, and the completion owner returns a zero budget for a non-positive target, so the budget matters only when the learner CAN read the row: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - resolvePriorityRecoveryTemporaryOverflowVoterBudget returns 0 unless targetReplicaCount > 0 (src/control-plane/priority-recovery-completion.js:53-61).

### five-minted-authorization-stale-at-promotion

- **path**: same hops as five-minted-spread-cure-add, evaluated at promotion time, one or more learner recheck cycles after the mint
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-over-target-spread-cure-add
- **triggering state**: The authorization was minted at the epoch the planning owner could read; by the time the learner is rechecked a newer publication exists, so a promotion-time fence would compare the record against a higher number. The landed guard supplies no epoch at all, so the fence is not applied today. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The same over-target state the minted row measures; the fence is not applied by the landed guard, so the admission is the minted row's and moves with the budget alone. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **yes** - witness: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: src/rebalancer/replica-placement-cure-policy.js
- **semantic owner reason**: The same spread cure and the same owner as the mint - this row is that mint, one hop later. Only the fence is at issue.
- **proposed authorization kind**: critical_spread_cure
- **proposed kind note**: Unchanged kind; what is missing is one canonical epoch predicate for both sides, which the owner's decision 5 defers until the census traces are closed.
- **minting evidence available**: The planner-side reader, which is null while any newer publication is not PUBLISHED, so the mint is already silent in the windows where a fence would bite.
- **validation evidence available**: Only what the guard reads today, which is no epoch. Supplying one means either a new read at the guard - against the carry stage's invariant - or carrying a stable publication identity both sides resolve through one owner. No model is chosen here.
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1, producer-reachability/planner-over-target-spread-cure-add/sql_transactions-p1
- **policy cure condition**: priority_over_target_spread_cure
- **producer operation types**: ADD
- **still-unclassified because**: Whether enforcement refuses this case is a consequence of the canonical epoch model, which the owner will not select while the census has untraced entries. What would classify it: a decided canonical model, plus a measured answer to whether the chosen predicate can read stale for a membership the mint's own decision did not depend on.
- **what would classify it**: Decide the canonical membership-publication identity and the single owner that resolves it for both the mint and the validation, then measure whether that predicate can read stale for a membership the mint's own decision did not depend on.
- **repair group (nothing started)**: close-topology-publication-version-identity
- **formation evidence (never upgrades a disposition)**: Four refusal lines on one machine (scratchpad/lab-logs/adam-laptop-authority-carry/logs-1/node-1.log and node-4.log, 2026-09-19T11:03:15.777Z to 11:03:17.787Z; per machine adam 4, lenovo 0, tv-dator 0) carry an authorization the ROUND-1 carrier read as authorization_membership_generation_stale at epoch 5 against 6. Those lines were refused on the cap anyway, so they are NOT budget-admitted cases; they are evidence that the stale reading occurs. The landed carrier never evaluates the fence.
  - producer attributed: true; attribution form: payload-uniquely-attributable-to-one-producer
  - attribution argument: The decoded spread-cure authorization record and its stale reason can only come from the mint.
- **evidence**: 
  - **MEASURED** - The two readers return different values over one row set on the real owners, and an authorization minted before a later join reads stale after it: test/control-plane/membership-epoch-reader-divergence.test.js:the two epoch readers diverge on real owners over the stated row sets
  - **CODE** - The fence is one-sided - older than the partition can see is refused, newer is honoured - and the partition-side reader takes the maximum PUBLISHED epoch across ALL publication kinds while the planner-side reader is kind-filtered.
  - **MEASURED** - The four lab lines cited above.

### five-expand-for-spread-add

- **path**: move-planner-move-calculation-methods.js:calculateMoves -> move-planner-priority-spread-cure.js:applyPrioritySpreadExpandCure -> replica-placement-cure-policy.js:classifyPriorityExpandForSpreadCureCondition -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-priority-expand-for-spread-add
- **triggering state**: A non-ledger priority partition AT target with an unmet distinct-node floor: the planner converts a planned REPLACE into a standalone expand ADD. The mint does not fire, because authorizeSpreadCureTransition classifies only the OVER-target condition. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends_only_when_census_moved**
- **budget-only differential**: The moved-census state - the learner meets the guard at target+2 - is admitted with the budget and refused with it at zero, measured on the real guard. It is the ONLY state in which this row touches the budget. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **budget-independence differential**: The state the producer itself creates: the partition AT target when the expand ADD is planned, so the learner promotes to target+1, which the replacement allowance covers. MEASURED end to end on the real chain - the real expand site, the real coordinator creation, the real guard - with the budget forced to zero, and the grant survives. (test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row)
- **census-movement condition**: It touches the budget only if the voter census moves further between planning and promotion, so the learner meets the guard at target+2 or beyond. No test in this quest drives the producer into that state.
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **yes** - witness: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: src/rebalancer/replica-placement-cure-policy.js
- **semantic owner reason**: The same module owns this spread-cure condition and types it SPREAD_REPLICAS; it is a different row of the cure table from the one the mint authorizes.
- **proposed authorization kind**: critical_spread_cure
- **proposed kind note**: The existing kind fits the semantic. Widening the mint to this condition is an owner decision this quest does not take, and it matters only if the moved-census state is ever shown reachable from this producer.
- **minting evidence available**: The same placement evidence and the same partition-row authority the over-target mint already reads; at this condition the observed voter count equals the target.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/census-moved/control_plane_publications-p1, budget-dependence/census-moved/schema_operations-p1, budget-dependence/census-moved/sql_transaction_participants-p1, budget-dependence/census-moved/sql_transactions-p1, budget-dependence/census-moved/sql_write_operations-p1, budget-independence-differential/producer-add-at-target/control_plane_publications-p1, budget-independence-differential/producer-add-at-target/schema_operations-p1, budget-independence-differential/producer-add-at-target/sql_transaction_participants-p1, budget-independence-differential/producer-add-at-target/sql_transactions-p1, budget-independence-differential/producer-add-at-target/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1, producer-reachability/planner-priority-expand-for-spread-add/sql_transactions-p1
- **policy cure condition**: priority_expand_for_spread
- **producer operation types**: ADD
- **still-unclassified because**: The state the producer creates is measured and does NOT touch the budget. What is unsettled is whether the producer can leave an expand ADD in flight while the voter census moves further, which is the only way this row reaches the budget. What would classify it: a real-chain replay driving the planner through an expand cure whose census reaches target+2 before the learner is rechecked, or a code argument that the over-creation cap forbids it.
- **what would classify it**: Decide whether the expand condition is the same distinct-node spread-recovery semantic as the minted cure - in which case it consumes the same bounded authorization - or a different one that needs its own decision owner. Nothing here proposes widening the mint.
- **repair group (nothing started)**: unify-spread-recovery-authority
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The expand site re-types the ADD under its own cure row and attaches no authorization field at all: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - The producer is driven to the real guard through the real coordinator, and the grant survives the budget at zero: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **CODE** - authorizeSpreadCureTransition guards on classifyPriorityOverTargetSpreadCureCondition alone, so no expand condition can mint.

### five-under-representation-add

- **path**: move-planner-move-calculation-methods.js:calculateMoves (deficit cure) or unified-rebalancer-follow-up-move.js:buildDeficitFollowUpMove -> resolvePlacementCure(UNDER_REPRESENTATION) -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-under-representation-add, follow-up-deficit-add
- **triggering state**: The partition is BELOW target when the ADD is planned. By the time its learner is rechecked the voter census has reached or passed target, so the learner meets the guard over target. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: An over-target learner owning an add-like ADD is admitted with the budget and refused with it at zero, on the real guard. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: The deficit cure authorizes reaching the target, never exceeding it: resolvePlacementCure(UNDER_REPRESENTATION) is typed INCREASE_REPLICA_COUNT. No module decides that this promotion may go over target; the guard infers it from the priority-recovery view. This is not a spread cure.
- **proposed authorization kind**: none
- **proposed kind note**: A deficit ADD that is no longer a deficit at promotion time has no semantic claim on an over-target allowance.
- **minting evidence available**: The deficit producer knows the target and the occupied count it planned against, but not the census the receiver will see.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1
- **producer operation types**: ADD
- **still-unclassified because**: Reachability at the GUARD is measured; reachability from the PRODUCER is not. Whether a production planner can leave a deficit ADD in flight while the census passes target is a planner-side race no test in this quest drives. What would classify it: a real-chain replay through two overlapping deficit ADDs on one priority partition, or a code argument that the count-aware gate forbids it.
- **what would classify it**: Establish which producer plans an add-like operation for an under-represented partition that is nonetheless at or above the voter target at promotion time, and whether that state is legitimate at all.
- **repair group (nothing started)**: guard-invisible-operation-state
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The guard grants this state today and refuses it with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - The deficit cure row is INCREASE_REPLICA_COUNT and carries no over-target allowance.
  - **INFERRED** - The planner-side race that puts the census over target while a deficit ADD is in flight.

### five-relocation-handoff-overlap

- **path**: unified-rebalancer-follow-up-augmentation-methods.js:augmentMovesWithPriorityRecoveryFollowUp -> unified-rebalancer-follow-up-move.js:buildPriorityRecoveryFollowUpMove (the OVER_REPLICATION_SUPPRESSED guard at :639-647, getHealthyReplicas at :634, selectPriorityRecoveryFollowUpSourceReplica at :541-567 and selectFollowUpTargetNodeId at :164-197) -> classifyPriorityRecoveryFollowUpCureCondition -> UNHEALTHY_SOURCE_AT_TARGET -> buildRelocationFollowUpMove -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: follow-up-unhealthy-source-replace
- **triggering state**: The healthy replica count is at or above target and the partition has enough HEALTHY replicas but they are co-located, so one is walked off a node that hosts more than one onto a node that hosts none. Its target learner is promoted BEFORE the named source is removed, so the partition is ONE voter over target for the hand-off. This row is that single overlap and nothing more. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **does_not_depend**
- **budget-independence differential**: Every grid state in which the voter census equals the target and this learner owns an add-like operation - the state a single promote-then-remove hand-off creates - across all 45 partitions and the whole stated range of targets, learners, operations, summary shapes, readiness and joining. In every such state the promotion is granted with the budget at its actual value and granted again with the budget forced to zero: the admission boundary is identical. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **producer-reachable**: **yes** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: src/rebalancer/unified-rebalancer-follow-up-move.js
- **semantic owner reason**: This module decides that the healthy replicas are badly placed, selects which one is walked off and where it goes. It is the only module that knows why this replacement is authorized. The cure policy is NOT named: it types the move and owns the same distinct-node condition for ADDs, but it does not take this decision.
- **proposed authorization kind**: none
- **proposed kind note**: No kind is proposed. Round 1 proposed priority_recovery_relocation; the owner's decision 2 refuses it and verification confirmed why: this module decides the SAME distinct-node spread condition the cure policy classifies for ADD. Mechanism is not authority. The proposal is to establish ONE spread-recovery decision owner and have both the ADD and the REPLACE mechanism consume its bounded authorization, with the operation shape bound strongly enough that an ADD authorization cannot authorize an unrelated REPLACE.
- **minting evidence available**: The follow-up owner holds the decision snapshot, the healthy replica set, the SELECTED SOURCE replica and node, the target node and the target replica count at decision time. It can state the source it is replacing, which is what makes a bound checkable.
- **validation evidence available**: The receiving replica already reads its own operation row, node, replica, declared replication factor and voter census. A relocation authorization naming the source replica is checkable against that same voter census without reading anything new.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **budget-dependent-authority-requirement**
  - unreachable: budget-dependent-authority-requirement
  - remains reachable: operation, guard-state
  - state slice: relocation-handoff
  - statement: Within the stated ordinary hand-off domain, no admission depends on the compatibility overflow budget; therefore a budget-dependent authority requirement is unreachable within this hand-off domain, and removing the budget creates no missing authority requirement for this class.
  - code argument: The admission boundary is identical with the budget at its measured value and with it forced to zero, in every state of this domain: the voter census equals the target and this learner owns the add-like operation that put it there, so the replacement allowance alone admits the promotion and the budget term is never the discriminator.
- **bound receipts**: budget-independence-differential/relocation-handoff/control_plane_publications-p1, budget-independence-differential/relocation-handoff/schema_operations-p1, budget-independence-differential/relocation-handoff/sql_transaction_participants-p1, budget-independence-differential/relocation-handoff/sql_transactions-p1, budget-independence-differential/relocation-handoff/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1, guard-state-drive/follow-up-unhealthy-source-replace/sql_transactions-p1, producer-reachability/follow-up-unhealthy-source-replace/sql_transactions-p1, slice-provenance/relocation-handoff/follow-up-unhealthy-source-replace
- **producer operation types**: REPLACE
- **repair group (nothing started)**: unify-spread-recovery-authority
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Driving the REAL buildPriorityRecoveryFollowUpMove with three co-located healthy voters produces a REPLACE whose source is on the doubly-occupied node and whose target is an unoccupied node; with one replica FAILED the failed replica is never the source: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - The same move, carried through the REAL coordinator creation path to a replica_operations row and then to the REAL guard, is granted with the budget forced to zero: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - And over the whole stated grid, no state in which the census equals the target and the learner owns an add-like operation changes its admission when the budget is zeroed: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - selectPriorityRecoveryFollowUpSourceReplica iterates the HEALTHY replicas grouped by node and returns the first replica on a node with more than one, excluding the target node; selectFollowUpTargetNodeId excludes healthy, occupied and pending target nodes. A failed replica is filtered out by getHealthyReplicas before either runs.

### five-relocation-census-disagreement-overlap

- **path**: unified-rebalancer-follow-up-augmentation-methods.js:augmentMovesWithPriorityRecoveryFollowUp -> unified-rebalancer-follow-up-move.js:buildPriorityRecoveryFollowUpMove (the OVER_REPLICATION_SUPPRESSED guard at :639-647, getHealthyReplicas at :634, selectPriorityRecoveryFollowUpSourceReplica at :541-567 and selectFollowUpTargetNodeId at :164-197) -> classifyPriorityRecoveryFollowUpCureCondition -> UNHEALTHY_SOURCE_AT_TARGET -> buildRelocationFollowUpMove -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck - entered a SECOND time while the prior relocation is still draining
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: follow-up-unhealthy-source-replace
- **triggering state**: A prior relocation REPLACE has not yet had its source removed, and its target is still SYNCING in a voter role. The suppressor's census (inventory active count) reads AT target and lets a second relocation through, while the over-creation cap's census and the promotion guard's census both read one OVER target. The second target then promotes to two over target. With the prior target ACTIVE instead, the builder suppresses and no second relocation exists: the disagreement is the whole mechanism. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The chained state produced by the real chain: with the prior relocation target still SYNCING in a voter role the guard counts four voters at target three, and the second target is granted with the budget and refused with only the budget forced to zero. (test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified)
- **guard-reachable**: **yes** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **producer-reachable**: **yes** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: No module decides that a partition two voters over target may promote another learner. This overlap is not a replacement semantic at all: it is the consequence of two membership views disagreeing about the same replica. The planner SERIALIZES REPLACE on critical partitions to one in flight precisely because more "only builds a mutual-defer standoff" (src/rebalancer/move-planner-move-calculation-methods.js:671-688), so a chain is a defect that cap exists to prevent - never an availability mechanism, and never a reason to authorize.
- **proposed authorization kind**: none
- **proposed kind note**: No authorization is proposed. Authorization must never legalize a state that inconsistent observations created.
- **minting evidence available**: Nothing an authorization could honestly state: the producer believes the partition is at target, and it is not.
- **validation evidence available**: Not applicable while the condition is a view disagreement rather than a transition an owner decided.
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1, guard-state-drive/follow-up-unhealthy-source-replace/sql_transactions-p1, producer-reachability/follow-up-unhealthy-source-replace/sql_transactions-p1
- **producer operation types**: REPLACE
- **still-unclassified because**: This is a CONSISTENCY finding, not an authority requirement. It is classified only when the membership/census boundary is settled.
- **what would classify it**: determine whether the two membership views are allowed to disagree in this state; if not, repair the owner/census boundary rather than authorize the resulting second transition
- **repair group (nothing started)**: resolve-membership-census-disagreement
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - On the real follow-up builder, four ACTIVE voters give over_replication_suppressed and only a prior target still SYNCING in a voter role yields a second REPLACE: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - The whole chain in one drive - builder, coordinator, guard - grants the second target today and refuses it with the budget at zero: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - The real replica-inventory owner reports activeCount at target and activeVoterCount one over it for that same state: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **CODE** - The serialization cap and its stated reason: "minting more REPLACEs ... only builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one critical partition thrashing ~114s, holding it over target until convergence times out)" (src/rebalancer/move-planner-move-calculation-methods.js:671-688).

### five-paired-relocation-replace

- **path**: move-planner-move-calculation-methods.js:calculateMoves (relocation pairing, :679-725) -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: planner-paired-relocation-replace
- **triggering state**: An under-represented target node paired with an over-represented source node. The REPLACE is count-neutral by intention, but its target learner is promoted BEFORE the source is removed. Whether that overlap ever reaches the budget, and whether this producer can also chain through a view disagreement, is not measured. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **unknown_producer_not_driven**
- **dependency unknown because**: No test in this quest drives the pairing producer, so nothing here is measured from it. Round 1 inferred does_not_depend from the at-target hand-off; that inference is withdrawn. The pairing is a LIVE CANDIDATE for the lab's chained REPLACE - it is one of the two producers that can emit a REPLACE on that partition, and no log line names which one did.
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: The cure table types this condition a count-neutral REPLACE. Nothing states that the transient over-replication during the hand-off is authorized.
- **proposed authorization kind**: none
- **proposed kind note**: Round 1 proposed replacement_handoff_overlap. The owner's decision 2 test applies here too and it does not survive: the pairing is typed by the SAME cure policy from a placement condition that policy owns, so a separate kind would institutionalize a mechanism rather than name a semantic. When this producer IS driven, its overlap splits the same way the relocation rows do: an ordinary hand-off overlap that may have legitimate replacement semantics, and any additional overlap from a view disagreement, which is a consistency finding and never an authorization.
- **minting evidence available**: The relocation pairing knows the source replica id and node it is walking off, the target node, and the partition target it planned against.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1, producer-not-driven/planner-paired-relocation-replace
- **producer operation types**: REPLACE
- **still-unclassified because**: The dependency itself is unknown because the producer is not driven. What would classify it: a real-chain replay driving calculateMoves' pairing on a priority partition, through the coordinator to the guard, at target and with a prior relocation still draining.
- **what would classify it**: determine whether the two membership views are allowed to disagree in this state; if not, repair the owner/census boundary rather than authorize the resulting second transition - for whichever part of this producer's overlap turns out to come from one.
- **repair group (nothing started)**: resolve-membership-census-disagreement
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The guard decides an ADD row and a REPLACE row identically, so nothing about the type changes the admission: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - The census finds this producer and its partition scope: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
  - **CODE** - ADD_LIKE_REPLICA_OPERATION_TYPES covers ADD and REPLACE, and operationOwnedCriticalReplacementPromotionAllowed fires for any owned add-like operation on a critical partition at or above target.
  - **INFERRED** - That this producer can be planned while the partition is already over target.

### five-operation-not-visible-to-the-guard

- **path**: any add-like producer -> replica_operations row -> the row reaches a terminal status, or is absent from this node's cache -> partition-service-learner-promotion-methods.js:readInFlightAddLikeOperationRowsForPromotion filters it out -> hasOwnedAddLikeOperation false -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: operation-not-visible-to-the-guard
- **triggering state**: An active learner service row with NO counted in-flight add-like operation, a voter census at or above target, and the priority-recovery view active. No replacement allowance applies unless the learner is also joining, so the cap is the target plus the budget alone. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: A learner with NO in-flight add-like row at a census of target or above is granted at the target-plus-budget cap and refused with the budget at zero, on the real guard. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__no_owned_operation__joining__counted_operation, allowance__over_by_1__no_owned_operation__joining__no_counted_operation, allowance__over_by_2__no_owned_operation__joining__counted_operation, allowance__over_by_2__no_owned_operation__joining__no_counted_operation, no_allowance__over_by_1__no_owned_operation__joining__counted_operation, no_allowance__over_by_1__no_owned_operation__joining__no_counted_operation, no_allowance__over_by_1__no_owned_operation__not_joining__counted_operation, no_allowance__over_by_1__no_owned_operation__not_joining__no_counted_operation, no_allowance__over_by_2__no_owned_operation__joining__counted_operation, no_allowance__over_by_2__no_owned_operation__joining__no_counted_operation, no_allowance__over_by_2__no_owned_operation__not_joining__counted_operation, no_allowance__over_by_2__no_owned_operation__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: No module authorized this promotion: the operation that would have carried the authority is invisible to the guard. The budget itself is granted from the UNRESOLVED PLANNER alone - the completion owner returns 2 with activeOperationCount 0 as long as plannerUnresolved is true.
- **proposed authorization kind**: none
- **proposed kind note**: Nothing is available to mint from. If the operation went terminal, the honest post-enforcement rule is a refusal.
- **minting evidence available**: None at the guard. Whatever produced the learner is no longer visible to it.
- **validation evidence available**: None beyond the membership the guard already counts.
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1
- **producer operation types**: ADD/REPLACE
- **still-unclassified because**: The admission class is measured on the real guard and witnessed live, but its PRODUCER is not settled, and it CANNOT be settled from guard-visible state: the guard's only input about the operation is its absence. Three candidates remain and none is confirmed - an add-like operation that reached a terminal status including the 60 s voter-ready timeout; a learner restored after a node restart whose operation row is not in this node's cache; and ReplicaRecoveryService.createPartitionReplica, which inserts a services row with no replica_operations row at all and is ruled out here because it has no construction site in src, examples or scripts at this head. See the architectural-result finding: the matrix does not encode a producer distinction the guard cannot see.
- **what would classify it**: Trace, from a production owner rather than from the guard, which producer leaves an active learner with no visible add-like operation, and decide whether that state is legitimate at all.
- **repair group (nothing started)**: guard-invisible-operation-state
- **formation evidence (never upgrades a disposition)**: Two lab lines, one per machine: scratchpad/lab-logs/adam-laptop-authority-carry/logs-1/node-3.log at 2026-09-19T11:00:04.892Z (control_plane_publications-p1, 4 voters, target 3, cap 6, zero counted in-flight operations) and scratchpad/lab-logs/lenovo-laptop-authority-carry/logs-1/node-4.log at 2026-09-19T11:00:17.468Z (3 voters, target 3, cap 5, no replacement allowance). Per machine: adam-laptop 1, lenovo-laptop 1, tv-dator 0. lab witness: transition observed; producer unattributed.
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The real guard grants a learner with no in-flight add-like row at the target-plus-budget cap and refuses it with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - The in-flight traversal excludes TERMINAL_STATUSES (src/partition/partition-service-learner-promotion-methods.js:560-584).
  - **MEASURED** - ReplicaRecoveryService has no construction site in src, examples or scripts at this head.
  - **INFERRED** - Which of the two remaining candidate producers the lab lines saw. It is not derivable from guard-visible state.

### five-row-rematerialization

- **path**: operation-workflow-dispatch-reservation-gate.js:repairGateRepairedOperationRow -> operation-workflow-gate-operation-row-repair.js:repairOperationRowForGateRepairedReservation -> persistNewOperation; and replica-operation-repository-mutation-update-methods.js (the CL-017(b) re-insert at :360-373); and rebalance-coordinator-operation-persistence-collision.js:createSuccessorReplaceOperation -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: An add-like operation row is re-inserted, or a successor REPLACE identity is created after a persistence collision, and the resulting learner reaches the guard over target. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: Once the row exists the guard sees an ordinary owned add-like operation, and that state is admitted with the budget and refused with it at zero. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: These paths re-materialize or re-identify an operation someone else created. They decide nothing about legitimacy and add no authority of their own.
- **proposed authorization kind**: none
- **proposed kind note**: The authority, if any, belongs to the producer whose operation is being re-materialized. What these paths must preserve is the record already on the operation.
- **minting evidence available**: None of their own.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1
- **producer operation types**: ADD/REPLACE
- **still-unclassified because**: The gate repair and the CL-017(b) re-insert write the in-memory operation record, so whether a stamped authorization survives them is a property of that record; this quest measured the record's survival through the coordinator creation path only. The successor REPLACE builds a NEW identity, so an authorization naming the old operation id is not honoured for it. What would classify it: a real-chain replay of each re-materialization path on the real repository, asserting whether the record is still on the row afterwards.
- **what would classify it**: Replay each re-materialization path on the real repository and assert whether the stamped record is still on the row afterwards, and what a successor identity inherits.
- **repair group (nothing started)**: operation-row-rematerialization
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The census finds these sinks and no others that write an operation row: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
  - **MEASURED** - The authorization survives the coordinator creation path onto the row: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - A record naming the old operation id is refused for a successor operation: test/rebalancer/overflow-budget-carried-forward-details.test.js:the partition-row read, the row type and the authorized count are settled
  - **INFERRED** - The behaviour of the two re-insert paths with respect to the stamped record.

### five-initial-provisioning-add

- **path**: table-creation-service-create-table.js or table-creation-service-existing-table-reconciliation.js -> sql-query-engine-initial-partition-provisioning.js:provisionInitialTablePartition -> createOperation -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: schema_operations-p1, sql_transactions-p1, sql_transaction_participants-p1, sql_write_operations-p1, control_plane_publications-p1
- **producers**: provisioning-create-operation
- **triggering state**: Initial provisioning creates an ADD for a partition id the DDL caller supplies. If that id were one of this row's partitions, its learner would reach the guard like any other add-like operation. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The guard-visible state an ADD leaves - an over-target learner owning it - is admitted with the budget and refused with it at zero. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: Provisioning states a desired replica set, not an over-target allowance. The owner's decision 8 keeps formation and bootstrap a separate semantic question from spread recovery.
- **proposed authorization kind**: none
- **proposed kind note**: If provisioning needs over-target transitions the formation owner gets an explicit bootstrap authority; if it does not, the compatibility admission is proved unnecessary. Neither is decided here.
- **minting evidence available**: The provisioning path knows the desired replica count it is provisioning to.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/control_plane_publications-p1, budget-dependence/whole-stated-grid/schema_operations-p1, budget-dependence/whole-stated-grid/sql_transaction_participants-p1, budget-dependence/whole-stated-grid/sql_transactions-p1, budget-dependence/whole-stated-grid/sql_write_operations-p1, guard-reachability/control_plane_publications-p1, guard-reachability/schema_operations-p1, guard-reachability/sql_transaction_participants-p1, guard-reachability/sql_transactions-p1, guard-reachability/sql_write_operations-p1
- **producer operation types**: ADD
- **still-unclassified because**: The provisioning module carries NO system/user partition predicate, so nothing in the code forbids a system partition id reaching it; its callers are the CREATE TABLE and existing-table reconciliation paths, and system tables are seeded through the bootstrap schema path instead. That is an argument about callers, not an enforced invariant. What would classify it: either a predicate in the code, or an exhaustive trace of every caller of provisionInitialPartition showing no system-table id can reach it.
- **what would classify it**: Either a predicate in the provisioning code, or an exhaustive trace of every caller showing no system-table id can reach it; and, if one can, whether formation needs its own bootstrap transition type.
- **repair group (nothing started)**: initial-provisioning-semantics
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The census finds exactly two createOperation callers, of which this is one: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
  - **CODE** - No system/user predicate exists in src/query/sql-query-engine-initial-partition-provisioning.js.
  - **INFERRED** - That no bootstrap or migration path routes a system-table id into it.

### ledger-expand-for-spread-add

- **path**: move-planner-move-calculation-methods.js:calculateMoves -> move-planner-priority-spread-cure.js:applyPrioritySpreadExpandCure -> replica-placement-cure-policy.js:classifyLedgerExpandForSpreadCureCondition -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: planner-ledger-expand-for-spread-add
- **triggering state**: The operation ledger is AT target with three voters on two nodes after its first exclusive REPLACE: the planner converts the planned REPLACE into a standalone expand ADD onto the missing node. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends_only_when_census_moved**
- **budget-only differential**: The moved-census state - the learner meets the guard at target+2 - is admitted with the budget and refused with it at zero, measured on the real guard. It is the ONLY state in which this row touches the budget. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **budget-independence differential**: The state the producer creates - the ledger at target when the expand ADD is planned, so the learner promotes to target+1 - is granted with the budget forced to zero across the whole stated grid, by the same complete-domain differential the hand-off rows use. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **census-movement condition**: It touches the budget only if the voter census moves further between planning and promotion, so the learner meets the guard at target+2 or beyond. No test in this quest drives the producer into that state.
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: src/rebalancer/replica-placement-cure-policy.js
- **semantic owner reason**: The same module owns this spread-cure condition and types it SPREAD_REPLICAS; it is a different row of the cure table from the one the mint authorizes.
- **proposed authorization kind**: critical_spread_cure
- **proposed kind note**: The existing kind fits the semantic. Widening the mint to this condition is an owner decision this quest does not take, and it matters only if the moved-census state is ever shown reachable from this producer.
- **minting evidence available**: The same placement evidence and the same partition-row authority the over-target mint already reads; at this condition the observed voter count equals the target.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/census-moved/replica_operations-p1, budget-independence-differential/producer-add-at-target/replica_operations-p1, guard-reachability/replica_operations-p1
- **policy cure condition**: ledger_expand_for_spread
- **producer operation types**: ADD
- **still-unclassified because**: The state the producer creates is measured and does NOT touch the budget. What is unsettled is whether the producer can leave an expand ADD in flight while the voter census moves further, which is the only way this row reaches the budget. What would classify it: a real-chain replay driving the planner through an expand cure whose census reaches target+2 before the learner is rechecked, or a code argument that the over-creation cap forbids it.
- **what would classify it**: Decide whether the expand condition is the same distinct-node spread-recovery semantic as the minted cure - in which case it consumes the same bounded authorization - or a different one that needs its own decision owner. Nothing here proposes widening the mint.
- **repair group (nothing started)**: unify-spread-recovery-authority
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: true
  2. under what semantic condition is it legitimate: The ledger is at target but below its distinct-node floor, and expanding onto the missing node before draining avoids a second serialized self-move.
  3. which component owns that condition: src/rebalancer/replica-placement-cure-policy.js owns the CONDITION and mints nothing for it, by construction.
  4. is it really the spread-cure semantic: true
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: only_when_the_census_moved
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The expand site re-types the ADD under its own cure row and attaches no authorization field at all: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - A learner at target+1 with an owned add-like operation is granted with the budget forced to zero, over the whole grid: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - authorizeSpreadCureTransition guards on classifyPriorityOverTargetSpreadCureCondition alone, so no expand condition can mint.

### ledger-under-representation-add

- **path**: move-planner-move-calculation-methods.js:calculateMoves (deficit cure) or unified-rebalancer-follow-up-move.js:buildDeficitFollowUpMove -> resolvePlacementCure(UNDER_REPRESENTATION) -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: planner-under-representation-add, follow-up-deficit-add
- **triggering state**: The partition is BELOW target when the ADD is planned. By the time its learner is rechecked the voter census has reached or passed target, so the learner meets the guard over target. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: An over-target learner owning an add-like ADD is admitted with the budget and refused with it at zero, on the real guard. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: The deficit cure authorizes reaching the target, never exceeding it: resolvePlacementCure(UNDER_REPRESENTATION) is typed INCREASE_REPLICA_COUNT. No module decides that this promotion may go over target; the guard infers it from the priority-recovery view. This is not a spread cure.
- **proposed authorization kind**: none
- **proposed kind note**: A deficit ADD that is no longer a deficit at promotion time has no semantic claim on an over-target allowance.
- **minting evidence available**: The deficit producer knows the target and the occupied count it planned against, but not the census the receiver will see.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/replica_operations-p1, guard-reachability/replica_operations-p1
- **producer operation types**: ADD
- **still-unclassified because**: Reachability at the GUARD is measured; reachability from the PRODUCER is not. Whether a production planner can leave a deficit ADD in flight while the census passes target is a planner-side race no test in this quest drives. What would classify it: a real-chain replay through two overlapping deficit ADDs on one priority partition, or a code argument that the count-aware gate forbids it.
- **what would classify it**: Establish which producer plans an add-like operation for an under-represented partition that is nonetheless at or above the voter target at promotion time, and whether that state is legitimate at all.
- **repair group (nothing started)**: guard-invisible-operation-state
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: true
  2. under what semantic condition is it legitimate: None stated: the deficit cure authorizes reaching the target, never exceeding it.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: true
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The guard grants this state today and refuses it with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - The deficit cure row is INCREASE_REPLICA_COUNT and carries no over-target allowance.
  - **INFERRED** - The planner-side race that puts the census over target while a deficit ADD is in flight.

### ledger-relocation-handoff-overlap

- **path**: unified-rebalancer-follow-up-augmentation-methods.js:augmentMovesWithPriorityRecoveryFollowUp -> unified-rebalancer-follow-up-move.js:buildPriorityRecoveryFollowUpMove (the OVER_REPLICATION_SUPPRESSED guard at :639-647, getHealthyReplicas at :634, selectPriorityRecoveryFollowUpSourceReplica at :541-567 and selectFollowUpTargetNodeId at :164-197) -> classifyPriorityRecoveryFollowUpCureCondition -> UNHEALTHY_SOURCE_AT_TARGET -> buildRelocationFollowUpMove -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: follow-up-unhealthy-source-replace
- **triggering state**: The healthy replica count is at or above target and the partition has enough HEALTHY replicas but they are co-located, so one is walked off a node that hosts more than one onto a node that hosts none. Its target learner is promoted BEFORE the named source is removed, so the partition is ONE voter over target for the hand-off. This row is that single overlap and nothing more. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **does_not_depend**
- **budget-independence differential**: Every grid state in which the voter census equals the target and this learner owns an add-like operation - the state a single promote-then-remove hand-off creates - across all 45 partitions and the whole stated range of targets, learners, operations, summary shapes, readiness and joining. In every such state the promotion is granted with the budget at its actual value and granted again with the budget forced to zero: the admission boundary is identical. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: src/rebalancer/unified-rebalancer-follow-up-move.js
- **semantic owner reason**: This module decides that the healthy replicas are badly placed, selects which one is walked off and where it goes. It is the only module that knows why this replacement is authorized. The cure policy is NOT named: it types the move and owns the same distinct-node condition for ADDs, but it does not take this decision.
- **proposed authorization kind**: none
- **proposed kind note**: No kind is proposed. Round 1 proposed priority_recovery_relocation; the owner's decision 2 refuses it and verification confirmed why: this module decides the SAME distinct-node spread condition the cure policy classifies for ADD. Mechanism is not authority. The proposal is to establish ONE spread-recovery decision owner and have both the ADD and the REPLACE mechanism consume its bounded authorization, with the operation shape bound strongly enough that an ADD authorization cannot authorize an unrelated REPLACE.
- **minting evidence available**: The follow-up owner holds the decision snapshot, the healthy replica set, the SELECTED SOURCE replica and node, the target node and the target replica count at decision time. It can state the source it is replacing, which is what makes a bound checkable.
- **validation evidence available**: The receiving replica already reads its own operation row, node, replica, declared replication factor and voter census. A relocation authorization naming the source replica is checkable against that same voter census without reading anything new.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **budget-dependent-authority-requirement**
  - unreachable: budget-dependent-authority-requirement
  - remains reachable: operation, guard-state
  - state slice: relocation-handoff
  - statement: Within the stated ordinary hand-off domain, no admission depends on the compatibility overflow budget; therefore a budget-dependent authority requirement is unreachable within this hand-off domain, and removing the budget creates no missing authority requirement for this class.
  - code argument: The admission boundary is identical with the budget at its measured value and with it forced to zero, in every state of this domain: the voter census equals the target and this learner owns the add-like operation that put it there, so the replacement allowance alone admits the promotion and the budget term is never the discriminator.
- **ledger result**: ordinary +1 relocation is covered by the normal replacement allowance; no ledger-local reason for additional overflow authority has been demonstrated.
- **bound receipts**: budget-independence-differential/relocation-handoff/replica_operations-p1, guard-reachability/replica_operations-p1, slice-provenance/relocation-handoff/follow-up-unhealthy-source-replace
- **producer operation types**: REPLACE
- **repair group (nothing started)**: unify-spread-recovery-authority
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: the partition has enough HEALTHY replicas but they are co-located, so one is walked off a node that hosts more than one onto a node that hosts none - a distinct-node spread condition, cured by a REPLACE rather than by an ADD. The ordinary +1 overlap is covered by the replacement allowance and needs no budget.
  3. which component owns that condition: src/rebalancer/unified-rebalancer-follow-up-move.js decides it; src/rebalancer/replica-placement-cure-policy.js only types the move and owns the same semantic separately for ADDs.
  4. is it really the spread-cure semantic: true
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Driving the REAL buildPriorityRecoveryFollowUpMove with three co-located healthy voters produces a REPLACE whose source is on the doubly-occupied node and whose target is an unoccupied node; with one replica FAILED the failed replica is never the source: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - The same move, carried through the REAL coordinator creation path to a replica_operations row and then to the REAL guard, is granted with the budget forced to zero: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - And over the whole stated grid, no state in which the census equals the target and the learner owns an add-like operation changes its admission when the budget is zeroed: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - selectPriorityRecoveryFollowUpSourceReplica iterates the HEALTHY replicas grouped by node and returns the first replica on a node with more than one, excluding the target node; selectFollowUpTargetNodeId excludes healthy, occupied and pending target nodes. A failed replica is filtered out by getHealthyReplicas before either runs.

### ledger-relocation-census-disagreement-overlap

- **path**: unified-rebalancer-follow-up-augmentation-methods.js:augmentMovesWithPriorityRecoveryFollowUp -> unified-rebalancer-follow-up-move.js:buildPriorityRecoveryFollowUpMove (the OVER_REPLICATION_SUPPRESSED guard at :639-647, getHealthyReplicas at :634, selectPriorityRecoveryFollowUpSourceReplica at :541-567 and selectFollowUpTargetNodeId at :164-197) -> classifyPriorityRecoveryFollowUpCureCondition -> UNHEALTHY_SOURCE_AT_TARGET -> buildRelocationFollowUpMove -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck - entered a SECOND time while the prior relocation is still draining
- **partition class**: replica_operations-p1
- **producers**: follow-up-unhealthy-source-replace
- **triggering state**: A prior relocation REPLACE has not yet had its source removed, and its target is still SYNCING in a voter role. The suppressor's census (inventory active count) reads AT target and lets a second relocation through, while the over-creation cap's census and the promotion guard's census both read one OVER target. The second target then promotes to two over target. With the prior target ACTIVE instead, the builder suppresses and no second relocation exists: the disagreement is the whole mechanism. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The chained state produced by the real chain: with the prior relocation target still SYNCING in a voter role the guard counts four voters at target three, and the second target is granted with the budget and refused with only the budget forced to zero. (test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified)
- **guard-reachable**: **yes** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: No module decides that a partition two voters over target may promote another learner. This overlap is not a replacement semantic at all: it is the consequence of two membership views disagreeing about the same replica. The planner SERIALIZES REPLACE on critical partitions to one in flight precisely because more "only builds a mutual-defer standoff" (src/rebalancer/move-planner-move-calculation-methods.js:671-688), so a chain is a defect that cap exists to prevent - never an availability mechanism, and never a reason to authorize.
- **proposed authorization kind**: none
- **proposed kind note**: No authorization is proposed. Authorization must never legalize a state that inconsistent observations created.
- **minting evidence available**: Nothing an authorization could honestly state: the producer believes the partition is at target, and it is not.
- **validation evidence available**: Not applicable while the condition is a view disagreement rather than a transition an owner decided.
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: budget-dependence/whole-stated-grid/replica_operations-p1, guard-reachability/replica_operations-p1
- **producer operation types**: REPLACE
- **still-unclassified because**: This is a CONSISTENCY finding, not an authority requirement. It is classified only when the membership/census boundary is settled.
- **what would classify it**: determine whether the two membership views are allowed to disagree in this state; if not, repair the owner/census boundary rather than authorize the resulting second transition
- **repair group (nothing started)**: resolve-membership-census-disagreement
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: true
  2. under what semantic condition is it legitimate: None identified. The owner's decision 3 asks first why the LEDGER itself legitimately needs an over-target transition; the local need is the +1 relocation the replacement allowance already covers, and the second voter comes from this disagreement, not from a ledger-local requirement.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: true
- **formation evidence (never upgrades a disposition)**: Two lab lines on this partition show a REPLACE target passing on the budget: scratchpad/lab-logs/adam-laptop-authority-carry/logs-1/node-1.log at 2026-09-19T11:00:37.732Z and node-2.log at 2026-09-19T11:00:48.215Z. Per machine: adam-laptop 2, lenovo-laptop 0, tv-dator 0; the four-core machine is a separate class and is not included. The 11:00:37.732Z line reads r1, r2 and r3 all on one node plus an earlier REPLACE target already a voter on a second node - four voters - and a second REPLACE target promoting to five with the overflow allowance in force. lab witness: transition observed; producer unattributed: no line names which producer created the second REPLACE, and two producers on this partition can emit one, so the transition is recorded and its producer is not.
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - On the real follow-up builder, four ACTIVE voters give over_replication_suppressed and only a prior target still SYNCING in a voter role yields a second REPLACE: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - The whole chain in one drive - builder, coordinator, guard - grants the second target today and refuses it with the budget at zero: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **MEASURED** - The real replica-inventory owner reports activeCount at target and activeVoterCount one over it for that same state: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
  - **CODE** - The serialization cap and its stated reason: "minting more REPLACEs ... only builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one critical partition thrashing ~114s, holding it over target until convergence times out)" (src/rebalancer/move-planner-move-calculation-methods.js:671-688).

### ledger-paired-relocation-replace

- **path**: move-planner-move-calculation-methods.js:calculateMoves (relocation pairing, :679-725) -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: planner-paired-relocation-replace
- **triggering state**: An under-represented target node paired with an over-represented source node. The REPLACE is count-neutral by intention, but its target learner is promoted BEFORE the source is removed. Whether that overlap ever reaches the budget, and whether this producer can also chain through a view disagreement, is not measured. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **unknown_producer_not_driven**
- **dependency unknown because**: No test in this quest drives the pairing producer, so nothing here is measured from it. Round 1 inferred does_not_depend from the at-target hand-off; that inference is withdrawn. The pairing is a LIVE CANDIDATE for the lab's chained REPLACE - it is one of the two producers that can emit a REPLACE on that partition, and no log line names which one did.
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: The cure table types this condition a count-neutral REPLACE. Nothing states that the transient over-replication during the hand-off is authorized.
- **proposed authorization kind**: none
- **proposed kind note**: Round 1 proposed replacement_handoff_overlap. The owner's decision 2 test applies here too and it does not survive: the pairing is typed by the SAME cure policy from a placement condition that policy owns, so a separate kind would institutionalize a mechanism rather than name a semantic. When this producer IS driven, its overlap splits the same way the relocation rows do: an ordinary hand-off overlap that may have legitimate replacement semantics, and any additional overlap from a view disagreement, which is a consistency finding and never an authorization.
- **minting evidence available**: The relocation pairing knows the source replica id and node it is walking off, the target node, and the partition target it planned against.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: guard-reachability/replica_operations-p1, producer-not-driven/planner-paired-relocation-replace
- **producer operation types**: REPLACE
- **still-unclassified because**: The dependency itself is unknown because the producer is not driven. What would classify it: a real-chain replay driving calculateMoves' pairing on a priority partition, through the coordinator to the guard, at target and with a prior relocation still draining.
- **what would classify it**: determine whether the two membership views are allowed to disagree in this state; if not, repair the owner/census boundary rather than authorize the resulting second transition - for whichever part of this producer's overlap turns out to come from one.
- **repair group (nothing started)**: resolve-membership-census-disagreement
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: An under-represented target paired with an over-represented source; the hand-off overlap is not stated as authorized anywhere.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: unknown
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The guard decides an ADD row and a REPLACE row identically, so nothing about the type changes the admission: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - The census finds this producer and its partition scope: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
  - **CODE** - ADD_LIKE_REPLICA_OPERATION_TYPES covers ADD and REPLACE, and operationOwnedCriticalReplacementPromotionAllowed fires for any owned add-like operation on a critical partition at or above target.
  - **INFERRED** - That this producer can be planned while the partition is already over target.

### ledger-operation-not-visible-to-the-guard

- **path**: any add-like producer -> replica_operations row -> the row reaches a terminal status, or is absent from this node's cache -> partition-service-learner-promotion-methods.js:readInFlightAddLikeOperationRowsForPromotion filters it out -> hasOwnedAddLikeOperation false -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: operation-not-visible-to-the-guard
- **triggering state**: An active learner service row with NO counted in-flight add-like operation, a voter census at or above target, and the priority-recovery view active. No replacement allowance applies unless the learner is also joining, so the cap is the target plus the budget alone. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: A learner with NO in-flight add-like row at a census of target or above is granted at the target-plus-budget cap and refused with the budget at zero, on the real guard. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__no_owned_operation__joining__counted_operation, allowance__over_by_1__no_owned_operation__joining__no_counted_operation, allowance__over_by_2__no_owned_operation__joining__counted_operation, allowance__over_by_2__no_owned_operation__joining__no_counted_operation, no_allowance__over_by_1__no_owned_operation__joining__counted_operation, no_allowance__over_by_1__no_owned_operation__joining__no_counted_operation, no_allowance__over_by_1__no_owned_operation__not_joining__counted_operation, no_allowance__over_by_1__no_owned_operation__not_joining__no_counted_operation, no_allowance__over_by_2__no_owned_operation__joining__counted_operation, no_allowance__over_by_2__no_owned_operation__joining__no_counted_operation, no_allowance__over_by_2__no_owned_operation__not_joining__counted_operation, no_allowance__over_by_2__no_owned_operation__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: No module authorized this promotion: the operation that would have carried the authority is invisible to the guard. The budget itself is granted from the UNRESOLVED PLANNER alone - the completion owner returns 2 with activeOperationCount 0 as long as plannerUnresolved is true.
- **proposed authorization kind**: none
- **proposed kind note**: Nothing is available to mint from. If the operation went terminal, the honest post-enforcement rule is a refusal.
- **minting evidence available**: None at the guard. Whatever produced the learner is no longer visible to it.
- **validation evidence available**: None beyond the membership the guard already counts.
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: budget-dependence/whole-stated-grid/replica_operations-p1, guard-reachability/replica_operations-p1
- **producer operation types**: ADD/REPLACE
- **still-unclassified because**: The admission class is measured on the real guard and witnessed live, but its PRODUCER is not settled, and it CANNOT be settled from guard-visible state: the guard's only input about the operation is its absence. Three candidates remain and none is confirmed - an add-like operation that reached a terminal status including the 60 s voter-ready timeout; a learner restored after a node restart whose operation row is not in this node's cache; and ReplicaRecoveryService.createPartitionReplica, which inserts a services row with no replica_operations row at all and is ruled out here because it has no construction site in src, examples or scripts at this head. See the architectural-result finding: the matrix does not encode a producer distinction the guard cannot see.
- **what would classify it**: Trace, from a production owner rather than from the guard, which producer leaves an active learner with no visible add-like operation, and decide whether that state is legitimate at all.
- **repair group (nothing started)**: guard-invisible-operation-state
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: true
  2. under what semantic condition is it legitimate: None identified: the operation that would carry the authority is not visible to the guard.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: true
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The real guard grants a learner with no in-flight add-like row at the target-plus-budget cap and refuses it with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - The in-flight traversal excludes TERMINAL_STATUSES (src/partition/partition-service-learner-promotion-methods.js:560-584).
  - **MEASURED** - ReplicaRecoveryService has no construction site in src, examples or scripts at this head.
  - **INFERRED** - Which of the two remaining candidate producers the lab lines saw. It is not derivable from guard-visible state.

### ledger-row-rematerialization

- **path**: operation-workflow-dispatch-reservation-gate.js:repairGateRepairedOperationRow -> operation-workflow-gate-operation-row-repair.js:repairOperationRowForGateRepairedReservation -> persistNewOperation; and replica-operation-repository-mutation-update-methods.js (the CL-017(b) re-insert at :360-373); and rebalance-coordinator-operation-persistence-collision.js:createSuccessorReplaceOperation -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: An add-like operation row is re-inserted, or a successor REPLACE identity is created after a persistence collision, and the resulting learner reaches the guard over target. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: Once the row exists the guard sees an ordinary owned add-like operation, and that state is admitted with the budget and refused with it at zero. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: These paths re-materialize or re-identify an operation someone else created. They decide nothing about legitimacy and add no authority of their own.
- **proposed authorization kind**: none
- **proposed kind note**: The authority, if any, belongs to the producer whose operation is being re-materialized. What these paths must preserve is the record already on the operation.
- **minting evidence available**: None of their own.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/replica_operations-p1, guard-reachability/replica_operations-p1
- **producer operation types**: ADD/REPLACE
- **still-unclassified because**: The gate repair and the CL-017(b) re-insert write the in-memory operation record, so whether a stamped authorization survives them is a property of that record; this quest measured the record's survival through the coordinator creation path only. The successor REPLACE builds a NEW identity, so an authorization naming the old operation id is not honoured for it. What would classify it: a real-chain replay of each re-materialization path on the real repository, asserting whether the record is still on the row afterwards.
- **what would classify it**: Replay each re-materialization path on the real repository and assert whether the stamped record is still on the row afterwards, and what a successor identity inherits.
- **repair group (nothing started)**: operation-row-rematerialization
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: true
  2. under what semantic condition is it legitimate: None of their own: they re-materialize an operation another producer created.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: true
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The census finds these sinks and no others that write an operation row: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
  - **MEASURED** - The authorization survives the coordinator creation path onto the row: test/rebalancer/overflow-budget-mintable-five-routes.test.js:every alternate route to the five carries the mint or is a matrix row
  - **MEASURED** - A record naming the old operation id is refused for a successor operation: test/rebalancer/overflow-budget-carried-forward-details.test.js:the partition-row read, the row type and the authorized count are settled
  - **INFERRED** - The behaviour of the two re-insert paths with respect to the stamped record.

### ledger-initial-provisioning-add

- **path**: table-creation-service-create-table.js or table-creation-service-existing-table-reconciliation.js -> sql-query-engine-initial-partition-provisioning.js:provisionInitialTablePartition -> createOperation -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: replica_operations-p1
- **producers**: provisioning-create-operation
- **triggering state**: Initial provisioning creates an ADD for a partition id the DDL caller supplies. If that id were one of this row's partitions, its learner would reach the guard like any other add-like operation. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: learner-promotion-count-check.js:resolvePromotionAllowances adds temporaryOverflowVoterBudget as allowances.additionalVoters (src/partition/learner-promotion-count-check.js:50-64) and evaluateLearnerPromotionCountCheck adds it to maxAllowedVotersAfterPromotion (src/partition/learner-promotion-count-check.js:125-130)
- **current budget dependency**: **depends**
- **budget-only differential**: The guard-visible state an ADD leaves - an over-target learner owning it - is admitted with the budget and refused with it at zero. (test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard)
- **guard-reachable**: **yes** - witness: test/partition/overflow-budget-admitted-case-grid.test.js:every budget-admitted state grid row maps to exactly one admission class
- **producer-reachable**: **unproven** - witness: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **admission classes**: allowance__over_by_1__owned_operation_visible__joining__counted_operation, allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__joining__counted_operation, allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation
- **semantic owner**: none_identified
- **semantic owner reason**: Provisioning states a desired replica set, not an over-target allowance. The owner's decision 8 keeps formation and bootstrap a separate semantic question from spread recovery.
- **proposed authorization kind**: none
- **proposed kind note**: If provisioning needs over-target transitions the formation owner gets an explicit bootstrap authority; if it does not, the compatibility admission is proved unnecessary. Neither is decided here.
- **minting evidence available**: The provisioning path knows the desired replica count it is provisioning to.
- **validation evidence available**: The receiving replica reads its own operation row, node, replica, partition replication factor and voter census for this check already. It could validate a bounded authorization of the same shape the spread cure uses, but it cannot today tell this operation apart from a spread-cure ADD: the evaluation ignores the row type and the row carries no other intent (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- **enforcement disposition**: **still-unclassified**
- **bound receipts**: arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_1__owned_operation_visible__not_joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__joining__no_counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__counted_operation, arithmetic-admission-class/allowance__over_by_2__owned_operation_visible__not_joining__no_counted_operation, budget-dependence/whole-stated-grid/replica_operations-p1, guard-reachability/replica_operations-p1
- **producer operation types**: ADD
- **still-unclassified because**: The provisioning module carries NO system/user partition predicate, so nothing in the code forbids a system partition id reaching it; its callers are the CREATE TABLE and existing-table reconciliation paths, and system tables are seeded through the bootstrap schema path instead. That is an argument about callers, not an enforced invariant. What would classify it: either a predicate in the code, or an exhaustive trace of every caller of provisionInitialPartition showing no system-table id can reach it.
- **what would classify it**: Either a predicate in the provisioning code, or an exhaustive trace of every caller showing no system-table id can reach it; and, if one can, whether formation needs its own bootstrap transition type.
- **repair group (nothing started)**: initial-provisioning-semantics
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: true
  2. under what semantic condition is it legitimate: None stated: provisioning declares a desired replica set, not an over-target allowance.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: true
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - The census finds exactly two createOperation callers, of which this is one: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
  - **CODE** - No system/user predicate exists in src/query/sql-query-engine-initial-partition-provisioning.js.
  - **INFERRED** - That no bootstrap or migration path routes a system-table id into it.

### owner-partition-services

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: services-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 1 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/services-p1
- **producer operation types**: ADD/REPLACE
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: Stated in this row; no module decides that the promotion may go over target.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

### owner-partition-nodes

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: nodes-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 1 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/nodes-p1
- **producer operation types**: ADD/REPLACE
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: Stated in this row; no module decides that the promotion may go over target.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

### owner-partition-partitions

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: partitions-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 1 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/partitions-p1
- **producer operation types**: ADD/REPLACE
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: Stated in this row; no module decides that the promotion may go over target.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

### owner-partition-message_groups

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: message_groups-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 1 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/message_groups-p1
- **producer operation types**: ADD/REPLACE
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: Stated in this row; no module decides that the promotion may go over target.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

### owner-partition-tables

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: tables-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 1 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/tables-p1
- **producer operation types**: ADD/REPLACE
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: Stated in this row; no module decides that the promotion may go over target.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

### owner-partition-config

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: config-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 1 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/config-p1
- **producer operation types**: ADD/REPLACE
- **six answers**: 
  1. can an over-target promotion or replacement reach the guard: true
  1b. is it granted today: false
  2. under what semantic condition is it legitimate: Stated in this row; no module decides that the promotion may go over target.
  3. which component owns that condition: none_identified
  4. is it really the spread-cure semantic: false
  5. production-shaped witness constructed: true
  6. does removing the budget change the decision: false
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

### remainder-non-priority-critical-partitions

- **path**: any add-like producer -> unified-rebalancer-move-execution.js:executeMoveViaCoordinator -> rebalance-coordinator-operation-creation.js:createOperationRecordInternal -> replica_operations row -> dispatch -> partition-service-learner-promotion-methods.js:runLearnerPromotionCheck -> learner-promotion-count-check.js:evaluateLearnerPromotionCountCheck
- **partition class**: indices-p1, logs-p1, live_queries-p1, contexts-p1, code-p1, node_endpoints-p1, service_definitions-p1, service_bindings-p1, service_endpoints-p1, service_timers-p1, service_packages-p1, service_revisions-p1, service_installations-p1, service_install_failures-p1, module_manifests-p1, package_registry_mappings-p1, package_registry_overrides-p1, module_dependency_locks-p1, wasm_operations-p1, schema_migrations-p1, schema_migration_partitions-p1, debug_sessions-p1, debug_breakpoints-p1, debug_snapshots-p1, storage_reservations-p1, latency_groups-p1, inter_group_latencies-p1, service_partition_access-p1, call_cell_reduce_slots-p1, call_cell_reduce_results-p1, call_activation_leases-p1, artifact_payloads-p1, artifact_payload_chunks-p1
- **producers**: planner-under-representation-add, planner-paired-relocation-replace, provisioning-create-operation, operation-not-visible-to-the-guard, coordinator-create-operation, coordinator-concurrent-budget-turn, coordinator-successor-replace, coordinator-target-claim-retry, dispatch-gate-operation-row-repair, repository-divergence-reinsert, coordinator-persist-funnel, repository-persist-funnel, coordinator-owner-facade-persist
- **triggering state**: Any membership, operation and readiness state. The guard is reached and the critical branch is on, but the priority-recovery completion owner is never consulted, so no overflow budget exists to spend. LEGACY COUPLING (owner decision 3, not contract): the budget on this partition can be switched on by ANOTHER partition's spread gap, because the completion owner is handed the chosen priority summary WHOLE and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary) (src/partition/partition-service-learner-promotion-count-check-methods.js:168-177). The grid measures it as the gapOther shape. No replacement authorization may reproduce it: every authorization must be attributable to its own partition and transition.
- **current guard reason**: the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
- **current budget dependency**: **unreachable_in_stated_domain**
- **guard-reachable**: **no** - witness: none
- **producer-reachable**: **no** - witness: none
- **admission classes**: none (no budget-admitted case)
- **semantic owner**: none_identified
- **semantic owner reason**: There is no budget-admitted case here to own. The replacement allowance of one voter that does apply is owned by learner-promotion-count-check.js:resolveReplacementPromotionAllowed and is outside this audit's scope.
- **proposed authorization kind**: none
- **minting evidence available**: not applicable: nothing here depends on the budget, so nothing has to be minted to replace it.
- **validation evidence available**: not applicable.
- **enforcement disposition**: **proved-unreachable**
- **unreachable subject**: **guard-admission-state**
- **proved-unreachable domain**: Every membership, readiness, summary, operation and target state the promotion guard can be in for these partitions, enumerated as a grid over the REAL learner-promotion methods bag, the REAL priority-recovery completion owner and the REAL count check, each state compared against a double of the completion owner whose budget is forced to zero.
  - grid: test/partition/overflow-budget-unmintable-partitions.test.js, 30240 states per partition over 33 partition(s)
  - ranges: voters=[1, 2, 3, 4, 5, 6, 7]; learners=[1, 2, 3]; targets=[1, 2, 3, 4, 5]; operations=[0, 1, 2]; summaries=[absent, null, satisfied, gapSelf, gapOther, missing]; recoveryPending=[true, false]; joining=[true, false]; operationTypes=[ADD, REPLACE]; ownedByThisLearner=[true, false]
  - code argument: Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.
- **bound receipts**: guard-unreachability/whole-stated-grid/artifact_payload_chunks-p1, guard-unreachability/whole-stated-grid/artifact_payloads-p1, guard-unreachability/whole-stated-grid/call_activation_leases-p1, guard-unreachability/whole-stated-grid/call_cell_reduce_results-p1, guard-unreachability/whole-stated-grid/call_cell_reduce_slots-p1, guard-unreachability/whole-stated-grid/code-p1, guard-unreachability/whole-stated-grid/contexts-p1, guard-unreachability/whole-stated-grid/debug_breakpoints-p1, guard-unreachability/whole-stated-grid/debug_sessions-p1, guard-unreachability/whole-stated-grid/debug_snapshots-p1, guard-unreachability/whole-stated-grid/indices-p1, guard-unreachability/whole-stated-grid/inter_group_latencies-p1, guard-unreachability/whole-stated-grid/latency_groups-p1, guard-unreachability/whole-stated-grid/live_queries-p1, guard-unreachability/whole-stated-grid/logs-p1, guard-unreachability/whole-stated-grid/module_dependency_locks-p1, guard-unreachability/whole-stated-grid/module_manifests-p1, guard-unreachability/whole-stated-grid/node_endpoints-p1, guard-unreachability/whole-stated-grid/package_registry_mappings-p1, guard-unreachability/whole-stated-grid/package_registry_overrides-p1, guard-unreachability/whole-stated-grid/schema_migration_partitions-p1, guard-unreachability/whole-stated-grid/schema_migrations-p1, guard-unreachability/whole-stated-grid/service_bindings-p1, guard-unreachability/whole-stated-grid/service_definitions-p1, guard-unreachability/whole-stated-grid/service_endpoints-p1, guard-unreachability/whole-stated-grid/service_install_failures-p1, guard-unreachability/whole-stated-grid/service_installations-p1, guard-unreachability/whole-stated-grid/service_packages-p1, guard-unreachability/whole-stated-grid/service_partition_access-p1, guard-unreachability/whole-stated-grid/service_revisions-p1, guard-unreachability/whole-stated-grid/service_timers-p1, guard-unreachability/whole-stated-grid/storage_reservations-p1, guard-unreachability/whole-stated-grid/wasm_operations-p1
- **producer operation types**: ADD/REPLACE
- **grouping criterion**: Grouped ONLY on the three properties the disposition rests on, each demonstrated by the same grid rather than asserted: the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero. Their PRODUCERS are not claimed to be identical, and nothing in this row rests on that.
- **formation evidence (never upgrades a disposition)**: none_recorded
  - producer attributed: false; attribution form: none
- **evidence**: 
  - **MEASURED** - Over the stated grid the completion owner is never consulted, the budget is never non-zero, and no state's cap or decision differs with the budget forced to zero: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **MEASURED** - A five-state slice per partition driven through the FULL runLearnerPromotionCheck, with and without the zero-budget double, decides identically: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard
  - **CODE** - the budget input is undefined: partition-service-learner-promotion-count-check-methods.js:resolvePriorityRecoveryCompletionForLearnerPromotion returns null unless classifySystemPartition().priorityControlPlane (src/partition/partition-service-learner-promotion-count-check-methods.js:100-111), so Number.isFinite(undefined) is false and additionalVoters is 0 (src/partition/learner-promotion-count-check.js:50-54); the cap is target + one replacement voter, with or without the budget
  - **CODE** - Both disjuncts of the gate are decided before any membership, readiness or summary state is read. classifySystemPartition({partitionId}).priorityControlPlane is a pure function of the partition id, and the other disjunct, nodeReadiness.recoveryPending, is itself false by construction because readPriorityRecoveryReadinessForLearnerPromotion only reads a readiness snapshot for a priorityControlPlane partition (src/partition/partition-service-learner-promotion-count-check-methods.js:63-86). Nothing outside the grid can turn the budget on, because nothing outside the grid is read before the gate closes.

## The priority-recovery relocation REPLACE, classified independently

- **question**: Is an over-target REPLACE an intentional safety mechanism, or one that merely survives on the old overflow budget?
- **correction to round 1**: The round-1 matrix called this path an "unhealthy-source REPLACE" and named its condition after the classifier. That was wrong. MEASURED on the real owner: the REPLACE source is selected FROM the HEALTHY replicas (getHealthyReplicas at src/rebalancer/unified-rebalancer-follow-up-move.js:634, then selectPriorityRecoveryFollowUpSourceReplica at :541-567), preferring one on a node that hosts more than one; a FAILED replica is filtered out before the selection runs and can never be the source. The target is an UNOCCUPIED eligible node (selectFollowUpTargetNodeId at :164-197 excludes healthy, occupied and pending target nodes). UNHEALTHY_SOURCE_AT_TARGET is a misnomer.
- **correction to round 2**: The round-2 matrix classified the CHAINED over-replication as required-for-availability, arguing from the deliberate drain-phase invisibility. That INVERTED the owner's words. The move owner does not tolerate concurrent REPLACEs on a critical partition: it serializes them to one in flight, and states that minting more "only builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one critical partition thrashing ~114s, holding it over target until convergence times out)" (src/rebalancer/move-planner-move-calculation-methods.js:671-688). The drain-phase invisibility exists so that the serialization cap can SEE a draining REPLACE, not so that a second one may be planned. A chain is the defect that cap exists to prevent.
- **the condition, named truthfully**: The partition has enough HEALTHY replicas but they are co-located: one is walked off a node that hosts more than one onto a node that hosts none. That is a DISTINCT-NODE SPREAD condition, cured by a REPLACE instead of by an ADD.
- **is it a spread cure**: PROVEN yes, as a semantic, and the owner's decision 8 settles what follows: ADD and the follow-up REPLACE are two MECHANISMS of one distinct-node spread-recovery semantic, decided in two modules. No second authority kind is proposed. The future proposal is ONE spread-recovery decision owner whose bounded authorization both mechanisms consume, with the operation shape bound strongly enough that an ADD authorization cannot authorize an unrelated REPLACE.
- **hand-off over-replication**: **implementation-artifact** - A REPLACE is typed count-neutral by the cure policy - moveType REPLACE, moveReason REPLACE_REPLICA (src/rebalancer/replica-placement-cure-policy.js:178-184), with the 2b5875b0 comment at :101-107 stating that a REPLACE cures placement mismatch and never a count deficit. The one extra voter exists only because the workflow promotes the target before it dispatches the source removal: the remove-dispatch phase is a LATER workflow step (REPLACE_REMOVE_DISPATCH_WORKFLOW_STEPS = ACTIVE, STOPPING, src/rebalancer/replica-operation-progress.js:281-283). No module states that the overlap is authorized; it is the consequence of the ordering. MEASURED, over the complete stated grid: it needs no budget at all.
- **chained over-replication**: **serialization-defect** - The SECOND voter above target appears only when a prior relocation REPLACE is still draining AND the suppressor's census disagrees with the guard's about that prior target. It is not an availability mechanism: the move owner CAPS concurrent REPLACE on critical partitions at one in flight for exactly this reason, in its own words at src/rebalancer/move-planner-move-calculation-methods.js:671-688. The state is a CONSISTENCY finding - two membership views disagreeing about one replica - and the requirement is to determine whether they may disagree there, not to authorize the transition the disagreement produced.
- **authorization never legalizes inconsistency**: Authorization never legalizes a state created by inconsistent observations. Where an extra overlap traces to two views disagreeing, the repair belongs on the owner/census boundary and the row stays still-unclassified.
- **reliance on the budget**: **accidental** - The ordinary hand-off overlap needs no budget: MEASURED over the complete stated domain, a REPLACE target on a partition at target is granted on the replacement allowance alone with the budget forced to zero. The budget is spent only on the SECOND overlap, and no module decides that a partition two voters over target may promote another learner - the guard infers it from the priority-recovery view. So the reliance is accidental, and the state it absorbs is a defect rather than a design.
- **the guard never infers legitimacy from topology**: No proposal here has the guard infer replacement legitimacy from topology. The one future authorization proposed is minted by the spread-recovery decision owner and names the source it replaces; the receiver checks that named source against the voter census it already reads.
- **owner of the relocation decision**: src/rebalancer/unified-rebalancer-follow-up-move.js (buildPriorityRecoveryFollowUpMove decides the healthy replicas are co-located, selects which one is walked off and where it goes)
- **owner of the paired relocation**: src/rebalancer/move-planner-move-calculation-methods.js (the relocation pairing decides which over-represented source is walked off which node onto which under-represented target). NOT DRIVEN by this quest: its rows carry unknown_producer_not_driven.
- **cure typing owner**: src/rebalancer/replica-placement-cure-policy.js owns the condition-to-move TYPING for both, and owns the same distinct-node spread condition for ADDs; it must not be named as the semantic owner of a replacement decision it does not take
- **the three censuses**: 
  - suppressor: `inventory.accounting.activeCount` at src/rebalancer/unified-rebalancer-follow-up-move.js:639-647 - in the promotion window it reads at target
  - over-creation cap: `max(inFlightAccounting.activeCount, inFlightAccounting.activeVoterCount)` at src/rebalancer/move-planner-move-calculation-methods.js:414-427 - in the promotion window it reads one over target
  - promotion guard: `live rows in a voter raft role, whatever their status` at src/partition/partition-service-learner-promotion-methods.js:278-322 - in the promotion window it reads one over target
- **scope of the census disagreement**: CORRECTED in round 3, in the opposite direction to round 2. Driving the REAL builder: with the prior relocation target ACTIVE the builder answers over_replication_suppressed and no second REPLACE exists at all; only with that prior target still SYNCING in a voter role - the state in which the suppressor's census reads AT target while the guard's reads one OVER it - is a second REPLACE created. On this producer the census disagreement is the only way the chain is reached. Round 1 offered the disagreement as the explanation and dropped it for the chain; round 2 replaced it with the chain alone; both were wrong, and the measurement is that they are the same mechanism.
- **lab attribution**: **INFERRED** (owner_unavailable_released) - lab witness: transition observed; producer unattributed. The 2026-09-19 ledger lines record a REPLACE target promoted over target with the overflow allowance in force. They do NOT name the producer: two producers on that partition can emit a REPLACE (the priority-recovery follow-up and the planner's relocation pairing), no line correlates an operation or producer id, no payload is uniquely attributable, no trace names the owner, and no structural argument excludes the other producer. Attributing the lines to the follow-up builder because its chained shape matches would be timing and resemblance, not attribution. The nodes that produced those logs have been released, so the correlation cannot be re-measured from them; a future lab run that logs the producing owner would settle it. Nothing in this matrix rests on the attribution.
- **paired relocation**: The planner's relocation pairing is NOT driven by this quest. Its rows carry unknown_producer_not_driven, and it stays a live candidate for the lab lines above.
- **the remove-dispatch phase**: In its remove-dispatch drain phase a REPLACE is deliberately invisible to the TOPOLOGY-BLOCKING view (src/rebalancer/move-planner-state-methods.js:349-357) so that other work may proceed, while the serialization view deliberately DOES see it, "since the standoff is built by drain-phase REPLACEs the topology-blocking view cannot see". The spread completion separately treats a REPLACE remove-dispatch target as satisfying (src/control-plane/priority-recovery-completion.js:170-179). Both make the over-replication window longer than the promotion itself; neither authorizes a second one.
- **the owner's own words**: 
  - src/rebalancer/move-planner-move-calculation-methods.js:671-688 - "Serialize REPLACE on critical control-plane partitions to one in-flight at a time. ... minting more REPLACEs - each a distinct source/target accumulated across ticks because a row-only surplus read does not see prior in-flight REPLACEs - only builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one critical partition thrashing ~114s, holding it over target until convergence times out)."
  - src/rebalancer/replica-placement-cure-policy.js:96-98 - "The partition is at target count but a source replica should be walked off its node (priority-recovery follow-up)."
  - src/rebalancer/replica-placement-cure-policy.js:101-107 - "ADD cures under-replication, REMOVE cures surplus and failure, the count-neutral REPLACE cures placement mismatch (2b5875b0: never conflate the two - a REPLACE cannot cure a count deficit, an ADD cannot cure skew)."
  - src/rebalancer/unified-rebalancer-follow-up-move.js:639-640 - "ACTIVE count suppresses add-like work only after a terminal projection; an occupied SYNCING row may still need the replacement cure below."
  - src/rebalancer/move-planner-state-methods.js:349-357 - "Read ALL non-terminal in-flight operations for this entity, INCLUDING REPLACEs in their remove-dispatch drain phase ... this is the set that holds the per-partition reconfiguration serialization lock for its whole lifetime."
  - src/rebalancer/move-planner-move-calculation-methods.js:414-423 - "The surplus is counted by the AUTHORITATIVE raft-voter count (activeVoterCount), not the status===ACTIVE count (activeCount) ... Take the MAX of the two so the cap is strictly non-regressive."

## The carried-forward details, settled as findings

### The partition-row read's timing

- Can the partition row change between the mint and the promotion, so that the authorization describes a policy no longer in force? Could reading it later, or earlier, create or remove that window?
- read at mint: At MINT time, inside the policy owner: authorizeSpreadCureTransition calls context.resolvePartitionRow() while it builds the record (src/rebalancer/replica-placement-cure-policy.js:423-432). MEASURED: the resolver is called once when the cure CONDITION holds, including on plans that then mint nothing, because the record is built before it is validated.
- read again: At PROMOTION time, by the guard's own resolveTargetReplicaCountForPromotion, whose value the evaluation compares the record against (src/partition/partition-service-learner-promotion-count-check-methods.js:281).
- failure direction: **fail-closed**
- The window is the interval between the two reads, on two different nodes. Reading the row later - at dispatch, or at the stamp - shortens the interval; reading it earlier lengthens it; neither removes it, because only a read at the same instant as the guard's would, and that is not available across nodes. The carry stage's verifier recorded "the partition-row read could be later" as a cost observation (159 of 237 reading states mint nothing), which is a different question from correctness.
- **finding**: The read's TIMING is a cost question, not a correctness one. Moving it changes how often a plan pays for a row it does not use; it does not close the mint-to-promotion window, and the window is already fail-closed. The audit therefore recommends NOT moving the read for correctness reasons, and leaves the cost question to the owner.

### Is the row type part of authority identity?

- Can two operation or record types share enough shape for an authorization valid for one to be interpreted as another?
- checked today: false
- MEASURED: the same minted record stamped on an ADD row and on a REPLACE row with the same operation id and destination evaluates identically and is honoured in both cases. resolveAuthorizationOutcomeReason compares intent, operation id, destination node and replica, and the replication factor - never the row type (src/rebalancer/spread-cure-transition-authorization.js:384-408).
- Only one kind exists, and it is minted only for an ADD produced by the over-target retention site, so no REPLACE can obtain one from a producer. The coordinator stamps the record onto the operation it is creating, so the operation id already ties the record to one row.
- MEASURED: a successor REPLACE built after a persistence collision carries a NEW operation id, so a record naming the old operation reads authorization_operation_mismatch. A record re-stamped onto the successor would be honoured - which is a property of the stamp, not of the evaluation.
- **recommendation**: bind-the-type-before-a-second-kind-exists - Type is not part of authority identity today and does not need to be while one kind exists. It MUST become part of it before any second kind is minted: the replacement kinds this audit proposes mean something different for a REPLACE than for an ADD, and the evaluation has no other way to tell them apart. This is a proposal; the quest binds nothing.

### What the authorized count bounds

- authorizedResultingVoterCount = observedVoterCount + 1, where observedVoterCount is the planner's surplusVoterCount = max(inFlightAccounting.activeCount, inFlightAccounting.activeVoterCount)
- why the voter term: The owner's own words (src/rebalancer/move-planner-move-calculation-methods.js:414-423): "The surplus is counted by the AUTHORITATIVE raft-voter count (activeVoterCount), not the status===ACTIVE count (activeCount). A just-promoted voter reads raft_role=follower while its status column still lags at creating/syncing ... activeVoterCount reads the SAME voters the promotion guard is blocked by (countActiveVoters), closing that read disagreement."
- why the status term: The same comment: "Take the MAX of the two so the cap is strictly non-regressive: it never fires LESS than the status-only read did." The status term is kept for NON-REGRESSION against the older read, not because it measures anything the voter term does not.
- MEASURED on the real replica-inventory owner. Promotion window (a SYNCING row in a voter raft role): activeCount 3, activeVoterCount 4. Active non-voter (an ACTIVE row in a learner role): activeCount 4, activeVoterCount 3. The max is therefore neither census.
- **bounded quantity**: effective-membership-during-transition - It is the PEAK of two views of membership - what the status column has settled on, and what the raft roles already show - so it bounds the largest membership either view can justify while a transition is in flight. It is not a voter bound (an active non-voter inflates it), not an active-holder bound (a syncing voter inflates it), and not a count of anything that exists as one set.
- membership identity: The two views are not merely two COUNTS of one set: they can name DIFFERENT replicas. MEASURED on the real replica-inventory owner with voter rows r-3 and r-4 and ACTIVE rows r-1 and r-2, activeCount is 2 and activeVoterCount is 2 while four distinct replicas are occupied. Neither view contains the other and the max is below the size of their union.
- the max undercounts the union by: 2
- name (LABELLED HYPOTHESIS, not a proposal of record): `effectiveMembershipDuringTransition`
- Nothing is renamed by this quest, and no formula is chosen. The consequence recorded instead: the authorization the receiver will one day enforce states this number as if it were a voter count, and the receiver's own census is a voter census.

## The membership ceiling (no formula is chosen here)

- status: **not-established**
- Whether one membership view is contained in the other. Until that is proved, max(|A|, |B|) is not known to bound |A union B|, and this audit records that rather than choosing a formula.
- MEASURED on the real replica-inventory owner: activeCount 2 and activeVoterCount 2, with the voter rows r-3 and r-4 and the ACTIVE rows r-1 and r-2, occupying four distinct replicas. The max is 2 and the union is 4, so the max UNDERCOUNTS the union by 2. Containment therefore does not hold in general, and the cap is a bound on neither view's union with the other.
- effectiveMembershipDuringTransition is recorded as a LABELLED HYPOTHESIS for the quantity, not as a proposal of record. Naming it would fix a meaning the set identities have not yet established, and the owner's decision 9 forbids choosing one here.
- measured by: test/rebalancer/overflow-budget-carried-forward-details.test.js:the partition-row read, the row type and the authorized count are settled

The later membership-ceiling work tests the identities as SETS over these cases:

- status as a subset of raft
- raft as a subset of status
- overlapping non-subset sets
- disjoint differences with equal counts
- a stale member in one view and a newly admitted one in the other

## The future transition and its falsifiers

| case | outcome | reason | the landed evaluation refuses it |
| --- | --- | --- | --- |
| honoured | honoured | authorization_honoured | false |
| honoured-above-the-authorized-bound | honoured | authorization_honoured | false |
| honoured-below-the-authorized-bound | honoured | authorization_honoured | false |
| stale-epoch | not_honoured | authorization_membership_generation_stale | true |
| future-epoch | honoured | authorization_honoured | false |
| wrong-epoch-unreadable-partition-view | membership_fence_not_evaluated | authorization_membership_fence_not_evaluated | false |
| missing-epoch | membership_fence_not_evaluated | authorization_membership_fence_not_evaluated | false |
| wrong-partition | not_honoured | authorization_destination_mismatch | true |
| altered-authorized-bound | not_honoured | authorization_malformed | true |
| wrong-semantic-authority | not_honoured | authorization_malformed | true |

- **honoured** - The transition enforcement will rely on: present, from the correct authority, with a matching epoch. It is granted, so "refuses" is false by design rather than as a finding.
- **honoured-above-the-authorized-bound** - FINDING, and the one that decides gate item 8. A record authorizing FIVE voters, evaluated for a promotion that would make EIGHT, is honoured: the outcome is decided without the bound, and wouldBeWithinAuthorizedBound is a separate field reading false. The source says so itself - "A lab count of promotions an enforced bound would admit must AND this with the evaluation outcome being HONOURED" (src/rebalancer/spread-cure-transition-authorization.js:422-428). Today's honoured is therefore not the complete evaluation result.
- **honoured-below-the-authorized-bound** - The benign side of the same arithmetic: a promotion to four under a bound of five is honoured and within bound, so the conjunction grants it. It is here so the case set contains a within-bound case that is not exactly AT the bound.
- **stale-epoch** - Refused. The fence is deliberately one-sided: older than the partition can see is refused.
- **future-epoch** - FINDING. An authorization stating an epoch HIGHER than the partition reads is honoured, not refused. The fence compares observed < partition only (src/rebalancer/spread-cure-transition-authorization.js:404-407). The carry stage documents this as "a partition whose own epoch view lags the authorization accepts it", which is a decision, but it means "wrong epoch" is only half-fenced.
- **wrong-epoch-unreadable-partition-view** - FINDING. A supplied but invalid partition epoch (not a non-negative integer) reads NOT EVALUATED rather than refused, so a caller that cannot read its own epoch silently loses the fence instead of failing closed. Carried forward by the carry stage's round-2 verification.
- **missing-epoch** - By design in the carry stage: the landed guard supplies no epoch, so this is the outcome of EVERY landed evaluation today. It is neither honoured nor refused, which is exactly why only the complete outcome honoured may ever grant.
- **wrong-partition** - FINDING, refused but indirectly. The record carries no partition id; a foreign partition is caught only because the destination replica id is partition-scoped. Partition identity is therefore an inference from a string, not a stated field.
- **altered-authorized-bound** - Refused at the DECODE, because the sanctioned record requires authorizedResultingVoterCount === observedVoterCount + 1. Raising BOTH counts together stays well formed and is honoured at the higher bound: see the carried-forward finding on what the authorized count bounds.
- **wrong-semantic-authority** - FINDING. Refused, but as MALFORMED rather than as authorization_intent_unknown: the decode rule for the intent field rejects any value but critical_spread_cure, so the named INTENT_UNKNOWN reason is unreachable from a durable row and can only be produced by a hand-built binding. A second authorization kind would have to change that decode.

## The grant rule: the interim pin and what it inherits

- interim pin: `honoured && wouldBeWithinAuthorizedBound` - This audit only. It is a PIN on today's two-field result, not a proposed enforcement rule.
- interim rule, as the test names it: interim: outcome honoured AND within the authorized bound
- TARGET rule: `evaluation.outcome === honoured`
- Today's honoured is never described as complete: the landed evaluation decides it WITHOUT the authorized bound, and the source itself says a consumer must AND the outcome with wouldBeWithinAuthorizedBound (src/rebalancer/spread-cure-transition-authorization.js:422-428).
- inherited requirement, verbatim: "after that quest, the only consumer rule is `outcome === honoured`; every bound and identity failure produces a non-honoured outcome"
- inherited by: the sealed authorization identity and evaluation quest
- the one case that IS honoured and within bound: the bound exactly reached
- carrier changed by this quest: false
- pinned by: test/rebalancer/spread-cure-authorization-future-transition.test.js:the future honoured transition and its seven falsifiers are pinned

Cases that must NOT be honoured once the bound is inside the outcome:

- bound exceeded by exactly one
- malformed bound (both counts raised together is NOT this case: it is well formed at the higher bound)
- absent bound (no authorization on the row at all)
- missing bound field on an otherwise well-formed record
- zero bound
- a very small bound, exceeded
- unreadable promotion count
- wrong partition
- wrong semantic authority
- future epoch
- invalid supplied epoch
- zero supplied epoch

## The state slices evidence is measured over

- **whole-stated-grid** - every state of the exhaustive promotion-guard grid
  - voter census: any; owned add-like operation: null; operation type: null
  - created by: no producer requirement
- **relocation-handoff** - the states a single promote-then-remove RELOCATION hand-off creates: the voter census equals the target and this learner owns the REPLACE that put it there
  - voter census: equals-target; owned add-like operation: true; operation type: REPLACE
  - created by: a producer that emits a relocation REPLACE
- **census-moved** - the states in which the voter census already stands above the declared target
  - voter census: above-target; owned add-like operation: null; operation type: null
  - created by: no producer requirement
- **producer-add-at-target** - the states an ADD producer itself creates: the voter census equals the target and this learner owns the ADD that put it there
  - voter census: equals-target; owned add-like operation: true; operation type: ADD
  - created by: no producer requirement

## The correction to round 3

- Round 3 rejected these two rows for carrying a measured does_not_depend together with explicit-authority-required. The measurement stands and the disposition changes: a class whose admission does not depend on the budget needs no authority to replace the budget.
- rows corrected: five-relocation-handoff-overlap, ledger-relocation-handoff-overlap
- from: explicit-authority-required to: proved-unreachable
- what is unreachable: budget-dependent-authority-requirement
- what remains reachable: operation, guard-state
- gate item that follows: 3
- its selection minimum: 3 -> 1
- The unreachable subject is a closed two-value enum INSIDE the existing proved-unreachable disposition, stated explicitly on every proved-unreachable row and naming a proposition that disposition conflated. No matrix class, row, disposition, dependency value or authorization kind is added, and no other row is reclassified.
- decision: lead ruling recorded in solve/quests/overflow-budget-audit-evidence-binding/log.ndjson at 2026-09-20T06:13:21.605Z
- ordinary +1 relocation is covered by the normal replacement allowance; no ledger-local reason for additional overflow authority has been demonstrated.

### Declared witness discrepancies

A discrepancy is a statement that a round-3 witness pointer did NOT measure what it was cited for. It is declared only where that is true; the pointer itself is pinned, not edited.

- **ledger-relocation-handoff-overlap**
  - pinned witness (drive): test/rebalancer/overflow-budget-unhealthy-source-replace.test.js
  - it drove: sql_transactions-p1
  - this row covers: replica_operations-p1
  - what does measure it: test/partition/overflow-budget-unmintable-partitions.test.js
  - The round-3 guard witness pointer names a real-chain drive that ran on sql_transactions-p1, which this row does not cover. The inherited guardReachable=yes stands: the exhaustive grid measures replica_operations-p1 on the real promotion guard and finds the completion owner consulted there. The pointer itself is pinned, not edited.
- **ledger-relocation-census-disagreement-overlap**
  - pinned witness (drive): test/rebalancer/overflow-budget-unhealthy-source-replace.test.js
  - it drove: sql_transactions-p1
  - this row covers: replica_operations-p1
  - what does measure it: test/partition/overflow-budget-unmintable-partitions.test.js
  - The round-3 guard witness pointer names a real-chain drive that ran on sql_transactions-p1, which this row does not cover. The inherited guardReachable=yes stands: the exhaustive grid measures replica_operations-p1 on the real promotion guard and finds the completion owner consulted there. The pointer itself is pinned, not edited.

### Inherited weaknesses, recorded and NOT repaired

- **blocking-findings-are-listed-but-not-required**
  - Gate items 2, 3 and 4 list blockingFindings in the contract but do not carry namedFindingsResolved in their requires, so those findings do not gate their items. Items 5 to 9 do carry it.
  - measured by: verification round 1 (subagent:a2cec543087d69ef1)
  - recorded, NOT repaired by this quest: the gate contract is inherited round-3 content and changing which requirements an item carries would change gate semantics this quest is not authorized to touch. It goes to the re-audit.
- **ledger-rows-are-witnessed-by-a-five-partition-drive**
  - Two ledger rows pin a round-3 guard-reachability witness that drove sql_transactions-p1, a partition neither covers: ledger-relocation-handoff-overlap and ledger-relocation-census-disagreement-overlap. Both are declared in witnessDiscrepancies above. One of them, ledger-relocation-census-disagreement-overlap, also pins that same drive as its round-3 budgetDifferentialWitness, so its DEPENDENCE evidence was real-chain on another partition too; it now rests on the exhaustive grid measurement of replica_operations-p1. Three further ledger rows (ledger-expand-for-spread-add, ledger-relocation-handoff-overlap, ledger-relocation-census-disagreement-overlap) pin that drive as their producerReachable witness, but all three carry producerReachable=unproven, so nothing rests on it.
  - measured by: verification round 1 (subagent:a2cec543087d69ef1)
  - recorded, NOT repaired: adding a ledger real-chain drive could change the inherited producerReachable=unproven and is out of scope. Every inherited value is supported by the grid measurement of replica_operations-p1 on the real guard.
- **arithmetic-witness-measures-nothing-row-specific**
  - rows: five-paired-relocation-replace, ledger-paired-relocation-replace
  - These rows pin a round-3 guard-reachability witness that measures the ARITHMETIC dimension (admission classes, no partition dimension), while the row itself claims no admission class. That witness therefore measures nothing specific to the row: it states nothing false, so it is not a witness discrepancy, but the arithmetic half of the evidence is vacuous for them and guardReachable=yes rests on the partition-dimension grid measurement of their partitions alone. Both rows are unknown_producer_not_driven.
  - measured by: derived by the validator from the receipt dimensions and the rows admission classes; recorded after verification round 1
  - recorded, NOT repaired by this quest: the pinned pointer is inherited round-3 content and the inherited value is supported by the grid. It goes to the re-audit.

## Findings

- **budget-domain-is-six-not-forty-five** (MEASURED, settled) - The guard's bootstrap-critical predicate admits 45 partitions, but the budget can only be non-zero on the 6 priority-control-plane ones. Six of the owner's seven named unmintable partitions - services, nodes, partitions, message_groups, tables and config - cannot depend on the budget at all.
  - bears on gate item(s): 1
  - contradicts the epic's framing that the guard's budget covers those seven partitions
- **even-voter-gate-is-never-the-budget** (MEASURED, settled) - The budget participates in anyAllowance and could in principle open the even-voter gate, but over the whole grid it never decides one: every budget-admitted row is refused for the cap.
  - bears on gate item(s): 1
- **allow-temporary-overflow-is-a-disjunction** (CODE, settled) - allowTemporaryOverflowPromotion short-circuits the five conditions rather than being one of them. The promotion guard never passes it, so the five conditions are the whole rule on this path.
  - bears on gate item(s): 1
  - contradicts the brief, which lists it as a conjunct
- **cross-partition-coupling-is-legacy** (MEASURED, OPEN) - The budget on one partition is switched on by ANOTHER partition's spread gap: the completion owner is handed the chosen priority summary WHOLE, and priorityRecoveryActive is the node-readiness bit OR hasPriorityRecoverySpreadGap(summary). The grid measures it as the gapOther shape and it is an admitted state. The owner's decision 3 rules this LEGACY COUPLING rather than contract: no replacement authorization may reproduce it, and every authorization must be attributable to its own partition and transition.
  - bears on gate item(s): 1, 3
  - resolved only by owner-repair-quest at solve/quests/cross-partition-coupling-is-legacy-repair
- **unhealthy-source-is-a-misnomer** (MEASURED, settled) - The priority-recovery follow-up REPLACE selects its source from the HEALTHY replicas, preferring one on a node that hosts more than one, and targets an UNOCCUPIED node. A failed replica can never be the source. The condition it cures is a distinct-node spread gap, not an unhealthy source.
  - bears on gate item(s): 4
  - contradicts the round-1 matrix of this quest, and the name UNHEALTHY_SOURCE_AT_TARGET itself
- **spread-recovery-decision-has-two-owners** (MEASURED, OPEN) - The distinct-node spread condition is decided in TWO modules: the cure policy classifies it for ADD, and the priority-recovery follow-up decides it again for REPLACE. One semantic, two decision owners, and only the ADD path mints an authorization. The repair is one spread-recovery decision owner whose bounded authorization both mechanisms consume - not a second authority kind for the REPLACE.
  - bears on gate item(s): 2, 3, 4
  - resolved only by owner-repair-quest at solve/quests/spread-recovery-decision-has-two-owners-repair
  - justification: two modules decide the same spread-recovery semantic
  - does NOT imply: no-row-requires-authority
- **chained-relocation-is-a-serialization-defect** (MEASURED, OPEN) - A chained relocation REPLACE is not an availability mechanism. The move owner serializes REPLACE on critical control-plane partitions to one in flight and states that minting more "only builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one critical partition thrashing ~114s, holding it over target until convergence times out)". MEASURED on the real builder, a second relocation is created ONLY when the prior target is still SYNCING in a voter role - the state in which the suppressor's census and the guard's census disagree; with that prior target ACTIVE the builder suppresses. The extra overlap is a consistency defect, and authorization must never legalize it.
  - bears on gate item(s): 1, 4
  - contradicts the round-2 matrix of this quest, which classified it required-for-availability and inverted the owner's words
  - resolved only by owner-repair-quest at solve/quests/chained-relocation-is-a-serialization-defect-repair
- **honoured-does-not-include-the-bound** (MEASURED, OPEN) - The landed evaluation decides honoured WITHOUT the authorized bound: a record authorizing five voters is honoured for a promotion to eight, and wouldBeWithinAuthorizedBound is a separate field the source says a consumer must AND with the outcome. Today's honoured is therefore NOT the complete evaluation result. The inherited requirement is that after the identity and evaluation quest, the only consumer rule is `outcome === honoured`; every bound and identity failure produces a non-honoured outcome.
  - bears on gate item(s): 8, 9
  - contradicts the round-1 matrix of this quest, whose pinned grant rule was the outcome alone
  - resolved only by owner-repair-quest at solve/quests/honoured-does-not-include-the-bound-repair
- **intent-unknown-is-unreachable-from-a-row** (MEASURED, OPEN) - authorization_intent_unknown cannot be produced by decoding a durable row: a foreign intent fails the decode and reads MALFORMED.
  - bears on gate item(s): 9
  - resolved only by owner-repair-quest at solve/quests/intent-unknown-is-unreachable-from-a-row-repair
- **future-epoch-is-honoured** (MEASURED, OPEN) - The membership fence refuses only an epoch OLDER than the partition's. A higher epoch is honoured.
  - bears on gate item(s): 9
  - resolved only by owner-repair-quest at solve/quests/future-epoch-is-honoured-repair
- **invalid-supplied-epoch-is-not-evaluated** (MEASURED, OPEN) - A supplied partition epoch that is not a non-negative integer reads membership_fence_not_evaluated rather than failing closed, and a supplied zero honours any record.
  - bears on gate item(s): 9
  - resolved only by owner-repair-quest at solve/quests/invalid-supplied-epoch-is-not-evaluated-repair
- **row-type-is-not-part-of-authority-identity** (MEASURED, OPEN) - The evaluation never looks at the operation type: the same record stamped on an ADD row and on a REPLACE row with the same operation id and destination evaluates identically and is honoured in both cases.
  - bears on gate item(s): 7
  - resolved only by owner-repair-quest at solve/quests/row-type-is-not-part-of-authority-identity-repair
- **partition-identity-is-not-on-the-record** (MEASURED, OPEN) - A foreign partition is caught only because the destination replica id happens to be partition-scoped; the record states no partition id.
  - bears on gate item(s): 7
  - resolved only by owner-repair-quest at solve/quests/partition-identity-is-not-on-the-record-repair
- **membership-ceiling-may-undercount-the-union** (MEASURED, OPEN) - max(activeCount, activeVoterCount) is not known to bound the union of the two membership views. MEASURED on the real replica-inventory owner: activeCount 2 and activeVoterCount 2 over four distinct occupied replicas, so the max UNDERCOUNTS the union by 2. The containment invariant is not established, and this audit chooses no formula and no name.
  - bears on gate item(s): 6, 7
  - resolved only by owner-repair-quest at solve/quests/membership-ceiling-may-undercount-the-union-repair
- **no-separate-raft-membership-epoch** (MEASURED, settled) - Every bare membershipEpoch in src resolves to the control-plane publication epoch. There is no distinct raft configuration epoch; the raft layer versions by term and log index.
  - bears on gate item(s): 5
  - contradicts the assumption that membershipEpoch is ambiguous between two concepts
- **epoch-readers-diverge-and-the-domain-is-not-closed** (MEASURED, OPEN) - The two membership-epoch readers do not observe the same object - one is kind-filtered and returns null where the other returns 0 - and the census still carries version-like values whose semantic relationship to the publication epoch is untraced. No canonical reader is chosen here and no completeness is claimed.
  - bears on gate item(s): 5
  - resolved only by owner-repair-quest at solve/quests/epoch-readers-diverge-and-the-domain-is-not-closed-repair
- **replica-recovery-service-is-unwired** (MEASURED, settled) - ReplicaRecoveryService.createPartitionReplica inserts a partition-replica services row with no replica_operations row at all, for any partition. It has no construction site in src, examples or scripts at this head, so it is dead here - but it is exported from src/node/index.js.
  - bears on gate item(s): 1

## Proposed repair quests, grouped by semantic cause

Nothing here is started, and no ledger-authority quest is proposed: the ordinary +1 is covered by the replacement allowance and the extra overlap is the view-disagreement condition.

- **unify-spread-recovery-authority** (not started: true)
  - cause: One distinct-node spread-recovery semantic is decided in two modules, and only the ADD mechanism mints an authorization.
  - proposal: Establish ONE spread-recovery decision owner; both the ADD and the follow-up REPLACE mechanism consume its bounded authorization; bind the operation shape so an ADD authorization cannot authorize an unrelated REPLACE. No second authority kind.
  - rows: five-minted-spread-cure-add, five-expand-for-spread-add, five-relocation-handoff-overlap, ledger-expand-for-spread-add, ledger-relocation-handoff-overlap
- **resolve-membership-census-disagreement** (not started: true)
  - cause: Two membership views disagree about one replica, which exposes a second REPLACE the real builder otherwise suppresses.
  - proposal: Determine whether the two membership views are allowed to disagree in this state; if not, repair the owner/census boundary rather than authorize the resulting second transition.
  - rows: five-relocation-census-disagreement-overlap, five-paired-relocation-replace, ledger-relocation-census-disagreement-overlap, ledger-paired-relocation-replace
- **establishing-publication-semantics** (not started: true)
  - cause: A cure condition holds while the membership publication is ESTABLISHING, so the mint is withheld and the promotion proceeds on the budget alone.
  - proposal: Decide what distinguishes a legitimate transitional authority from a fail-open path in that window.
  - rows: five-establishing-window-unminted-cure-add
- **undeclared-row-cache-disagreement-semantics** (not started: true)
  - cause: The partition row the mint resolves is absent or undeclared in this node's cache while the plan proceeds.
  - proposal: Decide whether an undeclared partition row should withhold the PLAN rather than only the mint.
  - rows: five-undeclared-partition-row-unminted-cure-add
- **initial-provisioning-semantics** (not started: true)
  - cause: Initial provisioning states a desired replica set and carries no system/user predicate; whether it needs an over-target transition at all is unstated.
  - proposal: Either prove no system-table id can reach it, or give formation its own bootstrap transition type.
  - rows: five-initial-provisioning-add, ledger-initial-provisioning-add
- **guard-invisible-operation-state** (not started: true)
  - cause: An active learner reaches the guard with no visible add-like operation, so the operation that would carry the authority is invisible to the decider.
  - proposal: Trace, from a production owner, which producer leaves that state and decide whether it is legitimate at all.
  - rows: five-under-representation-add, five-operation-not-visible-to-the-guard, ledger-under-representation-add, ledger-operation-not-visible-to-the-guard
- **operation-row-rematerialization** (not started: true)
  - cause: Several paths re-insert or re-identify an operation row after another producer created it.
  - proposal: Establish whether a stamped authorization survives each path, and what a successor identity inherits.
  - rows: five-row-rematerialization, ledger-row-rematerialization
- **close-topology-publication-version-identity** (not started: true)
  - cause: The version/epoch domain is not closed: two readers diverge, and 32 version-like values have no traced semantic relationship.
  - proposal: Close the domain including aliases that do not contain the word epoch, then choose one canonical identity and reader.
  - rows: five-minted-authorization-stale-at-promotion
- **authorization-identity-and-membership-ceiling** (not started: true)
  - cause: The record states no partition id and no operation type, the bound is outside the outcome, and the membership ceiling is not an established invariant.
  - proposal: Define authorization identity, prove or refute the containment invariant as SETS, and collapse the contract into one honoured outcome.
  - rows: none (finding-level)

## Architectural results (recorded, not encoded into the matrix)

Each of these is a proof that something asked for cannot be established from the state available. It is recorded here and NOT turned into a matrix distinction.

- **producer-identity-is-not-guard-visible** - Which producer created an operation cannot be established from guard-visible state. The guard reads the membership, the partition row and the operation rows it owns; no producer identity is carried on any of them, and for the operation-not-visible class the guard's only input about the operation is its ABSENCE. A producer-backed reachability proof for such a row is therefore impossible from the guard and must come from the production owner instead.
  - consequence: Those rows carry producerReachable unproven and stay still-unclassified. The distinction is NOT encoded into the matrix as a producer-differentiated admission class, because the guard cannot see it.
  - evidence: test/partition/overflow-budget-unmintable-partitions.test.js:every unmintable admitted partition is audited on the real guard; test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix
- **lab-attribution-is-unrecoverable-for-the-released-nodes** - The 2026-09-19 lab lines cannot be attributed to a producer. The logs carry no operation or producer id correlation, no uniquely attributable payload and no owner-naming trace, two producers can emit the observed transition, and the nodes have been released. No amount of re-reading those files can close it.
  - consequence: Every lab entry in this matrix reads the unattributed sentence and upgrades nothing. A future lab run that logs the producing owner would settle it.
  - evidence: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js:the priority-recovery relocation REPLACE is traced end to end and classified
- **the-epoch-domain-cannot-be-closed-by-a-spelling-census** - A census seeded on spelling and followed through data flow reaches a fixed point that still contains version-like values whose semantic relationship to the publication epoch is unknown. Closing them requires reading each owner, which is a separate quest and not a wider census.
  - consequence: The inventory groups its entries three ways and claims no completeness; gate item 5 stays blocked.
  - evidence: test/rebalancer/overflow-budget-add-like-producer-census.test.js:every production producer of an add-like operation is in the matrix; test/control-plane/membership-epoch-reader-divergence.test.js:the two epoch readers diverge on real owners over the stated row sets

