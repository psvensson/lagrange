# Error Handling

## Failure Scenarios and Recovery Strategies

This section documents how the system handles various failure scenarios, following industry best practices from distributed systems literature, particularly CockroachDB's approach to fault tolerance and the Raft consensus algorithm.

**References:**
- [CockroachDB Architecture](https://www.cockroachlabs.com/docs/stable/architecture/overview.html)
- [Raft Consensus Algorithm](https://raft.github.io/)
- [Google Spanner Paper](https://research.google/pubs/pub39966/)
- [Designing Data-Intensive Applications](https://dataintensive.net/) by Martin Kleppmann

## 1. Single Node Failure

**Scenario:** One node crashes or becomes unreachable.

**Detection:**
- Heartbeat timeout (default: 5 seconds)
- Raft leader election timeout (default: 1-2 seconds)
- Message delivery failures with retry exhaustion

**Impact:**
- Partitions with replicas on failed node: Majority (2/3) still available → **No service disruption**
- Message groups with replicas on failed node: Majority (2/3) still available → **No service disruption**
- Raft automatically elects new leaders for affected groups

**Recovery:**
1. Failure detector marks node as failed in system tables (via CDC)
2. Rebalancer identifies under-replicated partitions and message groups
3. New replicas created on healthy nodes within 30-60 seconds
4. New replicas sync state from existing replicas via Raft snapshot + log replay
5. System returns to full replication factor

**Guarantees Maintained:**
- ✅ Data availability (majority quorum)
- ✅ Consistency (Raft consensus)
- ✅ No data loss (replicated before acknowledgment)

## 2. Multiple Node Failures (Minority)

**Scenario:** Multiple nodes fail, but less than majority (e.g., 1 out of 3 nodes in a 3-node cluster).

**Detection:** Same as single node failure, but affects more partitions.

**Impact:**
- Most partitions maintain majority quorum → **Service continues**
- Some partitions may lose majority if all replicas were on failed nodes → **Those partitions become unavailable**

**Recovery:**
1. Same as single node failure, but more replicas need replacement
2. Rebalancer prioritizes partitions with lowest replica count
3. Recovery time proportional to number of affected partitions

**Guarantees Maintained:**
- ✅ Consistency for available partitions
- ⚠️ Availability reduced for partitions without quorum
- ✅ No data loss for partitions with quorum

## 3. Majority Node Failure (Catastrophic)

**Scenario:** Majority of nodes fail (e.g., 2 out of 3 nodes).

**Detection:** Immediate - most Raft groups lose quorum.

**Impact:**
- **System becomes read-only or unavailable**
- No writes can be committed (no quorum)
- Reads may be stale or unavailable depending on configuration

**Recovery:**
1. Manual intervention required to restore majority
2. Bring failed nodes back online OR
3. Manually reconfigure Raft groups to remove failed nodes (dangerous - requires operator judgment)

**Guarantees Maintained:**
- ✅ Consistency (no writes without quorum prevents split-brain)
- ❌ Availability (system unavailable)
- ✅ No data loss (committed data preserved on surviving nodes)

**Prevention:** Deploy across multiple availability zones with odd replica counts (3, 5, 7).

## 4. Network Partition (Split-Brain Scenario)

**Scenario:** Network splits cluster into two or more isolated groups.

**Detection:**
- Nodes in minority partition cannot reach majority
- Raft election timeouts in minority partition
- Heartbeat failures across partition boundary

**Impact:**
- **Majority partition:** Continues operating normally
- **Minority partition:** Cannot commit writes (no quorum), becomes read-only or unavailable
- Prevents split-brain by design (Raft's majority requirement)

**Recovery:**
1. When network heals, minority partition rejoins automatically
2. Minority replicas sync missed updates from majority via Raft log
3. No manual intervention required
4. Conflicting writes impossible (minority couldn't commit)

**Guarantees Maintained:**
- ✅ Consistency (Raft prevents split-brain)
- ⚠️ Availability (minority partition unavailable for writes)
- ✅ No data loss or conflicts

## 5. Leader Failure

**Scenario:** The Raft leader for a partition or message group crashes.

**Detection:**
- Followers detect missing heartbeats from leader
- Election timeout triggers (1-2 seconds)

**Impact:**
- **Brief unavailability** during leader election (1-2 seconds)
- In-flight requests may fail and need retry
- No data loss (committed entries are on majority)

**Recovery:**
1. Followers start election after timeout
2. Candidate with most up-to-date log wins
3. New leader resumes operations
4. Clients retry failed requests to new leader

**Guarantees Maintained:**
- ✅ Consistency (new leader has all committed entries)
- ⚠️ Brief unavailability (1-2 second election)
- ✅ No data loss

## 6. Slow/Unresponsive Node (Gray Failure)

**Scenario:** Node is alive but responding slowly (disk issues, CPU saturation, network congestion).

**Detection:**
- Request timeouts
- Increased latency metrics
- Raft heartbeat delays (but not complete failure)

**Impact:**
- Increased tail latency for requests routed to slow node
- May cause Raft leader to step down if heartbeats are too slow
- Other replicas remain healthy

**Recovery:**
1. Clients retry to alternative replicas (load balancing)
2. If persistent, failure detector eventually marks node as failed
3. Rebalancer moves replicas away from slow node
4. Operator investigates root cause (disk, network, etc.)

**Mitigation:**
- Speculative execution: Query multiple replicas, use fastest response
- Adaptive timeouts based on observed latency
- Health checks beyond simple heartbeats

## 7. Data Corruption

**Scenario:** Disk corruption, bit flips, or software bugs corrupt data on one or more replicas.

**Detection:**
- Checksum validation on read
- Raft log integrity checks
- Replica comparison during sync

**Impact:**
- Corrupted replica serves incorrect data
- May cause Raft log divergence

**Recovery:**
1. Detect corruption via checksum mismatch
2. Mark corrupted replica as failed
3. Create new replica from healthy replicas
4. Corrupted replica syncs from leader (full snapshot)
5. If all replicas corrupted: restore from backup (if available)

**Prevention:**
- Checksums on all stored data
- Regular integrity checks
- ECC memory and reliable storage

## 8. Message Loss or Duplication

**Scenario:** Network drops messages or delivers them multiple times.

**Detection:**
- Raft sequence numbers detect gaps or duplicates
- Message acknowledgments track delivery

**Impact:**
- **Message loss:** Raft retransmits from log
- **Message duplication:** Raft deduplicates via sequence numbers

**Recovery:**
- Automatic - Raft handles retransmission and deduplication
- No application-level intervention needed

**Guarantees Maintained:**
- ✅ Exactly-once semantics (Raft deduplication)
- ✅ Ordered delivery (Raft log sequence)
- ✅ No message loss (persistent log)

## 9. Clock Skew

**Scenario:** System clocks drift apart across nodes.

**Detection:**
- HLC (Hybrid Logical Clock) detects skew via logical component
- Monitoring alerts on excessive physical clock drift

**Impact:**
- Timestamps may not reflect true real-time ordering
- HLC's logical component maintains correctness despite skew

**Recovery:**
- HLC automatically compensates using logical clock
- Operator should sync clocks via NTP
- System remains correct even with moderate skew (up to configured threshold)

**Guarantees Maintained:**
- ✅ Consistency (HLC logical component ensures ordering)
- ✅ External consistency (within clock skew bounds)
- ⚠️ Timestamps may not match wall clock exactly

**Prevention:**
- Deploy NTP on all nodes
- Monitor clock skew
- Configure maximum tolerable skew (e.g., 500ms)

## 10. Cascading Failures

**Scenario:** One failure triggers additional failures (e.g., load spike on remaining nodes causes them to fail).

**Detection:**
- Multiple simultaneous node failures
- Rapid increase in error rates
- Resource exhaustion metrics

**Impact:**
- Can lead to total system unavailability
- Most dangerous failure mode

**Prevention:**
1. **Load shedding:** Reject requests when overloaded rather than crash
2. **Circuit breakers:** Stop sending requests to failing services
3. **Backpressure:** Slow down clients when system is overloaded
4. **Resource limits:** Prevent any single operation from exhausting resources
5. **Graceful degradation:** Reduce functionality rather than fail completely

**Recovery:**
1. Identify root cause (often a single overloaded component)
2. Reduce load (rate limiting, reject non-critical requests)
3. Bring nodes back gradually (avoid thundering herd)
4. Monitor for stability before resuming full traffic

## 11. Partition Split/Merge Failures

**Scenario:** Split or merge operation fails midway (node crashes, network partition, etc.).

**Detection:**
- Split/merge coordinator detects failure
- Timeout on split/merge operation

**Impact:**
- Temporary inconsistency in partition metadata
- Some queries may fail during transition

**Recovery:**
1. **Atomic switchover:** Use two-phase commit for metadata updates
2. **Rollback:** If split/merge fails, revert to original partition
3. **Retry:** Coordinator retries operation after failure recovery
4. **Idempotency:** Split/merge operations are idempotent (safe to retry)

**Guarantees Maintained:**
- ✅ No data loss (data copied before switchover)
- ⚠️ Brief unavailability during recovery
- ✅ Consistency (atomic metadata updates)

## 12. Bootstrap Failures

**Scenario:** Node fails during initial cluster bootstrap or when joining cluster.

**Detection:**
- Bootstrap timeout
- Incomplete service initialization
- Partially created system tables or Raft logs

**Impact:**
- Node doesn't join cluster
- Cluster remains at previous size
- Partial state may exist on failed node

**Recovery Strategy: Clean Slate and Exit**

The system uses a simple "clean slate and exit" approach. Bootstrap failures are rare (once per node lifetime), and the system state is minimal (in-memory message groups + low-volume system table metadata). Automatic retry logic would add complexity without significant benefit.

**On Bootstrap Failure:**

```javascript
async function performBootstrap(config) {
  try {
    logger.info('Starting bootstrap', { nodeId: config.nodeId });
    
    // Phase 1: Infrastructure setup
    await setupInfrastructure();
    
    // Phase 2: Message group creation/joining
    await initializeMessageGroups(config);
    
    // Phase 3: Partition creation/joining
    await initializePartitions(config);
    
    // Phase 4: Service registration
    await registerServices(config);
    
    logger.info('Bootstrap completed successfully', { nodeId: config.nodeId });
    
  } catch (error) {
    logger.error('Bootstrap failed, cleaning up and exiting', {
      nodeId: config.nodeId,
      error: error.message,
      stack: error.stack,
      phase: error.phase || 'unknown'
    });
    
    // Clean up partial state
    await cleanupPartialBootstrap();
    
    // Exit with error code - operator/orchestrator will handle retry
    process.exit(1);
  }
}
```
