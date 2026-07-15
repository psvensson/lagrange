# Solve report: aggregate-duplication-analyzer-runtime-consolidation

**Goal:** Five distributed-analysis entrypoints route recursive compressed-log discovery and asynchronous CLI result handling through one canonical analyzer runtime, eliminating the current global source-duplication excess so the ratchet passes at or below 73 clone groups and 2239 duplicated lines without behavior, cognitive-complexity, guideline, lint, or baseline regressions. doneWhen: solve/oracle/aggregate-duplication-analyzer-runtime-consolidation.json is done only when the global duplication ratchet, focused analyzer tests and CLI probes, scoped guideline audits, focused lint, and no-regression cognitive check are green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/aggregate-duplication-analyzer-runtime-consolidation.json

**Attempts:** 2

## Links
- plan: solve/epics/roadmap-integrity-wave-0.md

## Scope Pressure
- Changed files: 6
- Change bytes: 14188
- Owner areas: scripts/analyze-fix-engagement.js, scripts/analyze-monotone-drain.js, scripts/analyze-precondition-recurrence.js, scripts/analyze-redecision-storm.js, scripts/analyze-replace-safety-blocks.js, scripts/distributed-analysis-runtime.js
- Categories: other
- Action: land or separate 6 owner areas: scripts/analyze-fix-engagement.js, scripts/analyze-monotone-drain.js, scripts/analyze-precondition-recurrence.js, scripts/analyze-redecision-storm.js, scripts/analyze-replace-safety-blocks.js, scripts/distributed-analysis-runtime.js
- Split plan:
  - scripts/analyze-fix-engagement.js: 1 file(s)
  - scripts/analyze-monotone-drain.js: 1 file(s)
  - scripts/analyze-precondition-recurrence.js: 1 file(s)
  - scripts/analyze-redecision-storm.js: 1 file(s)
  - scripts/analyze-replace-safety-blocks.js: 1 file(s)
  - scripts/distributed-analysis-runtime.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **aggregate-duplication-analyzer-runtime-consolidation-main** [solved] rung 1, attempts 2, metric 107 -> 0 — exact terminal source attempt was rejected

## Findings
- **aggregate-duplication-analyzer-runtime-consolidation-main**: REUSED vs EXTENDED vs NEW: REUSED every analyzer-owned runCli, decompression policy, parser, renderer, and exported API; EXTENDED no product or Solver owner; NEW one distributed-analysis runtime because a repository search found no non-guideline owner for recursive .log.gz discovery or async analyzer result-to-process routing. The pre-change clone report measured six directly removable groups / 157 lines in that plumbing, and the live post-change report is 69 groups / 2169 lines, removing seven groups / 174 lines without a baseline edit. [test-output/analysis/jscpd-src-scripts/jscpd-report.json]
- **aggregate-duplication-analyzer-runtime-consolidation-main**: A repository sweep found additional direct-entry wrappers in analyzer families outside the sealed five-entrypoint scope, including analyze-latent-blockers, analyze-owner-files, and analyze-priority-recovery-residuals. Their output/error contracts are not members of the current clone class, so they remain a recorded tail-consumer consolidation candidate rather than being widened into this no-behavior duplication closure. [scripts/distributed-analysis-runtime.js]
- **aggregate-duplication-analyzer-runtime-consolidation-main**: Independent verifier /root/cli_static_lane/verify_cli_static rejected this exact attempt because its artifact imports but omits the new distributed-analysis runtime module. [subagent:verify-cli-static]
- **aggregate-duplication-analyzer-runtime-consolidation-main**: Independent verifier approved both the complete replacement attempt and byte-identical aggregate: six-path payload, 84 focused assertions, direct CLI and recursive/truncated contracts, 69/2169 duplication, all scoped static gates, and no baseline or cognitive regression. [subagent:verify-duplication-replacement]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T08:17:59.400Z | aggregate-duplication-analyzer-runtime-consolidation-main | observe | 107 -> 0 | progress | no_evidence |  | diff:solve/changes/aggregate-duplication-analyzer-runtime-consolidation/attempt-1.diff |
| 2026-07-15T08:22:09.436Z | aggregate-duplication-analyzer-runtime-consolidation-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/aggregate-duplication-analyzer-runtime-consolidation/attempt-2.diff |
