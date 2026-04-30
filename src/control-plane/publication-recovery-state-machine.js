import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';

const PUBLICATION_RECOVERY_TEXT = Object.freeze({
  EMPTY: '',
  CURRENT: 'current',
  UNKNOWN: 'UNKNOWN',
  PUBLICATION_RECOVERY: 'publication_recovery',
});

const PUBLICATION_RECOVERY_EVIDENCE_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ACKNOWLEDGEMENT_CHANGED: 'acknowledgementChanged',
  AVAILABLE: 'available',
  CONTEXT: 'context',
  PENDING_ACK_COUNT: 'pendingAckCount',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SATISFIED_FLAG_IDS: 'satisfiedFlagIds',
  STATUS: 'status',
});

const PUBLICATION_RECOVERY_MACHINE_CONTEXT = Object.freeze({
  ACK_WRITE: 'ack_write',
  METADATA_REFRESH: 'metadata_refresh',
  PREFLIGHT: 'preflight',
});

const PUBLICATION_RECOVERY_MACHINE_ACTION = Object.freeze({
  CLOSE_ACK_COMPLETE: 'close_ack_complete',
  PRESERVE_STATUS: 'preserve_status',
  RECORD_ACK: 'record_ack',
  REPORT_CLOSED: 'report_closed',
  REPORT_OPEN: 'report_open',
  REPORT_UNAVAILABLE: 'report_unavailable',
});

const PUBLICATION_RECOVERY_EVIDENCE_FLAG = Object.freeze({
  ACK_CHANGED: 'ack_changed',
  ACKS_COMPLETE: 'acks_complete',
  ACKS_PENDING: 'acks_pending',
  ACKS_REQUIRED: 'acks_required',
  AVAILABLE: 'available',
  MISSING_PUBLISHED_MEMBERS: 'missing_published_members',
  STATUS_NON_TERMINAL: 'status_non_terminal',
  STATUS_PUBLISHED: 'status_published',
  STATUS_TERMINAL: 'status_terminal',
  UNAVAILABLE: 'unavailable',
});

const PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE = Object.freeze({
  COUNT_ONLY: 'count_only',
  REQUIRED_ACK_NODE_LIST: 'required_ack_node_list',
});

const PUBLICATION_RECOVERY_REASON = Object.freeze({
  ACKNOWLEDGEMENT_RECORDED: 'acknowledgement_recorded',
  PUBLICATION_ACK_PENDING: 'publication_ack_pending',
  PUBLICATION_MISSING_PUBLISHED_MEMBERS:
    'publication_missing_published_members',
  PUBLICATION_UNAVAILABLE: 'publication_unavailable',
  REQUIRED_ACKNOWLEDGEMENTS_COMPLETED:
    'required_acknowledgements_completed',
});

const PUBLICATION_RECOVERY_INVARIANT_ID = Object.freeze({
  ACK_COMPLETE_NON_TERMINAL: 'publication_ack_complete_non_terminal',
  PUBLISHED_WITH_PENDING_ACK: 'publication_published_with_pending_ack',
});

const PUBLICATION_RECOVERY_LIVENESS_ID = Object.freeze({
  ACK_COMPLETE_EVENTUALLY_PUBLISHED:
    'ack_complete_eventually_published',
  ACK_PENDING_EVENTUALLY_PUBLISHED:
    'ack_pending_eventually_published',
  MISSING_PUBLISHED_EVENTUALLY_VISIBLE:
    'missing_published_eventually_visible',
});

const PUBLICATION_RECOVERY_TRANSITION_ID = Object.freeze({
  CLOSE_ACK_COMPLETE: 'close_ack_complete',
  PRESERVE_STATUS: 'preserve_status',
  PREFLIGHT_ACK_PENDING: 'preflight_ack_pending',
  PREFLIGHT_MISSING_PUBLISHED: 'preflight_missing_published',
  PREFLIGHT_PUBLISHED: 'preflight_published',
  PREFLIGHT_UNAVAILABLE: 'preflight_unavailable',
  RECORD_ACK: 'record_ack',
});

const PUBLICATION_RECOVERY_INVARIANT_SEVERITY = Object.freeze({
  FAILURE: 'failure',
  WARNING: 'warning',
});

const PUBLICATION_RECOVERY_TERMINAL_PUBLICATION_STATUSES = Object.freeze([
  CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
  CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED,
  CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED,
]);

