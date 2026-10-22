// V2 (verification O1 round 1; round 2 F-5, round 3): the admission
// re-drive's wake-ups on the partition's own seam, ranged over the model
// rather than hand-listed. The port double answers the membership
// proposals and raises the port's events; the provider records every
// proposal the partition makes.
//
// The wakes are the port events the re-drive runs on, classified out of the
// production RAFT_EVENT enumeration (a member added without a class fails
// here): CONF_CHANGE_APPLIED - its payload produced by the production
// settlement function over the core's own numbers for {an applied
// conf-change entry (effective or no-op alike: the settlement counts
// entries, never the key), the post-election conservative index reached
// without one} - and LEADER (this replica gains leadership). What each wake
// re-drives is a latched proposal: an admission the port accepted (in
// flight), one it deferred, one a non-leading replica refused NOT_LEADER
// (remembered; proposed only once this replica leads), and a row-driven
// retirement the port deferred. At ab7669fd0 only MEMBERSHIP_CHANGED
// re-drove, so each latch stayed: every later admission answered IN_FLIGHT
// and proposed nothing. This is the one witness that discriminates the
// re-drive's wiring; the chain witness proves the property by the
// cache-reconcile path as well.

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
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {confChangeSettlement} from
  '../../src/raft/raft-rs-conf-change-admission.js';
import {RUNTIME_REASON} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  ControllableConsensusPort,
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
  const provider = new ControllableConsensusPort();
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

// The settlement payloads, produced by the production settlement function
// from the core's own numbers (a pending index at 9 above an applied 8,
// then applied 9): an applied conf-change entry, and the window closed by
// the post-election conservative index without one.
const CORE_BEFORE = Object.freeze({pendingConfIndex: '9', applied: '8'});
const CORE_NOW = Object.freeze({pendingConfIndex: '9', applied: '9'});
const SETTLEMENTS = Object.freeze({
  'an applied conf-change entry (effective or no-op)': confChangeSettlement({
    before: CORE_BEFORE, now: CORE_NOW, confChangeEntries: 1,
    appliedIndex: 9n}),
  'the post-election conservative index reached': confChangeSettlement({
    before: CORE_BEFORE, now: CORE_NOW, confChangeEntries: 0,
    appliedIndex: 9n}),
});
for (const settlement of Object.values(SETTLEMENTS)) {
  if (settlement === null) {
    throw new Error('the production settlement function announced nothing');
  }
}

// Every port event, classified: the two the re-drive runs on, and the rest.
const REDRIVE_WAKES = Object.freeze({
  [RAFT_EVENT.CONF_CHANGE_APPLIED]: Object.entries(SETTLEMENTS).map(
    ([label, payload]) => ({label: `CONF_CHANGE_APPLIED: ${label}`,
      wake: (provider) => provider.emitEvent(RAFT_EVENT.CONF_CHANGE_APPLIED,
        payload)})),
  [RAFT_EVENT.LEADER]: [{label: 'LEADER: this replica gains leadership',
    wake: (provider) => {
      provider.setRole(RaftRole.FOLLOWER);
      provider.setRole(RaftRole.LEADER);
    }}],
});
const NOT_A_WAKE = Object.freeze([RAFT_EVENT.DATA, RAFT_EVENT.FOLLOWER,
  RAFT_EVENT.CANDIDATE, RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.COMMIT,
  RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
  RAFT_EVENT.MEMBERSHIP_CHANGED, RAFT_EVENT.GATE_OPENED]);

test('the re-drive wakes are classified out of the production port events',
  (t) => {
    t.same([...Object.keys(REDRIVE_WAKES), ...NOT_A_WAKE].sort(),
      Object.values(RAFT_EVENT).sort(),
      'every RAFT_EVENT member is a wake or classified as none');
    t.end();
  });

const NOT_LEADER_ANSWER = Object.freeze({
  outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER,
  retryable: true,
  recoveryRequired: false,
  leaderReplicaId: PEER,
});

// What each wake re-drives, per latch: the number of proposals the wake
// must produce for the latched identity. A remembered NOT_LEADER admission
// is proposed only by a leader, so a settlement while this replica still
// follows re-drives it to nothing (it stays remembered).
const LATCHES = Object.freeze({
  'an admission the port accepted (in flight)': {
    open: (t) => openLeader(t, PROPOSED),
    latch: async ({partition}) => {
      const again = admitPartitionRaftPeer(partition, {replicaIdentity: TARGET,
        peerAddress: serviceRow(TARGET, 2).address});
      return again.outcome === RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT;
    },
    count: (provider, mark) => additionsOfTarget(provider, mark),
    expected: () => 1,
  },
  'an admission the port deferred': {
    open: (t) => openLeader(t, DEFERRED),
    latch: async ({provider}) => additionsOfTarget(provider, 0) === 1,
    count: (provider, mark) => additionsOfTarget(provider, mark),
    expected: () => 1,
  },
  'an admission a non-leading replica refused NOT_LEADER (remembered)': {
    open: async (t) => {
      const world = await openLeader(t, NOT_LEADER_ANSWER, [LOCAL, PEER]);
      world.provider.setRole(RaftRole.FOLLOWER);
      await settle();
      world.cache.applySystemTableChange(TABLES.SERVICES,
        CDC_OPERATIONS.INSERT, serviceRow(TARGET, 2));
      await settle();
      return world;
    },
    latch: async ({partition}) => admitPartitionRaftPeer(partition,
      {replicaIdentity: TARGET, peerAddress: serviceRow(TARGET, 2).address})
      .outcome === RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER,
    count: (provider, mark) => additionsOfTarget(provider, mark),
    expected: (wakeEvent) => wakeEvent === RAFT_EVENT.LEADER ? 1 : 0,
  },
  'a row-driven retirement the port deferred': {
    open: async (t) => {
      const world = await openLeader(t, DEFERRED, [LOCAL, PEER]);
      world.cache.applySystemTableChange(TABLES.SERVICES,
        CDC_OPERATIONS.UPDATE, serviceRow(PEER, 2, ReplicaStatus.REMOVING));
      await settle();
      return world;
    },
    latch: async ({provider}) => removalsOf(provider, PEER, 0) === 1,
    count: (provider, mark) => removalsOf(provider, PEER, mark),
    expected: () => 1,
  },
});

function removalsOf(provider, identity, mark) {
  return provider.confChanges.slice(mark).filter((change) =>
    change.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER &&
    change.replicaIdentity === identity).length;
}

for (const [latchLabel, latch] of Object.entries(LATCHES)) {
  for (const [wakeEvent, wakes] of Object.entries(REDRIVE_WAKES)) {
    for (const {label, wake} of wakes) {
      test(`${latchLabel} x ${label}`, async (t) => {
        const world = await latch.open(t);
        t.equal(await latch.latch(world), true, 'setup: latched');
        const mark = world.provider.confChanges.length;
        // The NOT_LEADER latch is re-driven by a leader only: when the wake
        // is a settlement the replica keeps following, and proposes nothing.
        wake(world.provider);
        await settle();
        t.equal(latch.count(world.provider, mark), latch.expected(wakeEvent),
          `the wake re-drove ${latch.expected(wakeEvent)} proposal(s)`);
        t.end();
      });
    }
  }
}
