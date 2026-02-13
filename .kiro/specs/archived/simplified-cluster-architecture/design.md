# Design Document: Simplified Cluster Architecture

## Overview

This design simplifies the distributed database cluster architecture to improve reliability and reduce race conditions while maintaining scalability to thousands of nodes. The key changes are:

1. **Unified Address Format** - Single canonical `{nodeId}/{serviceType}/{serviceId}` format everywhere
2. **Explicit Node Lifecycle State Machine** - Clear states with enforced transitions
3. **Immutable Assignment Epochs** - Versioned snapshots with compare-and-swap coordination
4. **Pull-Based Replica Assignment** - Joining nodes decide what to pull
5. **State-Aware Rebalancing** - Rebalancer respects node lifecycle states via CDC
6. **Epoch-Based System Cache** - Cache consistency tied to epoch numbers

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Node Architecture                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │ Node Lifecycle   │    │ Assignment       │    │ Address       │ │
│  │ State Machine    │───▶│ Epoch Manager    │───▶│ Manager       │ │
│  │                  │    │                  │    │               │ │
│  │ STARTING         │    │ epoch: 42        │    │ parse()       │ │
│  │ CONNECTING       │    │ assignments: {}  │    │ format()      │ │
│  │ DISCOVERING      │    │ proposeEpoch()   │    │ validate()    │ │
│  │ SYNCING          │    │ applyEpoch()     │    │               │ │
│  │ READY            │    │                  │    │               │ │
│  │ DRAINING         │    │                  │    │               │ │
│  │ STOPPED          │    │                  │    │               │ │
│  └──────────────────┘    └──────────────────┘    └───────────────┘ │
│           │                       │                                  │
│           ▼                       ▼                                  │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ System Cache     │◀───│ CDC Handler      │                       │
│  │                  │    │                  │                       │
│  │ currentEpoch: 42 │    │ onEpochChange()  │                       │
│  │ nodes: Map       │    │ onNodeState()    │                       │
│  │ partitions: Map  │    │                  │                       │
│  └──────────────────┘    └──────────────────┘                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Node Join Flow with Epochs

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Node 2  │     │ Node 1  │     │ Raft    │     │ CDC     │
│ (new)   │     │ (seed)  │     │ Leader  │     │ System  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ CONNECTING    │               │               │
     │──────────────▶│               │               │
     │               │               │               │
     │ DISCOVERING   │               │               │
     │ Get epoch     │               │               │
     │◀──────────────│               │               │
     │  (epoch=41)   │               │               │
     │               │               │               │
     │ JOINING       │               │               │
     │ Register      │               │               │
     │ state=JOINING │               │               │
     │──────────────▶│──────────────▶│               │
     │               │               │──────────────▶│
     │               │               │  CDC: node2   │
     │               │               │  state=JOINING│
     │               │               │               │
     │ Analyze       │               │               │
     │ assignments   │               │               │
     │ (local)       │               │               │
     │               │               │               │
     │ Propose       │               │               │
     │ epoch=42      │               │               │
     │──────────────▶│──────────────▶│               │
     │               │  CAS(41→42)   │               │
     │               │               │──────────────▶│
     │               │               │  CDC: epoch   │
     │               │               │  changed      │
     │               │               │               │
     │ Create        │               │               │
     │ replicas      │               │               │
     │ locally       │               │               │
     │               │               │               │
     │ SYNCING       │               │               │
     │ Sync data     │               │               │
     │◀─────────────▶│               │               │
     │               │               │               │
     │ READY         │               │               │
     │ Update        │               │               │
     │ state=READY   │               │               │
     │──────────────▶│──────────────▶│               │
     │               │               │──────────────▶│
     │               │               │  CDC: node2   │
     │               │               │  state=READY  │
     │               │               │               │
