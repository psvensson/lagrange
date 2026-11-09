/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService construction and wiring own collaborator validation.
 * Inputs: the construction options, and each later syncOwnerDependencies wiring.
 * Canonical output: nothing, or a typed refusal naming the collaborator; a
 *   read of an unwired late-bound collaborator answers the named unwired state.
 * Prohibited fallbacks: no runtime substitute for a missing or malformed collaborator.
 * Primary tests: test/control-plane/control-plane-readiness-service-construction.test.js.
 */
import {
  CONTROL_PLANE_READINESS_COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED,
  CONTROL_PLANE_READINESS_ERROR_CODE,
} from './control-plane-readiness-constants.js';

const COLLABORATOR = CONTROL_PLANE_READINESS_COLLABORATOR;
const EXPECT_NODE_ID = 'a non-empty node id';
const EXPECT_SYSTEM_TABLE_CACHE = 'the node system-table cache';
const EXPECT_CLOCK = 'a clock function';
const EXPECT_TIME_SOURCE = 'a time source with now()';
const EXPECT_INCARNATION_FENCE = 'an incarnation fence function';
const EXPECT_TIMER = 'a timer function';
const ERROR_CODE = CONTROL_PLANE_READINESS_ERROR_CODE;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;

function refuseCollaborator(collaborator, code, expectation) {
  const error = new Error(
    `ControlPlaneReadinessService refused construction: ${collaborator} ` +
    `must be ${expectation}`,
  );
  error.code = code;
  error.collaborator = collaborator;
  throw error;
}

function isAbsent(value) {
  return value === undefined || value === null;
}

function requireCollaborator(options, collaborator, isValid, expectation) {
  const value = options[collaborator];
  if (isAbsent(value)) {
    refuseCollaborator(collaborator, ERROR_CODE.COLLABORATOR_MISSING, expectation);
  }
  if (!isValid(value)) {
    refuseCollaborator(collaborator, ERROR_CODE.COLLABORATOR_INVALID, expectation);
  }
}

function checkOptionalCollaborator(options, collaborator, isValid, expectation) {
  const value = options[collaborator];
  if (!isAbsent(value) && !isValid(value)) {
    refuseCollaborator(collaborator, ERROR_CODE.COLLABORATOR_INVALID, expectation);
  }
}

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.length > 0;
const isObject = (value) => typeof value === 'object';
const isFunction = (value) => typeof value === 'function';
const isClock = (value) => isObject(value) && isFunction(value.now);

/**
 * Validate the readiness service's named collaborators, once, at
 * construction. The node identity and the system-table cache are required;
 * the clock, the timers and the incarnation fence are optional, and when
 * given must have their interface (an absent clock is the platform clock, the DT4 default).
 * @param {Object} options - Readiness service construction options.
 * @return {void}
 */
function assertReadinessServiceCollaborators(options) {
  const given = options || {};
  requireCollaborator(given, COLLABORATOR.NODE_ID, isNonEmptyString,
    EXPECT_NODE_ID);
  requireCollaborator(given, COLLABORATOR.SYSTEM_TABLE_CACHE, isObject,
    EXPECT_SYSTEM_TABLE_CACHE);
  checkOptionalCollaborator(given, COLLABORATOR.CLOCK, isFunction,
    EXPECT_CLOCK);
  checkOptionalCollaborator(given, COLLABORATOR.TIME_SOURCE, isClock,
    EXPECT_TIME_SOURCE);
  checkOptionalCollaborator(given, COLLABORATOR.INCARNATION_FENCE, isFunction,
    EXPECT_INCARNATION_FENCE);
  checkOptionalCollaborator(given, COLLABORATOR.SET_TIMEOUT, isFunction,
    EXPECT_TIMER);
  checkOptionalCollaborator(given, COLLABORATOR.CLEAR_TIMEOUT, isFunction,
    EXPECT_TIMER);
  assertLateBoundCollaborators(given);
}

