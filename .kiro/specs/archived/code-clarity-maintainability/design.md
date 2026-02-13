# Design Document: Code Clarity and Maintainability

## Overview

This design addresses ten areas of improvement for code clarity and maintainability in the distributed database system. The changes focus on reducing duplication, standardizing patterns, improving documentation, and adding debugging capabilities. All changes preserve existing runtime behavior while making the codebase more understandable and maintainable.

## Architecture

The improvements span multiple layers of the system:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Documentation Layer                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  DEBUGGING.md          │  Service JSDoc        │  Constants Rationale       │
│  (Troubleshooting)     │  (Interface Docs)     │  (Why Comments)            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Pattern Standardization                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Message Handler       │  Phase Pattern        │  Error Message             │
│  Registry              │  (Multi-step ops)     │  Functions                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Code Organization                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Consolidated          │  QueryRouter          │  Partition Service         │
│  Constants             │  Extraction           │  Decomposition             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Observability                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Correlation IDs       │  Structured Logging   │  Request Tracing           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Consolidated Constants (Requirement 1)

**Current State:**
- `RAFT_ROLE` defined in `src/raft/constants.js` (canonical)
- `RAFT_ROLE` duplicated in `src/policy/policy-constants.js`
- `PARTITION_SERVICE_ROLE` in `src/partition/partition-constants.js`

**Target State:**
- Single `RAFT_ROLE` export from `src/raft/constants.js`
- All modules import from canonical location
- Naming convention documented in `src/constants/README.md`

```javascript
// src/raft/constants.js - Single source of truth
export const RAFT_ROLE = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEARNER: 'learner',
});

// src/policy/policy-constants.js - Import instead of define
import {RAFT_ROLE} from '../raft/constants.js';
export {RAFT_ROLE}; // Re-export for convenience
```

### 2. Message Handler Registry (Requirement 2)

**Pattern Definition:**

```javascript
// src/partition/message-handler-registry.js
class MessageHandlerRegistry {
  constructor() {
    this.handlers = new Map();
  }

  register(messageType, handler) {
    this.handlers.set(messageType, handler);
  }

  async handle(message) {
    const handler = this.handlers.get(message.payload?.type);
    if (!handler) {
      return {
        acknowledged: false,
        error: `Unknown message type: ${message.payload?.type}`,
      };
    }
    return handler(message);
  }
}
```

**Integration with PartitionService:**

```javascript
// In PartitionService constructor
this.messageHandlers = new MessageHandlerRegistry();
this.messageHandlers.register(MESSAGE_TYPE.FORWARD_WRITE, this.handleForwardWrite.bind(this));
this.messageHandlers.register(MESSAGE_TYPE.SYSTEM_TABLE_WRITE, this.handleSystemTableWrite.bind(this));
this.messageHandlers.register(MESSAGE_TYPE.QUERY, this.handleRemoteQuery.bind(this));

// In handleApplicationMessage
async handleApplicationMessage(message) {
  return this.messageHandlers.handle(message);
}
```

### 3. QueryRouter Extraction (Requirement 3)

**New Class Structure:**

```javascript
// src/query/query-router.js
/**
 * QueryRouter handles routing queries to partition leaders.
 * Responsibilities:
 * - Finding service candidates for partitions
 * - Retry logic with exponential backoff
 * - Leader redirect following
 * - Timeout management
 * 
 * @interface
 * @constructor
 * @param {Object} options - Configuration options
 * @param {Object} options.systemCache - System table cache (REQUIRED)
 * @param {Object} options.messageRouter - Message router (REQUIRED)
 * @param {number} options.timeoutMs - Query timeout in milliseconds
 * @param {number} options.retryAttempts - Number of retry attempts
 * @param {number} options.retryDelayMs - Delay between retries
 */
class QueryRouter {
  constructor(options) {
    this.systemCache = assertCritical(options.systemCache, 'systemCache required');
    this.messageRouter = assertCritical(options.messageRouter, 'messageRouter required');
    this.timeoutMs = options.timeoutMs || QUERY_DEFAULTS.QUERY_TIMEOUT_MS;
    this.retryAttempts = options.retryAttempts || QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs || QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS;
  }

  async routeToPartition(partitionId, message, options = {}) {
    const correlationId = options.correlationId || generateCorrelationId();
    const candidates = this.findServiceCandidates(partitionId);
    
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      const result = await this.tryRoute(candidates, message, correlationId);
      if (result.success) return result;
      if (result.redirect) {
        candidates.unshift(result.redirect);
        continue;
      }
      await this.delay(this.retryDelayMs * Math.pow(2, attempt));
    }
    
    throw new Error(`Failed to route to partition ${partitionId} after ${this.retryAttempts} attempts`);
  }

  findServiceCandidates(partitionId) { /* ... */ }
  async tryRoute(candidates, message, correlationId) { /* ... */ }
  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}
```

