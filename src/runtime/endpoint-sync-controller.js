/**
 * Endpoint sync controller orchestration.
 *
 * Orchestrates source reads, filtering, planning, and Kubernetes
 * reconciliation for one convergence cycle.
 *
 * @module runtime/endpoint-sync-controller
 */

import {TYPEOF} from '../constants/index.js';
import {BaseError} from '../utils/base-error.js';
import {
  ENDPOINT_SYNC_ERROR,
  ENDPOINT_SYNC_EVENT_REASON,
  ENDPOINT_SYNC_EVENT_TYPE,
  ENDPOINT_SYNC_LOG,
} from './endpoint-sync-constants.js';
import {filterNormalizedEndpointRows} from './endpoint-sync-source-query.js';
import {planEndpointExports} from './endpoint-sync-planner.js';
import {
  RECONCILE_SUMMARY_DEFAULT,
  reconcilePlannedExports,
} from './endpoint-sync-k8s-reconciler.js';
import {
  EndpointSyncLeaseLeaderElector,
} from './endpoint-sync-leader-election.js';
import {EndpointSyncMetrics} from './endpoint-sync-metrics.js';

const LOCAL_STR_1P5S0 = 'EndpointSyncController';
const LOCAL_STR_RUNONCE = 'runOnce';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1T6E5 = 'EndpointSyncSourceClient';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_WARN = 'warn';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_INFO = 'info';
const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_MANAGED_RESOURCE = 'managed-resource';

const ENDPOINT_SYNC_CONTROLLER_ERROR = Object.freeze({
  SOURCE_CLIENT_REQUIRED: 'sourceClient is required',
  SOURCE_FETCH_METHOD_REQUIRED:
    'sourceClient must implement fetchEndpointRows(options)',
  K8S_CLIENT_REQUIRED: 'k8sClient is required',
  CONFIG_REQUIRED: 'config is required',
  NAMESPACE_REQUIRED:
    'namespace is required in config or constructor options',
  LEADER_ELECTOR_METHOD_REQUIRED:
    'leaderElector must implement tryAcquireLeadership()',
  METRICS_METHOD_PREFIX:
    'metrics reporter missing required method',
});

const REQUIRED_METRICS_METHOD = Object.freeze([
  'recordReconcileDurationMs',
  'incrementReconcileFailures',
  'setExportedServices',
  'setExportedEndpoints',
  'incrementPortConflicts',
  'snapshot',
]);

/**
 * Typed controller error.
 *
 * @extends BaseError
 */
class EndpointSyncControllerError extends BaseError {
  /**
   * @param {string} message - Error message.
   * @param {Object} [metadata={}] - Error metadata.
   * @param {Error} [cause] - Underlying cause.
   */
  constructor(message, metadata = {}, cause = undefined) {
    super(message, {
      cause,
      context: {
        component: LOCAL_STR_1P5S0,
        operation: LOCAL_STR_RUNONCE,
        metadata,
      },
    });
  }
}

/**
 * Best-effort structured logging helper.
 *
 * @param {Object} logger - Logger object.
 * @param {string} level - Logger method name.
 * @param {string} message - Log message/tag.
 * @param {Object} payload - Structured fields.
 */
function safeLog(logger, level, message, payload) {
  if (!logger || typeof logger[level] !== TYPEOF.FUNCTION) {
    return;
  }
  try {
    logger[level](message, payload);
  } catch (_error) {
    // logging failures must not affect reconcile behavior
  }
}

/**
 * Clone reconcile summary from default shape.
 *
 * @return {Object}
 */
function cloneReconcileSummary() {
  return {
    desiredServices: RECONCILE_SUMMARY_DEFAULT.desiredServices,
    desiredEndpointSlices: RECONCILE_SUMMARY_DEFAULT.desiredEndpointSlices,
    upsertedServices: RECONCILE_SUMMARY_DEFAULT.upsertedServices,
    upsertedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.upsertedEndpointSlices,
    exportedEndpoints: RECONCILE_SUMMARY_DEFAULT.exportedEndpoints,
    deletedServices: RECONCILE_SUMMARY_DEFAULT.deletedServices,
    deletedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.deletedEndpointSlices,
    groupFailures: [],
  };
}

/**
 * Build run summary shell used across success/failure paths.
 *
 * @return {Object}
 */
