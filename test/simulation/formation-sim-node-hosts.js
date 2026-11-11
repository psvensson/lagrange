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

import {
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
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
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {StorageAdmissionService} from '../../src/rebalancer/storage-admission-service.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {EntityType, UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {TABLES} from '../../src/constants/index.js';
import {createSqlEngineSeam} from '../distributed/harness/sql-engine-seam.js';
import {
  createMessageRouterHost,
  createNodeEntry,
  createSqlEngineSeamFor,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {LEGACY_SIMULATED_NODE_HOST_COMPOSER} from
  './formation-sim-infrastructure-composition.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';
import {createHeldDrainLedger} from './formation-sim-quiescence.js';
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const DRAIN_DELAY_MS = 0;
const NEXT_TURN_DELAY_MS = 0;
const NODE_ADDRESS_SUFFIX = ':7000';
const SIM_ROUTER_ID_SUFFIX = '/router';
const SIM_CACHE_ID_SUFFIX = '/cache';
const INSERT = 'INSERT';
const READY_LEASE_MS = 30000;
const PARTITION_SUFFIX = '-p1';
const WITNESS_STATE_OBSERVED = 'observed';
const DEFAULT_LEADER_TERM = 1;
const DEFAULT_COMMITTED_INDEX = 0;
const LEADER_UNAVAILABLE_ERROR = 'Partition leader unavailable';
const TARGET_ENGINE_UNAVAILABLE_ERROR = 'Partition target engine unavailable';
const INITIAL_SYSTEM_PARTITION_IDS = Object.freeze(
  Object.values(INITIAL_PARTITION_IDS),
);

function buildLeaderReadAuthorityWitness(
  partitionId,
  servingNodeId,
  observedAtMs,
  leader,
) {
  return Object.freeze({
    state: WITNESS_STATE_OBSERVED,
    partitionId,
    role: RAFT_ROLE.LEADER,
    servingNodeId,
    servingReplicaId: `${partitionId}-${servingNodeId}`,
    observedAtMs,
    term: Number.isSafeInteger(leader?.term) && leader.term >= DEFAULT_LEADER_TERM ?
      leader.term : DEFAULT_LEADER_TERM,
    appliedIndex:
      Number.isSafeInteger(leader?.appliedIndex) &&
      leader.appliedIndex >= DEFAULT_COMMITTED_INDEX ?
        leader.appliedIndex : DEFAULT_COMMITTED_INDEX,
    commitIndex:
      Number.isSafeInteger(leader?.commitIndex) &&
      leader.commitIndex >= DEFAULT_COMMITTED_INDEX ?
        leader.commitIndex : DEFAULT_COMMITTED_INDEX,
  });
}

function createLocalPartitionService(
  nodeId,
  partitionId,
  localEngine,
  now,
  partitionAuthority,
) {
  const buildRemoteReadAuthorityWitness = () => {
    const leader = partitionAuthority.resolvePartitionLeader(partitionId);
    if (leader?.leaderId !== nodeId) return null;
    return buildLeaderReadAuthorityWitness(partitionId, nodeId, now(), leader);
  };
  const executeLocalQuery = async (sql, params = []) => {
    const result = await localEngine.executeQuery(sql, params);
    const witness = buildRemoteReadAuthorityWitness();
    if (!result?.success || !witness) return result;
    return {...result, readAuthorityWitness: witness};
  };
  return Object.freeze({
    partitionId,
    replicaId: `${partitionId}-${nodeId}`,
    initialized: true,
    getRole: () =>
      partitionAuthority.resolvePartitionLeader(partitionId)?.leaderId === nodeId ?
        RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
    buildRemoteReadAuthorityWitness,
    executeLocalQuery,
    executeQuery: executeLocalQuery,
  });
}

function resolveTargetReplicaNodeId(
  nodeId,
  partitionId,
  preferLeader,
  leader,
  partitionAuthority,
) {
  if (preferLeader) return leader?.leaderId || null;
  if (partitionAuthority.hasLocalReplica(nodeId, partitionId)) return nodeId;
  return leader?.leaderId || null;
}

function resolveTargetSqlEngine(nodeId, targetNodeId, localEngine, partitionAuthority) {
  if (targetNodeId === nodeId) return localEngine;
  return partitionAuthority.resolveNodeSqlEngine(targetNodeId);
}

function buildPartitionExecutionFailure(error) {
  return {
    success: false,
    rows: [],
    rowSetComplete: false,
    error,
  };
}

function formatPartitionExecutionSuccess({
  result,
  partitionId,
  targetNodeId,
  leader,
  partitionAuthority,
}) {
  const witness = leader?.leaderId === targetNodeId ?
    buildLeaderReadAuthorityWitness(
      partitionId,
      targetNodeId,
      partitionAuthority.resolveNodeNow(targetNodeId),
      leader,
    ) :
    null;
  return {
    ...result,
    rowSetComplete: true,
    participantNodeId: targetNodeId,
    ...(witness ? {readAuthorityWitness: witness} : {}),
  };
}

function createPartitionQueryExecutor(nodeId, localEngine, partitionAuthority) {
  return Object.freeze({
    async executeOnPartition(
      partitionId,
      statement,
      params = [],
      _isReadOnly = true,
      preferLeader = true,
    ) {
      const leader = partitionAuthority.resolvePartitionLeader(partitionId);
      const targetNodeId = resolveTargetReplicaNodeId(
        nodeId,
        partitionId,
        preferLeader,
        leader,
        partitionAuthority,
      );
      if (!targetNodeId) {
        return buildPartitionExecutionFailure(LEADER_UNAVAILABLE_ERROR);
      }
      const targetEngine = resolveTargetSqlEngine(
        nodeId,
        targetNodeId,
        localEngine,
        partitionAuthority,
      );
      if (!targetEngine) {
        return buildPartitionExecutionFailure(TARGET_ENGINE_UNAVAILABLE_ERROR);
      }
      const result = await targetEngine.executeQuery(statement, params);
      if (!result?.success) {
        return {...result, rowSetComplete: false};
      }
      return formatPartitionExecutionSuccess({
        result,
        partitionId,
        targetNodeId,
        leader,
        partitionAuthority,
      });
    },
  });
}

function createSimulatedPublicationRuntimeOwner({
  nodeId,
  cdcIntegrationService,
  cache,
  messageRouter,
  controlPlaneSystemTableGateway,
  now,
  hostSetTimeout,
}) {
  const controlPlaneWriteRetrySleep = (delayMs) =>
    new Promise((resolve) => {
      hostSetTimeout(resolve, delayMs);
    });
  const runtimeOwner = new MembershipPublicationRuntimeOwner({
    nodeId,
    cdcIntegrationService,
    systemTableCache: cache,
    messageRouter,
    controlPlaneSystemTableGateway,
    controlPlaneWriteRetryNow: now,
    controlPlaneWriteRetrySleep,
  });
  for (const metadataOwner of [
    runtimeOwner.nodesOwner,
    runtimeOwner.nodeEndpointsOwner,
    runtimeOwner.serviceEndpointsOwner,
    runtimeOwner.messageGroupsOwner,
    runtimeOwner.controlPlanePublicationsOwner,
  ]) {
    if (!metadataOwner) continue;
    metadataOwner.controlPlaneWriteRetryNow = now;
    metadataOwner.controlPlaneWriteRetrySleep = controlPlaneWriteRetrySleep;
  }
  return runtimeOwner;
}

function createNodePartitionAuthoritySeam(nodeId, cache, now, partitionAuthority) {
  if (!partitionAuthority) {
    return {
      sqlQueryEngine: createSqlEngineSeamFor(cache),
      partitionServicesProvider: null,
    };
  }
  const localEngine = createSqlEngineSeam(cache);
  const queryExecutor = createPartitionQueryExecutor(
    nodeId,
    localEngine,
    partitionAuthority,
  );
  const sqlQueryEngine = createSqlEngineSeam(cache, {queryExecutor});
  const partitionServicesProvider = () => {
    const services = new Map();
    for (const partitionId of INITIAL_SYSTEM_PARTITION_IDS) {
      if (!partitionAuthority.hasLocalReplica(nodeId, partitionId)) continue;
      services.set(
        partitionId,
        createLocalPartitionService(
          nodeId,
          partitionId,
          localEngine,
          now,
          partitionAuthority,
        ),
      );
    }
    return services;
  };
  return {sqlQueryEngine, partitionServicesProvider};
}

/**
 * Build one node's real owners on its network clock.
 * @param {object} options
 * @param {object} options.network the virtual network
 * @param {string} options.nodeId
 * @param {object} options.randomSource seeded random source for the node
 * @param {object|null} [options.partitionAuthority] scenario partition leadership
 * @param {Function} [options.chargeDispatch] brackets a scheduled callback so
 *   the segments it produces are charged to this node; the default runs the
 *   callback uncharged, for construction-only uses
 * @returns {object} the hosts
 */
function createSimulatedNodeHosts({network, nodeId, randomSource,
  compositionRegistry = null,
  partitionAuthority = null,
  chargeDispatch = (id, callback) => callback()}) {
  // This composer builds the node's cache, CDC service and router host, so it
  // declares itself where a scenario tracks composition. Scenarios that do
  // not track it (the legacy formation scenario, which has only this
  // composer) pass no registry and are unaffected.
  compositionRegistry?.claim(nodeId, LEGACY_SIMULATED_NODE_HOST_COMPOSER);
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
  const {sqlQueryEngine, partitionServicesProvider} =
    createNodePartitionAuthoritySeam(nodeId, cache, now, partitionAuthority);
  const messageRouter = createMessageRouterHost(
    {nodeId, routerId: `${nodeId}${SIM_ROUTER_ID_SUFFIX}`});
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId, systemTableCache: cache, cacheMutationTarget: cache, sqlQueryEngine,
    partitionServicesProvider, timeSource,
  });
  cdcIntegrationService.bootstrapMode = false;
  cdcIntegrationService.logger = QUIET_LOGGER;
  cdcIntegrationService.initialize();
  let controlPlaneReadinessService = null;
  const controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
    nodeId, systemTableCache: cache, cdcIntegrationService, sqlQueryEngine, messageRouter,
    getControlPlaneReadinessService: () => controlPlaneReadinessService,
    logger: QUIET_LOGGER, now,
  });
  // Every reconcile queue drains on a macrotask, and the queue's default is
  // the real setImmediate. Left alone, every drain in a deterministic run
  // happens outside virtual time, on no node's clock and charged to nobody.
  // It belongs on this node's timer queue, where the node's own occupancy
  // defers it like any other event. One port for every queue owner hosted
  // here.
  // The ledger is the quiescence rule's view of those drains
  // (formation-sim-quiescence.js).
  const heldDrains = createHeldDrainLedger();
  const hostScheduleDrain = (callback) => {
    heldDrains.hold();
    network.setTimer(nodeId, () => {
      heldDrains.release();
      return chargeDispatch(nodeId, callback);
    }, DRAIN_DELAY_MS);
  };
  controlPlaneReadinessService = createReadinessServiceForTest({
    nodeId, systemTableCache: cache, cacheMutationTarget: cache, cdcIntegrationService,
    messageRouter, controlPlaneSystemTableGateway, timeSource,
    readinessPlanningScheduleDrainFn: hostScheduleDrain,
  });
  const tablePolicyService = new TablePolicyService({
    systemTableCache: cache, sqlQueryEngine, cdcIntegrationService,
    controlPlaneSystemTableGateway, now,
  });
  tablePolicyService.logger = QUIET_LOGGER;
  const storageAccountingService = new StorageCapacityAccountingService({
    systemTableCache: cache, sqlQueryEngine, controlPlaneSystemTableGateway, timeSource, now,
  });
  const storageAdmissionService = new StorageAdmissionService({
    nodeId, accountingService: storageAccountingService, systemTableCache: cache,
    cacheMutationTarget: cache, messageRouter, cdcIntegrationService,
    controlPlaneReadinessService, controlPlaneSystemTableGateway, now,
  });
  storageAdmissionService.logger = QUIET_LOGGER;
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
  const membershipPublicationService = new MembershipPublicationCoordinator({
    nodeId, systemTableCache: cache, cdcIntegrationService, controlPlaneReadinessService,
    now: controlPlaneReadinessService.now,
    membershipPublicationRuntimeOwner: createSimulatedPublicationRuntimeOwner({
      nodeId,
      cdcIntegrationService,
      cache,
      messageRouter,
      controlPlaneSystemTableGateway,
      now,
      hostSetTimeout,
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
  const intervals = new Set();
  const hostSetInterval = (callback, intervalMs) =>
    repeatOnVirtualTime(network, nodeId, intervals,
      () => chargeDispatch(nodeId, callback), intervalMs);
  const hostClearInterval = (handle) => intervals.delete(handle);
  // Assembled by the production owner, so the collaborator list cannot drift:
  // omitting the publication service silently disabled the heartbeat's
  // scheduled reconcile, which production documents as the sole scheduler for
  // membership reconciliation, and publication work vanished from every node.
  const heartbeatService = assembleHeartbeatService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId, nodeAddress: `${nodeId}${NODE_ADDRESS_SUFFIX}`,
    systemTableCache: cache, cacheMutationTarget: cache, cdcIntegrationService,
    messageRouter, controlPlaneSystemTableGateway, now,
    membershipPublicationService, controlPlaneReadinessService,
    // One process hosts every node, so lifecycle readiness is answered per
    // node rather than from the NodeService singleton.
    isNodeLifecycleReady: () => true,
    // The authoritative readback is real IO this seam cannot serve.
    verifyReporterVisibilityOnSuccess: false,
    setIntervalFn: hostSetInterval,
    clearIntervalFn: hostClearInterval,
    // A cancellable one-shot. A no-op canceller left every heartbeat attempt's
    // 6 s watchdog armed, so each successful attempt still recorded a timeout
    // failure production never sees, and leaked a charged timer per attempt.
    setTimeoutFn: hostSetTimeout,
    clearTimeoutFn: hostClearTimeout,
  });
  heartbeatService.logger = QUIET_LOGGER;
  const rebalanceCoordinator = new RebalanceCoordinator({
    nodeId, systemTableCache: cache, cdcIntegrationService, messageRouter, tablePolicyService,
    sqlQueryEngine, storageAccountingService, storageAdmissionService,
    controlPlaneReadinessService, controlPlaneSystemTableGateway, timeSource,
    setIntervalFn: hostSetInterval, clearIntervalFn: hostClearInterval,
  });
  rebalanceCoordinator.logger = QUIET_LOGGER;
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
    scheduleDrainFn: hostScheduleDrain, heldDrains,
    stopIntervals: () => intervals.clear(),
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
  const rebalancer = new UnifiedRebalancer({
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
    // Its check queue drains on this node's virtual queue too.
    scheduleDrainFn: hosts.scheduleDrainFn,
  });
  rebalancer.logger = QUIET_LOGGER;
  return rebalancer;
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
