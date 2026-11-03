// A committed UPDATE of the config table reaches DynamicConfigService with its
// key: the ordering in dynamic-config-startup-owned-initialization depends on
// it. The event is built by the real generator from the SQL the real system
// table writer builds, over the row that write committed. A replay-only event
// is the same event: the flag selects a delivery profile and nothing else.
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {buildSystemTableMutationSqlParts} from
  '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {DynamicConfigService} from '../../src/config/dynamic-config-service.js';
import {PartitionCDCGenerator} from '../../src/partition/partition-cdc-generator.js';

const KEY = CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS;

function committedUpdate() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE config (config_key TEXT PRIMARY KEY, config_value TEXT, ' +
    'value_type TEXT, updated_by TEXT, updated_at INTEGER)');
  db.prepare('INSERT INTO config VALUES (?, ?, ?, ?, ?)').run(KEY, '100', 'number', 'a', 1);
  const {setClause, values} = buildSystemTableMutationSqlParts('UPDATE',
    {config_value: '210', updated_by: 'b', updated_at: 2});
  const {whereStr, values: whereValues} =
    buildSystemTableMutationSqlParts('DELETE', {config_key: KEY});
  const sql = `UPDATE config SET ${setClause} WHERE ${whereStr}`;
  const params = [...values, ...whereValues];
  db.prepare(sql).run(...params);
  const logger = {debug() {}, info() {}, warn() {}, error() {}};
  const generator = new PartitionCDCGenerator({partitionId: 'config-p1',
    replicaId: 'replica-1', tableName: 'config', db, logger});
  const entry = {type: 'QUERY', sql, params, timestamp: '9', changes: 1};
  return {db, generator, entry};
}

test('the event of a committed config UPDATE carries config_key, and the service ' +
  'orders on it', async (t) => {
  const {db, generator, entry} = committedUpdate();
  t.teardown(() => db.close());
  const {cdcEvent} = generator.buildEvent(entry);
  t.equal(cdcEvent.tableName, 'config', 'the config table');
  t.equal(cdcEvent.operation, 'UPDATE', 'an UPDATE');
  t.equal(cdcEvent.data.config_key, KEY, 'the fetched row names its key');
  t.equal(cdcEvent.data.config_value, '210', 'and its committed value');
  const service = new DynamicConfigService({});
  await service.handleCDCEvent(cdcEvent);
  t.equal(service.cdcApplySequence(KEY), 1, 'the apply is counted for that key');
  t.equal(await service.get(KEY), 210, 'and cached');
  await service.handleCDCEvent({...cdcEvent, replayOnly: true});
  t.equal(service.cdcApplySequence(KEY), 2, 'a replay-only event is counted the same');
});

test('the key survives when the row cannot be fetched back', async (t) => {
  const {db, generator, entry} = committedUpdate();
  t.teardown(() => db.close());
  db.exec('DELETE FROM config');
  const {cdcEvent} = generator.buildEvent(entry);
  t.equal(cdcEvent.data.config_key, KEY, 'taken from the WHERE parameters');
  t.equal(cdcEvent.data.config_value, '210', 'with the SET parameters');
});

test('raw SQL against the config table reaches the service with its key', async (t) => {
  const {db, generator} = committedUpdate();
  t.teardown(() => db.close());
  const service = new DynamicConfigService({});
  const raw = [
    {sql: 'DELETE FROM config WHERE config_key = ?', params: [KEY]},
    {sql: `DELETE FROM config WHERE config_key = '${KEY}'`, params: []},
    {sql: 'UPDATE config SET config_value = ? WHERE config_key = ?', params: ['77', KEY]},
    {sql: `UPDATE config SET config_value = '77' WHERE config_key = '${KEY}'`, params: []},
  ];
  for (const statement of raw) {
    const before = service.cdcApplySequence(KEY);
    const {cdcEvent} = generator.buildEvent({type: 'QUERY', ...statement,
      timestamp: '9', changes: 1});
    t.equal(cdcEvent?.data?.config_key, KEY, `key carried: ${statement.sql}`);
    await service.handleCDCEvent(cdcEvent);
    t.equal(service.cdcApplySequence(KEY), before + 1, 'counted for that key');
  }
});
