/**
 * Tests for runtime endpoint writer — maps endpoint intents
 * to service_endpoints table rows.
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeEndpointRow,
  deriveEndpointId,
  buildUnhealthyEndpointRow,
} from '../../src/runtime/runtime-endpoint-writer.js';
import {
  EP_COL,
  EP_META,
  EP_ID_SEPARATOR,
  DEFAULT_VERSION,
} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';

// --- deriveEndpointId ---

describe('deriveEndpointId', () => {
  it('builds deterministic id from serviceId and nodeId', () => {
    const id = deriveEndpointId('sys-postgres-wire', 'node-1');
    assert.equal(id, `sys-postgres-wire${EP_ID_SEPARATOR}node-1`);
  });
});

// --- buildRuntimeEndpointRow ---

describe('buildRuntimeEndpointRow', () => {
  it('maps postgresql endpoint intent to service_endpoints row', () => {
    const row = buildRuntimeEndpointRow(
      'sys-postgres-wire', 'node-1',
      {host: '127.0.0.1', port: 5432, protocol: 'postgresql'},
    );

    assert.equal(
      row[EP_COL.ENDPOINT_ID],
      `sys-postgres-wire${EP_ID_SEPARATOR}node-1`,
    );
    assert.equal(row[EP_COL.SERVICE_ID], 'sys-postgres-wire');
    assert.equal(row[EP_COL.NODE_ID], 'node-1');
    assert.equal(
      row[EP_COL.PROTOCOL],
      WASM_SERVICE_PROTOCOL.POSTGRESQL,
    );
    assert.equal(row[EP_COL.ADDRESS], '127.0.0.1');
    assert.equal(row[EP_COL.PORT], 5432);
    assert.equal(
      row[EP_COL.HEALTH_STATUS],
      WASM_SERVICE_HEALTH_STATUS.HEALTHY,
    );
    assert.ok(row[EP_COL.CREATED_AT] > 0);
    assert.ok(row[EP_COL.UPDATED_AT] > 0);
  });

  it('defaults host to nodeId when not provided', () => {
    const row = buildRuntimeEndpointRow(
      'svc-1', 'node-2', {port: 9000},
    );
    assert.equal(row[EP_COL.ADDRESS], 'node-2');
  });

  it('defaults protocol to websocket when not provided', () => {
    const row = buildRuntimeEndpointRow(
      'svc-1', 'node-1', {port: 8080},
    );
    assert.equal(
      row[EP_COL.PROTOCOL],
      WASM_SERVICE_PROTOCOL.WEBSOCKET,
    );
  });

  it('includes metadata JSON with service_name and version', () => {
    const row = buildRuntimeEndpointRow(
      'sys-postgres-wire', 'node-1',
      {host: '0.0.0.0', port: 5432, protocol: 'postgresql'},
    );
    const meta = JSON.parse(row[EP_COL.METADATA]);
    assert.equal(meta[EP_META.SERVICE_NAME], 'sys-postgres-wire');
    assert.equal(meta[EP_META.VERSION], DEFAULT_VERSION);
    assert.equal(meta[EP_META.PROTOCOL], 'postgresql');
  });
});

// --- buildUnhealthyEndpointRow ---

describe('buildUnhealthyEndpointRow', () => {
  it('builds partial row with unhealthy status', () => {
    const row = buildUnhealthyEndpointRow(
      'sys-postgres-wire', 'node-1',
    );
    assert.equal(
      row[EP_COL.ENDPOINT_ID],
      `sys-postgres-wire${EP_ID_SEPARATOR}node-1`,
    );
    assert.equal(
      row[EP_COL.HEALTH_STATUS],
      WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
    );
    assert.ok(row[EP_COL.UPDATED_AT] > 0);
  });

  it('does not include address or port fields', () => {
    const row = buildUnhealthyEndpointRow('svc-1', 'node-1');
    assert.equal(row[EP_COL.ADDRESS], undefined);
    assert.equal(row[EP_COL.PORT], undefined);
  });
});
