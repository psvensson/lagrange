import {readLowerStateField} from '../utils/state-field-read.js';
// Pure record, row and decision evaluation for ServeEligibilityOwner (quest
// serve-eligibility-committed-epoch-read). ServeEligibilityOwner owns the
// runtime memo, refresh lifecycle and waiter coordination; this module holds
// the stateless committed-record evaluation and source-change predicates.
import {COLUMN, SERVICE_STATUS} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_REASON} from './control-plane-readiness-constants.js';
import {MEMBERSHIP_PUBLICATION_KIND} from './membership-publication-row-contract.js';
import {
  resolveLatestPublishedPublicationRow,
  resolvePublishedActiveNodeIds,
} from './active-node-publication-snapshots.js';
import {hasPriorityRecoverySpreadGap} from './priority-recovery-planning-intent.js';
import {
  PRIORITY_PARTITION_CENSUS_STATE,
  readPriorityPartitionCensusState,
} from './membership-publication-priority-partition-summary.js';
import {indexCommittedNodeRows} from './committed-node-rows.js';
import {projectNodeLivenessSemantics, readNodeLivenessRowFacts} from
  './node-liveness-semantic-projection.js';

const SERVE_ELIGIBILITY_STATE = Object.freeze({
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});

const SERVE_ELIGIBILITY_DECISION = Object.freeze({
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'not_eligible',
});

const SERVE_ELIGIBILITY_UNAVAILABLE_REASON = Object.freeze({
  // A trigger, a newer epoch or an elapsed committed lease made the record
  // older than the facts; a committed refresh is in flight.
  STALE: 'unavailable_stale',
  // The leader-required read did not answer.
  READ_FAILED: 'committed_read_failed',
  // The committed read answered and no membership is published.
  NO_RECORD: 'no_committed_record',
  // No committed read has completed yet.
  READ_PENDING: 'committed_read_pending',
  OWNER_STOPPED: 'owner_stopped',
});

const SERVE_ELIGIBILITY_REASON = Object.freeze({
  NODE_ROW_MISSING: 'node_row_missing',
  NODE_NOT_ACTIVE: 'node_not_active',
  READY_LEASE_EXPIRED: 'ready_lease_expired',
  LOAD_NOT_READY: 'load_not_ready',
  NODE_NOT_PUBLISHED: 'node_not_published',
  PUBLICATION_NOT_ACKNOWLEDGED: 'publication_not_acknowledged',
  PRIORITY_SPREAD_PENDING:
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  PRIORITY_SPREAD_UNSTATED: 'priority_spread_unstated',
});

const STALE_SIGNATURE = 'stale';
const REASON_SEPARATOR = ',';
const SIGNATURE_SEPARATOR = '|';
const NO_REASONS = Object.freeze([]);
const OUTCOME = Object.freeze({
  PENDING: 'pending',
  RECORD: 'record',
  NO_RECORD: 'no_record',
  READ_FAILED: 'read_failed',
  STALE: 'stale',
  ADOPTED: 'adopted',
  STALE_RETAINED: 'stale_retained',
  UNINITIALIZED: 'uninitialized',
  SHUTDOWN: 'shutdown',
});

function readNodeId(row) {
  const nodeId = row?.[COLUMN.NODE_ID] ?? row?.nodeId ?? null;
  return typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : null;
}

function readLeaseExpiresAtMs(row) {
  return readNodeLivenessRowFacts(row).readyLeaseExpiresAtMs;
}

function readLastHeartbeatMs(row) {
  return readNodeLivenessRowFacts(row).lastHeartbeatMs;
}

function readBootIncarnation(row) {
  const value = Number(row?.[COLUMN.BOOT_INCARNATION] ?? row?.bootIncarnation);
  return Number.isFinite(value) ? value : null;
}

// The row's status, lowercased; a row without one is STATE_ABSENT (it matches
// no status the decision accepts, and two absent statuses are equal).
function readStatus(row) {
  return readLowerStateField(row?.[COLUMN.STATUS]);
}

function isMembershipPublication(publication) {
  return publication.publicationKind === MEMBERSHIP_PUBLICATION_KIND;
}

