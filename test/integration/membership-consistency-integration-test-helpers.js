import {EventEmitter} from 'events';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneReadinessService} from '../../src/control-plane/control-plane-readiness-service.js';
import {ControlPlaneSystemTableGateway} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {StorageAdmissionService} from '../../src/rebalancer/storage-admission-service.js';
import {StorageCapacityAccountingService} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {createSqlEngineSeam} from '../distributed/harness/sql-engine-seam.js';
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {STATE, TABLES} from '../../src/constants/index.js';
import {resolvePublishedActiveNodeIds} from
  '../../src/control-plane/active-node-publication-snapshots.js';
import {getRegisteredControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-gateway-registry.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {MembershipPublicationRuntimeOwner} from
  '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {isControlPlanePublicationsWriteLeader} from
  '../../src/control-plane/control-plane-publications-leadership.js';
import {
  initializeTestEnvironment as initTestEnv,
} from './helpers/cluster-test-helpers.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

async function shutdownOrFail(t, promise, label) {
  try {
    await promise;
  } catch (error) {
    t.comment(`${label}: ${error.message}`);
    throw error;
  }
}

// Work-bound budgets, calibrated on the reference machine and scaled by the
// machine factor as ONE table so every ratio the subtests rely on (a lease
// against a heartbeat, a sweep against a lease) is preserved: on the 2.4x
// slower GCP proof host a 100 ms heartbeat missed a 200 ms ready lease and
// the seed dropped out of its own published set (2026-09-13).
const REFERENCE_TEST_TIMEOUTS = {
  CDC_FLUSH_INTERVAL: 50,
  CDC_PROPAGATION_DELAY: 25,
  HEARTBEAT_INTERVAL: 100,
  READY_LEASE_DURATION: 200,
  SUSPICION_THRESHOLD: 150,
  FAILURE_THRESHOLD: 300,
  STABILIZATION_PERIOD: 100,
  LEASE_SWEEP_INTERVAL: 50,
  TEST_TIMEOUT: 2000,
  CONFIG_STABILIZATION_PERIOD: 1000,
  CONFIG_PERIODIC_CHECK_INTERVAL: 1000,
  CONFIG_PERIODIC_CHECK_JITTER: 100,
};
const TEST_TIMEOUTS = Object.fromEntries(
  Object.entries(REFERENCE_TEST_TIMEOUTS).map(([name, referenceMs]) =>
    [name, scaleByMachineFactor(referenceMs)]));


function initializeTestEnvironment() {
  initTestEnv({nodeId: 'test-node'});
}

class _LatencySimulatingCDCHandler extends CDCHandler {
  constructor(cache, options = {}) {
    super(cache, {
      ...options,
      flushIntervalMs: TEST_TIMEOUTS.CDC_FLUSH_INTERVAL,
    });
    this.propagationDelayMs = options.propagationDelayMs ||
      TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;
    this.delayedEvents = [];
  }

  handleEvent(event) {
    const delayedEvent = {
      event,
      deliverAt: Date.now() + this.propagationDelayMs,
    };
    this.delayedEvents.push(delayedEvent);

    setTimeout(() => {
      const idx = this.delayedEvents.indexOf(delayedEvent);
      if (idx >= 0) {
        this.delayedEvents.splice(idx, 1);
        super.handleEvent(event);
      }
    }, this.propagationDelayMs);

    return true;
  }

  getInFlightCount() {
    return this.delayedEvents.length;
  }

  async waitForDelivery(timeoutMs = 500) {
    const start = Date.now();
    while (this.delayedEvents.length > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 10));
    }
    this.flushAllBuffers();
  }
}


class MockMessageGroupService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.groupId = options.groupId || 'mg-test';
    this.replicaId = options.replicaId || 'mg-test-r1';
    this.nodeId = options.nodeId || 'node-1';
    this._isLeader = options.isLeader !== false;
    this.sentMessages = [];
    this.acks = [];
  }

  isLeaderReplica() {
    return this._isLeader;
  }

  setLeader(isLeader) {
    this._isLeader = isLeader;
  }

  getLeaderId() {
    return this._isLeader ? this.replicaId : 'other-replica';
  }

  buildPeerAddress(replicaId) {
    return `${this.nodeId}/message-group/${replicaId}`;
  }

  async sendMessage(target, payload) {
    this.sentMessages.push({target, payload, timestamp: Date.now()});
    return {messageId: `msg-${Date.now()}`, status: 'sent'};
  }

  async acknowledgeMessage(messageId) {
    this.acks.push({messageId, timestamp: Date.now()});
  }

  simulateMessageReceived(payload) {
    this.emit('messageReceived', {payload, messageId: `msg-${Date.now()}`});
  }

  simulateCdcApplied(tableName, operation, data) {
    this.emit('cdcApplied', {tableName, operation, data});
  }
}


// A pure row builder: it receives the observation time as DATA rather than
// reading a clock, so a deterministic host can seed rows on its node's time.
// The ambient default keeps every existing caller byte-identical.
function createNodeEntry(nodeId, overrides = {}, nowMs = Date.now()) {
  const now = nowMs;
  return {
    node_id: nodeId,
    node_address: `ws://${nodeId}:9000`,
    cpu_cores: 4,
    memory_mb: 1024,
    disk_gb: 10,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: NODE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: '[]',
    last_heartbeat: now,
    ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
    created_at: now,
    ...overrides,
  };
}


async function waitForCondition(
  condition,
  timeoutMs = TEST_TIMEOUTS.TEST_TIMEOUT,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ---------------------------------------------------------------------------
// HOSTS. Every collaborator below is the REAL production owner, constructed
// over this node's real cache, with the one declared seam (the SQL engine,
// registry pair `sql-engine-cache-membership`, contract-bound in
// test/distributed/harness/sql-engine-seam.js). The hand-wired stand-ins this
// file used to carry were the mechanism by which the cold-formation harness
// model went stale (formation-harness-model-from-contracts, 2026-09-12): an
// object built by hand kept modelling an interaction the owners had changed,
// and nothing checked it against the owner. A host cannot drift that way.
// ---------------------------------------------------------------------------

const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const HOST_NODE_ID = 'host-node';
const HOST_ROUTER_ADDRESS = '127.0.0.1:0';
const LEADER_NODE = 'leader';
const FOLLOWER_NODE_PREFIX = 'follower-';
const CDC_MESSAGE_TYPE = 'cdc';

/**
 * The seam: the one collaborator that is not the real owner here, by contract.
 * @param {SystemTableCache} cache
 * @return {object} an engine answering system-table statements from the cache
 */
function createSqlEngineSeamFor(cache) {
  return createSqlEngineSeam(cache);
}

/**
 * A real, unstarted MessageRouter: it never opens a socket, and a peer that
 * was never registered is exactly what a disconnected peer looks like to
 * every consumer (getConnectionState -> null).
 * @param {object} [options]
 * @return {MessageRouter}
 */
function createMessageRouterHost(options = {}) {
  return new MessageRouter({
    nodeId: options.nodeId || HOST_NODE_ID,
    nodeAddress: HOST_ROUTER_ADDRESS,
    wsPort: 0,
    // A deterministic host may name its router; otherwise the ambient draw
    // stands, exactly as before.
    routerId: options.routerId || undefined,
  });
}

/**
 * The real CDC owner over a cache, writing through the seam engine, on the
 * clock it is handed (a virtual-network node clock when hosted on one).
 */
function createCdcOwner(cache, options = {}) {
  const owner = new CDCIntegrationService({
    nodeId: options.nodeId || HOST_NODE_ID,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    sqlQueryEngine: options.sqlQueryEngine || createSqlEngineSeamFor(cache),
    timeSource: options.timeSource,
  });
  owner.bootstrapMode = false;
  owner.logger = QUIET_LOGGER;
  owner.initialize();
  return owner;
}

/**
 * The real owners of one node, wired the way ControlPlaneSetup wires them:
 * gateway and readiness reference each other through the gateway's getter.
 * @param {SystemTableCache} cache
 * @param {object} [options]
 * @return {{cache, sqlQueryEngine, cdcIntegrationService, messageRouter,
 *   controlPlaneSystemTableGateway, controlPlaneReadinessService,
 *   tablePolicyService, storageAccountingService, storageAdmissionService}}
 */
function createNodeHosts(cache, options = {}) {
  const nodeId = options.nodeId || HOST_NODE_ID;
  const sqlQueryEngine = options.sqlQueryEngine || createSqlEngineSeamFor(cache);
  const messageRouter = options.messageRouter || createMessageRouterHost({nodeId});
  const cdcIntegrationService = options.cdcIntegrationService ||
    createCdcOwner(cache, {nodeId, sqlQueryEngine});
  let controlPlaneReadinessService = null;
  const controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService,
    sqlQueryEngine,
    messageRouter,
    getControlPlaneReadinessService: () => controlPlaneReadinessService,
  });
  controlPlaneReadinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    cdcIntegrationService,
    messageRouter,
    controlPlaneSystemTableGateway,
  });
  const tablePolicyService = new TablePolicyService({
    systemTableCache: cache, sqlQueryEngine, cdcIntegrationService,
    controlPlaneSystemTableGateway,
  });
  const storageAccountingService = new StorageCapacityAccountingService({
    systemTableCache: cache, sqlQueryEngine, controlPlaneSystemTableGateway,
  });
  const storageAdmissionService = new StorageAdmissionService({
    nodeId, accountingService: storageAccountingService,
    systemTableCache: cache, cacheMutationTarget: cache, messageRouter,
    cdcIntegrationService, controlPlaneReadinessService,
    controlPlaneSystemTableGateway,
  });
  // The real publication owner, the readiness owner's source of published
  // membership (the rebalancer reads it through the readiness owner). Its
  // leadership is resolved honestly: with no local control_plane_publications
  // partition this node is never the write-leader, so it only ever reads
  // what replication delivers. Its interval driver is not started here; a
  // consumer that needs owner ticks drives them.
  const membershipPublicationService = new MembershipPublicationCoordinator({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService,
    controlPlaneReadinessService,
    now: controlPlaneReadinessService.now,
    membershipPublicationRuntimeOwner: new MembershipPublicationRuntimeOwner({
      nodeId, cdcIntegrationService, systemTableCache: cache, messageRouter,
      controlPlaneSystemTableGateway,
    }),
    resolveIsControlPlanePublicationsWriteLeader: () =>
      isControlPlanePublicationsWriteLeader(cache, nodeId, cdcIntegrationService),
  });
  controlPlaneReadinessService.syncOwnerDependencies({
    membershipPublicationService,
  });
  return {
    cache, sqlQueryEngine, cdcIntegrationService, messageRouter,
    controlPlaneSystemTableGateway, controlPlaneReadinessService,
    membershipPublicationService,
    tablePolicyService, storageAccountingService, storageAdmissionService,
  };
}


