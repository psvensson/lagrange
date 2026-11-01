# One canonical comparative-benchmark chain (design note, 2026-11-01)

Owner of this note: the quest `comparative-benchmark-evidence-repair`. It binds the implementers of
the three work streams to one record shape and one vocabulary. Owners named here are the only places
a concept lives (R01/R06/R07/R11).

## Chain

```
frozen campaign manifest
  -> deployment (native deployer per product; readiness fail-closed; dataset load + verification;
     observed topology/identity)
  -> adapters (native protocol per product) executing the CANONICAL workload
  -> shared owners: oltp-open-loop-step-owner (schedule + request clock),
     oltp-paired-retry-owner (retries), oltp-paired-sweep-plan (pairing/counter-balancing),
     semantic profile + semantic gate + proof cases (correctness)
  -> typed operation outcomes with retained response evidence
  -> raw observation store (append-only run records, v2)
  -> claim-specific admission (+ append-only invalidation ledger)
  -> derived metrics/statistics (from retained observations only)
  -> renderers (consume admitted cells only)
  -> offline recomputation check (recompute everything from raw; any drift fails)
```

Deleted, not kept as an alternate path: the generated bench_* smoke workload in
`real-product-workload-drivers.js`, the 33 ad-hoc "semantic proofs", the Node TCP forwarder
"App Service", constant phases/bytes, `OPERATING_BOUNDARY_MAP`, fixed recovery/backfill timings,
label-hash digests, the `'mismatched'` sentinel, the `/health` substitute.

## Operation outcome owner: `test/distributed/harness/benchmark-operation-outcome.js` (new)

Imports the shared outcome words from `oltp-scenario-a-semantic-profile.js`
(`committed`, `serialization_conflict`, `terminal_failure`) and adds the accounting subclasses the
profile leaves to the harness:

- `outcome`: `committed` | `serialization_conflict` | `terminal_failure` | `unresolved` | `unissued`
- `failureClass` (only with `terminal_failure`/`unresolved`):
  `product_error` (product returned an error envelope / SQLSTATE other than the retryable class),
  `correctness_failure` (syntactically valid response, wrong value / missing row / zero affected rows
  / invariant violated), `transport_failure` (connect/socket error, data path unavailable),
  `ambiguous_commit` (client deadline/disconnect after send, commit status unknown; profile v1 scores it
  `terminal_failure`, accounting keeps it visible as `unresolved`).
- A logical request record keeps every physical attempt: `{attemptNo, startedMs, endedMs, outcome,
  sqlstate|errorCode, responseDigest}` plus `responseEvidence` (the raw response envelope or rows
  needed to re-check the contract, or a sha256 + retained-file path when large).
- Accounting invariants (validator throws, never coerces):
  `offered = issued + unissued`; `issued = committed + conflictExhausted + terminalFailures(sum of
  classes) + unresolved`; `attempts >= issued`; every count is a non-negative safe integer; every
  timing is a finite non-negative number; `opId` unique; duplicate ids, NaN, negative, missing fields
  are rejected.
- Profile v1 injects no per-request deadline. The campaign watchdog (a run-level bound) stops issuing
  and marks the remaining plan `unissued` and in-flight requests `unresolved`; it never completes a
  request. Changing the request-deadline policy requires a new semantic-profile id.

## Raw observation record v2: `test/distributed/harness/raw-observation-record.js` (new, stream A)

`schemaVersion: 'lagrange-raw-observation-v2'`, one record per run, NDJSON, append-only.
Campaign header record `recordType: 'campaign-header'` once per campaign (campaignId, startedAt,
manifestDigest, harness identity, executionTarget, physicalHosts).

