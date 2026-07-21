# Fresh accepted-sample run — 2026-07-21

Purpose: resolve the `fresh-accepted-sample` integrity violation recorded at
2026-07-21T06:47:58.577Z. That violation is a replay-measurement artifact, not
a product regression: the contracted same-base replacement attempt (attempt-8,
fingerprint `ce2557138a…`) was recorded in a detached worktree pinned at the
rejected base `022f27a3`, where copied report files lost their original
mtimes, so the scenario probe read the early 2026-07-20T06:06 report as the
current sample and compared it against the invariant high-water set by the
later 3-of-3 priority-0 closures.

Preconditions for this rerun are honestly met:

- The quest's rules-out ("no unchanged rerun before the owner Quest
  deterministic discriminator") is discharged: the owner quest
  `runtime-service-creating-owner-wake-progress-admission` is SOLVED with a
  red-on-revert deterministic test and three consecutive priority-0 runs
  (commit `92d9f00f`).
- The affinity-observer gap is SOLVED
  (`runtime-service-affinity-suboptimality-observer`).
- Host check before launch: package temperature 42 °C, load average 0.51,
  no gaming or competing CPU load (the two 2026-07-20 evening samples were
  invalidated by host scheduling gaps; this run starts on a quiet host).

This note is the attempt's non-source change artifact; no product source
changes are made by this attempt.
