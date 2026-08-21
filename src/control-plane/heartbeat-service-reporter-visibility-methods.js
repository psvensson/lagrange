import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {COLUMN} from '../constants/index.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {buildControlPlaneReadAuthority} from
  './control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  './control-plane-system-table-gateway-constants.js';
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
    const verificationToken = {};
    const verificationPromise = new Promise((resolve) => {
      const timeoutHandle = this.setTimeoutFn(async () => {
        try {
          if (
            typeof this.nodeStateReporter !== 'function' ||
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
  /**
   * Verify that a successful node-state reporter heartbeat became visible in
   * the canonical nodes row before we treat delivery as sufficient.
   * @param {number} expectedHeartbeatAt
   * @param {Object} [options]
   * @param {string|null} [options.expectedStatus]
   * @param {string|null} [options.expectedConnectionState]
   * @param {boolean} [options.expectedReadyLeaseCleared]
   * @param {boolean} [options.requireReadableAuthority]
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
      const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT] ?? nodeRow?.last_heartbeat);
      if (!Number.isFinite(lastHeartbeat) || lastHeartbeat < expectedHeartbeatAt) {
        return false;
      }
      if (
        typeof options.expectedStatus === 'string' &&
        nodeRow?.[COLUMN.STATUS] !== options.expectedStatus &&
        nodeRow?.status !== options.expectedStatus
      ) {
        return false;
      }
      if (
        typeof options.expectedConnectionState === 'string' &&
        nodeRow?.[COLUMN.CONNECTION_STATE] !== options.expectedConnectionState &&
        nodeRow?.connection_state !== options.expectedConnectionState
      ) {
        return false;
      }
      if (options.expectedReadyLeaseCleared === true) {
        const readyLeaseExpiresAt =
          nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ?? nodeRow?.ready_lease_expires_at;
        if (readyLeaseExpiresAt !== null && readyLeaseExpiresAt !== undefined) {
          return false;
        }
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