// The published membership as the publication snapshot owner defines it
// (active-node-publication-snapshots.js): the latest PUBLISHED
// cluster_membership row and its member list, read from committed rows.
function selectLatestPublishedMembership(rows) {
  const publication = resolveLatestPublishedPublicationRow({
    publicationRows: rows,
  });
  if (!publication || !Number.isFinite(publication.publicationEpoch)) {
    return null;
  }
  return Object.freeze({
    ...publication,
    publishedActiveNodeIds: resolvePublishedActiveNodeIds({
      publicationRows: rows,
      requirePublishedMembership: true,
    }),
  });
}

function isPublicationAcknowledged(publication) {
  const acknowledged = new Set(publication.acknowledgedNodeIds);
  return publication.requiredAckNodeIds.every((nodeId) =>
    acknowledged.has(nodeId));
}

function resolvePrioritySpreadReason(publication) {
  const summary = publication.priorityPartitionSummary;
  if (readPriorityPartitionCensusState(summary) !==
      PRIORITY_PARTITION_CENSUS_STATE.DERIVED) {
    return SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_UNSTATED;
  }
  return hasPriorityRecoverySpreadGap(summary) ?
    SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_PENDING :
    null;
}

/**
 * The serve decision for one node from committed facts at one read instant.
 * Pure: the committed node row (status, load columns, ready lease), the
 * committed published membership, the read time and the readiness owner's
 * load threshold predicate.
 * @param {Object} input
 * @return {{decision: string, reasons: Array<string>}}
 */
// The committed facts a serve decision checks, each a named reason; a node
// is eligible when none fails.
const SERVE_ELIGIBILITY_CHECKS = Object.freeze([
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.NODE_ROW_MISSING,
    fails: ({nodeRow}) => !nodeRow,
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.NODE_NOT_ACTIVE,
    fails: ({nodeRow}) =>
      Boolean(nodeRow) && readStatus(nodeRow) !== SERVICE_STATUS.ACTIVE,
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.LOAD_NOT_READY,
    fails: ({nodeRow, isNodeLoadReady}) =>
      Boolean(nodeRow) && isNodeLoadReady(nodeRow) !== true,
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.READY_LEASE_EXPIRED,
    fails: ({nodeRow, readAtMs}) => {
      const leaseExpiresAtMs = readLeaseExpiresAtMs(nodeRow);
      return Boolean(nodeRow) &&
        (leaseExpiresAtMs === null || leaseExpiresAtMs <= readAtMs);
    },
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.NODE_NOT_PUBLISHED,
    fails: ({nodeId, publication}) =>
      !publication.publishedActiveNodeIds.includes(nodeId),
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.PUBLICATION_NOT_ACKNOWLEDGED,
    fails: ({publication}) => !isPublicationAcknowledged(publication),
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_UNSTATED,
    fails: ({publication}) => resolvePrioritySpreadReason(publication) ===
      SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_UNSTATED,
  }),
  Object.freeze({
    reason: SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_PENDING,
    fails: ({publication}) => resolvePrioritySpreadReason(publication) ===
      SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_PENDING,
  }),
]);

/**
 * The serve decision for one node from committed facts at one read instant.
 * Pure: the committed node row (status, load columns, ready lease), the
 * committed published membership, the read time and the readiness owner's
 * load threshold predicate.
 * @param {Object} input
 * @return {{decision: string, reasons: Array<string>}}
 */
function decideServeEligibility(input) {
  const failedReasons = Object.freeze(SERVE_ELIGIBILITY_CHECKS
    .filter((check) => check.fails(input))
    .map((check) => check.reason));
  return Object.freeze({
    decision: failedReasons.length === 0 ?
      SERVE_ELIGIBILITY_DECISION.ELIGIBLE :
      SERVE_ELIGIBILITY_DECISION.NOT_ELIGIBLE,
    reasons: failedReasons,
  });
}

function unavailable(reason, epoch, retryAfterMs) {
  return Object.freeze({
    state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
    reason,
    epoch,
    retryAfterMs,
  });
}

