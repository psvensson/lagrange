/**
 * Directed deterministic tests for L-write (owner-local deferred membership seed).
 *
 * Under LAGRANGE_JOIN_DEFERRED_SEED=true, a join-time NODES write that defers under
 * control-plane saturation (retryable DISTRIBUTED_PARTICIPANT_FAILURE) should NOT fail
 * the join: the owner seeds its own nodes row into the local cache and proceeds, leaving
 * the durable write to be re-driven cluster-wide by the heartbeat. A non-retryable
 * (permanent) error must still fail the join, and with the flag off the historical
 * fail-narrowly contract is preserved.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {TABLES} from '../../src/constants/index.js';

const FLAG = 'LAGRANGE_JOIN_DEFERRED_SEED';

function buildParticipantFailure() {
  const error = new Error(
    'Distributed operation failed due to participant failures',
  );
  error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
  error.retryAfterMs = 50;
  return error;
}

function installBudgetService(service) {
  service.getNodeStorageBudgetService = () => ({
    resolveBudgetRow: (nodeRow) => ({
      budgetRow: nodeRow,
      resolution: {
        isValid: true,
        budgetBytes: 1024,
        source: 'test',
        diskBytes: 1024,
      },
    }),
  });
}

test('L-write: flag-on retryable defer seeds the owner-local nodes row and proceeds',
  async (t) => {
    const previous = process.env[FLAG];
    process.env[FLAG] = 'true';
    t.teardown(() => {
      if (previous === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = previous;
      }
    });

    const upsertCalls = [];
    let nowMs = 0;
    let nodeWriteAttempts = 0;

    const service = new NodeJoiningService({
      nodeId: 'test-node-deferred-seed',
      nodeAddress: 'ws://localhost:9101',
      seedNodeAddress: 'ws://seed:8000',
    });
    // Short awaited budget so the retry loop ages out quickly under the virtual clock.
    service.config.joinDeferredSeedAwaitMs = 100;
    service.now = () => nowMs;
    service.sleep = async (delayMs) => {
      nowMs += delayMs;
    };
    installBudgetService(service);
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        if (tableName === TABLES.NODES) {
          nodeWriteAttempts += 1;
          // The seed participant never accepts the durable nodes write in-window.
          throw buildParticipantFailure();
        }
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };

    await t.resolves(
      service.registerNodeInCluster(),
      'a retryable nodes-write defer must not fail the join when the flag is on',
    );

    t.ok(
      nodeWriteAttempts >= 1,
      'the durable nodes write should have been attempted before deferring',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      'test-node-deferred-seed',
      'membership should be visible from the owner-local seeded nodes cache row',
    );
    t.ok(
      upsertCalls.some((call) => call.tableName === TABLES.NODE_ENDPOINTS),
      'endpoint publication should still proceed after the nodes write is deferred',
    );
    t.equal(
      service.hasPublishedLocalServiceEndpoints(),
      true,
      'service endpoint publication should complete after the deferred nodes seed',
    );
  });

test('L-write: flag-on retryable node_endpoints defer seeds the endpoint and proceeds',
  async (t) => {
    const previous = process.env[FLAG];
    process.env[FLAG] = 'true';
    t.teardown(() => {
      if (previous === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = previous;
      }
    });

    let nowMs = 0;
    let endpointWriteAttempts = 0;

    const service = new NodeJoiningService({
      nodeId: 'test-node-endpoint-defer',
      nodeAddress: 'ws://localhost:9104',
      seedNodeAddress: 'ws://seed:8000',
    });
    service.config.joinDeferredSeedAwaitMs = 100;
    service.now = () => nowMs;
    service.sleep = async (delayMs) => {
      nowMs += delayMs;
    };
    installBudgetService(service);
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName) => {
        if (tableName === TABLES.NODE_ENDPOINTS) {
          endpointWriteAttempts += 1;
          // The node_endpoints durable write never lands in-window.
          throw buildParticipantFailure();
        }
        // NODES + SERVICE_ENDPOINTS land durably.
        return {success: true};
      },
    };

    await t.resolves(
      service.registerNodeInCluster(),
      'a retryable node_endpoints defer must not fail the join when the flag is on',
    );

    t.ok(
      endpointWriteAttempts >= 1,
      'the durable node_endpoints write should have been attempted before deferring',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      'test-node-endpoint-defer',
      'nodes membership should be durable since only the endpoint write deferred',
    );
    t.equal(
      service.hasPublishedLocalServiceEndpoints(),
      true,
      'meta service endpoint publication should proceed past the deferred endpoint',
    );
  });

test('L-write: flag-on still fails narrowly on a non-retryable (permanent) nodes-write error',
  async (t) => {
    const previous = process.env[FLAG];
    process.env[FLAG] = 'true';
    t.teardown(() => {
      if (previous === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = previous;
      }
    });

    const service = new NodeJoiningService({
      nodeId: 'test-node-permanent-failure',
      nodeAddress: 'ws://localhost:9102',
      seedNodeAddress: 'ws://seed:8000',
    });
    service.config.joinDeferredSeedAwaitMs = 100;
    installBudgetService(service);
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName) => {
        if (tableName === TABLES.NODES) {
          // A permanent error: message is NOT in the retryable-fragment set.
          const error = new Error('node row rejected: schema validation failed');
          error.code = 'NODE_ROW_VALIDATION_REJECTED';
          throw error;
        }
        return {success: true};
      },
    };

    await t.rejects(
      service.registerNodeInCluster(),
      /Failed to register node/,
      'a permanent (non-retryable) nodes-write error must still fail the join',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      null,
      'a permanently-rejected nodes write must not seed owner-local membership',
    );
  });

test('L-write: flag-off preserves the historical fail-narrowly contract',
  async (t) => {
    const previous = process.env[FLAG];
    delete process.env[FLAG];
    t.teardown(() => {
      if (previous === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = previous;
      }
    });

    const upsertCalls = [];
    const service = new NodeJoiningService({
      nodeId: 'test-node-flag-off',
      nodeAddress: 'ws://localhost:9103',
      seedNodeAddress: 'ws://seed:8000',
    });
    service.config.joinAdmissionWriteRetryTimeoutMs = 0;
    installBudgetService(service);
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        if (tableName === TABLES.NODES) {
          throw buildParticipantFailure();
        }
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };

    await t.rejects(
      service.registerNodeInCluster(),
      /Failed to register node/,
      'with the flag off a retryable defer must still fail the join (no seed)',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      null,
      'flag-off must not seed owner-local membership on a deferred write',
    );
    t.equal(
      upsertCalls.length,
      0,
      'flag-off must stop before endpoint publication when the nodes write fails',
    );
  });
