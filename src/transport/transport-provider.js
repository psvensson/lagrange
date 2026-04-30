const LOCAL_STR_1USAM = 'Not implemented: getType() must be implemented by subclass';
const LOCAL_STR_1ZD75 = 'Not implemented: isAvailable() must be implemented by subclass';
const LOCAL_STR_IYU2S = 'Not implemented: connect() must be implemented by subclass';
const LOCAL_STR_7MIB3 = 'Not implemented: send() must be implemented by subclass';
const LOCAL_STR_1DV3N = 'Not implemented: disconnect() must be implemented by subclass';
const LOCAL_STR_J9281 = 'Not implemented: getHealthStatus() must be implemented by subclass';
const LOCAL_STR_EV5IX = 'Not implemented: shutdown() must be implemented by subclass';

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
    throw new Error(LOCAL_STR_1USAM);
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
    throw new Error(LOCAL_STR_1ZD75);
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
    throw new Error(LOCAL_STR_IYU2S);
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
    throw new Error(LOCAL_STR_7MIB3);
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
    throw new Error(LOCAL_STR_1DV3N);
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
    throw new Error(
      LOCAL_STR_J9281,
    );
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
    throw new Error(LOCAL_STR_EV5IX);
  }
}

export {TransportProvider};
