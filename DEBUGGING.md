# Debugging Guide

This guide documents how to debug and troubleshoot issues in the distributed database system. It covers query tracing, common failure patterns, and how to use correlation IDs for distributed tracing.

## Overview

The distributed database uses several key mechanisms for debugging:

1. **Correlation IDs** - Unique identifiers that flow through all distributed operations
2. **Structured Logging** - Consistent log format with subsystem tags
3. **System Cache** - In-memory view of cluster state for diagnostics
4. **Phase State Machines** - Track bootstrap and operation progress

## Query Tracing Flow

Understanding how queries flow through the system is essential for debugging.

### Query Execution Path

```
Client SQL Query
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ SQLQueryEngine (src/query/sql-query-engine.js)                          │
│ - Parses SQL statement                                                   │
│ - Generates correlationId if not present                                 │
│ - Logs: "Executing SQL query" with correlationId                         │
└────────────────────────────────────────────────────────────────────────┬─┘
                                                                         │
       ▼                                                                 │
┌──────────────────────────────────────────────────────────────────────────┐
│ SystemTableCache (src/cache/system-table-cache.js)                      │
│ - Looks up table metadata                                                │
│ - Finds partition IDs for the table                                      │
│ - Logs: "Resolved partitions for SELECT/INSERT/UPDATE/DELETE"            │
└────────────────────────────────────────────────────────────────────────┬─┘
                                                                         │
       ▼                                                                 │
┌──────────────────────────────────────────────────────────────────────────┐
│ QueryRouter (src/query/query-router.js)                                 │
│ - Finds service candidates for partition                                 │
│ - Handles retry logic with exponential backoff                           │
│ - Follows leader redirects                                               │
│ - Logs: "Routing message to partition" with correlationId                │
└────────────────────────────────────────────────────────────────────────┬─┘
                                                                         │
       ▼                                                                 │
┌──────────────────────────────────────────────────────────────────────────┐
│ MessageRouter (src/transport/message-router.js)                         │
│ - Delivers message to target service                                     │
│ - Enriches message with correlationId                                    │
│ - Logs: "Sending message" and "Message received" with correlationId      │
└────────────────────────────────────────────────────────────────────────┬─┘
                                                                         │
       ▼                                                                 │
┌──────────────────────────────────────────────────────────────────────────┐
│ PartitionService (src/partition/partition-service.js)                   │
│ - Executes query on SQLite                                               │
│ - Generates CDC events for writes                                        │
│ - Returns results with correlationId                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Tracing a Query with Correlation ID

1. **Find the correlation ID** in client logs or response:
   ```json
   {
     "success": true,
     "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
     "rows": [...]
   }
   ```

2. **Search logs** for that correlation ID:
   ```bash
   grep "a1b2c3d4-e5f6-7890-abcd-ef1234567890" logs/*.log
   ```

3. **Follow the flow** through components:
   - `sql-query-engine`: Query parsing and routing decision
   - `query-router`: Partition selection and retry attempts
   - `router`: Message delivery to partition service
   - `partition`: Query execution and result generation

### Key Log Messages in Query Flow

| Subsystem | Message | Meaning |
|-----------|---------|---------|
| `sql-query-engine` | "Executing SQL query" | Query received and being processed |
| `sql-query-engine` | "Resolved partitions for SELECT" | Partitions identified for query |
| `query-router` | "Routing message to partition" | Starting route to partition |
| `query-router` | "Following leader redirect" | Follower redirected to leader |
| `query-router` | "Retry attempt" | Retrying after transient failure |
| `query-router` | "Route succeeded" | Successfully delivered to partition |
| `router` | "Sending message" | Message being sent via WebSocket |
| `partition` | "Query execution" | Query running on partition |

## Common Failure Patterns

### 1. No Leader Available

**Symptom:**
```
Error: No service candidates found for partition partition-users-p1
```

**Cause:** 
- Raft election in progress
- Network partition isolating leader
- All replicas for partition are down

**Diagnosis:**
1. Check services table for partition replicas:
   ```javascript
   systemCache.filter('services', s => 
     s.partition_id === 'partition-users-p1'
   );
   ```

2. Look for `raft_role` values:
   - All `follower` or `candidate` = election in progress
   - No entries = partition not created or all replicas failed

3. Check for recent leadership changes in logs:
   ```
   grep "Raft election started" logs/*.log
   grep "Leadership established" logs/*.log
   ```

**Resolution:**
- Wait for election to complete (typically 1-3 seconds)
- If persistent, check node connectivity
- Verify partition replicas are running

### 2. Query Timeout

**Symptom:**
```
Error: Routing to partition partition-orders-p1 timed out after 30000ms
```

**Cause:**
- Leader unreachable or overloaded
- Network latency exceeding timeout
- Partition service not responding

**Diagnosis:**
1. Check if leader is reachable:
   ```javascript
   const leader = systemCache.filter('services', s =>
     s.partition_id === 'partition-orders-p1' &&
     s.raft_role === 'leader'
   )[0];
   console.log('Leader address:', leader?.address);
   ```

2. Verify node connectivity:
   ```javascript
   messageRouter.pingNode(leader.node_id);
   ```

3. Check partition service logs for errors

**Resolution:**
- Increase timeout if queries are legitimately slow
- Check for resource exhaustion on leader node
- Verify network connectivity between nodes

### 3. Leader Redirect Loop

**Symptom:**
```
Error: Failed to route to partition partition-data-p1 after 5 attempts
```
With logs showing repeated "Following leader redirect" messages.

**Cause:**
- Stale cache entries pointing to old leader
- Rapid leadership changes during election storm
- Split-brain scenario (rare)

**Diagnosis:**
1. Check redirect addresses in logs:
   ```
   grep "Following leader redirect" logs/*.log | grep "partition-data-p1"
   ```

2. Compare with current services table:
   ```javascript
   systemCache.filter('services', s =>
     s.partition_id === 'partition-data-p1'
   ).map(s => ({
     address: s.address,
     role: s.raft_role,
     nodeId: s.node_id
   }));
   ```

3. Look for CDC event delays

**Resolution:**
- Wait for cache to sync via CDC events
- Check CDC integration service is running
- Verify message group connectivity

### 4. Cross-Partition Transaction Error

**Symptom:**
```
Error: Cross-partition transactions are not supported. INSERT affects multiple partitions.
```

**Cause:**
- Transaction started on one partition, operation targets different partition
- Multi-row INSERT/UPDATE/DELETE spanning partition boundaries

**Diagnosis:**
1. Check which partition the transaction is bound to:
   ```javascript
   // In transaction context
   console.log('Transaction partition:', session.transactionPartitionId);
   ```

2. Determine target partition for the operation:
   ```javascript
   // Check partition key derivation
   const partitionId = partitionResolver.resolvePartition(tableName, keyValue);
   ```

**Resolution:**
- Ensure all operations in a transaction target the same partition
- Use partition key in WHERE clause to target specific partition
- Split into multiple single-partition transactions if needed

### 5. System Cache Not Available

**Symptom:**
```
Error: System cache not available for table: users
```

**Cause:**
- Cache not yet hydrated (during bootstrap)
- CDC events not being received
- Table not registered in system tables

**Diagnosis:**
1. Check cache hydration status:
   ```javascript
   systemCache.isHydrated();
   systemCache.getAll('tables');
   ```

2. Verify CDC integration service:
   ```javascript
   cdcIntegrationService.getState();
   ```

3. Check if table exists:
   ```javascript
   systemCache.get('tables', 'users');
   ```

**Resolution:**
- Wait for bootstrap to complete
- Check CDC subscription is active
- Verify table was created successfully

### 6. Message Router Connection Failed

**Symptom:**
```
Error: Connection refused to ws://node-2:8080
```

**Cause:**
- Target node is down
- WebSocket server not started
- Firewall blocking connection

**Diagnosis:**
1. Check node status in system cache:
   ```javascript
   systemCache.get('nodes', 'node-2');
   ```

2. Verify WebSocket server is running:
   ```javascript
   messageRouter.getStats();
   ```

3. Check connection state:
   ```javascript
   messageRouter.getConnectionState('node-2');
   ```

**Resolution:**
- Verify target node is running
- Check WebSocket port is accessible
- Review firewall rules

## Key Log Messages

This table documents important log messages across all subsystems. Use these to understand system behavior and diagnose issues.

### Bootstrap and Initialization

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `bootstrap` | "System cache hydrated from bootstrap response" | INFO | Cache populated with initial cluster state | Normal startup |
| `bootstrap` | "Bootstrap response missing systemTableSnapshots" | WARN | Seed node response incomplete | Check seed node health |
| `bootstrap` | "Node registered in cluster" | INFO | Node successfully joined cluster | Normal startup |
| `bootstrap` | "Failed to register node in cluster" | ERROR | Node join failed | Check network, seed node |
| `bootstrap` | "CDC subscriptions registered" | INFO | Node receiving cluster updates | Normal startup |
| `bootstrap` | "Node endpoint registered" | INFO | Node's endpoint available for routing | Normal startup |

### Raft and Leadership

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `message-group` | "Became leader" | INFO | Raft replica won election | Normal operation |
| `message-group` | "Single replica - becoming leader immediately" | INFO | Solo replica auto-promoted | Normal for single-node |
| `message-group` | "Initializing message group service" | INFO | Raft group starting | Normal startup |
| `message-group` | "Message group service initialized" | INFO | Raft group ready | Normal startup |
| `message-group` | "Starting Raft election timer" | INFO | Election timeout started | Normal operation |
| `message-group` | "Shutting down message group service" | INFO | Clean shutdown initiated | Normal shutdown |
| `raft-replica` | "Shutting down raft replica" | INFO | Raft replica stopping | Normal shutdown |

### Query Routing

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `sql-query-engine` | "Executing SQL query" | DEBUG | Query received and processing | Normal operation |
| `sql-query-engine` | "Resolved partitions for SELECT" | DEBUG | Partitions identified for query | Normal operation |
| `query-router` | "Routing message to partition" | DEBUG | Starting route to partition | Normal operation |
| `query-router` | "Following leader redirect" | DEBUG | Follower redirected to leader | Normal, will retry |
| `query-router` | "Retry attempt" | DEBUG | Retrying after transient failure | Check if persistent |
| `query-router` | "Route succeeded" | DEBUG | Successfully delivered to partition | Normal operation |

### Message Routing

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `router` | "Sending message" | DEBUG | Message being sent via WebSocket | Normal operation |
| `router` | "Failed to parse message" | ERROR | Invalid message format received | Check sender |
| `message-group` | "Failed to send message" | ERROR | Message delivery failed | Check connectivity |
| `message-group` | "Failed to send Raft response" | ERROR | Raft protocol error | Check network |
| `message-group` | "Error processing received message" | ERROR | Message handler failed | Check message format |
| `message-handler` | "Unknown message type received" | WARN | Unregistered handler | Check message type |
| `message-handler` | "Registered message handler" | DEBUG | Handler added to registry | Normal startup |

### CDC and Replication

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `cdc-integration` | "Bootstrap mode enabled" | INFO | Direct partition writes active | Normal during bootstrap |
| `cdc-integration` | "Bootstrap mode disabled" | INFO | Normal routing restored | Normal after bootstrap |
| `cdc-integration` | "CDCIntegrationService upgraded to normal mode" | INFO | CDC service fully operational | Normal startup |
| `cdc-handler` | "CDC handler initialized" | DEBUG | CDC processing ready | Normal startup |
| `cdc-handler` | "Subscribed to CDC" | DEBUG | Table subscription active | Normal operation |
| `cdc-handler` | "Out-of-order CDC event detected" | WARN | Event ordering issue | Check HLC clocks |
| `cdc-handler` | "Failed to apply CDC event" | ERROR | CDC event processing failed | Check event format |
| `cdc-handler` | "Duplicate CDC event ignored" | DEBUG | Idempotent handling | Normal operation |

### Rebalancer

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `rebalancer` | "Rebalancer initialized" | INFO | Rebalancer ready | Normal startup |
| `rebalancer` | "Became leader, starting rebalancing scheduler" | INFO | This node controls rebalancing | Normal operation |
| `rebalancer` | "Lost leadership, stopping rebalancing scheduler" | INFO | Another node took over | Normal operation |
| `rebalancer` | "Starting rebalancing" | INFO | Rebalance operation beginning | Normal operation |
| `rebalancer` | "No rebalancing needed" | DEBUG | Cluster is balanced | Normal operation |
| `rebalancer` | "Critical rebalancing state detected" | WARN | Under-replicated partitions | Check node health |
| `rebalancer` | "Suboptimal rebalancing state detected" | INFO | Imbalance detected | Will auto-correct |
| `rebalancer` | "Waiting for stabilization period" | DEBUG | Delaying to prevent thrashing | Normal operation |
| `rebalancer` | "Skipping move for unready node" | WARN | Target node not ready | Check node status |
| `rebalancer` | "Failed to execute move" | ERROR | Replica operation failed | Check target node |
| `rebalance-coordinator` | "Creating operation" | INFO | New replica operation started | Normal operation |
| `rebalance-coordinator` | "Operation completed" | INFO | Replica operation succeeded | Normal operation |
| `rebalance-coordinator` | "Operation failed" | ERROR | Replica operation failed | Check error details |
| `rebalance-coordinator` | "Operation timed out" | WARN | Operation exceeded timeout | Check target node |
| `rebalance-coordinator` | "Recovery process completed" | INFO | Recovered from coordinator restart | Normal after restart |

### Message Retry

| Subsystem | Message | Level | Meaning | Action |
|-----------|---------|-------|---------|--------|
| `message-retry` | "Starting retry execution" | DEBUG | Retry sequence beginning | Normal operation |
| `message-retry` | "Delivery succeeded" | DEBUG | Message delivered after retry | Normal operation |
| `message-retry` | "Delivery attempt failed" | DEBUG | Single attempt failed | Will retry |
| `message-retry` | "Switching to alternative replica" | DEBUG | Trying different replica | Normal failover |
| `message-retry` | "Max retries exceeded" | WARN | All retry attempts failed | Check target health |

## Critical State to Check

When diagnosing issues, check these key pieces of state:

### System Cache State

The system cache is the primary source of truth for cluster state on each node.

```javascript
// All registered nodes - check for expected node count
const nodes = systemCache.getAll('nodes');
console.log('Total nodes:', nodes.length);
console.log('Node IDs:', nodes.map(n => n.node_id));

// Check node status
nodes.forEach(node => {
  console.log(`Node ${node.node_id}: status=${node.status}, address=${node.address}`);
});

// All partition services with their roles
const partitionServices = systemCache.getAll('services').filter(s => 
  s.service_type === 'partition'
);

// Group by partition to see replica distribution
const byPartition = {};
partitionServices.forEach(s => {
  if (!byPartition[s.partition_id]) {
    byPartition[s.partition_id] = [];
  }
  byPartition[s.partition_id].push({
    nodeId: s.node_id,
    role: s.raft_role,
    address: s.address,
  });
});
console.log('Partition distribution:', JSON.stringify(byPartition, null, 2));

// Find partitions without leaders (critical issue)
const leaderless = Object.entries(byPartition)
  .filter(([_, replicas]) => !replicas.some(r => r.role === 'leader'))
  .map(([partitionId]) => partitionId);
if (leaderless.length > 0) {
  console.error('CRITICAL: Partitions without leaders:', leaderless);
}

// All tables and their partition counts
const tables = systemCache.getAll('tables');
tables.forEach(t => {
  console.log(`Table ${t.table_name}: partitions=${t.partition_count}`);
});

// Pending replica operations - check for stuck operations
const replicaOps = systemCache.getAll('replica_operations');
const pendingOps = replicaOps.filter(op => 
  op.status !== 'completed' && op.status !== 'failed'
);
if (pendingOps.length > 0) {
  console.log('Pending replica operations:', pendingOps);
}
```

### Checking for Under-Replicated Partitions

```javascript
// Get expected replica count from table policy
const tablePolicy = tablePolicyService.getPolicy(tableName);
const expectedReplicas = tablePolicy?.replicaCount || 3;

// Count actual replicas per partition
const partitionReplicas = systemCache.getAll('services')
  .filter(s => s.service_type === 'partition')
  .reduce((acc, s) => {
    acc[s.partition_id] = (acc[s.partition_id] || 0) + 1;
    return acc;
  }, {});

// Find under-replicated partitions
const underReplicated = Object.entries(partitionReplicas)
  .filter(([_, count]) => count < expectedReplicas)
  .map(([partitionId, count]) => ({partitionId, count, expected: expectedReplicas}));

if (underReplicated.length > 0) {
  console.warn('Under-replicated partitions:', underReplicated);
}
```

### Message Router State

The message router handles all inter-node communication.

```javascript
// Router statistics - overview of connectivity
const stats = messageRouter.getStats();
console.log('Connected nodes:', stats.connectedNodes);
console.log('Registered handlers:', stats.handlers);
console.log('Pending messages:', stats.pendingMessages);

// Check connection states for all nodes
for (const nodeId of stats.connectedNodes) {
  const state = messageRouter.getConnectionState(nodeId);
  console.log(`Connection to ${nodeId}:`, state);
}

// Identify disconnected nodes
const allNodeIds = systemCache.getAll('nodes').map(n => n.node_id);
const disconnected = allNodeIds.filter(id => 
  !stats.connectedNodes.includes(id)
);
if (disconnected.length > 0) {
  console.warn('Disconnected nodes:', disconnected);
}

// Check for message delivery issues
if (stats.pendingMessages > 100) {
  console.warn('High pending message count - possible delivery issues');
}
```

### Partition Service State

Check individual partition services for Raft state and health.

```javascript
// For a specific partition service
const partitionService = partitionServices.get('partition-users-p1');

// Basic state
console.log('Raft role:', partitionService.getRaftRole());
console.log('Is leader:', partitionService.isLeader());
console.log('Commit index:', partitionService.getCommitIndex());

// Check if partition is healthy
const isHealthy = partitionService.isLeader() || 
  partitionService.getRaftRole() === 'follower';
console.log('Partition healthy:', isHealthy);

// For all local partitions - find any in bad state
for (const [partitionId, service] of partitionServices) {
  const role = service.getRaftRole();
  if (role === 'candidate') {
    console.warn(`Partition ${partitionId} stuck in candidate state`);
  }
}
```

### Rebalancer State

Check rebalancer status when replica distribution seems wrong.

```javascript
// Check if rebalancer is active (only leader runs rebalancing)
const rebalancer = unifiedRebalancer;
console.log('Is leader:', rebalancer.isLeader);
console.log('Is stabilized:', rebalancer.isStabilized());
console.log('Time until stabilized:', rebalancer.getTimeUntilStabilized());

// Get current replica distribution
const currentReplicas = rebalancer.getCurrentReplicas();
console.log('Current replicas:', currentReplicas.length);

// Check for pending moves
const pendingMoves = rebalancer.getPendingMoves?.() || [];
if (pendingMoves.length > 0) {
  console.log('Pending moves:', pendingMoves);
}
```

### CDC Integration State

Check CDC service for replication health.

```javascript
// CDC integration service state
const cdcState = cdcIntegrationService.getState();
console.log('CDC mode:', cdcState.mode);
console.log('Bootstrap mode:', cdcState.bootstrapMode);
console.log('Subscriptions:', cdcState.subscriptions);

// Check if CDC is receiving events
const cdcStats = cdcIntegrationService.getStats?.();
if (cdcStats) {
  console.log('Events processed:', cdcStats.eventsProcessed);
  console.log('Events pending:', cdcStats.eventsPending);
}
```

### Diagnosing Common Issues

#### Issue: Queries timing out

```javascript
// 1. Check if partition has a leader
const partitionId = 'partition-users-p1';
const services = systemCache.filter('services', s => 
  s.partition_id === partitionId
);
const leader = services.find(s => s.raft_role === 'leader');
if (!leader) {
  console.error('No leader for partition - election may be in progress');
}

// 2. Check if leader node is reachable
if (leader) {
  const nodeStatus = systemCache.get('nodes', leader.node_id);
  console.log('Leader node status:', nodeStatus?.status);
  
  const connState = messageRouter.getConnectionState(leader.node_id);
  console.log('Connection to leader:', connState);
}
```

#### Issue: Cluster not rebalancing

```javascript
// 1. Check if any node is the rebalancer leader
// (Only one node runs rebalancing at a time)

// 2. Check stabilization period
const timeUntilStable = rebalancer.getTimeUntilStabilized();
if (timeUntilStable > 0) {
  console.log(`Waiting ${timeUntilStable}ms for stabilization`);
}

// 3. Check for stuck operations
const ops = systemCache.getAll('replica_operations');
const stuck = ops.filter(op => {
  const age = Date.now() - new Date(op.created_at).getTime();
  return op.status === 'pending' && age > 60000; // > 1 minute
});
if (stuck.length > 0) {
  console.warn('Stuck operations:', stuck);
}
```

#### Issue: CDC events not propagating

```javascript
// 1. Check CDC subscriptions
const subscriptions = cdcIntegrationService.getSubscriptions?.();
console.log('Active subscriptions:', subscriptions);

// 2. Check message group health (CDC uses message groups)
const messageGroups = systemCache.getAll('services')
  .filter(s => s.service_type === 'message_group');
const mgLeaders = messageGroups.filter(s => s.raft_role === 'leader');
console.log('Message group leaders:', mgLeaders.length);

// 3. Check for CDC handler errors in logs
// grep "Failed to apply CDC event" logs/*.log
```

## Using Correlation IDs for Tracing

Correlation IDs are unique identifiers that flow through all distributed operations, enabling end-to-end request tracing across nodes and components.

### How Correlation IDs Work

1. **Generation**: When a request enters the system without a correlationId, one is generated:
   ```javascript
   // src/utils/correlation.js
   import {generateCorrelationId, withCorrelationId, getOrCreateCorrelationId} from './utils/correlation.js';
   
   const correlationId = generateCorrelationId(); // UUID v4
   ```

2. **Propagation**: The correlationId flows through all components:
   ```javascript
   // Message enrichment - adds correlationId to any message
   const enrichedMessage = withCorrelationId(message, correlationId);
   
   // Get existing or create new - useful for handlers
   const id = getOrCreateCorrelationId(incomingMessage);
   ```

3. **Logging**: All log messages include the correlationId:
   ```javascript
   logger.info('Processing query', { correlationId, sql });
   ```

4. **Response**: The correlationId is returned in responses:
   ```javascript
   return { success: true, correlationId, rows };
   ```

### Using the Correlation Utilities

The `src/utils/correlation.js` module provides three main functions:

```javascript
import {
  generateCorrelationId,
  getOrCreateCorrelationId,
  withCorrelationId,
  CORRELATION_HEADER,
} from './utils/correlation.js';

// Generate a new correlation ID (UUID v4)
const newId = generateCorrelationId();
// Result: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

// Get existing ID from message or create new one
const message = { type: 'query', sql: 'SELECT * FROM users' };
const id = getOrCreateCorrelationId(message);
// Result: new UUID (message had no correlationId)

const messageWithId = { type: 'query', correlationId: 'existing-id' };
const existingId = getOrCreateCorrelationId(messageWithId);
// Result: "existing-id" (preserved)

// Create new message with correlation ID
const enriched = withCorrelationId(message, 'my-correlation-id');
// Result: { type: 'query', sql: '...', correlationId: 'my-correlation-id' }

// HTTP header for external API propagation
console.log(CORRELATION_HEADER); // "x-correlation-id"
```

### Example: Tracing a Successful Query

This example shows a complete trace of a successful SELECT query across multiple nodes.

1. **Client sends query:**
   ```javascript
   const result = await queryEngine.execute(
     'SELECT * FROM users WHERE id = 1',
     [],
     { correlationId: 'trace-001-abc' }  // Optional: client-provided ID
   );
   ```

2. **Search logs for the correlation ID:**
   ```bash
   grep "trace-001-abc" logs/*.log | sort -t: -k2
   ```

3. **Trace output showing successful flow:**
   ```
   10:00:00.100 [sql-query-engine] Executing SQL query correlationId=trace-001-abc sql="SELECT * FROM users WHERE id = 1"
   10:00:00.102 [sql-query-engine] Resolved partitions correlationId=trace-001-abc table=users partitions=[partition-users-p1]
   10:00:00.105 [query-router] Routing message to partition correlationId=trace-001-abc partition=partition-users-p1
   10:00:00.106 [query-router] Found service candidates correlationId=trace-001-abc candidates=["node-2:8080","node-3:8080"]
   10:00:00.108 [router] Sending message correlationId=trace-001-abc target=node-2:8080 type=query
   10:00:00.115 [partition] Query execution correlationId=trace-001-abc partition=partition-users-p1 rows=1
   10:00:00.118 [router] Message received correlationId=trace-001-abc source=node-2:8080 type=query-response
   10:00:00.120 [query-router] Route succeeded correlationId=trace-001-abc partition=partition-users-p1 duration=15ms
   10:00:00.122 [sql-query-engine] Query completed correlationId=trace-001-abc rows=1 duration=22ms
   ```

4. **Interpret the trace:**
   - Query entered at 10:00:00.100
   - Partition resolved in 2ms
   - Routed to node-2 (leader for partition-users-p1)
   - Partition executed query in ~7ms
   - Total round-trip: 22ms

### Example: Tracing a Failed Query

1. **Client receives error:**
   ```json
   {
     "success": false,
     "error": "Query timeout",
     "correlationId": "abc123-def456-789"
   }
   ```

2. **Search logs for correlation ID:**
   ```bash
   grep "abc123-def456-789" logs/*.log | sort -t: -k2
   ```

3. **Typical trace output:**
   ```
   10:00:00.100 [sql-query-engine] Executing SQL query correlationId=abc123-def456-789
   10:00:00.105 [sql-query-engine] Resolved partitions correlationId=abc123-def456-789 partitions=[p1,p2]
   10:00:00.110 [query-router] Routing to partition correlationId=abc123-def456-789 partition=p1
   10:00:00.115 [router] Sending message correlationId=abc123-def456-789 target=node-2
   10:00:30.115 [query-router] Timeout exceeded correlationId=abc123-def456-789 elapsed=30000ms
   ```

4. **Identify the issue:** The 30-second gap between sending and timeout indicates the target node didn't respond.

### Example: Tracing a Leader Redirect

When a query is sent to a follower, it redirects to the leader. The correlation ID tracks this:

```
10:00:00.100 [query-router] Routing message to partition correlationId=redirect-trace-123 partition=partition-orders-p1
10:00:00.105 [router] Sending message correlationId=redirect-trace-123 target=node-2:8080
10:00:00.120 [query-router] Following leader redirect correlationId=redirect-trace-123 from=node-2:8080 to=node-3:8080
10:00:00.125 [router] Sending message correlationId=redirect-trace-123 target=node-3:8080
10:00:00.140 [query-router] Route succeeded correlationId=redirect-trace-123 partition=partition-orders-p1 attempts=2
```

**Interpretation:** The query was initially sent to node-2 (a follower), which redirected to node-3 (the leader). The same correlation ID tracks both attempts.

### Example: Tracing Cross-Partition Operations

For queries that span multiple partitions, the correlation ID links all partition operations:

```
10:00:00.100 [sql-query-engine] Executing SQL query correlationId=multi-part-456 sql="SELECT * FROM orders"
10:00:00.105 [sql-query-engine] Resolved partitions correlationId=multi-part-456 partitions=[p1,p2,p3]
10:00:00.110 [query-router] Routing message to partition correlationId=multi-part-456 partition=p1
10:00:00.110 [query-router] Routing message to partition correlationId=multi-part-456 partition=p2
10:00:00.110 [query-router] Routing message to partition correlationId=multi-part-456 partition=p3
10:00:00.150 [query-router] Route succeeded correlationId=multi-part-456 partition=p1 rows=10
10:00:00.155 [query-router] Route succeeded correlationId=multi-part-456 partition=p3 rows=8
10:00:00.160 [query-router] Route succeeded correlationId=multi-part-456 partition=p2 rows=12
10:00:00.165 [sql-query-engine] Query completed correlationId=multi-part-456 totalRows=30 duration=65ms
```

**Interpretation:** The query was executed in parallel across 3 partitions. All operations share the same correlation ID, making it easy to see the complete picture.

### Debugging with Correlation IDs

#### Finding Related Operations

```bash
# Find all log entries for a correlation ID across all nodes
grep "abc123-def456" logs/node-*.log | sort -t: -k2

# Find errors for a specific correlation ID
grep "abc123-def456" logs/*.log | grep -i "error\|failed\|timeout"

# Count operations per component
grep "abc123-def456" logs/*.log | cut -d'[' -f2 | cut -d']' -f1 | sort | uniq -c
```

#### Programmatic Tracing

```javascript
// Enable verbose logging for a specific correlation ID
const DEBUG_CORRELATION_ID = 'abc123-def456';

function debugLog(correlationId, message, data) {
  if (correlationId === DEBUG_CORRELATION_ID) {
    console.log(`[DEBUG] ${message}`, JSON.stringify(data, null, 2));
  }
}
```

### Correlation ID Best Practices

- **Always include in client requests** when possible for end-to-end tracing
- **Log at component boundaries** (entry and exit points)
- **Include in error responses** for debugging failed requests
- **Use structured logging** to make correlation IDs searchable
- **Preserve correlation IDs** when forwarding messages between components
- **Generate early** - create the correlation ID at the entry point, not deep in the call stack
- **Include in metrics** - tag performance metrics with correlation IDs for detailed analysis

## Related Files

| File | Purpose |
|------|---------|
| `src/utils/correlation.js` | Correlation ID utilities |
| `src/query/query-router.js` | Query routing with retry logic |
| `src/query/query-executor.js` | Parallel query execution |
| `src/transport/message-router.js` | Message delivery and routing |
| `src/partition/partition-service.js` | Partition query execution |
| `src/system-cache/system-table-cache.js` | System state cache |
| `src/query/query-constants.js` | Error messages and defaults |

## See Also

- [architecture.md](./architecture.md) - System architecture overview
- [src/constants/README.md](./src/constants/README.md) - Constants naming conventions
