/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {NUM, TABLES, TIME_MS, TYPEOF} from '../constants/index.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from '../partition/partition-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {CONTROL_PLANE_DELIVERY_PRIORITY} from '../control-plane/control-plane-constants.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  CONSISTENCY_MISMATCH_KIND,
} from './admin-constants.js';
import {
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';
import {buildCanonicalPublicationRecoveryEvidence} from '../control-plane/publication-recovery-evidence.js';
import {buildPublicationRecoveryProtocolSnapshot} from '../control-plane/recovery-protocol-snapshot.js';
import {buildPublicationRecoveryGateSnapshot} from '../control-plane/publication-recovery-gate.js';
import {normalizeControlPlanePublicationRow} from '../control-plane/system-row-normalizers.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {assignAdminControlSnapshotReadinessDiagnosticsMethods} from './admin-control-snapshot-readiness-diagnostics-methods.js';
import {assignAdminControlSnapshotLocalDiagnosticsMethods} from './admin-control-snapshot-local-diagnostics-methods.js';
import {AdminControlSnapshot} from './admin-control-snapshot-leadership-summary.js';
import {
  resolveLatestMembershipPublicationRow,
  resolvePublicationOrderingValue,
} from './admin-control-snapshot-membership-publication-reconcile.js';
import {
  attachAuthoritativeRepairDiagnostics,
  hasPressureOrTimeoutRepairCause,
} from './admin-control-snapshot-repair-diagnostics.js';
import {
  hasDurablePublishedMembershipObservation,
  selectDurablePublishedMembershipObservation,
} from './admin-control-snapshot-node-view-projection.js';
import {MEMBERSHIP_PUBLICATION_READ_SOURCE} from
  '../control-plane/membership-publication-row-contract.js';
// ── file-local constants ────────────────────────────────────────────────────
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PARTITION_STATE_UNKNOWN = 'unknown';
const SQL_DIAGNOSTICS_REPLICA_COUNT = NUM.THREE;
const CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT = 64;
const MANAGED_SPLIT_WORKFLOW_TYPE = 'managed_split';
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: 'steady',
  CATCHUP: 'catchup',
});
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD = 'nodeStatePublication';
const CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD =
  'getControlPlanePublicationStorySync';
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP =
  'leader_resolution_gap';
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
]);
const MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS = 'diagnostics';
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function toNonNegativeInteger(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }
  return Math.floor(parsedValue);
}
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > 0 &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function isRecoverableControlSnapshotPublicationReadError(error = null) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.length > 0 &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )
  );
}
function buildMembershipPublicationReadOptions(options = {}) {
  return options.readSource ===
    MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED ?
    {
      readSource:
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
      deliveryPriority: CONTROL_PLANE_DELIVERY_PRIORITY.READINESS,
    } :
    {readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS};
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
assignAdminControlSnapshotReadinessDiagnosticsMethods(AdminControlSnapshot, {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  AUTHORITATIVE_REPAIR_TRIGGER,
  CONSISTENCY_MISMATCH_KIND,
  CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
  CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD,
  CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD,
  CONTROL_PLANE_READINESS_DIMENSION,
  MANAGED_SPLIT_WORKFLOW_TYPE,
  MEMBERSHIP_PUBLICATION_KIND,
  NUM,
  PARTITION_TRANSITION_METADATA_FIELD,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  TYPEOF,
  StartupRecoveryCoordinator,
  attachAuthoritativeRepairDiagnostics,
  buildMembershipPublicationReadOptions,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  firstStringField,
  hasDurablePublishedMembershipObservation,
  hasOnlyLeaderResolutionGapRepairCause,
  hasPressureOrTimeoutRepairCause,
  isRecoverableControlSnapshotPublicationReadError,
  normalizeControlPlanePublicationRow,
  resolveLatestMembershipPublicationRow,
  resolvePublicationOrderingValue,
  selectDurablePublishedMembershipObservation,
  uniqueSorted,
});
assignAdminControlSnapshotLocalDiagnosticsMethods(AdminControlSnapshot, {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  CDC_TELEMETRY_MODE,
  NUM,
  PARTITION_STATE_UNKNOWN,
  SERVICE_TYPE_PARTITION,
  SQL_DIAGNOSTICS_REPLICA_COUNT,
  STATUS_ACTIVE,
  TABLES,
  TIME_MS,
  TYPEOF,
  firstStringField,
  toNonNegativeInteger,
  uniqueSorted,
});
export {AdminControlSnapshot};
