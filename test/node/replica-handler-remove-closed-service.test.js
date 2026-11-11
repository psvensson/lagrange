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
import {openParticipantTransactionStore} from
  '../../src/partition/partition-participant-transaction-store.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_HANDLER_LOG_MSG} from
  '../../src/node/replica-handler-constants.js';
import {REPLICA_ABSENT_NOT_BY_OPERATION} from
  '../../src/node/replica-removal-debt-errors.js';
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
    replicaStateMachine: {
      getState: () => null,
      bindAuthoritativeRemovalAuthority: async () =>
        ({kind: REMOVAL_AUTHORITY_KIND.ABSENT}),
      ...stateMachine,
    },
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
  assert.deepEqual(facts, {
    open: [fenced, fenced, {state: REMOVAL_SERVING_STATE.DRAINED}],
    closed: [{state: REMOVAL_SERVING_STATE.CLOSED},
      {state: REMOVAL_SERVING_STATE.CLOSED},
      {state: REMOVAL_SERVING_STATE.CLOSED}],
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
