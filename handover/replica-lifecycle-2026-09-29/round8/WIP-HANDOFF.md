# WIP HANDOFF ONLY — replica-lifecycle round 8 (cloud -> local, 2026-09-29)

Branch `claude/lagrange-work-wyz3yo`. The handoff SHA is the commit that adds this file; the remote read-back SHA is in the
cloud session's final message and in the local session's handoff message.

    WIP HANDOFF ONLY
    full pre-push test stage intentionally deferred to local/lab
    cloud static checks: PASS
    cloud focused changed-code tests: PASS
    lab certification: NOT RUN
    A2: NOT RUN
    release approval: NOT RUN

The push used LAGRANGE_PUSH_SKIP_TESTS=1 under the owner's explicit, narrowly scoped WIP-handoff authorization. The static
stages of the pre-push hook still ran. A successful push proves only that these exact bytes reached the remote handoff branch;
it does NOT show the epic is green, certified, releasable or mergeable.

## Cloud evidence on the final code tree (c1274d9fa; the handoff commit adds only handover records)
- Normal pre-commit hook passed for 5d5ab67f8, c1274d9fa and the handoff commit. 2b6bff920 and 0a95cb4ec were committed with the
  hook disabled; their content is covered by the static layer run on the final tree below.
- git diff --check (78b0cfbd3..HEAD, excluding the earlier verifier's scratch under verify/): PASS.
- ESLint on the 31 round-8 src/test/scripts files: PASS. (The earlier verifier's scratch files under verify/ do not lint;
  they are evidence, not lint targets, and predate round 8.)
- npm run test:static:postpush: 22/22 PASS (complexity 1796/1796, cognitive, duplication 54/1731 and 772/29578 with no increase,
  cycles 0/0, unused exports 1434/1434, deps, file size, impact-contracts, shards, guidelines, runtime-grammar,
  metadata-gateway, closure-ledger, steering, docs audits). No baseline raised.
- Generated test metadata regenerated and byte-stable across re-runs (primary/resource/subsystem classes).
- Focused tests: 52 files importing a round-8 source file (non-integration), plus the time-source witness and the
  bootstrap-mode-routing property: 52/52 files, 2148 assertions. formation-sim-production-partitions 3/3,
  formation-sim-production-handoff 5/5.
- Known inconclusive: formation-sim-charged-seed-host (killed at 1200 s with no summary; also >900 s at base) -> lab.
- The aborted full-corpus push attempt (full corpus triggered by the test/shards "machinery" rule) produced no verdict.

## Next (local session, lab fleet: tv-dator, lenovo-laptop, adam-laptop, adams-gamla; NOT carinas-windows for cluster evidence)
1. Finish any remaining simulator/timing-owner closure (charged-seed-host on the lab; the joiner RSM has no time source yet).
2. Changed cone on the lab at the exact SHA; slow simulator witnesses on suitable machines. Classify any red before fixing.
3. Transition-level NODES and replica-lifecycle writer censuses; open items in mg-removal-census.md (seed-cleanup raw
   partition removals; identity-helper fallback).
4. Close every candidate-only red; full static layer; stop production edits; exact-byte freeze; fresh independent verifier
   explicitly superseding the 02:33 REJECT; only then candidate SHA / A2 / SLO / publication (owner-decisions-2026-09-29f.md 5-8).
