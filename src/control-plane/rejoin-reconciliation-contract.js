
const POST_REJOIN_RECONCILIATION_OWNER = 'topology_membership_owner';
const POST_REJOIN_RECONCILIATION_BOUNDARY = 'rejoin_reconciliation';
const POST_REJOIN_RECONCILIATION_ABSENT_TEXT = 'absent';
const POST_REJOIN_RECONCILIATION_EMPTY_TEXT = '';
const POST_REJOIN_RECONCILIATION_DEFAULT_OBSERVED_AT = 0;

const POST_REJOIN_RECONCILIATION_DECISION_STATE = Object.freeze({
  SATISFIED: 'satisfied',
  PENDING: 'pending',
  BLOCKED: 'blocked',
});

const POST_REJOIN_RECONCILIATION_EVIDENCE_STATE = Object.freeze({
  SATISFIED: 'satisfied',
  PENDING: 'pending',
  BLOCKED: 'blocked',
  UNAVAILABLE: 'unavailable',
});

const POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE = Object.freeze({
  LOCAL_TOPOLOGY: 'local_topology',
  REMOTE_OPERATION: 'remote_operation',
  STARTUP_ADMISSION: 'startup_admission',
});

const POST_REJOIN_RECONCILIATION_REASON_CODE = Object.freeze({
  LOCAL_TOPOLOGY_RESTORED: 'post_rejoin_local_topology_restored',
  LOCAL_TOPOLOGY_PENDING: 'post_rejoin_local_topology_pending',
  LOCAL_TOPOLOGY_BLOCKED: 'post_rejoin_local_topology_blocked',
  LOCAL_TOPOLOGY_UNAVAILABLE: 'post_rejoin_local_topology_unavailable',
  REMOTE_OPERATION_RECONCILED: 'post_rejoin_remote_operation_reconciled',
  REMOTE_OPERATION_PENDING: 'post_rejoin_remote_operation_pending',
  REMOTE_OPERATION_BLOCKED: 'post_rejoin_remote_operation_blocked',
  REMOTE_OPERATION_UNAVAILABLE: 'post_rejoin_remote_operation_unavailable',
  STARTUP_ADMISSION_SATISFIED: 'post_rejoin_startup_admission_satisfied',
  STARTUP_ADMISSION_PENDING: 'post_rejoin_startup_admission_pending',
  STARTUP_ADMISSION_BLOCKED: 'post_rejoin_startup_admission_blocked',
  STARTUP_ADMISSION_UNAVAILABLE: 'post_rejoin_startup_admission_unavailable',
  RECONCILIATION_SATISFIED: 'post_rejoin_reconciliation_satisfied',
  RECONCILIATION_PENDING: 'post_rejoin_reconciliation_pending',
  RECONCILIATION_BLOCKED: 'post_rejoin_reconciliation_blocked',
});

const POST_REJOIN_RECONCILIATION_EVIDENCE_REASON_CODE = Object.freeze({
  [POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE.LOCAL_TOPOLOGY]: Object.freeze({
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.LOCAL_TOPOLOGY_RESTORED,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.PENDING]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.LOCAL_TOPOLOGY_PENDING,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.LOCAL_TOPOLOGY_BLOCKED,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.UNAVAILABLE]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.LOCAL_TOPOLOGY_UNAVAILABLE,
  }),
  [POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE.REMOTE_OPERATION]: Object.freeze({
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.REMOTE_OPERATION_RECONCILED,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.PENDING]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.REMOTE_OPERATION_PENDING,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.REMOTE_OPERATION_BLOCKED,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.UNAVAILABLE]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.REMOTE_OPERATION_UNAVAILABLE,
  }),
  [POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE.STARTUP_ADMISSION]: Object.freeze({
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.SATISFIED]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.STARTUP_ADMISSION_SATISFIED,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.PENDING]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.STARTUP_ADMISSION_PENDING,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.STARTUP_ADMISSION_BLOCKED,
    [POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.UNAVAILABLE]:
      POST_REJOIN_RECONCILIATION_REASON_CODE.STARTUP_ADMISSION_UNAVAILABLE,
  }),
});

