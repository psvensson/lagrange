import {OperationWorkflowOwnerSegment5Stage4} from './operation-workflow-owner-segment-5-stage-4.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-5-stage-shared.js';

const {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  SERVICE_TYPE,
  TYPEOF,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationContextFromRecord,
  normalizePriorityRecoveryOperationPartitionId,
} = SHARED;

class OperationWorkflowOwnerSegment5Stage5 extends OperationWorkflowOwnerSegment5Stage4 {
  isPriorityRecoveryAuthoritativeOperationReadDeferred(
    incompleteObservation = null,
  ) {
    const deferredVisibilityOutcome =
      incompleteObservation?.deferredOutcome || null;
    return (
      incompleteObservation?.state ===
        INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED ||
      deferredVisibilityOutcome?.completionState ===
        PRIORITY_RECOVERY_COMPLETION_STATE
          .AUTHORITATIVE_OPERATION_READ_DEFERRED
    );
  }

  buildDeferredPriorityRecoveryDecisionSnapshotFromPlanningMatch(
    partitionId,
    operationContexts = [],
    planningSnapshot = null,
    stepTimeoutMsByWorkflowStep = null,
    planningDecisionSnapshot = null,
  ) {
    const matchedOperationId =
      typeof planningDecisionSnapshot?.operationId === TYPEOF.STRING &&
      planningDecisionSnapshot.operationId.length > NUM.ZERO ?
        planningDecisionSnapshot.operationId :
        null;
    const matchedOperationContext =
      operationContexts.find((operationContext) => {
        return operationContext?.operationId === matchedOperationId;
      }) || null;
    const representativeOperationContext =
      operationContexts.length === NUM.ONE ? operationContexts[NUM.ZERO] : null;
    const operationId =
      matchedOperationId ||
      representativeOperationContext?.operationId ||
      null;
    return buildPriorityRecoveryDecisionSnapshot({
      partitionId,
      capturedAt: Date.now(),
      publicationConvergence: planningSnapshot,
      operationContexts,
      operationId,
      operationContext:
        matchedOperationContext || representativeOperationContext,
      stepTimeoutMsByWorkflowStep,
      authoritativeOperationReadDeferred: true,
    });
  }

