/**
 * Production assembly of the cluster-owned artifact payload store (sole
 * attachment owner; brief
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1).
 *
 * Mirrors attachCallCellInvoker's composition-gated idempotent shape at
 * the SQL-runtime handoff seam: when the final runtime engine and at
 * least one consuming owner are present, ONE store is built over the
 * engine's internal SQL path and assigned to the lifecycle command
 * owner (INSTALL-time payload internalization) and the deployment
 * binding owner (payload-seal bindable gate). An owner that already
 * carries a store — a test-injected one, or an earlier attachment — is
 * never overwritten, and its store is reused for the other owner so
 * both always share one store. Every absent dependency leaves the
 * existing behavior untouched.
 *
 * The coordination session id deliberately routes through executeQuery
 * WITHOUT issuingServiceId attribution, mirroring the call-cell
 * coordination session rationale (runtime-internal coordination must
 * not distort the data-affinity matrix).
 */

import {createArtifactPayloadStore} from
  '../../service/artifact-payload-store.js';

const ARTIFACT_PAYLOAD_COORDINATION_SESSION =
  'artifact-payload-store-coordination';
const TYPE_FUNCTION = 'function';

/**
 * Build (or reuse) the artifact payload store and bind it to the
 * lifecycle command owner and the deployment binding owner.
 *
 * @param {object} options
 * @param {object} [options.serviceLifecycleCommandOwner] the owner
 *   whose `artifactPayloadStore` gates INSTALL-time internalization
 * @param {object} [options.deploymentBindingOwner] the owner whose
 *   `artifactPayloadStore` gates bindability on a SEALED payload
 * @param {object} options.sqlQueryEngine the final runtime SQL engine
 * @param {object} [options.logger]
 * @param {object} [options.tunables] deployment-configured bounds
 *   (chunkSizeBytes, maxPayloadBytes)
 * @return {object|null} the shared store, or null when the engine or
 *   every consuming owner is absent (existing behavior stays)
 */
function resolveConsumingOwners(options) {
  return [
    options.serviceLifecycleCommandOwner,
    options.deploymentBindingOwner,
  ].filter(Boolean);
}

function hasInternalSqlEngine(sqlQueryEngine) {
  return Boolean(sqlQueryEngine) &&
    typeof sqlQueryEngine.executeQuery === TYPE_FUNCTION;
}

function existingOwnerStore(owners) {
  const carrier = owners.find((owner) => owner.artifactPayloadStore);
  return carrier ? carrier.artifactPayloadStore : null;
}

function buildEngineBackedStore(sqlQueryEngine, options) {
  const tunables = options.tunables || {};
  return createArtifactPayloadStore({
    chunkSizeBytes: tunables.chunkSizeBytes,
    executeInternal: (sql, params) => sqlQueryEngine.executeQuery(
      sql,
      params,
      {sessionId: ARTIFACT_PAYLOAD_COORDINATION_SESSION},
    ),
    logger: options.logger,
    maxPayloadBytes: tunables.maxPayloadBytes,
    nowProvider: () => Date.now(),
  });
}

function attachArtifactPayloadStore(options = {}) {
  const owners = resolveConsumingOwners(options);
  if (!hasInternalSqlEngine(options.sqlQueryEngine) || owners.length === 0) {
    return null;
  }
  const store = existingOwnerStore(owners) ||
    buildEngineBackedStore(options.sqlQueryEngine, options);
  for (const owner of owners) {
    owner.artifactPayloadStore = owner.artifactPayloadStore || store;
  }
  return store;
}

export {
  ARTIFACT_PAYLOAD_COORDINATION_SESSION,
  attachArtifactPayloadStore,
};
