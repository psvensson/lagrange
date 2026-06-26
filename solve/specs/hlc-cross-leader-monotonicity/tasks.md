# HLC Cross-Leader Monotonicity — Tasks

Quest `hlc-cross-leader-monotonicity`. Design: `design.md`. Blocks Quest
`cdc-cache-delete-resurrection`.

## T1 — Verify-first (read-only) — ✅ DONE (2026-06-15)
- [x] Restart does NOT re-apply through `applyCommittedEntry` (reloads durable
      SQLite; liferaft doesn't re-emit `commit` on construction). → **Fix 2 REQUIRED.**
- [x] Durable max-HLC = MAX over parsed committed `_raft_log.command.timestamp`
      (the `_raft_log.timestamp` column is wall-clock, not HLC). Optional O(1)
      `_raft_state.maxHlc` watermark.
- [x] Fix 1 absent-timestamp guard is SAFE — all acted-on write commands carry an
      HLC; no barrier/config/snapshot entry reaches the apply path.
See design.md §"Open questions — RESOLVED by T1".

## T2 — Fix 1: merge-on-apply — ✅ DONE
- [x] `witnessCommandHlc(command)` called at the top of `applyCommittedEntry`
      (before all branches/early-returns), advancing the clock for every committed
      entry on leader + follower; guarded via `HLCTimestamp.tryFromString`.
- [x] Unit: applying an entry with a far-future HLC advances `now()` past it;
      missing-timestamp entry is skipped, never fatal.
- [x] Handoff invariant covered by the witness test (follower-applied remote HLC →
      next local `now()` strictly greater).

## T3 — Fix 2: restart high-water-mark — ✅ DONE
- [x] `warmHlcFromCommittedLog()` on init scans committed `_raft_log` prefix via
      `logAdapter.getRange(1, committedIndex)`, parses `command.timestamp`,
      `hlcClock.update` with the max. (Comment corrected: `_raft_log` is NOT
      compacted; one-time boot scan, tail-bound is a future optimization.)
- [x] Restart test on a file DB: `now()` after restart exceeds the max committed
      HLC.

## T4 — Close
- [x] Independent adversarial subagent verifier: CORRECT AND COMPLETE for the live
      apply seam; finding recorded `subagent:a421e292298096c7f`.
- [x] Negative controls: each test fails without its fix; restored → 4/4 pass.
      Broad suites green (partition+raft 2249, cdc 1336); lint clean.
- [x] Oracle `done:true`, `metric 0`.
- [ ] **Pending user go-ahead:** record the Solver SOLVED terminal + commit/push
      per Quest closure (git handoff — needs explicit approval).
