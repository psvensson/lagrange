# Process: Request Routing

How a request finds the node that can answer it — for SQL statements, and for
calls into deployed services.

Prerequisite: [The Lagrange System Model](system-model.md) — including its
[diagram legend](system-model.md#diagram-legend). Which replica is *preferred*
when several are eligible is [data affinity](process-data-affinity.md).

## The routing substrate

All routing decisions share one substrate, and it is local:

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart LR
  DEC["Any routing decision"]:::ctrl --> C["<b>SystemTableCache</b><br/>node-local, CDC-fed"]:::move
  C --> OWN["<b>Owner rows</b><br/>partitions.leader_node_id<br/>message_groups.leader_node_id"]:::data
  C --> SVC["<b>services</b> rows<br/>replica node · status · raft_role"]:::data
  C --> DEF["<b>service_definitions</b><br/>runtime kind · read locality"]:::svc
  DEC --> MR["<b>MessageRouter</b><br/>{nodeId}/{entityType}/{entityId}"]:::move

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef move fill:#ede9fe,stroke:#6d28d9,color:#2e1065
```

No request-time lookup RPC exists. A node routes from its own cache, and the
cache is correct because CDC keeps it converging.

Resolving "who is the leader" is a four-level ladder, not a single column, and
it is worth knowing the order because the fallbacks show up in incident traces:

1. the bootstrap-topology owner;
2. `partitions.leader_node_id` — the canonical owner row;
3. the retained runtime leader, for control-plane partitions only;
4. a **unique** `services` row with `raft_role = leader` and `status = active` —
   several such witnesses means ambiguous, and the leader resolves to null.

So the `services` table is a documented fallback authority rather than merely
supporting detail. "Writes must reach the leader" likewise has three explicit
widenings: fresh bootstrap-leader services, recovery-candidate widening, and
leader-address quarantine.

## SQL statements

External entrypoints normalise into a frozen `SqlRequest` and delegate to one
engine. There is no second planner, no fallback executor, and no
protocol-specific execution path.

Two caveats before you rely on `SqlRequest` as a universal seam: many in-process
callers (cache hydration, live queries, CDC owner reads) call `executeQuery`
directly and never construct a request object; and `stage` and `plan` are
declared execution modes that the current request constructor cannot actually
produce, since it drops the fields they need.

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart TD
  PG["PostgreSQL wire<br/>PostgresWireAdapter"]:::ext --> RQ
  AD["Admin WebSocket<br/>InternalSqlAdapter"]:::ext --> RQ
  RT["Programmatic runtime<br/>runtime.run + ctx.call"]:::ext --> RQ
  WA["WASM DB.call<br/>WasmCallAdapter"]:::ext --> RQ
  RQ["<b>SqlRequest</b> (frozen)"]:::svc --> EX["<b>executeRequest</b>"]:::svc
  EX --> M{"executionMode"}
  M -->|"sql_statement"| SQ["Plan · route · execute SQL"]:::data
  M -->|"partition_callback"| CB["PartitionCallbackDispatcher<br/>→ CallbackExecutionHost"]:::data
  M -->|"stage"| SG["stage execution"]:::data
  M -->|"plan"| PL["reduceByKey / useBroadcast<br/>pipeline"]:::data

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ext fill:#f1f5f9,stroke:#475569,color:#0f172a
```

### Choosing the target replicas

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart TD
  A["Resolved partition set"]:::data --> B{"Read or write?"}
  B -->|"write"| L["<b>Canonical leader only</b><br/>partitions.leader_node_id"]:::warn
  B -->|"read"| R["All routable replicas"]:::data
  R --> LOC{"Issuing service has<br/>read_locality = same_group?"}
  LOC -->|"yes"| PREF["Local node first,<br/>then same latency group,<br/>then the rest"]:::svc
  LOC -->|"no · any · external client"| UNI["Uniform ordering<br/>load spreading"]:::svc
  PREF --> TRY
  UNI --> TRY
  L --> TRY["Attempt candidate"]:::ctrl
  TRY --> OK{"Success?"}
  OK -->|"yes"| DONE["Return rows"]:::good
  OK -->|"no"| NEXT["Next candidate; then retry the<br/>whole attempt, re-resolving candidates"]:::warn
  NEXT --> TRY

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef warn fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef good fill:#dcfce7,stroke:#166534,color:#052e16
```

The retry structure exists because routing has to survive topology change.
During a split, a leader election, or a replica move, a candidate list can go
stale between resolution and delivery — and partition epoch fencing (see
[partitioning](process-partitioning.md#what-makes-cutover-safe-partition-epochs))
will reject a stale target rather than serve it. Reads therefore iterate
candidates within an attempt and re-resolve across attempts, up to
`query.readRetryAttempts` (default 3), rather than hard-failing on the first
transient error. Timeouts on this path are classified as query-plane timeouts,
distinct from control-plane remote-call timeouts — a distinction worth
preserving when adding diagnostics.

### Fan-out and merge

When a statement resolves to several partitions, `ParallelQueryCoordinator`
schedules the fan-out with deterministic chunking (partitions are never silently
truncated), and `DistributedMergeEngine` owns global semantics — `DISTINCT`,
`GROUP`/`HAVING`, `ORDER`, `LIMIT`, set-operation merges. Local partition
results are partial by construction; the merge stage is what makes them a
correct global answer.

## Service requests

Deployed services are reached through a different front door, but the same
transport and the same cache-driven target resolution.

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','actorBkg':'#dbeafe','actorBorder':'#1e40af','actorTextColor':'#0b2545','signalColor':'#334155','signalTextColor':'#0f172a','noteBkgColor':'#fef3c7','noteBorderColor':'#b45309','noteTextColor':'#451a03'}}}%%
sequenceDiagram
  participant CL as External caller
  participant HA as RequestCellHttpAdapter<br/>(on the bootstrap API server)
  participant RR as RequestBindingRouteResolver
  participant SD as ServiceDispatcher
  participant RH as RuntimeServiceHandler
  participant CELL as Cell (placed runtime_service)

  CL->>HA: HTTP request on a tenant route
  HA->>HA: HTTP Basic auth → frozen {tenantId, principal, roles}
  HA->>RR: resolve route (reads SystemTableCache only)
  RR->>RR: exactly one matching request Binding
  RR->>RR: derive serviceId, verify ACTIVE definition
  RR->>RR: pick one ready Cell deterministically
  RR-->>HA: target node + service
  HA->>SD: frozen Service_Message (request_cell.invoke)
  SD->>RH: deliver to {nodeId}/service/runtime-service-handler
  RH->>RH: re-validate route — stale/moved ⇒ TARGET_STALE
  RH->>CELL: invoke component
  CELL-->>CL: response
```

There is no separate gateway process: the same Fastify **bootstrap API** server
carries a catch-all route that hands every request to the adapter. The adapter
authenticates against the PG-wire credential verifier and rejects any
client-supplied authority headers, so tenant and principal are established
before routing, not by the caller.

The nouns are worth learning, because they are the deployment surface:

- An **Artifact** is the immutable executable declaration — the installed
  package plus the digest of its canonical manifest.
- A **Binding** is the durable user declaration of execution intent: the only
  place a route-to-artifact mapping is stated, and immutable once written. The
  service id is *derived* from the binding version, not chosen.
- A **Cell** is a running actual of that Binding — concretely, an ACTIVE
  `runtime_service` replica row in `services` belonging to the binding-compiled
  definition. One is selected deterministically by hashing the invocation id
  across the sorted ready actuals, and the receiving handler re-validates the
  choice before invoking, so a Cell that moved between resolution and delivery
  fails as `TARGET_STALE` rather than serving.

Ambiguity is an error, not a heuristic. Each failure mode is a distinct typed
classification so a caller can tell "misconfigured" from "not yet available":

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart LR
  RT["Inbound tenant route"]:::ext --> M{"Matching Bindings"}
  M -->|"exactly one"| RDY{"Ready Cell?"}
  M -->|"none"| NF["route not found"]:::bad
  M -->|"more than one"| AM["route ambiguous"]:::bad
  RDY -->|"yes"| GO["dispatch"]:::good
  RDY -->|"no"| UN["route unavailable"]:::bad

  classDef good fill:#dcfce7,stroke:#166534,color:#052e16
  classDef bad fill:#fee2e2,stroke:#b91c1c,color:#450a0a
  classDef ext fill:#f1f5f9,stroke:#475569,color:#0f172a
```

### Service-to-table access

Service code does not get its own query path. `ServiceRuntimeLifecycle` injects
a service-scoped executor into the replica context during `start()`; that
closure routes through the same `SQLQueryEngine.executeQuery()` as everything
else. The service identity it carries is what makes the statement attributable —
which is the input to [data affinity](process-data-affinity.md).

## Ingress endpoints

Clients discover where to connect from published endpoint rows rather than fixed
topology:

| Surface | Discovery | Note |
| --- | --- | --- |
| PostgreSQL wire | `service_endpoints` rows with `protocol = postgresql` | `sys-postgres-wire` is a replicated runtime service; its replica count is cluster-global and placed by the rebalancer |
| Admin API | fixed WebSocket port on every node | compatibility adapter; mutations delegate to `sys-admin-meta` / `sys-wasm-meta` |
| Service requests | Binding routes → ready Cells | see above |

Because the PG wire is an ordinary replicated service, scaling it is a placement
decision, and session state stays replica-local by design — clients scale out by
discovering endpoints and reconnecting, not by session migration.

## What this means when you build on it

- **Route from the cache, never by asking a peer.** A new request-time lookup
  RPC would reintroduce the coupling the CDC read model exists to remove.
- **Treat candidate lists as perishable.** Anything holding a resolved replica
  across an await needs to tolerate it having moved.
- **Give routing failures typed classifications.** "No route", "ambiguous
  route", and "no ready target" are operationally different problems and should
  never collapse into one error.
