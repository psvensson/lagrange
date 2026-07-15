# Solve report: listener-port-model-runtime-consumers

**Goal:** Runtime entrypoint, bootstrap, CDC, node fallback, and transport address consumers use the listener-port authority without local offset arithmetic or hardcoded listener defaults.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/listener-port-model-runtime-consumers-2026-07-15T11-17-33-842Z.report.json

**Attempts:** 1

## Links
- parent quest: listener-port-model-single-authority

## Scope Pressure
- Changed files: 6
- Change bytes: 12106
- Owner areas: src/bootstrap, src/cdc, src/entrypoint-runtime-options.js, src/transport, test/transport
- Categories: runtime, test
- Action: land or separate 5 owner areas: src/bootstrap, src/cdc, src/entrypoint-runtime-options.js, src/transport, test/transport
- Split plan:
  - src/cdc: 2 file(s)
  - src/bootstrap: 1 file(s)
  - src/entrypoint-runtime-options.js: 1 file(s)
  - src/transport: 1 file(s)
  - test/transport: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **listener-port-model-runtime-consumers-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **listener-port-model-runtime-consumers-main**: DT red-on-revert proven across the complete runtime-consumer source set [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T11-17-41-716Z.json]
- **listener-port-model-runtime-consumers-main**: Bootstrap WebSocket consumer independently fails on revert [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T11-17-50-499Z.json]
- **listener-port-model-runtime-consumers-main**: CDC event consumer independently fails on revert [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T11-17-50-498Z.json]
- **listener-port-model-runtime-consumers-main**: CDC node-join consumer independently fails on revert [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T11-17-50-680Z.json]
- **listener-port-model-runtime-consumers-main**: Entrypoint runtime listener resolution independently fails on revert [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T11-17-50-634Z.json]
- **listener-port-model-runtime-consumers-main**: Transport node-address derivation independently fails on revert [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T11-17-50-652Z.json]
- **listener-port-model-runtime-consumers-main**: Independent verification passed for the byte-identical exact runtime-consumer attempt and aggregate, including per-consumer reversion and address edge attacks [subagent:listener-port-runtime-consumers-verifier]
- **listener-port-model-runtime-consumers-main**: Ingested evidence from listener-port-model-runtime-consumers-2026-07-15T11-26-44-986Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-runtime-consumers-2026-07-15T11-26-44-986Z.report.json]
- **listener-port-model-runtime-consumers-main**: Ingested evidence from listener-port-model-runtime-consumers-2026-07-15T11-26-44-986Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-runtime-consumers-2026-07-15T11-26-44-986Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T11:18:14.824Z | listener-port-model-runtime-consumers-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/listener-port-model-runtime-consumers/attempt-1.diff |
