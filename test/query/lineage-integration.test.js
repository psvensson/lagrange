/**
 * Tests for lineage ID attachment to stage artifacts and
 * primitive requests.
 *
 * Verifies that LineageTracker integrates correctly with
 * CallbackStageExecutor, ShuffleBuffer (emit), executeLookup,
 * and BroadcastStore.
 *
 * Requirements: 9.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  CallbackStageExecutor,
} from '../../src/query/callback-stage-executor.js';
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
} from '../../src/query/distributed-context-constants.js';

// --- CallbackStageExecutor lineage ---

test('stage executor attaches lineage to stage result',
  async (t) => {
    const tracker = new LineageTracker('q-stage-1');
    const cb = async (_ctx, batch) => batch.rows;
    const executor = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 2,
    });

    const result = await executor.execute([
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ]);

    const expected = ['q-stage-1', '2', 'stage', '0']
      .join(SEP);
    t.equal(result[GF.LINEAGE_ID], expected);
    t.end();
  });

test('stage executor attaches lineage to partition results',
  async (t) => {
    const tracker = new LineageTracker('q-stage-2');
    const cb = async (_ctx, batch) => batch.rows;
    const executor = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 0,
    });

    const result = await executor.execute([
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
      {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
    ]);

    const pr0 = result.partitionResults[0];
    const pr1 = result.partitionResults[1];
    t.equal(
      pr0[GF.LINEAGE_ID],
      ['q-stage-2', '0', 'stage_batch', '0'].join(SEP),
    );
    t.equal(
      pr1[GF.LINEAGE_ID],
      ['q-stage-2', '0', 'stage_batch', '1'].join(SEP),
    );
    t.end();
  });

test('stage executor attaches lineage to failed partitions',
  async (t) => {
    const tracker = new LineageTracker('q-stage-3');
    const cb = async () => {
      throw new Error('fail');
    };
    const executor = new CallbackStageExecutor({
      callback: cb,
      lineageTracker: tracker,
      stageIndex: 1,
    });

    const result = await executor.execute([
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ]);

    const pr = result.partitionResults[0];
    t.equal(
      pr[GF.LINEAGE_ID],
      ['q-stage-3', '1', 'stage_batch', '0'].join(SEP),
    );
    t.end();
  });

test('stage executor omits lineage when no tracker',
  async (t) => {
    const cb = async (_ctx, batch) => batch.rows;
    const executor = new CallbackStageExecutor({
      callback: cb,
    });

    const result = await executor.execute([
      {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    ]);

    t.equal(result[GF.LINEAGE_ID], undefined);
    t.equal(
      result.partitionResults[0][GF.LINEAGE_ID],
      undefined,
    );
    t.end();
  });

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
    ['q-emit-1', '3', 'emit', '0'].join(SEP),
  );
  t.equal(
    records[1][GF.LINEAGE_ID],
    ['q-emit-1', '3', 'emit', '1'].join(SEP),
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
    ['q-lookup-1', '5', 'lookup', '2'].join(SEP),
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
      ['q-bcast-1', '4', 'broadcast', '0'].join(SEP),
    );
    t.equal(
      view2[GF.LINEAGE_ID],
      ['q-bcast-1', '4', 'broadcast', '1'].join(SEP),
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
