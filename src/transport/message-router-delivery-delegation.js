import {
  deliver,
  deliverLocal,
  deliverRemote,
  getConnectedNodes,
  getConnectionState,
  getConnectionHandoffDiagnostics,
  hasSelfConnection,
  isRegistered,
  getRegisteredAddresses,
  resolveRecoverableDeliveryError,
  sendMessage,
  sendRaw,
  tryDeliverRaftDirect,
} from './message-router-delivery-behaviors.js';
import {pingNode} from './message-router-peer-liveness.js';
import {
  armReconnectAfterConnectFailure,
  buildColdReconnectBudgetFailure,
  buildConnectionClosedError,
  buildDeferredDeliveryFailure,
  buildReconnectInProgressFailure,
  clearReconnectAddressSuppression,
  ensureNodeConnection,
  ensureReconnectOwnerConnection,
  getReconnectAddressSuppressionKey,
  hasScheduledReconnect,
  isReconnectAddressSuppressed,
  pruneReconnectAddressSuppressions,
  quarantineConnectionAfterAckTimeout,
  refreshReconnectAuthority,
  resolveCanonicalReconnectAddress,
  resolveNodeAddressForDelivery,
  resolveReconnectAddressCandidates,
  resolveReconnectAddresses,
  resolveReconnectRetryAfterMs,
  scheduleRetiredSocketTermination,
  shouldDeferColdReconnectForDeliveryBudget,
  shouldSuppressReconnectAddress,
  suppressReconnectAddress,
  tryDeliverAfterReconnect,
} from './message-router-reconnect-behaviors.js';

/**
 * Delivery and reconnect delegation surface for the message router: thin
 * instance-method wrappers that forward to the free-function delivery and
 * reconnect behavior modules, binding `this` as the router instance.
 */
class MessageRouterDeliveryDelegation {
  async deliverLocal(targetAddress, messageId, payload, correlationId) {
    return deliverLocal(
      this,
      targetAddress,
      messageId,
      payload,
      correlationId,
    );
  }

  async deliver(targetAddress, message, options = {}) {
    return deliver(
      this,
      targetAddress,
      message,
      options,
    );
  }

  tryDeliverRaftDirect(targetAddress, messageId, payload, targetNodeId) {
    return tryDeliverRaftDirect(
      this,
      targetAddress,
      messageId,
      payload,
      targetNodeId,
    );
  }

  async deliverRemote(
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    options = {},
  ) {
    return deliverRemote(
      this,
      targetAddress,
      messageId,
      payload,
      targetNodeId,
      correlationId,
      options,
    );
  }

  resolveNodeAddressForDelivery(targetNodeId) {
    return resolveNodeAddressForDelivery(this, targetNodeId);
  }

  resolveCanonicalReconnectAddress(targetNodeId, fallbackAddress = null) {
    return resolveCanonicalReconnectAddress(this, targetNodeId, fallbackAddress);
  }

  refreshReconnectAuthority(connectionInfo, fallbackAddress = null) {
    return refreshReconnectAuthority(this, connectionInfo, fallbackAddress);
  }

  hasScheduledReconnect(connectionInfo) {
    return hasScheduledReconnect(this, connectionInfo);
  }

  resolveReconnectRetryAfterMs(connectionInfo) {
    return resolveReconnectRetryAfterMs(this, connectionInfo);
  }

  buildConnectionClosedError(targetNodeId, options = {}) {
    return buildConnectionClosedError(this, targetNodeId, options);
  }

  buildReconnectInProgressFailure(targetNodeId, messageId, correlationId) {
    return buildReconnectInProgressFailure(
      this,
      targetNodeId,
      messageId,
      correlationId,
    );
  }

  async resolveRecoverableDeliveryError({
    error,
    targetNodeId,
    targetAddress,
    messageId,
    payload,
    correlationId,
    deliveryTimeoutMs = null,
  }) {
    return resolveRecoverableDeliveryError(this, {
      error,
      targetNodeId,
      targetAddress,
      messageId,
      payload,
      correlationId,
      deliveryTimeoutMs,
    });
  }

  getReconnectAddressSuppressionKey(targetNodeId, address) {
    return getReconnectAddressSuppressionKey(this, targetNodeId, address);
  }

