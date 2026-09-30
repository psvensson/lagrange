/**
 * Replica lifecycle owner across a preserved join resume (finding F3).
 *
 * Drives the REAL checkpointed join loop (NodeJoiningService.join ->
 * JoinCoordinator -> StartupPipelineRunner with a real JoinSessionStore) and
 * the REAL infrastructure segment (runJoinInfrastructurePhases ->
 * initializeJoinInfrastructure -> initializeReplicaHandler ->
 * ReplicaHandlerSetup.create -> ReplicaStateMachine + armed timeout checker).
 * The only injected fault is a collaborator of a LATER step of the same
 * segment: the leader message-group service's subscribeToCDC, called from the
 * real initializeControlPlaneService, fails with a transient connection
 * error the production classifier treats as retryable. The join loop then
 * takes its own resume decision (handleJoiningFailure({preserveForResume}))
 * and re-enters the infrastructure segment, whose checkpoint was never
 * advanced. The second pass fails non-retryably so the loop ends through the
 * real terminal cleanup.
 *
 * Property: one live node incarnation has exactly one replica lifecycle
 * owner (one ReplicaHandler, one ReplicaStateMachine, one armed timeout
 * checker on the node's canonical time source), across a preserved resume,
 * and terminal cleanup leaves no orphaned timer.
 */

import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {JoinSessionStore} from '../../src/bootstrap/join-session-store.js';
import {NodeService} from '../../src/node/node-service.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH,
  REPLICA_LIFECYCLE_OWNER_INCARNATION_REQUIRED,
  ReplicaHandlerSetup,
  ReplicaLifecycleOwner,
} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {
  MessageGroupServiceHandlerSetup,
} from '../../src/bootstrap/shared/message-group-service-handler-setup.js';
import {
  RuntimeServiceHandlerSetup,
} from '../../src/bootstrap/shared/runtime-service-handler-setup.js';
import {ControlPlaneSetup} from '../../src/bootstrap/shared/control-plane-setup.js';
import {ServiceEndpointsOwner} from
  '../../src/control-plane/owners/service-endpoints-owner.js';
import {resolveFailedJoinReattempt} from
  '../../src/entrypoint-runtime-join-startup-policy.js';
import {reserveBootIncarnation} from
  '../../src/bootstrap/boot-incarnation-owner.js';
import {BOOT_INCARNATION_REQUIRED} from
  '../../src/bootstrap/boot-incarnation-contract.js';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';

const NODE_ID = 'joining-node-replica-owner-resume-1';
const NODE_ADDRESS = 'ws://localhost:9297';
const SEED_ADDRESS = 'http://localhost:8080';
const BOOT_INCARNATION = 7;
// A transient transport loss while the control plane subscribes to CDC: the
// wrapped message keeps the 'Connection to node' fragment, so the production
// classifier resumes the join (isRetryableControlPlaneError).
const RETRYABLE_SUBSCRIBE_ERROR = 'Connection to node seed-node-1 closed';
const TERMINAL_SUBSCRIBE_ERROR =
  'join plan validation rejected the node identity';

function trackReplicaLifecycleOwners() {
  const owners = new Set();
  const originalStart = ReplicaStateMachine.prototype.startTimeoutChecker;
  ReplicaStateMachine.prototype.startTimeoutChecker = function(...args) {
    owners.add(this);
    return originalStart.apply(this, args);
  };
  return {
    owners,
    armed: () => [...owners].filter((owner) =>
      owner.timeoutCheckInterval !== null &&
      owner.timeoutCheckInterval !== undefined).length,
    restore() {
      ReplicaStateMachine.prototype.startTimeoutChecker = originalStart;
      for (const owner of owners) {
        owner.stopTimeoutChecker();
      }
    },
  };
}

function buildLeaderMessageGroup(onSubscribe) {
  return {
    groupId: 'mg-1',
    unifiedAddress: `${NODE_ID}/message-group/mg-1-r0`,
    isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r0',
    completeJoinConvergence() {},
    subscribeToCDC: async (tableName) => onSubscribe(tableName),
    async stop() {},
    async shutdown() {},
  };
}

