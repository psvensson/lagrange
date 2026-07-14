import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {
  NodeJoiningAdmissionReadiness,
} from './node-joining-admission-readiness.js';
import {
  detachServiceInstallationReconcilerOwner,
} from './shared/service-installation-reconciler-setup.js';

const {
  JOINING_UNIFIED_RECONCILE,
  SERVICE_DESCRIPTOR_FIELD,
  UNIFIED_SERVICE_TYPE,
  _formatLeaderMetadataDetails,
  _parseBootstrapError,
  _resolveSeedContactRetryAfterMs,
  assertCritical,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningReplicaDescriptorCoordination extends NodeJoiningAdmissionReadiness {
  /**
   * Phase 1: Contact seed node via HTTP.
   * @return {Promise<void>}
   * @private
   */
  async phaseContactSeed() {
    return this.contactSeedPhase.phaseContactSeed();
  }
  /**
   * Resolve bounded retry policy for join-time HTTP operations.
   * @return {Object}
   * @private
   */
  resolveJoinRetryPolicy() {
    return this.contactSeedPhase.resolveJoinRetryPolicy();
  }
  /**
   * Classify one seed contact failure for retry/backoff behavior.
   * @param {Error} error
   * @param {string} retryableTimeoutErrorMessage
   * @return {Object}
   * @private
   */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    return this.contactSeedPhase.classifySeedContactFailure(
      error,
      retryableTimeoutErrorMessage,
    );
  }
  /**
   * Compute retry delay using bootstrap hints + bounded jitter.
   * @param {Object} options
   * @param {number} options.baseDelayMs
   * @param {number} options.maxDelayMs
   * @param {number|null} options.retryAfterMs
   * @return {number}
   * @private
   */
  computeSeedContactRetryDelayMs(options = {}) {
    return this.contactSeedPhase.computeSeedContactRetryDelayMs(options);
  }
  /**
   * Apply bounded symmetric jitter to one retry delay.
   * @param {number} delayMs
   * @param {number} maxDelayMs
   * @return {number}
   * @private
   */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    return this.contactSeedPhase.applySeedContactRetryJitter(
      delayMs,
      maxDelayMs,
    );
  }
  /**
   * Resolve retry hint (ms) from parsed body and transport metadata.
   * @param {Error} error
   * @param {Object|null} parsedError
   * @return {number|null}
   * @private
   */
  resolveSeedContactRetryAfterMs(error, parsedError) {
    return _resolveSeedContactRetryAfterMs(error, parsedError);
  }
  /**
   * Parse bootstrap HTTP error bodies from the default HTTP client.
   * @param {Error} error
   * @return {Object|null}
   * @private
   */
  parseBootstrapError(error) {
    return _parseBootstrapError(error);
  }
  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response
   * @return {string}
   * @private
   */
  buildBootstrapFailureError(response) {
    return this.contactSeedPhase.buildBootstrapFailureError(response);
  }
  /**
   * Format leader metadata details for error reporting.
   * @param {Object} details
   * @return {string}
   * @private
   */
  formatLeaderMetadataDetails(details) {
    return _formatLeaderMetadataDetails(details);
  }
  /**
   * Build a canonical descriptor for join-managed unified lifecycle replicas.
   * @param {string} serviceType
   * @param {string} serviceId
   * @return {Object}
   * @private
   */
  createJoinServiceDescriptor(serviceType, serviceId) {
    return {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: this.nodeId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: 1,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
        JOINING_UNIFIED_RECONCILE.RUNTIME_KIND,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null,
    };
  }
  /**
   * Queue one join replica for desired-state reconciliation.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   * @private
   */
  queueJoinServiceReplica(descriptor, options) {
    const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    this.joinDesiredServiceDefinitions.set(serviceId, descriptor);
    this.joinReplicaOptionsByServiceId.set(serviceId, options);
  }
  /**
   * Resolve join replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   * @private
   */
  resolveJoinReplicaOptions(serviceId, serviceType) {
    const options = this.joinReplicaOptionsByServiceId.get(serviceId) || null;
    assertCritical(options, `Missing join replica options for ${serviceId}`);
    assertCritical(
      options.serviceType === serviceType,
      `Join replica type mismatch for ${serviceId}: expected ${serviceType}`,
    );
    return options;
  }
  /**
   * Build local actual-state rows for join reconciliation.
   * @return {Object[]}
   * @private
   */
  buildJoinActualStateRows() {
    if (!this.serviceLifecycleManager) {
      return [];
    }
    const rows = [];
    for (const replicaId of this.messageGroupServices.keys()) {
      const handle = this.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }
    for (const [replicaId, partition] of this.partitionServices.entries()) {
      if (partition?.initialized === false) {
        continue;
      }
      const handle = this.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }
    return rows;
  }
  /**
   * Initialize unified lifecycle owners for join-time service startup.
   * @return {Promise<void>}
   * @private
   */
  async initializeJoiningLifecycleOwners() {
    await this.startupServiceLifecycleOwner.ensureOwners();
  }
  /**
   * Trigger one join reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async triggerJoinReconciler(reason) {
    await this.startupServiceLifecycleOwner.triggerReconciler(reason);
  }
  /**
   * Stop unified lifecycle owners and clear join desired-state catalogs.
   * @return {void}
   * @private
   */
  stopJoiningLifecycleOwners() {
    detachServiceInstallationReconcilerOwner(this);
    this.startupServiceLifecycleOwner.stopOwners();
  }
  /**
   * Unified lifecycle create hook for join message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createJoinMessageGroupReplica(context) {
    return this.createMessageGroupPhase.createJoinMessageGroupReplica(context);
  }
  /**
   * Unified lifecycle create hook for join partition replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
}

export {NodeJoiningReplicaDescriptorCoordination};
