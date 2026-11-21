/**
 * Owner contract:
 * Owner: CDCGroupPropagationService wiring (initialize) owns the validation of
 *   the collaborators its propagation plan reads.
 * Inputs: the service's wired system table cache, latency tree,
 *   configuration and (when wired) message router, at each initialize.
 * Canonical output: nothing, or a typed refusal naming the collaborator and
 *   the capability it lacks.
 * Prohibited fallbacks: no versionless collaborator and no plan observed
 *   under an unknown stamp: every version source the plan stamp reads is a
 *   required capability of its wired collaborator. The plan reads every
 *   collaborator directly (cdc-group-propagation-routing.js), never probing.
 * Primary tests: test/partition/partition-cdc-currentness-stamp-witness.test.js.
 */
import {
  CDC_GROUP_PROPAGATION_COLLABORATOR as COLLABORATOR,
  CDC_GROUP_PROPAGATION_ERROR_CODE as ERROR_CODE,
  CDC_PROPAGATION_PLAN_TABLE,
} from './cdc-group-propagation-constants.js';

// Each collaborator's reads by the plan (cdc-group-propagation-durable-plan.js
// and cdc-group-propagation-routing.js), its version source last.
const REQUIRED_CAPABILITIES = Object.freeze({
  [COLLABORATOR.SYSTEM_TABLE_CACHE]: Object.freeze(['get', 'getAll', 'filter',
    'getTableMutationVersion']),
  [COLLABORATOR.LATENCY_TREE_SERVICE]: Object.freeze(['getRoutingOrder',
    'getRoutingGeneration']),
  [COLLABORATOR.CONFIGURATION]: Object.freeze(['get', 'getRevision']),
  [COLLABORATOR.MESSAGE_ROUTER]: Object.freeze(['deliver']),
});

// Each version source, by collaborator: the capability whose answer the plan
// stamp holds.
const VERSION_CAPABILITY = Object.freeze({
  [COLLABORATOR.SYSTEM_TABLE_CACHE]: 'getTableMutationVersion',
  [COLLABORATOR.LATENCY_TREE_SERVICE]: 'getRoutingGeneration',
  [COLLABORATOR.CONFIGURATION]: 'getRevision',
});

const isFunction = (value) => typeof value === 'function';

// A version: what a version source answers, compared by identity in the plan
// stamp. Anything else (undefined, a string, NaN) would compare equal to
// itself for ever and is never a version.
const isOwnerVersion = (value) => Number.isSafeInteger(value) && value >= 0;

const REQUIREMENT = Object.freeze({
  EXPOSE: (collaborator, capability) => `${collaborator} must expose ${capability}()`,
  VERSION: (collaborator, capability) =>
    `${collaborator}.${capability}() must answer a version (a non-negative safe integer)`,
});

function refuseCollaborator(collaborator, capability, requirement = REQUIREMENT.EXPOSE) {
  const error = new Error(
    `CDCGroupPropagationService refused wiring: ${requirement(collaborator, capability)}`,
  );
  error.code = ERROR_CODE.COLLABORATOR_INVALID;
  error.collaborator = collaborator;
  error.capability = capability;
  throw error;
}

function requireCapabilities(collaborator, value) {
  for (const capability of REQUIRED_CAPABILITIES[collaborator]) {
    if (!isFunction(value?.[capability])) refuseCollaborator(collaborator, capability);
  }
}

function requireVersion(collaborator, answer) {
  if (!isOwnerVersion(answer)) {
    refuseCollaborator(collaborator, VERSION_CAPABILITY[collaborator], REQUIREMENT.VERSION);
  }
}

// Each version source answers a version when called, for every table the plan
// reads.
function requireVersionAnswers(wiring) {
  for (const tableName of Object.values(CDC_PROPAGATION_PLAN_TABLE)) {
    requireVersion(COLLABORATOR.SYSTEM_TABLE_CACHE,
      wiring.systemTableCache.getTableMutationVersion(tableName));
  }
  requireVersion(COLLABORATOR.LATENCY_TREE_SERVICE,
    wiring.latencyTreeService.getRoutingGeneration());
  requireVersion(COLLABORATOR.CONFIGURATION, wiring.config.getRevision());
}

/**
 * Validate, at the service's wiring point, every collaborator the propagation
 * plan reads: the cache, the tree and the configuration, each required with
 * its read surface and a version source that answers a version (called once
 * here, each listed table included); and a wired router, which must deliver.
 * An unwired router (null) is the plan's own named MESSAGE_ROUTER_UNAVAILABLE
 * outcome; the stamp holds the router's identity.
 * @param {Object} wiring - The collaborators the service is about to take.
 * @return {void}
 */
function assertPropagationCollaborators(wiring) {
  requireCapabilities(COLLABORATOR.SYSTEM_TABLE_CACHE, wiring.systemTableCache);
  requireCapabilities(COLLABORATOR.LATENCY_TREE_SERVICE, wiring.latencyTreeService);
  requireCapabilities(COLLABORATOR.CONFIGURATION, wiring.config);
  requireVersionAnswers(wiring);
  if (wiring.messageRouter !== null) {
    requireCapabilities(COLLABORATOR.MESSAGE_ROUTER, wiring.messageRouter);
  }
}

export {assertPropagationCollaborators, isOwnerVersion};
