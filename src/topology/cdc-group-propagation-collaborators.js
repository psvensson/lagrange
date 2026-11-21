/**
 * Owner contract:
 * Owner: CDCGroupPropagationService wiring (initialize) owns the validation of
 *   the collaborators its propagation plan reads.
 * Inputs: the service's wired system table cache, latency tree and
 *   configuration, at each initialize.
 * Canonical output: nothing, or a typed refusal naming the collaborator and
 *   the capability it lacks.
 * Prohibited fallbacks: no versionless collaborator and no plan observed
 *   under an unknown stamp: every version source the plan stamp reads is a
 *   required capability of its wired collaborator.
 * Primary tests: test/partition/partition-cdc-currentness-stamp-witness.test.js.
 */
import {
  CDC_GROUP_PROPAGATION_COLLABORATOR as COLLABORATOR,
  CDC_GROUP_PROPAGATION_ERROR_CODE as ERROR_CODE,
} from './cdc-group-propagation-constants.js';

// Each collaborator's reads by the plan (cdc-group-propagation-durable-plan.js
// and cdc-group-propagation-routing.js), its version source last.
const REQUIRED_CAPABILITIES = Object.freeze({
  [COLLABORATOR.SYSTEM_TABLE_CACHE]: Object.freeze(['get', 'getAll', 'filter',
    'getTableMutationVersion']),
  [COLLABORATOR.LATENCY_TREE_SERVICE]: Object.freeze(['getRoutingOrder',
    'getRoutingGeneration']),
  [COLLABORATOR.CONFIGURATION]: Object.freeze(['get', 'getRevision']),
});

const isFunction = (value) => typeof value === 'function';

function refuseCollaborator(collaborator, capability) {
  const error = new Error(
    `CDCGroupPropagationService refused wiring: ${collaborator} must expose ` +
    `${capability}()`,
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

/**
 * Validate, at the service's wiring point, every collaborator whose version
 * the propagation plan's stamp reads: the cache, the tree and the
 * configuration, each required with its read surface. (The router is not a
 * version source: the stamp holds its identity, and an unwired router is the
 * plan's own named MESSAGE_ROUTER_UNAVAILABLE outcome.)
 * @param {Object} wiring - The collaborators the service is about to take.
 * @return {void}
 */
function assertPropagationCollaborators(wiring) {
  requireCapabilities(COLLABORATOR.SYSTEM_TABLE_CACHE, wiring.systemTableCache);
  requireCapabilities(COLLABORATOR.LATENCY_TREE_SERVICE, wiring.latencyTreeService);
  requireCapabilities(COLLABORATOR.CONFIGURATION, wiring.config);
}

export {assertPropagationCollaborators};
