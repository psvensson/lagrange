# Rolling-restart statistical gate — 20260731T094947Z

- runs: 1
- srcFingerprint: a742f71ff7fc0360 (debugLogs: false)
- **staleSourceRuns (untrustworthy — must be 0): 0**
- **CORRUPT (hard invariant breach — must be 0): 0**
- **ORACLE_BLIND (unjudgeable — snapshot transport failed, CL-031): 0**
- **NODE_EXIT (unexpected node death — read its exit evidence, CL-030): 1**
- **TOPOLOGY_BLOCKED (scenario failed after publication convergence): 0**
- stallRate (frozen / gave up): 0
- healthyRate (converged or progressing): 0
- convergeRate (missing=0): 1
- wallSeconds p50/p95: 523 / 523

## classification (correctness-first, then progress)
- NODE_EXIT: 1

## missingPublishedCount histogram
- missing=0: 1

## dominant reason tally
- nodeAdmissionBlocked: 1

## sealed-bar verdict (docs/convergence-donewhen-metric.md §5)
- **verdict: SAFETY_VIOLATED** — safety floor breached (must be 0 every run): {"corrupt":0,"nodeExit":1,"oracleBlind":0,"staleSource":0}
- passes: 0/1 (point estimate 0.000)
- Wilson-95 interval: [0.000, 0.793]; sealed bar: 0.357
- safety floor clean: false {"corrupt":0,"nodeExit":1,"oracleBlind":0,"staleSource":0}
- note: promotion verdicts require an N>=15 fixed-code window (§5); this gate has N=1
