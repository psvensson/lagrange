// The cache's mutation watermark is the CACHE's time, not the process's.
//
// getLastAppliedAtMs() is read back as evidence of when a table last changed,
// so inside a deterministic node it has to come from that node's clock. This
// is a timestamp-source contract rather than a deadline crossing: nothing here
// decides a threshold, it decides whose clock stamped the evidence.
//
// The instance id is deliberately NOT part of this: it is a debug string, and
// making it a clock consumer would turn diagnostics into semantics.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';

const T1 = 1789295948000;
const T2 = 1789295951500;
const CDC_UPSERT = 'UPSERT';

function virtualTimeSource(startMs) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advanceTo(nextMs) {
      nowMs = nextMs;
    },
    setTimeout: () => null,
    clearTimeout: () => undefined,
    setInterval: () => null,
    clearInterval: () => undefined,
  };
}

test('the mutation watermark is stamped by the cache\'s own clock', () => {
  const timeSource = virtualTimeSource(T1);
  const cache = new SystemTableCache({timeSource, cacheId: 'witness/cache'});
  cache.applySystemTableChange(TABLES.NODES, CDC_UPSERT,
    {node_id: 'node-a', status: 'active'});
  assert.equal(cache.getLastAppliedAtMs(TABLES.NODES), T1,
    'the accepted mutation is stamped at the owner clock\'s instant');

  // Logical time moves; nothing about the host does.
  timeSource.advanceTo(T2);
  cache.applySystemTableChange(TABLES.NODES, CDC_UPSERT,
    {node_id: 'node-b', status: 'active'});
  assert.equal(cache.getLastAppliedAtMs(TABLES.NODES), T2,
    'and the next one moves with the owner clock, not with wall time');
});

test('MUTATION: stamping the watermark from ambient time breaks it', () => {
  // The falsifier, as a capability swap rather than a source edit: the cache's
  // clock becomes the ambient one, and the watermark stops answering the
  // owner's instant.
  const timeSource = virtualTimeSource(T1);
  const cache = new SystemTableCache({timeSource, cacheId: 'witness/cache'});
  cache.timeSource = {now: () => Date.now()};
  cache.applySystemTableChange(TABLES.NODES, CDC_UPSERT,
    {node_id: 'node-a', status: 'active'});
  assert.notEqual(cache.getLastAppliedAtMs(TABLES.NODES), T1,
    'on ambient time the watermark is the process clock, so the witness ' +
    'above goes red');
});

test('the default cache keeps platform time and an ambient instance id', () => {
  const before = Date.now();
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_UPSERT,
    {node_id: 'node-a', status: 'active'});
  const stamped = cache.getLastAppliedAtMs(TABLES.NODES);
  assert.ok(stamped >= before, 'production still stamps on RealTimeSource');
  assert.ok(typeof cache._cacheId === 'string' && cache._cacheId.length > 0,
    'and still draws its own diagnostic id when none is supplied');
});
