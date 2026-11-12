// A partition admits a joining replica exactly once (epic finding F16).
//
// Real PartitionService replicas built by production construction on the
// rs-raft port, each with its own database file and its own services cache,
// on a loopback transport. A two-replica group (the leader and a live
// follower) admits a joiner through the production path: the joiner's
// ACTIVE services row becomes visible to every replica's cache (discovery
// only), and the joiner, named by a committed ADD operation, requests its
// admission (quest replica-admission-from-committed-operation) - from the
// follower first, which answers NOT_LEADER, then from the leader. The configuration change the group
// commits is read from the leader's durable log on a connection of the
// test's own; the joiner's membership from the committed ConfState.
//
// Exactly one configuration entry may land for one admission: only the
// leader proposes it. A follower that receives the request answers a typed
// NOT_LEADER instead of forwarding a redundant proposal, and the partition's
// own bootstrap-peer proposals carry the port's one canonical request shape.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {SQLiteConnection} from '../../../src/storage/sqlite-prepared-statement-owner.js';

import {createLoopbackTransport} from
  '../../partition/partition-service-test-support.js';
import {
  CDCOperation,
  PartitionService,
} from '../../../src/partition/partition-service.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_CONF_CHANGE_ENTRY_TYPES} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {answerCommittedOperations, committedAddOperation} from
  '../../partition/committed-operation-gateway-fixture.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {committedStampOfAnswer} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../../src/raft/raft-committed-membership-constants.js';

const PARTITION_ID = 'f16-admission';
const TABLE_NAME = 'f16_admission_table';
const LEADER = ['f16-leader', 'node-l'];
const FOLLOWER = ['f16-follower', 'node-f'];
const JOINER = ['f16-joiner', 'node-j'];
const TARGET_REPLICA_COUNT = 3;
const ADMISSION_BUDGET_MS = 5000;
const REDUNDANT_PROPOSAL_WINDOW_MS = 600;
const POLL_MS = 10;
const ONE_ADMISSION_ENTRY = 1;
const TABLE_SCHEMA = Object.freeze({
  columns: [{name: 'seq', type: 'INTEGER', primaryKey: true}],
});
const LOG_LEVELS = ['info', 'warn', 'error', 'debug', 'trace', 'fatal'];

function addressOf([replicaId, nodeId]) {
  return `${nodeId}/partition/${replicaId}`;
}

function serviceRow([replicaId, nodeId]) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
  };
}

function placementCache(members) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    partition_id: PARTITION_ID,
    replica_count: TARGET_REPLICA_COUNT,
  });
  for (const member of members) {
    cache.applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT, serviceRow(member));
  }
  return cache;
}

function waitFor(predicate, boundMs) {
  const deadline = Date.now() + boundMs;
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(poll, POLL_MS);
      }
    };
    poll();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The leader's durable record, on a connection of the test's own: every
// configuration entry of its log, its committed ConfState, and its applied
// proposals through the store's own reader.
function durableRecordOf(dbFile) {
  const independent = new SQLiteConnection(dbFile, {readonly: true});
  try {
    const confChangeEntries = independent.prepare(
      'SELECT log_index, entry_type FROM _raft_rs_log WHERE group_id = ? ' +
      'ORDER BY log_index').all(PARTITION_ID)
      .filter((row) =>
        RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(Number(row.entry_type)))
      .map((row) => Number(row.log_index));
    const applied = independent.prepare(
      'SELECT voters, learners FROM _raft_rs_applied_state ' +
      'WHERE group_id = ?').get(PARTITION_ID);
    return {
      confChangeEntries,
      voters: applied === undefined ? [] : JSON.parse(applied.voters),
      appliedProposals: RaftRsDurableStore.readCommittedEntriesIn(
        independent, PARTITION_ID).length,
    };
  } finally {
    independent.close();
  }
}

function recordLog(service) {
  const entries = [];
  const base = service.logger;
  const recorder = {};
  for (const level of LOG_LEVELS) {
    recorder[level] = (message, payload) => {
      entries.push({level, message, payload});
      base[level](message, payload);
    };
  }
  service.logger = recorder;
  return entries;
}

function admissionOutcomes(log, replicaIdentity) {
  return log.filter((entry) => entry.payload?.admission?.replicaIdentity ===
    replicaIdentity).map((entry) => entry.payload.admission.outcome);
}

