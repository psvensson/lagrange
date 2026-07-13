# Solve report: step-coverage-single-owner-table

**Goal:** Epic self-hosting-circularity-generic-treatment Option 5, second ladder rung (CL-029 lineage). The semantic "which WORKFLOW_STEP values of which operation type does THIS mechanism cover" is today re-derived at 52 censused sites across 33 files (24 hand-rolled step-coverage Set/array declarations + 28 per-step branch piles) — the CL-029 defect class: the dispatch-wake preempt set covered {PENDING, SENDING, CREATING} and stopped one step short of target_sync, invisible because every coverage set is enumerated ad hoc at its call site; the deferred-local-progress rows (CREATING, then ACTIVE, then STOPPING) were each a separate incident+fix. SEALED RESULT: step-coverage policy is declared ONCE — the named coverage rows live in the owner family (src/rebalancer/replica-operation-step-policy.js, a sibling of replica-operation-progress.js which keeps the progression/terminal tables), grouped so all rows are reviewable side by side; every censused Set/array declaration moves into the owner as a NAMED row (deliberately-different coverage stays distinct, never silently merged — e.g. the three identical COMPLETION_STEPS copies in the node/message-group/runtime handler constants unify to one row, while mechanism-specific rows keep their own names), and every censused branch pile consumes owner rows/predicates instead of enumerating steps inline (e.g. isPriorityOutcomeDeferredLocalProgressStep becomes a (step -> operation-type set) table row lookup). Behavior preserved exactly (each moved row keeps byte-identical membership; each pile rewrite is truth-table identical on the WORKFLOW_STEP domain); any coverage GAP found during migration is recorded as a finding and fixed only in its own pinned follow-up, never silently. doneWhen: the committed census scripts/check-step-coverage-owner.js --oracle --with-gates writes solve/oracle/step-coverage-single-owner-table.json with metric = counted re-derivations outside the owner family (baseline 52), done only at metric 0 with lint + targeted suites green. NOT in scope: step timeout/budget scalars (a numeric budget policy semantic — its own ladder rung), ReplicaStatus-based coverage sets, the progression/terminal tables themselves (already owned), and hold-engagement/cure-typing (later rungs). Executed as bounded children per owner-area batch (links.parentQuest), checkpoint commit after every attempt.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/step-coverage-single-owner-table.json

**Attempts:** 3

## Links
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 1
- Change bytes: 17893
- Owner areas: scripts/check-step-coverage-owner.js
- Categories: other
- Split plan:
  - scripts/check-step-coverage-owner.js: 1 file(s)
- Signals: none

## Frontiers
- **step-coverage-single-owner-table-main** [open] rung 3, attempts 3, metric 52 -> 0

## Findings
- **step-coverage-single-owner-table-main**: Independent adversarial verification passed: TRUSTED-WITH-NOTES (subagent a198f544). All 22 set moves membership- and order-identical (incl. the load-bearing SQL bind order: ACTIVE last lands in the type-restricted slot); all 17 pile rewrites truth-table identical (resolveOperationTransitionReason all 8 branches, usesOperationBudget CREATING equivalence, mark-failed = pre-sync union STOPPING exact, ADD-at-ACTIVE exclusion preserved, De Morgan + optional-chaining pass-throughs safe); 7 analyzer exclusions judged legitimate; zero leftover bindings; 33 modules smoke-import clean; diff artifacts byte-match. Notes acted on: transition-orchestration double-import fixed. Recorded residual: COMPLETION_STEPS wrapper objects are pre-existing dead exports (cleanup candidate). [subagent:a198f544b42664307]
- **step-coverage-single-owner-table-main**: Ingested evidence from step-coverage-single-owner-table.json. Metric: 52 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/step-coverage-single-owner-table.json]
- **step-coverage-single-owner-table-main**: Independent adversarial verification passed (subagent a198f544, TRUSTED-WITH-NOTES): analyzer detectors + exclusions judged legitimate site-by-site; census 0 on the final tree; full local gates green. [subagent:a198f544b42664307]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T11:39:39.295Z | step-coverage-single-owner-table-main | observe | 52 -> 52 | flat | no_evidence |  | diff:solve/changes/step-coverage-single-owner-table/attempt-1-census-analyzer.diff |
| 2026-07-13T11:59:03.487Z | step-coverage-single-owner-table-main | local-fix | 52 -> 52 | flat | no_evidence |  | diff:solve/changes/step-coverage-single-owner-table/attempt-2-exclusions.diff |
| 2026-07-13T12:13:05.559Z | step-coverage-single-owner-table-main | widen-scope | 0 -> 0 | flat | solved |  | diff:solve/changes/step-coverage-single-owner-table/attempt-3-exclusions-and-gates.diff |
