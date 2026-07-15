# Solve report: partition-class-ladder-owner-tooling

**Goal:** Bounded Option-5 rung-5 tooling slice: package.json exposes audit:partition-class-owner through the committed census analyzer; the analyzer requires classifySystemPartition to pass the original options object directly to resolvePartitionTableId so legacy fallback from an unparsable row ID to the top-level partition ID cannot be lost, rejects rebuilt resolver inputs, and runs its focused suite in the targeted gate. doneWhen remains the sealed parent census at target zero. NOT in scope: runtime source, runtime tests, decision-table specifications, consumer migration, target weakening, or behavior change.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/partition-class-ladder-single-owner-table.json

**Attempts:** 2

## Links
- spec: solve/epics/self-hosting-circularity-generic-treatment.md
- parent quest: partition-class-ladder-census-proof-final
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 4
- Change bytes: 6540
- Owner areas: package.json, scripts/check-partition-class-owner.js, solve, test/scripts
- Categories: other, test, workflow
- Action: land or separate 4 owner areas: package.json, scripts/check-partition-class-owner.js, solve, test/scripts
- Split plan:
  - package.json: 1 file(s)
  - scripts/check-partition-class-owner.js: 1 file(s)
  - solve: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **partition-class-ladder-owner-tooling-main** [solved] rung 2, attempts 2, metric 119 -> 0

## Findings
- **partition-class-ladder-owner-tooling-main**: The package.json change adds one audit script entry and does not touch the reverted release CI memory-mode lever from 75544369; focused diff inspection rules out retreading that revert. [git:package-json-one-line-audit-script]
- **partition-class-ladder-owner-tooling-main**: Independent verification passed for the exact three-file tooling attempt: original-options provenance is enforced, rebuilt/spread/aliased inputs fail, prior evasion defenses remain, and the package change is only the audit entry. [subagent:verify_rung5_census]
- **partition-class-ladder-owner-tooling-main**: The sealed unresolved owner-tooling symptom does not reproduce on exact source HEAD 6aeeed6f: package.json still exposes audit:partition-class-owner, the analyzer's full --oracle --with-gates run reports contract v3, owner contract passed, raw/collapsed 0/0, metric/target 0/0, done true, and every required gate green. [solve/oracle/partition-class-ladder-single-owner-table.json]
- **partition-class-ladder-owner-tooling-main**: Current committed contract/model evidence remains the active-gate TLC route report, while the exact source-HEAD analyzer rerun passed its decision-table-model gate; this is later model evidence for the historical tooling attempt without modifying source or baselines. [contract:architecture/contracts/evidence/active-gate-tlc-route.model.report.json]
- **partition-class-ladder-owner-tooling-main**: Ingested evidence from partition-class-ladder-single-owner-table.json. Metric: 119 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/partition-class-ladder-single-owner-table.json]
- **partition-class-ladder-owner-tooling-main**: Ingested evidence from partition-class-ladder-single-owner-table.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/partition-class-ladder-single-owner-table.json]
- **partition-class-ladder-owner-tooling-main**: Ingested evidence from partition-class-ladder-single-owner-table.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/partition-class-ladder-single-owner-table.json]
- **partition-class-ladder-owner-tooling-main**: Independent current-HEAD aggregate verification passed: the canonical three-path delta from recorded base c28bae46 is sha256:a087f3ece18889efa9966d1b17d01944c887fe853b7b81322db013f606b09b63; the package command, original-options resolver contract, rebuilt-input rejection, strict file sizes, 123 focused assertions, and official contract-v3 0/0 census with all gates are green without baseline changes. [subagent:partition_q2_closure]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T17:27:17.480Z | partition-class-ladder-owner-tooling-main | observe | 119 -> 119 | flat | no_evidence |  | diff:solve/changes/partition-class-ladder-owner-tooling/attempt-1.diff |
| 2026-07-15T08:10:30.510Z | partition-class-ladder-owner-tooling-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/partition-class-ladder-owner-tooling/attempt-2.diff |
