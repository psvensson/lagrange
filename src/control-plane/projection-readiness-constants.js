import {
  PROJECTION_READINESS_CONTRACT_STATE,
} from './control-plane-readiness-constants.js';

const PROJECTION_READINESS_SEMANTIC_OWNER = 'projection_readiness_owner';

const PROJECTION_READINESS_LANE = Object.freeze({
  INTERNAL: 'internal',
  REPAIR: 'repair',
  SERVE: 'serve',
  OPERATOR: 'operator',
});

const PROJECTION_READINESS_LANE_STATE = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
});

const PROJECTION_READINESS_OPERATOR_STATE = Object.freeze({
  READY: 'ready',
  DEGRADED: 'degraded',
  BLOCKED: 'blocked',
});

const PROJECTION_READINESS_ACTIVE_GATE_STATE = Object.freeze({
  SERVE_READY: 'serve_ready',
  REPAIR_READY: 'repair_ready',
  INTERNAL_READY: 'internal_ready',
  BLOCKED: 'blocked',
});

const PROJECTION_READINESS_REASON = Object.freeze({
  OWNER_EVIDENCE_MISSING: 'owner_evidence_missing',
  PROCESS_NOT_ALIVE: 'process_not_alive',
  CLUSTER_MEMBER_UNHEALTHY: 'cluster_member_unhealthy',
  PROJECTION_REVISION_STALE: 'projection_revision_stale',
  PUBLICATION_STREAM_UNAVAILABLE: 'publication_stream_unavailable',
  PUBLICATION_STREAM_NOT_READY: 'publication_stream_not_ready',
  PUBLICATION_STREAM_FAILED: 'publication_stream_failed',
  PRIORITY_RECOVERY_ACTIVE: 'priority_recovery_active',
  REPAIR_NOT_ELIGIBLE: 'repair_not_eligible',
  SERVE_NOT_ELIGIBLE: 'serve_not_eligible',
});

const PROJECTION_READINESS_INPUT_CLASS = Object.freeze({
  PUBLICATION_STREAM: 'publication_stream',
  OPERATION_OUTCOME: 'operation_outcome',
  PLACEMENT_INTENT: 'placement_intent',
  LOCAL_LIVENESS: 'local_liveness',
  DELETION: 'deletion',
});

export {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROJECTION_READINESS_INPUT_CLASS,
  PROJECTION_READINESS_LANE,
  PROJECTION_READINESS_LANE_STATE,
  PROJECTION_READINESS_OPERATOR_STATE,
  PROJECTION_READINESS_REASON,
  PROJECTION_READINESS_SEMANTIC_OWNER,
};
