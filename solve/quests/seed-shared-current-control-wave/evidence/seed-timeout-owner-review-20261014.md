# Seed timeout ownership review — 2026-10-14

**Disposition: correctness correction PROVEN in focused/source-only/hosted integration runs; exact 0.3 cutover / independent static, TX2 and multihost acceptance remain HOLD. Do not merge this WIP directly into main.**

This review addresses the concern that the rs-raft final stretch was becoming an iterative "ping-pong" between a 1-second test timeout, increasingly complex release coordination, and new incomplete resource/deadline behavior. It distinguishes an **unrealistic performance fixture** from **actual incorrect deadline handling**. There is no evidence here of a Raft leader or membership state machine oscillating back and forth: the "ping-pong" risk was in repeated fixes at different layers for one improperly coupled test target.

## Source and real hardware

Starting combined source `a7bb214bfc77f9dacda1b4fd27b5e9edaec92347`; independent-budget WIP `7d0042659daaed7d38e9e586454861c21df3d838`. This correction branch is `continue/rs-raft-seed-deadline-semantics-20261014`, extending it without changing the native core, release transport protocol, original SQL control owner, Raft placement, or query code.

The exact original 45-group claim/cache fixture uses the production `RealTimeSource`, whose `now()` calls `Date.now()`, **not** VirtualTimeSource. Its old `TEST_CONFIG.bootstrap.leadershipWaitTimeoutMs=1000` was borrowed by the entire `releaseSeedParticipantCohorts` pass. A leadership wait and 45 complete physical partition cutovers are two different work scopes. In production, `BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs=30000`; the current source retains that legacy fallback when `seedParticipantReleaseBudgetMs` is not supplied.

On one hosted Linux virtual machine (4 vCPUs / AMD EPYC 7763 / ~16GiB / Node 22), run `38545636829` measured full seed RELEASE at 8.82–9.52 seconds with an insufficient 1-second fixture budget, and 10.52–10.75 seconds on the 5/10-second configurations (these runs did **not** meet the separate old 30-second whole-test cap). The owner completed all 45 actual partition cutover requests in the latter runs, but their wall time exceeded the artificial fixture budget. This revealed a separate post-await deadline defect. The follow-up run `38546620969` observed actual full release durations 9.94, 10.05, 10.56 seconds with 15/20-second diagnostic budgets, full original business logic, and original resource accounting. The surrounding SQL/Raft/CDC/cache integration work took 32–33 seconds, independently of the release timer.

Run `38548439462`, on the separate-budget source with `seedParticipantReleaseBudgetMs=20000` and an explicitly larger **whole-test** limit of 90 seconds, passed the entire original claim/cache assertions: 45/45 actual partition release intents, 1,041 completed original participant-release protocol deliveries (one top-level SQL control RELEASE + 44 dependents), with complete SHA-verifiable evidence. No 1-second test or runtime timeout was silently increased. In a second combined source run `38554104693`, the exact late-success code correction passed 67 bootstrap property assertions, the real claim/cache integration, control-wave three-voter/two-dependent test, and all trace-envelope checks without changing the existing 5-second property fixture.

## Real correctness defect: a late successful reply was accepted

The seed owner formerly handled `CUT_OVER` after an `await` as an unconditional success, without confirming that its own absolute seed deadline had survived the await. Equally, after all dependent releases succeeded, the seed returned once the control wave END promise settled without its own final deadline classification. Neither remote delivered result, even if authentic, is proof that seed readiness remained eligible at its original deadline.

- Old-source RED: `38552596454` catches genuine late `CUT_OVER` reply. `38553074689` separately catches a delayed final control-wave END. Both use original-typed answers; no retries, extra driver or forged Raft status.
- Candidate source-only paired witness: `38553510109`, same hosted physical runner and byte-identical tests, failed BOTH named asserts on the old source and passed BOTH on the corrected single seed owner.
- The correction computes *one* terminal deadline status from the original seed TimeSource after each awaited release and after the END wait, preserving the actual positive/negative remote reply in the usual `seedReleaseFailureProjection`. A correct durable release is **not** reversed because its acknowledgement was observed late; rather, a late observation cannot authorize seed readiness. Existing recovery/owner logic is left untouched.
- A safe positive budget value can overflow the absolute `startMs + budgetMs` sum. Run `38553863379` catches this red against the pre-guard source. A single seed preflight now refuses unsafe/overflowed absolute timestamps before any authorization or RPC, and `38554104673` passes the three focused tests.
- Run `38554104693` also passed the combined seed and original integration suites on that source, still retaining all original per-request deadlines and control-wave authority checks.

The seed owner now decides **readiness eligibility at the original absolute deadline**. The existing control-wave/cutover owner independently decides **whether the actual Raft member cohort is current and may open**. The per-RPC transport owner keeps its original 5-second ceiling and the original recipient still validates real work/membership/authorization. These are distinct responsibilities, not duplicate owners of the same verdict.

## Recommended timeout contract

| Budget or timeout | Owner and meaning | Current recommendation |
| --- | --- | --- |
| Leader-election wait | Bootstrap/election; does not size the full seed release workload | Preserve existing fixtures; 1s claim/cache election wait, 5s property. |
| Seed participant release budget | One absolute seed start through all 45 distinct releases and held control END; expiration prevents readiness | Explicit 20s in 4-vCPU hosted CI; retain production 30s fallback until independent default change is reviewed. |
| Single participant release transport request | Existing MessageRouter/cutover; original per-request timeout cap | Retain 5s cap, bounded by remaining overall release deadline; do not renew the outer deadline. |
| Whole SQL/Raft/CDC test | Test harness only, includes bootstrap, repository mutation, CDC, query/cache and teardown | 90s CI ceiling; not a runtime release permission or database deadline. |
| Native inbound scheduled wake | Raft native group runtime; admitted enqueue owns one foreground timer and exact close cleanup | Retain separately reviewed timer custody, no extra driver or watch timer. |

The 20s release budget is an **empirical CI target with about 2x measured headroom on this VM**, not a guaranteed upper bound for all physical deployments or all cluster topologies. The production-default value of 30s is unchanged; a future independent release default in `BOOTSTRAP_DEFAULT` would remove the remaining fallback coupling with `leadershipWaitTimeoutMs`, but it must be migrated explicitly with test and compatibility proof, not slipped in as a convenience timeout increase.

## Static and final integration

The release trace-envelope test `test/quest-evidence/participant-release-trace-envelope.test.js` was newly present but had no subsystem taxonomy. Exact owner `scripts/checks/test-subsystem-classification-constants.js` now gives it a specific `test-infrastructure` override with a reason; `38554678543` regenerated canonical primary/resource/subsystem classifications and passed `audit:shards` over 2,374 tests/22 subsystems without editing hash output manually or loosening any baseline.

The independent full static gates at older source (run `38554394733`) also showed outstanding WIP/inherited unused-export ratchet, file-size, duplication and general lint failures. No baseline was increased. A new exact-candidate static run is required to distinguish changes introduced by this branch from inherited debt. The 0.3 rs-raft cutover remains held pending independent source review, full TX1/TX2, FreshMG, CDC, snapshot, startup/restart, seed loss, off-seed leadership/membership and locked multi-host certification.

**Implementation discipline:** do not pursue an arbitrary 1-second wall-time target by adding another control/recovery owner or parallel retry mechanism. Measure actual work on named hardware, retain the single clock/deadline per interaction, fail closed on expired/unknown results, and keep performance targets separate from safety proofs.
