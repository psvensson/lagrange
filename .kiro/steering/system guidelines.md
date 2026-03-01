---
inclusion: always
---

# System Guidelines — Mandatory Rules for All Code Generation

These rules are non-negotiable. Every rule applies to every code change, every
new file, and every refactor. When in doubt, the rule wins.

---

## 1. ZERO DUPLICATION CONTRACT (highest priority)

This is the single most important rule in the entire system. Violations of this
rule have caused real production bugs. Read every sub-rule carefully.

### 1.1 One Owner Per Concern

Every piece of logic, every state transition, every data transformation, every
decision MUST have exactly ONE owning component. No exceptions.

Before writing ANY new function, method, class, or code block, you MUST:

1. Search the codebase for existing code that does the same thing or overlaps.
2. If it exists, use it. Do not create a second version.
3. If it exists but needs modification, modify the original. Do not fork it.
4. If you are unsure whether something already exists, search first. Do not guess.

### 1.2 No Parallel Implementations

It is FORBIDDEN to:

- Create a new function that does what an existing function already does.
- Add a field/property that carries the same semantic meaning as an existing one
  (e.g., `m.type` and `m.operation` meaning the same thing).
- Introduce a "helper" or "utility" that reimplements logic from another module.
- Create a "wrapper" that silently duplicates the behavior of the thing it wraps.
- Add a second code path "just in case" or "as a fallback."

### 1.3 No Fallback Code Paths

There must be exactly ONE code path for any given operation. Specifically:

- No "if new way fails, try old way" patterns.
- No feature flags that keep two implementations alive simultaneously.
- No "legacy" code sitting alongside "new" code.
- When something changes, it changes completely. Remove the old path.

### 1.4 Single Source of Truth for State

Each piece of state (node status, replica role, epoch, etc.) is owned by exactly
one component. Other components that need that state MUST read it from the owner.
They must NOT maintain their own copy, shadow, or derived version of that state.

Concrete ownership assignments (see architecture.md for full list):

- Node state → `NodeLifecycleStateMachine`
- Replica state → `ReplicaStateMachine`
- Epoch → `config.current_epoch` via CDC
- Placement planning → `MovePlanner` (only)
- Operation lifecycle → `RebalanceCoordinator` + `replica_operations`
- Dispatch → `ReplicaDispatchService`
- Failure detection → `FailureDetector` (single instance, no duplicates)
- System cache → `SystemTableCache` (one per node, fed only by CDC)

### 1.4.1 Injected Owners Must Be Used

If a component is constructed with an owner dependency such as
`replicaStateMachine`, `serviceLifecycleManager`, `failureDetector`, or another
explicit owner, that component MUST route the owned behavior through it.

It is FORBIDDEN to:

- Accept the owner as a dependency and then persist the same state directly.
- Keep parallel local logic for the same transition "just in case".
- Treat an injected owner as optional when the owned behavior still executes.
- Leave owner dependencies unused while mutating the owned state elsewhere.

An injected-but-bypassed owner is an architecture violation, not a cleanup task.

### 1.4.2 One Owner Per System-Table Row Lifecycle

For every system-table-backed entity, exactly one component must own the row
lifecycle:

- Row creation
- Row lifecycle transitions
- Row deletion

Other components may request actions through that owner, but they may NOT:

- Create temporary or repair rows themselves
- Recreate missing rows from partial local knowledge
- Mix row creation into status-update code paths

### 1.4.3 One Owner Per Field Subset

For shared system-table rows, field ownership must be explicit and non-overlapping.

Example: a `services` row may have different owners for:

- Identity fields: `service_id`, `service_type`, `node_id`, `partition_id`,
  `replica_id`, `address`, `created_at`
- Lifecycle fields: `status`, `state_entered_at`, `previous_state`,
  `trigger_reason`, `error_message`, `updated_at`
- Raft-role fields: `raft_role`

No component may rewrite fields outside its owned subset.

### 1.4.4 Create Once, Update Partially

Initial row creation and subsequent lifecycle updates are different operations
and MUST remain separate.

- Initial creation must write the full canonical row shape.
- Later lifecycle changes must use partial updates only.
- `INSERT OR REPLACE` or full-row replacement is FORBIDDEN for steady-state
  lifecycle/status mutation of existing system rows.

If a row is expected to exist and does not, the code must either:

- Fail loudly, or
- Route the request through the canonical row-creation owner

It must NOT silently recreate the row inside an updater.

### 1.4.5 Cache Is For Observation, Not Reconstruction

`SystemTableCache` is the read path for current cluster metadata. It is NOT an
authoritative source for reconstructing fields that another owner already owns.

