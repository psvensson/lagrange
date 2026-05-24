import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {METRICS_LOG_PREFIX} from '../constants/metrics-constants.js';
import {
  LOGGING_LOG_MSG,
  LOG_LEVEL_ORDER,
  LOGS_TABLE_DEFAULT,
} from './logging-constants.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  LOCAL_NUM_ZERO,
  LOCAL_NUM_ONE,
  LOCAL_STR_CLOSED,
  LOCAL_STR_STRING,
  LOCAL_STR_INFO,
  LOCAL_STR_PIPE,
  LOCAL_STR_EMPTY,
  LOCAL_STR_1M0NB,
  LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS,
  LOGGING_PIPELINE_METRIC_PREFIXES,
  MIN_CHUNK_SIZE,
  MIN_SLEEP_MS,
  LOG_PRESSURE_FAMILY,
  LOG_PRESSURE_MESSAGE_FRAGMENT,
} from './logs-table-service-constants.js';

/**
 * Return the shared pressure governor for background log persistence.
 * @return {PressureGovernor}
 * @private
 */
function getPressureGovernor() {
  if (this.pressureGovernor) {
    this.pressureGovernor.configure?.({
      messageRouter: this.messageRouter || null,
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  const config = ConfigurationManager.getInstance();
  this.pressureGovernor = PressureGovernor.getShared({
    nodeId: config.get(CONFIG_KEY.NODE_ID),
    messageRouter: this.messageRouter || null,
    logger: this.logger,
  });
  return this.pressureGovernor;
}

/**
 * Evaluate the shared pressure policy for one background log write and arm a
 * bounded defer window when transport is already hot.
 * @private
 */
function applySharedPressureDeferWindow() {
  const decision = this.getPressureGovernor().evaluate({
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    resourceKeys: [...LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS],
    allowDegrade: true,
    allowDefer: true,
    retryAfterMs: this.retryDelayMs,
  });
  if (decision?.action !== PRESSURE_GOVERNOR_ACTION.DEFER &&
      decision?.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE) {
    return;
  }
  const retryAfterMs = Number.isFinite(decision?.retryAfterMs) &&
    decision.retryAfterMs > 0 ?
    Math.floor(decision.retryAfterMs) :
    Math.max(MIN_SLEEP_MS, this.retryDelayMs);
  this.writeDeferredUntilMs = Math.max(
    this.writeDeferredUntilMs || LOCAL_NUM_ZERO,
    this.now() + retryAfterMs,
  );
  this.trimPendingWritesUnderPressure();
  this.scheduleContinuationFlush(retryAfterMs);
}

/**
 * Whether the shared pressure policy currently sees transport backpressure.
 * @return {boolean}
 * @private
 */
function isSharedPressureBackpressured(resourceKeys = null) {
  const pressureResourceKeys =
    Array.isArray(resourceKeys) && resourceKeys.length > LOCAL_NUM_ZERO ?
      resourceKeys :
      LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS;
  return this.getPressureGovernor().isBackpressured({
    resourceKeys: pressureResourceKeys,
  });
}

/**
 * Check whether an entry is metrics namespace log.
 * @param {Object} entry - Log entry.
 * @return {boolean}
 * @private
 */
function isMetricsLogEntry(entry) {
  return typeof entry?.message === LOCAL_STR_STRING &&
    entry.message.startsWith(METRICS_LOG_PREFIX);
}

/**
 * Return normalized priority for one log entry.
 * Higher values are more important.
 * @param {Object} entry
 * @return {number}
 * @private
 */
function getLogPriority(entry) {
  const normalizedLevel = String(entry?.level || 'INFO').toUpperCase();
  return Number.isInteger(LOG_LEVEL_ORDER[normalizedLevel]) ?
    LOG_LEVEL_ORDER[normalizedLevel] :
    LOG_LEVEL_ORDER.INFO;
}

/**
 * Determine whether the logs-table writer is in sustained pressure mode.
 * @return {boolean}
 * @private
 */
function isPressureModeActive() {
  return this.isWriteDeferred() ||
    this.pendingWrites.length >= this.pressureHighWatermark;
}

/**
 * Return the retained backlog cap applied while the writer is deferred.
 * @return {number}
 * @private
 */
function getRetainedPressureBacklogCap() {
  return Math.max(
    MIN_CHUNK_SIZE,
    Math.min(
      this.maxPendingWrites,
      this.pressureHighWatermark,
      this.pressureRetainedPendingWrites,
    ),
  );
}

/**
 * Determine whether the deferred-pressure backlog cap should be applied.
 * @return {boolean}
 * @private
 */
function shouldApplyRetainedBacklogCap() {
  return this.isWriteDeferred();
}

/**
 * Build a stable fingerprint used to collapse repeated pressure logs.
 * @param {Object} entry
 * @return {string|null}
 * @private
 */
function buildPressureFingerprint(entry) {
  const message = typeof entry?.message === 'string' ?
    entry.message.trim() :
    '';
  if (!message) {
    return null;
  }
  const metadata = entry?.metadata &&
    typeof entry.metadata === 'object' ?
    entry.metadata :
    {};
  const subsystem = typeof metadata.subsystem === 'string' ?
    metadata.subsystem :
    '';
  const partitionId = typeof metadata.partitionId === 'string' ?
    metadata.partitionId :
    '';
  const tableName = typeof metadata.tableName === 'string' ?
    metadata.tableName :
    '';
  const transientFamily = this.resolveTransientPressureFamily(
    message,
    partitionId || tableName || '',
  );
  const fingerprintNodeId = transientFamily ? '' : (entry?.nodeId || '');
  return [
    String(entry?.level || LOCAL_STR_INFO).toUpperCase(),
    fingerprintNodeId,
    subsystem,
    transientFamily || message,
  ].join(LOCAL_STR_PIPE);
}

/**
 * Collapse repeated transport/control-plane outage noise to a stable family
 * so pressure mode keeps one exemplar per affected subsystem/resource.
 * @param {string} message
 * @param {string} resourceId
 * @return {string|null}
 * @private
 */
function resolveTransientPressureFamily(message, resourceId = LOCAL_STR_EMPTY) {
  if (typeof message !== LOCAL_STR_STRING || message.length === LOCAL_NUM_ZERO) {
    return null;
  }
  const normalizedResourceId = typeof resourceId === 'string' ?
    resourceId.trim() :
    '';
  const suffix = normalizedResourceId || 'shared';
  if (
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.PARTICIPANT_FAILURE) ||
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.TRANSIENT_CDC_SQL_ERROR) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT.TRANSIENT_CDC_SQL_EXCEPTION,
    ) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT.FAILED_TO_UPDATE_SYSTEM_TABLE_ROW,
    ) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT
        .DEFERRED_RETRYABLE_REPLICA_OPERATION_TRANSITION_FAILURE,
    )
  ) {
    return `${LOG_PRESSURE_FAMILY.PARTICIPANT_FAILURE}:${suffix}`;
  }
  if (
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.CONNECTION_CLOSED) &&
    message.includes(LOCAL_STR_CLOSED)
  ) {
    return `${LOG_PRESSURE_FAMILY.CONNECTION_CLOSED}:${suffix}`;
  }
  if (
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.NO_CONNECTION) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT
        .FAILED_TO_RECONNECT_TARGET_NODE_BEFORE_DELIVERY,
    ) ||
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.RECONNECTION_FAILED) ||
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.WEBSOCKET_ERROR)
  ) {
    return `${LOG_PRESSURE_FAMILY.NO_CONNECTION}:${suffix}`;
  }
  if (message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.MESSAGE_TIMEOUT)) {
    return `${LOG_PRESSURE_FAMILY.MESSAGE_TIMEOUT}:${suffix}`;
  }
  if (
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.QUERY_ROUTING_FAILED) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT.PARALLEL_QUERY_EXECUTION_FAILED,
    ) ||
    message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.QUERY_EXECUTION_FAILED) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT
        .PARTITION_ROUTING_CANDIDATES_FILTERED_BY_READINESS,
    ) ||
    message.includes(
      LOG_PRESSURE_MESSAGE_FRAGMENT
        .FAILED_TO_QUERY_OPERATIONS_FROM_SYSTEM_TABLE,
    )
  ) {
    return `${LOG_PRESSURE_FAMILY.QUERY_ROUTING_FAILED}:${suffix}`;
  }
  if (message.includes(LOG_PRESSURE_MESSAGE_FRAGMENT.FORWARD_WRITE_FAILED)) {
    return `${LOG_PRESSURE_FAMILY.FORWARD_WRITE_FAILED}:${suffix}`;
  }
  return null;
}

