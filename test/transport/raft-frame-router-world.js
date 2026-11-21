// Real MessageRouters on one VirtualNetwork carrying the envelopes of real
// raft-rs partition operation ports: the measuring substrate of the raft
// frame delivery witnesses (raft-frame-delivery record, stage 1).
//
// Production code exercised: MessageRouter (construction, IDENTIFY and
// connection adoption, deliver, tryDeliverRaftDirect, inbound dispatch, ACK
// and SERVICE_RESPONSE, the delivery lifetime and the pending-response
// ledger); the raft-rs operation port as PartitionNodeCluster builds it
// (createRaftRsOperationPort, its runtime owner, raft-rs-peer-delivery's
// sendMessages and its durable store over SQLite); and the SEND_TO_PEER
// closure body of partition-service-raft-init-base.js (transport.deliver
// with resolveRaftTransportDeliveryOptions).
//
// Substituted: the physical link (VirtualNetwork and the virtual connection
// environment, LINK_DELAY_MS per frame); the raft ports' clock (their node's
// network clock); the routers' clock (the host clock behind a counting
// wrapper); the receiving partition handler (only its raft branch: step the
// envelope, answer null - no PartitionService, no serving assertion); and,
// where a world names nodes in `inProcessFrom`, the raft return leg from
// those nodes (an in-process hand-off on the network clock, so the router
// link carries one direction only).
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {RealTimeSource} from '../../src/time/time-source.js';
import {RAFT_ROLE, resolveRaftTransportDeliveryOptions} from '../../src/raft/constants.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {createVirtualConnectionEnvironment} from
  '../distributed/harness/virtual-connection-environment.js';
import {DELIVERED_TO_PEER, PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const LINK_DELAY_MS = 1;
const FIRST_PORT = 19960;
const ADDRESS_SEPARATOR = '/';
const PARTITION_ENTITY = 'partition';
const ADDRESS_ENTITY_ID_INDEX = 2;
const SOCKET_OPEN = 1;
const QUIET_STEP_LIMIT = 20000;

function initializeProcessOwners(nodeId) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: nodeId}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetProcessOwners() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// The host clock, with every one-shot timer a router arms counted: a
// delivery lifetime's deadline, an ACK wait, a response grant, a ping pong.
function countingHostClock() {
  const host = new RealTimeSource();
  const tally = {setTimeoutCalls: 0};
  const clock = Object.freeze({
    now: () => host.now(),
    setTimeout: (fn, ms, ...args) => {
      tally.setTimeoutCalls += 1;
      return host.setTimeout(fn, ms, ...args);
    },
    clearTimeout: (handle) => host.clearTimeout(handle),
    setInterval: (fn, ms, ...args) => host.setInterval(fn, ms, ...args),
    clearInterval: (handle) => host.clearInterval(handle),
    charge: () => undefined,
  });
  return {clock, tally};
}

// What one wire frame is, read from its JSON text; an unreadable frame is
// recorded as such, never dropped from the count.
function describeFrame(data) {
  const text = typeof data === 'string' ? data : String(data);
  if (!text.startsWith('{')) {
    return {type: 'unreadable', messageId: null, raft: false};
  }
  const frame = JSON.parse(text);
  return {
    type: frame?.type ?? 'untyped',
    messageId: frame?.messageId ?? null,
    raft: isRaftRsTransportEnvelope(frame?.payload),
  };
}

function settleHost() {
  return new Promise((resolve) => setImmediate(resolve));
}

class RaftRouterWorld {
  /**
   * @param {Object} options - {nodeIds, groups, inProcessFrom}: groups are
   *   [{partitionId, replicas: [[replicaId, nodeId], ...]}].
   */
  constructor({nodeIds, groups, inProcessFrom = []}) {
    this.nodeIds = [...nodeIds];
    this.inProcessFrom = new Set(inProcessFrom);
    this.network = createVirtualNetwork({startMs: 0});
    this.frames = [];
    this.raftSends = [];
    this.raftReceipts = [];
    this.nodeOfReplica = new Map();
    this.clusterOfReplica = new Map();
    this.clocks = new Map();
    this.routers = new Map();
    this.clusters = [];
    this.groups = groups.map((group) => ({
      partitionId: group.partitionId,
      replicaIds: group.replicas.map(([replicaId]) => replicaId),
    }));
    for (const group of groups) {
      for (const [replicaId, nodeId] of group.replicas) {
        this.nodeOfReplica.set(replicaId, nodeId);
      }
    }
  }

