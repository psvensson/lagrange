# Design Document: Bootstrap Architecture Refactoring

## Overview

This design document describes the architectural refactoring of the bootstrap and node joining services in the distributed database system. The refactoring addresses several key issues:

1. **Setter-based initialization** - Services like `SQLQueryEngine` can be created with null dependencies and have them set later, causing bugs when services are used before ready
2. **Large monolithic files** - Both `bootstrap-service.js` (2568 lines) and `node-joining-service.js` (2619 lines) contain too many responsibilities
3. **Code duplication** - ~60% of code is shared between the two services but duplicated
4. **Inconsistent service lifecycle** - Services have varying lifecycle methods
5. **Manual phase tracking** - Phase transitions are scattered throughout the code

The solution introduces:
- **Phase-scoped services** that solve the chicken-and-egg problem during seed node bootstrap
- **Phase pipeline architecture** where each phase creates services for the next
- **Shared setup components** to eliminate duplication
- **Standardized service lifecycle interface** for consistency

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Bootstrap Pipeline                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │ Infrastructure│───▶│Message Groups│───▶│  Partitions  │                   │
│  │    Phase     │    │    Phase     │    │    Phase     │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │ NodeService  │    │MessageGroup  │    │ Partition    │                   │
│  │MessageRouter │    │  Services    │    │  Services    │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                 │                            │
│                                                 ▼                            │
│                           ┌──────────────────────────────────┐              │
│                           │      Registration Phase          │              │
│                           │  (BootstrapPartitionWriter)      │              │
│                           └──────────────────────────────────┘              │
│                                          │                                   │
│                                          ▼                                   │
│                           ┌──────────────────────────────────┐              │
│                           │    Cache Hydration Phase         │              │
│                           │  (Creates SQLQueryEngine)        │              │
│                           └──────────────────────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase-Scoped Services Pattern

The chicken-and-egg problem during seed node bootstrap:
1. `SQLQueryEngine` needs `SystemTableCache` to route queries
2. `SystemTableCache` needs data from partitions to be populated
3. Partitions need to be written to via `SQLQueryEngine` (normally)
4. But we can't use `SQLQueryEngine` until cache is populated!

Solution: Create two distinct service types instead of one class with a mode flag:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Phase-Scoped Services                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Registration Phase (Before Cache):                                          │
│  ┌─────────────────────────────────┐                                        │
│  │   BootstrapPartitionWriter      │                                        │
│  │   - Writes directly to local    │                                        │
│  │     partition services          │                                        │
│  │   - No cache dependency         │                                        │
│  │   - Disabled after registration │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                              │
│  Normal Operation (After Cache Hydration):                                   │
│  ┌─────────────────────────────────┐                                        │
│  │      SQLQueryEngine             │                                        │
│  │   - Routes through cache        │                                        │
│  │   - Cache is REQUIRED           │                                        │
│  │   - Used for all normal ops     │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Shared Setup Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Shared Setup Components                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │ MessageRouterSetup  │  │ ReplicaHandlerSetup │  │ ControlPlaneSetup   │  │
│  │                     │  │                     │  │                     │  │
│  │ - Create router     │  │ - Create handler    │  │ - Create service    │  │
│  │ - Configure server  │  │ - Register handlers │  │ - Register node     │  │
│  │ - Self-connect      │  │ - State machine     │  │ - Start heartbeat   │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│                                                                              │
│  ┌─────────────────────┐                                                    │
│  │  CDCIntegrationSetup│                                                    │
│  │                     │                                                    │
│  │ - Create service    │                                                    │
│  │ - Configure mode    │                                                    │
│  │ - Set dependencies  │                                                    │
│  └─────────────────────┘                                                    │
│                                                                              │
│  Used by both BootstrapService and NodeJoiningService                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Service Lifecycle Interface

All services will implement a standard lifecycle interface:

```javascript
/**
 * Standard service lifecycle states.
 */
const ServiceState = {
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
};

/**
 * Service lifecycle interface.
 * All services must implement these methods.
 */
class ServiceLifecycle {
  /**
   * One-time setup. Transitions from CREATED to INITIALIZED.
   * @return {Promise<void>}
   */
  async initialize() {}

  /**
   * Begin operation. Transitions from INITIALIZED to RUNNING.
   * @return {Promise<void>}
   */
  async start() {}

  /**
   * Graceful shutdown. Transitions from RUNNING to STOPPED.
   * @return {Promise<void>}
   */
  async stop() {}

  /**
   * Get current lifecycle state.
   * @return {string} Current state from ServiceState enum.
   */
  getState() {}
}
```

