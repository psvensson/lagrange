/**
 * Shared world for the transaction-redundant-progress-writes witnesses
 * (quest transaction-redundant-progress-writes: removal of the ACTIVE
 * participant row written at the first write to each table) and their guard
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
 * one local database (no system-partition replication, no CDC). Except in
 * runParticipantSessionLossScenario (a real participant PartitionService of
 * test/test-helpers/participant-transaction-fixture.js), the participant is
 * the ledger double, which answers every request with success: it cannot
 * lose a session or refuse a request. The witnesses certify the
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
import {PARTICIPANT_ENLISTMENT_MODE} from
  '../../src/query/distributed/distributed-transaction-coordinator-constants.js';
import {discardParticipantSessions} from
  '../../src/partition/partition-participant-transaction-session.js';
import * as fixture from '../test-helpers/participant-transaction-fixture.js';
import {applyTransactionSettlement} from
  '../../src/query/distributed/distributed-transaction-settlement.js';
import {readTransactionReleaseCensus} from
  '../../src/query/distributed/distributed-transaction-release-census.js';
import {settleTransactionReleaseRows} from
  '../../src/query/distributed/distributed-transaction-release-settlement.js';

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
 * Whether a participant request is a consensus proposal on the workload
 * partition (R1 steps C2, C6, X3): PREPARE proposes PARTICIPANT_PREPARE, a
 * COMMIT or a bound ROLLBACK proposes PARTICIPANT_DECISION. BEGIN, QUERY,
 * the unbound read-only release and outcome reads propose nothing.
 * @param {Object} message - The participant request.
 * @return {boolean}
 */
function isParticipantProposal(message) {
  return message.operation === QUERY_OPERATION.PREPARE ||
    message.operation === QUERY_OPERATION.COMMIT ||
    (message.operation === QUERY_OPERATION.ROLLBACK &&
      typeof message.decisionDigest === 'string');
}

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
          await engineOptions.consensusRound?.();
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
          if (isParticipantProposal(copy)) {
            await engineOptions.consensusRound?.();
          }
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
      participantRowsByPartition: participantRowsByPartitionOf(mutations),
      admission: admissionFactsOf(mutations),
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

/**
 * The participant-table statuses each participant's rows were written
 * with, in submission order, by partition.
 * @param {Object[]} mutations - gateway.mutations entries.
 * @return {Object} partitionId -> statuses.
 */
function participantRowsByPartitionOf(mutations) {
  const byPartition = {};
  for (const mutation of mutations) {
    if (mutation.tableName !== TABLES.SQL_TRANSACTION_PARTICIPANTS) continue;
    const partitionId = mutation.row?.partition_id ?? null;
    (byPartition[partitionId] ??= []).push(mutation.row?.status ?? null);
  }
  return byPartition;
}

/**
 * Submissions of the participant-admission purpose (manifest appends and
 * participant rows written before the manifest freeze, the writes the
 * coordinator's telemetry counts as participantAdmission) against the
 * number of distinct manifest texts the appends installed.
 * @param {Object[]} mutations - gateway.mutations entries.
 * @return {{submissions: number, manifestChanges: number}}
 */
function admissionFactsOf(mutations) {
  const freezeAt = mutations.findIndex((mutation) =>
    classifyCoordinatorMutation(mutation).kind === MUTATION_KIND.MANIFEST_FREEZE);
  const beforeFreeze = freezeAt < 0 ? mutations : mutations.slice(0, freezeAt);
  const appends = beforeFreeze.filter((mutation) =>
    classifyCoordinatorMutation(mutation).kind === MUTATION_KIND.MANIFEST_APPEND);
  const participantRows = beforeFreeze.filter((mutation) =>
    mutation.tableName === TABLES.SQL_TRANSACTION_PARTICIPANTS);
  return {
    submissions: appends.length + participantRows.length,
    manifestChanges: new Set(appends.map((mutation) =>
      mutation.data?.participant_set_text)).size,
  };
}

const BEGIN_GATE_SCENARIO = Object.freeze({
  REPEATED_WRITES: 'repeatedWrites',
  READ_THEN_WRITE: 'readThenWrite',
  AUTHORITATIVE_ENLIST_THEN_WRITE: 'authoritativeEnlistThenWrite',
});

