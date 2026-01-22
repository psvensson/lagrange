# Partition Service

Partition services store actual table data using SQLite with Raft consensus. Partition replicas communicate through message groups for all Raft consensus operations. All partition data is stored in physical SQLite files on disk (never in-memory) to ensure data persistence across restarts.

## Persistent Storage

Each partition replica stores its data in a SQLite database file on disk. The file path is determined by the configured data directory:
```
{data-dir}/partitions/{partition-id}/{replica-id}.db
```

The system creates the necessary directory structure automatically when partitions are created. SQLite WAL (Write-Ahead Logging) mode is used for better concurrency and crash recovery.

## Responsibilities

- Store and replicate table data within partition boundaries using `raft-logic` and `better-sqlite3`
- Use message groups as the transport layer for Raft consensus between replicas
- Execute SQL operations on partition data
- Generate CDC events for data changes
- Handle partition splitting and merging
- Maintain indices for the partition

## Interface

```javascript
class PartitionService {
  constructor(partitionId, tableId, partitionConfig, messageGroupTransport)
  async executeQuery(sqlQuery)
  async insertData(tableName, data)
  async updateData(tableName, whereClause, data)
  async deleteData(tableName, whereClause)
  async splitPartition(splitKey)
  async mergePartition(otherPartitionId)
  async calculatePartitionSize()
  async updatePartitionSize()
}
```

## Partition Size Tracking

Each partition tracks its data size using a hybrid approach that balances accuracy with performance:

**Write-Triggered Updates (Responsive):**
- After each write operation completes, schedule an async size update
- Debounced to maximum once per 5 seconds to avoid overhead
- Non-blocking: write operations return immediately

**Periodic Updates (Comprehensive):**
- Background process updates size every 60 seconds
- Ensures partitions with no recent writes still have current size
- Catches any missed updates from write-triggered path

```javascript
class PartitionService {
  constructor() {
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = Date.now();
    this.sizeUpdateInterval = 60000;  // 60 seconds
    this.minUpdateInterval = 5000;    // 5 seconds minimum between updates
  }
  
  async calculatePartitionSize() {
    // Query SQLite for accurate size using page statistics
    const pageInfo = this.database.prepare(`
      SELECT page_count * page_size as size_bytes 
      FROM pragma_page_count(), pragma_page_size()
    `).get();
    
    return pageInfo.size_bytes || 0;
  }

  async updatePartitionSize() {
    try {
      const sizeBytes = await this.calculatePartitionSize();
      
      // Update partitions system table via CDC
      await this.cdcIntegrationService.updateSystemTableRow('partitions', {
        partition_id: this.partitionId,
        size_bytes: sizeBytes,
        updated_at: Date.now()
      });
      
      logger.debug('Partition size updated', {
        partitionId: this.partitionId,
        sizeBytes,
        sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2)
      });
    } catch (error) {
      logger.error('Failed to update partition size', {
        partitionId: this.partitionId,
        error: error.message
      });
    }
  }
}
```

**Benefits of Hybrid Approach:**
- **Low latency**: Writes don't block on size calculation
- **Responsive**: Size updates within 5 seconds of writes
- **Accurate**: Periodic updates ensure no partition is stale
- **Efficient**: Debouncing prevents excessive overhead during write bursts
- **Reliable**: Periodic updates catch any missed write-triggered updates

**Validates: Requirements 31.5-9, 31.20**

## Raft Transport Integration

Partition replicas do not manage their own network transport. Instead, they receive a `messageGroupTransport` that implements the raft-logic transport interface but routes all messages through the message group infrastructure. This ensures:
- Location transparency (replicas work the same regardless of physical location)
- Unified message routing (all communication goes through message groups)
- Testability (tests use real message groups, not mock transports)

## System Tables Use Partition Service

**CRITICAL**: System tables (nodes, partitions, tables, services, message_groups, indices, logs, config) are implemented using PartitionService EXACTLY the same way as user tables. There is NO special-case code or alternative storage mechanism.

**What "hard-coded" means during bootstrap:**
- **Table schemas**: Column definitions, types, constraints are defined in code (not via CREATE TABLE SQL)
- **Initial IDs**: Partition IDs and replica IDs are pre-assigned to avoid circular dependency
- **Initial placement**: All replicas start on the seed node

**What "hard-coded" does NOT mean:**
- ❌ System tables do NOT use a different storage mechanism
- ❌ System tables do NOT bypass PartitionService
- ❌ System tables do NOT use plain SQLite without Raft

**Bootstrap creates system tables as:**
```javascript
// Example: Creating the 'nodes' system table during bootstrap
const nodesPartition = new PartitionService({
  partitionId: 'nodes-p1',
  tableId: 'nodes',
  tableName: 'nodes',
  schema: NODES_TABLE_SCHEMA,  // Hard-coded schema
  keyRange: { start: null, end: null },  // Full key space
  replicaCount: 3,
  replicaIds: ['nodes-p1-r1', 'nodes-p1-r2', 'nodes-p1-r3'],  // Hard-coded IDs
  nodeIds: [seedNodeId, seedNodeId, seedNodeId],  // All on seed node
  messageGroupTransport: messageGroupTransport
});

await nodesPartition.initialize();
```

This is identical to how user tables are created, except the schema comes from code instead of a CREATE TABLE statement.

**Validates: Requirements 3.2, 3.3, 3.4, 6.1**
