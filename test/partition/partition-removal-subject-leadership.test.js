// The node effect owner of a replica removal never makes the removed replica
// the leader that removes itself (B2, 2026-11-11). A replica whose own
// services row is retiring (REMOVING) never proposes its own RemoveNode; when
// it holds or gains leadership it hands leadership to a live surviving voter
// (the removal transferee rule), and the survivor that leads proposes the
// removal from the row it holds. raft-rs keeps a leader that applied its own
// removal leading while it refuses every proposal for good (no progress for
// itself), so a self-removing leader would leave its group led by a replica
// that accepts no writes until the port retires.
//
// Real PartitionService replicas on rs-raft, formed the way production
// forms a group (partition-admitted-group-fixture.js), each with its own
// services cache: the retiring row reaches the caches the test chooses, when
// it chooses (CDC delivery lag), and nothing else decides leadership.
//
// Witnesses, sampled every few milliseconds on every replica:
//   - zombie: a replica the core reports leading whose own configuration no
//     longer names it a voter (the state in which every proposal is refused
//     for "no self progress");
//   - self-proposal: a REMOVE_PEER the subject's own port is asked for that
//     names the subject;
//   - leaders: who leads, so the group is led throughout except elections.

import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from './partition-release-fixture.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {CDCOperation} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITIONS_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';

const TEMP_PREFIX = 'partition-removal-subject-leadership-';
const TABLE_NAME = 'removal_subject_rows';
const TEST_TIMEOUT_MS = 90000;
const GROUP_BUDGET_MS = 15000;
const SAMPLE_MS = 2;
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function retiringRow(partitionId, [replicaId, nodeId]) {
  return {
    service_id: replicaId, replica_id: replicaId, partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION, node_id: nodeId,
    address: `${nodeId}/partition/${replicaId}`,
    status: ReplicaStatus.REMOVING,
  };
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

// The cache notifies on its next turn; the coalesced reconcile runs on the
// turn after that.
async function deliverRow(service, row) {
  service.systemTableCache.applySystemTableChange(
    TABLES.SERVICES, CDCOperation.UPDATE, row);
  await nextImmediate();
  await nextImmediate();
}

function isVoter(status) {
  return [...(status.confState?.voters || []),
    ...(status.confState?.votersOutgoing || [])].includes(status.peerId);
}

// Every replica sampled on a short clock: zombies, leaders, and the
// subject's own REMOVE_PEER of itself.
function watchGroup(services, subjectReplicaId) {
  // Leaderless intervals are counted from the subject's first leadership:
  // the election that made it lead is the test's own setup.
  const record = {zombies: [], selfRemovals: [], leaderlessIntervals: 0,
    led: true, subjectLed: false};
  const subject = services.find((service) =>
    service.replicaId === subjectReplicaId);
  // The port is frozen: the subject's partition is handed a view of it that
  // records every REMOVE_PEER of the subject and forwards everything.
  const port = subject.raft;
  // Leadership the subject gains is recorded from its port's own LEADER
  // event: the hand-off may end it before any sample sees it.
  port.subscribe(RAFT_EVENT.LEADER, () => {
    record.subjectLed = true;
  });
  const proposeConfChange = (change) => {
    if (change?.type === RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER &&
        change.replicaIdentity === subjectReplicaId) {
      record.selfRemovals.push(change);
    }
    return port.proposeConfChange(change);
  };
  subject.raft = new Proxy({}, {
    get: (_target, key) => {
      if (key === 'proposeConfChange') return proposeConfChange;
      const value = port[key];
      return typeof value === 'function' ? value.bind(port) : value;
    },
  });
  const timer = setInterval(() => {
    let leaders = 0;
    for (const service of services) {
      if (service.isShutdown || !service.raft) continue;
      const status = service.raft.readStatus();
      if (status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) continue;
      if (status.role === RAFT_ROLE.LEADER) {
        leaders += 1;
        if (service.replicaId === subjectReplicaId) record.subjectLed = true;
        if (!isVoter(status)) {
          record.zombies.push({replicaId: service.replicaId,
            term: status.term});
        }
      }
    }
    if (record.subjectLed && record.led && leaders === 0) {
      record.leaderlessIntervals += 1;
    }
    record.led = leaders > 0;
  }, SAMPLE_MS);
  return {record, stop: () => clearInterval(timer)};
}

// The kinds of partition the scenario runs on: an ordinary user table, and
// partitions-p1, the partition whose own leader-clear write
// (replica-state-machine-leader-clear.js: UPDATE partitions SET
// leader_node_id = NULL) is routed to its own group's leader - the write a
// self-removed leader would drop.
const USER_TABLE = Object.freeze({
  partitionId: 'subject-wins',
  serviceOptions: tableOptions(),
  setupWrite: (service) => applySql(service, PARTITION_SERVICE_OPERATION.INSERT,
    `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`, ['setup', 'setup']),
  finalWrite: (service) => applySql(service,
    PARTITION_SERVICE_OPERATION.INSERT,
    `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`,
    ['after-removal', 'after-removal']),
});
const PARTITIONS_P1 = Object.freeze({
  partitionId: INITIAL_PARTITION_IDS[TABLES.PARTITIONS],
  serviceOptions: {tableId: TABLES.PARTITIONS, tableName: TABLES.PARTITIONS,
    schema: PARTITIONS_SCHEMA},
  setupWrite: (service, subjectNodeId) => applySql(service,
    PARTITION_SERVICE_OPERATION.INSERT,
    'INSERT INTO partitions (partition_id, table_id, leader_node_id, ' +
    'created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [INITIAL_PARTITION_IDS[TABLES.PARTITIONS], TABLES.PARTITIONS,
      subjectNodeId, 1, 1]),
  finalWrite: (service, subjectNodeId) => applySql(service,
    PARTITION_SERVICE_OPERATION.UPDATE,
    'UPDATE partitions SET leader_node_id = NULL, updated_at = ? ' +
    'WHERE partition_id = ? AND leader_node_id = ?',
    [2, INITIAL_PARTITION_IDS[TABLES.PARTITIONS], subjectNodeId]),
});

