# Application consumers and the distributed public seam

How an application built on the public `lagrange-server` package operates
across a multi-node Lagrange cluster without resolving physical topology. The
first consumer of this contract is `lagrange-images`; the contract is generic
and binds core to no single consumer.

Prerequisites: [Application database sessions](application-database-sessions.md),
[Request routing](process-request-routing.md),
[Minimal deployment surface](minimal-deployment-surface.md),
[Execution semantics](../docs/execution-semantics.md).

## Result

```text
semantic object identity            (application concern)
        |
application table primary key       (application schema)
        |
canonical SQL / Binding selection   (public seam: db.query, db.transaction,
        |                            authenticated lifecycle SQL)
Lagrange partition routing          (core: partition resolver, canonical leader)
        |
eligible replica                    (core: candidate ordering, epoch fencing)
        |
Cell / WASM execution               (core: CallCellInvoker, runtime lifecycle)
```

Application consumers identify data semantically. They do not resolve physical
topology.

Image/object residency is an application-semantic concern. Partition, replica
and execution placement are Lagrange-core concerns.

A public object-to-node or object-to-partition locator is not part of the
contract unless a future measured requirement falsifies canonical key routing.

The application says what object or data and what operation. Lagrange decides
where the data and the execution are.

## Ownership split

| Concern | Owner |
| --- | --- |
| Object identity, residency semantics, which operation to perform, application schema and transaction mapping | the application |
| Partition routing, replica selection, membership, consensus, transport, Cell placement, activation, Binding invocation, retry and staleness classification at infrastructure boundaries | Lagrange core |

The application never needs node ids, replica ids, partition membership, Raft
state, or a second physical-routing implementation. The acceptance work behind
this document added no locator, router, planner, transaction owner, membership
view or lifecycle owner.

## The seam

Two surfaces that already existed. Neither was added for this contract.

1. **Application database sessions.** `createEmbeddedLagrange()` starts a real
   node in the host process; `openApplicationDatabase({applicationId})` opens
   sessions whose `query` and `transaction` calls reach the one `SqlCore`. The
   session carries no execution options, so a consumer cannot name a node, a
   partition or a replica. Every successful statement resolves to the projected
   public shape `{rows, affectedRows}`: engine diagnostics (partition sets,
   participant nodes, read-authority witnesses, distributed plans) never leave
   the facade, a thrown engine error reaches the consumer as `{code, message}`
   only, and diagnostic statements (`EXPLAIN DISTRIBUTED`) are refused for
   application sessions by the statement policy, which SqlCore's statement
   execution consults before its EXPLAIN branch. These three projections were
   the only production changes the seam needed: two at the facade owner and
   one policy hook inside SqlCore's statement execution.
2. **Authenticated lifecycle SQL over the PostgreSQL wire.** `INSTALL SERVICE`,
   `CREATE BINDING`, `CONFIGURE SERVICE ACCESS` and `CALL BINDING` are
   classified only by `SqlCore.executeRequest` under a server-derived security
   context. A public consumer reaches them with an ordinary PostgreSQL client
   against the node's published `service_endpoints` row, in password mode. The
   embedded application-database facade does not carry them (see Findings).

## Routing by primary key

`CREATE TABLE ... (id ... PRIMARY KEY, ...)` needs no partition clause. The
primary key is the range partition key. Equality, `IN`, `BETWEEN` and bounded
comparisons on it narrow to the owning partition or partitions; any other
predicate widens to every partition and merges. Writes go to the canonical
leader through the message router; reads go to any routable replica. Both
retry across topology change with epoch fencing rather than serving a stale
target. A composite string identity such as `img:<digest>:<kind>` orders by
its text.

Verdict of the acceptance work: **the application row id is sufficient routing
identity.** The consumer needs and accepts nothing else: a node id passed to
`openApplicationDatabase` is refused as invalid input, `query` has no options
channel, a routing hint comment has no effect, and a user column named
`partition_id` is an ordinary column. No Images-specific physical locator is
required or permitted.

