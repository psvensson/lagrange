# rs-raft current-control proof and seed startup — exact checkpoint 2026-10-14

Status: **WIP / HOLD / not main-merge-ready**. Independent source review and required distributed labs are not complete; all five acceptance receipts on the control-proof Quest remain false.

## Authoritative production candidate

- Frozen source: `continue/rs-raft-seed-control-proof-amortization-20261014` at `47ceb42e4a36757007f0d8006d2014fa1400d9c8`.
- This descends from the composed handover, PA/R correction, native accepted-inbound timer and one-intent-per-partition seed `integrate/rs-raft-receipts-wip-20261014` at `f2d14fe2b5a0a64ba20afb6b4bac14944321bf4c`.
- The code change belongs to canonical `src/node/replica-handler-participant-cutover.js`. It is limited to the **exact** `sql_transactions-p1` control group. Once all current members have actually PAUSED, it uses `releaseCensusDefect`, current membership, durable origin, query CLEAR + schema ENFORCED, second current all-member census, and the existing exact per-recipient RESUME to prove re-release. Dirty, unknown and pre-origin control continue through full original ENABLE/observe/settle/reopen path. No seed-level permission cache, timeout increase, read-side admission, second release executor, or skipped current control check.
- Canonical generated test classification/impact metadata was refreshed via GitHub Actions `38529644534`, current frozen source commit `47ceb42`; producer audit:shards passed and no baselines changed.

## Positive and engaged negative

1. Original full-cutover current-control source `9103c83181a9b8816f2759167ac6eff0189d6fbb` and candidate `135d9b67dbf39a09ee598627205aa3761a0d0ebc`, tested on the **same GitHub-hosted runner** with identical canonical control-partition test bytes. `38529336730` confirms the old source fails at the named unnecessary replay of ENABLE/OBSERVE/census while candidate passes. This is a specific source-only differential, not current host-specific startup acceptance.
2. Scoped original protocol 13/13, applied-position 8/8, recovery 25/25, native application-order 1/1 and local lint all green at `38529336874`. Earlier first prototype 46/46 at `38528155673`; its generic-partition fixture was corrected so only the canonical partition can use the fast path.
3. Separate verification branch `verify/rs-raft-control-proof-resume-race-20261014` uses the exact identical production sources. In `38530001635`, a real schema enforcer is dropped **after second all-member INSPECT and just before original RESUME**. Recipient's existing `resumeParticipantCutoverAdmission` rejects the now invalid complete census, preserves CLOSED admission and durable origin, and the next normal RELEASE repairs/enforces schema. Filtered adversarial test 1/1; complete protocol 14/14. This test-only branch does not update the frozen candidate's executable source.
4. The ten-suite interaction cone at `38530318105` passed 246/246 original assertions: partition admission, TX1 apply/staging/topology, TX1 single-path, real three-replica transaction, split restart, mirror write identity, merge cutover, zero-legacy runtime.

## Startup remains definitively RED at original deadlines

- Exact original seed property requires `leadershipWaitTimeoutMs=5000`; claim/cache test has shared `1000ms`, original full body and 45 actual partition groups (135 local replicas). No budget change or skipped test accepted.
- One-intent-per-partition source-only red/green and real bootstrap green 67/67 are retained at `38522985353`, but one 1000ms claim/cache remained red and later 5000ms runs varied.
- Same-host passive timing source comparison `38529770672`, two source trees, one original test body/instrumented identical observer: prior full control request median 16.29ms (20 requests, 542.67ms union) versus new paused-current proof median 12.53ms (25 requests, 686.17ms union). Different counts and cold-path outliers prevent speedup certification; both 1000ms tests RED. Full records and SHA256s retained.
- Same-host original 1000ms width comparison `38529042758`, frozen fast-control code: **serial** attempted 13 dependent partitions; width2 16; width4 20; width8 24. Every original 1000ms test RED. An earlier wider 45-way comparator `38525302263` was worse, so simply increasing concurrency is explicitly rejected. None of these is a positive startup acceptance.
- Control checks are still full current membership PAUSE/census/RESUME operations before and after each dependent. Removing new ENABLE does not eliminate their cost. A cached earlier CUT_OVER, a leader-only status or a read-only inferred OPEN permission is not an approved substitute.

## Next implementation boundary

**Do not merge** the unreviewed two-phase/rendezvous or control-permission cache experiments. Improving 45-cohort startup in 1000ms requires a sealed owner design that (1) performs one actual coherent fresh SQL_TRANSACTIONS control-fence lifecycle over a related cohort wave, or (2) reduces release transport phases while retaining the required exact current-member validation and final current origin before OPEN. The authorization and retention/cleanup story must be explicit across failure, timeout, restart, membership/generation turnover and concurrent starts. All operations must still obey the original shared deadline, and all in-flight work must be joined on failure. No current code provides such a fence.

Suggested exact proof order:
- independent current-byte review of this paused-control helper and original RESUME race falsifier;
- decide and seal narrowly owned *batch control fence* or *safe common-phase fanout* semantics based on a single authority, instead of incrementing concurrency or assuming read-only status gives permission;
- preserve negative same-host unchanged-source controls, run original full fresh-seed 1000/5000ms suites, then real locked-host N-to-K proof;
- run full TX1/TX2, FreshMG replacement, CDC/snapshot, off-seed restart/seed-loss, integration and zero-legacy gates on composed exact candidate, followed by independent publisher checks.

The WIP `main` merge hold remains enforced. No acceptance receipt is marked true merely because a focused test passed; historically inherited unused export/file-size/duplication/static debt also remains red and baselines must not be increased.
