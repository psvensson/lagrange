# 2026-10-14 — hardware-calibrated seed-release budget decision

Disposition: **WIP acceptance-policy correction, subject to full original-test confirmation and independent cutover gates.** The user explicitly delegated judgment about whether the inherited one-second limit remains reasonable. This record documents the change rather than silently weakening the sealed original 1000ms criterion. The original 1000ms negative remains immutable historical evidence, not a pass.

## What the prior 1000ms rule actually measures

- `TEST_CONFIG.bootstrap.leadershipWaitTimeoutMs = 1000` is a fixture optimized for **fast leader election**. Production `BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs = 30000`. The original claim/cache test has `{timeout: 30000}` for its *complete* SQL/Raft/CDC/cache/teardown scenario, not merely seed release.
- `bootstrap-service-seed-workflow.js` reused that one configuration property as the **single absolute deadline for all 45 partition cohort releases**, even after deduplicating 135 local replicas into 45 real Raft groups. This created an accidental timing-policy coupling.
- `TimeSource` is **RealTimeSource(Date.now())**, not a virtual simulation clock, in that integration test. The virtual-clock seam exists but is not configured for it.

## Actual measured virtual CI hardware

Source-only instrumented runner `38545636829`, immutable production `a7bb214bfc77f9dacda1b4fd27b5e9edaec92347`, same GitHub Ubuntu 24.04 virtual machine, Node v22.23.3, 4 available AMD EPYC 7763 vCPUs, ~16GB RAM:

| Diagnostic configured release budget | Observed actual release wall time | Outcome |
| --- | ---: | --- |
| 1000ms | 9523ms | refused, partial member release |
| 1000ms repeated | 8824ms | refused, partial member release |
| 5000ms | 10522ms | returned; 45 distinct partitions, 1041 completed deliveries |
| 5000ms repeated | 10604ms | returned; 45 distinct partitions, 1041 completed deliveries |
| 10000ms | 10753ms | returned; 45 distinct partitions, 1041 completed deliveries |

The 5000ms returns **after** the configured deadline. This does NOT certify that any particular admission commit occurred before expiry; exact post-await/deadline semantics remain a separate safety review. No diagnostic inference relaxes the original current-membership, authorization, origin or after-pause fences.

Source-only second study `38546620969`, same virtual CPU class, unchanged production, original code/partition count, with explicit fixture release budgets 15000/20000ms and **diagnostic-only** whole-test 60000ms:

| Budget | Release phase wall time | Complete original scenario elapsed |
| --- | ---: | ---: |
| 15000ms | 9944ms | 32248ms |
| 20000ms | 10047ms | 32256ms |
| 15000ms repeated | 10558ms | 32866ms |

All three produced **underlying TAP 3 pass / 0 fail**. The classified runner instead refused a *different* violation: original test printed a **single 2.52 MB diagnostic line** greater than `run-test-files.js`' deliberately strict **1 MiB per-line analysis bound** (reason: 1,471,016 bytes were not analyzed). Increasing the global test-runner bound or dropping trace records would destroy useful validation. The correct fix is one SHA256/byte-length verified bounded chunk envelope, with a receiver that refuses missing, duplicate and altered chunks.

## Decision and exact intended change

1. Preserve `leadershipWaitTimeoutMs=1000` in the fixture to keep the original rapid election gate. Add **optional** `seedParticipantReleaseBudgetMs` at the seed workflow owner, validated as an explicit positive safe integer. Existing callers without the property continue using their historical `leadershipWaitTimeoutMs` as fallback, so existing production/default configuration remains **30 seconds** and unrelated tests do not silently change.
2. Set the claim/cache integration test's explicit release budget to **20 seconds** on its 4-vCPU CI class (approximately 2× its measured healthy ~10-second release phase). This is a bounded correctness budget, not a requirement to sleep for 20 seconds and not a grant to continue after expiry. Keep its original *entire* business logic; a healthy run must finish the phase under the absolute deadline and verify all 45 distinct partition groups. Continue recording release wall/CPU metrics to catch performance regression.
3. Set that same integration test's entire scenario budget to **90 seconds**. Initial diagnostic measured ~33 seconds with its previous output format, but the exact full-source bounded-trace run `38548045523` took **52.4 seconds** with the complete 45-partition release and 1,041 deliveries still passing all three TAP assertions. A 60-second allowance gave only 7.6 seconds of CI headroom; 90 seconds is ~1.7× the latest measured whole-test time and matches the separate bootstrap consistency suite's existing file-level timeout. This is ONLY for the entire SQL/Raft/CDC/cache exercise and clean teardown. Its per-partition shared release budget remains **20 seconds** and no local retry or admission deadline may be renewed.
4. Publish its complete original participant-release TAP trace in bounded base64 chunks under the existing 1 MiB per-line analysis bound, backed by an immutable raw-byte length, SHA256 and exact ordered chunk count. Adapt the existing read-only census parser to accept both historical single-line and verified chunked formats. No output truncation, artificial success, runner cap increase, missing records or changed underlying source.
5. Keep the historical strict 1000ms negative `38539838491` and original full-source timing experiments, explicitly label them **performance profiling**, and do not mark the existing sealed original 1000ms receipt green as a consequence of changing the test policy. An independent reviewer must approve a revised release-acceptance contract at exact candidate bytes before any Quest/publisher closeout.

## Acceptance left unchanged

- Exact source-bound duration and monotonic clock validation; no stale owner, changed membership/generation, malformed PREPARE, expired request, lost ACK or unauthorized OPEN.
- Real fully current SQL control membership and all dependent current member lists; PAUSE, query drain, origin, RESUME and any split/merge/recovery protections.
- Real locked multi-host native rs-raft startup and shutdown, seed-loss, TX1/TX2, FreshMG, CDC, snapshot, zero-Liferaft and strict static/corpus gates.
- `main` is held. This timing-policy decision is not a statement that the distributed system or original release Quest has been certified.

The precise post-expiry commit semantics are **not closed** by the performance decision. If the final recipient can authorize OPEN after its own deadline, a separate bound adversarial source-only repair is required, regardless of the chosen test budget.

## Full original business-body and bounded-evidence result

Exact runner `38548045523` confirmed all 3/3 claim/cache TAP assertions and all 45 source partition releases (`1041` complete router deliveries), with no tracer drops. `run-test-files` accepted the complete bounded trace and reassembled SHA-checked original bytes under its unchanged 1 MiB per-line limit. That attempt was red solely from six scoped ESLint findings (four pre-existing spacing errors in the census script, two helper-test naming errors); the script/test lint corrections and a 90-second full-test CI headroom adjustment are under verification. No old 1000ms case is called green.
