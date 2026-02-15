import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DEBUG_CAPABILITY,
  DEBUG_TRACE_LEVEL,
  DEBUG_TRACE_LEVEL_SET,
  DEBUG_TRACE_FIELD,
} from '../../src/debug/debug-constants.js';

describe('debug constants', () => {
  it('defines stable debug capability names', () => {
    assert.equal(DEBUG_CAPABILITY.TRACE, 'debug.trace');
    assert.equal(DEBUG_CAPABILITY.BREAKPOINT, 'debug.breakpoint');
    assert.equal(DEBUG_CAPABILITY.SNAPSHOT, 'debug.snapshot');
  });

  it('defines valid trace levels and level-set', () => {
    const levels = Object.values(DEBUG_TRACE_LEVEL);
    for (const level of levels) {
      assert.equal(DEBUG_TRACE_LEVEL_SET.has(level), true);
    }
    assert.equal(DEBUG_TRACE_LEVEL_SET.has('invalid'), false);
  });

  it('defines required envelope fields', () => {
    assert.equal(DEBUG_TRACE_FIELD.LEVEL, 'level');
    assert.equal(DEBUG_TRACE_FIELD.MESSAGE, 'message');
    assert.equal(DEBUG_TRACE_FIELD.LINEAGE_ID, 'lineageId');
    assert.equal(DEBUG_TRACE_FIELD.SOURCE, 'source');
  });
});