```

## Components and Interfaces

### AddressManager

Provides unified address parsing, formatting, and validation.

```javascript
/**
 * Unified address format: {nodeId}/{serviceType}/{serviceId}
 * 
 * Examples:
 *   node1/partition/tables-p1-r1
 *   node2/message-group/mg-1
 *   node1/raft/tables-p1
 */
class AddressManager {
  /**
   * Parse a unified address string into components
   * @param {string} address - Address in format nodeId/serviceType/serviceId
   * @returns {{nodeId: string, serviceType: string, serviceId: string}}
   * @throws {Error} if address is malformed
   */
  parse(address) {}

  /**
   * Format components into a unified address string
   * @param {string} nodeId
   * @param {string} serviceType
   * @param {string} serviceId
   * @returns {string}
   */
  format(nodeId, serviceType, serviceId) {}

  /**
   * Validate an address without throwing
   * @param {string} address
   * @returns {{valid: boolean, error?: string}}
   */
  validate(address) {}

  /**
   * Extract nodeId from a unified address
   * @param {string} address
   * @returns {string}
   */
  getNodeId(address) {}

  /**
   * Extract serviceType from a unified address
   * @param {string} address
   * @returns {string}
   */
  getServiceType(address) {}
}
```

### NodeLifecycleStateMachine

Manages explicit node lifecycle states with enforced transitions.

```javascript
const NodeState = {
  STARTING: 'starting',      // Process started, initializing local resources
  CONNECTING: 'connecting',  // Establishing WebSocket to seed nodes
  DISCOVERING: 'discovering',// Receiving system cache from seed
  JOINING: 'joining',        // Registered in cluster, proposing epoch, creating replicas
  SYNCING: 'syncing',        // Syncing replica data from existing nodes
  READY: 'ready',            // Accepting traffic, participating in Raft
  DRAINING: 'draining',      // Rejecting new requests, completing in-flight
  STOPPED: 'stopped'         // Fully stopped
};

const VALID_TRANSITIONS = {
  [NodeState.STARTING]: [NodeState.CONNECTING],
  [NodeState.CONNECTING]: [NodeState.DISCOVERING, NodeState.STOPPED],
  [NodeState.DISCOVERING]: [NodeState.JOINING, NodeState.STOPPED],
  [NodeState.JOINING]: [NodeState.SYNCING, NodeState.STOPPED],
  [NodeState.SYNCING]: [NodeState.READY, NodeState.STOPPED],
  [NodeState.READY]: [NodeState.DRAINING],
  [NodeState.DRAINING]: [NodeState.STOPPED],
  [NodeState.STOPPED]: []
};

class NodeLifecycleStateMachine extends EventEmitter {
  /**
   * Get current state
   * @returns {string}
   */
  getState() {}

  /**
   * Attempt to transition to a new state
   * @param {string} newState
   * @returns {boolean} true if transition succeeded
   * @emits 'stateChange' with {from, to, timestamp}
   */
  transition(newState) {}

  /**
   * Check if a transition is valid
   * @param {string} fromState
   * @param {string} toState
   * @returns {boolean}
   */
  isValidTransition(fromState, toState) {}

  /**
   * Check if node is in a state that accepts traffic
   * @returns {boolean}
   */
  isReady() {}

  /**
   * Check if node is shutting down
   * @returns {boolean}
   */
  isDraining() {}
}
```

### AssignmentEpochManager

Manages immutable assignment epochs with compare-and-swap coordination.

```javascript
/**
 * Assignment epoch structure:
 * {
 *   epoch: number,
 *   assignments: {
 *     [partitionId]: [nodeId, nodeId, nodeId],  // replica locations
 *   },
 *   timestamp: string,  // HLC timestamp
 *   proposedBy: string  // nodeId that proposed this epoch
 * }
 */
class AssignmentEpochManager {
  /**
   * Get current epoch
   * @returns {AssignmentEpoch}
   */
  getCurrentEpoch() {}

  /**
   * Propose a new epoch with updated assignments
   * Uses compare-and-swap: only succeeds if current epoch matches expected
   * @param {number} expectedEpoch - The epoch we're replacing
   * @param {Object} newAssignments - Updated partition assignments
   * @returns {Promise<{success: boolean, epoch?: AssignmentEpoch, error?: string}>}
   */
  proposeEpoch(expectedEpoch, newAssignments) {}

  /**
   * Apply an epoch received via CDC
   * @param {AssignmentEpoch} epoch
   * @returns {boolean} true if applied (newer than current)
   */
  applyEpoch(epoch) {}

  /**
   * Get assignments for a specific partition
   * @param {string} partitionId
   * @returns {string[]} array of nodeIds hosting replicas
   */
  getPartitionAssignments(partitionId) {}

  /**
   * Get all partitions assigned to a specific node
   * @param {string} nodeId
   * @returns {string[]} array of partitionIds
   */
  getNodeAssignments(nodeId) {}

  /**
   * Calculate optimal assignments for a joining node
   * @param {string} joiningNodeId
   * @param {string[]} allNodeIds
   * @returns {Object} proposed new assignments
   */
  calculateJoinAssignments(joiningNodeId, allNodeIds) {}
}
```

### PullBasedReplicaAssigner

Handles replica assignment from the joining node's perspective. The goal is to relieve load from overloaded nodes while respecting table replication policies.

```javascript
class PullBasedReplicaAssigner {
  /**
   * Analyze current epoch and decide which replicas to pull.
   * 
   * Strategy:
   * 1. Identify overloaded nodes (more replicas than average)
   * 2. For each table, check if replication policy allows redistribution
   * 3. Select replicas to pull that:
   *    - Come from overloaded nodes
   *    - Don't violate placement constraints (e.g., no two replicas on same node)
   *    - Respect table-specific replication factor
   * 4. Propose new assignments that improve balance
   * 
   * @param {AssignmentEpoch} currentEpoch
   * @param {string} thisNodeId
   * @param {string[]} allReadyNodes - Only READY nodes considered
   * @param {Map<string, TablePolicy>} tablePolicies - Replication policies per table
   * @returns {Object} proposed assignment changes
   */
  analyzeAndPropose(currentEpoch, thisNodeId, allReadyNodes, tablePolicies) {}

  /**
   * Calculate which replicas to pull based on load balancing
   * @param {Object} currentAssignments
   * @param {string} thisNodeId
   * @param {string[]} allNodes
   * @returns {{partitionId: string, fromNode: string}[]} replicas to pull
   */
  calculateReplicasToPull(currentAssignments, thisNodeId, allNodes) {}

  /**
   * Verify proposed assignments respect table policies
   * @param {Object} proposedAssignments
   * @param {Map<string, TablePolicy>} tablePolicies
   * @returns {{valid: boolean, violations: string[]}}
   */
  validateAgainstPolicies(proposedAssignments, tablePolicies) {}

  /**
   * Create replicas locally based on accepted epoch
   * @param {string[]} partitionIds - Partitions to create
   * @returns {Promise<void>}
   */
  createLocalReplicas(partitionIds) {}

  /**
   * Sync data from existing replicas
   * @param {string} partitionId
   * @param {string[]} sourceNodes
   * @returns {Promise<void>}
   */
  syncReplicaData(partitionId, sourceNodes) {}
}
```

### StateAwareRebalancer

Rebalancer that respects node lifecycle states.

```javascript
class StateAwareRebalancer {
  /**
   * Check if rebalancing should consider a node
   * @param {string} nodeId
   * @param {string} nodeState
   * @returns {boolean}
   */
  shouldConsiderNode(nodeId, nodeState) {}

  /**
   * Calculate rebalancing moves respecting node states
   * @param {AssignmentEpoch} currentEpoch
   * @param {Map<string, string>} nodeStates - nodeId -> state
   * @returns {Object} proposed assignment changes
   */
  calculateMoves(currentEpoch, nodeStates) {}