const POST_REJOIN_RECONCILIATION_DECISION_REASON_CODE = Object.freeze({
  [POST_REJOIN_RECONCILIATION_DECISION_STATE.SATISFIED]:
    POST_REJOIN_RECONCILIATION_REASON_CODE.RECONCILIATION_SATISFIED,
  [POST_REJOIN_RECONCILIATION_DECISION_STATE.PENDING]:
    POST_REJOIN_RECONCILIATION_REASON_CODE.RECONCILIATION_PENDING,
  [POST_REJOIN_RECONCILIATION_DECISION_STATE.BLOCKED]:
    POST_REJOIN_RECONCILIATION_REASON_CODE.RECONCILIATION_BLOCKED,
});

const POST_REJOIN_RECONCILIATION_PENDING_EVIDENCE_STATES = Object.freeze([
  POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.PENDING,
  POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.UNAVAILABLE,
]);

function normalizePostRejoinReconciliationRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ?
    value :
    {};
}

function normalizePostRejoinReconciliationText(value, fallback) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function normalizePostRejoinReconciliationTimestamp(value) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0 ?
    Math.trunc(normalizedValue) :
    POST_REJOIN_RECONCILIATION_DEFAULT_OBSERVED_AT;
}

function normalizePostRejoinReconciliationReasonCodes(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizePostRejoinReconciliationText(
          value,
          POST_REJOIN_RECONCILIATION_EMPTY_TEXT,
        ))
        .filter((value) => value.length > 0),
    )],
  );
}

function normalizePostRejoinReconciliationEvidenceState(value, fallback) {
  return Object.values(POST_REJOIN_RECONCILIATION_EVIDENCE_STATE).includes(value) ?
    value :
    fallback;
}

function buildPostRejoinReconciliationEvidence(options = {}) {
  const normalizedOptions = normalizePostRejoinReconciliationRecord(options);
  const state = normalizePostRejoinReconciliationEvidenceState(
    normalizedOptions.state,
    POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.UNAVAILABLE,
  );
  const source = normalizePostRejoinReconciliationText(
    normalizedOptions.source,
    POST_REJOIN_RECONCILIATION_ABSENT_TEXT,
  );
  const defaultReasonCode =
    POST_REJOIN_RECONCILIATION_EVIDENCE_REASON_CODE[source]?.[state] ||
    POST_REJOIN_RECONCILIATION_DECISION_REASON_CODE[
      POST_REJOIN_RECONCILIATION_DECISION_STATE.PENDING
    ];
  const reasonCodes = normalizePostRejoinReconciliationReasonCodes([
    ...normalizePostRejoinReconciliationReasonCodes(normalizedOptions.reasonCodes),
    defaultReasonCode,
  ]);
  return Object.freeze({
    source,
    state,
    reasonCodes,
  });
}

function buildPostRejoinReconciliationSnapshot(options = {}) {
  const normalizedOptions = normalizePostRejoinReconciliationRecord(options);
  const evidence = normalizePostRejoinReconciliationRecord(
    normalizedOptions.evidence,
  );
  return Object.freeze({
    owner: POST_REJOIN_RECONCILIATION_OWNER,
    boundary: POST_REJOIN_RECONCILIATION_BOUNDARY,
    nodeId: normalizePostRejoinReconciliationText(
      normalizedOptions.nodeId,
      POST_REJOIN_RECONCILIATION_ABSENT_TEXT,
    ),
    observedAt: normalizePostRejoinReconciliationTimestamp(
      normalizedOptions.observedAt,
    ),
    evidence: Object.freeze({
      localTopology: buildPostRejoinReconciliationEvidence({
        source: POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE.LOCAL_TOPOLOGY,
        state:
          normalizedOptions.localTopologyState ||
          evidence.localTopologyState ||
          evidence.localTopology?.state,
        reasonCodes:
          normalizedOptions.localTopologyReasonCodes ||
          evidence.localTopologyReasonCodes ||
          evidence.localTopology?.reasonCodes,
      }),
      remoteOperation: buildPostRejoinReconciliationEvidence({
        source: POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE.REMOTE_OPERATION,
        state:
          normalizedOptions.remoteOperationState ||
          evidence.remoteOperationState ||
          evidence.remoteOperation?.state,
        reasonCodes:
          normalizedOptions.remoteOperationReasonCodes ||
          evidence.remoteOperationReasonCodes ||
          evidence.remoteOperation?.reasonCodes,
      }),
      startupAdmission: buildPostRejoinReconciliationEvidence({
        source: POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE.STARTUP_ADMISSION,
        state:
          normalizedOptions.startupAdmissionState ||
          evidence.startupAdmissionState ||
          evidence.startupAdmission?.state,
        reasonCodes:
          normalizedOptions.startupAdmissionReasonCodes ||
          evidence.startupAdmissionReasonCodes ||
          evidence.startupAdmission?.reasonCodes,
      }),
    }),
  });
}