function isSameNodeList(committedNodes = NO_REASONS, changedNodes = NO_REASONS) {
  if (committedNodes.length !== changedNodes.length) return false;
  const committedSet = new Set(committedNodes);
  return changedNodes.every((nodeId) => committedSet.has(nodeId));
}

function isSamePublicationFacts(committedPub, changedPub, isPublished) {
  return Boolean(committedPub && isPublished) &&
    committedPub.publicationId === changedPub.publicationId &&
    committedPub.publicationEpoch === changedPub.publicationEpoch &&
    isPublicationAcknowledged(committedPub) ===
      isPublicationAcknowledged(changedPub) &&
    resolvePrioritySpreadReason(committedPub) ===
      resolvePrioritySpreadReason(changedPub) &&
    isSameNodeList(
      committedPub.publishedActiveNodeIds,
      changedPub.publishedActiveNodeIds,
    );
}

function shouldSupersedeOnPublicationChange(record, pub, isPublished) {
  const heldEpoch = record?.epoch || null;
  if (heldEpoch && pub.publicationId === heldEpoch.publicationId) {
    return !isSamePublicationFacts(record?.publication, pub, isPublished);
  }
  return isPublished &&
    (!heldEpoch || pub.publicationEpoch > heldEpoch.publicationEpoch);
}

function isOlderNodeHeartbeatProjection(committedRow, changedRow) {
  if (!committedRow || !changedRow) return false;
  if (readBootIncarnation(committedRow) !== readBootIncarnation(changedRow)) {
    return false;
  }
  const committedHeartbeatMs = readLastHeartbeatMs(committedRow);
  const changedHeartbeatMs = readLastHeartbeatMs(changedRow);
  return (
    committedHeartbeatMs !== null &&
    changedHeartbeatMs !== null &&
    changedHeartbeatMs < committedHeartbeatMs
  );
}

function hasAdvancedNodeLeaseOrHeartbeat(committedRow, changedRow) {
  const committedLease = readLeaseExpiresAtMs(committedRow);
  const changedLease = readLeaseExpiresAtMs(changedRow);
  if (
    changedLease !== null &&
    (committedLease === null || changedLease > committedLease)
  ) {
    return true;
  }
  const committedHeartbeatMs = readLastHeartbeatMs(committedRow);
  const changedHeartbeatMs = readLastHeartbeatMs(changedRow);
  return (
    changedHeartbeatMs !== null &&
    (committedHeartbeatMs === null || changedHeartbeatMs > committedHeartbeatMs)
  );
}

function isRevokingNodeChange(committedRow, changedRow, isNodeLoadReady) {
  if (!committedRow) return true;
  if (readStatus(committedRow) !== readStatus(changedRow)) return true;
  if (isNodeLoadReady(committedRow) !== isNodeLoadReady(changedRow)) return true;
  if (readBootIncarnation(committedRow) !== readBootIncarnation(changedRow)) {
    return true;
  }
  const committedLease = readLeaseExpiresAtMs(committedRow);
  const changedLease = readLeaseExpiresAtMs(changedRow);
  // A lease extension leaves the committed answer true until its own expiry;
  // a cleared or shortened lease does not.
  if (committedLease === null) return changedLease !== null;
  return changedLease === null || changedLease < committedLease;
}

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

// The typed outcome of one committed read: failed, no published membership,
// or a record keyed by the publication epoch.
// The committed read did not answer (a read threw): the named READ_FAILED
// result, the same one an unsuccessful read builds.
const COMMITTED_READ_FAILED = Object.freeze({outcome: OUTCOME.READ_FAILED});

function buildCommittedReadResult(reads, readAtMs) {
  const nodeRowsById = reads === null ? null :
    indexCommittedNodeRows(reads.nodesResult?.rows);
  if (nodeRowsById === null) return {outcome: OUTCOME.READ_FAILED};
  const publication = reads === null ? null :
    selectLatestPublishedMembership(rowsOf(reads.publicationsResult));
  const outcome = reads === null ? OUTCOME.READ_FAILED :
    publication === null ? OUTCOME.NO_RECORD : OUTCOME.RECORD;
  return outcome !== OUTCOME.RECORD ? {outcome} : {
    outcome,
    record: Object.freeze({
      epoch: Object.freeze({
        publicationEpoch: publication.publicationEpoch,
        publicationId: publication.publicationId,
        readAtMs,
      }),
      publication,
      nodeRowsById,
      decisionsByNodeId: new Map(),
    }),
  };
}

