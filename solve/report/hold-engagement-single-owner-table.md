# Solve report: hold-engagement-single-owner-table

**Goal:** Epic self-hosting-circularity-generic-treatment Option 5, third ladder rung (CL-013 lineage). The semantic 'what does a candidate move (moveType x partition class) do while an operation-ledger hold is engaged — exempt, idle-only, or defer' is today re-derived as scattered control flow at 10 censused sites across 3 files: the emergency quorum-restore ADD exemption conjunct is written twice (once per admission lane) in rebalance-coordinator-ledger-interlock-admission.js, ledger spread ADDs are exempt from the self-move interlock only by OMISSION from the disruptive-move set (the CL-013 lane), the quorum-spread hold's exemptions are encoded as early returns, and the cure-move classifier (REPLACE cures concentration) is hand-rolled at the topology guard and the planning reorder. SEALED RESULT: the operation-ledger hold-engagement relation is declared ONCE — named rows (hold x move class -> exempt | idle_only | defer) plus the move classifier (disruptive ledger self-move, emergency quorum-restore ADD, ledger-quorum cure REPLACE, dependent) live in the owner src/rebalancer/operation-ledger-hold-policy.js, a sibling of operation-ledger-quorum-concentration.js (which keeps hold-state detection and stays policy-free); every censused site consumes owner rows/predicates instead of re-deriving conjuncts or reading raw hold state (mechanism stays at the sites: typed rejection construction, TOCTOU accounting, inventory-provenance checks). Behavior preserved exactly (each rewritten decision is truth-table identical on its moveType x partition domain); any engagement GAP found during migration is recorded as a finding and fixed only in its own pinned follow-up, never silently. doneWhen: the committed census scripts/check-hold-engagement-owner.js --oracle --with-gates writes solve/oracle/hold-engagement-single-owner-table.json with metric = counted re-derivations outside the owner family (baseline 10), done only at metric 0 with lint + targeted suites green. NOT in scope: sibling admission holds (priority-budget lanes, pressure holds, ordinary-priority serial gates, serial-wait lane membership — committed exclusions with reasons), numeric budget scalars and lane counting, storage byte-capacity headroom, step-coverage rows (rung-2 owner), and cure-typing admission lanes (rung 4). Checkpoint commit after every attempt.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/hold-engagement-single-owner-table.json

**Attempts:** 1

## Links
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 3
- Change bytes: 14074
- Owner areas: src/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 3 file(s)
- Signals: none

## Frontiers
- **hold-engagement-single-owner-table-main** [solved] rung 0, attempts 1, metric 10 -> 0

## Findings
- **hold-engagement-single-owner-table-main**: independent verification passed [subagent:a858f0690787fab84]
- **hold-engagement-single-owner-table-main**: Owner ingress normalizes moveType case (toUpperCase) uniting the coordinator OperationType domain and the planner MoveType domain; strict-superset only on inputs unreachable in production (verifier-confirmed: all callers pass normalizeMoveType output or stored uppercase rows), aligned with the CL-013 verification precedent that case-sensitive comparison here was fail-open. Verifier note 2: analyzer escapes exist only via deliberate evasion (import-renames, rebinding, Set-membership cure checks) — same class as the rung-2 analyzer; no current site exploits them. [subagent:a858f0690787fab84]
- **hold-engagement-single-owner-table-main**: independent verification passed [subagent:a858f0690787fab84]
- **hold-engagement-single-owner-table-main**: Ingested evidence from hold-engagement-single-owner-table.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/hold-engagement-single-owner-table.json]
- **hold-engagement-single-owner-table-main**: Ingested evidence from hold-engagement-single-owner-table.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/hold-engagement-single-owner-table.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T12:49:28.666Z | hold-engagement-single-owner-table-main | observe | 10 -> 0 | progress | no_evidence |  | diff:solve/changes/hold-engagement-single-owner-table/attempt-1.diff |
