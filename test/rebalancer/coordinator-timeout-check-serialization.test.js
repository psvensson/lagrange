import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';

function createCoordinator() {
  return new RebalanceCoordinator({
    nodeId: 'coordinator-node',
    systemTableCache: {
      getAll: () => [],
    },
    cdcIntegrationService: {},
    messageRouter: {},
    tablePolicyService: {},
    sqlQueryEngine: {
      executeQuery: async () => ({success: true, rows: []}),
    },
  });
}

test('RebalanceCoordinator does not overlap periodic timeout checks', async (t) => {
  const coordinator = createCoordinator();
  coordinator.timeoutCheckIntervalMs = 5;

  let inFlightChecks = 0;
  let maxInFlightChecks = 0;
  const releaseChecks = [];
  coordinator.checkTimeouts = async () => {
    inFlightChecks += 1;
    maxInFlightChecks = Math.max(maxInFlightChecks, inFlightChecks);
    return new Promise((resolve) => {
      releaseChecks.push(() => {
        inFlightChecks -= 1;
        resolve();
      });
    });
  };

  coordinator.startTimeoutChecking();
  try {
    await new Promise((resolve) => setTimeout(resolve, 35));
    t.equal(
      maxInFlightChecks,
      1,
      'timeout checker should keep at most one in-flight check',
    );
  } finally {
    coordinator.stopTimeoutChecking();
    while (releaseChecks.length > 0) {
      const release = releaseChecks.shift();
      release();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

test('the periodic check sweeps membership debt after the orphan reconcile', async (t) => {
  const coordinator = createCoordinator();
  coordinator.timeoutCheckIntervalMs = 5;
  const order = [];
  coordinator.checkTimeouts = async () => order.push('timeouts');
  coordinator.reconcileOrphanedOperations = async () => order.push('orphans');
  coordinator.workflowOwner.reconcileMessageGroupMembershipDebt = async (census) => {
    order.push(`debt:${census ?? 'default'}`);
    return {available: true, found: 0};
  };
  coordinator.startTimeoutChecking();
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
  } finally {
    coordinator.stopTimeoutChecking();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const firstDebt = order.indexOf('debt:default');
  t.ok(firstDebt > 0, 'the membership-debt sweep runs on the periodic check');
  t.equal(order[firstDebt - 1], 'orphans',
    'the debt sweep follows the orphan reconcile of the same tick');
  t.equal(order[firstDebt - 2], 'timeouts', 'which follows the timeout check');
});

test('the repository is bound to the issued boot incarnation the router carries', (t) => {
  const bound = new RebalanceCoordinator({
    nodeId: 'coordinator-node',
    systemTableCache: {getAll: () => []},
    cdcIntegrationService: {},
    messageRouter: {bootIncarnation: 7},
    tablePolicyService: {},
    sqlQueryEngine: {executeQuery: async () => ({success: true, rows: []})},
  });
  t.equal(bound.repository.membershipOwnerBootIncarnation, 7,
    'the membership owner claim is bound to this process\'s issued boot incarnation');
  const unbound = createCoordinator();
  t.equal(unbound.repository.membershipOwnerBootIncarnation, null,
    'a router without an issued boot incarnation binds nothing');
  t.end();
});