function buildRouter() {
  const handlers = new Map();
  return {
    handlers,
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    deliver: async () => ({acknowledged: true}),
    setExternalAdmissionEnabled() {},
    async stop() {},
    async shutdown() {},
  };
}

test('F3: a preserved join resume keeps exactly one replica lifecycle owner ' +
  'for the live node incarnation', async (t) => {
  initializeTestEnvironment();
  const nodeTimeSource = new VirtualTimeSource({startMs: 1000});
  NodeService.instance = new NodeService({timeSource: nodeTimeSource});
  const tracker = trackReplicaLifecycleOwners();
  t.teardown(() => {
    tracker.restore();
    NodeService.resetInstance();
  });

  const service = new NodeJoiningService({
    bootIncarnation: BOOT_INCARNATION,
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    seedNodeAddress: SEED_ADDRESS,
    joinSessionId: 'session-replica-owner-resume-1',
    joinSessionStore: new JoinSessionStore({
      storage: new Map(),
      now: () => nodeTimeSource.now(),
    }),
    sleep: async () => {},
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: 3,
      retryableFailureResumeBaseDelayMs: 1,
      retryableFailureResumeMaxDelayMs: 1,
    },
  });

  const infrastructureEntries = [];
  const resumeDecisions = [];
  const originalHandleJoiningFailure =
    service.handleJoiningFailure.bind(service);
  service.handleJoiningFailure = async (error, options = {}) => {
    resumeDecisions.push(options.preserveForResume === true);
    return originalHandleJoiningFailure(error, options);
  };
  const onSubscribe = async () => {
    infrastructureEntries.push({
      bootIncarnation: service.bootIncarnation,
      replicaHandler: service.replicaHandler,
      replicaStateMachine: service.replicaStateMachine,
      owners: tracker.owners.size,
      armed: tracker.armed(),
      nodeTimers: nodeTimeSource.pendingTimerCount(),
    });
    if (infrastructureEntries.length === 1) {
      throw new Error(RETRYABLE_SUBSCRIBE_ERROR);
    }
    throw new Error(TERMINAL_SUBSCRIBE_ERROR);
  };

  service.phaseContactSeed = async () => {
    service.bootstrapResponse = {
      success: true,
      seedNodeId: 'seed-node-1',
      seedNodeWsAddress: 'ws://localhost:8080',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-1',
        replicaCount: 1,
      },
    };
    service.seedNodeId = 'seed-node-1';
    service.seedNodeWsAddress = 'ws://localhost:8080';
  };
  service.phaseConnectWebSocket = async () => {
    if (!service.messageRouter) {
      service.messageRouter = buildRouter();
    }
  };
  service.phaseCreateSelfHostedMessageGroup = async () => {
    if (!service.messageGroupServices.has('mg-1-r0')) {
      service.messageGroupServices.set('mg-1-r0',
        buildLeaderMessageGroup(onSubscribe));
    }
  };
  service.phaseJoinExistingMessageGroup = async () => {};
  service.phaseWaitForLeadership = async () => {};
  service.createCdcIntegrationService = () => {
    if (!service.cdcIntegrationService) {
      const cdc = new EventEmitter();
      cdc.updateSystemTableRow = async () => ({success: true});
      service.cdcIntegrationService = cdc;
    }
    return service.cdcIntegrationService;
  };
  service.ensureLatencyTopologyOwners = () => {};

  const result = await service.join();

  t.equal(result.success, false, 'the second pass ends the join terminally');
  t.same(resumeDecisions, [true, false],
    'the join loop itself resumed the retryable failure, then stopped');
  t.equal(infrastructureEntries.length, 2,
    'the resume re-entered the infrastructure segment');
  const [first, second] = infrastructureEntries;

  t.equal(second.bootIncarnation, first.bootIncarnation,
    'A1: the resume stays in the same node incarnation');
  t.ok(first.replicaStateMachine instanceof ReplicaStateMachine,
    'sanity: the first pass created the replica lifecycle owner R1');
  t.equal(first.armed, 1,
    'sanity: R1 armed its timeout checker before the retryable failure');
  t.ok(second.replicaHandler === first.replicaHandler,
    'A2: the resumed pass keeps the same ReplicaHandler');
  t.ok(second.replicaStateMachine === first.replicaStateMachine,
    'A3: the resumed pass keeps the same ReplicaStateMachine (R1)');
  t.equal(second.armed, 1,
    'A4: exactly one armed timeout checker after the resume');
  t.equal(tracker.owners.size, 1,
    'A5: exactly one replica lifecycle owner was ever created for this ' +
    'incarnation');
  t.equal(first.replicaStateMachine?.timeSource,
    NodeService.getInstance().getTimeSource(),
    'A6: the lifecycle owner runs on the node\'s canonical time source');
  t.equal(tracker.armed(), 0,
    'A7: terminal cleanup leaves no orphaned timeout checker');
  t.ok(first.replicaStateMachine?.timeoutCheckInterval === null,
    'A8: R1 itself is stopped by the terminal cleanup (not abandoned)');
  t.same([first.nodeTimers, second.nodeTimers, nodeTimeSource.pendingTimerCount()],
    [1, 1, 0],
    '(a) the node time source holds exactly one armed timer across the ' +
    'resume, and none after terminal cleanup');
});

