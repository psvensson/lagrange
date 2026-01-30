# System Cache Seeding Architecture - START HERE

Welcome! This document will guide you through the complete specification for fixing the system cache seeding architecture.

## The Problem in 30 Seconds

Integration tests fail because joining nodes can't write to system tables. The bootstrap response only contains partition leader addresses, not complete system state. Joining nodes use bootstrap directories as a workaround, but this is incomplete and inconsistent.

## The Solution in 30 Seconds

The bootstrap response should contain complete snapshots of ALL system tables. Joining nodes hydrate their cache from these snapshots and then route all queries through the system cache (the single source of truth).

## Document Guide

### 📋 Start with these (in order):

1. **README.md** (5 min read)
   - Overview of all documents
   - Quick reference table
   - Key insights

2. **requirements.md** (10 min read)
   - What needs to be built
   - 7 core requirements
   - Acceptance criteria

3. **design.md** (20 min read)
   - How to build it
   - **Refactoring Overview** - High-level changes
   - **Detailed Implementation Guide** - Step-by-step instructions
   - Component changes with code examples

### 🎯 Use these during implementation:

4. **IMPLEMENTATION_SUMMARY.md** (5 min read)
   - Quick reference
   - 5 implementation phases
   - Code patterns
   - Success criteria

5. **REFACTORING_CHECKLIST.md** (30 min to execute)
   - Detailed step-by-step guide
   - 5 phases with 34 tasks
   - Checkpoints
   - Sign-off

### 📊 Reference these:

6. **tasks.md** (5 min read)
   - Task list format
   - 9 phases, 34 tasks
   - Checkpoint definitions

7. **ARCHITECTURE_DIAGRAMS.md** (10 min read)
   - Visual diagrams
   - Data flow sequences
   - Component interactions

## Quick Navigation

**I want to...**

- **Understand the problem** → Read `requirements.md`
- **Understand the solution** → Read `design.md` (Refactoring Overview section)
- **See visual diagrams** → Read `ARCHITECTURE_DIAGRAMS.md`
- **Get a quick overview** → Read `IMPLEMENTATION_SUMMARY.md`
- **Start implementing** → Follow `REFACTORING_CHECKLIST.md`
- **Track progress** → Use `tasks.md`

## Key Concepts

### System Cache is the Single Source of Truth

After bootstrap, ALL queries use the system cache to find partition locations and leaders. No other caches exist.

### Bootstrap Response Contains Complete State

Instead of just partition leader addresses, the bootstrap response includes complete snapshots of all system tables:
- nodes
- partitions
- services
- tables
- message_groups
- replica_operations

### Joining Node Hydration

When a joining node receives the bootstrap response, it:
1. Extracts system table snapshots
2. Inserts all records into its system cache
3. Clears bootstrap directories
4. Subscribes to CDC events
5. Registers itself in the cluster
6. Can now perform any query (read or write)

### CDC Keeps Cache Updated

As the cluster state changes, CDC events propagate to all nodes, keeping their system caches in sync.

## Implementation Roadmap

| Phase | Component | Changes | Risk | Effort |
|-------|-----------|---------|------|--------|
| 1 | BootstrapAPI | Add snapshot building | Low | 1-2h |
| 2 | NodeJoiningService | Add hydration, registration, CDC | Medium | 2-3h |
| 3 | SQLQueryEngine + QueryExecutor | Route all queries through cache | High | 3-4h |
| 4 | Both | Remove bootstrap directories | High | 2-3h |
| 5 | Integration tests | Fix and add tests | Medium | 4-5h |

**Total: 12-17 hours**

## Success Criteria

- ✓ Bootstrap response includes complete system table snapshots
- ✓ Joining nodes can hydrate cache from bootstrap response
- ✓ All queries route through system cache to partition leaders
- ✓ Cache stays updated via CDC subscriptions
- ✓ Integration tests pass
- ✓ Bootstrap and hydration complete in < 150ms total
- ✓ No bootstrap directory fallbacks needed
- ✓ Clear error messages if cache is missing data

## Files to Modify

| File | Changes | Complexity |
|------|---------|------------|
| `src/bootstrap/bootstrap-api.js` | Add snapshot building | Low |
| `src/bootstrap/node-joining-service.js` | Add hydration, registration, CDC | High |
| `src/query/sql-query-engine.js` | Cache-only routing | Medium |
| `src/query/query-executor.js` | Cache-based leader lookup | High |
| `test/integration/admin-cdc-propagation.integration.test.js` | Fix tests | Medium |

## Key Code Patterns

### Reading from System Cache
```javascript
const records = this.systemCache.getAll(TABLES.NODES) || [];
const filtered = this.systemCache.filter(TABLES.SERVICES, (s) =>
  s.partition_id === partitionId && s.raft_role === RAFT_ROLE.LEADER,
) || [];
```

### Inserting into System Cache
```javascript
for (const record of records) {
  cache.insert(tableName, record);
}
```

### Routing Queries Through Message Router
```javascript
const leaderAddress = this.findPartitionLeaderAddress(partitionId);
const result = await this.messageRouter.deliver(leaderAddress, {
  type: 'QUERY',
  operation: 'SELECT',
  sql: ast,
  params,
});
```

## Common Pitfalls to Avoid

1. ❌ Don't forget to clear bootstrap directories after hydration
2. ❌ Don't use bootstrap directories as fallback
3. ❌ Don't forget CDC subscriptions
4. ❌ Don't forget to register the joining node
5. ❌ Don't forget error handling

## Testing Strategy

- **Unit Tests**: Verify individual methods
- **Integration Tests**: Verify multi-node cluster
- **Property-Based Tests**: Verify correctness properties
- **Performance Tests**: Verify bootstrap speed

## Single Code Path

- Bootstrap response contains only `systemTableSnapshots`
- All nodes use the system cache as the single source of truth
- No fallback mechanisms or legacy code paths

## Architecture Principles

From the steering documents:

1. **All system information is stored in tables** - No other caches
2. **System cache is the single source of truth** - After bootstrap
3. **CDC keeps cache updated** - All nodes subscribe to CDC events
4. **All communication through message router** - No direct partition access
5. **Most nodes won't have partition replicas** - But their cache will have all leader addresses

## Next Steps

1. Read `requirements.md` to understand what needs to be built
2. Read `design.md` to understand how to build it
3. Read `IMPLEMENTATION_SUMMARY.md` for a quick overview
4. Follow `REFACTORING_CHECKLIST.md` to implement it
5. Use `tasks.md` to track progress

## Questions?

- **What?** → `requirements.md`
- **How?** → `design.md`
- **Visual?** → `ARCHITECTURE_DIAGRAMS.md`
- **Quick?** → `IMPLEMENTATION_SUMMARY.md`
- **Step-by-step?** → `REFACTORING_CHECKLIST.md`
- **Tasks?** → `tasks.md`

---

**Ready to start?** → Open `requirements.md` next
