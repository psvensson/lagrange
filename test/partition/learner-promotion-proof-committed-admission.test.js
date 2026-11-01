/**
 * Learner promotion proof answered from the committed configuration and the
 * leader's own admission (quest learner-host-from-committed-admission,
 * transition record evidence/transition.md). The leader admitted the learner
 * with its unified address (admitPartitionRaftPeer); the proof answer and the
 * address the leader nudges must not depend on the CDC-fed services cache:
 *
 *   (a) no services row for the learner          -> still granted
 *   (b) a stale services row (wrong host)        -> the nudge reaches the
 *                                                   admitted host
 *   (c) a replica absent from the configuration  -> NOT_IN_CONFIGURATION,
 *       even with a services row
 *   (d) a replica that does not lead             -> NOT_LEADER, whatever the
 *                                                   cache holds
 *   (f) static census: the cause learner_address_unresolvable and the cache
 *       resolution of a promotion-proof address are gone from src/
 *
 * The fake port shapes status the way raft-rs-status-observation.js does:
 * followerProgress is keyed by the address the group's transport resolver
 * gives each configured peer (RESOLVE_PEER_ADDRESS, bound in
 * partition-service-raft-init-base.js), and an unresolvable peer is dropped.
 */

import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {admitPartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {LEARNER_PROMOTION_PROOF_DECISION} from
  '../../src/raft/learner-promotion-progress.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const PARTITION_ID = 'replica_operations-p1';
const LEADER_REPLICA = 'replica_operations-p1-r1';
const LEARNER_REPLICA = 'replace-replica-804a4438';
const STRANGER_REPLICA = 'replica_operations-p1-r9';
const LEADER_NODE = 'node-1';
const LEARNER_NODE = 'node-3';
const STALE_NODE = 'node-9';
const TERM = 2;
const COMMIT_INDEX = 46;
const EPOCH = 0;
const NOT_IN_CONFIGURATION = 'not_in_configuration';
const NOT_LEADER = 'not_leader';
const REMOVED_CAUSE = 'learner_address_unresolvable';
const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: LEADER_NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function partitionAddress(nodeId, replicaId) {
  return `${nodeId}/partition/${replicaId}`;
}

// The services cache as the partition reads it: get / filter / getAll.
function createServicesCache(rows = []) {
  const byTable = new Map([[TABLES.SERVICES, new Map()]]);
  for (const row of rows) {
    byTable.get(TABLES.SERVICES).set(row.service_id, row);
  }
  const tableOf = (table) => byTable.get(table) || new Map();
  return {
    rows: byTable.get(TABLES.SERVICES),
    get: (table, key) => tableOf(table).get(key) || null,
    getAll: (table) => [...tableOf(table).values()],
    filter: (table, predicate) => [...tableOf(table).values()].filter(predicate),
    subscribe: () => () => {},
  };
}

function liveServiceRow(replicaId, nodeId) {
  return {
    service_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status: 'active',
  };
}

// A leader's port: the committed configuration (voters, learners, every id's
// reserved identity), the leader's own progress per configured peer, and the
// transport resolver the group binds (production: RESOLVE_PEER_ADDRESS).
function createLeaderPort({role = RAFT_ROLE.LEADER} = {}) {
  const port = {
    role,
    voters: [deriveRaftRsPeerId(LEADER_REPLICA)],
    learners: [],
    identities: {[deriveRaftRsPeerId(LEADER_REPLICA)]: LEADER_REPLICA},
    progressByIdentity: new Map(),
    probes: [],
    resolveTransportAddress: null,
    proposeConfChange(change) {
      const peerId = deriveRaftRsPeerId(change.replicaIdentity);
      port.learners.push(peerId);
      port.identities[peerId] = change.replicaIdentity;
      return Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
    },
    followerProgress() {
      const snapshot = {};
      for (const [identity, matched] of port.progressByIdentity) {
        try {
          snapshot[port.resolveTransportAddress(identity)] = matched;
        } catch {
          // raft-rs-status-observation.js drops an unresolvable peer.
        }
      }
      return snapshot;
    },
    readStatus() {
      return Object.freeze({
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        role: port.role,
        term: TERM,
        commitIndex: COMMIT_INDEX,
        appliedIndex: COMMIT_INDEX,
        peers: Object.entries(port.identities)
          .filter(([, identity]) => identity !== LEADER_REPLICA)
          .map(([peerId, replicaIdentity]) => Object.freeze({
            peerId, replicaIdentity,
            learner: port.learners.includes(peerId)})),
        followerProgress: port.followerProgress(),
      });
    },
    readCommittedMembership() {
      return Object.freeze({
        kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
        voters: [...port.voters],
        votersOutgoing: [],
        learners: [...port.learners],
        learnersNext: [],
        appliedIndex: COMMIT_INDEX,
        commitIndex: COMMIT_INDEX,
        term: TERM,
        leaderId: port.role === RAFT_ROLE.LEADER ?
          deriveRaftRsPeerId(LEADER_REPLICA) : null,
        gateOpen: true,
        identities: {...port.identities},
      });
    },
    probePeerProgress(address) {
      port.probes.push(address);
      return Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
    },
  };
  return port;
}

function createLeader({cacheRows = [], role} = {}) {
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: 'replica_operations',
    replicaId: LEADER_REPLICA,
    replicaIds: [LEADER_REPLICA],
    nodeId: LEADER_NODE,
    dbPath: ':memory:',
  }));
  const port = createLeaderPort({role});
  port.resolveTransportAddress = (identity) =>
    partition.buildPeerAddress(identity);
  partition.raft = port;
  partition.isLeader = port.role === RAFT_ROLE.LEADER;
  partition.systemTableCache = createServicesCache(cacheRows);
  return {partition, port};
}

