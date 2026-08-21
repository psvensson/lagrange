/**
 * Fair-share runtime-placement admission tests for canStartAddOperation.
 *
 * Quest: formation-runtime-service-create-lane-budget-starvation.
 *
 * The plain-ADD budget lane (CONCURRENT_CREATE_BUDGET_SCOPE.ADD) is a global
 * cluster-wide cap shared by every non-priority ADD + non-dispatch-phase
 * REPLACE. Runtime-service ADD and REPLACE are one placement class; if either
 * is treated as ordinary churn, partition work can win every admission race
 * (live: run-30 of the service-data-affinity demo — svc replicas=0 for the
 * whole 300s watch while 32 control-plane moves complete).
 *
 * The fix reserves one plain-ADD slot for runtime-service placement that
 * partition churn cannot consume, demand-sensitively (lifted once a runtime
 * placement is in flight) and clamped so partition REPLACEs never deadlock.
 * These tests pin
 * the admission arithmetic directly on canStartAddOperation and are
 * red-on-revert of the source change (A2 / A3 / A4 below).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  canStartAddOperation,
} from '../../src/rebalancer/rebalance-coordinator-priority-budget-helper.js';

const RUNTIME_SERVICE = 'runtime_service';
const PARTITION = 'partition';

function buildFakeCoordinator(overrides = {}) {
  const coordinator = {
    reservedPrioritySlots: 1,
    reservedRuntimePlacementSlots: 1,
    concurrentAddLimit: 4,
    authoritativeOperations: [],
    cachedOperations: [],
    shouldPauseAdmissionReadForLocalRouterPressure() {
      return false;
    },
    getConcurrentAddBudgetLimit() {
      return coordinator.concurrentAddLimit;
    },
    getReservedPriorityRecoveryAddSlots() {
      return coordinator.reservedPrioritySlots;
    },
    getReservedRuntimeServicePlacementSlots() {
      return coordinator.reservedRuntimePlacementSlots;
    },
    async queryCachedIncompleteOperations() {
      return coordinator.cachedOperations;
    },
    async queryIncompleteOperations() {
      return coordinator.authoritativeOperations;
    },
    // In the fake, every op is a non-priority add-budget operation. Entity type
    // is the authoritative placement classification.
    isConcurrentAddBudgetOperation() {
      return true;
    },
    isPriorityControlPlanePartition() {
      return false;
    },
    isEmergencyPriorityControlPlanePartition() {
      return false;
    },
    isReplaceRemoveDispatchPhase() {
      return false;
    },
    async shouldIgnoreCriticalAddBudgetOperation() {
      return false;
    },
    getIncompleteOperationObservation() {
      return {};
    },
    reconcileIncompleteOperationEmptyQueryDelay() {},
    shouldBlockOperationAdmissionOnIncompleteOperationObservation() {
      return false;
    },
    clearEmptyIncompleteOperationQueryDelay() {},
    shouldDelayEmptyIncompleteOperationQuery() {
      return false;
    },
    ...overrides,
  };
  return coordinator;
}

function op(type, entityType, index) {
  return {
    type,
    entityType,
    entity_type: entityType,
    operationId: `op-${entityType}-${type}-${index}`,
    partitionId: `part-${index}`,
    entityId: `ent-${index}`,
  };
}

// N non-priority ADD operations representing partition churn.
function partitionAdds(count) {
  return Array.from({length: count}, (_u, i) => op('ADD', PARTITION, i));
}

const RUNTIME_SERVICE_ADD = {
  partitionId: 'svc-movielens-topn',
  entityType: RUNTIME_SERVICE,
  isRuntimeServicePlacement: true,
};
const RUNTIME_SERVICE_REPLACE = {
  partitionId: 'svc-movielens-topn',
  entityType: RUNTIME_SERVICE,
  isRuntimeServicePlacement: true,
};
const PARTITION_PLACEMENT = {
  partitionId: 'data-partition-p7',
  entityType: PARTITION,
  isRuntimeServicePlacement: false,
};

test('A2 red-on-revert: partition ADD is denied at the reserved runtime ' +
  'placement boundary', async (t) => {
  // Limit 4, one runtime-placement slot held, three partition operations in
  // flight. Partition work cannot greedily fill the fourth slot.
  const coordinator = buildFakeCoordinator();
  coordinator.authoritativeOperations = partitionAdds(3);

  const allowed = await canStartAddOperation(coordinator, PARTITION_PLACEMENT);
  t.equal(allowed, false,
    'partition ADD denied at count 3 so runtime placement keeps a turn');
  t.end();
});

test('A1: runtime-service ADD is admitted while three partition moves hold the lane',
  async (t) => {
    // Same state, but runtime placement uses the full limit.
    const coordinator = buildFakeCoordinator();
    coordinator.authoritativeOperations = partitionAdds(3);

    const allowed = await canStartAddOperation(coordinator, RUNTIME_SERVICE_ADD);
    t.equal(allowed, true,
      'runtime-service ADD admitted into its placement slot');
    t.end();
  });

test('A1 interaction: runtime affinity REPLACE uses the same reserved placement ' +
  'turn as runtime ADD', async (t) => {
  const coordinator = buildFakeCoordinator();
  coordinator.authoritativeOperations = partitionAdds(3);

  const allowed = await canStartAddOperation(
    coordinator,
    RUNTIME_SERVICE_REPLACE,
  );
  t.equal(
    allowed,
    true,
    'runtime REPLACE is not demoted to ordinary partition churn',
  );
  t.end();
});

test('A3: no placement over-admission — a second runtime placement is denied',
  async (t) => {
    // Three partition operations plus one runtime placement fill the limit.
    const coordinator = buildFakeCoordinator();
    coordinator.authoritativeOperations = [
      ...partitionAdds(3),
      op('ADD', RUNTIME_SERVICE, 99),
    ];

    const allowed = await canStartAddOperation(coordinator, RUNTIME_SERVICE_ADD);
    t.equal(allowed, false, 'second runtime placement denied at the lane limit');
    t.end();
  });

test('A4 throughput: the hold is lifted while runtime placement is in flight',
  async (t) => {
    // Two partition operations plus one runtime placement leave one ordinary
    // slot. The demand-sensitive hold no longer reduces throughput.
    const coordinator = buildFakeCoordinator();
    coordinator.authoritativeOperations = [
      ...partitionAdds(2),
      op('ADD', RUNTIME_SERVICE, 99),
    ];

    const allowed = await canStartAddOperation(coordinator, PARTITION_PLACEMENT);
    t.equal(allowed, true,
      'partition work reclaims the held slot while runtime placement is active');
    t.end();
  });

test('A5 clamp: partition limit never drops below 1 (ordinary REPLACEs cannot ' +
  'deadlock at a small budget)', async (t) => {
  // A one-slot lane still admits lone partition work when no operation exists.
  const coordinator = buildFakeCoordinator();
  coordinator.concurrentAddLimit = 1;
  coordinator.reservedRuntimePlacementSlots = 1;
  coordinator.authoritativeOperations = [];

  const allowed = await canStartAddOperation(coordinator, PARTITION_PLACEMENT);
  t.equal(allowed, true,
    'a lone partition move is admitted; the hold is clamped to >= 1 slot');
  t.end();
});

test('A6 stale cache: the runtime placement reservation forces owner admission ' +
  'when priority recovery is inactive', async (t) => {
  // Limit 4, runtime reserve 1, priority reserve 0. The cache under-reports two
  // ordinary adds, but the owner sees the three that fill the ordinary cap.
  // A cached fast-path would admit another partition add into the held slot.
  let cachedReadCount = 0;
  let authoritativeReadCount = 0;
  const coordinator = buildFakeCoordinator({
    reservedPrioritySlots: 0,
    reservedRuntimePlacementSlots: 1,
    cachedOperations: partitionAdds(2),
    authoritativeOperations: partitionAdds(3),
    async queryCachedIncompleteOperations() {
      cachedReadCount += 1;
      return coordinator.cachedOperations;
    },
    async queryIncompleteOperations() {
      authoritativeReadCount += 1;
      return coordinator.authoritativeOperations;
    },
  });

  const allowed = await canStartAddOperation(coordinator, PARTITION_PLACEMENT);
  t.equal(allowed, false,
    'owner count denies the partition add at the reserved boundary');
  t.equal(authoritativeReadCount, 1,
    'runtime-placement reservation performs one authoritative owner read');
  t.equal(cachedReadCount, 1,
    'cached observation triggers but cannot authorize reserved-slot admission');
  t.end();
});

test('regression: disabling the placement reservation restores the full limit',
  async (t) => {
    const coordinator = buildFakeCoordinator();
    coordinator.reservedRuntimePlacementSlots = 0;
    coordinator.authoritativeOperations = partitionAdds(3);

    const allowed = await canStartAddOperation(coordinator, PARTITION_PLACEMENT);
    t.equal(allowed, true,
      'with no placement reservation partition work keeps the full limit');
    t.end();
  });
