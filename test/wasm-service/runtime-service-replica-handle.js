/**
 * Replica handle of a runtime service, built field for field the way
 * production builds it.
 *
 * `genericCreateHandle` in `src/node/runtime-service-generic-replica.js`
 * (not exported, so mirrored here) spreads the stored `service_definitions`
 * row and states `serviceId` and `replicaId` from the replica being
 * created, `entityId`, `serviceType`, `nodeId`, and the camelCase runtime
 * fields the descriptor validator reads. Nothing is derived from the row's
 * `service_id`: the lifecycle and the drivers read the handle's `serviceId`
 * (`resolveDriverServiceId`, `src/runtime/wasm-component-driver.js:129`).
 * The replica id has the production form `${entityId}-rN`
 * (`src/rebalancer/runtime-service-replica-identity.js`).
 */

import {UNIFIED_SERVICE_TYPE} from '../../src/constants/index.js';

function requireText(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`replica handle fixture requires ${name}`);
  }
  return value;
}

/**
 * @param {Object} definitionRow - A stored runtime-service definition row.
 * @param {{entityId: string, replicaId: string, nodeId: string}} identity
 *   All three are required and stated by the fixture.
 * @return {Object} The replica handle.
 */
export function buildRuntimeServiceReplicaHandle(
  definitionRow, {entityId, replicaId, nodeId},
) {
  return {
    ...definitionRow,
    serviceId: requireText('replicaId', replicaId),
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    replicaId,
    entityId: requireText('entityId', entityId),
    nodeId: requireText('nodeId', nodeId),
    runtimeKind: definitionRow.runtime_kind ?? null,
    runtimeRef: definitionRow.runtime_ref ?? null,
    runtimeConfig: definitionRow.runtime_config ?? null,
  };
}
