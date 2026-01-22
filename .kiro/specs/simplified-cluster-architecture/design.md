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
     │ 1. Connect    │               │               │
     │──────────────▶│               │               │
     │               │               │               │
     │ 2. Get epoch  │               │               │
     │◀──────────────│               │               │
     │  (epoch=41)   │               │               │
     │               │               │               │
     │ 3. Register   │               │               │
     │   JOINING     │               │               │
     │──────────────▶│──────────────▶│               │
     │               │               │──────────────▶│
     │               │               │  CDC: node2   │
     │               │               │  state=JOINING│
     │               │               │               │
     │ 4. Analyze    │               │               │
     │   assignments │               │               │
     │   (local)     │               │               │
     │               │               │               │
     │ 5. Propose    │               │               │
     │   epoch=42    │               │               │
     │──────────────▶│──────────────▶│               │
     │               │  CAS(41→42)   │               │
     │               │               │──────────────▶│
     │               │               │  CDC: epoch   │
     │               │               │  changed      │
     │               │               │               │
     │ 6. Create     │               │               │
     │   replicas    │               │               │
     │   locally     │               │               │
     │               │               │               │
     │ 7. Sync data  │               │               │
     │◀─────────────▶│               │               │
     │               │               │               │
     │ 8. Update     │               │               │
     │   state=READY │               │               │
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
  STARTING: 'starting',
  CONNECTING: 'connecting',
  DISCOVERING: 'discovering',
  SYNCING: 'syncing',
  READY: 'ready',
  DRAINING: 'draining',
  STOPPED: 'stopped'
};

const VALID_TRANSITIONS = {
  [NodeState.STARTING]: [NodeState.CONNECTING],
  [NodeState.CONNECTING]: [NodeState.DISCOVERING, NodeState.STOPPED],
  [NodeState.DISCOVERING]: [NodeState.SYNCING, NodeState.STOPPED],
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

Handles replica assignment from the joining node's perspective.

```javascript
class PullBasedReplicaAssigner {
  /**
   * Analyze current epoch and decide which replicas to pull
   * @param {AssignmentEpoch} currentEpoch
   * @param {string} thisNodeId
   * @param {string[]} allReadyNodes
   * @returns {Object} proposed assignment changes
   */
  analyzeAndPropose(currentEpoch, thisNodeId, allReadyNodes) {}

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

