import {NUM} from '../constants/index.js';
import {
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from './publication-owner-constants.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROJECTION_READINESS_LANE,
  PROJECTION_READINESS_LANE_STATE,
  PROJECTION_READINESS_OPERATOR_STATE,
  PROJECTION_READINESS_REASON,
} from './projection-readiness-constants.js';

const PROJECTION_READINESS_DECISION_EMPTY_LIST = Object.freeze([]);

const PROJECTION_READINESS_INTERNAL_BLOCKERS = Object.freeze([
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
    matches: (evidence) => evidence.ownerEvidenceAvailable !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PROCESS_NOT_ALIVE,
    matches: (evidence) => evidence.processAlive !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
    matches: (evidence) => evidence.clusterMemberHealthy !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PROJECTION_REVISION_STALE,
    matches: (evidence) => evidence.projectionRevision?.stale === true,
  }),
]);

const PROJECTION_READINESS_REPAIR_BLOCKERS = Object.freeze([
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
    matches: (evidence) => evidence.ownerEvidenceAvailable !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PROCESS_NOT_ALIVE,
    matches: (evidence) => evidence.processAlive !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PROJECTION_REVISION_STALE,
    matches: (evidence) => evidence.projectionRevision?.stale === true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.REPAIR_NOT_ELIGIBLE,
    matches: (evidence) =>
      evidence.repairEligible !== true &&
      evidence.recoveryEligible !== true &&
      evidence.provisioningEligible !== true,
  }),
]);

const PROJECTION_READINESS_SERVE_BLOCKERS = Object.freeze([
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.SERVE_NOT_ELIGIBLE,
    matches: (evidence) => evidence.runtimeServeEligible !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PUBLICATION_STREAM_UNAVAILABLE,
    matches: (evidence) =>
      evidence.publicationOwnerStream === null &&
      evidence.publicationBoundaryOutcome === null &&
      evidence.publicationReady !== true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PUBLICATION_STREAM_FAILED,
    matches: (evidence) => evidence.publicationFailed === true,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PUBLICATION_STREAM_NOT_READY,
    matches: (evidence) =>
      evidence.publicationReady !== true &&
      evidence.publicationStreamOutcome !==
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
  }),
  Object.freeze({
    reason: PROJECTION_READINESS_REASON.PRIORITY_RECOVERY_ACTIVE,
    matches: (evidence) => evidence.priorityRecoveryActive === true,
  }),
]);

const PROJECTION_READINESS_CONTRACT_RULES = Object.freeze([
  Object.freeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    matches: (decision) => decision.lanes.serve.ready === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
    matches: (decision) =>
      decision.lanes.repair.ready === true ||
      decision.lanes.internal.ready === true ||
      decision.priorityRecoveryActive === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
    matches: () => true,
  }),
]);

const PROJECTION_READINESS_ACTIVE_GATE_RULES = Object.freeze([
  Object.freeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY,
    matches: (lanes) => lanes.serve.ready === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY,
    matches: (lanes) => lanes.repair.ready === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.INTERNAL_READY,
    matches: (lanes) => lanes.internal.ready === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.BLOCKED,
    matches: () => true,
  }),
]);

const PROJECTION_READINESS_OPERATOR_RULES = Object.freeze([
  Object.freeze({
    state: PROJECTION_READINESS_OPERATOR_STATE.READY,
    matches: (lanes) => lanes.serve.ready === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_OPERATOR_STATE.DEGRADED,
    matches: (lanes) =>
      lanes.repair.ready === true || lanes.internal.ready === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_OPERATOR_STATE.BLOCKED,
    matches: () => true,
  }),
]);

function collectProjectionReadinessBlockerReasons(rules, evidence) {
  return Object.freeze(
    rules
      .filter((rule) => rule.matches(evidence))
      .map((rule) => rule.reason),
  );
}

function normalizeProjectionReadinessDecisionReasons(reasonCodes = []) {
  return Object.freeze([
    ...new Set(
      (Array.isArray(reasonCodes) ?
        reasonCodes :
        PROJECTION_READINESS_DECISION_EMPTY_LIST)
        .filter((reasonCode) => Boolean(reasonCode)),
    ),
  ]);
}

