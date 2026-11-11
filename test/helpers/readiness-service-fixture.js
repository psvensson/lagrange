// One construction of the control-plane readiness service for tests.
//
// Every owner that reads readiness (RebalanceCoordinator, UnifiedRebalancer,
// ReplicaDispatchService, StorageAdmissionService) takes the node's one
// readiness service as a named collaborator; none builds a private one. A
// test that needs a real service builds it here, and a test that hands an
// owner a hand-written fake builds the fake here, so the one planning answer
// is always a method of what the owner receives.
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  createControlPlaneRuntimeBundle,
} from '../../src/control-plane/control-plane-runtime-bundle.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';

const READINESS_FIXTURE_NODE_ID = 'readiness-fixture-node';
const NODE_ID_COLUMN = 'node_id';
const objectHasOwn = Object.hasOwn;

// The one version of every hand-written readiness collaborator fake. The
// readiness service validates each late-bound collaborator's interface when
// it is wired; a test fake that states only the members its test exercises
// is completed here with the answer the service gave when that member was
// absent before the validation: no rows, no publication row, no candidate,
// no diagnostics, no transport evidence, no subscription. The completion is
// a derived object for the readiness service only: the fake itself (which
// the owner under test may share, and probe) is never changed, its own
// members stay bound to it, and its state reads through.
function hasMethod(target, member) {
  return typeof target[member] === 'function';
}

function findNodeRow(cache, tableName, nodeId) {
  return (cache.getAll(tableName) || [])
    .find((row) => row?.[NODE_ID_COLUMN] === nodeId) || null;
}

const noop = () => {};
const answerNull = () => null;
const answerNullAsync = async () => null;

const NEUTRAL_COLLABORATOR_MEMBERS = Object.freeze({
  systemTableCache: (fake) => ({
    getAll: () => [],
    get: (tableName, key) => findNodeRow(fake, tableName, key),
    getShared: (tableName, key) => fake.get(tableName, key),
    filter: (tableName, predicate) =>
      (fake.getAll(tableName) || []).filter(predicate),
    getTableMutationVersion: answerNull,
    onCacheChange: noop,
    offCacheChange: noop,
  }),
  membershipPublicationService: (fake, nodeId) => ({
    getLatestPublicationForNode: hasMethod(fake, 'getLatestClusterPublication') ?
      (_nodeId, options) => fake.getLatestClusterPublication(options) :
      answerNullAsync,
    getLatestClusterPublication: hasMethod(fake, 'getLatestPublicationForNode') ?
      (options) => fake.getLatestPublicationForNode(nodeId, options) :
      answerNullAsync,
    getLatestPublicationForNodeSync:
      hasMethod(fake, 'getLatestClusterPublicationSync') ?
        (_nodeId, options) => fake.getLatestClusterPublicationSync(options) :
        answerNull,
    getLatestClusterPublicationSync:
      hasMethod(fake, 'getLatestPublicationForNodeSync') ?
        (options) => fake.getLatestPublicationForNodeSync(nodeId, options) :
        answerNull,
    getLatestPublishedClusterPublication: answerNullAsync,
    getLatestPublishedClusterPublicationSync: answerNull,
    getLatestMembershipPublicationEpochStatusForNodeSync: answerNull,
    deriveClusterMembershipCandidate: answerNullAsync,
    deriveClusterMembershipCandidateSync: answerNull,
  }),
  messageRouter: () => ({
    on: noop,
    off: noop,
    getConnectedNodes: () => [],
    getConnectionState: answerNull,
    hasScheduledReconnect: () => false,
    getQueryDataPlaneTransportReadiness: answerNull,
    getLocalBootIncarnationIdentity: answerNull,
    getCurrentPrimaryConnectionBootIncarnation: answerNull,
  }),
  heartbeatService: () => ({
    getHeartbeatPublicationDiagnostics: answerNull,
  }),
  storageAccountingService: () => ({
    getCapacitySnapshotForNode: answerNullAsync,
    getCapacitySnapshotForNodeSync: answerNull,
  }),
  authoritativeControlPlaneView: () => ({
    syncOwnerDependencies: noop,
    // The serve-eligibility read answered this when the view lacked it.
    readReadinessOwnerRows: async () => ({
      success: false,
      error: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
        .AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
      rows: [],
    }),
  }),
  authoritativeNodeEvidenceReconciler: () => ({syncOwnerDependencies: noop}),
});

/**
 * Complete one hand-written readiness collaborator fake with the neutral
 * answers above, for every member the fake does not state.
 * @param {string} collaborator - The collaborator's option name.
 * @param {Object|null|undefined} fake - The fake (absent stays absent).
 * @param {string} [nodeId] - The service's node id: a cluster read of a fake
 *   that states only the per-node read answers that read for this node, as
 *   the service's cluster-scope fallback did for its own reads.
 * @return {Object|null|undefined} The fake itself when complete, else the
 *   completed object derived from it (the fake is not changed).
 */
