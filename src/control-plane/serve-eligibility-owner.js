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
import {MEMBERSHIP_PUBLICATION_KIND, MEMBERSHIP_PUBLICATION_STATUS} from './membership-publication-row-contract.js';
import {
  resolveLatestPublishedPublicationRow,
  resolvePublishedActiveNodeIds,
} from './active-node-publication-snapshots.js';
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
  LOAD_NOT_READY: 'load_not_ready',
  NODE_NOT_PUBLISHED: 'node_not_published',
  PUBLICATION_NOT_ACKNOWLEDGED: 'publication_not_acknowledged',
  PRIORITY_SPREAD_PENDING:
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  PRIORITY_SPREAD_UNSTATED: 'priority_spread_unstated',
});

const SELECT_ALL_PREFIX = 'SELECT * FROM ';
const STALE_SIGNATURE = 'stale';
const REASON_SEPARATOR = ',';
const SIGNATURE_SEPARATOR = '|';
const READ_FAILURE_RETRY_MS = 100;
const NO_REASONS = Object.freeze([]);
const OUTCOME = Object.freeze({
  PENDING: 'pending',
  RECORD: 'record',
  NO_RECORD: 'no_record',
  READ_FAILED: 'read_failed',
  STALE: 'stale',
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
  if (!summary || typeof summary !== 'object') {
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

function isRevokingNodeChange(committedRow, changedRow, isNodeLoadReady) {
  if (!committedRow) {
    return true;
  }
  if (readStatus(committedRow) !== readStatus(changedRow)) {
    return true;
  }
  if (isNodeLoadReady(committedRow) !== isNodeLoadReady(changedRow)) {
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

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function indexNodeRows(rows) {
  const nodeRowsById = new Map();
  for (const row of rows) {
    const nodeId = readNodeId(row);
    if (nodeId) {
      nodeRowsById.set(nodeId, row);
    }
  }
  return nodeRowsById;
}

// The typed outcome of one committed read: failed, no published membership,
// or a record keyed by the publication epoch.
function buildCommittedReadResult(reads, readAtMs) {
  const publication = reads === null ? null :
    selectLatestPublishedMembership(rowsOf(reads.publicationsResult));
  const outcome = reads === null ? OUTCOME.READ_FAILED :
    publication === null ? OUTCOME.NO_RECORD :
      OUTCOME.RECORD;
  return outcome !== OUTCOME.RECORD ? {outcome} : {
    outcome,
    record: Object.freeze({
      epoch: Object.freeze({
        publicationEpoch: publication.publicationEpoch,
        publicationId: publication.publicationId,
        readAtMs,
      }),
      publication,
      nodeRowsById: indexNodeRows(rowsOf(reads.nodesResult)),
      decisionsByNodeId: new Map(),
    }),
  };
}

function checkOwnerUnavailability(owner) {
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
      owner.readTimeoutMs,
    );
  }
  if (owner.outcome === OUTCOME.NO_RECORD) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.NO_RECORD,
      null,
      owner.readTimeoutMs,
    );
  }
  if (owner.outcome === OUTCOME.STALE) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      owner.record?.epoch ?? null,
      owner.readTimeoutMs,
    );
  }
  if (!owner.record) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_FAILED,
      null,
      owner.readTimeoutMs,
    );
  }
  if (owner.superseded) {
    return unavailable(
      SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
      owner.record.epoch,
      owner.readTimeoutMs,
    );
  }
  return null;
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
   * @param {function(Object): boolean} options.isNodeLoadReady the readiness
   *   owner's load threshold over the committed node row.
   */
  constructor(options) {
    this.readCommittedRows = options.readCommittedRows;
    this.isNodeLoadReady = options.isNodeLoadReady;
    this.now = options.now;
    this.readTimeoutMs = options.readTimeoutMs;
    this.setTimeoutFn = options.setTimeout;
    this.clearTimeoutFn = options.clearTimeout;
    this.outcome = OUTCOME.PENDING;
    this.record = null;
    this.minPublicationEpoch = null;
    this.superseded = false;
    this.triggerGeneration = 0;
    this.inFlight = null;
    this.leaseRefreshHandle = null;
    this.listeners = new Set();
    this.decisionSignature = null;
    this.lastReadFailure = null;
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
        // A trigger that arrived during a successful read is served by one
        // more read. A failed read is not retried here: the next trigger
        // (a cache change, the lease timer or a routing denial) asks again,
        // and the answer stays the typed unavailability meanwhile.
        if (
          this.superseded &&
          this.outcome !== OUTCOME.READ_FAILED &&
          this.triggerGeneration !== startedGeneration &&
          !this.stopped
        ) {
          this.scheduleRefresh();
        }
      });
    return this.inFlight;
  }

  async readCommittedRecord() {
    const readAtMs = this.now();
    const reads = await this.readCommittedTables();
    return buildCommittedReadResult(reads, readAtMs);
  }

  // Both leader-required reads, or null when either did not answer.
  async readCommittedTables() {
    try {
      const [nodesResult, publicationsResult] = await Promise.all([
        this.readCommittedRows(TABLES.NODES,
          SELECT_ALL_PREFIX + TABLES.NODES, []),
        this.readCommittedRows(TABLES.CONTROL_PLANE_PUBLICATIONS,
          SELECT_ALL_PREFIX + TABLES.CONTROL_PLANE_PUBLICATIONS, []),
      ]);
      return nodesResult?.success === true &&
        publicationsResult?.success === true ?
        {nodesResult, publicationsResult} :
        null;
    } catch {
      return null;
    }
  }

  recordObservedPublicationEpoch(publicationEpoch) {
    if (
      Number.isSafeInteger(publicationEpoch) &&
      (this.minPublicationEpoch === null ||
        publicationEpoch > this.minPublicationEpoch)
    ) {
      this.minPublicationEpoch = publicationEpoch;
    }
  }

  isRegressedReadResult(result) {
    if (result.outcome === OUTCOME.NO_RECORD) {
      return (
        this.record !== null ||
        (Number.isSafeInteger(this.minPublicationEpoch) &&
          this.minPublicationEpoch > 0)
      );
    }
    if (result.outcome !== OUTCOME.RECORD) {
      return false;
    }
    const epoch = result.record.epoch.publicationEpoch;
    return (
      (Number.isSafeInteger(this.minPublicationEpoch) &&
        epoch < this.minPublicationEpoch) ||
      (Number.isSafeInteger(this.record?.epoch?.publicationEpoch) &&
        epoch < this.record.epoch.publicationEpoch)
    );
  }

  adoptReadResult(result, startedGeneration) {
    if (this.stopped) {
      return;
    }
    const previousSignature = this.answeredSignature();
    const regressedRead = this.isRegressedReadResult(result);
    if (result.outcome === OUTCOME.READ_FAILED) {
      this.outcome = OUTCOME.READ_FAILED;
      // A failed read revokes nothing: the committed record keeps answering
      // until its own lease expires (answer() bounds it) or a revoking
      // trigger marks it stale. The failure is a typed observation; the next
      // demand-, trigger- or timer-driven read retries. With no committed
      // record the answer is the typed committed_read_failed (fail closed).
      this.lastReadFailure = Object.freeze({
        reason: SERVE_ELIGIBILITY_UNAVAILABLE_REASON.READ_FAILED,
        observedAtMs: this.now(),
      });
    } else if (regressedRead) {
      this.outcome = this.record ? OUTCOME.RECORD : OUTCOME.STALE;
      this.lastReadFailure = null;
      this.superseded = true;
    } else {
      this.outcome = result.outcome;
      this.record = result.outcome === OUTCOME.RECORD ? result.record : null;
      this.recordObservedPublicationEpoch(
        this.record?.epoch?.publicationEpoch ?? null,
      );
      this.lastReadFailure = null;
      // A trigger observed while the read was in flight may postdate it.
      this.superseded = this.triggerGeneration !== startedGeneration;
    }
    this.armLeaseRefresh(
      regressedRead && this.triggerGeneration === startedGeneration,
    );
    // Derived memos re-key only when the committed answer changes (a new
    // epoch, outcome or per-node decision); a refresh that only advanced
    // leases changes no answer.
    this.decisionSignature = this.buildDecisionSignature();
    if (this.answeredSignature() === previousSignature) {
      return;
    }
    this.notifyListeners();
  }

  // What consumers can observe: the decisions, or that the record is stale.
  answeredSignature() {
    return this.superseded ? STALE_SIGNATURE : this.decisionSignature;
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.record?.epoch ?? null);
    }
  }

  buildDecisionSignature() {
    if (!this.record) {
      return this.outcome;
    }
    const nodeIds = new Set([
      ...this.record.nodeRowsById.keys(),
      ...this.record.publication.publishedActiveNodeIds,
    ]);
    const parts = [this.outcome, this.record.epoch.publicationEpoch,
      this.record.epoch.publicationId];
    for (const nodeId of [...nodeIds].sort()) {
      const decided = decideServeEligibility({
        nodeId,
        nodeRow: this.record.nodeRowsById.get(nodeId) || null,
        publication: this.record.publication,
        readAtMs: this.record.epoch.readAtMs,
        isNodeLoadReady: this.isNodeLoadReady,
      });
      this.record.decisionsByNodeId.set(nodeId, decided);
      parts.push(`${nodeId}=${decided.decision}:${decided.reasons.join(REASON_SEPARATOR)}`);
    }
    return parts.join(SIGNATURE_SEPARATOR);
  }

  armLeaseRefreshAt(targetMs, nowMs) {
    const handle = this.setTimeoutFn(() => {
      this.leaseRefreshHandle = null;
      this.markSuperseded();
    }, Math.max(0, targetMs - nowMs));
    handle?.unref?.();
    this.leaseRefreshHandle = handle;
  }

  armLeaseRefresh(retryRegressedRead = false) {
    if (this.leaseRefreshHandle !== null) {
      this.clearTimeoutFn(this.leaseRefreshHandle);
      this.leaseRefreshHandle = null;
    }
    const nowMs = this.now();
    let earliestMs = retryRegressedRead ? nowMs + READ_FAILURE_RETRY_MS : null;
    if (this.record) {
      // The earliest committed lease that currently grants: past it the answer
      // is stale, so a committed refresh is due exactly then.
      for (const nodeRow of this.record.nodeRowsById.values()) {
        const leaseExpiresAtMs = readLeaseExpiresAtMs(nodeRow);
        if (
          leaseExpiresAtMs === null ||
          leaseExpiresAtMs <= this.record.epoch.readAtMs
        ) {
          continue;
        }
        if (leaseExpiresAtMs <= nowMs) {
          this.superseded = true;
        } else if (earliestMs === null || leaseExpiresAtMs < earliestMs) {
          earliestMs = leaseExpiresAtMs;
        }
      }
    }
    if (earliestMs === null) {
      return;
    }
    this.armLeaseRefreshAt(earliestMs, nowMs);
  }

  // A refresh never starts inside the triggering turn (a cache apply or a
  // reader); it starts on the next microtask and joins one in flight.
  scheduleRefresh() {
    queueMicrotask(() => {
      if (!this.stopped) {
        this.readServeEligibility().catch(() => {});
      }
    });
  }

  markSuperseded() {
    this.triggerGeneration += 1;
    const wasCurrent = !this.superseded;
    this.superseded = true;
    if (wasCurrent && this.record) {
      // Derived memos re-key after the triggering turn, never inside a cache
      // apply.
      queueMicrotask(() => {
        if (!this.stopped) {
          this.notifyListeners();
        }
      });
    }
    if (!this.inFlight && !this.stopped) {
      this.scheduleRefresh();
    }
  }

  notePublicationSourceChange(row) {
    const pub = normalizeControlPlanePublicationRow(row);
    if (!isMembershipPublication(pub)) return;
    const isPublished = !pub.status ||
      pub.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
    if (isPublished) this.recordObservedPublicationEpoch(pub.publicationEpoch);
    const heldEpoch = this.record?.epoch || null;
    if (
      (heldEpoch && pub.publicationId === heldEpoch.publicationId) ||
      (isPublished && (!heldEpoch || pub.publicationEpoch > heldEpoch.publicationEpoch))
    ) {
      this.markSuperseded();
    }
  }

  noteNodeSourceChange(row) {
    if (!this.record) {
      // No committed record yet (never read, none published, or the last
      // read failed): a node change is the trigger for the first or next read.
      this.markSuperseded();
      return;
    }
    const nodeId = readNodeId(row);
    if (!nodeId) {
      return;
    }
    if (
      isRevokingNodeChange(this.record.nodeRowsById.get(nodeId) || null, row,
        this.isNodeLoadReady)
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

  /**
   * Cache trigger: a projected change that can make the committed record
   * older than the facts. Never grants, never denies.
   * @param {string} tableName
   * @param {Object|string|null} rowOrOperation
   * @param {Object|null} [maybeRow=null]
   */
  noteSourceChange(tableName, rowOrOperation, maybeRow = null) {
    const row =
      typeof rowOrOperation === 'string' ? maybeRow : rowOrOperation;
    if (this.stopped || !row) {
      return;
    }
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      this.notePublicationSourceChange(row);
    } else if (tableName === TABLES.NODES) {
      this.noteNodeSourceChange(row);
    }
  }

  /**
   * Synchronous answer from the epoch memo.
   * @param {string} nodeId
   * @return {Object}
   */
  answer(nodeId) {
    const unavail = checkOwnerUnavailability(this);
    if (unavail) {
      return unavail;
    }
    const {epoch} = this.record;
    let decided = this.record.decisionsByNodeId.get(nodeId);
    if (!decided) {
      decided = decideServeEligibility({
        nodeId,
        nodeRow: this.record.nodeRowsById.get(nodeId) || null,
        publication: this.record.publication,
        readAtMs: epoch.readAtMs,
        isNodeLoadReady: this.isNodeLoadReady,
      });
      this.record.decisionsByNodeId.set(nodeId, decided);
    }
    const leaseExpiresAtMs =
      readLeaseExpiresAtMs(this.record.nodeRowsById.get(nodeId));
    if (
      decided.decision === SERVE_ELIGIBILITY_DECISION.ELIGIBLE &&
      leaseExpiresAtMs <= this.now()
    ) {
      // Quiet inside a read: the armed lease timer is the trigger that
      // re-keys derived memos; a reader only schedules the refresh.
      this.triggerGeneration += 1;
      this.superseded = true;
      if (!this.inFlight) {
        this.scheduleRefresh();
      }
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

  /**
   * Synchronous answer for a cohort of nodes.
   * @param {Array<string>} [nodeIds]
   * @return {Object}
   */
  answerCohort(nodeIds) {
    const unavail = checkOwnerUnavailability(this);
    if (unavail) {
      return Object.freeze({
        state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
        reason: unavail.reason,
        epoch: unavail.epoch,
        retryAfterMs: unavail.retryAfterMs,
        answers: Object.freeze({}),
        eligibleNodeIds: Object.freeze([]),
      });
    }
    const {epoch} = this.record;
    const targetNodeIds = Array.isArray(nodeIds) && nodeIds.length > 0 ?
      nodeIds :
      [...new Set([
        ...this.record.nodeRowsById.keys(),
        ...this.record.publication.publishedActiveNodeIds,
      ])];
    const answers = {};
    const eligibleNodeIds = [];
    let unavailableMember = null;
    for (const nodeId of targetNodeIds) {
      const memberAnswer = this.answer(nodeId);
      answers[nodeId] = memberAnswer;
      if (memberAnswer.state === SERVE_ELIGIBILITY_STATE.UNAVAILABLE) {
        if (!unavailableMember) {
          unavailableMember = memberAnswer;
        }
      } else if (memberAnswer.decision === SERVE_ELIGIBILITY_DECISION.ELIGIBLE) {
        eligibleNodeIds.push(nodeId);
      }
    }
    if (unavailableMember) {
      return Object.freeze({
        state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
        reason: unavailableMember.reason,
        epoch,
        retryAfterMs: this.readTimeoutMs,
        answers: Object.freeze(answers),
        eligibleNodeIds: Object.freeze(eligibleNodeIds),
      });
    }
    return Object.freeze({
      state: SERVE_ELIGIBILITY_STATE.READY,
      epoch,
      answers: Object.freeze(answers),
      eligibleNodeIds: Object.freeze(eligibleNodeIds),
    });
  }

  answerCommittedNodes() {
    const unavail = checkOwnerUnavailability(this);
    if (unavail) {
      return Object.freeze({
        state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
        reason: unavail.reason,
        epoch: unavail.epoch,
        retryAfterMs: unavail.retryAfterMs,
        nodeRows: Object.freeze([]),
      });
    }
    return Object.freeze({
      state: SERVE_ELIGIBILITY_STATE.READY,
      epoch: this.record.epoch,
      nodeRows: Object.freeze(Array.from(this.record.nodeRowsById.values())),
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
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  ServeEligibilityOwner,
  isServeEligibilityAnswerEligible,
};
