import {NUM} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_BOUNDARY,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_OWNER,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE,
  PUBLICATION_OPERATION_WORKFLOW_RUNTIME_PROMOTION_ALLOWED,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffNodeIdList,
  normalizePublicationActiveGateHandoffText,
} from './publication-active-gate-handoff-contract-helpers.js';

function normalizePublicationOperationWorkflowRecord(value) {
  return isPublicationActiveGateHandoffRecord(value) ? value : null;
}

function normalizePublicationOperationWorkflowHandoff(value = null) {
  const record = normalizePublicationOperationWorkflowRecord(value);
  if (!record) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const downstreamRequiredAction =
    normalizePublicationActiveGateHandoffText(
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_REQUIRED_ACTION
      ] ??
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NEXT_REQUIRED_ACTION
      ] ??
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .TOPOLOGY_OPERATOR_NEXT_ACTION
      ],
    );
  if (
    downstreamRequiredAction !==
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const partitionIds = normalizePublicationActiveGateHandoffNodeIdList(
    record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_IDS] ??
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_ID],
  );
  return Object.freeze({
    schemaVersion: PUBLICATION_OPERATION_WORKFLOW_HANDOFF_SCHEMA_VERSION,
    state: PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE.DEFERRED,
    reasonCode:
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON
        .CLASSIFIED_BACKPRESSURE,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OWNER]:
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_OWNER
        .TOPOLOGY_PUBLICATION_OWNER,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_BOUNDARY]:
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_BOUNDARY
        .PUBLICATION_CONVERGENCE,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_OWNER]:
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_OWNER.OPERATION_WORKFLOW_OWNER,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_BOUNDARY]:
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_BOUNDARY.WORKFLOW_PROGRESS,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_REQUIRED_ACTION]:
      downstreamRequiredAction,
    runtimePromotionAllowed:
      PUBLICATION_OPERATION_WORKFLOW_RUNTIME_PROMOTION_ALLOWED,
    ...(normalizePublicationActiveGateHandoffText(
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_NEXT_ACTION
      ],
    ) ? {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_NEXT_ACTION]:
          normalizePublicationActiveGateHandoffText(
            record[
              PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_NEXT_ACTION
            ],
          ),
      } :
      {}),
    ...(normalizePublicationActiveGateHandoffText(
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTUATION_STATE],
    ) ? {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTUATION_STATE]:
          normalizePublicationActiveGateHandoffText(
            record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTUATION_STATE],
          ),
      } :
      {}),
    ...(normalizePublicationActiveGateHandoffText(
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WAIT_MODE],
    ) ? {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WAIT_MODE]:
          normalizePublicationActiveGateHandoffText(
            record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WAIT_MODE],
          ),
      } :
      {}),
    ...(normalizePublicationActiveGateHandoffText(
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WORKFLOW_PROGRESS_PHASE_ID
      ] ??
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .TOPOLOGY_OPERATOR_CURRENT_STEP_ID
      ] ??
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_STEP_ID],
    ) ? {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WORKFLOW_PROGRESS_PHASE_ID]:
          normalizePublicationActiveGateHandoffText(
            record[
              PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                .WORKFLOW_PROGRESS_PHASE_ID
            ] ??
            record[
              PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                .TOPOLOGY_OPERATOR_CURRENT_STEP_ID
            ] ??
            record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_STEP_ID],
          ),
      } :
      {}),
    ...(normalizePublicationActiveGateHandoffText(
      record[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .TOPOLOGY_OPERATOR_CURRENT_STEP_STATE
      ] ??
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_STEP_STATE],
    ) ? {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .TOPOLOGY_OPERATOR_CURRENT_STEP_STATE]:
          normalizePublicationActiveGateHandoffText(
            record[
              PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                .TOPOLOGY_OPERATOR_CURRENT_STEP_STATE
            ] ??
            record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_STEP_STATE],
          ),
      } :
      {}),
    ...(partitionIds.length > NUM.ZERO ?
      {[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_IDS]: partitionIds} :
      {}),
    ...(normalizePublicationActiveGateHandoffNodeIdList(
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_IDS],
    ).length > NUM.ZERO ?
      {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_IDS]:
          normalizePublicationActiveGateHandoffNodeIdList(
            record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_IDS],
          ),
      } :
      {}),
  });
}

function collectPublicationOperationWorkflowSourceRecords(source = null) {
  const record = normalizePublicationOperationWorkflowRecord(source);
  if (!record) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const activeGate =
    normalizePublicationOperationWorkflowRecord(
      record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE],
    );
  return Object.freeze([
    record,
    record[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF
    ],
    record[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
        .PRIORITY_RECOVERY_PROGRESS_SUMMARY
    ],
    record[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
        .PRIORITY_RECOVERY_CURRENT_SUMMARY
    ],
    record[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PRIORITY_RECOVERY_OBSERVATION
    ],
    record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_PROGRESS],
    record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_BEST_PROGRESS],
    activeGate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS],
    activeGate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_PROGRESS],
    activeGate?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_BEST_PROGRESS
    ],
  ].filter(isPublicationActiveGateHandoffRecord));
}

