# Detailed design: Public-path scale and failure certification

Quest: `public-path-scale-and-failure-certification` (Q11, gate).
Requirements contract: [`requirements.md`](requirements.md) "Scale failure
certification". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12. Metric: `sealed-bar` (unique among the
epic's Quests). Depends on Q2–Q7 and Q10; consumes the Q1 report schema
unchanged.

## Owner boundaries touched

- `test/distributed/harness/scenario-registry.js`,
  `test/distributed/harness/scenario-config.js`, and
  `test/distributed/harness/docker-provider.js` — the scenario substrate;
  the certification is a registered scenario, not new harness machinery
  (D11).
- `scripts/solve/probes/scenario-harness.js` — the probe that reads the
  report and answers the sealed-bar verdict.
- Sealed-evidence precedent to follow, not duplicate:
  `test/distributed/harness/scale-evidence-contract.js` and
  `test/distributed/harness/scale-certification-receipt-freshness.js`
  (evidence contracts, receipt freshness), and
  `test/distributed/harness/comparative-efficiency-claim-projection.js`
  (claim projection). Scale-axis cardinality claims link to the
  `large-scale-data-plane-certification` epic; cost-efficiency comparison
  links to `comparative-workload-efficiency-evidence` (D11).
- The Q1 baseline scenario's report schema (digests, topology, local-read
  proof, latency percentiles, bytes by channel, CPU, peak memory, retries,
  fidelity `live`) is consumed **unchanged**; this Quest adds a
  certification-verdict section, not a second report format.
- Baseline comparison precedent:
  `test/distributed/scenarios/postgres-baseline-comparison*.js`.

## Contract shape

### Certification bars (sealed before any run)

The bar document is sealed (digested) before the first counted run and
names, per measured dimension: p95/p99 latency, throughput, transferred
bytes by channel, CPU, peak memory, retry rate, error rate, node-loss
availability behavior, and recovery time. Numeric bar values are **open**
(set at sealing time, below) — the *schema* of the bar document and the
rule that no dimension may be dropped are sealed here. Where variance
matters, the bar predeclares its statistical method (Wilson interval or an
explicitly named alternative) and sample counts.

### Workload axes (representativeness)

The chosen workload — account summary is the standing candidate;
event/observability/fraud/IoT substitutes acceptable — must exercise, in
one certified run:

1. typed selector narrowing (Q2),
2. input above one old batch per selected shard (Q3 paging, >4096 rows),
3. structured partials (Q4),
4. more than one service operation in one component (Q5),
5. data partitions on multiple partition-host nodes,
6. the public authenticated HTTP path end to end (D1, D6),
7. node transport under mTLS (Q7).

### Sealed method

- Dataset and workload-generator digests sealed; named machine, storage,
  network, release commit, and topology (D7).
- Repeated warm steady-state measurement windows; cold-start excluded and
  labeled.
- The baseline is a strong conventional PostgreSQL/application
  implementation of the same workload under comparable durability
  configuration, measured on the same hardware.
- Failure drill inside the measured run: one non-seed data host stopped
  during load; availability behavior and recovery time recorded.
- Acknowledged-result parity verified against an independent oracle — never
  the service under test, never the loader/driver's own counters.

### Report and verdict

One machine-readable report: the Q1 schema per run, plus
`{barDigest, perDimension: {measured, bar, verdict}, overallVerdict,
neutralOrNegativeFindings[]}`. The report records neutral or negative
outcomes as faithfully as wins and cannot omit a measured dimension to
reach a passing verdict (sealed outcome-neutrality constraint). The
`sealed-bar` metric passes only when every dimension has a measured value,
a sealed bar, and a verdict.

## Failure semantics (D12)

The verdict is **non-terminal** (not merely failing — incapable of
terminal-verdict status) when any of these holds:

- missing public-path proof (any internal `native_js` or runtime
  substitution in the measured path — D1, D6),
- missing local-read proof on at least two partition hosts,
- missing or self-referential parity oracle,
- missing failure drill (node stop) or unrecorded recovery,
- synthetic or backfilled metrics; report fidelity not `live`,
- bar document mutated after sealing (digest mismatch),
- any measured dimension absent from the report.

Wrong answers under load, parity divergence, and bar breaches are ordinary
failing verdicts, faithfully recorded.

## Non-goals and edition boundaries

- Not an internal data-plane scale ladder — cardinality/scale-axis claims
  link to `large-scale-data-plane-certification` (D11).
- Not a cost-efficiency study — that is
  `comparative-workload-efficiency-evidence` (D11).
- No benchmark-only fast path, no harness-private runtime configuration
  that a pilot could not reproduce (D1, D6, D7).
- Community/AGPL scope; commercial-edition capabilities are neither
  measured nor implied (D8/D9).

## Open decisions left to the Quest

- Numeric bar values per dimension (set when the bar document is sealed,
  after Q1 baseline data exists; the epic's gate review owns sign-off).
- Final workload selection (account summary vs a substitute meeting all
  seven axes).
- Named hardware: the certification host(s) and topology cardinality
  (minimum: partitions on ≥2 data hosts; exact node count open).
- Baseline implementation details (PostgreSQL version, app-tier shape,
  durability settings) — must be documented in the sealed method.
- Where the sealed bar document lives (`solve/evidence/` receipt vs a
  harness-adjacent sealed artifact) — one location, digested either way.
