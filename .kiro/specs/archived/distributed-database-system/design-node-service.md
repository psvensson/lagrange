# Node Service

The Node Service is the administrative component present on every node.

**Responsibilities:**
- Start, stop, and monitor other services on the node using worker thread pool
- Handle node bootstrap and discovery using `fastify` for REST API
- Provide REST API for cluster joining
- Collect and report node resource statistics (CPU, memory, disk)
- Use `pino` for structured logging of all administrative operations
- Coordinate message routing between main thread and service workers

**Interface:**
```javascript
class NodeService {
  async startService(serviceConfig)
  async stopService(serviceId)
  async getNodeStats()
  async handleBootstrapRequest(newNodeAddress)
  async joinCluster(seedNodeAddress)
  async routeServiceMessage(serviceId, message) // Thread coordination
  async getServiceHealth(serviceId) // Worker health monitoring
}
```
