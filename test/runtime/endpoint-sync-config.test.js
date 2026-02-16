import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEndpointSyncConfig,
  normalizeProtocols,
  parseBooleanEnv,
  parseCsvList,
  parsePositiveIntegerEnv,
} from '../../src/runtime/endpoint-sync-config.js';
import {
  ENDPOINT_SYNC_DEFAULT,
  ENDPOINT_SYNC_ENV,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from '../../src/runtime/endpoint-sync-constants.js';

describe('endpoint-sync-config', () => {
  describe('parseCsvList', () => {
    it('parses comma-separated values with trimming', () => {
      const values = parseCsvList('a, b,c ,, d');
      assert.deepEqual(values, ['a', 'b', 'c', 'd']);
    });

    it('returns empty array for non-string values', () => {
      assert.deepEqual(parseCsvList(null), []);
      assert.deepEqual(parseCsvList(undefined), []);
      assert.deepEqual(parseCsvList(123), []);
    });
  });

  describe('normalizeProtocols', () => {
    it('normalizes protocol names to lowercase', () => {
      const normalized = normalizeProtocols(['PostgreSQL', 'WS']);
      assert.deepEqual(normalized, ['postgresql', 'ws']);
    });
  });

  describe('parseBooleanEnv', () => {
    it('parses supported boolean values', () => {
      const errors = [];
      assert.equal(parseBooleanEnv('true', false, 'X', errors), true);
      assert.equal(parseBooleanEnv('1', false, 'X', errors), true);
      assert.equal(parseBooleanEnv('false', true, 'X', errors), false);
      assert.equal(parseBooleanEnv('0', true, 'X', errors), false);
      assert.deepEqual(errors, []);
    });

    it('returns fallback and records error for invalid value', () => {
      const errors = [];
      const value = parseBooleanEnv('invalid', true, 'TEST_BOOL', errors);
      assert.equal(value, true);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes('TEST_BOOL'));
    });
  });

  describe('parsePositiveIntegerEnv', () => {
    it('parses positive integer values', () => {
      const errors = [];
      const parsed = parsePositiveIntegerEnv('123', 5, 'TEST_INT', errors);
      assert.equal(parsed, 123);
      assert.deepEqual(errors, []);
    });

    it('returns fallback and records error for invalid integer', () => {
      const errors = [];
      const parsed = parsePositiveIntegerEnv('0', 5, 'TEST_INT', errors);
      assert.equal(parsed, 5);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes('TEST_INT'));
    });
  });

  describe('buildEndpointSyncConfig', () => {
    it('builds default config when only URL is provided', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]:
          'ws://127.0.0.1:8081/api/admin/stream',
      });

      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
      assert.equal(result.config.intervalMs, ENDPOINT_SYNC_DEFAULT.INTERVAL_MS);
      assert.equal(
        result.config.strictPortMode,
        ENDPOINT_SYNC_DEFAULT.STRICT_PORT_MODE,
      );
      assert.deepEqual(
        result.config.protocolAllowlist,
        ENDPOINT_SYNC_DEFAULT.PROTOCOL_ALLOWLIST,
      );
    });

    it('parses explicit overrides', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]:
          'wss://controller.example/api/admin/stream',
        [ENDPOINT_SYNC_ENV.ADMIN_AUTH_TOKEN]: 'token-123',
        [ENDPOINT_SYNC_ENV.INTERVAL_MS]: '9000',
        [ENDPOINT_SYNC_ENV.PROTOCOL_ALLOWLIST]: 'postgresql,websocket',
        [ENDPOINT_SYNC_ENV.SERVICE_ID_ALLOWLIST]: 'sys-postgres-wire,sys-admin-meta',
        [ENDPOINT_SYNC_ENV.HEALTHY_ONLY]: 'false',
        [ENDPOINT_SYNC_ENV.STRICT_PORT_MODE]: 'false',
        [ENDPOINT_SYNC_ENV.UNHEALTHY_POLICY]: ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
        [ENDPOINT_SYNC_ENV.MAX_ENDPOINTS_PER_SLICE]: '50',
        [ENDPOINT_SYNC_ENV.SERVICE_NAME_PREFIX]: 'edge',
        [ENDPOINT_SYNC_ENV.LEADER_ELECTION_ENABLED]: 'false',
        [ENDPOINT_SYNC_ENV.LEASE_NAME]: 'lease-x',
        [ENDPOINT_SYNC_ENV.LEASE_NAMESPACE]: 'kube-system',
        [ENDPOINT_SYNC_ENV.METRICS_ENABLED]: 'false',
      });

      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
      assert.equal(result.config.adminAuthToken, 'token-123');
      assert.equal(result.config.intervalMs, 9000);
      assert.deepEqual(
        result.config.protocolAllowlist,
        ['postgresql', 'websocket'],
      );
      assert.deepEqual(
        result.config.serviceIdAllowlist,
        ['sys-postgres-wire', 'sys-admin-meta'],
      );
      assert.equal(result.config.healthyOnly, false);
      assert.equal(result.config.strictPortMode, false);
      assert.equal(
        result.config.unhealthyPolicy,
        ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
      );
      assert.equal(result.config.maxEndpointsPerSlice, 50);
      assert.equal(result.config.serviceNamePrefix, 'edge');
      assert.equal(result.config.leaderElectionEnabled, false);
      assert.equal(result.config.leaseName, 'lease-x');
      assert.equal(result.config.leaseNamespace, 'kube-system');
      assert.equal(result.config.metricsEnabled, false);
    });

    it('fails when URL is missing', () => {
      const result = buildEndpointSyncConfig({});

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((err) =>
        err.includes('ENDPOINT_SYNC_ADMIN_STREAM_URL')));
    });

    it('fails for invalid URL scheme', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]: 'http://127.0.0.1:8081',
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((err) => err.includes('ws://')));
    });

    it('fails for invalid unhealthy policy', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]:
          'ws://127.0.0.1:8081/api/admin/stream',
        [ENDPOINT_SYNC_ENV.UNHEALTHY_POLICY]: 'invalid',
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((err) =>
        err.includes('ENDPOINT_SYNC_UNHEALTHY_POLICY')));
    });

    it('fails for invalid integers and booleans', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]:
          'ws://127.0.0.1:8081/api/admin/stream',
        [ENDPOINT_SYNC_ENV.INTERVAL_MS]: '0',
        [ENDPOINT_SYNC_ENV.HEALTHY_ONLY]: 'invalid',
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((err) =>
        err.includes(ENDPOINT_SYNC_ENV.INTERVAL_MS)));
      assert.ok(result.errors.some((err) =>
        err.includes(ENDPOINT_SYNC_ENV.HEALTHY_ONLY)));
    });

    it('fails when protocol allowlist is explicitly empty', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]:
          'ws://127.0.0.1:8081/api/admin/stream',
        [ENDPOINT_SYNC_ENV.PROTOCOL_ALLOWLIST]: ', ,',
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((err) =>
        err.includes('PROTOCOL_ALLOWLIST')));
    });

    it('fails when lease name is empty', () => {
      const result = buildEndpointSyncConfig({
        [ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL]:
          'ws://127.0.0.1:8081/api/admin/stream',
        [ENDPOINT_SYNC_ENV.LEASE_NAME]: '   ',
      });

      assert.equal(result.valid, false);
      assert.ok(result.errors.some((err) =>
        err.includes('LEASE_NAME')));
    });
  });
});
