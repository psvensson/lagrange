// Per-node serve eligibility: one fact, one owner (quest
// serve-eligibility-committed-epoch-read). The answer is derived from a
// committed read of the nodes rows and the latest published
// cluster_membership row of control_plane_publications, taken through the
// readiness-owner leader-required read (OWNER_RPC_REQUIRED, leader REQUIRED,
// READINESS_INTERNAL routing on leadership and live transport). The record is
// a memo keyed by the publication epoch. The SystemTableCache is a trigger
// only: a cache event can make the memo stale and start a committed refresh;
// it never grants and never denies.
//
// Bound: raft-rs exports no ReadIndex, so the read is a leader-local read with
// a role witness. A positive answer never outlives the node's committed ready
// lease (CONTROL_PLANE_READY_LEASE), which bounds how long a deposed leader's
// answer can grant.
import {COLUMN, SERVICE_STATUS, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_REASON} from './control-plane-readiness-constants.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {MEMBERSHIP_PUBLICATION_KIND} from './membership-publication-row-contract.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './publication-owner-constants.js';
import {hasPriorityRecoverySpreadGap} from './priority-recovery-planning-intent.js';

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
  NODE_NOT_PUBLISHED: 'node_not_published',
  PUBLICATION_NOT_ACKNOWLEDGED: 'publication_not_acknowledged',
  PRIORITY_SPREAD_PENDING:
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  PRIORITY_SPREAD_UNSTATED: 'priority_spread_unstated',
});

const SELECT_ALL_PREFIX = 'SELECT * FROM ';
const NO_REASONS = Object.freeze([]);
const OUTCOME = Object.freeze({
  PENDING: 'pending',
  RECORD: 'record',
  NO_RECORD: 'no_record',
  READ_FAILED: 'read_failed',
});

function readNodeId(row) {
  const nodeId = row?.[COLUMN.NODE_ID] ?? row?.nodeId ?? null;
  return typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : null;
}

function readLeaseExpiresAtMs(row) {
  const value = Number(row?.[COLUMN.READY_LEASE_EXPIRES_AT] ??
    row?.readyLeaseExpiresAt);
  return row?.[COLUMN.READY_LEASE_EXPIRES_AT] === null ||
    !Number.isFinite(value) ? null : value;
}

function readBootIncarnation(row) {
  const value = Number(row?.[COLUMN.BOOT_INCARNATION] ?? row?.bootIncarnation);
  return Number.isFinite(value) ? value : null;
}

function readStatus(row) {
  return String(row?.[COLUMN.STATUS] ?? row?.status ?? '').toLowerCase();
}

function isMembershipPublication(publication) {
  return publication.publicationKind === MEMBERSHIP_PUBLICATION_KIND;
}

function selectLatestPublishedMembership(rows) {
  let latest = null;
  for (const row of rows) {
    const publication = normalizeControlPlanePublicationRow(row);
    if (
      !isMembershipPublication(publication) ||
      publication.status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
      !Number.isFinite(publication.publicationEpoch)
    ) {
      continue;
    }
    if (!latest || publication.publicationEpoch > latest.publicationEpoch) {
      latest = publication;
    }
  }
  return latest;
}

function isPublicationAcknowledged(publication) {
  const acknowledged = new Set(publication.acknowledgedNodeIds);
  return publication.requiredAckNodeIds.every((nodeId) =>
    acknowledged.has(nodeId));
}

function resolvePrioritySpreadReason(publication) {
  const summary = publication.priorityPartitionSummary;
  if (!summary || typeof summary !== 'object') {
    return SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_UNSTATED;
  }
  return hasPriorityRecoverySpreadGap(summary) ?
    SERVE_ELIGIBILITY_REASON.PRIORITY_SPREAD_PENDING :
    null;
}

/**
 * The serve decision for one node from committed facts at one read instant.
 * Pure: the committed node row, the committed published membership and the
 * read time.
 * @param {{nodeRow: Object|null, publication: Object, readAtMs: number}} input
 * @return {{decision: string, reasons: Array<string>}}
 */
