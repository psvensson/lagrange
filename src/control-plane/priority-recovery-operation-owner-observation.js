import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
} from '../rebalancer/operation-workflow-owner-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from './owner-contract-outcome.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
} from './priority-recovery-diagnostics-constants.js';

const PRIORITY_RECOVERY_OPERATION_OWNER_TEXT = Object.freeze({
  EMPTY: '',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_OUTCOME_FIELD = Object.freeze({
  OPERATION_OWNER_OUTCOME: 'operationOwnerOutcome',
  OPERATION_OWNER_OBSERVATION: 'operationOwnerObservation',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_OBSERVATION_STATE = Object.freeze({
  OBSERVED: 'operation_owner_outcome_observed',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION = Object.freeze({
  NOT_EXECUTED: 'not_executed',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_ABSENCE_VARIANT = Object.freeze({
  OWNER_STATE_UNAVAILABLE: 'operation_owner_state_unavailable',
  CORRELATION_KEY_UNAVAILABLE: 'operation_owner_correlation_unavailable',
  SOURCE_REVISION_UNAVAILABLE: 'operation_owner_revision_unavailable',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE = Object.freeze({
  REPLACE: 'replace',
  RETAIN: 'retain',
});

const PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR = Object.freeze({
  WAIT_FOR_OPERATION_PROGRESS: Object.freeze({
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  }),
  ADVANCE_EXISTING_OPERATION: Object.freeze({
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  }),
  WAIT_FOR_REBALANCER_HANDOFF_RETRY: Object.freeze({
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
    waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
  }),
  OBSERVE_AUTHORITATIVE_VISIBILITY: Object.freeze({
    contractState: OWNER_CONTRACT_STATE.DEFERRED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    currentOwner:
      PRIORITY_RECOVERY_PROGRESS_OWNER.AUTHORITATIVE_VISIBILITY_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.OBSERVE_AUTHORITATIVE_VISIBILITY,
    blockingBoundary:
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.AUTHORITATIVE_VISIBILITY,
    waitMode: PRIORITY_RECOVERY_WAIT_MODE.DEFERRED_VISIBILITY,
  }),
});

const PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_RESOLVER = Object.freeze({
  [PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE]:
    (replacement) => replacement,
  [PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.RETAIN]:
    (_replacement, currentValue) => currentValue,
});

function buildPriorityRecoveryOperationOwnerDescriptor(options = {}) {
  return Object.freeze({
    progressMode:
      options.progressMode ||
      PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
    progress: options.progress,
    blockerReasonsMode:
      options.blockerReasonsMode ||
      PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.RETAIN,
    blockerReasons: Object.freeze(
      Array.isArray(options.blockerReasons) ? options.blockerReasons : [],
    ),
    semanticStateMode:
      options.semanticStateMode ||
      PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.RETAIN,
    semanticState:
      options.semanticState ||
      PRIORITY_RECOVERY_OPERATION_OWNER_ABSENCE_VARIANT
        .OWNER_STATE_UNAVAILABLE,
    actuationMode:
      options.actuationMode ||
      PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.RETAIN,
    actuation: Object.freeze(options.actuation || {}),
  });
}

const PRIORITY_RECOVERY_OPERATION_OWNER_RETAIN_DESCRIPTOR =
  buildPriorityRecoveryOperationOwnerDescriptor({
    progressMode: PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.RETAIN,
  });

function buildPriorityRecoveryOperationOwnerDescriptorEvidence(
  ownerOutcome,
) {
  return Object.freeze({
    ownerOutcome,
  });
}

const PRIORITY_RECOVERY_OPERATION_OWNER_DESCRIPTOR_TABLE = Object.freeze([
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_SERIAL_OPERATION,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .WAIT_FOR_OPERATION_PROGRESS,
      blockerReasonsMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      blockerReasons: Object.freeze([
        PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
      ]),
      semanticStateMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      actuationMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      actuation: Object.freeze({
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
        state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
      }),
    }),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
        OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER ||
      evidence.ownerOutcome.outcome ===
        OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .ADVANCE_EXISTING_OPERATION,
      blockerReasonsMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      blockerReasons: Object.freeze([]),
      semanticStateMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      actuationMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      actuation: Object.freeze({
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
        state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      }),
    }),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .ADVANCE_EXISTING_OPERATION,
      blockerReasonsMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      blockerReasons: Object.freeze([]),
      semanticStateMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    }),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
        OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .ADVANCE_EXISTING_OPERATION,
      blockerReasonsMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      blockerReasons: Object.freeze([]),
      semanticStateMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      actuationMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      actuation: Object.freeze({
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
        state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      }),
    }),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_REBALANCER_HANDOFF_RETRY,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .WAIT_FOR_REBALANCER_HANDOFF_RETRY,
      blockerReasonsMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      blockerReasons: Object.freeze([]),
      semanticStateMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      actuationMode:
        PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.REPLACE,
      actuation: Object.freeze({
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
        state:
          PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      }),
    }),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .WAIT_FOR_OPERATION_PROGRESS,
    }),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerOutcome.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.DEFER_AUTHORITATIVE_VISIBILITY,
    descriptor: buildPriorityRecoveryOperationOwnerDescriptor({
      progress:
        PRIORITY_RECOVERY_OPERATION_OWNER_PROGRESS_DESCRIPTOR
          .OBSERVE_AUTHORITATIVE_VISIBILITY,
    }),
  }),
  Object.freeze({
    matches: () => true,
    descriptor: PRIORITY_RECOVERY_OPERATION_OWNER_RETAIN_DESCRIPTOR,
  }),
]);