  pruneReconnectAddressSuppressions(nowMs = Date.now()) {
    return pruneReconnectAddressSuppressions(this, nowMs);
  }

  isReconnectAddressSuppressed(targetNodeId, address) {
    return isReconnectAddressSuppressed(this, targetNodeId, address);
  }

  suppressReconnectAddress(targetNodeId, address) {
    return suppressReconnectAddress(this, targetNodeId, address);
  }

  clearReconnectAddressSuppression(targetNodeId, address) {
    return clearReconnectAddressSuppression(
      this,
      targetNodeId,
      address,
    );
  }

  shouldSuppressReconnectAddress(error) {
    return shouldSuppressReconnectAddress(this, error);
  }

  resolveReconnectAddresses(targetNodeId, preferredAddress = null) {
    return resolveReconnectAddresses(this, targetNodeId, preferredAddress);
  }

  resolveReconnectAddressCandidates(targetNodeId, preferredAddress = null) {
    return resolveReconnectAddressCandidates(
      this,
      targetNodeId,
      preferredAddress,
    );
  }

  ensureReconnectOwnerConnection(targetNodeId, preferredAddress = null) {
    return ensureReconnectOwnerConnection(this, targetNodeId, preferredAddress);
  }

  armReconnectAfterConnectFailure(targetNodeId, preferredAddress = null) {
    return armReconnectAfterConnectFailure(
      this,
      targetNodeId,
      preferredAddress,
    );
  }

  shouldDeferColdReconnectForDeliveryBudget(timeoutMs) {
    return shouldDeferColdReconnectForDeliveryBudget(this, timeoutMs);
  }

  buildColdReconnectBudgetFailure(
    targetNodeId,
    reconnectAddress,
    messageId,
    correlationId,
  ) {
    return buildColdReconnectBudgetFailure(
      this,
      targetNodeId,
      reconnectAddress,
      messageId,
      correlationId,
    );
  }

  async ensureNodeConnection(targetNodeId, address) {
    return ensureNodeConnection(this, targetNodeId, address);
  }

  async tryDeliverAfterReconnect(
    reconnectAddress,
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    timeoutMs = null,
  ) {
    return tryDeliverAfterReconnect(
      this,
      reconnectAddress,
      targetAddress,
      messageId,
      payload,
      targetNodeId,
      correlationId,
      timeoutMs,
    );
  }

  scheduleRetiredSocketTermination(staleWs) {
    return scheduleRetiredSocketTermination(this, staleWs);
  }

  quarantineConnectionAfterAckTimeout(
    targetNodeId,
    connection,
    messageId,
    targetAddress,
  ) {
    return quarantineConnectionAfterAckTimeout(
      this,
      targetNodeId,
      connection,
      messageId,
      targetAddress,
    );
  }

  buildDeferredDeliveryFailure(messageId, correlationId, error, options = {}) {
    return buildDeferredDeliveryFailure(
      this,
      messageId,
      correlationId,
      error,
      options,
    );
  }

  sendMessage(
    connection,
    targetAddress,
    messageId,
    payload,
    targetNodeId,
    correlationId,
    timeoutMs = null,
  ) {
    return sendMessage(
      this,
      connection,
      targetAddress,
      messageId,
      payload,
      targetNodeId,
      correlationId,
      timeoutMs,
    );
  }

  sendRaw(ws, message) {
    return sendRaw(this, ws, message);
  }

  isRegistered(address) {
    return isRegistered(this, address);
  }

  getRegisteredAddresses() {
    return getRegisteredAddresses(this);
  }

  getConnectionState(nodeId) {
    return getConnectionState(this, nodeId);
  }

  getConnectionHandoffDiagnostics(nodeId) {
    return getConnectionHandoffDiagnostics(this, nodeId);
  }

  async pingNode(nodeId, timeoutMs = null) {
    return pingNode(this, nodeId, timeoutMs);
  }

  getConnectedNodes() {
    return getConnectedNodes(this);
  }

  hasSelfConnection() {
    return hasSelfConnection(this);
  }
}

function defineMessageRouterDeliveryDelegation(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterDeliveryDelegation.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterDeliveryDelegation};
