/**
 * Message-group peers and the message-group forwarding leader addressed from
 * the committed configuration and the live raft status (quest
 * peer-and-leader-address-from-committed-configuration, attempt 1; transition
 * record solve/quests/<id>/evidence/transition.md):
 *
 *   (a) a founder's peer with no services row and no hint list resolves to
 *       the address on its committed (GENESIS) node
 *   (b) a configured peer whose services row is stale resolves the same
 *   (c) a configured peer without a committed node refuses typed
 *       peer_not_in_configuration, whatever row or hint names it
 *   (d) the message-group GENESIS stamp commits founderNodeIds: the seed
 *       allocation places every founder on the seed node
 *   (e) one committed peer-context shape (D-C3): the FreshMG managed
 *       ADD_LEARNER commits nodeId, every replica records it at apply, and a
 *       context or retained origin without nodeId does not decode
 *   (f) U11: the forwarding leader is the live raft leader; a stale
 *       message_groups row does not change it, and the join-convergence
 *       target is the live leader, not a hint
 *   (g) static: no message-group address decision reads the cache, a hint
 *       list or the deleted resolvers
 *
 * (a)-(c) run real MessageGroupService replicas on the real raft-rs port, each
 * on its own durable file; (e) runs the managed transition on the real raft-rs
 * cluster harness.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {MessageGroupService} from
  '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {RaftRole} from '../../src/message-group/message-group-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION,
} from '../../src/raft/raft-operation-port-constants.js';
import {PEER_ADDRESS_STATUS} from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_PEER_ADDRESS_REFUSAL} from
  '../../src/raft/raft-rs-peer-identity-constants.js';
import {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  INVALID_COMMITTED_LEARNER_ADMISSION,
  committedMembershipContext,
  decodeCommittedLearnerAdmission,
} from '../../src/raft/raft-rs-committed-membership-context.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {createSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {INITIAL_MESSAGE_GROUP_ID} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {reportingConsensusPort} from './message-group-service-test-support.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..');
const GROUP_ID = 'mg-committed-address';
const HOST_NODE = 'mg-committed-host';
const FOUNDERS = ['mgc-0', 'mgc-1', 'mgc-2'];
const FOUNDER_NODES = {'mgc-0': HOST_NODE, 'mgc-1': 'node-b', 'mgc-2': 'node-c'};
const STALE_NODE = 'node-stale';

function mgAddress(nodeId, replicaId) {
  return `${nodeId}/message-group/${replicaId}`;
}

function configure() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: HOST_NODE},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function servicesRow(replicaId, nodeId) {
  return {
    [COLUMN.SERVICE_ID]: replicaId,
    replica_id: replicaId,
    [COLUMN.GROUP_ID]: GROUP_ID,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.ADDRESS]: mgAddress(nodeId, replicaId),
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
  };
}

// One founder of the group, opened on the real raft-rs port with elections
// deferred: its status names every configured peer and the address the
// port's resolver gives it, with no election and no traffic.
async function openFounder(t, {founderNodeIds, rows = [], hints = []}) {
  configure();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-committed-'));
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: HOST_NODE, wsPort: 0});
  await router.initialize({startServer: false});
  const cache = new SystemTableCache();
  for (const row of rows) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
  }
  const dbPath = path.join(directory, `${FOUNDERS[0]}.db`);
  const service = new MessageGroupService({
    groupId: GROUP_ID,
    replicaId: FOUNDERS[0],
    nodeId: HOST_NODE,
    replicaIds: FOUNDERS,
    founderNodeIds,
    ...(hints.length > 0 ? {peerAddresses: hints} : {}),
    deferElection: true,
    transport: router,
    nodeService: {
      getSystemTableCache: () => cache,
      getReadOnlySystemTableCache: () => cache,
    },
    dbPath,
  });
  t.teardown(async () => {
    await service.shutdown();
    await router.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  await service.initialize();
  return service;
}

function peerOf(service, replicaId) {
  const status = service.raft.readStatus();
  return status.peers.find((peer) => peer.replicaIdentity === replicaId);
}

test('(a) a founder peer with no services row and no hint list resolves ' +
  'to its committed node', async (t) => {
  const service = await openFounder(t, {founderNodeIds: FOUNDER_NODES});
  for (const replicaId of FOUNDERS.slice(1)) {
    const peer = peerOf(service, replicaId);
    t.equal(peer?.addressStatus, PEER_ADDRESS_STATUS.RESOLVED,
      `${replicaId} is addressed from the committed configuration alone`);
    t.equal(peer?.address, mgAddress(FOUNDER_NODES[replicaId], replicaId),
      `${replicaId} is addressed on the node its GENESIS stamp committed`);
  }
});

test('(b) a configured peer whose services row is stale resolves to its ' +
  'committed node', async (t) => {
  const service = await openFounder(t, {
    founderNodeIds: FOUNDER_NODES,
    rows: [servicesRow('mgc-1', STALE_NODE)],
    hints: [mgAddress(STALE_NODE, 'mgc-1')],
  });
  t.equal(peerOf(service, 'mgc-1')?.address,
    mgAddress(FOUNDER_NODES['mgc-1'], 'mgc-1'),
    'the committed node addresses the peer, never the stale row or a hint');
  t.equal(service.resolveCommittedPeerAddress('mgc-1'),
    mgAddress(FOUNDER_NODES['mgc-1'], 'mgc-1'),
    'the non-transport resolver answers the same committed address');
});

test('(c) a configured peer without a committed node refuses ' +
  'peer_not_in_configuration, whatever row or hint names it', async (t) => {
  const {'mgc-2': _unplaced, ...placed} = FOUNDER_NODES;
  void _unplaced;
  const service = await openFounder(t, {
    founderNodeIds: placed,
    rows: [servicesRow('mgc-2', 'node-c')],
    hints: [mgAddress('node-c', 'mgc-2')],
  });
  const peer = peerOf(service, 'mgc-2');
  t.equal(peer?.addressStatus, PEER_ADDRESS_STATUS.UNAVAILABLE,
    'a peer with no committed node has no address');
  t.equal(peer?.address, null, 'no row or hint stands in for it');
  t.throws(() => service.resolveCommittedPeerAddress('mgc-2'),
    {message: RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION},
    'the non-transport resolver refuses typed');
  t.throws(() => service.resolveCommittedPeerAddress('mgc-9'),
    {message: RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION},
    'an identity outside the configuration refuses typed');
});

test('(d) the message-group GENESIS stamp commits founderNodeIds from the ' +
  'seed allocation', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-seed-decl-'));
  t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
  const draft = createSeedOriginalAllocation({dataDir, nodeId: 'seed-node',
    buildDigest: 'digest', now: 1});
  const messageGroupMembers = draft.members.filter((member) =>
    member.serviceType === SERVICE_TYPE.MESSAGE_GROUP);
  t.ok(messageGroupMembers.length > 0, 'the seed declares message-group founders');
  for (const member of messageGroupMembers) {
    t.equal(member.groupId, INITIAL_MESSAGE_GROUP_ID);
    t.same({...member.membership.founderNodeIds},
      Object.fromEntries(member.replicaIds.map((id) => [id, 'seed-node'])),
      `${member.replicaId}: every message-group founder is committed on the seed node`);
  }
});

function electedCluster(t, suffix) {
  const cluster = new PartitionNodeCluster({
    partitionId: `mg-dc3-${suffix}`, replicaIds: FOUNDERS});
  t.teardown(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  t.ok(cluster.settle(() => cluster.leaderReplicaId() !== null),
    'the founders elect a leader');
  return {cluster, leader: cluster.leaderReplicaId()};
}

test('(e) the FreshMG managed ADD_LEARNER commits nodeId and every replica ' +
  'records it at apply; a context without nodeId does not decode',
async (t) => {
  const target = 'mg-dc3-target';
  const targetNode = 'node-target';
  const {cluster, leader} = electedCluster(t, 'learner');
  for (const replicaId of FOUNDERS) {
    new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
      .registerReplica(target);
  }
  const status = cluster.node(leader).readStatus();
  const answer = cluster.node(leader)[
    RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]({
    operationId: 'dc3-operation',
    transitionIdentity: 'dc3-transition',
    permitSequence: 1,
    stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
    replicaIdentity: target,
    nodeId: targetNode,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration,
    leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex},
  }).result; // the port answers a settled turn (raft-rs-turn-answer.js)
  t.equal(answer.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  const peerId = deriveRaftRsPeerId(target);
  t.ok(cluster.settle(() => FOUNDERS.every((replicaId) =>
    cluster.node(replicaId).readStatus().confState.learners.includes(peerId))),
  'the learner is in every founder\'s applied configuration');
  for (const replicaId of FOUNDERS) {
    t.equal(new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
      .committedNodeIdOf(target), targetNode,
    `${replicaId} records the learner's committed node at apply`);
  }

  // A later stage of the transition naming another node than the one the
  // learner was admitted on is refused before any proposal: the committed
  // node is written once and never replaced.
  const admitted = cluster.node(leader).readStatus();
  const lengthBefore = admitted.lastIndex;
  const mismatched = cluster.node(leader)[
    RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]({
    operationId: 'dc3-operation',
    transitionIdentity: 'dc3-transition',
    permitSequence: 2,
    stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE,
    replicaIdentity: target,
    nodeId: 'node-elsewhere',
    replicaLifecycleIncarnation: admitted.lifecycleIncarnation,
    runtimeGeneration: admitted.runtimeGeneration,
    leaderTerm: admitted.term,
    leaderConfigurationStamp: {configurationKey: admitted.configurationKey,
      membershipGenerationIndex: admitted.membershipGenerationIndex},
  }).result;
  t.equal(mismatched.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH,
    'a transition naming a node other than the target\'s committed node refuses');
  t.equal(cluster.node(leader).readStatus().lastIndex, lengthBefore,
    'the refused transition appends nothing');
  for (const replicaId of FOUNDERS) {
    t.equal(new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
      .committedNodeIdOf(target), targetNode,
    `${replicaId} still records the admitted node`);
  }

  const sixKey = {operationId: 'dc3-operation',
    transitionIdentity: 'dc3-transition', permitSequence: 1,
    stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
    replicaIdentity: target, peerId};
  const encode = (context) => Buffer.from(JSON.stringify(context))
    .toString('base64');
  const change = {changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
    nodeId: peerId}]};
  t.throws(() => committedMembershipContext({...change, context: encode(sixKey)}),
    {message: 'malformed committed membership context'},
    'a managed context without nodeId does not decode (no old-format decoder)');
  t.same({...committedMembershipContext({...change,
    context: encode({...sixKey, nodeId: targetNode})})},
  {...sixKey, nodeId: targetNode},
  'the managed context decodes with its committed node');
  t.equal(decodeCommittedLearnerAdmission(JSON.stringify({groupId: 'g',
    index: '1', term: '1', context: sixKey})),
  INVALID_COMMITTED_LEARNER_ADMISSION,
  'a retained learner origin without nodeId is INVALID (read as CORRUPT)');
});

test('(f) the forwarding leader is the live raft leader; a stale ' +
  'message_groups row does not change it', async (t) => {
  const liveLeader = 'mgf-r1';
  const liveNode = 'node-live-leader';
  const service = new MessageGroupService(withTestDbPath({
    groupId: 'mg-forwarding-leader', replicaId: 'mgf-r3', nodeId: 'node-self',
    replicaIds: ['mgf-r1', 'mgf-r2', 'mgf-r3'],
    transport: {async deliver() {}, async initialize() {},
      async shutdown() {}, getConnectionState: () => null,
      setServiceNodeResolver() {}},
  }));
  t.teardown(() => service.shutdown());
  service.initialized = true;
  service.raft = reportingConsensusPort({role: RaftRole.FOLLOWER,
    groupId: 'mg-forwarding-leader', replicaIdentity: 'mgf-r3',
    leaderId: liveLeader, leaderAddress: mgAddress(liveNode, liveLeader),
    peers: [{replicaIdentity: liveLeader,
      address: mgAddress(liveNode, liveLeader)}]});
  service.systemTableCache.applySystemTableChange(TABLES.MESSAGE_GROUPS,
    CDC_OPERATION.UPSERT, {[COLUMN.GROUP_ID]: 'mg-forwarding-leader',
      [COLUMN.LEADER_NODE_ID]: STALE_NODE});
  const decision = service.resolveCdcIngressDecision({
    tableName: TABLES.NODES, operation: CDC_OPERATION.UPSERT});
  t.equal(decision.canonicalLeaderNodeId, liveNode,
    'the canonical leader is the live raft leader\'s committed node');
  t.equal(decision.canonicalLeaderIdentityState,
    MESSAGE_GROUP_LEADER_IDENTITY_STATE.LIVE_LEADER,
    'its state names the live leader, not a cache confirmation');
  t.same(service.resolveJoinConvergenceBootstrapForwardTarget(),
    {serviceId: liveLeader, address: mgAddress(liveNode, liveLeader)},
    'the join-convergence target is the live leader, with no hint list');

  service.raft = reportingConsensusPort({role: RaftRole.FOLLOWER,
    groupId: 'mg-forwarding-leader', replicaIdentity: 'mgf-r3', peers: []});
  const leaderless = service.resolveCdcIngressDecision({
    tableName: TABLES.NODES, operation: CDC_OPERATION.UPSERT});
  t.equal(leaderless.canonicalLeaderNodeId, null,
    'no live leader: no canonical leader, whatever the row says');
  t.equal(leaderless.canonicalLeaderIdentityState,
    MESSAGE_GROUP_LEADER_IDENTITY_STATE.NO_LEADER,
    'the absence is a named state');
});

test('(h) CDC forward targets selected from cache rows are delivered to their ' +
  'committed peer address, never the row\'s address', async (t) => {
  const liveLeader = 'mgf-r1';
  const liveNode = 'node-committed';
  const poisonNode = 'node-poisoned';
  const delivered = [];
  const sentMessages = [];
  const service = new MessageGroupService(withTestDbPath({
    groupId: 'mg-forwarding-delivery', replicaId: 'mgf-r2', nodeId: 'node-self',
    replicaIds: [liveLeader, 'mgf-r2'],
    transport: {
      deliver: async (address) => {
        delivered.push(address);
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      },
      initialize: async () => {},
      shutdown: async () => {},
      getConnectionState: () => 'connected',
      setServiceNodeResolver() {},
    },
  }));
  t.teardown(() => service.shutdown());
  service.initialized = true;
  service.sendMessage = async (address) => {
    sentMessages.push(address);
  };
  service.raft = reportingConsensusPort({
    role: RaftRole.FOLLOWER,
    groupId: 'mg-forwarding-delivery',
    replicaIdentity: 'mgf-r2',
    leaderId: null,
    peers: [{
      replicaIdentity: liveLeader,
      address: mgAddress(liveNode, liveLeader),
      addressStatus: PEER_ADDRESS_STATUS.RESOLVED,
    }],
  });
  service.systemTableCache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.INSERT,
    {
      [COLUMN.SERVICE_ID]: liveLeader,
      replica_id: liveLeader,
      [COLUMN.GROUP_ID]: 'mg-forwarding-delivery',
      [COLUMN.NODE_ID]: poisonNode,
      [COLUMN.ADDRESS]: mgAddress(poisonNode, liveLeader),
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    },
  );

  await service.forwardingOwner.forwardCDCPayloadToLeader(
    {type: 'CDC_TEST', correlationId: 'c1'},
    {tableName: TABLES.NODES, operation: CDC_OPERATION.UPSERT},
  );
  t.equal(delivered.length, 1, 'CDC event forward delivery was made');
  t.equal(delivered[0], mgAddress(liveNode, liveLeader),
    'CDC forward delivery reached the committed peer address, not the cache row');

  await service.forwardingOwner.forwardMetadataIngressPayloadToLeader(
    {type: 'META_TEST', correlationId: 'm1'},
    {requiredTables: [TABLES.SERVICES]},
  );
  t.equal(sentMessages.length, 1, 'metadata forward delivery was made');
  t.equal(sentMessages[0], mgAddress(liveNode, liveLeader),
    'metadata forward reached the committed peer address, not the cache row');

  t.equal(service.forwardingOwner.resolveForwardTargetNodeId({
    serviceId: liveLeader,
    address: mgAddress(poisonNode, liveLeader),
  }), liveNode, 'target node ID resolved from committed configuration, not the row address');
});

// The body of a named method or function in a source text: from its
// declaration to the matching closing brace.
function bodyOf(source, name) {
  const declaration = new RegExp(
    `(?:^|\\n)\\s*(?:async\\s+)?(?:function\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = declaration.exec(source);
  if (!match) return null;
  let depth = 0;
  for (let index = match.index + match[0].length - 1; index < source.length;
    index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return null;
}

const MESSAGE_GROUP_ROOT = path.join(ROOT, 'src', 'message-group');
const DELETED_RESOLUTION = /\bbuildPeerAddress\b|\bresolvePeerAddressFromCache\b|\bresolvePeerAddressFromHints\b|\blogBootstrapHintFallback\b|\bbootstrapHintFallbackLogged\b|\ballowBootstrapHints\b|\bconsensusResolution\b|\bpeerAddresses\b|\bresolveCanonicalLeaderIdentityFromCache\b|\bresolveCanonicalLeaderNodeIdFromCache\b|USING_BOOTSTRAP_PEER_HINT|\bBOOTSTRAP_HINT\b|\bresolveLivePeerAddressFromConsensus\b/;
const ADDRESS_DECISIONS = Object.freeze({
  'message-group-consensus-port.js': [
    'messageGroupConsensusRequest', 'resolveConsensusPeerAddress'],
  'message-group-service-peer-resolution.js': ['resolveCommittedPeerAddress'],
  'message-group-forwarding-owner-target-methods.js': [
    'resolveCanonicalLeaderIdentity', 'resolveForwardTargetNodeId'],
  'message-group-forwarding-owner.js': [
    'resolveJoinConvergenceBootstrapForwardTarget'],
});

test('(g) static: no message-group address decision reads the cache, a ' +
  'hint list or a deleted resolver', async (t) => {
  const offenders = fs.readdirSync(MESSAGE_GROUP_ROOT)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => DELETED_RESOLUTION.test(
      fs.readFileSync(path.join(MESSAGE_GROUP_ROOT, name), 'utf8')));
  t.same(offenders, [],
    'no src/message-group file names a deleted resolver, option or hint list');
  for (const [file, names] of Object.entries(ADDRESS_DECISIONS)) {
    const source = fs.readFileSync(path.join(MESSAGE_GROUP_ROOT, file), 'utf8');
    for (const name of names) {
      const body = bodyOf(source, name);
      t.ok(body !== null, `${file} declares ${name}`);
      t.notOk(/systemTableCache/.test(body || ''),
        `${file} ${name} reads no system-table cache`);
    }
  }
  const committedAddress = fs.readFileSync(path.join(ROOT, 'src', 'raft',
    'raft-rs-committed-peer-address.js'), 'utf8');
  for (const name of ['committedPeerAddress', 'founderNodeIdsOfPlacement']) {
    const body = bodyOf(committedAddress, name);
    t.ok(body !== null, `raft-rs-committed-peer-address.js declares ${name}`);
    t.notOk(/systemTableCache|peerAddresses|readStatus/.test(body || ''),
      `${name} reads no cache, hint list or status`);
  }
  t.notOk(/systemTableCache/.test(committedAddress),
    'the committed peer address module never names the cache');
  const replicaDispatch = fs.readFileSync(path.join(ROOT, 'src',
    'control-plane', 'replica-dispatch-readiness-capture.js'), 'utf8');
  t.notOk(/buildPeerAddress/.test(replicaDispatch),
    'the control-plane forward to the group leader uses the committed resolver');
});
