# Solve report: oci-runtime-host-contract-final

**Goal:** Phase 2 has one sealed Docker Compose OCI host-runtime contract: the existing node-local lifecycle owner route targets one authenticated, label-scoped host agent without exposing Docker Engine authority to Lagrange nodes; artifact, operation, network, failure, cleanup, production-binding, and downstream live-proof boundaries are explicit, while Kubernetes remains a separate provider milestone.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/oci-runtime-host-contract-final.json

**Attempts:** 5

## Links
- spec: solve/specs/service-portability-ladder/design.md#oci-provider-milestone
- parent quest: oci-runtime-host-contract
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 5
- Change bytes: 208895
- Owner areas: architecture, solve
- Categories: docs, workflow
- Split plan:
  - solve: 3 file(s)
  - architecture: 2 file(s)
- Signals: none

## Frontiers
- **oci-runtime-host-contract-final-main** [solved] rung 5, attempts 5, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **oci-runtime-host-contract-final-main**: Current shipped source remains an in-memory OciContainerDriver scaffold and capability evidence keeps realContainerActivation=false; this successor can close only the provider decision and must leave live engagement to C1. (rules out: Treating the decision Oracle, test-only Docker harness, or existing _prepared/_running maps as proof of a production container.) [source:src/runtime/oci-container-driver.js]
- **oci-runtime-host-contract-final-main**: The predecessor's two exact rejected attempts are retained as falsification evidence; the successor corrects the sealed C2 operation/outcome conflation and directly addresses the verifier's concurrency, stable-label, receipt-recovery, and nested-payload blockers. (rules out: Editing the sealed predecessor constraint or discarding its verifier rejections.) [quest:oci-runtime-host-contract]
- **oci-runtime-host-contract-final-main**: Independent verification rejected successor attempt 1: deadline-ambiguous Engine mutations lack a durable restart-safe per-resource fence and authoritative clearing transition; queued contention expiry is misclassified; logs lacks a time maximum; result applicability uses forbidden null sentinels; fresh ledger initialization is indistinguishable from lost state; and the Oracle mislabels agent-derived intentDigest as request identity. [subagent:c0_proof_surface]
- **oci-runtime-host-contract-final-main**: Ingested evidence from oci-runtime-host-contract-final.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/oci-runtime-host-contract-final.json]
- **oci-runtime-host-contract-final-main**: Independent verification rejected successor attempt 2: the Ed25519 bootstrap and quiescence paths are not closed or replay-safe, daemon-stop attestation does not prove all delegated mutation workers quiescent, bootstrap consumption is not external to the initialized ledger, same-operation joiners and nonce evidence are not fully bounded, pre-dispatch receipt state ordering is inconsistent, cleanup/already-absent schemas remain incomplete, and the Oracle must qualify C2 recovery as managed-instance/node recovery. [subagent:c0_proof_surface]
- **oci-runtime-host-contract-final-main**: Ingested evidence from oci-runtime-host-contract-final.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/oci-runtime-host-contract-final.json]
- **oci-runtime-host-contract-final-main**: Independent verification rejected successor attempt 3: pre-dispatch validation/absence branches do not atomically terminalize and clear the fence; completed-remove observation wording conflicts with label requirements; local enrollment snapshots are not rollback-evident and new enrollment is not causally gated by full old-incarnation retirement plus a fresh Engine data root; and replay-journal saturation can leave an unrecorded authenticated nonce dispatchable later. [subagent:c0_proof_surface]
- **oci-runtime-host-contract-final-main**: Ingested evidence from oci-runtime-host-contract-final.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/oci-runtime-host-contract-final.json]
- **oci-runtime-host-contract-final-main**: Model-rung applicability: this decision-only patch changes no executable model, architecture/contracts surface, runtime state machine, or source. The repository core-system contract model does not encode Docker host-local admission, TPM enrollment, or Engine effects, so running it cannot discriminate this contract; exact protocol-state review plus the Oracle and architecture audit are the applicable evidence. (rules out: Treating an unrelated topology/owner model pass as proof of this host-local protocol decision.) [model:architecture/contracts/core-system-logic.md]
- **oci-runtime-host-contract-final-main**: Independent verification rejected successor attempt 4: awaited pre-inspection can consume the deadline without a typed non-dispatch terminal/fence-clear branch; replay capacity check, nonce append, and saturated-key latch are not explicitly one serialized atomic transaction; and residualResources plus output-only intentDigest/dataBase64/status/boolean fields need exact named scalar encodings. [subagent:c0_architecture_contract]
- **oci-runtime-host-contract-final-main**: Independent exact verification approved successor attempt 5 as a total fail-closed host-runtime decision: the patch closes deadline-after-preinspection, atomic replay saturation, result scalar, fencing, quarantine, TPM enrollment/retirement, owner-route, operation/outcome, and selected_not_implemented invariants without source or model changes. [subagent:c0_proof_surface]
- **oci-runtime-host-contract-final-main**: Ingested evidence from oci-runtime-host-contract-final.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/oci-runtime-host-contract-final.json]

