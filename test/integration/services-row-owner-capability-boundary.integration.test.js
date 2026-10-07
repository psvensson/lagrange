import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {CDCIntegrationService} from
  '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {ReplicaStateMachine} from
  '../../src/node/replica-state-machine.js';
import {isReplicaServiceHandlerBound} from
  '../../src/node/replica-transport-handler-identity.js';
import {PartitionService} from
  '../../src/partition/partition-service.js';
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {
  SYSTEM_TABLE_NAME,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';
import {MessageRouter} from '../../src/transport/message-router.js';

const NODE_ID = 'p4b-node';
const GROUP_ID = 'p4b-message-group';
const REPLICA_ID = 'p4b-message-group-r1';
const PARTITION_ID = 'services-p1';
const SOURCE_TIME = 100;
const DESTINATION_TIME = 200;
const TEST_TIMEOUT_MS = 30_000;
const SELECT_ROW_SQL = 'SELECT * FROM services WHERE service_id = ?';
const OWNER_CAPABILITY_REQUIRED = 'SYSTEM_TABLE_OWNER_CAPABILITY_REQUIRED';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function buildStoppedRow() {
  return {
    ...MessageGroupServiceRowOwner.buildServiceRow({
      groupId: GROUP_ID,
      replicaId: REPLICA_ID,
      nodeId: NODE_ID,
      service: {isLeaderReplica: () => false, getRole: () => 'follower'},
      status: SERVICE_STATUS.STOPPED,
      timestamp: SOURCE_TIME,
    }),
    previous_state: null,
    trigger_reason: null,
    error_message: null,
    cleanup_token: null,
    create_attempt_token: null,
  };
}

function activationPredicate(row) {
  return {
    service_id: row.service_id,
    service_type: row.service_type,
    group_id: row.group_id,
    node_id: row.node_id,
    replica_id: row.replica_id,
    status: row.status,
    created_at: row.created_at,
    state_entered_at: row.state_entered_at,
  };
}

function activationDestination(row) {
  return {
    status: SERVICE_STATUS.ACTIVE,
    raft_role: 'leader',
    address: row.address,
    state_entered_at: DESTINATION_TIME,
    updated_at: DESTINATION_TIME,
  };
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('services-p1 did not elect its single-replica leader');
}

async function createWorld(root, name, initialRow) {
  const dbPath = path.join(root, name, 'services-p1-r1.db');
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: SYSTEM_TABLE_NAME.SERVICES,
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    replicaId: `${PARTITION_ID}-${name}-r1`,
    replicaIds: [`${PARTITION_ID}-${name}-r1`],
    nodeId: NODE_ID,
    dbPath,
    schema: getSchemaByTableName(SYSTEM_TABLE_NAME.SERVICES),
  }));
  await partition.initialize();
  await waitForLeader(partition);
  const columns = Object.keys(initialRow);
  await partition.executeLocalQuery(
    `INSERT INTO services (${columns.join(', ')}) VALUES (` +
      `${columns.map(() => '?').join(', ')})`,
    columns.map((column) => initialRow[column]),
  );

  const cdc = new CDCIntegrationService({nodeId: NODE_ID});
  cdc.initialize();
  cdc.setBootstrapMode(true, new Map([[partition.replicaId, partition]]));
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: NODE_ID,
    cdcIntegrationService: cdc,
  });
  const stateMachine = new ReplicaStateMachine({
    nodeId: NODE_ID,
    controlPlaneSystemTableGateway: gateway,
    now: () => DESTINATION_TIME,
  });
  const messageRouter = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
  });
  const service = {
    groupId: GROUP_ID,
    replicaId: REPLICA_ID,
    unifiedAddress: initialRow.address,
    transport: messageRouter,
    isLeaderReplica: () => true,
    getRole: () => 'leader',
    receiveMessage: () => ({acknowledged: true}),
  };
  registerMessageGroupTransportHandler(service, {
    messageRouter,
    address: initialRow.address,
    resolveLane: () => stateMachine,
  });
  const owner = new MessageGroupServiceRowOwner({
    systemTableWriter: gateway,
    replicaStateMachine: stateMachine,
    now: () => DESTINATION_TIME,
  });
  return {cdc, gateway, messageRouter, owner, partition, service, stateMachine};
}

