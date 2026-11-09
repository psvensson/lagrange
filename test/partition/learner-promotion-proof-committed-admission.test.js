/**
 * Learner promotion proof answered from the committed configuration and the
 * leader's own progress, and every partition peer addressed from the node
 * its admission committed (quest learner-host-from-committed-admission,
 * transition record evidence/transition.md):
 *
 *   (a) no services row for the learner          -> still granted
 *   (b) a stale services row (wrong host)        -> progress keyed by
 *                                                   identity; the nudge names
 *                                                   the learner
 *   (c) a replica absent from the configuration  -> NOT_IN_CONFIGURATION,
 *       even with a services row
 *   (d) a replica that does not lead             -> NOT_LEADER, before any
 *                                                   other read
 *   (e) a restarted leader re-reads the committed node from its durable
 *       identity record and still grants and addresses the learner
 *   (f) static census: the cause learner_address_unresolvable and the
 *       cache-derived peer address are gone from the decision and transport
 *   (g) the transport address of a learner is its committed node, whatever
 *       the services cache says; an identity without one refuses
 *       peer_not_in_configuration
 *
 * The fake port keeps the production shapes: an admission is the real
 * admission-context codec applied into a real durable identity registry (the
 * port's applyCommittedMembershipContext), followerProgress is keyed by
 * replica identity (raft-rs-status-observation.js), and the transport
 * resolver is the partition's own (committedPartitionPeerAddress) fed the
 * registry's committed node, as raft-rs-operation-port.js feeds it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
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
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  committedMembershipContext,
  encodeCommittedAdmissionContext,
} from '../../src/raft/raft-rs-committed-membership-context.js';
import {RAFT_RS_PEER_ADDRESS_REFUSAL} from
  '../../src/raft/raft-rs-peer-identity-constants.js';
import {committedPartitionPeerAddress} from
  '../../src/partition/partition-committed-peer-address.js';
import {admitPartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
} from '../../src/raft/learner-promotion-progress.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {settledTurn} from '../../src/raft/raft-rs-turn-answer.js';

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
const REMOVED_CAUSE = 'learner_address_unresolvable';
const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const TEMP_PREFIX = 'learner-host-admission-';

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
  const services = new Map(rows.map((row) => [row.service_id, row]));
  const tableOf = (table) => table === TABLES.SERVICES ? services : new Map();
  return {
    rows: services,
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

// A leader's port over a real durable identity registry: membership is the
// leader plus every admission applied; progress per replica identity.
function createLeaderPort({registry, role}) {
  const port = {
    role,
    registry,
    voters: new Set([deriveRaftRsPeerId(LEADER_REPLICA)]),
    learners: new Set(),
    progressByIdentity: new Map(),
    probes: [],
    membershipReads: 0,
    proposeConfChange(change) {
      // The port's own path: reserve, commit the admission context, and
      // apply it on every replica (raft-rs-operation-port.js).
      const peerId = port.registry.registerReplica(change.replicaIdentity);
      const context = committedMembershipContext({
        context: encodeCommittedAdmissionContext({
          replicaIdentity: change.replicaIdentity, peerId,
          nodeId: change.nodeId}),
        changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
          nodeId: peerId}]});
      port.registry.reserveCommittedReplica(context.replicaIdentity,
        context.peerId);
      port.registry.recordCommittedNodeId(context.replicaIdentity,
        context.nodeId);
      port.learners.add(peerId);
      return settledTurn(Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK}));
    },
    transportAddressOf(replicaIdentity) {
      return committedPartitionPeerAddress(replicaIdentity,
        port.registry.committedNodeIdOf(replicaIdentity));
    },
    readStatus() {
      return Object.freeze({
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        role: port.role,
        term: TERM,
        commitIndex: COMMIT_INDEX,
        appliedIndex: COMMIT_INDEX,
        peers: [],
        followerProgress: Object.fromEntries(port.progressByIdentity),
      });
    },
    readCommittedMembership() {
      port.membershipReads += 1;
      const ids = [...port.voters, ...port.learners];
      return Object.freeze({
        kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
        voters: [...port.voters],
        votersOutgoing: [],
        learners: [...port.learners],
        learnersNext: [],
        appliedIndex: COMMIT_INDEX,
        commitIndex: COMMIT_INDEX,
        term: TERM,
        gateOpen: true,
        identities: Object.fromEntries(ids.map((id) =>
          [id, port.registry.replicaIdentityOf(id)])),
      });
    },
    probePeerProgress(replicaIdentity) {
      port.probes.push(replicaIdentity);
      return Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK});
    },
  };
  return port;
}

function createLeader(_t, {cacheRows = [], role = RAFT_ROLE.LEADER,
  dbFile} = {}) {
  const file = dbFile ?? path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX)), 'replica.db');
  const db = new Database(file);
  const registry = new RaftRsPeerIdentityRegistry(db);
  registry.registerReplica(LEADER_REPLICA);
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: 'replica_operations',
    replicaId: LEADER_REPLICA,
    replicaIds: [LEADER_REPLICA],
    nodeId: LEADER_NODE,
    dbPath: ':memory:',
  }));
  const port = createLeaderPort({registry, role});
  partition.raft = port;
  partition.isLeader = role === RAFT_ROLE.LEADER;
  partition.systemTableCache = createServicesCache(cacheRows);
  return {partition, port, dbFile: file, db};
}

// The leader admits the learner on its committed node (the request owner
// takes it from the committed operation); the cache row may go missing or
// turn stale.
function admitLearner(partition) {
  return admitPartitionRaftPeer(partition, {
    replicaIdentity: LEARNER_REPLICA,
    nodeId: LEARNER_NODE,
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
  const {partition, port} = createLeader(t, {
    cacheRows: [liveServiceRow(LEARNER_REPLICA, LEARNER_NODE)],
  });
  const admission = admitLearner(partition);
  t.equal(admission.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
    'the leader proposed the admission');
  partition.systemTableCache.rows.delete(LEARNER_REPLICA);
  port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX);

  const response = await requestProof(partition);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'the committed configuration and the admission decide, not the cache');
  t.equal(response.proof.learnerMatchIndex, COMMIT_INDEX,
    'the grant carries the leader-observed match index');
});

test('(b) a stale services row (wrong host) changes nothing: progress is ' +
  'keyed by identity and the nudge names the learner', async (t) => {
  const {partition, port} = createLeader(t, {
    cacheRows: [liveServiceRow(LEARNER_REPLICA, LEARNER_NODE)],
  });
  admitLearner(partition);
  partition.systemTableCache.rows.set(LEARNER_REPLICA,
    liveServiceRow(LEARNER_REPLICA, STALE_NODE));
  port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX - 1);

  const behind = await requestProof(partition);
  t.equal(behind.proof.reason, LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND,
    'a lagging learner is refused progress_behind');
  t.same(port.probes, [LEARNER_REPLICA],
    'the nudge names the learner by identity; the port addresses it');
  t.equal(port.transportAddressOf(LEARNER_REPLICA),
    partitionAddress(LEARNER_NODE, LEARNER_REPLICA),
    'the port addresses the admitted node, never the stale row');

  port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX);
  const caughtUp = await requestProof(partition);
  t.equal(caughtUp.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'once caught up the learner is granted despite the stale row');
});

test('(c) a replica absent from the committed configuration is refused ' +
  'NOT_IN_CONFIGURATION even when a live services row names it',
async (t) => {
  const {partition, port} = createLeader(t, {
    cacheRows: [liveServiceRow(STRANGER_REPLICA, LEARNER_NODE)],
  });
  port.progressByIdentity.set(STRANGER_REPLICA, COMMIT_INDEX);
  const response = await requestProof(partition, STRANGER_REPLICA);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
    'the stranger is refused');
  t.equal(response.proof.reason,
    LEARNER_PROMOTION_PROOF_REASON.NOT_IN_CONFIGURATION,
    'the refusal names the committed configuration, not progress or address');
});

test('(d) a replica that does not lead refuses NOT_LEADER before any ' +
  'other read', async (t) => {
  const {partition, port} = createLeader(t, {role: RAFT_ROLE.FOLLOWER});
  const response = await requestProof(partition);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
    'a follower never grants');
  t.equal(response.proof.reason, LEARNER_PROMOTION_PROOF_REASON.NOT_LEADER,
    'leadership is decided first');
  t.equal(port.membershipReads, 0, 'no configuration read precedes it');
});

test('(e) a restarted leader re-reads the committed node from its durable ' +
  'identity record: it still grants and addresses the learner', async (t) => {
  const first = createLeader(t, {
    cacheRows: [liveServiceRow(LEARNER_REPLICA, LEARNER_NODE)],
  });
  admitLearner(first.partition);

  const restarted = createLeader(t, {dbFile: first.dbFile});
  // A new process opens the same durable file with a fresh registry.
  // The restarted port re-derives its configuration from its durable record
  // (the applied ConfState names the learner); the node is read back from
  // the identity store; the services cache holds nothing.
  restarted.port.learners.add(deriveRaftRsPeerId(LEARNER_REPLICA));
  restarted.port.progressByIdentity.set(LEARNER_REPLICA, COMMIT_INDEX);
  t.equal(restarted.port.registry.committedNodeIdOf(LEARNER_REPLICA),
    LEARNER_NODE, 'the committed node survived the restart');
  t.equal(restarted.port.transportAddressOf(LEARNER_REPLICA),
    partitionAddress(LEARNER_NODE, LEARNER_REPLICA),
    'the learner is addressed from the durable record');
  const response = await requestProof(restarted.partition);
  t.equal(response.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'the restarted leader grants from its committed facts');
});

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (fs.statSync(file).isDirectory()) {
      files.push(...sourceFiles(file));
    } else if (file.endsWith('.js')) {
      files.push(file);
    }
  }
  return files;
}

test('(f) static census: no learner_address_unresolvable cause and no ' +
  'cache-derived promotion-proof or partition transport address in src/',
async (t) => {
  const offenders = sourceFiles(SRC_ROOT).filter((file) =>
    fs.readFileSync(file, 'utf8').includes(REMOVED_CAUSE))
    .map((file) => file.slice(SRC_ROOT.length));
  t.same(offenders, [],
    `no src file names the cause ${REMOVED_CAUSE}`);
  const proofMethods = fs.readFileSync(path.join(SRC_ROOT,
    'partition/partition-service-learner-promotion-proof-methods.js'), 'utf8');
  t.notOk(/buildPeerAddress|resolveKnownPeerAddress|resolvePeerAddressFromCache|systemTableCache\.get\(/
    .test(proofMethods),
  'the proof handler resolves no address through the services cache');
  const raftInit = fs.readFileSync(path.join(SRC_ROOT,
    'partition/partition-service-raft-init-base.js'), 'utf8');
  t.notOk(/buildPeerAddress|resolveKnownPeerAddress/.test(raftInit),
    'the partition port opening resolves no peer through the address book');
  t.ok(/RESOLVE_PEER_ADDRESS\]:\s*committedPartitionPeerAddress/
    .test(raftInit),
  'the transport resolver bound to the port is the committed resolver');
});

test('(g) the transport address of a learner is its committed node; an ' +
  'identity without one refuses peer_not_in_configuration', async (t) => {
  const {partition, port} = createLeader(t, {
    cacheRows: [liveServiceRow(LEARNER_REPLICA, LEARNER_NODE),
      liveServiceRow(STRANGER_REPLICA, STALE_NODE)],
  });
  admitLearner(partition);
  partition.systemTableCache.rows.set(LEARNER_REPLICA,
    liveServiceRow(LEARNER_REPLICA, STALE_NODE));
  t.equal(port.transportAddressOf(LEARNER_REPLICA),
    partitionAddress(LEARNER_NODE, LEARNER_REPLICA),
    'the committed node addresses the learner whatever the row says');
  port.registry.registerReplica(STRANGER_REPLICA);
  t.throws(() => port.transportAddressOf(STRANGER_REPLICA),
    {message: RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION},
    'a reserved identity with no committed node is refused typed, even ' +
      'with a live services row');
});
