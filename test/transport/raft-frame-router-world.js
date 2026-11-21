// Real MessageRouters on one VirtualNetwork carrying the envelopes of real
// raft-rs partition operation ports: the measuring substrate of the raft
// frame delivery witnesses (raft-frame-delivery record, stage 1).
//
// Production code exercised: MessageRouter (construction, IDENTIFY and
// connection adoption, deliver and the consensus delivery class, inbound
// dispatch, ACK and SERVICE_RESPONSE for everything else, the delivery
// lifetime and the pending-response ledger); the raft-rs operation port as
// PartitionNodeCluster builds it (createRaftRsOperationPort, its runtime
// owner, raft-rs-peer-delivery's sendMessages and its durable store over
// SQLite); and the one SEND_TO_PEER closure of every consensus group
// (raft-packet-utils.js sendRaftEnvelope).
//
// Substituted: the physical link (VirtualNetwork and the virtual connection
// environment, LINK_DELAY_MS per frame); the raft ports' clock (their node's
// network clock); the routers' clock (the host clock behind a counting
// wrapper); the receiving partition handler (only its raft branch: step the
// envelope, answer null - no PartitionService, no serving assertion); and,
// where a world names nodes in `inProcessFrom`, the raft return leg from
// those nodes (an in-process hand-off on the network clock, so the router
// link carries one direction only). A world may also put the routers on
// their node's network clock, slow a link, refuse dials to a node for a
// while (a dial blackout) and sever a link's sockets: physics, never a
// router decision.
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {RealTimeSource} from '../../src/time/time-source.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  isRaftRsTransportEnvelope, sendRaftEnvelope,
} from '../../src/raft/raft-packet-utils.js';
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
const ROUTER_CLOCK = Object.freeze({HOST: 'host', NETWORK: 'network'});
const CONNECTED_STATE = 'connected';
const CONNECT_BOUND_MS = 60000;
const END_DRAIN_MS = 20;

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

// A router's clock (the host's or its node's network clock), with every
// one-shot timer the router arms counted: a delivery lifetime's deadline, an
// ACK wait, a response grant, a ping pong, a reconnect.
function countingClock(base) {
  const tally = {setTimeoutCalls: 0};
  const clock = Object.freeze({
    now: () => base.now(),
    setTimeout: (fn, ms, ...args) => {
      tally.setTimeoutCalls += 1;
      return base.setTimeout(fn, ms, ...args);
    },
    clearTimeout: (handle) => base.clearTimeout(handle),
    setInterval: (fn, ms, ...args) => base.setInterval(fn, ms, ...args),
    clearInterval: (handle) => base.clearInterval(handle),
    charge: () => undefined,
  });
  return {clock, tally};
}

