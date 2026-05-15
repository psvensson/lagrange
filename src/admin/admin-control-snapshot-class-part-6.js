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
import {NUM, TABLES, TYPEOF} from '../constants/index.js';
import {normalizeControlPlanePublicationRow} from '../control-plane/system-row-normalizers.js';
import {
  resolvePublicationActiveGateMembershipPublicationTarget,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {AdminControlSnapshotPart5} from './admin-control-snapshot-class-part-5.js';
// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  READY: 'ready',
  UPDATEDAT: 'updatedAt',
  UPDATED_AT: 'updated_at',
  UNKNOWN_ERROR: 'unknown_error',
  PUBLISHED: 'PUBLISHED',
  NODEID: 'nodeId',
  ID: 'id',
  NAME: 'name',
  CAPTUREDAT: 'capturedAt',
  SOURCELEADERNODEID: 'sourceLeaderNodeId',
  DECISIONTIMESTAMP: 'decisionTimestamp',
  FAILEDAT: 'failedAt',
  NEXTATTEMPTAT: 'nextAttemptAt',
  TABLEID: 'tableId',
  TABLE_NAME: 'table_name',
  TABLENAME: 'tableName',
  PARTITIONSTATE: 'partitionState',
  REPLICAID: 'replicaId',
  RAFTROLE: 'raftRole',
  STATUS: 'status',
  ADDRESS: 'address',
});
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS = 'diagnostics';
const MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS = Object.freeze({
  preferAuthoritativeRead: true,
});
const MEMBERSHIP_PUBLICATION_RECONCILE_REASON =
  'admin_control_snapshot_publication_handoff';
const MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_PRESSURE_DEFER = false;
const MEMBERSHIP_PUBLICATION_HANDOFF_SKIP_WRITE_READBACK = false;
const MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_STATE = Object.freeze({
  ABSENT: 'absent',
  OBSERVED: 'observed',
});
const MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD = Object.freeze({
  PUBLICATION_ROW: 'publicationRow',
  STATE: 'state',
});
const MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_PROPERTY =
  'membershipPublicationReconcileObservation';
const MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_EMPTY = Object.freeze({
  [MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD.STATE]:
    MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_STATE.ABSENT,
});
const MEMBERSHIP_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
  ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  READ_PROFILE: 'readProfile',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
});
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function buildMembershipPublicationReadOptions(options = {}) {
  return options.preferAuthoritativeRead === true ?
    {
      preferAuthoritativeRead: true,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
    } :
    {readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS};
}
function buildMembershipPublicationReconcileOptions(options = {}) {
  const membershipPublicationTarget =
    resolvePublicationActiveGateMembershipPublicationTarget(
    options[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF
    ],
  );
  if (
    membershipPublicationTarget.reconcileRequired !== true
  ) {
    return MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS;
  }
  return {
    ...MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
      membershipPublicationTarget.publishedActiveNodeIds,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.REQUIRED_ACK_NODE_IDS]:
      membershipPublicationTarget.requiredAckNodeIds,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ACKNOWLEDGED_NODE_IDS]:
      membershipPublicationTarget.acknowledgedNodeIds,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_PENDING_VISIBILITY]:
      true,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_PRESSURE_DEFER]:
      MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_PRESSURE_DEFER,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.READ_PROFILE]:
      MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.SKIP_PUBLICATION_WRITE_READBACK]:
      MEMBERSHIP_PUBLICATION_HANDOFF_SKIP_WRITE_READBACK,
  };
}
async function maybeReconcileAuthoritativeMembershipPublication(
  membershipPublicationService,
  options = {},
) {
  if (
    options.reconcileAuthoritativeMembershipPublication !== true ||
    !membershipPublicationService
  ) {
    return null;
  }
  const reconcileOptions = buildMembershipPublicationReconcileOptions(options);
  if (reconcileOptions === MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS) {
    return null;
  }
  if (
    typeof membershipPublicationService.reconcileClusterMembership ===
    TYPEOF.FUNCTION
  ) {
    const outcome =
      await membershipPublicationService.reconcileClusterMembership(
        reconcileOptions,
      );
    return outcome?.publicationRow &&
      typeof outcome.publicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(outcome.publicationRow) :
      null;
  }
  if (
    typeof membershipPublicationService.enqueueClusterMembershipReconcile ===
    TYPEOF.FUNCTION
  ) {
    membershipPublicationService.enqueueClusterMembershipReconcile(
      MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
      reconcileOptions,
    );
    return null;
  }
  return null;
}
function resolvePublicationOrderingValue(row, keys = []) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return NUM.ZERO;
}
function isMembershipPublicationRow(row) {
  const normalizedRow = normalizeControlPlanePublicationRow(row);
  const publicationKind = String(
    normalizedRow.publicationKind || '',
  ).toLowerCase();
  return (
    publicationKind.length === NUM.ZERO ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND
  );
}
function isObservedMembershipPublicationReconcileRow(row) {
  const normalizedRow = normalizeControlPlanePublicationRow(row);
  return (
    String(
      normalizedRow.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    ).toUpperCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED &&
    Array.isArray(normalizedRow.publishedActiveNodeIds) &&
    normalizedRow.publishedActiveNodeIds.length > NUM.ZERO
  );
}
function buildMembershipPublicationReconcileObservation(publicationRow) {
  if (isObservedMembershipPublicationReconcileRow(publicationRow) !== true) {
    return MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_EMPTY;
  }
  return Object.freeze({
    [MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD.STATE]:
      MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_STATE.OBSERVED,
    [MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD.PUBLICATION_ROW]:
      normalizeControlPlanePublicationRow(publicationRow),
  });
}
function isMembershipPublicationReconcileObservation(value) {
  return (
    value &&
    typeof value === TYPEOF.OBJECT &&
    value[MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD.STATE] ===
      MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_STATE.OBSERVED &&
    isObservedMembershipPublicationReconcileRow(
      value[MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD.PUBLICATION_ROW],
    )
  );
}
function resolveLatestMembershipPublicationRow(
  publicationRows = [],
  options = {},
) {
  const expectedStatus =
    typeof options.status === TYPEOF.STRING ?
      options.status.toUpperCase() :
      null;
  const normalizedRows = (Array.isArray(publicationRows) ? publicationRows : [])
    .filter((row) => row && typeof row === TYPEOF.OBJECT)
    .filter((row) => isMembershipPublicationRow(row))
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => {
      if (expectedStatus && row.status !== expectedStatus) {
        return false;
      }
      return Boolean(
        row.publicationId ||
        row.publicationEpoch ||
        row.status ||
        (Array.isArray(row.publishedActiveNodeIds) &&
          row.publishedActiveNodeIds.length > NUM.ZERO),
      );
    });
  if (normalizedRows.length === NUM.ZERO) {
    return null;
  }
  normalizedRows.sort((left, right) => {
    const publicationEpochDelta =
      resolvePublicationOrderingValue(right, [
        'publicationEpoch',
        'publication_epoch',
      ]) -
      resolvePublicationOrderingValue(left, [
        'publicationEpoch',
        'publication_epoch',
      ]);
    if (publicationEpochDelta !== NUM.ZERO) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      resolvePublicationOrderingValue(right, ['publishedAt', 'published_at']) -
      resolvePublicationOrderingValue(left, ['publishedAt', 'published_at']);
    if (publishedAtDelta !== NUM.ZERO) {
      return publishedAtDelta;
    }
    return (
      resolvePublicationOrderingValue(right, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ]) -
      resolvePublicationOrderingValue(left, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ])
    );
  });
  return normalizedRows[NUM.ZERO] || null;
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart6 extends AdminControlSnapshotPart5 {
  rememberMembershipPublicationReconcileObservation(publicationRow) {
    const observation =
      buildMembershipPublicationReconcileObservation(publicationRow);
    this[MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_PROPERTY] =
      observation;
    return observation;
  }
  consumeMembershipPublicationReconcileObservation(options = {}) {
    if (options.preferAuthoritativeRead !== true) {
      return MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_EMPTY;
    }
    const observation =
      this[MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_PROPERTY] ||
      MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_EMPTY;
    this[MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_PROPERTY] =
      MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_EMPTY;
    if (isMembershipPublicationReconcileObservation(observation)) {
      return observation;
    }
    return MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_EMPTY;
  }
  async reconcileAuthoritativeMembershipPublicationFromHandoff(
    publicationActiveGateHandoff,
    options = {},
  ) {
    const membershipPublicationService =
      this.controlPlaneReadinessService?.membershipPublicationService || null;
    const publicationRow = await maybeReconcileAuthoritativeMembershipPublication(
      membershipPublicationService,
      {
        ...options,
        reconcileAuthoritativeMembershipPublication: true,
        publicationActiveGateHandoff,
      },
    );
    this.rememberMembershipPublicationReconcileObservation(publicationRow);
    return publicationRow;
  }
  async ensureMembershipPublicationObservation(options = {}) {
    const readinessService = this.controlPlaneReadinessService || null;
    const membershipPublicationService =
      readinessService?.membershipPublicationService || null;
    const hasMembershipPublicationService =
      membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT;
    const preferAuthoritativeRead = options.preferAuthoritativeRead === true;
    const reconciledPublicationRow =
      await maybeReconcileAuthoritativeMembershipPublication(
        membershipPublicationService,
        options,
      );
    if (reconciledPublicationRow) {
      return reconciledPublicationRow;
    }
    const carriedReconcilePublicationRow =
      this.consumeMembershipPublicationReconcileObservation({
        preferAuthoritativeRead,
      });
    if (
      isMembershipPublicationReconcileObservation(
        carriedReconcilePublicationRow,
      )
    ) {
      return carriedReconcilePublicationRow[
        MEMBERSHIP_PUBLICATION_RECONCILE_OBSERVATION_FIELD.PUBLICATION_ROW
      ];
    }
    if (
      !preferAuthoritativeRead &&
      typeof readinessService?.getLatestMembershipPublicationRowSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        readinessService.getLatestMembershipPublicationRowSync(null, {
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow) {
        return publicationRow;
      }
    }
    if (
      typeof readinessService?.getLatestMembershipPublicationRow ===
      TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await readinessService.getLatestMembershipPublicationRow(null, {
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      !preferAuthoritativeRead &&
      typeof membershipPublicationService.getLatestClusterPublicationSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        membershipPublicationService.getLatestClusterPublicationSync();
      if (publicationRow) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      typeof membershipPublicationService.getLatestClusterPublication ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await membershipPublicationService.getLatestClusterPublication(
          buildMembershipPublicationReadOptions({preferAuthoritativeRead}),
        );
      if (publicationRow) {
        return publicationRow;
      }
    }
    return resolveLatestMembershipPublicationRow(
      this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
    );
  }
  async ensurePublishedMembershipObservation(
    fallbackPublication = null,
    options = {},
  ) {
    if (
      fallbackPublication &&
      typeof fallbackPublication === TYPEOF.OBJECT &&
      String(
        fallbackPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      ).toUpperCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED
    ) {
      return fallbackPublication;
    }
    const readinessService = this.controlPlaneReadinessService || null;
    const membershipPublicationService =
      readinessService?.membershipPublicationService || null;
    const hasMembershipPublicationService =
      membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT;
    if (
      options.preferAuthoritativeRead !== true &&
      typeof readinessService?.getLatestPublishedMembershipPublicationRowSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        readinessService.getLatestPublishedMembershipPublicationRowSync({
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (
      typeof readinessService?.getLatestPublishedMembershipPublicationRow ===
      TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await readinessService.getLatestPublishedMembershipPublicationRow({
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      options.preferAuthoritativeRead !== true &&
      typeof membershipPublicationService.getLatestPublishedClusterPublicationSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        membershipPublicationService.getLatestPublishedClusterPublicationSync();
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      typeof membershipPublicationService.getLatestPublishedClusterPublication ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await membershipPublicationService.getLatestPublishedClusterPublication(
          buildMembershipPublicationReadOptions({
            preferAuthoritativeRead: options.preferAuthoritativeRead === true,
          }),
        );
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    return resolveLatestMembershipPublicationRow(
      this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
      {status: ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED},
    );
  }
}
export {AdminControlSnapshotPart6};
