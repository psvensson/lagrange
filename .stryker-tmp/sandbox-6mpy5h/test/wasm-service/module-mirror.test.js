// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';

const RUN_EXPORT = 'run';
const DIGEST = 'sha256:' + 'a'.repeat(64);

function createManifest(functionId, version, runExport = RUN_EXPORT) {
  return {
    namespace: 'testns',
    name: functionId,
    version,
    digest: DIGEST,
    runExport,
    exports: [runExport],
    dependencies: [],
    capabilities: [],
  };
}

function createProvider(overrides = {}) {
  return async (functionId, version, _sourceNodeId) => ({
    version,
    wasmBytes: Buffer.from('wasm-bytes'),
    manifest: createManifest(functionId, version),
    exports: {
      [RUN_EXPORT]: (_ctx, args) => args,
    },
    ...overrides,
  });
}

async function cacheModule(mirror, functionId = 'fn-1', version = 'v1') {
  await mirror.pullModule(functionId, version, 'node-2');
}

describe('ModuleMirror', () => {
  describe('hasModule', () => {
    it('returns false for uncached module', () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      assert.equal(mirror.hasModule('fn-1', 'v1'), false);
    });

    it('returns true after module is cached', async () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      await cacheModule(mirror);
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);
    });

    it('returns false for wrong version', async () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      await cacheModule(mirror);
      assert.equal(mirror.hasModule('fn-1', 'v2'), false);
    });
  });

  describe('getModule', () => {
    it('returns null for uncached module', () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      assert.equal(mirror.getModule('fn-1'), null);
    });

    it('returns cached module data', async () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      await cacheModule(mirror);
      const result = mirror.getModule('fn-1');
      assert.notEqual(result, null);
      assert.equal(result.version, 'v1');
      assert.ok(Buffer.isBuffer(result.wasmBytes));
      assert.deepEqual(
        result.manifest,
        createManifest('fn-1', 'v1'),
      );
      assert.equal(typeof result.exports[RUN_EXPORT], 'function');
    });
  });

  describe('pullModule', () => {
    it('requires module provider', async () => {
      const mirror = new ModuleMirror();
      await assert.rejects(
        () => mirror.pullModule('fn-1', 'v1', 'node-2'),
        {message: 'ModuleMirror moduleProvider is required'},
      );
    });

    it('stores module in cache', async () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      await cacheModule(mirror);
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);
      const entry = mirror.getModule('fn-1');
      assert.equal(entry.version, 'v1');
      assert.ok(Buffer.isBuffer(entry.wasmBytes));
    });

    it('rejects payload when runtime manifest validation fails',
      async () => {
        const mirror = new ModuleMirror({
          moduleProvider: createProvider({
            manifest: createManifest(
              'fn-1',
              'v1',
              'missing_run_export',
            ),
          }),
        });

        await assert.rejects(
          () => mirror.pullModule('fn-1', 'v1', 'node-2'),
          (err) => {
            assert.ok(err.message.includes(
              'ModuleMirror runtime manifest validation failed',
            ));
            assert.ok(err.message.includes(
              'run_export not found in WASM module instance exports',
            ));
            return true;
          },
        );
      });

    it('uses configured runtime adapter for manifest validation',
      async () => {
        const calls = [];
        const runtimeAdapter = {
          async createInstance(request) {
            calls.push(['create', request.moduleRef]);
            return {
              instanceHandle: {
                instanceId: 'test-instance',
                moduleRef: request.moduleRef,
              },
            };
          },
          async inspect() {
            calls.push(['inspect']);
            return {exportNames: [RUN_EXPORT]};
          },
          async destroyInstance() {
            calls.push(['destroy']);
            return {destroyed: true};
          },
        };

        const mirror = new ModuleMirror({
          moduleProvider: createProvider(),
          runtimeAdapter,
        });

        await mirror.pullModule('fn-1', 'v1', 'node-2');

        assert.deepEqual(calls, [
          ['create', 'fn-1'],
          ['inspect'],
          ['destroy'],
        ]);
      });
  });

  describe('onCodeUpdate', () => {
    it('removes stale version from cache', async () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      await cacheModule(mirror);
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);

      mirror.onCodeUpdate('fn-1', 'v2');
      assert.equal(mirror.getModule('fn-1'), null);
    });

    it('is no-op when version matches', async () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      await cacheModule(mirror);

      mirror.onCodeUpdate('fn-1', 'v1');
      assert.notEqual(mirror.getModule('fn-1'), null);
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);
    });

    it('invalidates cache when update version is missing',
      async () => {
        const mirror = new ModuleMirror({
          moduleProvider: createProvider(),
        });
        await cacheModule(mirror);

        mirror.onCodeUpdate('fn-1');
        assert.equal(mirror.getModule('fn-1'), null);
      });

    it('is no-op when module is not cached', () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      mirror.onCodeUpdate('fn-1', 'v1');
      assert.equal(mirror.getModule('fn-1'), null);
    });
  });

  describe('bindCdcIntegrationService', () => {
    it('returns false when emitter contract is missing', () => {
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      assert.equal(mirror.bindCdcIntegrationService({}), false);
    });

    it('invalidates cached module on code table update event',
      async () => {
        const cdc = new EventEmitter();
        const mirror = new ModuleMirror({
          moduleProvider: createProvider(),
        });
        mirror.bindCdcIntegrationService(cdc);
        await cacheModule(mirror);
        assert.notEqual(mirror.getModule('fn-1'), null);

        cdc.emit(CDC_EVENT.UPDATE, {
          tableName: 'code',
          data: {function_id: 'fn-1', version: 'v2'},
        });

        assert.equal(mirror.getModule('fn-1'), null);
      });

    it('ignores CDC events for other tables', async () => {
      const cdc = new EventEmitter();
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      mirror.bindCdcIntegrationService(cdc);
      await cacheModule(mirror);

      cdc.emit(CDC_EVENT.UPDATE, {
        tableName: 'services',
        data: {function_id: 'fn-1', version: 'v2'},
      });

      assert.notEqual(mirror.getModule('fn-1'), null);
    });

    it('unbinds listeners and stops invalidation', async () => {
      const cdc = new EventEmitter();
      const mirror = new ModuleMirror({
        moduleProvider: createProvider(),
      });
      mirror.bindCdcIntegrationService(cdc);
      mirror.unbindCdcIntegrationService();
      await cacheModule(mirror);

      cdc.emit(CDC_EVENT.UPDATE, {
        tableName: 'code',
        data: {function_id: 'fn-1', version: 'v2'},
      });

      assert.notEqual(mirror.getModule('fn-1'), null);
    });
  });
});
