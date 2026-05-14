/**
 * TopologyAntiEntropyReconciler scans durable topology truth and enqueues
 * exact owner-key reconcile work. It never performs owner-local repair writes.
 */

import {LoggingService} from '../logging/logging-service.js';
import {COLUMN, NUM, TYPEOF} from '../constants/index.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {
  TOPOLOGY_ANTI_ENTROPY_DEFAULT,
  TOPOLOGY_ANTI_ENTROPY_ENQUEUE_STATUS,
  TOPOLOGY_ANTI_ENTROPY_ERROR_MSG,
  TOPOLOGY_ANTI_ENTROPY_FIELD,
  TOPOLOGY_ANTI_ENTROPY_ACTIVE_STATUS_BY_SURFACE,
  TOPOLOGY_ANTI_ENTROPY_ID_FIELDS_BY_SURFACE,
  TOPOLOGY_ANTI_ENTROPY_LOG_MSG,
  TOPOLOGY_ANTI_ENTROPY_OWNER_KEY_PREFIX,
  TOPOLOGY_ANTI_ENTROPY_READER_METHOD_ORDER,
  TOPOLOGY_ANTI_ENTROPY_SCAN_REASON,
  TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS,
  TOPOLOGY_ANTI_ENTROPY_SUBSYSTEM,
  TOPOLOGY_ANTI_ENTROPY_SURFACE,
  TOPOLOGY_ANTI_ENTROPY_SURFACE_FILTER_VALUE,
  TOPOLOGY_ANTI_ENTROPY_SURFACE_ORDER,
  TOPOLOGY_ANTI_ENTROPY_TABLE_BY_SURFACE,
  TOPOLOGY_ANTI_ENTROPY_TRIGGER,
} from './topology-anti-entropy-constants.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_ENQUEUE = 'enqueue';
const LOCAL_STR_SET_TIMEOUT = 'setTimeout';
const LOCAL_STR_CLEAR_TIMEOUT = 'clearTimeout';
const LOCAL_STR_COLON = ':';
const LOCAL_NUM_NEVER = NUM.NEGATIVE_ONE;
const LOCAL_TIMER_HANDLE_NONE = Object.freeze({
  [TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS]: 'none',
});

const SCAN_GATE_ACTION = Object.freeze({
  RUN: 'run',
  SKIP: 'skip',
});

const SCAN_GATE_DECISION_TABLE = Object.freeze([
  Object.freeze({
    action: SCAN_GATE_ACTION.SKIP,
    reason: TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.SCAN_IN_FLIGHT,
    matches: (snapshot) => snapshot.inFlight === true,
  }),
  Object.freeze({
    action: SCAN_GATE_ACTION.SKIP,
    reason: TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.COOLDOWN_ACTIVE,
    matches: (snapshot) => snapshot.cooldownActive === true,
  }),
  Object.freeze({
    action: SCAN_GATE_ACTION.RUN,
    reason: TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.DURABLE_TRUTH_SCAN,
    matches: () => true,
  }),
]);

const SURFACE_ELIGIBILITY_DEFAULT_EVALUATOR = () => true;
const SURFACE_ELIGIBILITY_EVALUATOR_BY_SURFACE = Object.freeze({
  [TOPOLOGY_ANTI_ENTROPY_SURFACE.PARTITION_SERVICES]:
    (reconciler, row) => row?.[COLUMN.SERVICE_TYPE] ===
      TOPOLOGY_ANTI_ENTROPY_SURFACE_FILTER_VALUE.PARTITION_SERVICE,
  [TOPOLOGY_ANTI_ENTROPY_SURFACE.PLACEMENT_TARGETS]:
    (reconciler, row, surface) => reconciler.isActiveSurfaceRow(surface, row),
  [TOPOLOGY_ANTI_ENTROPY_SURFACE.ACTIVE_PUBLICATIONS]:
    (reconciler, row, surface) => reconciler.isActiveSurfaceRow(surface, row),
});

