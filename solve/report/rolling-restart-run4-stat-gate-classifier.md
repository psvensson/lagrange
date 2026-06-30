# Solve report: rolling-restart-run4-stat-gate-classifier

**Goal:** Rolling-restart stat-gate tooling classification preserves per-scenario passed:false and does not label missing=0 topology-blocked runs as CONVERGED, so run4 evidence summaries cannot mask critical_system_spread_open failures.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-stat-gate-classifier.json

**Attempts:** 1

## Links
- parent quest: rolling-restart-run4-operation-drain
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-stat-gate-classifier-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-stat-gate-classifier-main
- No longer current: Do not read stat-gate missing=0 alone as scenario convergence; scenario passed=false with critical_system_spread_open remains a failed topology-blocked sample.; Do not keep the old inline jq classifier; it masks explicit false values and topology-blocked failures.; Do not require a fresh distributed stat-gate to validate this reporting fix; the deterministic classifier test and live run1 replay cover the masked summary defect.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: scripts/rolling-restart-stat-gate-summary.js, scripts/rolling-restart-stat-gate.sh, solve, test/scripts
- Categories: other, test, workflow
- Action: land or separate 4 owner areas: scripts/rolling-restart-stat-gate-summary.js, scripts/rolling-restart-stat-gate.sh, solve, test/scripts
- Split plan:
  - solve: 2 file(s)
  - scripts/rolling-restart-stat-gate-summary.js: 1 file(s)
  - scripts/rolling-restart-stat-gate.sh: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **rolling-restart-run4-stat-gate-classifier-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **rolling-restart-run4-stat-gate-classifier-main**: Deterministic stat-gate classifier guard is green: it preserves explicit passed:false, keeps missingPublishedCount=0 visible, and classifies the run4 critical_system_spread_open witness as TOPOLOGY_BLOCKED instead of CONVERGED. (rules out: Do not read stat-gate missing=0 alone as scenario convergence; scenario passed=false with critical_system_spread_open remains a failed topology-blocked sample.) [node test/scripts/rolling-restart-stat-gate-summary.test.js; bash -n scripts/rolling-restart-stat-gate.sh; node scripts/rolling-restart-stat-gate-summary.js classify-run test-output/reports/stat-gate-20260629T232437Z-run1.report.json => passed=false missing=0 class=TOPOLOGY_BLOCKED; aggregate sanity check => classTally CONVERGED=2 TOPOLOGY_BLOCKED=1; git diff --check]
- **rolling-restart-run4-stat-gate-classifier-main**: Source-change verifier subagent 019f15d5-5efe-7662-b81a-3b3ca796ffba reviewed the stat-gate classifier patch and found no blocking issues; it independently reproduced the old jq output as passed:null/class:CONVERGED and the new helper output as passed:false/class:TOPOLOGY_BLOCKED on the live run1 report. (rules out: Do not keep the old inline jq classifier; it masks explicit false values and topology-blocked failures.) [subagent:019f15d5-5efe-7662-b81a-3b3ca796ffba; test-output/reports/stat-gate-20260629T232437Z-run1.report.json]
- **rolling-restart-run4-stat-gate-classifier-main**: Post-attempt source-change verification: subagent 019f15d5-5efe-7662-b81a-3b3ca796ffba reviewed the final stat-gate classifier diff and found no blocking issues; the patch preserves passed:false, classifies the run4 critical_system_spread_open witness as TOPOLOGY_BLOCKED, keeps the shell fallback behavior, and tests the same exported helper used by the CLI. (rules out: Do not require a fresh distributed stat-gate to validate this reporting fix; the deterministic classifier test and live run1 replay cover the masked summary defect.) [subagent:019f15d5-5efe-7662-b81a-3b3ca796ffba; diff:solve/changes/rolling-restart-run4-stat-gate-classifier/stat-gate-topology-blocked-classifier.diff; node test/scripts/rolling-restart-stat-gate-summary.test.js; git diff --check]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T00:06:46.999Z | rolling-restart-run4-stat-gate-classifier-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-stat-gate-classifier/stat-gate-topology-blocked-classifier.diff |
