/**
 * What the real producers answer for one committed control-plane write.
 *
 * Since 7d261f681 a named control-plane write is APPLIED only on the
 * producer's durable commit receipt bound to the attempt's own partition and
 * entry (judgeNamedWriteOutcome). A component double that stands in for a
 * write producer answers through this module, so its answer is built by the
 * producers' own code and cannot drift from them again:
 *  - the partition leader: PartitionServiceEntryApplyBase#buildCommittedWriteIdentity
 *    (buildDurableCommitWitness from the committed entry) for a fresh commit,
 *    answerSettledStatement for a settled replay of the same entry;
 *  - the engine: the real DistributedWriteCoordinator plan, participant
 *    options (entryId derived from the write's key) and aggregation, over the
 *    real QueryExecutor write rendering (executeInsert / executeUpdate /
 *    executeDelete);
 *  - the CDC integration service: the real CDCIntegrationService method over
 *    that engine.
 * The double still owns its storage (the effect: changed rows, returned rows,
 * the origin HLC) and its transport; the statement is parsed by the real
 * parser and routed to the system table's initial partition, as the engine
 * routes a system-table write.
 */
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {answerSettledStatement} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PartitionServiceEntryApplyBase} from
  '../../src/partition/partition-service-entry-apply-base.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {QUERY_AST_TYPE} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';

const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const COMMITTED_WRITE_LEADER_NODE_ID = 'committed-write-leader';
const COMMITTED_WRITE_TERM = 1;
const WRITE_STATEMENT_TYPES = new Set([
  QUERY_AST_TYPE.INSERT, QUERY_AST_TYPE.UPDATE, QUERY_AST_TYPE.DELETE]);
const BUILD_COMMITTED_WRITE_IDENTITY =
  PartitionServiceEntryApplyBase.prototype.buildCommittedWriteIdentity;
const logIndexByPartition = new Map();

function nextLogIndex(partitionId) {
  const next = (logIndexByPartition.get(partitionId) ?? 0) + 1;
  logIndexByPartition.set(partitionId, next);
  return next;
}

function partitionLeader(partitionId, effect) {
  return {
    partitionId,
    nodeId: effect.nodeId ?? COMMITTED_WRITE_LEADER_NODE_ID,
    replicaId: effect.replicaId ?? `${partitionId}-r1`,
  };
}

/**
 * The partition leader's answer to the proposer of one committed statement.
 * @param {Object} entry - {partitionId, entryId, idempotencyKey, operationId}:
 *   the entry as the engine proposed it.
 * @param {Object} [effect] - The double's storage outcome: changes (default
 *   1), lastInsertRowid, rows, originHlc (the committed command's HLC),
 *   settledReplay (answer from the entry's settled outcome row), logIndex,
 *   term, nodeId, replicaId.
 * @return {Object} The partition write answer.
 */
function committedPartitionWriteAnswer(entry, effect = {}) {
  const leader = partitionLeader(entry.partitionId, effect);
  const command = {
    entryId: entry.entryId,
    idempotencyKey: entry.idempotencyKey,
    operationId: entry.operationId,
    proposedBy: leader.replicaId,
    ...(effect.originHlc ? {timestamp: effect.originHlc} : {}),
  };
  const logIndex = effect.logIndex ?? nextLogIndex(entry.partitionId);
  const term = effect.term ?? COMMITTED_WRITE_TERM;
  const changes = effect.changes ?? 1;
  const lastInsertRowid = effect.lastInsertRowid ?? 0;
  if (effect.settledReplay === true) {
    const recorded = {outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
      logIndex, term, changes, lastInsertRowid};
    return withRows(answerSettledStatement(leader, {command, recorded}), effect);
  }
  // What the leader resolves to the proposer after applying the entry
  // (PartitionServiceEntryApplyBase#applyCommittedEntry).
  const identity = BUILD_COMMITTED_WRITE_IDENTITY.call(leader, command, logIndex, term);
  return withRows({success: true, changes, lastInsertRowid, ...identity}, effect);
}

