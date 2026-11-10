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
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';
import {TABLES} from '../constants/index.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from './membership-publication-row-contract.js';
import {
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
  COMMITTED_READ_FAILED,
} from './serve-eligibility-record-decision.js';

const SELECT_ALL_PREFIX = 'SELECT * FROM ';
const ABORT_EVENT = 'abort';
const DEFAULT_CANCELLED_MESSAGE = 'Query cancelled';

function createCancellationError(reason) {
  if (reason instanceof Error) {
    return reason;
  }
  const message =
    typeof reason === 'string' && reason.length > 0 ?
      reason :
      DEFAULT_CANCELLED_MESSAGE;
  return new Error(message);
}

function throwIfCallerCancelled(options) {
  const cancellationToken = options?.cancellationToken || null;
  if (typeof cancellationToken?.throwIfCancelled === 'function') {
    cancellationToken.throwIfCancelled();
  }
  const signal = options?.signal || null;
  if (signal?.aborted) {
    throw createCancellationError(signal.reason);
  }
}

function readTimeoutBudgetRemainingMs(timeoutBudget, nowMs) {
  if (!timeoutBudget || typeof timeoutBudget !== 'object') {
    return null;
  }
  if (typeof timeoutBudget.remaining === 'function') {
    const remaining = timeoutBudget.remaining();
    if (Number.isFinite(remaining)) {
      return Math.max(0, remaining);
    }
  }
  if (Number.isFinite(timeoutBudget.deadlineMs)) {
    return Math.max(0, timeoutBudget.deadlineMs - nowMs);
  }
  return null;
}

function resolveCallerWaitBudgetMs(options, nowMs, defaultTimeoutMs) {
  let waitMs =
    Number.isFinite(defaultTimeoutMs) && defaultTimeoutMs > 0 ?
      defaultTimeoutMs :
      0;
  if (Number.isFinite(options?.timeoutMs)) {
    waitMs = Math.min(waitMs, Math.max(0, options.timeoutMs));
  }
  if (Number.isFinite(options?.deadlineMs)) {
    waitMs = Math.min(waitMs, Math.max(0, options.deadlineMs - nowMs));
  }
  const budgetRemainingMs = readTimeoutBudgetRemainingMs(
    options?.timeoutBudget,
    nowMs,
  );
  if (budgetRemainingMs !== null) {
    waitMs = Math.min(waitMs, budgetRemainingMs);
  }
  return Math.max(0, waitMs);
}

// The error a cancelled wait settles with: the token's own cancellation
// error when it states one, else a cancellation error for the reason.
function cancellationErrorOf(cancellationToken, reason) {
  if (typeof cancellationToken.throwIfCancelled === 'function') {
    try {
      cancellationToken.throwIfCancelled();
    } catch (error) {
      return error;
    }
  }
  return createCancellationError(reason);
}