async function readRow(world) {
  const result = await world.partition.executeLocalQuery(
    SELECT_ROW_SQL,
    [REPLICA_ID],
  );
  assert.equal(result.rows.length, 1, 'the seeded SERVICES row must exist');
  return result.rows[0];
}

async function activateThroughOwner(world, registrationEvidence) {
  return world.owner.activateReplica({
    groupId: GROUP_ID,
    replicaId: REPLICA_ID,
    nodeId: NODE_ID,
    service: world.service,
    isEffectHandlerCurrent: () => isReplicaServiceHandlerBound(
      world.service,
      world.stateMachine,
    ),
    registrationEvidence,
  });
}

function isOwnerCapabilityRefusal(value) {
  return value?.code === OWNER_CAPABILITY_REQUIRED ||
    value?.errorCode === OWNER_CAPABILITY_REQUIRED ||
    value?.outcome === OWNER_CAPABILITY_REQUIRED;
}

async function captureGenericActivation(attempt) {
  try {
    const result = await attempt();
    const affectedRows = Number(
      result?.partitionResult?.affectedRows ??
        result?.partitionResult?.changes ?? result?.affectedRows ?? 0,
    );
    if (affectedRows > 0) return result;
    if (result?.success === false && affectedRows === 0 &&
        isOwnerCapabilityRefusal(result)) {
      return result;
    }
    throw new Error(
      'generic activation returned an unrecognized non-applied outcome',
    );
  } catch (error) {
    if (isOwnerCapabilityRefusal(error)) return error;
    throw error;
  }
}

test('SERVICES activation requires the message-group row owner capability',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    initializeEnvironment();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'services-p4b-'));
    const initialRow = buildStoppedRow();
    const worlds = [];
    try {
      const ownerWorld = await createWorld(root, 'owner', initialRow);
      worlds.push(ownerWorld);
      const genericWorld = await createWorld(root, 'generic', initialRow);
      worlds.push(genericWorld);
      assert.equal(isReplicaServiceHandlerBound(
        ownerWorld.service,
        ownerWorld.stateMachine,
      ), true, 'owner world must bind the exact current transport handler');
      assert.equal(isReplicaServiceHandlerBound(
        genericWorld.service,
        genericWorld.stateMachine,
      ), true, 'generic twin must bind the same current handler fact');

      const ownerResult = await activateThroughOwner(ownerWorld, initialRow);
      const ownerRow = await readRow(ownerWorld);
      const destination = activationDestination(initialRow);
      assert.deepEqual(ownerResult, {...initialRow, ...destination});
      assert.deepEqual(ownerRow, {...initialRow, ...destination});

      await captureGenericActivation(() =>
        genericWorld.gateway.updateSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES,
          activationPredicate(initialRow),
          destination,
          {allowCoalescing: false, skipCacheWait: true},
        ));
      const rowAfterGenericAttempt = await readRow(genericWorld);

      const secondOwnerResult = await activateThroughOwner(
        genericWorld,
        rowAfterGenericAttempt,
      );
      const rowAfterSecondOwner = await readRow(genericWorld);
      assert.equal(secondOwnerResult.status, SERVICE_STATUS.ACTIVE,
        'the exact owner route must remain usable after the generic attempt');
      assert.deepEqual(rowAfterSecondOwner, {...initialRow, ...destination},
        'the second world must finish at the exact owner destination');

      assert.deepEqual(rowAfterGenericAttempt, initialRow,
        'a fresh matching generic mutation must leave the SERVICES row unchanged');
    } finally {
      for (const world of worlds.reverse()) {
        world.cdc.markShuttingDown();
        await world.partition.shutdown();
      }
      fs.rmSync(root, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('generic activation capture rethrows unrelated failures', async () => {
  const unrelated = Object.assign(new Error('unrelated gateway failure'), {
    code: 'UNRELATED_GATEWAY_FAILURE',
  });
  await assert.rejects(
    captureGenericActivation(() => Promise.reject(unrelated)),
    (error) => error === unrelated,
  );
});
