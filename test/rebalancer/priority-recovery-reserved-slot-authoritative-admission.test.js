/**
 * Hard-reservation admission tests for canStartAddOperation.
 *
 * Proves that while a priority-recovery Add slot is reserved, a normal add is
 * admitted only after an AUTHORITATIVE owner-read budget check (bypassing the
 * cached fast-path), so a stale cached undercount cannot let a normal add
 * consume the last reserved slot. When no slot is reserved, the cached
 * fast-path is preserved (no authoritative read).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  canStartAddOperation,
} from '../../src/rebalancer/rebalance-coordinator-priority-budget-helper.js';

function buildFakeCoordinator(overrides = {}) {
  const calls = {cachedReads: 0, authoritativeReads: 0};
  const coordinator = {
    calls,
    reservedSlots: 0,
    concurrentAddLimit: 1,
    cachedOperations: [],
    authoritativeOperations: [],
    blockOnObservation: false,
    shouldPauseAdmissionReadForLocalRouterPressure() {
      return false;
    },
    getConcurrentAddBudgetLimit() {
      return coordinator.concurrentAddLimit;
    },
    getReservedPriorityRecoveryAddSlots() {
      return coordinator.reservedSlots;
    },
    async queryCachedIncompleteOperations() {
      calls.cachedReads += 1;
      return coordinator.cachedOperations;
    },
    async queryIncompleteOperations() {
      calls.authoritativeReads += 1;
      return coordinator.authoritativeOperations;
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
      return coordinator.blockOnObservation;
    },
    clearEmptyIncompleteOperationQueryDelay() {},
    ...overrides,
  };
  return coordinator;
}

function addOps(count) {
  return Array.from({length: count}, (_unused, index) => ({
    type: 'ADD',
    operationId: `op-${index}`,
    partitionId: `part-${index}`,
  }));
}

test('reservation active: denies a normal add when authoritative count is full', async (t) => {
  const coordinator = buildFakeCoordinator();
  coordinator.reservedSlots = 1;
  coordinator.concurrentAddLimit = 1;
  // Cache is empty (would otherwise admit), but the authoritative owner read
  // shows the limit is already consumed.
  coordinator.cachedOperations = [];
  coordinator.authoritativeOperations = addOps(1);

  const allowed = await canStartAddOperation(coordinator, {
    partitionId: 'normal-part',
  });

  t.equal(allowed, false, 'normal add denied to preserve the reserved slot');
  t.equal(coordinator.calls.authoritativeReads, 1, 'authoritative read taken');
  t.equal(
    coordinator.calls.cachedReads,
    0,
    'cache fast-path bypassed while reservation active',
  );
  t.end();
});

test('reservation active: admits a normal add when authoritative count has room', async (t) => {
  const coordinator = buildFakeCoordinator();
  coordinator.reservedSlots = 1;
  coordinator.concurrentAddLimit = 1;
  coordinator.authoritativeOperations = [];

  const allowed = await canStartAddOperation(coordinator, {
    partitionId: 'normal-part',
  });

  t.equal(allowed, true, 'normal add admitted when an authoritative slot is free');
  t.equal(coordinator.calls.authoritativeReads, 1, 'authoritative read taken');
  t.end();
});

test('reservation active: a deferred owner-read observation blocks admission', async (t) => {
  const coordinator = buildFakeCoordinator();
  coordinator.reservedSlots = 1;
  coordinator.concurrentAddLimit = 1;
  coordinator.authoritativeOperations = [];
  coordinator.blockOnObservation = true;

  const allowed = await canStartAddOperation(coordinator, {
    partitionId: 'normal-part',
  });

  t.equal(allowed, false, 'admission blocked on deferred owner-read observation');
  t.end();
});

test('no reservation: preserves the cached fast-path without an authoritative read', async (t) => {
  const coordinator = buildFakeCoordinator();
  coordinator.reservedSlots = 0;
  coordinator.concurrentAddLimit = 2;
  coordinator.cachedOperations = addOps(1);

  const allowed = await canStartAddOperation(coordinator, {
    partitionId: 'normal-part',
  });

  t.equal(allowed, true, 'cached fast-path admits below limit');
  t.equal(coordinator.calls.cachedReads, 1, 'cache read taken');
  t.equal(
    coordinator.calls.authoritativeReads,
    0,
    'no authoritative read when nothing is reserved',
  );
  t.end();
});