/**
 * The real RebalanceCoordinator over the node's real owners.
 * @param {SystemTableCache} cache
 * @param {object} [hosts] the node's hosts, built if absent
 * @return {RebalanceCoordinator}
 */
function createRebalanceCoordinatorHost(cache, hosts = null) {
  const node = hosts || createNodeHosts(cache);
  return new RebalanceCoordinator({
    nodeId: node.controlPlaneReadinessService.nodeId || HOST_NODE_ID,
    systemTableCache: node.cache,
    cdcIntegrationService: node.cdcIntegrationService,
    messageRouter: node.messageRouter,
    tablePolicyService: node.tablePolicyService,
    sqlQueryEngine: node.sqlQueryEngine,
    storageAccountingService: node.storageAccountingService,
    storageAdmissionService: node.storageAdmissionService,
    controlPlaneReadinessService: node.controlPlaneReadinessService,
    controlPlaneSystemTableGateway: node.controlPlaneSystemTableGateway,
  });
}

/**
 * Replication between caches, hosted on the deterministic virtual network:
 * every change the source cache applies is a message with the scenario's
 * delay, applied at each follower through the cache owner's own apply - the
 * leg the message-group owner performs in production. Nothing waits on the
 * wall clock: waitForPropagation() runs the network, deliverUntil() runs it
 * one committed change at a time.
 * @param {SystemTableCache} sourceCache
 * @param {SystemTableCache[]} [targetCaches]
 * @param {object} [options]
 * @param {number} [options.propagationDelayMs]
 * @return {object} propagation controls
 */
function createReplicaPropagation(sourceCache, targetCaches = [], options = {}) {
  const propagationDelayMs = options.propagationDelayMs ||
    TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;
  const network = createVirtualNetwork();
  network.registerNode(LEADER_NODE, null);
  const followers = targetCaches.map((targetCache, index) => {
    const nodeId = `${FOLLOWER_NODE_PREFIX}${index}`;
    network.registerNode(nodeId, (message) => {
      const {tableName, operation, data} = message.payload;
      targetCache.applySystemTableChange(tableName, operation, data);
    });
    return nodeId;
  });
  const propagate = (tableName, operation, data) => {
    for (const to of followers) {
      network.send({from: LEADER_NODE, to, type: CDC_MESSAGE_TYPE,
        payload: {tableName, operation, data}, delayMs: propagationDelayMs});
    }
  };
  sourceCache.onCacheChange(propagate);
  // The cache notifies its listeners on the next macrotask; let that pass so
  // every committed change is on the network before it is run.
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    network,
    pendingPropagations() {
      return network.pendingEventCount();
    },
    async waitForPropagation() {
      await settle();
      network.run();
      await settle();
    },
    /**
     * Deliver one in-flight change at a time until the followers satisfy
     * the predicate, leaving the rest in flight: the stale window a lagging
     * replica presents between two committed changes.
     * @param {function(): boolean} predicate
     * @return {Promise<boolean>} whether the predicate was reached
     */
    async deliverUntil(predicate) {
      await settle();
      while (!predicate() && network.pendingEventCount() > 0) {
        network.runStep();
      }
      await settle();
      return predicate();
    },
    cleanup() {
      sourceCache.offCacheChange(propagate);
      network.run();
    },
  };
}

