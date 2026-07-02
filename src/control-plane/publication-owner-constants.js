
const PUBLICATION_OWNER_SEMANTIC_OWNER = 'publication_owner';

const CONTROL_PLANE_PUBLICATION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  ACK_PENDING: 'ACK_PENDING',
  PUBLISHED: 'PUBLISHED',
  ABANDONED: 'ABANDONED',
  SUPERSEDED: 'SUPERSEDED',
});

const PUBLICATION_OWNER_TEXT = Object.freeze({
  EMPTY: '',
  UNKNOWN: 'UNKNOWN',
});

const PUBLICATION_OWNER_REVISION_NUMBER = Object.freeze({
  UNAVAILABLE: 0,
  MINIMUM_AVAILABLE: 1,
});

const PUBLICATION_OWNER_REVISION_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  CURRENT: 'current',
  ADVANCING: 'advancing',
  AHEAD_OF_DESIRED: 'ahead_of_desired',
});

const PUBLICATION_OWNER_ACK_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  NOT_REQUIRED: 'not_required',
  WAITING_FOR_ACK: 'waiting_for_ack',
  ACKNOWLEDGED: 'acknowledged',
});

const PUBLICATION_OWNER_ACK_EVIDENCE_STATE = Object.freeze({
  COUNT_ONLY: 'count_only',
  REQUIRED_ACK_NODE_LIST: 'required_ack_node_list',
});

const PUBLICATION_OWNER_PRESSURE_STATE = Object.freeze({
  NONE: 'none',
  DEFERRED: 'deferred',
  COALESCED: 'coalesced',
});

const PUBLICATION_OWNER_FRESHNESS_FENCE = Object.freeze({
  NO_REVISION: 'no_revision',
  PUBLISHING: 'publishing',
  ACK_LAG: 'ack_lag',
  REVISION_LAG: 'revision_lag',
  CONSUMER_LAG: 'consumer_lag',
  RECOVERY_LAG: 'recovery_lag',
  PRESSURE_DEFERRED: 'pressure_deferred',
  FAILED: 'failed',
  FRESH: 'fresh',
});

const PUBLICATION_OWNER_RECOVERY_OUTCOME = Object.freeze({
  NOT_STARTED: 'not_started',
  WAITING_FOR_PUBLICATION: 'waiting_for_publication',
  WAITING_FOR_ACK: 'waiting_for_ack',
  WAITING_FOR_CONSUMER: 'waiting_for_consumer',
  WAITING_FOR_RECOVERY_EVIDENCE: 'waiting_for_recovery_evidence',
  RECOVERING: 'recovering',
  PRESSURE_DEFERRED: 'pressure_deferred',
  READY: 'ready',
  FAILED: 'failed',
});

const PUBLICATION_OWNER_STREAM_OUTCOME = Object.freeze({
  NOT_STARTED: 'not_started',
  PUBLISHING: 'publishing',
  WAITING_FOR_ACK: 'waiting_for_ack',
  STALE: 'stale',
  RECOVERING: 'recovering',
  PRESSURE_DEFERRED: 'pressure_deferred',
  PUBLISHED: 'published',
  FAILED: 'failed',
});

const PUBLICATION_OWNER_REASON = Object.freeze({
  NO_PUBLICATION_REVISION: 'no_publication_revision',
  PUBLICATION_STATUS_OPEN: 'publication_status_open',
  PUBLICATION_STATUS_ACK_PENDING: 'publication_status_ack_pending',
  PUBLICATION_STATUS_PUBLISHED: 'publication_status_published',
  PUBLICATION_STATUS_ABANDONED: 'publication_status_abandoned',
  PUBLICATION_STATUS_SUPERSEDED: 'publication_status_superseded',
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
  RECOVERY_PROTOCOL_PUBLICATION_PENDING:
    'recovery_protocol_publication_pending',
  ACK_WAITING: 'ack_waiting',
  ACK_COMPLETE: 'ack_complete',
  ACK_NOT_REQUIRED: 'ack_not_required',
  ACK_EVIDENCE_COUNT_ONLY: 'ack_evidence_count_only',
  REVISION_LAG: 'revision_lag',
  MISSING_PUBLISHED_MEMBERS: 'missing_published_members',
  PUBLICATION_PENDING_HINT: 'publication_pending_hint',
  PRIORITY_SPREAD_PENDING: 'priority_spread_pending',
  PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE:
    'priority_spread_evidence_unavailable',
  PRESSURE_DEFERRED: 'pressure_deferred',
  PRESSURE_COALESCED: 'pressure_coalesced',
  STREAM_FRESH: 'stream_fresh',
});

export {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_EVIDENCE_STATE,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_PRESSURE_STATE,
  PUBLICATION_OWNER_REASON,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REVISION_NUMBER,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_SEMANTIC_OWNER,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
};
