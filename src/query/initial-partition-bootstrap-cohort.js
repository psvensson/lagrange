import {
  validateBootstrapMembershipStamp,
} from '../raft/raft-committed-membership-stamp.js';
import {
  OPERATION_METADATA_KEY,
} from '../rebalancer/replica-status.js';
import {
  ReplicaOperationField,
} from '../rebalancer/replica-operation-constants.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {QUERY_ERROR_CODE} from './query-constants.js';

const GENESIS_KIND = 'genesis';
const STRING_TYPE = 'string';
const OBJECT_TYPE = 'object';
const FOUNDER_LIST_SEPARATOR = ', ';
// Whether durable bootstrap operations already name the partition's founding
// cohort (R07). ESTABLISHED: their genesis stamp is the authority, and a
// retry attaches to it. UNFOUNDED: no operation is stamped yet, and the
// provisioning owner founds the cohort from what it planned.
// NO_DURABLE_INTENT: the provisioning runs under no schema job, so no prior
// attempt's operations are its own and there is nothing to attach to.
const BOOTSTRAP_COHORT_STATE = Object.freeze({
  ESTABLISHED: 'established',
  UNFOUNDED: 'unfounded',
  NO_DURABLE_INTENT: 'no_durable_intent',
});
// What a cohort conflict says of the operations it found, after the
// partition its message names.
const COHORT_CONFLICT_DETAIL = Object.freeze({
  TABLE_METADATA_MISMATCH:
    'existing operation bootstrapTableMetadata does not match table intent',
  PARTITION_METADATA_MISMATCH:
    'existing operation bootstrapPartitionMetadata does not match ' +
    'partition intent',
  CONFLICTING_GENESIS_COHORTS:
    'existing operations carry conflicting genesis bootstrap cohorts',
});

function createBootstrapCohortConflictError(partitionId, detailMessage) {
  const error = new Error(
    `Bootstrap cohort conflict for partition ${partitionId}: ${detailMessage}`,
  );
  error.code = QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT;
  error.errorCode = QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT;
  return error;
}

function hasExactStringArrayOrder(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (
      typeof left[index] !== STRING_TYPE ||
      left[index].length === 0 ||
      left[index] !== right[index]
    ) {
      return false;
    }
  }
  return true;
}

function hasExactFounderNodeMapping(founders, leftNodeIds, rightNodeIds) {
  if (
    !leftNodeIds ||
    typeof leftNodeIds !== OBJECT_TYPE ||
    !rightNodeIds ||
    typeof rightNodeIds !== OBJECT_TYPE
  ) {
    return false;
  }
  const leftKeys = Object.keys(leftNodeIds);
  const rightKeys = Object.keys(rightNodeIds);
  if (
    leftKeys.length !== founders.length ||
    rightKeys.length !== founders.length
  ) {
    return false;
  }
  for (const founderId of founders) {
    const leftNodeId = leftNodeIds[founderId];
    const rightNodeId = rightNodeIds[founderId];
    if (
      typeof leftNodeId !== STRING_TYPE ||
      leftNodeId.length === 0 ||
      leftNodeId !== rightNodeId
    ) {
      return false;
    }
  }
  return true;
}

function isSameEstablishedCohort(left, right) {
  return (
    hasExactStringArrayOrder(left.replicaIds, right.replicaIds) &&
    hasExactStringArrayOrder(left.peerAddresses, right.peerAddresses) &&
    hasExactFounderNodeMapping(
      left.replicaIds,
      left.founderNodeIds,
      right.founderNodeIds,
    )
  );
}

function assertOperationMetadataMatchesIntent(
  partitionId,
  operation,
  bootstrapTableMetadata,
  bootstrapPartitionMetadata,
) {
  const opTableMeta = operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA];
  if (bootstrapTableMetadata && opTableMeta !== undefined) {
    if (
      !opTableMeta ||
      opTableMeta.table_id !== bootstrapTableMetadata.table_id ||
      opTableMeta.table_name !== bootstrapTableMetadata.table_name
    ) {
      throw createBootstrapCohortConflictError(
        partitionId,
        COHORT_CONFLICT_DETAIL.TABLE_METADATA_MISMATCH,
      );
    }
  }
  const opPartitionMeta =
    operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA];
  if (bootstrapPartitionMetadata && opPartitionMeta !== undefined) {
    if (
      !opPartitionMeta ||
      opPartitionMeta.partition_id !== bootstrapPartitionMetadata.partition_id ||
      opPartitionMeta.table_id !== bootstrapPartitionMetadata.table_id
    ) {
      throw createBootstrapCohortConflictError(
        partitionId,
        COHORT_CONFLICT_DETAIL.PARTITION_METADATA_MISMATCH,
      );
    }
  }
}

