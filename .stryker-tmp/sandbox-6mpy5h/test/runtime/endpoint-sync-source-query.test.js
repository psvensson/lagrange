// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEndpointSourceQuery,
  filterNormalizedEndpointRows,
  normalizeEndpointRow,
  normalizeEndpointRows,
  parseEndpointMetadata,
  resolveLogicalServiceName,
} from '../../src/runtime/endpoint-sync-source-query.js';
import {EP_COL, EP_META} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from '../../src/runtime/endpoint-sync-constants.js';

function createRawRow(overrides = {}) {
  return {
    [EP_COL.ENDPOINT_ID]: 'ep-1',
    [EP_COL.SERVICE_ID]: 'sys-postgres-wire',
    [EP_COL.NODE_ID]: 'node-a',
    [EP_COL.PROTOCOL]: 'postgresql',
    [EP_COL.ADDRESS]: '10.0.0.2',
    [EP_COL.PORT]: 5432,
    [EP_COL.HEALTH_STATUS]: 'healthy',
    [EP_COL.METADATA]: JSON.stringify({
      [EP_META.SERVICE_NAME]: 'sys-postgres-wire',
      [EP_META.VERSION]: '1.0.0',
    }),
    updated_at: 1000,
    ...overrides,
  };
}

describe('endpoint-sync-source-query', () => {
  describe('buildEndpointSourceQuery', () => {
    it('builds deterministic query with healthy-only filter by default', () => {
      const result = buildEndpointSourceQuery();

      assert.ok(result.sql.includes('FROM service_endpoints'));
      assert.ok(result.sql.includes('health_status'));
      assert.ok(result.sql.includes('ORDER BY'));
      assert.deepEqual(result.params, ['healthy']);
    });

    it('adds protocol and service filters when provided', () => {
      const result = buildEndpointSourceQuery({
        protocolAllowlist: ['postgresql', 'websocket'],
        serviceIdAllowlist: ['sys-postgres-wire'],
        healthyOnly: false,
      });

      assert.ok(result.sql.includes('protocol IN'));
      assert.ok(result.sql.includes('service_id IN'));
      assert.deepEqual(
        result.params,
        ['postgresql', 'websocket', 'sys-postgres-wire'],
      );
    });
  });

  describe('parseEndpointMetadata', () => {
    it('returns object for JSON metadata', () => {
      const metadata = parseEndpointMetadata('{"a":1}');
      assert.deepEqual(metadata, {a: 1});
    });

    it('returns empty object for invalid metadata', () => {
      assert.deepEqual(parseEndpointMetadata('not-json'), {});
      assert.deepEqual(parseEndpointMetadata(''), {});
      assert.deepEqual(parseEndpointMetadata(null), {});
    });
  });

  describe('resolveLogicalServiceName', () => {
    it('prefers metadata service_name when available', () => {
      const name = resolveLogicalServiceName('svc-a', {
        [EP_META.SERVICE_NAME]: 'logical-a',
      });
      assert.equal(name, 'logical-a');
    });

    it('falls back to service id', () => {
      const name = resolveLogicalServiceName('svc-a', {});
      assert.equal(name, 'svc-a');
    });
  });

  describe('normalizeEndpointRow', () => {
    it('normalizes valid source row', () => {
      const normalized = normalizeEndpointRow(createRawRow());

      assert.ok(normalized);
      assert.equal(normalized.endpointId, 'ep-1');
      assert.equal(normalized.serviceId, 'sys-postgres-wire');
      assert.equal(normalized.logicalServiceName, 'sys-postgres-wire');
      assert.equal(normalized.protocol, 'postgresql');
      assert.equal(normalized.address, '10.0.0.2');
      assert.equal(normalized.port, 5432);
      assert.equal(normalized.healthStatus, 'healthy');
      assert.equal(normalized.updatedAt, 1000);
    });

    it('returns null for invalid rows', () => {
      const row = createRawRow({[EP_COL.PORT]: 'bad-port'});
      assert.equal(normalizeEndpointRow(row), null);
    });
  });

  describe('normalizeEndpointRows', () => {
    it('drops invalid rows and keeps valid rows', () => {
      const rows = normalizeEndpointRows([
        createRawRow({[EP_COL.ENDPOINT_ID]: 'ep-1'}),
        createRawRow({[EP_COL.ENDPOINT_ID]: ''}),
      ]);

      assert.equal(rows.length, 1);
      assert.equal(rows[0].endpointId, 'ep-1');
    });
  });

  describe('filterNormalizedEndpointRows', () => {
    it('filters by protocol and service id allowlists', () => {
      const rows = normalizeEndpointRows([
        createRawRow({[EP_COL.ENDPOINT_ID]: 'ep-1'}),
        createRawRow({
          [EP_COL.ENDPOINT_ID]: 'ep-2',
          [EP_COL.PROTOCOL]: 'websocket',
        }),
      ]);

      const filtered = filterNormalizedEndpointRows(rows, {
        protocolAllowlist: ['postgresql'],
        serviceIdAllowlist: ['sys-postgres-wire'],
        healthyOnly: false,
        unhealthyPolicy: ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
      });

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].endpointId, 'ep-1');
    });

    it('excludes unhealthy rows in healthy-only mode', () => {
      const rows = normalizeEndpointRows([
        createRawRow({[EP_COL.ENDPOINT_ID]: 'ep-1'}),
        createRawRow({
          [EP_COL.ENDPOINT_ID]: 'ep-2',
          [EP_COL.HEALTH_STATUS]: 'unhealthy',
        }),
      ]);

      const filtered = filterNormalizedEndpointRows(rows, {
        healthyOnly: true,
      });

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].endpointId, 'ep-1');
    });

    it('retains unhealthy rows when policy is not_ready and healthyOnly false', () => {
      const rows = normalizeEndpointRows([
        createRawRow({[EP_COL.ENDPOINT_ID]: 'ep-1'}),
        createRawRow({
          [EP_COL.ENDPOINT_ID]: 'ep-2',
          [EP_COL.HEALTH_STATUS]: 'unhealthy',
        }),
      ]);

      const filtered = filterNormalizedEndpointRows(rows, {
        healthyOnly: false,
        unhealthyPolicy: ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
      });

      assert.equal(filtered.length, 2);
    });
  });
});
