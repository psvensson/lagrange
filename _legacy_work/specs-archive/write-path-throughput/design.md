# Design Document: Write Path Throughput Optimizations

## Overview

This design addresses four bottlenecks in the distributed write path that collectively reduce throughput to ~1.3% of a PostgreSQL baseline. The optimizations target: (1) sequential partition writes in `DistributedWriteCoordinator.executePlan()`, (2) redundant SQL parsing in `SQLQueryEngine.executeQuery()`, (3) synchronous SHA-1 hashing for non-transactional writes, and (4) unnecessary JSON serialization for same-node message delivery.

Each optimization is independent and can be implemented and tested in isolation. Together they reduce per-write latency by eliminating serialization overhead, parallelizing I/O, and caching repeated computation.

## Architecture

The write path flows through these components in order:

```
SQLQueryEngine.executeQuery()
  → SQLParser.parse()                    [Optimization 2: cache here]
  → executeInsert/Update/Delete()
    → createWriteOperationPayloadHash()  [Optimization 3: defer here]
    → DistributedWriteCoordinator.executePlan()
      → for each partition (sequential)  [Optimization 1: parallelize here]
        → executePartitionStatement()
          → MessageRouter.deliver()
            → sendRaw(ws, JSON.stringify) [Optimization 4: bypass here for local]
```

All four optimizations modify existing components. No new architectural components are introduced. The single-owner contract is preserved: each optimization modifies only the owning component for that concern.

## Components and Interfaces

### 1. Parallel Partition Execution (`DistributedWriteCoordinator`)

**Current**: `executePlan()` iterates partitions with a sequential `for...of` + `await` loop.

**Change**: Replace the sequential loop with `Promise.allSettled()` for concurrent execution. Single-partition plans skip the concurrency wrapper.

```javascript
// Current (sequential)
for (const partitionId of orderedPartitions) {
  const result = await this.executePartitionStatement(...);
  participantResults.push({partitionId, ...result});
}

// Proposed (parallel)
if (orderedPartitions.length === 1) {
  // Single partition: direct call, no concurrency overhead
  const partitionId = orderedPartitions[0];
  const statementAst = plan.partitionStatements.get(partitionId);
  const result = await this.executePartitionStatement(
    plan.statementType, statementAst, partitionId, params,
  );
  participantResults.push({partitionId, ...result});
} else {
  // Multiple partitions: concurrent execution
  const promises = orderedPartitions.map((partitionId) => {
    const statementAst = plan.partitionStatements.get(partitionId);
    return this.executePartitionStatement(
      plan.statementType, statementAst, partitionId, params,
    ).then((result) => ({partitionId, ...result}));
  });
  const settled = await Promise.allSettled(promises);
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      participantResults.push(outcome.value);
    } else {
      participantResults.push({
        partitionId: null,
        success: false,
        error: outcome.reason?.message || 'Partition write failed',
      });
    }
  }
}
```

**Error semantics**: `Promise.allSettled()` never short-circuits. All partition results are collected regardless of individual failures. The existing failure aggregation logic (filtering `!result.success`, building `failedPartitions` and `partitionErrors`) remains unchanged.

**Ordering**: Results are sorted by `partitionId` after collection to preserve deterministic ordering in the response, matching the current sorted iteration order.

### 2. SQL Parse Cache (`SqlParseCache`)

**New class**: `SqlParseCache` in `src/query/sql-parse-cache.js`. A simple LRU cache keyed on `(sql, dialect)` returning deep-cloned ASTs.

```javascript
class SqlParseCache {
  constructor(maxSize = SQL_PARSE_CACHE_DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map(); // Map preserves insertion order for LRU
  }

  get(sql, dialect) {
    const key = this.buildKey(sql, dialect);
    const entry = this.cache.get(key);
    if (!entry) return null;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return this.cloneAst(entry);
  }

  set(sql, dialect, ast) {
    const key = this.buildKey(sql, dialect);
    this.cache.delete(key); // Remove if exists (for LRU reorder)
    if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first key)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, ast);
  }

  buildKey(sql, dialect) {
    return dialect ? `${dialect}:${sql}` : sql;
  }

  cloneAst(ast) {
    return structuredClone(ast);
  }
}
```

**Why `structuredClone`**: The AST is a plain object tree with no functions, symbols, or DOM nodes. `structuredClone` is the fastest built-in deep clone for this shape and correctly handles `_paramMapping` arrays. It avoids the overhead of `JSON.parse(JSON.stringify())` which would also work but is slower for structured data.

