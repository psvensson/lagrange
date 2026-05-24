const MESSAGE_GROUP_SERVICE_FORWARDING_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

class MessageGroupServiceForwardingRuntimeMethods {
  /**
   * Resolve the current live Raft leader target without using bootstrap
   * transport hints. This lets strict system-table forwarding honor the
   * owner's current leader state without waiting for the control-plane echo.
   * @return {{serviceId: string, address: string}|null}
   * @private
   */
  resolveLiveLeaderForwardTarget() {
    return this.forwardingOwner.resolveLiveLeaderForwardTarget();
  }

  resolveCdcIngressDecision(logContext = {}, options = {}) {
    return this.forwardingOwner.resolveCdcIngressDecision(
      logContext,
      options,
    );
  }

  async resolveCdcIngressDecisionWithRepair(logContext = {}, options = {}) {
    return this.forwardingOwner.resolveCdcIngressDecisionWithRepair(
      logContext,
      options,
    );
  }

  buildCDCForwardTargets(
    cacheLeaderService,
    cacheForwardService,
    options = {},
  ) {
    return this.forwardingOwner.buildCDCForwardTargets(
      cacheLeaderService,
      cacheForwardService,
      options,
    );
  }

  shouldUseStrictCDCForwarding(logContext = {}) {
    return this.forwardingOwner.shouldUseStrictCDCForwarding(logContext);
  }

  canAcceptCDCEvent(cdcEvent = {}) {
    return this.forwardingOwner.canAcceptCDCEvent(cdcEvent);
  }

  getMetadataIngressReadiness(options = {}) {
    return this.forwardingOwner.getMetadataIngressReadiness(options);
  }

  async resolveMetadataIngressForwardSelection(options = {}) {
    return this.forwardingOwner.resolveMetadataIngressForwardSelection(
      options,
    );
  }

  async forwardMetadataIngressPayloadToLeader(payload, options = {}) {
    return this.forwardingOwner.forwardMetadataIngressPayloadToLeader(
      payload,
      options,
    );
  }

  isMetadataIngressReady(options = {}) {
    return this.forwardingOwner.isMetadataIngressReady(options);
  }

  isStrictForwardTargetEligible(target = null) {
    return this.forwardingOwner.isStrictForwardTargetEligible(target);
  }

  shouldAllowJoinConvergenceStrictTargeting() {
    return this.forwardingOwner.shouldAllowJoinConvergenceStrictTargeting();
  }

  resolveJoinConvergenceBootstrapForwardTarget() {
    return this.forwardingOwner.resolveJoinConvergenceBootstrapForwardTarget();
  }

  resolveCanonicalLeaderNodeIdFromCache() {
    return this.forwardingOwner.resolveCanonicalLeaderNodeIdFromCache();
  }

  isLocalForwardTarget(serviceId, address = null) {
    return this.forwardingOwner.isLocalForwardTarget(serviceId, address);
  }

  resolveForwardTargetNodeId(target = null) {
    return this.forwardingOwner.resolveForwardTargetNodeId(target);
  }

  isStrictForwardNodeReady(nodeId) {
    return this.forwardingOwner.isStrictForwardNodeReady(nodeId);
  }

  isStrictForwardNodeConnected(nodeId) {
    return this.forwardingOwner.isStrictForwardNodeConnected(nodeId);
  }

  getForwardTargetSuppressionKeys(target = {}) {
    return this.forwardingOwner.getForwardTargetSuppressionKeys(target);
  }

  pruneForwardTargetSuppressions(nowMs = this.now()) {
    return this.forwardingOwner.pruneForwardTargetSuppressions(nowMs);
  }

  isForwardTargetSuppressed(target = {}) {
    return this.forwardingOwner.isForwardTargetSuppressed(target);
  }

  suppressForwardTarget(target = {}) {
    return this.forwardingOwner.suppressForwardTarget(target);
  }

  clearForwardTargetSuppression(target = {}) {
    return this.forwardingOwner.clearForwardTargetSuppression(target);
  }

  shouldRepairForwardTopology(errorMessage) {
    return this.forwardingOwner.shouldRepairForwardTopology(errorMessage);
  }

  canRepairAuthoritativeForwardTopology() {
    return this.forwardingOwner.canRepairAuthoritativeForwardTopology();
  }

  async maybeRepairAuthoritativeForwardTopology(context = {}) {
    return this.forwardingOwner.maybeRepairAuthoritativeForwardTopology(
      context,
    );
  }

  async repairAuthoritativeForwardTopology(context = {}) {
    return this.forwardingOwner.repairAuthoritativeForwardTopology(context);
  }

  async applyAuthoritativeForwardTopologyRows(tableName, rows = []) {
    return this.forwardingOwner.applyAuthoritativeForwardTopologyRows(
      tableName,
      rows,
    );
  }

  async reconcileAuthoritativeForwardServiceRows(authoritativeRows = []) {
    return this.forwardingOwner.reconcileAuthoritativeForwardServiceRows(
      authoritativeRows,
    );
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }

  areForwardTopologyRowsEqual(left, right) {
    return this.forwardingOwner.areForwardTopologyRowsEqual(left, right);
  }

  shouldSuppressForwardTarget(deliveryResult, errorMessage) {
    return this.forwardingOwner.shouldSuppressForwardTarget(
      deliveryResult,
      errorMessage,
    );
  }

  isForwardTargetBackpressured(deliveryResult, errorMessage) {
    return this.forwardingOwner.isForwardTargetBackpressured(
      deliveryResult,
      errorMessage,
    );
  }

  async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
    return this.forwardingOwner.forwardCDCEventToLeader(
      tableName,
      operation,
      data,
      options,
    );
  }

  async forwardCDCBatchToLeader(events, options = {}) {
    return this.forwardingOwner.forwardCDCBatchToLeader(events, options);
  }

  async forwardCDCPayloadToLeader(payload, logContext = {}) {
    return this.forwardingOwner.forwardCDCPayloadToLeader(
      payload,
      logContext,
    );
  }
}

function defineMessageGroupServiceForwardingRuntimeMethods(prototype) {
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceForwardingRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_FORWARDING_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceForwardingRuntimeMethods};
