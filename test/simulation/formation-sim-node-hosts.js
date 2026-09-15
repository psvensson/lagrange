// The real control-plane owners of one simulated node, wired the way
// ControlPlaneSetup wires them (the membership-consistency helpers'
// createNodeHosts is the template), with every clock the owners accept
// handed the node's network time source: gateway, readiness, table policy,
// storage accounting and admission, the publication coordinator (through
// readiness's clock) and the rebalance coordinator. A UnifiedRebalancer per
// priority partition on the seed supplies the planning-gate decision the
// signature's readiness observations come from. No owner decision is
// reproduced here; only construction and cache seeding are the harness's.
//
// Adapter contract: the SQL engine is the helpers' cache-backed seam, the
// message router is real but never opens a socket, and node rows are seeded
// from scenario data rather than written by a real bootstrap (slice 2c);
// cross-node replication of cache changes is not hosted yet.

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneReadinessService} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  MembershipPublicationRuntimeOwner,
} from '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {
  isControlPlanePublicationsWriteLeader,
} from '../../src/control-plane/control-plane-publications-leadership.js';
import {assembleHeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {StorageAdmissionService} from '../../src/rebalancer/storage-admission-service.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {EntityType, UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {TABLES} from '../../src/constants/index.js';
import {
  createMessageRouterHost,
  createNodeEntry,
  createSqlEngineSeamFor,
} from '../integration/membership-consistency-integration-test-helpers.js';

const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const DRAIN_DELAY_MS = 0;
const NEXT_TURN_DELAY_MS = 0;
const NODE_ADDRESS_SUFFIX = ':7000';
const SIM_ROUTER_ID_SUFFIX = '/router';
const SIM_CACHE_ID_SUFFIX = '/cache';
const INSERT = 'INSERT';
const READY_LEASE_MS = 30000;
const PARTITION_SUFFIX = '-p1';

/**
 * Build one node's real owners on its network clock.
 * @param {object} options
 * @param {object} options.network the virtual network
 * @param {string} options.nodeId
 * @param {object} options.randomSource seeded random source for the node
 * @param {Function} [options.chargeDispatch] brackets a scheduled callback so
 *   the segments it produces are charged to this node; the default runs the
 *   callback uncharged, for construction-only uses
 * @returns {object} the hosts
 */
function createSimulatedNodeHosts({network, nodeId, randomSource,
  chargeDispatch = (id, callback) => callback()}) {
  const timeSource = network.networkTimeSource(nodeId);
  const now = () => timeSource.now();
  // The cache-change hop is production's, not the harness's: the notification
  // is still deferred to a later turn, but that turn is an event on this
  // node's deterministic queue instead of a real setImmediate the virtual
  // clock never reaches. Delivery, ordering and batching are untouched.
  const cache = new SystemTableCache({
    // The node's own clock owns the cache's mutation watermark, and the
    // instance id is named rather than drawn, because a debug string must not
    // become a reason to read host time inside a simulated process.
    timeSource,
    cacheId: `${nodeId}${SIM_CACHE_ID_SUFFIX}`,
    scheduleCacheChangeNotification: (callback) =>
      network.setTimer(nodeId, () => chargeDispatch(nodeId, callback),
        NEXT_TURN_DELAY_MS),
  });
  const sqlQueryEngine = createSqlEngineSeamFor(cache);
  const messageRouter = createMessageRouterHost(
    {nodeId, routerId: `${nodeId}${SIM_ROUTER_ID_SUFFIX}`});
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId, systemTableCache: cache, cacheMutationTarget: cache, sqlQueryEngine, timeSource,
  });
  cdcIntegrationService.bootstrapMode = false;
  cdcIntegrationService.logger = QUIET_LOGGER;
  cdcIntegrationService.initialize();
  let controlPlaneReadinessService = null;
  const controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
    nodeId, systemTableCache: cache, cdcIntegrationService, sqlQueryEngine, messageRouter,
    getControlPlaneReadinessService: () => controlPlaneReadinessService, now,
  });
  controlPlaneReadinessService = new ControlPlaneReadinessService({
    nodeId, systemTableCache: cache, cacheMutationTarget: cache, cdcIntegrationService,
    messageRouter, controlPlaneSystemTableGateway, timeSource,
    // The readiness planning queue drains on a macrotask, and its default is
    // the real setImmediate. Left alone, every build in a deterministic run
    // happens outside virtual time, on no node's clock and charged to
    // nobody. It belongs on this node's timer queue, where the node's own
    // occupancy defers it like any other event.
    readinessPlanningScheduleDrainFn: (callback) =>
      network.setTimer(nodeId, () => chargeDispatch(nodeId, callback), DRAIN_DELAY_MS),
  });
  const tablePolicyService = new TablePolicyService({
    systemTableCache: cache, sqlQueryEngine, cdcIntegrationService,
    controlPlaneSystemTableGateway, now,
  });
  const storageAccountingService = new StorageCapacityAccountingService({
    systemTableCache: cache, sqlQueryEngine, controlPlaneSystemTableGateway, timeSource, now,
  });
  const storageAdmissionService = new StorageAdmissionService({
    nodeId, accountingService: storageAccountingService, systemTableCache: cache,
    cacheMutationTarget: cache, messageRouter, cdcIntegrationService,
    controlPlaneReadinessService, controlPlaneSystemTableGateway, now,
  });
  const membershipPublicationService = new MembershipPublicationCoordinator({
    nodeId, systemTableCache: cache, cdcIntegrationService, controlPlaneReadinessService,
    now: controlPlaneReadinessService.now,
    membershipPublicationRuntimeOwner: new MembershipPublicationRuntimeOwner({
      nodeId, cdcIntegrationService, systemTableCache: cache, messageRouter,
      controlPlaneSystemTableGateway,
    }),
    resolveIsControlPlanePublicationsWriteLeader: () =>
      isControlPlanePublicationsWriteLeader(cache, nodeId, cdcIntegrationService),
  });
  controlPlaneReadinessService.syncOwnerDependencies({membershipPublicationService});
  // The real upstream initiator of readiness work. Nothing here mentions
  // readiness: the heartbeat writes this node's own row, the write reaches
  // the system-table cache, the cache change rotates the node-local planning
  // identity, and the planning queue drains a build. That chain is what
  // produced the live rate, so the simulator hosts the chain rather than
  // inventing a cadence (owner decision 2026-09-14).
  // One cancellable one-shot for every owner that arms its own timer. A
  // no-op canceller leaves watchdogs armed on work that already finished.
  const hostSetTimeout = (callback, delayMs) => {
    const handle = {cancelled: false};
    network.setTimer(nodeId, () => {
      if (handle.cancelled) return undefined;
      return chargeDispatch(nodeId, callback);
    }, delayMs);
    return handle;
  };
  const hostClearTimeout = (handle) => {
    if (handle) handle.cancelled = true;
  };
  const intervals = new Set();
  // Assembled by the production owner, so the collaborator list cannot drift:
  // omitting the publication service silently disabled the heartbeat's
  // scheduled reconcile, which production documents as the sole scheduler for
  // membership reconciliation, and publication work vanished from every node.
  const heartbeatService = assembleHeartbeatService({
    nodeId, nodeAddress: `${nodeId}${NODE_ADDRESS_SUFFIX}`,
    systemTableCache: cache, cacheMutationTarget: cache, cdcIntegrationService,
    messageRouter, controlPlaneSystemTableGateway, now,
    membershipPublicationService, controlPlaneReadinessService,
    // One process hosts every node, so lifecycle readiness is answered per
    // node rather than from the NodeService singleton.
    isNodeLifecycleReady: () => true,
    // The authoritative readback is real IO this seam cannot serve.
    verifyReporterVisibilityOnSuccess: false,
    setIntervalFn: (callback, intervalMs) =>
      repeatOnVirtualTime(network, nodeId, intervals,
        () => chargeDispatch(nodeId, callback), intervalMs),
    clearIntervalFn: (handle) => intervals.delete(handle),
    // A cancellable one-shot. A no-op canceller left every heartbeat attempt's
    // 6 s watchdog armed, so each successful attempt still recorded a timeout
    // failure production never sees, and leaked a charged timer per attempt.
    setTimeoutFn: hostSetTimeout,
    clearTimeoutFn: hostClearTimeout,
  });
  const rebalanceCoordinator = new RebalanceCoordinator({
    nodeId, systemTableCache: cache, cdcIntegrationService, messageRouter, tablePolicyService,
    sqlQueryEngine, storageAccountingService, storageAdmissionService,
    controlPlaneReadinessService, controlPlaneSystemTableGateway, timeSource,
  });
  // Production initializes the coordinator during setup; without it every
  // operation creation throws "RebalanceCoordinator is shutting down", which
  // the guard raises for an uninitialized coordinator as well as a stopping
  // one. Constructing a collaborator is not composing it.
  rebalanceCoordinator.initialize();
  return Object.freeze({
    nodeId, timeSource, now, cache, sqlQueryEngine, messageRouter, cdcIntegrationService,
    controlPlaneSystemTableGateway, controlPlaneReadinessService, tablePolicyService,
    storageAccountingService, storageAdmissionService, membershipPublicationService,
    rebalanceCoordinator, randomSource, heartbeatService,
    setTimeoutFn: hostSetTimeout, clearTimeoutFn: hostClearTimeout,
  });
}