### 4. Phase Pattern for Multi-Step Operations (Requirement 4)

**Base Phase Interface:**

```javascript
// src/utils/phase-base.js
/**
 * Base class for phase-based operations.
 * @interface
 * @fires PhaseBase#phaseStarted
 * @fires PhaseBase#phaseCompleted
 * @fires PhaseBase#phaseFailed
 */
class PhaseBase extends EventEmitter {
  constructor(name, context) {
    super();
    this.name = name;
    this.context = context;
    this.startTime = null;
    this.endTime = null;
  }

  async execute() {
    this.startTime = Date.now();
    this.emit('phaseStarted', {phase: this.name, context: this.context});
    
    try {
      const result = await this.run();
      this.endTime = Date.now();
      this.emit('phaseCompleted', {
        phase: this.name,
        duration: this.endTime - this.startTime,
        result,
      });
      return result;
    } catch (error) {
      this.endTime = Date.now();
      this.emit('phaseFailed', {
        phase: this.name,
        duration: this.endTime - this.startTime,
        error,
      });
      throw error;
    }
  }

  async run() {
    throw new Error('Subclasses must implement run()');
  }
}
```

**Example: Replica Removal Phases:**

```javascript
// src/rebalancer/phases/validate-removal-phase.js
class ValidateRemovalPhase extends PhaseBase {
  constructor(context) {
    super('validate-removal', context);
  }

  async run() {
    const {partitionId, replicaId, systemCache} = this.context;
    // Validate replica exists and can be removed
    return {validated: true, replicaInfo: /* ... */};
  }
}

// src/rebalancer/phases/transfer-leadership-phase.js
class TransferLeadershipPhase extends PhaseBase {
  constructor(context) {
    super('transfer-leadership', context);
  }

  async run() {
    // Transfer leadership if removing leader
    return {leadershipTransferred: true, newLeader: /* ... */};
  }
}
```

### 5. Service Interface Documentation (Requirement 5)

**Standard JSDoc Format:**

```javascript
/**
 * QueryExecutor handles parallel query execution across partitions.
 * 
 * @interface
 * 
 * @constructor
 * @param {Object} options - Configuration options
 * @param {Object} options.messageRouter - Message router for query routing (REQUIRED)
 * @param {Object} options.systemCache - System table cache (REQUIRED)
 * @param {string} [options.nodeId] - Node ID for HLC (optional)
 * 
 * @method execute
 * @param {string} sql - SQL query to execute
 * @param {Array} [params] - Query parameters
 * @param {Object} [options] - Execution options
 * @param {string} [options.correlationId] - Correlation ID for tracing
 * @return {Promise<Object>} Query results
 * 
 * @fires QueryExecutor#queryStarted - When query execution begins
 * @fires QueryExecutor#queryCompleted - When query execution completes
 * @fires QueryExecutor#queryFailed - When query execution fails
 */
```

### 6. Partition Service Decomposition (Requirement 6)

**Extracted Modules:**

```
src/partition/
├── partition-service.js          # Coordinator (reduced from 3500+ lines)
├── partition-raft-storage.js     # Raft log storage operations
├── partition-cdc-generator.js    # CDC event generation
├── partition-transaction-handler.js  # Transaction management
├── message-handler-registry.js   # Message routing
└── partition-constants.js        # Module constants
```

