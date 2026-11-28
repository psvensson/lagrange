/**
 * Shared world for the transaction-redundant-progress-writes witnesses
 * (quest transaction-redundant-progress-writes, stage 0) and their guard
 * (scripts/checks/transaction-redundant-progress-writes-guard.js).
 *
 * It composes the same parts as the existing coordinator metadata witnesses
 * (test/query/tx-metadata-pgwire-and-result-representation.test.js and
 * test/query/transaction-participant-set-authority.test.js): the real
 * SQLQueryEngine and its DistributedTransactionCoordinator, the
 * coordinator-table gateway double backed by one SQLite store with the
 * production schemas (test/test-helpers/transaction-persistence-gateway.js),
 * the mock routing cache and the participant protocol double's answers.
 *
 * Two additions, both test-side only:
 * - a participant ledger that keeps what each participant holds across a
 *   coordinator restart (volatile session, PREPARED, COMMITTED, ROLLED_BACK
 *   tombstone) and records every decision it applied, so a witness can say
 *   "exactly one outcome, no orphaned session";
 * - holds on a coordinator-table mutation or a participant delivery: a hold
 *   that is never released stands for a coordinator that stopped there; a
 *   new engine over the same durable rows recovers it.
 *
 * Fidelity limit: the gateway double runs the production mutation SQL on
 * one local database (no system-partition replication, no CDC), and the
 * participant is a ledger double, not a partition. The witnesses certify the
 * coordinator's write discipline and its recovery decisions, not consensus.
 */
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {PARTICIPANT_TRANSACTION_STATE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest, preparedDigestOf} from
  '../test-helpers/participant-protocol-double.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const NODE_ID = 'progress-write-witness-node';