const PUBLICATION_RECOVERY_MACHINE_SPEC = Object.freeze({
  id: PUBLICATION_RECOVERY_TEXT.PUBLICATION_RECOVERY,
  terminalPublicationStatuses:
    PUBLICATION_RECOVERY_TERMINAL_PUBLICATION_STATUSES,
  evidenceFlags: Object.freeze(Object.values(PUBLICATION_RECOVERY_EVIDENCE_FLAG)),
  transitions: Object.freeze([
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.CLOSE_ACK_COMPLETE,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.ACK_WRITE,
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.METADATA_REFRESH,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_REQUIRED,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_COMPLETE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_NON_TERMINAL,
      ]),
      unless: Object.freeze([]),
      nextStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE,
      reasonCode:
        PUBLICATION_RECOVERY_REASON.REQUIRED_ACKNOWLEDGEMENTS_COMPLETED,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.RECORD_ACK,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.ACK_WRITE,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACK_CHANGED,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_NON_TERMINAL,
      ]),
      unless: Object.freeze([]),
      nextStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.RECORD_ACK,
      reasonCode: PUBLICATION_RECOVERY_REASON.ACKNOWLEDGEMENT_RECORDED,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.PREFLIGHT_ACK_PENDING,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING,
      ]),
      unless: Object.freeze([]),
      nextStatus: PUBLICATION_RECOVERY_TEXT.CURRENT,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_OPEN,
      reasonCode: PUBLICATION_RECOVERY_REASON.PUBLICATION_ACK_PENDING,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.PREFLIGHT_MISSING_PUBLISHED,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.MISSING_PUBLISHED_MEMBERS,
      ]),
      unless: Object.freeze([]),
      nextStatus: PUBLICATION_RECOVERY_TEXT.CURRENT,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_OPEN,
      reasonCode:
        PUBLICATION_RECOVERY_REASON.PUBLICATION_MISSING_PUBLISHED_MEMBERS,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.PREFLIGHT_PUBLISHED,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_PUBLISHED,
      ]),
      unless: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.MISSING_PUBLISHED_MEMBERS,
      ]),
      nextStatus: PUBLICATION_RECOVERY_TEXT.CURRENT,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_CLOSED,
      reasonCode: PUBLICATION_RECOVERY_TEXT.EMPTY,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.PREFLIGHT_UNAVAILABLE,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.UNAVAILABLE,
      ]),
      unless: Object.freeze([]),
      nextStatus: PUBLICATION_RECOVERY_TEXT.CURRENT,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_UNAVAILABLE,
      reasonCode: PUBLICATION_RECOVERY_REASON.PUBLICATION_UNAVAILABLE,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_TRANSITION_ID.PRESERVE_STATUS,
      contexts: Object.freeze([
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.ACK_WRITE,
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.METADATA_REFRESH,
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
      ]),
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
      ]),
      unless: Object.freeze([]),
      nextStatus: PUBLICATION_RECOVERY_TEXT.CURRENT,
      action: PUBLICATION_RECOVERY_MACHINE_ACTION.PRESERVE_STATUS,
      reasonCode: PUBLICATION_RECOVERY_TEXT.EMPTY,
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: PUBLICATION_RECOVERY_INVARIANT_ID.PUBLISHED_WITH_PENDING_ACK,
      severity: PUBLICATION_RECOVERY_INVARIANT_SEVERITY.FAILURE,
      forbid: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_PUBLISHED,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING,
      ]),
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_INVARIANT_ID.ACK_COMPLETE_NON_TERMINAL,
      severity: PUBLICATION_RECOVERY_INVARIANT_SEVERITY.FAILURE,
      forbid: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_NON_TERMINAL,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_REQUIRED,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_COMPLETE,
      ]),
    }),
  ]),
  liveness: Object.freeze([
    Object.freeze({
      id: PUBLICATION_RECOVERY_LIVENESS_ID.ACK_COMPLETE_EVENTUALLY_PUBLISHED,
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_NON_TERMINAL,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_REQUIRED,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_COMPLETE,
      ]),
      eventually: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_LIVENESS_ID.ACK_PENDING_EVENTUALLY_PUBLISHED,
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_NON_TERMINAL,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING,
      ]),
      eventually: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    }),
    Object.freeze({
      id: PUBLICATION_RECOVERY_LIVENESS_ID.MISSING_PUBLISHED_EVENTUALLY_VISIBLE,
      when: Object.freeze([
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE,
        PUBLICATION_RECOVERY_EVIDENCE_FLAG.MISSING_PUBLISHED_MEMBERS,
      ]),
      eventually: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    }),
  ]),
});

function normalizePublicationRecoveryString(value) {
  return typeof value === TYPEOF.STRING ?
    value.trim() :
    PUBLICATION_RECOVERY_TEXT.EMPTY;
}

function normalizePublicationRecoveryStatus(value) {
  const status = normalizePublicationRecoveryString(value).toUpperCase();
  return status.length > NUM.ZERO ?
    status :
    PUBLICATION_RECOVERY_TEXT.UNKNOWN;
}

function normalizePublicationRecoveryNodeIdList(values = []) {
  return Object.freeze(
    [
      ...new Set(
        (Array.isArray(values) ? values : [])
          .map((value) => normalizePublicationRecoveryString(value))
          .filter((value) => value.length > NUM.ZERO),
      ),
    ].sort(),
  );
}

function normalizePublicationRecoveryCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
}

function countPendingRequiredAckNodeIds(requiredAckNodeIds, acknowledgedNodeIds) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId));
}

function resolvePublicationRecoveryPendingAckEvidenceState(options = {}) {
  return Array.isArray(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.REQUIRED_ACK_NODE_IDS],
  ) ?
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST :
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
}

function resolvePublicationRecoveryPendingAckEvidence(options = {}) {
  const evidenceState =
    resolvePublicationRecoveryPendingAckEvidenceState(options);
  const requiredAckNodeIds = normalizePublicationRecoveryNodeIdList(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.REQUIRED_ACK_NODE_IDS],
  );
  const acknowledgedNodeIds = normalizePublicationRecoveryNodeIdList(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.ACKNOWLEDGED_NODE_IDS],
  );
  const explicitPendingAckNodeIds = normalizePublicationRecoveryNodeIdList(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.PENDING_ACK_NODE_IDS],
  );
  const derivedPendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      Object.freeze(
        countPendingRequiredAckNodeIds(requiredAckNodeIds, acknowledgedNodeIds),
      ) :
      Object.freeze([]);
  const pendingAckNodeIds =
    explicitPendingAckNodeIds.length > NUM.ZERO ?
      explicitPendingAckNodeIds :
      derivedPendingAckNodeIds;
  const pendingAckCountByState = Object.freeze({
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      Math.max(
        pendingAckNodeIds.length,
        normalizePublicationRecoveryCount(
          options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.PENDING_ACK_COUNT],
        ),
      ),
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST]:
      pendingAckNodeIds.length,
  });

  return Object.freeze({
    evidenceState,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount: pendingAckCountByState[evidenceState],
  });
}

function isTerminalPublicationRecoveryStatus(publicationStatus) {
  const normalizedStatus = normalizePublicationRecoveryStatus(publicationStatus);
  return PUBLICATION_RECOVERY_TERMINAL_PUBLICATION_STATUSES.includes(
    normalizedStatus,
  );
}

function normalizePublicationRecoveryEvidence(options = {}) {
  const status = normalizePublicationRecoveryStatus(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.STATUS],
  );
  const pendingAckEvidence =
    resolvePublicationRecoveryPendingAckEvidence(options);
  const requiredAckNodeIds = pendingAckEvidence.requiredAckNodeIds;
  const acknowledgedNodeIds = pendingAckEvidence.acknowledgedNodeIds;
  const pendingAckNodeIds = pendingAckEvidence.pendingAckNodeIds;
  const pendingAckCount = pendingAckEvidence.pendingAckCount;
  const missingPublishedNodeIds = normalizePublicationRecoveryNodeIdList(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.MISSING_PUBLISHED_NODE_IDS],
  );
  const missingPublishedCount = Math.max(
    missingPublishedNodeIds.length,
    normalizePublicationRecoveryCount(
      options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.MISSING_PUBLISHED_COUNT],
    ),
  );
  return Object.freeze({
    available: options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.AVAILABLE] !== false,
    status,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    missingPublishedNodeIds,
    pendingAckEvidenceState: pendingAckEvidence.evidenceState,
    requiredAckCount: requiredAckNodeIds.length,
    acknowledgedAckCount: acknowledgedNodeIds.length,
    pendingAckCount,
    missingPublishedCount,
    acknowledgementChanged:
      options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.ACKNOWLEDGEMENT_CHANGED] ===
        true,
    terminalPublication: isTerminalPublicationRecoveryStatus(status),
  });
}

function collectPublicationRecoveryEvidenceFlagIds(evidence) {
  const satisfiedFlagIds = new Set();
  const flagEvidence = Object.freeze({
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.AVAILABLE]:
      evidence.available === true,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.UNAVAILABLE]:
      evidence.available !== true,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_PUBLISHED]:
      evidence.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_TERMINAL]:
      evidence.terminalPublication === true,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.STATUS_NON_TERMINAL]:
      evidence.terminalPublication !== true,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_REQUIRED]:
      evidence.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_PENDING]:
      evidence.pendingAckCount > NUM.ZERO,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACKS_COMPLETE]:
      evidence.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST &&
      evidence.pendingAckCount === NUM.ZERO,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.ACK_CHANGED]:
      evidence.acknowledgementChanged === true,
    [PUBLICATION_RECOVERY_EVIDENCE_FLAG.MISSING_PUBLISHED_MEMBERS]:
      evidence.missingPublishedCount > NUM.ZERO,
  });
  for (const [flagId, matched] of Object.entries(flagEvidence)) {
    if (matched === true) {
      satisfiedFlagIds.add(flagId);
    }
  }
  return Object.freeze([...satisfiedFlagIds].sort());
}

