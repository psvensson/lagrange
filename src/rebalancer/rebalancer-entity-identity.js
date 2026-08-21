/**
 * Single owner for rebalancer entity identity.
 *
 * Raw planner/API input is normalized exactly once at operation ingress.
 * Persisted operation consumers use the strict assertion and never reconstruct
 * identity from partition aliases or serialization variants.
 */

import {SERVICE_TYPE} from '../constants/service.js';
import {
  ALLOWED_UNIFIED_SERVICE_TYPES,
} from '../constants/unified-service-lifecycle.js';

const UNSUPPORTED_REBALANCER_ENTITY_TYPE =
  'UNSUPPORTED_REBALANCER_ENTITY_TYPE';
const INVALID_REBALANCER_ENTITY_ID = 'INVALID_REBALANCER_ENTITY_ID';
const REBALANCER_MOVE_OWNER_TYPE_MISMATCH =
  'REBALANCER_MOVE_OWNER_TYPE_MISMATCH';

function buildIdentityError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertCanonicalRebalancerEntityIdentity(identity) {
  const entityType = identity?.entityType;
  const entityId = identity?.entityId;
  if (!ALLOWED_UNIFIED_SERVICE_TYPES.has(entityType)) {
    throw buildIdentityError(
      `Unsupported rebalancer entity type: ${entityType}`,
      UNSUPPORTED_REBALANCER_ENTITY_TYPE,
    );
  }
  if (typeof entityId !== 'string' || entityId.length === 0) {
    throw buildIdentityError(
      `Invalid rebalancer entity id for ${entityType}: ${entityId}`,
      INVALID_REBALANCER_ENTITY_ID,
    );
  }
  return Object.freeze({entityType, entityId});
}

function normalizeRebalancerEntityIdentity(input) {
  return assertCanonicalRebalancerEntityIdentity({
    entityType: input?.entityType ?? SERVICE_TYPE.PARTITION,
    entityId: input?.entityId ?? input?.partitionId,
  });
}

/**
 * Canonicalize one planner result at the planner/execution handoff. The
 * rebalancer instance owns the entity type; a move may target another entity
 * of that same type for a recovery follow-up, but it may not switch domains.
 * Downstream code receives one complete identity and never consults the owner
 * instance as a fallback.
 * @param {Object} move
 * @param {Object} ownerIdentity
 * @return {Object}
 */
function canonicalizeRebalancerMove(move, ownerIdentity) {
  const owner = assertCanonicalRebalancerEntityIdentity(ownerIdentity);
  const entityType = move?.entityType ?? owner.entityType;
  if (entityType !== owner.entityType) {
    throw buildIdentityError(
      `Rebalancer ${owner.entityType} cannot emit ${entityType} move`,
      REBALANCER_MOVE_OWNER_TYPE_MISMATCH,
    );
  }
  const entityId = move?.entityId ?? move?.partitionId ?? owner.entityId;
  const identity = assertCanonicalRebalancerEntityIdentity({
    entityType,
    entityId,
  });
  if (
    typeof move?.partitionId === 'string' &&
    move.partitionId.length > 0 &&
    move.partitionId !== identity.entityId
  ) {
    throw buildIdentityError(
      `Rebalancer move identity mismatch: ${move.partitionId} !== ` +
        identity.entityId,
      INVALID_REBALANCER_ENTITY_ID,
    );
  }
  if (
    move?.partitionId === identity.entityId &&
    move?.entityType === identity.entityType &&
    move?.entityId === identity.entityId
  ) {
    return move;
  }
  return Object.freeze({
    ...move,
    partitionId: identity.entityId,
    ...identity,
  });
}

export {
  assertCanonicalRebalancerEntityIdentity,
  canonicalizeRebalancerMove,
  normalizeRebalancerEntityIdentity,
};
