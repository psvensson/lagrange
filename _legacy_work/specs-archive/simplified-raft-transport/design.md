# Design Document: Simplified Raft Transport

## Overview

This design eliminates the unnecessary message type conversion layer in the liferaft integration. Instead of converting liferaft packet types (`vote`, `voted`, `append`, `appended`) to custom types (`RAFT_REQUEST_VOTE`, etc.) and back, packets flow through the transport unchanged. The receiver detects Raft packets by checking the native `type` field and routes them directly to liferaft.

This design applies to both message groups and partitions, enabling consistent Raft transport behavior and code reuse across entity types.

## Architecture

### Current Architecture (Being Replaced)

```
┌─────────────────┐     ┌─────────────────────┐     ┌───────────────┐
│   liferaft      │────▶│ RaftTransportAdapter │────▶│ MessageRouter │
│ (sends packet)  │     │ (converts types)     │     │ (delivers)    │
└─────────────────┘     └─────────────────────┘     └───────────────┘
                                                            │
                                                            ▼
┌─────────────────┐     ┌─────────────────────┐     ┌───────────────┐
│   liferaft      │◀────│ MessageGroupService  │◀────│ Handler       │
│ (receives)      │     │ (converts back)      │     │ (unwraps)     │
└─────────────────┘     └─────────────────────┘     └───────────────┘
```

### New Architecture (Simplified)

```
┌─────────────────┐     ┌───────────────┐
│   liferaft      │────▶│ MessageRouter │
│ RaftNode.write()│     │ (delivers)    │
└─────────────────┘     └───────────────┘
                               │
                               ▼
┌─────────────────┐     ┌───────────────┐
│   liferaft      │◀────│ Handler       │
│ raft.emit()     │     │ (detects)     │
└─────────────────┘     └───────────────┘
```

### Unified Architecture for Message Groups and Partitions

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Raft Utilities                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ isRaftPacket()  │  │ RAFT_PACKET_TYPES│  │ SQLiteLogAdapter│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│   MessageGroupService   │       │    PartitionService     │
│  ┌───────────────────┐  │       │  ┌───────────────────┐  │
│  │ RaftNode extends  │  │       │  │ RaftNode extends  │  │
│  │ LifeRaft          │  │       │  │ LifeRaft          │  │
│  │ - write()         │  │       │  │ - write()         │  │
│  └───────────────────┘  │       │  └───────────────────┘  │
│  - InMemoryLogAdapter   │       │  - SQLiteLogAdapter     │
│  - receiveMessage()     │       │  - handleTransportMsg() │
└─────────────────────────┘       └─────────────────────────┘
              │                                 │
              └────────────────┬────────────────┘
                               ▼
                    ┌───────────────────┐
                    │   MessageRouter   │
                    │   (WebSocket)     │
                    └───────────────────┘
```

## Components and Interfaces

### Shared Raft Utilities Module (src/raft/raft-packet-utils.js)

Shared utilities for Raft packet detection used by both message groups and partitions:

```javascript
/**
 * Native liferaft packet types.
 * Used for detecting Raft packets without type conversion.
 */
export const RAFT_PACKET_TYPES = new Set(['vote', 'voted', 'append', 'appended', 'error']);

/**
 * Detect if a payload is a native liferaft Raft packet.
 * Checks for native liferaft type values: 'vote', 'voted', 'append', 'appended'.
 * @param {Object} payload - Message payload to check.
 * @return {boolean} True if payload is a Raft packet.
 */
export function isRaftPacket(payload) {
  return Boolean(
    payload &&
    typeof payload.type === 'string' &&
    RAFT_PACKET_TYPES.has(payload.type),
  );
}
```

### RaftNode Class (Extended LifeRaft)

The RaftNode class extends LifeRaft and implements the `write()` method directly, without an intermediate adapter.

```javascript
class RaftNode extends LifeRaft {
  constructor(address, options, messageRouter, nodeId) {
    super(address, options);
    this.messageRouter = messageRouter;
    this.nodeId = nodeId;
  }

  /**
   * Send a Raft packet to a peer.
   * Preserves all packet fields, only adds destination for routing.
   */
  write(packet, callback) {
    // this.address is the destination peer (set by liferaft when cloning)
    const peerAddress = this.buildPeerAddress(this.address);
    
    // Send packet unchanged - no type conversion
    this.messageRouter.deliver(peerAddress, packet)
      .then((result) => callback(null, result))
      .catch((err) => callback(err));
  }

  buildPeerAddress(peerId) {
    if (peerId.includes('/')) return peerId;
    return `${this.nodeId}/message-group/${peerId}`;
  }
}
```

### PartitionService RaftNode Class

Similar to MessageGroupService, but uses partition entity type in addresses:

```javascript
class PartitionRaftNode extends LifeRaft {
  constructor(address, options, messageRouter, nodeId, systemTableCache) {
    super(address, options);
    this.messageRouter = messageRouter;
    this.nodeId = nodeId;
    this.systemTableCache = systemTableCache;
  }

