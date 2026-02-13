# Design Document: Code Quality Improvements

## Overview

This design document describes the technical approach for implementing code quality improvements to the distributed database codebase. The improvements focus on five key areas:

1. **File splitting** - Extract connection handling from message-router.js into focused modules
2. **ESLint compliance** - Remove eslint-disable comment via alternative mixin pattern
3. **Convention standardization** - Standardize state value casing to lowercase
4. **Error utilities** - Create a base error class pattern for consistent error handling
5. **Type safety** - Enhance assertCritical and add JSDoc type annotations

## Architecture

The code quality improvements follow the existing architectural patterns in the codebase:

```
src/
├── transport/
│   ├── message-router.js          # Core router (reduced from 2122 to ~800 lines)
│   ├── router-connection-manager.js  # Existing - connection lifecycle
│   ├── router-outbound-queue.js      # Existing - outbound message queuing
│   ├── router-message-handler.js     # NEW - message handling logic
│   └── router-server-manager.js      # NEW - WebSocket server management
├── utils/
│   ├── assert.js                  # Enhanced with typed errors
│   └── base-error.js              # NEW - base error class
├── constants/
│   └── states.js                  # Standardized to lowercase
└── bootstrap/
    ├── bootstrap-errors.js        # Refactored to extend BaseError
    └── service-lifecycle-mixin.js # Unchanged (test pattern changes)
```

## Components and Interfaces

### Component 1: Router Message Handler

Extracts message handling logic from MessageRouter into a dedicated module.

```javascript
/**
 * RouterMessageHandler - Message processing for MessageRouter.
 * Handles incoming messages, dispatches to handlers, and sends responses.
 * 
 * @module transport/router-message-handler
 */

/**
 * @typedef {Object} MessageEnvelope
 * @property {string} messageId - Unique message identifier
 * @property {string} sourceAddress - Source service address
 * @property {string} sourceNodeId - Source node ID
 * @property {string} targetAddress - Target service address
 * @property {Object} payload - Message payload
 * @property {number} timestamp - Message timestamp
 */

/**
 * @typedef {Object} MessageHandlerOptions
 * @property {string} nodeId - Local node ID
 * @property {Object} logger - Logger instance
 * @property {Map<string, Function>} handlers - Handler registry
 * @property {Function} sendRaw - Function to send raw WebSocket messages
 */

class RouterMessageHandler {
  /**
   * Create a new RouterMessageHandler.
   * @param {MessageHandlerOptions} options - Configuration options
   */
  constructor(options) {
    this.nodeId = options.nodeId;
    this.logger = options.logger;
    this.handlers = options.handlers;
    this.sendRaw = options.sendRaw;
    this.pendingMessages = new Map();
    this.pendingPings = new Map();
    this.pendingJoinRequests = new Map();
    this.pendingJoinCompletes = new Map();
    this.joinRequestHandler = null;
    this.joinCompleteHandler = null;
  }

  /**
   * Handle incoming message from WebSocket.
   * @param {string} connectionId - Connection or node ID
   * @param {WebSocket} ws - WebSocket connection
   * @param {Buffer|string} data - Message data
   */
  handleMessage(connectionId, ws, data) { /* ... */ }

  /**
   * Handle service message and dispatch to registered handler.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Service message
   */
  handleServiceMessage(ws, message) { /* ... */ }

  /**
   * Handle acknowledgment message.
   * @param {Object} message - Acknowledgment message
   */
  handleAcknowledgment(message) { /* ... */ }
}

export { RouterMessageHandler };
```

### Component 2: Router Server Manager

Extracts WebSocket server management from MessageRouter.

