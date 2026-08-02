/**
 * Call Cell Batch Executor tests.
 *
 * Covers: SELECT-only rejection, scatter vs narrowed partition
 * resolution, per-partition typed batches with correct cell-value tags,
 * fail-closed typed refusal on partition failure (no silent drops),
 * over-bound batch -> BATCH_BOUND_EXCEEDED, and unsafe integer row ->
 * refusal.
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {createCallCellBatchExecutor} from
  '../../src/service/call-cell-batch-executor.js';
import {CALL_CELL_ROUTE_ERROR_CODE} from
  '../../src/service/call-cell-routing-contract.js';
import {CELL_VALUE_TAG} from
  '../../src/runtime/call-cell-value-mapping.js';

const TABLE_NAME = 'metrics';
const STATEMENT_SELECT = 'SELECT id, value FROM metrics';
const STATEMENT_DELETE = 'DELETE FROM metrics';
const STATEMENT_MALFORMED = 'SELECT FROM WHERE';
const BOUND_TWO = 2;
const BOUND_TEN = 10;
const PARTITION_ALL = Object.freeze(['p-0', 'p-1']);
const PARTITION_NARROWED = Object.freeze(['p-1']);
const PARTITION_DESCRIPTORS = Object.freeze([
  Object.freeze({partition_id: 'p-0'}),
  Object.freeze({partition_id: 'p-1'}),
]);
const COLUMN_ID = 'id';
const COLUMN_VALUE = 'value';
const ROW_ID_ONE = 1;
const ROW_ID_TWO = 2;
const REAL_VALUE = 2.5;
const TEXT_VALUE = 'north';
const UNSAFE_INTEGER = Number.POSITIVE_INFINITY;

const ERROR_NAME_ROUTING = 'CallCellRoutingError';

function createAst(type, tableName = TABLE_NAME, where = null) {
  return {type, from: {name: tableName}, where};
}

function createParserStub(astOrError) {
  return {
    parse(statement) {
      if (astOrError instanceof Error) {
        throw astOrError;
      }
      if (typeof astOrError === 'function') {
        return astOrError(statement);
      }
      return astOrError;
    },
  };
}

function createPartitionResolverStub(partitionIds = PARTITION_ALL) {
  const calls = [];
  return {
    calls,
    resolvePartitions(tableName, whereClause, partitions) {
      calls.push({tableName, whereClause, partitions});
      return [...partitionIds];
    },
  };
}

function createQueryExecutorStub(perPartitionResults) {
  const calls = [];
  return {
    calls,
    buildSelectSQL() {
      return STATEMENT_SELECT;
    },
    async executeOnPartitions(
      partitionIds,
      sql,
      params,
      timestamp,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      executionOptions,
    ) {
      calls.push({
        partitionIds,
        sql,
        params,
        timestamp,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        executionOptions,
      });
      return typeof perPartitionResults === 'function' ?
        perPartitionResults(partitionIds) :
        perPartitionResults;
    },
  };
}

function createExecutor({
  ast = createAst('SELECT'),
  partitionIds = PARTITION_ALL,
  results = [],
} = {}) {
  const partitionResolver = createPartitionResolverStub(partitionIds);
  const queryExecutor = createQueryExecutorStub(results);
  const executor = createCallCellBatchExecutor({
    queryExecutor,
    partitionResolver,
    partitionsProvider: () => [...PARTITION_DESCRIPTORS],
    sqlParser: createParserStub(ast),
  });
  return {executor, partitionResolver, queryExecutor};
}

function successResult(partitionId, rows) {
  return {partitionId, success: true, rows};
}

function failureResult(partitionId) {
  return {partitionId, success: false, error: 'replica unreachable'};
}

async function assertRoutingRefusal(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, ERROR_NAME_ROUTING);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

describe('createCallCellBatchExecutor', () => {
  it('rejects a non-SELECT declared statement with STATEMENT_INVALID',
    async () => {
      const {executor} = createExecutor({ast: createAst('DELETE')});
      await assertRoutingRefusal(
        executor.executeBatches({
          statement: STATEMENT_DELETE,
          batchRowBound: BOUND_TEN,
        }),
        CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      );
    });

  it('rejects an unparseable declared statement with STATEMENT_INVALID',
    async () => {
      const {executor} = createExecutor({
        ast: new Error('syntax error'),
      });
      await assertRoutingRefusal(
        executor.executeBatches({
          statement: STATEMENT_MALFORMED,
          batchRowBound: BOUND_TEN,
        }),
        CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      );
    });

  it('scatters to all partitions when no key predicate is present',
    async () => {
      const {executor, partitionResolver, queryExecutor} = createExecutor({
        results: [successResult('p-0', []), successResult('p-1', [])],
      });
      await executor.executeBatches({
        statement: STATEMENT_SELECT,
        batchRowBound: BOUND_TEN,
      });
      assert.equal(partitionResolver.calls.length, 1);
      assert.equal(partitionResolver.calls[0].tableName, TABLE_NAME);
      assert.equal(partitionResolver.calls[0].whereClause, null);
      assert.deepEqual(
        queryExecutor.calls[0].partitionIds,
        [...PARTITION_ALL],
      );
      assert.equal(queryExecutor.calls[0].forRead, true);
    });

  it('uses the narrowed partition set from the resolver', async () => {
    const whereClause = {type: 'eq', column: 'id', value: 7};
    const {executor, partitionResolver, queryExecutor} = createExecutor({
      ast: createAst('SELECT', TABLE_NAME, whereClause),
      partitionIds: PARTITION_NARROWED,
      results: [successResult('p-1', [])],
    });
    await executor.executeBatches({
      statement: STATEMENT_SELECT,
      batchRowBound: BOUND_TEN,
    });
    assert.equal(partitionResolver.calls[0].whereClause, whereClause);
    assert.deepEqual(
      queryExecutor.calls[0].partitionIds,
      [...PARTITION_NARROWED],
    );
  });

  it('refuses with ROUTE_UNAVAILABLE when the table has no partitions',
    async () => {
      const partitionResolver = createPartitionResolverStub();
      const queryExecutor = createQueryExecutorStub([]);
      const executor = createCallCellBatchExecutor({
        queryExecutor,
        partitionResolver,
        partitionsProvider: () => [],
        sqlParser: createParserStub(createAst('SELECT')),
      });
      await assertRoutingRefusal(
        executor.executeBatches({
          statement: STATEMENT_SELECT,
          batchRowBound: BOUND_TEN,
        }),
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      );
    });

  it('builds typed per-partition batches with correct cell-value tags',
    async () => {
      const rowsFirst = [
        {[COLUMN_ID]: ROW_ID_ONE, [COLUMN_VALUE]: TEXT_VALUE},
      ];
      const rowsSecond = [
        {[COLUMN_ID]: ROW_ID_TWO, [COLUMN_VALUE]: REAL_VALUE},
        {[COLUMN_ID]: null, [COLUMN_VALUE]: null},
      ];
      const {executor} = createExecutor({
        results: [
          successResult('p-0', rowsFirst),
          successResult('p-1', rowsSecond),
        ],
      });
      const batches = await executor.executeBatches({
        statement: STATEMENT_SELECT,
        batchRowBound: BOUND_TEN,
      });

      assert.equal(batches.length, 2);
      assert.ok(Object.isFrozen(batches));

      const [first, second] = batches;
      assert.equal(first.partitionId, 'p-0');
      assert.ok(Object.isFrozen(first));
      assert.ok(Object.isFrozen(first.batch));
      assert.equal(first.batch.length, 1);
      const firstRow = first.batch[0];
      assert.equal(firstRow.columns[0].name, COLUMN_ID);
      assert.equal(firstRow.columns[0].val.tag, CELL_VALUE_TAG.INTEGER);
      assert.equal(
        firstRow.columns[0].val.val,
        BigInt(ROW_ID_ONE),
      );
      assert.equal(firstRow.columns[1].name, COLUMN_VALUE);
      assert.equal(firstRow.columns[1].val.tag, CELL_VALUE_TAG.TEXT);
      assert.equal(firstRow.columns[1].val.val, TEXT_VALUE);

      assert.equal(second.partitionId, 'p-1');
      assert.equal(second.batch.length, 2);
      const realCell = second.batch[0].columns[1].val;
      assert.equal(realCell.tag, CELL_VALUE_TAG.REAL);
      assert.equal(realCell.val, REAL_VALUE);
      const nullCell = second.batch[1].columns[0].val;
      assert.equal(nullCell.tag, CELL_VALUE_TAG.NULL);
      assert.equal('val' in nullCell, false);
    });

  it('refuses with ROUTE_UNAVAILABLE when any partition fails ' +
    '(never silently drops)', async () => {
    const {executor} = createExecutor({
      results: [
        successResult('p-0', []),
        failureResult('p-1'),
      ],
    });
    await assertRoutingRefusal(
      executor.executeBatches({
        statement: STATEMENT_SELECT,
        batchRowBound: BOUND_TEN,
      }),
      CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    );
  });

  it('refuses with BATCH_BOUND_EXCEEDED when a partition batch ' +
    'exceeds the declared bound', async () => {
    const overBoundRows = [
      {[COLUMN_ID]: ROW_ID_ONE},
      {[COLUMN_ID]: ROW_ID_TWO},
      {[COLUMN_ID]: ROW_ID_ONE},
    ];
    const {executor} = createExecutor({
      results: [
        successResult('p-0', overBoundRows),
        successResult('p-1', []),
      ],
    });
    await assertRoutingRefusal(
      executor.executeBatches({
        statement: STATEMENT_SELECT,
        batchRowBound: BOUND_TWO,
      }),
      CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
    );
  });

  it('refuses when a row carries an unsafe (non-finite) integer',
    async () => {
      const unsafeRows = [{[COLUMN_ID]: UNSAFE_INTEGER}];
      const {executor} = createExecutor({
        results: [
          successResult('p-0', unsafeRows),
          successResult('p-1', []),
        ],
      });
      // Non-finite numbers have no cell-value variant; the value mapper
      // fails closed and the executor surfaces a typed routing refusal
      // (never a silently truncated or coerced batch).
      await assertRoutingRefusal(
        executor.executeBatches({
          statement: STATEMENT_SELECT,
          batchRowBound: BOUND_TEN,
        }),
        CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
      );
    });
});