  buildPriorityRecoveryDecisionSnapshotWithRetainedPlanningSerialWaitContext(
    snapshot,
    planningDecisionSnapshot,
  ) {
    if (
      !snapshot ||
      typeof snapshot !== TYPEOF.OBJECT ||
      !planningDecisionSnapshot ||
      typeof planningDecisionSnapshot !== TYPEOF.OBJECT
    ) {
      return snapshot;
    }
    const serialWaitPartitionIds =
      this.normalizePriorityRecoveryDecisionSnapshotPartitionIds(
        planningDecisionSnapshot?.coordinator?.serialWaitPartitionIds,
      );
    const serialWaitOperationIdSet = new Set();
    this.addPriorityRecoveryOperationIds(
      serialWaitOperationIdSet,
      planningDecisionSnapshot?.coordinator?.serialWaitOperationIds,
    );
    const serialWaitOperationIds = [...serialWaitOperationIdSet];
    if (
      serialWaitPartitionIds.length === NUM.ZERO &&
      serialWaitOperationIds.length === NUM.ZERO
    ) {
      return snapshot;
    }
    return Object.freeze({
      ...snapshot,
      coordinator: Object.freeze({
        ...(snapshot?.coordinator && typeof snapshot.coordinator ===
          TYPEOF.OBJECT ?
          snapshot.coordinator :
          {}),
        serialWaitOperationCount: serialWaitOperationIds.length,
        serialWaitOperationIds: Object.freeze(serialWaitOperationIds),
        serialWaitPartitionIds: Object.freeze(serialWaitPartitionIds),
      }),
    });
  }

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
        (
          this.hasPriorityRecoveryDecisionSnapshotOperationMatch(
            snapshot,
            operationIds,
          ) ||
          this.hasPriorityRecoveryDecisionSnapshotPlanningOnlyWorkflowProgressMatch(
            snapshot,
            operationIds,
          )
        )
      );
    }) || null;
  }

  buildPriorityRecoveryDecisionSnapshotForOperations(
    partitionId,
    operations = [],
    planningSnapshot = null,
    incompleteOperationObservation = null,
  ) {
    const normalizedPartitionId = String(
      partitionId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
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
    const capturedAtMs = Date.now();
    const stepTimeoutMsByWorkflowStep =
      this.buildPriorityRecoveryWorkflowStepTimeoutMap(
        operationRecords.find((operation) =>
          operation && typeof operation === TYPEOF.OBJECT,
        ) || null,
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
        incompleteOperationObservation,
      );
    const authoritativeOperationReadDeferred =
      this.isPriorityRecoveryAuthoritativeOperationReadDeferred(
        incompleteObservation,
      ) ||
      this.isPriorityRecoveryAuthoritativeOperationReadDeferred(
        incompleteOperationObservation,
      );
    const operationIds =
      this.collectPriorityRecoveryOperationIds(operationRecords);
    const planningDecisionSnapshot =
      this.resolvePriorityRecoveryDecisionSnapshotFromPlanning(
        normalizedPartitionId,
        operationRecords,
        planningSnapshot,
      );
    if (planningDecisionSnapshot) {
      if (authoritativeOperationReadDeferred !== true) {
        if (operationContexts.length === NUM.ZERO) {
          return planningDecisionSnapshot;
        }
      } else {
        return this.buildDeferredPriorityRecoveryDecisionSnapshotFromPlanningMatch(
          normalizedPartitionId,
          operationContexts,
          planningSnapshot,
          stepTimeoutMsByWorkflowStep,
          planningDecisionSnapshot,
        );
      }
    }
    const representativeOperationContext =
      operationContexts.length === NUM.ONE ? operationContexts[NUM.ZERO] : null;
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: normalizedPartitionId,
      capturedAt: capturedAtMs,
      publicationConvergence: planningSnapshot,
      operationContexts,
      operationId: representativeOperationContext?.operationId || null,
      operationContext: representativeOperationContext,
      stepTimeoutMsByWorkflowStep,
      authoritativeOperationReadDeferred,
    });
    return this
      .buildPriorityRecoveryDecisionSnapshotWithRetainedPlanningSerialWaitContext(
        snapshot,
        planningDecisionSnapshot,
      );
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
    const normalizedPartitionId = String(
      partitionId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
    if (normalizedPartitionId.length === NUM.ZERO) {
      return null;
    }
    let operationRecords = (Array.isArray(operations) ? operations : [])
      .filter((operation) => operation && typeof operation === TYPEOF.OBJECT);
    let incompleteObservation =
      this.resolvePriorityRecoveryIncompleteOperationObservation(
        operationRecords,
      );
    if (
      operationRecords.length === NUM.ZERO &&
      this.repository &&
      typeof this.repository.getOperationsByEntityAuthoritativeObservation ===
        TYPEOF.FUNCTION
    ) {
      const authoritativeObservation =
        await this.repository.getOperationsByEntityAuthoritativeObservation(
          SERVICE_TYPE.PARTITION,
          normalizedPartitionId,
        );
      const authoritativeOperations = Array.isArray(
        authoritativeObservation?.operations,
      ) ?
          authoritativeObservation.operations.filter((operation) => {
            return operation && typeof operation === TYPEOF.OBJECT;
          }) :
          [];
      if (
        authoritativeOperations.length > NUM.ZERO ||
        authoritativeObservation?.deferredOutcome
      ) {
        operationRecords = authoritativeOperations;
        incompleteObservation =
          authoritativeObservation &&
          typeof authoritativeObservation === TYPEOF.OBJECT ?
            authoritativeObservation :
            null;
      }
    }
    const representativeOperation =
      operationRecords.find(Boolean) ||
      Object.freeze({
        partitionId: normalizedPartitionId,
        entityType: SERVICE_TYPE.PARTITION,
        entityId: normalizedPartitionId,
      });
    if (!representativeOperation) {
      return null;
    }
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(representativeOperation);
    return this.buildPriorityRecoveryDecisionSnapshotForOperations(
      normalizedPartitionId,
      operationRecords,
      planningSnapshot,
      incompleteObservation,
    );
  }
}

export {OperationWorkflowOwnerSegment5Stage5};
