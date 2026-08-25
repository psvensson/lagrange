# Formation barrier spread-cure admission live A/B: exact final candidate

Date: 2026-08-25  
Quest: `formation-barrier-spread-cure-admission-liveness`  
Base/reverted commit: `a00df079c5a2bea5e2143f46e2662f9f95f5d7b4`  
Exact 21-path candidate diff SHA-256:
`a3d8ad51dbb5a3f4e488c19e6740ebce20ea75bedd8521db5fb44f3bbc902f51`

## Verdict

The fresh serial five-node A/B satisfies the sealed final-candidate bar. Both
fixed runs used source fingerprint `bbd70acf45475c8b` and reached READY without
crossing the unchanged 120-second operation-ledger formation barrier. Both
exact-revert runs used source fingerprint `ac3f39ef3a1f1a8c` and exercised the
same cold staggered-joiner probe. The fixed arm retained 74,662 ms and 65,963 ms
of barrier headroom.

| Arm | Run | Source fingerprint | Formation | Barrier timeout | Final result |
| --- | ---: | --- | ---: | ---: | --- |
| exact final candidate | 1 | `bbd70acf45475c8b` | 45,338 ms | 0 | READY |
| exact final candidate | 2 | `bbd70acf45475c8b` | 54,037 ms | 0 | READY |
| exact reverted base | 1 | `ac3f39ef3a1f1a8c` | 53,842 ms | 0 | READY |
| exact reverted base | 2 | `ac3f39ef3a1f1a8c` | 53,961 ms | 0 | READY |

This N=2 comparison is the Quest's hot-path aggregate check, not a pass-rate or
performance-distribution claim. The fresh reverted pair did not reproduce the
timeout in this round. That result is recorded fail-honestly rather than
relabelled: the same exact reverted source already crossed the barrier at
122,175 ms in round 2, while the purpose of round 3 is to bind the fixed arm to
the post-verification own-data repair. The sealed constraint requires N>=2 in
each arm, zero fixed-arm barrier timeouts, and engagement witnesses; it does not
require fishing for a new reverted timeout after the exact revert has already
reproduced the archived failure.

## End-to-end engagement

Both fixed runs logged all four joiners entering `formation_cohort` and later
`ledger_spread_satisfied`. Fixed run 2 crossed the complete repaired owner
interaction: six gate evaluations carried
`priorityRecoveryOperationCreationRequired=true`, and eight
`recovery_operation_persist_confirmation` observations followed operations
through pending/sending/creating/active and stopping/removed states. Neither
fixed run logged a `local_mutation_unhealthy` move refusal or a formation-barrier
timeout. Exact revert run 2 logged a real `local_mutation_unhealthy` refusal for
a priority system-partition ADD under a token-stale readiness snapshot, which
pins the admission-tail distinction even though that sample recovered inside
the barrier.

The final own-data hardening is independently deterministic: inherited and
getter-backed authority fails closed without invoking the getter in both
provisioning admission and move execution, while an owner-minted own data
property survives the coordinator handoff.

## Run validity

Runs were serial on the same host and port set. Before each run, the relevant
ports had no listeners. Recorded temperatures were 44-60 C. Host scheduling
analysis reported `exceeded=false` for all four samples. Fixed run 1 and
reverted run 1 each had one approximately one-second gap wholly attributed to
tagged application work (`unexplainedTotalMs=0`); the other two runs had no gap
records. No sample exceeded the 10-second single-gap, 60-second cumulative-gap,
or 20-percent unexplained-blocking budgets.

The probe's `gitHead`/`srcTreeHash` fields identify the detached base and are
not sufficient to identify a dirty applied candidate. Candidate identity is
therefore bound by both the exact 21-path diff hash above and the independently
computed working-source fingerprint. The reverted worktree stayed at the exact
base; each probe only appended its own report after execution.

## Immutable evidence

Each run directory contains the append-only probe history, host-scheduling
analysis, and a compressed archive of all five node logs.

| Run | Node logs SHA-256 | Probe history SHA-256 |
| --- | --- | --- |
| fixed-1 | `51d5cf384a90094b031aca734e8b3dfc03a4a08fd688f01e3a57de2d9bc25aac` | `e8fdccaa9c26568b6632362c596a2c6fbfb2b85e747208ea2703ed583e773efd` |
| fixed-2 | `b02d82846b3846067d5c8b27d1c4cc90b34745c8d2cddea6fa38ded6cde01290` | `ecefaf3defef81e37c885dbe44c7df22aac5c764312d4739aa1e8ff50395d1d8` |
| reverted-1 | `72f9f3e093f47d5ad65da82f7593a2add705a4733be825e1af78f4f09659a778` | `6985736a62f761840a1f56df7a57d32d69aed48a3b413bb3417f91e66f61f86b` |
| reverted-2 | `3cdf813e3698a572ca102360a29fce1d5fe6805905df86fe8d68b078f67b96d6` | `73349b6f24b9a72a3eb6a85f488dcc120e4c37efc8f86ef5427fe0728a928ada` |
