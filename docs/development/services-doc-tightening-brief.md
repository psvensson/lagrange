---
audience: development
documentClass: planning
---

# Brief: Tighten Lagrange's documentation around services

> Product-story brief from Peter, 2026-08-03, preserved verbatim below. It is
> the acceptance authority for the Quests graduated from epic
> `services-doc-tightening` (`solve/epics/services-doc-tightening.md`). The
> epic records the decomposition and open questions; this file records what
> "done" means.

---

Go through the repository’s documentation, READMEs, architecture documents,
tutorials, and examples. Rewrite them so Lagrange presents one clear product
instead of several possible evolutionary stories.

Keep the writing terse, concrete, and slightly hacker-ish. Prefer short
explanations, diagrams, and working code over enterprise language.

## The new main story

Lagrange is a distributed runtime for data-intensive services.

A developer:

1. writes a service in a supported programming language;
2. defines normal callable endpoints;
3. authors the endpoint, partition-local functions, and reducers together as
   one logical service;
4. deploys it as WASM;
5. calls it from existing applications like any other service.

When an endpoint runs, Lagrange distributes the relevant functions across the
database nodes holding the required data, then combines the results.

The key contrast is:

> Logically one ordinary service. Physically distributed across the data.

Useful short formulations:

> Build one service. Run it across the data.

> Write normal service code. Lagrange runs each part where it belongs.

> Colocated in source. Distributed in execution.

> Process data where it lives. Return only the result.

Do not make all of these slogans appear everywhere. Pick whichever one fits
the page.

## What to emphasize

Every introductory document should make these points clear, in roughly this
order:

### 1. It is a service

The thing the customer builds, deploys, versions, observes, and calls is a
service.

The service exposes ordinary endpoints. Existing applications do not need to
know about partitions, replicas, Raft groups, or execution placement.

Avoid introducing Lagrange as primarily:

* a database;
* a container platform;
* a generic compute scheduler;
* a serverless runtime;
* a stored-procedure system;
* a collection of deployment modes.

Those things may be relevant internally, but they are not the product story.

### 2. It is genuinely distributed

A single endpoint invocation can execute functions on many relevant database
partitions.

Do not describe this merely as “running a service near the database.” That
sounds like ordinary workload placement.

The important distinction is:

> Lagrange distributes parts of the service invocation itself.

Show that the endpoint may coordinate work across multiple partitions,
replicas, nodes, zones, or regions without the developer manually building the
fan-out layer.

### 3. Compute moves to the data

Filtering, aggregation, scoring, matching, transformation, and other heavy
work should happen where the data already lives.

Only small inputs, partial results, or final results should cross the network.

Tie this directly to:

* lower latency;
* less data movement;
* lower network and cross-zone egress;
* less centralized application compute;
* fewer oversized coordinator services;
* better use of compute already distributed through the cluster.

Do not claim that every workload becomes cheaper. Make clear that the biggest
wins occur when a small result is produced from a large or widely distributed
input.

### 4. The developer still writes one coherent program

The developer should not need to split one feature across unrelated
repositories, deployment units, or infrastructure definitions.

The endpoint, distributed functions, and reduction logic can be:

* written next to each other;
* reviewed together;
* tested together;
* versioned together;
* deployed together.

The physical execution topology is Lagrange’s concern.

This is a central product advantage, not a minor SDK convenience.

## Terminology

Use these terms consistently:

* **Lagrange service** — the logical deployable unit.
* **Endpoint** — the externally callable entry point.
* **Distributed function** or **partition function** — code Lagrange executes
  on relevant data partitions.
* **Reducer** — code that combines partial results.
* **`ctx.call()`** — the developer API used to invoke distributed work.
* **WASM** — the service packaging and isolated execution format.
* **Data-local execution** — execution on or close to the nodes holding the
  data.

Do not make `ctx.call()` the product category. It is the important programming
primitive beneath the service abstraction.

Do not lead with WASM either. Developers buy into the service and execution
model. WASM explains how it is packaged and safely moved around.

## OCI and alternative runtimes

Remove OCI containers from introductory documentation, homepage-style copy,
primary READMEs, getting-started flows, and main examples.

Do not present OCI and WASM as equivalent ways to use Lagrange.

OCI may remain documented where technically necessary, but describe it as one
of:

* an internal runtime capability;
* a compatibility path;
* a migration bridge;
* an escape hatch for code that cannot yet run as WASM;
* a possible peripheral workload mechanism.

Make it clear that OCI workloads do not define Lagrange’s main programming
model and may not receive the full distributed, function-level, data-local
execution benefits.

Do not delete valid architecture simply because it is not marketed. Move it
deeper into implementation or compatibility documentation where appropriate.

## Remove the evolutionary stories

Search for documentation that says or implies things such as:

* start with containers, then perhaps move to WASM;
* use Lagrange as a database, scheduler, service platform, or function
  runtime;
* choose between several equally important deployment models;
* Lagrange might evolve into multiple different products;
* users can place arbitrary workloads close to PostgreSQL data.

Replace these with one direct path:

```text
Existing application
        |
        | normal endpoint call
        v
Lagrange service
        |
        | ctx.call(...)
        v
Functions run on relevant data partitions
        |
        | reduced result
        v
Endpoint response
```

Compatibility and migration paths can still exist, but they must not obscure
the destination.

## README structure

Reshape the main README toward something close to this:

### Opening

One or two sentences explaining the product.

Example:

> Lagrange is a distributed runtime for data-intensive services. Write an
> ordinary service, deploy it as WASM, and let Lagrange run each part of a
> request on the nodes holding the relevant data.

Then show a minimal diagram.

### Why

Explain the existing problem:

* application services fetch large amounts of remote data;
* data is copied through networks and central compute tiers;
* developers manually build fan-out, retries, routing, and reduction;
* distributed storage exists, but application execution remains centralized.

Keep this short.

### How it feels to use

Show one compact service example containing:

* an endpoint;
* a partition-local function;
* a reducer;
* a `ctx.call()` invocation.

Keep all three pieces physically close in the example.

### What happens at runtime

Show how that single source-level service becomes distributed execution across
several partitions.

### Benefits

Cover latency, compute, and egress together. Explain the mechanism rather than
listing unsupported claims.

### Current state

Be direct about what works, what is experimental, and what is planned.

### Deeper documentation

Link to architecture, service model, execution semantics, language SDKs, and
operations.

Do not put a large feature inventory before the reader understands the
product.

## Examples

Audit every example.

The first examples should not be infrastructure demos. They should demonstrate
a service that produces a small result from data spread across several
partitions.

Good first examples include:

* account transaction summary;
* fraud or anomaly scoring;
* log aggregation;
* IoT fleet status;
* customer activity summary;
* authorization or policy evaluation over distributed records;
* feature computation over event history.

Each main example should show:

1. the existing application calling one normal endpoint;
2. the endpoint and its distributed functions authored together;
3. `ctx.call()` selecting or reaching the relevant partitions;
4. local filtering or aggregation;
5. a reducer producing the final result;
6. only the compact result leaving the cluster.

Prefer one believable example over five toy examples.

Avoid examples where `ctx.call()` merely wraps trivial work. The example
should make clear why moving the function is better than moving the data.

### Suggested code shape

Use the actual API where it exists. Where it does not yet exist, label
pseudocode honestly.

Aim for something conceptually like:

```javascript
export async function accountSummary(request, ctx) {
    const partials = await ctx.call({
        query: transactionsFor(request.accountId),
        run: summarizePartition
    });

    return mergeSummaries(partials);
}

function summarizePartition(rows) {
    return {
        count: rows.length,
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        suspicious: rows.filter(isSuspicious).length
    };
}

function mergeSummaries(parts) {
    return parts.reduce(mergeSummary);
}
```

Then show the runtime:

```text
accountSummary()
  ├─ summarizePartition() on partition 12
  ├─ summarizePartition() on partition 41
  ├─ summarizePartition() on partition 76
  └─ mergeSummaries() → response
```

The exact syntax matters less than communicating that this is one logical
service and one deployment.

## Architecture documents

Do not dumb down the architecture documents or remove important implementation
details.

Instead, add a clear conceptual hierarchy near the beginning:

```text
Customer-facing service
    ↓
Endpoint invocation
    ↓
Distributed execution plan
    ↓
Partition-local function calls
    ↓
Database partitions and replicas
```

Explain which subsystem owns each transition.

Architecture documents should make clear that:

* the service is the logical unit;
* the endpoint invocation creates a distributed operation;
* routing determines the relevant partitions;
* functions execute against local data;
* reducers combine partial results;
* placement, retries, cancellation, and failure handling belong to Lagrange;
* database replication and consensus are underlying machinery, not concepts
  exposed to ordinary callers.

Preserve descriptions of Raft, SQLite replicas, partition movement, service
lifecycle, metadata, workflows, and placement. Connect them back to the
service execution model instead of presenting them as independent features.

## Execution semantics

Find or create a focused document explaining the semantics developers need to
trust.

Cover at least:

* retries;
* idempotency;
* partial failure;
* timeouts;
* cancellation;
* side effects;
* ordering;
* transactions;
* result-size limits;
* fan-out limits;
* version compatibility;
* deterministic versus nondeterministic functions;
* what happens during replica or partition movement.

Do not hide these details behind “Lagrange handles distribution.” Explain the
contract tersely and precisely.

Where semantics are undecided, mark them as unresolved design decisions. Do
not invent guarantees.

## Cost language

Explain cost reductions mechanically.

Good:

> The partition functions reduce ten gigabytes of local events to a few
> kilobytes of partial results. The network carries the partial results, not
> the events.

Good:

> Central coordinators merge compact summaries instead of loading and
> processing every matching row.

Bad:

> Lagrange dramatically reduces cloud costs for every application.

Use “can reduce” where results depend on workload shape.

Mention that benefits are strongest when:

```text
data scanned or transformed ≫ result returned
```

Where practical, add example calculations or benchmark placeholders for:

* bytes read locally;
* bytes transferred;
* coordinator CPU;
* partition CPU;
* request latency;
* cross-zone or cross-region traffic.

Do not fabricate benchmark numbers.

## Tone

Write like a technically serious hacker explaining a system to another
technically serious hacker.

Prefer:

> The database is already distributed. The application work usually is not.

over:

> Lagrange unlocks transformative synergies between the data and application
> layers.

Prefer:

> Send the function. Keep the data where it is.

over:

> Seamlessly leverage intelligent workload locality.

Rules:

* Short paragraphs.
* Few adjectives.
* No “revolutionary,” “next-generation,” “seamless,” or “enterprise-grade.”
* Avoid vague claims such as “scalable,” “powerful,” and “high performance”
  without explaining why.
* Use diagrams and code early.
* State limitations plainly.
* Do not sound apologetic about alpha status.
* Do not explain five historical reasons for every design.
* Keep implementation vocabulary out of introductory material unless it proves
  the main idea.

## Documentation layering

Organize the docs so readers encounter complexity gradually.

### Level 1: What it is

For prospective users and first-time visitors.

Explain services, endpoints, distributed execution, locality, and cost.

### Level 2: How to build one

For developers.

Explain SDKs, service layout, `ctx.call()`, partition functions, reducers,
testing, deployment, and observability.

### Level 3: How it works

For architects and contributors.

Explain partitions, replicas, placement, consensus, planning, service
lifecycle, failure handling, and metadata.

### Level 4: Compatibility and internals

Document OCI support, experimental runtimes, legacy mechanisms, implementation
notes, and alternate paths here.

Do not make readers understand level four before they understand level one.

## Deliverables

Make the changes rather than only proposing them.

Produce:

1. an inventory of the documentation and examples you changed;
2. the rewritten main README;
3. updated introductory and getting-started material;
4. updated architecture introductions and diagrams;
5. at least one coherent end-to-end service example;
6. removal or relocation of OCI-first and multi-product positioning;
7. links between the new documentation layers;
8. a short list of unresolved product or API questions exposed by the rewrite.

Keep existing factual detail when it remains accurate. Do not silently rewrite
undecided features as implemented features.

## Final consistency pass

Before finishing, search the repository for:

```text
OCI
container
runtime
service
WASM
ctx.call
stored procedure
scheduler
near the data
compute to the data
deployment mode
```

Inspect every meaningful occurrence.

Check that the repository now tells one consistent story:

> Existing systems call normal Lagrange service endpoints. Developers author
> one coherent service. Lagrange distributes its functions across the relevant
> data partitions. This reduces unnecessary data movement, centralized
> compute, latency, and—on suitable workloads—egress cost.

Anything that contradicts or dilutes that story should be removed, relocated,
or rewritten.
