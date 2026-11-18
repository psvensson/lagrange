/**
 * Tests for lineage ID attachment to primitive requests.
 *
 * Verifies that LineageTracker integrates correctly with
 * ShuffleBuffer (emit), executeLookup, and BroadcastStore.
 *
 * Requirements: 9.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  ShuffleBuffer,
} from '../../src/query/emit-primitive.js';
import {
  executeLookup,
} from '../../src/query/lookup-primitive.js';
import {
  BroadcastStore,
} from '../../src/query/broadcast-primitive.js';
import {
  GUARDRAIL_FIELD as GF,
  LINEAGE_SEPARATOR as SEP,
} from '../../src/query/guardrail-constants.js';
import {
  LOOKUP_ACCESS_PATH,
  PRIMITIVE_TYPE,
} from '../../src/query/distributed/distributed-context-constants.js';

// --- ShuffleBuffer (emit) lineage ---

test('emit attaches lineage to records', async (t) => {
  const tracker = new LineageTracker('q-emit-1');
  const buf = new ShuffleBuffer({
    maxBytes: 10000,
    lineageTracker: tracker,
    stageIndex: 3,
  });

  await buf.emit('k1', new Uint8Array([1, 2]));
  await buf.emit('k2', new Uint8Array([3, 4]));

  const records = buf.drain();
  t.equal(
    records[0][GF.LINEAGE_ID],
    ['q-emit-1', '3', PRIMITIVE_TYPE.EMIT, '0'].join(SEP),
  );
  t.equal(
    records[1][GF.LINEAGE_ID],
    ['q-emit-1', '3', PRIMITIVE_TYPE.EMIT, '1'].join(SEP),
  );
  t.end();
});

test('emit omits lineage when no tracker', async (t) => {
  const buf = new ShuffleBuffer({maxBytes: 10000});

  await buf.emit('k1', new Uint8Array([1]));

  const records = buf.drain();
  t.equal(records[0][GF.LINEAGE_ID], undefined);
  t.end();
});

// --- executeLookup lineage ---

test('lookup attaches lineage to result', async (t) => {
  const tracker = new LineageTracker('q-lookup-1');
  const fetchFn = async (_pid, _table, keys) => {
    return keys.map((k) => ({id: k.value}));
  };

  const result = await executeLookup({
    table: 'users',
    keys: [{column: 'id', value: 1}],
    accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    partitionResolver: () => 'p1',
    fetchFn,
    lineageTracker: tracker,
    stageIndex: 5,
    sequenceNum: 2,
  });

  t.equal(
    result[GF.LINEAGE_ID],
    ['q-lookup-1', '5', PRIMITIVE_TYPE.LOOKUP, '2'].join(SEP),
  );
  t.end();
});

test('lookup omits lineage when no tracker', async (t) => {
  const fetchFn = async () => [{id: 1}];

  const result = await executeLookup({
    table: 'users',
    keys: [{column: 'id', value: 1}],
    accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    partitionResolver: () => 'p1',
    fetchFn,
  });

  t.equal(result[GF.LINEAGE_ID], undefined);
  t.end();
});

// --- BroadcastStore lineage ---

test('broadcast attaches lineage to descriptor',
  (t) => {
    const tracker = new LineageTracker('q-bcast-1');
    const store = new BroadcastStore({
      lineageTracker: tracker,
      stageIndex: 4,
    });

    store.broadcast('ref-1', {version: 1, data: 'a'});
    store.broadcast('ref-2', {version: 2, data: 'b'});

    const view1 = store.useBroadcast('ref-1');
    const view2 = store.useBroadcast('ref-2');

    t.equal(
      view1[GF.LINEAGE_ID],
      ['q-bcast-1', '4', PRIMITIVE_TYPE.BROADCAST, '0'].join(SEP),
    );
    t.equal(
      view2[GF.LINEAGE_ID],
      ['q-bcast-1', '4', PRIMITIVE_TYPE.BROADCAST, '1'].join(SEP),
    );
    t.end();
  });

test('broadcast omits lineage when no tracker', (t) => {
  const store = new BroadcastStore();
  store.broadcast('ref-1', {version: 1, data: 'a'});

  const view = store.useBroadcast('ref-1');
  t.equal(view[GF.LINEAGE_ID], undefined);
  t.end();
});
