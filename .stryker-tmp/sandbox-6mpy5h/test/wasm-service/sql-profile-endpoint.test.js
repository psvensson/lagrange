// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  EP_COL,
  EP_META,
  EP_ID_SEPARATOR,
  buildEndpointRecord,
  buildSqlEngineEndpointRecord,
} from '../../src/wasm-service/service-endpoint-builder.js';
import {SERVICE_PROFILE} from '../../src/constants/index.js';
import {
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  SQL_PROFILE_FIELD,
} from '../../src/wasm-service/sql-profile-constants.js';
import {
  createSqlEngineDefinition,
} from '../../src/wasm-service/sql-profile-factory.js';

/**
 * Creates a SQL engine service definition for testing.
 * @param {Object} [overrides] - Optional field overrides.
 * @return {Object} A SQL engine service definition.
 */
function createSqlDef(overrides = {}) {
  return createSqlEngineDefinition({
    serviceId: 'sql-svc-1',
    serviceName: 'sql-engine-1',
    ...overrides,
  });
}

describe('SQL profile endpoint building', () => {
  describe('buildSqlEngineEndpointRecord', () => {
    it('should include service_profile in metadata', () => {
      const def = createSqlDef();
      const record = buildSqlEngineEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });
      const metadata = JSON.parse(record[EP_COL.METADATA]);
      assert.equal(
        metadata[SQL_PROFILE_FIELD.SERVICE_PROFILE_META],
        SERVICE_PROFILE.SQL_ENGINE,
      );
    });

    it('should preserve standard metadata fields', () => {
      const def = createSqlDef({
        serviceName: 'my-sql-engine',
      });
      const record = buildSqlEngineEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-2',
        address: '10.0.0.1',
        port: 30002,
        version: '2.0.0',
      });
      const metadata = JSON.parse(record[EP_COL.METADATA]);
      assert.equal(
        metadata[EP_META.SERVICE_NAME],
        'my-sql-engine',
      );
      assert.equal(metadata[EP_META.VERSION], '2.0.0');
      assert.equal(
        metadata[EP_META.PROTOCOL],
        WASM_SERVICE_PROTOCOL.WEBSOCKET,
      );
    });

    it('should set all standard endpoint columns', () => {
      const def = createSqlDef();
      const record = buildSqlEngineEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });
      assert.equal(record[EP_COL.SERVICE_ID], 'sql-svc-1');
      assert.equal(record[EP_COL.NODE_ID], 'node-1');
      assert.equal(record[EP_COL.ADDRESS], '127.0.0.1');
      assert.equal(record[EP_COL.PORT], 30001);
      assert.equal(
        record[EP_COL.HEALTH_STATUS],
        WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      );
    });

    it('should generate endpoint_id as serviceId-ep-nodeId',
      () => {
        const def = createSqlDef({serviceId: 'sql-abc'});
        const record = buildSqlEngineEndpointRecord({
          serviceDefinition: def,
          nodeId: 'node-xyz',
          address: '127.0.0.1',
          port: 30001,
        });
        const expected =
          `sql-abc${EP_ID_SEPARATOR}node-xyz`;
        assert.equal(record[EP_COL.ENDPOINT_ID], expected);
      });

    it('should set created_at and updated_at timestamps',
      () => {
        const before = Date.now();
        const def = createSqlDef();
        const record = buildSqlEngineEndpointRecord({
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
  });

  describe('buildEndpointRecord with SQL definition', () => {
    it('should work with SQL engine definitions via base ' +
      'builder', () => {
      const def = createSqlDef();
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });
      assert.equal(record[EP_COL.SERVICE_ID], 'sql-svc-1');
      assert.ok(record[EP_COL.METADATA]);
    });

    it('should not include service_profile in base builder ' +
      'metadata', () => {
      const def = createSqlDef();
      const record = buildEndpointRecord({
        serviceDefinition: def,
        nodeId: 'node-1',
        address: '127.0.0.1',
        port: 30001,
      });
      const metadata = JSON.parse(record[EP_COL.METADATA]);
      assert.equal(
        metadata[SQL_PROFILE_FIELD.SERVICE_PROFILE_META],
        undefined,
      );
    });
  });
});