// ---------------------------------------------------------------------------
// Window positions, sibling handlers, outer reattempt and seed parity.
// ---------------------------------------------------------------------------

const FAULT = Object.freeze({
  MESSAGE_GROUP_HANDLER: 'initializeMessageGroupServiceHandler (:175)',
  CONTROL_PLANE: 'initializeControlPlaneService (:176)',
  RUNTIME_HANDLER: 'initializeRuntimeServiceHandler (:177)',
  EXTERNAL_ADMISSION: 'openExternalTransportAdmission (:178)',
  LOCAL_ADMIN_READY: 'notifyLocalAdminRuntimeReady (:142)',
});
// Carries the outer-reattempt marker but no in-process resume fragment, so
// the join loop ends terminally with a retryable result (the production
// shape resolveFailedJoinReattempt consumes).
const OUTER_REATTEMPT_ERROR = 'join admission deferred to the next lifecycle';

function retryableTransportError() {
  return new Error(RETRYABLE_SUBSCRIBE_ERROR);
}

function outerReattemptError() {
  const error = new Error(OUTER_REATTEMPT_ERROR);
  error.retryable = true;
  return error;
}

function countTimersArmedDuring(fn) {
  const originals = {
    setInterval: globalThis.setInterval,
    setTimeout: globalThis.setTimeout,
  };
  let armed = 0;
  globalThis.setInterval = (...args) => {
    armed += 1;
    return originals.setInterval(...args);
  };
  globalThis.setTimeout = (...args) => {
    armed += 1;
    return originals.setTimeout(...args);
  };
  try {
    return {result: fn(), armed: () => armed};
  } finally {
    globalThis.setInterval = originals.setInterval;
    globalThis.setTimeout = originals.setTimeout;
  }
}

/**
 * Record every sibling handler a setup creates, the router addresses it
 * (re)binds and the host timers armed while creating it.
 */
function trackSiblingSetup(setupClass, resultKey, restorers) {
  const created = [];
  const original = setupClass.create;
  setupClass.create = function(options) {
    const before = new Map(options.messageRouter.handlers);
    const {result, armed} = countTimersArmedDuring(
      () => original.call(this, options));
    const addresses = [...options.messageRouter.handlers.keys()].filter(
      (address) => before.get(address) !==
        options.messageRouter.handlers.get(address));
    created.push({handler: result[resultKey], addresses, timers: armed()});
    return result;
  };
  restorers.push(() => {
    setupClass.create = original;
  });
  return created;
}

function stubControlPlaneSetup(restorers) {
  const original = ControlPlaneSetup.create;
  ControlPlaneSetup.create = async () => ({
    heartbeatService: {setNodeStateReporter() {}, start() {}, stop() {}},
    serviceLifecycleCommandOwner: null,
    // Endpoint writes never run here; the runtime handler only needs the
    // canonical owner type to wire its publication.
    systemMetadataOwners: {
      serviceEndpointsOwner: Object.create(ServiceEndpointsOwner.prototype),
    },
    leaseService: null,
    endpointService: null,
    dispatchService: null,
    rebalanceCoordinator: null,
  });
  restorers.push(() => {
    ControlPlaneSetup.create = original;
  });
}

