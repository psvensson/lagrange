# General execution invocation primitive — investigation 0

**Status:** RESEARCH ONLY — no architecture decision, public API change, runtime code, or replacement of a sealed contract.
**Date:** 2026-10-14
**Scope:** Lagrange invocation admission and host execution; cross-runtime WASM/OCI parity; Images as a prospective consumer.
**Out of scope:** rs-raft, transaction recovery, graph identity redesign, managed OCI implementation, image application deployment, or any change to running Call Cell semantics.

## The question

Is there a smaller, implementation-independent execution primitive that a request
handler, a partition-local Call Cell shard, a future time/change binding, and a
remote Images operation could use *after* their respective domain owners have
determined what should run?

The hypothesis is deliberately narrower than a universal remote-function
interface:

> One host-execution transition may be shareable; selecting *why, where, with
> what inputs, and under what result-completion rules* stays with the owners
> that already prove those decisions.

The test of success is removal of duplicate decisions, not reduction of
class or noun counts in a diagram.

## Fixed product requirements and current boundaries

1. **Native OCI is a first-class customer adoption path.** Existing applications
   and native language ecosystems must work without a mandatory WASM rewrite.
   The first rung is an ordinary PostgreSQL client in a managed container;
   the second adds Lagrange-aware callbacks using language SDKs; a WASM
   component is an alternative execution package, not a required migration step.
2. **1:1 Lagrange host-capability semantics.** For the *same admitted world and
   Binding mode*, the supported WASM imports and native SDK projections must
   have the same types, authorization, limits, failures and guarantees. This is
   **not** a claim that native process isolation equals WASM sandboxing, or that
   a Call Cell gains request-world read/write simply because an SDK can spell
   those methods.
3. **Lagrange keeps one distributed execution and durable-control-plane owner.**
   The invocation coordinator, host-selection/fencing, Cell activation,
   application-visible result commitment and capability checks do not move
   into a driver, SDK, sidecar or Images.
4. **Images keeps image-level semantics.** Object identity, the generic
   locator/residency and logical placement concerns of Images ADR 0092,
   language dispatch, Block/activation lifetime, graph history and Project
   release/import are Images concerns. A language-level message send is not
   automatically a distributed host invocation. Lagrange still owns physical
   partition routing, node scheduling, replication and consensus.
5. **Keep bootstrap independent.** A successful Images environment or native
   OCI worker is not a prerequisite for cluster formation or core recovery.
6. **Do not change a sealed result by renaming it.** Current request and
   Call Cell contracts remain authoritative until superseded and proved.

