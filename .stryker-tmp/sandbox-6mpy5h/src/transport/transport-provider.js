/**
 * TransportProvider - Base class for transport implementations.
 *
 * This is an abstract base class that defines the interface for all transport
 * providers (WebSocket, NATS, Veilid, etc.). All transport providers must
 * extend this class and implement all methods.
 *
 * The transport abstraction layer separates node identity from transport
 * mechanisms, allowing nodes to be reached via multiple transports without
 * changing their identity.
 *
 * @abstract
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
class TransportProvider {
  /**
   * Get the transport type identifier.
   *
   * Returns a string that uniquely identifies this transport type.
   * This value is used to match endpoints in the node_endpoints table
   * with the appropriate provider.
   *
   * @return {string} Transport type (e.g., 'ws', 'nats', 'veilid')
   * @throws {Error} If not implemented by subclass
   * @example
   * const provider = new WebSocketTransportProvider();
   * provider.getType(); // Returns 'ws'
   */
  getType() {
    if (stryMutAct_9fa48("159414")) {
      {}
    } else {
      stryCov_9fa48("159414");
      throw new Error(stryMutAct_9fa48("159415") ? "" : (stryCov_9fa48("159415"), 'Not implemented: getType() must be implemented by subclass'));
    }
  }

  /**
   * Check if this transport is currently available.
   *
   * Returns true if the transport provider is ready to accept new connections
   * and can be used for message delivery. This should return false if the
   * transport is shutting down, has encountered a fatal error, or is otherwise
   * unable to function.
   *
   * @return {boolean} True if transport can accept connections, false otherwise
   * @throws {Error} If not implemented by subclass
   * @example
   * if (provider.isAvailable()) {
   *   await provider.connect(endpoint);
   * }
   */
  isAvailable() {
    if (stryMutAct_9fa48("159416")) {
      {}
    } else {
      stryCov_9fa48("159416");
      throw new Error(stryMutAct_9fa48("159417") ? "" : (stryCov_9fa48("159417"), 'Not implemented: isAvailable() must be implemented by subclass'));
    }
  }

  /**
   * Connect to a remote endpoint.
   *
   * Establishes a connection to the specified endpoint. The endpoint object
   * contains transport-specific address and configuration from the
   * node_endpoints table.
   *
   * @param {Object} endpoint - Endpoint record from node_endpoints table
   * @param {string} endpoint.endpoint_id - Unique identifier for the endpoint
   * @param {string} endpoint.node_id - Target node ID
   * @param {string} endpoint.transport_type - Transport type (must match getType())
   * @param {string} endpoint.address - Transport-specific address string
   * @param {number} endpoint.priority - Endpoint priority (lower = higher preference)
   * @param {Object|string} endpoint.metadata - Transport-specific configuration
   * @param {string} endpoint.status - Endpoint status (active/inactive)
   * @return {Promise<Object>} Connection object with connection details
   * @throws {Error} If not implemented by subclass
   * @throws {Error} If connection fails
   * @example
   * const connection = await provider.connect({
   *   endpoint_id: 'ep-123',
   *   node_id: 'node-456',
   *   transport_type: 'ws',
   *   address: 'ws://192.168.1.10:8080',
   *   priority: 0,
   *   metadata: '{"tls": false}',
   *   status: 'active'
   * });
   */
  async connect(_endpoint) {
    if (stryMutAct_9fa48("159418")) {
      {}
    } else {
      stryCov_9fa48("159418");
      throw new Error(stryMutAct_9fa48("159419") ? "" : (stryCov_9fa48("159419"), 'Not implemented: connect() must be implemented by subclass'));
    }
  }

  /**
   * Send a message through an established connection.
   *
   * Sends a message to the remote node through the specified connection.
   * The method should wait for acknowledgment from the remote node before
   * resolving the promise.
   *
   * @param {Object} connection - Active connection object from connect()
   * @param {Object} message - Message to send
   * @return {Promise<Object>} Delivery result with acknowledgment status
   * @return {boolean} return.success - Whether the message was delivered
   * @return {string} [return.error] - Error message if delivery failed
   * @return {number} [return.latency] - Round-trip time in milliseconds
   * @throws {Error} If not implemented by subclass
   * @throws {Error} If send fails
   * @example
   * const result = await provider.send(connection, {
   *   type: 'service_message',
   *   payload: { action: 'ping' }
   * });
   * if (result.success) {
   *   console.log(`Message delivered in ${result.latency}ms`);
   * }
   */
  async send(_connection, _message) {
    if (stryMutAct_9fa48("159420")) {
      {}
    } else {
      stryCov_9fa48("159420");
      throw new Error(stryMutAct_9fa48("159421") ? "" : (stryCov_9fa48("159421"), 'Not implemented: send() must be implemented by subclass'));
    }
  }

  /**
   * Close a connection.
   *
   * Gracefully closes the specified connection and releases any associated
   * resources. After calling this method, the connection object should not
   * be used for further communication.
   *
   * @param {Object} connection - Connection to close
   * @return {Promise<void>}
   * @throws {Error} If not implemented by subclass
   * @example
   * await provider.disconnect(connection);
   */
  async disconnect(_connection) {
    if (stryMutAct_9fa48("159422")) {
      {}
    } else {
      stryCov_9fa48("159422");
      throw new Error(stryMutAct_9fa48("159423") ? "" : (stryCov_9fa48("159423"), 'Not implemented: disconnect() must be implemented by subclass'));
    }
  }

  /**
   * Get health status of a connection.
   *
   * Returns the current health status of the specified connection, including
   * latency metrics, connection state, and last activity timestamp.
   *
   * @param {Object} connection - Connection to check
   * @return {Object} Health status object
   * @return {string} return.state - Connection state (connected, disconnected, etc.)
   * @return {number} return.latency - Current latency in milliseconds
   * @return {number} return.lastActivity - Timestamp of last activity
   * @return {boolean} return.healthy - Whether the connection is healthy
   * @throws {Error} If not implemented by subclass
   * @example
   * const status = provider.getHealthStatus(connection);
   * if (!status.healthy) {
   *   await provider.disconnect(connection);
   * }
   */
  getHealthStatus(_connection) {
    if (stryMutAct_9fa48("159424")) {
      {}
    } else {
      stryCov_9fa48("159424");
      throw new Error(stryMutAct_9fa48("159425") ? "" : (stryCov_9fa48("159425"), 'Not implemented: getHealthStatus() must be implemented by subclass'));
    }
  }

  /**
   * Shutdown the transport provider.
   *
   * Gracefully shuts down the transport provider, closing all active
   * connections and releasing all resources. After calling this method,
   * the provider should not be used for any further operations.
   *
   * @return {Promise<void>}
   * @throws {Error} If not implemented by subclass
   * @example
   * await provider.shutdown();
   */
  async shutdown() {
    if (stryMutAct_9fa48("159426")) {
      {}
    } else {
      stryCov_9fa48("159426");
      throw new Error(stryMutAct_9fa48("159427") ? "" : (stryCov_9fa48("159427"), 'Not implemented: shutdown() must be implemented by subclass'));
    }
  }
}
export { TransportProvider };