/**
 * The real CDC owner over a source cache on the leader node's clock, plus
 * replication to the followers. The host INHERITS the owner: a consumer
 * handed this as its cdcIntegrationService reaches every owner method.
 * @param {SystemTableCache} sourceCache
 * @param {SystemTableCache[]} [targetCaches]
 * @param {object} [options]
 * @return {object} the leader's real write surface plus propagation controls
 */
function createCdcPropagationHost(sourceCache, targetCaches = [], options = {}) {
  const replica = createReplicaPropagation(sourceCache, targetCaches, options);
  const owner = createCdcOwner(sourceCache, {
    nodeId: LEADER_NODE,
    sqlQueryEngine: createSqlEngineSeamFor(sourceCache),
    timeSource: replica.network.networkTimeSource(LEADER_NODE),
  });
  return Object.assign(Object.create(owner), replica, {
    sqlQueryEngine: owner.sqlQueryEngine,
    owner,
  });
}

/**
 * The published active set as the owners read it: null until a membership
 * publication has been PUBLISHED into this cache.
 * @param {SystemTableCache} cache
 * @return {string[]|null}
 */
function readPublishedActiveNodeIds(cache) {
  return resolvePublishedActiveNodeIds({
    publicationRows: cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [],
  });
}

/**
 * Wait until the real publication owner has PUBLISHED exactly these node ids
 * into the cache (the seed publishes itself on the real path after bootstrap).
 * @param {SystemTableCache} cache
 * @param {string[]} nodeIds
 * @return {Promise<boolean>}
 */
function waitForPublishedMembership(cache, nodeIds) {
  const expected = [...nodeIds].sort().join(',');
  return waitForCondition(() =>
    (readPublishedActiveNodeIds(cache) || []).slice().sort().join(',') ===
      expected);
}

/**
 * Drive the readiness owner until its own planning snapshot for the node has
 * landed: right after bootstrap its synchronous verdict is
 * planning_snapshot_refresh_pending (every dimension false) until an
 * asynchronous evaluation schedules the refresh, and the rebalancer's
 * available set is the published set filtered by that verdict.
 * @param {ControlPlaneReadinessService} readinessService
 * @param {string} nodeId
 * @return {Promise<boolean>}
 */
async function waitForPlacementEligible(readinessService, nodeId) {
  return waitForCondition(async () => {
    // The asynchronous evaluation is what schedules the refresh; the
    // synchronous verdict is what the rebalancer reads.
    await readinessService.getNodeReadiness(nodeId);
    return readinessService.getNodeReadinessSync(nodeId)?.dimensions
      ?.placementEligible === true;
  });
}

/**
 * The booted seed's REAL owners, reached the way its own runtime reaches
 * them: the readiness owner through the rebalance coordinator, the
 * publication coordinator through the heartbeat owner, the gateway from the
 * registry the control-plane setup fills.
 * @param {BootstrapService} bootstrapService
 * @return {object}
 */
function seedOwners(bootstrapService) {
  return {
    cache: NodeService.getInstance().getSystemTableCache(),
    cdcIntegrationService: bootstrapService.cdcIntegrationService,
    controlPlaneReadinessService:
      bootstrapService.rebalanceCoordinator.controlPlaneReadinessService,
    membershipPublicationService:
      bootstrapService.heartbeatService.membershipPublicationService,
    controlPlaneSystemTableGateway: getRegisteredControlPlaneSystemTableGateway(),
    heartbeatService: bootstrapService.heartbeatService,
    leaseService: bootstrapService.leaseService,
    tablePolicyService: bootstrapService.tablePolicyService,
    messageRouter: bootstrapService.messageRouter,
    rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
  };
}

export {
  MockMessageGroupService,
  TEST_TIMEOUTS,
  createCdcPropagationHost,
  createMessageRouterHost,
  createNodeEntry,
  createNodeHosts,
  createReplicaPropagation,
  createRebalanceCoordinatorHost,
  createSqlEngineSeamFor,
  initializeTestEnvironment,
  readPublishedActiveNodeIds,
  seedOwners,
  shutdownOrFail,
  waitForCondition,
  waitForPlacementEligible,
  waitForPublishedMembership,
};