### Phase Interface

Each bootstrap phase implements a common interface:

```javascript
/**
 * Bootstrap phase interface.
 * Each phase receives dependencies and returns created services.
 */
class BootstrapPhase {
  /**
   * Create phase with dependencies.
   * @param {Object} dependencies - Services from previous phases.
   */
  constructor(dependencies) {}

  /**
   * Execute the phase.
   * @return {Promise<Object>} Services created by this phase.
   */
  async execute() {}

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {}
}
```

### BootstrapPartitionWriter

Direct partition writer for seed node registration phase:

```javascript
/**
 * Direct partition writer for bootstrap phase.
 * Writes directly to local partitions without requiring system cache.
 * Only used during seed node registration phase.
 */
class BootstrapPartitionWriter {
  /**
   * Create bootstrap partition writer.
   * @param {Object} options - Configuration options.
   * @param {Map} options.partitionServices - Map of local partition services (REQUIRED).
   * @param {string} options.nodeId - Node ID for logging.
   */
  constructor({partitionServices, nodeId}) {
    this.partitionServices = assertCritical(
      partitionServices,
      'partitionServices is required for BootstrapPartitionWriter'
    );
    this.nodeId = nodeId;
    this.enabled = true;
  }

  /**
   * Write to a system table partition directly.
   * @param {string} tableName - System table name.
   * @param {string} operation - CDC operation type.
   * @param {Object} data - Data to write.
   * @return {Promise<Object>} Write result.
   */
  async write(tableName, operation, data) {}

  /**
   * Disable the writer after registration phase.
   * Prevents accidental use after cache is hydrated.
   */
  disable() {
    this.enabled = false;
  }
}
```

### SQLQueryEngine (Refactored)

The refactored SQLQueryEngine requires all dependencies at construction:

```javascript
/**
 * SQL Query Engine - Main entry point for SQL query processing.
 * Routes queries through system cache to partition leaders.
 * 
 * IMPORTANT: All required dependencies must be provided at construction.
 * This class does NOT support setter-based initialization.
 */
class SQLQueryEngine {
  /**
   * Create SQL query engine with required dependencies.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache (REQUIRED).
   * @param {Object} options.messageRouter - Message router (REQUIRED).
   * @param {string} options.nodeId - Node ID.
   */
  constructor({systemCache, messageRouter, nodeId}) {
    this.systemCache = assertCritical(
      systemCache,
      'systemCache is required for SQLQueryEngine'
    );
    this.messageRouter = assertCritical(
      messageRouter,
      'messageRouter is required for SQLQueryEngine'
    );
    this.nodeId = nodeId || 'sql-query-engine';
    
    // Initialize sub-components with required dependencies
    this.partitionResolver = new PartitionResolver({systemCache});
    this.queryExecutor = new QueryExecutor({messageRouter, systemCache, nodeId});
    this.tableCreationService = new TableCreationService({systemCache});
  }
}
```

### Phase State Machine

Formal state machine for tracking bootstrap phases:

```javascript
/**
 * Bootstrap phase state machine.
 * Enforces valid phase transitions and tracks timing.
 */
class BootstrapPhaseStateMachine extends EventEmitter {
  /**
   * Create state machine with initial phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.initialPhase - Starting phase.
   * @param {Object} options.transitions - Valid transitions map.
   */
  constructor({initialPhase, transitions}) {}

  /**
   * Transition to a new phase.
   * @param {string} targetPhase - Phase to transition to.
   * @throws {Error} If transition is invalid.
   */
  transition(targetPhase) {}

  /**
   * Get current phase.
   * @return {string} Current phase.
   */
  getCurrentPhase() {}

  /**
   * Get valid next phases from current state.
   * @return {Array<string>} Valid target phases.
   */
  getValidTransitions() {}

  /**
   * Get duration of a completed phase.
   * @param {string} phase - Phase name.
   * @return {number|null} Duration in ms or null if not completed.
   */
  getPhaseDuration(phase) {}
}
```

### Shared Setup Components

#### MessageRouterSetup

```javascript
/**
 * Shared message router setup used by both bootstrap paths.
 */
class MessageRouterSetup {
  /**
   * Create and configure message router.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID.
   * @param {string} options.nodeAddress - Node address.
   * @param {number} options.wsPort - WebSocket port.
   * @return {Promise<Object>} Configured message router.
   */
  static async create({nodeId, nodeAddress, wsPort}) {}
}
```

#### ReplicaHandlerSetup

