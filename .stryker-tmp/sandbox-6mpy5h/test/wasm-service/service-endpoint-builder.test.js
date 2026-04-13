// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  EP_COL,
  EP_META,
  EP_ID_SEPARATOR,
  DEFAULT_VERSION,
  buildEndpointRecord,
} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';

/**
 * Creates a minimal service definition for testing.
 * @param {Object} [overrides] - Optional field overrides.
 * @return {Object} A service definition object.
 */
function createServiceDefinition(overrides = {}) {
  return {
    serviceId: 'svc-1',
    serviceName: 'test-service',
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ...overrides,
  };
}

describe('ServiceEndpointBuilder', () => {
  describe('buildEndpointRecord', () => {
    it('should build a complete endpoint record with all fields',
      () => {
        const def = createServiceDefinition();
        const record = buildEndpointRecord({
          serviceDefinition: def,
          nodeId: 'node-1',
          address: '127.0.0.1',
          port: 30001,
        });

        assert.ok(record[EP_COL.ENDPOINT_ID]);
        assert.equal(record[EP_COL.SERVICE_ID], 'svc-1');
        assert.equal(record[EP_COL.NODE_ID], 'node-1');
        assert.equal(
          record[EP_COL.PROTOCOL],
          WASM_SERVICE_PROTOCOL.WEBSOCKET,
        );
        assert.equal(record[EP_COL.ADDRESS], '127.0.0.1');
        assert.equal(record[EP_COL.PORT], 30001);
        assert.equal(
          record[EP_COL.HEALTH_STATUS],
          WASM_SERVICE_HEALTH_STATUS.HEALTHY,
        );
        assert.ok(record[EP_COL.METADATA]);
        assert.ok(record[EP_COL.CREATED_AT] > 0);
        assert.ok(record[EP_COL.UPDATED_AT] > 0);
      });

    it('should include service_name, version, and protocol ' +
      'in metadata', () => {
      const def = createServiceDefinition({
        serviceName: 'my-api',
      });
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-2',
        address: '10.0.0.1',
        port: 30002,
        version: '2.1.0',
      });

      const metadata = JSON.parse(record[EP_COL.METADATA]);
      assert.equal(metadata[EP_META.SERVICE_NAME], 'my-api');
      assert.equal(metadata[EP_META.VERSION], '2.1.0');
      assert.equal(
        metadata[EP_META.PROTOCOL],
        WASM_SERVICE_PROTOCOL.WEBSOCKET,
      );
    });

    it('should default health_status to HEALTHY', () => {
      const def = createServiceDefinition();
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });

      assert.equal(
        record[EP_COL.HEALTH_STATUS],
        WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      );
    });

    it('should use protocol from service definition', () => {
      const def = createServiceDefinition({
        protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
      });
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });

      assert.equal(
        record[EP_COL.PROTOCOL],
        WASM_SERVICE_PROTOCOL.WEBSOCKET,
      );
      const metadata = JSON.parse(record[EP_COL.METADATA]);
      assert.equal(
        metadata[EP_META.PROTOCOL],
        WASM_SERVICE_PROTOCOL.WEBSOCKET,
      );
    });

    it('should default protocol to WEBSOCKET when not set',
      () => {
        const def = createServiceDefinition({protocol: undefined});
        const record = buildEndpointRecord({
          serviceDefinition: def,
          nodeId: 'node-1',
          address: '127.0.0.1',
          port: 30001,
        });

        assert.equal(
          record[EP_COL.PROTOCOL],
          WASM_SERVICE_PROTOCOL.WEBSOCKET,
        );
      });

    it('should generate endpoint_id as serviceId-ep-nodeId',
      () => {
        const def = createServiceDefinition({
          serviceId: 'svc-abc',
        });
        const record = buildEndpointRecord({
          serviceDefinition: def,
          nodeId: 'node-xyz',
          address: '127.0.0.1',
          port: 30001,
        });

        const expected =
          `svc-abc${EP_ID_SEPARATOR}node-xyz`;
        assert.equal(record[EP_COL.ENDPOINT_ID], expected);
      });

    it('should set created_at and updated_at timestamps', () => {
      const before = Date.now();
      const def = createServiceDefinition();
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });
      const after = Date.now();

      assert.ok(record[EP_COL.CREATED_AT] >= before);
      assert.ok(record[EP_COL.CREATED_AT] <= after);
      assert.ok(record[EP_COL.UPDATED_AT] >= before);
      assert.ok(record[EP_COL.UPDATED_AT] <= after);
    });

    it('should default version to DEFAULT_VERSION when not ' +
      'provided', () => {
      const def = createServiceDefinition();
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });

      const metadata = JSON.parse(record[EP_COL.METADATA]);
      assert.equal(metadata[EP_META.VERSION], DEFAULT_VERSION);
    });
  });
});