It is FORBIDDEN to:

- Rebuild authoritative write payloads from stale cache rows when the owner is
  available
- Copy owner-managed fields such as `raft_role` from cache into unrelated write
  paths
- Infer missing identity data from local convenience state when a canonical row
  owner exists

### 1.4.6 Canonical Owner Rows Must Outrank Read Models

When leader identity or group state is needed, the canonical owner row MUST be
consulted before any supporting replica rows.

Mandatory owner precedence:

- `partitions.leader_node_id` outranks `services.raft_role` for partition
  leader identity
- `message_groups.leader_node_id` outranks `services.raft_role` for
  message-group leader identity
- `services` remains the owner of replica-only fields such as replica role,
  status, and address

It is FORBIDDEN to:

- Derive canonical leader identity from `services` row iteration order
- Treat replica rows as alternative truth when the owner row is present
- Collapse owner-row mismatch and replica-role mismatch into one undifferentiated
  error

### 1.4.7 New Raft-Backed Runtime Services Must Extend Shared Owners

A new raft-backed runtime service MUST be built by extending existing shared
runtime owners, not by copying an older service and editing it in place.

Required implementation path:

1. Declare the canonical owner row and owned field subset first.
2. Reuse the shared raft lifecycle owner for leader/follower/candidate and
   leader-change handling.
3. Reuse the shared authoritative row mutation helper for role and owner-row
   persistence.
4. Feed control snapshots and diagnostics from the owner row first, then attach
   replica detail separately.
5. Add owner-path regressions that prove the shared owners are actually used.

It is FORBIDDEN to:

- Add service-local raft lifecycle wiring that duplicates shared behavior
- Add service-local retry/cache-gap mutation loops
- Introduce a second mutation helper for the same owner-row concern
- Publish diagnostics that infer canonical leader truth from replica rows alone

### 1.5 Verification Checklist (run this before writing code)

Before generating or modifying code, answer these questions:

1. Does a component already own this responsibility? → Use it.
2. Does a function already exist that does this? → Call it.
3. Does a constant/enum already exist for this value? → Import it.
4. Am I adding a second way to do something that already has one way? → Stop.
5. Am I adding state that another component already tracks? → Read from owner.
6. Am I adding a field that means the same thing as an existing field? → Reuse.
7. Am I accepting an owner dependency but not routing the behavior through it? → Stop.
8. Am I mixing row creation and row updates in the same code path? → Stop.
9. Am I writing fields owned by another component? → Stop.
10. Am I reconstructing authoritative write state from cache when an owner exists? → Stop.

If the answer to any of 4/5/6/7/8/9/10 is yes, you are violating this contract.

---

## 2. Data Architecture

### 2.1 Tables Are the Universal Storage Model

- ALL persistent information is stored in tables.
- System topology and metadata live in system tables.
- A table is implemented as partitions.
- A partition is implemented as a Raft group (liferaft).

### 2.2 System Cache

- Every node uses exactly ONE system cache instance (`SystemTableCache`) on a selected Message Group.
- All nodes must have at least one Message Group replica, but can host more to let sparse message groups form quorum.
- The system cache on each Message Group is updated ONLY by CDC events from table partitions.
- Only CDC-propagated tables are cached. Non-propagated tables remain
  queryable from their owning partition via SQL. See `CDC_PROPAGATED_TABLES`
  and `CDC_NON_PROPAGATED_TABLES` in `src/cache/cache-constants.js` and
  the classification rules in `architecture.md § System Tables`.
- There must be NO other caches of system information. None. Zero.
- Do not create ad-hoc Maps, Sets, or objects that cache system data outside
  the system cache. If you need system data, read it from the cache or SQL.
- Any new system table MUST be classified in exactly one of
  `CDC_PROPAGATED_TABLES` or `CDC_NON_PROPAGATED_TABLES`.

### 2.3 Reads and Writes

- Writing system information: route to the leader replica of the correct
  partition(s). There is exactly one write path. No component may write
  directly to `SystemTableCache`; all mutations flow through CDC events
  generated by partition leaders.
- Reading system information: components may read directly from the local
  `SystemTableCache` for performance-critical hot paths (rebalancer,
  control-plane readiness checks, bootstrap API, node readiness policy).
  The SQL engine also uses the system cache internally for routing.
- Direct cache reads are permitted because the cache is strictly read-only
  from the consumer perspective — it is updated only by CDC events, which
  guarantees consistency with the authoritative partition state.
- No component may maintain a parallel cache, shadow copy, or derived
  state store outside `SystemTableCache`.

