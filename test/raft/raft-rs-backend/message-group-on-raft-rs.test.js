// Message groups run on the rs-raft operation port (quest
// consensus-cutover quest; design R3 §1).
//
// Real MessageGroupService replicas built by production construction, each
// with its own durable database file and its own services cache, exchange
// the port's semantic envelopes over one real MessageRouter. Every durable
// fact is read back on a connection of the test's own: the hard state, the
// applied ConfState and the decoded committed proposals.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {MessageGroupService} from
  '../../../src/message-group/message-group-service.js';
import {MESSAGE_GROUP_SERVICE_ERROR_MSG} from
  '../../../src/message-group/constants.js';
import {MESSAGE_GROUP_COMMAND_REFUSAL} from
  '../../../src/message-group/message-group-committed-command-admission.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {registerMessageGroupTransportHandler} from
  '../../../src/bootstrap/shared/message-group-transport-handler.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {TEST_BOOT_INCARNATION} from
  '../../test-helpers/boot-incarnation-fixture.js';

const GROUP_ID = 'mg-rs-witness';
const NODE_ID = 'mg-rs-witness-node';
const FOUNDERS = ['mgw-0', 'mgw-1', 'mgw-2'];
const JOINER = 'mgw-3';
const BUDGET_MS = 10000;
const POLL_MS = 10;
const ELECTION_MAX_MS = 300;
const JOINER_QUIET_WINDOWS = 4;
const LOG_LEVELS = ['info', 'warn', 'error', 'debug', 'trace', 'fatal'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..');
const MESSAGE_GROUP_ENTRY = 'src/message-group/message-group-service.js';
// Retired-runtime vocabulary, assembled so this file never spells it.
const RETIRED_TOKEN = new RegExp([
  ['life', 'raft'].join(''),
  ['mark', 'wylde'].join(''),
  ['raft', '[-_]?', 'pro', 'vider'].join(''),
].join('|'), 'i');
const RETIRED_MODULES = [
  ['src/raft/', 'raft-group.js'],
  ['src/raft/', 'raft-timing-utils.js'],
  ['src/raft/', 'in-memory-log-adapter.js'],
  ['src/raft/', 'virtual-tick.js'],
].map((parts) => parts.join(''));
const LEGACY_OBJECT_ACCESS =
  /raft\.(nodes|packet|heartbeat|state|leader|term|log)\b|getRaftInstance/;

function configure() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: ELECTION_MAX_MS,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function waitFor(predicate, boundMs = BUDGET_MS) {
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

function statusOf(service) {
  return service.raft.readStatus();
}

function servicesRow(replicaId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    group_id: GROUP_ID,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    node_id: NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
  };
}

// The durable record of one replica file, read on the test's own connection.
function durableRecordOf(dbFile) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    const tables = independent.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\'').all()
      .map((row) => row.name);
    const hardState = independent.prepare(
      'SELECT term, vote, commit_index FROM _raft_rs_hard_state ' +
      'WHERE group_id = ?').get(GROUP_ID);
    const applied = independent.prepare(
      'SELECT voters, learners FROM _raft_rs_applied_state ' +
      'WHERE group_id = ?').get(GROUP_ID);
    return {
      tables,
      hardState: hardState === undefined ? null : {
        term: Number(hardState.term),
        vote: Number(hardState.vote),
        commitIndex: Number(hardState.commit_index),
      },
      voters: applied === undefined ? [] : JSON.parse(applied.voters),
      committed: RaftRsDurableStore.readCommittedEntriesIn(
        independent, GROUP_ID),
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

async function createGroupHost() {
  configure();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-rs-witness-'));
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    wsPort: 0,
  });
  await router.initialize({startServer: false});
  const caches = new Map();
  const live = new Map();
  const dbFileOf = (replicaId) =>
    path.join(directory, 'message-groups', GROUP_ID, `${replicaId}.db`);
  const cacheOf = (replicaId) => {
    if (!caches.has(replicaId)) {
      caches.set(replicaId, new SystemTableCache());
    }
    return caches.get(replicaId);
  };
  const open = async (replicaId, replicaIds, extra = {}) => {
    const cache = cacheOf(replicaId);
    fs.mkdirSync(path.dirname(dbFileOf(replicaId)), {recursive: true});
    const service = new MessageGroupService({
      groupId: GROUP_ID,
      replicaId,
      nodeId: NODE_ID,
      replicaIds,
      // The bootstrap peer hints production construction hands every
      // replica: the consensus port places its peers from these until the
      // services cache names them.
      peerAddresses: replicaIds.map((id) => `${NODE_ID}/message-group/${id}`),
      transport: router,
      nodeService: {
        getSystemTableCache: () => cache,
        getReadOnlySystemTableCache: () => cache,
      },
      dbPath: dbFileOf(replicaId),
      ...extra,
    });
    registerMessageGroupTransportHandler(service, {
      messageRouter: router,
      address: `${NODE_ID}/message-group/${replicaId}`,
    });
    live.set(replicaId, service);
    await service.initialize();
    return service;
  };
  const close = async (replicaId) => {
    const service = live.get(replicaId);
    live.delete(replicaId);
    router.unregister(`${NODE_ID}/message-group/${replicaId}`);
    await service?.shutdown();
  };
  const dispose = async () => {
    for (const replicaId of [...live.keys()]) {
      await close(replicaId);
    }
    await router.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return {router, live, open, close, dispose, dbFileOf, cacheOf};
}

