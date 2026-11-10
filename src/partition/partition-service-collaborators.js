/**
 * Owner contract:
 * Owner: PartitionService construction and wiring own collaborator validation.
 * Inputs: the construction options, and each later wiring (the system-table
 *   cache and CDC service setters, the coordinator rebind, the leadership
 *   sink); the row owner's construction options.
 * Canonical output: nothing, or a typed refusal naming the collaborator; a
 *   read of an unwired late-bound collaborator answers the named unwired state.
 * Prohibited fallbacks: no runtime substitute for a missing or malformed
 *   collaborator, and no per-call probe of a validated collaborator's members.
 * Primary tests: test/partition/partition-service-construction.test.js.
 */

const PARTITION_SERVICE_COLLABORATOR = Object.freeze({
  SYSTEM_TABLE_CACHE: 'systemTableCache',
  CDC_INTEGRATION_SERVICE: 'cdcIntegrationService',
  REBALANCE_COORDINATOR: 'rebalanceCoordinator',
  REBALANCER_LEADERSHIP_SINK: 'rebalancerLeadershipSink',
  REPLICA_STATE_MACHINE: 'replicaStateMachine',
  INITIALIZATION_STAGE_HOOK: 'onInitializationStage',
  SNAPSHOT_CATCHUP_HOOK: 'onSnapshotCatchupNeeded',
  SYSTEM_TABLE_WRITER: 'systemTableWriter',
  CLOCK: 'now',
});

const PARTITION_SERVICE_COLLABORATOR_ERROR_CODE = Object.freeze({
  INVALID: 'PARTITION_SERVICE_COLLABORATOR_INVALID',
});

// The answer a read of a late-bound collaborator gives before it is wired.
const PARTITION_SERVICE_COLLABORATOR_UNWIRED =
  'PARTITION_SERVICE_COLLABORATOR_UNWIRED';

const COLLABORATOR = PARTITION_SERVICE_COLLABORATOR;
const OWNER_PARTITION_SERVICE = 'PartitionService';
const OWNER_ROW_OWNER = 'PartitionServiceRowOwner';
const EXPECT_INTERFACE_PREFIX = 'an object with ';
const EXPECT_FUNCTION = 'a function';
const MEMBER_LIST_SEPARATOR = ', ';
const MEMBER_CALL_SUFFIX = '()';

// The members each owner calls on a collaborator it is handed. Production
// wires one implementation per collaborator, each of which has every member
// listed (census in solve/epics/code-navigability-and-mistake-resistance/
// partition-injection-notes.md): the node's writable SystemTableCache (the
// joiner's too: query-system-state-phase applySystemCacheToPartitions
// receives nodeService.getSystemTableCache()), CDCIntegrationService,
// RebalanceCoordinator, the runtime-service and installation-reconciler
// rebalancer owners (the leadership sink), ReplicaStateMachine and
// ControlPlaneSystemTableGateway (the row owner's writer). A wiring without
// one is malformed. The read-only system-table cache (createReadOnlyCache)
// is not a partition collaborator: no production site wires it into a
// partition, and it lacks the local write channel (applySystemTableChange,
// isStaleForExistingRecord) the partition's leader projection uses, so it is
// refused like any other cache without those members.
const PARTITION_SERVICE_COLLABORATOR_MEMBERS = Object.freeze({
  [COLLABORATOR.SYSTEM_TABLE_CACHE]: Object.freeze([
    'get', 'filter', 'getAll', 'onCacheChange', 'offCacheChange',
    'applySystemTableChange', 'isStaleForExistingRecord',
  ]),
  [COLLABORATOR.CDC_INTEGRATION_SERVICE]: Object.freeze([
    'refreshAuthoritativeCacheRow', 'executeAuthoritativeSystemTableRead',
  ]),
  [COLLABORATOR.REBALANCE_COORDINATOR]: Object.freeze([
    'syncOwnerDependencies', 'initialize', 'shutdown',
  ]),
  [COLLABORATOR.REBALANCER_LEADERSHIP_SINK]: Object.freeze(['setLeader']),
  [COLLABORATOR.REPLICA_STATE_MACHINE]: Object.freeze([
    'reconcileLocalOnlyServiceRowsNow',
  ]),
});
const PARTITION_SERVICE_ROW_OWNER_COLLABORATOR_MEMBERS = Object.freeze({
  [COLLABORATOR.SYSTEM_TABLE_WRITER]: Object.freeze([
    'insertSystemTableRow', 'updateSystemTableRow',
  ]),
  [COLLABORATOR.REPLICA_STATE_MACHINE]: Object.freeze([
    'activateRegisteredReplica',
  ]),
});