const START_CLOCK_MS = 1_000_000;
// Past the coordinator's 60 s transaction budget, so recovery may close an
// OPEN undecided row (TIMEOUT_BUDGET_DEFAULT.TRANSACTION_BUDGET_MS).
const PAST_DEADLINE_MS = 120_000;
const COORDINATOR_TABLES = Object.freeze([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);
const SILENT_LOGGER = Object.freeze({
  debug() {}, info() {}, warn() {}, error() {},
});
const MUTATION_KIND = Object.freeze({
  REGISTRATION: 'registration',
  MANIFEST_APPEND: 'manifestAppend',
  MANIFEST_FREEZE: 'manifestFreeze',
  DECISION: 'decision',
  STATUS: 'status',
  PARTICIPANT_ROW: 'participantRow',
  WRITE_OPERATIONS: 'writeOperations',
  OTHER: 'other',
});
const STATE = PARTICIPANT_TRANSACTION_STATE;
const LEDGER_OPEN_STATES = Object.freeze(new Set([STATE.ACTIVE,
  STATE.PREPARED]));

/**
 * Table definitions of one world: one partition per table, like Scenario A
 * (one Raft group per table), so P = number of tables written.
 * @param {string[]} tableNames - The user tables.
 * @return {{tables: Object[], partitions: Object[], partitionOf: Object}}
 */
function tableLayoutOf(tableNames) {
  const tables = tableNames.map((name) => ({table_name: name,
    primaryKey: 'id'}));
  const partitions = tableNames.map((name, index) => ({
    partition_id: `p${index + 1}`, table_name: name,
    partition_key_start: null, partition_key_end: null}));
  const partitionOf = Object.fromEntries(partitions.map((partition) =>
    [partition.table_name, partition.partition_id]));
  return {tables, partitions, partitionOf};
}

/**
 * Classify one recorded gateway mutation of the coordinator tables.
 * @param {Object} mutation - An entry of gateway.mutations.
 * @return {{kind: string, status: (string|null)}} What the write records.
 */
function classifyCoordinatorMutation(mutation) {
  const {tableName, operation} = mutation;
  if (tableName === TABLES.SQL_WRITE_OPERATIONS) {
    return {kind: MUTATION_KIND.WRITE_OPERATIONS, status: null};
  }
  if (tableName === TABLES.SQL_TRANSACTION_PARTICIPANTS) {
    return {kind: MUTATION_KIND.PARTICIPANT_ROW,
      status: mutation.row?.status ?? null};
  }
  if (tableName !== TABLES.SQL_TRANSACTIONS) {
    return {kind: MUTATION_KIND.OTHER, status: null};
  }
  if (operation === 'insert') {
    return {kind: MUTATION_KIND.REGISTRATION,
      status: mutation.row?.status ?? null};
  }
  const data = mutation.data || {};
  if (typeof data.decision === 'string') {
    return {kind: MUTATION_KIND.DECISION, status: data.status ?? null};
  }
  if (data.participant_set_state === 'FROZEN') {
    return {kind: MUTATION_KIND.MANIFEST_FREEZE, status: data.status ?? null};
  }
  if (typeof data.participant_set_text === 'string') {
    return {kind: MUTATION_KIND.MANIFEST_APPEND, status: null};
  }
  return {kind: MUTATION_KIND.STATUS, status: data.status ?? null};
}

/**
 * The label one mutation is counted under: its kind, with the status a
 * participant row or a progress status write records.
 * @param {Object} mutation - An entry of gateway.mutations.
 * @return {string}
 */
function mutationLabelOf(mutation) {
  const {kind, status} = classifyCoordinatorMutation(mutation);
  return kind === MUTATION_KIND.PARTICIPANT_ROW || kind === MUTATION_KIND.STATUS ?
    `${kind}:${status}` : kind;
}

/**
 * The participants' durable state, kept across coordinator restarts.
 * @return {Object} The ledger.
 */
function createParticipantLedger() {
  const byParticipant = new Map();
  const violations = [];
  const entryOf = (participantId, partitionId) => {
    let entry = byParticipant.get(participantId);
    if (!entry) {
      entry = {participantId, partitionId, state: STATE.ABSENT,
        begins: 0, staged: 0, prepares: 0, decisions: []};
      byParticipant.set(participantId, entry);
    }
    return entry;
  };
  const applyDecision = (entry, message) => {
    const decision = message.decision;
    const prior = entry.decisions.find((applied) =>
      applied.decisionDigest === message.decisionDigest);
    if (!prior && entry.decisions.length > 0) {
      violations.push({participantId: entry.participantId,
        reason: 'second distinct decision', decision});
    }
    if (decision === 'COMMIT' && (entry.state !== STATE.PREPARED &&
        entry.state !== STATE.COMMITTED)) {
      violations.push({participantId: entry.participantId,
        reason: 'COMMIT without PREPARED', state: entry.state});
    }
    if (decision === 'COMMIT' &&
        message.preparedDigest !== preparedDigestOf(entry.participantId)) {
      violations.push({participantId: entry.participantId,
        reason: 'COMMIT bound to another prepared digest'});
    }
    if (decision === 'ROLLBACK' && entry.state === STATE.COMMITTED) {
      violations.push({participantId: entry.participantId,
        reason: 'ROLLBACK after COMMIT'});
    }
    if (!prior) {
      entry.decisions.push({decision, decisionDigest: message.decisionDigest});
    }
    entry.state = decision === 'COMMIT' ? STATE.COMMITTED : STATE.ROLLED_BACK;
  };
  return {
    violations,
    entries: () => Array.from(byParticipant.values())
      .map((entry) => ({...entry, decisions: [...entry.decisions]}))
      .sort((left, right) => (left.participantId < right.participantId ? -1 : 1)),
    stage(message, partitionId) {
      if (typeof message.participantId !== 'string') return;
      entryOf(message.participantId, partitionId).staged += 1;
    },
    answer(message, partitionId) {
      const entry = entryOf(message.participantId, partitionId);
      const reply = answerParticipantTransactionRequest(message, partitionId);
      switch (message.operation) {
      case QUERY_OPERATION.BEGIN:
        entry.begins += 1;
        if (entry.state === STATE.ABSENT) entry.state = STATE.ACTIVE;
        return reply;
      case QUERY_OPERATION.PREPARE:
        entry.prepares += 1;
        entry.state = STATE.PREPARED;
        return reply;
      case QUERY_OPERATION.COMMIT:
        applyDecision(entry, message);
        return reply;
      case QUERY_OPERATION.ROLLBACK:
        if (typeof message.decisionDigest === 'string') {
          applyDecision(entry, message);
        } else if (entry.state === STATE.ACTIVE) {
          entry.state = STATE.ABSENT;
        }
        return reply;
      case QUERY_OPERATION.TRANSACTION_OUTCOME:
        return entry.state === STATE.COMMITTED ?
          {...reply, durable: true, state: STATE.COMMITTED,
            outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED} :
          reply;
      default:
        return reply;
      }
    },
  };
}

/**
 * A hold on the first event a predicate names. Never released, it stands
 * for a coordinator process that stopped there.
 * @param {Function} predicate - (event) => boolean.
 * @return {Object} {reached, release, wait}.
 */
function createHold(predicate) {
  let armed = true;
  let signal;
  let release;
  const reached = new Promise((resolve) => {
    signal = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  return {
    reached,
    release: () => release(),
    async wait(event) {
      if (!armed || !predicate(event)) return;
      armed = false;
      signal(event);
      await released;
    },
  };
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

/**
 * One world: a durable coordinator store, a participant ledger and a clock
 * shared by every engine (coordinator incarnation) created in it.
 * @param {Object} [options] - {tables: string[]}.
 * @return {Object} The world.
 */
function createProgressWriteWorld(options = {}) {
  resetEnvironment();
  const layout = tableLayoutOf(options.tables || ['users']);
  const store = createTransactionPersistenceGateway().db;
  const ledger = createParticipantLedger();
  const timeline = [];
  const engines = [];
  const clock = {nowMs: START_CLOCK_MS};
  const world = {
    layout,
    store,
    ledger,
    timeline,
    clock,
    /**
     * A coordinator incarnation over the shared durable rows.
     * @param {Object} [engineOptions] - {mutationHold, deliveryHold,
     *   recoverRows, beforeMutation}.
     * @return {Object} {engine, gateway}.
     */
    createEngine(engineOptions = {}) {
      const gateway = createTransactionPersistenceGateway({db: store,
        beforeMutation: async (mutation) => {
          timeline.push({kind: 'mutation', label: mutationLabelOf(mutation),
            tableName: mutation.tableName});
          await engineOptions.beforeMutation?.(mutation);
          await engineOptions.mutationHold?.wait(mutation);
        }});
      const cache = createMockSystemCache(layout.tables, layout.partitions);
      if (engineOptions.recoverRows === true) {
        const baseGetAll = cache.getAll.bind(cache);
        cache.getAll = (type) => (COORDINATOR_TABLES.includes(type) ?
          gateway.rows(type) : baseGetAll(type));
      }
      const router = {
        async deliver(address, message) {
          const partitionId = address.split('/')[2];
          const copy = structuredClone(message);
          if (copy.type !== QUERY_OPERATION.TRANSACTION) {
            timeline.push({kind: 'delivery', operation: copy.type,
              partitionId});
            await engineOptions.deliveryHold?.wait(copy);
            ledger.stage(copy, partitionId);
            return buildDeliveryEnvelope({acknowledged: true},
              {success: true, rows: [], changes: 1});
          }
          timeline.push({kind: 'delivery', operation: copy.operation,
            partitionId});
          await engineOptions.deliveryHold?.wait(copy);
          return buildDeliveryEnvelope({acknowledged: true},
            ledger.answer(copy, partitionId));
        },
      };
      const engine = new SQLQueryEngine({
        controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
        systemCache: cache,
        messageRouter: router,
        controlPlaneSystemTableGateway: gateway,
        autoStartDistributedTransactionRecovery: false,
        unrefRetryDelayTimers: true,
        logger: SILENT_LOGGER,
        nowFn: () => clock.nowMs,
      });
      engine.transactionCoordinator.sleep = async () => {};
      engine.transactionCoordinator.logger = SILENT_LOGGER;
      engines.push(engine);
      return {engine, gateway};
    },
    advancePastDeadline() {
      clock.nowMs += PAST_DEADLINE_MS;
    },
    transactionRow(transactionId) {
      return store.prepare(`SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
        'WHERE transaction_id = ?').get(transactionId) ?? null;
    },
    participantRows(transactionId) {
      return store.prepare('SELECT * FROM ' +
        `${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ? ` +
        'ORDER BY participant_id').all(transactionId);
    },
    async close() {
      for (const engine of engines) {
        await engine.shutdown();
      }
      store.close();
    },
  };
  return world;
}

/**
 * BEGIN, one INSERT per named table, then COMMIT or ROLLBACK, on one engine.
 * The finishing statement is started, not awaited, so a hold can stop it.
 * @param {Object} engine - The SQLQueryEngine.
 * @param {string} sessionId - Session.
 * @param {string[]} tableNames - Tables written, in order.
 * @param {string} finish - 'COMMIT' or 'ROLLBACK'.
 * @return {Promise<Object>} {begun, writes, finished: Promise}.
 */
async function startWriteTransaction(engine, sessionId, tableNames, finish) {
  const begun = await engine.executeQuery('BEGIN', [], {sessionId});
  const writes = [];
  for (const [index, tableName] of tableNames.entries()) {
    writes.push(await engine.executeQuery(
      `INSERT INTO ${tableName} (id, name) VALUES (?, ?)`,
      [`${sessionId}-${index}`, 'v'], {sessionId}));
  }
  const finished = engine.executeQuery(finish, [], {sessionId,
    expectedTransactionId: begun.transactionId});
  return {begun, writes, finished};
}

/**
 * The coordinator-table work of one write transaction that runs to its end.
 * @param {Object} options - {tables, finish}.
 * @return {Promise<Object>} Facts: labels, mutation count, timeline, result.
 */
async function measureWriteTransaction({tables, finish}) {
  const world = createProgressWriteWorld({tables});
  try {
    const {engine, gateway} = world.createEngine();
    const before = gateway.mutations.length;
    const run = await startWriteTransaction(engine, `measure-${finish}`,
      tables, finish);
    const result = await run.finished;
    const mutations = gateway.mutations.slice(before);
    return {
      begun: run.begun.success === true,
      writes: run.writes.map((write) => write.success === true),
      success: result.success === true,
      labels: mutations.map(mutationLabelOf),
      mutationCount: mutations.length,
      timeline: [...world.timeline],
      row: world.transactionRow(run.begun.transactionId),
      participantRows: world.participantRows(run.begun.transactionId),
      ledger: world.ledger.entries(),
      violations: [...world.ledger.violations],
    };
  } finally {
    await world.close();
  }
}

function countOf(values, value) {
  return values.filter((entry) => entry === value).length;
}

/**
 * Restart a crashed coordinator: a new engine over the same rows recovers
 * through the production startup path (cache rows, then the authoritative
 * re-drive) and the facts every crash witness asserts are collected.
 * @param {Object} world - The world.
 * @param {string} transactionId - The crashed transaction.
 * @param {Object} [options] - {pastDeadline}.
 * @return {Promise<Object>} Recovery facts.
 */
async function restartAndRecover(world, transactionId, options = {}) {
  if (options.pastDeadline === true) {
    world.advancePastDeadline();
  }
  const {engine} = world.createEngine({recoverRows: true});
  const replay = await engine.activateDistributedTransactionRecovery();
  // One recovering coordinator at a time: its periodic sweep stops here.
  await engine.shutdown();
  const row = world.transactionRow(transactionId);
  const ledger = world.ledger.entries();
  return {
    replay: {totalRecovered: replay?.totalRecovered ?? null,
      resumed: replay?.resumed ?? null, failed: replay?.failed ?? null},
    decision: row?.decision ?? null,
    status: row?.status ?? null,
    participantRowStatuses: world.participantRows(transactionId)
      .map((participant) => participant.status),
    participantDecisions: ledger.map((entry) =>
      entry.decisions.map((applied) => applied.decision)),
    orphanedSessions: ledger.filter((entry) =>
      LEDGER_OPEN_STATES.has(entry.state)).map((entry) => entry.participantId),
    violations: [...world.ledger.violations],
  };
}

const HOLD_WAIT_MS = 5000;

function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  })]).finally(() => clearTimeout(timer));
}

function isManifestFreezeWrite(mutation) {
  return classifyCoordinatorMutation(mutation).kind ===
    MUTATION_KIND.MANIFEST_FREEZE;
}

function isDecisionWrite(mutation) {
  return classifyCoordinatorMutation(mutation).kind === MUTATION_KIND.DECISION;
}

/**
 * The n-th participant-row write recording a status (1-based).
 * @param {string} status - The participant row status.
 * @param {number} ordinal - Which one.
 * @return {Function} The predicate.
 */
function nthParticipantRowWrite(status, ordinal) {
  let seen = 0;
  return (mutation) => {
    const {kind, status: written} = classifyCoordinatorMutation(mutation);
    if (kind !== MUTATION_KIND.PARTICIPANT_ROW || written !== status) {
      return false;
    }
    seen += 1;
    return seen === ordinal;
  };
}

function participantDeliveryOf(operation) {
  return (message) => message.operation === operation;
}

/**
 * A coordinator stops at a hold during COMMIT of a write transaction over
 * `tables`; a new coordinator over the same rows recovers it.
 * @param {Object} options - {tables, mutationHold | deliveryHold predicate,
 *   pastDeadline, withoutParticipantRows}. withoutParticipantRows removes
 *   the transaction's participant rows at the stop: the durable state at
 *   that point when no participant row is written before PREPARE.
 * @return {Promise<Object>} {stopped, writes, atStop, recovery}.
 */
async function runCrashScenario(options) {
  const world = createProgressWriteWorld({tables: options.tables});
  try {
    const hold = createHold(options.mutationHold || options.deliveryHold);
    const {engine} = world.createEngine(options.mutationHold ?
      {mutationHold: hold} : {deliveryHold: hold});
    const run = await startWriteTransaction(engine, 'crash', options.tables,
      'COMMIT');
    const stopped = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
    const transactionId = run.begun.transactionId;
    if (options.withoutParticipantRows === true) {
      world.store.prepare('DELETE FROM ' +
        `${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ?`)
        .run(transactionId);
    }
    const row = world.transactionRow(transactionId);
    const atStop = {
      participantSetState: row?.participant_set_state ?? null,
      decision: row?.decision ?? null,
      manifestMembers: JSON.parse(row?.participant_set_text ?? '[]').length,
      participantRows: world.participantRows(transactionId).map((participant) =>
        ({status: participant.status,
          hasDigest: typeof participant.prepared_digest === 'string'})),
    };
    const recovery = await restartAndRecover(world, transactionId,
      {pastDeadline: options.pastDeadline === true});
    return {stopped, writes: run.writes.map((write) => write.success === true),
      atStop, recovery};
  } finally {
    await world.close();
  }
}

/**
 * A live coordinator's decision write applies but its answer is lost and
 * the decision cannot be read back: the COMMIT is answered in doubt and the
 * transaction stays with its live session. After the budget, the periodic
 * sweep must adopt the recorded decision and complete it.
 * @param {Object} options - {tables}.
 * @return {Promise<Object>} {answer, sweep, final}.
 */
async function runLiveInDoubtSweepScenario(options) {
  const world = createProgressWriteWorld({tables: options.tables});
  try {
    const {engine, gateway} = world.createEngine();
    const submit = gateway.submitMutation.bind(gateway);
    const read = gateway.readAuthoritativeRows.bind(gateway);
    let decisionAnswerLost = false;
    let decisionUnreadable = false;
    gateway.submitMutation = async (mutation, mutationOptions) => {
      const applied = await submit(mutation, mutationOptions);
      if (!decisionAnswerLost && isDecisionWrite(mutation)) {
        decisionAnswerLost = true;
        decisionUnreadable = true;
        return {success: false, error: 'decision answer lost'};
      }
      return applied;
    };
    gateway.readAuthoritativeRows = async (tableName, ...rest) =>
      (decisionUnreadable && tableName === TABLES.SQL_TRANSACTIONS ?
        {success: false} : read(tableName, ...rest));
    const run = await startWriteTransaction(engine, 'in-doubt',
      options.tables, 'COMMIT');
    const answer = await run.finished;
    decisionUnreadable = false;
    world.advancePastDeadline();
    const sweep = await engine.transactionCoordinator.runRecoverySweep();
    const row = world.transactionRow(run.begun.transactionId);
    const ledger = world.ledger.entries();
    return {
      answer: {success: answer.success === true, errorCode: answer.errorCode,
        commitPointReached: answer.commitPointReached},
      sweep: sweep.results.map((entry) => ({path: entry.sweepPath,
        success: entry.success, statusAfter: entry.statusAfter})),
      final: {decision: row?.decision ?? null, status: row?.status ?? null,
        participantDecisions: ledger.map((entry) =>
          entry.decisions.map((applied) => applied.decision)),
        orphanedSessions: ledger.filter((entry) =>
          LEDGER_OPEN_STATES.has(entry.state)).length,
        violations: [...world.ledger.violations]},
    };
  } finally {
    await world.close();
  }
}

/**
 * Position facts of one measured timeline: where each participant's first
 * BEGIN, PREPARE and COMMIT delivery and each coordinator write happened.
 * @param {Object[]} timeline - measureWriteTransaction(...).timeline.
 * @return {Object} Index facts.
 */
function timelinePositionsOf(timeline) {
  const indexes = (predicate) => timeline.flatMap((event, index) =>
    (predicate(event) ? [index] : []));
  const deliveries = (operation) => indexes((event) =>
    event.kind === 'delivery' && event.operation === operation);
  const mutations = (label) => indexes((event) =>
    event.kind === 'mutation' && event.label === label);
  return {
    begins: deliveries(QUERY_OPERATION.BEGIN),
    prepares: deliveries(QUERY_OPERATION.PREPARE),
    commits: deliveries(QUERY_OPERATION.COMMIT),
    manifestAppends: mutations(MUTATION_KIND.MANIFEST_APPEND),
    preparedRows: mutations(`${MUTATION_KIND.PARTICIPANT_ROW}:PREPARED`),
    decisions: mutations(MUTATION_KIND.DECISION),
    participantRows: indexes((event) => event.kind === 'mutation' &&
      event.tableName === TABLES.SQL_TRANSACTION_PARTICIPANTS),
  };
}

export {
  MUTATION_KIND,
  classifyCoordinatorMutation,
  countOf,
  createHold,
  createProgressWriteWorld,
  isDecisionWrite,
  isManifestFreezeWrite,
  measureWriteTransaction,
  mutationLabelOf,
  nthParticipantRowWrite,
  participantDeliveryOf,
  restartAndRecover,
  runCrashScenario,
  runLiveInDoubtSweepScenario,
  startWriteTransaction,
  timelinePositionsOf,
};
