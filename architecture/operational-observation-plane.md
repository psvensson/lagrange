# Operational Observation Plane

Target architecture contract for a live, read-only view of cluster topology,
placement, semantic state and load.

> **Status:** proposed architecture; no implementation is claimed by this
> document. Existing diagnostics, system-table/cache reads, metrics and
> live-query pieces remain current capability. This contract describes how they
> should converge when a first-class operational observer is implemented.

## Document role

This document defines the semantic boundary needed by operational clients that
must answer questions such as:

- which nodes currently belong to the cluster and what latency groups contain
  them;
- which tables and partitions exist;
- where each partition is replicated and which replica currently leads it;
- which placement/recovery/rebalance operations are active;
- which owner-declared readiness, placement or replication conditions are not
  satisfied; and
- where load is concentrated, at node and partition granularity where a
  canonical metric source exists.

It deliberately does **not** define a dashboard, colour scheme, layout,
Perspective, renderer, image object model or admin command. Those are consumers
of the contract. The first intended rich consumer is the Lagrange Object
Environment System Inspector.

The companion live-query contract remains authoritative for application/table
query observation: [Live Query Data Plane](live-query-data-plane.md). The
operational observation plane reuses its push-backed continuity principles; it
does not create a second distributed change-detection architecture.

## The decision

Lagrange will have one logical **Operational Observation Plane** for read-only
cluster observation.

The plane is a projection over existing authoritative owners. It is never an
authority for membership, readiness, placement, replication, SQL semantics,
load policy, failure detection or resource accounting. It may combine facts
from those owners into one coherent observation, but it may not re-decide them.

Conceptually:

```text
membership / latency topology owner ----+
partition + replica owners -------------+
placement / operation owners -----------+--> OperationalObservationOwner
readiness owners -----------------------+       |
canonical telemetry owners -------------+       +--> snapshot + live stream
system-table read model ----------------+       |
                                                +--> public control-plane adapter
live-query / CDC continuity ------------+                 |
                                                          v
                                                  authorized observers
```

`OperationalObservationOwner` is the target semantic owner of the **arrow**
between internal owners and external operational observers. Its implementation
may be distributed and may delegate pure collection/encoding helpers. The
logical ownership must not be split across admin WebSocket handlers, CLI views,
UI clients and diagnostics endpoints.

## Non-negotiable ownership rules

### Source owners remain authoritative

Every field exposed by the plane has a source owner. The observation owner
asks that owner or its sanctioned read model; it does not reconstruct the same
semantic answer from secondary evidence.

Examples:

| Concern exposed to observers | Authority |
| --- | --- |
| current cluster membership | membership owner |
| latency-group topology | latency-topology owner |
| table/partition declaration | canonical table/partition metadata owner |
| desired replication factor | partition declaration/policy owner |
| current replica holders | replica/topology owner |
| leader identity | Raft/replica owner |
| node/readiness state | the existing readiness/lifecycle owner that names the state |
| placement violation or active move | placement/rebalance owner |
| CDC lag/continuity condition | CDC owner |
| CPU/memory/disk capacity/load | canonical resource/telemetry owner |
| query/service execution counters | their existing execution telemetry owners |

A consumer must never have to infer a named state from raw fields when core
already has an owner for that state. Conversely, the observation plane must not
invent a generic `healthy` boolean whose policy no owner owns.

### Projection is not authority

The plane may cache, group, batch or coalesce observations for delivery. Those
projections are disposable. They must never become inputs that make a durable
placement, readiness, routing or replication decision.

No new replicated system table is introduced merely to mirror current cluster
state for the UI. Durable facts continue to live in their current owners and
system tables; ephemeral measurements remain telemetry.

### Observation is read-only

Version 1 exposes no mutation operation. A future System Inspector may offer
admin commands, but those commands must route through the canonical admin and
semantic command owners. They must not mutate an observation record or treat a
projection as an alternate control path.

## Subject model

All observation data refers to one canonical operational subject identity.
The exact wire encoding is an implementation contract to seal before code, but
semantically a subject reference is:

```text
OperationalSubjectRef {
  kind: cluster | latency-group | node | table | partition | replica | operation,
  key: owner-defined stable opaque key
}
```