function createRunSummary() {
  return {
    sourceRowCount: LOCAL_NUM_ZERO,
    filteredRowCount: LOCAL_NUM_ZERO,
    plannedExportCount: LOCAL_NUM_ZERO,
    conflictCount: LOCAL_NUM_ZERO,
    conflicts: [],
    skippedAsFollower: false,
    leadership: null,
    reconcileSummary: cloneReconcileSummary(),
  };
}

/**
 * Resolve whether an error originated from source query path.
 *
 * @param {Error} error - Error to inspect.
 * @return {boolean}
 */
function isSourceQueryError(error) {
  if (!error || typeof error !== TYPEOF.OBJECT) {
    return false;
  }
  if (error?.context?.component === LOCAL_STR_1T6E5) {
    return true;
  }
  return error.message === ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED ||
    error.message === ENDPOINT_SYNC_ERROR.SOURCE_QUERY_TIMEOUT;
}

/**
 * Controller entrypoint for endpoint synchronization.
 */
class EndpointSyncController {
  /**
   * @param {Object} options - Controller options.
   * @param {Object} options.sourceClient - Source query client.
   * @param {Object} options.k8sClient - Kubernetes client.
   * @param {Object} options.config - Controller config.
   * @param {string} [options.namespace] - Explicit target namespace.
   * @param {Object} [options.leaderElector] - Optional leader elector override.
   * @param {Object} [options.metrics] - Optional metrics storage override.
   * @param {Object} [options.logger] - Optional logger override.
   * @param {string} [options.leaderIdentity] - Optional lease holder identity.
   */
  constructor(options) {
    if (!options || typeof options !== TYPEOF.OBJECT) {
      throw new EndpointSyncControllerError(
        ENDPOINT_SYNC_CONTROLLER_ERROR.CONFIG_REQUIRED,
      );
    }

    this._sourceClient = options.sourceClient;
    if (!this._sourceClient) {
      throw new EndpointSyncControllerError(
        ENDPOINT_SYNC_CONTROLLER_ERROR.SOURCE_CLIENT_REQUIRED,
      );
    }
    if (typeof this._sourceClient.fetchEndpointRows !== TYPEOF.FUNCTION) {
      throw new EndpointSyncControllerError(
        ENDPOINT_SYNC_CONTROLLER_ERROR.SOURCE_FETCH_METHOD_REQUIRED,
      );
    }

    this._k8sClient = options.k8sClient;
    if (!this._k8sClient || typeof this._k8sClient !== TYPEOF.OBJECT) {
      throw new EndpointSyncControllerError(
        ENDPOINT_SYNC_CONTROLLER_ERROR.K8S_CLIENT_REQUIRED,
      );
    }

    this._config = options.config;
    if (!this._config || typeof this._config !== TYPEOF.OBJECT) {
      throw new EndpointSyncControllerError(
        ENDPOINT_SYNC_CONTROLLER_ERROR.CONFIG_REQUIRED,
      );
    }

    this._namespace = options.namespace ||
      this._config.targetNamespace ||
      this._config.leaseNamespace ||
      LOCAL_STR_EMPTY;
    if (typeof this._namespace !== TYPEOF.STRING ||
      this._namespace.trim().length === LOCAL_NUM_ZERO) {
      throw new EndpointSyncControllerError(
        ENDPOINT_SYNC_CONTROLLER_ERROR.NAMESPACE_REQUIRED,
      );
    }
    this._namespace = this._namespace.trim();
    this._logger = options.logger || console;

    this._metrics = options.metrics || new EndpointSyncMetrics();
    this._validateMetricsReporter();

    this._leaderElector = null;
    if (this._config.leaderElectionEnabled === true) {
      this._leaderElector = options.leaderElector ||
        new EndpointSyncLeaseLeaderElector({
          k8sClient: this._k8sClient,
          namespace: this._config.leaseNamespace || this._namespace,
          leaseName: this._config.leaseName,
          holderIdentity: options.leaderIdentity,
        });

      if (typeof this._leaderElector.tryAcquireLeadership !== TYPEOF.FUNCTION) {
        throw new EndpointSyncControllerError(
          ENDPOINT_SYNC_CONTROLLER_ERROR.LEADER_ELECTOR_METHOD_REQUIRED,
        );
      }
    }
  }

  /**
   * Verify injected metrics reporter shape.
   *
   * @private
   */
  _validateMetricsReporter() {
    for (const methodName of REQUIRED_METRICS_METHOD) {
      if (typeof this._metrics[methodName] !== TYPEOF.FUNCTION) {
        throw new EndpointSyncControllerError(
          `${ENDPOINT_SYNC_CONTROLLER_ERROR.METRICS_METHOD_PREFIX}: ${methodName}`,
        );
      }
    }
  }

