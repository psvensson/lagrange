# Solve report: configured-split-threshold-policy-precedence

**Goal:** Configured partition split thresholds govern tables without explicit split policy overrides; explicit per-table split thresholds still win; PartitionSplitMergeManager consumes one effective policy answer from TablePolicyService, proven by real-owner deterministic tests.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-43-30-927Z.report.json

**Attempts:** 3

## Links
- spec: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 5
- Change bytes: 15526
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, src/policy, test/partition
- Categories: other, runtime, test
- Action: land or separate 4 owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, src/policy, test/partition
- Split plan:
  - src/policy: 2 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/partition: 1 file(s)
  - test/partition: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **configured-split-threshold-policy-precedence-main** [solved] rung 3, attempts 3, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **configured-split-threshold-policy-precedence-main**: Ingested evidence from configured-split-threshold-policy-precedence-2026-07-15T18-34-54-846Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-34-54-846Z.report.json]
- **configured-split-threshold-policy-precedence-main**: Exact attempt omits the untracked deterministic regression; the scenario registration references a test artifact that its three-path fingerprint does not bind. [subagent:wave4_coordinator_hol_verify]
- **configured-split-threshold-policy-precedence-main**: Ingested evidence from configured-split-threshold-policy-precedence-2026-07-15T18-37-18-719Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-37-18-719Z.report.json]
- **configured-split-threshold-policy-precedence-main**: Although the four-path attempt binds the regression, updateTablePolicy persists merged configured defaults as durable fields, erasing inherited-versus-explicit provenance after unrelated sparse updates. [subagent:wave4_coordinator_hol_verify]
- **configured-split-threshold-policy-precedence-main**: Ingested evidence from configured-split-threshold-policy-precedence-2026-07-15T18-43-30-927Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-43-30-927Z.report.json]
- **configured-split-threshold-policy-precedence-main**: Ingested evidence from configured-split-threshold-policy-precedence-2026-07-15T18-43-30-927Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-43-30-927Z.report.json]
- **configured-split-threshold-policy-precedence-main**: Independent verification passed: sparse stored policy provenance survives unrelated updates, later configured thresholds are re-resolved, explicit overrides retain precedence, and explicit zero is preserved. [subagent:wave4_coordinator_hol_verify]
- **configured-split-threshold-policy-precedence-main**: Ingested evidence from configured-split-threshold-policy-precedence-2026-07-15T18-46-25-821Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-46-25-821Z.report.json]
- **configured-split-threshold-policy-precedence-main**: Ingested evidence from configured-split-threshold-policy-precedence-2026-07-15T18-46-25-821Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-46-25-821Z.report.json]
- **configured-split-threshold-policy-precedence-main**: Independent aggregate verification passed for the complete five-path Quest source union and its 275-assertion focused evidence. [subagent:wave4_coordinator_hol_verify]

## Theories
- **theory-20260715-updatetablepolicy-previously-merged-configured-defaults-into** [supported] frontier, frontier configured-split-threshold-policy-precedence-main, layer ownership, mechanism updateTablePolicy previously merged configured defaults into the stored JSON, erasing whether a threshold was inherited or explicitly overridden, modelGate npm run model:contracts

## Selected Theories
- **configured-split-threshold-policy-precedence-main**: theory-20260715-updatetablepolicy-previously-merged-configured-defaults-into

## Theory Results
- **theory-20260715-updatetablepolicy-previously-merged-configured-defaults-into**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-43-30-927Z.report.json]
- **theory-20260715-updatetablepolicy-previously-merged-configured-defaults-into**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/configured-split-threshold-policy-precedence-2026-07-15T18-46-25-821Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T18:35:17.048Z | configured-split-threshold-policy-precedence-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/configured-split-threshold-policy-precedence/attempt-2.diff |
| 2026-07-15T18:37:27.228Z | configured-split-threshold-policy-precedence-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/configured-split-threshold-policy-precedence/attempt-3.diff |
| 2026-07-15T18:45:18.914Z | configured-split-threshold-policy-precedence-main | widen-scope | 0 -> 0 | flat | solved | theory-20260715-updatetablepolicy-previously-merged-configured-defaults-into | diff:solve/changes/configured-split-threshold-policy-precedence/attempt-4.diff |
