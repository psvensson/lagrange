import {assignAdminServiceDiscoveryRepairCacheMethods} from './admin-service-discovery-repair-cache-methods.js';

const LOCAL_NUM_FIVE = 5;
const LOCAL_STR_AUTHORITATIVE_DISCOVERY_CACHE_REPAIR_FAI = 'Authoritative discovery cache repair failed';
const LOCAL_STR_AUTHORITATIVE_DISCOVERY_CACHE_REPAIR_COM = 'Authoritative discovery cache repair completed';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryRepairMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY_LITERAL,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    AUTHORITATIVE_DISCOVERY_REPAIR_CAUSE_ID_PREFIX,
    AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
    AUTHORITATIVE_DISCOVERY_REPAIR_UNKNOWN_REASON,
    AUTHORITATIVE_REPAIR_FAILURE_ACTION,
    EMPTY_STRING,
    SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
    computeAuthoritativeRepairFailureRetryAfterMs,
    normalizeAuthoritativeRepairTableNames,
    resolveAuthoritativeRepairFailureBaseRetryAfterMs,
    resolveAuthoritativeRepairFailureClass,
    resolveAuthoritativeRepairFailureMaxRetryAfterMs,
    shouldAbortAuthoritativeRepairTableReads,
    summarizeAuthoritativeRepairError,
  } = options;

  class AdminServiceDiscoveryRepairMethods {
    /**
     * Ensure bounded authoritative discovery cache repair.
     * @param {Object} [options={}]
     * @return {Promise<Object>}
     */
    async ensureAuthoritativeDiscoveryCacheRepair(options = {}) {
      if (
        !this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          'function'
      ) {
        return {
          applied: false,
          skipped: true,
          tableCount: 0,
        };
      }
      if (!this.canReadAuthoritativeDiscoveryRows()) {
        return {
          applied: false,
          skipped: true,
          tableCount: 0,
        };
      }
      const now = this.nowFn();
      const repairTableNames =
        this.resolveAuthoritativeDiscoveryRepairTables(options);
      if (repairTableNames.length === 0) {
        return {
          applied: false,
          skipped: true,
          tableCount: 0,
        };
      }
      if (this.authoritativeDiscoveryRepairPromise) {
        return this.authoritativeDiscoveryRepairPromise;
      }
      const recentRepairResult = this.resolveRecentAuthoritativeDiscoveryRepair(
        {
          ...options,
          repairTables: repairTableNames,
        },
        now,
      );
      if (recentRepairResult) {
        return recentRepairResult;
      }
      const recentRepairFailure =
        this.resolveRecentAuthoritativeDiscoveryRepairFailure(
          {
            ...options,
            repairTables: repairTableNames,
          },
          now,
        );
      if (recentRepairFailure) {
        return recentRepairFailure;
      }
      if (
        options?.bypassReuse !== true &&
        now - this.lastAuthoritativeDiscoveryRepairAtMs <
          AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS &&
        this.lastAuthoritativeDiscoveryRepairCoversTables(repairTableNames)
      ) {
        return {
          applied: false,
          skipped: true,
          tableCount: 0,
        };
      }
      this.authoritativeDiscoveryRepairPromise =
        this.executeAuthoritativeDiscoveryCacheRepairRun(
          repairTableNames,
          options,
          now,
        ).finally(() => {
          this.authoritativeDiscoveryRepairPromise = null;
        });
      return this.authoritativeDiscoveryRepairPromise;
    }

    async executeAuthoritativeDiscoveryCacheRepairRun(
      repairTableNames,
      options,
      now,
    ) {
      const repairState = this.createAuthoritativeDiscoveryRepairState();
      const causeId = this.buildAuthoritativeDiscoveryRepairCauseId(
        options,
        now,
      );
      await this.readAuthoritativeDiscoveryRepairRowsIntoState(
        repairState,
        repairTableNames,
        options,
        now,
      );
      if (repairState.failedTables.length === 0) {
        await this.applyAuthoritativeDiscoveryRepairRowsIntoState(
          repairState,
          repairTableNames,
          causeId,
        );
      }
      return this.finalizeAuthoritativeDiscoveryCacheRepairRun(
        repairState,
        repairTableNames,
        options,
      );
    }

    createAuthoritativeDiscoveryRepairState() {
      return {
        repairedTableCount: 0,
        repairedRowCount: 0,
        repairedTableNames: [],
        authoritativeRowsByTable: new Map(),
        failedTables: [],
        errors: [],
        errorSummaries: [],
      };
    }

    buildAuthoritativeDiscoveryRepairCauseId(options, now) {
      return [
        AUTHORITATIVE_DISCOVERY_REPAIR_CAUSE_ID_PREFIX,
        String(options.reason || AUTHORITATIVE_DISCOVERY_REPAIR_UNKNOWN_REASON),
        String(now),
      ].join(SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR);
    }

    async readAuthoritativeDiscoveryRepairRowsIntoState(
      repairState,
      repairTableNames,
      options,
      now,
    ) {
      for (const tableName of repairTableNames) {
        try {
          const result = await this.readAuthoritativeSystemTableRows(
            tableName,
            {
              nowMs: now,
              reason:
                options.reason || AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
              tableName: options.tableName || null,
              tableId: options.tableId || null,
              queryTimeoutMs: options.queryTimeoutMs,
            },
          );
          repairState.authoritativeRowsByTable.set(tableName, {
            tableName: result.tableName,
            rows: result.rows,
            authoritativeObservation: result.authoritativeObservation,
          });
        } catch (error) {
          const errorSummary = this.recordAuthoritativeDiscoveryRepairFailure(
            repairState,
            tableName,
            error,
          );
          if (shouldAbortAuthoritativeRepairTableReads(errorSummary)) {
            break;
          }
        }
      }
    }

    async applyAuthoritativeDiscoveryRepairRowsIntoState(
      repairState,
      repairTableNames,
      causeId,
    ) {
      for (const tableName of repairTableNames) {
        const result = repairState.authoritativeRowsByTable.get(tableName);
        try {
          repairState.repairedRowCount +=
            await this.applyAuthoritativeSystemTableRows(
              result?.tableName || tableName,
              result?.rows || ADMIN_CACHE_DUMP.EMPTY,
              causeId,
              {
                authoritativeObservation:
                  result?.authoritativeObservation || null,
              },
            );
          repairState.repairedTableCount += 1;
          repairState.repairedTableNames.push(tableName);
        } catch (error) {
          this.recordAuthoritativeDiscoveryRepairFailure(
            repairState,
            tableName,
            error,
          );
          break;
        }
      }
    }

    recordAuthoritativeDiscoveryRepairFailure(repairState, tableName, error) {
      const errorSummary = summarizeAuthoritativeRepairError(tableName, error);
      repairState.failedTables.push(tableName);
      repairState.errorSummaries.push(errorSummary);
      repairState.errors.push(
        `${tableName}${SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR}` +
          String(
            error?.message ||
              error ||
              ADMIN_SERVICE_DISCOVERY_LITERAL.UNKNOWN_ERROR,
          ),
      );
      return errorSummary;
    }

    finalizeAuthoritativeDiscoveryCacheRepairRun(
      repairState,
      repairTableNames,
      options,
    ) {
      const completedAtMs = this.nowFn();
      this.lastAuthoritativeDiscoveryRepairAtMs = completedAtMs;
      const outcome = this.resolveAuthoritativeDiscoveryRepairOutcome(
        repairState,
        repairTableNames,
      );
      const result = outcome.repairApplied ?
        this.storeSuccessfulAuthoritativeDiscoveryRepair(
          repairState,
          completedAtMs,
        ) :
        this.storeFailedAuthoritativeDiscoveryRepair(
          repairState,
          repairTableNames,
          outcome,
          completedAtMs,
        );
      this.logAuthoritativeDiscoveryCacheRepairResult(
        result,
        repairState,
        repairTableNames,
        options,
        outcome,
      );
      return result;
    }

    resolveAuthoritativeDiscoveryRepairOutcome(repairState, repairTableNames) {
      const repairApplied =
        repairState.failedTables.length === 0 &&
        repairState.repairedTableCount === repairTableNames.length;
      const causeChain = repairState.errorSummaries
        .flatMap((summary) =>
          Array.isArray(summary?.causeChain) ?
            summary.causeChain :
            ADMIN_CACHE_DUMP.EMPTY,
        )
        .filter((value, index, values) => values.indexOf(value) === index);
      const readSource =
        repairState.errorSummaries.find((summary) => summary?.readSource)
          ?.readSource || null;
      const localQueryTransport =
        repairState.errorSummaries.find(
          (summary) => summary?.localQueryTransport,
        )?.localQueryTransport || null;
      const firstFailedParticipant =
        repairState.errorSummaries.find(
          (summary) => summary?.firstFailedParticipant,
        )?.firstFailedParticipant || null;
      const errorCodes = this.buildAuthoritativeDiscoveryRepairErrorCodes(
        repairState.errorSummaries,
        repairState.errors,
      );
      const failureClass = repairApplied ?
        null :
        resolveAuthoritativeRepairFailureClass(causeChain);
      const failureCount = repairApplied ?
        0 :
        this.resolveAuthoritativeDiscoveryRepairFailureCount(
          repairTableNames,
          failureClass,
        );
      const baseRetryAfterMs = repairApplied ?
        null :
        resolveAuthoritativeRepairFailureBaseRetryAfterMs(
          repairState.errorSummaries,
        );
      const maxRetryAfterMs = repairApplied ?
        null :
        resolveAuthoritativeRepairFailureMaxRetryAfterMs(
          failureClass,
          baseRetryAfterMs,
        );
      const retryAfterMs = repairApplied ?
        null :
        computeAuthoritativeRepairFailureRetryAfterMs(
          failureClass,
          failureCount,
          baseRetryAfterMs,
          maxRetryAfterMs,
        );
      return {
        repairApplied,
        causeChain,
        readSource,
        localQueryTransport,
        firstFailedParticipant,
        errorCodes,
        failureClass,
        failureCount,
        retryAfterMs,
      };
    }

    buildAuthoritativeDiscoveryRepairErrorCodes(errorSummaries, errors) {
      const errorCodeSet = new Set();
      for (const summary of Array.isArray(errorSummaries) ?
        errorSummaries :
        ADMIN_CACHE_DUMP.EMPTY) {
        if (summary?.errorCode) {
          errorCodeSet.add(summary.errorCode);
        }
      }
      for (const error of Array.isArray(errors) ?
        errors :
        ADMIN_CACHE_DUMP.EMPTY) {
        const errorCode =
          this.extractAuthoritativeDiscoveryRepairErrorCode(error);
        if (errorCode) {
          errorCodeSet.add(errorCode);
        }
      }
      return [...errorCodeSet].slice(0, LOCAL_NUM_FIVE);
    }

    extractAuthoritativeDiscoveryRepairErrorCode(errorValue) {
      const message = String(errorValue || EMPTY_STRING);
      const separatorIndex = message.indexOf(
        SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
      );
      const summary =
        separatorIndex >= 0 ?
          message.slice(separatorIndex + 1).trim() :
          message.trim();
      return summary.length > 0 ? summary : null;
    }

    storeSuccessfulAuthoritativeDiscoveryRepair(repairState, completedAtMs) {
      const result = {
        applied: true,
        skipped: false,
        tableCount: repairState.repairedTableCount,
        tableNames: [...repairState.repairedTableNames],
        repairedRowCount: repairState.repairedRowCount,
        completedAtMs,
        reused: false,
      };
      this.lastAuthoritativeDiscoveryRepairCompletedAtMs = completedAtMs;
      this.lastAuthoritativeDiscoveryRepairResult = result;
      this.lastAuthoritativeDiscoveryRepairFailureState = null;
      return result;
    }

    storeFailedAuthoritativeDiscoveryRepair(
      repairState,
      repairTableNames,
      outcome,
      completedAtMs,
    ) {
      this.lastAuthoritativeDiscoveryRepairCompletedAtMs = 0;
      this.lastAuthoritativeDiscoveryRepairResult = null;
      this.lastAuthoritativeDiscoveryRepairFailureState = {
        action: AUTHORITATIVE_REPAIR_FAILURE_ACTION.DEFER_REPAIR,
        requestedTableNames:
          normalizeAuthoritativeRepairTableNames(repairTableNames),
        failedTables: normalizeAuthoritativeRepairTableNames(
          repairState.failedTables,
        ),
        errors: [...repairState.errors],
        errorCodes: [...outcome.errorCodes],
        causeChain: [...outcome.causeChain],
        readSource: outcome.readSource,
        localQueryTransport: outcome.localQueryTransport,
        firstFailedParticipant: outcome.firstFailedParticipant,
        failureClass: outcome.failureClass,
        failureCount: outcome.failureCount,
        retryAfterMs: outcome.retryAfterMs,
        retryAtMs: completedAtMs + outcome.retryAfterMs,
        completedAtMs,
      };
      return {
        applied: false,
        skipped: false,
        tableCount: repairState.repairedTableCount,
        tableNames: [...repairState.repairedTableNames],
        requestedTableCount: repairTableNames.length,
        requestedTableNames: [...repairTableNames],
        repairedRowCount: repairState.repairedRowCount,
        failedTables: [...repairState.failedTables],
        errorCount: repairState.errors.length,
        errors: repairState.errors,
        causeChain: outcome.causeChain,
        readSource: outcome.readSource,
        localQueryTransport: outcome.localQueryTransport,
        firstFailedParticipant: outcome.firstFailedParticipant,
        failureClass: outcome.failureClass,
        failureCount: outcome.failureCount,
        retryAfterMs: outcome.retryAfterMs,
        completedAtMs,
        reused: false,
      };
    }

    logAuthoritativeDiscoveryCacheRepairResult(
      result,
      repairState,
      repairTableNames,
      options,
      outcome,
    ) {
      if (outcome.repairApplied !== true) {
        this.logger?.warn?.(LOCAL_STR_AUTHORITATIVE_DISCOVERY_CACHE_REPAIR_FAI, {
          nodeId: this.nodeId,
          reason: options.reason || null,
          tableName: options.tableName || null,
          tableId: options.tableId || null,
          repairTableNames,
          requestedTableCount: repairTableNames.length,
          repairedTableCount: repairState.repairedTableCount,
          repairedRowCount: repairState.repairedRowCount,
          failedTables: repairState.failedTables,
          errorCount: repairState.errors.length,
          errorCodes: outcome.errorCodes,
          errors: repairState.errors,
          causeChain: result.causeChain || [],
          failureClass: result.failureClass || null,
          failureCount: result.failureCount || 0,
          retryAfterMs: result.retryAfterMs || null,
          readSource: result.readSource || null,
          localQueryTransport: result.localQueryTransport || null,
          firstFailedParticipant: result.firstFailedParticipant || null,
        });
        return;
      }
      this.logger?.info?.(LOCAL_STR_AUTHORITATIVE_DISCOVERY_CACHE_REPAIR_COM, {
        nodeId: this.nodeId,
        reason: options.reason || null,
        tableName: options.tableName || null,
        tableId: options.tableId || null,
        repairTableNames,
        repairedTableCount: repairState.repairedTableCount,
        repairedRowCount: repairState.repairedRowCount,
      });
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryRepairMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryRepairMethods.prototype,
        methodName,
      ),
    );
  }

  assignAdminServiceDiscoveryRepairCacheMethods(
    AdminServiceDiscovery,
    options,
  );
}

export {assignAdminServiceDiscoveryRepairMethods};
