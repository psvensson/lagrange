/**
 * Unit tests for PostgreSQL wire system service constants.
 *
 * Validates service ID, runtime ref, protocol, and metrics log tags
 * added for sys-postgres-wire.
 *
 * Requirements: 1.1, 6.1, 12.1
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
  METRICS_LOG_TAG,
} from '../../src/constants/index.js';
import {
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('META_SERVICE_ID.POSTGRES_WIRE', () => {
  it('should equal sys-postgres-wire', () => {
    assert.equal(META_SERVICE_ID.POSTGRES_WIRE, 'sys-postgres-wire');
  });
});

describe('META_SERVICE_RUNTIME_REF.POSTGRES_WIRE', () => {
  it('should equal postgres-wire-runtime', () => {
    assert.equal(
      META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
      'postgres-wire-runtime',
    );
  });
});

describe('WASM_SERVICE_PROTOCOL.POSTGRESQL', () => {
  it('should equal postgresql', () => {
    assert.equal(WASM_SERVICE_PROTOCOL.POSTGRESQL, 'postgresql');
  });

  it('should be included in frozen protocol object', () => {
    assert.ok(Object.isFrozen(WASM_SERVICE_PROTOCOL));
    assert.ok(
      Object.values(WASM_SERVICE_PROTOCOL).includes('postgresql'),
    );
  });
});

describe('METRICS_LOG_TAG pgwire namespace', () => {
  it('should have PGWIRE_HANDSHAKE tag', () => {
    assert.equal(
      METRICS_LOG_TAG.PGWIRE_HANDSHAKE,
      'metrics.pgwire.handshake',
    );
  });

  it('should have PGWIRE_QUERY tag', () => {
    assert.equal(
      METRICS_LOG_TAG.PGWIRE_QUERY,
      'metrics.pgwire.query',
    );
  });

  it('should have PGWIRE_SESSION tag', () => {
    assert.equal(
      METRICS_LOG_TAG.PGWIRE_SESSION,
      'metrics.pgwire.session',
    );
  });

  it('should have PGWIRE_PROTOCOL_ERROR tag', () => {
    assert.equal(
      METRICS_LOG_TAG.PGWIRE_PROTOCOL_ERROR,
      'metrics.pgwire.protocol_error',
    );
  });

  it('should use metrics.pgwire prefix for all pgwire tags', () => {
    const pgwireTags = Object.entries(METRICS_LOG_TAG)
      .filter(([key]) => key.startsWith('PGWIRE_'))
      .map(([, value]) => value);
    assert.equal(pgwireTags.length, 4);
    for (const tag of pgwireTags) {
      assert.ok(
        tag.startsWith('metrics.pgwire.'),
        `${tag} should start with metrics.pgwire.`,
      );
    }
  });
});
