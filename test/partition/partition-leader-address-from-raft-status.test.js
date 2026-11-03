/**
 * The partition leader address for write forwarding, redirects, split/merge
 * forwarding, the learner promotion proof and the replica admission request
 * is answered from this replica's live raft status only (quest
 * peer-and-leader-address-from-committed-configuration, attempt 2, C4):
 *
 *   (h) a stale cache leader (this.leaderId and its services row on a stale
 *       node) never wins over the live raft leader at its committed address
 *   (i) no live leader: a typed NO_LEADER refusal, whatever the leader id,
 *       the row or a leader-address hint say; an unaddressed leader and an
 *       unusable status refuse typed too
 *   (k) the learner promotion gate takes the leader from the live status,
 *       never from a cached row or a hint
 *   (j) static: the cache helper, its log literal, the leader-id
 *       cross-check helper and the hint symbols no longer exist
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_LEADER_ADDRESS_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {PEER_ADDRESS_STATUS} from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  ADMISSION_LEADER_REFUSAL,
  admissionLeaderHint,
  admissionLeaderTarget,
} from '../../src/raft/raft-rs-committed-peer-address.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..');
const PARTITION_ID = 'orders-p1';
const SELF = 'orders-p1-r2';
const LIVE_LEADER = 'orders-p1-r1';
const STALE_LEADER = 'orders-p1-r3';
const LIVE_NODE = 'node-live';
const STALE_NODE = 'node-stale';

function partitionAddress(nodeId, replicaId) {
  return `${nodeId}/partition/${replicaId}`;
}

function servicesCache(rows) {
  const services = new Map(rows.map((row) => [row.service_id, row]));
  const tableOf = (table) => table === TABLES.SERVICES ? services : new Map();
  return {
    get: (table, key) => tableOf(table).get(key) || null,
    getAll: (table) => [...tableOf(table).values()],
    filter: (table, predicate) => [...tableOf(table).values()].filter(predicate),
    subscribe: () => () => {},
  };
}

function liveRow(replicaId, nodeId, extra = {}) {
  return {service_id: replicaId, service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID, node_id: nodeId, status: 'active', ...extra};
}

function statusPort(status) {
  return {readStatus: () => Object.freeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK, groupId: PARTITION_ID,
    replicaIdentity: SELF, role: RAFT_ROLE.FOLLOWER, peers: [], ...status})};
}

function follower({status, leaderId = null, rows = [], leaderAddressHint}) {
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID, tableId: 'orders', replicaId: SELF,
    replicaIds: [SELF], nodeId: 'node-self', dbPath: ':memory:',
    ...(leaderAddressHint ? {leaderAddress: leaderAddressHint} : {}),
  }));
  partition.raft = statusPort(status);
  partition.leaderId = leaderId;
  partition.systemTableCache = servicesCache(rows);
  return partition;
}

test('(h) a stale cache leader never wins over the live raft leader',
  async (t) => {
    const partition = follower({
      leaderId: STALE_LEADER,
      rows: [liveRow(STALE_LEADER, STALE_NODE)],
      status: {leaderId: LIVE_LEADER,
        leaderAddress: partitionAddress(LIVE_NODE, LIVE_LEADER),
        leaderAddressStatus: PEER_ADDRESS_STATUS.RESOLVED},
    });
    t.equal(partition.resolveLeaderAddress(),
      partitionAddress(LIVE_NODE, LIVE_LEADER),
      'the live raft leader at its committed address, not the cached row');
  });

test('(i) no live leader, an unaddressed leader and an unusable status ' +
  'refuse typed', async (t) => {
  const noLeader = follower({
    leaderId: STALE_LEADER,
    rows: [liveRow(STALE_LEADER, STALE_NODE)],
    leaderAddressHint: partitionAddress(STALE_NODE, STALE_LEADER),
    status: {leaderId: null, leaderAddress: null,
      leaderAddressStatus: PEER_ADDRESS_STATUS.NO_LEADER},
  });
  t.throws(() => noLeader.resolveLeaderAddress(),
    {message: PARTITION_LEADER_ADDRESS_REFUSAL.NO_LEADER},
    'no live leader refuses NO_LEADER whatever the id, row or hint say');
  const unaddressed = follower({
    status: {leaderId: LIVE_LEADER, leaderAddress: null,
      leaderAddressStatus: PEER_ADDRESS_STATUS.UNAVAILABLE},
    rows: [liveRow(LIVE_LEADER, LIVE_NODE)],
  });
  t.throws(() => unaddressed.resolveLeaderAddress(),
    {message: PARTITION_LEADER_ADDRESS_REFUSAL.LEADER_UNADDRESSED},
    'a leader without a committed address refuses typed, no row stands in');
  const unusable = follower({status: {}});
  unusable.raft = {readStatus: () => ({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE})};
  t.throws(() => unusable.resolveLeaderAddress(),
    {message: PARTITION_LEADER_ADDRESS_REFUSAL.STATUS_UNAVAILABLE},
    'an unusable status refuses typed');
});

test('(k) the learner promotion gate takes the leader from the live status',
  async (t) => {
    const partition = follower({
      rows: [liveRow(STALE_LEADER, STALE_NODE, {raft_role: 'leader'})],
      leaderAddressHint: partitionAddress(STALE_NODE, STALE_LEADER),
      status: {leaderId: null, leaderAddress: null,
        leaderAddressStatus: PEER_ADDRESS_STATUS.NO_LEADER},
    });
    t.equal(partition.readLiveRaftLeaderId(), null,
      'no live leader: none is discovered, whatever a row or hint say');
    partition.raft = statusPort({leaderId: LIVE_LEADER,
      leaderAddress: partitionAddress(LIVE_NODE, LIVE_LEADER),
      leaderAddressStatus: PEER_ADDRESS_STATUS.RESOLVED});
    t.equal(partition.readLiveRaftLeaderId(), LIVE_LEADER,
      'the live raft leader is discovered');
  });

// The committed-membership stamp a target was created from: the leader's
// committed read at creation (identities and committed nodes by peer id).
function committedStamp({leaderId = LIVE_LEADER, nodes = {[LIVE_LEADER]: LIVE_NODE,
  [STALE_LEADER]: 'node-3'}} = {}) {
  const members = Object.keys(nodes);
  return {kind: 'committed',
    voters: members.map(deriveRaftRsPeerId), learners: [],
    identities: Object.fromEntries(members.map((id) => [deriveRaftRsPeerId(id), id])),
    nodeIds: Object.fromEntries(Object.entries(nodes).map(([id, node]) =>
      [deriveRaftRsPeerId(id), node])),
    leaderId};
}

test('(l) a target not yet admitted asks the leader its stamp names, at ' +
  'the stamp\'s committed node; its own live leader wins once it hears one',
async (t) => {
  t.same({...admissionLeaderTarget(ENTITY_TYPE.PARTITION, committedStamp(), null)},
    {replicaIdentity: LIVE_LEADER, address: partitionAddress(LIVE_NODE, LIVE_LEADER)},
    'the stamp leader at its committed node');
  t.same({...admissionLeaderTarget(ENTITY_TYPE.PARTITION, committedStamp(), {
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK, leaderId: STALE_LEADER,
    leaderAddress: partitionAddress('node-3', STALE_LEADER),
    leaderAddressStatus: PEER_ADDRESS_STATUS.RESOLVED})},
  {replicaIdentity: STALE_LEADER, address: partitionAddress('node-3', STALE_LEADER)},
  'a live leader the target hears is asked');
  t.equal(admissionLeaderTarget(ENTITY_TYPE.PARTITION,
    committedStamp({leaderId: null}), null).refusal,
  ADMISSION_LEADER_REFUSAL.STAMP_NAMES_NO_LEADER, 'a stamp without a leader refuses typed');
  t.equal(admissionLeaderTarget(ENTITY_TYPE.PARTITION, null, null).refusal,
    ADMISSION_LEADER_REFUSAL.STAMP_NAMES_NO_LEADER, 'no stamp: refused typed');
  t.equal(admissionLeaderTarget(ENTITY_TYPE.PARTITION,
    committedStamp({nodes: {[LIVE_LEADER]: null}}), null).refusal,
  ADMISSION_LEADER_REFUSAL.LEADER_UNPLACED, 'an unplaced stamp leader refuses typed');
});

test('(m) a NOT_LEADER hint is followed only when it names a committed member',
  async (t) => {
    t.same({...admissionLeaderHint(ENTITY_TYPE.PARTITION, committedStamp(), STALE_LEADER)},
      {replicaIdentity: STALE_LEADER, address: partitionAddress('node-3', STALE_LEADER)},
      'a member of the held configuration, at its committed node');
    t.equal(admissionLeaderHint(ENTITY_TYPE.PARTITION, committedStamp(), 'orders-p1-r9'),
      null, 'a replica outside the held configuration is ignored');
    t.equal(admissionLeaderHint(ENTITY_TYPE.PARTITION, committedStamp(), null), null,
      'no hint');
  });

test('(n) a deferred answer keeps the accepted hint: the leader that deferred ' +
  'is asked again, no re-read', async (t) => {
  const hint = Object.freeze({replicaIdentity: STALE_LEADER,
    address: partitionAddress('node-3', STALE_LEADER)});
  const request = {operationId: 'op-1', state: 'pending', lastOutcome: null,
    stamp: committedStamp(), leaderHint: hint, rereadStamp: false};
  const delivered = [];
  const target = {
    partitionId: PARTITION_ID, replicaId: SELF, replicaAdmissionRequest: request,
    isShutdown: false, logger: {info() {}},
    readOwnRaftStatus: () => null,
    resolveLearnerPromotionProofDeliveryTimeoutMs: () => 1000,
    sendReplicaAdmissionRequest:
      PartitionService.prototype.sendReplicaAdmissionRequest,
    transport: {deliver: async (address) => {
      delivered.push(address);
      return buildDeliveryEnvelope({acknowledged: true}, {
        partitionId: PARTITION_ID, replicaIdentity: SELF, operationId: 'op-1',
        admission: {outcome: 'deferred', reason: 'quorum'}});
    }},
  };
  await PartitionService.prototype.driveReplicaAdmission.call(target);
  await PartitionService.prototype.driveReplicaAdmission.call(target);
  t.equal(request.lastOutcome, 'deferred');
  t.same(delivered, [hint.address, hint.address],
    'both deliveries ask the hinted leader');
  t.equal(request.leaderHint, hint, 'the hint is kept');
  t.equal(request.rereadStamp, false, 'no re-read');
});

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(file));
    else if (entry.name.endsWith('.js')) files.push(file);
  }
  return files;
}

test('(j) static: the cache helper and the hint symbols are gone', async (t) => {
  const removed = /\bresolvePeerAddressFromCache\b|\bPEER_ADDRESS_FROM_CACHE\b|\bresolveLiveRaftLeaderAddressForPeer\b|\bPEER_ADDRESS_FROM_LIVE_RAFT_LEADER\b|\bleaderAddressHint\b|\bresolveLeaderIdFromHint\b|\bresolveLeaderIdFromMetadata\b/;
  const offenders = sourceFiles(path.join(ROOT, 'src'))
    .filter((file) => removed.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  t.same(offenders, [], 'no src file names a deleted leader-address source');
  const coreBase = fs.readFileSync(path.join(ROOT, 'src', 'partition',
    'partition-service-core-base.js'), 'utf8');
  const body = coreBase.slice(coreBase.indexOf('  resolveLeaderAddress() {'));
  const end = body.indexOf('\n  }\n');
  t.notOk(/systemTableCache|this\.leaderId/.test(body.slice(0, end)),
    'resolveLeaderAddress reads neither the cache nor the cached leader id');
  const admission = fs.readFileSync(path.join(ROOT, 'src', 'partition',
    'partition-replica-admission.js'), 'utf8');
  t.notOk(/resolveLeaderAddress|service\.leaderId|this\.leaderId\s*=/.test(admission),
    'the admission request neither resolves a cached leader nor seeds one from a hint');
  for (const file of ['replica-handler-runtime-metadata-methods.js',
    'replica-handler-create-methods.js']) {
    t.notOk(/\bleaderAddress\b/.test(fs.readFileSync(path.join(ROOT, 'src', 'node',
      file), 'utf8')), `${file} computes and passes no cached leader address`);
  }
});