## Consistency the consumer may rely on

- Within one session's transaction: read-your-writes on the participant
  epoch.
- Across sessions and nodes: an autocommit read is a follower-local snapshot
  read. A committed autocommit write becomes visible on another node after
  replication; no staleness bound is documented.
- Transactions through `db.transaction`: one coordinator, one-phase commit for
  a single participant, two-phase otherwise; a failed statement dooms the
  transaction even if the callback catches it; raw transaction-control SQL is
  refused; concurrent top-level transactions have distinct sessions. **These
  are coordinator-visible semantics.** Replicated durability of transactional
  writes is not provided today: see the blocking finding below. Until it is
  repaired, an application must treat `db.transaction` as durable only on the
  replica that executed it.

## Binding invocation from an application

The application installs an immutable Artifact, declares a `call` Binding whose
declared statement is the data selection, and invokes it by name. Core resolves
the selected partitions from the Binding's declared statement, requires each
shard to run on the node hosting that partition, activates a Cell there when
none is ready, fences stale targets, and returns one reduced result. The
consumer supplies `{schema_version, name, arguments}` and nothing else; a
payload that names a node, partition or replica is refused by the payload
contract before any routing happens.

Two current limits belong to the call owner, not to this seam:

- the selector is a literal single-table `SELECT` fixed at deployment, so a
  per-invocation key anchor is expressed today by the declared statement, not
  by call arguments;
- direct `CALL BINDING` accepts no caller idempotency key.

## Outcome classes for retry decisions

A `CALL BINDING` failure that reaches the lifecycle owner carries exactly one
public outcome class and a `retrySafe` flag in its error detail, derived in one
place from the call routing contract's classification plus the invocation's
execution evidence. Messages are topology-free.

| Class | Retry safe | Meaning |
| --- | --- | --- |
| `success` | n/a | one published result |
| `definitely_not_executed` | no by policy | refused before dispatch; the caller decides whether to retry |
| `retryable_stale_target` | yes | the target moved between resolution and delivery; nothing ran |
| `temporarily_unavailable` | yes | no ready Cell yet; nothing ran |
| `outcome_uncertain` | no | guest code of this invocation may have run |
| `terminal_application_failure` | no | the guest failed on this input |

Exactly-once applies to result visibility, not to guest execution. Core never
retries an uncertain outcome automatically; an application that does accepts
possible re-execution of guest effects. Refusals before the owner is reached
(wire authentication, payload contract) carry no class. The detailed table is
in [Execution semantics](../docs/execution-semantics.md).

## Acceptance status

| Stage | Status | Evidence |
| --- | --- | --- |
| I1 public application database | PROVEN on one runtime; multi-node RECORDED | `test/integration/public-application-database-multinode.integration.test.js` runs on one runtime. A three-process lab run was green for key routing, update visibility, the falsifiers and every leak check, but the committed shape stays at one runtime until the formation write-readiness and transaction replication findings are repaired |
| I2 distributed transaction visibility | BLOCKED | systemic transaction replication defect, see Findings; `test/integration/public-application-database-transaction-facade.integration.test.js` proves facade semantics only |
| I3 public Binding invocation | PROVEN | `test/integration/public-binding-cell-invocation-seam.integration.test.js` |
| I4 outcome contract | PROVEN | `test/integration/call-cell-public-outcome-adversarial.integration.test.js`, `test/service/call-cell-public-outcome.test.js` |
| I5 consumer-contract ratchet | PROVEN | `test/release/public-consumer-contract-ratchet.test.js`, `test/integration/public-consumer-contract-ratchet.integration.test.js` |
| I6 durability harness | PREPARED, certification blocked on the rs-raft cutover and on the transaction finding | `test/distributed/scenarios/public-seam-durability.js` (`certification: PREPARED_BLOCKED_ON_RS_RAFT_CUTOVER`) |