function isRegressedCommittedReadResult(result, record, minPublicationEpoch) {
  if (result.outcome === OUTCOME.NO_RECORD) {
    return (
      record !== null ||
      (Number.isSafeInteger(minPublicationEpoch) &&
        minPublicationEpoch > 0)
    );
  }
  if (result.outcome !== OUTCOME.RECORD) {
    return false;
  }
  const epoch = result.record.epoch.publicationEpoch;
  return (
    (Number.isSafeInteger(minPublicationEpoch) &&
      epoch < minPublicationEpoch) ||
    (Number.isSafeInteger(record?.epoch?.publicationEpoch) &&
      epoch < record.epoch.publicationEpoch)
  );
}

function evaluateServeEligibilityRecordSignature(
  record,
  outcome,
  isNodeLoadReady,
) {
  if (!record) {
    return outcome;
  }
  const nodeIds = new Set([
    ...record.nodeRowsById.keys(),
    ...record.publication.publishedActiveNodeIds,
  ]);
  const parts = [outcome, record.epoch.publicationEpoch,
    record.epoch.publicationId];
  for (const nodeId of [...nodeIds].sort()) {
    const decided = decideServeEligibility({
      nodeId,
      nodeRow: record.nodeRowsById.get(nodeId) || null,
      publication: record.publication,
      readAtMs: record.epoch.readAtMs,
      isNodeLoadReady,
    });
    record.decisionsByNodeId.set(nodeId, decided);
    const {projection} = projectNodeLivenessSemantics({
      nodeRow: record.nodeRowsById.get(nodeId) || null,
      nowMs: record.epoch.readAtMs,
    });
    // Node-floor consumers also wait on known/invalid lease transitions
    // while serving stays denied. Renewals with identical meaning coalesce.
    parts.push(JSON.stringify([nodeId, projection.statusSemantics.state,
      projection.leaseSemantics.state, projection.readyNow]));
    parts.push(
      `${nodeId}=${decided.decision}:${decided.reasons.join(REASON_SEPARATOR)}`,
    );
  }
  return parts.join(SIGNATURE_SEPARATOR);
}

function checkOwnerUnavailability(owner) {
  const timeout = owner.readTimeoutMs;
  if (owner.stopped) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.OWNER_STOPPED,
      null,
      null,
    );
  }
  if (owner.outcome === OUTCOME.PENDING) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_PENDING,
      null,
      timeout,
    );
  }
  if (owner.outcome === OUTCOME.NO_RECORD) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.NO_RECORD,
      null,
      timeout,
    );
  }
  if (owner.outcome === OUTCOME.STALE) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      owner.record?.epoch ?? null,
      timeout,
    );
  }
  if (!owner.record) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_FAILED,
      null,
      timeout,
    );
  }
  if (owner.superseded) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      owner.record.epoch,
      timeout,
    );
  }
  return null;
}

function isServeEligibilityAnswerEligible(answer) {
  return answer?.state === SERVE_ELIGIBILITY_STATE.READY &&
    answer.decision === SERVE_ELIGIBILITY_DECISION.ELIGIBLE;
}

export {
  COMMITTED_READ_FAILED,
  NO_REASONS,
  OUTCOME,
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  STALE_SIGNATURE,
  buildCommittedReadResult,
  checkOwnerUnavailability,
  decideServeEligibility,
  evaluateServeEligibilityRecordSignature,
  hasAdvancedNodeLeaseOrHeartbeat,
  isMembershipPublication,
  isOlderNodeHeartbeatProjection,
  isRegressedCommittedReadResult,
  isRevokingNodeChange,
  isServeEligibilityAnswerEligible,
  readLeaseExpiresAtMs,
  readNodeId,
  shouldSupersedeOnPublicationChange,
  unavailable,
};