function isPriorityRecoveryOperationOwnerObservationObject(value) {
  return Boolean(value && typeof value === TYPEOF.OBJECT);
}

function normalizePriorityRecoveryOperationOwnerString(
  value,
  fallback,
) {
  const normalizedValue =
    typeof value === TYPEOF.STRING ?
      value.trim() :
      PRIORITY_RECOVERY_OPERATION_OWNER_TEXT.EMPTY;
  return normalizedValue.length > NUM.ZERO ? normalizedValue : fallback;
}

function normalizePriorityRecoveryOperationOwnerReasons(reasons) {
  return Object.freeze(
    (Array.isArray(reasons) ? reasons : [])
      .map((reason) =>
        normalizePriorityRecoveryOperationOwnerString(
          reason,
          PRIORITY_RECOVERY_OPERATION_OWNER_TEXT.EMPTY,
        ),
      )
      .filter((reason) => reason.length > NUM.ZERO),
  );
}

function isPriorityRecoveryOperationOwnerOutcome(value) {
  return (
    isPriorityRecoveryOperationOwnerObservationObject(value) &&
    value.owner === OPERATION_WORKFLOW_OWNER &&
    value.boundary === OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL &&
    typeof value.outcome === TYPEOF.STRING &&
    value.outcome.length > NUM.ZERO
  );
}

function resolvePriorityRecoveryOperationOwnerOutcome(
  snapshot,
  explicitOwnerOutcome,
) {
  return (
    [
      explicitOwnerOutcome,
      snapshot?.[
        PRIORITY_RECOVERY_OPERATION_OWNER_OUTCOME_FIELD
          .OPERATION_OWNER_OUTCOME
      ],
      snapshot?.progress?.[
        PRIORITY_RECOVERY_OPERATION_OWNER_OUTCOME_FIELD
          .OPERATION_OWNER_OUTCOME
      ],
    ].find((candidate) =>
      isPriorityRecoveryOperationOwnerOutcome(candidate),
    ) || null
  );
}

function resolvePriorityRecoveryOperationOwnerDescriptor(
  ownerOutcome,
) {
  const evidence = buildPriorityRecoveryOperationOwnerDescriptorEvidence(
    ownerOutcome,
  );
  return (
    PRIORITY_RECOVERY_OPERATION_OWNER_DESCRIPTOR_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.descriptor || PRIORITY_RECOVERY_OPERATION_OWNER_RETAIN_DESCRIPTOR
  );
}

function resolvePriorityRecoveryOperationOwnerField(
  updateMode,
  replacement,
  currentValue,
) {
  return (
    PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_RESOLVER[updateMode] ||
    PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_RESOLVER[
      PRIORITY_RECOVERY_OPERATION_OWNER_FIELD_UPDATE_MODE.RETAIN
    ]
  )(replacement, currentValue);
}

