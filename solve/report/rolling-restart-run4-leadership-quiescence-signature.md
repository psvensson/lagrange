# Solve report: rolling-restart-run4-leadership-quiescence-signature

**Goal:** Run3-shaped rolling-restart leadership quiescence residual has deterministic proof: a stale or transient missing leader-signature entry for an otherwise converged control-plane snapshot no longer prevents the post-restart quiescence stable window, or the retained stat-gate-20260630T173805Z-run3 shape is proven to be a real product leadership loss requiring a separate owner fix; prior run4 child Quest closures and parent Wilson/statistical closure remain outside this child Quest.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-leadership-quiescence-signature.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/convergence-timeout-leadership-settle.md

## Current Blocker
- Frontier: rolling-restart-run4-leadership-quiescence-signature-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-leadership-quiescence-signature-main
- No longer current: Rules out operation-drain, publication, readiness, critical-spread, and generic candidate-window waits as the extension trigger; parent rolling-restart Wilson/statistical closure remains out of scope.; Rules out proceeding to audit with the verifier's original blocking concern unresolved.; Verifier concern is addressed after the source-change attempt; do not reopen for generic operation drain, pressure, absent leader, or critical spread masking.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: test/distributed/harness
- Categories: runtime
- Split plan:
  - test/distributed/harness: 2 file(s)
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-leadership-quiescence-signature-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **rolling-restart-run4-leadership-quiescence-signature-main**: Retained run3 leadership_unstable evidence is narrowed to quiescence stable-window accounting: publication, priority recovery, active-gate coverage, readiness, critical spread, and effective in-flight drain are satisfied while leaderQuietElapsedMs is 14885 of 15000ms. The deterministic harness patch anchors the candidate stable window to the latest prerequisite movement and permits one bounded deadline extension only when critical-system topology is ready, effective in-flight is zero, no pressure exists, every reason code is leadership_unstable, and the remaining leader/stable window is near closed. Focused red-on-revert fails the new test; restored patch passes focused, paired timeout-diagnostic, full active-wait suite, lint, file-size, runtime-grammar, constant-name, model-contract, and diff whitespace checks. (rules out: Rules out operation-drain, publication, readiness, critical-spread, and generic candidate-window waits as the extension trigger; parent rolling-restart Wilson/statistical closure remains out of scope.) [solve/oracle/rolling-restart-run4-leadership-quiescence-signature.json]
- **rolling-restart-run4-leadership-quiescence-signature-main**: Subagent verifier 019f1a43-0df7-7182-9cc1-2107d7d75693 inspected the source change and found two risks: the extension could be discarded after a normal 1s poll overshoot because it was based on the old deadline, and leadership_unstable also covered leaderCount=0. Both were addressed in the final patch: extension uses current timeout-observation time with overshoot capped by one poll interval plus margin, and requires leaderCount > 0; tests now overshoot the deadline by 890ms and assert absent leaders do not extend. (rules out: Rules out proceeding to audit with the verifier's original blocking concern unresolved.) [subagent:019f1a43-0df7-7182-9cc1-2107d7d75693]
- **rolling-restart-run4-leadership-quiescence-signature-main**: Post-attempt source-change verification: subagent 019f1a43-0df7-7182-9cc1-2107d7d75693 reviewed the quiescence source change, identified deadline-overshoot and leaderCount=0 risks, and the committed attempt diff resolves both. Final implementation extends from current timeout-observation time with overshoot capped by one poll interval plus margin, requires positive leaderCount, and is covered by near-closed oversleep, absent-leader, and timeout-diagnostic tests plus full active-wait suite and guards. (rules out: Verifier concern is addressed after the source-change attempt; do not reopen for generic operation drain, pressure, absent leader, or critical spread masking.) [subagent:019f1a43-0df7-7182-9cc1-2107d7d75693]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T20:49:26.053Z | rolling-restart-run4-leadership-quiescence-signature-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/rolling-restart-run4-leadership-quiescence-signature/leadership-quiescence-signature.diff |