/**
 * Require the node's one readiness service as a named collaborator of an
 * owner that reads readiness. No owner builds a private readiness service:
 * a second instance would be a second authority for the same answer.
 * @param {Object} options - The owner's construction options.
 * @param {string} owner - The owner's name, for the refusal.
 * @return {Object} The readiness service.
 */
function requireControlPlaneReadinessService(options, owner) {
  const service = options?.[COLLABORATOR.SERVICE];
  if (isAbsent(service) || !isObject(service)) {
    const error = new Error(
      `${owner} refused construction: ${COLLABORATOR.SERVICE} must be ` +
      'the node control-plane readiness service',
    );
    error.code = ERROR_CODE.SERVICE_MISSING;
    error.collaborator = COLLABORATOR.SERVICE;
    error.owner = owner;
    throw error;
  }
  return service;
}

// The members the readiness service calls on each late-bound collaborator.
// Production wires one implementation per collaborator (SystemTableCache,
// MembershipPublicationCoordinator, NodesOwner, ServicesOwner,
// MessageRouter, HeartbeatService, CDCGroupPropagationService,
// StorageCapacityAccountingService, NodeLifecycleStateMachine,
// AuthoritativeControlPlaneView, AuthoritativeNodeEvidenceReconciler), each
// of which has every member listed: a wiring without one is malformed.
// A dotted member names a method of an own member (the router's connection
// map). The collaborators without a member list are read as values only.
const LATE_BOUND_COLLABORATOR_MEMBERS = Object.freeze({
  [COLLABORATOR.SYSTEM_TABLE_CACHE]: Object.freeze([
    'getAll', 'getShared', 'get', 'filter', 'getTableMutationVersion',
    'onCacheChange', 'offCacheChange',
  ]),
  [COLLABORATOR.MEMBERSHIP_PUBLICATION]: Object.freeze([
    'getLatestPublicationForNode', 'getLatestClusterPublication',
    'getLatestPublicationForNodeSync', 'getLatestClusterPublicationSync',
    'getLatestPublishedClusterPublication',
    'getLatestPublishedClusterPublicationSync',
    'getLatestMembershipPublicationEpochStatusForNodeSync',
    'deriveClusterMembershipCandidate', 'deriveClusterMembershipCandidateSync',
  ]),
  [COLLABORATOR.NODES_OWNER]: Object.freeze([
    'getNode', 'getNodeFromCache', 'listNodes', 'listNodesFromCache',
  ]),
  [COLLABORATOR.SERVICES_OWNER]: Object.freeze([
    'listServices', 'listServicesFromCache', 'listServicesForNodeFromCache',
  ]),
  [COLLABORATOR.MESSAGE_ROUTER]: Object.freeze([
    'on', 'off', 'getConnectedNodes', 'getConnectionState',
    'hasScheduledReconnect', 'getQueryDataPlaneTransportReadiness',
    'getLocalBootIncarnationIdentity',
    'getCurrentPrimaryConnectionBootIncarnation', 'nodeConnections.get',
  ]),
  [COLLABORATOR.HEARTBEAT]: Object.freeze([
    'getHeartbeatPublicationDiagnostics',
  ]),
  [COLLABORATOR.CDC_GROUP_PROPAGATION]: Object.freeze([
    'getPublicationModeDiagnostics',
  ]),
  [COLLABORATOR.STORAGE_ACCOUNTING]: Object.freeze([
    'getCapacitySnapshotForNode', 'getCapacitySnapshotForNodeSync',
  ]),
  [COLLABORATOR.NODE_LIFECYCLE]: Object.freeze(['getState']),
  [COLLABORATOR.AUTHORITATIVE_VIEW]: Object.freeze([
    'syncOwnerDependencies', 'readReadinessOwnerRows',
  ]),
  [COLLABORATOR.EVIDENCE_RECONCILER]: Object.freeze(['syncOwnerDependencies']),
});
const EXPECT_INTERFACE_PREFIX = 'an object with ';
const MEMBER_LIST_SEPARATOR = ', ';
const MEMBER_CALL_SUFFIX = '()';
const EXPECT_APPLY_CHANGE_CHANNEL =
  'a cache with both onCacheApplyChange() and offCacheApplyChange(), or neither';
