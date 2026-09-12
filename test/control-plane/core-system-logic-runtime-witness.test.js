// Witness of the RUNTIME invariants cited from
// architecture/contracts/core-system-logic.md - the ones whose subject is what
// an owner does with evidence rather than the architecture's shape, so a model
// check cannot witness them (formation-contracts-registration, subject
// classification 2026-09-12). One test per invariant, each red when the
// OWNER's predicate is mutated, never the test.
//
// Registered as the contract's single witness only once every runtime
// invariant citing the document has its test in this file.

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';

import {BOOTSTRAP_PHASE} from '../../src/bootstrap/bootstrap-constants.js';
import {
  createBootstrapServiceSeedWorkflowMethods,
} from '../../src/bootstrap/bootstrap-service-seed-workflow.js';
import {
  BootstrapNodeReadyRebalanceOwner,
} from '../../src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js';
import {
  StartupRuntimeHandoffOwner,
} from '../../src/bootstrap/owners/startup-runtime-handoff-owner.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {resolveActiveNodeViews} from '../../src/control-plane/active-node-projection.js';
import {HEARTBEAT_STATE} from '../../src/control-plane/heartbeat-service-constants.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {LEASE_STATE} from '../../src/control-plane/lease-service-constants.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {
  NodeLifecycleStateMachine,
} from '../../src/node/node-lifecycle-state-machine.js';
import {
  createNodeHosts,
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_REASON,
} from '../../src/control-plane/projection-readiness-constants.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/publication-owner-constants.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const NODE_ID = 'runtime-witness-node';
const NODE_ADDRESS = 'ws://127.0.0.1:0';
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const REVISION = Object.freeze({STALE: 4, REQUIRED: 5});
const NOW_MS = 1000;
const LEASE_EXPIRES_AT_MS = 2000;
const READY_DIMENSIONS = Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
  [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
});
const PUBLISHED_MEMBERSHIP = Object.freeze({
  publicationEpoch: REVISION.REQUIRED,
  status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
  requiredAckNodeIds: Object.freeze([NODE_ID]),
  acknowledgedNodeIds: Object.freeze([NODE_ID]),
});

/**
 * The owner's projection readiness decision for a node whose every
 * dimension is healthy and whose publication is acknowledged, at the given
 * local projection revision against the published one.
 * @param {number} localProjectionRevision
 * @return {object}
 */
function decideAtRevision(localProjectionRevision) {
  return buildProjectionReadinessContract({
    dimensions: READY_DIMENSIONS,
    membershipPublication: PUBLISHED_MEMBERSHIP,
    localProjectionRevision,
    requiredProjectionRevision: REVISION.REQUIRED,
  });
}

test('stale-projection-never-promotes-readiness: an otherwise healthy node ' +
  'whose local projection lags the published revision is not promoted in any lane',
() => {
  const fresh = decideAtRevision(REVISION.REQUIRED);
  assert.equal(fresh.lanes.internal.ready, true,
    'control: at the published revision the same evidence promotes');
  assert.equal(fresh.lanes.serve.ready, true, 'control: serve lane promotes');

  const stale = decideAtRevision(REVISION.STALE);
  assert.equal(stale.lanes.internal.ready, false,
    'a stale projection cannot promote the internal lane');
  assert.equal(stale.lanes.repair.ready, false,
    'a stale projection cannot promote the repair lane');
  assert.equal(stale.lanes.serve.ready, false,
    'a stale projection cannot promote serve readiness');
  assert.equal(stale.ready, false, 'the decision is not ready');
  assert.ok(arrayIncludes(stale.reasonCodes, PROJECTION_READINESS_REASON.PROJECTION_REVISION_STALE),
    `the owner names the stale revision as the reason: ${stale.reasonCodes.join(', ')}`);
});

/**
 * The owner's active-node projection, in its convergence mode (recovery-
 * eligible projection allowed), for one node whose cluster-member evidence
 * is unhealthy and whose only claim to projection is runtime authority in
 * the given state.
 * @param {string} runtimeAuthorityState
 * @return {object}
 */
function projectWithRuntimeAuthority(runtimeAuthorityState) {
  return resolveActiveNodeViews({
    nodeRows: [{
      node_id: NODE_ID, status: 'active', connection_state: 'ready',
      ready_lease_expires_at: LEASE_EXPIRES_AT_MS,
    }],
    serviceRows: [{service_id: `${NODE_ID}-svc`, node_id: NODE_ID, status: 'active'}],
    nodeEndpointRows: [{
      endpoint_id: `${NODE_ID}-ws`, node_id: NODE_ID, transport_type: 'ws',
      status: 'active', address: `ws://${NODE_ID}:8082`,
    }],
    readinessEntries: [{
      nodeId: NODE_ID,
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      },
      runtimeAuthority: {
        state: runtimeAuthorityState,
        repairEligible: true,
        visibility: {
          state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
          published: false,
        },
      },
    }],
    allowControlPlaneRecoveryEligibleProjection: true,
    nowMs: NOW_MS,
  });
}

