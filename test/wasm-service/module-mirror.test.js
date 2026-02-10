import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';

describe('ModuleMirror', () => {
  describe('hasModule', () => {
    it('returns false for uncached module', () => {
      const mirror = new ModuleMirror();
      assert.equal(mirror.hasModule('fn-1', 'v1'), false);
    });

    it('returns true after module is cached', async () => {
      const mirror = new ModuleMirror();
      await mirror.pullModule('fn-1', 'v1', 'node-2');
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);
    });

    it('returns false for wrong version', async () => {
      const mirror = new ModuleMirror();
      await mirror.pullModule('fn-1', 'v1', 'node-2');
      assert.equal(mirror.hasModule('fn-1', 'v2'), false);
    });
  });

  describe('getModule', () => {
    it('returns null for uncached module', () => {
      const mirror = new ModuleMirror();
      assert.equal(mirror.getModule('fn-1'), null);
    });

    it('returns cached module data', async () => {
      const mirror = new ModuleMirror();
      await mirror.pullModule('fn-1', 'v1', 'node-2');
      const result = mirror.getModule('fn-1');
      assert.notEqual(result, null);
      assert.equal(result.version, 'v1');
      assert.ok(Buffer.isBuffer(result.wasmBytes));
    });
  });

  describe('pullModule', () => {
    it('stores module in cache', async () => {
      const mirror = new ModuleMirror();
      await mirror.pullModule('fn-1', 'v1', 'node-2');
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);
      const entry = mirror.getModule('fn-1');
      assert.equal(entry.version, 'v1');
      assert.ok(Buffer.isBuffer(entry.wasmBytes));
    });
  });

  describe('onCodeUpdate', () => {
    it('removes stale version from cache', async () => {
      const mirror = new ModuleMirror();
      await mirror.pullModule('fn-1', 'v1', 'node-2');
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);

      mirror.onCodeUpdate('fn-1', 'v2');
      assert.equal(mirror.getModule('fn-1'), null);
    });

    it('is no-op when version matches', async () => {
      const mirror = new ModuleMirror();
      await mirror.pullModule('fn-1', 'v1', 'node-2');

      mirror.onCodeUpdate('fn-1', 'v1');
      assert.notEqual(mirror.getModule('fn-1'), null);
      assert.equal(mirror.hasModule('fn-1', 'v1'), true);
    });

    it('is no-op when module is not cached', () => {
      const mirror = new ModuleMirror();
      mirror.onCodeUpdate('fn-1', 'v1');
      assert.equal(mirror.getModule('fn-1'), null);
    });
  });
});