async function openFounders(host, extra = {}) {
  const services = [];
  for (const replicaId of FOUNDERS) {
    services.push(await host.open(replicaId, FOUNDERS, extra));
  }
  return services;
}

function leaderOf(services) {
  const leaders = services.filter((service) =>
    statusOf(service).outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    statusOf(service).role === 'leader');
  return leaders.length === 1 ? leaders[0] : null;
}

async function electedLeader(services) {
  assert.equal(await waitFor(() => leaderOf(services) !== null), true,
    'one founder is elected leader over the semantic envelopes');
  return leaderOf(services);
}

function importClosure(entry) {
  const seen = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const relative = pending.pop();
    if (seen.has(relative)) {
      continue;
    }
    seen.add(relative);
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const specifiers = [...source.matchAll(
      /(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/g)]
      .map((match) => match[1]);
    for (const specifier of specifiers) {
      pending.push(path.relative(ROOT,
        path.resolve(path.dirname(path.join(ROOT, relative)), specifier)));
    }
  }
  return [...seen].sort();
}

test('message group constructs only the raft-rs operation port', async () => {
  const closure = importClosure(MESSAGE_GROUP_ENTRY);
  for (const retired of RETIRED_MODULES) {
    assert.equal(fs.existsSync(path.join(ROOT, retired)), false,
      `${retired} is deleted`);
  }
  for (const relative of closure) {
    assert.doesNotMatch(relative, RETIRED_TOKEN,
      `the message-group closure imports no retired module (${relative})`);
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, relative), 'utf8'),
      RETIRED_TOKEN, `${relative} names no retired runtime`);
  }
  const messageGroupSources = fs.readdirSync(
    path.join(ROOT, 'src/message-group'))
    .filter((name) => name.endsWith('.js'));
  for (const name of messageGroupSources) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(ROOT, 'src/message-group', name), 'utf8'),
      LEGACY_OBJECT_ACCESS,
      `src/message-group/${name} reads no legacy consensus object`);
  }

  const host = await createGroupHost();
  try {
    const transport = host.router;
    assert.throws(() => new MessageGroupService({
      groupId: GROUP_ID, replicaId: 'no-file', nodeId: NODE_ID, transport,
    }), {message: MESSAGE_GROUP_SERVICE_ERROR_MSG.MISSING_DB_PATH});
    assert.throws(() => new MessageGroupService({
      groupId: GROUP_ID, replicaId: 'memory', nodeId: NODE_ID, transport,
      dbPath: ':memory:',
    }), {message: MESSAGE_GROUP_SERVICE_ERROR_MSG.IN_MEMORY_DB_PATH_REFUSED});

    const solo = await host.open(FOUNDERS[0], [FOUNDERS[0]]);
    assert.equal(Object.isFrozen(solo.raft), true,
      'the replica holds the frozen semantic operation port');
    for (const absent of ['raftRuntime', 'logAdapter']) {
      assert.equal(solo[absent], undefined, `no ${absent} remains`);
    }
    const status = statusOf(solo);
    assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(status.role, 'leader',
      'a single-replica group campaigns once through the port');
    const record = durableRecordOf(host.dbFileOf(FOUNDERS[0]));
    for (const table of ['_raft_rs_log', '_raft_rs_hard_state',
      '_raft_rs_applied_state']) {
      assert.ok(record.tables.includes(table),
        `${table} is in the replica's own durable file`);
    }
    assert.equal(record.hardState.term, status.term,
      'the durable hard state carries the elected term');
    await assert.rejects(solo.proposeCDCCommand({type: 'NOT_A_COMMAND'}),
      (error) => error.reason === MESSAGE_GROUP_COMMAND_REFUSAL.UNKNOWN_TYPE,
      'an unknown command type is refused before propose');
    assert.equal(statusOf(solo).commitIndex, status.commitIndex,
      'the refused command reached no log');
  } finally {
    await host.dispose();
  }
});

