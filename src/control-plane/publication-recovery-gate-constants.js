import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from './publication-owner-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';

const LOCAL_STR_EMPTY = '';

const EMPTY_STRING = '';
const PUBLICATION_RECOVERY_GATE_EMPTY_LIST = Object.freeze([]);

const PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE = Object.freeze({
  CLOSURE_WITNESS: 'closure_witness',
  OWNER_EVIDENCE_UNAVAILABLE: 'owner_evidence_unavailable',
  PRIORITY_PARTITION_SUMMARY: 'priority_partition_summary',
});
const PUBLICATION_PRIORITY_SPREAD_AUTHORITATIVE_DECISION_SOURCE_SET =
  Object.freeze(new Set([
    PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.CLOSURE_WITNESS,
    PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.PRIORITY_PARTITION_SUMMARY,
  ]));

const PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE = Object.freeze({
  COUNT_ONLY: 'count_only',
  REQUIRED_ACK_NODE_LIST: 'required_ack_node_list',
});

const PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE = Object.freeze({
  DURABLE_SUMMARY_REFRESHED: 'durable_summary_refreshed',
  RETAINED: 'retained',
});

const PUBLICATION_RECOVERY_OWNER_REASON_CODE_SET = Object.freeze(new Set(
  Object.values(CONTROL_PLANE_PRIORITY_RECOVERY_REASON),
));

const PUBLICATION_OWNER_STREAM_VALID_VALUES = Object.freeze({
  ACK_STATE: Object.freeze(Object.values(PUBLICATION_OWNER_ACK_STATE)),
  FRESHNESS_FENCE:
    Object.freeze(Object.values(PUBLICATION_OWNER_FRESHNESS_FENCE)),
  RECOVERY_OUTCOME:
    Object.freeze(Object.values(PUBLICATION_OWNER_RECOVERY_OUTCOME)),
  STREAM_OUTCOME: Object.freeze(Object.values(PUBLICATION_OWNER_STREAM_OUTCOME)),
});

const PUBLICATION_RECOVERY_PROTOCOL_STREAM_RULES = Object.freeze([
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
  }),
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING ||
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK ||
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
  }),
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
    matches: (context) =>
      context.prioritySpreadPending === true ||
      context.prioritySpreadEvidenceUnavailable === true,
  }),
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
    matches: () => true,
  }),
]);

export {
  EMPTY_STRING,
  LOCAL_STR_EMPTY,
  PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE,
  PUBLICATION_OWNER_STREAM_VALID_VALUES,
  PUBLICATION_PRIORITY_SPREAD_AUTHORITATIVE_DECISION_SOURCE_SET,
  PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE,
  PUBLICATION_RECOVERY_GATE_EMPTY_LIST,
  PUBLICATION_RECOVERY_OWNER_REASON_CODE_SET,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  PUBLICATION_RECOVERY_PROTOCOL_STREAM_RULES,
};