const isFunction = (value) => typeof value === 'function';
const isAbsent = (value) => value === undefined || value === null;

function refuseCollaborator(owner, collaborator, expectation) {
  const error = new Error(
    `${owner} refused a collaborator: ${collaborator} must be ${expectation}`,
  );
  error.code = PARTITION_SERVICE_COLLABORATOR_ERROR_CODE.INVALID;
  error.collaborator = collaborator;
  throw error;
}

function expectedInterface(members) {
  return EXPECT_INTERFACE_PREFIX +
    members.map((member) => `${member}${MEMBER_CALL_SUFFIX}`)
      .join(MEMBER_LIST_SEPARATOR);
}

// A member read that throws (a Proxy whose get trap refuses the name, a
// throwing accessor) answers this, never the collaborator's own error.
const MEMBER_READ_THREW = Symbol('partitionServiceCollaboratorMemberReadThrew');

function readMemberSafely(value, member) {
  try {
    return value[member];
  } catch {
    return MEMBER_READ_THREW;
  }
}

function assertMembers(owner, collaborator, value, members) {
  if (typeof value !== 'object' && !isFunction(value)) {
    refuseCollaborator(owner, collaborator, expectedInterface(members));
  }
  for (const member of members) {
    if (!isFunction(readMemberSafely(value, member))) {
      refuseCollaborator(owner, collaborator, expectedInterface(members));
    }
  }
}

/**
 * Validate one collaborator of the partition at the point it is wired (the
 * construction options or a later setter), before anything changes. Absent
 * means unwired, which is allowed; a present one must have every member the
 * partition calls. A member whose read throws is missing: the answer is the
 * typed refusal naming the collaborator, never the collaborator's error.
 * @param {string} collaborator - A PARTITION_SERVICE_COLLABORATOR name.
 * @param {*} value - The collaborator being wired.
 * @return {void}
 */
function assertPartitionServiceCollaborator(collaborator, value) {
  if (isAbsent(value)) return;
  const members = PARTITION_SERVICE_COLLABORATOR_MEMBERS[collaborator];
  assertMembers(OWNER_PARTITION_SERVICE, collaborator, value, members);
}

/**
 * Validate an optional hook option: absent is no hook (null), a function is
 * the hook, anything else is a typed refusal.
 * @param {string} collaborator - The option name.
 * @param {*} value - The option value.
 * @param {string} [owner] - The refusing owner's name.
 * @return {Function|null} The hook, or null.
 */
function resolveOptionalHook(collaborator, value,
  owner = OWNER_PARTITION_SERVICE) {
  if (isAbsent(value)) return null;
  if (!isFunction(value)) {
    refuseCollaborator(owner, collaborator, EXPECT_FUNCTION);
  }
  return value;
}

/**
 * Validate the row owner's collaborators, once, at its construction: the
 * system-table writer and the replica lifecycle owner are optional (an
 * unwired one is the row owner's typed refusal when it is needed), and when
 * given must have their interface; the clock, when given, is a function.
 * @param {Object} options - PartitionServiceRowOwner construction options.
 * @return {void}
 */
function assertPartitionServiceRowOwnerCollaborators(options) {
  for (const [collaborator, members] of
    Object.entries(PARTITION_SERVICE_ROW_OWNER_COLLABORATOR_MEMBERS)) {
    const value = options[collaborator];
    if (!isAbsent(value)) {
      assertMembers(OWNER_ROW_OWNER, collaborator, value, members);
    }
  }
  resolveOptionalHook(COLLABORATOR.CLOCK, options.now, OWNER_ROW_OWNER);
}

/**
 * The node's readiness service as the partition reads it (through its
 * late-bound coordinator, else its SQL engine), or the unwired state before
 * either carries one.
 * @param {Object} service - The partition service.
 * @return {Object|string} The readiness service, or
 *   PARTITION_SERVICE_COLLABORATOR_UNWIRED.
 */
function readWiredReadinessService(service) {
  const readinessService = service.controlPlaneReadinessService;
  return isAbsent(readinessService) ?
    PARTITION_SERVICE_COLLABORATOR_UNWIRED :
    readinessService;
}

export {
  PARTITION_SERVICE_COLLABORATOR,
  PARTITION_SERVICE_COLLABORATOR_ERROR_CODE,
  PARTITION_SERVICE_COLLABORATOR_MEMBERS,
  PARTITION_SERVICE_COLLABORATOR_UNWIRED,
  PARTITION_SERVICE_ROW_OWNER_COLLABORATOR_MEMBERS,
  assertPartitionServiceCollaborator,
  assertPartitionServiceRowOwnerCollaborators,
  readWiredReadinessService,
  resolveOptionalHook,
};