function bindWaiterCancellation(options, onCancel) {
  const cleanups = [];
  const cancellationToken = options?.cancellationToken || null;
  if (typeof cancellationToken?.onCancel === 'function') {
    const cancelHandler = (reason) => {
      onCancel(cancellationErrorOf(cancellationToken, reason));
    };
    const off = cancellationToken.onCancel(cancelHandler);
    if (typeof off === 'function') {
      cleanups.push(off);
    }
  }
  const signal = options?.signal || null;
  if (typeof signal?.addEventListener === 'function') {
    const abortHandler = () => {
      onCancel(createCancellationError(signal.reason));
    };
    signal.addEventListener(ABORT_EVENT, abortHandler, {once: true});
    cleanups.push(() => {
      signal.removeEventListener?.(ABORT_EVENT, abortHandler);
    });
  }
  if (cleanups.length === 0) {
    return null;
  }
  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
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
    this.waiters = new Set();
    this.refreshRequested = false;
    this.refreshScheduled = false;
    this.leaseRefreshHandle = null;
    this.listeners = new Set();
    this.decisionSignature = null;
    this.lastReadFailure = null;
    this.stopped = false;
  }

  get currentRecord() {
    return this.record;
  }

  buildCurrentResult(outcome = this.outcome) {
    return Object.freeze({
      outcome,
      record: this.record,
      epoch: this.record?.epoch ?? null,
      superseded: this.superseded,
    });
  }

  async performRefresh() {
    this.refreshRequested = false;
    const startedGeneration = this.triggerGeneration;
    const result = await this.readCommittedRecord();
    this.adoptReadResult(result, startedGeneration);
    return result;
  }

  settleWaiters(result) {
    if (this.waiters.size === 0) {
      return;
    }
    const pendingWaiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of pendingWaiters) {
      waiter.resolve(result);
    }
  }

  rejectWaiters(error) {
    if (this.waiters.size === 0) {
      return;
    }
    const pendingWaiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of pendingWaiters) {
      waiter.reject(error);
    }
  }

  ensureRefresh() {
    if (this.stopped) {
      return Promise.resolve(this.buildCurrentResult(OUTCOME.SHUTDOWN));
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    const runRefresh = async () => {
      let lastOutcome = this.outcome;
      try {
        while (!this.stopped) {
          const result = await this.performRefresh();
          lastOutcome = result.outcome;
          if (
            result.outcome === OUTCOME.READ_FAILED ||
            !this.superseded ||
            !this.refreshRequested
          ) {
            const settledResult = this.buildCurrentResult(result.outcome);
            this.settleWaiters(settledResult);
            return settledResult;
          }
        }
        return this.buildCurrentResult(
          this.stopped ? OUTCOME.SHUTDOWN : lastOutcome,
        );
      } catch (error) {
        this.rejectWaiters(error);
        return this.buildCurrentResult(OUTCOME.READ_FAILED);
      }
    };
    this.inFlight = runRefresh().finally(() => {
      this.inFlight = null;
      if (this.waiters.size > 0) {
        this.settleWaiters(
          this.buildCurrentResult(
            this.stopped ? OUTCOME.SHUTDOWN : this.outcome,
          ),
        );
      }
      // A source event can postdate either a successful or failed read.
      // Retain that event once, independently of whether it revoked the
      // answer. The read result itself never creates another request.
      if (this.refreshRequested && !this.stopped) {
        this.scheduleRefresh();
      }
    });
    return this.inFlight;
  }

  /**
   * Run (or join) one committed refresh and answer for the given nodes,
   * bounded by the caller's own deadline and cancellation token.
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readServeEligibility(options = {}) {
    throwIfCallerCancelled(options);
    if (this.stopped) {
      return this.buildCurrentResult(OUTCOME.SHUTDOWN);
    }
    const waitMs = resolveCallerWaitBudgetMs(
      options,
      this.now(),
      this.readTimeoutMs,
    );
    if (waitMs <= 0) {
      if (!this.record || this.superseded) {
        this.ensureRefresh();
      }
      return this.buildCurrentResult(
        this.record ? OUTCOME.STALE_RETAINED : OUTCOME.UNINITIALIZED,
      );
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutHandle = null;
      let removeCancelListener = null;
      let waiter = null;
      const cleanup = () => {
        this.waiters.delete(waiter);
        if (timeoutHandle !== null) {
          this.clearTimeoutFn(timeoutHandle);
          timeoutHandle = null;
        }
        if (typeof removeCancelListener === 'function') {
          const unsubscribe = removeCancelListener;
          removeCancelListener = null;
          unsubscribe();
        }
      };
      waiter = {
        resolve: (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      };
      this.waiters.add(waiter);
      timeoutHandle = this.setTimeoutFn(() => {
        timeoutHandle = null;
        waiter.resolve(
          this.buildCurrentResult(
            this.record ? OUTCOME.STALE_RETAINED : OUTCOME.READ_FAILED,
          ),
        );
      }, waitMs);
      timeoutHandle?.unref?.();
      removeCancelListener = bindWaiterCancellation(options, (error) => {
        waiter.reject(error);
      });
      this.ensureRefresh();
    });
  }

  async readCommittedRecord() {
    const readAtMs = this.now();
    let reads;
    try {
      reads = await this.readCommittedTables();
    } catch {
      return COMMITTED_READ_FAILED;
    }
    return buildCommittedReadResult(reads, readAtMs);
  }

  // Both leader-required reads, or null when either answered unsuccessfully
  // (a read that throws rejects; readCommittedRecord names that outcome).
  async readCommittedTables() {
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
    return isRegressedCommittedReadResult(
      result,
      this.record,
      this.minPublicationEpoch,
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
    this.armLeaseRefresh();
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
    return evaluateServeEligibilityRecordSignature(
      this.record,
      this.outcome,
      this.isNodeLoadReady,
    );
  }

  armLeaseRefreshAt(targetMs, nowMs) {
    const handle = this.setTimeoutFn(() => {
      this.leaseRefreshHandle = null;
      this.markSuperseded();
    }, Math.max(0, targetMs - nowMs));
    handle?.unref?.();
    this.leaseRefreshHandle = handle;
  }

  armLeaseRefresh() {
    if (this.leaseRefreshHandle !== null) {
      this.clearTimeoutFn(this.leaseRefreshHandle);
      this.leaseRefreshHandle = null;
    }
    const nowMs = this.now();
    let earliestMs = null;
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

  // Source events retain one refresh across an in-flight read. Their wake
  // is separate from revocation: extending a lease need not revoke a grant.
  // A burst before a read starts coalesces into one deferred request.
  scheduleRefresh() {
    if (this.stopped) return;
    this.refreshRequested = true;
    if (this.inFlight || this.refreshScheduled) return;
    this.refreshScheduled = true;
    queueMicrotask(() => {
      this.refreshScheduled = false;
      if (!this.stopped && this.refreshRequested) {
        this.ensureRefresh();
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
    this.scheduleRefresh();
  }

  notePublicationSourceChange(row) {
    const pub = normalizeControlPlanePublicationRow(row);
    if (!isMembershipPublication(pub)) return;
    // A membership publication row without a stated status is counted as
    // published (the PR's decision, now explicit on STATE_ABSENT).
    const publicationStatus = readStateField(pub.status);
    const isPublished = publicationStatus === STATE_ABSENT ||
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
    if (isPublished) this.recordObservedPublicationEpoch(pub.publicationEpoch);
    if (shouldSupersedeOnPublicationChange(this.record, pub, isPublished)) {
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
    const committedRow = this.record.nodeRowsById.get(nodeId) || null;
    if (isOlderNodeHeartbeatProjection(committedRow, row)) {
      return;
    }
    if (
      isRevokingNodeChange(committedRow, row, this.isNodeLoadReady)
    ) {
      this.markSuperseded();
      return;
    }
    if (!hasAdvancedNodeLeaseOrHeartbeat(committedRow, row)) {
      return;
    }
    // A lease extension leaves the committed answer valid until its own
    // expiry; it only triggers a background refresh (coalesced to one in
    // flight) so the record's leases advance before they elapse.
    this.scheduleRefresh();
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
      this.scheduleRefresh();
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
    this.refreshRequested = false;
    this.refreshScheduled = false;
    if (this.leaseRefreshHandle !== null) {
      this.clearTimeoutFn(this.leaseRefreshHandle);
      this.leaseRefreshHandle = null;
    }
    this.settleWaiters(this.buildCurrentResult(OUTCOME.SHUTDOWN));
    this.listeners.clear();
  }
}

export {
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  ServeEligibilityOwner,
  isServeEligibilityAnswerEligible,
};
