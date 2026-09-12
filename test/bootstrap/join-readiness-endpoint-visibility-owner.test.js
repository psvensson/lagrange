import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateBootstrapEndpointVisibility,
} from '../../src/bootstrap/join-readiness-endpoint-visibility-owner.js';
import {
  ENDPOINT_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';

const NODE_ID = 'joining-node';

function cacheWithNodeEndpoint(rows = []) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.NODE_ENDPOINTS) return rows;
      return [];
    },
  };
}

test('join readiness requires local bootstrap transport but not pgwire', () => {
  const cache = cacheWithNodeEndpoint([{
    endpoint_id: 'joining-node-ws',
    node_id: NODE_ID,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: 'ws://joining-node:8082',
    status: ENDPOINT_STATUS.ACTIVE,
  }]);

  const result = evaluateBootstrapEndpointVisibility.call(
    {nodeId: NODE_ID},
    cache,
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.missingNodeEndpointNodeIds, []);
  assert.deepEqual(result.missingPostgresWireNodeIds, []);
});

test('join readiness still fails closed when local bootstrap transport is absent', () => {
  const result = evaluateBootstrapEndpointVisibility.call(
    {nodeId: NODE_ID},
    cacheWithNodeEndpoint([]),
  );

  assert.equal(result.ready, false);
  assert.deepEqual(result.missingNodeEndpointNodeIds, [NODE_ID]);
  assert.deepEqual(result.missingPostgresWireNodeIds, []);
});
