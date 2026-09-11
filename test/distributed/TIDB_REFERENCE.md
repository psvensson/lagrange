# TiDB/TiKV reference benchmarks

These distributed scenarios make TiDB/TiKV a standing reference peer for
Lagrange. They deliberately separate two questions:

1. **Database baseline:** is Lagrange a credible distributed database on work
   where its compute-placement model should not confer a special advantage?
2. **Architecture thesis:** can a mature Lagrange outperform a strong
   storage-side-compute design when application execution itself follows data
   and composes across partitions?

A run is successful when it produces valid, equivalent evidence. The benchmark
does not require Lagrange to win.

## Isolation and topology

Both GCP profiles provision six identical Compute Engine VMs. `size=3` and
`nodesPerHost=1` place Lagrange on hosts 0-2. The TiDB reference runtime uses
hosts 3-5 only.

The reference topology is:

- three PD instances, one per comparator VM;
- three TiKV instances, one per comparator VM;
- one TiDB server on comparator host 3;
- one MySQL client container on comparator host 3.

The two systems therefore do not compete for CPU or memory. They use the same
GCP machine class and VPC. Comparator ports 8700-8721 stay inside the existing
8080-9090 internal benchmark firewall range.

The profiles request these version-pinned tags:

- `pingcap/pd:v8.5.8`
- `pingcap/tikv:v8.5.8`
- `pingcap/tidb:v8.5.8`
- `mysql:8.4`

`tidb-reference-runtime.js` pulls missing public images directly through each
remote Docker daemon. The report records the Docker content ID actually used
for every component and requires PD/TiKV identity to agree across comparator
hosts. TiDB/TiKV containers are removed at scenario exit; the ordinary
distributed runner still owns GCP teardown.

## Running

The configs are canonical, so no `--scenario` filter is required:

```bash
export LAGRANGE_AUTHORIZE_CLOUD_PROJECT=something-2e584

node test/distributed/run.js \
  --config test/distributed/config/gcp-tidb-oltp-baseline.json \
  --output test-output/reports/tidb-oltp-baseline.json \
  --verbose

node test/distributed/run.js \
  --config test/distributed/config/gcp-tidb-compute-near-data.json \
  --output test-output/reports/tidb-compute-near-data.json \
  --verbose
```

These profiles provision six `e2-standard-8` VMs and therefore cost materially
more than the normal small GCP run. The existing cloud-project authorization
and teardown rules apply unchanged.

## Scenario 1: `tidb-oltp-baseline`

This is the control case. Both systems create the same logical user-table
schema and execute the same sequence:

1. insert one uniquely identified event row;
2. primary-key read that row and prove it is visible;
3. repeat for the configured number of operation pairs.

The Lagrange arm deliberately uses a normal user table rather than a system
table. It waits for the table to have a settled, led partition before the
measured phase begins.

The result records throughput and p50/p95/p99 latency for each side and the
ratios. The initial mature engineering target is intentionally modest:

- Lagrange throughput at least 70% of TiDB/TiKV;
- Lagrange p99 no more than 1.5x TiDB/TiKV.

Those thresholds are **not enforced yet**. The schema and operations are paired,
but the client paths are not: Lagrange is driven through the distributed
harness admin client while TiDB is driven through the MySQL CLI over Docker
exec. This phase is useful for regressions and gross architectural cost, but it
is not publication evidence.

The next maturity step is to route both sides through the comparative benchmark
program's common open-loop observation owner and capacity protocol. At that
point this scenario should become a capacity curve at a fixed p99 SLO rather
than a small sequential sample.

## Scenario 2: `tidb-compute-near-data`

This has two phases on identical synthetic event data. Each account, merchant,
and device owns a contiguous primary-key range. Rows also contain a deterministic
payload so the checked-in profile crosses Lagrange's low benchmark split
threshold. Before measurement, all three Lagrange tables must reach at least two
settled, led partitions. A run that remains single-partition fails rather than
silently weakening the test.

### A. Leaf pushdown control

Each request reduces one entity's primary-key range to `COUNT` and `SUM`. This
is deliberately a case in which TiDB/TiKV should be strong. It prevents the
benchmark from turning "compute near data" into a Lagrange-only claim: TiDB's
normal coprocessor pushdown already attacks this class well.

