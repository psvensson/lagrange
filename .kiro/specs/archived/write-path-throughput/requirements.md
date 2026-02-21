# Requirements Document

## Introduction

The distributed database write path currently achieves ~45 ops/sec compared to a PostgreSQL baseline of ~3541 TPS (1.3% of PG throughput). Profiling identified four concrete bottlenecks in the hot write path: sequential partition writes, redundant SQL parsing, eager payload hashing, and unnecessary JSON serialization for local message delivery. This spec covers optimizations to each bottleneck to significantly improve write throughput.

## Glossary

- **Write_Path**: The code path from `SQLQueryEngine.executeQuery()` through `DistributedWriteCoordinator.executePlan()` to partition-level Raft proposals for INSERT, UPDATE, and DELETE operations.
- **Write_Plan**: A data structure produced by `DistributedWriteCoordinator.createWritePlan()` mapping partition IDs to per-partition SQL AST statements.
- **Partition_Statement**: A per-partition SQL AST and parameters derived from a multi-partition write operation.
- **Parse_Cache**: An LRU cache mapping `(sql, dialect)` keys to deep-cloned internal AST objects, avoiding redundant SQL parsing.
- **Payload_Hash**: A SHA-1 digest of a write plan used for idempotency tracking in the `sql_write_operations` table.
- **Local_Delivery**: Message delivery where the source and target node are the same node, currently routed through WebSocket serialization.
- **Message_Router**: The unified message routing component that handles all inter-node and intra-node communication via WebSocket transport.
- **SQL_Query_Engine**: The single SQL planner and executor (`SQLQueryEngine` / `SqlCore`) for all SQL workloads.
- **Distributed_Write_Coordinator**: The component that creates write plans and executes them across partitions.

## Requirements

### Requirement 1: Parallel Partition Write Execution

**User Story:** As a database operator, I want multi-partition writes to execute partition statements concurrently, so that write latency scales with the slowest partition rather than the sum of all partitions.

#### Acceptance Criteria

1. WHEN a write plan targets multiple partitions, THE Distributed_Write_Coordinator SHALL execute all partition statements concurrently rather than sequentially.
2. WHEN any partition statement fails during concurrent execution, THE Distributed_Write_Coordinator SHALL collect results from all partitions and report all failures in the response.
3. WHEN all partition statements succeed during concurrent execution, THE Distributed_Write_Coordinator SHALL return a combined result with the total affected row count and all returned rows.
4. WHEN a write plan targets a single partition, THE Distributed_Write_Coordinator SHALL execute the statement directly without concurrency overhead.
5. THE Distributed_Write_Coordinator SHALL preserve deterministic partition ordering in the response regardless of concurrent execution order.

### Requirement 2: SQL Parse Result Caching

**User Story:** As a database operator, I want repeated SQL statements to reuse cached parse results, so that parsing overhead is eliminated for hot query patterns.

#### Acceptance Criteria

1. WHEN the SQL_Query_Engine parses a SQL string that has been parsed before with the same dialect, THE Parse_Cache SHALL return a deep clone of the cached AST instead of re-parsing.
2. WHEN the Parse_Cache returns a cached AST for a PG dialect query, THE Parse_Cache SHALL preserve the `_paramMapping` array in the cloned result.
3. WHEN the Parse_Cache reaches its maximum capacity, THE Parse_Cache SHALL evict the least recently used entry.
4. THE Parse_Cache SHALL use a composite key of the SQL string and dialect to distinguish cached entries.
5. WHEN a SQL string has not been parsed before, THE SQL_Query_Engine SHALL parse the SQL, store the result in the Parse_Cache, and return a deep clone of the stored AST.
6. THE Parse_Cache SHALL be bounded by a configurable maximum entry count to prevent unbounded memory growth.

### Requirement 3: Deferred Write Plan Payload Hashing

**User Story:** As a database operator, I want payload hash computation to be deferred for non-transactional writes, so that the synchronous write path avoids unnecessary cryptographic overhead.

#### Acceptance Criteria

1. WHEN a non-transactional write is executed, THE SQL_Query_Engine SHALL defer payload hash computation to the asynchronous fire-and-forget persistence path.
2. WHEN a transactional write is executed, THE SQL_Query_Engine SHALL compute the payload hash synchronously before recording the write operation.
3. THE SQL_Query_Engine SHALL produce identical payload hashes regardless of whether computation is deferred or synchronous.

### Requirement 4: Local Message Delivery Optimization

**User Story:** As a database operator, I want same-node message delivery to bypass JSON serialization, so that local writes avoid unnecessary serialization and deserialization overhead.

#### Acceptance Criteria

1. WHEN the Message_Router delivers a message where the target node is the local node, THE Message_Router SHALL deliver the message without JSON serialization.
2. WHEN the Message_Router delivers a message to a remote node, THE Message_Router SHALL continue to use the existing WebSocket JSON serialization path.
3. WHEN local delivery is used, THE Message_Router SHALL preserve the same message acknowledgment semantics as remote delivery.
4. WHEN local delivery is used, THE Message_Router SHALL preserve the same timeout and error handling behavior as remote delivery.
5. WHEN local delivery is used, THE Message_Router SHALL preserve the same metrics logging behavior as remote delivery.