class TopologyAntiEntropyReconciler {
  /**
   * @param {Object} options
   * @param {Object} options.durableTruthReader
   * @param {Object} [options.enqueueSink]
   * @param {Object} [options.reconcileQueue]
   * @param {Function} [options.enqueueOwnerRepair]
   * @param {Function} [options.nowFn]
   * @param {number} [options.scanIntervalMs]
   * @param {Function} [options.setTimer]
   * @param {Function} [options.clearTimer]
   */
  constructor(options = {}) {
    this.durableTruthReader = options.durableTruthReader || options.reader;
    this.enqueueOwnerRepair = this.resolveEnqueueFunction(options);
    this.nowFn = typeof options.nowFn === TYPEOF.FUNCTION ?
      options.nowFn : Date.now;
    this.setTimer = typeof options.setTimer === TYPEOF.FUNCTION ?
      options.setTimer : globalThis[LOCAL_STR_SET_TIMEOUT].bind(globalThis);
    this.clearTimer = typeof options.clearTimer === TYPEOF.FUNCTION ?
      options.clearTimer :
      globalThis[LOCAL_STR_CLEAR_TIMEOUT].bind(globalThis);
    this.scanIntervalMs = this.resolvePositiveNumber(
      options.scanIntervalMs,
      TOPOLOGY_ANTI_ENTROPY_DEFAULT.SCAN_INTERVAL_MS,
    );
    this.inFlight = false;
    this.started = false;
    this.timerHandle = LOCAL_TIMER_HANDLE_NONE;
    this.scanSequence = NUM.ZERO;
    this.lastScanStartedAt = LOCAL_NUM_NEVER;
    this.lastScanFinishedAt = LOCAL_NUM_NEVER;
    this.lastScanOutcome = this.buildInitialOutcome();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TOPOLOGY_ANTI_ENTROPY_SUBSYSTEM) :
      console;
  }

  /**
   * Start periodic low-rate scans.
   * @return {Object}
   */
  start() {
    this.started = true;
    this.scheduleNextScan(this.scanIntervalMs);
    this.logger.info(TOPOLOGY_ANTI_ENTROPY_LOG_MSG.STARTED, {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_INTERVAL_MS]:
        this.scanIntervalMs,
    });
    return this.getDiagnostics();
  }

  /**
   * Stop periodic scans and clear pending timer state.
   * @return {Object}
   */
  stop() {
    this.started = false;
    this.clearScheduledScan();
    this.logger.info(TOPOLOGY_ANTI_ENTROPY_LOG_MSG.STOPPED, {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_SEQUENCE]:
        this.scanSequence,
    });
    return this.getDiagnostics();
  }

  /**
   * Trigger one durable truth scan.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async triggerScan(options = {}) {
    const startedAt = this.now();
    const trigger = options[TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER] ||
      TOPOLOGY_ANTI_ENTROPY_TRIGGER.MANUAL;
    const gate = this.resolveScanGate({
      force: options[TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE] === true,
      now: startedAt,
    });

    if (gate.action === SCAN_GATE_ACTION.SKIP) {
      const skipped = this.buildSkippedOutcome(gate.reason, {
        [TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT]: startedAt,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER]: trigger,
      });
      this.lastScanOutcome = skipped;
      this.logger.debug(TOPOLOGY_ANTI_ENTROPY_LOG_MSG.SCAN_SKIPPED, skipped);
      return skipped;
    }

    return this.runDurableTruthScan({startedAt, trigger});
  }

  /**
   * Return current runtime diagnostics.
   * @return {Object}
   */
  getDiagnostics() {
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED]: this.started,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_INTERVAL_MS]:
        this.scanIntervalMs,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_SEQUENCE]: this.scanSequence,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.LAST_SCAN_STARTED_AT]:
        this.lastScanStartedAt,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.LAST_SCAN_FINISHED_AT]:
        this.lastScanFinishedAt,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.PENDING_TIMER]:
        this.timerHandle !== LOCAL_TIMER_HANDLE_NONE,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.LAST_SCAN_OUTCOME]:
        this.lastScanOutcome,
    };
  }

  async runDurableTruthScan(scanRequest) {
    this.inFlight = true;
    this.scanSequence += NUM.ONE;
    this.lastScanStartedAt =
      scanRequest[TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT];
    const scanId = this.buildScanId(this.scanSequence);

    try {
      const rawSnapshot = await this.readDurableTruthSnapshot();
      const snapshot = this.normalizeSnapshot(rawSnapshot, {
        [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]: scanId,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.OBSERVED_AT]:
          this.lastScanStartedAt,
      });
      const enqueueSummary = this.enqueueSnapshot(snapshot);
      const outcome = this.buildCompletedOutcome({
        ...scanRequest,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]: scanId,
        ...enqueueSummary,
      });
      this.lastScanOutcome = outcome;
      this.logger.info(TOPOLOGY_ANTI_ENTROPY_LOG_MSG.SCAN_COMPLETED, {
        [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]: scanId,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT]:
          outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT],
      });
      return outcome;
    } catch (error) {
      const unavailable = this.buildUnavailableOutcome(error, {
        ...scanRequest,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]: scanId,
      });
      this.lastScanOutcome = unavailable;
      this.logger.warn(
        TOPOLOGY_ANTI_ENTROPY_LOG_MSG.SCAN_UNAVAILABLE,
        unavailable,
      );
      return unavailable;
    } finally {
      this.inFlight = false;
      this.lastScanFinishedAt = this.now();
      this.scheduleNextScan(this.scanIntervalMs);
    }
  }

  readDurableTruthSnapshot() {
    const candidate = TOPOLOGY_ANTI_ENTROPY_READER_METHOD_ORDER
      .map((methodName) => ({
        methodName,
        read: this.durableTruthReader?.[methodName],
      }))
      .find((entry) => typeof entry.read === TYPEOF.FUNCTION);

    if (!candidate) {
      throw new Error(TOPOLOGY_ANTI_ENTROPY_ERROR_MSG.READER_REQUIRED);
    }

    return candidate.read.call(this.durableTruthReader);
  }

  normalizeSnapshot(rawSnapshot, scanContext) {
    const surfaceSummaries = TOPOLOGY_ANTI_ENTROPY_SURFACE_ORDER.map(
      (surface) => this.normalizeSurface(rawSnapshot, surface, scanContext),
    );
    const targets = surfaceSummaries.flatMap(
      (surfaceSummary) => surfaceSummary[TOPOLOGY_ANTI_ENTROPY_FIELD.TARGETS],
    );
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]:
        scanContext[TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.OBSERVED_AT]:
        scanContext[TOPOLOGY_ANTI_ENTROPY_FIELD.OBSERVED_AT],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES]: surfaceSummaries,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TARGETS]: targets,
    };
  }

  normalizeSurface(rawSnapshot, surface, scanContext) {
    const rows = this.resolveSurfaceRows(rawSnapshot, surface);
    const eligibleRows = rows.filter((row) =>
      this.isEligibleSurfaceRow(surface, row));
    const targets = eligibleRows
      .map((row) => this.buildTarget(surface, row, scanContext))
      .filter((target) =>
        target[TOPOLOGY_ANTI_ENTROPY_FIELD.OWNER_KEY] !== LOCAL_STR_EMPTY);
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACE]: surface,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TABLE_NAME]:
        TOPOLOGY_ANTI_ENTROPY_TABLE_BY_SURFACE[surface],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.RAW_ROW_COUNT]: rows.length,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ELIGIBLE_ROW_COUNT]:
        eligibleRows.length,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TARGETS]: targets,
    };
  }

  resolveSurfaceRows(rawSnapshot, surface) {
    const tableName = TOPOLOGY_ANTI_ENTROPY_TABLE_BY_SURFACE[surface];
    const candidates = [
      rawSnapshot?.[surface],
      rawSnapshot?.[TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES]?.[surface],
      rawSnapshot?.[tableName],
    ];
    const rows = candidates.find((candidate) => Array.isArray(candidate)) ||
      [];
    return rows.slice();
  }

  isEligibleSurfaceRow(surface, row) {
    const evaluator =
      SURFACE_ELIGIBILITY_EVALUATOR_BY_SURFACE[surface] ||
      SURFACE_ELIGIBILITY_DEFAULT_EVALUATOR;
    return evaluator(this, row, surface);
  }

  isActiveSurfaceRow(surface, row) {
    const activeStatuses = TOPOLOGY_ANTI_ENTROPY_ACTIVE_STATUS_BY_SURFACE[
      surface
    ];
    const normalizedStatus = this.normalizeText(row?.[COLUMN.STATUS]);
    return activeStatuses.includes(normalizedStatus);
  }

  buildTarget(surface, row, scanContext) {
    const ownerKey = this.resolveOwnerKey(surface, row);
    const evidenceKey = this.resolveEvidenceKey(surface, row, ownerKey);
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.OWNER_KEY]: ownerKey,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACE]: surface,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TABLE_NAME]:
        TOPOLOGY_ANTI_ENTROPY_TABLE_BY_SURFACE[surface],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.EVIDENCE_KEY]: evidenceKey,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.CONTEXT]: {
        [TOPOLOGY_ANTI_ENTROPY_FIELD.REASON]:
          TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.DURABLE_TRUTH_SCAN,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]:
          scanContext[TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID],
        [TOPOLOGY_ANTI_ENTROPY_FIELD.OBSERVED_AT]:
          scanContext[TOPOLOGY_ANTI_ENTROPY_FIELD.OBSERVED_AT],
        [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACE]: surface,
        [TOPOLOGY_ANTI_ENTROPY_FIELD.TABLE_NAME]:
          TOPOLOGY_ANTI_ENTROPY_TABLE_BY_SURFACE[surface],
        [TOPOLOGY_ANTI_ENTROPY_FIELD.EVIDENCE_KEY]: evidenceKey,
      },
    };
  }

  resolveOwnerKey(surface, row) {
    const explicitOwnerKey = this.normalizeText(
      row?.[TOPOLOGY_ANTI_ENTROPY_FIELD.OWNER_KEY],
    );
    const identity = this.resolveEvidenceIdentity(surface, row);
    const prefix = TOPOLOGY_ANTI_ENTROPY_OWNER_KEY_PREFIX[surface];
    const derivedOwnerKey = identity === LOCAL_STR_EMPTY ?
      LOCAL_STR_EMPTY :
      `${prefix}${LOCAL_STR_COLON}${identity}`;
    return explicitOwnerKey || derivedOwnerKey;
  }

  resolveEvidenceKey(surface, row, ownerKey) {
    const identity = this.resolveEvidenceIdentity(surface, row);
    return identity || ownerKey;
  }

  resolveEvidenceIdentity(surface, row) {
    const identityFields = TOPOLOGY_ANTI_ENTROPY_ID_FIELDS_BY_SURFACE[
      surface
    ];
    return identityFields
      .map((identityField) => this.normalizeText(row?.[identityField]))
      .find((identity) => identity.length > NUM.ZERO) || LOCAL_STR_EMPTY;
  }

  enqueueSnapshot(snapshot) {
    const results = snapshot[TOPOLOGY_ANTI_ENTROPY_FIELD.TARGETS].map(
      (target) => this.enqueueTarget(target),
    );
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES]:
        snapshot[TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_RESULTS]: results,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT]: results.length,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.CREATED_COUNT]:
        results.filter((result) =>
          result[TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS] ===
            TOPOLOGY_ANTI_ENTROPY_ENQUEUE_STATUS.ENQUEUED).length,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.MERGED_COUNT]:
        results.filter((result) =>
          result[TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS] ===
            TOPOLOGY_ANTI_ENTROPY_ENQUEUE_STATUS.MERGED).length,
    };
  }

  enqueueTarget(target) {
    const created = this.enqueueOwnerRepair(
      target[TOPOLOGY_ANTI_ENTROPY_FIELD.OWNER_KEY],
      RECONCILE_REASON.TOPOLOGY_DURABLE_TRUTH_SCAN,
      target[TOPOLOGY_ANTI_ENTROPY_FIELD.CONTEXT],
    );
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS]: created === true ?
        TOPOLOGY_ANTI_ENTROPY_ENQUEUE_STATUS.ENQUEUED :
        TOPOLOGY_ANTI_ENTROPY_ENQUEUE_STATUS.MERGED,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.OWNER_KEY]:
        target[TOPOLOGY_ANTI_ENTROPY_FIELD.OWNER_KEY],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACE]:
        target[TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACE],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TABLE_NAME]:
        target[TOPOLOGY_ANTI_ENTROPY_FIELD.TABLE_NAME],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.EVIDENCE_KEY]:
        target[TOPOLOGY_ANTI_ENTROPY_FIELD.EVIDENCE_KEY],
    };
  }

  resolveScanGate(scanRequest) {
    const cooldownActive =
      scanRequest[TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE] !== true &&
      this.lastScanStartedAt !== LOCAL_NUM_NEVER &&
      scanRequest.now - this.lastScanStartedAt < this.scanIntervalMs;
    const snapshot = Object.freeze({
      cooldownActive,
      inFlight: this.inFlight,
    });
    return SCAN_GATE_DECISION_TABLE.find((entry) =>
      entry.matches(snapshot));
  }

  scheduleNextScan(delayMs) {
    const shouldSchedule = this.started === true;
    if (shouldSchedule !== true) {
      return false;
    }
    this.clearScheduledScan();
    this.timerHandle = this.setTimer(
      () => {
        this.timerHandle = LOCAL_TIMER_HANDLE_NONE;
        this.triggerScan({
          [TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE]: true,
          [TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER]:
            TOPOLOGY_ANTI_ENTROPY_TRIGGER.PERIODIC_TIMER,
        });
      },
      delayMs,
    );
    return true;
  }

  clearScheduledScan() {
    const hasTimer = this.timerHandle !== LOCAL_TIMER_HANDLE_NONE;
    if (hasTimer === true) {
      this.clearTimer(this.timerHandle);
      this.timerHandle = LOCAL_TIMER_HANDLE_NONE;
    }
    return hasTimer;
  }

  buildInitialOutcome() {
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.SKIPPED,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.REASON]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.COOLDOWN_ACTIVE,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT]: NUM.ZERO,
    };
  }

  buildCompletedOutcome(scanResult) {
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.COMPLETED,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.REASON]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.DURABLE_TRUTH_SCAN,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_RESULTS]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_RESULTS],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.CREATED_COUNT]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.CREATED_COUNT],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.MERGED_COUNT]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.MERGED_COUNT],
    };
  }

  buildSkippedOutcome(reason, context) {
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.SKIPPED,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.REASON]: reason,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT]:
        context[TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER]:
        context[TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT]: NUM.ZERO,
    };
  }

  buildUnavailableOutcome(error, scanResult) {
    return {
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.UNAVAILABLE,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.REASON]:
        TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.READER_UNAVAILABLE,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.SCAN_ID],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED_AT],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER]:
        scanResult[TOPOLOGY_ANTI_ENTROPY_FIELD.TRIGGER],
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ERROR_MESSAGE]:
        this.normalizeText(error?.message) ||
          TOPOLOGY_ANTI_ENTROPY_ERROR_MSG.READER_REQUIRED,
      [TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT]: NUM.ZERO,
    };
  }

  resolveEnqueueFunction(options) {
    const enqueueCandidates = [
      {
        owner: options,
        enqueue: options.enqueueOwnerRepair,
      },
      {
        owner: options.enqueueSink,
        enqueue: options.enqueueSink?.[LOCAL_STR_ENQUEUE],
      },
      {
        owner: options.reconcileQueue,
        enqueue: options.reconcileQueue?.[LOCAL_STR_ENQUEUE],
      },
      {
        owner: options.queue,
        enqueue: options.queue?.[LOCAL_STR_ENQUEUE],
      },
    ];
    const candidate = enqueueCandidates.find((entry) =>
      typeof entry.enqueue === TYPEOF.FUNCTION);

    if (!candidate) {
      throw new Error(
        TOPOLOGY_ANTI_ENTROPY_ERROR_MSG.ENQUEUE_SINK_REQUIRED,
      );
    }

    return (ownerKey, reason, context) =>
      candidate.enqueue.call(candidate.owner, ownerKey, reason, context);
  }

  resolvePositiveNumber(candidate, fallback) {
    return typeof candidate === TYPEOF.NUMBER && candidate > NUM.ZERO ?
      candidate :
      fallback;
  }

  buildScanId(sequence) {
    return `${TOPOLOGY_ANTI_ENTROPY_SUBSYSTEM}${LOCAL_STR_COLON}${sequence}`;
  }

  normalizeText(value) {
    return typeof value === TYPEOF.STRING ? value.trim() : LOCAL_STR_EMPTY;
  }

  now() {
    return this.nowFn();
  }
}

export {TopologyAntiEntropyReconciler};
