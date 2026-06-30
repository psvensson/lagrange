import {
  cloneDecisionTableRows as cloneTopologyDecisionTableRows,
} from './topology-convergence-constant-helpers.js';

import {
  EDGE_ID,
  OWNER,
  BOUNDARY,
  DECISION_INPUT,
  DECISION_CONDITION,
  EDGE_STATE,
  REASON,
} from './topology-convergence-constants.js';

export const DECISION_TABLE_ROWS = Object.freeze([
  Object.freeze({
    edgeId: EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
    owner: OWNER.TOPOLOGY_PUBLICATION,
    boundary: BOUNDARY.PUBLICATION_CONVERGENCE,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.PUBLICATION_STATUS,
      DECISION_INPUT.PENDING_ACK_COUNT,
      DECISION_INPUT.BLOCKED_NODE_COUNT,
      DECISION_INPUT.MISSING_PUBLISHED_COUNT,
      DECISION_INPUT.MISSING_PUBLISHED_NODE_IDS,
      DECISION_INPUT.PRIORITY_SPREAD_PENDING,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_PENDING_ACKS,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([
          REASON.PUBLICATION_PENDING,
          REASON.PENDING_ACKS,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_BLOCKED_NODES,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([
          REASON.PUBLICATION_PENDING,
          REASON.BLOCKED_NODES,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_PENDING_EVIDENCE,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.PUBLICATION_PENDING]),
      }),
      Object.freeze({
        condition:
          DECISION_CONDITION
            .PUBLICATION_MISSING_PUBLISHED_WITHOUT_PRIORITY_SPREAD,
        state: EDGE_STATE.DEFERRED,
        reasons: Object.freeze([
          REASON.PUBLICATION_PUBLISHED,
          REASON.MISSING_PUBLISHED,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_CLOSED,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.PUBLICATION_PUBLISHED]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    owner: OWNER.PRIORITY_RECOVERY,
    boundary: BOUNDARY.WORKFLOW_PROGRESS,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.UNRESOLVED_SEMANTIC_STATE_IDS,
      DECISION_INPUT.PRIORITY_BLOCKED_PARTITION_COUNT,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_NO_UNRESOLVED_SEMANTIC_STATES,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_SATISFIED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_ONLY_RECOVERING_IN_FLIGHT,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_RETRYABLE]),
      }),
      Object.freeze({
        condition:
          DECISION_CONDITION.PRIORITY_PARTITION_WITNESS_EVENT_DRIVEN_WAIT,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_RETRYABLE]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_BLOCKED_PARTITIONS,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_RECOVERING_IN_FLIGHT,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_RETRYABLE]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_UNRESOLVED_WITHOUT_IN_FLIGHT,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.ACTIVE_GATE_READY,
      DECISION_INPUT.ACTIVE_GATE_STATE,
      DECISION_INPUT.SNAPSHOT_COVERAGE_COMPLETE,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_READY_OR_COVERED,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.ACTIVE_GATE_READY]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_TIMED_OUT_INCOMPLETE,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([
          REASON.ACTIVE_GATE_TIMED_OUT,
          REASON.SNAPSHOT_COVERAGE_INCOMPLETE,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_PROGRESS_MISSING,
        state: EDGE_STATE.UNKNOWN,
        reasons: Object.freeze([REASON.EVIDENCE_MISSING]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_COVERAGE_DEFERRED,
        state: EDGE_STATE.DEFERRED,
        reasons: Object.freeze([REASON.SNAPSHOT_COVERAGE_INCOMPLETE]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.READINESS_STARTUP_SUPPORT,
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.ACTIVE_GATE_READY,
      DECISION_INPUT.READINESS_READY,
      DECISION_INPUT.READINESS_RECOVERABILITY,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_ACTIVE_GATE_READY,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.READINESS_SATISFIED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_SUPPORT_READY,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.READINESS_SATISFIED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS,
        state: EDGE_STATE.DEFERRED,
        reasons: Object.freeze([
          REASON.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_TERMINAL_FAILURE,
        state: EDGE_STATE.TERMINAL_FAILED,
        reasons: Object.freeze([REASON.READINESS_TERMINAL]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_EVIDENCE_MISSING,
        state: EDGE_STATE.UNKNOWN,
        reasons: Object.freeze([REASON.EVIDENCE_MISSING]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_RETRYABLE_FAILURE,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.READINESS_RETRYABLE]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.TOP_FAILURE_REASONS,
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.TOP_REASONS,
      DECISION_INPUT.POST_REBALANCE_CLOSURE,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition:
          DECISION_CONDITION
            .TOP_FAILURES_PRESENT_WITH_POST_REBALANCE_CLOSURE,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.TOP_FAILURES_PRESENT]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.TOP_FAILURES_PRESENT,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.TOP_FAILURES_PRESENT]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.TOP_FAILURES_ABSENT,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.TOP_FAILURES_ABSENT]),
      }),
    ]),
  }),
]);

export function cloneDecisionTableRows() {
  return cloneTopologyDecisionTableRows(DECISION_TABLE_ROWS);
}
