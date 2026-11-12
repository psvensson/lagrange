// In-process stand-ins for the two things the production snapshot catch-up
// wiring (bootstrap/shared/snapshot-catchup-wiring.js) takes from a node and
// that a single test process has no network for:
//  - the bulk DIAL: each node's real createBulkTransferChannelRegistry is
//    built with the registry's own dial-construction seam (createWebSocket),
//    which here returns one end of an in-process socket pair; the other end
//    is adopted by the listening node's registry after the dialler's
//    IDENTIFY frame, the way the router's bulk IDENTIFY fork adopts it
//    (transport/message-router-inbound-dispatch.js).
//  - the node directory: a system-table cache holding the NODES row and the
//    current websocket NODE_ENDPOINTS row the production dial resolves a
//    follower's address from, beside the publication rows the checkpoint
//    identity reads.
//  - the follower node's control plane: the SERVICES rows of the replicas a
//    node hosts live in the lifecycle state store, and the node's REAL
//    replica handler (ReplicaHandlerSetup.create, its real lifecycle state
//    machine and its snapshot install owner) reads them authoritatively.
// Everything else (registries, connections, the transfer socket adapter, the
// offer router, dispatch, transfer, install orchestration, the handler's
// admission and recreation of a replica) is production.
import {ReplicaHandlerSetup} from
  '../../src/bootstrap/shared/replica-handler-setup.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  createBulkTransferChannelRegistry,
} from '../../src/transport/bulk-transfer-channel.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {
  createLifecycleCdcService,
  createLifecycleServiceRow,
  createLifecycleStateStore,
} from '../test-helpers/lifecycle-state-store.js';

/**
 * @return {Object} {registryFor(nodeId, address), listen(address, registry),
 *   dials()}: one real bulk registry per node, listening at its address and
 *   dialling the others'.
 */
function createInProcBulkNetwork() {
  const listening = new Map();
  let dialCount = 0;
  const connect = (address) => {
    const pair = createInProcWebSocketPair();
    const target = listening.get(address);
    dialCount += 1;
    pair.b.once('message', (frame) => {
      target.adoptIncomingSocket({nodeId: JSON.parse(String(frame)).nodeId, ws: pair.b});
    });
    return pair.a;
  };
  return {
    registryFor(nodeId, address) {
      const registry = createBulkTransferChannelRegistry(
        {nodeId, createWebSocket: connect});
      listening.set(address, registry);
      return registry;
    },
    // Points an address at another node's registry (a listener replaced).
    listen(address, registry) {
      listening.set(address, registry);
    },
    dials: () => dialCount,
  };
}

/**
 * The message-router facts the production dial identifies itself with.
 * @param {string} nodeId
 * @param {string} address
 * @param {Object} bulkChannelRegistry
 * @return {Object}
 */
function routerFacts(nodeId, address, bulkChannelRegistry) {
  return {nodeId, nodeAddress: address, advertisedAddress: address,
    bootIncarnation: TEST_BOOT_INCARNATION, bulkChannelRegistry};
}

/**
 * A node's system-table cache: the node directory and its publication epoch.
 * @param {Object} options {nodes: {[nodeId]: wsAddress}, readEpoch: () =>
 *   number|null (null: no published membership row)}
 * @return {Object} {get, getAll}
 */
function nodeDirectoryCache(options) {
  const {nodes, readEpoch} = options;
  const rowsOf = (table) => {
    if (table === TABLES.NODE_ENDPOINTS) {
      return Object.entries(nodes).map(([nodeId, address]) => ({
        [COLUMN.NODE_ID]: nodeId, [COLUMN.ADDRESS]: address,
        [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET}));
    }
    if (table === TABLES.CONTROL_PLANE_PUBLICATIONS && readEpoch() !== null) {
      return [{publication_kind: 'membership', status: 'PUBLISHED',
        publication_epoch: readEpoch()}];
    }
    return [];
  };
  return Object.freeze({
    getAll: rowsOf,
    get: (table, key) => table === TABLES.NODES && Object.hasOwn(nodes, key) ?
      {[COLUMN.NODE_ID]: key, [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION} :
      null,
  });
}

/**
 * A node's real replica handler over a lifecycle state store. The setup is
 * given a router without a bulk registry, so the caller arms the node's
 * offer routing itself (armSnapshotOfferRouting, with its own observers)
 * over this handler.
 * @param {Object} options {nodeId, dataDir, createPartitionService}
 * @return {Object} {replicaHandler, replicaStateMachine, store,
 *   host(service)}: host registers a running local replica service with the
 *   handler as an established replica whose durable row is ACTIVE.
 */
function createNodeReplicaHandler(options) {
  const {nodeId} = options;
  const store = createLifecycleStateStore();
  const setup = ReplicaHandlerSetup.create({
    nodeId, dataDir: options.dataDir,
    messageRouter: {nodeId, register() {}},
    cdcIntegrationService: createLifecycleCdcService({store}),
    systemTableCache: store.cache,
    createPartitionService: options.createPartitionService,
  });
  return {...setup, store, async host(service) {
    await store.gateway.insertSystemTableRow(TABLES.SERVICES,
      createLifecycleServiceRow({serviceId: service.replicaId,
        replicaId: service.replicaId, partitionId: service.partitionId,
        nodeId, status: SERVICE_STATUS.ACTIVE}));
    setup.replicaHandler.registerExistingReplica({replicaId: service.replicaId,
      partitionId: service.partitionId, tableName: service.tableName,
      status: SERVICE_STATUS.ACTIVE, service});
  }};
}

export {
  createInProcBulkNetwork,
  createNodeReplicaHandler,
  nodeDirectoryCache,
  routerFacts,
};
