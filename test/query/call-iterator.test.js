/**
 * Unit tests for createCallIterator.
 *
 * Requirements: 5.1
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  createCallIterator,
} from '../../src/query/call-iterator.js';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';

describe('createCallIterator', () => {
  it('should yield all rows in order', async () => {
    const rows = [{a: 1}, {a: 2}, {a: 3}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const iter = createCallIterator(
      'SELECT 1', [], executor, token,
    );
    const collected = [];
    for await (const row of iter) {
      collected.push(row);
    }
    assert.deepEqual(collected, rows);
  });

  it('should return done after exhaustion', async () => {
    const executor = async () => ({rows: [{x: 1}]});
    const token = new CancellationToken();
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    const first = await iter.next();
    assert.equal(first.done, false);
    assert.deepEqual(first.value, {x: 1});
    const second = await iter.next();
    assert.equal(second.done, true);
    assert.equal(second.value, undefined);
  });

  it('should lazily execute on first next()', async () => {
    let called = false;
    const executor = async () => {
      called = true;
      return {rows: []};
    };
    const token = new CancellationToken();
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    assert.equal(called, false);
    await iter.next();
    assert.equal(called, true);
  });

  it('should pass query and params to executor', async () => {
    let cq;
    let cp;
    const executor = async (q, p) => {
      cq = q;
      cp = p;
      return {rows: []};
    };
    const token = new CancellationToken();
    const iter = createCallIterator(
      'SELECT ?', [99], executor, token,
    );
    await iter.next();
    assert.equal(cq, 'SELECT ?');
    assert.deepEqual(cp, [99]);
  });

  it('should throw on next() when cancelled', async () => {
    const token = new CancellationToken();
    const executor = async () => ({rows: [{v: 1}]});
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    token.cancel('abort');
    await assert.rejects(
      () => iter.next(),
      (err) => err.message === 'abort',
    );
  });

  it('should throw mid-iteration on cancel', async () => {
    const token = new CancellationToken();
    const rows = [{v: 1}, {v: 2}];
    const executor = async () => ({rows});
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    const first = await iter.next();
    assert.equal(first.done, false);
    token.cancel('mid-stop');
    await assert.rejects(
      () => iter.next(),
      (err) => err.message === 'mid-stop',
    );
  });

  it('should handle undefined rows as empty', async () => {
    const executor = async () => ({});
    const token = new CancellationToken();
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    const result = await iter.next();
    assert.equal(result.done, true);
  });

  it('return() should mark iterator as done', async () => {
    const rows = [{v: 1}, {v: 2}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    await iter.next();
    const ret = await iter.return();
    assert.equal(ret.done, true);
    const after = await iter.next();
    assert.equal(after.done, true);
  });

  it('throw() should mark iterator as done', async () => {
    const executor = async () => ({rows: [{v: 1}]});
    const token = new CancellationToken();
    const iter = createCallIterator(
      'q', [], executor, token,
    );
    await assert.rejects(
      () => iter.throw(new Error('err')),
      (err) => err.message === 'err',
    );
    // Cancellation check still runs first, but exhausted
    // flag means done=true if not cancelled.
    const after = await iter.next();
    assert.equal(after.done, true);
  });

  describe('property: yields exactly N rows', () => {
    /**
     * **Validates: Requirements 5.1**
     *
     * For any array of rows, the iterator yields exactly
     * that many values and then reports done.
     */
    it('row count matches input length', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({id: fc.integer()}), {
            maxLength: 20,
          }),
          async (rows) => {
            const executor = async () => ({rows});
            const token = new CancellationToken();
            const iter = createCallIterator(
              'q', [], executor, token,
            );
            let count = 0;
            for await (const _row of iter) {
              count++;
            }
            return count === rows.length;
          },
        ),
        {numRuns: 10},
      );
    });
  });
});