function installNodeRuntime(t) {
  initializeTestEnvironment();
  const nodeTimeSource = new VirtualTimeSource({startMs: 1000});
  NodeService.instance = new NodeService({timeSource: nodeTimeSource});
  const tracker = trackReplicaLifecycleOwners();
  const restorers = [];
  stubControlPlaneSetup(restorers);
  const siblings = {
    messageGroup: trackSiblingSetup(MessageGroupServiceHandlerSetup,
      'messageGroupServiceHandler', restorers),
    runtime: trackSiblingSetup(RuntimeServiceHandlerSetup,
      'runtimeServiceHandler', restorers),
  };
  t.teardown(() => {
    for (const restore of restorers.reverse()) {
      restore();
    }
    tracker.restore();
    NodeService.resetInstance();
  });
  return {nodeTimeSource, tracker, siblings, restorers};
}

function snapshotOwner(service, runtime) {
  return {
    bootIncarnation: service.bootIncarnation,
    replicaHandler: service.replicaHandler,
    replicaStateMachine: service.replicaStateMachine,
    owners: runtime.tracker.owners.size,
    armed: runtime.tracker.armed(),
    nodeTimers: runtime.nodeTimeSource.pendingTimerCount(),
  };
}

/**
 * A joiner whose seed, transport and message-group phases are stubbed, and
 * whose infrastructure segment runs for real. `fault` throws a retryable
 * transport error ONCE at the named step of that segment (pass 1); the
 * resumed pass completes the segment and the membership segment then ends
 * the join terminally with a retryable result (pass 2 observed there).
 */
function buildJoiner(runtime, {bootIncarnation, fault, onMembership}) {
  const faultOnce = (name) => {
    if (fault === name && !runtime.faulted) {
      runtime.faulted = true;
      runtime.faultSnapshot = snapshotOwner(runtime.joiner, runtime);
      throw retryableTransportError();
    }
  };
  const service = new NodeJoiningService({
    bootIncarnation,
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    seedNodeAddress: SEED_ADDRESS,
    joinSessionId: `session-replica-owner-${bootIncarnation}`,
    joinSessionStore: new JoinSessionStore({
      storage: new Map(),
      now: () => runtime.nodeTimeSource.now(),
    }),
    onLocalAdminRuntimeReady: async () =>
      faultOnce(FAULT.LOCAL_ADMIN_READY),
    sleep: async () => {},
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: 3,
      retryableFailureResumeBaseDelayMs: 1,
      retryableFailureResumeMaxDelayMs: 1,
    },
  });
  runtime.joiner = service;
  runtime.faulted = false;
  runtime.resumeDecisions = [];
  const originalHandleJoiningFailure =
    service.handleJoiningFailure.bind(service);
  service.handleJoiningFailure = async (error, options = {}) => {
    runtime.resumeDecisions.push(options.preserveForResume === true);
    return originalHandleJoiningFailure(error, options);
  };
  const router = buildRouter();
  const setExternalAdmissionEnabled = router.setExternalAdmissionEnabled;
  router.setExternalAdmissionEnabled = (enabled) => {
    faultOnce(FAULT.EXTERNAL_ADMISSION);
    return setExternalAdmissionEnabled.call(router, enabled);
  };
  service.phaseContactSeed = async () => {
    service.bootstrapResponse = {
      success: true,
      seedNodeId: 'seed-node-1',
      seedNodeWsAddress: 'ws://localhost:8080',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-1',
        replicaCount: 1,
      },
    };
    service.seedNodeId = 'seed-node-1';
    service.seedNodeWsAddress = 'ws://localhost:8080';
  };
  service.phaseConnectWebSocket = async () => {
    service.messageRouter = service.messageRouter || router;
  };
  service.phaseCreateSelfHostedMessageGroup = async () => {
    if (!service.messageGroupServices.has('mg-1-r0')) {
      service.messageGroupServices.set('mg-1-r0',
        buildLeaderMessageGroup(async () =>
          faultOnce(FAULT.CONTROL_PLANE)));
    }
  };
  service.phaseJoinExistingMessageGroup = async () => {};
  service.phaseWaitForLeadership = async () => {};
  service.createCdcIntegrationService = () => {
    if (!service.cdcIntegrationService) {
      const cdc = new EventEmitter();
      cdc.updateSystemTableRow = async () => ({success: true});
      service.cdcIntegrationService = cdc;
    }
    return service.cdcIntegrationService;
  };
  service.ensureLatencyTopologyOwners = () => {};
  service.serviceLifecycleManager = {};
  service.attachRuntimeServiceRebalancerOwner = () =>
    faultOnce(FAULT.RUNTIME_HANDLER);
  const originalMessageGroupHandler =
    service.initializeMessageGroupServiceHandler.bind(service);
  service.initializeMessageGroupServiceHandler = () => {
    faultOnce(FAULT.MESSAGE_GROUP_HANDLER);
    return originalMessageGroupHandler();
  };
  service.phaseQuerySystemState = async () => {
    await onMembership(service);
    throw outerReattemptError();
  };
  return service;
}

