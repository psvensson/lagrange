import {
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
} from '../shared/startup-convergence-gate.js';
import {
  BOOTSTRAP_API_CACHE_VISIBILITY,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_SQL,
} from '../bootstrap-api-constants.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  COLUMN,
  HTTP_STATUS,
  NUM,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';

const REGISTERED_SERVICE_CACHE_REQUIRED_FIELDS = Object.freeze([
  COLUMN.SERVICE_ID,
  COLUMN.NODE_ID,
  COLUMN.SERVICE_TYPE,
  COLUMN.STATUS,
]);
const REGISTERED_SERVICE_CACHE_OPTIONAL_FIELDS = Object.freeze([
  COLUMN.GROUP_ID,
  COLUMN.REPLICA_ID,
  COLUMN.ADDRESS,
]);

class ServiceRegistrationVisibilityOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getCdcIntegrationService() {
    return this.delegates.getCdcIntegrationService?.() || null;
  }

  async executeBootstrapControlPlaneQuery(sql, params) {
    return this.delegates.executeBootstrapControlPlaneQuery?.(sql, params);
  }

  buildRegisterServiceValidationError(...args) {
    return this.delegates.buildRegisterServiceValidationError?.(...args);
  }

  async isRegisteredServiceVisibleInCache(expectedService) {
    const evaluation =
      await this.evaluateRegisteredServiceCacheVisibility(expectedService);
    return evaluation.visible;
  }

  buildRegisteredServiceVisibilitySnapshot(serviceRow) {
    if (!serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
      return null;
    }
    return {
      [COLUMN.SERVICE_ID]: serviceRow[COLUMN.SERVICE_ID] || null,
      [COLUMN.NODE_ID]: serviceRow[COLUMN.NODE_ID] || null,
      [COLUMN.SERVICE_TYPE]: serviceRow[COLUMN.SERVICE_TYPE] || null,
      [COLUMN.STATUS]: serviceRow[COLUMN.STATUS] || null,
      [COLUMN.GROUP_ID]: serviceRow[COLUMN.GROUP_ID] || null,
      [COLUMN.REPLICA_ID]: serviceRow[COLUMN.REPLICA_ID] || null,
      [COLUMN.ADDRESS]: serviceRow[COLUMN.ADDRESS] || null,
      [COLUMN.CREATED_AT]: serviceRow[COLUMN.CREATED_AT] || null,
      [COLUMN.UPDATED_AT]: serviceRow[COLUMN.UPDATED_AT] || null,
    };
  }

  buildRegisteredServiceVisibilityExpectation(serviceRow) {
    if (!serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
      return null;
    }

    const expectation = {};
    for (const fieldName of REGISTERED_SERVICE_CACHE_REQUIRED_FIELDS) {
      expectation[fieldName] = serviceRow[fieldName] || null;
    }
    for (const fieldName of REGISTERED_SERVICE_CACHE_OPTIONAL_FIELDS) {
      if (serviceRow[fieldName]) {
        expectation[fieldName] = serviceRow[fieldName];
      }
    }
    return expectation;
  }

  getRegisteredServiceMismatchFields(observedService, expectedService) {
    const mismatchFields = [];
    for (const fieldName of REGISTERED_SERVICE_CACHE_REQUIRED_FIELDS) {
      if (observedService[fieldName] !== expectedService[fieldName]) {
        mismatchFields.push(fieldName);
      }
    }
    for (const fieldName of REGISTERED_SERVICE_CACHE_OPTIONAL_FIELDS) {
      if (!expectedService[fieldName]) {
        continue;
      }
      if (observedService[fieldName] !== expectedService[fieldName]) {
        mismatchFields.push(fieldName);
      }
    }
    return mismatchFields;
  }

  async readRegisteredServiceFromStorage(serviceId) {
    const executeQuery = this.delegates.executeBootstrapControlPlaneQuery;
    if (typeof executeQuery !== TYPEOF.FUNCTION) {
      return {row: null, error: null};
    }

    try {
      const result = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_REGISTERED_SERVICE_BY_ID,
        [serviceId],
      );
      if (!result || result.success === false) {
        return {
          row: null,
          error: result?.error || BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED,
        };
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      return {
        row: rows[NUM.ZERO] || null,
        error: null,
      };
    } catch (error) {
      return {
        row: null,
        error: error.message,
      };
    }
  }

  async evaluateRegisteredServiceCacheVisibility(expectedService) {
    const diagnostics = {
      reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE,
      serviceId: expectedService[COLUMN.SERVICE_ID],
      expected: this.buildRegisteredServiceVisibilitySnapshot(expectedService),
      observed: null,
      mismatchFields: [],
      authoritative: null,
    };
    const cache = this.getSystemTableCache();
    let cachedService = null;
    let cacheMismatchFields = [];
    let cacheReason = BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE;
    if (cache) {
      cachedService = cache.get(
        TABLES.SERVICES,
        expectedService[COLUMN.SERVICE_ID],
      );
      if (!cachedService) {
        cacheReason = BOOTSTRAP_API_CACHE_VISIBILITY.REASON_SERVICE_ROW_MISSING;
      } else {
        cacheMismatchFields = this.getRegisteredServiceMismatchFields(
          cachedService,
          expectedService,
        );
        if (cacheMismatchFields.length === NUM.ZERO) {
          return {
            visible: true,
            diagnostics: {
              ...diagnostics,
              reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_VISIBLE,
              observed:
                this.buildRegisteredServiceVisibilitySnapshot(cachedService),
            },
          };
        }
        cacheReason = BOOTSTRAP_API_CACHE_VISIBILITY.REASON_FIELD_MISMATCH;
      }
    }

    const storageLookup = await this.readRegisteredServiceFromStorage(
      expectedService[COLUMN.SERVICE_ID],
    );
    if (storageLookup.error) {
      return {
        visible: false,
        diagnostics: {
          ...diagnostics,
          reason: cacheReason,
          observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
          mismatchFields: cacheMismatchFields,
          authoritative: {
            reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_LOOKUP_FAILED,
            error: storageLookup.error,
            observed: null,
            mismatchFields: [],
          },
        },
      };
    }

    if (!storageLookup.row) {
      return {
        visible: false,
        diagnostics: {
          ...diagnostics,
          reason: cacheReason,
          observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
          mismatchFields: cacheMismatchFields,
          authoritative: {
            reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_MISSING,
            observed: null,
            mismatchFields: [],
          },
        },
      };
    }

    const storageMismatchFields = this.getRegisteredServiceMismatchFields(
      storageLookup.row,
      expectedService,
    );
    const authoritativeDiagnostics = {
      reason: storageMismatchFields.length === NUM.ZERO ?
        BOOTSTRAP_API_CACHE_VISIBILITY.REASON_VISIBLE :
        BOOTSTRAP_API_CACHE_VISIBILITY.REASON_FIELD_MISMATCH,
      observed: this.buildRegisteredServiceVisibilitySnapshot(storageLookup.row),
      mismatchFields: storageMismatchFields,
    };

    if (storageMismatchFields.length === NUM.ZERO) {
      return {
        visible: false,
        diagnostics: {
          ...diagnostics,
          reason:
            BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE,
          observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
          mismatchFields: cacheMismatchFields,
          authoritative: authoritativeDiagnostics,
        },
      };
    }

    return {
      visible: false,
      diagnostics: {
        ...diagnostics,
        reason: cacheReason,
        observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
        mismatchFields: cacheMismatchFields,
        authoritative: authoritativeDiagnostics,
      },
    };
  }

  async maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics) {
    if (!expectedService ||
        diagnostics?.reason !==
          BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE) {
      return false;
    }

    const cdcIntegrationService = this.getCdcIntegrationService();
    if (!cdcIntegrationService ||
        typeof cdcIntegrationService.repairCacheVisibilityHole !==
          TYPEOF.FUNCTION) {
      return false;
    }

    try {
      const expectedFields =
        this.buildRegisteredServiceVisibilityExpectation(expectedService);
      return await cdcIntegrationService.repairCacheVisibilityHole(
        TABLES.SERVICES,
        expectedService[COLUMN.SERVICE_ID],
        true,
        expectedFields,
        null,
        {
          fallbackPhase: 'bootstrap_api_service_registration',
        },
      );
    } catch (error) {
      this.getLogger().warn(
        'Authoritative services-cache repair failed during register-service visibility wait',
        {
          serviceId: expectedService[COLUMN.SERVICE_ID],
          nodeId: expectedService[COLUMN.NODE_ID],
          error: error?.message || String(error),
        },
      );
      return false;
    }
  }

  buildRegisteredServiceVisibilityTimeoutDiagnostics(
    expectedService,
    lastDiagnostics,
    timeoutMs,
    elapsedMs,
  ) {
    return {
      serviceId: expectedService[COLUMN.SERVICE_ID],
      nodeId: expectedService[COLUMN.NODE_ID],
      timeoutMs,
      elapsedMs,
      lastVisibilityCheck: lastDiagnostics ||
        {
          reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE,
          serviceId: expectedService[COLUMN.SERVICE_ID],
          expected: this.buildRegisteredServiceVisibilitySnapshot(expectedService),
          observed: null,
          mismatchFields: [],
          authoritative: null,
        },
    };
  }

  async waitForRegisteredServiceCacheVisibility(expectedService) {
    const serviceRegistrationCacheVisibilityTimeout =
      BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT;
    const timeoutMs =
      BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS;
    const pollIntervalMs =
      BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_CACHE_VISIBILITY_POLL_INTERVAL_MS;
    let lastDiagnostics = null;
    await waitForStartupConvergence({
      timeoutMs,
      pollIntervalMs,
      subscriptions: [
        (notify) => subscribeToSystemTableCacheChanges(
          this.getSystemTableCache(),
          notify,
          {tableNames: [TABLES.SERVICES]},
        ),
      ],
      evaluate: async () => {
        const evaluation =
          await this.evaluateRegisteredServiceCacheVisibility(expectedService);
        lastDiagnostics = evaluation.diagnostics;
        return {
          ready: evaluation.visible,
          diagnostics: evaluation.diagnostics,
        };
      },
      onBlocked: async (result) => {
        return this.maybeRepairRegisteredServiceCacheVisibility(
          expectedService,
          result?.diagnostics || null,
        );
      },
      createTimeoutError: (_result, context) => {
        const timeoutDiagnostics =
          this.buildRegisteredServiceVisibilityTimeoutDiagnostics(
            expectedService,
            lastDiagnostics,
            timeoutMs,
            context.elapsedMs,
          );
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT,
          timeoutDiagnostics,
        );

        return this.buildRegisterServiceValidationError(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          serviceRegistrationCacheVisibilityTimeout(
            expectedService[COLUMN.SERVICE_ID],
            expectedService[COLUMN.NODE_ID],
            timeoutMs,
          ),
          BOOTSTRAP_PIPELINE_ERROR_CODE
            .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT,
          {
            retryAfterMs: pollIntervalMs,
            details: {
              ...timeoutDiagnostics,
              timeoutKind: context.timeoutKind,
            },
          },
        );
      },
    });
  }

  async readCurrentRegisteredServiceRow(serviceId) {
    if (typeof serviceId !== TYPEOF.STRING || serviceId.length === NUM.ZERO) {
      return null;
    }
    const cachedRow =
      this.getSystemTableCache()?.get?.(TABLES.SERVICES, serviceId) || null;
    if (cachedRow) {
      return {...cachedRow};
    }
    const storageLookup =
      await this.readRegisteredServiceFromStorage(serviceId);
    if (storageLookup?.row) {
      return {...storageLookup.row};
    }
    return null;
  }
}

export {ServiceRegistrationVisibilityOwner};
