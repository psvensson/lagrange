import {OperationWorkflowOwnerSegment5Stage4} from './operation-workflow-owner-segment-5-stage-4.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-5-stage-shared.js';

const {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  TYPEOF,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationContextFromRecord,
  normalizePriorityRecoveryOperationPartitionId,
} = SHARED;

class OperationWorkflowOwnerSegment5Stage5 extends OperationWorkflowOwnerSegment5Stage4 {
  resolvePriorityRecoveryDecisionSnapshotFromPlanning(
    partitionId,
    operations = [],
    planningSnapshot = null,
  ) {
    const normalizedPartitionId = String(
      partitionId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    const snapshots = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots :
      [];
    if (
      normalizedPartitionId.length === NUM.ZERO ||
      snapshots.length === NUM.ZERO
    ) {
      return null;
    }
    const operationIds = this.collectPriorityRecoveryOperationIds(operations);
    return snapshots.find((snapshot) => {
      const snapshotPartitionId = String(
        snapshot?.partitionId ||
          OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
      ).trim();
      return (
        snapshotPartitionId === normalizedPartitionId &&
        this.hasPriorityRecoveryDecisionSnapshotOperationMatch(
          snapshot,
          operationIds,
        )
      );
    }) || null;
  }

  buildPriorityRecoveryDecisionSnapshotForOperations(
    partitionId,
    operations = [],
    planningSnapshot = null,
  ) {
    const normalizedPartitionId = String(partitionId || '').trim();
    if (
      normalizedPartitionId.length === NUM.ZERO ||
      !planningSnapshot ||
      typeof planningSnapshot !== TYPEOF.OBJECT
    ) {
      return null;
    }
    const operationRecords = (Array.isArray(operations) ? operations : [])
      .filter((operation) => {
        return operation && typeof operation === TYPEOF.OBJECT;
      });
    const planningDecisionSnapshot =
      this.resolvePriorityRecoveryDecisionSnapshotFromPlanning(
        normalizedPartitionId,
        operationRecords,
        planningSnapshot,
      );
    if (planningDecisionSnapshot) {
      return planningDecisionSnapshot;
    }
    const representativeOperationRecord =
      operationRecords.find((operation) =>
        operation && typeof operation === TYPEOF.OBJECT,
      ) || null;
    const capturedAtMs = Date.now();
    const stepTimeoutMsByWorkflowStep =
      this.buildPriorityRecoveryWorkflowStepTimeoutMap(
        representativeOperationRecord,
      );
    const operationContexts = operationRecords
      .map((operation) =>
        buildPriorityRecoveryOperationContextFromRecord(
          operation,
          {
            nowMs: capturedAtMs,
            stepTimeoutMsByWorkflowStep,
          },
        ),
      )
      .filter((operationContext) => {
        return (
          operationContext &&
          operationContext.partitionId === normalizedPartitionId
        );
      });
    const incompleteObservation =
      this.resolvePriorityRecoveryIncompleteOperationObservation(
        operationRecords,
      );
    const deferredVisibilityOutcome =
      incompleteObservation?.deferredOutcome || null;
    const authoritativeOperationReadDeferred =
      incompleteObservation?.state ===
        INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED ||
      deferredVisibilityOutcome?.completionState ===
        PRIORITY_RECOVERY_COMPLETION_STATE
          .AUTHORITATIVE_OPERATION_READ_DEFERRED;
    const representativeOperationContext =
      operationContexts.length === NUM.ONE ? operationContexts[NUM.ZERO] : null;
    return buildPriorityRecoveryDecisionSnapshot({
      partitionId: normalizedPartitionId,
      capturedAt: capturedAtMs,
      publicationConvergence: planningSnapshot,
      operationContexts,
      operationId: representativeOperationContext?.operationId || null,
      operationContext: representativeOperationContext,
      stepTimeoutMsByWorkflowStep,
      authoritativeOperationReadDeferred,
    });
  }

  async getPriorityRecoveryDecisionSnapshotForOperation(operation) {
    const partitionId = normalizePriorityRecoveryOperationPartitionId(
      operation,
    );
    if (partitionId.length === NUM.ZERO) {
      return null;
    }
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    return this.buildPriorityRecoveryDecisionSnapshotForOperations(
      partitionId,
      [operation],
      planningSnapshot,
    );
  }

  async getPriorityRecoveryDecisionSnapshotForPartitionOperations(
    partitionId,
    operations = [],
  ) {
    const representativeOperation = (Array.isArray(operations) ? operations : [])
      .find((operation) => operation && typeof operation === TYPEOF.OBJECT);
    if (!representativeOperation) {
      return null;
    }
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(representativeOperation);
    return this.buildPriorityRecoveryDecisionSnapshotForOperations(
      partitionId,
      operations,
      planningSnapshot,
    );
  }
}

export {OperationWorkflowOwnerSegment5Stage5};
