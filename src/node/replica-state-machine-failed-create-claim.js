import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  buildReplicaLifecycleMutationPredicateFromRow,
  observeAuthoritativeReplicaLifecycle,
  rowMatchesReplicaLifecyclePredicate,
} from './replica-state-machine-lifecycle-observation.js';
import {installAuthoritativeReplicaLifecycleInLane} from
  './replica-state-machine-recovery.js';
import {runSerializedReplicaMutation} from
  './replica-state-machine-serialization.js';
import {
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_STATE,
} from
  './replica-state-machine-constants.js';

const FAILED_CREATE_CLAIM_WORK_CLASS = 'critical';

function rowHoldsFailedCreateClaim(row, evidence, cleanupToken) {
  return row?.status === REPLICA_STATE_MACHINE_STATE.FAILED &&
    row?.cleanup_token === cleanupToken &&
    rowMatchesReplicaLifecyclePredicate(
      row,
      buildReplicaLifecycleMutationPredicateFromRow({
        ...evidence,
        cleanupToken,
      }),
    );
}

async function installClaimedRow(stateMachine, row) {
  const installed = installAuthoritativeReplicaLifecycleInLane(
    stateMachine,
    row.service_id,
    row,
  );
  return installed !== false;
}

async function claimFailedCreateCleanup(
  stateMachine,
  evidence,
  cleanupToken,
) {
  const replicaId = evidence?.service_id;
  if (typeof replicaId !== 'string' ||
      evidence?.status !== REPLICA_STATE_MACHINE_STATE.FAILED ||
      typeof cleanupToken !== 'string' || cleanupToken.length === 0) {
    return false;
  }
  const claim = async () => {
    const observation = await observeAuthoritativeReplicaLifecycle(
      stateMachine,
      replicaId,
    );
    if (observation.available !== true || !observation.row) return false;
    const row = observation.row;
    if (rowHoldsFailedCreateClaim(row, evidence, cleanupToken)) {
      return installClaimedRow(stateMachine, row);
    }
    if (row.cleanup_token !== null && row.cleanup_token !== undefined) {
      return false;
    }
    const predicate = buildReplicaLifecycleMutationPredicateFromRow(row);
    if (!rowMatchesReplicaLifecyclePredicate(evidence, predicate)) {
      return false;
    }
    const updatedAt = Math.max(
      stateMachine.now(),
      Number.isFinite(row.updated_at) ? row.updated_at + 1 : 0,
      Number.isFinite(row.state_entered_at) ? row.state_entered_at + 1 : 0,
    );
    const claimedEvidence = {
      ...row,
      cleanup_token: cleanupToken,
      state_entered_at: updatedAt,
      updated_at: updatedAt,
    };
    try {
      await stateMachine.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: predicate,
        data: {
          cleanup_token: cleanupToken,
          state_entered_at: updatedAt,
          updated_at: updatedAt,
        },
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${replicaId}:failed-create:${cleanupToken}`,
        deliveryPriority: FAILED_CREATE_CLAIM_WORK_CLASS,
        workClass: FAILED_CREATE_CLAIM_WORK_CLASS,
        skipCacheWait: true,
      });
    } catch (error) {
      stateMachine.logger.warn(
        REPLICA_STATE_MACHINE_LOG_MSG.FAILED_CREATE_CLAIM_ACK_UNCERTAIN,
        {replicaId, error: String(error)},
      );
    }
    const claimed = await observeAuthoritativeReplicaLifecycle(
      stateMachine,
      replicaId,
    );
    if (claimed.available !== true ||
        !rowHoldsFailedCreateClaim(
          claimed.row,
          claimedEvidence,
          cleanupToken,
        )) {
      return false;
    }
    return installClaimedRow(stateMachine, claimed.row);
  };
  return Promise.resolve(runSerializedReplicaMutation(
    stateMachine,
    replicaId,
    claim,
  ));
}

export {claimFailedCreateCleanup};
