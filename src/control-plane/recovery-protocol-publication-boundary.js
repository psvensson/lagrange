import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';

const PUBLICATION_OBSERVATION_STATE = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  ESTABLISHING: 'establishing',
  UNPUBLISHED: 'unpublished',
});

const PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE = Object.freeze({
  UNPUBLISHED: 'unpublished',
  ESTABLISHING: 'establishing',
  ACK_PENDING: 'ack_pending',
  PUBLISHED: 'published',
  TERMINAL: 'terminal',
});

const PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  SATISFIED: 'satisfied',
});

const PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE = Object.freeze({
  UNPUBLISHED: 'unpublished',
  ESTABLISHING: 'establishing',
  FRESH: 'fresh',
  STALE: 'stale',
});

const PUBLICATION_PROJECTION_BOUNDARY_TERMINAL_STATUSES = new Set([
  CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED,
  CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED,
]);

const PUBLICATION_PROJECTION_BOUNDARY_ROW_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.UNPUBLISHED,
    matches: (evidence) =>
      evidence.publicationObservationState ===
        PUBLICATION_OBSERVATION_STATE.UNPUBLISHED ||
      evidence.publicationStatusNormalized.length === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.TERMINAL,
    matches: (evidence) =>
      PUBLICATION_PROJECTION_BOUNDARY_TERMINAL_STATUSES.has(
        evidence.publicationStatusNormalized,
      ),
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.PUBLISHED,
    matches: (evidence) =>
      evidence.publicationStatusNormalized ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.ACK_PENDING,
    matches: (evidence) =>
      evidence.publicationStatusNormalized ===
        CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.ESTABLISHING,
    matches: () => true,
  }),
]);

const PUBLICATION_PROJECTION_BOUNDARY_ACK_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.PENDING,
    matches: (evidence) => evidence.pendingAckCount > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.NOT_REQUIRED,
    matches: (evidence) =>
      evidence.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST &&
      evidence.requiredAckCount === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.SATISFIED,
    matches: (evidence) =>
      evidence.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST ||
      evidence.publicationStatusNormalized ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.UNAVAILABLE,
    matches: () => true,
  }),
]);

const PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.UNPUBLISHED,
    matches: (evidence) =>
      evidence.publicationObservationState ===
        PUBLICATION_OBSERVATION_STATE.UNPUBLISHED,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.ESTABLISHING,
    matches: (evidence) =>
      evidence.publicationStatusNormalized !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.STALE,
    matches: (evidence) =>
      evidence.missingPublishedCount > NUM.ZERO ||
      evidence.recoveryGateReady !== true,
  }),
  Object.freeze({
    state: PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.FRESH,
    matches: () => true,
  }),
]);

function normalizeOptionalString(value) {
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
}

function resolvePublicationProjectionBoundaryDecision(rules, evidence) {
  return rules.find((rule) => rule.matches(evidence));
}

function buildPublicationProjectionBoundaryOutcome(context, gate) {
  const evidence = Object.freeze({
    publicationObservationState: context.publicationObservationState,
    publicationStatusNormalized: context.publicationStatusNormalized,
    pendingAckCount: normalizeNonNegativeInteger(gate.pendingAckCount),
    pendingAckEvidenceState: gate.pendingAckEvidenceState,
    requiredAckCount: normalizeNonNegativeInteger(gate.requiredAckCount),
    missingPublishedCount: normalizeNonNegativeInteger(
      gate.missingPublishedCount,
    ),
    recoveryGateReady: gate.ready === true,
  });
  const rowDecision = resolvePublicationProjectionBoundaryDecision(
    PUBLICATION_PROJECTION_BOUNDARY_ROW_RULES,
    evidence,
  );
  const ackDecision = resolvePublicationProjectionBoundaryDecision(
    PUBLICATION_PROJECTION_BOUNDARY_ACK_RULES,
    evidence,
  );
  const freshnessDecision = resolvePublicationProjectionBoundaryDecision(
    PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_RULES,
    evidence,
  );

  return Object.freeze({
    state: gate.state,
    publicationState: rowDecision.state,
    ackState: ackDecision.state,
    freshnessState: freshnessDecision.state,
    recoveryGateState: gate.state,
    ready: gate.ready === true,
    active: gate.active === true,
    publicationObservationState: context.publicationObservationState,
    reasonCodes: Object.freeze([...gate.reasonCodes]),
    pendingAckCount: evidence.pendingAckCount,
    missingPublishedCount: evidence.missingPublishedCount,
    ...(Number.isInteger(context.publicationEpoch) ?
      {publicationEpoch: context.publicationEpoch} :
      {}),
    ...(normalizeOptionalString(context.publicationStatus) ?
      {publicationStatus: normalizeOptionalString(context.publicationStatus)} :
      {}),
  });
}

export {
  PUBLICATION_OBSERVATION_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE,
  buildPublicationProjectionBoundaryOutcome,
};