function functionMemberNames(target) {
  const names = new Set();
  for (let level = target; level && level !== Object.prototype;
    level = Object.getPrototypeOf(level)) {
    for (const name of Object.getOwnPropertyNames(level)) {
      if (name !== 'constructor' && typeof target[name] === 'function') {
        names.add(name);
      }
    }
  }
  return names;
}

function readinessCollaboratorFake(collaborator, fake, nodeId = undefined) {
  const neutral = NEUTRAL_COLLABORATOR_MEMBERS[collaborator];
  if (!neutral || !fake || typeof fake !== 'object') {
    return fake;
  }
  const completed = Object.create(fake);
  const answers = Object.entries(neutral(completed, nodeId))
    .filter(([member]) => !hasMethod(fake, member));
  const routerNeedsConnections = collaborator === 'messageRouter' &&
    typeof fake.nodeConnections?.get !== 'function';
  if (answers.length === 0 && !routerNeedsConnections) {
    return fake;
  }
  for (const name of functionMemberNames(fake)) {
    completed[name] = fake[name].bind(fake);
  }
  for (const [member, answer] of answers) {
    completed[member] = answer;
  }
  if (routerNeedsConnections) {
    completed.nodeConnections = new Map();
  }
  return completed;
}

/**
 * Complete every readiness collaborator fake one set of construction
 * options or one wiring names (see readinessCollaboratorFake).
 * @param {Object} options - Construction options or one wiring.
 * @return {Object} The same options, each collaborator completed.
 */
function readinessCollaboratorFakes(options) {
  for (const collaborator of Object.keys(NEUTRAL_COLLABORATOR_MEMBERS)) {
    if (objectHasOwn(options, collaborator)) {
      options[collaborator] =
        readinessCollaboratorFake(collaborator, options[collaborator],
          options.nodeId);
    }
  }
  return options;
}

/**
 * Build the real readiness service with its required collaborators.
 * @param {Object} [overrides] - Construction options replacing the defaults.
 * @return {ControlPlaneReadinessService} The constructed service.
 */
function createReadinessServiceForTest(overrides = {}) {
  // The default cache is built only when the test names none: a cache
  // constructor reads the clock, which a simulated host must not do.
  return new ControlPlaneReadinessService(readinessCollaboratorFakes({
    nodeId: READINESS_FIXTURE_NODE_ID,
    ...overrides,
    systemTableCache: objectHasOwn(overrides, 'systemTableCache') ?
      overrides.systemTableCache : new SystemTableCache(),
  }));
}

// Each owner's former private construction, reproduced from the owner's own
// options so a test that relied on it keeps the same service inputs: the
// gateway the owner derived (same factory, same inputs), the router, the
// accounting and propagation owners (the coordinator's when the owner took
// them from it), and the owner-specific extras.
function ownerGateway(owner, options, systemTableCache) {
  if (options.controlPlaneSystemTableGateway) {
    return options.controlPlaneSystemTableGateway;
  }
  if (owner === 'StorageAdmissionService') {
    return null;
  }
  const hasSource = Boolean(options.cdcIntegrationService ||
    options.sqlQueryEngine || options.systemTableCache || options.messageRouter);
  if (owner === 'ReplicaDispatchService' && !hasSource) {
    return null;
  }
  return createControlPlaneRuntimeBundle({
    nodeId: options.nodeId || null,
    cdcIntegrationService: options.cdcIntegrationService || null,
    sqlQueryEngine: options.sqlQueryEngine || null,
    systemTableCache: owner === 'ReplicaDispatchService' ?
      options.systemTableCache || null : systemTableCache,
    messageRouter: options.messageRouter || null,
  }).controlPlaneSystemTableGateway;
}

function ownerSpecificInputs(owner, options, systemTableCache) {
  const coordinator = options.rebalanceCoordinator || null;
  switch (owner) {
  case 'ReplicaDispatchService':
    return {
      nodesOwner: options.nodesOwner || null,
      servicesOwner: options.servicesOwner || null,
      storageAccountingService: options.storageAccountingService ||
          coordinator?.storageAccountingService || null,
      cdcGroupPropagationService: options.cdcGroupPropagationService ||
          coordinator?.cdcGroupPropagationService || null,
    };
  case 'StorageAdmissionService':
    return {
      cacheMutationTarget: options.cacheMutationTarget || systemTableCache,
      cdcIntegrationService: options.cdcIntegrationService || null,
      storageAccountingService: options.accountingService || null,
      cdcGroupPropagationService: options.cdcGroupPropagationService || null,
      nodeLifecycleStateMachine: options.nodeLifecycleStateMachine || null,
      ...(typeof options.now === 'function' ? {now: options.now} : {}),
    };
  default:
    return {
      cacheMutationTarget: systemTableCache,
      cdcIntegrationService: options.cdcIntegrationService || null,
      storageAccountingService: options.storageAccountingService ||
          (owner === 'UnifiedRebalancer' ?
            coordinator?.storageAccountingService : null) || null,
      cdcGroupPropagationService: options.cdcGroupPropagationService ||
          (owner === 'UnifiedRebalancer' ?
            coordinator?.cdcGroupPropagationService : null) || null,
    };
  }
}