## Theories
- **theory-20260714-one-bounded-host-agent-receipt-owner** [active] system, mechanism One bounded host-agent receipt owner serializes resource effects, while a TPM-monotonic host-provisioning owner supplies rollback-evident enrollment/retirement generations; lifecycle desired state remains above both., owner Docker Compose host provisioning owner plus bounded host-agent receipt owner, modelGate npm run model:contracts
- **theory-20260714-attempt-2-made-safe-recovery-depend** [falsified] frontier, frontier oci-runtime-host-contract-final-main, layer protocol, mechanism Attempt 2 made safe recovery depend on new signed bootstrap and quiescence protocols whose own replay, external-consumption, and full-worker-quiescence contracts were unsealed; duplicate joins and result cleanup also escaped declared bounds., modelGate npm run model:contracts
- **theory-20260714-attempt-3-made-the-main-fence** [falsified] frontier, frontier oci-runtime-host-contract-final-main, layer protocol, mechanism Attempt 3 made the main fence safe but left non-dispatch inspection branches outside the terminal state table and treated a restorable local enrollment log plus a saturable nonce set as durable anti-replay authority., modelGate npm run model:contracts
- **theory-20260714-attempt-4-closed-recovery-and-enrollment** [supported] frontier, frontier oci-runtime-host-contract-final-main, layer protocol, mechanism Attempt 4 closed recovery and enrollment but left one post-await deadline predicate outside the non-dispatch table, did not explicitly serialize nonce capacity with nonce/latch persistence, and used shorthand rather than exact JSON scalar encodings for the last output fields., modelGate npm run model:contracts

## Selected Theories
- **oci-runtime-host-contract-final-main**: theory-20260714-attempt-4-closed-recovery-and-enrollment

## Theory Results
- **theory-20260714-attempt-2-made-safe-recovery-depend**: falsified (scenario=done, theory=falsified, movement=solved) [solve/oracle/oci-runtime-host-contract-final.json]
- **theory-20260714-attempt-3-made-the-main-fence**: supported (scenario=done, theory=supported, movement=solved) [solve/oracle/oci-runtime-host-contract-final.json]
- **theory-20260714-attempt-3-made-the-main-fence**: falsified (scenario=done, theory=falsified, movement=solved) [solve/oracle/oci-runtime-host-contract-final.json]
- **theory-20260714-attempt-4-closed-recovery-and-enrollment**: falsified (scenario=done, theory=falsified, movement=solved) [solve/oracle/oci-runtime-host-contract-final.json]
- **theory-20260714-attempt-4-closed-recovery-and-enrollment**: supported (scenario=done, theory=supported, movement=solved) [solve/oracle/oci-runtime-host-contract-final.json]
- **theory-20260714-attempt-4-closed-recovery-and-enrollment**: supported (scenario=done, theory=supported, movement=solved) [solve/oracle/oci-runtime-host-contract-final.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T18:59:46.496Z | oci-runtime-host-contract-final-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/oci-runtime-host-contract-final/attempt-1.diff |
| 2026-07-14T19:17:35.260Z | oci-runtime-host-contract-final-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/oci-runtime-host-contract-final/attempt-2.diff |
| 2026-07-14T19:29:57.404Z | oci-runtime-host-contract-final-main | widen-scope | 0 -> 0 | flat | solved | theory-20260714-attempt-2-made-safe-recovery-depend | diff:solve/changes/oci-runtime-host-contract-final/attempt-3.diff |
| 2026-07-14T19:42:38.594Z | oci-runtime-host-contract-final-main | model | 0 -> 0 | flat | solved | theory-20260714-attempt-3-made-the-main-fence | diff:solve/changes/oci-runtime-host-contract-final/attempt-4.diff |
| 2026-07-14T19:50:39.614Z | oci-runtime-host-contract-final-main | change-approach | 0 -> 0 | flat | solved | theory-20260714-attempt-4-closed-recovery-and-enrollment | diff:solve/changes/oci-runtime-host-contract-final/attempt-5.diff |
