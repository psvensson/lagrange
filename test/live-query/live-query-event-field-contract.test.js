/**
 * One name per fact on a live-query change event.
 *
 * `data` is the row the event is about (the inserted row, the row after an
 * update, the deleted row); `oldData` is the row before an update and is
 * present only on an update; `rows` is the list a reset carries. No other
 * name among the former aliases may appear.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/index.js';
import {
  buildDeleteEvent,
  buildInsertEvent,
  buildResetNotification,
  buildUpdateEvent,
} from '../../src/live-query/live-query-group-helpers.js';
import {createLiveQueryStartupWiring} from
  '../../src/live-query/live-query-startup-wiring.js';

const ROW_FIELD_NAMES = Object.freeze(
  ['row', 'data', 'old', 'oldData', 'new', 'rows', 'results']);

function presentRowFields(event) {
  return ROW_FIELD_NAMES.filter((name) => Object.hasOwn(event, name));
}

describe('live-query change event field contract', () => {
  const before = {id: 1, amount: 10};
  const after = {id: 1, amount: 20};

  for (const useDeltaFormat of [false, true]) {
    it(`insert carries only data (delta=${useDeltaFormat})`, () => {
      const event = buildInsertEvent({queryId: 'q', row: after, hlc: 'h', useDeltaFormat});
      assert.deepEqual(presentRowFields(event), ['data']);
      assert.deepEqual(event.data, after);
    });

    it(`delete carries only data, the deleted row (delta=${useDeltaFormat})`, () => {
      const event = buildDeleteEvent({queryId: 'q', row: before, hlc: 'h', useDeltaFormat});
      assert.deepEqual(presentRowFields(event), ['data']);
      assert.deepEqual(event.data, before);
    });

    it(`update carries data (after) and oldData (before) (delta=${useDeltaFormat})`, () => {
      const event = buildUpdateEvent({
        queryId: 'q', oldRow: before, newRow: after, hlc: 'h', useDeltaFormat,
      });
      assert.deepEqual(presentRowFields(event), ['data', 'oldData']);
      assert.deepEqual(event.data, after);
      assert.deepEqual(event.oldData, before);
    });
  }

  it('reset carries only rows', () => {
    const event = buildResetNotification({
      queryId: 'q', newRows: [after], count: 1, generation: 2,
    });
    assert.deepEqual(presentRowFields(event), ['rows']);
    assert.deepEqual(event.rows, [after]);
  });
});

describe('partition topology change field contract', () => {
  for (const operation of ['insert', 'update', 'delete']) {
    it(`a partitions ${operation} reaches the manager as {operation, data}`, () => {
      const listeners = new Set();
      const cache = {
        onCacheChange: (listener) => listeners.add(listener),
        offCacheChange: (listener) => listeners.delete(listener),
        get: () => null,
        find: () => null,
      };
      const wiring = createLiveQueryStartupWiring({
        nodeId: 'node-1', systemTableCache: cache, sqlQueryEngine: null,
      });
      const received = [];
      wiring.liveQueryManager.handlePartitionTopologyChange = async (change) => {
        received.push(change);
      };
      const record = {partition_id: 'p1', table_name: 'orders'};
      for (const listener of listeners) listener(TABLES.PARTITIONS, operation, record);
      assert.equal(received.length, 1);
      assert.deepEqual(Object.keys(received[0]).sort(), ['data', 'operation']);
      assert.equal(received[0].data, record);
      wiring.shutdown();
    });
  }
});
