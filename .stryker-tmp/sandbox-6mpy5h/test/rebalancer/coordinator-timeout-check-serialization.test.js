// @ts-nocheck
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