The `key` is identity, not display text. A table rename, node label change or
other presentation change must not create a different subject when the lower
owner says identity is unchanged.

Composite physical things remain one subject rather than becoming UI-derived
IDs. For example, a replica identity may canonically include its partition and
node as defined by the replica owner; a UI must not invent a separate identity
scheme from row/column coordinates.

### Relationships

A snapshot can expose typed relationships among subjects, for example:

```text
latency-group contains node
cluster contains table
table contains partition
partition has replica
replica hosted-by node
partition led-by replica
operation concerns partition
operation source-node node
operation target-node node
```

Relationship names are descriptive projections of owner facts, not new
ownership. The observation owner owns their canonical external representation.

## Observation vocabulary

The plane carries four different categories of information. They are kept
separate because their durability, update rate and continuity requirements are
different.

### 1. Structural facts

Slow-changing identity and topology, such as:

- nodes and latency groups;
- tables and partitions;
- declared replication target;
- replica holders;
- leader identity;
- current membership/lifecycle state; and
- active placement/recovery operations.

Structural facts use explicit named states. Absence never silently means
`healthy`, `ready`, `zero`, `not-leader` or another semantic outcome.

### 2. Owner-declared conditions

Conditions are named interpretations that already belong to a semantic owner,
for example a placement violation, an incomplete readiness requirement, a
replica lag state or an operation failure state.

This is the data a consumer may use for a `violations only` filter. The
consumer must not independently recreate placement/readiness policy in order to
decide what constitutes a violation.

A condition should identify:

```text
condition id/kind
subject(s)
named state/severity from its owner
observed owner evidence needed for explanation
optional owner-supplied message/code
```

Presentation severity may be mapped to visual emphasis, but the UI does not
upgrade or downgrade the semantic condition.

### 3. Measurements

Measurements are quantitative observations, not semantic states:

```text
Measurement {
  subject,
  metricId,
  value,
  unit,
  sampledAt,
  window?,
  denominatorOrCapacity?,
  sourceStatus
}
```

Examples that may be exposed once a canonical source exists include CPU,
memory, disk occupancy, disk I/O, network traffic, Raft traffic, reads, writes,
query execution, service/WASM execution, storage bytes and replica lag.

The metric catalog is explicit and versioned. A missing metric is `unavailable`
or unsupported; it is never reported as zero.

The first implementation should expose only metrics that already have one
credible owner. The System Inspector is not a reason to create several local
samplers for the same quantity.

### 4. Events

Events make structural change legible to humans and automation. They are either
owner-native semantic events or exact observation-level transitions derived
from two authoritative states.

Useful event kinds include:

```text
node.state.changed
replica.added
replica.removed
replica.leader.changed
partition.split
partition.merge
operation.started
operation.progressed
operation.completed
operation.failed
observation.reset
```

An observation-level transition may say that a leader changed because the
leader field changed. It must **not** invent causality. `cause`, `reason` and
workflow attribution are present only when the authoritative owner supplies
them.

## Subscription contract

An observer expresses **interest**, not a polling algorithm.

Conceptually:

```text
observeOperationalState({
  root,
  subjectKinds,
  filters,
  detail,
  metricIds
}) -> initial snapshot + live stream
```

The actual public adapter may use WebSocket, an async iterable or another
transport shape. Transport does not own the semantics.

A subscription has these properties:

1. **Snapshot plus continuation is gap-free.** A relevant structural change
   cannot disappear between the initial snapshot and following stream.
2. **Resume uses an opaque core-owned cursor/frontier.** Consumers do not
   construct offsets from timestamps or system-table revisions.
3. **Loss of exact continuity is explicit.** The owner emits `reset` and a
   fresh snapshot rather than pretending a precise delta survived.
4. **Equivalent interests are coalesced.** One placement matrix is not one
   distributed subscription per cell.
5. **Scope follows semantic need.** A selected partition may subscribe only to
   that partition and its replicas/measurements; a cluster overview requests
   node aggregates; a table matrix requests the selected table's partitions.
6. **Cancellation releases interest.** View/session lifetime may own the
   subscription; a consumer disappearing does not leave permanent distributed
   watcher state.