async function assertSingleOwnerAcrossResume(t, fault) {
  const runtime = installNodeRuntime(t);
  let resumed = null;
  const service = buildJoiner(runtime, {
    bootIncarnation: BOOT_INCARNATION,
    fault,
    onMembership: async (joiner) => {
      resumed = snapshotOwner(joiner, runtime);
      resumed.infrastructureReady = joiner.hasJoinInfrastructureReady();
    },
  });
  const result = await service.join();
  const first = runtime.faultSnapshot;
  t.equal(result.retryable, true, 'the join ends with a retryable result');
  t.same(runtime.resumeDecisions, [true, false],
    'the join loop resumed the injected failure, then ended terminally');
  t.ok(first && first.replicaStateMachine instanceof ReplicaStateMachine,
    `pass 1 acquired R1 before the ${fault} failure`);
  t.ok(resumed !== null, 'the resumed pass completed the infrastructure');
  t.ok(resumed.replicaStateMachine === first.replicaStateMachine,
    '(b) the resumed pass reacquired R1');
  t.ok(resumed.replicaHandler === first.replicaHandler,
    '(b) the resumed pass reacquired the same ReplicaHandler');
  t.same([resumed.owners, resumed.armed, resumed.nodeTimers], [1, 1, 1],
    '(b) one lifecycle owner, one armed checker, one node-clock timer');
  t.equal(resumed.infrastructureReady, true,
    'readiness is answered by the reacquired owner of this incarnation');
  t.same([runtime.tracker.armed(),
    runtime.nodeTimeSource.pendingTimerCount()], [0, 0],
  'terminal cleanup released the one owner: no orphaned timer');
  return runtime;
}

for (const fault of Object.values(FAULT)) {
  test(`F3 window: a retryable failure at ${fault} resumes onto the same ` +
    'replica lifecycle owner', async (t) => {
    await assertSingleOwnerAcrossResume(t, fault);
  });
}

async function deliverThroughRouter(router, address) {
  await router.handlers.get(address)({payload: {}, correlationId: null});
}

function spyHandleMessage(handler) {
  const calls = [];
  handler.handleMessage = async (envelope) => {
    calls.push(envelope);
    return {success: true};
  };
  return calls;
}

async function assertSiblingReplacedNotDuplicated(t, created, router, label) {
  t.equal(created.length, 2, `${label}: the rerun re-created the handler`);
  const [prior, current] = created;
  t.same(current.addresses, prior.addresses,
    `${label}: the rerun rebinds the same router address`);
  t.same([prior.timers, current.timers], [0, 0],
    `${label}: creating the handler arms no timer authority`);
  const priorCalls = spyHandleMessage(prior.handler);
  const currentCalls = spyHandleMessage(current.handler);
  for (const address of current.addresses) {
    await deliverThroughRouter(router, address);
  }
  t.same([priorCalls.length, currentCalls.length],
    [0, current.addresses.length],
    `${label}: the prior handler is unreachable; only the current one serves`);
}