test('F16: a two-replica group admits a joiner through the production path ' +
  'with exactly one configuration entry, proposed by the leader only',
async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'f16-node'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'f16-admission-'));
  const network = createLoopbackTransport();
  const services = [];
  const dbFileOf = ([replicaId]) => path.join(directory, `${replicaId}.db`);
  const operations = [FOLLOWER, JOINER].map((member) =>
    committedAddOperation(PARTITION_ID, member));
  const build = (member, members, cache, extra = {}) => {
    const service = new PartitionService(withFoundingStamp({
      partitionId: PARTITION_ID,
      tableId: TABLE_NAME,
      tableName: TABLE_NAME,
      replicaId: member[0],
      replicaIds: members.map(([replicaId]) => replicaId),
      peerAddresses: members.map(addressOf),
      nodeId: member[1],
      transport: network,
      systemTableCache: cache,
      schema: TABLE_SCHEMA,
      dbPath: dbFileOf(member),
      ...extra,
    }));
    answerCommittedOperations(service, operations);
    services.push(service);
    return service;
  };
  const requestOf = (member) => ({partitionId: PARTITION_ID,
    replicaIdentity: member[0],
    operationId: committedAddOperation(PARTITION_ID, member).operation_id});
  try {
    const leaderCache = placementCache([LEADER]);
    const leader = build(LEADER, [LEADER], leaderCache);
    await leader.initialize();
    assert.equal(await waitFor(() =>
      leader.raft.readStatus().role === 'leader', ADMISSION_BUDGET_MS), true,
    'setup: the single-replica leader leads');

    // The follower: created with its placement, admitted by the leader when
    // its row becomes visible, then its deferred election timer starts.
    const followerCache = placementCache([LEADER, FOLLOWER]);
    // Created the way a CREATE target is: from the committed-membership
    // stamp its leader served; it asks the leader that stamp names.
    const creationStamp = async () => committedStampOfAnswer(
      await leader.raft.readCommittedMembership({
        purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}));
    const follower = build(FOLLOWER, [LEADER, FOLLOWER], followerCache,
      {deferElection: true, isJoiningExistingGroup: true,
        bootstrapMembership: await creationStamp()});
    const followerLog = recordLog(follower);
    await follower.initialize();
    leaderCache.applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT, serviceRow(FOLLOWER));
    await follower.requestReplicaAdmission(requestOf(FOLLOWER).operationId);
    follower.startElection();
    assert.equal(await waitFor(() => {
      const status = leader.raft.readStatus();
      return status.followerProgress[FOLLOWER[0]] ===
        status.commitIndex;
    }, ADMISSION_BUDGET_MS), true, 'setup: the follower is admitted');
    const beforeJoiner = durableRecordOf(dbFileOf(LEADER));

    // The joiner: its row becomes visible to both replicas of the group.
    const joinerCache = placementCache([LEADER, FOLLOWER, JOINER]);
    const joiner = build(JOINER, [LEADER, FOLLOWER, JOINER], joinerCache,
      {deferElection: true, isJoiningExistingGroup: true,
        bootstrapMembership: await creationStamp()});
    const joinerLog = recordLog(joiner);
    await joiner.initialize();
    for (const cache of [leaderCache, followerCache]) {
      cache.applySystemTableChange(
        TABLES.SERVICES, CDCOperation.INSERT, serviceRow(JOINER));
    }
    const atFollower = await follower.handleReplicaAdmissionRequest(
      requestOf(JOINER));
    await joiner.requestReplicaAdmission(requestOf(JOINER).operationId);
    joiner.startElection();
    const joinerPeerId = joiner.raft.readStatus().peerId;
    assert.equal(await waitFor(() => {
      const status = leader.raft.readStatus();
      return status.confState.voters.includes(joinerPeerId) &&
        status.followerProgress[JOINER[0]] === status.commitIndex;
    }, ADMISSION_BUDGET_MS), true, 'the joiner is admitted and replicated');
    // A redundant proposal forwarded by a non-leader would land after the
    // leader's own; give it the time it would take.
    await sleep(REDUNDANT_PROPOSAL_WINDOW_MS);

    const after = durableRecordOf(dbFileOf(LEADER));
    const admissionEntries = after.confChangeEntries.filter((index) =>
      !beforeJoiner.confChangeEntries.includes(index));
    assert.equal(admissionEntries.length, ONE_ADMISSION_ENTRY,
      'one admission lands one configuration entry (entries ' +
      `${JSON.stringify(admissionEntries)}; before ` +
      `${JSON.stringify(beforeJoiner.confChangeEntries)})`);
    assert.ok(after.voters.includes(joinerPeerId),
      'the committed ConfState names the joiner');
    assert.equal(after.appliedProposals, beforeJoiner.appliedProposals,
      'the admission added no application proposal');
    assert.equal(atFollower.admission.outcome, 'not_leader',
      'the follower answers the joiner\'s request with a typed NOT_LEADER');
    assert.deepEqual(admissionOutcomes(followerLog, JOINER[0]), [],
      'the follower reached no admission owner for the joiner');
    assert.deepEqual(admissionOutcomes(joinerLog, LEADER[0]), [],
      'the joiner proposes no admission of a peer its opened configuration ' +
      'already names (its init loop admits nothing)');
  } finally {
    network.deliver = async () => undefined;
    await Promise.all(services.map((service) => service.shutdown()));
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
