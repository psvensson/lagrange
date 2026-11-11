// The seed's node-ready rebalance trigger compares each nodes event with the
// node's previous row. One-by-one delivery (before range shipping) read that
// row from the cache, which then held every earlier event. A vector carries
// several versions of one node at once, so the hook owner
// (raiseNodeReadyRebalanceTriggers) compares each event with its in-vector
// predecessor and reads the cache only for a node's first event. This witness
// requires the same (event, previous row) sequence both ways, on the real
// SystemTableCache, for a node that flaps inside one vector.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {raiseNodeReadyRebalanceTriggers} from
  '../../src/bootstrap/phases/seed-cache-hydration-cdc-subscription.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'seed-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const hlc = (wallMs) => new HLCTimestamp(wallMs, 0, 'nodes-source').toString();
const version = (operation, nodeId, wallMs, status) => ({
  tableName: TABLES.NODES, operation,
  data: {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT]: wallMs,
    [COLUMN.UPDATED_AT_HLC]: hlc(wallMs), ...(status ? {[COLUMN.STATUS]: status} : {})},
});

// node-b: ready in the cache, flaps not-ready -> ready inside the vector, and
// a stale older version arrives last. node-c: joins, becomes ready, is ready
// again. node-d: deleted and re-created.
function nodesVector() {
  return [
    version(CDC_OPERATION.UPDATE, 'node-b', 2000, 'draining'),
    version(CDC_OPERATION.INSERT, 'node-c', 2100, 'joining'),
    version(CDC_OPERATION.UPDATE, 'node-b', 2200, 'active'),
    version(CDC_OPERATION.UPDATE, 'node-c', 2300, 'active'),
    version(CDC_OPERATION.DELETE, 'node-d', 2400),
    version(CDC_OPERATION.UPDATE, 'node-c', 2500, 'active'),
    version(CDC_OPERATION.INSERT, 'node-d', 2600, 'joining'),
    version(CDC_OPERATION.UPDATE, 'node-b', 2100, 'stale-older-version'),
  ];
}

function composeSeed() {
  const cache = new SystemTableCache();
  for (const row of [version(CDC_OPERATION.INSERT, 'node-b', 1000, 'active'),
    version(CDC_OPERATION.INSERT, 'node-d', 1000, 'active')]) {
    cache.applySystemTableChange(TABLES.NODES, row.operation, row.data);
  }
  const triggers = [];
  const owner = {
    readCachedNodeRow: (nodeId) => cache.get(TABLES.NODES, nodeId),
    trigger: (cdcEvent, previousNodeRow) => triggers.push({
      nodeId: cdcEvent.data[COLUMN.NODE_ID], operation: cdcEvent.operation,
      status: cdcEvent.data[COLUMN.STATUS] ?? null,
      previousStatus: previousNodeRow?.[COLUMN.STATUS] ?? null,
      previousUpdatedAt: previousNodeRow?.[COLUMN.UPDATED_AT] ?? null,
    }),
  };
  const propagate = (events) => {
    for (const event of events) {
      cache.applySystemTableChange(TABLES.NODES, event.operation, event.data);
    }
  };
  return {cache, triggers, owner, propagate};
}

test('a node that flaps inside one vector raises exactly the transitions one-by-one ' +
  'delivery raised', () => {
  const events = nodesVector();

  // Before range shipping: one event per wave; the cache holds every earlier
  // event when the next event's hook reads the previous row.
  const oneByOne = composeSeed();
  for (const event of events) {
    raiseNodeReadyRebalanceTriggers([event], oneByOne.owner);
    oneByOne.propagate([event]);
  }
  const vector = composeSeed();
  raiseNodeReadyRebalanceTriggers(events, vector.owner);
  vector.propagate(events);

  assert.deepEqual(vector.triggers, oneByOne.triggers);
  assert.deepEqual(vector.triggers.filter((trigger) => trigger.nodeId === 'node-b')
    .map((trigger) => [trigger.previousStatus, trigger.status]),
  [['active', 'draining'], ['draining', 'active'], ['active', 'stale-older-version']],
  'the not-ready -> ready transition inside the vector is seen against its predecessor, ' +
    'and the stale version is compared with the row the cache kept');
  assert.deepEqual(vector.triggers.filter((trigger) => trigger.nodeId === 'node-c')
    .map((trigger) => [trigger.previousStatus, trigger.status]),
  [[null, 'joining'], ['joining', 'active'], ['active', 'active']],
  'a ready -> ready pair is not a second transition from not-ready');
  assert.deepEqual(vector.triggers.filter((trigger) => trigger.nodeId === 'node-d')
    .map((trigger) => [trigger.previousStatus, trigger.status]),
  [['active', null], [null, 'joining']], 'a deleted node has no previous row');
});