/**
 * Check whether a pressure-equivalent entry is already queued.
 * @param {Object} entry
 * @return {boolean}
 * @private
 */
function hasPendingPressureEquivalentEntry(entry) {
  const fingerprint = this.buildPressureFingerprint(entry);
  if (!fingerprint) {
    return false;
  }
  for (const pendingEntry of this.pendingWrites) {
    if (this.buildPressureFingerprint(pendingEntry) === fingerprint) {
      return true;
    }
  }
  return false;
}

/**
 * Determine whether an incoming entry should be dropped while the owner is
 * pressure-deferred or the queue is already hot.
 * @param {Object} entry
 * @return {boolean}
 * @private
 */
function shouldDropEntryUnderPressure(entry) {
  if (this.shouldApplyRetainedBacklogCap() &&
      this.pendingWrites.length >= this.getRetainedPressureBacklogCap() &&
      this.getLogPriority(entry) < LOG_LEVEL_ORDER.ERROR) {
    return true;
  }
  if (this.isMetricsLogEntry(entry)) {
    return true;
  }
  if (this.getLogPriority(entry) <= LOG_LEVEL_ORDER.INFO) {
    return true;
  }
  return this.hasPendingPressureEquivalentEntry(entry);
}

/**
 * Check whether an entry is a logging-pipeline metrics event.
 * These entries are dropped to prevent metrics->logging recursion.
 * @param {Object} entry - Log entry.
 * @return {boolean}
 * @private
 */
