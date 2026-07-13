# Solve report: cure-typing-owner-migration-move-minters

**Goal:** Bounded migration slice of parent cure-typing-single-owner-table (epic self-hosting-circularity-generic-treatment Option 5, rung 4): the two move-minting sites consume the declared condition-to-cure rows. calculateMoves (src/rebalancer/move-planner-move-calculation-methods.js) mints ADD from under-representation, REMOVE from over-representation and failed replicas, and pairs count-neutral REPLACEs, all from raw target-vs-current count diffs; buildPriorityRecoveryFollowUpMove (src/rebalancer/unified-rebalancer-follow-up-move.js) re-infers healthy-at-target-with-source REPLACE else ADD (the 2b5875b0 defect shape). SEALED RESULT: both functions resolve every minted cure move type through owner rows/classifiers from src/rebalancer/replica-placement-cure-policy.js (mechanism stays at the sites: node selection, pairing, budget caps, move reasons, dedupe). Behavior preserved exactly — each rewritten decision is truth-table identical on its condition domain; any typing GAP is recorded as a finding and fixed only in its own pinned follow-up. doneWhen: the committed census scripts/check-cure-typing-owner.js --oracle --oracle-file solve/oracle/cure-typing-owner-migration-move-minters.json --done-at 8 --with-gates reports metric at most 8 (every cure_move_type_mint site migrated; the 8 admission-lane conjunct sites belong to the sibling slice) with lint + targeted suites green. Checkpoint commit after every attempt.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/cure-typing-owner-migration-move-minters.json

**Attempts:** 1

## Links
- parent quest: cure-typing-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 2
- Change bytes: 8612
- Owner areas: src/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
- Signals: none

## Frontiers
- **cure-typing-owner-migration-move-minters-main** [solved] rung 0, attempts 1, metric 15 -> 8

## Findings
- **cure-typing-owner-migration-move-minters-main**: sealed symptom reproduces on HEAD: census metric 15 with all 7 cure_move_type_mint sites intact in calculateMoves (4) and buildPriorityRecoveryFollowUpMove (3); the src change since draft is the new owner module itself [solve/oracle/cure-typing-owner-migration-move-minters.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T13:53:50.496Z | cure-typing-owner-migration-move-minters-main | observe | 15 -> 8 | progress | no_evidence |  | diff:solve/changes/cure-typing-owner-migration-move-minters/attempt-1.diff |
