import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  buildControlPlaneReadAuthority,
  buildPressureAdmissionFailure,
  normalizeCoalescingToken,
  normalizeReadStrategy,
  normalizeSystemTableName,
  resolveControlPlaneReadIntent,
  resolveAuthoritativeReadModeContract,
  resolveReadProfileOptions,
} from './control-plane-system-table-gateway-shared.js';

const controlPlaneSystemTableGatewayReadDispatchMethods = {
  async readRows(tableName, sql, params = [], options = {}) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const {readIntent, readProfile} = resolveControlPlaneReadIntent(
      tableName,
      sql,
      params,
      options,
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
        'function',
    );
    return this.executeRead(
      readIntent,
      {
        ...options,
        readProfile,
      },
    );
  },

  /**
   * Canonical control-plane metadata read ingress.
   * One intent declares one strategy. The gateway executes that strategy only.
   *
   * @param {Object} readIntent
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeRead(readIntent = {}, options = {}) {
    const tableName = normalizeSystemTableName(readIntent?.tableName);
    const strategy = normalizeReadStrategy(readIntent?.strategy);
    const sql = readIntent?.sql || null;
    const params = Array.isArray(readIntent?.params) ? readIntent.params : [];
    const profiledOptions = resolveReadProfileOptions(options);
    const mergedOptions = {
      ...profiledOptions,
      strategy,
    };
    mergedOptions.readAuthority = buildControlPlaneReadAuthority({
      ...mergedOptions,
      localReadConsistency:
        mergedOptions.localReadConsistency ||
        CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
      replicaFallbackConsistency:
        mergedOptions.replicaFallbackConsistency ||
        CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
    });
    const authoritativeReadModeContract =
      resolveAuthoritativeReadModeContract(mergedOptions.readAuthority);
    const requestKey = this.buildReadRequestKey(
      tableName,
      sql,
      params,
      mergedOptions,
    );
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: readIntent?.owner || options?.owner || null,
      tableName,
      strategy,
      readProfile: mergedOptions?.readProfile || null,
      authoritativeReadMode:
        authoritativeReadModeContract.authoritativeReadMode,
      workloadClass: mergedOptions?.workloadClass || null,
      workClass: mergedOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      coalescingKey: normalizeCoalescingToken(mergedOptions?.coalescingKey),
    };
    try {
      const result = await this.runSingleFlight(
        this.inFlightReadRequestsByKey,
        requestKey,
        async () => {
          const pressureDecision = await this.admitReadPressure(
            tableName,
            mergedOptions,
          );
          if (
            pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
            pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT
          ) {
            const failure = buildPressureAdmissionFailure(pressureDecision, {
              tableName,
            });
            return {
              ...failure,
              outcome:
                pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
                  CONTROL_PLANE_READ_OUTCOME.DEFERRED :
                  CONTROL_PLANE_READ_OUTCOME.REJECTED,
              strategyUsed: strategy,
            };
          }

          switch (strategy) {
          case CONTROL_PLANE_READ_STRATEGY.CACHE:
            return this.executeCacheRead(
              tableName,
              readIntent,
              mergedOptions,
            );
          case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE:
          case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED:
            return this.executeAuthoritativeRead(
              tableName,
              sql,
              params,
              strategy,
              mergedOptions,
            );
          case CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED:
            return this.executeOwnerLocalRead(
              tableName,
              sql,
              params,
              mergedOptions,
            );
          case CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT:
            return this.executeBootstrapSnapshotRead(
              tableName,
              readIntent,
              mergedOptions,
            );
          default:
            return {
              success: false,
              error: 'unsupported_control_plane_read_strategy',
              tableName,
              rows: [],
              outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
              strategyUsed: null,
            };
          }
        },
        {
          joinMetricName: 'readSingleFlightJoinCount',
          bypassMetricName: 'readTrackingBypassCount',
          maxTrackedRequests: this.gatewayLimits.maxTrackedReadRequests,
        },
      );
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
        tableName,
        strategy,
        authoritativeReadMode:
          authoritativeReadModeContract.authoritativeReadMode,
        workloadClass: mergedOptions?.workloadClass || null,
        routingReadinessDimension:
          mergedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: result?.outcome || null,
        success: result?.success === true,
        rowCount: Number.isFinite(result?.rowCount) ?
          result.rowCount :
          Array.isArray(result?.rows) ?
            result.rows.length :
            0,
        source: result?.source || null,
        usedSqlFallback: result?.usedSqlFallback === true,
        error: result?.success === true ? null : result?.error || null,
        ...this.buildOperationLedgerDiagnostics(
          tableName,
          result,
          mergedOptions,
        ),
      });
      this.recordReadTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
        tableName,
        strategy,
        authoritativeReadMode:
          authoritativeReadModeContract.authoritativeReadMode,
        workloadClass: mergedOptions?.workloadClass || null,
        routingReadinessDimension:
          mergedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        success: false,
        rowCount: 0,
        error: error?.message || String(error),
        ...this.buildOperationLedgerDiagnostics(
          tableName,
          error,
          mergedOptions,
        ),
      });
      this.recordReadTelemetry(telemetryContext, {
        success: false,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        rowCount: 0,
      });
      throw error;
    }
  },
};

function assignControlPlaneSystemTableGatewayReadDispatch(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayReadDispatchMethods,
  );
}

export {assignControlPlaneSystemTableGatewayReadDispatch};
