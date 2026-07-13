# Solve report: cure-typing-single-owner-table

**Goal:** Epic self-hosting-circularity-generic-treatment Option 5, fourth ladder rung (2b5875b0 lineage). The semantic 'which cure move type does a detected placement condition take, and which admission lane does that cure enter' (REPLACE cures placement skew, ADD cures under-replication, REMOVE cures surplus and failed replicas; emergency-priority vs ordinary-priority vs non-priority lanes) is today re-derived at 15 censused sites across 8 files: calculateMoves hand-rolls the whole condition-to-cure mapping from raw target-vs-current count diffs (under-representation ADD, over-representation and failed-replica REMOVE, paired count-neutral REPLACE), buildPriorityRecoveryFollowUpMove re-infers healthy-at-target-with-source REPLACE else ADD (the 2b5875b0 defect shape), and six budget/admission helpers each hand-roll the cure-by-partition-class lane conjunct from the emergency-partition classifier (budget scope selection, per-lane counting, pressure evidence, ordinary serial gate, serial-wait lane membership, plan wiring). SEALED RESULT: the cure-typing relation is declared ONCE — named rows (condition to cure move type) and (cure by partition class to admission lane) plus their classifiers live in the owner src/rebalancer/replica-placement-cure-policy.js, a sibling of operation-ledger-hold-policy.js and operation-ledger-quorum-concentration.js (which keep hold engagement and hold-state detection), with the admission-plan owner in src/control-plane consuming the same rows; every censused site consumes owner rows/predicates instead of re-deriving type or lane conjuncts (mechanism stays at the sites: node selection, pairing, counting, evidence assembly). Behavior preserved exactly (each rewritten decision is truth-table identical on its condition and partition domain); any typing GAP found during migration is recorded as a finding and fixed only in its own pinned follow-up, never silently. doneWhen: the committed census scripts/check-cure-typing-owner.js --oracle --with-gates writes solve/oracle/cure-typing-single-owner-table.json with metric = counted re-derivations outside the owner family (baseline 15), done only at metric 0 with lint + targeted suites green. NOT in scope: schema-provisioning creation ADDs (intent-derived, committed exclusions), numeric budget scalars and per-lane counts (the counting mechanism), topology-cleanup move ordering, step-coverage rows (rung-2 owner), hold engagement rows (rung-3 owner), and the 119-site partition-class ladder (rung 5). Checkpoint commit after every attempt.

**Class:** process · **Closure:** DECISION

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: cure-typing-single-owner-table-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for cure-typing-single-owner-table-main

## Continuation
- Status: blocked-metric-projection
- Next action: continue supervised step for cure-typing-single-owner-table-main
- Blocker: live frontier metric 0 differs from recorded metric 15

## Scope Pressure
- Changed files: 1
- Change bytes: 1030
- Owner areas: scripts/check-hold-engagement-owner.js
- Categories: other
- Split plan:
  - scripts/check-hold-engagement-owner.js: 1 file(s)
- Signals: none

## Frontiers
- **cure-typing-single-owner-table-main** [open] rung 1, attempts 1, metric 15 -> 15

## Findings
- **cure-typing-single-owner-table-main**: independent verification passed: TRUSTED-WITH-NOTES (A1-A10 attacks not refuted; notes: follow-up selectable-source must be computed after id extraction as a boolean; ordinary serial gate is mixed-scope — inject arg-ignoring entity-scoped isPriorityPartition; pressure-helper emergency flag equivalence rests on emergency-table-ids subset of priority-table-ids) [subagent:aa3ee6c5eceb79ce4]
- **cure-typing-single-owner-table-main**: sealed symptom RESOLVED on HEAD by the two child slices (this is the intended path, not a stale seal): census metric 15 -> 0 via cure-typing-owner-migration-move-minters (7 mints) and cure-typing-owner-migration-admission-lanes (8 lane conjuncts), both SOLVED and handed off with adversarial verification [solve/oracle/cure-typing-single-owner-table.json]
- **cure-typing-single-owner-table-main**: Ingested evidence from cure-typing-single-owner-table.json. Metric: 15 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/cure-typing-single-owner-table.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T13:36:07.937Z | cure-typing-single-owner-table-main | observe | 15 -> 15 | flat | no_evidence |  | diff:solve/changes/cure-typing-single-owner-table/attempt-1.diff |
