# Bounded distinct-cohort release: WIP performance and safety triage

Status: HOLD. This is author/source review, not independent approval, locked-host acceptance, or permission to merge.

## Pinned observations (attempt one per workflow; no timeout increases)

1. Sequential one-intent predecessor `4613169dce75830e59ea604852e0649924439e15`, Actions `38522985353`: identical fake-route new test passes against the corrected owner; 5-second full bootstrap passes 67/67 but original 1-second claim/cache is red at debug_sessions-p1. Exact subsequent census `31f35ac44845b343131ac032ec3a5b44f7c649d7`, run `38523389252`, observes 514 complete deliver calls, 31 full RELEASEs, of which 21 are sql_transactions-p1 and only 10 reach dependent partition IDs; no capture error/drop/incomplete replies.
2. Fixed-wave concurrency candidate `af0942f9b4c6a96d0443e05cb4de961302caf4b2`, Actions `38524383433`: source-bound fake-route coalescing test passes 2/2; native/authored startup 5-second bootstrap passes 67/67. The 1-second claim/cache is still RED: 21/45 completed, node_endpoints-p1 terminal `release_deadline` at observed elapsed 1006ms.
3. Identical code with only additional test assertions `c19b4fb2cef4a093618b9cf80ab87ccff73be6ce`, Actions `38524620921`: three direct fake-route tests pass, but independent original 1-second claim/cache is RED as early as call_cell_reduce_results-p1, 4/45 completed at elapsed 1000ms, and even the original 5-second bootstrap reached only 41/45 before an applied-position `release_deadline`. This variation is material; one green 5-second run is not acceptance. One test-only lint indentation red is separately corrected on successor `41004daf`. Neither test-body failure is excused by lint.
4. Immutable serial-source overlap negative `bcca98ef427339b927a9b74707525fd18cf81dac` against exact new test bytes, Actions `38524148595`: complete five distinct local partition intents admitted with control-first; source declines to overlap any two. Named assertion 'at least two independent real release intents must be in flight together' fails with `ERR_ASSERTION`; not a timeout/vacuous synthetic answer.

## What is established

- Original 1,000ms test is not stable green under fixed-width eight-cohort waves, and 5,000ms property can also regress on identical production source.
- There is a source-backed cost/coordination boundary: every dependent cutover executes a complete nested control-partition RELEASE before pause and again after its final census, through `releaseControlOwnerFirst`. These checks are canonical and still mandatory.
- `RUNS` is the canonical **in-flight** coalescing owner. It deduplicates by partitionId and build digest, not by caller's deadline or authorization token. Parallel seed work relies on this fact only for callers carrying the exact original seed deadline and separate valid fresh-seed-derived authorizations; any wider capability/security implications of joining without inspecting the joiner's authority require their own adversarial review before cutover.
- Fixed-size Promise.allSettled waves preserve failure custody and sorted original diagnostic ordinal, but a slow cohort imposes a wave-wide head-of-line dependency. No claim has been made that this is the measured dominant performance cause.

## Boundaries / corrective investigation

The next source-only, no-behavior-change experiment is to parse the ORIGINAL full TAP under width-eight `6b046bf7893aa856f72274f82b3fb217460337d2` using the already-existing passive summary script. Count actual nested control RELEASEs per dependent and compare their variation with complete original result bytes. Do not infer wall clock from call/completion ordinal.

Any new design must preserve current control-owner pre/post checks and complete current voter census, proper OPEN/authority, one shared original deadline, and no new cache of a former successful control permission. A retained successful old control CUT_OVER is not a current control fact. Concurrency raises load and is not a replacement for eliminating unjustified repeated expensive work. Do not escalate cap or count a single hosted positive as proof without a named falsifier and independent review.

The existing `seed-bounded-independent-cohort-release` Quest remains open with five false receipts. None of these runs touches `main`.


## Same physical hosted machine width-eight versus upper-bound 45 (2026-10-14)

Run `38525302263` at immutable experiment `00def0c3732d2214709ddd0bda5d00d5165582ad` used source-only change in `SEED_INDEPENDENT_COHORT_WIDTH`, no deadline or original claim/cache test-byte change. It installed the exact two source trees in worktrees of ONE hosted runner and executed the same original 1,000ms claim/cache body serially. Both attempts are RED; diagnostic output preserves full original TAP and canonical owned trace summary.

| Property | Width 8 (original `cf3a8bb8`) | Upper-bound 45 (experiment `00def0c3`) |
|---|---|---|
| Original claim-cache status | RED | RED |
| First sorted failing cohort | logs-p1, ordinal 18 | artifact_payloads-p1, ordinal 3 |
| Completed ordered prefix | 17/45 | 2/45 |
| Terminal measured age of shared 1000ms budget | 1017ms | 1752ms |
| Participant-release original-router deliveries | 689 | 588 |
| Full RELEASE request count | 65 | 95 |
| Control SQL_TRANSACTIONS RELEASE requests | 41 | 51 |
| Complete delivered calls to control | 361 | 179 |
| Distinct dependent partition names requested | 24 | 44 |
| Terminal outcome | UNAVAILABLE / release_deadline / enable | UNAVAILABLE / release_deadline / observe_applied_position |

Upper bound admits almost every independent partition at once, which *reduces* repeated control work by RUNS joining, but leaves many previously admitted cohort calls in intermediate PAUSE/ENABLE and consumes more than the original deadline before the earliest outstanding ordinal can finish. Thus the limitation is not just serial duplicated control releases; too much native/transport/SQLite work at once causes contention. One successful direct overlap test or one green 5s fixture cannot qualify that strategy.

**Decision:** reject cap escalation as the release cure. Retain immutable experimental source and its red evidence; do not merge `experiment/rs-raft-seed-full-overlap-20261014` into any candidate. A source-level owner design must amortize repeated current-control work without caching stale OPEN permission, and it must reduce the full participant-cutover work under the same deadlines; otherwise the existing 1000ms criterion remains unsatisfied. No change to authorization, membership, native origin, or current-control pre/post fence has been approved.

The 45-upper-bound experiment is only source-bound hosted evidence, not an independent locked-lab result or causal proof of each delayed private branch. The seed-bounded Quest's five receipts remain false.