```javascript
/**
 * RouterServerManager - WebSocket server lifecycle management.
 * Handles server startup, incoming connections, and shutdown.
 * 
 * @module transport/router-server-manager
 */

/**
 * @typedef {Object} ServerManagerOptions
 * @property {string} nodeId - Local node ID
 * @property {number} wsPort - WebSocket server port
 * @property {string} wsHost - WebSocket bind host
 * @property {boolean} inProcess - Enable in-process transport
 * @property {Object} logger - Logger instance
 * @property {Function} onConnection - Callback for new connections
 */

class RouterServerManager {
  /**
   * Create a new RouterServerManager.
   * @param {ServerManagerOptions} options - Configuration options
   */
  constructor(options) { /* ... */ }

  /**
   * Start WebSocket server.
   * @return {Promise<void>}
   */
  async startServer() { /* ... */ }

  /**
   * Start in-process server for testing.
   */
  startInProcessServer() { /* ... */ }

  /**
   * Shutdown server and close all connections.
   * @return {Promise<void>}
   */
  async shutdown() { /* ... */ }
}

export { RouterServerManager };
```

### Component 3: Base Error Class

Provides a foundation for all custom error classes.

```javascript
/**
 * BaseError - Foundation class for custom errors.
 * Provides consistent error properties and behavior.
 * 
 * @module utils/base-error
 */

/**
 * @typedef {Object} ErrorContext
 * @property {string} [component] - Component where error occurred
 * @property {string} [operation] - Operation that failed
 * @property {Object} [metadata] - Additional error metadata
 */

class BaseError extends Error {
  /**
   * Create a BaseError.
   * @param {string} message - Error message
   * @param {Object} [options] - Error options
   * @param {Error} [options.cause] - Underlying cause
   * @param {ErrorContext} [options.context] - Additional context
   */
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.context = options.context || null;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for logging.
   * @return {Object} JSON representation
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

export { BaseError };
```

### Component 4: Enhanced Assert Utility

Extends assertCritical with typed error support.

```javascript
/**
 * Enhanced assertion utilities with typed error support.
 * 
 * @module utils/assert
 */

/**
 * @typedef {Object} AssertOptions
 * @property {Function} [ErrorClass] - Custom error class to throw
 * @property {Object} [context] - Additional error context
 */

/**
 * Assert a critical dependency is available.
 * @template T
 * @param {T} value - Value to check
 * @param {string} message - Error message if assertion fails
 * @param {AssertOptions} [options] - Assertion options
 * @return {NonNullable<T>} The validated value
 * @throws {Error} If value is falsy
 */
function assertCritical(value, message, options = {}) {
  if (!value) {
    const ErrorClass = options.ErrorClass || Error;
    const error = new ErrorClass(message, { context: options.context });
    error.isCritical = true;
    throw error;
  }
  return value;
}

export { assertCritical };
```

### Component 5: Test Mixin Pattern

Alternative pattern for using ServiceLifecycleMixin without eslint-disable.

```javascript
/**
 * Create a test service class using ServiceLifecycleMixin.
 * Uses a factory function pattern to avoid the new-cap eslint rule.
 * 
 * @param {Function} MixinFn - The mixin function (ServiceLifecycleMixin)
 * @param {Function} BaseClass - The base class to extend (EventEmitter)
 * @return {Function} Test service class
 */
function createMixedClass(MixinFn, BaseClass) {
  // Apply mixin to base class
  const MixedBase = MixinFn(BaseClass);
  
  // Return a class that extends the mixed base
  return class TestService extends MixedBase {
    constructor(serviceName) {
      super();
      this.initializeLifecycle(serviceName);
    }
  };
}

// Usage in test:
const TestServiceClass = createMixedClass(ServiceLifecycleMixin, EventEmitter);
const service = new TestServiceClass('test-service');
```

## Data Models

### State Constants (Standardized)

```javascript
// src/constants/states.js
const STATE = Object.freeze({
  ACTIVE: 'active',
  NORMAL: 'normal',      // Changed from 'NORMAL'
  READY: 'ready',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  STARTING: 'starting',
  CONNECTING: 'connecting',
  DISCOVERING: 'discovering',
  JOINING: 'joining',
  SYNCING: 'syncing',
  DRAINING: 'draining',
  STOPPED: 'stopped',
});

export { STATE };
```