test('F3 siblings: a rerun replaces the message-group and runtime-service ' +
  'handlers without leaving a second live authority', async (t) => {
  const runtime = await assertSingleOwnerAcrossResume(
    t, FAULT.LOCAL_ADMIN_READY);
  const router = [...runtime.siblings.messageGroup][0].handler.messageRouter ||
    runtime.router;
  t.ok(router, 'sanity: the sibling handlers were registered on the router');
  await assertSiblingReplacedNotDuplicated(t,
    runtime.siblings.messageGroup, router, 'message-group handler');
  await assertSiblingReplacedNotDuplicated(t,
    runtime.siblings.runtime, router, 'runtime-service handler');
});

test('F3 outer reattempt: incarnation G+1 mints exactly one new owner, R1 ' +
  'is stopped, never reused and refused for G+1', async (t) => {
  const runtime = installNodeRuntime(t);
  // Each boot lifecycle reserves its incarnation through the one reservation
  // authority over the node's data directory, as lagrange-runtime-startup
  // does per startJoinNode attempt.
  const dataDir = await mkdtemp(join(tmpdir(), 'f3-boot-incarnation-'));
  t.teardown(() => rm(dataDir, {recursive: true, force: true}));
  const incarnationG = await reserveBootIncarnation(dataDir);
  let r1 = null;
  const serviceG = buildJoiner(runtime, {
    bootIncarnation: incarnationG,
    fault: FAULT.CONTROL_PLANE,
    onMembership: async (joiner) => {
      r1 = joiner.replicaStateMachine;
    },
  });
  const joinResult = await serviceG.join();
  const noop = () => {};
  const retry = await resolveFailedJoinReattempt({
    bootstrapAPI: {shutdown: async () => {}},
    dataDir,
    joinAttempt: 0,
    joinResult,
    logger: {error: noop, warn: noop, info: noop, debug: noop},
    nodeId: NODE_ID,
    nodeJoiningService: serviceG,
    reattemptPolicy: {
      maxAttempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
      backoffCapExponent: 0,
    },
  });
  t.equal(retry.joinAttempt, 1, 'the real outer reattempt path admits G+1');
  const incarnationG1 = await reserveBootIncarnation(dataDir);
  t.ok(incarnationG1 > incarnationG,
    'the next lifecycle reserves a strictly newer incarnation G+1');
  t.ok(r1 instanceof ReplicaStateMachine, 'sanity: incarnation G owned R1');
  t.equal(r1.ownerIncarnation, incarnationG, 'R1 is stamped with G');
  t.equal(r1.isTimeoutCheckerArmed(), false,
    '(c) R1 is stopped before G+1 begins');

  const r1Ticks = [];
  r1._checkTimeouts = () => r1Ticks.push(runtime.nodeTimeSource.now());
  let observed = null;
  const serviceG1 = buildJoiner(runtime, {
    bootIncarnation: incarnationG1,
    fault: null,
    onMembership: async (joiner) => {
      const r2 = joiner.replicaStateMachine;
      const r2Ticks = [];
      const checkTimeouts = r2._checkTimeouts.bind(r2);
      r2._checkTimeouts = () => {
        r2Ticks.push(runtime.nodeTimeSource.now());
        return checkTimeouts();
      };
      runtime.nodeTimeSource.advance(r2.timeoutCheckIntervalMs * 3);
      observed = {
        r2,
        r2Ticks: r2Ticks.length,
        owners: runtime.tracker.owners.size,
        armed: runtime.tracker.armed(),
        nodeTimers: runtime.nodeTimeSource.pendingTimerCount(),
      };
    },
  });
  await serviceG1.join();
  t.ok(serviceG1 !== serviceG, 'G+1 is a fresh NodeJoiningService');
  t.ok(observed.r2 instanceof ReplicaStateMachine &&
    observed.r2 !== r1, '(c) G+1 minted its own owner R2, not R1');
  t.equal(observed.r2.ownerIncarnation, incarnationG1,
    '(c) R2 is stamped with G+1');
  t.same([observed.owners, observed.armed, observed.nodeTimers], [2, 1, 1],
    '(c) exactly one new owner: R1 (stopped) + R2 (the only armed timer)');
  t.ok(observed.r2Ticks >= 1, '(d) the node clock drives R2');
  t.equal(r1Ticks.length, 0,
    '(d) advancing the node clock after G+1 fires no R1 tick');

  const handOver = () => ReplicaHandlerSetup.create({
    nodeId: NODE_ID,
    messageRouter: buildRouter(),
    cdcIntegrationService: new EventEmitter(),
    systemTableCache: NodeService.getInstance().getSystemTableCache(),
    createPartitionService: async () => null,
    replicaStateMachine: r1,
    ownerIncarnation: incarnationG1,
  });
  t.throws(handOver, {code: REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH},
    '(c) handing R1 to a G+1 acquisition is refused');
  const owner = new ReplicaLifecycleOwner();
  const rG = owner.acquireStateMachine({
    nodeId: NODE_ID,
    cdcIntegrationService: new EventEmitter(),
    systemTableCache: NodeService.getInstance().getSystemTableCache(),
    timeSource: runtime.nodeTimeSource,
    ownerIncarnation: incarnationG,
  });
  t.throws(() => owner.acquireStateMachine({
    nodeId: NODE_ID,
    cdcIntegrationService: new EventEmitter(),
    systemTableCache: NodeService.getInstance().getSystemTableCache(),
    timeSource: runtime.nodeTimeSource,
    ownerIncarnation: incarnationG1,
  }), {code: REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH},
  '(c) a recorded owner of G is refused for G+1, never re-minted silently');
  owner.release();
  t.equal(rG.isTimeoutCheckerArmed(), false, 'release stops the owner timer');
});

