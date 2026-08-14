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

const ArrayConstructor = Array;
const arrayIsArray = Array.isArray;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;

const PROJECTION_READINESS_DECISION_EMPTY_LIST = objectFreeze([]);

const PROJECTION_READINESS_INTERNAL_BLOCKERS = objectFreeze([
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
    matches: (evidence) => evidence.ownerEvidenceAvailable !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PROCESS_NOT_ALIVE,
    matches: (evidence) => evidence.processAlive !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
    matches: (evidence) => evidence.clusterMemberHealthy !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PROJECTION_REVISION_STALE,
    matches: (evidence) => evidence.projectionRevision?.stale === true,
  }),
]);

const PROJECTION_READINESS_REPAIR_BLOCKERS = objectFreeze([
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
    matches: (evidence) => evidence.ownerEvidenceAvailable !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PROCESS_NOT_ALIVE,
    matches: (evidence) => evidence.processAlive !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PROJECTION_REVISION_STALE,
    matches: (evidence) => evidence.projectionRevision?.stale === true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.REPAIR_NOT_ELIGIBLE,
    matches: (evidence) =>
      evidence.repairEligible !== true &&
      evidence.recoveryEligible !== true,
  }),
]);

const PROJECTION_READINESS_SERVE_BLOCKERS = objectFreeze([
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.SERVE_NOT_ELIGIBLE,
    matches: (evidence) => evidence.runtimeServeEligible !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PUBLICATION_STREAM_UNAVAILABLE,
    matches: (evidence) =>
      evidence.publicationOwnerStream === null &&
      evidence.publicationBoundaryOutcome === null &&
      evidence.publicationReady !== true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PUBLICATION_STREAM_FAILED,
    matches: (evidence) => evidence.publicationFailed === true,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PUBLICATION_STREAM_NOT_READY,
    matches: (evidence) =>
      evidence.publicationReady !== true &&
      evidence.publicationStreamOutcome !==
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
  }),
  objectFreeze({
    reason: PROJECTION_READINESS_REASON.PRIORITY_RECOVERY_ACTIVE,
    matches: (evidence) => evidence.priorityRecoveryActive === true,
  }),
]);

const PROJECTION_READINESS_CONTRACT_RULES = objectFreeze([
  objectFreeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    matches: (decision) => decision.lanes.serve.ready === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
    matches: (decision) =>
      decision.lanes.repair.ready === true ||
      decision.lanes.internal.ready === true ||
      decision.priorityRecoveryActive === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
    matches: () => true,
  }),
]);

const PROJECTION_READINESS_ACTIVE_GATE_RULES = objectFreeze([
  objectFreeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY,
    matches: (lanes) => lanes.serve.ready === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY,
    matches: (lanes) => lanes.repair.ready === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.INTERNAL_READY,
    matches: (lanes) => lanes.internal.ready === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_ACTIVE_GATE_STATE.BLOCKED,
    matches: () => true,
  }),
]);

const PROJECTION_READINESS_OPERATOR_RULES = objectFreeze([
  objectFreeze({
    state: PROJECTION_READINESS_OPERATOR_STATE.READY,
    matches: (lanes) => lanes.serve.ready === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_OPERATOR_STATE.DEGRADED,
    matches: (lanes) =>
      lanes.repair.ready === true || lanes.internal.ready === true,
  }),
  objectFreeze({
    state: PROJECTION_READINESS_OPERATOR_STATE.BLOCKED,
    matches: () => true,
  }),
]);

function collectProjectionReadinessBlockerReasons(rules, evidence) {
  const reasons = new ArrayConstructor();
  for (let index = 0; index < rules.length; index++) {
    if (rules[index].matches(evidence)) {
      appendProjectionReadinessReason(reasons, rules[index].reason);
    }
  }
  return objectFreeze(reasons);
}

function appendProjectionReadinessReason(reasons, reason) {
  objectDefineProperty(reasons, reasons.length, {
    configurable: true,
    enumerable: true,
    value: reason,
    writable: true,
  });
}

function combineProjectionReadinessReasons(reasonLists) {
  const combined = new ArrayConstructor();
  for (let listIndex = 0; listIndex < reasonLists.length; listIndex++) {
    const reasons = arrayIsArray(reasonLists[listIndex]) ?
      reasonLists[listIndex] :
      PROJECTION_READINESS_DECISION_EMPTY_LIST;
    for (let index = 0; index < reasons.length; index++) {
      appendProjectionReadinessReason(combined, reasons[index]);
    }
  }
  return combined;
}

function firstMatchingProjectionReadinessRule(rules, evidence) {
  for (let index = 0; index < rules.length; index++) {
    if (rules[index].matches(evidence)) return rules[index];
  }
  return rules[rules.length - 1];
}

