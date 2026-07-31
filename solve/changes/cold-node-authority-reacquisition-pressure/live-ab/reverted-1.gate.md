# Rolling-restart statistical gate — 20260731T095858Z

- runs: 1
- srcFingerprint: 4e03d2c5f6f8d2bb (debugLogs: false)
- **staleSourceRuns (untrustworthy — must be 0): 0**
- **CORRUPT (hard invariant breach — must be 0): 0**
- **ORACLE_BLIND (unjudgeable — snapshot transport failed, CL-031): 0**
- **NODE_EXIT (unexpected node death — read its exit evidence, CL-030): 0**
- **TOPOLOGY_BLOCKED (scenario failed after publication convergence): 1**
- stallRate (frozen / gave up): 0
- healthyRate (converged or progressing): 0
- convergeRate (missing=0): 1
- wallSeconds p50/p95: 345 / 345

## classification (correctness-first, then progress)
- TOPOLOGY_BLOCKED: 1

## missingPublishedCount histogram
- missing=0: 1

## dominant reason tally
- admin_reachability_refused: 1

## sealed-bar verdict (docs/convergence-donewhen-metric.md §5)
- **verdict: INCONCLUSIVE** — Wilson-95 interval [0.000, 0.793] straddles the sealed bar 0.357; more runs would narrow it (advisory only — §4 deliberately does not compute a required N)
- passes: 0/1 (point estimate 0.000)
- Wilson-95 interval: [0.000, 0.793]; sealed bar: 0.357
- safety floor clean: true {"corrupt":0,"nodeExit":0,"oracleBlind":0,"staleSource":0}
- note: promotion verdicts require an N>=15 fixed-code window (§5); this gate has N=1