## Falsifiers

| Falsifier | Expected | Observed |
| --- | --- | --- |
| F1 consumer selects a node | no | `INVALID_ARGUMENT`; no options channel |
| F2 consumer supplies a partition id | no | hints ignored; payload keys refused |
| F3 half a transaction committed | no | atomic outcome on one runtime; replicated durability BLOCKED |
| F4 caught statement error commits | no | transaction doomed |
| F5 Binding bypasses the invocation owner | no | static: consumer import census plus the architectural path `executeRequest` to the lifecycle owner to `CallCellInvoker` |
| F6 legacy callback axis used | no | static token scan |
| F7 retry policy needs Raft vocabulary | no | class plus `retrySafe` only |
| F8 ratchet imports private core | no | static import census |
| F9 rs-raft WIP edited | no | no commit touches those worktrees or `src/raft/**` |
| F10 new physical locator | no | none added |

## Findings routed to their owners

Recorded, not absorbed. Most have a witness or a record in the epic's tests;
the read-only cache proxy, the access-policy gap and the cluster-view half of
the inbound-unreachable node are recorded only in this register and in the
epic's memory notes.

- **Transactional writes are not replicated (BLOCKING).** In-transaction
  statements mutate only the staging replica; the commit marker carries the
  operations but no replica applies them; `COMMIT` is acknowledged before
  consensus; a leader change loses the rows. Measured directly in each
  replica's database on a three-node lab cluster. Owner: the partition
  transaction base and the transaction protocol. Quest
  `distributed-transaction-replicated-apply`.
- **Binary values over routed paths.** Buffers are JSON-serialized on the
  partition hop and in the committed entry with no reviver, and the wire bind
  parser ignores binary format codes. Owner: one canonical value codec for
  partition messages plus the wire parser.
- **Cold-formation write readiness.** After a fresh three-node formation,
  application writes are sometimes refused for minutes. Owner: critical
  topology readiness.
- **Read-only cache proxy.** A read of a blocked method name logs an error and
  throws, so capability probes on hot paths produce tens of thousands of
  exceptions per joiner. Owner: the cache proxy contract.
- **Embedded runtime and the wire listener.** No product configuration enables
  an authenticated PostgreSQL-wire listener on an embedded runtime, the facade
  cannot carry lifecycle SQL, and placement of the listener varies with
  formation. Owner decision: a thin authenticated adapter from the embedded
  handle into the one call owner.
- **Access policy and call Bindings.** A call Binding was served with no
  configured access policy; declared-statement shard reads are not gated by
  `CONFIGURE SERVICE ACCESS`. Owner decision before a public release.
- **Inbound-unreachable node.** A node whose advertised address nobody could
  dial was fully active in the cluster's view. Owner: endpoint publication
  readiness.
- **ORDER BY collation.** The coordinator merges with locale collation while
  SQLite and range predicates use binary order. Owner: the merge comparator and
  the routing-key comparator.
- **Second retryability owner (repaired in this epic).** The request-cell
  call bridge marked five codes retryable by code alone; it now consumes the
  public class's `retrySafe`, so retry safety has one owner. The receiver
  also now classifies a wrong-tenant route as an authorization failure rather
  than a moved target.
- **Embedded stop leaves the wire listener open** because the runtime driver
  contract has no teardown for native modules. Owner: the driver lifecycle.

## Certification status

The provider-neutral durability scenario runs in the existing distributed
harness (`local-three-node.json`, scenario `public-seam-durability`) on local,
lab and GCP targets. It reports `certification: PREPARED_BLOCKED_ON_RS_RAFT_CUTOVER`
while the runtime's default provider is the legacy one, and `CANDIDATE`
otherwise. Final rs-raft multi-node failure and recovery acceptance is pending
the cutover and the transaction replication repair; a green run today proves
the harness, not the backend.
