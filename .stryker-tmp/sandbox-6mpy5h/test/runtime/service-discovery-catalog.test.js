// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  buildServiceDiscoveryCatalog,
  SERVICE_DISCOVERY_HEALTH,
} from '../../src/runtime/service-discovery-catalog.js';
import {EP_COL, EP_META} from '../../src/wasm-service/service-endpoint-builder.js';
import {WASM_SERVICE_HEALTH_STATUS} from
  '../../src/wasm-service/wasm-service-constants.js';

function createEndpointRow(overrides = {}) {
  return {
    [EP_COL.ENDPOINT_ID]: 'sys-postgres-wire-ep-node-1',
    [EP_COL.SERVICE_ID]: 'sys-postgres-wire',
    [EP_COL.NODE_ID]: 'node-1',
    [EP_COL.PROTOCOL]: 'postgresql',
    [EP_COL.ADDRESS]: '10.0.0.1',
    [EP_COL.PORT]: 5432,
    [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
    [EP_COL.METADATA]: JSON.stringify({
      [EP_META.SERVICE_NAME]: 'sys-postgres-wire',
      [EP_META.VERSION]: '1.0.0',
      [EP_META.PROTOCOL]: 'postgresql',
    }),
    updated_at: 1234,
    ...overrides,
  };
}

describe('service-discovery-catalog', () => {
  it('builds grouped discovery records with replica and desired-count metadata', () => {
    const endpointRows = [
      createEndpointRow(),
      createEndpointRow({
        [EP_COL.ENDPOINT_ID]: 'sys-postgres-wire-ep-node-2',
        [EP_COL.NODE_ID]: 'node-2',
        [EP_COL.ADDRESS]: '10.0.0.2',
        [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
      }),
    ];
    const definitionRows = [{
      service_id: 'sys-postgres-wire',
      replica_count: 3,
    }];

    const catalog = buildServiceDiscoveryCatalog(endpointRows, {
      definitionRows,
      healthyOnly: false,
    });

    assert.equal(catalog.length, 1);

    const entry = catalog[0];
    assert.equal(entry.serviceKey, 'sys-postgres-wire|postgresql');
    assert.equal(entry.logicalServiceName, 'sys-postgres-wire');
    assert.equal(entry.protocol, 'postgresql');
    assert.deepEqual(entry.serviceIds, ['sys-postgres-wire']);
    assert.equal(entry.desiredReplicaCount, 3);
    assert.deepEqual(entry.desiredReplicaCountByServiceId, {
      'sys-postgres-wire': 3,
    });
    assert.equal(entry.observedReplicaCount, 2);
    assert.equal(entry.healthyReplicaCount, 1);
    assert.equal(entry.unhealthyReplicaCount, 1);
    assert.equal(entry.health, SERVICE_DISCOVERY_HEALTH.PARTIAL);
    assert.deepEqual(entry.nodes, ['node-1', 'node-2']);
    assert.equal(entry.replicas.length, 2);
    assert.equal(entry.replicas[0].endpointId, 'sys-postgres-wire-ep-node-1');
    assert.equal(entry.replicas[1].endpointId, 'sys-postgres-wire-ep-node-2');
  });

  it('applies protocol, service, node, and health filters deterministically', () => {
    const endpointRows = [
      createEndpointRow({
        [EP_COL.ENDPOINT_ID]: 'sys-postgres-wire-ep-node-1',
        [EP_COL.NODE_ID]: 'node-1',
      }),
      createEndpointRow({
        [EP_COL.ENDPOINT_ID]: 'sys-postgres-wire-ep-node-2',
        [EP_COL.NODE_ID]: 'node-2',
        [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
      }),
      createEndpointRow({
        [EP_COL.ENDPOINT_ID]: 'sys-admin-meta-ep-node-3',
        [EP_COL.SERVICE_ID]: 'sys-admin-meta',
        [EP_COL.NODE_ID]: 'node-3',
        [EP_COL.PROTOCOL]: 'websocket',
        [EP_COL.PORT]: 8081,
        [EP_COL.METADATA]: JSON.stringify({
          [EP_META.SERVICE_NAME]: 'sys-admin-meta',
          [EP_META.VERSION]: '1.0.0',
          [EP_META.PROTOCOL]: 'websocket',
        }),
      }),
    ];

    const catalog = buildServiceDiscoveryCatalog(endpointRows, {
      protocolAllowlist: ['postgresql'],
      serviceIdAllowlist: ['sys-postgres-wire'],
      nodeIdAllowlist: ['node-1'],
      healthyOnly: true,
    });

    assert.equal(catalog.length, 1);
    const entry = catalog[0];
    assert.equal(entry.serviceKey, 'sys-postgres-wire|postgresql');
    assert.equal(entry.observedReplicaCount, 1);
    assert.equal(entry.healthyReplicaCount, 1);
    assert.equal(entry.health, SERVICE_DISCOVERY_HEALTH.HEALTHY);
    assert.deepEqual(entry.nodes, ['node-1']);
    assert.equal(entry.replicas.length, 1);
    assert.equal(entry.replicas[0].nodeId, 'node-1');
  });
});
