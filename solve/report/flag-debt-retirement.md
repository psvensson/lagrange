# Solve report: flag-debt-retirement

**Goal:** Zero production feature flags remain in src/ and scripts/: the SWIM detector+consume opt-outs and the membership leader-driven lever are promoted to unconditional behavior (flags deleted), the unvalidated opt-in retry-jitter scaffold is removed with its call-site wraps, and the stale LAGRANGE_STANDING_INVARIANTS / LAGRANGE_SKIP_HOOKS doc references are corrected; operational config scalars (MACHINE_FACTOR, LOG_FILE, DEBUG_LOGS, LOOP_GAP_*, JOIN_REATTEMPT_*) are explicitly out of scope; all touched suites green.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracles/flag-debt-retirement.json

**Attempts:** 1

## Current Blocker
- Frontier: flag-debt-retirement-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for flag-debt-retirement-main
- No longer current: Do not re-add a flag or a second path for these mechanisms; do not promote retry-jitter without wiring seeded RNG through the DT substrate first.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 27
- Owner areas: .githooks, architecture, scripts/check-staged-constant-names.js, src/bootstrap, src/control-plane, src/index.js, src/transport, src/utils, src/workflow, test/control-plane, test/convergence, test/utils
- Categories: docs, other, runtime, test
- Action: split by owner area before the next attempt (27 files)
- Action: land or separate 12 owner areas: .githooks, architecture, scripts/check-staged-constant-names.js, src/bootstrap, src/control-plane, src/index.js, src/transport, src/utils, src/workflow, test/control-plane, test/convergence, test/utils
- Split plan:
  - src/control-plane: 6 file(s)
  - test/convergence: 6 file(s)
  - test/control-plane: 5 file(s)
  - .githooks: 2 file(s)
  - architecture: 1 file(s)
  - scripts/check-staged-constant-names.js: 1 file(s)
  - src/bootstrap: 1 file(s)
  - src/index.js: 1 file(s)
  - src/transport: 1 file(s)
  - src/utils: 1 file(s)
  - src/workflow: 1 file(s)
  - test/utils: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **flag-debt-retirement-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **flag-debt-retirement-main**: Subagent verifier approved source changes against Quest intent, system guidelines, and doctrine: behavior-preservation proven for all three cutovers (jitter unwrap = exact identity of the ratio-0 default; SWIM promotion = flag-absent default; leader-driven promotion preserves fail-open), no hidden consumers, heartbeat tick self-guards with deduped diagnostics. Initial verdict REJECT on 6 comment/doc residuals (4 stale flag comments, stale architecture/INDEX.md invariants gate text, LAGRANGE_SKIP_HOOKS actually consumed by .githooks) — all 6 fixed: comments updated, INDEX.md corrected, hook bypass retired in favor of --no-verify. [subagent:ae0215d77eac5fd8d]
- **flag-debt-retirement-main**: Promote-vs-remove decisions: SWIM detector+consume PROMOTED (were default-on, N=8 gate b1434fe0 validated); MEMBERSHIP_LEADER_DRIVEN PROMOTED on deterministic evidence (dt4 full-chain + dt6 publication failback/ack-recovery/quorum-failback/migration reproducers pin the enabled path; primary-evidence standard); RETRY_JITTER REMOVED (default-off, never validated in any gate, promotion would inject unseeded Math.random into DT-covered retry paths breaking determinism). Operational config scalars (MACHINE_FACTOR, LOG_FILE, DEBUG_LOGS, LOOP_GAP_*, JOIN_REATTEMPT_*) are configuration, not feature flags — out of scope. File-size exclusion: src/index.js (868) and membership-publication-coordinator-reconcile.js (819) are inherited-over-threshold; this quest only shrank them; extraction stays a follow-on concern. (rules out: Do not re-add a flag or a second path for these mechanisms; do not promote retry-jitter without wiring seeded RNG through the DT substrate first.)
- **flag-debt-retirement-main**: Subagent verifier FINAL APPROVE (re-verification after the six residual fixes): all six deltas confirmed fixed; removed-symbol sweep zero matches across src/ test/ scripts/ docs/ architecture/ .githooks/; eslint exit 0 on touched src; touched suites re-run green (110/110 + earlier 211/211 convergence). Diff clean for git handoff. [subagent:ae0215d77eac5fd8d]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-02T05:42:11.077Z | flag-debt-retirement-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/flag-debt-retirement/attempt-1.diff |
