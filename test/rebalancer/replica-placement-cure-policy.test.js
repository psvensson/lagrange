import {test} from '../../src/test-helpers/tap.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  MOVE_REASON,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
} from '../../src/control-plane/priority-recovery-admission-constants.js';
import {REBALANCE_COORDINATOR_SHARED} from '../../src/rebalancer/rebalance-coordinator-shared.js';
import {
  ORDINARY_SERIAL_LANE_CURE_MOVE_TYPES,
  PLACEMENT_CURE_BY_CONDITION,
  PLACEMENT_CURE_CONDITION,
  classifyPriorityRecoveryAdmissionPartitionClass,
  classifyPriorityRecoveryFollowUpCureCondition,
  isOrdinarySerialLaneCureMove,
  resolvePlacementCure,
  resolvePlacementCureBudgetScope,
  resolvePlacementCureBudgetScopeFromAdmissionPlan,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

const {CONCURRENT_CREATE_BUDGET_SCOPE} = REBALANCE_COORDINATOR_SHARED;

// Red-on-revert pin for the single-owner cure-typing relation (quest
// cure-typing-single-owner-table, 2b5875b0 lineage). The rows' exact cure
// move types, move reasons, lane outcomes, and the classifier orders are the
// contract: every widening/narrowing must fail here first and be an explicit
// incident-class decision.

const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const PUBLICATIONS_PARTITION_ID =
  `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
const USER_PARTITION_ID = 'orders-p1';

test('the condition -> cure rows keep their sealed memberships', (t) => {
  t.strictSame(
    [...PLACEMENT_CURE_BY_CONDITION.keys()].sort(),
    Object.values(PLACEMENT_CURE_CONDITION).sort(),
    'every named condition has exactly one cure row');
  t.strictSame(
    resolvePlacementCure(PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION),
    {
      moveType: REBALANCER_MOVE_TYPE.ADD,
      moveReason: MOVE_REASON.INCREASE_REPLICA_COUNT,
    },
    'a count deficit is cured by ADD and only by ADD (2b5875b0: too few ' +
      'replicas is never REPLACE-curable)');
  t.strictSame(
    resolvePlacementCure(PLACEMENT_CURE_CONDITION.FAILED_REPLICA),
    {
      moveType: REBALANCER_MOVE_TYPE.REMOVE,
      moveReason: MOVE_REASON.REPLICA_FAILED,
    });
  t.strictSame(
    resolvePlacementCure(PLACEMENT_CURE_CONDITION.NODE_NOT_IN_TARGET),
    {
      moveType: REBALANCER_MOVE_TYPE.REMOVE,
      moveReason: MOVE_REASON.NODE_NOT_IN_TARGET,
    });
  t.strictSame(
    resolvePlacementCure(PLACEMENT_CURE_CONDITION.OVER_REPRESENTATION),
    {
      moveType: REBALANCER_MOVE_TYPE.REMOVE,
      moveReason: MOVE_REASON.SPREAD_REPLICAS,
    });
  t.strictSame(
    resolvePlacementCure(PLACEMENT_CURE_CONDITION.PAIRED_RELOCATION),
    {
      moveType: REBALANCER_MOVE_TYPE.REPLACE,
      moveReason: MOVE_REASON.REPLACE_REPLICA,
    },
    'relocation is cured count-neutrally — REPLACE never changes the count');
  t.strictSame(
    resolvePlacementCure(PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET),
    {
      moveType: REBALANCER_MOVE_TYPE.REPLACE,
      moveReason: MOVE_REASON.REPLACE_REPLICA,
    });
  const addConditions = [...PLACEMENT_CURE_BY_CONDITION.entries()]
    .filter(([, cure]) => cure.moveType === REBALANCER_MOVE_TYPE.ADD)
    .map(([condition]) => condition);
  t.strictSame(
    addConditions,
    [PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION],
    'under-representation is the ONLY ADD-cured condition');
  t.end();
});

test('an undeclared condition mints no cure (fail-closed)', (t) => {
  t.equal(resolvePlacementCure('no_such_condition'), null);
  t.equal(resolvePlacementCure(null), null);
  t.end();
});

test('the follow-up condition classifier owns the 2b5875b0 conjunct', (t) => {
  t.equal(
    classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: 3,
      targetReplicaCount: 3,
      hasSelectableSourceReplica: true,
    }),
    PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET,
    'at target with a selectable source is a REPLACE-shaped relocation');
  t.equal(
    classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: 4,
      targetReplicaCount: 3,
      hasSelectableSourceReplica: true,
    }),
    PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET);
  t.equal(
    classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: 2,
      targetReplicaCount: 3,
      hasSelectableSourceReplica: true,
    }),
    PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
    'below target is a count deficit even when a source exists');
  t.equal(
    classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: 3,
      targetReplicaCount: 3,
      hasSelectableSourceReplica: false,
    }),
    PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
    'no selectable source degrades to the ADD row (source-unavailable ' +
      'fallback), never an improvised REPLACE');
  t.end();
});

test('the admission partition-class classifier owns its order', (t) => {
  t.equal(
    classifyPriorityRecoveryAdmissionPartitionClass(LEDGER_PARTITION_ID),
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY,
    'the operation ledger classifies emergency before ordinary');
  t.equal(
    classifyPriorityRecoveryAdmissionPartitionClass(PUBLICATIONS_PARTITION_ID),
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY);
  t.equal(
    classifyPriorityRecoveryAdmissionPartitionClass(USER_PARTITION_ID),
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY);
  t.equal(
    classifyPriorityRecoveryAdmissionPartitionClass(''),
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY,
    'no partition id never classifies into a priority lane');
  t.equal(
    classifyPriorityRecoveryAdmissionPartitionClass('p-1', {
      isPriorityPartition: () => true,
      isEmergencyPriorityPartition: () => false,
    }),
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY,
    'priority without emergency is the ordinary lane');
  t.equal(
    classifyPriorityRecoveryAdmissionPartitionClass('p-1', {
      isPriorityPartition: () => false,
      isEmergencyPriorityPartition: () => true,
    }),
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY,
    'the priority predicate gates first — emergency never resurrects a ' +
      'non-priority partition');
  t.end();
});

test('the cure budget-scope rows keep their sealed outcomes', (t) => {
  const scope = (moveType, partitionClass, usesEmergencyPriorityOverflow) =>
    resolvePlacementCureBudgetScope({
      moveType,
      partitionClass,
      usesEmergencyPriorityOverflow,
    });
  const CLASS = PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS;
  t.equal(
    scope(OperationType.REMOVE, CLASS.EMERGENCY_PRIORITY, true),
    CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE,
    'REMOVE always drains through the remove scope');
  t.equal(
    scope(OperationType.ADD, CLASS.NON_PRIORITY, false),
    CONCURRENT_CREATE_BUDGET_SCOPE.ADD);
  t.equal(
    scope(OperationType.ADD, CLASS.EMERGENCY_PRIORITY, true),
    CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD,
    'the emergency overflow scope requires emergency class AND active ' +
      'overflow');
  t.equal(
    scope(OperationType.ADD, CLASS.EMERGENCY_PRIORITY, false),
    CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD,
    'an emergency partition without active overflow draws the ordinary ' +
      'priority budget');
  t.equal(
    scope(OperationType.ADD, CLASS.ORDINARY_PRIORITY, true),
    CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD,
    'an ordinary-priority cure never enters the emergency lane, whatever ' +
      'the overflow flag claims');
  t.equal(
    scope(OperationType.REPLACE, CLASS.ORDINARY_PRIORITY, false),
    CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD,
    'a REPLACE creation draws the same priority add budget as an ADD');
  t.equal(
    scope('add', CLASS.ORDINARY_PRIORITY, false),
    CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD,
    'planner-cased move types resolve the same rows (CL-013 precedent)');
  t.equal(
    scope('unknown_move', CLASS.EMERGENCY_PRIORITY, true),
    CONCURRENT_CREATE_BUDGET_SCOPE.ADD,
    'an unknown move type degrades to the plain add budget, never a ' +
      'priority or emergency lane');
  t.equal(
    scope(OperationType.ADD, 'no_such_class', true),
    CONCURRENT_CREATE_BUDGET_SCOPE.ADD,
    'an unknown partition class degrades to the plain add budget');
  t.end();
});

test('the plan-aware scope resolver consumes the plan overflow state', (t) => {
  const emergencyPlan = {usesEmergencyPriorityOverflow: () => true};
  const idlePlan = {usesEmergencyPriorityOverflow: () => false};
  t.equal(
    resolvePlacementCureBudgetScopeFromAdmissionPlan({
      moveType: OperationType.ADD,
      partitionId: LEDGER_PARTITION_ID,
      admissionPlan: emergencyPlan,
    }),
    CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD);
  t.equal(
    resolvePlacementCureBudgetScopeFromAdmissionPlan({
      moveType: OperationType.ADD,
      partitionId: LEDGER_PARTITION_ID,
      admissionPlan: idlePlan,
    }),
    CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD,
    'without active overflow the emergency partition draws the priority ' +
      'budget');
  t.equal(
    resolvePlacementCureBudgetScopeFromAdmissionPlan({
      moveType: OperationType.ADD,
      partitionId: USER_PARTITION_ID,
      admissionPlan: emergencyPlan,
    }),
    CONCURRENT_CREATE_BUDGET_SCOPE.ADD,
    'a non-priority partition never draws a priority scope, whatever the ' +
      'plan claims');
  t.equal(
    resolvePlacementCureBudgetScopeFromAdmissionPlan({
      moveType: OperationType.REMOVE,
      partitionId: LEDGER_PARTITION_ID,
      admissionPlan: emergencyPlan,
    }),
    CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE);
  t.equal(
    resolvePlacementCureBudgetScopeFromAdmissionPlan({
      moveType: OperationType.ADD,
      partitionId: LEDGER_PARTITION_ID,
      admissionPlan: null,
    }),
    CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD,
    'a missing plan means no overflow, never a thrown gate');
  t.end();
});

test('the ordinary-serial-lane cure move row keeps its membership', (t) => {
  t.strictSame(
    [...ORDINARY_SERIAL_LANE_CURE_MOVE_TYPES].sort(),
    [OperationType.ADD, OperationType.REPLACE].sort(),
    'the serial lane admits exactly the replica-creating cures — REMOVE ' +
      'never contends for it');
  t.ok(isOrdinarySerialLaneCureMove(OperationType.ADD, false));
  t.ok(isOrdinarySerialLaneCureMove(OperationType.ADD, true),
    'an ADD occupies the lane in every phase');
  t.ok(isOrdinarySerialLaneCureMove(OperationType.REPLACE, false));
  t.notOk(isOrdinarySerialLaneCureMove(OperationType.REPLACE, true),
    'a REPLACE in its remove-dispatch phase no longer contends');
  t.ok(isOrdinarySerialLaneCureMove('replace', false),
    'coordinator- and planner-cased move types resolve the same row');
  t.notOk(isOrdinarySerialLaneCureMove(OperationType.REMOVE, false));
  t.notOk(isOrdinarySerialLaneCureMove(null, false),
    'an unknown move type never occupies a lane slot');
  t.end();
});
