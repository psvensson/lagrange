import {OperationWorkflowDispatchExecution} from './operation-workflow-dispatch-execution.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {
  isEvidenceAbsentReadinessDenialSnapshot,
} from '../control-plane/readiness-denial-classification.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';
import {UNIFIED_SERVICE_TYPE} from
  '../constants/unified-service-lifecycle.js';

import {isReplaceRemovalIntentDurable} from './operation-workflow-replace-owner.js';
const {
  CONTROL_PLANE_READINESS_DIMENSION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  ReplicaOperationResponseStatus,
  SERVICE_TYPE,
  STOP_PHASE_SOURCE_ABSENT_RESPONSE_STATUSES,
  SYSTEM_TABLE_NAME,
  VOTER_READY_REPLICA_TOPOLOGY_STATUSES,
  WORKFLOW_STEP,
  normalizePriorityRecoveryOperationPartitionId,
} = SHARED;

class PriorityPublicationSafetyTopology extends OperationWorkflowDispatchExecution {
  buildPriorityRecoveryWorkflowStepTimeoutMap(operation = null) {
    const timeoutMap = {};
    for (const workflowStep of PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS) {
      const stepTimeoutMs = this.getTimeoutForStep(workflowStep, operation);
      if (!Number.isFinite(stepTimeoutMs) || stepTimeoutMs <= 0) {
        continue;
      }
      timeoutMap[workflowStep] = Math.floor(stepTimeoutMs);
    }
    return Object.freeze(timeoutMap);
  }

  async handleStopPhaseSatisfiedResponse(operation, responseStatus) {
    // A partition REPLACE's stop-phase answer (the source's lifecycle
    // retired) is not its completion: the STOPPING owner decides from the
    // witness's committed configuration (R-1a) and re-drives the membership
    // removal (R-1f) (quest replace-source-removal-owner).
    if (isReplaceRemovalIntentDurable(operation)) {
      return this.runReplaceStoppingOwner(operation);
    }
    try {
      if (operation?.workflowStep !== WORKFLOW_STEP.STOPPING) {
        await this.updateStep(operation, WORKFLOW_STEP.STOPPING);
      }
      if (STOP_PHASE_SOURCE_ABSENT_RESPONSE_STATUSES.has(responseStatus)) {
        if (
          operation?.type === OperationType.REPLACE &&
          operation?.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
          !await this.confirmActiveReplicaTerminalHandoff(operation)
        ) {
          return this.buildSuccessfulOperationResult(operation.operationId, {
            status: ReplicaOperationResponseStatus.IN_PROGRESS,
          });
        }
        await this.completeOperation(operation);
        return this.buildSuccessfulOperationResult(operation.operationId, {
          status: responseStatus,
        });
      }
      return this.buildSuccessfulOperationResult(operation.operationId, {
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      });
    } catch (error) {
      if (
        this.deferObservedProgressRetry(
          operation?.operationId || null,
          SYSTEM_TABLE_NAME.SERVICES,
          OPERATION_WORKFLOW_OWNER_LITERAL.DELETE,
          error,
        )
      ) {
        return this.buildSkippedOperationResult(
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          operation?.operationId || null,
          {
            error: this.normalizeErrorMessage(
              error,
              OPERATION_WORKFLOW_OWNER_LITERAL.RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
            ),
          },
        );
      }
      throw error;
    }
  }

  isCriticalSystemPartition(partitionId) {
    return classifySystemPartition({partitionId}).systemTable;
  }

  resolveOperationReadinessDecisionDimension(operationOrPartitionId = null) {
    const partitionId =
      typeof operationOrPartitionId === 'string' ?
        operationOrPartitionId :
        normalizePriorityRecoveryOperationPartitionId(operationOrPartitionId);
    if (classifySystemPartition({partitionId}).systemTable) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === 'object' ?
        readiness.dimensions :
        null;
    if (!dimensions) {
      return false;
    }
    return dimensions[decisionDimension] === true;
  }

  isVoterReadyReplicaTopology(replicaRow) {
    if (!replicaRow) {
      return false;
    }
    if (!VOTER_READY_REPLICA_TOPOLOGY_STATUSES.has(replicaRow.status)) {
      return false;
    }
    if (!replicaRow.address) {
      return false;
    }
    return isVoterRaftRole(replicaRow.raft_role);
  }

