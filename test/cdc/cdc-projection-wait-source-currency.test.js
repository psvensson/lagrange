// CDC Stage 3 read currency: a projection wait for a deletion is satisfied by
// the row's absence only on a cache whose source position is current. On a
// gapped or position-unknown cache an absent row may never have arrived: the
// wait stays open (named in its log as an open waiter) and is woken by the
// image install that makes the position current - even an install that
// changed no row. A wait for an upsert is unaffected: the row carrying the
// write's origin proves itself. The wait never answers a write.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'currency'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const SOURCE = INITIAL_PARTITION_IDS[TABLES.NODES];
const hlc = (ms) => new HLCTimestamp(ms, 0, 'currency-source').toString();
const settle = async () => {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

function compose() {
  const clock = new VirtualTimeSource({startMs: 1});
  const cache = new SystemTableCache({timeSource: clock});
  const service = new CDCIntegrationService({nodeId: 'currency', systemTableCache: cache,
    timeSource: clock});
  return {cache, service, sourceOrder: cache.sourceOrder};
}

test('a deletion wait on a gapped cache does not take absence as current; the image install ' +
  'that makes the position current answers it, though it changed no row', async () => {
  const {service, sourceOrder} = compose();
  sourceOrder.recordGap({sourcePartition: SOURCE, incarnation: 'i', after: {logIndex: 4,
    ordinal: 0}, through: {logIndex: 6, ordinal: 0}}, TABLES.NODES);
  const deletion = {tableName: TABLES.NODES, key: 'node-x', originHlc: hlc(5000), deleted: true};
  let answer = null;
  service.awaitProjectionAt(deletion).then((value) => {
    answer = value;
  });
  await settle();
  assert.equal(answer, null, 'absence on a gapped cache is not proof of the deletion');
  assert.equal(service.getProjectionWaitDiagnostics().activeWaiters, 1);
  sourceOrder.recordListedPosition({sourcePartition: SOURCE, tableName: TABLES.NODES,
    incarnation: 'i', appliedIndex: 9});
  await settle();
  assert.equal(answer?.outcome, 'reached', 'the install made the position current');
});

test('an upsert wait is unaffected by the cell: the row at the write\'s origin answers it',
  async () => {
    const {cache, service} = compose();
    cache.applySystemTableChange(TABLES.NODES, 'UPSERT', {[COLUMN.NODE_ID]: 'node-y',
      [COLUMN.UPDATED_AT_HLC]: hlc(7000)});
    const answer = await service.awaitProjectionAt({tableName: TABLES.NODES, key: 'node-y',
      originHlc: hlc(7000)});
    assert.equal(answer.outcome, 'reached');
  });