function buildPriorityRecoveryOperationOwnerObservation(
  ownerOutcome,
  descriptor,
) {
  return Object.freeze({
    state: PRIORITY_RECOVERY_OPERATION_OWNER_OBSERVATION_STATE.OBSERVED,
    owner: ownerOutcome.owner,
    boundary: ownerOutcome.boundary,
    ownerState: normalizePriorityRecoveryOperationOwnerString(
      ownerOutcome.state,
      PRIORITY_RECOVERY_OPERATION_OWNER_ABSENCE_VARIANT
        .OWNER_STATE_UNAVAILABLE,
    ),
    outcome: ownerOutcome.outcome,
    nextRequiredAction: normalizePriorityRecoveryOperationOwnerString(
      ownerOutcome.nextRequiredAction,
      ownerOutcome.outcome,
    ),
    effectCommand: normalizePriorityRecoveryOperationOwnerString(
      ownerOutcome.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
    ),
    effectExecution:
      PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION.NOT_EXECUTED,
    requestedOwnerAction:
      descriptor.progress?.nextRequiredAction ||
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE,
    reasons: normalizePriorityRecoveryOperationOwnerReasons(
      ownerOutcome.reasons,
    ),
    correlationKey: normalizePriorityRecoveryOperationOwnerString(
      ownerOutcome.correlationKey,
      PRIORITY_RECOVERY_OPERATION_OWNER_ABSENCE_VARIANT
        .CORRELATION_KEY_UNAVAILABLE,
    ),
    sourceRevision: normalizePriorityRecoveryOperationOwnerString(
      ownerOutcome.sourceRevision,
      PRIORITY_RECOVERY_OPERATION_OWNER_ABSENCE_VARIANT
        .SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function buildPriorityRecoveryOperationOwnerProgress(
  snapshot,
  descriptor,
) {
  return Object.freeze({
    ...(isPriorityRecoveryOperationOwnerObservationObject(snapshot.progress) ?
      snapshot.progress :
      {}),
    ...resolvePriorityRecoveryOperationOwnerField(
      descriptor.progressMode,
      descriptor.progress,
      {},
    ),
  });
}

function buildPriorityRecoveryOperationOwnerActuation(
  snapshot,
  descriptor,
) {
  return Object.freeze({
    ...(isPriorityRecoveryOperationOwnerObservationObject(snapshot.actuation) ?
      snapshot.actuation :
      {}),
    ...resolvePriorityRecoveryOperationOwnerField(
      descriptor.actuationMode,
      descriptor.actuation,
      {},
    ),
  });
}

function normalizePriorityRecoverySnapshotFromOperationOwnerOutcome(
  snapshot,
  explicitOwnerOutcome = null,
) {
  if (!isPriorityRecoveryOperationOwnerObservationObject(snapshot)) {
    return snapshot;
  }
  const ownerOutcome = resolvePriorityRecoveryOperationOwnerOutcome(
    snapshot,
    explicitOwnerOutcome,
  );
  if (!ownerOutcome) {
    return snapshot;
  }
  const descriptor =
    resolvePriorityRecoveryOperationOwnerDescriptor(ownerOutcome);
  const operationOwnerObservation =
    buildPriorityRecoveryOperationOwnerObservation(ownerOutcome, descriptor);
  return Object.freeze({
    ...snapshot,
    [PRIORITY_RECOVERY_OPERATION_OWNER_OUTCOME_FIELD
      .OPERATION_OWNER_OBSERVATION]: operationOwnerObservation,
    blockerReasons: resolvePriorityRecoveryOperationOwnerField(
      descriptor.blockerReasonsMode,
      Object.freeze([...descriptor.blockerReasons]),
      snapshot.blockerReasons,
    ),
    semanticState: resolvePriorityRecoveryOperationOwnerField(
      descriptor.semanticStateMode,
      descriptor.semanticState,
      snapshot.semanticState,
    ),
    actuation: buildPriorityRecoveryOperationOwnerActuation(
      snapshot,
      descriptor,
    ),
    progress: buildPriorityRecoveryOperationOwnerProgress(
      snapshot,
      descriptor,
    ),
  });
}

export {
  PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION,
  PRIORITY_RECOVERY_OPERATION_OWNER_OBSERVATION_STATE,
  buildPriorityRecoveryOperationOwnerObservation,
  isPriorityRecoveryOperationOwnerOutcome,
  normalizePriorityRecoverySnapshotFromOperationOwnerOutcome,
  resolvePriorityRecoveryOperationOwnerDescriptor,
  resolvePriorityRecoveryOperationOwnerOutcome,
};
