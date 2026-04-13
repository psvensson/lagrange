# Constants Naming Convention Guide

This guide documents the canonical locations and patterns for constants in the codebase.

## Canonical Locations

### Shared Constants (`src/constants/`)

The `src/constants/` directory contains constants used across multiple modules:

| File | Purpose | Example Constants |
|------|---------|-------------------|
| `addresses.js` | Address types and entity types | `ADDRESS`, `ENTITY_TYPE` |
| `cdc.js` | CDC operation types | `CDC_OPERATION` |
| `columns.js` | Database column names | `COLUMN` |
| `errors.js` | Common error messages | `ERRORS`, `ERRNO` |
| `fields.js` | Field name constants | `FIELD` |
| `http.js` | HTTP status codes | `HTTP_STATUS` |
| `logging.js` | Log message prefixes | `LOG_MSG` |
| `messages.js` | Message type identifiers | `MESSAGE_TYPE` |
| `network.js` | Network configuration | `HOST`, `PROTOCOL` |
| `node.js` | Node capabilities | `NODE_CAPABILITY` |
| `numbers.js` | Numeric constants | `NUM` |
| `service.js` | Service type identifiers | `SERVICE_TYPE` |
| `sql.js` | SQL keywords and patterns | `SQL` |
| `states.js` | State machine states | `STATE` |
| `strings.js` | Common string values | `STRING` |
| `tables.js` | System table names | `TABLES` |
| `time.js` | Time durations in milliseconds | `TIME_MS` |
| `transport-types.js` | Transport types | `TRANSPORT_TYPE`, `ENDPOINT_STATUS` |
| `types.js` | JavaScript type strings | `TYPEOF` |
| `workflow.js` | Workflow step identifiers | `WORKFLOW_STEP` |

Import shared constants via the barrel export:

```javascript
import {NUM, STRING, TIME_MS, TYPEOF} from '../constants/index.js';
```

### Domain-Specific Constants

Domain-specific constants live in their respective module directories:

| Location | Purpose | Example Constants |
|----------|---------|-------------------|
| `src/raft/constants.js` | Raft protocol constants | `RAFT_ROLE`, `RAFT_EVENT`, `RAFT_PACKET_TYPE` |
| `src/partition/partition-constants.js` | Partition management | `PARTITION_STATE`, `SPLIT_MERGE_STATE` |
| `src/policy/policy-constants.js` | Table policy defaults | `POLICY_DEFAULT`, `DEFAULT_TABLE_POLICY` |
| `src/bootstrap/bootstrap-constants.js` | Bootstrap phases | `BOOTSTRAP_PHASE`, `BOOTSTRAP_DEFAULT` |
| `src/cache/cache-constants.js` | Cache configuration | `CACHE_SYSTEM_TABLES` |
| `src/config/config-constants.js` | Configuration keys | `CONFIG_KEY` |
| `src/storage/storage-constants.js` | Storage defaults | `STORAGE_DEFAULT` |
| `src/live-query/live-query-constants.js` | Live query settings | `LIVE_QUERY_DEFAULT` |
| `src/control-plane/control-plane-constants.js` | Control plane config | `ControlPlaneField` |

## When to Use Shared vs Module-Specific Constants

### Use Shared Constants (`src/constants/`) When:

- The constant is used by 3+ modules
- The constant represents a system-wide concept (e.g., `MESSAGE_TYPE`, `TABLES`)
- The constant is a primitive value (numbers, common strings)

### Use Module-Specific Constants When:

- The constant is only used within one module
- The constant represents domain-specific concepts (e.g., `RAFT_ROLE`, `PARTITION_STATE`)
- The constant includes module-specific error messages or log prefixes

## Naming Conventions

### Constant Objects

Use `UPPER_SNAKE_CASE` for constant object names:

```javascript
const RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner',
});
```

### Constant Properties

Use `UPPER_SNAKE_CASE` for simple value properties:

```javascript
const TIME_MS = Object.freeze({
  HALF_SECOND: 500,
  SECOND: 1000,
  MINUTE: 60000,
});
```

### Error Message Functions

Use `camelCase` for parameterized error message functions:

```javascript
const ERROR_MSG = Object.freeze({
  // Simple messages: UPPER_SNAKE_CASE
  SERVICE_ID_REQUIRED: 'serviceId is required',
  
  // Parameterized messages: camelCase function
  partitionNotFound: (partitionId) => `Partition not found: ${partitionId}`,
  routingFailed: (partitionId, attempts) =>
    `Failed to route to partition ${partitionId} after ${attempts} attempts`,
});
```

### Immutability

Always use `Object.freeze()` to prevent accidental modification:

```javascript
const MY_CONSTANTS = Object.freeze({
  VALUE_ONE: 1,
  VALUE_TWO: 2,
});
```

## Avoiding Duplication

### Import and Re-Export Pattern

When a module needs constants from another domain, import and re-export:

```javascript
// src/partition/partition-constants.js
import {RAFT_ROLE} from '../raft/constants.js';

// Re-export for backward compatibility
// Canonical source: src/raft/constants.js
const PARTITION_RAFT_ROLE = RAFT_ROLE;

export {
  PARTITION_RAFT_ROLE,
  // ... other partition constants
};
```

### Canonical Source Comments

When re-exporting, document the canonical source:

```javascript
// Re-export RAFT_ROLE as PARTITION_RAFT_ROLE for backward compatibility
// Canonical source: src/raft/constants.js
const PARTITION_RAFT_ROLE = RAFT_ROLE;
```

## Key Canonical Locations

| Constant | Canonical Location | Notes |
|----------|-------------------|-------|
| `RAFT_ROLE` | `src/raft/constants.js` | Raft role states (leader, follower, candidate, learner) |
| `MESSAGE_TYPE` | `src/constants/messages.js` | All message type identifiers |
| `TABLES` | `src/constants/tables.js` | System table names |
| `SERVICE_TYPE` | `src/constants/service.js` | Service type identifiers |
| `TIME_MS` | `src/constants/time.js` | Common time durations |
| `NUM` | `src/constants/numbers.js` | Numeric constants |

## Adding New Constants

1. **Determine scope**: Is this used by multiple modules or just one?
2. **Choose location**: Shared (`src/constants/`) or module-specific
3. **Follow naming**: Use `UPPER_SNAKE_CASE` for objects and simple values
4. **Use Object.freeze()**: Ensure immutability
5. **Export properly**: Add to barrel export if in `src/constants/`
6. **Document rationale**: Add comments explaining why values were chosen

## Example: Adding a New Shared Constant

```javascript
// src/constants/retry.js
const RETRY_DEFAULT = Object.freeze({
  // Maximum retry attempts for transient failures.
  // 3 attempts balances reliability with fail-fast behavior.
  MAX_ATTEMPTS: 3,
  
  // Base delay between retries in milliseconds.
  // 100ms provides quick recovery without overwhelming the system.
  BASE_DELAY_MS: 100,
  
  // Maximum delay cap for exponential backoff.
  // 5 seconds prevents excessive wait times.
  MAX_DELAY_MS: 5000,
});

export {RETRY_DEFAULT};
```

Then add to `src/constants/index.js`:

```javascript
export {RETRY_DEFAULT} from './retry.js';
```
