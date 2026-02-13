# System Cache Seeding Architecture - Complete Specification

This directory contains the complete specification for implementing the system cache seeding architecture fix.

## Problem

Integration tests are failing because joining nodes cannot write to system tables. The root cause is that the bootstrap response only contains `partitionLeaders`, not complete system table snapshots. Joining nodes use bootstrap directories as a temporary workaround, but this is inconsistent and incomplete.

## Solution

The bootstrap response should contain complete snapshots of ALL system tables, allowing joining nodes to hydrate their cache immediately and perform any query (read or write) through the system cache.

## Documents

### 1. **requirements.md** - What needs to be built
- 7 core requirements
- Acceptance criteria for each requirement
- Non-functional requirements (performance, reliability, consistency)
- Architecture principles from steering documents

**Read this first to understand what we're building.**

### 2. **design.md** - How to build it
- Architecture overview (current vs target state)
- **Refactoring overview** - High-level changes needed
  - Key principles
  - Refactoring scope (4 main components)
  - 5 refactoring phases with risk/effort estimates
  - File changes summary
  - Breaking changes analysis
  - Performance and correctness impact
- **Detailed implementation guide** - Step-by-step instructions
  - Understanding current code
  - 6 implementation steps with code patterns
  - Testing patterns for each step
- Component changes with code examples
- Data flow diagrams
- Correctness properties and validation
- Testing strategy
- Migration path
- Risk mitigation

**Read this to understand the architecture and implementation approach.**

### 3. **tasks.md** - What tasks to execute
- 9 implementation phases
- 34 specific tasks
- 5 checkpoint tasks
- Success criteria

**Use this as a task list during implementation.**

### 4. **IMPLEMENTATION_SUMMARY.md** - Quick reference
- Problem statement
- Solution overview
- Implementation roadmap (5 phases)
- Key files to modify
- Code patterns
- Testing strategy
- Success criteria
- Checkpoints
- Common pitfalls
- Performance targets

**Read this for a quick overview before starting implementation.**

### 5. **REFACTORING_CHECKLIST.md** - Detailed step-by-step guide
- Phase 1: Bootstrap Response Enhancement (6 steps)
- Phase 2: System Cache Hydration (6 steps)
- Phase 3: SQL Engine Cache-Based Routing (5 steps)
- Phase 4: Bootstrap Directory Elimination (5 steps)
- Phase 5: Integration Testing (6 steps)
- Final verification checklist

**Use this as a detailed checklist during implementation.**

## Quick Start

1. **Understand the problem**: Read `requirements.md`
2. **Understand the solution**: Read `design.md` (especially Refactoring Overview)
3. **Plan the work**: Review `IMPLEMENTATION_SUMMARY.md`
4. **Execute the work**: Follow `REFACTORING_CHECKLIST.md`
5. **Track progress**: Use `tasks.md` as a task list

## Key Insights

### Architecture Principle
**System cache is the ONLY source of truth for partition locations and leaders after bootstrap.**

### Current Problem
```
Bootstrap Response: {partitionLeaders: {...}}
Joining Node: "I don't know where to write to replica_operations table!"
Workaround: Use bootstrap directories (temporary, inconsistent)
```

### Target Solution
```
Bootstrap Response: {systemTableSnapshots: {nodes: [...], partitions: [...], services: [...], ...}}
Joining Node: "I have complete cluster state, I can write to any system table!"
Result: All queries route through system cache (single source of truth)
```

## Refactoring Overview

| Phase | Component | Changes | Risk | Effort |
|-------|-----------|---------|------|--------|
| 1 | BootstrapAPI | Add `buildSystemTableSnapshots()` | Low | 1-2h |
| 2 | NodeJoiningService | Add hydration, registration, CDC subscription | Medium | 2-3h |
| 3 | SQLQueryEngine + QueryExecutor | Route all queries through cache | High | 3-4h |
| 4 | Both | Remove bootstrap directories | High | 2-3h |
| 5 | Integration tests | Fix and add tests | Medium | 4-5h |

**Total Effort**: 12-17 hours

## File Changes

| File | Changes | Lines | Complexity |
|------|---------|-------|------------|
| `src/bootstrap/bootstrap-api.js` | Add snapshot building | +50 | Low |
| `src/bootstrap/node-joining-service.js` | Add hydration, registration, CDC | +150 | High |
| `src/query/sql-query-engine.js` | Cache-only routing | +30 | Medium |
| `src/query/query-executor.js` | Cache-based leader lookup | +80 | High |
| `test/integration/admin-cdc-propagation.integration.test.js` | Fix tests | +50 | Medium |

## Success Criteria

- ✓ Bootstrap response includes complete system table snapshots
- ✓ Joining nodes can hydrate cache from bootstrap response
- ✓ All queries route through system cache to partition leaders
- ✓ Cache stays updated via CDC subscriptions
- ✓ Integration tests pass (admin-cdc-propagation, multi-node cluster)
- ✓ Bootstrap and hydration complete in < 150ms total
- ✓ No bootstrap directory fallbacks needed
- ✓ Clear error messages if cache is missing data

## Related Documentation

- **Steering**: `.kiro/steering/system guidelines.md` - System architecture principles
- **Steering**: `.kiro/steering/code-style.md` - Code style requirements
- **Steering**: `.kiro/steering/testing-guidelines.md` - Testing requirements
- **Existing Spec**: `.kiro/specs/node-joining-rebalancer-fixes/requirements.md` - Related fixes

## Implementation Notes

### Key Code Patterns

**Reading from System Cache**:
```javascript
const records = this.systemCache.getAll(TABLES.NODES) || [];
const filtered = this.systemCache.filter(TABLES.SERVICES, (s) =>
  s.partition_id === partitionId && s.raft_role === RAFT_ROLE.LEADER,
) || [];
```

**Inserting into System Cache**:
```javascript
for (const record of records) {
  cache.insert(tableName, record);
}
```

**Routing Queries Through Message Router**:
```javascript
const leaderAddress = this.findPartitionLeaderAddress(partitionId);
const result = await this.messageRouter.deliver(leaderAddress, {
  type: 'QUERY',
  operation: 'SELECT',
  sql: ast,
  params,
});
```

### Testing Strategy

- **Unit Tests**: Verify individual methods work correctly
- **Integration Tests**: Verify multi-node cluster works end-to-end
- **Property-Based Tests**: Verify correctness properties hold
- **Performance Tests**: Verify bootstrap and hydration are fast

### Single Code Path

- Bootstrap response contains only `systemTableSnapshots`
- All nodes use the system cache as the single source of truth
- No fallback mechanisms or legacy code paths

## Questions?

Refer to the specific documents:
- **What?** → `requirements.md`
- **How?** → `design.md`
- **What tasks?** → `tasks.md`
- **Quick overview?** → `IMPLEMENTATION_SUMMARY.md`
- **Step-by-step?** → `REFACTORING_CHECKLIST.md`
