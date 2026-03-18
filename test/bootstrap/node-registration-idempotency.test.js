/**
 * Regression test for UNIQUE constraint violation when second node
 * joins cluster.
 *
 * Bug: When a second node joins the cluster, the seed node crashes
 * with: "UNIQUE constraint failed: nodes.node_id"
 *
 * Fix: Node registration owns canonical nodes-row creation directly
 * and endpoints use upsertSystemTableRow (INSERT OR REPLACE). Both
 * paths are idempotent.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {TABLES} from '../../src/constants/index.js';

/**
 * Wire a NodeJoiningService so registerNodeInCluster can
 * execute without a live cluster. Captures nodes-row and endpoint
 * upserts for assertion.
 *
 * @param {Object} opts
 * @param {string} opts.nodeId
 * @param {string} opts.nodeAddress
 * @param {Array} opts.upsertCalls - Accumulator.
 * @return {NodeJoiningService}
 */
function createWiredService({
  nodeId, nodeAddress, upsertCalls,
}) {
  const mockCDCService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async (tableName, rowData) => {
      upsertCalls.push({tableName, rowData});
      return {success: true};
    },
  };

  const service = new NodeJoiningService({
    nodeId,
    nodeAddress,
    seedNodeAddress: 'ws://seed:8000',
  });
  service.cdcIntegrationService = mockCDCService;
  service.sendControlPlaneNodeStateUpdate = async () => {
    throw new Error('legacy node-state owner path should not be used');
  };

  return service;
}

test(
  'registerNodeInCluster() uses idempotent owner paths ' +
  'for node and endpoint writes',
  async (t) => {
    const upsertCalls = [];
    const service = createWiredService({
      nodeId: 'test-node-idempotent',
      nodeAddress: 'ws://localhost:9000',
      upsertCalls,
    });

    await service.registerNodeInCluster();

    const nodeUpsert = upsertCalls.find(
      (c) => c.tableName === TABLES.NODES,
    );
    t.equal(
      Boolean(nodeUpsert), true,
      'node admission should create the canonical nodes row directly',
    );

    const endpointUpsert = upsertCalls.find(
      (c) => c.tableName === TABLES.NODE_ENDPOINTS,
    );
    t.ok(
      endpointUpsert,
      'should use upsertSystemTableRow for ' +
      'node_endpoints table (INSERT OR REPLACE)',
    );
  },
);

test(
  'registerNodeInCluster() does not fail on ' +
  'duplicate node_id (idempotent re-registration)',
  async (t) => {
    const upsertCalls = [];
    const service = createWiredService({
      nodeId: 'duplicate-node-test',
      nodeAddress: 'ws://localhost:9002',
      upsertCalls,
    });

    await service.registerNodeInCluster();
    await service.registerNodeInCluster();

    const nodeUpserts = upsertCalls.filter(
      (c) => c.tableName === TABLES.NODES,
    );
    t.equal(
      nodeUpserts.length, 2,
      'both registrations should create the canonical nodes row idempotently',
    );

    const endpointUpserts = upsertCalls.filter(
      (c) => c.tableName === TABLES.NODE_ENDPOINTS,
    );
    t.equal(
      endpointUpserts.length, 2,
      'both registrations should upsert endpoints ' +
      'idempotently',
    );
  },
);