Relevant current contracts:
- [WIT Cell worlds](../wit/world.wit)
- [Minimal deployment](minimal-deployment-surface.md)
- [Execution semantics](../docs/execution-semantics.md)
- [Native OCI Call Cells](native-oci-call-cells.md)
- [Images distributed public seam](images-distributed-public-seam.md)
- [Request routing](process-request-routing.md)
- [Request invocation partitioning](../solve/specs/request-invocation-partitioning/requirements.md)
- [Service portability requirements](../solve/specs/service-portability-ladder/requirements.md)
- [Images ADR 0092](https://github.com/psvensson/lagrange-images/blob/main/docs/decisions/0092-object-residency-placement-and-remote-resolution-owners.md)

## Current-path census (read against main)

| Path | Current decision owner | What is distinctive |
| --- | --- | --- |
| HTTP request Binding | RequestBindingRouteResolver; request Cell receiver and RequestCellInvocationOwner | Route ambiguity, ready-Cell selection and request intent; tenant/invocation journal claim and replay; request response |
| Direct or nested Call Binding | CallCellInvoker, CallBindingRouteResolver, destination Call Cell receiver | One root invocation, partition planning, leader-host shard placement, host activation demand, per-slot wire IDs, bounded parallel fanout |
| Call reduce | Reduce coordinator and CallCellInvoker | Slot completeness, disjoint partials, reduce lease, one visible result snapshot; not exactly-once code execution |
| Runtime dispatch into one ready Cell | ServiceRuntimeLifecycle and registered driver | One checked transition to a selected WASM host; future managed OCI invocation must reuse it |
| Request -> call bridge | RequestCellCallBridge | Outbound declaration check; derives child identity, composes deadlines and maps typed outcome to the request guest |
| Legacy SQL partition callback | CallbackExecutionHost, behind the legacy partition-callback dispatch | Active internal callback surface but *not* the supported Artifact/Binding/Cell public service contract; do not make it an alternate public endpoint |
| Images message send / Block | Images InvocationService and ActivationExecutor | Resolve semantic receiver, method/Block, lexical environment and activation lifetime; no Lagrange cluster-routing authority |
| Native OCI callback | Planned broker, OCI driver and language SDK | In the current tree, OCI is scaffold-only: no proven managed native Call Cell invocation; broker must be authenticated and lifecycle-bound |

Concrete implementation points:
- [RequestCellInvocationOwner](../src/runtime/request-cell-invocation-owner.js):
  durable request-intent/identity claim and replay over the existing operations
  journal; an uncertain guest outcome is not safe to re-run by default.
- [CallCellInvoker](../src/service/call-cell-invoker.js): separate root and
  slot/reduce identities; decides partition admission and complete-result
  publication. It never becomes a general single-function executor.
- [RequestCellCallBridge](../src/service/request-cell-call-bridge.js):
  currently derives and authorizes a child call rather than granting a guest
  freedom to choose arbitrary Binding targets.
- [ServiceRuntimeLifecycle](../src/runtime/service-runtime-lifecycle.js):
  existing provider-neutral runtime lifecycle and driver invocation
  transition. The future abstraction must reuse this owner, not create a
  second dispatcher.
- [Call context host](../src/runtime/call-cell-context-host.js) and
  [WIT](../wit/world.wit): request-world and call-world capabilities are
  intentionally different.
- [Legacy callback runtime](query-runtime.md): separate active internal
  surface, explicitly not the external successor.
- [Images InvocationService](https://github.com/psvensson/lagrange-images/blob/main/src/dispatch/invocation-service.js):
  local semantic message-to-activation construction.
- [Images ActivationExecutor](https://github.com/psvensson/lagrange-images/blob/main/src/execution/activation-executor.js):
  local activation, recursive sends and transient execution context.

**Initial observation:** these are not simply multiple copies of the same
invoker. Request replay, shard orchestration, reduce publication and image
activation are different decisions. There may, however, be repeated *leaf
execution* bookkeeping and format conversions at their intersections.
Duplication is a testable question; no redundant owner is established merely
by similarity of names.

## Candidate: an admitted leaf execution

The most conservative candidate is a transport-neutral **admitted execution**
between the destination's already-approved routing/Cell checks and the
physical code executor:

~~~
HTTP request Binding
  -> request route / identity / journal owner ------+
                                                   |
CALL BINDING -> CallCellInvoker                     |
  -> slot planning / host fence / activation -------+-> admitted leaf
                                                   |   execution
future time/change source -> its trigger owner -----+        |
                                                   |        v
future remote Images activation -> Images resolve --+  one provider-neutral
  + Lagrange route / host admission                    host invocation seam
                                                            |
                                                       +----+----+
                                                       |         |
                                                     WASM     native OCI
                                                       |         |
                                                direct imports  broker / SDK
                                                       \         /
                                                same host capabilities
~~~

The arrows *before* admission are not all the same algorithm. A Call Cell
invocation can spawn many leaf executions and then reduce; an HTTP request
normally has one admitted handler execution. An Images method send may
remain entirely inside a local Images activation, without crossing this
boundary at all.

A possible *conceptual* admitted-execution value would contain:

| Field/fact | Who supplies it | What it must not do |
| --- | --- | --- |
| Exact immutable package / manifest / export and interface | Artifact/Binding owner | Trust a caller-supplied module path or runtime export |
| Tenant, principal, service/replica, invocation lineage | Authenticated Lagrange owners | Accept identity strings supplied by guest code |
| Base and child/slot execution identity | Domain coordinator plus existing identity owner | Conflate logical call identity with retry-attempt/transport identity |
| Target Cell and epoch/partition fence where applicable | Existing route/destination owners | Permit provider SDKs to choose node or replica |
| Arguments and already-bounded local batch | Caller plus destination batch owner | Serialize a language closure or entire VM heap on each call |
| Absolute deadline and composed budgets | Admission/budget owners | Restart the timeout when a process reconnects or retries |
| Available host capabilities and authorized handles | Runtime access owner, per admitted world | Treat presence of an SDK method as authorization |
| Completion evidence and typed outcome | Receiver/host execution owner | Treat a lost acknowledgement as proof guest code did not run |

This is a **research vocabulary**, not a proposed durable schema or public
wire format. Some facts may remain opaque, process-local or derived rather
than being serialized; the research must not invent a second persistent
invocation ledger or a new family of identity-bearing tables.

### Scope boundaries for an execution host

The host can perform the following *after admission*:

- resolve the one pinned implementation for the already authorized export;
- invoke it with explicit arguments and only the capabilities of this world;
- enforce the absolute deadline, resource limits and host-local concurrency;
- distinguish **definitely no guest execution** from **execution may have
  started** as far as the host can prove;
- return a typed value or failure to its originating coordination owner.

The host must **not**:

- route to a different partition or Cell or create a replacement;
- plan distributed fanout, partial merging, reduce leases, or result
  publication;
- decide an application's request-idempotency or retry policy;
- issue grants from declared imports or SDK method availability;
- persist Images object/Block state as though it were transport context;
- promise cancellation of native effects, exactly-once code execution,
  cross-partition snapshots or uniform OS-level sandbox behavior.

All durable journal transitions and public outcome classifications should
remain at their existing owners unless an independent proof demonstrates a
genuinely common invariant to extract.

## Alternatives to falsify

| Alternative | Positive argument | Why it may fail |
| --- | --- | --- |
| A. Leave invocation owners as-is; prove WIT/SDK parity only | Least churn; 0.6 native OCI can ship sooner | Does not remove genuinely repeated leaf admission/identity/error translation if it exists |
| B. Share admitted leaf execution only **(leading hypothesis)** | Small common contract; orchestration and Images dispatch unchanged | May add a wrapper with no net simplification, or duplicate existing ServiceRuntimeLifecycle.invoke |
| C. One general invocation coordinator from ingress to result | Elegant single noun and uniform tracing | Erases critical request-vs-shard-vs-reduce invariants; risks second scheduler, journal and wrong retry policy |
| D. Everything is an actor/message send | Attractive for Images | Would silently add ordering, exclusive owner, replay and delivery semantics not currently guaranteed by Cell affinity |

**Default if B shows no measurable decision reduction: choose A.** A thin
alias that adds a new object but no new invariant owner is worse than keeping
the existing mechanisms and verifying parity.

## Semantics that must not silently unify

1. **Initiation vs execution:** a root Call Binding can involve N shard
   executions plus a reducer; its root id is not any shard's wire id.
2. **Replay:** request-response idempotency, one journaled leaf invocation,
   and coordinated partial/result visibility are different layers. A replay
   without a durable witness is not necessarily safe.
3. **Identity and authorization:** the native OCI broker derives lifecycle
   identity from its authenticated stream; WASM uses host imports; neither
   can trust a guest-selected tenant, Binding target or partition.
4. **Deadline:** one inherited absolute caller deadline is conserved across
   wait, activation, dispatch, nested call and reduction; transport reconnection
   cannot replenish it.
5. **Capabilities:** WIT defines imports/exports and types, not runtime
   authorization or failure semantics. Only approved host capabilities for
   the active request/call world are live. Native OS/network APIs remain
   separate from Lagrange-host capability grants.
6. **Result:** exactly-once *visible* Call Cell reduction is not exactly-once
   guest execution. Images local activation is not a distributed commit.
7. **Durable state:** Images graph history and Lagrange SQL/transaction
   correctness retain their own owners. A general invoker does not turn
   arbitrary state changes into one transaction.
8. **Execution mechanism:** OCI can retain Python/JVM/.NET/native libraries;
   WASM can remain lighter and capability bounded. Host implementation
   differences are allowed; observable Lagrange host API differences are not.

## First research/proof program (no implementation authorized yet)

### R0 — Exact capability census

Enumerate every supported host import and entry export in wit/world.wit,
including its active world; map to one runtime behavior owner, one authorization
owner, one typed failure contract, and the planned SDK projection. Include
**unsupported** OCI paths explicitly. The output should be a generated or
structurally checked parity matrix, not a second hand-maintained WIT grammar.

**Falsifier:** an SDK advertises a host operation without a corresponding WIT
capability/behavior owner, or two owners disagree on denial/retry semantics.

### R1 — Cross-path execution trace census

For a request handler, one Call Cell shard, a reducer, and one Images local
method send, record the concrete sequence of identity, access, deadline,
admission, execution, journal and publication decisions. State which steps
actually occur in each path. Classify a repeated step as an owner defect
only after both inputs and invariants prove equivalent.

**Falsifier:** a supposedly shared transition requires changing the Call Cell
root/slot/result rules, or requires Images language dispatch inside Lagrange.

### R2 — Minimal candidate contract design

Produce two written contracts:
- Baseline: unchanged current owners with shared WIT/SDK parity.
- Candidate: one admitted leaf-execution contract reusing
  ServiceRuntimeLifecycle's host invocation owner, leaving request and Call
  coordinators intact.

Make the candidate describe only facts actually required by the receiver;
derive rather than duplicate authoritative metadata. Require explicit
*pre-execution, started, uncertain* evidence at the existing host boundary.
Do not create tables, runtime kinds, messages or implementation shims yet.

**Falsifier:** candidate needs a second durable identity/journal, new
physical routing, or an implicit fallback from native OCI to WASM.

### R3 — Differential tests once native OCI invocation exists

Use one operation implemented as a real WASM component and as two materially
different native-language OCI applications (at least one exercises a native
library). For the **same admitted Binding world** test:

- equal canonical inputs/results and typed invalid/denied outcomes;
- wrong principal, foreign service revision, undeclared call and stale Cell;
- shorter and longer deadlines, budget exhaustion, transport loss before
  guest execution vs after possible guest execution;
- exact intent replay, conflicting replay and nested-call limit;
- shard-data locality and complete/failing partial-set behavior;
- restart/Cell replacement and preservation of committed result identity.

Do not accept provider-specific retries or a test-only native shortcut.
Run a baseline with the current owner structure before claiming that a
generalization improved anything.

### R4 — Images consumer falsifier

A retained Images application performs a local Block send and a concrete
measured remote operation. Prove that its local dispatch/activation rules
remain Images-owned, its logical locator does not become a replica locator,
and its remote operation uses Lagrange's authenticated invocation owner.
Application/Project graph installation must remain distinct from cluster
service activation.

**Falsifier:** a second Images-owned message transport, scheduler, retry
classifier or Lagrange membership view is needed for the proof.

### R5 — Cost and owner-count comparison

Measure route-to-execution overhead and cold/warm behavior across both
mechanisms, and count authoritative decision sites changed or deleted.
Do not count mere code movement or renamed wrappers as simplification.

**Reject the refactor** if it adds a second state authority, weakens any
existing falsifier, increases critical-path latency materially without
benefit, or cannot replace an actual duplicated semantic decision.

## Research questions still open

- Is the existing ServiceRuntimeLifecycle.invoke already the complete
  admitted leaf boundary, making a new primitive unnecessary?
- Which facts can use the same transient shape across request/run/reduce
  without normalizing away the Call Cell's execution evidence and partial
  publication semantics?
- Is there a single existing canonical owner for leaf execution outcome
  classification across request and Call Cell, or only legitimately
  source-specific classifications?
- Can WIT type definitions and conformance fixtures be the sole normative
  sources for **all** supported SDK projections without duplicating the
  behavior contract or introducing native-only host operations?
- How are SDK callbacks transported in the event of stream failure after
  the native worker may have executed? What evidence can an owner actually
  prove?
- What is the minimal remote Images operation worth supporting before
  introducing distribution at the language-send level, given ADR 0092's
  current residency constraints?

## Current provisional verdict and next decision gate

**Provisional:** do not implement a generic invocation coordinator. First
prove WASM/native capability parity and inventory the current request,
Call Cell and legacy callback decision sites. The strongest candidate is a
small common *admitted leaf execution* model at the existing runtime
invocation boundary, while root request semantics, Call Cell fanout and
reduce, and Images method dispatch keep their distinct owners.

To proceed beyond research, nominate **one owner for the shared interaction**
from the existing architecture, seal an exact candidate-vs-baseline proof in
the Quest workflow, obtain independent verification, and only then authorize
changes to runtime behavior or any sealed external contract.

## External references (conceptual precedents, not Lagrange authority)

- [WebAssembly Component Model: WIT](https://component-model.bytecodealliance.org/design/wit.html) — interfaces/worlds specify types and imports/exports, not full behavior.
- [WebAssembly Component Model: Worlds](https://component-model.bytecodealliance.org/design/worlds.html) — host capability provisioning is explicit.
- [Dapr sidecar](https://docs.dapr.io/concepts/dapr-services/sidecar/) — a precedent for exposing common building blocks to native languages through local transport, **not** a reason to clone its scheduler or policy stack.