let entrySeq = 0;
function applySql(service, type, sql, params) {
  entrySeq += 1;
  return service.applyWrite({type, sql, params,
    entryId: `removal-subject-${entrySeq}`});
}

function leaderOf(services) {
  return services.find((service) => !service.isShutdown &&
    service.raft?.readStatus().role === RAFT_ROLE.LEADER) ?? null;
}

async function withGroup(kind, body) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'removal-subject-node'}, raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const members = [1, 2, 3].map((ordinal) =>
    [`${kind.partitionId}-r${ordinal}`, `node-${ordinal}`]);
  const group = await formAdmittedGroup({partitionId: kind.partitionId,
    members, tempPrefix: TEMP_PREFIX, serviceOptions: kind.serviceOptions,
    budgetMs: GROUP_BUDGET_MS});
  let owners = null;
  try {
    owners = await attachPartitionReleaseOwners(group.services,
      {directory: path.dirname(group.dbFileOf(members[0])),
        budgetMs: GROUP_BUDGET_MS});
    await owners.release(kind.partitionId);
    const setup = await kind.setupWrite(group.services[0], members[2][1]);
    assert.equal(setup.success, true,
      `setup: the group serves a write (${JSON.stringify(setup)})`);
    await body({group, members, owners});
  } finally {
    await owners?.dispose();
    await group.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

// The REMOVING row reaches the subject and one survivor while the leader's
// cache lags (CDC delivery), the subject wins leadership, and the row then
// reaches the lagging cache too.
async function subjectWinsWhileRemoving(kind) {
  let facts = null;
  await withGroup(kind, async ({group, members, owners}) => {
    const [first, second, subject] = group.services;
    const subjectRow = retiringRow(subject.partitionId, members[2]);
    const watch = watchGroup(group.services, subject.replicaId);
    try {
      await deliverRow(subject, subjectRow);
      await deliverRow(second, subjectRow);
      // The subject wins leadership (a named transfer: the same election a
      // timeout would start, at a moment the test controls).
      const accepted = await turnChainValue(first.requestLeadershipTransfer({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: subject.replicaId}));
      assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        `setup: the transfer to the subject is accepted (${
          JSON.stringify(accepted)})`);
      assert.equal(await group.waitFor(() => watch.record.subjectLed), true,
        'setup: the REMOVING subject wins leadership');
      await deliverRow(first, subjectRow);
      const subjectPeerId = subject.raft.readStatus().peerId;
      // Removed at both survivors, each applied to its commit (the release
      // reads every member's applied fact).
      const removed = await group.waitFor(() => {
        if (!leaderOf([first, second])) return false;
        return [first, second].every((survivor) => {
          const status = survivor.raft.readStatus();
          return !status.confState.voters.includes(subjectPeerId) &&
            status.appliedIndex >= status.commitIndex;
        });
      });
      const handedOffTo = leaderOf([first, second])?.replicaId ?? null;
      // The cohort changed: the participant cutover runs again before the
      // group takes writes (the release owners' production path). The
      // fixture hosts the release control partition on the first node only,
      // whose handler finds its leader locally, so the release is asked with
      // the group led there (a named transfer; the write below then lands at
      // a survivor either way).
      if (removed && handedOffTo !== first.replicaId) {
        await turnChainValue(second.requestLeadershipTransfer({
          successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
          replicaIdentity: first.replicaId}));
        await group.waitFor(() => leaderOf([first, second]) === first);
      }
      if (removed) await owners.release(subject.partitionId);
      const leader = leaderOf([first, second]);
      const write = leader ?
        await kind.finalWrite(leader, members[2][1]) : null;
      watch.stop();
      facts = {
        removedBySurvivor: removed,
        zombies: watch.record.zombies.slice(0, 3),
        selfRemovals: watch.record.selfRemovals.length,
        leaderlessIntervals: watch.record.leaderlessIntervals,
        write: write?.success === true ? true : write,
      };
    } finally {
      watch.stop();
    }
  });
  return facts;
}

const EXPECTED = Object.freeze({
  removedBySurvivor: true,
  zombies: [],
  selfRemovals: 0,
  // At most one election after the subject led: its hand-off.
  leaderlessIntervals: true,
  write: true,
});

function judged(facts) {
  return {...facts, leaderlessIntervals: facts.leaderlessIntervals <= 1};
}

test('(i)+(iii) a REMOVING replica that wins an election hands leadership ' +
  'to a survivor, the survivor removes it, the group stays led but for one ' +
  'election and no leader ever leads outside its own configuration',
{timeout: TEST_TIMEOUT_MS}, async () => {
  assert.deepEqual(judged(await subjectWinsWhileRemoving(USER_TABLE)),
    EXPECTED, 'the survivor removed the subject; nobody led outside its ' +
    'configuration; the subject never proposed its own removal; the group ' +
    'takes writes');
});

test('(ii) partitions-p1: the removal of a source that won leadership ' +
  'completes, and the leader-clear write lands at a survivor leader',
{timeout: TEST_TIMEOUT_MS}, async () => {
  assert.deepEqual(judged(await subjectWinsWhileRemoving(PARTITIONS_P1)),
    EXPECTED, 'partitions-p1 removes its source through a survivor and ' +
    'takes the leader-clear write');
});
