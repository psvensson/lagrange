---
audience: human
documentClass: current
---

# Estimating Infrastructure Consolidation

Lagrange may reduce infrastructure cost by combining work that normally lives
in separate database, application, and worker fleets. The saving is not that
application CPU or replicated storage disappears. It comes from removing
avoidable coordination, intermediate data movement, duplicated headroom, and
separately provisioned tiers.

This document provides conservative screening calculations. They are not
benchmark results or product-wide savings claims. A real estimate must use the
existing workload's measured CPU, memory, storage, I/O, network, and failure
requirements.

For latency, throughput, transfer, and network-bill calculations, see
[Estimating Performance, Throughput, And Network Cost](performance-and-cost-estimation.md).

## The Important Distinction

A conventional deployment often provisions several independent pools:

```text
database nodes
+ API and service nodes
+ background-worker nodes
+ aggregation or stream-processing nodes
+ caches, coordinators, and routing infrastructure
```

A Lagrange deployment can place selected application functions on the same
fleet that owns the relevant data:

```text
replicated storage floor
+ combined storage and function capacity
+ failure and burst headroom
+ workloads that genuinely remain external
```

The potential advantage is that the second model is closer to a shared resource
pool. Spare CPU on a storage node can execute useful local work rather than
existing beside an independently scaled service tier.

Do not model this as "database VMs plus application VMs become only database
VMs." The remaining Lagrange nodes usually need more CPU, memory, and operating
headroom than the original database nodes.

## What Does Not Disappear

A responsible estimate keeps these costs:

- the storage and replication floor;
- capacity for the original application logic;
- Raft replication and leader work;
- peak rather than average CPU and I/O demand;
- failure-domain and maintenance headroom;
- backups, snapshots, monitoring, and operational tooling;
- workloads dominated by external APIs or other non-local I/O; and
- service components that should remain operationally separate.

Lagrange currently defaults to three replicas per partition. Three nodes are a
technical minimum for a basic replicated shape, not necessarily a sensible
production fleet. Larger deployments may need additional nodes for capacity,
maintenance, fault-domain spread, and recovery margin.

Managed OCI container execution is not supported today. OCI estimates describe
the intended compatibility path rather than a currently available managed
runtime.

## Use Capacity, Not VM Count, As The Primary Model

Count four resource dimensions separately:

```text
required Lagrange fleet
  = enough nodes for storage and replication
  + enough aggregate CPU for database and selected functions
  + enough memory for both workloads
  + enough I/O and network capacity
  + operating headroom
```

The final node count is constrained by the largest requirement after allowing
for the chosen VM shape and failure policy.

A practical worksheet records:

| Resource | Existing database tier | Existing service and worker tiers | Proposed Lagrange fleet |
| --- | ---: | ---: | ---: |
| Provisioned vCPU | | | |
| Peak used vCPU | | | |
| Provisioned memory | | | |
| Peak used memory | | | |
| Durable storage | | | |
| Peak read IOPS | | | |
| Peak write IOPS | | | |
| Cross-tier traffic | | | |
| Minimum healthy nodes | | | |
| Failure headroom | | | |

The calculation should preserve peak resource demand unless a specific
architectural change removes work. Locality may remove serialization, transfer,
coordinator work, repeated SQL parsing, and waiting. It does not remove the CPU
needed for actual business logic.

## Conservative Screening Ranges

The following ranges are deliberately cautious. They are suitable only for
initial screening before measurement.

| Adoption path | Possible instance-count change | Possible compute-infrastructure bill change |
| --- | ---: | ---: |
| Existing workload moved with minimal change | `0–15%` fewer instances | roughly `-5%` to `+5%`; the first deployment may cost slightly more |
| WASM service using the current context and learned locality | `0–20%` fewer instances | `0–10%` lower where separate service headroom can be consolidated |
| Targeted native hot-path rewrites | `10–35%` fewer instances | `5–20%` lower for qualifying data-intensive systems |
| Native execution also replaces a distinct worker or aggregation tier | `20–45%` fewer instances | `10–30%` lower when that tier mainly coordinates or reduces database data |

These are not additive. Do not combine a `20%` service saving and a `30%`
worker saving into a `50%` total claim.

Instance-count reduction is normally larger than bill reduction because:

- the surviving nodes are larger;
- storage-optimized nodes may cost more than generic service VMs;
- recovery and maintenance headroom must remain;
- disks and backup costs do not fall with compute count; and
- colocated compute may require more memory or faster local storage.

## Small Deployment: Expect Little Or No Saving

Consider:

```text
3 database VMs
3 application VMs
-----------------
6 VMs
```

A cautious Lagrange layout might use five nodes rather than the three-node
replication minimum:

```text
5 larger Lagrange nodes
```

The VM count falls by `17%`, but the five nodes must absorb application work and
retain failure headroom. If each Lagrange node costs `20%` more than an original
average VM, the result is:

```text
original: 6 × 1.0 cost units = 6.0
Lagrange: 5 × 1.2 cost units = 6.0
```

There is no infrastructure-bill saving in this example. Lagrange might still be
valuable for locality, simpler topology, capability control, or later growth,
but cost reduction should not be claimed.

A small or lightly loaded system can also become more expensive if it adopts a
larger replicated fleet than it previously required.

## Medium Data-Heavy Deployment

Consider a more separable topology:

```text
6 database VMs
8 API or service VMs
4 aggregation or background-worker VMs
---------------------------------------
18 VMs
```