  /**
   * Send a Raft packet to a peer partition replica.
   * Preserves all packet fields, only adds destination for routing.
   */
  write(packet, callback) {
    const peerAddress = this.buildPeerAddress(this.address);
    
    // Send packet unchanged - no type conversion
    this.messageRouter.deliver(peerAddress, packet)
      .then((result) => callback(null, result))
      .catch((err) => callback(err));
  }

  buildPeerAddress(peerId) {
    if (peerId.includes('/')) return peerId;
    
    // Try to look up nodeId from system table cache
    if (this.systemTableCache) {
      const service = this.systemTableCache.get('services', peerId);
      if (service && service.node_id) {
        return `${service.node_id}/partition/${peerId}`;
      }
    }
    
    return `${this.nodeId}/partition/${peerId}`;
  }
}
```

### Raft Packet Detection

A simple function to detect if a payload is a liferaft packet:

```javascript
const RAFT_PACKET_TYPES = new Set(['vote', 'voted', 'append', 'appended']);

function isRaftPacket(payload) {
  return payload && 
         typeof payload.type === 'string' && 
         RAFT_PACKET_TYPES.has(payload.type);
}
```

### MessageGroupService.receiveMessage()

The receive method detects Raft packets and routes them appropriately:

```javascript
async receiveMessage(message) {
  const payload = message.payload || message;
  
  // Detect and handle Raft packets directly
  if (isRaftPacket(payload)) {
    if (this.raft) {
      this.raft.emit('data', payload);
    }
    return { acknowledged: true };
  }
  
  // Handle application messages
  return this.handleApplicationMessage(message);
}
```

### Handler Registration

The handler registered with MessageRouter simply forwards to receiveMessage:

```javascript
const address = `${nodeId}/message-group/${replicaId}`;
router.register(address, (envelope) => {
  return messageGroup.receiveMessage(envelope);
});
```

### PartitionService.handleTransportMessage()

The partition transport handler detects Raft packets and routes them appropriately:

```javascript
async handleTransportMessage(envelope) {
  const payload = envelope.payload || envelope;
  
  // Detect and handle Raft packets directly using shared utility
  if (isRaftPacket(payload)) {
    if (this.raft) {
      // Create write function for sending responses back to the sender
      const senderAddress = payload.address;
      const write = (responsePacket) => {
        if (responsePacket) {
          this.transport.deliver(senderAddress, responsePacket)
            .catch((err) => {
              this.logger.error('Failed to send Raft response', {
                error: err.message,
                destination: senderAddress,
              });
            });
        }
      };
      
      this.raft.emit('data', payload, write);
    }
    return { acknowledged: true };
  }
  
  // Handle application messages (data operations)
  return this.handleApplicationMessage(envelope);
}
```

### SQLiteLogAdapter for Partitions

Partitions use SQLite-backed storage for Raft log persistence:

```javascript
/**
 * SQLite-backed log adapter for liferaft.
 * Persists Raft log entries to the partition's SQLite database.
 */
class SQLiteLogAdapter {
  constructor(db, partitionId) {
    this.db = db;
    this.partitionId = partitionId;
    this.initializeTables();
  }

  initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
  }

  /**
   * Get the last log entry info.
   * Required by liferaft for log consistency checks.
   */
  getLastInfo() {
    const row = this.db.prepare(
      'SELECT log_index, term FROM _raft_log ORDER BY log_index DESC LIMIT 1'
    ).get();
    
    if (!row) {
      return { index: 0, term: 0 };
    }
    return { index: row.log_index, term: row.term };
  }

  /**
   * Get a specific log entry.
   */
  get(index) {
    const row = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index = ?'
    ).get(index);
    
    if (!row) return null;
    return {
      index: row.log_index,
      term: row.term,
      command: JSON.parse(row.command),
    };
  }

  /**
   * Append a new log entry.
   */
  put(entry) {
    this.db.prepare(
      'INSERT INTO _raft_log (log_index, term, command, timestamp) VALUES (?, ?, ?, ?)'
    ).run(entry.index, entry.term, JSON.stringify(entry.command), Date.now());
  }

  /**
   * Remove entries from a specific index onwards.
   */
  removeFrom(index) {
    this.db.prepare('DELETE FROM _raft_log WHERE log_index >= ?').run(index);
  }

  /**
   * Get entries in a range.
   */
  getRange(startIndex, endIndex) {
    const rows = this.db.prepare(
      'SELECT log_index, term, command FROM _raft_log WHERE log_index >= ? AND log_index <= ? ORDER BY log_index'
    ).all(startIndex, endIndex);
    
    return rows.map(row => ({
      index: row.log_index,
      term: row.term,
      command: JSON.parse(row.command),
    }));
  }
}
```

## Data Models

### Liferaft Packet Structure (Unchanged)

```javascript
{
  type: 'vote' | 'voted' | 'append' | 'appended',
  term: number,
  address: string,      // Sender's address
  state: number,        // Raft state constant
  leader: string,       // Current leader address
  last: { term, index }, // Last log entry info
  data: any             // Command data (for append)
}
```

### Message Envelope (From MessageRouter)

```javascript
{
  messageId: string,
  sourceAddress: string,
  sourceNodeId: string,
  targetAddress: string,
  payload: object,      // Contains the Raft packet or app message
  timestamp: number
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Packet Round-Trip Preservation

*For any* valid liferaft packet, sending it through the transport and receiving it SHALL produce a packet with all original fields preserved and equivalent values.

**Validates: Requirements 1.1, 1.4**

### Property 2: Raft Packet Detection

*For any* message payload, the system SHALL correctly classify it as a Raft packet if and only if it has a `type` field with value `'vote'`, `'voted'`, `'append'`, or `'appended'`. Raft packets SHALL be emitted to liferaft, and non-Raft payloads SHALL be handled as application messages.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: RaftNode.write() Field Preservation

*For any* packet passed to RaftNode.write(), the packet delivered to MessageRouter SHALL contain all original fields unchanged, and the callback SHALL be invoked with the delivery result.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 4: Partition Packet Round-Trip Preservation

*For any* valid liferaft packet sent to a partition, sending it through the transport and receiving it SHALL produce a packet with all original fields preserved and equivalent values.

**Validates: Requirements 8.2, 8.5**

### Property 5: Shared Raft Detection Consistency

*For any* message payload, the shared isRaftPacket() function SHALL produce the same result when called from MessageGroupService or PartitionService.

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 6: Partition RaftNode.write() Field Preservation

*For any* packet passed to PartitionService's RaftNode.write(), the packet delivered to MessageRouter SHALL contain all original fields unchanged.

**Validates: Requirements 10.2, 10.3, 10.4**

### Property 7: SQLite Log Adapter Round-Trip

*For any* valid log entry, writing it to SQLiteLogAdapter and reading it back SHALL produce an equivalent entry with the same index, term, and command.

**Validates: Requirements 12.2, 12.5**

## Error Handling

### Transport Errors

When MessageRouter.deliver() fails:
- The callback is invoked with the error
- liferaft handles retry logic internally based on its election/heartbeat timers

### Invalid Packets

When a malformed packet is received:
- If it doesn't match Raft packet criteria, it's treated as an application message
- Application message handling can reject invalid messages

### Connection Loss

When WebSocket connection is lost:
- MessageRouter handles reconnection
- liferaft's election timeout triggers re-election if leader is unreachable

## Testing Strategy

### Unit Tests

- Test `isRaftPacket()` function with various inputs
- Test RaftNode.write() calls MessageRouter.deliver() correctly
- Test receiveMessage() routes Raft packets to liferaft

### Property-Based Tests

Using fast-check with `{numRuns: 10}`:

1. **Packet Round-Trip Test**: Generate random valid liferaft packets, send through transport, verify all fields preserved
2. **Raft Detection Test**: Generate random payloads (some Raft, some not), verify correct classification
3. **Write Preservation Test**: Generate random packets, verify write() preserves all fields

### Integration Tests

- Multi-node cluster test: Verify leadership election succeeds with simplified transport
- Message delivery test: Verify application messages still work alongside Raft traffic

## Migration Notes

### Files to Modify

1. `src/message-group/message-group-service.js`
   - Remove RaftTransportAdapter usage
   - Implement RaftNode class inline
   - Add isRaftPacket() function
   - Simplify receiveMessage() to detect and route Raft packets

2. `src/raft/raft-transport-adapter.js`
   - Delete this file

3. `test/raft/transport-adapter-message-delivery.property.test.js`
   - Update to test new simplified transport

### Files to Create

1. `src/raft/raft-packet-utils.js`
   - Extract isRaftPacket() and RAFT_PACKET_TYPES to shared module
   - Export functions for use by both MessageGroupService and PartitionService

2. `src/raft/sqlite-log-adapter.js` (update existing)
   - Ensure SQLiteLogAdapter implements liferaft Log interface
   - Add getLastInfo(), get(), put(), removeFrom(), getRange() methods

### Files to Modify for Partition Support

1. `src/partition/partition-service.js`
   - Import liferaft library
   - Import shared isRaftPacket() from raft-packet-utils.js
   - Import SQLiteLogAdapter
   - Remove custom Raft implementation methods:
     - handleAppendEntries()
     - handleRequestVote()
     - handleAppendEntriesResponse()
     - handleRequestVoteResponse()
     - startElectionTimer()
     - stopElectionTimer()
     - becomeLeader()
     - startElection()
     - sendHeartbeat()
     - stopHeartbeat()
     - replicateEntry()
   - Add RaftNode class extending LifeRaft
   - Update initialize() to create liferaft instance
   - Update handleTransportMessage() to use isRaftPacket()
   - Wire up liferaft events (leader, follower, candidate, commit)

2. `src/message-group/message-group-service.js`
   - Import isRaftPacket() from shared module instead of defining locally
   - Remove local RAFT_PACKET_TYPES constant

### Debug Logging Cleanup

Remove all `console.log` statements from:
- `src/raft/raft-transport-adapter.js` (file being deleted)
- `src/transport/message-router.js` (handleServiceMessage debug log)
- `src/message-group/message-group-service.js` (if any)
- `src/partition/partition-service.js` (if any)

Replace with `this.logger.debug()` calls where diagnostic output is needed.
