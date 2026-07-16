import {
  CONTROL_SNAPSHOT_RETRY_DECISION,
  CONTROL_SNAPSHOT_RETRY_DELAY_MS,
  evaluateControlSnapshotRetryDecision,
} from './admin-control-snapshot-retry-decision.js';
import {
  createTimeoutBudget,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {resolveControlSnapshotQueryResult} from './admin-control-snapshot-query-result-helper.js';
import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';

const SNAPSHOT_RETRY_LOG_MSG =
  'Snapshot query encountered pressure or timeout. Retrying after stale socket cleanup...';
const LOCAL_NESTED_OPERATION_ADMIN_CONTROL_SNAPSHOT =
  'admin_control_snapshot_query';
const CONTROL_SNAPSHOT_RETRY_BUDGET_MODE = Object.freeze({
  CALLER_DEADLINE: 'caller_deadline',
  DEFAULT: 'default',
});
const CONTROL_SNAPSHOT_ATTEMPT_STATE = Object.freeze({
  DEADLINE_EXHAUSTED: 'deadline_exhausted',
  READY: 'ready',
});
const NO_CONTROL_SNAPSHOT_RETRY_RESULT = Symbol('noControlSnapshotRetryResult');

function createControlSnapshotRetryBudget(options, nowFn) {
  const queryTimeoutMs = Number(options?.queryTimeoutMs);
  if (!Number.isFinite(queryTimeoutMs) || queryTimeoutMs <= 0) {
    return Object.freeze({
      mode: CONTROL_SNAPSHOT_RETRY_BUDGET_MODE.DEFAULT,
    });
  }
  return Object.freeze({
    mode: CONTROL_SNAPSHOT_RETRY_BUDGET_MODE.CALLER_DEADLINE,
    budget: createTimeoutBudget({
      configuredBudgetMs: Math.floor(queryTimeoutMs),
      now: nowFn,
    }),
  });
}

function resolveControlSnapshotAttemptOptions(options, retryBudgetState, nowFn) {
  if (
    retryBudgetState.mode !==
    CONTROL_SNAPSHOT_RETRY_BUDGET_MODE.CALLER_DEADLINE
  ) {
    return Object.freeze({
      state: CONTROL_SNAPSHOT_ATTEMPT_STATE.READY,
      options,
    });
  }
  const remainingBudgetMs = getRemainingBudgetMs(
    retryBudgetState.budget,
    {now: nowFn},
  );
  if (remainingBudgetMs <= 0) {
    return Object.freeze({
      state: CONTROL_SNAPSHOT_ATTEMPT_STATE.DEADLINE_EXHAUSTED,
    });
  }
  return Object.freeze({
    state: CONTROL_SNAPSHOT_ATTEMPT_STATE.READY,
    options: {
      ...options,
      queryTimeoutMs: remainingBudgetMs,
    },
  });
}

function hasControlSnapshotRetryDelayBudget(retryBudgetState, nowFn) {
  return retryBudgetState.mode === CONTROL_SNAPSHOT_RETRY_BUDGET_MODE.DEFAULT ||
    getRemainingBudgetMs(retryBudgetState.budget, {now: nowFn}) >
      CONTROL_SNAPSHOT_RETRY_DELAY_MS;
}

function resolveControlSnapshotTerminalResult(
  resultOrError,
  retryBudgetState,
  nowFn,
) {
  if (resultOrError instanceof Error) {
    throw resultOrError;
  }
  if (resultOrError !== NO_CONTROL_SNAPSHOT_RETRY_RESULT) {
    return resolveControlSnapshotQueryResult(resultOrError);
  }
  const timeoutBudget = retryBudgetState.budget;
  throw createTimeoutBudgetError({
    message: ADMIN_ERROR_MESSAGE.queryTimeout(
      timeoutBudget.configuredBudgetMs,
    ),
    budget: timeoutBudget,
    classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
    nestedOperation: LOCAL_NESTED_OPERATION_ADMIN_CONTROL_SNAPSHOT,
    now: nowFn,
  });
}

const {
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_SERVICE_DISCOVERY,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
  HTTP_STATUS,
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudgetError,
  normalizeIdentifier,
  normalizeSql,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseServiceDiscoverySqlQuery,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_DIAGNOSTICS_ROUTE_METHODS = {
  resolveServiceDiagnosticsReport() {
    if (
      !this.serviceDiagnosticsProvider ||
      typeof this.serviceDiagnosticsProvider !== 'function'
    ) {
      return null;
    }

    const report = this.serviceDiagnosticsProvider();
    if (!report || typeof report !== 'object') {
      return null;
    }
    return report;
  },

  async handleServiceDiagnostics(reply) {
    const report = this.resolveServiceDiagnosticsReport();
    if (!report) {
      reply
        .code(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .send({error: ADMIN_ERROR_MESSAGE.SERVICE_DIAGNOSTICS_UNAVAILABLE});
      return;
    }

    reply.code(HTTP_STATUS.OK).send({
      nodeId: this.nodeId,
      timestamp: Date.now(),
      diagnostics: report,
    });
  },

  async handleCdcDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalCdcDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  },

  async handlePartitionDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalPartitionDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  },

  async handleSqlDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalSqlDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  },

  async handlePreflightCriticalPathSnapshot(reply) {
    try {
      const snapshot = await this.resolvePreflightCriticalPathSnapshot();
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  },

  async handleControlSnapshot(request, reply) {
    const scope = String(
      request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] ||
        ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL,
    )
      .trim()
      .toLowerCase();
    if (scope !== ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL) {
      reply.code(HTTP_STATUS.BAD_REQUEST).send({
        error: ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_SCOPE_UNSUPPORTED,
      });
      return;
    }
    try {
      const snapshot = await this.buildLocalControlSnapshot();
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  },

  async handleServiceDiscovery(request, reply) {
    const protocolAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_PROTOCOL_KEY],
    );
    const serviceIdAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_SERVICE_ID_KEY],
    );
    const nodeIdAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_NODE_ID_KEY],
    );
    const healthyOnly = parseDiscoveryBooleanQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_HEALTHY_ONLY_KEY],
      false,
    );
    const unhealthyPolicyRaw =
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_UNHEALTHY_POLICY_KEY];
    const unhealthyPolicy = String(
      unhealthyPolicyRaw || ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
    )
      .trim()
      .toLowerCase();
    const tableName = normalizeIdentifier(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_TABLE_NAME_KEY],
    );
    const resolvedUnhealthyPolicy =
      unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE ?
        ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE :
        ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY;

    try {
      const snapshot =
        await this.serviceDiscovery.resolveServiceDiscoverySnapshot({
          protocolAllowlist,
          serviceIdAllowlist,
          nodeIdAllowlist,
          tableName,
          healthyOnly,
          unhealthyPolicy: resolvedUnhealthyPolicy,
        });
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  },

  isPreflightCriticalPathSnapshotQuery(sql) {
    return (
      normalizeSql(sql) ===
      normalizeSql(ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.QUERY_SQL)
    );
  },

  isControlSnapshotQuery(sql) {
    return this.parseControlSnapshotQuery(sql).isQuery;
  },

  parseControlSnapshotQuery(sql) {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql === normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL)) {
      return {
        isQuery: true,
        forceAuthoritativeRepair: false,
      };
    }
    if (
      normalizedSql ===
      normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR)
    ) {
      return {
        isQuery: true,
        forceAuthoritativeRepair: true,
      };
    }
    return {
      isQuery: false,
      forceAuthoritativeRepair: false,
    };
  },

  isServiceDiscoveryQuery(sql) {
    return parseServiceDiscoverySqlQuery(sql).isQuery;
  },

  async buildServiceDiscoveryQueryResult(options = {}) {
    return this.serviceDiscovery.buildServiceDiscoveryQueryResult(options);
  },

  async resolveServiceDiscoverySnapshot(options = {}) {
    return this.serviceDiscovery.resolveServiceDiscoverySnapshot(options);
  },

  buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
    return this.serviceDiscovery.buildServiceDiscoveryReplicaReadiness(
      replica,
      readinessContext,
    );
  },

  async buildLocalPreflightCriticalPathSnapshot() {
    return this.preflightSnapshot.buildLocalPreflightCriticalPathSnapshot();
  },

  async resolvePreflightCriticalPathSnapshot() {
    return this.preflightSnapshot.resolvePreflightCriticalPathSnapshot();
  },

  async buildPreflightCriticalPathSnapshotQueryResult() {
    return this.preflightSnapshot.buildPreflightCriticalPathSnapshotQueryResult();
  },

  buildPreflightCacheFreshnessSummary(options) {
    return this.preflightSnapshot.buildPreflightCacheFreshnessSummary(options);
  },

  async buildLocalControlSnapshot() {
    if (
      typeof this.controlSnapshot.resolveLocalControlSnapshot ===
      'function'
    ) {
      return this.controlSnapshot.resolveLocalControlSnapshot();
    }
    return this.controlSnapshot.buildLocalControlSnapshot();
  },

  buildControlSnapshotLeaderSummary(partitionRows = [], serviceRows = []) {
    return this.controlSnapshot.buildControlSnapshotLeaderSummary(
      partitionRows,
      serviceRows,
    );
  },

  buildControlSnapshotVoterCounts(serviceRows = []) {
    return this.controlSnapshot.buildControlSnapshotVoterCounts(serviceRows);
  },

  buildControlSnapshotReplicaOperationSummary(
    replicaOperationRows = [],
    options = {},
  ) {
    return this.controlSnapshot.buildControlSnapshotReplicaOperationSummary(
      replicaOperationRows,
      options,
    );
  },

  buildLocalCdcTelemetry() {
    return this.controlSnapshot.buildLocalCdcTelemetry();
  },

  buildLocalCdcDiagnostics() {
    return this.controlSnapshot.buildLocalCdcDiagnostics();
  },

  buildLocalPartitionDiagnostics() {
    return this.controlSnapshot.buildLocalPartitionDiagnostics();
  },

  buildLocalSqlDiagnostics() {
    return this.controlSnapshot.buildLocalSqlDiagnostics();
  },

  async buildControlSnapshotQueryResult(options = {}) {
    let attempts = 0;
    let resultOrError = NO_CONTROL_SNAPSHOT_RETRY_RESULT;
    const retryBudgetState = createControlSnapshotRetryBudget(
      options,
      this.nowFn,
    );
    while (true) {
      const attempt = resolveControlSnapshotAttemptOptions(
        options,
        retryBudgetState,
        this.nowFn,
      );
      if (attempt.state === CONTROL_SNAPSHOT_ATTEMPT_STATE.DEADLINE_EXHAUSTED) {
        return resolveControlSnapshotTerminalResult(
          resultOrError,
          retryBudgetState,
          this.nowFn,
        );
      }
      try {
        resultOrError = await this.controlSnapshot.buildControlSnapshotQueryResult(
          attempt.options,
        );
      } catch (error) {
        resultOrError = error;
      }

      const decision = evaluateControlSnapshotRetryDecision(
        options,
        attempts,
        resultOrError,
      );

      if (decision.outcome === CONTROL_SNAPSHOT_RETRY_DECISION.RETRY) {
        if (!hasControlSnapshotRetryDelayBudget(
          retryBudgetState,
          this.nowFn,
        )) {
          return resolveControlSnapshotTerminalResult(
            resultOrError,
            retryBudgetState,
            this.nowFn,
          );
        }
        attempts += 1;
        this.logger.warn(SNAPSHOT_RETRY_LOG_MSG, {
          attempt: attempts,
          reason: decision.reason,
        });

        this.closeStaleSnapshotLaneSockets(options?.activeClientId || null);

        await new Promise((resolve) =>
          setTimeout(resolve, CONTROL_SNAPSHOT_RETRY_DELAY_MS),
        );
        continue;
      }

      if (decision.outcome === CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE) {
        return resolveControlSnapshotTerminalResult(
          resultOrError,
          retryBudgetState,
          this.nowFn,
        );
      }

      return resolveControlSnapshotQueryResult(resultOrError);
    }
  },
};

export {ADMIN_WEBSOCKET_DIAGNOSTICS_ROUTE_METHODS};