The [Live Query Data Plane](live-query-data-plane.md) owns the generic
snapshot/frontier, CDC, grouping and no-polling principles for table-backed
observation. System-table-backed structural facts should reuse that path where
it applies. Non-table telemetry sources feed the operational observation owner
through their own canonical owner rather than being forced into synthetic table
writes merely to reach the UI.

## No distributed polling

An external observer must not repeatedly issue admin snapshots, SQL queries,
system-table reads, object reads or head checks to discover whether cluster
state changed.

Steady-state distributed structural change is push-backed. Recovery/reconnect
may request a fresh snapshot.

Resource telemetry may itself be sampled by the resource owner — CPU usage is
naturally a measurement over time. That sampling is source measurement, not a
client polling distributed state. The source emits/coalesces samples into the
observation plane; every UI client must not start its own periodic remote probe.

## Backpressure and high-rate data

Structural correctness and high-rate telemetry have different delivery rules.
They must not be hidden behind one ambiguous queue policy.

### Structural state

Structural state changes required to maintain the current projection cannot be
silently dropped. If a receiver falls behind beyond the retained continuity
window, it receives an explicit reset/fresh snapshot.

### Measurements

High-frequency measurements are **latest-value observations**, unless a metric
explicitly promises a lossless history stream. Under pressure the owner may
coalesce multiple pending samples for the same `(subject, metricId, window)` to
the newest value.

Coalescing must preserve `sampledAt` and source status so the consumer can show
staleness. It must not silently convert an unavailable or stale source into a
fresh zero.

This permits a 60 Hz renderer to animate smoothly without requiring cluster
telemetry to publish 60 distributed samples per second. UI frame rate and
measurement frequency are separate concerns.

## Scale and detail levels

The observation plane must support progressive detail rather than forcing a
whole-cluster full-detail snapshot for every client.

Recommended semantic levels are:

- **cluster summary** — latency groups, nodes, owner-declared broad states and
  node-level aggregate measurements;
- **table placement** — one table's partitions, replica placement, leaders,
  operations and selected measurements;
- **partition detail** — one partition, its replicas, leader, operation state
  and detailed measurements;
- **node detail** — one node, aggregate resources, hosted replica references
  and active operations; and
- **exceptions** — owner-declared conditions/violations without requiring the
  consumer to download every ordinary subject first.

These are observation scopes, not five independent APIs or stores.

Large table views may request range/bucket summaries and then expand selected
ranges. Any summary is explicitly a projection with an aggregation definition;
it never replaces the underlying owner facts.

## Authorization and disclosure

Topology and telemetry are potentially sensitive operational information.
A reference to a table, partition or image does not imply authority to inspect
the cluster that hosts it.

The public control-plane adapter must authorize the requested observation scope
at use time. The operational observation owner receives a validated principal/
authority context according to the control-plane contract and returns only the
subjects, fields and metrics that scope permits.

The design intentionally does not decide the grant vocabulary here; that
belongs to the existing control-plane/authority owner. What is fixed here is:

- observation never confers mutation authority;
- cursors/frontiers are opaque and non-authoritative;
- denied, unavailable and absent are different outcomes; and
- clients do not bypass the public observation contract by reading internal
  system tables or diagnostics endpoints directly.

## Staleness and partial availability

A colourful display must never look confident when its inputs are incomplete.
Every observation carries enough status to distinguish at least:

- current/available;
- stale (last known value plus age, when safe to disclose);
- unavailable/source failed;
- unauthorized/filtered; and
- reset/reconciling after continuity loss.

A whole snapshot may also report partial completeness when one telemetry source
is unavailable while topology remains valid.

The UI decides how to render those statuses; core owns what they mean.

## Relationship to existing diagnostics

Existing diagnostics endpoints and admin WebSocket/cache-backed live-query
paths are implementation material and compatibility surfaces. They are not a
license for a new client to compose its own cluster semantics from whichever
endpoint happens to contain a field.

The target path is:

```text
existing semantic owners / sanctioned read models / telemetry owners
                       |
                       v
           OperationalObservationOwner
                       |
                       v
             one public observation contract
                       |
                +------+------+
                |             |
               CLI      Object Environment
```

