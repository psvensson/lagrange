// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DwarfIndexCache} from '../../src/debug-runtime/dwarf-index-cache.js';
import {
  DWARF_INDEX_ERROR_MSG as ERR,
} from '../../src/debug-runtime/dwarf-index-constants.js';

describe('DwarfIndexCache', () => {
  it('stores and reads cached indexes', () => {
    const cache = new DwarfIndexCache({maxEntries: 2});
    const index = {moduleRef: 'a'};
    cache.set('k1', index);

    assert.equal(cache.has('k1'), true);
    assert.equal(cache.get('k1'), index);
    assert.equal(cache.size(), 1);
  });

  it('evicts least-recently used entries', () => {
    const cache = new DwarfIndexCache({maxEntries: 2});
    cache.set('k1', {id: 1});
    cache.set('k2', {id: 2});
    cache.get('k1');
    cache.set('k3', {id: 3});

    assert.equal(cache.has('k1'), true);
    assert.equal(cache.has('k2'), false);
    assert.equal(cache.has('k3'), true);
  });

  it('deduplicates concurrent getOrCreate calls', async () => {
    const cache = new DwarfIndexCache({maxEntries: 2});
    let createCalls = 0;
    const createFn = async () => {
      createCalls += 1;
      return {value: 'built'};
    };

    const [a, b] = await Promise.all([
      cache.getOrCreate('shared', createFn),
      cache.getOrCreate('shared', createFn),
    ]);

    assert.equal(createCalls, 1);
    assert.equal(a.value, 'built');
    assert.equal(b.value, 'built');
  });

  it('validates cache constructor and API arguments', async () => {
    assert.throws(
      () => new DwarfIndexCache({maxEntries: 0}),
      (err) => err.message === ERR.CACHE_MAX_ENTRIES_INVALID,
    );

    const cache = new DwarfIndexCache({maxEntries: 1});
    assert.throws(
      () => cache.set('', {}),
      (err) => err.message === ERR.CACHE_KEY_REQUIRED,
    );
    await assert.rejects(
      () => cache.getOrCreate('ok', null),
      (err) => err.message === ERR.CREATE_FN_REQUIRED,
    );
  });
});