  /**
   * Emit group-level warning event when supported by k8s client.
   *
   * @param {Object} eventData - Event payload.
   * @private
   */
  async _emitKubernetesEvent(eventData) {
    if (typeof this._k8sClient.recordEvent !== TYPEOF.FUNCTION) {
      return;
    }
    try {
      await this._k8sClient.recordEvent({
        namespace: this._namespace,
        type: ENDPOINT_SYNC_EVENT_TYPE.WARNING,
        reason: eventData.reason,
        message: eventData.message,
        serviceKey: eventData.serviceKey || null,
        serviceName: eventData.serviceName || null,
        protocol: eventData.protocol || null,
        stage: eventData.stage || null,
      });
    } catch (error) {
      safeLog(this._logger, LOCAL_STR_WARN, ENDPOINT_SYNC_LOG.EVENT_EMIT_FAILURE, {
        namespace: this._namespace,
        reason: eventData.reason,
        error: error.message,
      });
    }
  }

  /**
   * Record controller metric values from one run.
   *
   * @param {Object} summary - Run summary.
   * @param {number} durationMs - Run duration.
   * @param {boolean} cycleFailed - Whether run threw error.
   * @private
   */
  _recordMetrics(summary, durationMs, cycleFailed) {
    if (this._config.metricsEnabled !== true) {
      return;
    }
    this._metrics.recordReconcileDurationMs(durationMs);
    this._metrics.setExportedServices(summary.reconcileSummary.upsertedServices);
    this._metrics.setExportedEndpoints(summary.reconcileSummary.exportedEndpoints);
    this._metrics.incrementPortConflicts(summary.conflictCount);
    if (cycleFailed || summary.reconcileSummary.groupFailures.length > LOCAL_NUM_ZERO) {
      this._metrics.incrementReconcileFailures();
    }
  }

  /**
   * Emit one structured summary log for reconcile run.
   *
   * @param {Object} summary - Run summary.
   * @param {number} durationMs - Run duration.
   * @param {boolean} cycleFailed - Whether run threw error.
   * @private
   */
  _logReconcileSummary(summary, durationMs, cycleFailed) {
    const payload = {
      durationMs,
      sourceRowCount: summary.sourceRowCount,
      filteredRowCount: summary.filteredRowCount,
      plannedExportCount: summary.plannedExportCount,
      conflictCount: summary.conflictCount,
      skippedAsFollower: summary.skippedAsFollower,
      desiredServices: summary.reconcileSummary.desiredServices,
      desiredEndpointSlices: summary.reconcileSummary.desiredEndpointSlices,
      upsertedServices: summary.reconcileSummary.upsertedServices,
      upsertedEndpointSlices: summary.reconcileSummary.upsertedEndpointSlices,
      exportedEndpoints: summary.reconcileSummary.exportedEndpoints,
      deletedServices: summary.reconcileSummary.deletedServices,
      deletedEndpointSlices: summary.reconcileSummary.deletedEndpointSlices,
      groupFailureCount: summary.reconcileSummary.groupFailures.length,
    };

    if (cycleFailed) {
      safeLog(this._logger, LOCAL_STR_ERROR, ENDPOINT_SYNC_LOG.RECONCILE_SUMMARY, payload);
      return;
    }
    if (summary.reconcileSummary.groupFailures.length > LOCAL_NUM_ZERO ||
      summary.conflictCount > LOCAL_NUM_ZERO) {
      safeLog(this._logger, LOCAL_STR_WARN, ENDPOINT_SYNC_LOG.RECONCILE_SUMMARY, payload);
      return;
    }
    safeLog(this._logger, LOCAL_STR_INFO, ENDPOINT_SYNC_LOG.RECONCILE_SUMMARY, payload);
  }

  /**
   * Return immutable metrics snapshot.
   *
   * @return {Readonly<Object>}
   */
  getMetricsSnapshot() {
    return this._metrics.snapshot();
  }

