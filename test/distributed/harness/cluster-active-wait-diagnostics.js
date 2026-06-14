import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';
import {
  TYPEOF_FUNCTION,
  TYPEOF_OBJECT,
  TYPEOF_STRING,
} from './cluster-active-wait-normalization.js';
import {
  summarizePriorityRecoveryProgressClasses,
} from './cluster-active-wait-priority-recovery-progress.js';

const {
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  UNKNOWN_STATE,
  ZERO,
  resolvePositiveTimeoutMs,
} = CLUSTER_BASE_LAYER;

const ACTIVE_WAIT_DIAGNOSTIC_TEXT = Object.freeze({
  ADMIN_READY_PREFIX: '#adminReady=',
  CAPTURED_AT_PREFIX: '#ts=',
  COUNT_SEPARATOR: '/',
  ENTRY_SEPARATOR: ', ',
  ERROR_STATE_PREFIX: '=error:',
  KEY_VALUE_SEPARATOR: ':',
  NODE_ACTIVE_SUFFIX: '=active',
  NODE_STATE_SEPARATOR: '=',
  PRIORITY_RECOVERY_PREFIX: '#priorityRecovery=',
  PRIORITY_SPREAD_PENDING: '#prioritySpread=pending',
  PRIORITY_SPREAD_READY: '#prioritySpread=ready',
  PROBE_TIMEOUT_PREFIX: '#probeMs=',
  PUBLICATION_EPOCH_PREFIX: '#epoch=',
  PUBLICATION_MISSING_PREFIX: '#missingPublished=',
  PUBLICATION_PENDING_ACK_PREFIX: '#pendingAck=',
  PUBLICATION_STATUS_PREFIX: '#pub=',
  REACHABILITY_ERROR_PREFIX: '#adminError=',
  REACHABILITY_TIMEOUT_PREFIX: '#reachabilityProbeMs=',
  REACHABLE_BY_PREFIX: '#via=',
  SELECTED_NODE_PREFIX: '@',
  UNKNOWN_NODE_ID: 'unknown-node',
});
const ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT = Object.freeze({
  EMPTY: '',
  NONE: 'none',
});

/**
 * Preserve a small but meaningful timeout floor for deadline-driven
 * observation probes so the last ACTIVE-wait attempt does not collapse into a
 * synthetic 1ms timeout classification.
 * @param {number} deadline
 * @param {number} maxTimeoutMs
 * @param {number} minimumTimeoutMs
 * @returns {number}
 */
function resolveMeaningfulProbeTimeoutMs(
  deadline,
  maxTimeoutMs,
  minimumTimeoutMs = MIN_TIMEOUT_MS,
) {
  const boundedMinimumTimeoutMs = resolvePositiveTimeoutMs(
    minimumTimeoutMs,
    MIN_TIMEOUT_MS,
  );
  const remainingBudgetMs = Math.max(
    boundedMinimumTimeoutMs,
    Math.floor(Number(deadline) - Date.now()),
  );
  return Math.min(
    Math.max(
      boundedMinimumTimeoutMs,
      Math.floor(maxTimeoutMs || boundedMinimumTimeoutMs),
    ),
    remainingBudgetMs,
  );
}

/**
 * Resolve/reject with timeout protection for potentially hanging operations.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 * @returns {Promise<*>}
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  const boundedTimeoutMs = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || ZERO);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(timeoutMessage));
    }, boundedTimeoutMs);
    if (typeof timer.unref === TYPEOF_FUNCTION) {
      timer.unref();
    }
    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Format count-map entries as "key:value" pairs for diagnostic errors.
 * @param {Map<string|number, number>} counts
 * @returns {string}
 */
function formatCountSummary(counts) {
  return Array.from(counts.entries())
    .map(([key, count]) =>
      String(key) +
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.KEY_VALUE_SEPARATOR +
        String(count))
    .join(ACTIVE_WAIT_DIAGNOSTIC_TEXT.ENTRY_SEPARATOR);
}

/**
 * Format node diagnostics into compact "node=state" entries.
 * @param {Array<Object>} nodeDiagnostics
 * @returns {string}
 */
function formatNodeDiagnostics(nodeDiagnostics = []) {
  return nodeDiagnostics
    .map((diagnostic) => {
      const nodeId = String(
        diagnostic.nodeId || ACTIVE_WAIT_DIAGNOSTIC_TEXT.UNKNOWN_NODE_ID,
      );
      if (diagnostic.active === true) {
        return nodeId + ACTIVE_WAIT_DIAGNOSTIC_TEXT.NODE_ACTIVE_SUFFIX;
      }
      if (
        typeof diagnostic.error === TYPEOF_STRING &&
        diagnostic.error.length > ZERO
      ) {
        return nodeId +
          ACTIVE_WAIT_DIAGNOSTIC_TEXT.ERROR_STATE_PREFIX +
          diagnostic.error;
      }
      const stateValue =
        typeof diagnostic.state === TYPEOF_STRING &&
        diagnostic.state.length > ZERO ?
          diagnostic.state :
          UNKNOWN_STATE;
      return nodeId +
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.NODE_STATE_SEPARATOR +
        stateValue;
    })
    .join(ACTIVE_WAIT_DIAGNOSTIC_TEXT.ENTRY_SEPARATOR);
}

