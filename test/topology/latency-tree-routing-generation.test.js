// The latency tree owner's routing generation: advanced by every recompute
// (the only writer of the views getRoutingOrder answers from) and by no read,
// so equal generations prove equal routing orders to a reader keyed on it.
// Real owner over a real system table cache.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';

beforeEach(() => {
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => LoggingService.resetInstance());

test('LatencyTreeService routing generation advances on recompute and not on reads', () => {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT,
    {[COLUMN.NODE_ID]: 'tree-node', [COLUMN.LATENCY_GROUP_ID]: 'tree-group'});
  const tree = new LatencyTreeService({nodeId: 'tree-node', systemTableCache: cache});
  tree.initialize();
  const initial = tree.getRoutingGeneration();
  assert.ok(Number.isSafeInteger(initial) && initial >= 0);
  tree.recompute();
  const recomputed = tree.getRoutingGeneration();
  assert.ok(recomputed > initial, 'recompute replaces the routing views');
  tree.getRoutingOrder('tree-group');
  tree.getNeighborOrder('tree-group');
  assert.equal(tree.getRoutingGeneration(), recomputed, 'reads leave the generation');
  tree.recompute();
  assert.ok(tree.getRoutingGeneration() > recomputed, 'each recompute advances it');
});
