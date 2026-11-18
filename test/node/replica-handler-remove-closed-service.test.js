/**
 * Every REMOVE_REPLICA entry point of the production replica handler, driven
 * against a partition service whose removal-serving surface is the
 * partition's own (PARTITION_SERVICE_REMOVAL_SERVING_METHODS), in each local
 * lifecycle state, with its connection open and with it released by
 * teardown (db null, as the lifecycle owner leaves it).
 *
 * The defect this pins: a duplicate REMOVE arriving while the first removal
 * tore the replica down re-ran the removal fence, whose participant custody
 * read went through the released connection (WeakMap key null, TypeError)
 * and the router reported ROUTER_HANDLER_FAILED. A duplicate answers the
 * in-progress state from the removal owner; a resumed removal's fence on a
 * closed service answers CLOSED; after completion by the same operation the
 * answer is COMPLETED.
 *
 * And the two answers on either side of that (M1, M3): a removal that finds
 * its replica's connection released by anything but its own earlier
 * teardown (no durable retiring row yet) never publishes the retiring row -
 * it defers before its point of no return, the replica keeping its status;
 * a resumed removal (its retiring row already durable) treats CLOSED as
 * satisfied and continues. A REMOVE asked after completion by ANOTHER
 * operation, the row ABSENT, answers a typed, non-deferred
 * REPLICA_ABSENT_NOT_BY_OPERATION (nothing will change that answer).
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';

import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {REMOVAL_AUTHORITY_KIND} from '../../src/node/replica-state-machine-recovery.js';
import {
  PARTITION_SERVICE_REMOVAL_SERVING_METHODS,
  REMOVAL_SERVING_STATE,
} from '../../src/partition/partition-service-removal-serving-methods.js';
import {notifyRemovalServingDrain} from
  '../../src/partition/partition-service-removal-drain-wake.js';
import {
  insertParticipantTransactionRow,
  openParticipantTransactionStore,
  readParticipantTransactionRow,
  updateParticipantTransactionDecided,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  PARTICIPANT_TRANSACTION_CUSTODY,
  PARTICIPANT_TRANSACTION_DECISION,
  PARTICIPANT_TRANSACTION_STATE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {
  createLifecycleServiceRow,
  createLifecycleStateStore,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_HANDLER_LOG_MSG} from
  '../../src/node/replica-handler-constants.js';
import {
  REPLICA_ABSENT_NOT_BY_OPERATION,
  REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED,
} from '../../src/node/replica-removal-debt-errors.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const PARTITION_ID = 'remove-closed-p1';
const REPLICA_ID = 'remove-closed-r1';
const FIRST_OP = 'remove-closed-op-1';
const DUPLICATE_OP = 'remove-closed-op-2';
const STATUS = ReplicaOperationResponseStatus;

let dataDir;
beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-remove-closed-'));
});
afterEach(() => fs.rmSync(dataDir, {recursive: true, force: true}));

// The partition's own removal-serving methods over a connection that is open
// (the participant store opened on it) or released by teardown.
function partitionServingSurface(open) {
  const db = open ? new Database(':memory:') : null;
  if (db) openParticipantTransactionStore(db);
  const service = Object.assign({
    partitionId: PARTITION_ID, replicaId: REPLICA_ID, db,
    activeServingRequestCount: 0, removalServingAdmissionFenced: false,
    removalDrainWakes: new Set(),
    async shutdown() {
      service.db?.close();
      service.db = null;
    },
  }, PARTITION_SERVICE_REMOVAL_SERVING_METHODS);
  return service;
}

function createHandler(service, status, extra = {}, stateMachine = {}) {
  const handler = new ReplicaHandler({
    nodeId: 'remove-closed-node', dataDir,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => [],
      on() {}, off() {}},
    cdcIntegrationService: {},
    createPartitionService: () => {
      throw new Error('this world creates no partition service');
    },
    // The lifecycle owner's surface this world reads, on its event port
    // (the handler subscribes to its TIMEOUT re-drive signal).
    replicaStateMachine: Object.assign(new EventEmitter(), {
      getState: () => null,
      bindAuthoritativeRemovalAuthority: async () =>
        ({kind: REMOVAL_AUTHORITY_KIND.ABSENT}),
      ...stateMachine,
    }),
  });
  const started = [];
  handler.startRemoveReplicaAsync = (request) => started.push(
    request[ReplicaOperationField.OPERATION_ID]);
  handler.localServices.set(REPLICA_ID, service);
  handler.localReplicas.set(REPLICA_ID, {replicaId: REPLICA_ID,
    partitionId: PARTITION_ID, status, service, ...extra});
  return {handler, started};
}

function removeRequest(operationId) {
  return {
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.REMOVE_REPLICA,
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    [ReplicaOperationField.REPLICA_ID]: REPLICA_ID,
    [ReplicaOperationField.REASON]: 'rebalancing',
  };
}

async function answerOf(handler, operationId) {
  try {
    return (await handler.handleRemoveReplica(removeRequest(operationId))).status;
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

// The typed fields of a REMOVE answer.
async function typedAnswerOf(handler, operationId) {
  const answer = await handler.handleRemoveReplica(removeRequest(operationId));
  return {status: answer.status, errorCode: answer.errorCode ?? null,
    deferRetry: answer.deferRetry ?? null};
}

test('a duplicate REMOVE while the first removal tears the replica down ' +
  '(connection released) answers IN_PROGRESS from the removal owner and never ' +
  'touches the service', async () => {
  const service = partitionServingSurface(true);
  const {handler, started} = createHandler(service, ReplicaStatus.ACTIVE);
  const first = await answerOf(handler, FIRST_OP);
  // The first removal's teardown released the connection.
  await service.shutdown();
  const duplicate = await answerOf(handler, DUPLICATE_OP);
  const sameOperation = await answerOf(handler, FIRST_OP);
  assert.deepEqual({first, duplicate, sameOperation, started,
    fenced: service.removalServingAdmissionFenced}, {
    first: STATUS.INITIATED, duplicate: STATUS.IN_PROGRESS,
    sameOperation: STATUS.IN_PROGRESS, started: [FIRST_OP], fenced: true});
});

test('the removal fence and drain answer CLOSED on a released connection, ' +
  'FENCED and DRAINED on an open one, and are idempotent', async () => {
  const open = partitionServingSurface(true);
  const closed = partitionServingSurface(false);
  const facts = {
    open: [open.fenceServingAdmissionForRemoval(),
      open.fenceServingAdmissionForRemoval(),
      await open.waitForRemovalServingDrain({pollIntervalMs: 1})],
    closed: [closed.fenceServingAdmissionForRemoval(),
      closed.fenceServingAdmissionForRemoval(),
      await closed.waitForRemovalServingDrain({pollIntervalMs: 1})],
  };
  const fenced = {state: REMOVAL_SERVING_STATE.FENCED,
    activeServingRequestCount: 0, participantTransactionActive: false};
  // A released connection never answers custody settled: what it holds
  // durably cannot be read through it (2026-11-11).
  const closedUnknown = {state: REMOVAL_SERVING_STATE.CLOSED,
    participantCustody: PARTICIPANT_TRANSACTION_CUSTODY.UNAVAILABLE};
  assert.deepEqual(facts, {
    open: [fenced, fenced, {state: REMOVAL_SERVING_STATE.DRAINED}],
    closed: [closedUnknown, closedUnknown, closedUnknown],
  });
  open.db.close();
});

test('every REMOVE entry point answers a named status in every local ' +
  'lifecycle state, open or released, and never throws', async () => {
  const cases = [
    // [label, status, extra, removal in progress, expected answer]
    ['active', ReplicaStatus.ACTIVE, {}, false, STATUS.INITIATED],
    ['failed', ReplicaStatus.FAILED, {}, false, STATUS.INITIATED],
    ['removing in progress', ReplicaStatus.REMOVING, {}, true, STATUS.IN_PROGRESS],
    ['removing resumed', ReplicaStatus.REMOVING, {}, false, STATUS.IN_PROGRESS],
    ['removed by this operation', ReplicaStatus.REMOVED,
      {removedByOperationId: DUPLICATE_OP}, false, STATUS.COMPLETED],
  ];
  const observed = {};
  const expected = {};
  for (const [label, status, extra, inProgress, answer] of cases) {
    for (const open of [true, false]) {
      const service = partitionServingSurface(open);
      const {handler} = createHandler(service, status, extra);
      if (inProgress) {
        handler.trackReplicaRemovalOperation(FIRST_OP, PARTITION_ID, REPLICA_ID);
      }
      const key = `${label} (${open ? 'open' : 'released'})`;
      observed[key] = await answerOf(handler, DUPLICATE_OP);
      expected[key] = answer;
      service.db?.close();
    }
  }
  assert.deepEqual(observed, expected);
});

test('a REMOVE asked after completion answers COMPLETED to the operation ' +
  'that removed the replica, and a typed non-deferred ' +
  'REPLICA_ABSENT_NOT_BY_OPERATION to any other operation', async () => {
  const facts = {};
  for (const open of [true, false]) {
    const service = partitionServingSurface(open);
    const {handler, started} = createHandler(service, ReplicaStatus.REMOVED,
      {removedByOperationId: FIRST_OP});
    facts[open ? 'open' : 'released'] = {
      same: await typedAnswerOf(handler, FIRST_OP),
      other: await typedAnswerOf(handler, DUPLICATE_OP),
      started,
    };
    service.db?.close();
  }
  const expected = {
    same: {status: STATUS.COMPLETED, errorCode: null, deferRetry: null},
    other: {status: STATUS.ERROR, errorCode: REPLICA_ABSENT_NOT_BY_OPERATION,
      deferRetry: false},
    started: [],
  };
  assert.deepEqual(facts, {open: expected, released: expected});
});

// What one async removal did up to its consensus exit: whether it published
// its retiring row, entered the consensus-exit wait, and which deferral
// (with its cause) it logged. The exit wait stops the run there.
async function runRemovalUntilConsensusExit(status, trackedState) {
  const service = partitionServingSurface(false);
  const {handler} = createHandler(service, status, {},
    {getState: () => trackedState});
  const facts = {publishedRetiringRow: false, enteredConsensusExit: false,
    deferral: null, statusWrites: []};
  handler.persistReplicaStatusWithRetry = async (_id, written) => {
    facts.statusWrites.push(written);
  };
  const publish = handler.publishReplicaRetiringRow.bind(handler);
  handler.publishReplicaRetiringRow = async (context) => {
    facts.publishedRetiringRow = true;
    return publish(context);
  };
  handler.awaitReplicaRemovalConsensusExit = async () => {
    facts.enteredConsensusExit = true;
    throw new Error('stop at the consensus exit');
  };
  const warn = handler.logger.warn.bind(handler.logger);
  handler.logger = Object.assign(Object.create(handler.logger), {
    warn(message, fields) {
      if (message === REPLICA_HANDLER_LOG_MSG.REMOVE_DEFERRED_WITHOUT_ROW) {
        facts.deferral = fields.cause;
      }
      return warn(message, fields);
    },
  });
  handler.trackReplicaRemovalOperation(FIRST_OP, PARTITION_ID, REPLICA_ID);
  try {
    await handler.removeReplicaAsync({operationId: FIRST_OP,
      partitionId: PARTITION_ID, replicaId: REPLICA_ID, reason: 'rebalancing'});
  } catch {
    // The stop at the consensus exit.
  }
  facts.inProgress = handler.inProgressOperations.has(FIRST_OP);
  facts.localStatus = handler.getLocalReplica(REPLICA_ID)?.status ?? null;
  return facts;
}

test('a removal whose replica connection was released outside it defers ' +
  'before its retiring row; a resumed removal treats CLOSED as its own ' +
  'teardown and continues', async () => {
  const outside = await runRemovalUntilConsensusExit(ReplicaStatus.ACTIVE,
    null);
  const resumed = await runRemovalUntilConsensusExit(ReplicaStatus.REMOVING,
    ReplicaStatus.REMOVING);
  assert.deepEqual({outside, resumed}, {
    outside: {publishedRetiringRow: false, enteredConsensusExit: false,
      deferral: 'serving_closed_outside_removal', statusWrites: [],
      inProgress: false, localStatus: ReplicaStatus.ACTIVE},
    resumed: {publishedRetiringRow: true, enteredConsensusExit: true,
      deferral: null, statusWrites: [],
      inProgress: false, localStatus: ReplicaStatus.REMOVING},
  });
});

// M1 on real participant debt (2026-11-11): a RESUMED removal (its REMOVING
// row durable) of a replica whose connection was released, whose database
// file holds a durable PREPARED participant transaction - driven through the
// production entry point (handleRemoveReplica and its real asynchronous
// removal start), on the real lifecycle owner and a real database file.
const TX = Object.freeze({transactionId: 'tx-closed-1',
  participantId: 'participant-closed-1'});
const NODE_ID = 'remove-closed-node';

function seedPreparedParticipant(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const db = new Database(dbPath);
  try {
    openParticipantTransactionStore(db);
    insertParticipantTransactionRow(db, {...TX, sessionId: 'session-closed-1',
      commitMode: 'two-phase', transactionEpoch: 1,
      state: PARTICIPANT_TRANSACTION_STATE.PREPARED,
      operationsText: '[]', preparedDigest: 'digest-1',
      prepareEntryId: 'prepare-1', prepareIndex: 7, prepareTerm: 1});
  } finally {
    db.close();
  }
}

function settlePreparedParticipant(dbPath) {
  const db = new Database(dbPath);
  try {
    updateParticipantTransactionDecided(db, {...TX,
      state: PARTICIPANT_TRANSACTION_STATE.COMMITTED,
      decision: PARTICIPANT_TRANSACTION_DECISION.COMMIT,
      decisionDigest: 'decision-1', decisionEntryId: 'decide-1',
      decisionIndex: 8, decisionTerm: 1});
  } finally {
    db.close();
  }
}

function participantStateAt(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, {readonly: true});
  try {
    return readParticipantTransactionRow(db, TX)?.state ?? null;
  } finally {
    db.close();
  }
}

function openResumedRemovalWorld() {
  const removingRow = createLifecycleServiceRow({replicaId: REPLICA_ID,
    partitionId: PARTITION_ID, nodeId: NODE_ID, status: ReplicaStatus.REMOVING,
    createdAt: 1, stateEnteredAt: 2});
  const store = createLifecycleStateStore({services: [removingRow],
    partitions: [createPartitionRow({partitionId: PARTITION_ID,
      leaderNodeId: null})]});
  const replicaStateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway});
  replicaStateMachine.registerReplicaSnapshot(REPLICA_ID, {
    partitionId: PARTITION_ID, nodeId: NODE_ID, state: ReplicaStatus.REMOVING,
    serviceId: REPLICA_ID, serviceType: removingRow.service_type,
    serviceAddress: removingRow.address, replicaIdentity: removingRow.replica_id,
    groupId: removingRow.group_id, cleanupToken: removingRow.cleanup_token,
    createAttemptToken: removingRow.create_attempt_token,
    createdAt: removingRow.created_at, durableVersionColumn: 'state_entered_at',
    durableVersion: removingRow.state_entered_at,
    durableUpdatedAt: removingRow.updated_at, authoritativeSnapshot: true});
  const outcomes = [];
  let reopened = 0;
  const handler = new ReplicaHandler({nodeId: NODE_ID, dataDir,
    systemTableCache: store.cache, cdcIntegrationService: {},
    controlPlaneSystemTableGateway: store.gateway,
    createPartitionService: () => {
      reopened += 1;
      throw new Error('a removal never reopens the service');
    },
    replicaStateMachine,
    executorOutcomeEmitter: {emitOutcome: (...args) => outcomes.push(args)}});
  // The replica's connection was released by its earlier teardown.
  const service = partitionServingSurface(false);
  handler.localServices.set(REPLICA_ID, service);
  handler.localReplicas.set(REPLICA_ID, {replicaId: REPLICA_ID,
    partitionId: PARTITION_ID, status: ReplicaStatus.REMOVING, service});
  const dbPath = handler.getPartitionDbPath(PARTITION_ID, REPLICA_ID);
  return {handler, store, service, outcomes, dbPath,
    reopened: () => reopened,
    durableStatus: () => store.durable.services.get(REPLICA_ID)?.status ?? null,
    async removeAndSettle(operationId) {
      const answer = await handler.handleRemoveReplica(
        removeRequest(operationId));
      for (let turn = 0; turn < 200 &&
        handler.inProgressOperations.has(operationId); turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      return answer.status;
    },
  };
}

// The last executor outcome: emitOutcome(type, operationId, step, options).
function lastOutcomeOf(world) {
  const [type, , , options] = world.outcomes.at(-1) ?? [];
  return type === undefined ? null : {type,
    errorCode: options?.errorCode ?? null,
    deferRetry: options?.deferRetry ?? null};
}

test('M1 witness: a resumed removal of a released connection with a durable ' +
  'PREPARED participant defers typed and keeps everything; once the ' +
  'participant is settled the same removal completes; a duplicate after ' +
  'completion answers idempotently without reopening the service',
async () => {
  const world = openResumedRemovalWorld();
  seedPreparedParticipant(world.dbPath);
  // (a) the refusal: nothing retired, deleted or completed.
  const first = await world.removeAndSettle(FIRST_OP);
  const refused = {answer: first, outcome: lastOutcomeOf(world),
    durableStatus: world.durableStatus(),
    localStatus: world.handler.getLocalReplica(REPLICA_ID)?.status ?? null,
    databaseKept: fs.existsSync(world.dbPath),
    participant: participantStateAt(world.dbPath)};
  // The participant is settled through its decision.
  settlePreparedParticipant(world.dbPath);
  // (b) the resumed useful work: the same removal completes.
  const second = await world.removeAndSettle(FIRST_OP);
  const completed = {answer: second, outcome: lastOutcomeOf(world),
    durableStatus: world.durableStatus(),
    localStatus: world.handler.getLocalReplica(REPLICA_ID)?.status ?? null,
    databaseKept: fs.existsSync(world.dbPath)};
  // (c) a duplicate after completion.
  const duplicate = await world.handler.handleRemoveReplica(
    removeRequest(FIRST_OP));
  assert.deepEqual({refused, completed, duplicate: duplicate.status,
    reopened: world.reopened(), db: world.service.db}, {
    refused: {answer: STATUS.IN_PROGRESS,
      outcome: {type: EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
        errorCode: REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED,
        deferRetry: true},
      durableStatus: ReplicaStatus.REMOVING,
      localStatus: ReplicaStatus.REMOVING, databaseKept: true,
      participant: PARTICIPANT_TRANSACTION_STATE.PREPARED},
    completed: {answer: STATUS.IN_PROGRESS,
      outcome: {type: EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
        errorCode: null, deferRetry: null},
      durableStatus: null, localStatus: ReplicaStatus.REMOVED,
      databaseKept: false},
    duplicate: STATUS.COMPLETED, reopened: 0, db: null});
});

// The drain waits on the named change that ends it, never a poll: a
// serving request finishing, a PREPARED row decided (the port's applied
// progress), the connection released.
test('the removal drain is woken by the change that ends it, never polls',
  async () => {
    const turns = async (count = 20) => {
      for (let turn = 0; turn < count; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    };
    const settledOf = (promise) => {
      const box = {value: null};
      promise.then((value) => {
        box.value = value;
      });
      return box;
    };
    const service = partitionServingSurface(true);
    const listeners = new Set();
    service.raft = {subscribe: (_event, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }};
    // A serving request in flight.
    service.activeServingRequestCount = 1;
    const byRequest = settledOf(service.waitForRemovalServingDrain());
    await turns();
    const requestPending = byRequest.value;
    service.activeServingRequestCount = 0;
    await turns();
    const unannounced = byRequest.value;
    notifyRemovalServingDrain(service);
    await turns();
    const afterRequest = byRequest.value;
    // A PREPARED participant, decided by a committed entry.
    insertParticipantTransactionRow(service.db, {...TX,
      sessionId: 'drain-session', commitMode: 'two-phase',
      transactionEpoch: 1, state: PARTICIPANT_TRANSACTION_STATE.PREPARED,
      operationsText: '[]', preparedDigest: 'd', prepareEntryId: 'p',
      prepareIndex: 3, prepareTerm: 1});
    const byDecision = settledOf(service.waitForRemovalServingDrain());
    await turns();
    const preparedPending = byDecision.value;
    updateParticipantTransactionDecided(service.db, {...TX,
      state: PARTICIPANT_TRANSACTION_STATE.COMMITTED,
      decision: PARTICIPANT_TRANSACTION_DECISION.COMMIT, decisionDigest: 'x',
      decisionEntryId: 'e', decisionIndex: 4, decisionTerm: 1});
    for (const listener of [...listeners]) listener();
    await turns();
    const afterDecision = byDecision.value;
    // Busy again, then the connection is released.
    service.activeServingRequestCount = 1;
    const byRelease = settledOf(service.waitForRemovalServingDrain());
    await turns();
    service.db.close();
    service.db = null;
    notifyRemovalServingDrain(service);
    await turns();
    assert.deepEqual({requestPending, unannounced, afterRequest,
      preparedPending, afterDecision, afterRelease: byRelease.value,
      listenersLeft: listeners.size}, {
      requestPending: null, unannounced: null,
      afterRequest: {state: REMOVAL_SERVING_STATE.DRAINED},
      preparedPending: null,
      afterDecision: {state: REMOVAL_SERVING_STATE.DRAINED},
      afterRelease: {state: REMOVAL_SERVING_STATE.CLOSED,
        participantCustody: PARTICIPANT_TRANSACTION_CUSTODY.UNAVAILABLE},
      listenersLeft: 0});
  });
