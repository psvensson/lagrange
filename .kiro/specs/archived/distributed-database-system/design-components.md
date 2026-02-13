# Components and Interfaces

## Library Dependencies

The system will leverage proven, mature libraries for core functionality:

**Consensus and Replication:**
- `raft-logic` - Raft consensus implementation for both partition replicas and message groups
- `better-sqlite3` - High-performance SQLite bindings for partition storage

**Threading and Concurrency:**
- `worker_threads` - Node.js built-in worker threads for service isolation
- `piscina` - High-performance worker thread pool management
- `atomics` - Shared memory primitives for inter-thread communication
- `shared-array-buffer` - Shared memory between main thread and workers

**Networking and Communication:**
- `ws` - WebSocket implementation for inter-node communication
- `fastify` - High-performance web framework for REST APIs and HTTP services
- Message groups serve as the unified transport layer for all inter-service communication

**Logging and Observability:**
- `pino` - High-performance structured logging library
- `pino-pretty` - Human-readable log formatting for development

**Configuration and Validation:**
- `ajv` - JSON schema validation for configuration and data validation
- `dotenv` - Environment variable management

**Testing:**
- `fast-check` - Property-based testing framework
- `tap` - Test framework with built-in assertions and coverage

**Utilities:**
- `uuid` - RFC-compliant UUID generation for unique identifiers
- `lodash` - Utility functions for data manipulation

## Library Selection Rationale

**Why raft-logic**: Mature, well-tested Raft implementation specifically designed for JavaScript/Node.js environments. Provides both the consensus algorithm and the necessary abstractions for building distributed systems.

**Why better-sqlite3**: High-performance SQLite bindings with synchronous API that integrates well with Raft consensus patterns. Provides ACID guarantees at the partition level.

**Why pino**: Extremely fast structured logging library with minimal overhead. Supports multiple output formats and integrates well with monitoring systems.

**Why fastify**: High-performance web framework with built-in schema validation, plugin system, and excellent TypeScript support. Significantly faster than Express while maintaining ease of use.

**Why piscina**: High-performance worker thread pool that provides excellent load balancing, automatic scaling, and efficient task distribution. Handles the complexity of worker lifecycle management.

**Why worker_threads**: Node.js built-in threading that allows true parallelism while maintaining message-passing safety. Each service can run in isolation without blocking the main event loop.

## Threading Architecture

The system uses a hybrid threading model optimized for Node.js:

**Main Thread (Message Loop)**:
- Handles all network I/O using libuv's event loop
- Routes messages between services and external clients
- Manages worker thread pool lifecycle
- Coordinates cross-service communication

**Worker Threads (Service Execution)**:
- Each service (partition replica, message group replica) runs in its own worker thread
- Services communicate with main thread via message passing
- Heavy computational work (SQL queries, Raft consensus) happens in workers
- Shared memory used for high-frequency data exchange

**Thread Pool Management**:
```javascript
// Main thread coordinates service execution
class ServiceThreadManager {
  constructor() {
    this.pool = new Piscina({
      filename: './service-worker.js',
      minThreads: 2,
      maxThreads: os.cpus().length,
      idleTimeout: 30000
    });
  }
  
  async executeServiceOperation(serviceId, operation, data) {
    return this.pool.run({ serviceId, operation, data });
  }
}
```

**Inter-Service Communication Flow**:
1. External request arrives at main thread (via WebSocket/HTTP)
2. Main thread routes to appropriate service worker
3. Service worker processes request (SQL, Raft operations)
4. Results passed back through main thread
5. Main thread sends response to client

This architecture ensures:
- **Non-blocking I/O**: Main thread never blocks on service operations
- **Service Isolation**: Each service runs independently without interference
- **Efficient Resource Usage**: Thread pool scales based on load
- **Message Ordering**: Main thread ensures proper message sequencing

## Implementation Guidelines

The system implementation must adhere to strict coding guidelines defined in the requirements:

**Code Quality Constraints:**
- **Single Code Path**: Maintain exactly one implementation path for each functionality
- **No Feature Flags**: Use flags only for enabling/disabling observability features
- **Complete Rewrites**: When functionality changes, replace entirely without legacy support
- **No Conditional Compilation**: Avoid feature flags for core functionality

**Configuration Standards:**
- **Central Configuration**: All constants must reference the central configuration system
- **No Magic Numbers**: Avoid free-standing string or number literals in code
- **Symbolic Names**: Use descriptive configuration keys for all literal values

**JavaScript Standards:**
- **Google JavaScript Lint Rules**: ALL generated code MUST comply with Google JavaScript ESLint rules from the start
- **ES6+ Modules**: Use ES6 import/export syntax (not CommonJS require/module.exports)
- **Trailing Commas**: Always include trailing commas in multi-line objects, arrays, and function parameters
- **Unused Variables**: Prefix unused function parameters with underscore (e.g., `_unused`)
- **Line Length**: Maximum 100 characters per line
- **Indentation**: Use 2 spaces (not tabs)
- **Quotes**: Use single quotes for strings
- **Semicolons**: Always include semicolons at end of statements
- **ES6+ Only**: Use modern JavaScript features, Node.js 22.x
- **Modular Design**: Prefer small, descriptive functions over complex conditionals
- **File Size Limits**: Keep files under 500 lines for maintainability

**Library Integration:**
- **Best-of-Breed**: Leverage proven libraries rather than custom implementations
- **Consistent APIs**: Maintain uniform interfaces across all components
- **Error Handling**: Use library-native error handling patterns

**Linting Compliance:**
- ALL code must pass `npm run lint` without errors or warnings
- Run ESLint with `--fix` option to automatically fix formatting issues
- Never commit code that fails linting checks
- The project uses `.eslintrc.json` with Google JavaScript style guide as base

These guidelines ensure the codebase remains clean, maintainable, and follows industry best practices while leveraging the threading architecture effectively.
