# Solve report: listener-port-model-single-authority

**Goal:** The node's three listener ports (REST API, admin WebSocket, cross-node transport WebSocket) form one coherent, fully-wired port model with a single derivation authority: (1) each port is a first-class config key with a schema property, env mapping, and default — no half-wired keys (node.wsPort today has no schema/env/default and is rejected by additionalProperties:false); (2) defaults form one base+offset family derived from restApiPort (REST = base, admin WS = base+1, transport WS = base+2) while each port remains individually overridable; (3) exactly one module owns port/address derivation and every consumer that today re-derives restPort+2 locally (entrypoint-runtime-options, node-address-resolution, cdc-integration-service-node-join, cdc-event-handler, connect-websocket-phase) consumes that authority instead; (4) startup validation rejects any configuration where two listeners resolve to the same port; (5) help text, Helm chart templates/values, and CLI defaults agree with runtime behavior — no advertised-but-unconsumed PORT env var, no hardcoded 8081 that contradicts the config model. Proven by deterministic red-on-revert tests (dt:prove) covering the derivation authority, the wired config keys, and the collision validation, plus a green test suite.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/listener-port-model-single-authority-2026-07-15T12-14-34-127Z.report.json

**Attempts:** 2

## Scope Pressure
- Changed files: 1
- Change bytes: 1838
- Owner areas: docs
- Categories: docs
- Split plan:
  - docs: 1 file(s)
- Signals: none

## Frontiers
- **listener-port-model-single-authority-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **listener-port-model-single-authority-main**: DT red-on-revert proven for test/config/configuration-manager.test.js [dt:solve/changes/dt-prove/configuration-manager.test.js-2026-07-15T10-44-01-653Z.json]
- **listener-port-model-single-authority-main**: DT red-on-revert proven for test/transport/node-address-resolution-contract.test.js [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T10-44-09-304Z.json]
- **listener-port-model-single-authority-main**: DT red-on-revert proven for test/helm/lagrange-node-admin-default-deny.test.js [dt:solve/changes/dt-prove/lagrange-node-admin-default-deny.test.js-2026-07-15T10-44-20-843Z.json]
- **listener-port-model-single-authority-main**: DT red-on-revert proven for test/config/configuration-manager.test.js [dt:solve/changes/dt-prove/configuration-manager.test.js-2026-07-15T10-56-07-958Z.json]
- **listener-port-model-single-authority-main**: DT red-on-revert proven for test/transport/node-address-resolution-contract.test.js [dt:solve/changes/dt-prove/node-address-resolution-contract.test.js-2026-07-15T10-56-17-337Z.json]
- **listener-port-model-single-authority-main**: DT red-on-revert proven for test/helm/lagrange-node-admin-default-deny.test.js [dt:solve/changes/dt-prove/lagrange-node-admin-default-deny.test.js-2026-07-15T10-56-28-084Z.json]
- **listener-port-model-single-authority-main**: Ingested evidence from listener-port-model-single-authority-2026-07-15T11-53-21-403Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-single-authority-2026-07-15T11-53-21-403Z.report.json]
- **listener-port-model-single-authority-main**: Ingested evidence from listener-port-model-single-authority-2026-07-15T11-53-21-403Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-single-authority-2026-07-15T11-53-21-403Z.report.json]
- **listener-port-model-single-authority-main**: Terminal child chain: config authority 93231438, runtime consumers f939981f, Helm and CLI surfaces 03d93e66, documentation and helpers b42734c7; every child exact and source aggregate received independent approval [git:b42734c7]
- **listener-port-model-single-authority-main**: Final umbrella scenario passed three consecutive fresh runs with all four guard files and 109 assertions green per run [test-output/reports/listener-port-model-single-authority-2026-07-15T11-53-21-403Z.report.json]
- **listener-port-model-single-authority-main**: Independent umbrella reconciliation rejected: admin CLI guide/help surfaces still targeted REST port 8080 and the umbrella guard did not cover them (rules out: closing the umbrella without a guard over every admin CLI help/documentation target) [subagent:listener-port-single-authority-umbrella-verifier]
- **listener-port-model-single-authority-main**: Independent verification rejected the umbrella attempt because uncovered admin CLI documentation/help contradicted the runtime default and the central contract overstated Helm authority sharing [subagent:listener-port-single-authority-umbrella-verifier]
- **listener-port-model-single-authority-main**: Ingested evidence from listener-port-model-single-authority-2026-07-15T12-14-34-127Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-single-authority-2026-07-15T12-14-34-127Z.report.json]
- **listener-port-model-single-authority-main**: Fifth child closure is terminal: listener-port-model-cli-guidance-gap exact replacement ee5e43969c5c3b9fbc09feff321479259056004c07a7b1c73056482cd1d9643e received independent exact and aggregate approval after the rejected bytes were replaced [subagent:listener-port-cli-guidance-verifier]
- **listener-port-model-single-authority-main**: Final umbrella scenario passed three consecutive fresh runs with all five guard files and 216 assertions green per run [test-output/reports/listener-port-model-single-authority-2026-07-15T12-13-31-002Z.report.json]
- **listener-port-model-single-authority-main**: Ingested evidence from listener-port-model-single-authority-2026-07-15T12-14-34-127Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-single-authority-2026-07-15T12-14-34-127Z.report.json]
- **listener-port-model-single-authority-main**: Independent final umbrella reconciliation passed: docs-only replacement 65beac959cf6f9c0755f12299f400222281323be03d991d1eb9fb2a85c97306a exactly matches the 1,838-byte central contract document; the document accurately distinguishes the canonical JavaScript listener-port module from Helm's centralized equivalent template-helper family; the four committed child boundaries plus the terminal CLI-guidance replacement ee5e43969c5c3b9fbc09feff321479259056004c07a7b1c73056482cd1d9643e are complete and independently approved; three recorded umbrella runs and one fresh verifier run pass all five guard files with 216 assertions, including direct coverage of every CLI guidance surface. (rules out: closing on the former four-guard harness, contradictory admin-port guidance, or overstating one cross-language derivation implementation) [subagent:listener-port-single-authority-umbrella-verifier]
- **listener-port-model-single-authority-main**: Ingested evidence from listener-port-model-single-authority-2026-07-15T12-19-03-547Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-single-authority-2026-07-15T12-19-03-547Z.report.json]
- **listener-port-model-single-authority-main**: Ingested evidence from listener-port-model-single-authority-2026-07-15T12-19-03-547Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/listener-port-model-single-authority-2026-07-15T12-19-03-547Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T11:56:49.059Z | listener-port-model-single-authority-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/listener-port-model-single-authority/attempt-1.diff |
| 2026-07-15T12:17:49.958Z | listener-port-model-single-authority-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/listener-port-model-single-authority/attempt-2.diff |