function withRows(answer, effect) {
  return Array.isArray(effect.rows) ? {...answer, rows: effect.rows} : answer;
}

function routeSystemTableWrite(sql, effect) {
  const ast = new SQLParser(sql).parse();
  const partitionId = effect.partitionId ?? INITIAL_PARTITION_IDS[ast.table];
  if (!WRITE_STATEMENT_TYPES.has(ast.type) || typeof partitionId !== 'string') {
    throw new Error(`committed-write-answer: not a routed system-table write: ${sql}`);
  }
  return {ast, partitionId};
}

// The real QueryExecutor write rendering; only the delivery to the partition
// is the double's (it answers what the partition leader answers), and the
// statement text stays the caller's (the double's storage executes it).
function createRenderingExecutor(sql, effect) {
  const deliver = (partitionId, options) => committedPartitionWriteAnswer({
    partitionId,
    entryId: options.entryId,
    idempotencyKey: options.idempotencyKey,
    operationId: options.operationId,
  }, effect);
  return Object.assign(Object.create(QueryExecutor.prototype), {
    logger: QUIET,
    hlcClock: {now: () => null},
    lastCoordinatorMetrics: null,
    buildInsertSQL: () => sql,
    buildUpdateSQL: () => sql,
    buildDeleteSQL: () => sql,
    executeOnPartition: async (partitionId, _sql, _params, _a, _b, _c, options) =>
      deliver(partitionId, options),
    executeOnPartitions: async (partitionIds, _sql, _params, _hlc, _a, _b, _c, options) =>
      partitionIds.map((partitionId) => deliver(partitionId, options)),
  });
}

/**
 * The engine's answer (SQLQueryEngine.executeQuery) for one committed
 * system-table write statement.
 * @param {string} sql - The write statement as delivered.
 * @param {Array} [params] - Its parameters.
 * @param {Object} [options] - The delivery options (idempotencyKey).
 * @param {Object} [effect] - See committedPartitionWriteAnswer; partitionId
 *   overrides the system-table route.
 * @return {Promise<Object>} The engine write answer.
 */
async function engineCommittedWriteAnswer(sql, params = [], options = {}, effect = {}) {
  const {ast, partitionId} = routeSystemTableWrite(sql, effect);
  const coordinator = new DistributedWriteCoordinator({
    queryExecutor: createRenderingExecutor(sql, effect),
    getTablePartitions: () => [{partitionId}],
    getTableInfo: () => null,
  });
  coordinator.logger = QUIET;
  const plan = coordinator.createWritePlan(ast, params, {
    idempotencyKey: options?.idempotencyKey,
    operationId: options?.operationId,
    partitionIds: [partitionId],
  });
  if (plan.partitionStatements.size !== 1) {
    throw new Error(`committed-write-answer: expected one participant for: ${sql}`);
  }
  return coordinator.executePlan(plan, params, {});
}

/**
 * The CDC integration service's answer for one committed system-table write:
 * the real CDCIntegrationService method, over an engine answering through
 * engineCommittedWriteAnswer.
 * @param {string} method - insertSystemTableRow, upsertSystemTableRow,
 *   updateSystemTableRow or deleteSystemTableRow.
 * @param {Array} args - The method's arguments, as the caller passed them.
 * @param {Object} [effect] - See engineCommittedWriteAnswer.
 * @return {Promise<Object>} The CDC write answer.
 */
async function cdcCommittedWriteAnswer(method, args, effect = {}) {
  const cdc = new CDCIntegrationService({
    nodeId: effect.nodeId ?? COMMITTED_WRITE_LEADER_NODE_ID,
    sqlQueryEngine: {
      executeQuery: (sql, params, options) =>
        engineCommittedWriteAnswer(sql, params, options, effect),
    },
  });
  cdc.initialize();
  cdc.logger = QUIET;
  try {
    return await cdc[method](...args);
  } finally {
    cdc.markShuttingDown();
  }
}

export {
  cdcCommittedWriteAnswer,
  committedPartitionWriteAnswer,
  engineCommittedWriteAnswer,
};
