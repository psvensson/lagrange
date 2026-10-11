/** The learner-join world of FreshMG 6.B slice B2, on the B1 create fixture.
 * The founders are the fixture's three real raft-rs ports (PartitionNodeCluster)
 * holding the operation-authorized, recorded ADD_LEARNER; the target is the
 * real MessageGroupService that the real learner-join capability constructs,
 * installs and opens. Supplied test physics, all explicit (none of it is
 * MessageRouter, distributed SQL or a physical network):
 *  - an in-process transport between the learner and the founders' inboxes
 *    (MessageRouter-shaped: the learner's port sends through it, its real
 *    registered transport handler receives through it);
 *  - the descriptor route: it asks the founder the test names (the current
 *    leader by default), runs the real leader-side producer on that founder's
 *    own port and database, and moves the sealed image with the real snapshot
 *    transfer owner over an in-process socket pair;
 *  - the leader route: the current leader port's own BOOTSTRAP-purpose
 *    committed-membership answer and its own readStatus();
 *  - a pump that ticks the founders the cluster ticks and delivers messages.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {GROUP, NODE, SUCCESSOR, TARGET, FOUNDERS} from './learner-operation-fixture.js';
import {createMessageGroupLearnerJoinCapability, produceMessageGroupLearnerJoinDescriptor} from
  '../../src/message-group/message-group-learner-join.js';
import {readMessageGroupCommittedMembership} from
  '../../src/message-group/message-group-consensus-port.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {receiveSnapshotTransfer, serveSnapshotTransfer} from
  '../../src/raft/snapshot-transfer.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';

const CLUSTER_ID = 'b2-learner-cluster';
const CHUNK_BYTES = 4096;
const PUMP_MS = 3;
const VOTE_REQUEST_TYPES = new Set([RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
  RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE]);
const unifiedAddressOf = (nodeId, replicaId) => `${nodeId}/message-group/${replicaId}`;
const LEARNER_ADDRESS = unifiedAddressOf(SUCCESSOR, TARGET);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The founders' services rows a node's cache holds: route hints only. */
function founderCache() {
  const cache = new SystemTableCache();
  for (const replicaId of FOUNDERS) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {service_id: replicaId,
      replica_id: replicaId, group_id: GROUP, service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: NODE, status: SERVICE_STATUS.ACTIVE});
  }
  return cache;
}

/** The in-process transport between the learner and the founders. */
function learnerBridge(f) {
  const handlers = new Map();
  const sentByLearner = [];
  const toLearner = [];
  const hold = {inbound: false};
  const router = {
    initialize: async () => undefined,
    setServiceNodeResolver: () => undefined,
    register: (address, handler) => handlers.set(address, handler),
    unregister: (address) => handlers.delete(address),
    getRegisteredHandler: (address) => handlers.get(address) ?? null,
    unregisterExact: (address, handler) =>
      handlers.get(address) === handler && handlers.delete(address),
    deliver: (address, envelope) => {
      sentByLearner.push(envelope);
      const founderId = address.split('/').pop();
      const founder = f.cluster.replica(founderId);
      if (founder && !f.cluster.isolated.has(founderId)) founder.inbox.push(envelope);
      return undefined;
    },
  };
  f.cluster.sendFor = (fromReplicaId, address, packet) => {
    if (address !== f.cluster.addressOf(TARGET)) return undefined;
    if (!hold.inbound && !f.cluster.isolated.has(fromReplicaId)) toLearner.push(packet);
    return true;
  };
  async function deliverToLearner() {
    const pending = toLearner.splice(0);
    const handler = handlers.get(LEARNER_ADDRESS);
    for (const packet of handler ? pending : []) {
      try {
        await handler(packet);
      } catch {
        // A delivery to a learner still opening is a lost message (raft resends).
        continue;
      }
    }
  }
  return {router, hold, sentByLearner, deliverToLearner,
    voteRequestsFromLearner: () => sentByLearner.filter((envelope) =>
      VOTE_REQUEST_TYPES.has(envelope.message?.msgType)).length};
}

/** Move a sealed image with the real transfer owner (in-process sockets). */
async function transferImage(senderRoot, descriptor, receiverRoot) {
  const {a, b} = createInProcWebSocketPair();
  const [served, received] = await Promise.all([
    serveSnapshotTransfer({socket: a, checkpointsRoot: senderRoot,
      generationIndex: descriptor.generationIndex,
      transferId: `b2-${descriptor.generationIndex}`, chunkSizeBytes: CHUNK_BYTES}),
    receiveSnapshotTransfer({socket: b, checkpointsRoot: receiverRoot,
      expectedIdentity: descriptor.checkpointIdentity, chunkSizeBytes: CHUNK_BYTES}),
  ]);
  assert.equal(served.outcome, 'completed', JSON.stringify(served));
  assert.equal(received.outcome, 'completed', JSON.stringify(received));
}

