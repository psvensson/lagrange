import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {PARSER_DIALECT} from '../../src/query/pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {
  CASE_SENSITIVE_USER_TABLE,
  JOINER_ID,
  JOIN_WRITE_OPTIONS,
  nodeRow,
  selectRows,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const BOOT_INCARNATION = 7;
const SECOND_SYSTEM_ROW = 'second-node';
const USER_ROW = 'user-existing';
const SECOND_USER_ROW = 'user-delete';
const WRITE_TIMEOUT_MS = 60000;

function negativeStatements({table, key, field, row, deletedRow, dialect}) {
  const [first, second] = dialect === PARSER_DIALECT.POSTGRESQL ? ['$1', '$2'] : ['?', '?'];
  return [
    [`INSERT INTO ${table} (${key}, ${field}) VALUES (${first}, ${second})`, ['unexpected', '9']],
    [`UPDATE ${table} SET ${field} = ${first} WHERE ${key} = ${second}`, ['9', row]],
    [`DELETE FROM ${table} WHERE ${key} = ${first}`, [deletedRow]],
  ];
}

async function seedTargets(gateway, engine) {
  for (const nodeId of [JOINER_ID, SECOND_SYSTEM_ROW]) {
    const result = await gateway.insertSystemTableRow(TABLES.NODES,
      {...nodeRow(), node_id: nodeId, boot_incarnation: BOOT_INCARNATION}, JOIN_WRITE_OPTIONS);
    assert.equal(result.success, true, 'a real system row is present before the witness');
  }
  const seed = await engine.executeQuery('INSERT INTO "Logs" (id, n) VALUES (?, ?), (?, ?)',
    [USER_ROW, 1, SECOND_USER_ROW, 2]);
  assert.equal(seed.success, true, 'real case-sensitive user rows are present before the witness');
}

function readTargets(of) {
  return {
    system: selectRows(of(TABLES.NODES).dbPath,
      'SELECT node_id, node_address FROM nodes ORDER BY node_id'),
    user: selectRows(of(CASE_SENSITIVE_USER_TABLE).dbPath, 'SELECT id, n FROM "Logs" ORDER BY id'),
  };
}

for (const dialect of [PARSER_DIALECT.SQLITE, PARSER_DIALECT.POSTGRESQL]) {
  test(`${dialect} foreign DML qualifiers cannot redirect any write into a local table`,
    {timeout: WRITE_TIMEOUT_MS}, async () => {
      await withSurface([TABLES.NODES, CASE_SENSITIVE_USER_TABLE],
        async ({engine, gateway, deliveries, of}) => {
          await seedTargets(gateway, engine);
          const before = readTargets(of);
          const invalidSystem = negativeStatements({table: 'other.nodes',
            key: 'node_id', field: 'node_address', row: JOINER_ID, deletedRow: SECOND_SYSTEM_ROW,
            dialect});
          const invalidUser = negativeStatements({table: '"other"."Logs"',
            key: 'id', field: 'n', row: USER_ROW, deletedRow: SECOND_USER_ROW, dialect});
          const observations = [];
          for (const [index, [sql, params]] of invalidSystem.entries()) {
            const mark = deliveries.length;
            const response = await gateway.querySystemTable(TABLES.NODES, sql, params,
              {writeIdentity: `foreign-system-${dialect}-${index}`, dialect});
            observations.push([response.errorCode, deliveries.length - mark]);
          }
          for (const [sql, params] of invalidUser) {
            const mark = deliveries.length;
            const response = await engine.executeQuery(sql, params, {dialect});
            observations.push([response.errorCode, deliveries.length - mark]);
          }
          assert.deepEqual({observations, rows: readTargets(of)}, {
            observations: Array.from({length: invalidSystem.length + invalidUser.length},
              () => [QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE, 0]),
            rows: before,
          }, 'each invalid DML target refuses before any native participant receives it');
        });
    });

  test(`${dialect} admitted quoted global names bind the exact system participant`,
    {timeout: WRITE_TIMEOUT_MS}, async () => {
      await withSurface([TABLES.NODES, CASE_SENSITIVE_USER_TABLE],
        async ({engine, gateway, deliveries, of}) => {
          await seedTargets(gateway, engine);
          const [first, second] = dialect === PARSER_DIALECT.POSTGRESQL ?
            ['$1', '$2'] : ['?', '?'];
          const cases = [
            [`INSERT INTO "global"."nodes" (node_id, node_address) VALUES (${first}, ${second})`,
              ['qualified-insert', 'fixture-new']],
            [`UPDATE "global.nodes" SET node_address = ${first} WHERE node_id = ${second}`,
              ['fixture-changed', 'qualified-insert']],
            [`DELETE FROM "global"."nodes" WHERE node_id = ${first}`, ['qualified-insert']],
          ];
          const mark = deliveries.length;
          for (const [index, [sql, params]] of cases.entries()) {
            const result = await gateway.querySystemTable(TABLES.NODES, sql,
              params, {writeIdentity: `global-system-${dialect}-${index}`, dialect});
            assert.equal(result.success, true, JSON.stringify(result));
            assert.equal(result.affectedRows, 1);
            assert.deepEqual(result.partitions, [of(TABLES.NODES).partitionId]);
          }
          assert.deepEqual(deliveries.slice(mark).map(({table}) => table),
            [TABLES.NODES, TABLES.NODES, TABLES.NODES]);
          const final = readTargets(of);
          assert.deepEqual(final.system.map(({node_id: nodeId}) => nodeId),
            [JOINER_ID, SECOND_SYSTEM_ROW].sort());
          assert.deepEqual(final.user, [{id: SECOND_USER_ROW, n: 2}, {id: USER_ROW, n: 1}]);
        });
    });
}
