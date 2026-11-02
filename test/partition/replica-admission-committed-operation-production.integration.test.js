// Production-bound witness (quest replica-admission-from-committed-operation,
// lead decision 2026-11-02 condition 6, red test 3): a real PartitionService
// on the real raft-rs operation port, composed as production composes it,
// with the message-group CDC wave stopped - its services cache is a real
// SystemTableCache that never receives an event - admits a CREATE target
// from the target's ADMIT_REPLICA request answered from the committed
// replica operation. The applied configuration names the target on the
// operation's target node. Nothing writes the cache, no row names the
// target, and no test address table exists.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {handlerIdentityApi} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {waitForCondition} from './partition-service-test-support.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const PARTITION_ID = 'admission-witness-p1';
const LEADER = `${PARTITION_ID}-r1`;
const TARGET = `${PARTITION_ID}-r4`;
const LEADER_NODE = 'node-a';
const TARGET_NODE = 'node-b';
const OPERATION_ID = 'admission-witness-op-1';
const TABLE_NAME = 'admission_witness';
const BUDGET_MS = 10_000;
const TEST_TIMEOUT_MS = 60_000;

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: LEADER_NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

function recordingTransport() {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    ...handlerIdentityApi(handlers),
    async deliver() {
      return buildDeliveryEnvelope({acknowledged: true}, {});
    },
  };
}

// The committed replica operation, as the authoritative control-plane read
// answers it.
function committedOperationGateway() {
  const gateway = {
    reads: 0,
    async readAuthoritativeRows(tableName, _sql, params) {
      gateway.reads += 1;
      assert.equal(tableName, TABLES.REPLICA_OPERATIONS);
      assert.deepEqual(params, [OPERATION_ID]);
      return {success: true, rows: [{
        operation_id: OPERATION_ID, type: 'ADD',
        entity_type: SERVICE_TYPE.PARTITION, entity_id: PARTITION_ID,
        partition_id: PARTITION_ID, replica_id: TARGET,
        target_node_id: TARGET_NODE, status: 'syncing',
        workflow_step: 'SYNCING'}]};
    },
  };
  return gateway;
}

function targetPeer(service) {
  return service.raft.readStatus().peers.find((peer) =>
    peer.replicaIdentity === TARGET) ?? null;
}

test('a CREATE target is admitted from its committed operation with the ' +
  'message-group wave stopped (real port, production composition)',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'admission-op-'));
  const cache = new SystemTableCache();
  const leader = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    replicaId: LEADER,
    replicaIds: [LEADER],
    nodeId: LEADER_NODE,
    deferElection: true,
    transport: recordingTransport(),
    systemTableCache: cache,
    dbPath: path.join(directory, 'partition.sqlite'),
  }));
  t.after(async () => {
    await leader.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
  });
  await leader.initialize();
  await leader.raft.campaign();
  assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER,
    'setup: the lone founder leads');
  const gateway = committedOperationGateway();
  leader.controlPlaneSystemTableGateway = gateway;

  const answer = await leader.handleApplicationMessage({
    type: 'ADMIT_REPLICA', partitionId: PARTITION_ID,
    replicaIdentity: TARGET, operationId: OPERATION_ID});
  assert.ok(['proposed', 'in_flight'].includes(answer?.admission?.outcome),
    `the leader admits from the committed operation (${JSON.stringify(answer)})`);
  assert.equal(await waitForCondition(() => targetPeer(leader) !== null,
    BUDGET_MS), true, 'the admission is applied to the configuration');
  assert.equal(targetPeer(leader).address,
    `${TARGET_NODE}/partition/${TARGET}`,
    'the target is addressed on the operation\'s committed node');
  assert.equal(cache.getAll(TABLES.SERVICES).length, 0,
    'the services cache never held a row: the wave was stopped');
  assert.equal(gateway.reads, 1, 'one committed read decided it');
});
