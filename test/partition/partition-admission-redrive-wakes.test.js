// V2 (verification O1 round 1), the admission re-drive's wake-ups on the
// partition's own seam: the port double answers the membership proposals and
// raises the port's events, and the provider records every proposal the
// partition makes (as in dt-movielens-raft-peer-cohort-pruning-election).
//  - a configuration change settling (CONF_CHANGE_APPLIED, with no
//    MEMBERSHIP_CHANGED: it applied without changing the key) re-drives an
//    admission latched in flight, and one the port deferred;
//  - gaining leadership re-drives (and so releases) an in-flight latch of an
//    earlier term;
//  - a row-driven retirement (REMOVE_PEER of a retiring row, F2) the port
//    deferred is proposed again when a change settles.
// At ab7669fd0 only MEMBERSHIP_CHANGED re-drove, so each of these stayed
// latched: every later admission answered IN_FLIGHT and proposed nothing.

import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RaftRole} from '../../src/partition/partition-service.js';
import {admitPartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_REASON} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
} from './partition-service-test-support.js';

const PARTITION_ID = 'users-p9';
const LOCAL = 'users-p9-r1';
const PEER = 'users-p9-r2';
const TARGET = 'users-p9-r4';
const NODE_OF = Object.freeze({[LOCAL]: 'node-a', [PEER]: 'node-b',
  [TARGET]: 'node-d'});

function serviceRow(replicaId, updatedAt, status = ReplicaStatus.ACTIVE) {
  return {
    service_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: NODE_OF[replicaId],
    address: `${NODE_OF[replicaId]}/partition/${replicaId}`,
    status,
    raft_role: RaftRole.FOLLOWER,
    updated_at: updatedAt,
  };
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settle() {
  for (let turn = 0; turn < 4; turn += 1) {
    await nextImmediate();
  }
}

function additionsOfTarget(provider, mark) {
  return provider.confChanges.slice(mark).filter((change) =>
    change.type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER &&
    change.replicaIdentity === TARGET).length;
}

// A leader whose port answers the target's AddNode as `answer` and never
// shows it as a member (the double keeps its configuration unchanged); with
// `members`, a group of those replicas whose port answers `answer` for every
// membership change.
async function openLeader(t, answer, members = [LOCAL]) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'node-a'}});
  LoggingService.getInstance().initialize({level: 'error'});
  const cache = new SystemTableCache();
  for (const member of members) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.INSERT,
      serviceRow(member, 1));
  }
  const provider = new ControllablePartitionRaftProvider();
  provider.confChangeHandler = () => answer;
  const partition = createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: 'users',
    tableName: 'users',
    replicaId: LOCAL,
    replicaIds: members,
    nodeId: NODE_OF[LOCAL],
    dbPath: ':memory:',
    deferElection: true,
  }, provider);
  partition.systemTableCache = cache;
  t.teardown(async () => {
    partition.systemTableCache = null;
    await partition.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  await partition.initialize();
  partition.raft.campaign();
  await settle();
  if (members.length === 1) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.INSERT,
      serviceRow(TARGET, 2));
    await settle();
  }
  return {partition, provider, cache};
}

const PROPOSED = Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
const DEFERRED = Object.freeze({
  outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
  reason: RUNTIME_REASON.CONF_CHANGE_PENDING,
  retryable: true,
  recoveryRequired: false,
});

test('a settled configuration change with no key change re-drives an ' +
  'in-flight admission', async (t) => {
  const {partition, provider} = await openLeader(t, PROPOSED);
  t.equal(additionsOfTarget(provider, 0), 1, 'the row proposed the AddNode');
  t.equal(admitPartitionRaftPeer(partition, {replicaIdentity: TARGET,
    peerAddress: serviceRow(TARGET, 2).address}).outcome,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT,
  'setup: it is latched in flight (the proposal was dropped)');
  const mark = provider.confChanges.length;
  provider.emitEvent(RAFT_EVENT.CONF_CHANGE_APPLIED,
    {appliedIndex: 9, confChangeEntries: 1, admissible: true});
  await settle();
  t.equal(additionsOfTarget(provider, mark), 1,
    'the settlement re-drove it: one AddNode proposed again');
});

test('a settled configuration change re-drives an admission the port ' +
  'deferred', async (t) => {
  const {provider} = await openLeader(t, DEFERRED);
  t.equal(additionsOfTarget(provider, 0), 1, 'the row proposed the AddNode');
  const mark = provider.confChanges.length;
  provider.emitEvent(RAFT_EVENT.CONF_CHANGE_APPLIED,
    {appliedIndex: 9, confChangeEntries: 0, admissible: true});
  await settle();
  t.equal(additionsOfTarget(provider, mark), 1,
    'the settlement re-drove the deferred admission');
});

test('gaining leadership re-drives an in-flight latch of an earlier term',
  async (t) => {
    const {partition, provider} = await openLeader(t, PROPOSED);
    t.equal(admitPartitionRaftPeer(partition, {replicaIdentity: TARGET,
      peerAddress: serviceRow(TARGET, 2).address}).outcome,
    RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT, 'setup: latched in flight');
    provider.setRole(RaftRole.FOLLOWER);
    await settle();
    const mark = provider.confChanges.length;
    provider.setRole(RaftRole.LEADER);
    await settle();
    t.equal(additionsOfTarget(provider, mark), 1,
      'leadership gain re-drove it: one AddNode proposed again');
  });

test('a row-driven retirement the port deferred is proposed again when a ' +
  'change settles', async (t) => {
  const {provider, cache} = await openLeader(t, DEFERRED, [LOCAL, PEER]);
  const removalsOfPeer = () => provider.confChanges.filter((change) =>
    change.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER &&
    change.replicaIdentity === PEER).length;
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATIONS.UPDATE,
    serviceRow(PEER, 2, ReplicaStatus.REMOVING));
  await settle();
  t.equal(removalsOfPeer(), 1, 'the retiring row proposed its REMOVE_PEER');
  provider.emitEvent(RAFT_EVENT.CONF_CHANGE_APPLIED,
    {appliedIndex: 9, confChangeEntries: 1, admissible: true});
  await settle();
  t.equal(removalsOfPeer(), 2,
    'the settlement proposed the deferred retirement again');
});
