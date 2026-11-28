/**
 * What the real producers answer for one control-plane write.
 *
 * Since 7d261f681 a named control-plane write is APPLIED only on the
 * producer's durable commit receipt bound to the attempt's own partition and
 * entry, and FAILED / NOT_PROPOSED only on the producer's definite failure of
 * that entry on that partition (judgeNamedWriteOutcome). A component double
 * that stands in for a write producer answers through this module, so its
 * answer is built by the producers' own code and cannot drift from them again:
 *  - the partition leader: PartitionServiceEntryApplyBase#buildCommittedWriteIdentity
 *    (buildDurableCommitWitness from the committed entry) for a fresh commit,
 *    answerSettledStatement for a settled replay of the same entry; for a
 *    write that did not apply, its refusal before proposal
 *    (buildPartitionWriteLeadershipRefusal: not the leader) or its committed
 *    statement's deterministic failure (answerSettledStatement from the
 *    entry's STATEMENT_FAILED outcome row);
 *  - the engine: the real DistributedWriteCoordinator plan, participant
 *    options (entryId derived from the write's key) and aggregation, over the
 *    real QueryExecutor write rendering (executeInsert / executeUpdate /
 *    executeDelete); a failed answer reaches it as the partition delivery's
 *    failure result (buildPartitionExecutionFailureResult over
 *    buildQueryPartitionCandidateFailureDetails);
 *  - the CDC integration service: the real CDCIntegrationService method over
 *    that engine (it retries a retryable failure and throws the definite one).
 * The double still owns its storage (the effect: changed rows, returned rows,
 * the origin HLC, or the failure) and its transport; the statement is parsed
 * by the real parser and routed to the system table's initial partition, as
 * the engine routes a system-table write.
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
import {buildPartitionWriteLeadershipRefusal} from
  '../../src/partition/partition-write-kernel.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {QUERY_AST_TYPE} from '../../src/query/query-constants.js';
import {buildPartitionExecutionFailureResult} from
  '../../src/query/query-execution-budget.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {buildQueryPartitionCandidateFailureDetails} from
  '../../src/query/query-executor-partition-failure.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {SQLParser} from '../../src/query/sql-parser.js';

const {QUERY_EXECUTOR_LITERAL} = QUERY_EXECUTOR_SHARED;
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
 * The partition leader's answer to the proposer of one statement.
 * @param {Object} entry - {partitionId, entryId, idempotencyKey, operationId}:
 *   the entry as the engine proposed it.
 * @param {Object} [effect] - The double's storage outcome: changes (default
 *   1; null with settledReplay: the settled row retains no count),
 *   lastInsertRowid, rows, originHlc (the committed command's HLC),
 *   settledReplay (answer from the entry's settled outcome row), logIndex,
 *   term, nodeId, replicaId; or the definite failure the leader answers
 *   instead: notLeader (refused before proposal: this replica does not lead
 *   the partition), statementFailure ({failureCode, failureMessage}: the
 *   committed statement failed deterministically, answered from the entry's
 *   STATEMENT_FAILED outcome row).
 * @return {Object} The partition write answer.
 */
function committedPartitionWriteAnswer(entry, effect = {}) {
  if (effect.notLeader === true) {
    return buildPartitionWriteLeadershipRefusal(null, entry.partitionId);
  }
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
  if (effect.statementFailure) {
    const {failureCode, failureMessage} = effect.statementFailure;
    const recorded = {outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
      logIndex, term, failureCode, failureMessage};
    return answerSettledStatement(leader, {command, recorded});
  }
  const changes = effect.changes === undefined ? 1 : effect.changes;
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

// The proposer's router as the delivery reads it for a failed answer: with
// leaderReconnectIntervalMs it is reconnecting to the answering node, so the
// delivery derives the write's retry-after from its reconnect interval.
function answeringNodeRouter(answeringNodeId, effect) {
  if (!Number.isFinite(effect.leaderReconnectIntervalMs)) return undefined;
  return {
    reconnectIntervalMs: effect.leaderReconnectIntervalMs,
    getConnectionState: (nodeId) => (nodeId === answeringNodeId ?
      QUERY_EXECUTOR_LITERAL.STRING_RECONNECTING : null),
  };
}

// What the partition delivery hands the engine
// (QueryExecutorPartitionDelivery#executeOnPartition): the leader's answer
// when it applied, otherwise the delivery's failure result for that answer.
function deliveredAnswer(executor, answer, options, answeringNodeId) {
  if (answer.success === true) return answer;
  const tableName = options?.tableName;
  return buildPartitionExecutionFailureResult({
    partitionId: answer.partitionId,
    failedTable: typeof tableName === 'string' && tableName.length > 0 ? tableName : null,
    errorMessage: answer.error,
    details: buildQueryPartitionCandidateFailureDetails({
      executor,
      failure: answer,
      forRead: false,
      participantNodeId: answeringNodeId,
      participantAddress: null,
    }),
  });
}

// The real QueryExecutor write rendering; only the delivery to the partition
// is the double's (it answers what the partition leader answers, through the
// delivery's own failure result), and the statement text stays the caller's
// (the double's storage executes it).
function createRenderingExecutor(sql, effect) {
  const answeringNodeId = effect.nodeId ?? COMMITTED_WRITE_LEADER_NODE_ID;
  const executor = Object.assign(Object.create(QueryExecutor.prototype), {
    logger: QUIET,
    hlcClock: {now: () => null},
    lastCoordinatorMetrics: null,
    messageRouter: answeringNodeRouter(answeringNodeId, effect),
    buildInsertSQL: () => sql,
    buildUpdateSQL: () => sql,
    buildDeleteSQL: () => sql,
  });
  const deliver = (partitionId, options) => deliveredAnswer(executor,
    committedPartitionWriteAnswer({
      partitionId,
      entryId: options.entryId,
      idempotencyKey: options.idempotencyKey,
      operationId: options.operationId,
    }, effect), options, answeringNodeId);
  executor.executeOnPartition =
    async (partitionId, _sql, _params, _a, _b, _c, options) => deliver(partitionId, options);
  executor.executeOnPartitions =
    async (partitionIds, _sql, _params, _hlc, _a, _b, _c, options) =>
      partitionIds.map((partitionId) => deliver(partitionId, options));
  return executor;
}

/**
 * The engine's answer (SQLQueryEngine.executeQuery) for one committed
 * system-table write statement.
 * @param {string} sql - The write statement as delivered.
 * @param {Array} [params] - Its parameters.
 * @param {Object} [options] - The delivery options (idempotencyKey).
 * @param {Object} [effect] - See committedPartitionWriteAnswer; partitionId
 *   overrides the system-table route; leaderReconnectIntervalMs makes the
 *   proposer's router reconnect to the answering node (a failed answer then
 *   carries the delivery's retry-after).
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
 * The CDC integration service's answer for one system-table write: the real
 * CDCIntegrationService method, over an engine answering through
 * engineCommittedWriteAnswer.
 * @param {string} method - insertSystemTableRow, upsertSystemTableRow,
 *   updateSystemTableRow or deleteSystemTableRow.
 * @param {Array} args - The method's arguments, as the caller passed them.
 * @param {Object} [effect] - See engineCommittedWriteAnswer.
 * @return {Promise<Object>} The CDC write answer; for a definite failure
 *   effect, rejected with the error the CDC service throws.
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