Assume the service and worker tiers spend substantial time waiting for database
calls, moving intermediate results, and coordinating partitioned work.

### Minimal-change path

If OCI or WASM workloads are mostly moved rather than rewritten, the same CPU
still exists and only part of the duplicated headroom can be consolidated. A
screening estimate might be:

```text
14–17 combined nodes
```

That is `6–22%` fewer instances. Because the combined nodes are larger, the bill
may remain roughly unchanged or fall by only `0–10%`.

### Native hot-path path

If selected transactions and reductions become partition-local, the system can
also remove some coordinator CPU, serialization, transfer, and worker waiting.
A cautious screening estimate might be:

```text
10–13 combined nodes
```

That is `28–44%` fewer instances. If the new nodes are materially larger, a more
credible infrastructure-cost expectation is approximately `10–25%` rather
than `28–44%`.

This is the shape where Lagrange has the strongest infrastructure argument:
separate service and worker fleets exist largely to bring data to code or to
merge intermediate results.

## Use Cost Units Before Provider Prices

Provider prices change and different VM families are not equivalent. Begin with
normalized cost units:

```text
existing monthly compute cost
  = database fleet cost
  + service fleet cost
  + worker fleet cost
  + cache and coordinator fleet cost

proposed monthly compute cost
  = Lagrange fleet cost
  + remaining external-service cost
```

For example:

```text
existing:
  6 storage nodes × 2.0 units = 12
  8 service nodes × 1.0 unit  =  8
  4 worker nodes × 1.0 unit   =  4
  total                        = 24 units

proposed:
  11 combined nodes × 1.8 units = 19.8 units
```

The instance count falls from `18` to `11`, or `39%`. The compute bill falls
from `24` to `19.8` units, or about `18%`.

This illustrates why "VMs removed" should never be presented as the same
percentage as "money saved."

After the normalized model is credible, substitute actual provider prices,
commitment discounts, disk charges, load balancers, support, and backup costs.

## Where Consolidation Is Most Plausible

Good candidates include systems where:

- storage nodes have unused CPU while service nodes wait on database work;
- application servers retrieve substantial data only to filter, score,
  validate, aggregate, or transform it;
- dedicated workers coordinate fan-out or merge partition results;
- service replicas are overprovisioned separately for availability;
- a cache exists mainly to hide avoidable service/database distance;
- application and database tiers each reserve independent burst headroom; or
- cross-zone placement forces both larger pools and additional traffic.

The most plausible infrastructure saving is usually replacing or shrinking a
worker, aggregation, or coordination tier—not pretending that replicated
storage can run without resources.

## Where Savings Are Weak Or Negative

Expect little saving when:

- database nodes are already CPU-, memory-, or I/O-saturated;
- application logic is compute-heavy and must still run in full;
- most time is spent calling external services;
- application and database tiers already share one efficiently utilized pool;
- one cheap indexed query returns the final result;
- strict isolation requires separate fleets;
- storage requires specialized expensive nodes while services use cheap burst
  capacity; or
- the existing deployment is smaller than a sensible Lagrange fault-tolerant
  footprint.

In these cases Lagrange may still improve latency or operability, but a lower
infrastructure bill is not the right primary claim.

## A Practical Estimation Procedure

1. Inventory every database, API, worker, cache, and coordinator instance.
2. Record provisioned and peak vCPU, memory, disk, IOPS, and network use.
3. Mark which service and worker work can execute through the Lagrange context.
4. Separate actual application CPU from waiting, serialization, copying, and
   coordination overhead.
5. Determine the storage and replication floor under one-node and one-zone
   failure assumptions.
6. Add capacity for selected application functions.
7. Add maintenance, recovery, skew, and burst headroom.
8. Choose realistic combined-node shapes and calculate the new bill.
9. Model disks, backups, support, and network separately.
10. Validate with a representative steady-state load and a failure drill.

A useful reporting table is:

| Measure | Existing | Proposed | Measured after pilot |
| --- | ---: | ---: | ---: |
| Instance count | | | |
| Provisioned vCPU | | | |
| Peak vCPU | | | |
| Provisioned memory | | | |
| Monthly compute cost | | | |
| Monthly storage and backup cost | | | |
| Monthly network cost | | | |
| p95 latency | | | |
| Failure headroom | | | |

## How To Phrase The Claim Honestly

Prefer:

> A capacity model for this workload indicates that 18 existing database,
> service, and worker instances could be replaced by 11 larger combined nodes.
> That is 39% fewer instances but an estimated 18% lower compute bill before
> storage, support, and network costs. The result must be validated in a pilot.

Avoid:

> Lagrange cuts infrastructure costs by 40%.

A cautious general statement is:

> On suitable data-intensive systems, targeted Lagrange-native rewrites may
> justify screening for `10–35%` fewer instances and `5–20%` lower compute
> infrastructure cost. Larger consolidation is possible when a separate worker
> or aggregation tier mainly exists to move and reduce database data. Small,
> CPU-bound, or already consolidated systems may save nothing or cost more.

## Continue

- [Estimating Performance, Throughput, And Network Cost](performance-and-cost-estimation.md)
  covers latency, throughput, transfer, and network billing.
- [The Lagrange Native Programming Model](native-programming-model.md) explains
  the adoption levels and current API boundary.
- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) provides a
  detailed baseline, local function, and reducer example.
- [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
  is the implementation-status authority.