/**
 * How many participant BEGINs each partition received in one transaction
 * that touches its table more than once:
 * - repeatedWrites: three INSERTs into one table;
 * - readThenWrite: a transactional SELECT (volatile read enlistment) then
 *   two INSERTs into the same table (promotion to a write participant);
 * - authoritativeEnlistThenWrite: an AUTHORITATIVE enlistment (the path of
 *   a locking read, a global-index write and bindTransactionToPartition)
 *   then two INSERTs.
 * @param {string} scenario - A BEGIN_GATE_SCENARIO value.
 * @return {Promise<Object>} {beginsByPartition, statements, committed}.
 */
async function measureBeginGate(scenario) {
  const world = createProgressWriteWorld({tables: ['users']});
  try {
    const {engine} = world.createEngine();
    const sessionId = `begin-gate-${scenario}`;
    const partitionId = world.layout.partitionOf.users;
    const begun = await engine.executeQuery('BEGIN', [], {sessionId});
    const statements = [];
    const insert = async (id) => statements.push((await engine.executeQuery(
      'INSERT INTO users (id, name) VALUES (?, ?)', [id, 'v'],
      {sessionId})).success === true);
    if (scenario === BEGIN_GATE_SCENARIO.READ_THEN_WRITE) {
      statements.push((await engine.executeQuery(
        'SELECT id FROM users WHERE id = ?', ['r0'], {sessionId})).success === true);
    }
    if (scenario === BEGIN_GATE_SCENARIO.AUTHORITATIVE_ENLIST_THEN_WRITE) {
      const enlisted = await engine.transactionCoordinator.executeReadStatement(
        sessionId, begun.transactionId, ({enlist}) =>
          enlist([partitionId], PARTICIPANT_ENLISTMENT_MODE.AUTHORITATIVE));
      statements.push(enlisted.success === true);
    }
    await insert('r1');
    await insert('r2');
    if (scenario === BEGIN_GATE_SCENARIO.REPEATED_WRITES) {
      await insert('r3');
    }
    const committed = await engine.executeQuery('COMMIT', [], {sessionId,
      expectedTransactionId: begun.transactionId});
    const beginsByPartition = {};
    for (const event of world.timeline) {
      if (event.kind === 'delivery' && event.operation === QUERY_OPERATION.BEGIN) {
        beginsByPartition[event.partitionId] =
          (beginsByPartition[event.partitionId] ?? 0) + 1;
      }
    }
    return {beginsByPartition, statements, committed: committed.success === true};
  } finally {
    await world.close();
  }
}

// The two ways a new coordinator reaches the durable rows of one that
// stopped: the startup replay (activateDistributedTransactionRecovery) and
// the periodic recovery sweep's discovery (runRecoverySweep), which loads
// the rows itself.
const RECOVERY_ENTRY = Object.freeze({STARTUP: 'startup', SWEEP: 'sweep'});

// The sweep's summary, in the startup replay's terms: each swept
// transaction was recovered, and resolved or failed.
function sweepAsReplay(sweep) {
  const results = Array.isArray(sweep?.results) ? sweep.results : [];
  return {totalRecovered: results.length,
    resumed: results.filter((entry) => entry.success === true).length,
    failed: results.filter((entry) => entry.success !== true).length};
}

/**
 * Restart a crashed coordinator: a new engine over the same rows recovers
 * through the production startup path (cache rows, then the authoritative
 * re-drive) or the periodic sweep's discovery, and the facts every crash
 * witness asserts are collected.
 * @param {Object} world - The world.
 * @param {string} transactionId - The crashed transaction.
 * @param {Object} [options] - {pastDeadline, entry: a RECOVERY_ENTRY}.
 * @return {Promise<Object>} Recovery facts.
 */
