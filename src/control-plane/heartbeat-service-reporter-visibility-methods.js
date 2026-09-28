import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CDC_OPERATION,
  COLUMN,
} from '../constants/index.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {buildControlPlaneReadAuthority} from
  './control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  './control-plane-system-table-gateway-constants.js';
import {
  CONTROL_PLANE_MESSAGE_COMPLETION_FIELD,
  CONTROL_PLANE_MESSAGE_COMPLETION_KIND,
} from './control-plane-constants.js';
import {
  buildNodeHeartbeatStructuralSignature,
  buildNodeHeartbeatUtilizationSignature,
  buildReporterHeartbeatVisibilityDecision,
  normalizeHeartbeatPublicationDiagnostics,
  recordHeartbeatPublicationTarget,
} from './heartbeat-service-write-coalescing.js';
import {
  HEARTBEAT_FAILURE_REASON,
  HEARTBEAT_FAILURE_STAGE,
  HEARTBEAT_PUBLICATION_PATH,
  HEARTBEAT_REPORTER_VISIBILITY_DECISION,
  HEARTBEAT_REPORTER_VISIBILITY_READ,
  HEARTBEAT_REPORTER_VISIBILITY_STATE,
  HEARTBEAT_SERVICE_LITERAL,
  ONE,
  ZERO,
} from './heartbeat-service-runtime-state.js';

const HEARTBEAT_ROW_ALIAS = Object.freeze({
  CONNECTION_STATE: 'connection_state',
  NODE_ID: 'node_id',
  STATUS: 'status',
});

function heartbeatRowFieldMatches(nodeRow, column, alias, expected) {
  return nodeRow?.[column] === expected || nodeRow?.[alias] === expected;
}

function heartbeatReadyLeaseIsCleared(nodeRow) {
  const readyLeaseExpiresAt =
    nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ??
    nodeRow?.ready_lease_expires_at;
  return readyLeaseExpiresAt === null || readyLeaseExpiresAt === undefined;
}

function reporterHeartbeatRowMatches(nodeId, nodeRow, expectedHeartbeatAt,
  options) {
  if (!heartbeatRowFieldMatches(
    nodeRow,
    COLUMN.NODE_ID,
    HEARTBEAT_ROW_ALIAS.NODE_ID,
    nodeId,
  )) return false;
  const lastHeartbeat = Number(
    nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat,
  );
  if (!Number.isFinite(lastHeartbeat) || lastHeartbeat < expectedHeartbeatAt) {
    return false;
  }
  if (typeof options.expectedStatus === 'string' &&
      !heartbeatRowFieldMatches(
        nodeRow,
        COLUMN.STATUS,
        HEARTBEAT_ROW_ALIAS.STATUS,
        options.expectedStatus,
      )) {
    return false;
  }
  if (typeof options.expectedConnectionState === 'string' &&
      !heartbeatRowFieldMatches(
        nodeRow,
        COLUMN.CONNECTION_STATE,
        HEARTBEAT_ROW_ALIAS.CONNECTION_STATE,
        options.expectedConnectionState,
      )) {
    return false;
  }
  return options.expectedReadyLeaseCleared !== true ||
    heartbeatReadyLeaseIsCleared(nodeRow);
}

