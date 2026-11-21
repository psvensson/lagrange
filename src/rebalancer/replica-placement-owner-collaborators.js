// Public entry: validateReplicaPlacementOwnerOptions, invalidCollaborator, REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID.
// Required collaborators: none (pure checks of the options ReplicaPlacementOwner is constructed with).
// Durable authority / commit point: none.
// Permitted post-commit work: none.
// Recovery / wake entry: none.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js.
//
// The collaborators of the one replica placement owner, checked before it has
// any side effect: a typed REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID names
// the first invalid one. The ledger collaborator is the replica_operations-p1
// PartitionService with its database and its leadership tenure
// (replica-leadership-state.js: null while it does not lead, a frozen {term}
// token per leadership edge or term while it leads), the only authority the
// owner acts under.
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';

const REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID =
  'REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID';
const COLLABORATOR = Object.freeze({
  OPTIONS: 'options',
  NODE_ID: 'nodeId',
  LEDGER: 'ledgerPartitionService',
  NODE_AUTHORITY: 'nodeAuthority',
  CACHE: 'systemTableCache',
  NOW: 'now',
  LOGGER: 'logger',
  WORKFLOW_OWNER: 'workflowOwner',
  STORAGE: 'storageAccountingService',
  ADMIT: 'admitPlacement',
  RELEASE: 'releasePlacementHold',
  RESYNC_TIMER: 'resyncTimer',
});
const REQUIRED_METHOD_MAP = Object.freeze({
  [COLLABORATOR.LEDGER]: Object.freeze(['on', 'off']),
  [COLLABORATOR.NODE_AUTHORITY]: Object.freeze([
    'answerCommittedNodes', 'scheduleRefresh', 'subscribe',
  ]),
  [COLLABORATOR.CACHE]: Object.freeze(['getAll', 'onCacheApplyChange', 'offCacheApplyChange']),
  [COLLABORATOR.LOGGER]: Object.freeze(['debug', 'info', 'warn', 'error']),
  [COLLABORATOR.WORKFLOW_OWNER]: Object.freeze([
    'getCriticalReplicaRowsForSafety',
    'isVoterReadyFloorCountableReplica',
    'isOperationReplicaRow',
    'getCriticalMinReplicaCount',
  ]),
  [COLLABORATOR.STORAGE]: Object.freeze([
    'getCapacitySemanticIdentity',
    'subscribeCapacitySemanticChanges',
  ]),
});
const isObject = (value) => value !== null && typeof value === 'object';
const isFunction = (value) => typeof value === 'function';

function invalidCollaborator(collaborator) {
  const error = new TypeError(
    `ReplicaPlacementOwner collaborator invalid: ${collaborator}`,
  );
  error.code = REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID;
  error.collaborator = collaborator;
  throw error;
}

function requireMethods(target, collaborator, methods = REQUIRED_METHOD_MAP[collaborator]) {
  if (!isObject(target)) invalidCollaborator(collaborator);
  for (const method of methods) {
    if (!isFunction(target[method])) invalidCollaborator(collaborator);
  }
}

function requireOptionalMethods(target, collaborator) {
  if (target !== undefined && target !== null) requireMethods(target, collaborator);
}

function requireOptionalFunction(fn, collaborator) {
  if (fn !== undefined && !isFunction(fn)) invalidCollaborator(collaborator);
}

function validateResyncTimerCollaborators(options, resyncIntervalMs) {
  const hasSet = options.setIntervalFn !== undefined && options.setIntervalFn !== null;
  const hasClear = options.clearIntervalFn !== undefined && options.clearIntervalFn !== null;
  if (!hasSet && !hasClear) return;
  if (!isFunction(options.setIntervalFn) || !isFunction(options.clearIntervalFn) ||
      !Number.isInteger(resyncIntervalMs) || resyncIntervalMs <= 0) {
    invalidCollaborator(COLLABORATOR.RESYNC_TIMER);
  }
}

function validateOptionalPlacementCollaborators(options, resyncIntervalMs) {
  requireOptionalMethods(options.workflowOwner, COLLABORATOR.WORKFLOW_OWNER);
  requireOptionalMethods(options.storageAccountingService, COLLABORATOR.STORAGE);
  requireOptionalFunction(options.admitPlacement, COLLABORATOR.ADMIT);
  requireOptionalFunction(options.releasePlacementHold, COLLABORATOR.RELEASE);
  validateResyncTimerCollaborators(options, resyncIntervalMs);
}

function validateLedgerPartitionCollaborator(ledger) {
  requireMethods(ledger, COLLABORATOR.LEDGER);
  if (ledger.partitionId !== LEDGER_PARTITION_ID || !isObject(ledger.db) ||
      ledger.leadershipTenure === undefined) {
    invalidCollaborator(COLLABORATOR.LEDGER);
  }
}

/**
 * Check every collaborator of a ReplicaPlacementOwner before it is built.
 * @param {Object} options - The owner's construction options.
 * @param {number} resyncIntervalMs - The resync cadence the owner would arm.
 */
function validateReplicaPlacementOwnerOptions(options, resyncIntervalMs) {
  if (!isObject(options)) invalidCollaborator(COLLABORATOR.OPTIONS);
  if (typeof options.nodeId !== 'string' || options.nodeId.trim().length === 0) {
    invalidCollaborator(COLLABORATOR.NODE_ID);
  }
  validateLedgerPartitionCollaborator(options.ledgerPartitionService);
  requireMethods(options.nodeAuthority, COLLABORATOR.NODE_AUTHORITY);
  requireMethods(options.systemTableCache, COLLABORATOR.CACHE);
  if (!isFunction(options.now)) invalidCollaborator(COLLABORATOR.NOW);
  requireMethods(options.logger, COLLABORATOR.LOGGER);
  validateOptionalPlacementCollaborators(options, resyncIntervalMs);
}

export {
  COLLABORATOR,
  REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID,
  invalidCollaborator,
  isFunction,
  validateReplicaPlacementOwnerOptions,
};