test('degraded-evidence-never-upgrades-readiness: retained or unavailable ' +
  'runtime authority explains a node but cannot project it as active',
() => {
  const establishing = projectWithRuntimeAuthority(RUNTIME_AUTHORITY_STATE.ESTABLISHING);
  assert.deepEqual(establishing.projectedServingNodeIds, [NODE_ID],
    'control: establishing runtime authority does project the node');

  for (const degraded of [
    RUNTIME_AUTHORITY_STATE.RETAINED, RUNTIME_AUTHORITY_STATE.UNAVAILABLE,
  ]) {
    const projection = projectWithRuntimeAuthority(degraded);
    assert.deepEqual(projection.projectedServingNodeIds, [],
      `${degraded} runtime authority must not upgrade the node into the projection`);
    assert.deepEqual(projection.projectionDiagnostics.runtimeAuthorityIncludedNodeIds, [],
      `${degraded} runtime authority is not a runtime-authority inclusion`);
    assert.deepEqual(projection.projectionDiagnostics.readinessExcludedNodeIds, [NODE_ID],
      `${degraded} runtime authority leaves the node excluded by readiness, explained`);
  }
});

/**
 * The injected clock for the steady-state owners: every interval or timeout
 * they arm is recorded, never fired; the wall clock is never consulted.
 * @return {object}
 */
function createVirtualTimers() {
  const armed = [];
  const handle = () => Object.freeze({unref() {}});
  return {
    armed,
    setIntervalFn(fn, ms) {
      armed.push({kind: 'interval', ms});
      return handle();
    },
    setTimeoutFn(fn, ms) {
      armed.push({kind: 'timeout', ms});
      return handle();
    },
    clearIntervalFn() {},
    clearTimeoutFn() {},
  };
}

/**
 * The seed's completion step, hosted: the REAL seed workflow methods
 * (production prototype inherited) over the real StartupRuntimeHandoffOwner,
 * whose steady-state owners are the real LeaseService and HeartbeatService
 * (initialized, timers injected) over the node's real CDC owner and gateway,
 * a real lifecycle state machine and a real node-ready rebalance owner.
 * @return {object}
 */
function createSeedCompletionHost() {
  const cache = new SystemTableCache();
  const hosts = createNodeHosts(cache, {nodeId: NODE_ID});
  const timers = createVirtualTimers();
  const heartbeatService = new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    cdcIntegrationService: hosts.cdcIntegrationService,
    systemTableCache: cache,
    controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    isNodeLifecycleReady: () => true,
    ...timers,
  });
  heartbeatService.initialize();
  const leaseService = new LeaseService({
    nodeId: NODE_ID,
    nodeLeaseOwner: heartbeatService,
    systemTableCache: cache,
    controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    messageRouter: hosts.messageRouter,
    ...timers,
  });
  leaseService.initialize();
  const runtimeHandoffOwner = new StartupRuntimeHandoffOwner({
    delegates: {
      isShuttingDown: () => false,
      getLeaseService: () => leaseService,
      getLeaseRunningState: () => LEASE_STATE.RUNNING,
      getHeartbeatService: () => heartbeatService,
      getHeartbeatRunningState: () => HEARTBEAT_STATE.RUNNING,
      getMetadataPublicationReadinessOptions: () => null,
      activateDistributedTransactionRecoveryOnWriterActivation: false,
      getLogger: () => QUIET_LOGGER,
    },
  });
  const nodeReadyRebalanceOwner = new BootstrapNodeReadyRebalanceOwner({
    delegates: {getLogger: () => QUIET_LOGGER},
  });
  const events = new EventEmitter();
  const seed = Object.assign(Object.create(createBootstrapServiceSeedWorkflowMethods()), {
    nodeId: NODE_ID,
    startTime: Date.now(),
    phase: BOOTSTRAP_PHASE.NOT_STARTED,
    lifecycleStateMachine: new NodeLifecycleStateMachine({nodeId: NODE_ID}),
    nodeReadyRebalanceOwner,
    // BootstrapService's own forwarding line to its real owner.
    clearNodeReadyRebalanceState() {
      this.nodeReadyRebalanceOwner.clearNodeReadyRebalanceState();
    },
    runtimeHandoffOwner,
    logger: QUIET_LOGGER,
    emit: (...args) => events.emit(...args),
    servicesCreated: 0,
    partitionsCreated: 0,
    messageGroupsCreated: 0,
    messageGroupServices: new Map(),
    partitionServices: new Map(),
    replicaHandler: null,
    replicaStateMachine: null,
    epochManager: null,
    transport: null,
    messageRouter: hosts.messageRouter,
  });
  return {seed, runtimeHandoffOwner, leaseService, heartbeatService, timers};
}

test('phase-owner-handoff-completes: completing the seed phase transfers the ' +
  'control-plane writers to the steady-state owners before the phase is complete',
async () => {
  initializeTestEnvironment();
  const {seed, runtimeHandoffOwner, leaseService, heartbeatService, timers} =
    createSeedCompletionHost();
  assert.equal(runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters(), false,
    'control: before completion the steady-state owners hold nothing');

  const result = seed.completeSuccessfulBootstrap();
  // The transfer is the phase owner's last act: it is issued on the way to
  // COMPLETE, and the steady-state owners settle on the injected clock.
  const activation = runtimeHandoffOwner.controlPlaneBackgroundWriterActivationPromise;
  assert.ok(activation, 'completion hands the writers to the steady-state owner');
  await activation;

  assert.equal(result.success, true);
  assert.equal(seed.phase, BOOTSTRAP_PHASE.COMPLETE, 'the phase completed');
  assert.equal(runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters(), true,
    'the steady-state owners hold the control-plane writers after completion');
  assert.equal(leaseService.state, LEASE_STATE.RUNNING, 'the lease owner is running');
  assert.equal(heartbeatService.state, HEARTBEAT_STATE.RUNNING,
    'the heartbeat owner is running');
  assert.ok(timers.armed.some((timer) => timer.kind === 'interval'),
    'their periodic work is armed on the injected clock, not the wall clock');
});