test('F3 seed parity: rerunning the seed replica handler with absent field ' +
  'projections reacquires the one owner on the node time source',
async (t) => {
  const runtime = installNodeRuntime(t);
  const nodeService = NodeService.getInstance();
  const service = new BootstrapService({
    bootIncarnation: BOOT_INCARNATION,
    nodeId: 'seed-node',
    nodeAddress: 'ws://localhost:9001',
    nodeService,
  });
  const cdc = new EventEmitter();
  cdc.updateSystemTableRow = async () => ({success: true});
  service.cdcIntegrationService = cdc;
  service.systemTableCache = nodeService.getSystemTableCache();
  service.messageRouter = buildRouter();
  service.messageGroupServices.set('mg-1-r0',
    buildLeaderMessageGroup(async () => {}));

  service.initializeReplicaHandler();
  const first = snapshotOwner(service, runtime);
  service.replicaHandler = null;
  service.replicaStateMachine = null;
  service.initializeReplicaHandler();
  const second = snapshotOwner(service, runtime);

  t.ok(first.replicaStateMachine instanceof ReplicaStateMachine,
    'sanity: the seed acquired its owner');
  t.ok(second.replicaStateMachine === first.replicaStateMachine &&
    second.replicaHandler === first.replicaHandler,
  '(e) the rerun reacquired the same owner, not a re-mint');
  t.same([second.owners, second.armed, second.nodeTimers], [1, 1, 1],
    '(e) exactly one RSM and one timer on the node clock');
  t.equal(second.replicaStateMachine.timeSource, nodeService.getTimeSource(),
    '(e) the seed owner runs on the node\'s canonical time source');
  t.equal(second.replicaStateMachine.ownerIncarnation, BOOT_INCARNATION,
    '(e) the seed owner is stamped with the seed boot incarnation');
});

// ---------------------------------------------------------------------------
// Absence is invalid: the acquisition owner and the public lifecycle
// boundaries refuse a missing or unissued incarnation before any side effect.
// ---------------------------------------------------------------------------

const UNISSUED_INCARNATIONS = Object.freeze([undefined, null, 0, -1, 1.5, '1']);

function acquisitionOptions(runtime, ownerIncarnation) {
  return {
    nodeId: NODE_ID,
    messageRouter: buildRouter(),
    cdcIntegrationService: new EventEmitter(),
    systemTableCache: NodeService.getInstance().getSystemTableCache(),
    createPartitionService: async () => null,
    timeSource: runtime.nodeTimeSource,
    ownerIncarnation,
  };
}