**Why clone on `get` only**: The cache stores the canonical AST. Each caller gets a clone they can mutate freely (the parser's `_paramMapping` attachment, parameter reordering, etc.). The stored copy is never exposed directly.

**Integration**: `SQLQueryEngine` creates one `SqlParseCache` instance in its constructor. The `executeQuery()` method checks the cache before creating a `SQLParser`. On cache miss, it parses, stores the result, and returns a clone.

**Cache size**: Default 1000 entries. Configurable via constructor parameter. Each entry is a SQL string key + AST object. For typical INSERT/SELECT statements, this is ~2-5 KB per entry, so 1000 entries ≈ 2-5 MB.

### 3. Deferred Payload Hash (`SQLQueryEngine`)

**Current**: `executeInsert()` calls `createWriteOperationPayloadHash()` synchronously on every write, then passes the hash to both the transactional and non-transactional paths.

**Change**: For non-transactional writes, move the hash computation into `fireNonTransactionalWriteStart()` where it's consumed. The hash is only needed for the fire-and-forget persistence row, which is already async (`.catch()` swallowed).

```javascript
// Current in executeInsert():
const payloadHash = this.createWriteOperationPayloadHash(writePlan, QUERY_AST_TYPE.INSERT);
// ... used in both tx and non-tx paths

// Proposed in executeInsert():
if (txState) {
  const payloadHash = this.createWriteOperationPayloadHash(
    writePlan, QUERY_AST_TYPE.INSERT,
  );
  await this.transactionCoordinator.recordWriteOperation(sessionId, {
    statementType: QUERY_AST_TYPE.INSERT,
    operationId: writePlan.operationId,
    partitionIds: writePartitions,
    idempotencyKey: writePlan.idempotencyKey,
    payloadHash,
  });
} else {
  // Hash computed inside fireNonTransactionalWriteStart, not on hot path
  this.fireNonTransactionalWriteStart(writePlan, QUERY_AST_TYPE.INSERT);
}
```

The same change applies to `executeUpdate()` and `executeDelete()`.

`fireNonTransactionalWriteStart()` already computes the hash internally (it calls `this.createWriteOperationPayloadHash()`), so the only change is removing the redundant call from the synchronous path. `fireNonTransactionalWriteResult()` also calls `createWriteOperationPayloadHash()` internally, so no change needed there.

### 4. Local Message Delivery Fast Path (`MessageRouter`)

**Current**: `deliver()` routes all messages (including self-delivery) through `deliverRemote()` → `enqueueOutbound()` → `processOutboundQueue()` → `sendMessage()` → `sendRaw(ws, JSON.stringify(message))`. For local delivery, the message is serialized to JSON, sent over the loopback WebSocket, received, parsed from JSON, and dispatched to the handler.

**Change**: Add a local delivery fast path in `deliver()` that bypasses WebSocket serialization when `targetNodeId === this.nodeId`. The fast path directly invokes the registered handler, constructs the same envelope, and returns the same result shape.

```javascript
// In deliver(), replace the self-delivery branch:
if (targetNodeId === this.nodeId) {
  deliveryOutcome = await this.deliverLocal(
    targetAddress, messageId, payload, correlationId,
  );
} else {
  deliveryOutcome = await this.deliverRemote(
    targetAddress, messageId, payload,
    targetNodeId, correlationId,
  );
}
```

New `deliverLocal()` method:

```javascript
async deliverLocal(targetAddress, messageId, payload, correlationId) {
  const handler = this.handlers.get(targetAddress);
  if (!handler) {
    // Fall back to remote path for special handlers (join request, etc.)
    return this.deliverRemote(
      targetAddress, messageId, payload,
      this.nodeId, correlationId,
    );
  }

  const envelope = {
    messageId,
    sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
    sourceNodeId: this.nodeId,
    targetAddress,
    payload,
    timestamp: Date.now(),
  };

  try {
    const result = await Promise.resolve(handler(envelope));
    return {
      result: {
        messageId,
        correlationId,
        acknowledged: true,
        ...(result && typeof result === TRANSPORT_TYPEOF.OBJECT
          ? (() => {
            const {acknowledged: _ack, type: handlerType, ...rest} = result;
            const merged = {...rest};
            if (handlerType) merged.responseType = handlerType;
            return merged;
          })()
          : {}),
      },
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  } catch (error) {
    return {
      result: {
        messageId,
        correlationId,
        acknowledged: false,
        error: error.message,
      },
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  }
}
```

**Semantics preservation**:
- The envelope shape matches what `handleServiceMessage()` constructs
- The ACK result shape matches what `handleServiceMessage()` sends back
- Error handling mirrors the try/catch in `handleServiceMessage()`
- Timeout is not needed for local delivery (no network, no serialization)
- Metrics logging in `deliver()` still fires after `deliverLocal()` returns, preserving observability
- Special handlers (join request/complete) that aren't in `this.handlers` fall back to the remote path

**What is NOT bypassed**: The outbound queue, message timeout, and WebSocket serialization are bypassed. The handler invocation, envelope construction, result normalization, and metrics logging are preserved.

## Data Models

No new persistent data models are introduced. All changes are in-memory runtime optimizations.

### SqlParseCache Entry

```javascript
{
  key: string,    // `${dialect}:${sql}` or just `${sql}` for default dialect
  value: object,  // Internal AST object (frozen canonical copy)
}
```

### Constants

New constants in `src/query/query-constants.js`:

```javascript
const SQL_PARSE_CACHE = Object.freeze({
  DEFAULT_MAX_SIZE: 1000,
});
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Parallel execution reports all failures

*For any* write plan targeting N partitions where a subset of partitions fail, the `executePlan()` result SHALL contain every failed partition ID in `failedPartitions` and every failure error in `partitionErrors`, with `failedPartitions.length` equal to the number of failed partitions.

**Validates: Requirements 1.2**

### Property 2: Parallel execution aggregates success results

*For any* write plan targeting N partitions where all partitions succeed with arbitrary `affectedRows` counts and `rows` arrays, the `executePlan()` result SHALL have `success === true`, `affectedRows` equal to the sum of all partition `affectedRows`, and `rows` containing all partition rows.

**Validates: Requirements 1.3**

### Property 3: Partition result ordering is deterministic

*For any* set of partition results arriving in arbitrary order, the `participantResults` array in the `executePlan()` response SHALL be ordered by `partitionId` lexicographically.

**Validates: Requirements 1.5**

### Property 4: Parse cache round-trip equivalence

*For any* valid SQL string and dialect, parsing the SQL twice through the cache-enabled path SHALL produce structurally equivalent AST objects, including `_paramMapping` for PG dialect queries.

**Validates: Requirements 2.1, 2.2, 2.5**

### Property 5: LRU eviction maintains bounded cache size

*For any* sequence of `set()` operations on a `SqlParseCache` with max size M, the cache size SHALL never exceed M, and when at capacity, the evicted entry SHALL be the least recently used.

**Validates: Requirements 2.3, 2.6**

### Property 6: Payload hash is deterministic

*For any* write plan and statement type, calling `createWriteOperationPayloadHash()` twice with the same inputs SHALL produce identical hash strings.

**Validates: Requirements 3.3**

### Property 7: Local delivery produces equivalent results to handler invocation

*For any* registered handler and message payload, `deliverLocal()` SHALL produce an acknowledgment result with the same handler-derived fields as `handleServiceMessage()` would produce for the same handler and payload.

**Validates: Requirements 4.3**

## Error Handling

### Parallel Partition Execution
- `Promise.allSettled()` guarantees all partition results are collected, even if some reject.
- If a promise rejects (unexpected throw from `executePartitionStatement`), the rejection reason is captured in the result with `success: false`.
- The existing retry logic inside `executePartitionStatement()` is unchanged; retries happen per-partition before the promise settles.

### SQL Parse Cache
- Cache misses fall through to normal parsing. Parse errors propagate unchanged.
- `structuredClone()` cannot fail on plain AST objects (no functions, symbols, or circular refs).
- If the cache is corrupted (should not happen), the worst case is a cache miss and re-parse.

### Deferred Payload Hash
- Transactional writes still compute the hash synchronously — no change to error handling.
- Non-transactional writes compute the hash inside `fireNonTransactionalWriteStart()`, which already has a `.catch()` that logs and swallows errors. Hash computation errors are handled identically.

### Local Message Delivery
- Handler errors are caught and returned as `{acknowledged: false, error: message}`, matching the remote path behavior in `handleServiceMessage()`.
- If no handler is registered for the target address, the method falls back to `deliverRemote()` to handle special handlers (join request/complete) that use dynamic dispatch.
- The metrics logging in `deliver()` fires after `deliverLocal()` returns, so metrics errors don't affect delivery.

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are used:

- **Unit tests**: Verify specific examples, edge cases, integration points, and error conditions for each optimization.
- **Property tests**: Verify universal correctness properties across randomized inputs using `fast-check`.

### Property-Based Testing Configuration

- Library: `fast-check`
- Iterations: `{numRuns: 10}` per property test (per workspace testing guidelines)
- Each property test references its design document property number.
- Tag format: **Feature: write-path-throughput, Property N: {property_text}**

### Test Plan

#### Parallel Partition Execution
- **Property tests**: Properties 1, 2, 3 — generate random partition result sets with varying success/failure combinations, row counts, and partition IDs. Verify failure collection, success aggregation, and ordering.
- **Unit tests**: Single-partition fast path, all-fail case, all-succeed case, mixed case with specific partition IDs.

#### SQL Parse Cache
- **Property tests**: Properties 4, 5 — generate random SQL strings and cache operation sequences. Verify round-trip equivalence and LRU bounded size.
- **Unit tests**: PG dialect `_paramMapping` preservation, cache miss then hit, eviction of specific entry, dialect key separation.

#### Deferred Payload Hash
- **Property tests**: Property 6 — generate random write plans and verify hash determinism.
- **Unit tests**: Verify non-transactional path does not call `createWriteOperationPayloadHash` synchronously in `executeInsert`. Verify transactional path still computes hash before `recordWriteOperation`.

#### Local Message Delivery
- **Property tests**: Property 7 — generate random payloads and handler results, verify `deliverLocal` produces equivalent acknowledgment shape.
- **Unit tests**: Handler throws error, no handler registered (fallback to remote), handler returns non-object, metrics logging still fires.
