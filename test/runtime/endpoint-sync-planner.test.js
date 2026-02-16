import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  chunkEndpoints,
  groupEndpointRows,
  planEndpointExports,
  planEndpointSlices,
  resolveAddressType,
  validateGroupPorts,
} from '../../src/runtime/endpoint-sync-planner.js';
import {
  ENDPOINT_SYNC_ADDRESS_TYPE,
} from '../../src/runtime/endpoint-sync-constants.js';

function createNormalizedEndpoint(overrides = {}) {
  return {
    endpointId: 'ep-1',
    serviceId: 'sys-postgres-wire',
    logicalServiceName: 'sys-postgres-wire',
    nodeId: 'node-a',
    protocol: 'postgresql',
    address: '10.0.0.2',
    port: 5432,
    healthStatus: 'healthy',
    metadata: {},
    updatedAt: 1000,
    serviceKey: 'sys-postgres-wire|postgresql',
    ...overrides,
  };
}

describe('endpoint-sync-planner', () => {
  describe('resolveAddressType', () => {
    it('detects IPv4 addresses', () => {
      assert.equal(resolveAddressType('10.0.0.2'), ENDPOINT_SYNC_ADDRESS_TYPE.IPV4);
    });

    it('detects IPv6 addresses', () => {
      assert.equal(resolveAddressType('2001:db8::1'), ENDPOINT_SYNC_ADDRESS_TYPE.IPV6);
    });

    it('falls back to FQDN for hostnames', () => {
      assert.equal(resolveAddressType('node-1.cluster.local'), ENDPOINT_SYNC_ADDRESS_TYPE.FQDN);
    });
  });

  describe('chunkEndpoints', () => {
    it('chunks endpoints by max size', () => {
      const endpoints = [
        createNormalizedEndpoint({endpointId: 'ep-1'}),
        createNormalizedEndpoint({endpointId: 'ep-2'}),
        createNormalizedEndpoint({endpointId: 'ep-3'}),
      ];

      const chunks = chunkEndpoints(endpoints, 2);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].length, 2);
      assert.equal(chunks[1].length, 1);
    });
  });

  describe('groupEndpointRows', () => {
    it('groups rows by logical service and protocol', () => {
      const rows = [
        createNormalizedEndpoint({endpointId: 'ep-1'}),
        createNormalizedEndpoint({endpointId: 'ep-2'}),
      ];

      const groups = groupEndpointRows(rows);
      assert.equal(groups.size, 1);
      const group = groups.values().next().value;
      assert.equal(group.logicalServiceName, 'sys-postgres-wire');
      assert.equal(group.protocol, 'postgresql');
      assert.equal(group.endpoints.length, 2);
    });
  });

  describe('validateGroupPorts', () => {
    it('marks valid when all endpoints share one port', () => {
      const group = {
        endpoints: [
          createNormalizedEndpoint({endpointId: 'ep-1', port: 5432}),
          createNormalizedEndpoint({endpointId: 'ep-2', port: 5432}),
        ],
      };

      const result = validateGroupPorts(group);
      assert.equal(result.valid, true);
      assert.deepEqual(result.ports, [5432]);
    });

    it('marks invalid when endpoints have mixed ports', () => {
      const group = {
        endpoints: [
          createNormalizedEndpoint({endpointId: 'ep-1', port: 5432}),
          createNormalizedEndpoint({endpointId: 'ep-2', port: 5433}),
        ],
      };

      const result = validateGroupPorts(group);
      assert.equal(result.valid, false);
      assert.deepEqual(result.ports, [5432, 5433]);
    });
  });

  describe('planEndpointSlices', () => {
    it('splits slices by address type and max size', () => {
      const endpoints = [
        createNormalizedEndpoint({endpointId: 'ep-1', address: '10.0.0.2'}),
        createNormalizedEndpoint({endpointId: 'ep-2', address: '10.0.0.3'}),
        createNormalizedEndpoint({endpointId: 'ep-3', address: 'db::1'}),
      ];

      const slices = planEndpointSlices(endpoints, 1);
      assert.equal(slices.length, 3);
      assert.equal(slices[0].endpoints.length, 1);
      assert.equal(slices[1].endpoints.length, 1);
      assert.equal(slices[2].endpoints.length, 1);
    });
  });

  describe('planEndpointExports', () => {
    it('returns planned exports for strict-port-compatible groups', () => {
      const rows = [
        createNormalizedEndpoint({endpointId: 'ep-1'}),
        createNormalizedEndpoint({endpointId: 'ep-2', nodeId: 'node-b'}),
      ];

      const plan = planEndpointExports(rows, {
        strictPortMode: true,
        serviceNamePrefix: 'edge',
        maxEndpointsPerSlice: 2,
      });

      assert.equal(plan.conflicts.length, 0);
      assert.equal(plan.exports.length, 1);
      assert.equal(plan.exports[0].serviceName, 'edge-sys-postgres-wire-postgresql');
      assert.equal(plan.exports[0].port, 5432);
      assert.equal(plan.exports[0].endpointCount, 2);
      assert.equal(plan.exports[0].slicePlans.length, 1);
    });

    it('returns conflicts for mixed ports in strict mode', () => {
      const rows = [
        createNormalizedEndpoint({endpointId: 'ep-1', port: 5432}),
        createNormalizedEndpoint({endpointId: 'ep-2', port: 5433}),
      ];

      const plan = planEndpointExports(rows, {
        strictPortMode: true,
      });

      assert.equal(plan.exports.length, 0);
      assert.equal(plan.conflicts.length, 1);
      assert.deepEqual(plan.conflicts[0].ports, [5432, 5433]);
    });

    it('allows mixed ports in non-strict mode', () => {
      const rows = [
        createNormalizedEndpoint({endpointId: 'ep-1', port: 5432}),
        createNormalizedEndpoint({endpointId: 'ep-2', port: 5433}),
      ];

      const plan = planEndpointExports(rows, {
        strictPortMode: false,
      });

      assert.equal(plan.conflicts.length, 0);
      assert.equal(plan.exports.length, 1);
      assert.equal(plan.exports[0].port, 5432);
    });
  });
});