**PartitionRaftStorage:**

```javascript
// src/partition/partition-raft-storage.js
/**
 * Handles Raft log storage operations for partitions.
 * Uses SQLite for persistent log storage.
 */
class PartitionRaftStorage {
  constructor(options) {
    this.db = options.db;
    this.partitionId = options.partitionId;
  }

  async appendEntry(entry) { /* ... */ }
  async getEntry(index) { /* ... */ }
  async getEntriesFrom(startIndex) { /* ... */ }
  async truncateFrom(index) { /* ... */ }
  async getLastIndex() { /* ... */ }
  async getLastTerm() { /* ... */ }
}
```

**PartitionCDCGenerator:**

```javascript
// src/partition/partition-cdc-generator.js
/**
 * Generates CDC events for partition write operations.
 */
class PartitionCDCGenerator {
  constructor(options) {
    this.partitionId = options.partitionId;
    this.tableName = options.tableName;
    this.hlcClock = options.hlcClock;
  }

  generateInsertEvent(row) { /* ... */ }
  generateUpdateEvent(oldRow, newRow) { /* ... */ }
  generateDeleteEvent(row) { /* ... */ }
  broadcastEvent(event) { /* ... */ }
}
```

**PartitionTransactionHandler:**

```javascript
// src/partition/partition-transaction-handler.js
/**
 * Manages transaction lifecycle for partitions.
 */
class PartitionTransactionHandler {
  constructor(options) {
    this.db = options.db;
    this.activeTransactions = new Map();
  }

  begin(transactionId) { /* ... */ }
  commit(transactionId) { /* ... */ }
  rollback(transactionId) { /* ... */ }
  isActive(transactionId) { /* ... */ }
}
```

### 7. Error Message Functions (Requirement 7)

**Standard Pattern:**

```javascript
// src/query/query-constants.js
const QUERY_ERROR_MSG = Object.freeze({
  // Simple messages
  MESSAGE_ROUTER_REQUIRED: 'messageRouter is required',
  SYSTEM_CACHE_REQUIRED: 'systemCache is required',
  
  // Parameterized messages (function pattern)
  partitionNotFound: (partitionId) => `Partition not found: ${partitionId}`,
  routingFailed: (partitionId, attempts) => 
    `Failed to route to partition ${partitionId} after ${attempts} attempts`,
  leaderRedirectFailed: (address) => `Leader redirect to ${address} failed`,
  queryTimeout: (timeoutMs) => `Query timed out after ${timeoutMs}ms`,
  invalidMessageType: (type) => `Invalid message type: ${type}`,
});

// Usage
throw new Error(QUERY_ERROR_MSG.partitionNotFound(partitionId));
throw new Error(QUERY_ERROR_MSG.routingFailed(partitionId, this.retryAttempts));
```

### 8. Correlation ID System (Requirement 8)

**Correlation ID Utilities:**

```javascript
// src/utils/correlation.js
import {v4 as uuidv4} from 'uuid';

const CORRELATION_HEADER = 'x-correlation-id';

function generateCorrelationId() {
  return uuidv4();
}

function getOrCreateCorrelationId(message) {
  return message.correlationId || generateCorrelationId();
}

function withCorrelationId(message, correlationId) {
  return {
    ...message,
    correlationId: correlationId || generateCorrelationId(),
  };
}

export {
  CORRELATION_HEADER,
  generateCorrelationId,
  getOrCreateCorrelationId,
  withCorrelationId,
};
```

**Integration with MessageRouter:**

```javascript
// In MessageRouter.send()
async send(address, message, options = {}) {
  const correlationId = getOrCreateCorrelationId(message);
  const enrichedMessage = withCorrelationId(message, correlationId);
  
  this.logger.debug('Sending message', {
    correlationId,
    address,
    type: message.type,
  });
  
  try {
    const result = await this.transport.send(address, enrichedMessage);
    return {...result, correlationId};
  } catch (error) {
    this.logger.error('Message send failed', {
      correlationId,
      address,
      error: error.message,
    });
    throw error;
  }
}
```

### 9. Constants Documentation (Requirement 9)

