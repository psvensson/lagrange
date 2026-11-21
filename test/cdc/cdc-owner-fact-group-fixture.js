// A three-replica ledger group read through the production strict-read path
// of each hosting node (S0 of the fallback-read closure).
//
// Real: three PartitionService replicas of `replica_operations-p1` on real
// raft-rs (formAdmittedGroup), so every read-authority witness comes from
// PartitionService.handleRemoteQuery; per node a MessageRouter, QueryExecutor,
// CDCIntegrationService (its local services are that node's own replica) and
// ControlPlaneSystemTableGateway; a real leadership transfer.
// Substituted: query channel transit between routers (recorded, and able to
// make a node unreachable) and the routing projection, which the test writes
// as rows of a SystemTableCache (that projection is the subject: a published
// leader that is right, stale or absent).
// Ceiling: one process; rows are seeded straight into each replica's database
// (each replica's `workflow_step` names the replica, so an answer shows which
// replica's data it carries); no node, bootstrap or CDC propagation runs.
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
import {LoggingService} from '../../src/logging/logging-service.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
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

function hasAppliedItsCommit(service) {
  const status = service.raft.readStatus();
  return Number.isSafeInteger(status.commitIndex) &&
    status.commitIndex === status.appliedIndex;
}

/**
 * Open the three-node ledger surface; everything is torn down with `t`.
 * @param {Object} t - The tap test.
 * @param {string} testFileUrl - The test file (port allocation identity).
 * @return {Promise<Object>} {services, nodes, addressOf, surfaceOf,
 *   seedRow, transferLeadership, setReachable, transit}.
 */
async function openLedgerGroupSurface(t, testFileUrl) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODES[0]}, raft: RAFT_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const ports = createPortAllocator(testFileUrl);
  const routers = new Map();
  const unreachable = new Set();
  const transit = [];
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
    budgetMs: FORMATION_BUDGET_MS,
  });
  const {services} = group;
  const serviceOfNode = (nodeId) => services[NODES.indexOf(nodeId)];
  const nodeOfAddress = (address) =>
    services.find((service) => service.unifiedAddress === address)?.nodeId ?? null;
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

  // Only channel transit is substituted: the target node's router delivers to
  // the registered native handler, whose answer is recorded as it was sent.
  function installTransit(callerNodeId) {
    routers.get(callerNodeId).setQueryMessageGroupServiceResolver(() => ({
      async sendMessage(address, message, options) {
        const targetNodeId = nodeOfAddress(address);
        // As on the wire, only the remaining duration and the caller's abort
        // cross to the target router; that router's delivery lifetime is its own.
        const {deliveryLifetime, signal} = options.transportDeliveryOptions;
        const delivery = unreachable.has(targetNodeId) ?
          buildDeliveryEnvelope({acknowledged: false, noHandler: true}) :
          await routers.get(targetNodeId).deliverLocal(address, TRANSIT_MESSAGE_ID,
            message, null, {timeoutMs: deliveryLifetime.remainingMs(), signal})
            .then(({result, answer}) => buildDeliveryEnvelope(result, answer));
        transit.push({callerNodeId, targetNodeId, address, reached: !unreachable.has(targetNodeId),
          answer: deliveryAnswerOf(delivery) ?? null});
        return {delivery};
      },
    }));
  }

  /**
   * The strict-read surface of one hosting node over its own routing
   * projection.
   * @param {string} nodeId - The node issuing reads.
   * @param {Object} projection - {leaderNodeId}: the published canonical
   *   leader in this node's projection, or null for none.
   * @return {Promise<Object>} {gateway, publishLeader, readLeaderRequired}.
   */
  async function surfaceOf(nodeId, {leaderNodeId}) {
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
    const cdc = new CDCIntegrationService({
      nodeId,
      messageRouter: router,
      sqlQueryEngine,
      systemTableCache: cache,
      partitionServicesProvider: () => new Map([[local.replicaId, local]]),
    });
    cdc.initialize();
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId,
      cdcIntegrationService: cdc,
      systemTableCache: cache,
      sqlQueryEngine,
    });
    installTransit(nodeId);
    return {
      gateway,
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

  return {
    services,
    nodes: NODES,
    serviceOfNode,
    surfaceOf,
    transit,
    // The row as one replica holds it: `workflow_step` names that replica.
    seedRow(service, operationId) {
      service.db.prepare(INSERT_SQL).run(operationId, service.replicaId);
    },
    setReachable(nodeId, reachable) {
      if (reachable) unreachable.delete(nodeId);
      else unreachable.add(nodeId);
    },
    async transferLeadership(from, to) {
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
    },
    async settleLeader(service) {
      assert.equal(await group.waitFor(() =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER &&
        service.role === RAFT_ROLE.LEADER && hasAppliedItsCommit(service)), true,
      'setup: the leader has applied everything it committed');
    },
  };
}

export {PARTITION, READ_SQL, TABLE, openLedgerGroupSurface};