During implementation, useful existing diagnostics should be routed through or
adapted behind this owner where that is the correct source. Duplicate policy
must be removed rather than preserved as a second definition.

## Consumer rules

Consumers may:

- choose which subjects/metrics are interesting;
- choose layout, grouping, sorting and visual encodings;
- compute presentation-only normalization such as percentile heat colours;
- retain transient samples for local sparklines clearly scoped to the current
  session; and
- ask core for a narrower or wider observation scope as visibility changes.

Consumers may **not**:

- decide readiness or placement correctness from a parallel set of rules;
- infer `healthy` from the absence of a warning;
- write observed state into a durable mirror and treat the mirror as current;
- poll because a stream is inconvenient;
- invent replica/partition identities from screen coordinates;
- treat a local sparkline/ring buffer as authoritative historical telemetry; or
- claim a causal explanation that the source owner did not provide.

## Historical playback is a later contract

A live observer may keep a bounded client-local ring of received observations
to support an explicitly labelled **since this view opened** pulse or sparkline.
That buffer is transient and incomplete by design.

True historical scrubbing — for example, "show the cluster exactly 45 seconds
before this failed move" — requires a retained, queryable source owned below
the UI with a defined retention and consistency contract. That is valuable but
is not smuggled into version 1 by persisting dashboard state.

When such a retained operational history exists, this plane is the natural
place to expose it as a separate historical observation mode.

## First implementation slice

The first slice should prove the owner boundary rather than maximize visual
coverage. A useful falsifiable vertical is:

1. one cluster with at least three nodes;
2. one selected table with several partitions;
3. an authorized observer requests table-placement scope;
4. the initial snapshot contains canonical partition/replica/leader facts;
5. a real replica move or leader change happens remotely;
6. the observer receives an unsolicited update with no repeated snapshot/read
   loop;
7. a selected partition can add one canonical load metric if such a source
   exists at that time;
8. interruption/resume either continues gap-free or emits a reset; and
9. an idle observation window proves zero repeated distributed reads used only
   to discover change.

Only after that boundary is proven should the metric catalog and broader views
expand.

## Explicit non-goals

Version 1 does not:

- define a UI toolkit or renderer;
- introduce a monitoring database;
- provide long-term metrics retention;
- duplicate Prometheus/Grafana semantics inside core;
- expose arbitrary internal objects merely because an operator might find them
  interesting;
- make operational projections durable decision inputs;
- add admin mutations; or
- require every desirable metric to exist before the observation contract can
  land.

## Rejected alternatives

### A dashboard-specific admin API

Rejected. It would make UI needs an owner of cluster semantics and would likely
re-derive readiness/placement state in handlers. The operational observation
contract must be useful to the CLI, automation and future frontends as well.

### Direct UI reads of system tables and diagnostics endpoints

Rejected. It duplicates semantic interpretation and forces the client to
coordinate races among several independently changing sources.

### Mirror all current state into one replicated `system_status` table

Rejected. It turns derived/transient state into durable competing authority,
adds write amplification exactly when the cluster is busy, and makes telemetry
churn a replicated database workload.

### One watcher per visual widget/cell

Rejected. Subscription cost should follow the semantic dependency footprint,
not the number of rectangles on screen.

### Put the observation model in Lagrange Images

Rejected. Cluster membership, placement and resource telemetry are Lagrange
control-plane concerns. Lagrange Images owns image/object/language semantics;
it should not become a forwarding layer merely because the first rich consumer
happens to be the Object Environment.

### Let the UI compute health from raw metrics

Rejected. Relative heat/colour is presentation; semantic health/readiness/
placement correctness belongs to existing owners.

## Required implementation ownership work

Because this document proposes a new owner boundary, implementation must start
as a bounded Quest per repository rules. Before code lands it must:

- name the concrete `OperationalObservationOwner` locus;
- register the interactions it crosses;
- seal one canonical wire/value shape;
- identify the canonical source owner for every initial field and metric;
- prove the no-polling snapshot-to-stream boundary;
- prove authorization/partial availability/reset behavior; and
- remove any duplicate semantic interpretation exposed by the first adapter.

The UI project has a separate decision for how to consume this contract. That
project must not instruct or modify this repository's implementation owners.
