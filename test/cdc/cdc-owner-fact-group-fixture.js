// A three-replica ledger group read through the production strict-read path
// of each hosting node (S0 of the fallback-read closure).
//
// Real: three PartitionService replicas of `replica_operations-p1` on real
// raft-rs (formAdmittedGroup), so every read-authority witness comes from
// PartitionService.handleRemoteQuery; per node a MessageRouter, QueryExecutor,
// CDCIntegrationService, ReplicaHandler (the owner of the replicas the node
// hosts, as bootstrap and join attach them) and ControlPlaneSystemTableGateway;
// a real leadership transfer; raft writes through the leader.
// Substituted: query channel transit between routers (recorded with each
// hop's remaining delivery lifetime, able to make a node unreachable and, for
// one named case, to replace two receivers' answers by redirects); the
// routing projection, which the test writes as rows of a SystemTableCache
// (that projection is the subject: a published leader that is right, stale
// or absent); and, where a case names it, raft traffic held back on the
// group's loopback transport.
// Ceiling: one process; rows are seeded straight into a replica's database
// (`workflow_step` names the replica, so an answer shows whose data it
// carries) unless a case writes through raft; no node, bootstrap or CDC
// propagation runs; the ReplicaHandler is constructed, never initialized.
import assert from 'node:assert/strict';

import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {OWNER_FACT_UNAVAILABLE_REASON} from
  '../../src/control-plane/control-plane-owner-fact-read-contract.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {QUERY_RESPONSE_TYPE} from '../../src/query/query-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {createDefaultPartitionRequestBuilder} from
  '../../src/query/query-executor-partition-request-builders.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const PARTITION = INITIAL_PARTITION_IDS[TABLE];
const NODES = Object.freeze(['owner-fact-node-a', 'owner-fact-node-b', 'owner-fact-node-c']);
const MEMBERS = Object.freeze(NODES.map((nodeId, index) =>
  Object.freeze([`${PARTITION}-r${index + 1}`, nodeId])));
const SCHEMA = Object.freeze({columns: [
  {name: 'operation_id', type: 'TEXT', primaryKey: true},
  {name: 'workflow_step', type: 'TEXT'},
]});
const INSERT_SQL = 'INSERT INTO replica_operations (operation_id, workflow_step) VALUES (?, ?)';
const READ_SQL = 'SELECT operation_id, workflow_step FROM replica_operations ' +
  'WHERE operation_id = ?';
const RAFT_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const FORMATION_BUDGET_MS = 10000;
const READ_TIMEOUT_MS = 2000;
const TRANSIT_MESSAGE_ID = 'owner-fact-group-transit';
// How the node's replicas reach its CDC service: bootstrap and join attach
// them to the CDC provider map and to the replica handler's registry; a
// replica the handler creates later is in the handler's registry only.
const HOSTED_BY = Object.freeze({
  BOOTSTRAP_AND_HANDLER: 'bootstrap-and-handler',
  HANDLER_ONLY: 'handler-only',
});
// The raft messages that tell a follower how far the leader committed.
const COMMIT_CARRYING = new Set([RAFT_RS_MESSAGE_TYPE.APPEND, RAFT_RS_MESSAGE_TYPE.HEARTBEAT]);
const REFUSES_CREATION = () => {
  throw new Error('the read fixture creates no replica');
};

function hasAppliedItsCommit(service) {
  const status = service.raft.readStatus();
  return Number.isSafeInteger(status.commitIndex) &&
    status.commitIndex === status.appliedIndex;
}

/**
 * The owner-fact request the read arms send a replica, built by the query
 * owner's request builder.
 * @param {Object} service - The receiving replica.
 * @param {Array} params - READ_SQL parameters.
 * @return {Object} The QUERY request.
 */
function ownerFactRequestTo(service, params) {
  return createDefaultPartitionRequestBuilder({
    executionOptions: {
      readAuthority: Object.freeze({leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED}),
      ownerFactFloor: Object.freeze({minimumIndex: 0, minimumTerm: 0}),
    },
    forRead: true, params, partitionId: service.partitionId, sql: READ_SQL,
  })();
}