/** The leader-side producer on one founder's own port (or a test's wrapper
 * of that port) and database. */
function produceOn(f, replicaId, request, raft = f.cluster.node(replicaId)) {
  return produceMessageGroupLearnerJoinDescriptor(
    {groupId: GROUP, raft, db: f.cluster.replica(replicaId).db},
    {checkpointsRoot: path.join(f.cluster.directory, 'leader-checkpoints', replicaId),
      clusterId: CLUSTER_ID},
    request);
}

/**
 * The target node's learner-join world.
 * @param {Object} t - The test context.
 * @param {Object} f - The B1 create fixture.
 * @param {Object} [hooks] - {descriptorFrom() -> founder id, beforeDescriptor(request),
 *   answer(request, world) -> answer (replaces the default route), catchUpTimeoutMs,
 *   serviceOptions, pump (false: no pump)}.
 * @return {Object} The world.
 */
function learnerJoinWorld(t, f, hooks = {}) {
  const directory = fs.mkdtempSync(path.join(f.cluster.directory, 'b2-target-'));
  const bridge = learnerBridge(f);
  const cache = founderCache();
  const world = {bridge, cache, learners: [], answers: [], descriptorRequests: [],
    dbPath: path.join(directory, 'message-groups', GROUP, `${TARGET}.db`)};
  const host = {
    nodeId: SUCCESSOR, clusterId: CLUSTER_ID, messageRouter: bridge.router,
    dbPathOf: (groupId, replicaId) =>
      path.join(directory, 'message-groups', groupId, `${replicaId}.db`),
    serviceOptions: hooks.serviceOptions ?? {nodeService: {getSystemTableCache: () => cache,
      getReadOnlySystemTableCache: () => cache}},
    catchUp: {timeoutMs: hooks.catchUpTimeoutMs ?? 15000, pollIntervalMs: 10},
    async requestJoinDescriptor(request) {
      world.descriptorRequests.push(request);
      await hooks.beforeDescriptor?.(request);
      return hooks.answer ? hooks.answer(request, world) : world.produceAndTransfer(request,
        hooks.descriptorFrom?.() ?? f.cluster.leaderReplicaId());
    },
    async observeLeader() {
      const leaderId = f.cluster.leaderReplicaId();
      if (leaderId === null) return null;
      const node = f.cluster.node(leaderId);
      return {membership: readMessageGroupCommittedMembership({raft: node},
        COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP), status: node.readStatus()};
    },
    adoptLearner(service) {
      world.learners.push(service);
    },
  };
  const capability = createMessageGroupLearnerJoinCapability(host);
  world.host = host;
  // The default route: the named founder's real producer, then its sealed
  // image moved into the target's checkpoints root by the transfer owner.
  world.produceAndTransfer = async (request, founderId) => {
    const produced = await produceOn(f, founderId, request);
    if (produced.descriptor) {
      await transferImage(path.join(f.cluster.directory, 'leader-checkpoints', founderId),
        produced.descriptor, request.checkpointsRoot);
    }
    return produced;
  };
  world.join = async (options) => {
    try {
      const answer = await capability(options);
      world.answers.push({answer});
      return answer;
    } catch (error) {
      world.answers.push({error});
      throw error;
    }
  };
  let pumping = hooks.pump !== false;
  const pump = (async () => {
    while (pumping) {
      for (const replicaId of f.cluster.tickers) f.cluster.node(replicaId).tick();
      f.cluster.deliverAll();
      await bridge.deliverToLearner();
      await sleep(PUMP_MS);
    }
  })();
  t.after(async () => {
    pumping = false;
    await pump;
    for (const service of world.learners) await service.shutdown();
  });
  world.until = async (predicate, boundMs = 15000) => {
    const deadline = Date.now() + boundMs;
    while (!predicate() && Date.now() < deadline) await sleep(PUMP_MS);
    return predicate();
  };
  world.answered = () => world.until(() => world.answers.length > 0);
  return world;
}

export {LEARNER_ADDRESS, learnerJoinWorld, produceOn, transferImage};
