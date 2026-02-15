import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  HostImportRegistry,
  createHostImportRegistry,
  shouldInjectDebugCapability,
} from '../../src/debug-runtime/host-import-registry.js';
import {
  DEBUG_CAPABILITY,
  HOST_IMPORT_NAMESPACE,
} from '../../src/debug-runtime/debug-runtime-constants.js';

describe('HostImportRegistry', () => {
  it('returns base imports unchanged when no capability imports registered',
    () => {
      const registry = new HostImportRegistry({
        baseImports: {
          [HOST_IMPORT_NAMESPACE.ENV]: {clock: () => 1},
        },
      });
      const imports = registry.buildImports({});
      assert.equal(typeof imports.env.clock, 'function');
      assert.equal(imports.env.clock(), 1);
    });

  it('injects debug imports only when declared + allowed + active session',
    () => {
      const registry = createHostImportRegistry();
      registry.registerCapabilityImport(
        DEBUG_CAPABILITY.TRACE,
        HOST_IMPORT_NAMESPACE.DEBUG,
        {trace: () => 'ok'},
      );

      const inactive = registry.buildImports({
        declaredCapabilities: [DEBUG_CAPABILITY.TRACE],
        allowedCapabilities: [DEBUG_CAPABILITY.TRACE],
        sessionActive: false,
      });
      assert.equal(inactive.debug, undefined);

      const denied = registry.buildImports({
        declaredCapabilities: [DEBUG_CAPABILITY.TRACE],
        allowedCapabilities: [],
        sessionActive: true,
      });
      assert.equal(denied.debug, undefined);

      const active = registry.buildImports({
        declaredCapabilities: [DEBUG_CAPABILITY.TRACE],
        allowedCapabilities: [DEBUG_CAPABILITY.TRACE],
        sessionActive: true,
      });
      assert.equal(typeof active.debug.trace, 'function');
      assert.equal(active.debug.trace(), 'ok');
    });

  it('injects non-debug capability imports without session requirement',
    () => {
      const registry = createHostImportRegistry();
      registry.registerCapabilityImport(
        'sql.read',
        HOST_IMPORT_NAMESPACE.DB,
        {read: () => 'rows'},
      );
      const imports = registry.buildImports({
        declaredCapabilities: ['sql.read'],
        allowedCapabilities: ['sql.read'],
        sessionActive: false,
      });
      assert.equal(typeof imports.db.read, 'function');
      assert.equal(imports.db.read(), 'rows');
    });

  it('shouldInjectDebugCapability enforces declared + allowed + session',
    () => {
      const base = {
        declared: new Set([DEBUG_CAPABILITY.TRACE]),
        allowed: new Set([DEBUG_CAPABILITY.TRACE]),
      };
      assert.equal(shouldInjectDebugCapability(
        DEBUG_CAPABILITY.TRACE,
        {...base, sessionActive: true},
      ), true);
      assert.equal(shouldInjectDebugCapability(
        DEBUG_CAPABILITY.TRACE,
        {...base, sessionActive: false},
      ), false);
      assert.equal(shouldInjectDebugCapability(
        DEBUG_CAPABILITY.TRACE,
        {
          declared: new Set(),
          allowed: new Set([DEBUG_CAPABILITY.TRACE]),
          sessionActive: true,
        },
      ), false);
    });
});