// The leader admits the learner with the address its row named at that
// moment; afterwards the cache row may go missing or turn stale.
function admitLearner(partition) {
  return admitPartitionRaftPeer(partition, {
    replicaIdentity: LEARNER_REPLICA,
    peerAddress: partitionAddress(LEARNER_NODE, LEARNER_REPLICA),
  });
}

function requestProof(partition, replicaId = LEARNER_REPLICA) {
  return partition.handleLearnerPromotionProofRequest({
    partitionId: PARTITION_ID,
    replicaId,
    membershipEpoch: EPOCH,
  });
}

test('(a) a caught-up learner the leader admitted is granted while the ' +
  'services cache holds no row for it', async (t) => {
  const {partition, port} = createLeader({
    cacheRows: [liveServiceRow(LEARNER_REPLICA, LEARNER_NODE)],
  });
  const admission = admitLearner(partition);
  t.equal(admission.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
    'the leader proposed the admission');
  partition.systemTableCache.rows.delete(LEARNER_REPLICA);
  port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX);

  const response = requestProof(partition);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'the committed configuration and the admission decide, not the cache');
  t.equal(response.proof.learnerMatchIndex, COMMIT_INDEX,
    'the grant carries the leader-observed match index');
});

test('(b) a stale services row (wrong host) does not redirect the leader: ' +
  'the replication nudge reaches the admitted host', async (t) => {
  const {partition, port} = createLeader({
    cacheRows: [liveServiceRow(LEARNER_REPLICA, LEARNER_NODE)],
  });
  admitLearner(partition);
  partition.systemTableCache.rows.set(LEARNER_REPLICA,
    liveServiceRow(LEARNER_REPLICA, STALE_NODE));
  port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX - 1);

  const behind = requestProof(partition);
  t.equal(behind.proof.reason, 'progress_behind',
    'a lagging learner is refused progress_behind');
  t.same(port.probes, [partitionAddress(LEARNER_NODE, LEARNER_REPLICA)],
    'the nudge goes to the host the leader admitted, never the stale row');

  port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX);
  const caughtUp = requestProof(partition);
  t.equal(caughtUp.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'once caught up the learner is granted despite the stale row');
});

test('(c) a replica absent from the committed configuration is refused ' +
  'NOT_IN_CONFIGURATION even when a live services row names it',
async (t) => {
  const {partition} = createLeader({
    cacheRows: [liveServiceRow(STRANGER_REPLICA, LEARNER_NODE)],
  });
  const response = requestProof(partition, STRANGER_REPLICA);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
    'the stranger is refused');
  t.equal(response.proof.reason, NOT_IN_CONFIGURATION,
    'the refusal names the committed configuration, not progress or address');
});

test('(d) a replica that does not lead refuses NOT_LEADER whatever its ' +
  'services cache holds', async (t) => {
  const {partition} = createLeader({role: RAFT_ROLE.FOLLOWER});
  const response = requestProof(partition);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
    'a follower never grants');
  t.equal(response.proof.reason, NOT_LEADER,
    'leadership is decided before any address or cache read');
});

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (path.endsWith('.js')) {
      files.push(path);
    }
  }
  return files;
}

test('(f) static census: no learner_address_unresolvable cause and no ' +
  'cache-derived promotion-proof or learner transport address in src/',
async (t) => {
  const offenders = sourceFiles(SRC_ROOT).filter((path) =>
    readFileSync(path, 'utf8').includes(REMOVED_CAUSE))
    .map((path) => path.slice(SRC_ROOT.length));
  t.same(offenders, [],
    `no src file names the cause ${REMOVED_CAUSE}`);
  const proofMethods = readFileSync(join(SRC_ROOT,
    'partition/partition-service-learner-promotion-proof-methods.js'), 'utf8');
  t.notOk(/buildPeerAddress|resolveKnownPeerAddress|resolvePeerAddressFromCache|systemTableCache\.get\(/
    .test(proofMethods),
  'the proof handler resolves no address through the services cache');
  const raftInit = readFileSync(join(SRC_ROOT,
    'partition/partition-service-raft-init-base.js'), 'utf8');
  t.notOk(/RESOLVE_PEER_ADDRESS\]:\s*\(address\)\s*=>\s*this\.buildPeerAddress/
    .test(raftInit),
  'the transport resolver bound to the port is not the cache-backed ' +
    'buildPeerAddress');
});
