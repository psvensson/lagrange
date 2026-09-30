/**
 * Owner decision D8 (2026-09-30): a message-group registration INSERT that
 * never becomes durable must have a named re-drive owner. This witness proves
 * who it is at the executor boundary, end to end:
 *
 *   1. MessageGroupServiceRowOwner.registerReplica classifies an INSERT that
 *      cannot be confirmed as the typed, retryable outcome
 *      MESSAGE_GROUP_CREATE_OWNER_DEFERRED (deferRetry) — never a silent
 *      success, never a local ACTIVE, never a durable row.
 *   2. MessageGroupServiceHandler.createReplicaAsync forwards that exact code
 *      and its retry class on MESSAGE_GROUP_CREATE_FAILED, which is the
 *      coordinator's re-drive evidence (EXECUTOR_OUTCOME_FIELD.ERROR_CODE /
 *      DEFER_RETRY consumed by
 *      OperationWorkflowOwner.buildExecutorFailureOutcomeErrorLike).
 *   3. The coordinator's re-drive is a redelivery of the same CREATE_REPLICA
 *      operation. The executor is idempotent over the runtime the first
 *      attempt created and started, so the redelivery re-issues the
 *      registration INSERT for the SAME replica and, once durable, reaches
 *      ACTIVE through the same handler-bound activation. No second runtime
 *      generation, no orphan ACTIVE, one durable row.
 *
 * Without step 3 the deferred registration would have no owner: step 1 alone
 * is retry debt nobody consumes.
 *
 * Scheduling is deterministic (gated durable calls), never timed.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {MessageGroupServiceHandler} from
  '../../src/node/message-group-service-handler.js';
import {MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR} from
  '../../src/message-group/message-group-service-row-owner.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {createMessageGroupReplicaRuntime} from
  '../test-helpers/message-group-activation-boundary-fixture.js';

const NODE_ID = 'node-a';
const GROUP_ID = 'mg-1';
const REPLICA_ID = 'mg-1-r4';
const ADDRESS = `${NODE_ID}/message-group/${REPLICA_ID}`;
const CREATE_ACTIVE = EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE;
const CREATE_FAILED = EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED;
const OWNER_DEFERRED =
  MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CREATE_OWNER_DEFERRED;

// The durable SERVICES row. While `acceptInsert` is false the INSERT is
// submitted but never becomes durable and the authoritative read finds no
// row: the outcome-unknown registration D8 is about.
function createDurableServices() {
  let row = null;
  const insertCalls = [];
  const casCalls = [];
  const durable = {
    acceptInsert: false,
    acknowledgeInsert: true,
    refuseUpdate: false,
    insertCalls,
    casCalls,
    get row() {
      return row ? {...row} : null;
    },
    async readAuthoritativeRows() {
      return {success: true, rows: row ? [{...row}] : []};
    },
    async insertSystemTableRow(tableName, data) {
      insertCalls.push({...data});
      if (durable.acceptInsert !== true || row !== null) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      row = {...data};
      return {success: true, partitionResult:
        {affectedRows: durable.acknowledgeInsert === true ? 1 : 0}};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      casCalls.push({whereClause, data});
      if (durable.refuseUpdate === true) {
        return {success: false, partitionResult: {affectedRows: 0}};
      }
      const applied = row !== null && Object.entries(whereClause)
        .every(([column, value]) => (row[column] ?? null) === value);
      if (applied) row = {...row, ...data};
      return {success: true,
        partitionResult: {affectedRows: applied ? 1 : 0}};
    },
  };
  return durable;
}

// One node: its router, its lifecycle owner and the executor. The create hook
// is the production one's shape: an existing local runtime is reused, so a
// coordinator re-drive never mints a second generation.
function createWorld() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID});
  const stateMachine = new ReplicaStateMachine({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: {}});
  const services = new Map();
  const durable = createDurableServices();
  const outcomes = [];
  let creates = 0;
  let starts = 0;
  const executor = new MessageGroupServiceHandler({
    nodeId: NODE_ID,
    systemTableCache: {get: () => null, filter: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: durable,
    createMessageGroupReplica: async () => {
      creates += 1;
      if (services.has(REPLICA_ID)) return;
      services.set(REPLICA_ID, createMessageGroupReplicaRuntime({
        router, stateMachine, address: ADDRESS, groupId: GROUP_ID,
        replicaId: REPLICA_ID}));
    },
    startMessageGroupReplica: async () => {
      starts += 1;
    },
    stopMessageGroupReplica: async () => {},
    resolveLocalMessageGroupReplica: (replicaId) =>
      services.get(replicaId) || null,
    executorOutcomeEmitter: {
      emitOutcome(outcomeType, operationId, workflowStep, fields) {
        outcomes.push({outcomeType, operationId, ...fields});
      },
    },
  });
  executor.initialize();
  executor.registerWithRouter(router);
  // One dispatch of the coordinator's CREATE_REPLICA operation.
  const drive = (operationId) => executor.createReplicaAsync({operationId,
    groupId: GROUP_ID, replicaId: REPLICA_ID,
    replicaOptions: {groupId: GROUP_ID, replicaId: REPLICA_ID}});
  return {router, stateMachine, services, durable, outcomes, executor, drive,
    counts: () => ({creates, starts})};
}

test('D8 (1): a registration INSERT that never becomes durable is typed ' +
  'retryable evidence, not a durable row', async (t) => {
  const world = createWorld();
  await world.drive('op-1');

  t.equal(world.durable.insertCalls.length, 1,
    'the registration INSERT was attempted');
  t.equal(world.durable.row, null, 'no durable row exists');
  t.equal(world.durable.casCalls.length, 0,
    'no ACTIVE CAS was issued on a row that was never born');
  t.same(world.outcomes.map((outcome) => outcome.outcomeType),
    [CREATE_FAILED], 'the operation reports failure, never success');
  t.equal(world.outcomes[0][EXECUTOR_OUTCOME_FIELD.ERROR_CODE],
    OWNER_DEFERRED,
    'the named outcome the coordinator re-drives on');
  t.equal(world.outcomes[0][EXECUTOR_OUTCOME_FIELD.DEFER_RETRY], true,
    'carried to the coordinator as retryable, not terminal');
});

test('D8 (2): the coordinator re-drive of the same operation converges ' +
  'on one replica and one durable row', async (t) => {
  const world = createWorld();
  await world.drive('op-1');
  const firstRuntime = world.services.get(REPLICA_ID);

  // The re-drive owner: the coordinator redelivers the same CREATE_REPLICA
  // operation once the control plane accepts writes again.
  world.durable.acceptInsert = true;
  await world.drive('op-1');

  t.same(world.outcomes.map((outcome) => outcome.outcomeType),
    [CREATE_FAILED, CREATE_ACTIVE], 'the re-drive completes the operation');
  t.equal(world.durable.insertCalls.length, 2,
    'the re-drive re-issues the registration INSERT');
  t.equal(world.durable.row.status, 'active',
    'the row reaches ACTIVE through the handler-bound activation');
  t.equal(world.services.get(REPLICA_ID), firstRuntime,
    'the re-drive reuses the runtime, it never mints a second generation');
  t.equal(world.counts().starts, 2,
    'the idempotent create/start pair ran again on the same runtime');
  t.equal(world.router.getRegisteredHandler(ADDRESS),
    firstRuntime.transportHandler,
    'one exact handler at the address throughout');
});

test('D8 (3): a re-drive after an applied-but-unacknowledged INSERT never ' +
  'creates a second birth or an orphan ACTIVE', async (t) => {
  // The first drive's INSERT lands durably and reports nothing applied; its
  // activation CAS is then refused, so the operation ends as retryable
  // evidence with a STOPPED birth on disk.
  const world = createWorld();
  world.durable.acceptInsert = true;
  world.durable.acknowledgeInsert = false;
  world.durable.refuseUpdate = true;
  await world.drive('op-1');
  const registered = world.durable.row;
  t.equal(registered.status, 'stopped',
    'the applied-but-unacknowledged INSERT left a STOPPED birth');
  t.equal(world.outcomes[0].outcomeType, CREATE_FAILED,
    'the lost acknowledgement is reported, never assumed');

  // The re-drive owner redelivers the same operation.
  world.durable.refuseUpdate = false;
  await world.drive('op-1');

  t.equal(world.durable.insertCalls.length, 2,
    'the re-drive re-issues the registration INSERT');
  t.equal(world.durable.row.created_at, registered.created_at,
    'the durable incarnation is preserved: no second birth');
  t.not(world.durable.row.status, 'active',
    'no ACTIVE is written outside the handler-bound activation of the ' +
    'generation that owns the row');
  // Measured boundary, reported to the owner as the open half of D8: a
  // re-drive whose registration row carries a NEW incarnation cannot
  // recognize the durable generation its own earlier attempt created, so it
  // classifies as SERVICE_IDENTITY_CONFLICT (terminal, deferRetry false)
  // instead of resolving that generation. The invariants above hold either
  // way; which outcome is correct is an owner decision, not this witness's.
  t.equal(world.outcomes[1].outcomeType, CREATE_FAILED,
    'FINDING (D8, reported): the re-drive does not converge this case');
  t.equal(world.outcomes[1][EXECUTOR_OUTCOME_FIELD.ERROR_CODE],
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT,
    'FINDING (D8, reported): classified as an identity conflict');
});