  // Evidence-absent readiness denial: the planning snapshot has not
  // converged for this node, so readiness has no verdict at all — the
  // denial consists exclusively of planning_snapshot_refresh_pending /
  // owner_evidence_missing; an empty reason list stays ambiguous and fails
  // closed. Mirrors the approved routing fail-open discipline: any
  // substantive denial keeps every guard closed.
  isEvidenceAbsentReadinessDenial(nodeId, options = {}) {
    if (
      !nodeId ||
      !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
        'function'
    ) {
      return false;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension:
          typeof options?.decisionDimension === 'string' &&
          options.decisionDimension.length > 0 ?
            options.decisionDimension :
            this.resolveOperationReadinessDecisionDimension(
              options?.partitionId || null,
            ),
      },
    );
    return isEvidenceAbsentReadinessDenialSnapshot(readiness);
  }

  // Floor accounting for critical-partition remove safety ONLY: a replica
  // whose raft topology is voter-ready counts toward the quorum floor when
  // its node's readiness denial is evidence-absent (a barrier-held joiner
  // whose planning snapshot has not converged). Without this, cold
  // formation deadlocks: the barrier withholds the joiner's READY lease,
  // the joiner's healthy promoted voters are invisible to the floor, the
  // surplus drain is refused, and the spread the barrier waits for can
  // never happen. Routing, planning, promotion, and every substantive
  // denial keep using the strict isVoterReadyRoutableReplica.
  isVoterReadyFloorCountableReplica(replicaRow, options = {}) {
    if (this.isVoterReadyRoutableReplica(replicaRow, options)) {
      return true;
    }
    if (!this.isVoterReadyReplicaTopology(replicaRow)) {
      return false;
    }
    return this.isEvidenceAbsentReadinessDenial(replicaRow.node_id, options);
  }

  isVoterReadyRoutableReplica(replicaRow, options = {}) {
    if (!this.isVoterReadyReplicaTopology(replicaRow)) {
      return false;
    }
    const partitionId =
      options?.partitionId ||
      replicaRow.partition_id ||
      replicaRow.partitionId ||
      null;
    return this.isNodeReadyForRouting(replicaRow.node_id, {
      partitionId,
      decisionDimension: options?.decisionDimension || null,
      participationKind: options?.participationKind || null,
    });
  }

  isOperationReplicaRow(replicaRow, operation) {
    if (!replicaRow || !operation) {
      return false;
    }
    if (!operation.replicaId) {
      return false;
    }
    return (
      replicaRow.service_id === operation.replicaId ||
      replicaRow.replica_id === operation.replicaId
    );
  }

  getReplicaRowIdentity(replicaRow) {
    const serviceId =
      typeof replicaRow?.service_id === 'string' ?
        replicaRow.service_id.trim() :
        typeof replicaRow?.serviceId === 'string' ?
          replicaRow.serviceId.trim() :
          '';
    if (serviceId.length > 0) {
      return serviceId;
    }
    const replicaId =
      typeof replicaRow?.replica_id === 'string' ?
        replicaRow.replica_id.trim() :
        typeof replicaRow?.replicaId === 'string' ?
          replicaRow.replicaId.trim() :
          '';
    return replicaId.length > 0 ? replicaId : null;
  }

  normalizeReplicaRowRaftRole(replicaRow) {
    return typeof replicaRow?.raft_role === 'string' ?
      replicaRow.raft_role.trim().toLowerCase() :
      null;
  }

  isLeaderReplicaRow(replicaRow) {
    return this.normalizeReplicaRowRaftRole(replicaRow) === RAFT_ROLE.LEADER;
  }

  getPriorityPublicationSourceRoleState(replicaRow) {
    const normalizedRaftRole = this.normalizeReplicaRowRaftRole(replicaRow);
    if (normalizedRaftRole === RAFT_ROLE.FOLLOWER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }
    if (normalizedRaftRole === RAFT_ROLE.LEADER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER;
    }
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
  }

  getPriorityPublicationReplacementRoleState(replicaRow) {
    const normalizedRaftRole = this.normalizeReplicaRowRaftRole(replicaRow);
    if (normalizedRaftRole === RAFT_ROLE.LEADER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER;
    }
    if (normalizedRaftRole === RAFT_ROLE.FOLLOWER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
  }

  getCriticalPartitionLeaderNodeIdForSafety(partitionRow) {
    const leaderNodeId =
      typeof partitionRow?.leader_node_id === 'string' ?
        partitionRow.leader_node_id.trim() :
        null;
    return leaderNodeId && leaderNodeId.length > 0 ? leaderNodeId : null;
  }

  resolvePriorityPublicationSourceRoleState(
    operation,
    sourceRoleState,
    partitionRow,
  ) {
    if (sourceRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER) {
      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }

    const rawSourceNodeId =
      typeof operation?.sourceNodeId === 'string' ?
        operation.sourceNodeId.trim() :
        null;
    const sourceNodeId =
      rawSourceNodeId && rawSourceNodeId.length > 0 ?
        rawSourceNodeId :
        null;
    const partitionLeaderNodeId =
      this.getCriticalPartitionLeaderNodeIdForSafety(partitionRow);
    if (sourceNodeId && partitionLeaderNodeId) {
      return partitionLeaderNodeId === sourceNodeId ?
        PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER :
        PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    }
    return sourceRoleState;
  }

  getCachedCriticalReplicaRows(partitionId) {
    const systemTableCache = this.repository.systemTableCache;
    if (
      !systemTableCache ||
      typeof systemTableCache.filter !== 'function'
    ) {
      return [];
    }
    return (
      systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (row) =>
          row.partition_id === partitionId &&
          row.service_type === SERVICE_TYPE.PARTITION,
      ) || []
    );
  }
}

export {PriorityPublicationSafetyTopology};
