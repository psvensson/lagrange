import {
  TYPEOF,
} from './control-plane-system-table-gateway-shared.js';
import {
  buildGatewayFallbackSystemTableRoutingDiagnostics,
  buildGatewayOperationLedgerDiagnostics,
  resolveGatewaySystemTablePartitionId,
} from './control-plane-system-table-gateway-diagnostics.js';
import {
  buildGatewayQueryOptions,
  buildGatewayWriteOptions,
} from './control-plane-system-table-gateway-options.js';

const controlPlaneSystemTableGatewayCapabilityDiagnosticsMethods = {
  /**
   * @param {string|null} tableName
   * @return {string|null}
   * @private
   */
  resolveSystemTablePartitionId(tableName) {
    return resolveGatewaySystemTablePartitionId(this, tableName);
  },

  /**
   * @param {string|null} tableName
   * @param {string|null} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildFallbackSystemTableRoutingDiagnostics(
    tableName,
    routingReadinessDimension = null,
  ) {
    return buildGatewayFallbackSystemTableRoutingDiagnostics(
      this,
      tableName,
      routingReadinessDimension,
    );
  },

  /**
   * @param {string|null} tableName
   * @param {Object|null} result
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildOperationLedgerDiagnostics(tableName, result = null, options = {}) {
    return buildGatewayOperationLedgerDiagnostics(
      this,
      tableName,
      result,
      options,
    );
  },

  /**
   * @return {boolean}
   */
  supportsReadRows() {
    const systemTableCache = this.resolveSystemTableCache();
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    return (
      Boolean(systemTableCache) ||
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION ||
      typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION
    );
  },

  /**
   * @return {boolean}
   */
  supportsMutationSubmission() {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    return (
      typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.upsertSystemTableRow === TYPEOF.FUNCTION ||
      typeof cdcIntegrationService?.deleteSystemTableRow === TYPEOF.FUNCTION
    );
  },

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildQueryOptions(options = {}, context = {}) {
    return buildGatewayQueryOptions(this, options, context);
  },

  /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildWriteOptions(options = {}, context = {}) {
    return buildGatewayWriteOptions(this, options, context);
  },
};

function assignControlPlaneSystemTableGatewayCapabilityDiagnostics(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayCapabilityDiagnosticsMethods,
  );
}

export {assignControlPlaneSystemTableGatewayCapabilityDiagnostics};