function createHeldRaftNetwork() {
  const network = createLoopbackTransport();
  const deliver = network.deliver.bind(network);
  let holds = () => false;
  network.deliver = async (address, payload, options) => (holds(address, payload) ?
    buildDeliveryEnvelope({acknowledged: false, noHandler: true}) :
    deliver(address, payload, options));
  return {
    network,
    hold(predicate) {
      const previous = holds;
      holds = (address, payload) => previous(address, payload) || predicate(address, payload);
    },
  };
}

/**
 * Open the three-node ledger surface; everything is torn down with `t`.
 * @param {Object} t - The tap test.
 * @param {string} testFileUrl - The test file (port allocation identity).
 * @return {Promise<Object>} The group surface (see the returned members).
 */
async function openLedgerGroupSurface(t, testFileUrl) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODES[0]}, raft: RAFT_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const ports = createPortAllocator(testFileUrl);
  const routers = new Map();
  const unreachable = new Set();
  const redirects = new Map();
  const transit = [];
  const raft = createHeldRaftNetwork();
  let group = null;
  t.teardown(async () => {
    try {
      await Promise.all([...routers.values()].map((router) => router.shutdown()));
    } finally {
      try {
        await group?.dispose();
      } finally {
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    }
  });
  group = await formAdmittedGroup({
    partitionId: PARTITION, members: MEMBERS, tempPrefix: 'owner-fact-group-',
    serviceOptions: {tableId: TABLE, tableName: TABLE, schema: SCHEMA},
    budgetMs: FORMATION_BUDGET_MS, transport: raft.network,
  });
  const {services} = group;
  const serviceOfNode = (nodeId) => services[NODES.indexOf(nodeId)];
  const nodeOfAddress = (address) =>
    services.find((service) => service.unifiedAddress === address)?.nodeId ?? null;
  const peerOf = (service) => String(service.raft.readStatus().peerId);
  for (const service of services) {
    const router = new MessageRouter({
      nodeId: service.nodeId, wsPort: ports.getPort(), inProcess: true,
      bootIncarnation: TEST_BOOT_INCARNATION,
    });
    await router.initialize({startServer: true});
    // Query traffic reaches the actual partition handler through its node's
    // router; only the group's Raft and admission traffic uses the loopback.
    router.register(service.unifiedAddress, service.transportHandler);
    routers.set(service.nodeId, router);
  }
  const connected = new Set();
  // A reading node holds a live node connection to each peer, so a recovery
  // read treats every remote replica as a connected candidate.
  async function connectReader(nodeId) {
    if (connected.has(nodeId)) return;
    connected.add(nodeId);
    const router = routers.get(nodeId);
    for (const [peerId, peer] of routers) {
      if (peerId === nodeId) continue;
      await router.connectToNode(peerId, peer.advertisedAddress);
      assert.equal(router.getConnectionState(peerId), 'connected',
        `setup: ${nodeId} holds a live connection to ${peerId}`);
    }
  }

  // The answer a receiver's place in a redirect loop gives (named case only).
  function redirectAnswerOf(targetNodeId) {
    const next = redirects.get(targetNodeId);
    return {success: false, error: OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER,
      failureCode: OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER, partitionId: PARTITION,
      redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT, leaderAddress: next.unifiedAddress};
  }

  async function transitDelivery(targetNodeId, address, message, lifetime) {
    if (unreachable.has(targetNodeId)) {
      return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
    }
    if (redirects.has(targetNodeId)) {
      return buildDeliveryEnvelope({acknowledged: true}, redirectAnswerOf(targetNodeId));
    }
    const {deliveryLifetime, signal} = lifetime;
    const {result, answer} = await routers.get(targetNodeId).deliverLocal(address,
      TRANSIT_MESSAGE_ID, message, null, {timeoutMs: deliveryLifetime.remainingMs(), signal});
    return buildDeliveryEnvelope(result, answer);
  }

  // Only channel transit is substituted: the target node's router delivers to
  // the registered native handler, whose answer is recorded as it was sent.
  // As on the wire, only the remaining duration and the caller's abort cross
  // to the target router; that router's delivery lifetime is its own.
  function installTransit(callerNodeId) {
    routers.get(callerNodeId).setQueryMessageGroupServiceResolver(() => ({
      async sendMessage(address, message, options) {
        const targetNodeId = nodeOfAddress(address);
        const lifetime = options.transportDeliveryOptions;
        const sentAtMs = Date.now();
        const remainingMs = lifetime.deliveryLifetime.remainingMs();
        const delivery = await transitDelivery(targetNodeId, address, message, lifetime);
        transit.push({callerNodeId, targetNodeId, address, sentAtMs, remainingMs,
          reached: !unreachable.has(targetNodeId), answer: deliveryAnswerOf(delivery) ?? null});
        return {delivery};
      },
    }));
  }

  /**
   * The strict-read surface of one hosting node over its own routing
   * projection.
   * @param {string} nodeId - The node issuing reads.
   * @param {Object} projection - {leaderNodeId, hostedBy}: the published
   *   canonical leader in this node's projection (null for none), and how
   *   the node's replica reaches its CDC service (HOSTED_BY).
   * @return {Promise<Object>} {gateway, handler, publishLeader, readLeaderRequired}.
   */
  async function surfaceOf(nodeId, {leaderNodeId, hostedBy = HOSTED_BY.BOOTSTRAP_AND_HANDLER}) {
    await connectReader(nodeId);
    const router = routers.get(nodeId);
    const local = serviceOfNode(nodeId);
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      partition_id: PARTITION, table_id: TABLE,
      ...(leaderNodeId === null ? {} : {leader_node_id: leaderNodeId}),
    });
    for (const service of services) {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: service.replicaId, replica_id: service.replicaId,
        service_type: SERVICE_TYPE.PARTITION, partition_id: PARTITION,
        node_id: service.nodeId, address: service.unifiedAddress,
        status: SERVICE_STATUS.ACTIVE,
      });
    }
    const sqlQueryEngine = {queryExecutor: new QueryExecutor({
      nodeId,
      messageRouter: router,
      systemCache: cache,
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    })};
    const attached = hostedBy === HOSTED_BY.BOOTSTRAP_AND_HANDLER;
    const cdc = new CDCIntegrationService({
      nodeId,
      messageRouter: router,
      sqlQueryEngine,
      systemTableCache: cache,
      partitionServicesProvider: () =>
        new Map(attached ? [[local.replicaId, local]] : []),
    });
    cdc.initialize();
    const handler = new ReplicaHandler({nodeId, systemTableCache: cache,
      cdcIntegrationService: cdc, createPartitionService: REFUSES_CREATION});
    if (attached) handler.localServices.set(local.replicaId, local);
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId,
      cdcIntegrationService: cdc,
      systemTableCache: cache,
      sqlQueryEngine,
    });
    installTransit(nodeId);
    return {
      gateway,
      handler,
      publishLeader(publishedNodeId) {
        cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPDATE, {
          partition_id: PARTITION, table_id: TABLE, leader_node_id: publishedNodeId,
        });
      },
      // The gateway's leader-qualified read, as every strict consumer asks it.
      readLeaderRequired(tableName, sql, params, readOptions) {
        return gateway.readAuthoritativeRows(tableName, sql, params, {
          timeoutMs: READ_TIMEOUT_MS,
          deliveryPriority: 'critical',
          workClass: 'critical',
          ...readOptions,
        });
      },
    };
  }

  async function transferLeadership(from, to) {
    const requested = await turnChainValue(from.requestLeadershipTransfer({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: to.replicaId,
    }));
    assert.equal(requested.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `setup: the transfer was accepted (${JSON.stringify(requested)})`);
    assert.equal(await group.waitFor(() =>
      from.raft.readStatus().role === RAFT_ROLE.FOLLOWER &&
      to.raft.readStatus().role === RAFT_ROLE.LEADER &&
      to.role === RAFT_ROLE.LEADER && hasAppliedItsCommit(to)), true,
    'setup: actual Raft leadership transferred and the new leader applied its commit');
  }

  // A raft write through the leader; answers the applied index it reached.
  async function writeRow(leader, operationId) {
    const written = await leader.executeQuery(INSERT_SQL, [operationId, leader.replicaId],
      {entryId: `owner-fact-write-${operationId}`});
    assert.equal(written?.success, true,
      `setup: the leader committed the row (${JSON.stringify(written)})`);
    return leader.raft.readStatus().appliedIndex;
  }

  return {
    services,
    nodes: NODES,
    serviceOfNode,
    surfaceOf,
    transit,
    transferLeadership,
    writeRow,
    // The row as one replica holds it: `workflow_step` names that replica.
    seedRow(service, operationId) {
      service.db.prepare(INSERT_SQL).run(operationId, service.replicaId);
    },
    setReachable(nodeId, reachable) {
      if (reachable) unreachable.delete(nodeId);
      else unreachable.add(nodeId);
    },
    // Named case only: each listed node's receiver answer becomes a redirect
    // to the replica it maps to.
    redirectInTransit(loop) {
      for (const [nodeId, next] of loop) redirects.set(nodeId, next);
    },
    // One request over the query transport from a node to a replica.
    async deliverOverTransport(viaNodeId, service, request) {
      await connectReader(viaNodeId);
      installTransit(viaNodeId);
      const delivery = await routers.get(viaNodeId).deliver(service.unifiedAddress, request,
        {timeoutMs: READ_TIMEOUT_MS, deliveryPriority: 'critical'});
      return deliveryAnswerOf(delivery);
    },
    async settleLeader(service) {
      assert.equal(await group.waitFor(() => {
        const status = service.raft.readStatus();
        return status.role === RAFT_ROLE.LEADER && service.role === RAFT_ROLE.LEADER &&
          status.confChangePending === false && hasAppliedItsCommit(service);
      }), true, 'setup: the leader has applied its election log and everything it committed');
    },
    /**
     * Make `to` a leader that holds, unapplied, a row `from` committed, and
     * that cannot commit an entry of its own term: `to` receives the row's
     * entry but no message telling it the entry committed, and, once it
     * leads, none of its appends leave it. Heartbeats still flow, so it keeps
     * its quorum contact and stays leader.
     * @param {Object} from - The current leader.
     * @param {Object} to - A follower.
     * @param {string} operationId - The row's key.
     * @return {Promise<Object>} {committedIndex}: the row's log index.
     */
    async freshLeaderBehindCommit(from, to, operationId) {
      const fromPeer = peerOf(from);
      const toPeer = peerOf(to);
      const committedIndex = from.raft.readStatus().lastIndex + 1;
      raft.hold((_address, packet) => String(packet?.from) === fromPeer &&
        String(packet?.to) === toPeer && COMMIT_CARRYING.has(packet?.message?.msgType) &&
        Number(packet.message.commit) >= committedIndex);
      assert.equal(await writeRow(from, operationId) >= committedIndex, true,
        'setup: the row committed at the expected index');
      assert.equal(await group.waitFor(() => {
        const status = to.raft.readStatus();
        return status.lastIndex >= committedIndex && status.commitIndex < committedIndex;
      }), true, 'setup: the follower holds the entry and does not know it committed');
      raft.hold((_address, packet) => String(packet?.from) === toPeer &&
        packet?.message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND);
      await transferLeadership(from, to);
      const status = to.raft.readStatus();
      assert.equal(status.confChangePending, true,
        'setup: the new leader has not applied the log it held when elected');
      assert.equal(status.commitIndex < committedIndex, true,
        'setup: the new leader has not applied the row its predecessor committed');
      return {committedIndex};
    },
    // Cut a replica off from all consensus traffic until it names no leader.
    async isolateFromConsensus(service) {
      const peer = peerOf(service);
      raft.hold((_address, packet) =>
        String(packet?.from) === peer || String(packet?.to) === peer);
      assert.equal(await group.waitFor(() =>
        service.raft.readStatus().leaderId === null), true,
      'setup: the isolated replica knows no leader');
    },
  };
}

export {PARTITION, READ_SQL, READ_TIMEOUT_MS, TABLE, openLedgerGroupSurface,
  ownerFactRequestTo};
