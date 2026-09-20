// Part A's drives, as records. The `.test.js` files assert on them and the
// evaluation document records the same numbers, so what the document says
// about today's backend is what was measured on today's backend.
//
// Every object driven here is the real production owner: `src/raft/liferaft.js`,
// the real `LiferaftProvider`, the real peer-cache reconciliation, the real
// `PartitionRaftStorage` over a real SQLite file and the real partition
// lifecycle wiring.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import LifeRaft from '../../../src/raft/liferaft.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {PartitionRaftStorage} from
  '../../../src/partition/partition-raft-storage.js';
import {SQLiteLogAdapter} from '../../../src/raft/sqlite-log-adapter.js';
import {SQLITE_RAFT_STATE_KEY} from
  '../../../src/raft/sqlite-log-adapter-callback-api.js';
import {reconcileRaftPeersFromCacheForService} from
  '../../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {wirePartitionRaftLifecycleEvents} from
  '../../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {
  ReplicaStatus,
  majorityReportedBy,
  memberAddressesReportedBy,
  partitionServiceHost,
  replicaAddress,
  serviceRow,
  shutdown,
  virtualTimeSource,
} from './liferaft-production-fixture.js';

const REPLICA = Object.freeze({
  A: 'replica-a', B: 'replica-b', C: 'replica-c', D: 'replica-d',
  ONE: 'replica-1', TWO: 'replica-2', THREE: 'replica-3',
});

const TERM_DRIVE = Object.freeze({
  PARTITION_ID: 'partition-term-and-vote',
  REPLICA_ID: 'replica-local',
  NODE_ID: 'node-local',
  LOCAL_ADDRESS: 'node-local/partition/replica-local',
  CANDIDATE_ADDRESS: 'node-peer/partition/replica-peer',
  CANDIDATE_TERM: 7,
  CANDIDATE_STATE: 1,
  EMPTY_LEADER: '',
  PACKET_EVENT: 'data',
  VOTE_PACKET_TYPE: 'vote',
  TEMP_PREFIX: 'raft-backend-evaluation-',
  DB_FILE: 'replica.db',
  ELECTION_MIN_MS: 100,
  ELECTION_MAX_MS: 200,
  HEARTBEAT_MS: 50,
  PERSIST_PREFIX: 'persist',
  STATE_ROW_SQL: 'SELECT key, value FROM _raft_state',
  UTF8: 'utf8',
});

const PACKET_TYPE = 'append';
const PACKET_PAYLOAD = Object.freeze({probe: 'configuration-locality'});

// --- A1. one partition, two caches, two voting configurations ---------------

function runTwoCachesTwoConfigurations() {
  const hostA = partitionServiceHost({
    replicaId: REPLICA.A,
    cachedRows: [
      serviceRow(REPLICA.A, ReplicaStatus.ACTIVE),
      serviceRow(REPLICA.B, ReplicaStatus.ACTIVE),
      serviceRow(REPLICA.C, ReplicaStatus.ACTIVE),
    ],
  });
  const hostB = partitionServiceHost({
    replicaId: REPLICA.B,
    cachedRows: [
      serviceRow(REPLICA.A, ReplicaStatus.ACTIVE),
      serviceRow(REPLICA.B, ReplicaStatus.ACTIVE),
      // The replacement target this node's cache has already seen; it is
      // still catching up, which is the status the reconciliation admits.
      serviceRow(REPLICA.D, ReplicaStatus.SYNCING),
    ],
  });
  try {
    let emitted = 0;
    hostA.raft.write = () => {
      emitted += 1;
    };
    hostB.raft.write = () => {
      emitted += 1;
    };
    reconcileRaftPeersFromCacheForService(hostA);
    reconcileRaftPeersFromCacheForService(hostB);

    const configurationA = memberAddressesReportedBy(hostA);
    const configurationB = memberAddressesReportedBy(hostB);
    const unknownToA = configurationB
      .filter((address) => !configurationA.includes(address));
    return {
      id: 'liferaft-two-caches-two-configurations', driven: true,
      configurationA, configurationB,
      majorityA: majorityReportedBy(hostA),
      majorityB: majorityReportedBy(hostB),
      protocolMessagesEmitted: emitted,
      syncingRowAdmittedAsVoter:
        configurationB.includes(replicaAddress(REPLICA.D)),
      unknownToA,
      bCanReachItsMajorityOnMembersADoesNotCount:
        unknownToA.length + 1 >= majorityReportedBy(hostB),
    };
  } finally {
    shutdown([hostA, hostB]);
  }
}

// --- A2. the configuration is local, unreplicated, ungenerational -----------

