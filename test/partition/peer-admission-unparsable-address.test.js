/**
 * A services row whose address is not a unified address never raises an
 * untyped failure in peer admission (quest
 * learner-admission-malformed-address-refusal). The address is a projection:
 * where it cannot name a node, the admission reaches the port's one refusal
 * of an ADD that names no node, and the reconcile treats the peer as
 * unadmitted.
 *
 *   (a) a real leader's reconcile hop refuses such a row WITHOUT_NODE_ID,
 *       with no uncaught failure and no configuration entry, and admits the
 *       peer once its row names a unified address
 *   (b) a follower keeps its typed NOT_LEADER for the same row
 *   (c) a founding cohort with such a row records no node for that founder
 *       and does not throw
 *
 * The message group's half: message-group-unparsable-peer-address.test.js.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {createLoopbackTransport} from './partition-service-test-support.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {admitPartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {createSQLQueryEngineProvisionTargetMethods} from
  '../../src/query/sql-query-engine-provision-target-methods.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const PARTITION_ID = 'unparsable-address-p1';
const LEADER = 'unparsable-address-r1';
const PEER = 'unparsable-address-r2';
const LEADER_NODE = 'node-1';
const PEER_NODE = 'node-2';
const UNPARSABLE_ADDRESS = `ws://localhost:7000/partition/${PEER}`;
const BUDGET_MS = 5000;
const POLL_MS = 10;
const REFUSED = RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED;
const WITHOUT_NODE_ID = RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_NODE_ID;

function peerRow(address) {
  return {service_id: PEER, replica_id: PEER, partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION, node_id: PEER_NODE,
    status: SERVICE_STATUS.ACTIVE, address};
}

async function waitFor(predicate) {
  const deadline = Date.now() + BUDGET_MS;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return predicate();
}

function configure() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LEADER_NODE},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function recordAdmissions(service) {
  const admissions = [];
  const base = service.logger;
  const recording = Object.create(base);
  recording.warn = (message, payload) => {
    if (payload?.admission) admissions.push(payload.admission);
    return base.warn(message, payload);
  };
  service.logger = recording;
  return admissions;
}

test('(a) a leader refuses an unparsable row typed from its reconcile hop ' +
  'and admits the peer once the row is corrected', async () => {
  configure();
  const uncaught = [];
  const onUncaught = (error) => uncaught.push(error);
  process.on('uncaughtException', onUncaught);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unparsable-'));
  const cache = new SystemTableCache();
  const leader = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID, tableId: 'unparsable_table',
    tableName: 'unparsable_table', replicaId: LEADER, replicaIds: [LEADER],
    peerAddresses: [`${LEADER_NODE}/partition/${LEADER}`], nodeId: LEADER_NODE,
    transport: createLoopbackTransport(), systemTableCache: cache,
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    dbPath: path.join(directory, 'leader.db'),
  }));
  try {
    await leader.initialize();
    assert.equal(await waitFor(() =>
      leader.raft.readStatus().role === RAFT_ROLE.LEADER), true,
    'setup: the lone replica leads');
    const admissions = recordAdmissions(leader);
    const votersBefore = leader.raft.readStatus().confState.voters;

    cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
      peerRow(UNPARSABLE_ADDRESS));
    assert.equal(await waitFor(() => admissions.length > 0), true,
      'the reconcile hop recorded the admission');
    assert.deepEqual(uncaught, [], 'nothing escaped the reconcile hop');
    assert.equal(admissions[0].outcome, REFUSED, 'the admission is refused');
    assert.equal(admissions[0].reason, WITHOUT_NODE_ID,
      'with the port\'s typed refusal of an ADD that names no node');
    assert.deepEqual(leader.raft.readStatus().confState.voters, votersBefore,
      'the configuration is unchanged');

    cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.UPDATE,
      peerRow(`${PEER_NODE}/partition/${PEER}`));
    assert.equal(await waitFor(() => leader.raft.readStatus().peers.some(
      (peer) => peer.replicaIdentity === PEER)), true,
    'a corrected row admits the peer: the refusal has its consequence');
    assert.deepEqual(uncaught, [], 'nothing escaped afterwards either');
  } finally {
    process.off('uncaughtException', onUncaught);
    await leader.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('(b) a follower keeps its typed NOT_LEADER for the same row', () => {
  configure();
  const admission = admitPartitionRaftPeer({
    partitionId: PARTITION_ID, replicaId: LEADER,
    logger: {debug() {}, warn() {}},
    raft: {readStatus: () => Object.freeze({role: RAFT_ROLE.FOLLOWER,
      peers: []})},
  }, {replicaIdentity: PEER, peerAddress: UNPARSABLE_ADDRESS});
  assert.equal(admission.outcome,
    RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER);
});

test('(c) a founding cohort with such a row records no node for that ' +
  'founder and does not throw', () => {
  configure();
  const methods = createSQLQueryEngineProvisionTargetMethods();
  const topology = methods.buildInitialPartitionBootstrapTopology.value.call(
    {getPartitionServiceRows: () => [peerRow(UNPARSABLE_ADDRESS)]},
    PARTITION_ID,
    [{replicaId: LEADER, targetNodeId: LEADER_NODE}],
  );
  assert.deepEqual(topology.replicaIds, [PEER, LEADER]);
  assert.deepEqual(topology.founderNodeIds, {[LEADER]: LEADER_NODE},
    'the parsable founder keeps its node; the other has none recorded');
});