function isLoggingPipelineMetricsEntry(entry) {
  const message = typeof entry?.message === 'string' ?
    entry.message :
    '';
  if (!message) {
    return false;
  }
  for (const prefix of LOGGING_PIPELINE_METRIC_PREFIXES) {
    if (message.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Drop one queued metrics log entry to make room for non-metrics logs.
 * @return {boolean} True when a metrics entry was dropped.
 * @private
 */
function dropPendingMetricsLogEntry() {
  for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index++) {
    const entry = this.pendingWrites[index];
    if (!this.isMetricsLogEntry(entry)) {
      continue;
    }
    this.pendingWrites.splice(index, LOCAL_NUM_ONE);
    this.recordDroppedWrite();
    return true;
  }
  return false;
}

/**
 * Drop one queued entry so a more important incoming entry can be admitted.
 * Prefer dropping metrics, then lower-priority entries, then duplicates.
 * @param {Object} incomingEntry
 * @return {boolean}
 * @private
 */
function dropPendingQueuedEntryForAdmission(incomingEntry) {
  if (this.dropPendingMetricsLogEntry()) {
    return true;
  }

  const incomingPriority = this.getLogPriority(incomingEntry);
  for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index++) {
    const pendingEntry = this.pendingWrites[index];
    if (this.getLogPriority(pendingEntry) >= incomingPriority) {
      continue;
    }
    this.pendingWrites.splice(index, LOCAL_NUM_ONE);
    this.recordDroppedWrite();
    return true;
  }

  const incomingFingerprint = this.buildPressureFingerprint(incomingEntry);
  if (!incomingFingerprint) {
    return false;
  }
  for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index++) {
    const pendingEntry = this.pendingWrites[index];
    if (this.buildPressureFingerprint(pendingEntry) !== incomingFingerprint) {
      continue;
    }
    this.pendingWrites.splice(index, LOCAL_NUM_ONE);
    this.recordDroppedWrite();
    return true;
  }

  return false;
}

