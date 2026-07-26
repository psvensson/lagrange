# Requirements: Comparative Workload-Efficiency Evidence

## Scope and claim rule

This program may show where Lagrange is faster, cheaper, equivalent, or worse
than a named alternative for a sealed workload and topology. It does not
establish a universal efficiency law. Every published comparison SHALL name
the evidence class, profile, workload manifest, alternatives, software and
hardware identities, SLO, estimator, uncertainty, pricing source, and artifact
digest. Missing or incomparable evidence projects `no_claim`.

## R0 — Owner handshake and shared identity

- `scale-certification-evidence-contract` SHALL own the common versioned
  run-profile/config/report envelope: software revision, hardware class,
  topology, data shape, workload identity, duration, safety, performance,
  resources, convergence, provenance, and claim eligibility.
- Comparative evidence SHALL extend that envelope with pair, alternative,
  parity, cost, statistics, and claim fields; it SHALL NOT create a parallel
  profile identity.
- Large-scale certification owns profile qualification and numeric scale gates.
  The comparative program owns pair validity and relative conclusions.
- Service-data affinity continues to own access attribution, routing policy,
  placement scoring, evidence decay, and hysteresis. Comparative workloads
  observe those mechanisms without changing their meaning.

## R1 — Immutable workload and alternative manifests

Each matrix cell SHALL seal before execution:

- dataset generator or content digest, cardinality and bytes, schema, access
  distribution, skew, mutation/change schedule, correctness oracle, durability
  level, consistency level, warmup, cache state, and client locations;
- every alternative's component graph, replication/fault-tolerance contract,
  availability scope, query semantics, indexing/materialization policy,
  autoscaling policy, minimum footprint, and excluded services;
- offered-load schedule, randomized blocked-pair order, minimum and maximum
  repetitions, stopping rule, timeouts, and artifact-retention policy.

Changing any sealed item creates a new matrix identity. Results from different
identities SHALL NOT be pooled.

## R2 — Analytical opportunity calculator

The calculator SHALL be a versioned, deterministic, unit-checked model over
immutable inputs. It SHALL separately estimate, per correct operation:

- local and remote bytes; replication, fanout, shuffle, rebuild, compaction,
  and materialization amplification;
- CPU-seconds, memory byte-seconds, storage byte-seconds, IOPS, and network
  byte-distance where meaningful;
- provisioning headroom and minimum-footprint effects.

Every output SHALL carry units, formulas, assumptions, sensitivity ranges, and
an uncertainty classification. Unsupported or dimensionally inconsistent
inputs fail closed. Calculator results are `analytical_bound`; they may
prioritize experiments but never substitute for measured throughput, latency,
or infrastructure cost.

## R3 — Semantic and correctness parity

- SQL SHALL be compiled or adapted for each dialect; sending SQLite-only syntax
  directly to PostgreSQL is invalid.
- Each paired alternative SHALL produce equivalent result sets, ordering where
  semantically required, transaction/durability outcomes, and error behavior.
- Throughput counts only correct, SLO-eligible operations. Errors, timeouts,
  rejects, undispatched work, and client-queue overflow remain explicit
  denominators and never count as success.
- Historical PostgreSQL comparison reports are diagnostics only and SHALL be
  rejected by the claim projector unless regenerated under this contract.

## R4 — Measurement and capacity protocol

- Load generation SHALL be open-loop and include client queueing in end-to-end
  latency. Warmup and measured windows are separate.
- A capacity point is the maximum offered load whose correct throughput
  satisfies the shared error-rate and latency SLO for the entire measured
  window. Speedup from unconstrained throughput is forbidden.
- Paired runs SHALL use randomized blocked order. The protocol SHALL preregister
  minimum/maximum N, estimator, confidence interval, practical-significance
  threshold, sufficient tail samples for p99, stopping rule, and
  multiple-comparison treatment.
- Both sides SHALL report like-for-like p50/p95/p99 distributions plus offered,
  dispatched, correct, rejected, timed-out, errored, and queue-overflow counts.
- Cache reuse, warm/cold state, run order, adaptive stopping, and missing samples
  SHALL be visible in the immutable artifacts.

## R5 — Whole-topology resource and cost accounting

Fixed-resource comparisons constrain the whole architecture, including
database, Lagrange nodes, coordinators, clients/load generators, proxies,
durable storage, control plane, monitoring required for the run, and any
alternative-specific service. Shared external load generators may be excluded
only symmetrically and must still be measured for saturation.

Fixed-SLO cost SHALL:

- distinguish provisioned from utilized CPU, memory, storage, IOPS, and network;
- include replication, temporary movement/rebuild/compaction amplification,
  inter-node and inter-zone traffic, minimum deployable footprint, and reserved
  headroom;
- use a versioned region/currency/date/billing-granularity price sheet and name
  reservations, spot assumptions, taxes, credits, and exclusions;
- compute infrastructure cost per million correct SLO-eligible operations from
  immutable units without double counting shared components.

Human operations and migration labor are reported qualitatively unless a
separate preregistered study supplies a defensible unit model.

## R6 — Preregistered workload matrix

The initial matrix SHALL cover:

1. semantic SQL CRUD/mixed read-write parity;
2. negative controls: small/simple workload, uniform random access, no reusable
   computation, update-heavy invalidation, and a configuration where the named
   alternative should be structurally favored;
3. request enrichment with one-to-many lookups under locality and skew sweeps;
4. MovieLens grouped reduce through the public installed request/WASM Cell
   surface, never the internal `native_js` substrate;
5. change-rate crossover sweeps over dataset size, mutation rate, diversity,
   skew, and recomputation/materialization policy.

Every preregistered cell must produce a valid result or an explicit
non-measuring classification. Workload Quests close on full matrix completion
regardless of direction; selecting one favorable, neutral, and unfavorable
result is insufficient.

## R7 — Harness fidelity and artifacts

The harness-fidelity attack template applies. Synthetic known-byte tests are
necessary but insufficient: resource meters SHALL be calibrated at the live
transport/storage/process seams, and a directed live run SHALL prove the
intended mechanisms were engaged. Raw samples, manifests, logs, price sheets,
component inventories, and summaries SHALL be immutable and content-addressed.
A broken, disconnected, saturated load generator or otherwise non-measuring
run cannot establish capacity or cost.

## R8 — Claim projection

The projector SHALL consume only schema-valid, digest-verified evidence and
emit one of `analytical_bound`, `measured_p0`, `certified_profile`, or
`no_claim`. It SHALL preserve calculator error, regressions, neutral results,
losses, uncertainty, practical insignificance, expired scale certification,
and unsupported matrix cells. No prose path may turn an analytical estimate,
smoke threshold, or internal-substrate run into a measured product claim.