function buildProjectionReadinessLane(name, ready, reasonCodes = []) {
  return Object.freeze({
    name,
    state: ready ?
      PROJECTION_READINESS_LANE_STATE.READY :
      PROJECTION_READINESS_LANE_STATE.BLOCKED,
    ready: ready === true,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(reasonCodes),
  });
}

function buildProjectionReadinessOperatorLane(lanes) {
  const state = PROJECTION_READINESS_OPERATOR_RULES.find((rule) =>
    rule.matches(lanes),
  ).state;
  const reasonCodes = state === PROJECTION_READINESS_OPERATOR_STATE.READY ?
    PROJECTION_READINESS_DECISION_EMPTY_LIST :
    [
      ...lanes.serve.reasonCodes,
      ...lanes.repair.reasonCodes,
      ...lanes.internal.reasonCodes,
    ];
  return Object.freeze({
    name: PROJECTION_READINESS_LANE.OPERATOR,
    state,
    ready: state === PROJECTION_READINESS_OPERATOR_STATE.READY,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(reasonCodes),
  });
}

function buildProjectionReadinessActiveGate(lanes) {
  const state = PROJECTION_READINESS_ACTIVE_GATE_RULES.find((rule) =>
    rule.matches(lanes),
  ).state;
  const reasonCodes =
    state === PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY ?
      PROJECTION_READINESS_DECISION_EMPTY_LIST :
      [
        ...lanes.serve.reasonCodes,
        ...lanes.repair.reasonCodes,
        ...lanes.internal.reasonCodes,
      ];
  return Object.freeze({
    state,
    ready: state === PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(reasonCodes),
  });
}

function buildProjectionReadinessDecision(evidence) {
  const internalReasonCodes = normalizeProjectionReadinessDecisionReasons([
    ...evidence.reasonSeed,
    ...collectProjectionReadinessBlockerReasons(
      PROJECTION_READINESS_INTERNAL_BLOCKERS,
      evidence,
    ),
  ]);
  const internalLane = buildProjectionReadinessLane(
    PROJECTION_READINESS_LANE.INTERNAL,
    internalReasonCodes.length === NUM.ZERO,
    internalReasonCodes,
  );
  const repairReasonCodes = normalizeProjectionReadinessDecisionReasons([
    ...collectProjectionReadinessBlockerReasons(
      PROJECTION_READINESS_REPAIR_BLOCKERS,
      evidence,
    ),
  ]);
  const repairLane = buildProjectionReadinessLane(
    PROJECTION_READINESS_LANE.REPAIR,
    repairReasonCodes.length === NUM.ZERO,
    repairReasonCodes,
  );
  const serveReasonCodes = normalizeProjectionReadinessDecisionReasons([
    ...internalReasonCodes,
    ...repairReasonCodes,
    ...collectProjectionReadinessBlockerReasons(
      PROJECTION_READINESS_SERVE_BLOCKERS,
      evidence,
    ),
  ]);
  const serveLane = buildProjectionReadinessLane(
    PROJECTION_READINESS_LANE.SERVE,
    repairLane.ready === true && serveReasonCodes.length === NUM.ZERO,
    serveReasonCodes,
  );
  const lanes = Object.freeze({
    [PROJECTION_READINESS_LANE.INTERNAL]: internalLane,
    [PROJECTION_READINESS_LANE.REPAIR]: repairLane,
    [PROJECTION_READINESS_LANE.SERVE]: serveLane,
  });
  const allLanes = Object.freeze({
    ...lanes,
    [PROJECTION_READINESS_LANE.OPERATOR]:
      buildProjectionReadinessOperatorLane(lanes),
  });
  const activeGate = buildProjectionReadinessActiveGate(allLanes);
  const state = PROJECTION_READINESS_CONTRACT_RULES.find((rule) =>
    rule.matches({
      lanes: allLanes,
      priorityRecoveryActive: evidence.priorityRecoveryActive,
    }),
  ).state;

  return Object.freeze({
    state,
    ready: allLanes.serve.ready === true,
    recoveryOpen: state !== PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    lanes: allLanes,
    activeGate,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(
      allLanes.operator.reasonCodes,
    ),
  });
}

export {
  buildProjectionReadinessDecision,
  normalizeProjectionReadinessDecisionReasons,
};
