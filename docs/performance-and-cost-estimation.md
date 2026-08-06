# Measuring Performance And Network Cost

Lagrange can remove avoidable data movement and service/to-database round
trips. It does not make WASM instructions automatically faster, remove Raft
consensus, or make every workfload cheaper.

The strongest workload shape is:

```text
data scanned or transformed >> result returned
```

The most defensible early claims are mechanical and measured:

- sequential round trips removed;
- rows or groups no longer crossing the application/database boundary;
- bounded partials replacing an unbounded intermediate result;
- coordinator CPU and memory removed; and
- billed cross-zone or cross-region bytes removed.

This page gives a workload screening model and a measurement procedure. It
does not project a product-wide speedup or cost reduction.

## Current public path

Add current bounds to any estimate:

- a distributed operation has one literal single-table selector fixed at
  deployment;
- the public path does not stream or page an oversized shard batch;
- the default shard row bound is 4,096, with additional byte and deadline
  bounds;
- partials are finite numers with shard-disjoint keys;
- the default emit budget is 64 and the merged partial cap is 1,024;
- shard dispatch allows up to eight concurrent runs, but shards routed to
  the same component instance serialize; and
- shard reads do not form one global snapshot.

An estimate that assumes unbounded input, structured partials, or per-call selector
narrowing is not an estimate for the current product.

## Measure the existing path first

For one candidate operation, record:

- requests per second;
- statements per request;
- sequential statements per request;
- p50, p95, and p99 service/to-database round-trip time;
- rows and bytes returned by each statement;
- partitions or shards touched;
- service-tier CPU, memory, and connection-pool wait;
- database CPU, scan bytes, and storage wait;
- cross-host, zone, and region traffic; and
- retries, timeouts, and failure amplification.

Keep the raw
measurement period and the load-generation procedure with the pilot report.

## Separate the mechanisms

### Placement

Moving an unchanged service may remove one remote database hop when a replica
already exists on or near the selected node. It does not change the application
algorithm or the result volume.

The claim for this step is:

```text
hops and latency groups before
versus
hops and latency groups after
```

Do not assume a latency percentage. Measure it.

### Round-trip collapse

Consider a request that performs three sequential database crossings and 6
ms of CPU plus storage work.

| Service/database RTT | Three crossings | One crossing | Latency removed by the model |
| ---: | ---: | ---: | ---: |
| 0.2 ms | 6.6 ms | 6.2 ms | 0.4 ms |
| 1 ms | 9 ms | 7 ms | 2 ms |
| 3 ms | 15 ms | 9 ms | 6 ms |
| 10 ms | 36 ms | 16 ms | 20 ms |

The general estimate is:

```text
sequential latency removed
  = eliminated sequential crossings ∙ measured RTT
```

This is a latency component, not a prediction of final p50 or p99. Add WASM
entry, planning, local read, queuing, reduction, and coordination overhead.

### Data reduction

Compare abytes at the service/storage boundary.

Baseline:

```text
baseline transfer
  = rows or groups returned to the service
  × average serialized bytes per result
```

Lagrange call:

```text
approximate partial transfer
  = participating shards
  × emitted partials per shard
  × average serialized bytes per partial
```

Add the reduced result and coordination overhead to the latter.

Example worksheet:

| Measure | Baseline | Lagrange |
| --- | ---: | ---: |
| Matching rows or groups | 100,000 | local only |
| Serialized bytes per baseline result | 64 | - |
| Participating shards | - | 16 |
| Emitted partials per shard | - | 10 |
| Bytes per partial | - | 128 |
| Calculated boundary transfer | 6.4 MB | about 20 KB |

The arithmetic ratio is a screening signal. It is not a speedup ratio. Both paths
still read, compute, queue, and merge.

The current public partial contract accepts finite numbers per key. A candidate
like the candidate-record worksheet above must fit that contract. It cannot
assume arbitrary 128-byte structured partials.

## Calculate an end-to-end result

After the mechanical design looks promising, implement both paths in the same
environment and measure steady state.

Record at least:

- warm-up procedure and duration;
- load shape and concurrency;
- p50, p95, and p99 latency;
- requests completed per second;
- baseline and Lagrange boundary bytes;
- local, cross-host, cross-zone, and cross-region bytes;
- coordinator, service, and storage CPU;
- memory, allocation, and garbage collection;
- queue length and connection-pool wait;
- shard batch sizes, partial counts, and partitions touched;
- retries by typed classification; and
- error rate.

Run at least one node-loss or partition-movement window. The test should prove
that fencing and retry do not turn stale work into success.

## Throughput

Do not derive throughput from latency alone. Throughput can be limited by:

- SQLite scan bandwidth;
- partition leader CPU;
- Raft quorum writes;
- WASM execution and per-instance serialization;
- distributed-shard pool width;
- reducer CPU;
- lock or transaction contention;
- partition skew; and
- node resource admission.

A useful report shows the bottleneck reached at each load level, not just the
maximum successful request rate.

## Network billing

Calculate billed application/storage traffic, not all traffic in the cluster.
Raft replication, snapshot transfer, heartbeats, metadata CDC, and service control
traffic still exist.

```text
monthly GB
  = requests per second
  × application/storage bytes per request
  × 2592000 seconds
  ÷ 1000000000
```

Then:

```text
monthly network cost
  = monthly GB
  × billed directions
  × actual price per GB
```

Use the exact provider, region, zone, direction, service, commitment, and billing
date. Do not use an example price as a customer claim.

## Reporting the result

State the mechanism, the measurement, and the environment.

Good:

> Partition-local filtering reduced the application/storage boundary from 6.4 MB
> to 41 KB per request and reduced p95 from 48 ms to 21 ms on the described
> five-node, single-region deployment.

Bad:

> Lagrange is 156x faster.

A transfer ratio is not a latency ratio. A single workload result is not a
product-wide promise.

## Evidence status

The current repository contains:

- a single-node, two-partition code-first WASM functional proof;
- multi-node integration tests for host-local row reads and bounded shard
  dispatch; and
- a multi-process MovieLens comparison whose service phase uses an internal
  `native_js` query-loop runtime.

It does not yet contain a multi-node, public code-first WASM benchmark
compared against a controlled conventional deployment. Treat performance
numbers outside these repository fixtures as workload hypotheses until that
exists.

## Continue

- [Technical evaluation](evaluate.md)
- [Migration and adoption](migration.md)
- [Infrastructure capacity measurement](infrastructure-cost-estimation.md)
- [Rewrite a hot path](tutorials/rewrite-a-hot-path.md)
- [Current capabilities](current-capabilities-and-limitations.md)