test('message group proposal commits and applies through raft-rs', async () => {
  const host = await createGroupHost();
  try {
    const services = await openFounders(host);
    const leader = await electedLeader(services);
    const row = {id: 'mg-rs-node', address: '10.0.0.7:7000', status: 'active'};
    await leader.applyCDCEvent(TABLES.NODES, 'INSERT', row);
    for (const service of services) {
      assert.equal(await waitFor(() =>
        service.getWritableCache().get(TABLES.NODES, row.id)?.address ===
          row.address), true,
      `${service.replicaId}'s cache applied the committed CDC command`);
    }
    for (const replicaId of FOUNDERS) {
      const committed = durableRecordOf(host.dbFileOf(replicaId)).committed;
      assert.ok(committed.some((entry) => entry.command?.type === 'CDC' &&
        entry.command.tableName === TABLES.NODES &&
        entry.command.data?.id === row.id),
      `${replicaId}'s durable log holds the decoded CDC command`);
    }
  } finally {
    await host.dispose();
  }
});

test('message group membership comes from committed ConfState', async () => {
  const host = await createGroupHost();
  try {
    const services = await openFounders(host);
    const leader = await electedLeader(services);
    const followers = services.filter((service) => service !== leader);
    const followerLogs = followers.map(recordLog);

    // A deferred joiner: it is no voter, schedules nothing and so never
    // campaigns, whatever its bootstrap peer list names.
    const joiner = await host.open(JOINER, [...FOUNDERS, JOINER],
      {isJoiningExistingGroup: true});
    let joinerCandidacies = 0;
    joiner.raft.subscribe(RAFT_EVENT.CANDIDATE, () => {
      joinerCandidacies += 1;
    });
    await sleep(ELECTION_MAX_MS * JOINER_QUIET_WINDOWS);
    assert.equal(joinerCandidacies, 0, 'the deferred joiner never campaigns');
    assert.equal(statusOf(joiner).role, 'follower');
    assert.equal(statusOf(leader).confState.voters.length, FOUNDERS.length,
      'an unadmitted joiner is no voter of the committed configuration');
    assert.ok(leaderOf(services), 'the three voters keep their leader');

    // A services row only requests admission: seen by the followers alone it
    // admits nobody, since only the leader proposes and only the committed
    // ConfState is the membership.
    const joinerPeerId = statusOf(joiner).peerId;
    const sawJoinerRow = (log) => log.some((entry) =>
      entry.payload?.admission?.replicaIdentity === JOINER);
    for (const follower of followers) {
      host.cacheOf(follower.replicaId).applySystemTableChange(
        TABLES.SERVICES, 'INSERT', servicesRow(JOINER));
    }
    assert.equal(await waitFor(() => followerLogs.every(sawJoinerRow)), true,
      'each follower observed the joiner row');
    for (const service of services) {
      assert.equal(statusOf(service).confState.voters.includes(joinerPeerId),
        false, 'a row no leader proposed is no voter of any ConfState');
    }

    // Admission: the leader sees the row and commits the joiner.
    host.cacheOf(leader.replicaId).applySystemTableChange(
      TABLES.SERVICES, 'INSERT', servicesRow(JOINER));
    assert.equal(await waitFor(() =>
      statusOf(leader).confState.voters.includes(joinerPeerId)), true,
    'the leader commits the joiner into its ConfState');
    const membership = leader.readCommittedMembership();
    assert.ok(membership.voters.map(String).includes(String(joinerPeerId)),
      'the committed membership read names the admitted joiner');
    for (const log of followerLogs) {
      const outcomes = log.filter((entry) =>
        entry.payload?.admission?.replicaIdentity === JOINER)
        .map((entry) => entry.payload.admission.outcome);
      assert.ok(outcomes.length > 0, 'the follower observed the row');
      assert.deepEqual([...new Set(outcomes)],
        [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER],
        'a follower records a typed no-op instead of proposing');
    }
    joiner.completeJoinConvergence();
    assert.equal(await waitFor(() => {
      const joined = statusOf(joiner);
      return joined.confState.voters.includes(joinerPeerId) &&
        joined.commitIndex >= statusOf(leader).commitIndex;
    }), true, 'the admitted joiner replicates the committed configuration');
  } finally {
    await host.dispose();
  }
});

