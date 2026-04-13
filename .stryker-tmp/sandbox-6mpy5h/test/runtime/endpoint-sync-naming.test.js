// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEndpointSliceName,
  buildKubernetesServiceName,
  buildServiceKey,
  normalizeDns1123Segment,
  truncateDns1123WithHash,
} from '../../src/runtime/endpoint-sync-naming.js';
import {ENDPOINT_SYNC_NAME} from '../../src/runtime/endpoint-sync-constants.js';

describe('endpoint-sync-naming', () => {
  describe('normalizeDns1123Segment', () => {
    it('normalizes mixed case and invalid chars', () => {
      const normalized = normalizeDns1123Segment('Sys_Postgres Wire@1');
      assert.equal(normalized, 'sys-postgres-wire-1');
    });

    it('falls back for empty values', () => {
      assert.equal(
        normalizeDns1123Segment('   '),
        ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT,
      );
      assert.equal(
        normalizeDns1123Segment(null),
        ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT,
      );
    });
  });

  describe('truncateDns1123WithHash', () => {
    it('keeps short names unchanged', () => {
      const name = 'svc-sys-postgres-wire-postgresql';
      assert.equal(truncateDns1123WithHash(name), name);
    });

    it('truncates long names with hash suffix deterministically', () => {
      const longName = 'svc-' + 'a'.repeat(100);
      const first = truncateDns1123WithHash(longName);
      const second = truncateDns1123WithHash(longName);

      assert.equal(first.length <= 63, true);
      assert.equal(first, second);
      assert.ok(first.includes('-'));
    });
  });

  describe('buildServiceKey', () => {
    it('builds service key from logical service and protocol', () => {
      const key = buildServiceKey('Sys PG', 'PostgreSQL');
      assert.equal(key, 'sys-pg|postgresql');
    });
  });

  describe('buildKubernetesServiceName', () => {
    it('builds deterministic DNS-1123 service name', () => {
      const name = buildKubernetesServiceName(
        'edge',
        'sys-postgres-wire',
        'postgresql',
      );
      assert.equal(name, 'edge-sys-postgres-wire-postgresql');
    });

    it('enforces max length', () => {
      const name = buildKubernetesServiceName(
        'edge',
        'x'.repeat(120),
        'postgresql',
      );
      assert.equal(name.length <= 63, true);
    });
  });

  describe('buildEndpointSliceName', () => {
    it('builds deterministic slice name with index', () => {
      const name = buildEndpointSliceName('edge-svc-postgresql', 3);
      assert.equal(name, 'edge-svc-postgresql-3');
    });

    it('falls back index when invalid', () => {
      const name = buildEndpointSliceName('edge-svc-postgresql', -1);
      assert.equal(name, 'edge-svc-postgresql-0');
    });
  });
});