/**
 * The node's readiness service for an owner under test, wired the way the
 * node composition wires it: the service the owner's coordinator holds when
 * the test hands it one, else the real service built from the owner's own
 * collaborators exactly as the owner's former private construction built it.
 * A service the test names explicitly is kept.
 * @param {string} owner - The owner class name.
 * @param {Object} ownerOptions - The construction options of the owner.
 * @return {Object} The readiness service.
 */
function nodeReadinessServiceFor(owner, ownerOptions = {}) {
  const ownerClock = ownerClockOrAmbient(ownerOptions.nowFn);
  if (ownerOptions.controlPlaneReadinessService) {
    return readinessServiceFake(ownerOptions.controlPlaneReadinessService,
      ownerClock);
  }
  const coordinatorService =
    ownerOptions.rebalanceCoordinator?.controlPlaneReadinessService;
  if (coordinatorService) {
    return readinessServiceFake(coordinatorService, ownerClock);
  }
  // The former construction accepted an absent cache; the service now
  // requires one, so an owner under test without a cache gets an empty one.
  const systemTableCache = ownerOptions.systemTableCache ||
    ownerOptions.accountingService?.systemTableCache ||
    new SystemTableCache();
  return new ControlPlaneReadinessService(readinessCollaboratorFakes({
    nodeId: ownerOptions.nodeId || READINESS_FIXTURE_NODE_ID,
    systemTableCache,
    messageRouter: ownerOptions.messageRouter || null,
    controlPlaneSystemTableGateway:
      ownerGateway(owner, ownerOptions, systemTableCache),
    ...ownerSpecificInputs(owner, ownerOptions, systemTableCache),
  }));
}

/**
 * Owner options carrying the node's readiness service as the named
 * collaborator (see nodeReadinessServiceFor).
 * @param {string} owner - The owner class name.
 * @param {Object} ownerOptions - The construction options of the owner.
 * @return {Object} The same options with `controlPlaneReadinessService`.
 */
function withNodeReadinessService(owner, ownerOptions = {}) {
  return {
    ...ownerOptions,
    controlPlaneReadinessService: nodeReadinessServiceFor(owner, ownerOptions),
  };
}

// The owner's clock when the test has one; otherwise the ambient clock, read
// at call time (never a `Date.now` captured at module load), exactly as an
// owner without an injected clock reads it, so a test that replaces the
// ambient clock sees every read of it.
function ownerClockOrAmbient(clock) {
  return typeof clock === 'function' ? clock : () => Date.now();
}

// The members an owner calls on the node's readiness service without a
// probe, and the answer each gave the owner when a hand-written fake lacked
// it: no planning answer, not ready now, no startup authority, no readiness
// (not process-alive), no committed node answer, and the owner's own clock.
function readinessConsumerMembers(clock) {
  return {
    getPriorityRecoveryPlanningAnswerSync: answerNull,
    projectNodeLiveness: answerNull,
    getStartupAuthoritySnapshotSync: answerNull,
    getNodeReadinessSync: answerNull,
    // No committed node answer: the rebalancer plans over no candidate rows.
    answerCommittedNodes: answerNull,
    // No committed serve cohort answer: the ordinary-work release fence
    // reads that as its named unavailable hold.
    answerServeCohort: answerNull,
    // The committed serve record: a refresh that settles with nothing, and a
    // subscription that never fires.
    readServeEligibility: answerNullAsync,
    subscribeServeEligibility: () => noop,
    now: ownerClockOrAmbient(clock),
  };
}

/**
 * Complete a hand-written readiness service fake in place with the consumer
 * members it does not state (a real service already has every one).
 * @param {Object} fake - The fake readiness service.
 * @param {Function} [clock] - The owner's clock, the answer of `now`; a
 *   test with a virtual clock passes it (absent: the ambient clock, read at
 *   call time).
 * @return {Object} The same fake.
 */
function readinessServiceFake(fake, clock) {
  // A frozen port is caller-owned and declared complete (PR #201 custody):
  // the fixture never adapts it, so a member it lacks stays missing.
  if (Object.isFrozen(fake)) {
    return fake;
  }
  for (const [member, answer] of Object.entries(
    readinessConsumerMembers(clock),
  )) {
    if (!hasMethod(fake, member)) {
      fake[member] = answer;
    }
  }
  return fake;
}

/**
 * A hand-written readiness fake: the given methods plus the consumer
 * members (see readinessServiceFake).
 * @param {Object} [methods] - The fake's methods.
 * @param {Function} [clock] - The owner's clock.
 * @return {Object} The fake readiness service.
 */
function partialReadinessFake(methods = {}, clock) {
  return readinessServiceFake({...methods}, clock);
}

export {
  READINESS_FIXTURE_NODE_ID,
  createReadinessServiceForTest,
  nodeReadinessServiceFor,
  partialReadinessFake,
  readinessCollaboratorFake,
  readinessCollaboratorFakes,
  readinessServiceFake,
  withNodeReadinessService,
};
