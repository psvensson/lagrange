# Solve report: priority-recovery-owner-inventory

**Goal:** A tooling-generated inventory classifies every priority/publication-recovery module by owner and semantic layer, records every import edge, identifies duplicate DTO or reducer authority, and emits bounded owner-scoped migration candidates without moving runtime files.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/priority-recovery-owner-inventory-2026-07-11T14-20-04-148Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W14
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 5
- Change bytes: 252809
- Owner areas: scripts/generate-priority-recovery-owner-inventory.js, scripts/run-priority-recovery-owner-inventory-scenarios.js, solve, test/solve
- Categories: other, workflow
- Action: land or separate 4 owner areas: scripts/generate-priority-recovery-owner-inventory.js, scripts/run-priority-recovery-owner-inventory-scenarios.js, solve, test/solve
- Split plan:
  - solve: 2 file(s)
  - scripts/generate-priority-recovery-owner-inventory.js: 1 file(s)
  - scripts/run-priority-recovery-owner-inventory-scenarios.js: 1 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **priority-recovery-owner-inventory-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **priority-recovery-owner-inventory-main**: Generated production inventory classifies 65 modules once across five owners and four layers, parses 279 import edges with zero unresolved/parser failures, measures 750 public exports, 76 cross-layer edges, and largest SCC 1. [solve/changes/priority-recovery-owner-inventory/inventory.json]
- **priority-recovery-owner-inventory-main**: Ten duplicate-authority name signals narrow to two byte-identical local implementations in one admin-to-control-plane file pair, generating one bounded migration candidate with exact proof and verifier metadata. [solve/changes/priority-recovery-owner-inventory/inventory.json]
- **priority-recovery-owner-inventory-main**: The pre-existing untracked formation-ledger quorum report remains excluded from W14. [git-status:solve/report/formation-ledger-quorum-concentrated-replace-churn-60s.md]
- **priority-recovery-owner-inventory-main**: Correction: the earlier two-byte-identical claim was invalid because the prototype body extractor stopped at a default-parameter object literal. The corrected signature-aware extractor reports zero exact duplicates, ten same-name signals, and two >=0.75 similarity proposals; the three fresh 254-assertion reports cover the corrected projection. (rules out: treating a default-parameter object literal as a function body) [test-output/reports/priority-recovery-owner-inventory-2026-07-11T14-14-49-511Z.report.json]
- **priority-recovery-owner-inventory-main**: Independent attack review rejected the prototype's filename precedence, arbitrary cutoff omission, and synthetic acyclicity proof; the corrected inventory classifies decision sentinels semantically, includes the 0.742 authority candidate, and derives SCC closure from 279 production edges. (rules out: filename-only snapshot precedence and synthetic four-node acyclicity) [subagent:/root/w14_inventory_verify]
- **priority-recovery-owner-inventory-main**: Final independent AST reconciliation matches 65 classifications, 279 edges, 750 exports, all implementation hashes, largest SCC 1, and all three bounded migration proposals; fresh evidence is three consecutive 265-assertion PASS reports. [subagent:/root/w14_inventory_verify]
- **priority-recovery-owner-inventory-main**: Post-attempt verifier confirmed the 252,809-byte content-addressed payload and gzip object identities, exact five-file pathscope/current-diff fidelity, forward/reverse applicability, and exclusion of all bookkeeping and the formation report. [subagent:/root/w14_inventory_verify]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T14:22:15.823Z | priority-recovery-owner-inventory-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/priority-recovery-owner-inventory/attempt-1.diff.json |
