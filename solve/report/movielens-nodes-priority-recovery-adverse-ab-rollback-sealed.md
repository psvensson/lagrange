# Solve report: movielens-nodes-priority-recovery-adverse-ab-rollback-sealed

**Goal:** The rejected nodes-p1 advance-now priority classification is removed, nodes-p1 again remains behind canonical full-readiness admission, the priority inventory test remains derived from the canonical classification owner, focused and adjacent regressions pass, and the exact rollback is independently verified against the immutable 2-fixed-versus-2-reverted live A/B rejection.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-nodes-priority-recovery-adverse-ab-rollback-2026-07-16T17-43-23-654Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-nodes-priority-recovery-escape
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 6
- Change bytes: 7844
- Owner areas: scripts/run-movielens-nodes-priority-recovery-adverse-ab-rollback-scenarios.js, src/bootstrap, test/bootstrap, test/rebalancer
- Categories: other, runtime
- Action: land or separate 4 owner areas: scripts/run-movielens-nodes-priority-recovery-adverse-ab-rollback-scenarios.js, src/bootstrap, test/bootstrap, test/rebalancer
- Split plan:
  - test/bootstrap: 2 file(s)
  - test/rebalancer: 2 file(s)
  - scripts/run-movielens-nodes-priority-recovery-adverse-ab-rollback-scenarios.js: 1 file(s)
  - src/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-nodes-priority-recovery-adverse-ab-rollback-sealed-main** [solved] rung 0, attempts 1, metric 0 -> 0

## Findings
- **movielens-nodes-priority-recovery-adverse-ab-rollback-sealed-main**: Independent verification approved the exact rollback for attempt and aggregate scope: the only runtime change removes nodes-p1 from priority recovery, the postimage is byte-identical to the safer reverted live arm, canonical inventory remains derived from its owner with zero duplicate decision sites, fresh focused and adjacent tests pass 216/216, and in-memory re-addition turns the intended readiness and deferral assertions red. [subagent:design_completion_discriminator]
- **movielens-nodes-priority-recovery-adverse-ab-rollback-sealed-main**: Ingested evidence from movielens-nodes-priority-recovery-adverse-ab-rollback-2026-07-16T17-43-23-654Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-nodes-priority-recovery-adverse-ab-rollback-2026-07-16T17-43-23-654Z.report.json]

## Theories
- **theory-20260716-nodes-p1-priority-classification-advances-recovery** [supported] frontier, frontier movielens-nodes-priority-recovery-adverse-ab-rollback-sealed-main, layer ownership, mechanism nodes-p1 priority classification advances recovery work while the shared operation ledger is still churning, producing no sealed outcome improvement and consistent live error amplification, owner system-partition classification owner, boundary PRIORITY_CONTROL_PLANE_TABLE_IDS to UnifiedRebalancer topology-settling admission, modelGate npm run model:contracts

## Selected Theories
- **movielens-nodes-priority-recovery-adverse-ab-rollback-sealed-main**: theory-20260716-nodes-p1-priority-classification-advances-recovery

## Theory Results
- **theory-20260716-nodes-p1-priority-classification-advances-recovery**: supported (scenario=done, theory=supported, movement=no_evidence) [test-output/reports/movielens-nodes-priority-recovery-adverse-ab-rollback-2026-07-16T17-43-23-654Z.report.json]
- **theory-20260716-nodes-p1-priority-classification-advances-recovery**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-nodes-priority-recovery-adverse-ab-rollback-2026-07-16T17-43-23-654Z.report.json]
- **theory-20260716-nodes-p1-priority-classification-advances-recovery**: supported (scenario=done, theory=supported, movement=narrowed) [test-output/reports/movielens-nodes-priority-recovery-adverse-ab-rollback-2026-07-16T17-43-23-654Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T17:51:38.362Z | movielens-nodes-priority-recovery-adverse-ab-rollback-sealed-main | observe | 0 -> 0 | flat | no_evidence | theory-20260716-nodes-p1-priority-classification-advances-recovery | diff:solve/changes/movielens-nodes-priority-recovery-adverse-ab-rollback-sealed/attempt-1.diff |