async function restartAndRecover(world, transactionId, options = {}) {
  if (options.pastDeadline === true) {
    world.advancePastDeadline();
  }
  const {engine} = world.createEngine({recoverRows: true});
  const replay = options.entry === RECOVERY_ENTRY.SWEEP ?
    sweepAsReplay(await engine.transactionCoordinator.runRecoverySweep()) :
    await engine.activateDistributedTransactionRecovery();
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

// Scenario A transaction shapes with one partition (one participant) per
// table, as R1's step inventory counts them (reports/r1-commit-path.md
// section 2): new_order reads item and writes five tables; payment writes
// four. Repeated statements to a table cost hops, not rounds, so one
// statement per table measures the round and proposal counts.
const TRANSACTION_SHAPE = Object.freeze({
  NEW_ORDER: Object.freeze({name: 'new_order', reads: Object.freeze(['item']),
    writes: Object.freeze(['district', 'orders', 'new_order', 'stock',
      'order_line'])}),
  PAYMENT: Object.freeze({name: 'payment', reads: Object.freeze([]),
    writes: Object.freeze(['warehouse', 'district', 'customer', 'history'])}),
});
const ROUND_CLOCK_QUIESCENCE_TURNS = 5;
const ROUND_CLOCK_STALLED =
  'round clock stalled: the transaction waits for something that is not a ' +
  'consensus round';

function quiescence() {
  let turns = Promise.resolve();
  for (let turn = 0; turn < ROUND_CLOCK_QUIESCENCE_TURNS; turn += 1) {
    turns = turns.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return turns;
}

/**
 * A virtual clock on which every consensus round (a coordinator-table
 * mutation, a participant PREPARE or decision proposal) takes one tick and
 * everything else takes none: rounds started while the system is idle at
 * the same tick run concurrently, a round started after another one ended
 * follows it. The ticks a transaction needs are R1's "consensus rounds in
 * sequence" on a uniform network with co-located participant leaders
 * (R1 section 3, "rounds only"). It fails closed when the transaction waits
 * for anything that is not a round.
 * @return {{round: Function, run: Function}}
 */
function createRoundClock() {
  let tick = 0;
  let due = [];
  return {
    round: () => new Promise((resolve) => due.push(resolve)),
    async run(work) {
      let settled = false;
      let failure = null;
      let value;
      const running = Promise.resolve().then(work).then((result) => {
        value = result;
      }, (error) => {
        failure = error;
      }).finally(() => {
        settled = true;
      });
      const startTick = tick;
      for (;;) {
        await quiescence();
        if (due.length === 0) {
          if (settled) break;
          throw new Error(ROUND_CLOCK_STALLED);
        }
        tick += 1;
        const releasing = due;
        due = [];
        for (const release of releasing) release();
      }
      await running;
      if (failure !== null) throw failure;
      return {value, rounds: tick - startTick};
    },
  };
}

/**
 * The sequential consensus rounds and the proposals of one write
 * transaction of a shape: BEGIN, one SELECT per read table, one INSERT per
 * write table, COMMIT. Proposals are the coordinator-table mutations plus
 * the participants' PREPARE and decision proposals (R1 "Total proposals").
 * @param {Object} shape - A TRANSACTION_SHAPE value.
 * @return {Promise<Object>} {committed, rounds, proposals,
 *   coordinatorTableProposals, workloadProposals}.
 */
async function measureTransactionShape(shape) {
  const world = createProgressWriteWorld({tables: [...shape.reads,
    ...shape.writes]});
  try {
    const clock = createRoundClock();
    const {engine, gateway} = world.createEngine({
      consensusRound: clock.round});
    const sessionId = `shape-${shape.name}`;
    const measured = await clock.run(async () => {
      const begun = await engine.executeQuery('BEGIN', [], {sessionId});
      const statements = [];
      for (const table of shape.reads) {
        statements.push((await engine.executeQuery(
          `SELECT id FROM ${table} WHERE id = ?`, ['r'], {sessionId})).success);
      }
      for (const table of shape.writes) {
        statements.push((await engine.executeQuery(
          `INSERT INTO ${table} (id, name) VALUES (?, ?)`, [`${table}-1`, 'v'],
          {sessionId})).success);
      }
      const committed = await engine.executeQuery('COMMIT', [], {sessionId,
        expectedTransactionId: begun.transactionId});
      return begun.success === true && committed.success === true &&
        statements.every((success) => success === true);
    });
    const workloadProposals = world.timeline.filter((event) =>
      event.kind === 'delivery' && (event.operation === QUERY_OPERATION.PREPARE ||
        event.operation === QUERY_OPERATION.COMMIT)).length;
    return {
      committed: measured.value,
      rounds: measured.rounds,
      coordinatorTableProposals: gateway.mutations.length,
      workloadProposals,
      proposals: gateway.mutations.length + workloadProposals,
    };
  } finally {
    await world.close();
  }
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
 * Plants, for every manifest member without a participant row, the ACTIVE
 * row the unchanged tree wrote at its first write (status ACTIVE, no PREPARE
 * evidence): the durable state a coordinator of the unchanged tree leaves
 * behind when it stops before PREPARE, recovered here by this tree.
 * @param {Object} world - The witness world.
 * @param {string} transactionId - The stopped transaction.
 * @return {number} Rows planted.
 */
function plantActiveParticipantRows(world, transactionId) {
  const row = world.transactionRow(transactionId);
  const pairs = JSON.parse(row?.participant_set_text ?? '[]');
  const present = new Set(world.participantRows(transactionId)
    .map((participant) => participant.participant_id));
  const insert = world.store.prepare('INSERT INTO ' +
    `${TABLES.SQL_TRANSACTION_PARTICIPANTS} (participant_id, ` +
    'transaction_id, partition_id, status, last_error, prepared_digest, ' +
    'prepare_index, prepare_term, created_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)');
  let planted = 0;
  for (const [participantId, partitionId] of pairs) {
    if (present.has(participantId)) continue;
    insert.run(participantId, transactionId, partitionId, 'ACTIVE',
      row.updated_at, row.updated_at);
    planted += 1;
  }
  return planted;
}

/**
 * A coordinator stops at a hold during COMMIT of a write transaction over
 * `tables`; a new coordinator over the same rows recovers it.
 * @param {Object} options - {tables, mutationHold | deliveryHold predicate,
 *   pastDeadline, withoutParticipantRows, plantActiveRows, entry}.
 *   withoutParticipantRows removes the transaction's participant rows at
 *   the stop: the durable state at that point when no participant row is
 *   written before PREPARE. plantActiveRows adds the unchanged tree's
 *   ACTIVE rows (plantActiveParticipantRows). entry is a RECOVERY_ENTRY
 *   (startup replay by default).
 * @return {Promise<Object>} {stopped, writes, atStop, planted, recovery}.
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
    const planted = options.plantActiveRows === true ?
      plantActiveParticipantRows(world, transactionId) : 0;
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
      {pastDeadline: options.pastDeadline === true, entry: options.entry});
    return {stopped, writes: run.writes.map((write) => write.success === true),
      atStop, planted, recovery};
  } finally {
    await world.close();
  }
}

/**
 * A coordinator of `world` stops at a hold on a coordinator-table mutation
 * during COMMIT of a write transaction; optionally the unchanged tree's
 * ACTIVE rows are planted (plantActiveParticipantRows).
 * @param {Object} world - The witness world.
 * @param {Object} options - {tables, mutationHold, plantActiveRows}.
 * @param {string} sessionId - The transaction's session.
 * @return {Promise<Object>} {stopped, transactionId, planted}.
 */
async function stopCoordinatorAtHold(world, options, sessionId) {
  const hold = createHold(options.mutationHold);
  const {engine} = world.createEngine({mutationHold: hold});
  const run = await startWriteTransaction(engine, sessionId, options.tables,
    'COMMIT');
  const stopped = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
  const transactionId = run.begun.transactionId;
  const planted = options.plantActiveRows === true ?
    plantActiveParticipantRows(world, transactionId) : 0;
  return {stopped, transactionId, planted};
}

// What every participant applied, which sessions it still holds open, and
// the ledger's violations.
function ledgerOutcomeOf(world) {
  const ledger = world.ledger.entries();
  return {
    participantDecisions: ledger.map((entry) =>
      entry.decisions.map((applied) => applied.decision)),
    orphanedSessions: ledger.filter((entry) =>
      LEDGER_OPEN_STATES.has(entry.state)).map((entry) => entry.participantId),
    violations: [...world.ledger.violations],
  };
}

/**
 * A coordinator stops at a hold during COMMIT; past the deadline the
 * coordinator-table release settlement (settleTransactionReleaseRows, what
 * a releasing participant runs before it hands its rows on) settles the
 * stopped transaction from its census and authoritative read, with a
 * second coordinator delivering the participant decisions.
 * @param {Object} options - {tables, mutationHold, plantActiveRows}.
 * @return {Promise<Object>} {stopped, planted, census, settled, row,
 *   participantRowStatuses, participantDecisions, orphanedSessions,
 *   violations}.
 */
async function runReleaseSettlementScenario(options) {
  const world = createProgressWriteWorld({tables: options.tables});
  try {
    const {stopped, transactionId, planted} = await stopCoordinatorAtHold(
      world, options, 'release');
    world.advancePastDeadline();
    const census = readTransactionReleaseCensus(world.store);
    const service = {db: world.store, async handleApplicationMessage(request) {
      return {committed: true, settlementResult: world.store.transaction(() =>
        applyTransactionSettlement(world.store, request.settlement))()};
    }};
    const settled = await settleTransactionReleaseRows({
      engine: world.createEngine().engine, service, census,
      now: world.clock.nowMs});
    const row = world.transactionRow(transactionId);
    return {
      stopped,
      planted,
      census: {state: census.state,
        recoverable: census.recoverableTransactionIds?.length ?? null},
      settled: settled?.map((entry) => ({decision: entry.decision,
        participants: entry.participantIds.length})) ?? null,
      row: {status: row?.status ?? null, decision: row?.decision ?? null},
      participantRowStatuses: world.participantRows(transactionId)
        .map((participant) => participant.status),
      ...ledgerOutcomeOf(world),
    };
  } finally {
    await world.close();
  }
}

const AUTHORITY_UNAVAILABLE = 'authoritative read unavailable (witness)';
const FREEZE_UNAVAILABLE = 'manifest freeze unavailable (witness)';

function heldObligationOf(coordinator, transactionId) {
  const obligation = coordinator.getRecoveryObligation(transactionId);
  return obligation === null ? null : {participants: obligation.participants,
    statuses: obligation.participantDetails.map((participant) =>
      participant.status)};
}

function heldAnswerOf(answer) {
  return {success: answer?.success === true,
    errorCode: answer?.errorCode ?? null,
    decisionReadState: answer?.decisionReadState ?? null,
    participants: answer?.participants ?? null};
}

/**
 * The held state of a transaction restored from rows (the contract change
 * this quest records): a coordinator stops after the manifest append and
 * before PREPARE; past the deadline a new coordinator restores it from the
 * rows while its authoritative read is unavailable, so recovery holds it on
 * the participants it loaded from rows (before the refresh). Once the read
 * succeeds the refresh restores the manifest's participants; the freeze
 * write still failing keeps it held there (after the refresh). When the
 * freeze goes through, recovery rolls it back.
 * @param {Object} options - {tables, plantActiveRows}.
 * @return {Promise<Object>} {stopped, planted, manifest, beforeRefresh,
 *   afterRefresh, resolution}.
 */
async function runHeldObligationScenario(options) {
  const world = createProgressWriteWorld({tables: options.tables});
  try {
    const sessionId = 'held-obligation';
    const {stopped, transactionId, planted} = await stopCoordinatorAtHold(
      world, {...options, mutationHold: isManifestFreezeWrite}, sessionId);
    const manifest = JSON.parse(world.transactionRow(transactionId)
      ?.participant_set_text ?? '[]').map(([, partitionId]) => partitionId);
    world.advancePastDeadline();
    const restarted = world.createEngine({recoverRows: true});
    let authorityReadable = false;
    let freezeWritable = false;
    const read = restarted.gateway.readAuthoritativeRows.bind(restarted.gateway);
    restarted.gateway.readAuthoritativeRows = async (tableName, ...rest) =>
      (!authorityReadable && tableName === TABLES.SQL_TRANSACTIONS ?
        {success: false, error: AUTHORITY_UNAVAILABLE} :
        read(tableName, ...rest));
    const submit = restarted.gateway.submitMutation.bind(restarted.gateway);
    restarted.gateway.submitMutation = async (mutation, ...rest) => {
      if (!freezeWritable && isManifestFreezeWrite(mutation)) {
        throw new Error(FREEZE_UNAVAILABLE);
      }
      return submit(mutation, ...rest);
    };
    const coordinator = restarted.engine.transactionCoordinator;
    const replay = await restarted.engine.activateDistributedTransactionRecovery();
    const beforeRefresh = {
      replayFailed: replay?.failed ?? null,
      obligation: heldObligationOf(coordinator, transactionId),
      clientCommit: heldAnswerOf(await restarted.engine.executeQuery('COMMIT',
        [], {sessionId, expectedTransactionId: transactionId})),
    };
    authorityReadable = true;
    await coordinator.runRecoverySweep();
    const afterRefresh = {
      obligation: heldObligationOf(coordinator, transactionId),
      clientCommit: heldAnswerOf(await restarted.engine.executeQuery('COMMIT',
        [], {sessionId, expectedTransactionId: transactionId})),
    };
    freezeWritable = true;
    await coordinator.runRecoverySweep();
    await restarted.engine.shutdown();
    const row = world.transactionRow(transactionId);
    return {
      stopped,
      planted,
      manifest,
      beforeRefresh,
      afterRefresh,
      resolution: {
        obligation: heldObligationOf(coordinator, transactionId),
        decision: row?.decision ?? null,
        status: row?.status ?? null,
        ...ledgerOutcomeOf(world),
      },
    };
  } finally {
    await world.close();
  }
}

/**
 * The coordinator appends the participant to the manifest and stops before
 * the participant's BEGIN is delivered (the hold is on the delivery); a new
 * coordinator recovers the OPEN row past its deadline.
 * @param {Object} options - {tables}.
 * @return {Promise<Object>} {stopped, atStop, begins, recovery}.
 */
async function runBeginNotDeliveredCrashScenario(options) {
  const world = createProgressWriteWorld({tables: options.tables});
  try {
    const hold = createHold(participantDeliveryOf(QUERY_OPERATION.BEGIN));
    const {engine} = world.createEngine({deliveryHold: hold});
    const sessionId = 'begin-not-delivered';
    const begun = await engine.executeQuery('BEGIN', [], {sessionId});
    void engine.executeQuery(`INSERT INTO ${options.tables[0]} (id, name) ` +
      'VALUES (?, ?)', ['never-staged', 'v'], {sessionId});
    const stopped = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
    const row = world.transactionRow(begun.transactionId);
    const atStop = {
      participantSetState: row?.participant_set_state ?? null,
      decision: row?.decision ?? null,
      manifestMembers: JSON.parse(row?.participant_set_text ?? '[]').length,
    };
    const recovery = await restartAndRecover(world, begun.transactionId,
      {pastDeadline: true});
    return {stopped, atStop,
      begins: world.ledger.entries().map((entry) => entry.begins), recovery};
  } finally {
    await world.close();
  }
}

const SESSION_LOSS_TABLE = 'test_table';
const SESSION_LOSS_INSERT =
  `INSERT INTO ${SESSION_LOSS_TABLE} (id, value) VALUES (?, ?)`;
const REAL_PARTICIPANT_SESSION = 'real-participant';

/**
 * One coordinator (the real SQLQueryEngine) over one real participant (a
 * production PartitionService of the TX1 participant fixture, leader of its
 * own controllable consensus port). `script` drives the transaction; the
 * router records every participant answer and may fail a delivery before
 * it reaches the participant (options.failDelivery(message) returns the
 * error to throw, or null).
 * @param {Function} script - ({leader, proposed, engine, gateway, answers,
 *   undelivered}) => facts.
 * @param {Object} [options] - {failDelivery}.
 * @return {Promise<Object>} What the script returned.
 */
async function onRealParticipant(script, options = {}) {
  fixture.resetFixtureSingletons();
  const tablesRow = Object.freeze({table_id: SESSION_LOSS_TABLE,
    table_name: SESSION_LOSS_TABLE, active_partition_version: 1});
  // The participant's own tables row: the partition-epoch evidence a
  // routed write is checked against (partition-service-remote-query-methods.js).
  const participantCache = Object.freeze({getAll: () => [], filter: () => [],
    get: (type, key) => (type === TABLES.TABLES && key === SESSION_LOSS_TABLE ?
      tablesRow : null)});
  try {
    return await fixture.onFixtureLeader(async (leader, proposed) => {
      const answers = [];
      const undelivered = [];
      const gateway = createTransactionPersistenceGateway();
      const cache = createMockSystemCache(
        [{table_name: SESSION_LOSS_TABLE, primaryKey: 'id'}],
        [{partition_id: leader.partitionId, table_name: SESSION_LOSS_TABLE,
          partition_key_start: null, partition_key_end: null}]);
      const engine = new SQLQueryEngine({
        controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
        systemCache: cache, controlPlaneSystemTableGateway: gateway,
        autoStartDistributedTransactionRecovery: false,
        unrefRetryDelayTimers: true, logger: SILENT_LOGGER,
        messageRouter: {async deliver(_address, message) {
          const failure = options.failDelivery?.(message) ?? null;
          if (failure !== null) {
            undelivered.push(message.operation ?? message.type);
            throw failure;
          }
          const answer = await leader.handleApplicationMessage(
            structuredClone(message));
          answers.push({operation: message.operation ?? message.type,
            success: answer?.success === true,
            failureCode: answer?.failureCode ?? null});
          return buildDeliveryEnvelope({acknowledged: true}, answer);
        }},
      });
      engine.transactionCoordinator.sleep = async () => {};
      engine.transactionCoordinator.logger = SILENT_LOGGER;
      try {
        return await script({leader, proposed, engine, gateway, answers,
          undelivered});
      } finally {
        await engine.shutdown();
        gateway.db.close();
      }
    }, {systemTableCache: participantCache});
  } finally {
    fixture.clearFixtureSingletons();
  }
}

/**
 * The begin gate against a real participant: two writes are staged in one
 * session, the participant then loses its volatile sessions (what a
 * participant-leader change does; the fixture's discardParticipantSessions),
 * and a third write follows. The coordinator must not open a second session
 * with BEGIN, which would silently drop the first two writes; the
 * participant must refuse the write, and the transaction must end in one
 * ROLLBACK with nothing applied.
 * @return {Promise<Object>} Facts.
 */
async function runParticipantSessionLossScenario() {
  return onRealParticipant(async ({leader, proposed, engine, gateway,
    answers}) => {
    const sessionId = 'session-loss';
    const begun = await engine.executeQuery('BEGIN', [], {sessionId});
    const statements = [];
    for (const id of ['s1', 's2']) {
      statements.push((await engine.executeQuery(SESSION_LOSS_INSERT,
        [id, 'v'], {sessionId})).success === true);
    }
    discardParticipantSessions(leader);
    const lossFrom = answers.length;
    const afterLoss = await engine.executeQuery(SESSION_LOSS_INSERT,
      ['s3', 'v'], {sessionId});
    statements.push(afterLoss.success === true);
    const lossAnswers = answers.slice(lossFrom);
    const rollingBack = engine.executeQuery('ROLLBACK', [], {sessionId,
      expectedTransactionId: begun.transactionId});
    await fixture.applyProposal(leader, proposed, fixture.isDecisionCommand);
    const rolledBack = await rollingBack;
    const participantRows = leader.db.prepare('SELECT state, decision ' +
      'FROM _participant_transactions WHERE participant_id = ?')
      .all(`${begun.transactionId}:${leader.partitionId}`);
    return {
      begins: answers.filter((answer) =>
        answer.operation === QUERY_OPERATION.BEGIN).length,
      statements,
      beginsAfterLoss: lossAnswers.filter((answer) =>
        answer.operation === QUERY_OPERATION.BEGIN).length,
      refusalAfterLoss: lossAnswers.find((answer) =>
        answer.success !== true)?.failureCode ?? null,
      rolledBack: rolledBack.success === true,
      appliedRows: leader.db.prepare(
        `SELECT COUNT(*) AS n FROM ${SESSION_LOSS_TABLE}`).get().n,
      participantRows,
      row: (({status, decision}) => ({status, decision}))(
        gateway.rows(TABLES.SQL_TRANSACTIONS)[0] || {}),
    };
  });
}

/**
 * Commits every proposal the participant leader makes, in order, as its
 * consensus group would (PREPARE, then the decision).
 * @param {Object} leader - The fixture leader.
 * @param {Object[]} proposed - Its proposal log.
 * @return {{committed: Object[], stop: Function}}
 */
function commitEveryProposal(leader, proposed) {
  let running = true;
  let next = 0;
  const committed = [];
  const loop = (async () => {
    while (running) {
      while (next < proposed.length) {
        const entry = proposed[next];
        next += 1;
        committed.push({type: entry.type,
          error: fixture.applyCommitted(leader, entry)});
      }
      await fixture.settle();
    }
  })();
  return {committed, stop: async () => {
    running = false;
    await loop;
  }};
}

// Each scenario stages writes through the real participant, then ends the
// transaction with the client's COMMIT or ROLLBACK.
const REAL_PARTICIPANT_SCENARIO = Object.freeze({
  // Control: two writes staged in one session, then COMMIT.
  COMMITTED: Object.freeze({name: 'committed', writes: 2, finish: 'COMMIT'}),
  // The BEGIN never reaches the participant (the delivery fails), so the
  // participant never began; the client then COMMITs.
  NEVER_BEGAN: Object.freeze({name: 'never-began', writes: 1,
    finish: 'COMMIT', failBegin: true}),
  // A participant-leader change between enlistment and COMMIT: the
  // participant loses the session holding two staged writes.
  LOST_BEFORE_COMMIT: Object.freeze({name: 'lost-before-commit', writes: 2,
    finish: 'COMMIT', loseSessions: true}),
  // The same change before the client's ROLLBACK.
  LOST_BEFORE_ROLLBACK: Object.freeze({name: 'lost-before-rollback',
    writes: 2, finish: 'ROLLBACK', loseSessions: true}),
});
const BEGIN_UNDELIVERED = 'participant unreachable: BEGIN not delivered';
// The executor retries an undelivered request until its execution deadline;
// a short one ends the never-began statement in milliseconds (as in
// test/query/named-write-cdc-sticky-unknown.test.js).
const UNDELIVERED_BEGIN_DEADLINE_MS = 200;

function outcomeFactsOf(answer) {
  return {success: answer?.success === true,
    errorCode: answer?.errorCode ?? null,
    stage: answer?.stage ?? null};
}

/**
 * One REAL_PARTICIPANT_SCENARIO against a real participant.
 * @param {Object} scenario - A REAL_PARTICIPANT_SCENARIO value.
 * @return {Promise<Object>} Facts: what reached the participant, the
 *   client's answers, what each side recorded and what was applied.
 */
async function runRealParticipantScenario(scenario) {
  const failDelivery = (message) => (scenario.failBegin === true &&
    message.operation === QUERY_OPERATION.BEGIN ?
    new Error(BEGIN_UNDELIVERED) : null);
  return onRealParticipant(async ({leader, proposed, engine, gateway,
    answers, undelivered}) => {
    if (scenario.failBegin === true) {
      engine.queryExecutor.queryTimeoutMs = UNDELIVERED_BEGIN_DEADLINE_MS;
    }
    const pump = commitEveryProposal(leader, proposed);
    try {
      const sessionId = REAL_PARTICIPANT_SESSION;
      const begun = await engine.executeQuery('BEGIN', [], {sessionId});
      const statements = [];
      for (let write = 1; write <= scenario.writes; write += 1) {
        statements.push(outcomeFactsOf(await engine.executeQuery(
          SESSION_LOSS_INSERT, [`w${write}`, 'v'], {sessionId})));
      }
      if (scenario.loseSessions === true) discardParticipantSessions(leader);
      const finishFrom = answers.length;
      const finished = outcomeFactsOf(await engine.executeQuery(
        scenario.finish, [], {sessionId,
          expectedTransactionId: begun.transactionId}));
      const row = gateway.rows(TABLES.SQL_TRANSACTIONS)[0] || {};
      return {
        beginsDelivered: answers.filter((answer) =>
          answer.operation === QUERY_OPERATION.BEGIN).length,
        beginsUndelivered: undelivered.filter((operation) =>
          operation === QUERY_OPERATION.BEGIN).length,
        statements,
        finished,
        finishAnswers: answers.slice(finishFrom).map((answer) =>
          `${answer.operation}:${answer.success ? 'ok' : answer.failureCode}`),
        transactionRow: {status: row.status ?? null,
          decision: row.decision ?? null},
        participantRowWrites: gateway.mutations.filter((mutation) =>
          mutation.tableName === TABLES.SQL_TRANSACTION_PARTICIPANTS)
          .map((mutation) => mutation.row?.status ?? mutation.data?.status ??
            null),
        participantRecords: leader.db.prepare('SELECT state, decision ' +
          'FROM _participant_transactions WHERE participant_id = ?')
          .all(`${begun.transactionId}:${leader.partitionId}`),
        committedProposals: pump.committed.map((entry) =>
          (entry.error === null ? entry.type : `${entry.type}:${entry.error}`)),
        appliedRows: leader.db.prepare(
          `SELECT COUNT(*) AS n FROM ${SESSION_LOSS_TABLE}`).get().n,
      };
    } finally {
      await pump.stop();
    }
  }, {failDelivery});
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
  BEGIN_GATE_SCENARIO,
  REAL_PARTICIPANT_SCENARIO,
  RECOVERY_ENTRY,
  TRANSACTION_SHAPE,
  isDecisionWrite,
  isManifestFreezeWrite,
  measureBeginGate,
  measureTransactionShape,
  measureWriteTransaction,
  nthParticipantRowWrite,
  participantDeliveryOf,
  runBeginNotDeliveredCrashScenario,
  runCrashScenario,
  runHeldObligationScenario,
  runParticipantSessionLossScenario,
  runRealParticipantScenario,
  runReleaseSettlementScenario,
  timelinePositionsOf,
};
