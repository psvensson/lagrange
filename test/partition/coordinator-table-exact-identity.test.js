import assert from 'node:assert/strict';
import {beforeEach, afterEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {readTransactionSchemaEnforcement} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {PARTITION_SERVICE_MIGRATION_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {applyCommitted, beginMessage, committedQueryOf, identityOf, originCommandOf,
  send, settleTicks, shutdownAll, startLeader, startReplica, track} from
  '../test-helpers/participant-transaction-fixture.js';

const USER_TABLE = 'SQL_TRANSACTIONS';
const USER_INSERT = `INSERT INTO ${USER_TABLE} (id, value) VALUES ('one', 'value')`;
const ALTER_SQL = `ALTER TABLE ${USER_TABLE} ADD COLUMN extra TEXT`;
const COORDINATOR = 'sql_transactions';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('uppercase user table ordinary source admission proposes and applies its write', async (t) => {
  const {leader, proposed} = await startLeader({tableName: USER_TABLE});
  t.after(() => shutdownAll(leader));
  const request = track(leader.executeQuery(USER_INSERT, [], {entryId: 'case-source'}));
  await settleTicks();
  assert.equal(proposed.length, 1, 'source admission does not demand coordinator schema');
  assert.equal(applyCommitted(leader, proposed[0]), null);
  assert.equal((await request.promise).success, true);
  assert.equal(leader.db.prepare(`SELECT value FROM ${USER_TABLE}`).get().value, 'value');
});

test('uppercase user table committed application does not demand ledger triggers', async (t) => {
  const follower = await startReplica('case-follower', {tableName: USER_TABLE});
  t.after(() => shutdownAll(follower));
  assert.equal(applyCommitted(follower, committedQueryOf('case-commit', USER_INSERT)), null);
  assert.equal(follower.db.prepare(`SELECT COUNT(*) AS count FROM ${USER_TABLE}`).get().count, 1);
  assert.equal(follower.db.prepare('SELECT COUNT(*) AS count FROM sqlite_schema ' +
    'WHERE type = ?').get('trigger').count, 0);
});

test('uppercase user remote ALTER reaches migration proposal and committed application', async (t) => {
  const {leader, proposed} = await startLeader({tableName: USER_TABLE});
  t.after(() => shutdownAll(leader));
  const request = track(leader.handleRemoteQuery({type: 'QUERY', sql: ALTER_SQL, params: [],
    migrationOperation: PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE,
    migrationId: 'case-alter'}));
  await settleTicks();
  assert.equal(proposed.length, 1, 'remote migration is not classified as ledger mutation');
  assert.equal(applyCommitted(leader, proposed[0]), null);
  assert.equal((await request.promise).success, true);
  assert.equal(leader.db.prepare(`PRAGMA table_info(${USER_TABLE})`).all()
    .some((column) => column.name === 'extra'), true);
});

test('uppercase user BEGIN is admitted while lowercase ledger excludes itself and repairs origin',
  async (t) => {
    const {leader: user} = await startLeader({tableName: USER_TABLE});
    t.after(() => shutdownAll(user));
    const userBegin = await send(user, beginMessage(identityOf('a'.repeat(32))));
    assert.equal(userBegin.success, true);
    const {leader: ledger} = await startLeader({tableName: COORDINATOR,
      schema: SQL_TRANSACTIONS_SCHEMA});
    t.after(() => shutdownAll(ledger));
    assert.equal(readTransactionSchemaEnforcement(ledger.db).state, 'enforced');
    const ledgerBegin = await send(ledger, beginMessage(identityOf('b'.repeat(32))));
    assert.equal(ledgerBegin.success, false);
    assert.equal(ledgerBegin.failureCode, 'transaction_coordinator_participant_unsupported');
    const alter = await ledger.handleRemoteQuery({type: 'QUERY',
      sql: 'ALTER TABLE sql_transactions ADD COLUMN forbidden TEXT', params: [],
      migrationOperation: PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE});
    assert.equal(alter.failureCode, 'transaction_coordinator_schema_protected');
    ledger.db.exec('DROP TRIGGER sql_transactions_initial_lineage_v1');
    const blocked = await ledger.executeQuery(
      'INSERT INTO sql_transactions (transaction_id) VALUES (\'legacy\')');
    assert.equal(blocked.failureCode, 'transaction_schema_enforcement_unavailable',
      'lowercase source refuses a missing enforcer before any proposal');
    assert.equal(applyCommitted(ledger, originCommandOf()), null);
    assert.equal(readTransactionSchemaEnforcement(ledger.db).state, 'enforced',
      'origin replay repairs the lowercase ledger enforcer');
  });