function normalizeProjectionReadinessDecisionReasons(reasonCodes = []) {
  const source = arrayIsArray(reasonCodes) ?
    reasonCodes :
    PROJECTION_READINESS_DECISION_EMPTY_LIST;
  const normalized = new ArrayConstructor();
  const seen = new SetConstructor();
  for (let index = 0; index < source.length; index++) {
    const reasonCode = source[index];
    if (!reasonCode || setHas(seen, reasonCode)) continue;
    setAdd(seen, reasonCode);
    appendProjectionReadinessReason(normalized, reasonCode);
  }
  return objectFreeze(normalized);
}

function buildProjectionReadinessLane(name, ready, reasonCodes = []) {
  return objectFreeze({
    name,
    state: ready ?
      PROJECTION_READINESS_LANE_STATE.READY :
      PROJECTION_READINESS_LANE_STATE.BLOCKED,
    ready: ready === true,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(reasonCodes),
  });
}

function buildProjectionReadinessOperatorLane(lanes) {
  const state = firstMatchingProjectionReadinessRule(
    PROJECTION_READINESS_OPERATOR_RULES,
    lanes,
  ).state;
  const reasonCodes = state === PROJECTION_READINESS_OPERATOR_STATE.READY ?
    PROJECTION_READINESS_DECISION_EMPTY_LIST :
    combineProjectionReadinessReasons([
      lanes.serve.reasonCodes,
      lanes.repair.reasonCodes,
      lanes.internal.reasonCodes,
    ]);
  return objectFreeze({
    name: PROJECTION_READINESS_LANE.OPERATOR,
    state,
    ready: state === PROJECTION_READINESS_OPERATOR_STATE.READY,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(reasonCodes),
  });
}

function buildProjectionReadinessActiveGate(lanes) {
  const state = firstMatchingProjectionReadinessRule(
    PROJECTION_READINESS_ACTIVE_GATE_RULES,
    lanes,
  ).state;
  const reasonCodes =
    state === PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY ?
      PROJECTION_READINESS_DECISION_EMPTY_LIST :
      combineProjectionReadinessReasons([
        lanes.serve.reasonCodes,
        lanes.repair.reasonCodes,
        lanes.internal.reasonCodes,
      ]);
  return objectFreeze({
    state,
    ready: state === PROJECTION_READINESS_ACTIVE_GATE_STATE.SERVE_READY,
    reasonCodes: normalizeProjectionReadinessDecisionReasons(reasonCodes),
  });
}

function buildProjectionReadinessDecision(evidence) {
  const internalReasonCodes = normalizeProjectionReadinessDecisionReasons(
    combineProjectionReadinessReasons([
      evidence.reasonSeed,
      collectProjectionReadinessBlockerReasons(
        PROJECTION_READINESS_INTERNAL_BLOCKERS,
        evidence,
      ),
    ]),
  );
  const internalLane = buildProjectionReadinessLane(
    PROJECTION_READINESS_LANE.INTERNAL,
    internalReasonCodes.length === 0,
    internalReasonCodes,
  );
  const repairReasonCodes = normalizeProjectionReadinessDecisionReasons(
    collectProjectionReadinessBlockerReasons(
      PROJECTION_READINESS_REPAIR_BLOCKERS,
      evidence,
    ),
  );
  const repairLane = buildProjectionReadinessLane(
    PROJECTION_READINESS_LANE.REPAIR,
    repairReasonCodes.length === 0,
    repairReasonCodes,
  );
  const serveReasonCodes = normalizeProjectionReadinessDecisionReasons(
    combineProjectionReadinessReasons([
      internalReasonCodes,
      repairReasonCodes,
      collectProjectionReadinessBlockerReasons(
        PROJECTION_READINESS_SERVE_BLOCKERS,
        evidence,
      ),
    ]),
  );
  const serveLane = buildProjectionReadinessLane(
    PROJECTION_READINESS_LANE.SERVE,
    repairLane.ready === true && serveReasonCodes.length === 0,
    serveReasonCodes,
  );
  const lanes = objectFreeze({
    [PROJECTION_READINESS_LANE.INTERNAL]: internalLane,
    [PROJECTION_READINESS_LANE.REPAIR]: repairLane,
    [PROJECTION_READINESS_LANE.SERVE]: serveLane,
  });
  const allLanes = objectFreeze({
    ...lanes,
    [PROJECTION_READINESS_LANE.OPERATOR]:
      buildProjectionReadinessOperatorLane(lanes),
  });
  const activeGate = buildProjectionReadinessActiveGate(allLanes);
  const state = firstMatchingProjectionReadinessRule(
    PROJECTION_READINESS_CONTRACT_RULES,
    {
      lanes: allLanes,
      priorityRecoveryActive: evidence.priorityRecoveryActive,
    },
  ).state;

  return objectFreeze({
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
