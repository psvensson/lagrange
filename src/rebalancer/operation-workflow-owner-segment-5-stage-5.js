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

const PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_STATE = Object.freeze({
  RETAIN_INPUT_OPERATIONS: 'retain_input_operations',
  USE_AUTHORITATIVE_OBSERVATION: 'use_authoritative_observation',
});

const PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_STATE
          .USE_AUTHORITATIVE_OBSERVATION,
      matches: (evidence) =>
        evidence.authoritativeOperationAvailable === true ||
        evidence.authoritativeDeferred === true ||
        evidence.authoritativeResolvedEmpty === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_STATE
          .RETAIN_INPUT_OPERATIONS,
      matches: () => true,
    }),
  ]);

const PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE = Object.freeze({
  EXPLICIT_DEFERRED: 'explicit_deferred',
  REPOSITORY_RESOLVED: 'repository_resolved',
  EXPLICIT_FALLBACK: 'explicit_fallback',
  ABSENT: 'absent',
});

const PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE
          .EXPLICIT_DEFERRED,
      matches: (evidence) => evidence.explicitDeferred === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE
          .REPOSITORY_RESOLVED,
      matches: (evidence) => evidence.repositoryObservationAvailable === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE
          .EXPLICIT_FALLBACK,
      matches: (evidence) => evidence.explicitObservationAvailable === true,
    }),
    Object.freeze({
      state: PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE.ABSENT,
      matches: () => true,
    }),
  ]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL =
  Object.freeze({
    ADVANCE_EXISTING_OPERATION: 'advance_existing_operation',
    CONTRACT_PENDING: 'pending',
    DISPATCH_PENDING: 'dispatch_pending',
    EVENT_DRIVEN: 'event_driven',
    OPERATION_WORKFLOW_OWNER: 'operation_workflow_owner',
    PENDING_STEP: 'PENDING',
    PERSISTED_NOT_DISPATCHED: 'persisted_not_dispatched',
    RECOVERING_IN_FLIGHT: 'recovering_in_flight',
    RECONCILE_STALE_OPERATION_PROGRESS:
      'reconcile_stale_operation_progress',
    RETRY: 'retry',
    TIMEOUT_RECONCILE_DUE: 'timeout_reconcile_due',
    TRANSITION_DEFERRED: 'transition_deferred',
    WAIT: 'wait',
    WAIT_FOR_OPERATION_PROGRESS: 'wait_for_operation_progress',
    WORKFLOW_PROGRESS: 'workflow_progress',
    WORKFLOW_TIMEOUT: 'workflow_timeout',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_BLOCKER_REASONS =
  Object.freeze({
    NONE: Object.freeze([]),
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE =
  Object.freeze({
    ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT:
      'advance_owner_progress_from_timeout',
    ADVANCE_OWNER_PROGRESS_FROM_WAIT: 'advance_owner_progress_from_wait',
    RETAIN_SNAPSHOT: 'retain_snapshot',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT,
      matches: (evidence) =>
        evidence.currentOwner ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .OPERATION_WORKFLOW_OWNER &&
        evidence.actuationOwner ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .OPERATION_WORKFLOW_OWNER &&
        evidence.nextRequiredAction ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .RECONCILE_STALE_OPERATION_PROGRESS &&
        evidence.blockingBoundary ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .WORKFLOW_TIMEOUT &&
        evidence.waitMode ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .TIMEOUT_RECONCILE_DUE &&
        evidence.actuationState ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .TRANSITION_DEFERRED &&
        evidence.workflowProgressPhaseId ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .DISPATCH_PENDING &&
        evidence.latestWorkflowStep ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .PENDING_STEP,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_WAIT,
      matches: (evidence) =>
        evidence.currentOwner ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .OPERATION_WORKFLOW_OWNER &&
        evidence.actuationOwner ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .OPERATION_WORKFLOW_OWNER &&
        evidence.nextRequiredAction ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .WAIT_FOR_OPERATION_PROGRESS &&
        evidence.blockingBoundary ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .WORKFLOW_PROGRESS &&
        evidence.actuationState ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .PERSISTED_NOT_DISPATCHED &&
        evidence.workflowProgressPhaseId ===
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .DISPATCH_PENDING,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .RETAIN_SNAPSHOT,
      matches: () => true,
    }),
  ]);

class OperationWorkflowOwnerSegment5Stage5 extends OperationWorkflowOwnerSegment5Stage4 {
  resolvePriorityRecoveryDispatchPendingReclassificationState(
    snapshot = null,
  ) {
    return (
      PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_TABLE.find((entry) =>
        entry.matches({
          currentOwner:
            snapshot?.progress?.currentOwner ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          actuationOwner:
            snapshot?.actuation?.owner ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          nextRequiredAction:
            snapshot?.progress?.nextRequiredAction ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          waitMode:
            snapshot?.progress?.waitMode ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          blockingBoundary:
            snapshot?.progress?.blockingBoundary ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          actuationState:
            snapshot?.actuation?.state ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          workflowProgressPhaseId:
            snapshot?.progress?.workflowProgressPhaseId ||
            snapshot?.actuation?.workflowProgressPhaseId ||
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          latestWorkflowStep: String(
            snapshot?.coordinator?.operation?.workflowStep ||
              OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
          ).trim().toUpperCase(),
        }),
      )?.state ||
      PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE.RETAIN_SNAPSHOT
    );
  }

  reclassifyPriorityRecoveryDispatchPendingSnapshot(snapshot = null) {
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return snapshot;
    }
    const reclassificationState =
      this.resolvePriorityRecoveryDispatchPendingReclassificationState(
        snapshot,
      );
    if (
      reclassificationState !==
      PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT &&
      reclassificationState !==
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_WAIT
    ) {
      return snapshot;
    }
    const progress =
      snapshot.progress && typeof snapshot.progress === TYPEOF.OBJECT ?
        snapshot.progress :
        {};
    const actuation =
      snapshot.actuation && typeof snapshot.actuation === TYPEOF.OBJECT ?
        snapshot.actuation :
        {};
    const reclassifiedProgress =
      reclassificationState ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
        Object.freeze({
          ...progress,
          contractState:
            PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
              .CONTRACT_PENDING,
          nextAction:
            PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL.WAIT,
          nextRequiredAction:
            PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
              .ADVANCE_EXISTING_OPERATION,
          blockingBoundary:
            PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
              .WORKFLOW_PROGRESS,
          waitMode:
            PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
              .EVENT_DRIVEN,
        }) :
        Object.freeze({
          ...progress,
          nextRequiredAction:
            PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
              .ADVANCE_EXISTING_OPERATION,
        });
    return Object.freeze({
      ...snapshot,
      blockerReasons:
        reclassificationState ===
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_BLOCKER_REASONS
            .NONE :
          snapshot.blockerReasons,
      semanticState:
        reclassificationState ===
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
          PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
            .RECOVERING_IN_FLIGHT :
          snapshot.semanticState,
      actuation:
        reclassificationState ===
        PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
          Object.freeze({
            ...actuation,
            state:
              PRIORITY_RECOVERY_DISPATCH_PENDING_RECLASSIFICATION_LITERAL
                .PERSISTED_NOT_DISPATCHED,
          }) :
          snapshot.actuation,
      progress: reclassifiedProgress,
    });
  }

  decidePriorityRecoveryPartitionObservationSelection(evidence = {}) {
    return (
      PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_STATE
        .RETAIN_INPUT_OPERATIONS
    );
  }

  adoptPriorityRecoveryPartitionAuthoritativeObservation(
    operationRecords = [],
    incompleteObservation = null,
    authoritativeObservation = null,
  ) {
    const authoritativeOperations = Array.isArray(
      authoritativeObservation?.operations,
    ) ?
        authoritativeObservation.operations.filter((operation) => {
          return operation && typeof operation === TYPEOF.OBJECT;
        }) :
        [];
    const selection =
      this.decidePriorityRecoveryPartitionObservationSelection({
        authoritativeOperationAvailable:
          authoritativeOperations.length > NUM.ZERO,
        authoritativeDeferred:
          this.isPriorityRecoveryAuthoritativeOperationReadDeferred(
            authoritativeObservation,
          ),
        authoritativeResolvedEmpty:
          this.isPriorityRecoveryAuthoritativeOperationObservationResolvedEmpty(
            authoritativeObservation,
            authoritativeOperations,
          ),
      });
    if (
      selection ===
      PRIORITY_RECOVERY_PARTITION_OBSERVATION_SELECTION_STATE
        .USE_AUTHORITATIVE_OBSERVATION
    ) {
      return Object.freeze({
        operationRecords: authoritativeOperations,
        incompleteObservation:
          authoritativeObservation &&
          typeof authoritativeObservation === TYPEOF.OBJECT ?
            authoritativeObservation :
            null,
      });
    }
    return Object.freeze({
      operationRecords,
      incompleteObservation,
    });
  }

  resolvePriorityRecoveryDecisionIncompleteObservation(
    operationRecords = [],
    explicitObservation = null,
  ) {
    const repositoryObservation =
      this.resolvePriorityRecoveryIncompleteOperationObservation(
        operationRecords,
        explicitObservation,
      );
    const selection =
      PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_TABLE.find((entry) =>
        entry.matches({
          explicitDeferred:
            this.isPriorityRecoveryAuthoritativeOperationReadDeferred(
              explicitObservation,
            ),
          explicitObservationAvailable:
            explicitObservation &&
            typeof explicitObservation === TYPEOF.OBJECT,
          repositoryObservationAvailable:
            repositoryObservation &&
            typeof repositoryObservation === TYPEOF.OBJECT,
        }),
      )?.state ||
      PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE.ABSENT;
    if (
      selection ===
      PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE
        .EXPLICIT_DEFERRED
    ) {
      return explicitObservation;
    }
    if (
      selection ===
      PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE
        .REPOSITORY_RESOLVED
    ) {
      return repositoryObservation;
    }
    if (
      selection ===
      PRIORITY_RECOVERY_INCOMPLETE_OBSERVATION_SELECTION_STATE
        .EXPLICIT_FALLBACK
    ) {
      return explicitObservation;
    }
    return null;
  }

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

  isPriorityRecoveryAuthoritativeOperationObservationResolvedEmpty(
    incompleteObservation = null,
    authoritativeOperations = [],
  ) {
    return (
      this.isPriorityRecoveryAuthoritativeOperationReadDeferred(
        incompleteObservation,
      ) !== true &&
      (
        incompleteObservation?.state ===
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY ||
        (
          incompleteObservation &&
          typeof incompleteObservation === TYPEOF.OBJECT &&
          authoritativeOperations.length === NUM.ZERO &&
          incompleteObservation?.operationCount === NUM.ZERO
        )
      )
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
      this.resolvePriorityRecoveryDecisionIncompleteObservation(
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
          return this.reclassifyPriorityRecoveryDispatchPendingSnapshot(
            planningDecisionSnapshot,
          );
        }
      } else {
        return this.reclassifyPriorityRecoveryDispatchPendingSnapshot(
          this
            .buildPriorityRecoveryDecisionSnapshotWithRetainedPlanningSerialWaitContext(
              this.buildDeferredPriorityRecoveryDecisionSnapshotFromPlanningMatch(
                normalizedPartitionId,
                operationContexts,
                planningSnapshot,
                stepTimeoutMsByWorkflowStep,
                planningDecisionSnapshot,
              ),
              planningDecisionSnapshot,
            ),
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
    return this.reclassifyPriorityRecoveryDispatchPendingSnapshot(
      this
        .buildPriorityRecoveryDecisionSnapshotWithRetainedPlanningSerialWaitContext(
          snapshot,
          planningDecisionSnapshot,
        ),
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
    let incompleteObservation = null;
    if (
      this.repository &&
      typeof this.repository.getOperationsByEntityAuthoritativeObservation ===
        TYPEOF.FUNCTION
    ) {
      const authoritativeObservation =
        await this.repository.getOperationsByEntityAuthoritativeObservation(
          SERVICE_TYPE.PARTITION,
          normalizedPartitionId,
        );
      const adoptedObservation =
        this.adoptPriorityRecoveryPartitionAuthoritativeObservation(
          operationRecords,
          incompleteObservation,
          authoritativeObservation,
        );
      operationRecords = adoptedObservation.operationRecords;
      incompleteObservation = adoptedObservation.incompleteObservation;
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