### Error Class Hierarchy

```
BaseError (src/utils/base-error.js)
├── DependencyError (src/bootstrap/bootstrap-errors.js)
├── LifecycleError (src/bootstrap/bootstrap-errors.js)
├── PhaseTransitionError (src/bootstrap/bootstrap-errors.js)
├── PhaseTimeoutError (src/bootstrap/bootstrap-errors.js)
└── WriterDisabledError (src/bootstrap/bootstrap-errors.js)
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Message Router API Compatibility

*For any* public method on the original MessageRouter class, the refactored MessageRouter SHALL export a method with the same name and compatible signature.

**Validates: Requirements 1.1**

### Property 2: Connection State Behavior Equivalence

*For any* sequence of connection operations (connect, disconnect, reconnect), the refactored router SHALL produce the same connection state transitions as the original implementation.

**Validates: Requirements 1.4**

### Property 3: State Values Are Lowercase

*For any* state value in the STATE constant object, the value SHALL equal its lowercase representation (value === value.toLowerCase()).

**Validates: Requirements 3.1**

### Property 4: State Keys Are SCREAMING_SNAKE_CASE

*For any* key in the STATE constant object, the key SHALL match the pattern /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.

**Validates: Requirements 3.3**

### Property 5: Error Classes Extend BaseError and Set Name

*For any* error class in bootstrap-errors.js, instantiating the class SHALL produce an error where:
- The error is an instance of BaseError
- The error.name property equals the class name

**Validates: Requirements 4.2, 4.6**

### Property 6: assertCritical Returns Value for Truthy Input

*For any* truthy value passed to assertCritical, the function SHALL return that exact value unchanged.

**Validates: Requirements 5.2**

### Property 7: assertCritical Throws for Falsy Input

*For any* falsy value (null, undefined, 0, '', false) passed to assertCritical with a message, the function SHALL throw an error containing that message.

**Validates: Requirements 5.3**

## Error Handling

### Error Categories

1. **Validation Errors** - Invalid input to assertCritical or malformed addresses
2. **Lifecycle Errors** - Invalid state transitions in services
3. **Connection Errors** - WebSocket connection failures
4. **Dependency Errors** - Missing required dependencies

### Error Propagation

All errors follow the existing pattern:
- Critical errors are thrown with `isCritical: true` flag
- Non-critical errors are logged and returned in result objects
- Errors are never swallowed - always re-thrown or logged

### Error Context

The new BaseError class supports context objects for debugging:

```javascript
throw new DependencyError('BootstrapService', 'messageRouter', {
  context: {
    component: 'bootstrap',
    operation: 'initialize',
    nodeId: this.nodeId,
  },
});
```

## Testing Strategy

### Dual Testing Approach

This feature uses both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

### Property-Based Testing Configuration

- Library: fast-check
- Minimum iterations: 10 (per testing-guidelines.md)
- Each property test references its design document property
- Tag format: **Feature: code-quality-improvements, Property {number}: {property_text}**

### Test Organization

```
test/
├── transport/
│   ├── router-message-handler.test.js      # Unit tests for message handler
│   ├── router-server-manager.test.js       # Unit tests for server manager
│   └── message-router-api.property.test.js # Property tests for API compatibility
├── utils/
│   ├── base-error.test.js                  # Unit tests for BaseError
│   └── assert.property.test.js             # Property tests for assertCritical
├── constants/
│   └── states.property.test.js             # Property tests for state constants
└── bootstrap/
    └── bootstrap-errors.property.test.js   # Property tests for error classes
```

### Unit Test Focus

Unit tests should cover:
- Module import/export verification
- ESLint compliance verification
- File line count verification
- Error construction with cause and context
- Stack trace verification

### Property Test Focus

Property tests should cover:
- API method existence and signatures
- State value casing invariants
- Error class hierarchy
- assertCritical behavior for all input types