A mature Lagrange is **not expected to win merely because the reduction is
local**.

### B. Distributed risk composition target

A request forms a data-dependent application graph:

```text
account
   |
   +-- if account signal crosses threshold --> merchant
                                               |
                                               +-- if merchant signal crosses
                                                   threshold --> device
```

Each leaf reads a larger local event set but returns a tiny aggregate. The
current executable control runs that graph with an external coordinator on both
systems and checks that every decision is identical.

That is intentionally *not yet* the architecture-thesis measurement. The
mature Lagrange arm must replace its external SQL coordinator with the public
service/runtime path:

```text
one external request
        |
        v
account-partition service
        |
        +---- ctx.call ----> merchant-partition service
                               |
                               +---- ctx.call ----> device-partition service
```

Independent branches should use parallel fanout. Routing must follow partition
ownership rather than application-maintained location tables.

The target objectives encoded in the profile are:

- at least 2x sustained SLO-qualified decisions/second versus the fair TiDB arm;
- p99 no more than 70% of the TiDB arm;
- no more than 50% of its external coordinator round trips;
- no more than 50% of its bytes across preregistered expensive topology edges.

These are engineering targets, not current claims.

## Coprocessor v2 fairness rule

The thesis benchmark does not become claim-eligible by beating ordinary TiDB
SQL pushdown. Before a Lagrange architecture claim is admitted, the TiDB side
must have an equivalent **TiKV coprocessor v2** comparator artifact implementing
the same storage-local leaf computation. Its immutable artifact identity must
be recorded in `scenarios.tidb-compute-near-data.coprocessorV2`, and the
comparator mode must be `coprocessor_v2`.

The current config intentionally says:

```json
{
  "requiredForClaim": true,
  "comparatorMode": "sql_pushdown",
  "artifactIdentity": null
}
```

so current runs fail closed to `claimEligible: false`. No result can silently be
promoted into a "Lagrange beats TiKV coprocessor v2" claim before that arm
exists.

The coprocessor-v2 adapter should be owned by the comparative benchmark layer,
not embedded as special behavior in TiKV storage orchestration. A custom pinned
TiKV image is acceptable if that is the reproducible way to carry the plugin,
but its image digest and plugin artifact digest must both enter evidence.

## Remaining thesis gates

The scenario already records the missing gates as reason codes. Claim-grade
measurement requires all of them:

1. **Lagrange service graph engaged.** The public deployed WASM/service path,
   not a benchmark-only native shortcut, owns account -> merchant -> device
   composition.
2. **TiKV coprocessor v2 engaged.** Equivalent leaf logic runs in the pinned
   comparator artifact.
3. **Shared open-loop client and statistical capacity protocol.** Reuse the
   existing comparative-workload evidence owner rather than inventing a second
   statistics path.
4. **Expensive-edge byte accounting.** Add topology groups/latencies and meter
   bytes crossing the preregistered narrow edges.
5. **Rebalance subphase.** Move relevant Lagrange partitions while decisions
   continue. Service identity/routing must follow ownership with zero failed
   requests; record p99 disturbance and convergence. Give TiDB the equivalent
   Region/placement disturbance appropriate to its topology.
6. **Whole-topology resource accounting.** Include every PD, TiKV, TiDB,
   client/coordinator and every Lagrange component when projecting cost.

These gates intentionally line up with
`solve/specs/comparative-workload-efficiency-evidence/`: semantic parity,
open-loop capacity, whole-topology accounting, negative/control cases, and
outcome-neutral claim projection remain the authoritative owners.

## Scaling the target workload

The checked-in compute profile is deliberately small enough to iterate on. A
larger campaign should increase `entityCount`, `eventsPerEntity`, `payloadBytes`
and `requestCount` only after the common measurement path is present. The
important axis is not row count by itself; it is the combination of:

- substantial reusable local state per partition;
- small per-service output;
- data-dependent serial and parallel calls;
- placement across latency groups;
- one or more narrow/expensive edges;
- partition movement during sustained load.

That combination tests the actual Lagrange thesis: not just pushing a database
operator into storage, but letting application computation be a topology-aware,
movable participant in the distributed data system.