function countMints(restorers) {
  const mints = {stateMachines: 0, handlers: 0};
  const createStateMachine = ReplicaHandlerSetup.createReplicaStateMachine;
  const create = ReplicaHandlerSetup.create;
  ReplicaHandlerSetup.createReplicaStateMachine = function(...args) {
    mints.stateMachines += 1;
    return createStateMachine.apply(this, args);
  };
  ReplicaHandlerSetup.create = function(...args) {
    mints.handlers += 1;
    return create.apply(this, args);
  };
  restorers.push(() => {
    ReplicaHandlerSetup.createReplicaStateMachine = createStateMachine;
    ReplicaHandlerSetup.create = create;
  });
  return mints;
}

test('F3 missing incarnation: the acquisition owner refuses it with a typed ' +
  'error and mints no state machine, timer or handler', async (t) => {
  const runtime = installNodeRuntime(t);
  const mints = countMints(runtime.restorers);
  const owner = new ReplicaLifecycleOwner();
  for (const ownerIncarnation of UNISSUED_INCARNATIONS) {
    const label = `incarnation ${String(ownerIncarnation)}`;
    const options = acquisitionOptions(runtime, ownerIncarnation);
    for (const [verb, call] of [
      ['acquire', () => owner.acquire(options)],
      ['acquireStateMachine', () => owner.acquireStateMachine(options)],
      ['reacquire', () => owner.reacquire(ownerIncarnation)],
      ['isEstablished', () => owner.isEstablished(ownerIncarnation)],
    ]) {
      t.throws(call, {code: REPLICA_LIFECYCLE_OWNER_INCARNATION_REQUIRED},
        `${verb} refuses ${label}`);
    }
  }
  t.same(mints, {stateMachines: 0, handlers: 0},
    'no state machine and no handler was minted for a missing incarnation');
  t.same([runtime.tracker.owners.size, runtime.tracker.armed(),
    runtime.nodeTimeSource.pendingTimerCount()], [0, 0, 0],
  'no timeout checker was armed');
  t.equal(owner.record, null,
    'two missing callers never share a record: nothing was recorded');

  const recorded = owner.acquireStateMachine(
    acquisitionOptions(runtime, BOOT_INCARNATION));
  t.throws(() => ReplicaHandlerSetup.create({
    ...acquisitionOptions(runtime, undefined),
    replicaStateMachine: recorded,
  }), {code: REPLICA_LIFECYCLE_OWNER_INCARNATION_REQUIRED},
  'handing an owner to an acquisition without an incarnation is refused');
  t.throws(() => owner.acquire(acquisitionOptions(runtime, undefined)),
    {code: REPLICA_LIFECYCLE_OWNER_INCARNATION_REQUIRED},
    'a recorded owner is never reacquired by a caller without an incarnation');
  owner.release();
});

test('F3 public boundary: BootstrapService and NodeJoiningService require an ' +
  'issued boot incarnation and fail closed before any side effect',
async (t) => {
  const runtime = installNodeRuntime(t);
  const nodeService = NodeService.getInstance();
  for (const bootIncarnation of UNISSUED_INCARNATIONS) {
    const label = `incarnation ${String(bootIncarnation)}`;
    t.throws(() => new BootstrapService({
      nodeId: 'seed-node', nodeAddress: 'ws://localhost:9001',
      nodeService, bootIncarnation,
    }), {code: BOOT_INCARNATION_REQUIRED}, `BootstrapService refuses ${label}`);
    t.throws(() => new NodeJoiningService({
      nodeId: NODE_ID, nodeAddress: NODE_ADDRESS,
      seedNodeAddress: SEED_ADDRESS, bootIncarnation,
    }), {code: BOOT_INCARNATION_REQUIRED},
    `NodeJoiningService refuses ${label}`);
  }
  await t.rejects(BootstrapService.bootstrapOrExit({
    nodeId: 'seed-node', nodeAddress: 'ws://localhost:9001', nodeService,
  }), {code: BOOT_INCARNATION_REQUIRED},
  'the static seed entry point refuses a missing incarnation');
  t.same([runtime.tracker.owners.size,
    runtime.nodeTimeSource.pendingTimerCount(),
    nodeService.getLifecycleStateMachine?.() ?? null],
  [0, 0, null],
  'no lifecycle owner, timer or node lifecycle state machine was created');
});