/**
 * Trim retained backlog aggressively during defer windows so the writer does
 * not keep retaining outage noise while the control plane is unavailable.
 * @private
 */
function trimPendingWritesUnderPressure() {
  const retainedCap = this.getRetainedPressureBacklogCap();
  let droppedCount = LOCAL_NUM_ZERO;
  while (this.pendingWrites.length > retainedCap) {
    const dropIndex = this.findPendingTrimDropIndex();
    if (dropIndex < LOCAL_NUM_ZERO) {
      break;
    }
    this.pendingWrites.splice(dropIndex, LOCAL_NUM_ONE);
    this.recordDroppedWrite();
    droppedCount += LOCAL_NUM_ONE;
  }
  if (droppedCount > LOCAL_NUM_ZERO) {
    this.incrementBoundedCounter(
      LOCAL_STR_1M0NB,
      droppedCount,
    );
  }
  return droppedCount;
}

/**
 * Select one queued entry to evict while trimming deferred-pressure backlog.
 * Prefer metrics, then duplicate fingerprints, then the oldest lowest-
 * priority entry.
 * @return {number}
 * @private
 */
function findPendingTrimDropIndex() {
  const seenFingerprints = new Set();
  let lowestPriorityIndex = -LOCAL_NUM_ONE;
  let lowestPriority = Number.POSITIVE_INFINITY;

  for (let index = LOCAL_NUM_ZERO; index < this.pendingWrites.length; index += LOCAL_NUM_ONE) {
    const entry = this.pendingWrites[index];
    if (this.isMetricsLogEntry(entry)) {
      return index;
    }

    const fingerprint = this.buildPressureFingerprint(entry);
    if (fingerprint) {
      if (seenFingerprints.has(fingerprint)) {
        return index;
      }
      seenFingerprints.add(fingerprint);
    }

    const priority = this.getLogPriority(entry);
    if (priority < lowestPriority) {
      lowestPriority = priority;
      lowestPriorityIndex = index;
    }
  }

  return lowestPriorityIndex;
}

/**
 * Update drop counters and emit throttled warning log.
 * @private
 */
function recordDroppedWrite() {
  this.droppedWrites += LOCAL_NUM_ONE;
  if (this.droppedWrites === LOCAL_NUM_ONE ||
    this.droppedWrites % LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL === LOCAL_NUM_ZERO) {
    this.logger.warn(
      LOGGING_LOG_MSG.logsDroppedByBackpressure(
        this.droppedWrites,
        this.maxPendingWrites,
      ),
    );
  }
}

/**
 * Increment a bounded diagnostic counter.
 * @param {string} fieldName
 * @param {number} [delta=1]
 * @private
 */
function incrementBoundedCounter(fieldName, delta = LOCAL_NUM_ONE) {
  if (typeof fieldName !== LOCAL_STR_STRING || fieldName.length === LOCAL_NUM_ZERO) {
    return;
  }
  if (!Number.isFinite(delta) || delta <= LOCAL_NUM_ZERO) {
    return;
  }
  const currentValue = Number.isFinite(this[fieldName]) ?
    this[fieldName] :
    0;
  this[fieldName] = Math.min(
    Number.MAX_SAFE_INTEGER,
    currentValue + Math.max(MIN_CHUNK_SIZE, Math.floor(delta)),
  );
}

export {
  getPressureGovernor,
  applySharedPressureDeferWindow,
  isSharedPressureBackpressured,
  isMetricsLogEntry,
  getLogPriority,
  isPressureModeActive,
  getRetainedPressureBacklogCap,
  shouldApplyRetainedBacklogCap,
  buildPressureFingerprint,
  resolveTransientPressureFamily,
  hasPendingPressureEquivalentEntry,
  shouldDropEntryUnderPressure,
  isLoggingPipelineMetricsEntry,
  dropPendingMetricsLogEntry,
  dropPendingQueuedEntryForAdmission,
  trimPendingWritesUnderPressure,
  findPendingTrimDropIndex,
  recordDroppedWrite,
  incrementBoundedCounter,
};