```
{ recordType: 'run', schemaVersion, campaignId, runId, claimKey,        // claimKey = target/scenario/subkind/rate/repetition
  targetId, scenario, subkind, executionTarget: 'lab' | 'gcp',
  identity: {
    harness: { gitCommit, driverSourceSha256, adapterIds: [...] },
    products: [{ role, host, containerId, imageRef, imageId, repoDigest, entrypoint, cmd,
                 reportedVersion }],                                     // from `docker inspect` of RUNNING containers
    publication: null                                                    // filled by the publisher, never by the runner
  },
  plan: { manifestDigest, datasetDigest, workloadPlanDigest, measurementPlanDigest,
          semanticProfileId, semanticProfileDigest, retryPolicyId, openLoopProfileId,
          sweepPlanDigest, offeredRatePerSec, repetition, orderIndex, warmup: {...} },
  deployment: {
    hosts: [{hostId, ip, hostname, bootId, cpus, memGb}],
    roles: [{role, host, containerId}],                                   // roles separate from host count
    storage: [{containerId, mount, kind: 'host-volume'|'container-layer'}],
    readiness: { state: 'ready'|'exhausted', observedAt, evidence },
    dataset: { tables: [{table, rows}], keyCoverage: {expected, present}, logicalChecksum },
    placement: null | { observedAt, replicasByPartition: [...] }          // observed, never derived from RF/nodeCount
  },
  observations: {
    requests: [ ...logical request records (see outcome owner) ],
    accounting: { offered, issued, unissued, attempts, committed, conflicts, conflictExhausted,
                  terminalFailures: {product_error, correctness_failure, transport_failure}, unresolved },
    window: { scheduledMs, drainMs, drainOverrunMs, startedAt, endedAt },
    resources: null | { scope, samples },                                 // named boundary or null
    network: null | { scope: 'host-nic-total', byHost: {...} }            // labelled scope, never 'WAN'
  },
  correctness: { semanticGate: { status, passed: [...], failed: [...], missing: [...] } | null,
                 finalState: null | {...} },
  rawObservationsDigest   // sha256 over canonical JSON of `observations` + `correctness` + `deployment` + `identity` + `plan`
}
```

Derived metrics are computed by the store from `observations` only. `latency` summarises committed
requests only; `attemptLatency` summarises all issued requests. Throughput denominator =
max(scheduledMs, drainMs). Missing evidence is `null` plus a status, never 0.

## Claim admission owner: `test/distributed/harness/benchmark-claim-admission.js` (new, stream A)

Input: one claim (claimKey) + its run records + the invalidation ledger. Output cell:

- `status`: `valid-observed` | `product-failure` | `invalid-measurement` | `blocked` | `unsupported`
  | `not-measured`
- `reasons: [...]` (typed codes, e.g. `timeout-counted-as-success`, `health-substitute`,
  `non-canonical-workload`, `identity-missing`, `readiness-unverified`, `dataset-unverified`,
  `invalidated:<ledger-id>`), `evidence: {runIds, rawObservationsDigests}`, `metrics` (only for
  `valid-observed` and `product-failure`; for `product-failure` the failure counts are the metric).
- Admission is claim-specific: throughput admission does not admit recovery, placement, freshness
  or survivability; each of those needs its own observed record kind.
- Checksums prove integrity only; admission also requires identity (running-container inspection),
  execution (dispatch family matches claim) and semantic witnesses (gate passed for Scenario A).

Invalidation ledger `data/tidb-comparison/invalidations.ndjson` (append-only):
`{ id, recordedAt, scope: { file, campaignGitCommit, receiptIds|'all' }, reason codes, defectIds
   (D01..), note, recordedBy }`. Invalidated records stay where they are; publication of those claims
   becomes `invalidation` with the reason.

Renderer vocabulary: cells print the status word and reason codes; no numeric default, no
`winningSystem`, no `rpoZeroSurvivability` unless an observed survivability record exists.

## Lab default (owner instruction 2026-11-01)

`docs/benchmarks/cloud/run-comparative-benchmarks.mjs` defaults to `--execution-target lab`. Hosts are
discovered from the registered lab inventory (the `scripts/lab/*` owners; `harness` role; reachable;
free) and never typed by hand; each host is taken with the machine-wide `flock` + holder record from
`docs/development/home-lab.md` and released on exit; the thermal gate applies. GCP is explicit
(`--execution-target gcp --hosts ...`) and creates nothing.

## Scope decision for this quest

- Scenario A: canonical workload through the existing adapters (Lagrange over the public PG wire via
  `oltp-scenario-a-lagrange-public-pg-context.js`, TiDB via `tidb-oltp-adapter.js`, PostgreSQL via a
  native pg adapter sharing the executor), semantic gate, open-loop/retry/sweep owners. First target:
  a *named smoke profile* on three real products on lab hosts with full verification, published as
  smoke. No capacity claim.
- Scenario B: Lagrange `blocked` (no compiled risk service exists); comparators `not-measured`.
- Scenario C, scale-out, partition sweep, movement, RTT, recovery, backfill: `not-measured` /
  `unsupported` until their execution and observation exist. No numeric substitutes.
- All currently published numbers: invalidated by ledger entries (forensic records retained).