function resolvePostRejoinReconciliationDecisionFromSnapshot(snapshot) {
  const evidenceValues = Object.freeze(Object.values(snapshot.evidence));
  const blockedEvidence = Object.freeze(
    evidenceValues.filter((evidence) =>
      evidence.state === POST_REJOIN_RECONCILIATION_EVIDENCE_STATE.BLOCKED),
  );
  const pendingEvidence = Object.freeze(
    evidenceValues.filter((evidence) =>
      POST_REJOIN_RECONCILIATION_PENDING_EVIDENCE_STATES.includes(
        evidence.state,
      )),
  );
  const decisionRule = Object.freeze([
    Object.freeze({
      state: POST_REJOIN_RECONCILIATION_DECISION_STATE.BLOCKED,
      evidence: blockedEvidence,
      matches: blockedEvidence.length > 0,
    }),
    Object.freeze({
      state: POST_REJOIN_RECONCILIATION_DECISION_STATE.PENDING,
      evidence: pendingEvidence,
      matches: pendingEvidence.length > 0,
    }),
    Object.freeze({
      state: POST_REJOIN_RECONCILIATION_DECISION_STATE.SATISFIED,
      evidence: evidenceValues,
      matches: true,
    }),
  ]).find((rule) => rule.matches === true);
  const reasonCodes = normalizePostRejoinReconciliationReasonCodes([
    ...decisionRule.evidence.flatMap((evidence) => evidence.reasonCodes),
    POST_REJOIN_RECONCILIATION_DECISION_REASON_CODE[decisionRule.state],
  ]);
  return Object.freeze({
    owner: POST_REJOIN_RECONCILIATION_OWNER,
    boundary: POST_REJOIN_RECONCILIATION_BOUNDARY,
    nodeId: snapshot.nodeId,
    observedAt: snapshot.observedAt,
    state: decisionRule.state,
    satisfied:
      decisionRule.state === POST_REJOIN_RECONCILIATION_DECISION_STATE.SATISFIED,
    reasonCodes,
    evidence: snapshot.evidence,
  });
}

function buildPostRejoinReconciliationDecision(options = {}) {
  return resolvePostRejoinReconciliationDecisionFromSnapshot(
    buildPostRejoinReconciliationSnapshot(options),
  );
}

function isPostRejoinReconciliationSatisfied(decision) {
  return Boolean(
    decision &&
    typeof decision === 'object' &&
    decision.owner === POST_REJOIN_RECONCILIATION_OWNER &&
    decision.boundary === POST_REJOIN_RECONCILIATION_BOUNDARY &&
    decision.state === POST_REJOIN_RECONCILIATION_DECISION_STATE.SATISFIED,
  );
}

export {
  POST_REJOIN_RECONCILIATION_BOUNDARY,
  POST_REJOIN_RECONCILIATION_DECISION_STATE,
  POST_REJOIN_RECONCILIATION_EVIDENCE_SOURCE,
  POST_REJOIN_RECONCILIATION_EVIDENCE_STATE,
  POST_REJOIN_RECONCILIATION_OWNER,
  POST_REJOIN_RECONCILIATION_REASON_CODE,
  buildPostRejoinReconciliationDecision,
  buildPostRejoinReconciliationSnapshot,
  isPostRejoinReconciliationSatisfied,
};
