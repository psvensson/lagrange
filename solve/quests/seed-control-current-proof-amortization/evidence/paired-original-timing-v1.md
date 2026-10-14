# Current-control fast path — paired original-router timing V1 (2026-10-14)

Status: **evidence only / HOLD**. No release acceptance, performance certification, new deadline, or source-content approval.

## Grounded run and input

- One GitHub-hosted physical runner, workflow `rs-raft-fast-control-timing-pair`, run `38529770672`, head `da04a3d19693bc4315f5a9bf1724601665c60c34`.
- Original serial one-intent seed source `31f35ac44845b343131ac032ec3a5b44f7c649d7`; optimized control cutover candidate `135d9b67dbf39a09ee598627205aa3761a0d0ebc`.
- Source-only production difference: `src/node/replica-handler-participant-cutover.js`. Each source ran the **same byte-for-byte original claim/cache test**, instrumented only with two passive `performance.now()` values on the existing `MessageRouter.deliver` observation. Original shared 1000ms test budget unchanged, no new status reads/timers/ref/wait.
- Passive diagnostic source `db5f17dea023116dee4aebf09dd1bb21a63ce27d`, complete raw TAP and SHA256 retained separately for each run.
- No dropped/capture/unfinished trace records; source generated 481 complete deliveries and candidate generated 533. These workloads differed because the latter reached more partition release invocations before its deadline.

## Observed same-host in-flight intervals

| Source | SQL_TRANSACTIONS RELEASE requests | Median control RELEASE | Total union control RELEASE intervals | Median dependent RELEASE | Dependent RELEASE requests | Startup |
|---|---:|---:|---:|---:|---:|---|
| Previous full cutover | 20 | 16.29ms | 542.67ms | 63.47ms | 10 | RED at 1000ms |
| Fresh-paused-current fast path | 25 | 12.53ms | 686.17ms | 52.31ms | 12 | RED at 1000ms |

The union increased because there were more completed/attempted releases, so treating the sums as saved or spent *exclusive* CPU is invalid. The fast path removes ENABLE/origin-observation on already-clean control rather than caching prior CUT_OVER. At roughly 2× control RELEASEs per dependent cohort, the repeated control operation remains material even after reduction. A few first-release cold-path outliers were 196.82ms (previous) and 346.77ms (optimized), so one pair cannot establish a stable performance improvement or regression magnitude. Both original full test bodies remain red.

## Safety and next boundary

An unchanged-source same-host real-control negative and candidate positive passed at `38529336730`, including the exact canonical `sql_transactions-p1` partition identity. Focused protocol 13/13, applied-position 8/8, recovery 25/25, native order 1/1 passed at `38529336874`. The checked original source now refuses the duplicate ENABLE round after PAUSE and new current member censuses; schema mutation between censuses returns typed STALE and leaves admission closed.

The original 1000ms 45-partition target remains unattained with serial fast control or bounded widths 2/4/8; all red same-host results are in run `38529042758`. A naive width45 variant previously worsened the release deadline. Do not increase timeout, hide failures, skip a control post-check, or re-use old CUT_OVER as admission.

A new **read-only current-control** predicate cannot be substituted casually: because current membership and pending SQL state can change during a read, it requires a strong owner-defined linearization and freshness/fence contract equivalent to the existing exact PAUSE/current-census/RESUME owners. That contract has not been reviewed or proven. No new fast proof should be integrated absent explicit owner scope, same-host adversarial tests, and independent review.

The full rs-raft merge, startup and zero-legacy / TX1 / FreshMG / CDC / snapshot / failure recovery gates remain open. This evidence does not alter any production source.
