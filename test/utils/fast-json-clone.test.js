/**
 * CL-011 guard: fastJsonClone must match JSON.parse(JSON.stringify(...))
 * semantics exactly on the value shapes that flow through the system-table
 * cache and the priority-recovery snapshot pipeline, while being cheap
 * enough for read-path use (the JSON roundtrip measured 41% of the stalled
 * seed's gap-window profile samples).
 */

import {test} from '../../src/test-helpers/tap.js';
import {fastJsonClone} from '../../src/utils/fast-json-clone.js';

function assertJsonParity(t, value, label) {
  const expected = JSON.parse(JSON.stringify(value));
  const actual = fastJsonClone(value);
  t.same(actual, expected, `${label}: matches JSON roundtrip`);
}

test('fastJsonClone', async (t) => {
  await t.test('matches JSON roundtrip on representative rows', async (t) => {
    assertJsonParity(t, {
      operation_id: 'op-1',
      target_node_id: 'node-2',
      retry_count: 3,
      created_at: 1760000000000,
      steps_history: '[{"step":"PENDING"}]',
      error: null,
    }, 'flat replica_operations row');

    assertJsonParity(t, {
      nested: {a: [1, 'two', null, {b: true}], c: {}},
      list: [[1, 2], []],
    }, 'nested objects and arrays');

    assertJsonParity(t, {
      dropped: undefined,
      kept: 1,
      fn: () => {},
      arr: [undefined, () => {}, 1],
    }, 'undefined and function dropping');

    assertJsonParity(t, {
      nan: NaN,
      inf: Infinity,
      negInf: -Infinity,
      zero: 0,
    }, 'non-finite numbers become null');

    assertJsonParity(
      t,
      {when: new Date('2026-06-11T07:00:00.000Z')},
      'toJSON honored (Date)',
    );

    assertJsonParity(t, [1, 'a', null, {b: [true]}], 'top-level array');
    assertJsonParity(t, 'scalar', 'top-level string');
    assertJsonParity(t, null, 'null');
  });

  await t.test('clones are isolated from the source', async (t) => {
    const source = {a: {b: [1, {c: 2}]}};
    const clone = fastJsonClone(source);
    clone.a.b[1].c = 99;
    clone.a.b.push(3);
    t.equal(source.a.b[1].c, 2, 'nested object isolated');
    t.equal(source.a.b.length, 2, 'nested array isolated');
  });

  await t.test('is decisively cheaper than the JSON roundtrip', async (t) => {
    const row = {
      id: 'row-1',
      node_id: 'node-1234-5678',
      status: 'ACTIVE',
      epoch: 42,
      updated_at: 1760000000000,
      payload: {dims: {a: true, b: false}, reasons: ['x', 'y']},
    };
    const iterations = 20000;

    const startFast = process.hrtime.bigint();
    for (let index = 0; index < iterations; index++) {
      fastJsonClone(row);
    }
    const fastNs = Number(process.hrtime.bigint() - startFast);

    const startJson = process.hrtime.bigint();
    for (let index = 0; index < iterations; index++) {
      JSON.parse(JSON.stringify(row));
    }
    const jsonNs = Number(process.hrtime.bigint() - startJson);

    t.ok(
      fastNs < jsonNs,
      `fast clone is faster (fast=${Math.round(fastNs / 1e6)}ms ` +
        `json=${Math.round(jsonNs / 1e6)}ms for ${iterations} clones)`,
    );
  });
});
