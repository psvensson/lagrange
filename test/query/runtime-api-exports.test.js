/**
 * Verification test for v0 runtime API exports from
 * src/query/index.js.
 *
 * Requirements: 4.1, 13.5
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as queryModule from '../../src/query/index.js';

/**
 * Expected v0 runtime API symbol names exported from the
 * query module index.
 * @type {string[]}
 */
const V0_RUNTIME_SYMBOLS = [
  'runtime',
  'run',
  'ExecutionContext',
  'SNAPSHOT_MODE',
  'DEFAULT_SNAPSHOT_MODE',
  'DEFAULT_RUNTIME_SESSION',
  'RUNTIME_ERROR_MSG',
  'RUNTIME_SUBSYSTEM',
];

describe('v0 runtime API exports', () => {
  for (const sym of V0_RUNTIME_SYMBOLS) {
    it(`should export "${sym}"`, () => {
      assert.ok(
        sym in queryModule,
        `Missing export: ${sym}`,
      );
      assert.notEqual(
        queryModule[sym], undefined,
        `Export "${sym}" is undefined`,
      );
    });
  }

  it('runtime should be a frozen object with run', () => {
    assert.equal(typeof queryModule.runtime, 'object');
    assert.equal(
      typeof queryModule.runtime.run, 'function',
    );
    assert.ok(Object.isFrozen(queryModule.runtime));
  });

  it('run should be a function', () => {
    assert.equal(typeof queryModule.run, 'function');
  });

  it('ExecutionContext should be a constructor', () => {
    assert.equal(
      typeof queryModule.ExecutionContext, 'function',
    );
  });

  it('SNAPSHOT_MODE should contain expected modes', () => {
    const modes = queryModule.SNAPSHOT_MODE;
    assert.equal(modes.READ_COMMITTED, 'readCommitted');
    assert.equal(modes.SNAPSHOT, 'snapshot');
    assert.ok(Object.isFrozen(modes));
  });

  it('DEFAULT_SNAPSHOT_MODE should be readCommitted', () => {
    assert.equal(
      queryModule.DEFAULT_SNAPSHOT_MODE,
      'readCommitted',
    );
  });

  it('DEFAULT_RUNTIME_SESSION should be a string', () => {
    assert.equal(
      typeof queryModule.DEFAULT_RUNTIME_SESSION, 'string',
    );
  });

  it('RUNTIME_ERROR_MSG should be a frozen object', () => {
    assert.equal(
      typeof queryModule.RUNTIME_ERROR_MSG, 'object',
    );
    assert.ok(Object.isFrozen(queryModule.RUNTIME_ERROR_MSG));
  });

  it('RUNTIME_SUBSYSTEM should be a string', () => {
    assert.equal(
      typeof queryModule.RUNTIME_SUBSYSTEM, 'string',
    );
  });

  it('runtime.run and standalone run should be same fn',
    () => {
      assert.equal(queryModule.runtime.run, queryModule.run);
    });
});