test('message group role and leader publication comes from raft-rs',
  async () => {
    const host = await createGroupHost();
    try {
      const services = await openFounders(host);
      const leader = await electedLeader(services);
      const leaderStatus = statusOf(leader);
      assert.equal(await waitFor(() => services.every((service) =>
        service.getLeaderId() === leaderStatus.leaderId)), true,
      'every replica publishes the leader the port announced');
      for (const service of services) {
        const status = statusOf(service);
        assert.equal(service.isCurrentRaftLeader(), status.role === 'leader');
        assert.equal(service.getCurrentTerm(), status.term);
        assert.equal(service.getStatus().term, status.term);
        assert.equal(service.getRole(), status.role);
      }
      assert.equal(leaderStatus.leaderId, leader.replicaId,
        'the leader identity is the replica identity');
    } finally {
      await host.dispose();
    }
  });

test('message group restart preserves term vote and configuration',
  async () => {
    const host = await createGroupHost();
    try {
      const services = await openFounders(host);
      await electedLeader(services);
      const confBefore = [...statusOf(services[0]).confState.voters].sort();
      for (const replicaId of FOUNDERS) {
        await host.close(replicaId);
      }
      const persisted = new Map(FOUNDERS.map((replicaId) =>
        [replicaId, durableRecordOf(host.dbFileOf(replicaId))]));
      for (const record of persisted.values()) {
        assert.ok(record.hardState.term > 0, 'a term was persisted');
      }

      const reopened = await openFounders(host, {deferElection: true});
      for (const service of reopened) {
        const before = persisted.get(service.replicaId);
        const status = statusOf(service);
        assert.equal(status.term, before.hardState.term,
          `${service.replicaId} reopens at its persisted term`);
        assert.deepEqual([...status.confState.voters].sort(), confBefore,
          `${service.replicaId} reopens with its committed configuration`);
        assert.deepEqual(durableRecordOf(host.dbFileOf(service.replicaId))
          .hardState, before.hardState,
        `${service.replicaId}'s vote survives the reopen untouched`);
      }
      for (const service of reopened) {
        service.startElection();
      }
      const leader = await electedLeader(reopened);
      const highestPersisted = Math.max(...[...persisted.values()]
        .map((record) => record.hardState.term));
      assert.ok(statusOf(leader).term > highestPersisted,
        'the next election continues from the persisted terms');
    } finally {
      await host.dispose();
    }
  });