**Documentation Format:**

```javascript
// src/constants/time.js
const TIME_MS = Object.freeze({
  // Raft heartbeat interval - must be much smaller than election timeout
  // to prevent unnecessary elections during normal operation.
  // Rule of thumb: election timeout should be 5-10x heartbeat.
  LIFERAFT_HEARTBEAT_DEFAULT_MS: 150,
  
  // Raft election timeout range - randomized to prevent election storms.
  // Minimum must be > 2x heartbeat to allow for network delays.
  // Maximum should be < 10x minimum to ensure timely leader election.
  LIFERAFT_ELECTION_MIN_DEFAULT_MS: 1000,
  LIFERAFT_ELECTION_MAX_DEFAULT_MS: 3000,
  
  // Query timeout - should be long enough for cross-partition queries
  // but short enough to fail fast on network issues.
  // Based on: max 3 retries * 500ms delay + 2000ms execution = ~3500ms
  QUERY_TIMEOUT_DEFAULT_MS: 5000,
  
  // Rebalancer stabilization period - prevents thrashing during
  // rapid cluster changes. Minimum ensures CDC propagation completes.
  // Maximum prevents indefinite delays during rebalancing.
  REBALANCER_STABILIZATION_MIN_MS: 1000,
  REBALANCER_STABILIZATION_MAX_MS: 10000,
});
```

### 10. Debugging Guide (Requirement 10)

**DEBUGGING.md Structure:**

```markdown
# Debugging Guide

## Tracing a Query

1. Find the correlation ID in client logs
2. Search logs for that correlation ID
3. Follow the flow: QueryEngine → QueryRouter → MessageRouter → PartitionService

## Common Failure Patterns

### No Leader Available
- **Symptom**: "No leader found for partition X"
- **Cause**: Raft election in progress or network partition
- **Check**: services table for raft_role values

### Query Timeout
- **Symptom**: "Query timed out after Xms"
- **Cause**: Leader unreachable or overloaded
- **Check**: Node connectivity, partition leader address

## Key Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| "Leader redirect to X" | Query sent to follower | Normal, will retry |
| "Raft election started" | Leadership change | Wait for completion |

## Critical State to Check

- System cache: `systemCache.get(TABLES.SERVICES, serviceId)`
- Partition leaders: `systemCache.filter(TABLES.SERVICES, s => s.raft_role === 'leader')`
- Node status: `systemCache.getAll(TABLES.NODES)`
```

## Data Models

### Correlation Context

```javascript
// Correlation context passed through request chain
const CorrelationContext = {
  correlationId: 'uuid',      // Unique request identifier
  originNodeId: 'string',     // Node that originated the request
  originTimestamp: 'number',  // HLC timestamp at origin
  hops: ['string'],           // Nodes traversed (for debugging)
};
```

### Message Handler Registration

```javascript
// Handler registration entry
const HandlerRegistration = {
  messageType: 'string',      // MESSAGE_TYPE constant
  handler: 'function',        // Bound handler function
  priority: 'number',         // Optional priority for ordering
};
```

### Phase Execution Result