function collectPublicationOperationWorkflowWitnessRecords(source = null) {
  return Object.freeze(
    collectPublicationOperationWorkflowSourceRecords(source)
      .flatMap((record) => {
        const partitionWitnesses = [
          ...(
            Array.isArray(
              record[
                PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                  .PRIORITY_RECOVERY_PARTITION_WITNESSES
              ],
            ) ?
              record[
                PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                  .PRIORITY_RECOVERY_PARTITION_WITNESSES
              ] :
              PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST
          ),
          ...(
            Array.isArray(
              record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_WITNESSES],
            ) ?
              record[
                PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_WITNESSES
              ] :
              PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST
          ),
        ].filter(isPublicationActiveGateHandoffRecord);
        return [
          record,
          record[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOMINANT_WITNESS],
          record[
            PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.TOPOLOGY_OPERATOR_WITNESS
          ],
          ...partitionWitnesses,
          ...partitionWitnesses
            .map((witness) => ({
              ...witness,
              ...(
                isPublicationActiveGateHandoffRecord(
                  witness[
                    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                      .TOPOLOGY_OPERATOR_WITNESS
                  ],
                ) ?
                  witness[
                    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                      .TOPOLOGY_OPERATOR_WITNESS
                  ] :
                  {}
              ),
            })),
        ].filter(isPublicationActiveGateHandoffRecord);
      }),
  );
}

function normalizePublicationOperationWorkflowWitness(record = null) {
  const witness = normalizePublicationOperationWorkflowRecord(record);
  if (!witness) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const downstreamOwner = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_OWNER] ??
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OWNER],
  );
  const downstreamBoundary = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BLOCKING_BOUNDARY] ??
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BOUNDARY],
  );
  const actuationState = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTUATION_STATE],
  );
  const waitMode = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WAIT_MODE],
  );
  const workflowProgressPhaseId = normalizePublicationActiveGateHandoffText(
    witness[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WORKFLOW_PROGRESS_PHASE_ID
    ] ??
    witness[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.TOPOLOGY_OPERATOR_CURRENT_STEP_ID
    ] ??
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_STEP_ID],
  );
  if (
    downstreamOwner !==
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_OWNER.OPERATION_WORKFLOW_OWNER ||
    downstreamBoundary !==
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_BOUNDARY.WORKFLOW_PROGRESS ||
    (
      actuationState !==
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED &&
      waitMode !== PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN &&
      workflowProgressPhaseId !==
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING
    )
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  return normalizePublicationOperationWorkflowHandoff({
    ...witness,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_REQUIRED_ACTION]:
      witness[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NEXT_REQUIRED_ACTION
      ] ??
      witness[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.TOPOLOGY_OPERATOR_NEXT_ACTION
      ],
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_OWNER]:
      witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_OWNER] ??
      witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OWNER],
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.DOWNSTREAM_BOUNDARY]:
      witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BLOCKING_BOUNDARY] ??
      witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BOUNDARY],
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_IDS]:
      witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_IDS] ??
      witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PARTITION_ID],
  });
}

function hasPublicationOperationWorkflowBackpressureWitness(record = null) {
  const witness = normalizePublicationOperationWorkflowRecord(record);
  if (!witness) {
    return false;
  }
  const downstreamOwner = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_OWNER] ??
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OWNER],
  );
  const downstreamBoundary = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BLOCKING_BOUNDARY] ??
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.BOUNDARY],
  );
  const downstreamRequiredAction = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NEXT_REQUIRED_ACTION] ??
    witness[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.TOPOLOGY_OPERATOR_NEXT_ACTION
    ],
  );
  const actuationState = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTUATION_STATE],
  );
  const waitMode = normalizePublicationActiveGateHandoffText(
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WAIT_MODE],
  );
  const workflowProgressPhaseId = normalizePublicationActiveGateHandoffText(
    witness[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.WORKFLOW_PROGRESS_PHASE_ID
    ] ??
    witness[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.TOPOLOGY_OPERATOR_CURRENT_STEP_ID
    ] ??
    witness[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CURRENT_STEP_ID],
  );
  return downstreamOwner ===
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_OWNER.OPERATION_WORKFLOW_OWNER &&
    downstreamBoundary ===
      PUBLICATION_OPERATION_WORKFLOW_HANDOFF_BOUNDARY.WORKFLOW_PROGRESS &&
    downstreamRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
    (
      actuationState ===
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED ||
      waitMode === PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN ||
      workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING
    );
}

function buildPublicationOperationWorkflowHandoff(options = {}) {
  const explicitHandoff = normalizePublicationOperationWorkflowHandoff(
    options[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF
    ] ??
    options.publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF
    ],
  );
  if (explicitHandoff) {
    return explicitHandoff;
  }
  const publicationNextAction = normalizePublicationActiveGateHandoffText(
    options.publicationNextAction ??
      options.handoffContract?.nextAction ??
      options.decision?.nextAction,
  );
  if (
    publicationNextAction !==
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const witness = [
    options.publicationConvergence,
    options.publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PRIORITY_RECOVERY_OBSERVATION
    ],
    options.priorityRecoveryObservation,
  ]
    .flatMap((source) =>
      collectPublicationOperationWorkflowWitnessRecords(source))
    .map(normalizePublicationOperationWorkflowWitness)
    .find(Boolean);
  const operationWorkflowHandoff = witness;
  if (!operationWorkflowHandoff) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  return Object.freeze({
    ...operationWorkflowHandoff,
    ...(publicationNextAction ?
      {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_NEXT_ACTION]:
          publicationNextAction,
      } :
      {}),
  });
}

export {
  normalizePublicationOperationWorkflowRecord,
  normalizePublicationOperationWorkflowHandoff,
  collectPublicationOperationWorkflowSourceRecords,
  collectPublicationOperationWorkflowWitnessRecords,
  normalizePublicationOperationWorkflowWitness,
  hasPublicationOperationWorkflowBackpressureWitness,
  buildPublicationOperationWorkflowHandoff,
};
