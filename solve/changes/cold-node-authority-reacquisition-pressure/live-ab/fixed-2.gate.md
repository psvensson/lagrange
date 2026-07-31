# Rolling-restart statistical gate — 20260731T100454Z

- runs: 1
- srcFingerprint: a742f71ff7fc0360 (debugLogs: false)
- **staleSourceRuns (untrustworthy — must be 0): 0**
- **CORRUPT (hard invariant breach — must be 0): 0**
- **ORACLE_BLIND (unjudgeable — snapshot transport failed, CL-031): 0**
- **NODE_EXIT (unexpected node death — read its exit evidence, CL-030): 0**
- **TOPOLOGY_BLOCKED (scenario failed after publication convergence): 0**
- stallRate (frozen / gave up): 1
- healthyRate (converged or progressing): 0
- convergeRate (missing=0): 1
- wallSeconds p50/p95: 451 / 451

## classification (correctness-first, then progress)
- STALLED: 1

## missingPublishedCount histogram
- missing=0: 1

## dominant reason tally
- nodeAdmissionBlocked: 1

## sealed-bar verdict (docs/convergence-donewhen-metric.md §5)
- **verdict: INCONCLUSIVE** — Wilson-95 interval [0.000, 0.793] straddles the sealed bar 0.357; more runs would narrow it (advisory only — §4 deliberately does not compute a required N)
- passes: 0/1 (point estimate 0.000)
- Wilson-95 interval: [0.000, 0.793]; sealed bar: 0.357
- safety floor clean: true {"corrupt":0,"nodeExit":0,"oracleBlind":0,"staleSource":0}
- note: promotion verdicts require an N>=15 fixed-code window (§5); this gate has N=1
