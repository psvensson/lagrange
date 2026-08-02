/**
 * Call Cell Batch Executor
 *
 * Engine-side fan-out and typed batch builder for a call/pushdown
 * Binding's declared partition-local SELECT statement. Resolves target
 * partitions, executes the statement on each selected partition with
 * bounded result shares, and marshals the rows into typed call-cell
 * batches (lagrange:cell/call-context `list<row>`) ready for the
 * per-shard `run` export.
 *
 * Fail-closed contract (architecture/minimal-deployment-surface.md):
 * - Non-SELECT or unparseable declared statement -> typed
 *   STATEMENT_INVALID refusal.
 * - Any selected partition failing -> typed ROUTE_UNAVAILABLE refusal;
 *   failed partitions are NEVER silently dropped (unlike the legacy
 *   partition-callback dispatcher).
 * - Rows exceeding the Binding-declared batch bound -> typed
 *   BATCH_BOUND_EXCEEDED refusal (budget-exhausted semantics).
 * - Unmappable row values (unsafe integers, blobs, non-finite numbers)
 *   -> typed BATCH_BOUND_EXCEEDED refusal via CallCellValueError.
 *
 * Ownership: this module ONLY produces typed per-partition batches.
 * It does not invoke components, resolve routes, or coordinate reduce.
 */

import {
  CallCellValueError,
  toCellBatch,
} from '../runtime/call-cell-value-mapping.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from './call-cell-routing-contract.js';

const AST_TYPE_SELECT = 'SELECT';
const EMPTY_WHERE_CLAUSE = null;
const NO_TIMESTAMP = null;
const EXECUTE_FOR_READ = true;
const NO_PREFER_LEADER = false;
const NO_PREFER_SAME_LATENCY_GROUP = false;
const NO_EXECUTION_OPTIONS = Object.freeze({});
const NO_PARAMETERS = Object.freeze([]);
const EMPTY_ROWS = Object.freeze([]);

const CALL_CELL_BATCH_MESSAGE = Object.freeze({
  STATEMENT_PARSE_FAILED:
    'Call Cell declared statement could not be parsed',
  STATEMENT_SELECT_ONLY:
    'Call Cell declared statement must be a SELECT',
  STATEMENT_NO_TABLE:
    'Call Cell declared statement must name a single table',
  PARTITIONS_UNAVAILABLE:
    'Call Cell declared statement table has no routable partitions',
  PARTITION_RESOLUTION_FAILED:
    'Call Cell partition resolution failed for the declared statement',
  PARTITION_EXECUTION_FAILED:
    'Call Cell declared statement failed on a selected partition',
});

/**
 * Create the call-cell batch executor with constructor-injected
 * collaborators.
 *
 * @param {object} deps
 * @param {object} deps.queryExecutor - QueryExecutor instance exposing
 *   buildSelectSQL(ast) -> string and
 *   executeOnPartitions(partitionIds, sql, params, ts, forRead,
 *     preferLeader, preferSameLatencyGroup, options) ->
 *     Promise<Array<{partitionId, success, rows, error?}>>.
 * @param {object} deps.partitionResolver - PartitionResolver instance
 *   exposing resolvePartitions(tableName, whereClause, partitions,
 *   options) -> string[] (scatters to all when no key predicate).
 * @param {Function} deps.partitionsProvider - fn(tableName) -> Array of
 *   partition descriptor objects (same shape as the engine's
 *   getTablePartitions; only the array length is consumed here).
 * @param {object} deps.sqlParser - SQL parser exposing .parse(sql) ->
 *   AST with {type, from: {name}, where}.
 * @return {object} Executor exposing executeBatches(request).
 */