```javascript
/**
 * Shared replica handler setup used by both bootstrap paths.
 */
class ReplicaHandlerSetup {
  /**
   * Create and configure replica handler.
   * @param {Object} options - Configuration options.
   * @param {Object} options.messageRouter - Message router.
   * @param {Object} options.nodeService - Node service.
   * @param {Map} options.partitionServices - Partition services map.
   * @param {Map} options.messageGroupServices - Message group services map.
   * @return {Object} Configured replica handler and state machine.
   */
  static create({messageRouter, nodeService, partitionServices, messageGroupServices}) {}
}
```

#### ControlPlaneSetup

```javascript
/**
 * Shared control plane setup used by both bootstrap paths.
 */
class ControlPlaneSetup {
  /**
   * Create and configure control plane service.
   * @param {Object} options - Configuration options.
   * @param {Object} options.messageRouter - Message router.
   * @param {Object} options.replicaHandler - Replica handler.
   * @param {Object} options.systemCache - System cache.
   * @param {string} options.nodeId - Node ID.
   * @return {Promise<Object>} Configured control plane service.
   */
  static async create({messageRouter, replicaHandler, systemCache, nodeId}) {}
}
```

## Data Models

### Phase Result

Each phase returns a standardized result object:

```javascript
/**
 * Result returned by a bootstrap phase.
 */
const PhaseResult = {
  // Phase identification
  phaseName: 'string',
  duration: 'number',
  
  // Services created by this phase
  services: {
    // Map of service name to service instance
  },
  
  // Metadata
  metadata: {
    // Phase-specific metadata
  }
};
```

### Service Dependency Graph

```javascript
/**
 * Dependency graph for bootstrap services.
 * Shows which services depend on which others.
 */
const ServiceDependencyGraph = {
  // Infrastructure phase creates these (no dependencies)
  NodeService: [],
  MessageRouter: [],
  
  // Message group phase depends on infrastructure
  MessageGroupService: ['MessageRouter'],
  
  // Partition phase depends on infrastructure and message groups
  PartitionService: ['MessageRouter', 'MessageGroupService'],
  
  // Registration phase uses bootstrap writer (depends on partitions)
  BootstrapPartitionWriter: ['PartitionService'],
  
  // Cache hydration reads from partitions
  SystemTableCache: ['PartitionService'],
  
  // SQL engine requires cache (created after hydration)
  SQLQueryEngine: ['SystemTableCache', 'MessageRouter'],
  
  // Control plane requires SQL engine
  ControlPlaneService: ['SQLQueryEngine', 'MessageRouter', 'ReplicaHandler'],
};
```

### Bootstrap Configuration

```javascript
/**
 * Configuration for bootstrap process.
 */
const BootstrapConfig = {
  // Timing configuration
  replicaStaggerDelayMs: 'number',
  leadershipWaitTimeoutMs: 'number',
  leadershipWaitInitialDelayMs: 'number',
  leadershipWaitMaxDelayMs: 'number',
  leadershipWaitBackoffMultiplier: 'number',
  
  // WebSocket configuration
  wsPort: 'number',
  
  // Storage configuration
  dataDir: 'string',
  partitionDbPath: 'string',
};
```

### Phase Transition Map

```javascript
/**
 * Valid phase transitions for seed node bootstrap.
 */
const SeedBootstrapTransitions = {
  NOT_STARTED: ['INFRASTRUCTURE'],
  INFRASTRUCTURE: ['MESSAGE_GROUPS'],
  MESSAGE_GROUPS: ['PARTITIONS'],
  PARTITIONS: ['REGISTRATION'],
  REGISTRATION: ['CACHE_HYDRATION'],
  CACHE_HYDRATION: ['COMPLETE'],
  COMPLETE: [],
};

/**
 * Valid phase transitions for joining node bootstrap.
 */
const JoiningNodeTransitions = {
  NOT_STARTED: ['CONTACTING_SEED'],
  CONTACTING_SEED: ['CONNECTING_WEBSOCKET'],
  CONNECTING_WEBSOCKET: ['CREATING_MESSAGE_GROUP', 'JOINING_MESSAGE_GROUP'],
  CREATING_MESSAGE_GROUP: ['WAITING_LEADERSHIP'],
  JOINING_MESSAGE_GROUP: ['WAITING_LEADERSHIP'],
  WAITING_LEADERSHIP: ['QUERYING_STATE'],
  QUERYING_STATE: ['SYNCING'],
  SYNCING: ['COMPLETE'],
  COMPLETE: [],
};
```