function decideServeEligibility({nodeId, nodeRow, publication, readAtMs}) {
  const reasons = [];
  if (!nodeRow) {
    reasons.push(SERVE_ELIGIBILITY_REASON.NODE_ROW_MISSING);
  } else {
    if (readStatus(nodeRow) !== SERVICE_STATUS.ACTIVE) {
      reasons.push(SERVE_ELIGIBILITY_REASON.NODE_NOT_ACTIVE);
    }
    const leaseExpiresAtMs = readLeaseExpiresAtMs(nodeRow);
    if (leaseExpiresAtMs === null || leaseExpiresAtMs <= readAtMs) {
      reasons.push(SERVE_ELIGIBILITY_REASON.READY_LEASE_EXPIRED);
    }
  }
  if (!publication.publishedActiveNodeIds.includes(nodeId)) {
    reasons.push(SERVE_ELIGIBILITY_REASON.NODE_NOT_PUBLISHED);
  }
  if (!isPublicationAcknowledged(publication)) {
    reasons.push(SERVE_ELIGIBILITY_REASON.PUBLICATION_NOT_ACKNOWLEDGED);
  }
  const spreadReason = resolvePrioritySpreadReason(publication);
  if (spreadReason !== null) {
    reasons.push(spreadReason);
  }
  return Object.freeze({
    decision: reasons.length === 0 ?
      SERVE_ELIGIBILITY_DECISION.ELIGIBLE :
      SERVE_ELIGIBILITY_DECISION.NOT_ELIGIBLE,
    reasons: Object.freeze(reasons),
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

function isRevokingNodeChange(committedRow, changedRow) {
  if (!committedRow) {
    return true;
  }
  if (readStatus(committedRow) !== readStatus(changedRow)) {
    return true;
  }
  if (readBootIncarnation(committedRow) !== readBootIncarnation(changedRow)) {
    return true;
  }
  const committedLease = readLeaseExpiresAtMs(committedRow);
  const changedLease = readLeaseExpiresAtMs(changedRow);
  // A lease extension leaves the committed answer true until its own expiry;
  // a cleared or shortened lease does not.
  if (committedLease === null) {
    return changedLease !== null;
  }
  return changedLease === null || changedLease < committedLease;
}

class ServeEligibilityOwner {
  /**
   * @param {Object} options
   * @param {function(string, string, Array): Promise<Object>} options.readCommittedRows
   *   the readiness-owner leader-required read.
   * @param {function(): number} options.now
   * @param {number} options.readTimeoutMs the committed read's deadline; the
   *   retryAfterMs of an unavailability is the in-flight read's deadline.
   * @param {function(Function, number): *} options.setTimeout
   * @param {function(*): void} options.clearTimeout
   */
  constructor(options) {
    this.readCommittedRows = options.readCommittedRows;
    this.now = options.now;
    this.readTimeoutMs = options.readTimeoutMs;
    this.setTimeoutFn = options.setTimeout;
    this.clearTimeoutFn = options.clearTimeout;
    this.outcome = OUTCOME.PENDING;
    this.record = null;
    this.superseded = false;
    this.triggerGeneration = 0;
    this.inFlight = null;
    this.leaseRefreshHandle = null;
    this.listeners = new Set();
    this.stopped = false;
  }

  /**
   * Run (or join) one committed refresh and answer for the given nodes.
   * @return {Promise<void>}
   */
  readServeEligibility() {
    if (this.stopped) {
      return Promise.resolve();
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    const startedGeneration = this.triggerGeneration;
    this.inFlight = this.readCommittedRecord()
      .then((result) => this.adoptReadResult(result, startedGeneration))
      .finally(() => {
        this.inFlight = null;
        if (this.superseded && !this.stopped) {
          this.scheduleRefresh();
        }
      });
    return this.inFlight;
  }

  async readCommittedRecord() {
    const readAtMs = this.now();
    let nodesResult;
    let publicationsResult;
    try {
      [nodesResult, publicationsResult] = await Promise.all([
        this.readCommittedRows(TABLES.NODES,
          SELECT_ALL_PREFIX + TABLES.NODES, []),
        this.readCommittedRows(TABLES.CONTROL_PLANE_PUBLICATIONS,
          SELECT_ALL_PREFIX + TABLES.CONTROL_PLANE_PUBLICATIONS, []),
      ]);
    } catch {
      return {outcome: OUTCOME.READ_FAILED};
    }
    if (nodesResult?.success !== true || publicationsResult?.success !== true) {
      return {outcome: OUTCOME.READ_FAILED};
    }
    const publication = selectLatestPublishedMembership(
      Array.isArray(publicationsResult.rows) ? publicationsResult.rows : []);
    if (!publication) {
      return {outcome: OUTCOME.NO_RECORD};
    }
    const nodeRowsById = new Map();
    for (const row of Array.isArray(nodesResult.rows) ? nodesResult.rows : []) {
      const nodeId = readNodeId(row);
      if (nodeId) {
        nodeRowsById.set(nodeId, row);
      }
    }
    return {
      outcome: OUTCOME.RECORD,
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

  adoptReadResult(result, startedGeneration) {
    if (this.stopped) {
      return;
    }
    this.outcome = result.outcome;
    if (result.outcome === OUTCOME.RECORD) {
      this.record = result.record;
    } else if (result.outcome === OUTCOME.NO_RECORD) {
      this.record = null;
    }
    // A trigger observed while the read was in flight may postdate it.
    this.superseded = result.outcome === OUTCOME.READ_FAILED ?
      this.record !== null :
      this.triggerGeneration !== startedGeneration;
    this.armLeaseRefresh();
    for (const listener of this.listeners) {
      listener(this.record?.epoch ?? null);
    }
  }

  armLeaseRefresh() {
    if (this.leaseRefreshHandle !== null) {
      this.clearTimeoutFn(this.leaseRefreshHandle);
      this.leaseRefreshHandle = null;
    }
    if (!this.record) {
      return;
    }
    // The earliest committed lease that currently grants: past it the answer
    // is stale, so a committed refresh is due exactly then.
    let earliestMs = null;
    for (const nodeRow of this.record.nodeRowsById.values()) {
      const leaseExpiresAtMs = readLeaseExpiresAtMs(nodeRow);
      if (
        leaseExpiresAtMs !== null &&
        leaseExpiresAtMs > this.record.epoch.readAtMs &&
        (earliestMs === null || leaseExpiresAtMs < earliestMs)
      ) {
        earliestMs = leaseExpiresAtMs;
      }
    }
    if (earliestMs === null) {
      return;
    }
    const handle = this.setTimeoutFn(() => {
      this.leaseRefreshHandle = null;
      this.markSuperseded();
    }, Math.max(0, earliestMs - this.now()));
    handle?.unref?.();
    this.leaseRefreshHandle = handle;
  }

  scheduleRefresh() {
    this.readServeEligibility().catch(() => {});
  }

  markSuperseded() {
    this.triggerGeneration += 1;
    this.superseded = true;
    if (!this.inFlight && !this.stopped) {
      this.scheduleRefresh();
    }
  }

  /**
   * Cache trigger: a projected change that can make the committed record
   * older than the facts. Never grants, never denies.
   * @param {string} tableName
   * @param {Object|null} row
   */
  noteSourceChange(tableName, row) {
    if (this.stopped || !row) {
      return;
    }
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      const publication = normalizeControlPlanePublicationRow(row);
      if (!isMembershipPublication(publication)) {
        return;
      }
      if (
        !this.record ||
        publication.publicationEpoch > this.record.epoch.publicationEpoch ||
        publication.publicationId === this.record.epoch.publicationId
      ) {
        this.markSuperseded();
      }
      return;
    }
    if (tableName === TABLES.NODES && !this.record) {
      // No committed record yet (never read, none published, or the last
      // read failed): a node change is the trigger for the first or next read.
      this.markSuperseded();
      return;
    }
    if (tableName === TABLES.NODES) {
      const nodeId = readNodeId(row);
      if (!nodeId) {
        return;
      }
      if (
        isRevokingNodeChange(this.record.nodeRowsById.get(nodeId) || null, row)
      ) {
        this.markSuperseded();
        return;
      }
      // A lease extension leaves the committed answer valid until its own
      // expiry; it only triggers a background refresh (coalesced to one in
      // flight) so the record's leases advance before they elapse.
      if (!this.inFlight && !this.stopped) {
        this.scheduleRefresh();
      }
    }
  }

  /**
   * Synchronous answer from the epoch memo.
   * @param {string} nodeId
   * @return {Object}
   */
  answer(nodeId) {
    if (this.stopped) {
      return unavailable(SERVE_ELIGIBILITY_UNAVAILABLE_REASON.OWNER_STOPPED,
        null, null);
    }
    if (this.outcome === OUTCOME.PENDING) {
      return unavailable(SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_PENDING,
        null, this.readTimeoutMs);
    }
    if (this.outcome === OUTCOME.NO_RECORD) {
      return unavailable(SERVE_ELIGIBILITY_UNAVAILABLE_REASON.NO_RECORD,
        null, this.readTimeoutMs);
    }
    if (!this.record) {
      return unavailable(SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_FAILED,
        null, this.readTimeoutMs);
    }
    const {epoch} = this.record;
    if (this.superseded) {
      return unavailable(SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE, epoch,
        this.readTimeoutMs);
    }
    let decided = this.record.decisionsByNodeId.get(nodeId);
    if (!decided) {
      decided = decideServeEligibility({
        nodeId,
        nodeRow: this.record.nodeRowsById.get(nodeId) || null,
        publication: this.record.publication,
        readAtMs: epoch.readAtMs,
      });
      this.record.decisionsByNodeId.set(nodeId, decided);
    }
    const leaseExpiresAtMs =
      readLeaseExpiresAtMs(this.record.nodeRowsById.get(nodeId));
    if (
      decided.decision === SERVE_ELIGIBILITY_DECISION.ELIGIBLE &&
      leaseExpiresAtMs <= this.now()
    ) {
      this.markSuperseded();
      return unavailable(SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE, epoch,
        this.readTimeoutMs);
    }
    return Object.freeze({
      state: SERVE_ELIGIBILITY_STATE.READY,
      decision: decided.decision,
      reasons: decided.reasons.length === 0 ? NO_REASONS : decided.reasons,
      epoch,
      leaseExpiresAtMs,
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  shutdown() {
    this.stopped = true;
    if (this.leaseRefreshHandle !== null) {
      this.clearTimeoutFn(this.leaseRefreshHandle);
      this.leaseRefreshHandle = null;
    }
    this.listeners.clear();
  }
}

function isServeEligibilityAnswerEligible(answer) {
  return answer?.state === SERVE_ELIGIBILITY_STATE.READY &&
    answer.decision === SERVE_ELIGIBILITY_DECISION.ELIGIBLE;
}

export {
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_REASON,
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  ServeEligibilityOwner,
  decideServeEligibility,
  isServeEligibilityAnswerEligible,
};
