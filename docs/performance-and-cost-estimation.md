---
audience: human
documentClass: current
---

# Estimating Performance, Throughput, And Network Cost

Lagrange runs the data-intensive parts of a service on the nodes holding the
data. The wins this can produce come from three separable mechanisms, and an
honest estimate treats them separately.

Packaging a service as WASM does not automatically make its code faster. The
gains appear when execution is placed near the replicas it uses, repeated
database round trips collapse into one invocation, or partition functions
filter and reduce data before it crosses the application/database boundary.
The benefits are strongest when

```text
data scanned or transformed ≫ result returned
```

because then the network carries a small result instead of the rows that
produced it.

This document provides conservative calculation methods and illustrative
ranges. They are not benchmark results or promises about every workload.
Measure the existing path before using any estimate commercially.

## The Three Mechanisms Of Win

| Mechanism | Primary win | Reasonable target for a suitable workload |
| --- | --- | --- |
| Placement of an unchanged service | Lifecycle, capability isolation, and coarse locality | `0–20%` lower latency when placement removes a meaningful remote database hop; otherwise approximately unchanged. No automatic CPU-speed claim from packaging |
| Round-trip collapse through the Lagrange context | Fewer sequential crossings and exact data targeting | `15–50%` lower latency for qualifying multi-step paths |
| Partition functions and bounded reduction | Local policy; only partials cross the network | `2–10×` end-to-end speedup and `10–1,000×` less transferred data for qualifying data-heavy operations |

The ranges intentionally become wider as the service gives Lagrange more
information. They also become more workload-dependent.

The current implementation boundary matters:

- services deploy as genuine WASI components; request endpoints are invoked
  over authenticated HTTP;
- call Bindings are invocable over authenticated pgwire (`CALL BINDING $1`)
  or from a request handler through the policy-authorized `callBinding`
  host import: a binding-declared single-table `SELECT`, a partition
  function per relevant partition, numeric per-group partials, and one
  reducer;
- on the call path today, shard dispatch is parallel and bounded (default
  8 concurrent runs; same-host shards serialize) and partials are numeric
  aggregation values - both matter when projecting throughput;
- the `pushdown`, `change`, `time`, `once`, and `boot` Binding kinds are
  declared-only, with no public invocation adapter;
- `native_js` is kernel-internal; and
- managed OCI container activation is unsupported (compatibility scaffold).