// The apply-time change channel is an optional capability of the cache: the
// writable SystemTableCache has it, the ReadOnlySystemTableCache a joiner
// wires (startup-sql-runtime-handoff -> coordinator syncOwnerDependencies)
// does not. A cache offers both members or neither.
const CACHE_APPLY_CHANGE_CHANNEL = Object.freeze([
  'onCacheApplyChange', 'offCacheApplyChange',
]);

function readMember(value, member) {
  const dot = member.indexOf('.');
  if (dot < 0) return value[member];
  const owner = value[member.slice(0, dot)];
  return isObject(owner) && owner !== null ? owner[member.slice(dot + 1)] :
    undefined;
}

/**
 * Validate one late-bound collaborator at the point it is wired (the
 * construction options or a syncOwnerDependencies call). Absent means
 * unwired, which is allowed; a present one must have every member the
 * readiness service calls.
 * @param {string} collaborator - The option name.
 * @param {*} value - The collaborator being wired.
 * @return {void}
 */
function assertLateBoundCollaborator(collaborator, value) {
  if (isAbsent(value)) return;
  const members = LATE_BOUND_COLLABORATOR_MEMBERS[collaborator] || [];
  if (!isObject(value)) {
    refuseCollaborator(collaborator, ERROR_CODE.COLLABORATOR_INVALID,
      EXPECT_INTERFACE_PREFIX + members.join(MEMBER_LIST_SEPARATOR));
  }
  for (const member of members) {
    if (!isFunction(readMember(value, member))) {
      refuseCollaborator(collaborator, ERROR_CODE.COLLABORATOR_INVALID,
        EXPECT_INTERFACE_PREFIX + member + MEMBER_CALL_SUFFIX);
    }
  }
  if (collaborator === COLLABORATOR.SYSTEM_TABLE_CACHE) {
    const offered = CACHE_APPLY_CHANGE_CHANNEL.filter(
      (member) => isFunction(value[member]));
    if (offered.length === 1) {
      refuseCollaborator(collaborator, ERROR_CODE.COLLABORATOR_INVALID,
        EXPECT_APPLY_CHANGE_CHANNEL);
    }
  }
}

/**
 * The apply-time change channel of a wired cache (an optional capability,
 * validated as both-or-neither at wiring), or the unwired state when the
 * cache is unwired or offers no such channel.
 * @param {Object|null} systemTableCache - A wired cache, or null.
 * @return {Object} The cache or CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED.
 */
function readCacheApplyChangeChannel(systemTableCache) {
  return !isAbsent(systemTableCache) &&
    isFunction(systemTableCache[CACHE_APPLY_CHANGE_CHANNEL[0]]) ?
    systemTableCache : CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED;
}

/**
 * Validate every late-bound collaborator one wiring names.
 * @param {Object} options - Construction options or one wiring.
 * @return {void}
 */
function assertLateBoundCollaborators(options) {
  for (const collaborator of objectKeys(LATE_BOUND_COLLABORATOR_MEMBERS)) {
    if (objectHasOwn(options, collaborator)) {
      assertLateBoundCollaborator(collaborator, options[collaborator]);
    }
  }
}

/**
 * Read one late-bound collaborator of the readiness service: the wired
 * collaborator, or CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED.
 * @param {Object} service - The readiness service.
 * @param {string} collaborator - The collaborator's option name.
 * @return {Object} The collaborator or the unwired state.
 */
function readWiredCollaborator(service, collaborator) {
  const value = service[collaborator];
  return isAbsent(value) ? CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED :
    value;
}

export {
  assertLateBoundCollaborators,
  assertReadinessServiceCollaborators,
  readCacheApplyChangeChannel,
  readWiredCollaborator,
  requireControlPlaneReadinessService,
};
