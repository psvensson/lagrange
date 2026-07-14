# Solve report: service-control-transport-decision

**Goal:** Phase 1 service lifecycle mutations have one selected authenticated transport, one named security boundary, and one owner-preserving route that the CLI and downstream install Quests must consume.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/service-control-transport-decision.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/design.md#control-transport
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 2
- Change bytes: 6227
- Owner areas: architecture
- Categories: docs
- Split plan:
  - architecture: 2 file(s)
- Signals: none

## Frontiers
- **service-control-transport-decision-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **service-control-transport-decision-main**: Independent adversarial review found no decision-blocking contradiction: live PG wire owns TLS and credential ingress, admin external binding remains explicitly insecure, the contract separates generic query authorization from future lifecycle-specific authorization and security-context propagation, and downstream implementation remains gated on bounded Quest declarations. [subagent:verify_s0_transport_decision]
- **service-control-transport-decision-main**: Independent terminal-handoff review rejected completeness: the conservative handoff scope excludes the new decision oracle and shared Phase 1 design/tasks edits, so those three Quest-scoped evidence and planning paths must be persisted in a narrow companion commit before the terminal handoff. [subagent:verify_s0_transport_decision]
- **service-control-transport-decision-main**: Follow-up independent verification TRUSTED terminal completeness after companion commit ce6e2dd5: the decision oracle and Phase 1 design/tasks are durable in HEAD, and the remaining scope-safe handoff contains the architecture contract plus complete Quest attempt/log/report artifacts. [subagent:verify_s0_transport_decision]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T09:35:01.549Z | service-control-transport-decision-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/service-control-transport-decision/attempt-1.diff |