function validateOperationTargetFounderBinding(
  partitionId,
  operation,
  canonicalStamp,
) {
  const operationReplicaId = operation?.replicaId;
  if (
    typeof operationReplicaId !== STRING_TYPE ||
    operationReplicaId.length === 0
  ) {
    return;
  }
  if (!canonicalStamp.founders.includes(operationReplicaId)) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `existing operation replicaId ${operationReplicaId} is absent from its genesis founders`,
    );
  }
  const targetNodeId = operation?.targetNodeId || operation?.nodeId;
  if (typeof targetNodeId === STRING_TYPE && targetNodeId.length > 0) {
    const mappedNodeId = canonicalStamp.founderNodeIds[operationReplicaId];
    if (mappedNodeId !== targetNodeId) {
      throw createBootstrapCohortConflictError(
        partitionId,
        `founder ${operationReplicaId} node mapping ${mappedNodeId} conflicts with operation target ${targetNodeId}`,
      );
    }
  }
}

function hasOnePeerAddressPerFounder(peerAddresses, founderCount) {
  return Array.isArray(peerAddresses) &&
    peerAddresses.length === founderCount &&
    new Set(peerAddresses).size === founderCount &&
    peerAddresses.every(
      (addr) => typeof addr === STRING_TYPE && addr.length > 0,
    );
}

// An operation that carries no bootstrap cohort has not been stamped. That
// is its state before its first dispatch (PENDING, or held for the cohort);
// past that step it is a conflict.
function assertUnstampedOperationNotInFlight(partitionId, operation, isDeferred) {
  if (
    !isDeferred &&
    Boolean(operation.workflowStep) &&
    operation.workflowStep !== WORKFLOW_STEP.PENDING
  ) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `in-flight operation ${operation.operationId || ''} in step ${operation.workflowStep} lacks decoded bootstrap cohort metadata`,
    );
  }
}

// The genesis stamp a stamped operation carries, with its replica ids, peer
// addresses and founder node mapping proven to agree with it.
function requireOperationGenesisStamp(partitionId, operation) {
  const operationLabel = operation.operationId || '';
  const validation = validateBootstrapMembershipStamp(
    operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP],
  );
  if (!validation.valid || validation.stamp.kind !== GENESIS_KIND) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `operation ${operationLabel} carries an invalid genesis bootstrapMembership stamp`,
    );
  }
  const canonicalStamp = validation.stamp;
  if (!hasExactStringArrayOrder(
    operation[ReplicaOperationField.REPLICA_IDS],
    canonicalStamp.founders,
  )) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `operation ${operationLabel} replicaIds do not match genesis stamp founders`,
    );
  }
  if (!hasOnePeerAddressPerFounder(
    operation[ReplicaOperationField.PEER_ADDRESSES],
    canonicalStamp.founders.length,
  )) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `operation ${operationLabel} peerAddresses do not match genesis stamp founders`,
    );
  }
  if (
    !hasExactFounderNodeMapping(
      canonicalStamp.founders,
      canonicalStamp.founderNodeIds,
      canonicalStamp.founderNodeIds,
    )
  ) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `operation ${operationLabel} genesis stamp is missing complete founderNodeIds mapping`,
    );
  }
  return canonicalStamp;
}

function extractValidatedOperationBootstrapCohort(
  partitionId,
  operation,
  bootstrapTableMetadata,
  bootstrapPartitionMetadata,
) {
  const isDeferred =
    operation.stepsHistory?.[0]?.[
      OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED
    ] === true;
  const hasAnyBootstrapField = [
    ReplicaOperationField.BOOTSTRAP_MEMBERSHIP,
    ReplicaOperationField.REPLICA_IDS,
    ReplicaOperationField.PEER_ADDRESSES,
  ].some((field) => operation[field] !== undefined);

  if (!hasAnyBootstrapField) {
    assertUnstampedOperationNotInFlight(partitionId, operation, isDeferred);
    return {established: false};
  }

  if (isDeferred) {
    throw createBootstrapCohortConflictError(
      partitionId,
      `deferred operation ${operation.operationId || ''} already carries bootstrap cohort metadata`,
    );
  }

  const canonicalStamp = requireOperationGenesisStamp(partitionId, operation);
  validateOperationTargetFounderBinding(partitionId, operation, canonicalStamp);
  assertOperationMetadataMatchesIntent(
    partitionId,
    operation,
    bootstrapTableMetadata,
    bootstrapPartitionMetadata,
  );

  return {
    established: true,
    replicaIds: [...canonicalStamp.founders],
    peerAddresses: [...operation[ReplicaOperationField.PEER_ADDRESSES]],
    founderNodeIds: {...canonicalStamp.founderNodeIds},
    bootstrapMembership: canonicalStamp,
  };
}