See [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
for the authoritative status.

## Start With A Simple Latency Model

A useful first approximation is:

```text
request latency
  = application and database work
  + sequential network round trips × round-trip time
  + transferred bytes ÷ effective bandwidth
  + queueing and contention
```

Lagrange does not make every term disappear:

- database scans, indexes, locks, and storage work remain;
- writes still reach the partition leader and a Raft quorum;
- CPU consumed by the application function remains; and
- cross-partition operations still exchange partial results.

The avoidable terms are repeated application/database crossings, unnecessary
movement of rows or intermediate aggregates, and topology mistakes that place
execution far from the replicas it uses.

## Placement Alone: Moving An Unchanged Service

An unchanged service may still:

1. receive a request;
2. issue SQL;
3. receive rows;
4. apply application logic; and
5. issue writes.

Changing the package format does not remove those steps. Assume unchanged CPU
performance unless measurements prove otherwise.

The performance opportunity comes from placement. If the workload repeatedly
uses the same partitions, putting it on a node or latency group containing a
suitable replica may remove a remote hop.

A conservative interpretation is:

- `0–5%` when database latency is already negligible;
- `5–20%` when one or two remote database calls are a meaningful part of the
  request; and
- potentially much more when a region boundary is removed, but that should be
  treated as a specific topology result rather than a general product claim.

Moving unchanged code remains valuable even at `0%` performance improvement
if it simplifies migration, lifecycle, failure recovery, and later hot-path
extraction. The supported package format for this step is a WASI component;
OCI is a compatibility scaffold, and managed OCI activation is not
supported today.

## WASM Packaging: Do Not Claim That The Format Is Faster

WASM is useful for:

- immutable portable artifacts;
- capability-controlled host access;
- limiting arbitrary network and storage access;
- safe placement and replacement of Cells; and
- attributing successful data access to the issuing service.

Those properties can enable locality and operational improvements. They do not
prove that the component executes application instructions faster than the
same code running natively.

The current JavaScript authoring path embeds a WebAssembly build of
SpiderMonkey. It is a portability path, not evidence that a JavaScript
component will consume less memory or CPU than every containerized equivalent.

Use the same `0–20%` coarse-locality range as any unchanged placement until
the workload uses the Lagrange context in a way that collapses calls or
reduces transferred data. Measure startup, memory, and steady-state CPU
separately for each source language and toolchain.

## Round-Trip Collapse: Calculating The Savings

Consider a transaction-like request that performs:

```text
read account
→ read policy state
→ validate
→ update account
→ insert audit row
```

A conventional service might perform three sequential database round trips.
A partition-local operation can perform the reads, policy, state transition,
and audit beside the owning partition after one routed invocation.

Assume application and database work takes `6 ms` in either design:

| Service/database RTT | Three-round-trip path | One-round-trip path | Approximate improvement |
| ---: | ---: | ---: | ---: |
| `0.2 ms` | `6.6 ms` | `6.2 ms` | `6%` |
| `1 ms` | `9 ms` | `7 ms` | `22%` |
| `3 ms` | `15 ms` | `9 ms` | `40%` |
| `10 ms` | `36 ms` | `16 ms` | `56%` |

This is why `15–50%` is a reasonable target band for a suitable multi-step hot
path. It is not reasonable for one cheap indexed query that already returns the
final small result.

The general calculation is:

```text
latency removed
  ≈ eliminated sequential round trips × measured RTT
```

Use measured p50, p95, and p99 RTT rather than a cloud-region marketing number.
Queueing, connection-pool waits, and serialization may increase the observed
saving beyond the wire RTT alone, while added function overhead may reduce it.

## Throughput: Derive It From The Actual Bottleneck

When requests mostly wait for sequential network calls and worker concurrency
stays fixed, a useful ceiling estimate is:

```text
throughput ratio
  ≈ old request latency ÷ new request latency
```

For the `15 ms` to `9 ms` example:

```text
15 ÷ 9 ≈ 1.67×
```

That does not mean the system will sustain exactly `1.67×` more traffic.
Throughput may instead be limited by:

- storage IOPS or scan bandwidth;
- CPU in the function or SQL engine;
- Raft leader or quorum capacity;
- lock contention;
- partition skew;
- reducer capacity; or
- admission and resource limits.

A cautious target for multi-step transactional paths is `1.2–2×` throughput
when network waiting is a major bottleneck. If storage or consensus already
dominates, expect less.

## Partition Functions And Reduction: Calculate Bytes Before Speed

The most defensible large number is often the reduction in transferred data,
not the end-to-end speedup. This is where `data scanned ≫ result returned`
pays: the partition functions reduce large local inputs to compact partials,
and the network carries the partials, not the rows.

Consider a ranking operation across `16` partitions. A strong SQL baseline
returns `100,000` grouped records to an application service, at `64 bytes` per
record:

```text
100,000 × 64 bytes = 6.4 MB
```

A partition function applies policy locally and returns only the best `20`
candidates from each partition, at `128 bytes` per candidate:

```text
16 × 20 × 128 bytes = 40,960 bytes ≈ 40 KB
```

The transfer reduction is:

```text
6.4 MB ÷ 40 KB ≈ 156×
```

The operation will not become `156×` faster. Every partition still scans and
groups its local data, the policy function still runs, and the partials still
merge. Depending on how important transfer and central sorting were, an
end-to-end improvement of roughly `1.5–5×` might be a reasonable target for
this particular shape.

The more general formulas are:

```text
baseline transfer
  = groups or rows crossing the boundary × bytes per result

bounded-reduction transfer
  = participating partitions × candidates per partition × bytes per candidate

transfer reduction factor
  = baseline transfer ÷ bounded-reduction transfer
```

`10–1,000×` less transferred data is plausible when many rows or groups collapse
into a small bounded answer. It is impossible when the caller genuinely needs
all the rows.

This mechanism is what the call-Binding path implements today: the partition
function runs beside each relevant partition replica, raw rows never leave
the host node, and only emitted partials travel to the reducer. One current
boundary matters for the calculation above: the public reduce gate
coordinates numeric per-group aggregation values (default limit `1,024`
partial entries per call), so a per-candidate record payload like the `128`
bytes-per-candidate example must be encoded into that shape or wait for a
richer partial surface.

## Estimating Network Bills

Use billed application/data traffic, not total cluster traffic. Lagrange still
replicates data through Raft; durability traffic does not disappear.

A monthly traffic estimate is:

```text
monthly GB
  = requests per second
  × application/database bytes per request
  × 2,592,000 seconds
  ÷ 1,000,000,000
```

For `10,000` requests per second and `4 KB` crossing the service/database
boundary per request:

```text
10,000 × 4,000 × 2,592,000 ÷ 1,000,000,000
  = 103,680 GB
  = 103.68 TB per 30-day month
```

At an illustrative network price of `$0.01/GB`, that is approximately:

```text
103,680 × $0.01 = $1,036.80 per month
```

If locality and native execution remove `80%` of that billed traffic:

```text
$1,036.80 × 0.80 = $829.44 saved per month
```

At an illustrative `$0.05/GB`, the same traffic costs `$5,184` per month and an
`80%` reduction saves about `$4,147`.

These are examples, not provider price claims. Insert the actual price for the
specific cloud, direction, zone or region boundary, service, commitment, and
billing date. Some paths bill one direction, some both directions, and some
local traffic is free.

The complete cost formula is:

```text
monthly network cost
  = monthly GB
  × billed directions
  × price per GB
```

## What To Measure Before A Rewrite

Collect at least:

- requests per second;
- sequential statements per operation;
- p50, p95, and p99 service/database RTT;
- rows and bytes returned by each statement;
- partitions touched;
- service-tier and storage-tier CPU;
- connection-pool wait time;
- retries and failure amplification;
- cross-zone and cross-region traffic; and
- actual network billing classification and rate.

Then estimate three separate effects:

1. **Placement:** which calls become local or remain within one latency group?
2. **Round-trip collapse:** how many sequential crossings become one invocation?
3. **Reduction:** how many bytes can be filtered, scored, or aggregated before
   exchange?

Do not combine these into one assumed multiplier. Calculate each one, then run
a representative steady-state test.

## How To Phrase Results Honestly

Prefer:

> This workload moved `156×` fewer bytes across the application/database
> boundary and completed `2.3×` faster at p95 in the measured deployment.

Avoid:

> Lagrange is `156×` faster.

Prefer:

> Extracting this five-statement partition-local transaction removed two
> sequential network round trips and reduced p95 latency from `15 ms` to
> `9 ms`.

Avoid:

> Native functions make transactions `40%` faster.

The narrow, measured statement is usually more convincing because readers can
see which part of their own workload has the same shape.

## Continue

- [Service Deployment Guide](service-deployment-guide.md) deploys the
  service and documents the call-Binding authoring and invocation flow.
- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) provides a
  detailed grouped-SQL baseline, partition-local policy, and bounded reducer.
- [MovieLens: Distributed SQL And Data-Affine Services](../examples/service-data-affinity/README.md)
  runs the current execution and placement proof.
- [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
  is the implementation-status authority.
