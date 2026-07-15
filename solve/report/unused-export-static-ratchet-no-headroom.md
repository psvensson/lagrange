# Solve report: unused-export-static-ratchet-no-headroom

**Goal:** All 19 unused exports introduced after the 1,628-export ratchet baseline cease to be externally exported while their declarations, internal uses, and behavior remain unchanged. doneWhen: solve/oracle/unused-export-static-ratchet-no-headroom.json reaches metric 0 only when the live Knip delta is zero, the ratchet passes without baseline changes, and focused validation plus global metrics do not regress.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/unused-export-static-ratchet-no-headroom.json

**Attempts:** 1

## Links
- plan: solve/epics/roadmap-integrity-wave-0.md

## Scope Pressure
- Changed files: 13
- Change bytes: 9163
- Owner areas: src/cli, src/control-plane, src/partition, src/query, src/runtime, test/partition
- Categories: runtime, test
- Action: split by owner area before the next attempt (13 files)
- Action: land or separate 6 owner areas: src/cli, src/control-plane, src/partition, src/query, src/runtime, test/partition
- Split plan:
  - src/runtime: 5 file(s)
  - src/cli: 3 file(s)
  - src/query: 2 file(s)
  - src/control-plane: 1 file(s)
  - src/partition: 1 file(s)
  - test/partition: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **unused-export-static-ratchet-no-headroom-main** [solved] rung 0, attempts 1, metric 19 -> 0

## Findings
- **unused-export-static-ratchet-no-headroom-main**: REUSED the existing Knip unused-export ratchet, fail-closed test runner, ESLint, and metric reports; EXTENDED no mechanism and added nothing NEW. Comparing commit 6fb18fb9f with the lane base found 19 current-only and 4 baseline-only exports (net +15). The patch removes all 19 current-only exposures and only four declarations/imports that became provably dead, yielding 1,624 exports. The pre-existing 67 literal and 3 decision-boundary findings in these modules remain byte-for-byte count-stable and belong to separate Wave 0 CLI/query/runtime/static owner lanes under solve/epics/roadmap-integrity-wave-0.md; this export-only Quest does not absorb or weaken those gates.
- **unused-export-static-ratchet-no-headroom-main**: independent verification passed for exact attempt and aggregate source snapshot [subagent:verify_unused_export]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T07:53:12.704Z | unused-export-static-ratchet-no-headroom-main | observe | 19 -> 0 | progress | no_evidence |  | diff:solve/changes/unused-export-static-ratchet-no-headroom/attempt-1.diff |
