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

function createHandler(service, status, extra = {}) {
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