  portOf(nodeId) {
    return FIRST_PORT + this.nodeIds.indexOf(nodeId);
  }

  wsAddressOf(nodeId) {
    return `ws://127.0.0.1:${this.portOf(nodeId)}`;
  }

  routerAddressOf(replicaId) {
    return [this.nodeOfReplica.get(replicaId), PARTITION_ENTITY, replicaId]
      .join(ADDRESS_SEPARATOR);
  }

  replicaOfAddress(address) {
    return address.split(ADDRESS_SEPARATOR)[ADDRESS_ENTITY_ID_INDEX];
  }

  // Every data frame a socket of a link between two distinct nodes writes,
  // with its direction and its virtual send instant.
  tapSocket(socket, from, to) {
    const send = socket.send.bind(socket);
    socket.send = (data, options, callback) => {
      if (socket.readyState === SOCKET_OPEN) {
        this.frames.push({atMs: this.network.now(), from, to,
          ...describeFrame(data)});
      }
      return send(data, options, callback);
    };
  }

  async start() {
    initializeProcessOwners(this.nodeIds[0]);
    const harness = createVirtualConnectionEnvironment({
      network: this.network, linkDelayMs: LINK_DELAY_MS});
    const environment = {
      ...harness.environment,
      createConnectionPair: (context) => {
        const pair = harness.environment.createConnectionPair(context);
        if (context.localNodeId !== context.remoteNodeId) {
          this.tapSocket(pair.clientSocket, context.localNodeId,
            context.remoteNodeId);
          this.tapSocket(pair.serverSocket, context.remoteNodeId,
            context.localNodeId);
        }
        return pair;
      },
    };
    for (const nodeId of this.nodeIds) {
      this.network.registerNode(nodeId, (message) =>
        harness.handleMessage(nodeId, message));
    }
    for (const nodeId of this.nodeIds) {
      const {clock, tally} = countingHostClock();
      this.clocks.set(nodeId, tally);
      this.routers.set(nodeId, new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId, inProcess: true, wsPort: this.portOf(nodeId),
        inProcessConnectionEnvironment: environment,
        timeSource: clock,
        resolveNodeAddress: (peer) => this.nodeIds.includes(peer) ?
          this.wsAddressOf(peer) : null,
      }));
    }
    for (const router of this.routers.values()) {
      await router.initialize({startServer: true});
    }
    for (let left = 0; left < this.nodeIds.length; left += 1) {
      for (let right = left + 1; right < this.nodeIds.length; right += 1) {
        await this.routers.get(this.nodeIds[left]).connectToNode(
          this.nodeIds[right], this.wsAddressOf(this.nodeIds[right]));
      }
    }
    await this.driveUntilQuiet();
    this.buildGroups();
  }

  buildGroups() {
    for (const group of this.groups) {
      const cluster = new PartitionNodeCluster({
        partitionId: group.partitionId,
        replicaIds: group.replicaIds,
        substrateFor: (replicaId) => ({timeSource:
          this.network.networkTimeSource(this.nodeOfReplica.get(replicaId))}),
        sendFor: (from, address, envelope) => this.send(from, address, envelope),
        resolveFor: (_from, peer) => this.routerAddressOf(peer),
      });
      this.clusters.push(cluster);
      for (const replicaId of group.replicaIds) {
        this.clusterOfReplica.set(replicaId, cluster);
        this.registerReceiver(replicaId);
      }
    }
    // Nothing here reads core entries; the cluster's own observer would only
    // accumulate them for the life of the process.
    setActualCoreEntryObserver(null);
  }

  // The partition handler's raft branch (partition-service-entry-apply-base
  // handleTransportMessage): step the envelope into the port, answer null.
  registerReceiver(replicaId) {
    const nodeId = this.nodeOfReplica.get(replicaId);
    this.routers.get(nodeId).register(this.routerAddressOf(replicaId),
      async (envelope) => {
        if (!isRaftRsTransportEnvelope(envelope?.payload)) {
          return {success: false};
        }
        this.raftReceipts.push({atMs: this.network.now(), replicaId,
          nodeId, messageId: envelope.messageId ?? null});
        await turnChainValue(this.node(replicaId).step(envelope.payload));
        return null;
      });
  }

  // SEND_TO_PEER: the production closure body over the sender's router, or
  // the substituted in-process return leg for a node named inProcessFrom.
  send(from, address, envelope) {
    const fromNode = this.nodeOfReplica.get(from);
    const to = this.replicaOfAddress(address);
    if (this.inProcessFrom.has(fromNode)) {
      this.network.setTimer(this.nodeOfReplica.get(to), () => {
        this.node(to).step(envelope);
      }, LINK_DELAY_MS);
      return DELIVERED_TO_PEER;
    }
    this.raftSends.push({atMs: this.network.now(), from, to, fromNode,
      toNode: this.nodeOfReplica.get(to)});
    return this.routers.get(fromNode).deliver(address, envelope,
      resolveRaftTransportDeliveryOptions({...envelope, targetAddress: address}));
  }

  node(replicaId) {
    return this.clusterOfReplica.get(replicaId).node(replicaId);
  }

  router(nodeId) {
    return this.routers.get(nodeId);
  }

  routerTimeouts(nodeId) {
    return this.clocks.get(nodeId).setTimeoutCalls;
  }

  orphanedResponses(nodeId) {
    return this.router(nodeId).getServiceResponseDispositionCounts().orphaned ?? 0;
  }

  startScheduling() {
    for (const replicaId of this.nodeOfReplica.keys()) {
      this.node(replicaId).startScheduling();
    }
  }

  stopScheduling() {
    for (const replicaId of this.nodeOfReplica.keys()) {
      this.node(replicaId).stopScheduling();
    }
  }

  isLeader(replicaId) {
    return this.node(replicaId).readStatus().role === RAFT_ROLE.LEADER;
  }

  // Advance the network one virtual millisecond at a time, letting the
  // host's continuations (router deliveries, awaited peer deliveries,
  // handlers) finish between steps.
  async driveFor(ms) {
    const end = this.network.now() + ms;
    while (this.network.now() < end) {
      this.network.run({untilMs: this.network.now() + 1});
      await settleHost();
    }
  }

  async driveUntil(predicate, maxMs) {
    const end = this.network.now() + maxMs;
    while (!predicate()) {
      if (this.network.now() >= end) {
        throw new Error(`world did not reach its condition within ${maxMs} virtual ms`);
      }
      await this.driveFor(1);
    }
  }

  // Until nothing is queued on the network and the host queued nothing new.
  async driveUntilQuiet() {
    for (let step = 0; step < QUIET_STEP_LIMIT; step += 1) {
      await settleHost();
      const epoch = this.network.enqueueEpoch();
      if (this.network.peekNextEventInstant() === null) {
        await settleHost();
        if (this.network.peekNextEventInstant() === null &&
            this.network.enqueueEpoch() === epoch) {
          return;
        }
      }
      this.network.run({untilMs: this.network.now() + 1});
    }
    throw new Error('world did not become quiet');
  }

  dataFramesBetween(from, to, sinceIndex = 0) {
    return this.frames.slice(sinceIndex).filter((frame) =>
      frame.from === from && frame.to === to);
  }

  async end() {
    this.stopScheduling();
    // Let the envelopes and frames already in flight land before the ports
    // and their databases close.
    await this.driveUntilQuiet();
    for (const cluster of this.clusters) {
      cluster.dispose();
    }
    for (const router of this.routers.values()) {
      await router.shutdown();
    }
    resetProcessOwners();
  }
}

export {LINK_DELAY_MS, RaftRouterWorld};