/**
 * Format control snapshot coverage summary.
 * @param {Object|null} snapshotCoverage
 * @returns {string}
 */
function formatSnapshotCoverage(snapshotCoverage) {
  if (!snapshotCoverage || typeof snapshotCoverage !== TYPEOF_OBJECT) {
    return ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.NONE;
  }
  const expectedNodeCount = Number(snapshotCoverage.expectedNodeCount) || ZERO;
  const bestCoverageNodeCount =
    Number(snapshotCoverage.bestCoverageNodeCount) || ZERO;
  const selectedNodeId =
    typeof snapshotCoverage.selectedNodeId === TYPEOF_STRING &&
    snapshotCoverage.selectedNodeId.length > ZERO ?
      snapshotCoverage.selectedNodeId :
      null;
  const selectedCapturedAtMs = Number.isFinite(
    snapshotCoverage.selectedCapturedAtMs,
  ) ?
    Math.floor(snapshotCoverage.selectedCapturedAtMs) :
    null;
  const selectedAdminReady =
    snapshotCoverage.selectedAdminReady === true ?
      true :
      snapshotCoverage.selectedAdminReady === false ?
        false :
        null;
  const selectedReachableBy =
    typeof snapshotCoverage.selectedReachableBy === TYPEOF_STRING &&
    snapshotCoverage.selectedReachableBy.length > ZERO ?
      snapshotCoverage.selectedReachableBy :
      null;
  const selectedReachabilityError =
    typeof snapshotCoverage.selectedReachabilityError === TYPEOF_STRING &&
    snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const selectedSnapshotTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedSnapshotTimeoutMs,
  ) ?
    Math.max(
      MIN_TIMEOUT_MS,
      Math.floor(snapshotCoverage.selectedSnapshotTimeoutMs),
    ) :
    null;
  const selectedReachabilityTimeoutMs = Number.isFinite(
    snapshotCoverage.selectedReachabilityTimeoutMs,
  ) ?
    Math.max(
      MIN_TIMEOUT_MS,
      Math.floor(snapshotCoverage.selectedReachabilityTimeoutMs),
    ) :
    null;
  const selectedPublicationConvergence =
    snapshotCoverage.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === TYPEOF_OBJECT ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationEpoch = Number.isFinite(
    selectedPublicationConvergence?.publicationEpoch,
  ) ?
    Math.floor(selectedPublicationConvergence.publicationEpoch) :
    null;
  const publicationStatus =
    typeof selectedPublicationConvergence?.publicationStatus === TYPEOF_STRING ?
      selectedPublicationConvergence.publicationStatus.toUpperCase() :
      null;
  const pendingAckCount = Array.isArray(
    selectedPublicationConvergence?.pendingAckNodeIds,
  ) ?
    selectedPublicationConvergence.pendingAckNodeIds.length :
    ZERO;
  const missingPublishedCount = Array.isArray(
    snapshotCoverage?.selectedMissingPublishedNodeIds,
  ) ?
    snapshotCoverage.selectedMissingPublishedNodeIds.length :
    ZERO;
  const prioritySpreadSatisfied =
    selectedPublicationConvergence?.priorityPartitionSummary &&
    typeof selectedPublicationConvergence.priorityPartitionSummary ===
      TYPEOF_OBJECT ?
      selectedPublicationConvergence.priorityPartitionSummary.satisfied :
      null;
  const priorityRecoveryProgressClassCount =
    summarizePriorityRecoveryProgressClasses(
      snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots || null,
    ).unresolvedClassCount;
  return (
    String(bestCoverageNodeCount) +
    ACTIVE_WAIT_DIAGNOSTIC_TEXT.COUNT_SEPARATOR +
    String(expectedNodeCount) +
    (selectedNodeId ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.SELECTED_NODE_PREFIX + selectedNodeId :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (selectedCapturedAtMs !== null ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.CAPTURED_AT_PREFIX +
        String(selectedCapturedAtMs) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (selectedAdminReady !== null ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.ADMIN_READY_PREFIX +
        String(selectedAdminReady) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (selectedReachableBy ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.REACHABLE_BY_PREFIX + selectedReachableBy :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (selectedReachabilityError ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.REACHABILITY_ERROR_PREFIX +
        selectedReachabilityError :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (selectedSnapshotTimeoutMs !== null &&
    selectedSnapshotTimeoutMs < CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PROBE_TIMEOUT_PREFIX +
        String(selectedSnapshotTimeoutMs) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (selectedReachabilityTimeoutMs !== null &&
    selectedReachabilityTimeoutMs <
      CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.REACHABILITY_TIMEOUT_PREFIX +
        String(selectedReachabilityTimeoutMs) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (publicationEpoch !== null ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_EPOCH_PREFIX +
        String(publicationEpoch) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (publicationStatus ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_STATUS_PREFIX +
        publicationStatus :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (pendingAckCount > ZERO ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_PENDING_ACK_PREFIX +
        String(pendingAckCount) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (missingPublishedCount > ZERO ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PUBLICATION_MISSING_PREFIX +
        String(missingPublishedCount) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (prioritySpreadSatisfied === false ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PRIORITY_SPREAD_PENDING :
      prioritySpreadSatisfied === true ?
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.PRIORITY_SPREAD_READY :
        ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY) +
    (Number.isInteger(priorityRecoveryProgressClassCount) &&
    priorityRecoveryProgressClassCount > ZERO ?
      ACTIVE_WAIT_DIAGNOSTIC_TEXT.PRIORITY_RECOVERY_PREFIX +
        String(priorityRecoveryProgressClassCount) :
      ACTIVE_WAIT_DIAGNOSTIC_SUMMARY_TEXT.EMPTY)
  );
}

const BOUNDED_DIAGNOSTICS_RETENTION_TAIL_COUNT = 4;
const BOUNDED_DIAGNOSTICS_RETENTION_APPROX_BYTES_UNAVAILABLE = -1;
const BOUNDED_DIAGNOSTICS_RETENTION_FIRST_ENTRY_COUNT = 1;

/**
 * CL-031: bounded retention for per-poll diagnostics snapshots. The control
 * snapshot grows unbounded, so retaining every poll's snapshot multiplies an
 * already-huge object by the attempt count in both harness memory and
 * failed-scenario report `details`. The retention keeps the FIRST snapshot
 * and the LAST `tailCount` snapshots in full (first + 4 = 5 fulls by
 * default) and demotes every other snapshot to a small stub
 * {index, attempt, capturedAt, approxBytes, dropped: true} AT APPEND TIME,
 * so the buffer never holds more than first+tail full snapshots in memory.
 * The stubs' approxBytes preserve the growth trajectory as evidence.
 * @param {{tailCount?: number}} options
 * @returns {{
 *   append: function(*, {attempt?: number, elapsedMs?: number,
 *     capturedAt?: (string|number)}=): void,
 *   entries: function(): Array<Object>,
 *   appendedCount: function(): number,
 * }}
 */
function boundedDiagnosticsRetention(options = {}) {
  const tailCount =
    Number.isInteger(options.tailCount) && options.tailCount > ZERO ?
      options.tailCount :
      BOUNDED_DIAGNOSTICS_RETENTION_TAIL_COUNT;
  const entries = [];
  const tailEntries = [];
  let appendedCount = ZERO;

  const measureApproxBytes = (snapshot) => {
    try {
      return Buffer.byteLength(JSON.stringify(snapshot));
    } catch (_error) {
      return BOUNDED_DIAGNOSTICS_RETENTION_APPROX_BYTES_UNAVAILABLE;
    }
  };

  const demoteToStub = (entry) => {
    // The dropped snapshot's size is measured here, while the full payload
    // is about to be released, so stubs document the growth trajectory.
    entry.approxBytes = measureApproxBytes(entry.snapshot);
    entry.dropped = true;
    delete entry.snapshot;
  };

  return {
    append(snapshot, meta = {}) {
      const entry = {index: appendedCount};
      if (Number.isFinite(meta.attempt)) {
        entry.attempt = meta.attempt;
      }
      if (Number.isFinite(meta.elapsedMs)) {
        entry.elapsedMs = meta.elapsedMs;
      }
      const capturedAt = meta.capturedAt ?? snapshot?.capturedAt ?? null;
      if (capturedAt !== null) {
        entry.capturedAt = capturedAt;
      }
      entry.snapshot = snapshot;
      entries.push(entry);
      appendedCount += 1;
      if (entries.length === BOUNDED_DIAGNOSTICS_RETENTION_FIRST_ENTRY_COUNT) {
        // The first snapshot is retained in full permanently.
        return;
      }
      tailEntries.push(entry);
      if (tailEntries.length > tailCount) {
        demoteToStub(tailEntries.shift());
      }
    },
    entries() {
      return entries.slice();
    },
    appendedCount() {
      return appendedCount;
    },
  };
}

export {
  ACTIVE_WAIT_DIAGNOSTIC_TEXT,
  boundedDiagnosticsRetention,
  resolveMeaningfulProbeTimeoutMs,
  withTimeout,
  formatCountSummary,
  formatNodeDiagnostics,
  formatSnapshotCoverage,
};