function hasAllPublicationRecoveryFlags(satisfiedFlagIds, expectedFlagIds) {
  const satisfiedFlagIdSet = new Set(satisfiedFlagIds);
  return expectedFlagIds.every((flagId) => satisfiedFlagIdSet.has(flagId));
}

function hasNoPublicationRecoveryFlags(satisfiedFlagIds, forbiddenFlagIds) {
  const satisfiedFlagIdSet = new Set(satisfiedFlagIds);
  return forbiddenFlagIds.every((flagId) => !satisfiedFlagIdSet.has(flagId));
}

function transitionMatchesPublicationRecoveryContext(transition, context) {
  return Array.isArray(transition.contexts) &&
    transition.contexts.includes(context);
}

function transitionMatchesPublicationRecoveryEvidence(
  transition,
  satisfiedFlagIds,
) {
  return hasAllPublicationRecoveryFlags(
    satisfiedFlagIds,
    transition.when || [],
  ) &&
    hasNoPublicationRecoveryFlags(
      satisfiedFlagIds,
      transition.unless || [],
    );
}

function resolvePublicationRecoveryTransition(context, satisfiedFlagIds) {
  return PUBLICATION_RECOVERY_MACHINE_SPEC.transitions.find((transition) =>
    transitionMatchesPublicationRecoveryContext(transition, context) &&
    transitionMatchesPublicationRecoveryEvidence(transition, satisfiedFlagIds),
  ) || PUBLICATION_RECOVERY_MACHINE_SPEC.transitions[
    PUBLICATION_RECOVERY_MACHINE_SPEC.transitions.length - NUM.ONE
  ];
}

function resolvePublicationRecoveryNextStatus(transition, evidence) {
  return transition.nextStatus === PUBLICATION_RECOVERY_TEXT.CURRENT ?
    evidence.status :
    transition.nextStatus;
}

function evaluatePublicationRecoveryInvariants(satisfiedFlagIds) {
  return Object.freeze(
    PUBLICATION_RECOVERY_MACHINE_SPEC.invariants
      .filter((invariant) =>
        hasAllPublicationRecoveryFlags(satisfiedFlagIds, invariant.forbid),
      )
      .map((invariant) => Object.freeze({
        id: invariant.id,
        severity: invariant.severity,
        forbid: invariant.forbid,
      })),
  );
}

function evaluatePublicationRecoveryLiveness(satisfiedFlagIds) {
  return Object.freeze(
    PUBLICATION_RECOVERY_MACHINE_SPEC.liveness
      .filter((obligation) =>
        hasAllPublicationRecoveryFlags(satisfiedFlagIds, obligation.when),
      )
      .map((obligation) => Object.freeze({
        id: obligation.id,
        when: obligation.when,
        eventually: obligation.eventually,
      })),
  );
}

function normalizePublicationRecoveryContext(value) {
  const context = normalizePublicationRecoveryString(value);
  return Object.values(PUBLICATION_RECOVERY_MACHINE_CONTEXT).includes(context) ?
    context :
    PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT;
}

function evaluatePublicationRecoveryMachine(options = {}) {
  const context = normalizePublicationRecoveryContext(
    options[PUBLICATION_RECOVERY_EVIDENCE_FIELD.CONTEXT],
  );
  const evidence = normalizePublicationRecoveryEvidence(options);
  const satisfiedFlagIds = collectPublicationRecoveryEvidenceFlagIds(evidence);
  const transition = resolvePublicationRecoveryTransition(
    context,
    satisfiedFlagIds,
  );
  return Object.freeze({
    context,
    currentStatus: evidence.status,
    nextStatus: resolvePublicationRecoveryNextStatus(transition, evidence),
    action: transition.action,
    reasonCode: transition.reasonCode,
    transitionId: transition.id,
    satisfiedFlagIds,
    evidence,
    invariantBreaches: evaluatePublicationRecoveryInvariants(satisfiedFlagIds),
    livenessObligations: evaluatePublicationRecoveryLiveness(satisfiedFlagIds),
  });
}

export {
  PUBLICATION_RECOVERY_EVIDENCE_FLAG,
  PUBLICATION_RECOVERY_INVARIANT_ID,
  PUBLICATION_RECOVERY_INVARIANT_SEVERITY,
  PUBLICATION_RECOVERY_LIVENESS_ID,
  PUBLICATION_RECOVERY_MACHINE_ACTION,
  PUBLICATION_RECOVERY_MACHINE_CONTEXT,
  PUBLICATION_RECOVERY_MACHINE_SPEC,
  PUBLICATION_RECOVERY_REASON,
  PUBLICATION_RECOVERY_TERMINAL_PUBLICATION_STATUSES,
  evaluatePublicationRecoveryMachine,
  isTerminalPublicationRecoveryStatus,
};
