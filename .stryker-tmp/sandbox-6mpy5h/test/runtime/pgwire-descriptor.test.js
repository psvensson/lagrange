/**
 * Unit tests for PG wire runtime descriptor validation.
 *
 * Validates: Requirements 2.4, 7.1, 10.1
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import {
  PGWIRE_CONFIG_FIELD,
  PGWIRE_AUTH_MODE,
  ALLOWED_AUTH_MODES,
  PGWIRE_TLS_MODE,
  ALLOWED_TLS_MODES,
  PGWIRE_DESCRIPTOR_ERROR,
  validatePgwireRuntimeConfig,
  isPgwireRuntimeRef,
} from '../../src/runtime/pgwire-descriptor.js';
import {
  validateRuntimeDescriptor,
} from '../../src/wasm-service/runtime-descriptor-validator.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {META_SERVICE_RUNTIME_REF} from '../../src/constants/wasm-meta.js';

describe('pgwire-descriptor', () => {
  describe('constants', () => {
    it('should export frozen PGWIRE_CONFIG_FIELD', () => {
      assert.ok(Object.isFrozen(PGWIRE_CONFIG_FIELD));
      assert.equal(PGWIRE_CONFIG_FIELD.HOST, 'host');
      assert.equal(PGWIRE_CONFIG_FIELD.PORT, 'port');
      assert.equal(
        PGWIRE_CONFIG_FIELD.PORT_RANGE_START, 'portRangeStart',
      );
      assert.equal(
        PGWIRE_CONFIG_FIELD.PORT_RANGE_END, 'portRangeEnd',
      );
      assert.equal(
        PGWIRE_CONFIG_FIELD.MAX_SESSIONS, 'maxSessions',
      );
      assert.equal(PGWIRE_CONFIG_FIELD.AUTH_MODE, 'authMode');
      assert.equal(PGWIRE_CONFIG_FIELD.TLS_MODE, 'tlsMode');
    });

    it('should export frozen PGWIRE_AUTH_MODE', () => {
      assert.ok(Object.isFrozen(PGWIRE_AUTH_MODE));
      assert.equal(PGWIRE_AUTH_MODE.TRUST, 'trust');
      assert.equal(PGWIRE_AUTH_MODE.PASSWORD, 'password');
      assert.equal(
        PGWIRE_AUTH_MODE.SCRAM_SHA_256, 'scram-sha-256',
      );
    });

    it('should have ALLOWED_AUTH_MODES matching enum', () => {
      assert.equal(ALLOWED_AUTH_MODES.size, 3);
      for (const mode of Object.values(PGWIRE_AUTH_MODE)) {
        assert.ok(ALLOWED_AUTH_MODES.has(mode));
      }
    });

    it('should export frozen PGWIRE_TLS_MODE', () => {
      assert.ok(Object.isFrozen(PGWIRE_TLS_MODE));
      assert.equal(PGWIRE_TLS_MODE.DISABLE, 'disable');
      assert.equal(PGWIRE_TLS_MODE.PREFER, 'prefer');
      assert.equal(PGWIRE_TLS_MODE.REQUIRE, 'require');
    });

    it('should have ALLOWED_TLS_MODES matching enum', () => {
      assert.equal(ALLOWED_TLS_MODES.size, 3);
      for (const mode of Object.values(PGWIRE_TLS_MODE)) {
        assert.ok(ALLOWED_TLS_MODES.has(mode));
      }
    });

    it('should export frozen PGWIRE_DESCRIPTOR_ERROR', () => {
      assert.ok(Object.isFrozen(PGWIRE_DESCRIPTOR_ERROR));
    });
  });

  describe('isPgwireRuntimeRef', () => {
    it('should return true for postgres-wire-runtime', () => {
      assert.equal(
        isPgwireRuntimeRef(META_SERVICE_RUNTIME_REF.POSTGRES_WIRE),
        true,
      );
    });

    it('should return false for other refs', () => {
      assert.equal(isPgwireRuntimeRef('admin-handler'), false);
      assert.equal(isPgwireRuntimeRef(null), false);
      assert.equal(isPgwireRuntimeRef(undefined), false);
    });
  });

  describe('validatePgwireRuntimeConfig', () => {
    it('should accept null config (optional)', () => {
      const result = validatePgwireRuntimeConfig(null);
      assert.equal(result.valid, true);
    });

    it('should accept undefined config (optional)', () => {
      const result = validatePgwireRuntimeConfig(undefined);
      assert.equal(result.valid, true);
    });

    it('should accept empty JSON object', () => {
      const result = validatePgwireRuntimeConfig('{}');
      assert.equal(result.valid, true);
    });

    it('should accept valid full config', () => {
      const cfg = JSON.stringify({
        host: '0.0.0.0',
        port: 5432,
        portRangeStart: 30000,
        portRangeEnd: 39999,
        maxSessions: 100,
        authMode: 'scram-sha-256',
        tlsMode: 'prefer',
      });
      const result = validatePgwireRuntimeConfig(cfg);
      assert.equal(result.valid, true);
      assert.ok(result.config);
      assert.equal(result.config.port, 5432);
    });

    it('should reject non-string config', () => {
      const result = validatePgwireRuntimeConfig(42);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        PGWIRE_DESCRIPTOR_ERROR.CONFIG_NOT_STRING,
      ));
    });

    it('should reject invalid JSON', () => {
      const result = validatePgwireRuntimeConfig('{bad}');
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        PGWIRE_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON,
      ));
    });

    describe('host validation', () => {
      it('should accept valid host string', () => {
        const cfg = JSON.stringify({host: '127.0.0.1'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should reject non-string host', () => {
        const cfg = JSON.stringify({host: 123});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.HOST_NOT_STRING,
        ));
      });

      it('should reject empty host', () => {
        const cfg = JSON.stringify({host: ''});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.HOST_EMPTY,
        ));
      });

      it('should reject whitespace-only host', () => {
        const cfg = JSON.stringify({host: '   '});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.HOST_EMPTY,
        ));
      });
    });

    describe('port validation', () => {
      it('should accept valid port', () => {
        const cfg = JSON.stringify({port: 5432});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept port 1 (min)', () => {
        const cfg = JSON.stringify({port: 1});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept port 65535 (max)', () => {
        const cfg = JSON.stringify({port: 65535});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should reject zero port', () => {
        const cfg = JSON.stringify({port: 0});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
        ));
      });

      it('should reject negative port', () => {
        const cfg = JSON.stringify({port: -1});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
        ));
      });

      it('should reject non-integer port', () => {
        const cfg = JSON.stringify({port: 5432.5});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
        ));
      });

      it('should reject string port', () => {
        const cfg = JSON.stringify({port: '5432'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
        ));
      });
    });

    describe('port range validation', () => {
      it('should accept valid port range', () => {
        const cfg = JSON.stringify({
          portRangeStart: 30000,
          portRangeEnd: 39999,
        });
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept equal start and end', () => {
        const cfg = JSON.stringify({
          portRangeStart: 5432,
          portRangeEnd: 5432,
        });
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should reject inverted range', () => {
        const cfg = JSON.stringify({
          portRangeStart: 40000,
          portRangeEnd: 30000,
        });
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_INVERTED,
        ));
      });

      it('should reject non-integer portRangeStart', () => {
        const cfg = JSON.stringify({portRangeStart: 'abc'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER,
        ));
      });

      it('should reject non-integer portRangeEnd', () => {
        const cfg = JSON.stringify({portRangeEnd: 1.5});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER,
        ));
      });
    });

    describe('maxSessions validation', () => {
      it('should accept valid maxSessions', () => {
        const cfg = JSON.stringify({maxSessions: 100});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should reject zero maxSessions', () => {
        const cfg = JSON.stringify({maxSessions: 0});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.MAX_SESSIONS_NOT_INTEGER,
        ));
      });

      it('should reject non-integer maxSessions', () => {
        const cfg = JSON.stringify({maxSessions: 10.5});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.MAX_SESSIONS_NOT_INTEGER,
        ));
      });
    });

    describe('authMode validation', () => {
      it('should accept trust', () => {
        const cfg = JSON.stringify({authMode: 'trust'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept password', () => {
        const cfg = JSON.stringify({authMode: 'password'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept scram-sha-256', () => {
        const cfg = JSON.stringify({authMode: 'scram-sha-256'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should reject invalid authMode', () => {
        const cfg = JSON.stringify({authMode: 'md5'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_INVALID,
        ));
      });
    });

    describe('tlsMode validation', () => {
      it('should accept disable', () => {
        const cfg = JSON.stringify({tlsMode: 'disable'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept prefer', () => {
        const cfg = JSON.stringify({tlsMode: 'prefer'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should accept require', () => {
        const cfg = JSON.stringify({tlsMode: 'require'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, true);
      });

      it('should reject invalid tlsMode', () => {
        const cfg = JSON.stringify({tlsMode: 'verify-full'});
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          PGWIRE_DESCRIPTOR_ERROR.TLS_MODE_INVALID,
        ));
      });
    });

    describe('multiple errors', () => {
      it('should collect errors from multiple fields', () => {
        const cfg = JSON.stringify({
          host: 123,
          port: -1,
          authMode: 'bad',
          tlsMode: 'bad',
        });
        const result = validatePgwireRuntimeConfig(cfg);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length >= 4);
      });
    });
  });

  describe('integration with validateRuntimeDescriptor', () => {
    it('should accept pgwire descriptor with valid config', () => {
      const cfg = JSON.stringify({
        host: '0.0.0.0',
        port: 5432,
        authMode: 'scram-sha-256',
      });
      const result = validateRuntimeDescriptor({
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
        runtimeConfig: cfg,
      });
      assert.equal(result.valid, true);
    });

    it('should accept pgwire descriptor with null config', () => {
      const result = validateRuntimeDescriptor({
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
        runtimeConfig: null,
      });
      assert.equal(result.valid, true);
    });

    it('should reject pgwire descriptor with invalid config', () => {
      const cfg = JSON.stringify({
        port: -1,
        authMode: 'bad',
      });
      const result = validateRuntimeDescriptor({
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
        runtimeConfig: cfg,
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER,
      ));
      assert.ok(result.errors.includes(
        PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_INVALID,
      ));
    });

    it('should not run pgwire validation for other refs', () => {
      const cfg = JSON.stringify({port: -1});
      const result = validateRuntimeDescriptor({
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: 'admin-handler',
        runtimeConfig: cfg,
      });
      // Generic config validation passes (valid JSON).
      assert.equal(result.valid, true);
    });

    it('should fail closed on invalid JSON before pgwire check',
      () => {
        const result = validateRuntimeDescriptor({
          runtimeKind: RUNTIME_KIND.NATIVE_JS,
          runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
          runtimeConfig: '{bad}',
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.length >= 1);
      });
  });

  describe('property-based: port validation', () => {
    it('should reject ports outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({min: -1000, max: 0}),
            fc.integer({min: 65536, max: 100000}),
          ),
          (port) => {
            const cfg = JSON.stringify({port});
            const result = validatePgwireRuntimeConfig(cfg);
            assert.equal(result.valid, false);
          },
        ),
        {numRuns: 10},
      );
    });

    it('should accept ports within valid range', () => {
      fc.assert(
        fc.property(
          fc.integer({min: 1, max: 65535}),
          (port) => {
            const cfg = JSON.stringify({port});
            const result = validatePgwireRuntimeConfig(cfg);
            assert.equal(result.valid, true);
          },
        ),
        {numRuns: 10},
      );
    });
  });
});
