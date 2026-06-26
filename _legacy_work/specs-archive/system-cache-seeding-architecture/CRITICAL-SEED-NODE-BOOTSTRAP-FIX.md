# CRITICAL: Seed Node Bootstrap Direct Write Path

## Problem

The current implementation has a chicken-and-egg problem:

1. Seed node creates partition services locally
2. Seed node tries to write to system tables via `cdcIntegrationService.upsertSystemTableRow()`
3. This calls `sqlQueryEngine.executeQuery()` 
4. SQL engine calls `getTablePartitions()` which requires system cache
5. System cache is **empty** because we haven't written to it yet
6. **DEADLOCK**: Can't write without cache, can't populate cache without writing

## Root Cause

After removing bootstrap directories (Phase 3), `SQLQueryEngine.getTablePartitions()` now throws an error if the system cache is empty. But during seed node bootstrap, the cache IS empty until we write the initial system table data.

## Solution

Add a **temporary direct write path** for seed node bootstrap only:

### Phase 1: Add Direct Write Capability to CDCIntegrationService

```javascript
// In CDCIntegrationService
setLocalPartitionServices(partitionServices) {
  this.localPartitionServices = partitionServices;
  this.bootstrapMode = true;
}

clearLocalPartitionServices() {
  this.localPartitionServices = null;
  this.bootstrapMode = false;
}

async executeSQL(sql, params = []) {
  // BOOTSTRAP MODE: Write directly to local partition
  if (this.bootstrapMode && this.localPartitionServices) {
    return this.executeSQLDirectToLocalPartition(sql, params);
  }
  
  // NORMAL MODE: Route through SQL engine
  if (!this.sqlQueryEngine) {
    throw new Error('SQL query engine required');
  }
  return this.sqlQueryEngine.executeQuery(sql, params);
}

async executeSQLDirectToLocalPartition(sql, params) {
  // Parse SQL to determine target table
  const tableName = this.extractTableName(sql);
  
  // Find local partition service for this table
  const partition = this.findLocalPartitionForTable(tableName);
  if (!partition) {
    throw new Error(`No local partition for table: ${tableName}`);
  }
  
  // Execute directly on local partition
  return partition.executeSQL(sql, params);
}
```

### Phase 2: Use Direct Write During Seed Bootstrap

```javascript
// In BootstrapService.phaseRegistration()
async phaseRegistration() {
  const cdcService = this.ensureBootstrapCdcIntegrationService();
  
  // ENABLE DIRECT WRITE MODE for bootstrap
  cdcService.setLocalPartitionServices(this.partitionServices);
  
  try {
    // Register message groups, services, tables, partitions
    await this.registerMessageGroup(timestamp);
    await this.registerServices(timestamp);
    await this.registerSystemTables(timestamp);
    await this.updatePartitionSizes();
  } finally {
    // DISABLE DIRECT WRITE MODE after bootstrap
    cdcService.clearLocalPartitionServices();
  }
}
```

### Phase 3: Populate Cache After Direct Writes

```javascript
// In BootstrapService.phaseCacheHydration()
async phaseCacheHydration() {
  // Now that system tables have data (written directly),
  // populate the cache by reading from the partitions
  const cache = NodeService.getInstance().getSystemTableCache();
  
  // Read all system tables and populate cache
  for (const tableName of SYSTEM_TABLES) {
    const partition = this.findPartitionForTable(tableName);
    const rows = await partition.executeSQL(`SELECT * FROM ${tableName}`, []);
    
    for (const row of rows.rows || []) {
      cache.applySystemTableChange(tableName, 'INSERT', row);
    }
  }
  
  this.logger.info('System cache populated from local partitions');
}
```

## Key Principles

1. **Bootstrap mode is temporary**: Only active during `phaseRegistration()`
2. **Single code path after bootstrap**: Once cache is populated, all writes go through SQL routing
3. **No fallback mechanisms**: After bootstrap, there's only one way to write (through cache routing)
4. **Cache is populated from direct writes**: After direct writes complete, read the data back to populate cache

## Implementation Tasks

1. Add `setLocalPartitionServices()` and `clearLocalPartitionServices()` to CDCIntegrationService
2. Add `executeSQLDirectToLocalPartition()` method
3. Modify `executeSQL()` to check bootstrap mode
4. Update `BootstrapService.phaseRegistration()` to enable/disable bootstrap mode
5. Update `BootstrapService.phaseCacheHydration()` to read from local partitions
6. Add tests to verify bootstrap mode is disabled after registration

## Testing

1. Unit test: Verify direct write works when bootstrap mode enabled
2. Unit test: Verify direct write fails when bootstrap mode disabled
3. Integration test: Verify seed node bootstrap completes successfully
4. Integration test: Verify cache is populated after bootstrap
5. Integration test: Verify writes after bootstrap go through SQL routing

## Success Criteria

- Seed node can bootstrap without system cache
- After bootstrap, system cache is populated
- After bootstrap, all writes go through SQL routing (no direct writes)
- No fallback mechanisms remain
- Single code path for all post-bootstrap operations