function pairKey(left, right) {
  return [left, right].sort().join('|');
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
   * @param {Object} options - {nodeIds, groups, inProcessFrom, linkDelayMs,
   *   routerClock, dialPairs, slowLinks}: groups are [{partitionId,
   *   replicas: [[replicaId, nodeId], ...]}]; dialPairs [[dialer, target]]
   *   (every pair when absent); slowLinks [[nodeA, nodeB, extraMs]].
   */
  constructor({nodeIds, groups = [], inProcessFrom = [],
    linkDelayMs = LINK_DELAY_MS, routerClock = ROUTER_CLOCK.HOST,
    dialPairs = null, slowLinks = []}) {
    this.nodeIds = [...nodeIds];
    this.inProcessFrom = new Set(inProcessFrom);
    this.linkDelayMs = linkDelayMs;
    this.routerClock = routerClock;
    this.dialPairs = dialPairs ?? this.nodeIds.flatMap((left, index) =>
      this.nodeIds.slice(index + 1).map((right) => [left, right]));
    this.slowLinks = new Map(slowLinks.map(([left, right, extraMs]) =>
      [pairKey(left, right), extraMs]));
    this.blackedOut = new Set();
    this.dials = [];
    this.refusedDials = [];
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
  // with its direction and its virtual send instant; a slow link holds the
  // frame for its extra delay before it enters the link.
  tapSocket(socket, from, to) {
    const send = socket.send.bind(socket);
    const extraMs = this.slowLinks.get(pairKey(from, to)) ?? 0;
    socket.send = (data, options, callback) => {
      if (socket.readyState === SOCKET_OPEN) {
        this.frames.push({atMs: this.network.now(), from, to,
          ...describeFrame(data)});
      }
      if (extraMs > 0) {
        this.network.setTimer(from, () => send(data, options, callback), extraMs);
        return undefined;
      }
      return send(data, options, callback);
    };
  }

  portNode(portKey) {
    return this.nodeIds.find((nodeId) => this.portOf(nodeId) === portKey);
  }

  // The physical environment: the harness's link, with frames tapped, slow
  // links held, dials recorded and a blacked-out node's endpoint not found.
  environmentOf(harness) {
    const base = harness.environment;
    return {
      ...base,
      hasEndpoint: (portKey) => !this.blackedOut.has(this.portNode(portKey)) &&
        base.hasEndpoint(portKey),
      lookupEndpoint: (portKey) => {
        if (!this.blackedOut.has(this.portNode(portKey))) {
          return base.lookupEndpoint(portKey);
        }
        this.refusedDials.push({atMs: this.network.now(),
          to: this.portNode(portKey)});
        return undefined;
      },
      createConnectionPair: (context) => {
        const pair = base.createConnectionPair(context);
        if (context.localNodeId !== context.remoteNodeId) {
          this.dials.push({atMs: this.network.now(),
            from: context.localNodeId, to: context.remoteNodeId});
          this.tapSocket(pair.clientSocket, context.localNodeId,
            context.remoteNodeId);
          this.tapSocket(pair.serverSocket, context.remoteNodeId,
            context.localNodeId);
        }
        return pair;
      },
    };
  }

  routerClockOf(nodeId) {
    return this.routerClock === ROUTER_CLOCK.NETWORK ?
      this.network.networkTimeSource(nodeId) : new RealTimeSource();
  }

  async start() {
    initializeProcessOwners(this.nodeIds[0]);
    const harness = createVirtualConnectionEnvironment({
      network: this.network, linkDelayMs: this.linkDelayMs});
    const environment = this.environmentOf(harness);
    for (const nodeId of this.nodeIds) {
      this.network.registerNode(nodeId, (message) =>
        harness.handleMessage(nodeId, message));
    }
    for (const nodeId of this.nodeIds) {
      const {clock, tally} = countingClock(this.routerClockOf(nodeId));
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
    for (const [dialer, target] of this.dialPairs) {
      await this.routers.get(dialer).connectToNode(target,
        this.wsAddressOf(target));
    }
    await this.driveUntil(() => this.dialPairs.every(([dialer, target]) =>
      this.connected(dialer, target)), CONNECT_BOUND_MS);
    await this.settle();
    this.buildGroups();
  }

  // Both routers hold an open, identified connection to each other.
  connected(left, right) {
    return [[left, right], [right, left]].every(([from, to]) => {
      const connection = this.routers.get(from).nodeConnections.get(to);
      return connection?.state === CONNECTED_STATE &&
        connection.ws?.readyState === SOCKET_OPEN;
    });
  }

  // Dials to these nodes find no endpoint until heal().
  blackout(nodeIds) {
    for (const nodeId of nodeIds) this.blackedOut.add(nodeId);
  }

  heal() {
    this.blackedOut.clear();
  }

  // Close the sockets of the link between two nodes, as a dead TCP
  // connection closes: each end learns over the link.
  severLink(left, right) {
    for (const [from, to] of [[left, right], [right, left]]) {
      this.routers.get(from).nodeConnections.get(to)?.ws?.terminate();
    }
  }

  // A raft-rs envelope through the router's send entry, as the SEND_TO_PEER
  // closure sends one.
  sendRaftEnvelope(fromNode, targetAddress, envelope) {
    return this.routers.get(fromNode).deliver(targetAddress, envelope);
  }

  // A scenario timer on a node's network clock, every `ms`, until stopped.
  every(nodeId, ms, action) {
    const timer = {stopped: false};
    const arm = () => this.network.setTimer(nodeId, () => {
      if (timer.stopped) return;
      action();
      arm();
    }, ms);
    arm();
    return () => {
      timer.stopped = true;
    };
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

  // SEND_TO_PEER: the production closure over the sender's router, or the
  // substituted in-process return leg for a node named inProcessFrom.
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
    return sendRaftEnvelope(this.routers.get(fromNode), address, envelope);
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

  // Advance the network `stepMs` virtual milliseconds at a time, letting the
  // host's continuations (router deliveries, awaited peer deliveries,
  // handlers) finish between steps.
  async driveFor(ms, stepMs = 1) {
    const end = this.network.now() + ms;
    while (this.network.now() < end) {
      this.network.run({untilMs: Math.min(end, this.network.now() + stepMs)});
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

  // Host-clocked routers arm nothing on the network, so it goes quiet;
  // network-clocked routers keep their keepalive, so they settle by time.
  async settle() {
    if (this.routerClock === ROUTER_CLOCK.NETWORK) {
      await this.driveFor(END_DRAIN_MS);
      return;
    }
    await this.driveUntilQuiet();
  }

  async end() {
    this.stopScheduling();
    // Let the envelopes and frames already in flight land before the ports
    // and their databases close.
    await this.settle();
    for (const cluster of this.clusters) {
      cluster.dispose();
    }
    for (const router of this.routers.values()) {
      await router.shutdown();
    }
    resetProcessOwners();
  }
}

export {LINK_DELAY_MS, ROUTER_CLOCK, RaftRouterWorld};