function createCallCellBatchExecutor({
  queryExecutor,
  partitionResolver,
  partitionsProvider,
  sqlParser,
}) {
  /**
   * Parse and validate the declared statement is SELECT-only against a
   * single named table.
   *
   * @param {string} statement - Binding-declared SQL statement.
   * @return {object} Parsed SELECT AST.
   * @throws {CallCellRoutingError} STATEMENT_INVALID on parse failure,
   *   non-SELECT type, or missing table.
   */
  function parseDeclaredStatement(statement) {
    let ast = null;
    try {
      ast = sqlParser.parse(statement);
    } catch (parseError) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
        CALL_CELL_BATCH_MESSAGE.STATEMENT_PARSE_FAILED,
        {cause: parseError},
      );
    }
    const astType = String(ast?.type || '').toUpperCase();
    if (astType !== AST_TYPE_SELECT) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
        CALL_CELL_BATCH_MESSAGE.STATEMENT_SELECT_ONLY,
      );
    }
    if (!ast.from || !ast.from.name) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
        CALL_CELL_BATCH_MESSAGE.STATEMENT_NO_TABLE,
      );
    }
    return ast;
  }

  /**
   * Resolve which partitions the statement's WHERE clause targets;
   * scatters to all table partitions when there is no key predicate.
   *
   * @param {string} tableName - Table named by the statement.
   * @param {object|null} whereClause - Parsed WHERE clause AST.
   * @return {string[]} Selected partition IDs.
   * @throws {CallCellRoutingError} ROUTE_UNAVAILABLE when the table has
   *   no routable partitions or resolution itself fails.
   */
  function resolveTargetPartitions(tableName, whereClause) {
    let partitions = null;
    try {
      partitions = partitionsProvider(tableName);
    } catch (providerError) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        CALL_CELL_BATCH_MESSAGE.PARTITIONS_UNAVAILABLE,
        {cause: providerError},
      );
    }
    if (!Array.isArray(partitions) || partitions.length === 0) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        CALL_CELL_BATCH_MESSAGE.PARTITIONS_UNAVAILABLE,
      );
    }
    try {
      return partitionResolver.resolvePartitions(
        tableName,
        whereClause,
        partitions,
      );
    } catch (resolutionError) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        CALL_CELL_BATCH_MESSAGE.PARTITION_RESOLUTION_FAILED,
        {cause: resolutionError},
      );
    }
  }

  /**
   * Marshal one partition's rows into a typed call-cell batch under the
   * Binding-declared row bound.
   *
   * @param {string} partitionId - Partition the rows came from.
   * @param {object[]} rowObjects - Plain better-sqlite3 row objects.
   * @param {number} batchRowBound - Binding-declared per-invocation
   *   batch row bound.
   * @return {object} Frozen {partitionId, batch}.
   * @throws {CallCellRoutingError} BATCH_BOUND_EXCEEDED when the batch
   *   exceeds the declared bound or a row value is unmappable.
   */
  function buildPartitionBatch(partitionId, rowObjects, batchRowBound) {
    try {
      return Object.freeze({
        partitionId,
        batch: toCellBatch(rowObjects, batchRowBound),
      });
    } catch (mappingError) {
      if (mappingError instanceof CallCellValueError) {
        throw createCallRoutingFailure(
          CALL_CELL_ROUTE_ERROR_CODE.BATCH_BOUND_EXCEEDED,
          mappingError.message,
          {cause: mappingError},
        );
      }
      throw mappingError;
    }
  }

  /**
   * Execute the Binding-declared partition-local SELECT across the
   * resolved partitions and build typed per-partition call-cell
   * batches.
   *
   * @param {object} request
   * @param {string} request.statement - Binding-declared SELECT.
   * @param {number} request.batchRowBound - Binding-declared
   *   per-invocation batch row bound.
   * @param {Array} [request.parameters] - Bound statement parameters.
   * @param {object} [request.timestamp] - HLC timestamp forwarded to
   *   the query executor.
   * @param {object} [request.executionOptions] - Extra bounded-execution
   *   options (e.g. resultMaxRows/resultMaxBytes shares) forwarded to
   *   executeOnPartitions.
   * @return {Promise<object[]>} Frozen [{partitionId, batch}] where each
   *   batch is the frozen typed list<row> for the shard's `run` export.
   * @throws {CallCellRoutingError} Typed refusal; never silent-drops.
   */
  async function executeBatches(request) {
    const {
      statement,
      batchRowBound,
      parameters = NO_PARAMETERS,
      timestamp = NO_TIMESTAMP,
      executionOptions = NO_EXECUTION_OPTIONS,
    } = request;

    const ast = parseDeclaredStatement(statement);
    const tableName = ast.from.name;
    const partitionIds = resolveTargetPartitions(
      tableName,
      ast.where || EMPTY_WHERE_CLAUSE,
    );

    const sql = queryExecutor.buildSelectSQL(ast);
    const results = await queryExecutor.executeOnPartitions(
      partitionIds,
      sql,
      parameters,
      timestamp,
      EXECUTE_FOR_READ,
      NO_PREFER_LEADER,
      NO_PREFER_SAME_LATENCY_GROUP,
      executionOptions,
    );

    // Fail closed: any selected partition that failed refuses the whole
    // invocation — failed partitions are never silently dropped.
    for (const result of results) {
      if (!result.success) {
        throw createCallRoutingFailure(
          CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
          `${CALL_CELL_BATCH_MESSAGE.PARTITION_EXECUTION_FAILED}: ` +
          `${String(result.partitionId)}`,
        );
      }
    }

    return Object.freeze(results.map((result) =>
      buildPartitionBatch(
        result.partitionId,
        result.rows || EMPTY_ROWS,
        batchRowBound,
      ),
    ));
  }

  return Object.freeze({executeBatches});
}

export {createCallCellBatchExecutor};
