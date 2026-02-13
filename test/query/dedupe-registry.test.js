import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DedupeRegistry,
  buildDedupeKey,
} from '../../src/query/dedupe-registry.js';
import {
  DEDUPE_KEY_SEPARATOR,
} from '../../src/query/guardrail-constants.js';

describe('DedupeRegistry', () => {
  it('should start empty', () => {
    const reg = new DedupeRegistry();
    assert.equal(reg.size(), 0);
  });

  it('should register and detect duplicates', () => {
    const reg = new DedupeRegistry();
    reg.register('lid-1', 'stage-0', {rows: 10});
    assert.equal(reg.isDuplicate('lid-1', 'stage-0'), true);
    assert.equal(reg.isDuplicate('lid-2', 'stage-0'), false);
  });

  it('should return stored result', () => {
    const reg = new DedupeRegistry();
    const result = {rows: [1, 2, 3]};
    reg.register('lid-3', 'stage-1', result);
    assert.deepEqual(
      reg.getResult('lid-3', 'stage-1'), result,
    );
  });

  it('should return null for unknown lineage', () => {
    const reg = new DedupeRegistry();
    assert.equal(reg.getResult('unknown', '0'), null);
  });

  it('should track size correctly', () => {
    const reg = new DedupeRegistry();
    reg.register('a', '0', 1);
    reg.register('b', '0', 2);
    assert.equal(reg.size(), 2);
  });

  it('should clear all entries', () => {
    const reg = new DedupeRegistry();
    reg.register('a', '0', 1);
    reg.register('b', '1', 2);
    reg.clear();
    assert.equal(reg.size(), 0);
    assert.equal(reg.isDuplicate('a', '0'), false);
  });

  it('should overwrite on re-register', () => {
    const reg = new DedupeRegistry();
    reg.register('lid-4', '0', 'first');
    reg.register('lid-4', '0', 'second');
    assert.equal(reg.getResult('lid-4', '0'), 'second');
    assert.equal(reg.size(), 1);
  });

  it('should distinguish same lineage with different '
    + 'stage ids', () => {
    const reg = new DedupeRegistry();
    reg.register('lid-5', '0', 'result-stage-0');
    reg.register('lid-5', '1', 'result-stage-1');
    assert.equal(reg.size(), 2);
    assert.equal(
      reg.getResult('lid-5', '0'), 'result-stage-0',
    );
    assert.equal(
      reg.getResult('lid-5', '1'), 'result-stage-1',
    );
    assert.equal(reg.isDuplicate('lid-5', '2'), false);
  });

  it('should distinguish same stage with different '
    + 'lineage ids', () => {
    const reg = new DedupeRegistry();
    reg.register('lid-a', '0', 'result-a');
    reg.register('lid-b', '0', 'result-b');
    assert.equal(reg.size(), 2);
    assert.equal(reg.getResult('lid-a', '0'), 'result-a');
    assert.equal(reg.getResult('lid-b', '0'), 'result-b');
  });
});

describe('buildDedupeKey', () => {
  it('should join lineage and stage with separator', () => {
    const key = buildDedupeKey('lid-1', 'stage-0');
    assert.equal(
      key, `lid-1${DEDUPE_KEY_SEPARATOR}stage-0`,
    );
  });

  it('should handle numeric stage ids', () => {
    const key = buildDedupeKey('lid-1', 3);
    assert.equal(
      key, `lid-1${DEDUPE_KEY_SEPARATOR}3`,
    );
  });
});
