# Data Models

## System Tables Schema

### tables
```sql
CREATE TABLE tables (
  table_id TEXT PRIMARY KEY,
  table_name TEXT UNIQUE NOT NULL,
  schema_definition TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  table_policies TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### partitions
```sql
CREATE TABLE partitions (
  partition_id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  partition_key_start TEXT,
  partition_key_end TEXT,
  replica_count INTEGER NOT NULL DEFAULT 3,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  leader_node_id TEXT,
  state TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL, SPLITTING, MERGING
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (table_id) REFERENCES tables(table_id),
  FOREIGN KEY (leader_node_id) REFERENCES nodes(node_id)
);
```

### nodes
```sql
CREATE TABLE nodes (
  node_id TEXT PRIMARY KEY,
  node_address TEXT UNIQUE NOT NULL,
  cpu_cores INTEGER NOT NULL,
  memory_mb INTEGER NOT NULL,
  disk_gb INTEGER NOT NULL,
  cpu_usage_percent REAL DEFAULT 0,
  memory_usage_percent REAL DEFAULT 0,
  disk_usage_percent REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive, failed
  last_heartbeat INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

### message_groups
```sql
CREATE TABLE message_groups (
  group_id TEXT PRIMARY KEY,
  group_name TEXT UNIQUE NOT NULL,
  replica_count INTEGER NOT NULL DEFAULT 3,
  leader_node_id TEXT,
  policy TEXT NOT NULL DEFAULT '{}', -- JSON: Message_Group_Policy
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### message_group_replicas
```sql
CREATE TABLE message_group_replicas (
  replica_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, syncing, failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES message_groups(group_id),
  FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);
```

### indices
```sql
CREATE TABLE indices (
  index_id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  index_name TEXT NOT NULL,
  column_names TEXT NOT NULL, -- JSON array
  index_type TEXT NOT NULL DEFAULT 'btree',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (table_id) REFERENCES tables(table_id),
  UNIQUE(table_id, index_name)
);
```

### logs
```sql
CREATE TABLE logs (
  log_id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  level TEXT NOT NULL,  -- ERROR, WARN, INFO, DEBUG, TRACE
  node_id TEXT NOT NULL,
  service_id TEXT,
  service_type TEXT,  -- node, partition, message_group
  message TEXT NOT NULL,
  trace_id TEXT,
  metadata TEXT,  -- JSON: custom fields
  created_at INTEGER NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_node ON logs(node_id);
CREATE INDEX idx_logs_trace ON logs(trace_id);
```

### config
```sql
CREATE TABLE config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  value_type TEXT NOT NULL,  -- string, number, boolean, json
  requires_restart BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  default_value TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_config_requires_restart ON config(requires_restart);
```

### live_queries
```sql
CREATE TABLE live_queries (
  query_id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  predicate_hash TEXT NOT NULL,
  predicate_sql TEXT NOT NULL,
  partition_key_value TEXT,
  client_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  FOREIGN KEY (table_name) REFERENCES tables(table_name)
);

CREATE INDEX idx_live_queries_table ON live_queries(table_name);
CREATE INDEX idx_live_queries_activity ON live_queries(last_activity_at);
```

### contexts
```sql
CREATE TABLE contexts (
  context_id TEXT PRIMARY KEY,
  context_type TEXT NOT NULL,  -- 'function', 'service', 'user'
  context_name TEXT NOT NULL,
  context_data TEXT NOT NULL,  -- JSON blob
  owner_id TEXT,               -- function_id, service_id, etc.
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(context_type, context_name)
);

CREATE INDEX idx_contexts_type ON contexts(context_type);
CREATE INDEX idx_contexts_owner ON contexts(owner_id);
```

### code (schema reserved for future WASM project)
```sql
CREATE TABLE code (
  function_id TEXT PRIMARY KEY,
  function_name TEXT UNIQUE NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  executor_type TEXT NOT NULL DEFAULT 'wasm',  -- 'wasm', 'javascript', etc.
  code_blob BLOB NOT NULL,                      -- Compiled WASM or JS
  signature TEXT NOT NULL,                      -- JSON: input/output types
  permissions TEXT NOT NULL DEFAULT '[]',       -- JSON: what it can access
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_code_name ON code(function_name);
CREATE INDEX idx_code_type ON code(executor_type);
```

### services
```sql
CREATE TABLE services (
  service_id TEXT PRIMARY KEY,
  service_type TEXT NOT NULL, -- 'node', 'partition', 'message_group'
  service_address TEXT UNIQUE NOT NULL,
  node_id TEXT NOT NULL,
  config TEXT NOT NULL, -- JSON
  raft_role TEXT, -- 'leader', 'follower', 'candidate', null for non-Raft services
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);
```

## Address Schema

Addresses follow a hierarchical format: `protocol://node_address:service_port/service_path`

Examples:
- Node address: `ws://192.168.1.100:8080`
- Service address: `ws://192.168.1.100:8080/partition/table1_p1_r1`
- Message group address: `ws://192.168.1.100:8080/message_group/mg1_r1`

## CDC Event Format

CDC (Change Data Capture) events are emitted whenever data changes in any partition. Each event includes HLC timestamps for global ordering across partitions.

**CDC Event Structure:**
```javascript
{
  // Event identification
  event_id: "uuid-v4",
  
  // Source information
  table_name: "users",
  partition_id: "users_p1",
  node_id: "node-1",
  
  // Operation details
  operation: "INSERT" | "UPDATE" | "DELETE",
  data: {
    // The actual row data
    id: "user-123",
    name: "Alice",
    email: "alice@example.com",
    // ... other columns
  },
  old_data: {
    // For UPDATE operations, the previous values
    // null for INSERT and DELETE
  },
  
  // HLC timestamp for global ordering
  hlc_timestamp: "1704067200000-0-node-1",  // Full HLC timestamp string
  hlc_physical: 1704067200000,               // Physical component (Unix ms)
  hlc_logical: 0,                            // Logical component (0-65535)
  
  // Raft log position (for deduplication within partition)
  raft_log_index: 12345,
  raft_log_term: 3,
  
  // Event metadata
  created_at: 1704067200000,
  trace_id: "optional-trace-id"
}
```

**CDC Event Ordering Guarantees:**

1. **Within-Partition Ordering**: Events from the same partition are totally ordered by Raft log index
2. **Cross-Partition Ordering**: Events from different partitions are ordered by HLC timestamp
3. **Monotonic Timestamps**: HLC timestamps are monotonically increasing within each partition
4. **Causality Preservation**: If event A happens-before event B, then HLC(A) < HLC(B)

**Validates: Requirements 3.12-15, 4.19-23**