```javascript
// Result from phase execution
const PhaseResult = {
  phase: 'string',            // Phase name
  success: 'boolean',         // Whether phase succeeded
  duration: 'number',         // Execution time in ms
  output: 'object',           // Phase-specific output
  error: 'Error|null',        // Error if failed
};
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties can be verified through property-based testing:

### Property 1: Message Handler Registry Routing

*For any* registered message type and corresponding handler, when a message of that type is received, the registry SHALL invoke the correct handler and return its result.

**Validates: Requirements 2.1, 2.2**

### Property 2: Unknown Message Type Handling

*For any* message type that is not registered in the handler registry, the registry SHALL return an error response containing the unknown message type.

**Validates: Requirements 2.3** (edge case)

### Property 3: QueryRouter Service Candidate Discovery

*For any* partition ID that exists in the system cache, the QueryRouter SHALL return at least one valid service candidate with a reachable address.

**Validates: Requirements 3.2**

### Property 4: QueryRouter Retry Behavior

*For any* routing operation that fails transiently, the QueryRouter SHALL retry up to the configured number of attempts with exponential backoff delays.

**Validates: Requirements 3.3**

### Property 5: QueryRouter Leader Redirect Following

*For any* routing response that indicates a leader redirect, the QueryRouter SHALL attempt to route to the new leader address before exhausting retries.

**Validates: Requirements 3.4**

### Property 6: QueryRouter Timeout Enforcement

*For any* routing operation, if the total elapsed time exceeds the configured timeout, the operation SHALL fail with a timeout error regardless of retry state.

**Validates: Requirements 3.5**

### Property 7: Phase State Machine Transition Validation

*For any* phase state machine, attempting an invalid state transition SHALL throw an error, and valid transitions SHALL succeed and update the current state.

**Validates: Requirements 4.5**

### Property 8: Phase Lifecycle Event Emission

*For any* phase execution, the phase SHALL emit 'phaseStarted' before execution, and either 'phaseCompleted' or 'phaseFailed' after execution completes.

**Validates: Requirements 4.6**

### Property 9: Extracted Module API Equivalence

*For any* operation supported by the original PartitionService, the same operation performed through the extracted modules (PartitionRaftStorage, PartitionCDCGenerator, PartitionTransactionHandler) SHALL produce equivalent results.

**Validates: Requirements 6.6**

### Property 10: Correlation ID Presence

*For any* message sent through MessageRouter, the resulting message SHALL contain a correlationId field that is either the original correlationId (if present) or a newly generated UUID.

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 11: Error Response Correlation ID

*For any* failed operation that returns an error response, the response SHALL include the correlationId from the original request.

**Validates: Requirements 8.5**

## Error Handling

### Error Categories

| Category | Handling Strategy | Example |
|----------|-------------------|---------|
| Configuration Errors | Fail fast at startup | Missing required dependency |
| Routing Errors | Retry with backoff | No leader available |
| Timeout Errors | Fail with context | Query timeout exceeded |
| Unknown Message Types | Return error response | Unregistered handler |
| Phase Failures | Emit event, cleanup, rethrow | Phase execution error |

### Error Message Standards

All error messages follow the function pattern for parameterized errors:

```javascript
const ERROR_MSG = Object.freeze({
  // Simple errors (no parameters)
  DEPENDENCY_REQUIRED: 'Required dependency not provided',
  
  // Parameterized errors (function pattern)
  dependencyMissing: (name) => `Required dependency missing: ${name}`,
  routingFailed: (partitionId, attempts) => 
    `Routing to partition ${partitionId} failed after ${attempts} attempts`,
  timeoutExceeded: (operation, timeoutMs) =>
    `Operation ${operation} timed out after ${timeoutMs}ms`,
});
```

### Correlation ID in Errors

All error responses include correlation context:

```javascript
{
  success: false,
  error: 'Routing failed',
  correlationId: 'uuid-from-request',
  context: {
    partitionId: 'partition-1',
    attempts: 3,
    lastError: 'No leader available',
  },
}
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and integration points
- **Property tests**: Verify universal properties across generated inputs

### Property-Based Testing Configuration

- Library: fast-check
- Iterations: 10 per property (per testing guidelines)
- Tag format: `Feature: code-clarity-maintainability, Property N: {property_text}`

### Test Categories

| Category | Test Type | Focus |
|----------|-----------|-------|
| Message Handler Registry | Property | Routing correctness |
| QueryRouter | Property | Retry, redirect, timeout behavior |
| Phase State Machine | Property | Transition validation |
| Correlation IDs | Property | Presence and preservation |
| API Equivalence | Property | Extracted module behavior |
| Documentation | Example | File/content existence |
| Constants Consolidation | Example | Import patterns |

### Unit Test Focus Areas

- Edge cases: Unknown message types, empty inputs, boundary conditions
- Integration: Module coordination, event propagation
- Error conditions: Missing dependencies, invalid configurations

### Property Test Focus Areas

- Universal behaviors: All messages get correlation IDs
- Invariants: State machine transitions, API equivalence
- Round-trip: Original vs extracted module behavior

