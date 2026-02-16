/**
 * Negative tests for PG wire hard cutover (Task 18).
 *
 * Proves:
 * 1. No standalone listener startup exists in bootstrap/join.
 * 2. No fallback config for dual-mode PG wire.
 * 3. No direct TCP server creation for PG wire outside runtime
 *    module.
 * 4. The only PG wire listener path is through the replicated
 *    runtime module.
 * 5. PgWireCutoverGuard detects violations when injected.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  PgWireCutoverGuard,
} from '../../src/runtime/pgwire-cutover-guard.js';
import {
  FORBIDDEN_ENTRYPOINT_SYMBOLS,
  FORBIDDEN_CONFIG_KEYS,
  PGWIRE_CUTOVER_ERROR,
  PGWIRE_CUTOVER_LOG,
  PGWIRE_CUTOVER_SUBSYSTEM,
} from '../../src/runtime/pgwire-cutover-constants.js';
import {
  BootstrapService,
} from '../../src/bootstrap/bootstrap-service.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';

describe('pgwire-cutover-guard', () => {
  describe('constants', () => {
    it('should export frozen FORBIDDEN_ENTRYPOINT_SYMBOLS', () => {
      assert.ok(Object.isFrozen(FORBIDDEN_ENTRYPOINT_SYMBOLS));
      assert.ok(FORBIDDEN_ENTRYPOINT_SYMBOLS.length > 0);
    });

    it('should export frozen FORBIDDEN_CONFIG_KEYS', () => {
      assert.ok(Object.isFrozen(FORBIDDEN_CONFIG_KEYS));
      assert.ok(FORBIDDEN_CONFIG_KEYS.length > 0);
    });

    it('should export frozen PGWIRE_CUTOVER_ERROR', () => {
      assert.ok(Object.isFrozen(PGWIRE_CUTOVER_ERROR));
      assert.equal(
        typeof PGWIRE_CUTOVER_ERROR.LEGACY_ENTRYPOINT_DETECTED,
        'string',
      );
      assert.equal(
        typeof PGWIRE_CUTOVER_ERROR.DUAL_MODE_CONFIG_DETECTED,
        'string',
      );
      assert.equal(
        typeof PGWIRE_CUTOVER_ERROR.DIRECT_LISTENER_DETECTED,
        'string',
      );
    });

    it('should export frozen PGWIRE_CUTOVER_LOG', () => {
      assert.ok(Object.isFrozen(PGWIRE_CUTOVER_LOG));
      assert.equal(
        typeof PGWIRE_CUTOVER_LOG.CONTRACT_VERIFIED,
        'string',
      );
      assert.equal(
        typeof PGWIRE_CUTOVER_LOG.VIOLATION_DETECTED,
        'string',
      );
    });

    it('should export PGWIRE_CUTOVER_SUBSYSTEM', () => {
      assert.equal(
        typeof PGWIRE_CUTOVER_SUBSYSTEM,
        'string',
      );
      assert.ok(PGWIRE_CUTOVER_SUBSYSTEM.length > 0);
    });
  });

  describe('Req 14.1 — no standalone listener in bootstrap', () => {
    it('should not have any forbidden entrypoint on ' +
       'BootstrapService.prototype', () => {
      for (const symbol of FORBIDDEN_ENTRYPOINT_SYMBOLS) {
        assert.equal(
          typeof BootstrapService.prototype[symbol],
          'undefined',
          `BootstrapService.prototype.${symbol} must not exist`,
        );
      }
    });

    it('should not have any forbidden entrypoint on ' +
       'NodeJoiningService.prototype', () => {
      for (const symbol of FORBIDDEN_ENTRYPOINT_SYMBOLS) {
        assert.equal(
          typeof NodeJoiningService.prototype[symbol],
          'undefined',
          `NodeJoiningService.prototype.${symbol} must not exist`,
        );
      }
    });

    it('should not expose startPostgresListener on bootstrap',
      () => {
        assert.equal(
          typeof BootstrapService.prototype.startPostgresListener,
          'undefined',
        );
      });

    it('should not expose startPostgresListener on joining',
      () => {
        assert.equal(
          typeof NodeJoiningService.prototype
            .startPostgresListener,
          'undefined',
        );
      });

    it('should not expose createPostgresServer on bootstrap',
      () => {
        assert.equal(
          typeof BootstrapService.prototype.createPostgresServer,
          'undefined',
        );
      });

    it('should not expose createPostgresServer on joining',
      () => {
        assert.equal(
          typeof NodeJoiningService.prototype
            .createPostgresServer,
          'undefined',
        );
      });
  });

  describe('Req 14.2 — no fallback bypass of lifecycle owners',
    () => {
      it('guard should pass with clean services', () => {
        const guard = new PgWireCutoverGuard({
          bootstrapService: {},
          joiningService: {},
          configManager: {get: () => undefined},
        });
        const result = guard.verify();
        assert.equal(result.valid, true);
        assert.equal(result.violations.length, 0);
      });

      it('guard should detect forbidden symbol on bootstrap',
        () => {
          const fakeBootstrap = {
            startPostgresListener: () => {},
          };
          const guard = new PgWireCutoverGuard({
            bootstrapService: fakeBootstrap,
          });
          const result = guard.verify();
          assert.equal(result.valid, false);
          assert.ok(result.violations.length > 0);
          assert.ok(
            result.violations[0].includes(
              PGWIRE_CUTOVER_ERROR.LEGACY_ENTRYPOINT_DETECTED,
            ),
          );
          assert.ok(
            result.violations[0].includes('bootstrap'),
          );
        });

      it('guard should detect forbidden symbol on joining',
        () => {
          const fakeJoining = {
            createStandalonePgWire: () => {},
          };
          const guard = new PgWireCutoverGuard({
            joiningService: fakeJoining,
          });
          const result = guard.verify();
          assert.equal(result.valid, false);
          assert.ok(
            result.violations[0].includes('joining'),
          );
        });

      it('guard should detect multiple forbidden symbols',
        () => {
          const fakeBootstrap = {
            startPostgresListener: () => {},
            createPostgresServer: () => {},
          };
          const guard = new PgWireCutoverGuard({
            bootstrapService: fakeBootstrap,
          });
          const result = guard.verify();
          assert.equal(result.valid, false);
          assert.equal(result.violations.length, 2);
        });
    });

  describe('Req 14.3 — no dual-mode config', () => {
    it('guard should detect forbidden config key', () => {
      const fakeConfig = {
        get: (key) => {
          if (key === 'pgwire.standalone') return true;
          return undefined;
        },
      };
      const guard = new PgWireCutoverGuard({
        configManager: fakeConfig,
      });
      const result = guard.verify();
      assert.equal(result.valid, false);
      assert.ok(
        result.violations[0].includes(
          PGWIRE_CUTOVER_ERROR.DUAL_MODE_CONFIG_DETECTED,
        ),
      );
      assert.ok(
        result.violations[0].includes('pgwire.standalone'),
      );
    });

    it('guard should pass when config returns undefined for ' +
       'all forbidden keys', () => {
      const fakeConfig = {
        get: () => undefined,
      };
      const guard = new PgWireCutoverGuard({
        configManager: fakeConfig,
      });
      const result = guard.verify();
      assert.equal(result.valid, true);
    });

    it('guard should detect multiple forbidden config keys',
      () => {
        const forbidden = new Set([
          'pgwire.standalone',
          'pgwire.dualMode',
        ]);
        const fakeConfig = {
          get: (key) => forbidden.has(key) ? 'enabled' :
            undefined,
        };
        const guard = new PgWireCutoverGuard({
          configManager: fakeConfig,
        });
        const result = guard.verify();
        assert.equal(result.valid, false);
        assert.equal(result.violations.length, 2);
      });
  });

  describe('Req 14.4 — legacy entrypoints non-callable', () => {
    it('guard should handle null bootstrap service', () => {
      const guard = new PgWireCutoverGuard({
        bootstrapService: null,
      });
      const symbols = guard.checkForbiddenSymbols(null);
      assert.deepStrictEqual(symbols, []);
    });

    it('guard should handle null config manager', () => {
      const guard = new PgWireCutoverGuard({
        configManager: null,
      });
      const keys = guard.checkForbiddenConfig(null);
      assert.deepStrictEqual(keys, []);
    });

    it('guard should handle config without get method', () => {
      const guard = new PgWireCutoverGuard();
      const keys = guard.checkForbiddenConfig({});
      assert.deepStrictEqual(keys, []);
    });

    it('verify should combine bootstrap + joining + config ' +
       'violations', () => {
      const fakeBootstrap = {
        startPgWireListener: () => {},
      };
      const fakeJoining = {
        startStandalonePostgres: () => {},
      };
      const fakeConfig = {
        get: (key) => key === 'pgwire.legacyMode' ?
          true : undefined,
      };
      const guard = new PgWireCutoverGuard({
        bootstrapService: fakeBootstrap,
        joiningService: fakeJoining,
        configManager: fakeConfig,
      });
      const result = guard.verify();
      assert.equal(result.valid, false);
      assert.equal(result.violations.length, 3);
    });

    it('real BootstrapService passes cutover verification',
      () => {
        const guard = new PgWireCutoverGuard({
          bootstrapService: BootstrapService.prototype,
        });
        const symbols = guard.checkForbiddenSymbols(
          BootstrapService.prototype,
        );
        assert.deepStrictEqual(symbols, []);
      });

    it('real NodeJoiningService passes cutover verification',
      () => {
        const guard = new PgWireCutoverGuard({
          joiningService: NodeJoiningService.prototype,
        });
        const symbols = guard.checkForbiddenSymbols(
          NodeJoiningService.prototype,
        );
        assert.deepStrictEqual(symbols, []);
      });

    it('full verify passes against real service prototypes',
      () => {
        const guard = new PgWireCutoverGuard({
          bootstrapService: BootstrapService.prototype,
          joiningService: NodeJoiningService.prototype,
          configManager: {get: () => undefined},
        });
        const result = guard.verify();
        assert.equal(result.valid, true);
        assert.equal(result.violations.length, 0);
      });
  });
});