async function runConfigurationLocality() {
  const observer = partitionServiceHost({
    replicaId: REPLICA.TWO,
    cachedRows: [serviceRow(REPLICA.TWO, ReplicaStatus.ACTIVE)],
  });
  const changing = partitionServiceHost({
    replicaId: REPLICA.ONE,
    cachedRows: [
      serviceRow(REPLICA.ONE, ReplicaStatus.ACTIVE),
      serviceRow(REPLICA.TWO, ReplicaStatus.ACTIVE),
    ],
  });
  try {
    let emitted = 0;
    changing.raft.write = () => {
      emitted += 1;
    };
    const observerBefore = memberAddressesReportedBy(observer);
    reconcileRaftPeersFromCacheForService(changing);
    const atTwoMembers = memberAddressesReportedBy(changing);
    const packetAtTwo = await changing.raft.packet(
      PACKET_TYPE, PACKET_PAYLOAD);

    changing.systemTableCache.filter = (_table, predicate) => [
      serviceRow(REPLICA.ONE, ReplicaStatus.ACTIVE),
      serviceRow(REPLICA.TWO, ReplicaStatus.ACTIVE),
      serviceRow(REPLICA.THREE, ReplicaStatus.ACTIVE),
    ].filter(predicate);
    reconcileRaftPeersFromCacheForService(changing);
    const atThreeMembers = memberAddressesReportedBy(changing);
    const packetAtThree = await changing.raft.packet(
      PACKET_TYPE, PACKET_PAYLOAD);

    return {
      id: 'liferaft-configuration-locality', driven: true,
      atTwoMembers, atThreeMembers,
      protocolMessagesEmitted: emitted,
      observerBefore,
      observerAfter: memberAddressesReportedBy(observer),
      observerLearnedTheOtherNode: memberAddressesReportedBy(observer)
        .includes(replicaAddress(REPLICA.ONE)),
      packetKeys: Object.keys(packetAtTwo).sort(),
      packetsIdenticalAcrossConfigurationChange:
        JSON.stringify(packetAtTwo) === JSON.stringify(packetAtThree),
    };
  } finally {
    shutdown([changing, observer]);
  }
}

// --- A3. term and vote across a restart on the production path --------------

function recordingProxy(target, sink, predicate) {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      if (predicate(String(property))) {
        sink.push(String(property));
      }
      return value.bind(object);
    },
  });
}

function partitionServiceDouble(raft, storage) {
  return {
    partitionId: TERM_DRIVE.PARTITION_ID,
    replicaId: TERM_DRIVE.REPLICA_ID,
    nodeId: TERM_DRIVE.NODE_ID,
    replicaIds: [TERM_DRIVE.REPLICA_ID],
    leaderId: null,
    isLeader: false,
    raft,
    storage,
    raftProvider: new LiferaftProvider(),
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    normalizeLeaderReplicaId: (candidate) => candidate,
    scheduleLeaderOwnedActivation() {},
    cancelLeaderOwnedActivation() {},
    clearPendingCommittedWrites() {},
    updateRebalancerLeadership() {},
    applyCommittedEntry() {},
  };
}

async function runTermAndVoteAcrossRestart() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), TERM_DRIVE.TEMP_PREFIX));
  const databasePath = path.join(directory, TERM_DRIVE.DB_FILE);
  const database = new Database(databasePath);
  const logAdapter = new SQLiteLogAdapter(database);
  const storage = new PartitionRaftStorage(
    database, TERM_DRIVE.PARTITION_ID, logAdapter);
  const adapterCalls = [];
  const storageCalls = [];
  const raft = new LifeRaft(TERM_DRIVE.LOCAL_ADDRESS, {
    'election min': TERM_DRIVE.ELECTION_MIN_MS,
    'election max': TERM_DRIVE.ELECTION_MAX_MS,
    'heartbeat': TERM_DRIVE.HEARTBEAT_MS,
    'Log': function() {
      return recordingProxy(logAdapter, adapterCalls, () => true);
    },
    'timeSource': virtualTimeSource(),
  });
  wirePartitionRaftLifecycleEvents(partitionServiceDouble(raft,
    recordingProxy(storage, storageCalls,
      (name) => name.startsWith(TERM_DRIVE.PERSIST_PREFIX))), () => false);

  let record = null;
  try {
    const replies = [];
    raft.emit(TERM_DRIVE.PACKET_EVENT, {
      type: TERM_DRIVE.VOTE_PACKET_TYPE,
      term: TERM_DRIVE.CANDIDATE_TERM,
      address: TERM_DRIVE.CANDIDATE_ADDRESS,
      state: TERM_DRIVE.CANDIDATE_STATE,
      leader: TERM_DRIVE.EMPTY_LEADER,
      last: {index: 0, term: 0, committedIndex: 0},
    }, (reply) => replies.push(reply));
    await raft.awaitCurrentProtocolIdle();

    const durableRows = database.prepare(TERM_DRIVE.STATE_ROW_SQL).all();
    record = {
      id: 'liferaft-term-and-vote-across-restart', driven: true,
      liveTerm: raft.term,
      liveVotedFor: raft.votes.for,
      voteGranted: replies.some((reply) => reply?.data?.granted === true),
      storageTermInMemory: storage.currentTerm,
      storageVotedForInMemory: storage.votedFor,
      persistCallsOnStorage: [...storageCalls],
      adapterPersistedTerm: adapterCalls.includes('setTerm'),
      adapterPersistedVote: adapterCalls.includes('setVotedFor'),
      durableStateKeys: durableRows.map((row) => row.key).sort(),
      durableTermKey: SQLITE_RAFT_STATE_KEY.CURRENT_TERM,
      durableVoteKey: SQLITE_RAFT_STATE_KEY.VOTED_FOR,
    };
  } finally {
    raft.end();
    database.close();
  }

  const reopened = new Database(databasePath);
  try {
    const restarted = new PartitionRaftStorage(
      reopened, TERM_DRIVE.PARTITION_ID, new SQLiteLogAdapter(reopened));
    record.termAfterRestart = restarted.currentTerm;
    record.votedForAfterRestart = restarted.votedFor;
    record.termSurvived = restarted.currentTerm === record.liveTerm;
    record.voteSurvived = restarted.votedFor === record.liveVotedFor;
  } finally {
    reopened.close();
    fs.rmSync(directory, {recursive: true, force: true});
  }
  return record;
}

export {
  TERM_DRIVE,
  runConfigurationLocality,
  runTermAndVoteAcrossRestart,
  runTwoCachesTwoConfigurations,
};