  /**
   * Handle CDC event for node state change
   * @param {string} nodeId
   * @param {string} oldState
   * @param {string} newState
   */
  onNodeStateChange(nodeId, oldState, newState) {}
}
```

## Data Models

### Assignment Epoch

```javascript
{
  epoch: 42,                    // Monotonically increasing version
  assignments: {
    'tables-p1': ['node1', 'node2', 'node3'],
    'nodes-p1': ['node1', 'node2', 'node3'],
    'partitions-p1': ['node1', 'node2', 'node3'],
    // ... all partitions
  },
  timestamp: '2026-01-22T10:30:00.000Z-0001-node1',  // HLC timestamp
  proposedBy: 'node2'           // Node that proposed this epoch
}
```

### Node State Record

```javascript
{
  nodeId: 'node2',
  state: 'ready',               // One of NodeState values
  address: 'ws://192.168.1.2:3000',
  lastStateChange: '2026-01-22T10:30:00.000Z',
  epoch: 42                     // Epoch when node became READY
}
```

### Unified Address

```javascript
// String format
'node1/partition/tables-p1-r1'

// Parsed structure
{
  nodeId: 'node1',
  serviceType: 'partition',     // 'partition', 'message-group', 'raft', etc.
  serviceId: 'tables-p1-r1'
}
```

### System Cache with Epoch

```javascript
{
  currentEpoch: 42,
  nodes: Map<nodeId, NodeRecord>,
  partitions: Map<partitionId, PartitionRecord>,
  services: Map<serviceId, ServiceRecord>,
  // ... other system tables
  
  // Methods
  getEpoch(): number,
  updateFromEpoch(epoch: AssignmentEpoch): void,
  getReadyNodes(): string[],
  getPartitionNodes(partitionId: string): string[]
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Address Round-Trip Consistency

*For any* valid address components (nodeId, serviceType, serviceId), formatting then parsing SHALL produce an equivalent structured object, and parsing then formatting SHALL produce the original string.

**Validates: Requirements 1.5, 1.6, 1.7**

### Property 2: Malformed Address Rejection

*For any* string that does not contain exactly three slash-separated non-empty components, the Address_Manager SHALL reject it with an error.

**Validates: Requirements 1.2, 1.3**

### Property 3: State Transition Validity

*For any* current state and attempted target state, the Node_Lifecycle_Service SHALL only allow the transition if it exists in the VALID_TRANSITIONS map.

**Validates: Requirements 2.3**

### Property 4: State Change Event Emission

*For any* valid state transition, the Node_Lifecycle_Service SHALL emit exactly one 'stateChange' event containing the from state, to state, and timestamp.

**Validates: Requirements 2.2**

### Property 5: Epoch Monotonic Increment

*For any* sequence of epoch transitions, each new epoch number SHALL be exactly one greater than the previous epoch number.

**Validates: Requirements 3.2, 3.8**

### Property 6: Epoch Immutability

*For any* created epoch object, the epoch number and assignments SHALL not change after creation. Any modification attempt SHALL create a new epoch instead.

**Validates: Requirements 3.3**

### Property 7: Epoch Compare-and-Swap Correctness

*For any* epoch proposal with expectedEpoch E, the proposal SHALL succeed only if the current epoch equals E, and SHALL fail with epoch mismatch error otherwise.

**Validates: Requirements 3.6**

### Property 8: Rebalancer Respects Node States

*For any* set of nodes with various states, the Rebalancer SHALL only include nodes in READY state when calculating replica placements.

**Validates: Requirements 5.3, 5.6**

### Property 9: Rebalancer Moves From Draining Nodes

*For any* node in DRAINING state that hosts replicas, the Rebalancer SHALL propose moves to relocate those replicas to READY nodes.

**Validates: Requirements 5.8**

### Property 10: Cache State Filtering

*For any* system cache containing nodes with various states, filtering by state SHALL return exactly the nodes matching that state.

**Validates: Requirements 5.9**

### Property 11: Concurrent Epoch Proposals

*For any* set of concurrent epoch proposals from different nodes, exactly one SHALL succeed and all others SHALL fail with epoch mismatch.

**Validates: Requirements 6.3**

### Property 12: Placement Policy Compliance

*For any* rebalancing proposal, no partition SHALL have multiple replicas assigned to the same node.

**Validates: Requirements 6.5**

### Property 13: Cache Rejects Old Epochs

*For any* epoch update where the incoming epoch number is less than or equal to the current cached epoch, the update SHALL be rejected.

**Validates: Requirements 7.5**

### Property 14: Join Assignment Relieves Overloaded Nodes

*For any* joining node analyzing current assignments where some nodes are overloaded (above average replica count), the proposed assignments SHALL reduce the replica count on at least one overloaded node while respecting table replication policies.

**Validates: Requirements 4.2, 4.3, 4.4**

### Property 15: Rebalancer Batches Moves

*For any* rebalancing calculation that identifies multiple necessary moves, the Rebalancer SHALL produce a single epoch proposal containing all moves rather than multiple proposals.

**Validates: Requirements 6.4**

## Error Handling

### Address Validation Errors

- **MalformedAddressError**: Thrown when address doesn't match `{nodeId}/{serviceType}/{serviceId}` format
- **EmptyComponentError**: Thrown when any address component is empty
- Error messages include the invalid address and specific validation failure

### State Machine Errors

- **InvalidTransitionError**: Thrown when attempting invalid state transition
- Includes current state, attempted state, and valid transitions from current state
- State machine remains in current state on error

### Epoch Errors

- **EpochMismatchError**: Thrown when CAS fails due to stale epoch
- Includes expected epoch, actual epoch, and suggestion to retry
- **StaleEpochError**: Thrown when applying an epoch older than current
- Includes incoming epoch and current epoch

### Rebalancing Errors

- **NoReadyNodesError**: Thrown when no READY nodes available for placement
- **PlacementPolicyViolationError**: Thrown when proposed placement violates policies
- Rebalancer logs errors but continues operating (eventual consistency)

## Testing Strategy

### Unit Tests

Unit tests verify specific examples and edge cases:

1. **Address Manager**
   - Parse valid addresses with various component values
   - Reject addresses with missing components
   - Reject addresses with empty components
   - Handle edge cases (special characters, long strings)

2. **Node Lifecycle State Machine**
   - Verify each valid transition
   - Verify rejection of each invalid transition
   - Verify event emission on transition

3. **Assignment Epoch Manager**
   - Create epochs with valid assignments
   - Verify CAS success and failure cases
   - Verify epoch application and rejection

4. **State-Aware Rebalancer**
   - Filter nodes by state correctly
   - Generate valid placement proposals
   - Respect placement policies

### Property-Based Tests

Property-based tests verify universal properties across many generated inputs using fast-check:

1. **Address round-trip** (Property 1): Generate random valid components, verify round-trip
2. **Malformed address rejection** (Property 2): Generate invalid addresses, verify rejection
3. **State transition validity** (Property 3): Generate state pairs, verify transition rules
4. **Epoch monotonic increment** (Property 5): Generate epoch sequences, verify increment
5. **Epoch immutability** (Property 6): Create epochs, attempt mutation, verify unchanged
6. **CAS correctness** (Property 7): Generate concurrent proposals, verify CAS behavior
7. **Rebalancer state filtering** (Property 8): Generate node states, verify filtering
8. **Placement policy** (Property 12): Generate placements, verify no duplicate nodes
9. **Cache epoch rejection** (Property 13): Generate epoch updates, verify rejection of old

**Configuration**: All property tests run with `{numRuns: 10}` per testing guidelines.

**Tag Format**: `Feature: simplified-cluster-architecture, Property N: {property_text}`
