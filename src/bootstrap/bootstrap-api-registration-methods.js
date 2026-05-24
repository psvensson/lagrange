import {
  COLUMN,
  HTTP_STATUS,
  NUM,
  SERVICE_STATUS,
  TYPEOF,
} from '../constants/index.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {installBootstrapApiMethods} from './bootstrap-api-method-installer.js';

const bootstrapApiRegistrationMethods = {
  /**
   * Handle bootstrap request from a new node.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Bootstrap response.
   */
  async handleBootstrapRequest(request, reply) {
    return this.bootstrapRequestOwner
      .handleBootstrapRequest(request, reply);
  },

  /**
   * Handle register-service request from a joining node.
   * Inserts the service into the services system table.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterServiceRequest(request, reply) {
    return this.serviceRegistrationHandoffOwner
      .handleRegisterServiceRequest(request, reply);
  },

  /**
   * Decide whether one register-service handoff failure is retryable.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryableMoveReplicaHandoffError(error) {
    if (!error) {
      return false;
    }
    if (error?.errorCode ===
      BOOTSTRAP_PIPELINE_ERROR_CODE
        .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT) {
      return true;
    }
    if (Number.isFinite(error?.statusCode) &&
        Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE) {
      return true;
    }
    return Number.isFinite(error?.retryAfterMs);
  },

  /**
   * Decide whether a MOVE_REPLICA handoff must remain active after a
   * retryable target-registration failure.
   * @param {Object|null} handoffContext
   * @param {Error} error
   * @param {boolean} sourceRemovalCompleted
   * @return {boolean}
   * @private
   */
  shouldPreserveMoveReplicaHandoffReservation(
    handoffContext,
    error,
    sourceRemovalCompleted,
  ) {
    return this.moveReplicaHandoffOwner
      .shouldPreserveMoveReplicaHandoffReservation(
        handoffContext,
        error,
        sourceRemovalCompleted,
      );
  },

  /**
   * Build canonical expected service row data for registration visibility checks.
   * @param {Object} serviceData - register-service payload.
   * @return {Object} Expected service row shape in system cache.
   * @private
   */
  buildExpectedRegisteredServiceData(serviceData) {
    const serviceId = serviceData[COLUMN.SERVICE_ID];
    return {
      [COLUMN.SERVICE_ID]: serviceId,
      [COLUMN.SERVICE_TYPE]: serviceData[COLUMN.SERVICE_TYPE],
      [COLUMN.NODE_ID]: serviceData[COLUMN.NODE_ID],
      [COLUMN.GROUP_ID]: serviceData[COLUMN.GROUP_ID] || null,
      [COLUMN.REPLICA_ID]: serviceData[COLUMN.REPLICA_ID] || serviceId,
      [COLUMN.RAFT_ROLE]: serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER,
      [COLUMN.STATUS]: serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: serviceData[COLUMN.ADDRESS] || null,
    };
  },

  /**
   * Build the canonical services row persisted by /register-service.
   * @param {Object} serviceData
   * @return {Object}
   * @private
   */
  buildRegisteredServiceMutationRow(serviceData) {
    const serviceId = serviceData[COLUMN.SERVICE_ID];
    return {
      [COLUMN.SERVICE_ID]: serviceId,
      [COLUMN.SERVICE_TYPE]: serviceData[COLUMN.SERVICE_TYPE],
      [COLUMN.NODE_ID]: serviceData[COLUMN.NODE_ID],
      [COLUMN.PARTITION_ID]: serviceData[COLUMN.PARTITION_ID] || null,
      [COLUMN.GROUP_ID]: serviceData[COLUMN.GROUP_ID] || null,
      [COLUMN.REPLICA_ID]: serviceData[COLUMN.REPLICA_ID] || serviceId,
      [COLUMN.RAFT_ROLE]: serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER,
      [COLUMN.STATUS]: serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: serviceData[COLUMN.ADDRESS] || null,
      [COLUMN.CREATED_AT]: serviceData[COLUMN.CREATED_AT] || Date.now(),
      [COLUMN.UPDATED_AT]: serviceData[COLUMN.UPDATED_AT] || Date.now(),
    };
  },

  /**
   * Check whether services cache reflects the expected registered owner row.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<boolean>} True when cache/storage row matches expected registration.
   * @private
   */
  async isRegisteredServiceVisibleInCache(expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .isRegisteredServiceVisibleInCache(expectedService);
  },

  /**
   * Build one compact service snapshot for cache visibility diagnostics.
   * @param {Object|null} serviceRow - One service row from cache or expected payload.
   * @return {Object|null}
   * @private
   */
  buildRegisteredServiceVisibilitySnapshot(serviceRow) {
    return this.serviceRegistrationVisibilityOwner
      .buildRegisteredServiceVisibilitySnapshot(serviceRow);
  },

  /**
   * Compute field-level mismatch list between observed and expected service rows.
   * @param {Object} observedService - Observed row from cache/storage.
   * @param {Object} expectedService - Canonical expected row.
   * @return {Array<string>} List of mismatched field names.
   * @private
   */
  getRegisteredServiceMismatchFields(observedService, expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .getRegisteredServiceMismatchFields(observedService, expectedService);
  },

  /**
   * Read one services row from authoritative storage by service_id.
   * @param {string} serviceId - Service identifier.
   * @return {Promise<{row: Object|null, error: string|null}>}
   * @private
   */
  async readRegisteredServiceFromStorage(serviceId) {
    return this.serviceRegistrationVisibilityOwner
      .readRegisteredServiceFromStorage(serviceId);
  },

  /**
   * Evaluate services cache visibility for one register-service write.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<{visible: boolean, diagnostics: Object}>}
   * @private
   */
  async evaluateRegisteredServiceCacheVisibility(expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .evaluateRegisteredServiceCacheVisibility(expectedService);
  },

  /**
   * Repair one services-cache visibility hole through the canonical CDC
   * authoritative repair helper when storage already reflects the row.
   * @param {Object} expectedService
   * @param {Object|null} diagnostics
   * @return {Promise<boolean>}
   * @private
   */
  async maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics) {
    return this.serviceRegistrationVisibilityOwner
      .maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics);
  },

  /**
   * Build timeout diagnostics for one failed cache visibility wait.
   * @param {Object} expectedService
   * @param {Object|null} lastDiagnostics
   * @param {number} timeoutMs
   * @param {number} elapsedMs
   * @return {Object}
   * @private
   */
  buildRegisteredServiceVisibilityTimeoutDiagnostics(
    expectedService,
    lastDiagnostics,
    timeoutMs,
    elapsedMs,
  ) {
    return this.serviceRegistrationVisibilityOwner
      .buildRegisteredServiceVisibilityTimeoutDiagnostics(
        expectedService,
        lastDiagnostics,
        timeoutMs,
        elapsedMs,
      );
  },

  /**
   * Wait for register-service write to become visible in seed system cache.
   * This prevents stale assignment snapshots on immediately subsequent joins.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<void>}
   * @private
   */
  async waitForRegisteredServiceCacheVisibility(expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .waitForRegisteredServiceCacheVisibility(expectedService);
  },

  /**
   * Read the current registered services row from cache or authoritative
   * storage so MOVE_REPLICA handoff can restore the prior owner when target
   * visibility never converges.
   * @param {string} serviceId
   * @return {Promise<Object|null>}
   * @private
   */
  async readCurrentRegisteredServiceRow(serviceId) {
    return this.serviceRegistrationVisibilityOwner
      .readCurrentRegisteredServiceRow(serviceId);
  },

  /**
   * Restore the prior services row when a MOVE_REPLICA target write was issued
   * but the source replica has not yet been removed.
   * @param {?Object} previousServiceRow
   * @param {Object} requestedServiceData
   * @param {Error} error
   * @return {Promise<void>}
   * @private
   */
  async restoreRegisteredServiceRowAfterFailedHandoff(
    previousServiceRow,
    requestedServiceData,
    error,
  ) {
    return this.moveReplicaHandoffOwner
      .restoreRegisteredServiceRowAfterFailedHandoff(
        previousServiceRow,
        requestedServiceData,
        error,
      );
  },

  /**
   * Determine whether this register-service request is a MOVE_REPLICA handoff.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {boolean} True when handoff tracking should be enabled.
   * @private
   */
  isMoveReplicaHandoffRequest(serviceData) {
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaHandoffRequest(serviceData);
  },

  /**
   * Build one typed register-service validation error.
   * @param {number} statusCode
   * @param {string} message
   * @param {string} code
   * @param {Object} [options]
   * @param {number} [options.retryAfterMs]
   * @param {Object} [options.details]
   * @return {Error}
   * @private
   */
  buildRegisterServiceValidationError(statusCode, message, code, options = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = code;
    if (Number.isFinite(options.retryAfterMs)) {
      error.retryAfterMs = Math.max(
        NUM.ZERO,
        Math.floor(options.retryAfterMs),
      );
    }
    if (options.details && typeof options.details === TYPEOF.OBJECT) {
      error.details = options.details;
    }
    return error;
  },
};

function installBootstrapApiRegistrationMethods(BootstrapAPI) {
  installBootstrapApiMethods(BootstrapAPI, bootstrapApiRegistrationMethods);
}

export {installBootstrapApiRegistrationMethods};