function assertPlanWithinEstablishedCohort(
  partitionId,
  establishedCohort,
  candidateTopology,
  explicitTargetNodeIds,
) {
  const establishedFounderSet = new Set(establishedCohort.replicaIds);
  const establishedNodeSet = new Set(
    Object.values(establishedCohort.founderNodeIds),
  );

  for (const candidateReplicaId of candidateTopology.replicaIds) {
    if (!establishedFounderSet.has(candidateReplicaId)) {
      throw createBootstrapCohortConflictError(
        partitionId,
        `planned founder ${candidateReplicaId} conflicts with established cohort [${establishedCohort.replicaIds.join(FOUNDER_LIST_SEPARATOR)}]`,
      );
    }
    const candidateNodeId =
      candidateTopology.founderNodeIds?.[candidateReplicaId];
    const establishedNodeId =
      establishedCohort.founderNodeIds[candidateReplicaId];
    if (
      typeof candidateNodeId === STRING_TYPE &&
      candidateNodeId.length > 0 &&
      candidateNodeId !== establishedNodeId
    ) {
      throw createBootstrapCohortConflictError(
        partitionId,
        `founder ${candidateReplicaId} node ${candidateNodeId} conflicts with established node ${establishedNodeId}`,
      );
    }
  }

  if (Array.isArray(explicitTargetNodeIds)) {
    for (const targetNodeId of explicitTargetNodeIds) {
      if (
        typeof targetNodeId === STRING_TYPE &&
        targetNodeId.length > 0 &&
        !establishedNodeSet.has(targetNodeId)
      ) {
        throw createBootstrapCohortConflictError(
          partitionId,
          `explicit target node ${targetNodeId} conflicts with established cohort nodes`,
        );
      }
    }
  }
}

// The one cohort the given operations establish, with the operations that
// carry it. Operations that disagree on it are a conflict.
function collectEstablishedCohort(
  partitionId,
  operations,
  bootstrapTableMetadata,
  bootstrapPartitionMetadata,
) {
  let establishedCohort = null;
  const bootstrappedOperations = new WeakSet();
  for (const operation of operations) {
    const extracted = extractValidatedOperationBootstrapCohort(
      partitionId,
      operation,
      bootstrapTableMetadata,
      bootstrapPartitionMetadata,
    );
    if (!extracted.established) {
      continue;
    }
    bootstrappedOperations.add(operation);
    if (!establishedCohort) {
      establishedCohort = extracted;
      continue;
    }
    if (!isSameEstablishedCohort(establishedCohort, extracted)) {
      throw createBootstrapCohortConflictError(
        partitionId,
        COHORT_CONFLICT_DETAIL.CONFLICTING_GENESIS_COHORTS,
      );
    }
  }
  return {establishedCohort, bootstrappedOperations};
}

function buildCohortAnswer(establishedCohort, bootstrappedOperations) {
  if (!establishedCohort) {
    return {state: BOOTSTRAP_COHORT_STATE.UNFOUNDED, bootstrappedOperations};
  }
  return {
    state: BOOTSTRAP_COHORT_STATE.ESTABLISHED,
    bootstrapTopology: {
      replicaIds: establishedCohort.replicaIds,
      peerAddresses: establishedCohort.peerAddresses,
      founderNodeIds: establishedCohort.founderNodeIds,
    },
    bootstrapMembership: establishedCohort.bootstrapMembership,
    // The founders' nodes, in founder order: the only targets a retry plans.
    founderTargetNodeIds: establishedCohort.replicaIds.map(
      (replicaId) => establishedCohort.founderNodeIds[replicaId]),
    bootstrappedOperations,
  };
}

/**
 * The founding cohort the partition's durable bootstrap operations already
 * establish, read before a retry plans anything: the durable genesis stamp
 * is the authority for who founds the partition, never the serving cohort
 * of the moment.
 * @param {Object} options
 * @param {string} options.partitionId
 * @param {Array<Object>} options.operations - The partition's durable
 *   bootstrap operations of this provisioning intent.
 * @param {Object|null} options.bootstrapTableMetadata
 * @param {Object|null} options.bootstrapPartitionMetadata
 * @return {Object} A BOOTSTRAP_COHORT_STATE answer.
 */
function readEstablishedBootstrapCohort({
  partitionId,
  operations,
  bootstrapTableMetadata,
  bootstrapPartitionMetadata,
}) {
  const {establishedCohort, bootstrappedOperations} = collectEstablishedCohort(
    partitionId,
    operations,
    bootstrapTableMetadata,
    bootstrapPartitionMetadata,
  );
  return buildCohortAnswer(establishedCohort, bootstrappedOperations);
}

/**
 * The cohort the planned operations are stamped with: the established one
 * when any planned operation carries it (the plan must then agree with it),
 * else UNFOUNDED - the provisioning owner founds it from its plan.
 * @param {Object} options
 * @return {Object} A BOOTSTRAP_COHORT_STATE answer.
 */
function resolveInitialPartitionBootstrapCohort({
  partitionId,
  plannedOperations,
  candidateTopology,
  bootstrapTableMetadata,
  bootstrapPartitionMetadata,
  explicitTargetNodeIds,
}) {
  const {establishedCohort, bootstrappedOperations} = collectEstablishedCohort(
    partitionId,
    plannedOperations,
    bootstrapTableMetadata,
    bootstrapPartitionMetadata,
  );
  if (establishedCohort) {
    assertPlanWithinEstablishedCohort(
      partitionId,
      establishedCohort,
      candidateTopology,
      explicitTargetNodeIds,
    );
  }
  return buildCohortAnswer(establishedCohort, bootstrappedOperations);
}

export {
  BOOTSTRAP_COHORT_STATE,
  readEstablishedBootstrapCohort,
  resolveInitialPartitionBootstrapCohort,
};
