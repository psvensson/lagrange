# Solve report: service-cli-pg-runtime-dependency-v2

**Goal:** The package manifest and lockfile declare pg as a production dependency required by the shipped lagrange service lifecycle CLI, while preserving every existing binary, script, dependency version, and package contract.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-51-07-296Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 4
- Change bytes: 16990
- Owner areas: package-lock.json, package.json, scripts/checks, test/packaging
- Categories: other, test, workflow
- Action: land or separate 4 owner areas: package-lock.json, package.json, scripts/checks, test/packaging
- Split plan:
  - package-lock.json: 1 file(s)
  - package.json: 1 file(s)
  - scripts/checks: 1 file(s)
  - test/packaging: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-cli-pg-runtime-dependency-v2-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-cli-pg-runtime-dependency-v2-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-51-07-296Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-51-07-296Z.report.json]
- **service-cli-pg-runtime-dependency-v2-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-51-07-296Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-51-07-296Z.report.json]
- **service-cli-pg-runtime-dependency-v2-main**: independent exact verification passed for the uncontaminated four-path package-and-proof patch, unchanged dependency artifacts, production-only npm closure, three green scenarios, and both red controls [subagent:phase1_s5a_preflight]
- **service-cli-pg-runtime-dependency-v2-main**: package-lock.json is the declarative dependency-graph contract: exact recursive comparison proves only pg production classification changed while all version, resolution, integrity, binary, script, export, engine, and other dependency values remained invariant [contract:package-lock.json#node_modules/pg]
- **service-cli-pg-runtime-dependency-v2-main**: the immutable attempt fails the repository quote-props commit hook; the one-line corrected live proof file has different approved bytes and requires a same-base replacement receipt [subagent:phase1_s5a_preflight]
- **service-cli-pg-runtime-dependency-v2-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-54-34-785Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-54-34-785Z.report.json]
- **service-cli-pg-runtime-dependency-v2-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-54-34-785Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-54-34-785Z.report.json]
- **service-cli-pg-runtime-dependency-v2-main**: independent replacement verification passed for same-base rejection supersession, exact four-path live content, clean pre-commit hook, production-only pg closure, three green scenarios, and red controls [subagent:phase1_s5a_preflight]
- **service-cli-pg-runtime-dependency-v2-main**: package-lock.json is the declarative dependency-graph contract: exact recursive comparison proves only pg production classification changed while every version, resolution, integrity, binary, script, export, engine, and other dependency value remained invariant [contract:package-lock.json#node_modules/pg]
- **service-cli-pg-runtime-dependency-v2-main**: independent aggregate verification rejected sha256:c2c8aded29dc874e448711acfae5f7b4dae8e6f626d83199ab0bfcc97f103ed7 because Solver omitted package-lock.json from source scope; the true sealed four-path aggregate is sha256:f9e3563dd27e1ec1122ec0e7ca6b4163cc47e5c5b32c8e1cec4cb966b894c7cd [subagent:phase1_s5a_preflight]
- **service-cli-pg-runtime-dependency-v2-main**: independent corrected aggregate verification passed for exactly four dependency-and-proof paths, resolved rejected attempt, matching checkpoint, no unrelated or S5c paths, and preserved dependency invariants [subagent:phase1_s5b_preflight]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T15:50:28.779Z | service-cli-pg-runtime-dependency-v2-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-cli-pg-runtime-dependency-v2/attempt-1.diff |
| 2026-07-14T15:54:01.204Z | service-cli-pg-runtime-dependency-v2-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/service-cli-pg-runtime-dependency-v2/attempt-2.diff |
