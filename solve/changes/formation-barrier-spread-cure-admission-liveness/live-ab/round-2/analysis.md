# Formation barrier spread-cure admission live A/B: closure supported

Date: 2026-08-25  
Quest: `formation-barrier-spread-cure-admission-liveness`  
Base HEAD: `a00df079c5a2bea5e2143f46e2662f9f95f5d7b4`

## Verdict

The fresh serial five-node A/B supports the aggregate CL-044 repair. The exact
24-path fixed candidate reached READY in both runs without crossing the
unchanged 120-second operation-ledger formation barrier. Exact reverted HEAD
reproduced the real barrier timeout in one of two runs and recovered only after
the retryable join-session resume.

| Arm | Run | Source fingerprint | Formation | Barrier timeout | Final result |
| --- | ---: | --- | ---: | ---: | --- |
| fixed aggregate | 1 | `7bfa41a444acf4c6` | 44,726 ms | 0 | READY |
| fixed aggregate | 2 | `7bfa41a444acf4c6` | 64,396 ms | 0 | READY |
| reverted HEAD | 1 | `ac3f39ef3a1f1a8c` | 129,646 ms | 1 | READY after resume |
| reverted HEAD | 2 | `ac3f39ef3a1f1a8c` | 54,172 ms | 0 | READY |

The fixed mean was 54,561 ms and its slowest sample retained 55,604 ms of the
barrier budget. The reverted mean was 91,909 ms and its first sample crossed
the barrier. N=2 is not a distributional performance claim; it is the sealed
falsifier: both fixed samples must stay below the unchanged barrier, and the
same-environment reverted arm must remain capable of reproducing the archived
failure. Both conditions held.

## End-to-end engagement

The fixed result did not come from avoiding the recovery lane:

- both runs logged all four joiners entering `formation_cohort` and later
  `ledger_spread_satisfied`;
- the planning/cadence path emitted
  `priorityRecoveryOperationCreationRequired=true` (2 and 6 logged gate
  evaluations respectively);
- the coordinator recorded 11 and 10
  `recovery_operation_persist_confirmation` transitions, including operations
  progressing through PENDING/SENDING/CREATING to ACTIVE and through STOPPING
  to REMOVED;
- neither fixed run emitted a move refusal with
  `reason=local_mutation_unhealthy`, even though token-stale
  `planning_snapshot_refresh_pending` snapshots occurred during formation.

That last observation is the binding separation from the predecessor A/B. In
the predecessor fixed tail, 32 owner-minted recovery moves reached execution
but were vetoed by mutation admission. In this A/B, the cycle-owned authority
survived move minting and request enumeration, so stale deferred readiness did
not veto the cure. Substantive downstream target-readiness checks still fired
where applicable; the repair did not convert them into blanket admission.

The reverted-1 log contains one actual node-joining failure at 122,175 ms:
`Timed out waiting for operation-ledger formation spread before publishing the
node ready lease`. The join session was preserved, resumed after 250 ms, and
the cluster reached 5/5 at 129,646 ms. This is the same protocol failure mode
as the predecessor archive, not a generic process-start timeout.

## Host validity and run discipline

Runs were serial on the same machine and port set. Each run started with no
test port listener. The recorded preflights for fixed-2 and both reverted runs
showed the available temperature sensor at 48-50 C. Post-run event-loop-gap
analysis reported `exceeded=false` for all four samples. Where a gap record
existed, unexplained gap time was zero; reverted-1 had no watchdog gap record,
so its validity rests on the clean preflight rather than fabricated zero gap
evidence.

The fixed worktree was detached at base HEAD with the canonical candidate diff
applied. The reverted worktree was detached at exact base HEAD; its only
worktree mutation was the append-only formation-probe report.

## Immutable evidence

Each run directory contains the full append-only harness history, console
transcript, post-run host-scheduling result, and all five node logs.

| Run | Node logs SHA-256 | Harness history SHA-256 |
| --- | --- | --- |
| fixed-1 | `bc8f3786836dd2deece63d973af228003a1c1d913fd6f56a0fb8a1f88b2866a9` | `325b12174800b73ec46299b4ce5c1122d756099e10a2fd614cf1939ef41033a8` |
| fixed-2 | `855fae184c60d1ca94d8cdbb831dc0e0f73cf8152a8cbb80a7d3f31d8729a2b4` | `816ba5686a74fc0242136ec0327b99f910df2edcf52aa8230111497d11cc6b3b` |
| reverted-1 | `96252f10aed03d2de14eed817a217738d11f95623fefcec031440695a82ca583` | `c56bec536d0074380eda3a60867e97479a94ef74aece87eb8a9b43739db085a4` |
| reverted-2 | `5cc1885d06550354750715e38ba3e0bd94f0132f7e9e3c9d93bec714e97a2c9f` | `57f86fdc12c368bc46cacce5b919bd3b929dcd14ea55fa6dbcac97bc24bcdecc` |