// The virtual network has one-shot timers only, so a repeating interval is a
// timer that re-arms itself. The handle is an identity the canceller can
// delete; a cancelled interval simply stops re-arming.
function repeatOnVirtualTime(network, nodeId, live, callback, intervalMs) {
  const handle = {nodeId, intervalMs};
  live.add(handle);
  const beat = () => {
    if (!live.has(handle)) return;
    network.setTimer(nodeId, beat, intervalMs);
    callback();
  };
  network.setTimer(nodeId, beat, intervalMs);
  return handle;
}

/**
 * The real planning owner for one priority partition on a node.
 * @param {object} hosts createSimulatedNodeHosts() result
 * @param {string} tableId
 * @returns {UnifiedRebalancer}
 */
function createPriorityPartitionRebalancer(hosts, tableId) {
  return new UnifiedRebalancer({
    entityId: `${tableId}${PARTITION_SUFFIX}`,
    entityType: EntityType.PARTITION,
    nodeId: hosts.nodeId,
    systemTableCache: hosts.cache,
    cdcIntegrationService: hosts.cdcIntegrationService,
    tablePolicyService: hosts.tablePolicyService,
    messageRouter: hosts.messageRouter,
    rebalanceCoordinator: hosts.rebalanceCoordinator,
    sqlQueryEngine: hosts.sqlQueryEngine,
    controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    controlPlaneReadinessService: hosts.controlPlaneReadinessService,
    nowFn: hosts.now,
    randomSource: hosts.randomSource,
    // The planner arms its own periodic check and stabilization delay; they
    // run on this node's virtual queue, so the planning rate is the owner's.
    setTimeoutFn: hosts.setTimeoutFn,
    clearTimeoutFn: hosts.clearTimeoutFn,
  });
}

/**
 * Seed a node's cache with the cluster's node rows on virtual time: every
 * time field comes from the node's clock, so the rows are scenario data.
 * @param {object} hosts
 * @param {string[]} nodeIds
 */
function seedNodeRows(hosts, nodeIds) {
  const nowMs = hosts.now();
  for (const nodeId of nodeIds) {
    hosts.cache.applySystemTableChange(TABLES.NODES, INSERT, createNodeEntry(nodeId, {
      last_heartbeat: nowMs,
      ready_lease_expires_at: nowMs + READY_LEASE_MS,
      created_at: nowMs,
    }, nowMs));
  }
}

export {createPriorityPartitionRebalancer, createSimulatedNodeHosts, seedNodeRows};
