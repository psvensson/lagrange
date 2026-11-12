// CDC Stage 3: a member that joins a message group on a node whose cache has
// no position of a propagated source learns that its cache is stale at once,
// not at the source's next range: the real replica's initialization marks
// every unpositioned propagated source as owing a list, and the node's
// relister (here a recording one, in the CDC integration service's place)
// lists them on a quiet table - no range is ever delivered.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SOURCE_POSITION_STATE, SOURCE_RELIST_OUTCOME} from
  '../../src/cache/system-table-cache-source-order.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cdc-table-policy.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {pump, recipientFixture} from './message-group-native-custody-fixture.js';
import {registerModeledRelister} from '../test-helpers/cdc-source-range-fixture.js';

test('a joining member lists every propagated source it holds no position of, with no ' +
  'traffic, and a positioned source is not listed again', async (t) => {
  const f = await recipientFixture(t, 'member-relist', {replicaCount: 1});
  const service = f.services[0];
  const sourceOrder = service.cdcHandler.cache.sourceOrder;
  const sources = CDC_PROPAGATED_TABLES.map((tableName) => INITIAL_PARTITION_IDS[tableName]);
  for (const source of sources) {
    assert.equal(sourceOrder.positionOf(source).state, SOURCE_POSITION_STATE.GAP,
      `${source}: the joined member knows its cache is stale before any range`);
  }
  const listed = [];
  registerModeledRelister(t, sourceOrder, service.timeSource, async ({sourcePartition, tableName}) => {
    listed.push(sourcePartition);
    sourceOrder.recordListedPosition({sourcePartition, tableName, incarnation: 'quiet',
      appliedIndex: 3});
    return SOURCE_RELIST_OUTCOME.RETRY;
  });
  await pump(f);
  assert.deepEqual([...listed].sort(), [...sources].sort(), 'each source listed once');
  for (const source of sources) {
    assert.equal(sourceOrder.positionOf(source).state, SOURCE_POSITION_STATE.CURRENT);
  }
  // A member joining a node whose cache is positioned lists nothing.
  sourceOrder.requireListed(sources[0], CDC_PROPAGATED_TABLES[0]);
  await pump(f);
  assert.equal(listed.length, sources.length);
});
