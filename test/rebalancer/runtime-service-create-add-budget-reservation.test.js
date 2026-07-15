/**
 * Fair-share create-slot admission tests for canStartAddOperation.
 *
 * Quest: formation-runtime-service-create-lane-budget-starvation.
 *
 * The plain-ADD budget lane (CONCURRENT_CREATE_BUDGET_SCOPE.ADD) is a global
 * cluster-wide cap shared by every non-priority ADD + non-dispatch-phase
 * REPLACE. A deployed runtime-service's genuine replica-CREATE ADD has no
 * reserved fair-share there, so under sustained non-priority spread/REPLACE
 * churn it loses every admission race and the service never places
 * (live: run-30 of the service-data-affinity demo — svc replicas=0 for the
 * whole 300s watch while 32 control-plane moves complete).
 *
 * The fix reserves one plain-ADD slot for genuine service creates that a
 * REPLACE/self-move cannot consume, demand-sensitively (lifted once a create is
 * in flight) and clamped so ordinary REPLACEs never deadlock. These tests pin
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
    reservedCreateSlots: 1,
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
    getReservedCreateAddSlots() {
      return coordinator.reservedCreateSlots;
    },
    async queryCachedIncompleteOperations() {
      return coordinator.cachedOperations;
    },
    async queryIncompleteOperations() {
      return coordinator.authoritativeOperations;
    },
    // In the fake, every op is a non-priority add-budget op; the create/replace
    // distinction is carried by entityType so the create-count can be tallied.
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

// N non-priority ADD ops that are ordinary partition rebalance moves (NOT
// genuine service creates) — the spread/REPLACE churn that fills the lane.
function nonCreateAdds(count) {
  return Array.from({length: count}, (_u, i) => op('ADD', PARTITION, i));
}

const SERVICE_CREATE = {
  partitionId: 'svc-movielens-topn',
  entityType: RUNTIME_SERVICE,
  isGenuineCreate: true,
};
const NON_CREATE = {
  partitionId: 'data-partition-p7',
  entityType: PARTITION,
  isGenuineCreate: false,
};

test('A2 red-on-revert: a non-create ADD is DENIED at the reserved-create boundary ' +
  '(pre-fix it consumes the slot the service create needs)', async (t) => {
  // limit 4, 1 create slot reserved, 3 non-creates in flight, no create in
  // flight. Pre-fix: authoritative count 3 < 4 -> ADMITTED (greedily fills slot
  // 4). Fixed: non-create effective limit = max(1, 4-1) = 3, count 3 >= 3 ->
  // DENIED, holding slot 4 open for a create.
  const coordinator = buildFakeCoordinator();
  coordinator.authoritativeOperations = nonCreateAdds(3);

  const allowed = await canStartAddOperation(coordinator, NON_CREATE);
  t.equal(allowed, false,
    'non-create ADD denied at count 3 so the create slot stays reserved');
  t.end();
});

test('A1: a genuine service create IS admitted while 3 non-creates hold the lane',
  async (t) => {
    // Same state, but the caller is the genuine create: it uses the full limit
    // (4), count 3 < 4 -> ADMITTED. Guards that the reservation never blocks the
    // very create it exists to protect.
    const coordinator = buildFakeCoordinator();
    coordinator.authoritativeOperations = nonCreateAdds(3);

    const allowed = await canStartAddOperation(coordinator, SERVICE_CREATE);
    t.equal(allowed, true,
      'genuine service create admitted into the slot reserved for it');
    t.end();
  });

test('A3: no create over-admission — a 2nd create is denied at the cap',
  async (t) => {
    // 3 non-creates + 1 in-flight service create = count 4. A second create:
    // limit 4, count 4 -> DENIED. Only one create slot exists.
    const coordinator = buildFakeCoordinator();
    coordinator.authoritativeOperations = [
      ...nonCreateAdds(3),
      op('ADD', RUNTIME_SERVICE, 99),
    ];

    const allowed = await canStartAddOperation(coordinator, SERVICE_CREATE);
    t.equal(allowed, false, 'second concurrent create denied at the plain limit');
    t.end();
  });

test('A4 throughput: the create haircut is LIFTED once a create is in flight ' +
  '(non-creates reclaim the slot, no permanent throughput cut)', async (t) => {
  // 2 non-creates + 1 in-flight service create = count 3. A non-create arrives.
  // With the demand-sensitive lift: a create already occupies its slot, so the
  // haircut is 0 -> limit 4, count 3 < 4 -> ADMITTED (throughput preserved).
  // Without the lift it would be wrongly denied at effective limit 3.
  const coordinator = buildFakeCoordinator();
  coordinator.authoritativeOperations = [
    ...nonCreateAdds(2),
    op('ADD', RUNTIME_SERVICE, 99),
  ];

  const allowed = await canStartAddOperation(coordinator, NON_CREATE);
  t.equal(allowed, true,
    'non-create admitted once a create is in flight (haircut lifted)');
  t.end();
});

test('A5 clamp: non-create limit never drops below 1 (ordinary REPLACEs cannot ' +
  'deadlock at a small budget)', async (t) => {
  // limit 1, 1 create slot reserved, no ops in flight. Naive haircut would give
  // max(1, 1-1)=1 -> a lone non-create is still admissible. Assert it is not
  // starved to 0.
  const coordinator = buildFakeCoordinator();
  coordinator.concurrentAddLimit = 1;
  coordinator.reservedCreateSlots = 1;
  coordinator.authoritativeOperations = [];

  const allowed = await canStartAddOperation(coordinator, NON_CREATE);
  t.equal(allowed, true,
    'a lone non-create is admitted; the create haircut is clamped to >= 1 slot');
  t.end();
});

test('A6 stale cache: a create reservation forces authoritative admission even ' +
  'when priority recovery is inactive', async (t) => {
  // limit 4, create reserve 1, priority reserve 0. The cache under-reports two
  // ordinary adds, but the owner sees the three that fill the ordinary cap.
  // A cached fast-path would admit another ordinary add into the create slot.
  let cachedReadCount = 0;
  let authoritativeReadCount = 0;
  const coordinator = buildFakeCoordinator({
    reservedPrioritySlots: 0,
    reservedCreateSlots: 1,
    cachedOperations: nonCreateAdds(2),
    authoritativeOperations: nonCreateAdds(3),
    async queryCachedIncompleteOperations() {
      cachedReadCount += 1;
      return coordinator.cachedOperations;
    },
    async queryIncompleteOperations() {
      authoritativeReadCount += 1;
      return coordinator.authoritativeOperations;
    },
  });

  const allowed = await canStartAddOperation(coordinator, NON_CREATE);
  t.equal(allowed, false,
    'owner count denies the ordinary add at the create-reserved boundary');
  t.equal(authoritativeReadCount, 1,
    'create reservation performs exactly one authoritative owner read');
  t.equal(cachedReadCount, 1,
    'cached observation triggers but cannot authorize reserved-slot admission');
  t.end();
});

test('regression: no create reservation configured preserves prior behaviour ' +
  '(non-create admitted at count 3 under limit 4)', async (t) => {
  const coordinator = buildFakeCoordinator();
  coordinator.reservedCreateSlots = 0;
  coordinator.authoritativeOperations = nonCreateAdds(3);

  const allowed = await canStartAddOperation(coordinator, NON_CREATE);
  t.equal(allowed, true,
    'with no create reservation the non-create keeps the full limit');
  t.end();
});