### 2.4 Bootstrap Exception

- The seed node may bypass the normal write path during bootstrap to create
  initial system cache entries (it cannot route writes before the cache exists).
- The joining node may call `applySystemTableChange` during cache hydration
  from bootstrap snapshots (before CDC subscriptions are active).
- These bypasses MUST be removed immediately after bootstrap completes.
- These are the ONLY exceptions to the single write path rule.

Bootstrap-only write exceptions must NOT leak into steady-state runtime paths.
If runtime code can still call a bootstrap shortcut after initialization, that
is a bug.

---

## 3. Communication

- All nodes have at least one message group replica (liferaft).
- ALL communication (including local) goes through the MessageRouter.
- Do not create direct function calls between services that bypass the router
  for operations that should be messages.

### 3.1 Query/Data-Plane Transport Rule

- ALL query/data-plane traffic MUST use Message Group transport.
- Query requests, query responses, and data-plane coordination messages MUST be
  sent through the owning Message Group (replicated path), not a direct
  best-effort path.
- Do not add alternate fast paths for query/data-plane traffic (direct local
  handler calls, ad-hoc sockets, admin API forwarding, or service-to-service
  in-process bypasses).
- There must be one data-plane transport path only: Message Group transport.
- If performance is insufficient, optimize inside that path. Do not introduce a
  second non-replicated path.

---

## 4. Code Quality

### 4.1 Constants, Not Literals

- NEVER use string or number literals directly in code ("magic values").
- ALL scalars must be defined as named constants in dedicated constants files
  and imported where needed.
- If a constant does not exist yet, create it in the appropriate constants file.
- Before creating a new constant, search for an existing one with the same value
  or meaning.

### 4.2 Single Naming

- Each concept gets ONE name. Do not introduce synonyms.
- If the codebase calls it `type`, do not also call it `operation` or `kind`.
- If the codebase calls it `nodeId`, do not also accept `node_id` or `id`.
- When accessing a property, there must be exactly one way to get it.

### 4.3 Error Handling

- Do NOT use try/catch for control flow or conditional logic.
- Caught errors MUST be either re-thrown or clearly logged. Never swallowed.
- Transient errors (no leader, cache unavailable) trigger retries with backoff.

### 4.4 Style

- Follow Google's JavaScript style guide (enforced by ESLint).
- NEVER add eslint-disable comments. Not inline, not file-level. Never.
- NEVER modify the ESLint configuration.
- 2-space indentation, single quotes, semicolons, max 100 chars per line.
- Prefix unused parameters with underscore (e.g., `_unused`).

### 4.5 File Organization

- Prefer small files that focus on one thing.
- Break logic into smaller files/functions when it improves clarity.
- Each file should have a clear, single responsibility.

---

## 5. Architecture Documentation

- When changes are made to the system, update `architecture.md` to reflect them.
- The architecture doc is the canonical reference for component ownership and
  data flow. Keep it accurate.
- The `docs/` directory is for end-user documentation only.
- End-user documentation updates in `docs/` may be paired with corresponding
  end-user code/examples in `examples/` when useful.
- Internal engineering specs, design notes, and implementation planning
  documents belong in `.kiro/specs/`, not `docs/`.

---

## 6. Summary of What NOT to Do

This section exists because LLMs tend to generate these patterns. Do not:

- Add a `nodeStatus` field when `nodeState` already exists.
- Create `getLeaderAddress()` in a new file when `SystemCacheProxy` already does it.
- Build a `ReplicaTracker` when `ReplicaStateMachine` already tracks replicas.
- Add an in-memory Map of partition assignments when the system cache has them.
- Write a second CDC handler for the same event type.
- Create a "convenience" re-export that subtly changes behavior.
- Add a `utils/` function that reimplements logic from a domain module.
- Introduce `async retryWithBackoff()` when one already exists elsewhere.
- Store derived state (like "is this node ready?") when it can be computed from
  the single source of truth on demand.
- Accept `replicaStateMachine` and then write `services` rows directly anyway.
- Use a status updater to insert a missing row "for safety".
- Rewrite `raft_role` from cache in a lifecycle/status code path.
- Use one row shape for initial insert and another partial/incompatible shape in
  later replace/upsert paths.
- Let bootstrap-only write helpers remain reachable from normal runtime logic.

When you catch yourself about to do any of these: stop, search, reuse.

If you run into long periods of failures or have a hard time implementing
something, take a step back and consider whether changing the local
architecture in some way would make your current task easier while still
adhering to all other rules.
In that case, bring it to attention and come with a suggestion instead of just plodding on.
