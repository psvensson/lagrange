# Solve report: solver-ledger-consistency-log-projection

**Goal:** Ledger consistency projects every Quest from its sealed file and append-only event log via projectState, evaluates the exact oracle-probe file sealed in doneWhen, never depends on ignored solve/state cache files, and preserves warnings for open Quests whose sealed oracle probe is missing. doneWhen: solve/oracle/solver-ledger-consistency-log-projection.json is done only when deterministic regressions cover clean-clone/no-state, a non-ID oracle target, terminal reopen by fresh failed closure evidence, terminal reopen by verifier rejection, and the intended missing-probe warning, with focused Solver tests and static checks green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-ledger-consistency-log-projection.json

**Attempts:** 3

## Links
- plan: solve/epics/roadmap-integrity-wave-0.md

## Scope Pressure
- Changed files: 4
- Change bytes: 21543
- Owner areas: scripts/solve, solve, test/solve
- Categories: workflow
- Action: land or separate 3 owner areas: scripts/solve, solve, test/solve
- Split plan:
  - solve: 2 file(s)
  - scripts/solve: 1 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-ledger-consistency-log-projection-main** [solved] rung 2, attempts 3, metric 0 -> 0

## Findings
- **solver-ledger-consistency-log-projection-main**: Deterministic regressions fail against the inherited checker for the intended reasons: a clean clone has no solve/state cache, a non-ID sealed oracle is ignored, and stale solved cache masks both fresh doneWhen failure and structured verifier rejection reopens. [test/solve/ledger-consistency.test.js]
- **solver-ledger-consistency-log-projection-main**: REUSED: projectState and readLog remain the existing append-only-log projection owners. EXTENDED: ledger consistency consumes that projection and the exact sealed doneWhen oracle target. NEW: only deterministic fixture coverage was added; no new state fold, projection owner, or generated roadmap surface was introduced. [scripts/solve/ledger-consistency.js]
- **solver-ledger-consistency-log-projection-main**: Focused fixture and scoped source gates pass. Repo-wide integration still truthfully reports the separately owned epic E1 plus two historical solved Quests whose exact sealed oracle targets live under ignored test-output; this lane does not weaken Q1 or rewrite sibling sealed Quests. [solve/epics/roadmap-integrity-wave-0.md]
- **solver-ledger-consistency-log-projection-main**: Independent verification rejected the exact attempt because its oracle claimed done while the complete focused test file still failed on three truthful Wave 0 ledger errors. [subagent:scope_classifier_fix]
- **solver-ledger-consistency-log-projection-main**: Independent verification passed for checkpoint safety; the replacement preserves strict log/probe behavior and truthfully remains nonterminal on three Wave 0 integration errors. [subagent:scope_classifier_fix]
- **solver-ledger-consistency-log-projection-main**: Ingested evidence from solver-ledger-consistency-log-projection.json. Metric: 3 -> 3. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-ledger-consistency-log-projection.json]
- **solver-ledger-consistency-log-projection-main**: Ingested evidence from solver-ledger-consistency-log-projection.json. Metric: 3 -> 3. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-ledger-consistency-log-projection.json]
- **solver-ledger-consistency-log-projection-main**: Independent aggregate verification confirmed the final ledger projection source union, live zero-error checker result, fail-closed archive semantics, and focused static/test gates. [subagent:verify_ledger_parent]
- **solver-ledger-consistency-log-projection-main**: Ingested evidence from solver-ledger-consistency-log-projection.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-ledger-consistency-log-projection.json]
- **solver-ledger-consistency-log-projection-main**: Ingested evidence from solver-ledger-consistency-log-projection.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-ledger-consistency-log-projection.json]

## Theories
- **theory-20260715-wave0-reconciliation-complete** [supported] frontier, frontier solver-ledger-consistency-log-projection-main, layer observation, mechanism stale_closure_measurement_after_dependency_integration, owner solver_ledger_consistency, boundary closure_evidence, modelGate npm run model:contracts

## Selected Theories
- **solver-ledger-consistency-log-projection-main**: theory-20260715-wave0-reconciliation-complete

## Theory Results
- **theory-20260715-wave0-reconciliation-complete**: supported (scenario=done, theory=supported, movement=no_previous) [solve/oracle/solver-ledger-consistency-log-projection.json]
- **theory-20260715-wave0-reconciliation-complete**: supported (scenario=done, theory=supported, movement=solved) [solve/oracle/solver-ledger-consistency-log-projection.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T06:26:01.761Z | solver-ledger-consistency-log-projection-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-ledger-consistency-log-projection/attempt-2.diff |
| 2026-07-15T06:32:53.676Z | solver-ledger-consistency-log-projection-main | local-fix | 0 -> 3 | flat | no_evidence |  | diff:solve/changes/solver-ledger-consistency-log-projection/attempt-3.diff |
| 2026-07-15T07:11:43.275Z | solver-ledger-consistency-log-projection-main | widen-scope | 3 -> 0 | progress | no_previous | theory-20260715-wave0-reconciliation-complete | diff:solve/changes/solver-ledger-consistency-log-projection/attempt-4.diff |