  /**
   * Execute one reconciliation cycle.
   *
   * @return {Promise<Object>} Run summary.
   */
  async runOnce() {
    const startedAtMs = Date.now();
    const summary = createRunSummary();

    try {
      if (this._leaderElector) {
        summary.leadership = await this._leaderElector.tryAcquireLeadership();
        safeLog(this._logger, LOCAL_STR_INFO, ENDPOINT_SYNC_LOG.LEADER_STATUS, {
          holderIdentity: summary.leadership.holderIdentity,
          leaseName: summary.leadership.leaseName,
          leaseNamespace: summary.leadership.leaseNamespace,
          isLeader: summary.leadership.isLeader,
          observedHolderIdentity: summary.leadership.observedHolderIdentity,
        });
        if (!summary.leadership.isLeader) {
          summary.skippedAsFollower = true;
          const durationMs = Date.now() - startedAtMs;
          this._recordMetrics(summary, durationMs, false);
          this._logReconcileSummary(summary, durationMs, false);
          return summary;
        }
      }

      const sourceRows = await this._sourceClient.fetchEndpointRows(this._config);
      summary.sourceRowCount = sourceRows.length;

      const filteredRows = filterNormalizedEndpointRows(sourceRows, {
        protocolAllowlist: this._config.protocolAllowlist,
        serviceIdAllowlist: this._config.serviceIdAllowlist,
        healthyOnly: this._config.healthyOnly,
        unhealthyPolicy: this._config.unhealthyPolicy,
      });
      summary.filteredRowCount = filteredRows.length;

      const plan = planEndpointExports(filteredRows, {
        strictPortMode: this._config.strictPortMode,
        serviceNamePrefix: this._config.serviceNamePrefix,
        maxEndpointsPerSlice: this._config.maxEndpointsPerSlice,
      });
      summary.plannedExportCount = plan.exports.length;
      summary.conflictCount = plan.conflicts.length;
      summary.conflicts = plan.conflicts;

      for (const conflict of plan.conflicts) {
        safeLog(this._logger, LOCAL_STR_WARN, ENDPOINT_SYNC_LOG.GROUP_FAILURE, {
          reason: ENDPOINT_SYNC_EVENT_REASON.PORT_CONFLICT,
          serviceKey: conflict.serviceKey,
          serviceName: conflict.logicalServiceName,
          protocol: conflict.protocol,
          ports: conflict.ports,
          message: conflict.reason,
        });
        await this._emitKubernetesEvent({
          reason: ENDPOINT_SYNC_EVENT_REASON.PORT_CONFLICT,
          serviceKey: conflict.serviceKey,
          serviceName: conflict.logicalServiceName,
          protocol: conflict.protocol,
          message:
            `Strict port conflict for ${conflict.serviceKey}: ${conflict.ports.join(LOCAL_STR_128KJ)}`,
        });
      }

      summary.reconcileSummary = await reconcilePlannedExports({
        k8sClient: this._k8sClient,
        namespace: this._namespace,
        plannedExports: plan.exports,
        unhealthyPolicy: this._config.unhealthyPolicy,
      });

      for (const groupFailure of summary.reconcileSummary.groupFailures) {
        safeLog(this._logger, LOCAL_STR_ERROR, ENDPOINT_SYNC_LOG.GROUP_FAILURE, {
          reason: ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED,
          serviceKey: groupFailure.serviceKey,
          serviceName: groupFailure.serviceName,
          protocol: groupFailure.protocol,
          stage: groupFailure.stage,
          message: groupFailure.message,
        });
        await this._emitKubernetesEvent({
          reason: ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED,
          serviceKey: groupFailure.serviceKey,
          serviceName: groupFailure.serviceName,
          protocol: groupFailure.protocol,
          stage: groupFailure.stage,
          message:
            `Projection failure for ${groupFailure.serviceName || LOCAL_STR_MANAGED_RESOURCE}: ` +
            `${groupFailure.message}`,
        });
      }

      const durationMs = Date.now() - startedAtMs;
      this._recordMetrics(summary, durationMs, false);
      this._logReconcileSummary(summary, durationMs, false);

      return summary;
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      this._recordMetrics(summary, durationMs, true);

      const eventReason = isSourceQueryError(error) ?
        ENDPOINT_SYNC_EVENT_REASON.SOURCE_QUERY_FAILED :
        ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED;
      await this._emitKubernetesEvent({
        reason: eventReason,
        message: error.message,
      });

      safeLog(this._logger, LOCAL_STR_ERROR, ENDPOINT_SYNC_LOG.RECONCILE_FAILURE, {
        error: error.message,
      });
      this._logReconcileSummary(summary, durationMs, true);
      throw error;
    }
  }
}

export {
  ENDPOINT_SYNC_CONTROLLER_ERROR,
  REQUIRED_METRICS_METHOD,
  EndpointSyncControllerError,
  safeLog,
  cloneReconcileSummary,
  createRunSummary,
  isSourceQueryError,
  EndpointSyncController,
};
