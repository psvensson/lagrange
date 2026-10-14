# Release budget versus deadline authorization — 2026-10-14 handover

Status: **WIP and NOT main-merge-certified**. The source-only deadline fix is verified, but final recipient-side and distributed safety reviews remain open. Five Quest acceptance receipts remain false.

## Separate three clocks, do not ping-pong the thresholds

1. **Leader election wait:** `leadershipWaitTimeoutMs`. The shared integration fixture has 1,000ms; production `BOOTSTRAP_DEFAULT` is 30,000ms. This is not the full 45-partition release SLA.
2. **Seed participant release:** an explicit `seedParticipantReleaseBudgetMs` supported on the candidate; it falls back to leadershipWaitTimeoutMs for callers that do not provide a separate value. The full seed operation captures **one original absolute deadline** and does not renew it per partition/recipient/control check.
3. **Whole test execution:** original claim/cache used 30,000ms while covering startup plus independent SQL/Raft/CDC claim/abandon and joined shutdown. Hardware-measured original test took >30,000ms after genuine successful release. The separate WIP integration fixture sets 90,000ms and leaves every business assertion enabled.

All clocks in the original production startup route are **RealTimeSource, Date.now()**, not VirtualTimeSource. A deterministic virtual clock is suitable for the post-await deadline falsifier only, not as a performance benchmark.

## Exact hosted hardware observations

- GitHub Actions `38545636829`: one 4-vCPU AMD EPYC 7763 Linux VM, approximately 16 GB RAM, Node 22.3 family, same production source. Original real release owner took 9.52/8.82s in two 1-second-budget runs (both red); ~10.52/10.60s in two 5-second-budget runs; ~10.75s with a 10-second budget. These latter cases progressed to 45 partition names but the original *whole-test* command was red, so did not authorize a performance pass.
- GitHub Actions `38546620969`: three complete 45-partition release phases on the same type of VM with explicit 15/20-second release budgets, wall durations **9.94, 10.05, 10.56 seconds**. The original inner TAP business assertions passed, but the outer test-file runner refused an oversized 2.5 MB single-line trace and the earlier 30-second test ceiling. This was a **test-evidence framing defect**, not a new Raft admission defect.
- `scripts/quest-evidence/participant-release-trace-envelope.mjs` now emits an exact SHA256 manifest and bounded ~224KiB original-byte chunks, refusing incomplete/changed/duplicated content instead of relaxing the 1MiB TAP analysis line cap. Source-run `38548439462` proves the 45-partition real SQL/Raft/CDC end-to-end test green with an explicit 20s release budget and appropriately separate 90s whole-body allowance, including the complete original trace.
- No per-partition or authorization timeout was silently widened. All 45 partitions, their 135 seed-local replicas and original member/PAUSE/ENABLE/OBSERVE/RESUME checks remain active.

## Genuine late-success authorization defect

Original `src/node/participant-release-client.js` bounded the *pre-send* timeout but returned delivered `CUT_OVER` after the owner TimeSource crossed `deadlineAtMs`. The engaged old-source negative, `38556563356`, returned `cut_over` where `release_fact_unavailable / release_deadline` was required. An unchanged-test same-host comparison `38557081457` reproduced old-red/new-green. The narrow candidate post-await check at `3d712b785e65f1eeefefafadf700572ae53deee8` returns typed deadline refusal on late non-OBSERVE replies, without affecting OBSERVE's separate adjudication or pretending to roll back durable work. Focused source/native/recovery cone `38556920052` passed 63/63 tests; source-composed full 45-partition SQL/Raft/CDC run `38557520654` remained green. This prevents accepting a stale reply as **fresh caller authority**.

**Recipient mutation remains a distinct boundary.** The recipient checks the deadline on ingress and performs a real awaited membership read before PAUSE/ENABLE/RESUME; its final physical OPEN commit may need a separate post-await check. Do not claim this fixed merely because the caller refuses late replies. An adversarial recipient test is in `work/rs-raft-recipient-postawait-fence-20261014`, still diagnostic until it engages an actual registered RESUME and proves precise old-source error. Do not lower its test requirements or widen client Quest scope silently.

## Policy recommended from these measurements

- Keep the 1,000ms **leader-election fixture** meaningful where that fixture owns elections; do not use it as the release deadline for 45 actual partitions.
- Keep **20,000ms** as the measured WIP seed-release acceptance budget on the 4-vCPU hosted runner (approx. 2× measured 10-second healthy release); production's older default of 30,000ms is not being lowered or silently reset.
- Keep the whole SQL/Raft/CDC/cleanup test at an independently justified, explicitly named bound (90,000ms in the WIP complete scenario), not the sum of unrelated borrowed timeout fields.
- Require the same absolute release deadline to be checked at every **admission/commit authority boundary** after awaits and during redirects; a stale reply means `UNAVAILABLE / release_deadline`, while already-durable changes remain for original Raft/recovery reconciliation.
- Avoid tuning an arbitrary budget until a particular virtual-hardware profile hits it. Test failure to meet a performance target is not authorization to bypass PAUSE, fresh control membership, query drains, or durable origin.
- Do not merge: the control-wave restart/membership invalidation, recipient-side late OPEN, TX2, CDC, FreshMG, off-seed/seed-loss and complete zero-Liferaft/locked-lab gates remain independent blockers.

This note documents measurement and work bounds, **not** a 0.3 acceptance receipt or a general CPU-scaled timing guarantee.
