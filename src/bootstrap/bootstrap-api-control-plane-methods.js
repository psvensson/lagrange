import {
  HTTP_STATUS,
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_SUBSYSTEM,
} from './bootstrap-api-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  CONTROL_PLANE_PHASE_SCOPE,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {installBootstrapApiMethods} from './bootstrap-api-method-installer.js';

const LOCAL_STR_CRITICAL = 'critical';
const LOCAL_STR_PRESENT = 'present';
const BOOTSTRAP_CONTROL_PLANE_READ_PROFILE =
  buildControlPlaneWorkloadProfile(
    CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_READ,
  );
const BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE =
  buildControlPlaneWorkloadProfile(
    CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_MUTATION,
  );

const bootstrapApiControlPlaneMethods = {
  /**
   * Set the SQL query engine for distributed queries.
   * Called after initialization when the engine becomes available.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    if (typeof this.sqlQueryEngine?.queryExecutor
      ?.setBootstrapTopologySnapshotOwner === TYPEOF.FUNCTION) {
      this.sqlQueryEngine.queryExecutor.setBootstrapTopologySnapshotOwner(
        this.bootstrapTopologySnapshotOwner,
      );
    }
    if (this.partitionServices &&
        typeof this.partitionServices.values === TYPEOF.FUNCTION) {
      for (const partitionService of this.partitionServices.values()) {
        if (!partitionService || typeof partitionService !== TYPEOF.OBJECT) {
          continue;
        }
        if (typeof partitionService.setSqlQueryEngine === TYPEOF.FUNCTION) {
          partitionService.setSqlQueryEngine(sqlQueryEngine);
          continue;
        }
        partitionService.sqlQueryEngine = sqlQueryEngine;
      }
    }
    this.logger.debug(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_SET);
  },

  /**
   * Set the canonical CDC integration dependency used by bootstrap-owned
   * mutation ingress and authoritative repair/read helpers.
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService || null;
    if (this.authoritativeControlPlaneView &&
        this.authoritativeControlPlaneView.cdcIntegrationService !==
          this.cdcIntegrationService) {
      this.authoritativeControlPlaneView = null;
    }
  },

  /**
   * Resolve the canonical CDC integration dependency used by bootstrap-owned
   * control-plane reads, writes, and cache repair.
   * @return {Object|null}
   * @private
   */
  getCdcIntegrationService() {
    return this.cdcIntegrationService ||
      this.runtimeOwner?.cdcIntegrationService ||
      null;
  },

  /**
   * Resolve the live SQL engine for bootstrap-owned reads, writes, and probes.
   * Prefer the explicitly hydrated engine, then fall back to the runtime owner
   * or CDC integration service when the bootstrap API outlives startup-time
   * attachment ordering.
   * @return {Object|null}
   * @private
   */
  getSqlQueryEngine() {
    return this.sqlQueryEngine ||
      this.runtimeOwner?.getSqlQueryEngine?.() ||
      this.runtimeOwner?.sqlQueryEngine ||
      this.getCdcIntegrationService()?.sqlQueryEngine ||
      this.bootstrapStartupAdapter?.getSqlQueryEngine?.() ||
      this.bootstrapStartupAdapter?.sqlQueryEngine ||
      null;
  },

  /**
   * Resolve the live system-table cache for bootstrap-owned reads.
   * Prefer the explicitly hydrated cache, then fall back to the runtime owner
   * or legacy startup adapter when the bootstrap API outlives startup wiring.
   * @return {Object|null}
   * @private
   */
  getSystemTableCache() {
    return this.systemTableCache ||
      this.runtimeOwner?.systemTableCache ||
      this.bootstrapStartupAdapter?.getSystemTableCache?.() ||
      this.bootstrapStartupAdapter?.systemTableCache ||
      null;
  },

  /**
   * Execute one bootstrap-owned control-plane query using
   * control-plane-recovery eligibility semantics.
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapControlPlaneQuery(sql, params = [], options = {}) {
    const controlPlaneSystemTableGateway =
      this.getControlPlaneSystemTableGateway();
    if (!controlPlaneSystemTableGateway ||
        typeof controlPlaneSystemTableGateway.executeQuery !== TYPEOF.FUNCTION) {
      throw new Error(BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE);
    }
    return controlPlaneSystemTableGateway.executeQuery(sql, params, {
      owner: BOOTSTRAP_API_SUBSYSTEM,
      workloadClass: BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.workloadClass,
      workClass: BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.workClass,
      deliveryPriority: LOCAL_STR_CRITICAL,
      enforcePressureAdmission: true,
      allowPressureDefer:
        BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.allowPressureDefer,
      allowPressureDegrade:
        BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.allowPressureDegrade,
      resourceKeys: BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.resourceKeys,
      pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      timeoutBudget: options.timeoutBudget || null,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  },

  /**
   * Execute one bootstrap-owned control-plane mutation through the canonical
   * gateway mutation ingress.
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapControlPlaneMutation(mutation, options = {}) {
    const controlPlaneSystemTableGateway =
      this.getControlPlaneSystemTableGateway();
    if (!controlPlaneSystemTableGateway ||
        typeof controlPlaneSystemTableGateway.submitMutation !== TYPEOF.FUNCTION) {
      throw new Error(BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE);
    }
    const result = await controlPlaneSystemTableGateway.submitMutation(mutation, {
      owner: BOOTSTRAP_API_SUBSYSTEM,
      workloadClass:
        BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.workloadClass,
      workClass: BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.workClass,
      deliveryPriority: LOCAL_STR_CRITICAL,
      allowPressureDefer:
        BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.allowPressureDefer,
      allowPressureDegrade:
        BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.allowPressureDegrade,
      resourceKeys: BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.resourceKeys,
      pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ...options,
    });
    if (result?.success !== false) {
      this.bootstrapTopologySnapshotOwner
        ?.invalidateAuthoritativeSystemTableSnapshotRows();
    }
    return result;
  },

  /**
   * Resolve the canonical shared-metadata query gateway for bootstrap-owned
   * control-plane reads and writes.
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  },

  /**
   * Determine whether one bootstrap-owned control-plane query failure should
   * slow producers down with a typed retry surface rather than surfacing as
   * a terminal internal error.
   * @param {Object|null} result
   * @return {boolean}
   * @private
   */
  isRetryableBootstrapControlPlaneQueryFailure(result) {
    if (!result || result.success !== false) {
      return false;
    }
    return isRetryableControlPlaneError(result);
  },

  /**
   * Build one typed retry/defer error for bootstrap-owned control-plane query
   * failures.
   * @param {Object} result
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildBootstrapControlPlaneQueryError(result, fallbackMessage) {
    const message =
      typeof result?.error === TYPEOF.STRING && result.error.length > NUM.ZERO ?
        result.error :
        fallbackMessage;
    if (this.isRetryableBootstrapControlPlaneQueryFailure(result)) {
      const error = new Error(message);
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      error.errorCode =
        typeof result?.errorCode === TYPEOF.STRING &&
          result.errorCode.length > NUM.ZERO ?
          result.errorCode :
          BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
      const retryAfterMs = Number.isFinite(result?.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(result.retryAfterMs)) :
        this.bootstrapAdmissionRetryAfterMs;
      error.retryAfterMs = retryAfterMs;
      const pressure =
        typeof result?.pressureAction === TYPEOF.STRING &&
          result.pressureAction.length > NUM.ZERO ||
          typeof result?.pressureReason === TYPEOF.STRING &&
          result.pressureReason.length > NUM.ZERO ||
          typeof result?.pressureSummary === TYPEOF.STRING &&
          result.pressureSummary.length > NUM.ZERO ?
          Object.freeze({
            state: LOCAL_STR_PRESENT,
            ...(typeof result?.pressureAction === TYPEOF.STRING &&
              result.pressureAction.length > NUM.ZERO ?
              {
                action: result.pressureAction,
              } :
              {}),
            ...(typeof result?.pressureReason === TYPEOF.STRING &&
              result.pressureReason.length > NUM.ZERO ?
              {
                reason: result.pressureReason,
              } :
              {}),
            ...(typeof result?.pressureSummary === TYPEOF.STRING &&
              result.pressureSummary.length > NUM.ZERO ?
              {
                summary: result.pressureSummary,
              } :
              {}),
          }) :
          Object.freeze({
            state: 'none',
          });
      error.details = {
        pressure,
        ...(pressure.state === LOCAL_STR_PRESENT && pressure.action ?
          {
            pressureAction: pressure.action,
          } :
          {}),
        ...(pressure.state === LOCAL_STR_PRESENT && pressure.reason ?
          {
            pressureReason: pressure.reason,
          } :
          {}),
        ...(pressure.state === LOCAL_STR_PRESENT && pressure.summary ?
          {
            pressureSummary: pressure.summary,
          } :
          {}),
        ...(typeof result?.tableName === TYPEOF.STRING &&
          result.tableName.length > NUM.ZERO ?
          {
            tableName: result.tableName,
          } :
          {}),
      };
      return error;
    }
    return new Error(message);
  },

  /**
   * Normalize one bootstrap mutation failure to the shared typed retry surface.
   * @param {Error} error
   * @param {string} tableName
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildBootstrapControlPlaneMutationError(
    error,
    tableName,
    fallbackMessage,
  ) {
    return this.buildBootstrapControlPlaneQueryError({
      success: false,
      error: error?.message || fallbackMessage,
      errorCode:
        typeof error?.errorCode === TYPEOF.STRING &&
          error.errorCode.length > NUM.ZERO ?
          error.errorCode :
          (
            typeof error?.code === TYPEOF.STRING && error.code.length > NUM.ZERO ?
              error.code :
              null
          ),
      retryAfterMs:
        Number.isFinite(error?.retryAfterMs) ?
          Math.max(NUM.ZERO, Math.floor(error.retryAfterMs)) :
          null,
      pressureAction:
        typeof error?.pressureAction === TYPEOF.STRING ?
          error.pressureAction :
          null,
      pressureReason:
        typeof error?.pressureReason === TYPEOF.STRING ?
          error.pressureReason :
          null,
      pressureSummary:
        error?.pressureSummary && typeof error.pressureSummary === TYPEOF.OBJECT ?
          error.pressureSummary :
          null,
      tableName,
    }, fallbackMessage);
  },
};

function installBootstrapApiControlPlaneMethods(BootstrapAPI) {
  installBootstrapApiMethods(BootstrapAPI, bootstrapApiControlPlaneMethods);
}

export {installBootstrapApiControlPlaneMethods};
