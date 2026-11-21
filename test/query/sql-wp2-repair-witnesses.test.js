import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {createMockMessageRouter, createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';

const PG = {dialect: PARSER_DIALECT.POSTGRESQL};

function createRecordingEngine() {
  const router = createMockMessageRouter();
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache(
      [{table_name: 't', primaryKey: 'id'}],
      [{partition_id: 'p1', table_name: 't', partition_key_start: null, partition_key_end: null}],
    ),
    messageRouter: router,
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
  });
  return {engine};
}

test('Finding 2: HAVING clause with unsupported CONCAT should be refused', async (t) => {
  const {engine} = createRecordingEngine();
  // Ensure the table exists
  await engine.executeQuery('CREATE TABLE t (id INTEGER PRIMARY KEY, a INTEGER)', [], PG);
  
  // This should be refused because the coordinator doesn't support CONCAT in HAVING
  const result = await engine.executeQuery(
    'SELECT SUM(a) AS s FROM t HAVING concat(SUM(a), \'\') = \'3\'', [], PG);
  
  t.equal(result.success, false, 'Should fail');
  t.equal(result.errorCode, 'UNSUPPORTED_SQL_FEATURE', 'Should be UNSUPPORTED_SQL_FEATURE');
});

test('Finding 3: Grouping with NOCASE collation should be handled correctly', async (t) => {
  const {engine} = createRecordingEngine();
  await engine.executeQuery('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT COLLATE NOCASE)', [], PG);
  await engine.executeQuery('INSERT INTO t (id, name) VALUES (1, \'A\'), (2, \'a\')', [], PG);
  
  // With NOCASE, 'A' and 'a' should be grouped together, count should be 2
  const result = await engine.executeQuery('SELECT name, COUNT(*) AS n FROM t GROUP BY name', [], PG);
  
  t.ok(result.success, 'Query should succeed');
  t.equal(result.rows.length, 1, 'Should have only 1 group');
  t.equal(result.rows[0].n, 2, 'Count should be 2');
});