class HeartbeatServiceReporterVisibilityMethods {
  /**
   * Normalize reporter heartbeat visibility evidence into one canonical
   * decision so coalescing and verification follow one state owner.
   * @param {Object|null} reporterDiagnostics
   * @param {number} nowMs
   * @return {{outcome: string, nextState: string}}
   * @private
   */ resolveReporterHeartbeatVisibilityDecision(reporterDiagnostics, nowMs) {
    if (this.verifyReporterVisibilityOnSuccess !== true) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.CONFIRMED,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED,
      );
    }
    if (
      this.nodeHeartbeatReporterVisibilityState === HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED &&
      this.isReporterHeartbeatVisibilityConfirmed(reporterDiagnostics, nowMs)
    ) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.CONFIRMED,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED,
      );
    }
    if (this.shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, nowMs)) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.SCHEDULE_VERIFICATION,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.PENDING,
      );
    }
    if (this.reporterVisibilityVerificationPromise) {
      return buildReporterHeartbeatVisibilityDecision(
        HEARTBEAT_REPORTER_VISIBILITY_DECISION.VERIFICATION_PENDING,
        HEARTBEAT_REPORTER_VISIBILITY_STATE.PENDING,
      );
    }
    return buildReporterHeartbeatVisibilityDecision(
      HEARTBEAT_REPORTER_VISIBILITY_DECISION.RETRY_THROTTLED_UNVERIFIED,
      HEARTBEAT_REPORTER_VISIBILITY_STATE.UNVERIFIED,
    );
  }
  /**
   * Reuse a recent successful reporter visibility proof for steady-state
   * heartbeats so repeated success acknowledgements do not force routed
   * verification reads on every interval.
   * @param {Object} reporterDiagnostics
   * @param {number} nowMs
   * @return {boolean}
   * @private
   */ shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, nowMs) {
    if (this.verifyReporterVisibilityOnSuccess !== true) {
      return false;
    }
    if (this.reporterVisibilityVerificationPromise) {
      return false;
    }
    const targetAddress = reporterDiagnostics?.targetAddress || null;
    const hasVerifiedProof =
      Number.isFinite(this.lastReporterVisibilityVerifiedAt) &&
      this.lastReporterVisibilityVerifiedAt > ZERO;
    if (!hasVerifiedProof) {
      const targetChangedSinceLastAttempt =
        targetAddress && targetAddress !== this.lastReporterVisibilityAttemptTargetAddress;
      if (
        !targetChangedSinceLastAttempt &&
        Number.isFinite(this.lastReporterVisibilityAttemptAt) &&
        this.lastReporterVisibilityAttemptAt > ZERO &&
        nowMs - this.lastReporterVisibilityAttemptAt < this.reporterVisibilityRetryIntervalMs
      ) {
        return false;
      }
      return true;
    }
    if (targetAddress && targetAddress !== this.lastReporterVisibilityTargetAddress) {
      return true;
    }
    return nowMs - this.lastReporterVisibilityVerifiedAt >= this.reporterVisibilitySuccessTtlMs;
  }
  isReporterHeartbeatVisibilityConfirmed(reporterDiagnostics, nowMs) {
    if (this.verifyReporterVisibilityOnSuccess !== true) {
      return true;
    }
    if (this.reporterVisibilityVerificationPromise) {
      return false;
    }
    if (
      !Number.isFinite(this.lastReporterVisibilityVerifiedAt) ||
      this.lastReporterVisibilityVerifiedAt <= ZERO
    ) {
      return false;
    }
    const targetAddress = reporterDiagnostics?.targetAddress || null;
    if (targetAddress && targetAddress !== this.lastReporterVisibilityTargetAddress) {
      return false;
    }
    return nowMs - this.lastReporterVisibilityVerifiedAt < this.reporterVisibilitySuccessTtlMs;
  }
  /**
   * Schedule one bounded canonical visibility proof outside the hot heartbeat
   * path. Reporter acknowledgement remains the owner-path success signal; this
   * readback is only a throttled diagnostic proof.
   * @param {number} expectedHeartbeatAt
   * @param {Object|null} reporterDiagnostics
   * @param {Object} [options]
   * @param {Function} [options.onVisible]
   * @return {Promise<void>|null}
   * @private
   */ scheduleReporterHeartbeatVisibilityVerification(
    expectedHeartbeatAt,
    reporterDiagnostics,
    options = {},
  ) {
    const normalizedDiagnostics = normalizeHeartbeatPublicationDiagnostics(
      reporterDiagnostics,
      HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER,
    );
    const nowMs = this.now();
    if (!this.shouldVerifyReporterHeartbeatVisibility(normalizedDiagnostics, nowMs)) {
      return null;
    }
    this.lastReporterVisibilityAttemptAt = nowMs;
    this.lastReporterVisibilityAttemptTargetAddress = normalizedDiagnostics.targetAddress || null;
    const scheduledReporter = this.nodeStateReporter;
    const verificationToken = {};
    const verificationPromise = new Promise((resolve) => {
      const timeoutHandle = this.setTimeoutFn(async () => {
        try {
          if (
            this.nodeStateReporter !== scheduledReporter ||
            this.verifyReporterVisibilityOnSuccess !== true
          ) {
            return;
          }
          const reporterVisible = await this.verifyReporterHeartbeatVisibility(
            expectedHeartbeatAt,
            options,
          );
          if (reporterVisible) {
            this.lastReporterVisibilityVerifiedAt = this.now();
            this.lastReporterVisibilityTargetAddress = normalizedDiagnostics.targetAddress || null;
            if (typeof options.onVisible === 'function') {
              options.onVisible();
            }
            return;
          }
          this.recordReporterHeartbeatVisibilityFailure(
            normalizedDiagnostics,
            HEARTBEAT_FAILURE_REASON.REPORTER_VISIBILITY_NOT_CONFIRMED,
          );
        } catch (error) {
          this.recordReporterHeartbeatVisibilityFailure(
            normalizedDiagnostics,
            HEARTBEAT_FAILURE_REASON.REPORTER_VISIBILITY_VERIFICATION_FAILED,
          );
          this.logger.debug('Reporter heartbeat visibility verification failed', {
            nodeId: this.nodeId,
            error: error?.message || String(error),
            targetAddress: normalizedDiagnostics.targetAddress || null,
          });
        } finally {
          if (this.reporterVisibilityVerificationPromise === verificationToken) {
            this.reporterVisibilityVerificationPromise = null;
          }
          resolve();
        }
      }, ZERO);
      if (typeof timeoutHandle?.unref === 'function') {
        timeoutHandle.unref();
      }
    });
    this.reporterVisibilityVerificationPromise = verificationToken;
    return verificationPromise;
  }
  recordReporterHeartbeatVisibilityFailure(reporterDiagnostics, failureReason) {
    this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.UNVERIFIED;
    recordHeartbeatPublicationTarget({
      diagnostics: {
        ...reporterDiagnostics,
        publicationPath: HEARTBEAT_PUBLICATION_PATH.NODE_STATE_REPORTER_UNVERIFIED,
      },
      heartbeatPublicationDiagnostics: this.heartbeatPublicationDiagnostics,
      serviceLiteral: HEARTBEAT_SERVICE_LITERAL,
    });
    this.recordFailure(HEARTBEAT_FAILURE_STAGE.REPORTER_VISIBILITY, failureReason);
  }
  recordConfirmedNodeHeartbeatWrite(updateRow, now) {
    this.lastNodeHeartbeatWriteAt = now;
    this.lastNodeHeartbeatWriteSignature = buildNodeHeartbeatStructuralSignature(updateRow);
    this.lastNodeHeartbeatUtilizationSignature =
      buildNodeHeartbeatUtilizationSignature(updateRow, {
        bucketSize: this.nodeMetadataUsagePercentBucketSize,
        oneValue: ONE,
      });
    this.nodeHeartbeatReporterVisibilityState = HEARTBEAT_REPORTER_VISIBILITY_STATE.CONFIRMED;
    this.lastHeartbeatPublicationDecision = null;
  }
  installAuthoritativeReporterHeartbeatRow(result, nodeRow) {
    const observedAtMs = Number(
      result?.observedAtMs,
    );
    if (!Number.isFinite(observedAtMs) ||
        typeof this.cdcIntegrationService?.applyAuthoritativeCacheRepair !==
          'function') {
      return false;
    }
    return this.cdcIntegrationService.applyAuthoritativeCacheRepair(
      SYSTEM_TABLE_NAME.NODES,
      CDC_OPERATION.UPSERT,
      nodeRow,
      this.nodeId,
      {
        authoritativeObservedAtMs: observedAtMs,
      },
    );
  }
  verifyReporterHeartbeatCompletion(
    completion,
    expectedHeartbeatAt,
    options = {},
  ) {
    const nodeRow = completion?.[
      CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW
    ];
    const observedAtMs = Number(completion?.[
      CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_OBSERVED_AT_MS
    ]);
    if (!Number.isFinite(observedAtMs) ||
        !reporterHeartbeatRowMatches(
          this.nodeId,
          nodeRow,
          expectedHeartbeatAt,
          options,
        )) {
      return false;
    }
    return this.installAuthoritativeReporterHeartbeatRow(
      {observedAtMs},
      nodeRow,
    );
  }
  assertReporterDurableHeartbeatCompletion(
    completion,
    expectedHeartbeatAt,
    expectedRow,
    publicationDiagnostics,
  ) {
    const durableCompletion =
      completion?.completionKind ===
        CONTROL_PLANE_MESSAGE_COMPLETION_KIND.DURABLE_STATE_PUBLICATION &&
      completion?.completionCompleted === true;
    const exactProjectionInstalled = durableCompletion &&
      this.verifyReporterHeartbeatCompletion(completion, expectedHeartbeatAt, {
        expectedStatus: expectedRow.status,
        expectedConnectionState: expectedRow.connection_state,
      });
    if (exactProjectionInstalled) return;
    const visibilityError = new Error(
      HEARTBEAT_SERVICE_LITERAL.REPORTER_DURABLE_VISIBILITY_REQUIRED,
    );
    visibilityError.deferRetry = true;
    visibilityError.publicationDiagnostics = publicationDiagnostics;
    throw visibilityError;
  }
  /**
   * Verify that a successful node-state reporter heartbeat became visible in
   * the canonical nodes row before we treat delivery as sufficient.
   * @param {number} expectedHeartbeatAt
   * @param {Object} [options]
   * @param {string|null} [options.expectedStatus]
   * @param {string|null} [options.expectedConnectionState]
   * @param {boolean} [options.expectedReadyLeaseCleared]
   * @param {boolean} [options.requireReadableAuthority]
   * @param {boolean} [options.installAuthoritativeProjection]
   * @return {Promise<boolean>}
   * @private
   */ async verifyReporterHeartbeatVisibility(expectedHeartbeatAt, options = {}) {
    const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
    if (
      !authoritativeControlPlaneView ||
      typeof authoritativeControlPlaneView.canRead !== 'function' ||
      authoritativeControlPlaneView.canRead() !== true
    ) {
      return options.requireReadableAuthority !== true;
    }
    const requireReadableAuthority =
      options.requireReadableAuthority === true;
    if (
      requireReadableAuthority &&
      typeof authoritativeControlPlaneView.readReadinessOwnerRows !==
        'function'
    ) {
      return false;
    }
    const readRows = requireReadableAuthority ?
      authoritativeControlPlaneView.readReadinessOwnerRows :
      authoritativeControlPlaneView.readRows;
    if (typeof readRows !== 'function') {
      return false;
    }
    try {
      const result = await readRows.call(
        authoritativeControlPlaneView,
        SYSTEM_TABLE_NAME.NODES,
        `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE node_id = ?`,
        [this.nodeId],
        {
          readAuthority: buildControlPlaneReadAuthority({
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
            routingReadinessDimension:
              HEARTBEAT_REPORTER_VISIBILITY_READ.ROUTINGREADINESSDIMENSION,
          }),
          queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs,
        },
      );
      if (!result?.success) {
        return false;
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const nodeRow =
        rows.find((row) => {
          return row?.[COLUMN.NODE_ID] === this.nodeId || row?.node_id === this.nodeId;
        }) ||
        rows[ZERO] ||
        null;
      if (!reporterHeartbeatRowMatches(
        this.nodeId,
        nodeRow,
        expectedHeartbeatAt,
        options,
      )) return false;
      if (options.installAuthoritativeProjection === true &&
          !this.installAuthoritativeReporterHeartbeatRow(result, nodeRow)) {
        return false;
      }
      return true;
    } catch (_error) {
      return false;
    }
  }
  /**
   * Resolve the shared authoritative control-plane view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */ getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter || null,
      now: this.now,
      queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }
}

function defineHeartbeatServiceReporterVisibilityMethods(HeartbeatService) {
  const methodDescriptors = Object.getOwnPropertyDescriptors(
    HeartbeatServiceReporterVisibilityMethods.prototype,
  );
  delete methodDescriptors.constructor;
  Object.defineProperties(HeartbeatService.prototype, methodDescriptors);
}

export {defineHeartbeatServiceReporterVisibilityMethods};
