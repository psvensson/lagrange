# Solve report: oci-container-driver-live-activation

**Goal:** A normal digest-pinned OCI installation traverses shipped seed and join composition to an authenticated Docker host agent, which pulls, creates, starts, inspects, stops, and removes the exact fully labelled real container; security, receipt/fence, identity, and configuration failures are typed fail-closed, no managed resource remains, and realContainerActivation is true only after live engagement proof.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 8

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r4--real-oci-supervision
- plan: solve/specs/service-portability-ladder/tasks.md

## Current Blocker
- Frontier: oci-container-driver-live-activation-durable-state
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: unknown -> unknown
- Latest evidence: test-output/reports/oci-container-driver-live-activation/oci-host-agent-durable-state-2026-07-15T05-53-53-469Z.report.json
- Selected theory: none
- Next move: continue supervised step for oci-container-driver-live-activation-durable-state
- No longer current: unknown

## Continuation
- Status: allowed
- Next action: continue supervised step for oci-container-driver-live-activation-engine-translation
- Blocker: none

## Scope Pressure
- Changed files: 17
- Change bytes: 179154
- Owner areas: scripts/checks, src/runtime, test/runtime
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (17 files)
- Action: land or separate 3 owner areas: scripts/checks, src/runtime, test/runtime
- Split plan:
  - src/runtime: 11 file(s)
  - test/runtime: 5 file(s)
  - scripts/checks: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **oci-container-driver-live-activation-protocol-admission** [solved] rung 5, attempts 6, metric 1 -> 0 — exact terminal source attempt was rejected
- **oci-container-driver-live-activation-durable-state** [solved] rung 2, attempts 2, metric 0 -> 0
- **oci-container-driver-live-activation-engine-translation** [open] rung 0, attempts 0, metric ? -> ?
- **oci-container-driver-live-activation-owner-handoff** [open] rung 0, attempts 0, metric ? -> ?
- **oci-container-driver-live-activation-production-engagement** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **oci-container-driver-live-activation-protocol-admission**: attempt 1 permits caller-supplied key identity, stop grace beyond remaining deadline, unrelated create residual provenance, and already_applied inspect [subagent:c0_architecture_contract]
- **oci-container-driver-live-activation-protocol-admission**: attempt 2 accepts completion exactly at deadline and wrong response intentDigest, while throwing enrolled-key getters escape an untyped secret-bearing error [subagent:verify_protocol_attempt_2]
- **oci-container-driver-live-activation-protocol-admission**: attempt 3 classifies malformed enrolled cluster/node identity strings as authentication_failed instead of typed key_unavailable [subagent:verify_protocol_attempt_3]
- **oci-container-driver-live-activation-protocol-admission**: attempt 4 accepts proxy, accessor-backed, symbol-extended, and non-enumerably extended enrolled key records instead of typed key_unavailable [subagent:verify_protocol_attempt_4]
- **oci-container-driver-live-activation-protocol-admission**: Ingested evidence from oci-host-agent-protocol-admission-2026-07-14T21-06-14-447Z.report.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T21-06-14-447Z.report.json]
- **oci-container-driver-live-activation-protocol-admission**: Ingested evidence from oci-host-agent-protocol-admission-2026-07-14T21-27-31-164Z.report.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T21-27-31-164Z.report.json]
- **oci-container-driver-live-activation-protocol-admission**: Independent verification passed: exact artifact reconstruction matches all six files, focused and scenario suites pass, red-on-revert fails for the intended hostile-meta-shape mechanism, and all prior admission rejection classes remain closed. [subagent:verify_protocol_attempt_5]
- **oci-container-driver-live-activation-protocol-admission**: Checkpoint exposes a Solver scope/identity contradiction: cumulative scope admission forced the same-base approved supersession artifact to 21,847 incremental bytes, but checkpoint canonicalSourceDelta re-hashes the complete six-path base-to-worktree snapshot as sha256:10579b54883dcb179136ca26425286f663ba7034ee80c1504567eccb761db0b9 and rejects it as different from the unchanged approved sha256:0a11a48adbf496edf65e7c8a666461d752cbab89ebfb34d35f75d6dfb3b03d4f. A canonical replacement cannot be recorded because the first four immutable attempt payloads already consume 240,238 of the 262,144-byte direct precommit cap. [command:solve-checkpoint+sha256sum+canonicalSourceDelta]
- **oci-container-driver-live-activation-protocol-admission**: Ingested evidence from oci-host-agent-protocol-admission-2026-07-15T04-50-46-864Z.report.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T04-50-46-864Z.report.json]
- **oci-container-driver-live-activation-protocol-admission**: Independent exact verification passed: the full six-path artifact equals the canonical base-to-worktree delta, focused and scenario suites pass, the hostile meta-shape red check is non-vacuous, and all prior rejection classes remain closed. [subagent:verify_protocol_attempt_6]
- **oci-container-driver-live-activation-protocol-admission**: Ingested evidence from oci-host-agent-protocol-admission-2026-07-15T04-51-36-566Z.report.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T04-51-36-566Z.report.json]
- **oci-container-driver-live-activation-protocol-admission**: Ingested evidence from oci-host-agent-protocol-admission-2026-07-15T05-18-19-821Z.report.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T05-18-19-821Z.report.json]
- **oci-container-driver-live-activation-durable-state**: The sealed durable-state symptom reproduces on current HEAD: both receipt/fence/nonce recovery and TPM-monotonic enrollment guard files fail because no production durable substrate exists. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-durable-state-2026-07-15T05-10-10-067Z.report.json]
- **oci-container-driver-live-activation-durable-state**: Ingested evidence from oci-host-agent-durable-state-2026-07-15T05-51-13-448Z.report.json. Metric: unknown -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-durable-state-2026-07-15T05-51-13-448Z.report.json]
- **oci-container-driver-live-activation-durable-state**: Ingested evidence from oci-host-agent-durable-state-2026-07-15T05-53-53-469Z.report.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/oci-container-driver-live-activation/oci-host-agent-durable-state-2026-07-15T05-53-53-469Z.report.json]
- **oci-container-driver-live-activation-durable-state**: Independent exact verification approved the complete 13-path durable-state snapshot: canonical artifact identity, 4/4 scenario guards, 46 focused assertions, model/static owner checks, and adversarial admission, recovery, fence, TPM, and enrollment review all passed with no blocking defect. [subagent:verify_durable_attempt_7]

## Theories
- **theory-20260714-enrollment-ingress-normalization** [active] system, mechanism raw_enrolled_record_meta_shape_trust, owner oci_host_agent_enrollment_admission, modelGate npm run model:contracts
- **theory-20260714-enrolled-identity-schema-gap** [supported] frontier, frontier oci-container-driver-live-activation-protocol-admission, layer protocol, mechanism enrolled_identity_schema_gap, owner oci_host_agent_request_admission, boundary enrolled_key_lookup, modelGate npm run model:contracts
- **theory-20260714-enrolled-record-ordinary-data** [falsified] frontier, frontier oci-container-driver-live-activation-protocol-admission, layer protocol, mechanism raw_enrolled_record_meta_shape_trust, owner oci_host_agent_enrollment_admission, boundary enrolled_key_resolver_result_normalization, modelGate npm run model:contracts
- **theory-20260715-canonical-snapshot-identity** [supported] frontier, frontier oci-container-driver-live-activation-protocol-admission, layer observation, mechanism same_base_canonical_snapshot_identity, owner solver_checkpoint_identity, boundary protocol_admission_checkpoint, modelGate npm run model:contracts

## Selected Theories
- **oci-container-driver-live-activation-protocol-admission**: theory-20260715-canonical-snapshot-identity

## Theory Results
- **theory-20260714-enrolled-identity-schema-gap**: falsified (scenario=done, theory=falsified, movement=no_evidence) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T20-41-11-621Z.report.json]
- **theory-20260714-enrolled-identity-schema-gap**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T20-41-11-621Z.report.json]
- **theory-20260714-enrolled-record-ordinary-data**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T21-06-14-447Z.report.json]
- **theory-20260714-enrolled-record-ordinary-data**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T21-27-31-164Z.report.json]
- **theory-20260714-enrolled-record-ordinary-data**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-14T21-27-31-164Z.report.json]
- **theory-20260715-canonical-snapshot-identity**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T04-50-46-864Z.report.json]
- **theory-20260715-canonical-snapshot-identity**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T04-50-46-864Z.report.json]
- **theory-20260715-canonical-snapshot-identity**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T04-51-36-566Z.report.json]
- **theory-20260715-canonical-snapshot-identity**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/oci-container-driver-live-activation/oci-host-agent-protocol-admission-2026-07-15T05-18-19-821Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T20:20:51.043Z | oci-container-driver-live-activation-protocol-admission | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/oci-container-driver-live-activation/attempt-1.diff |
| 2026-07-14T20:28:00.737Z | oci-container-driver-live-activation-protocol-admission | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/oci-container-driver-live-activation/attempt-2.diff |
| 2026-07-14T20:34:44.278Z | oci-container-driver-live-activation-protocol-admission | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/oci-container-driver-live-activation/attempt-3.diff |
| 2026-07-14T20:41:30.723Z | oci-container-driver-live-activation-protocol-admission | widen-scope | 0 -> 0 | flat | no_evidence | theory-20260714-enrolled-identity-schema-gap | diff:solve/changes/oci-container-driver-live-activation/attempt-4.diff |
| 2026-07-14T21:28:09.612Z | oci-container-driver-live-activation-protocol-admission | model | 0 -> 0 | flat | solved | theory-20260714-enrolled-record-ordinary-data | diff:solve/changes/oci-container-driver-live-activation/attempt-5.diff |
| 2026-07-15T04:50:46.870Z | oci-container-driver-live-activation-protocol-admission | change-approach | 0 -> 0 | flat | solved | theory-20260715-canonical-snapshot-identity | diff:solve/changes/oci-container-driver-live-activation/attempt-6.diff |
| 2026-07-15T05:52:52.684Z | oci-container-driver-live-activation-durable-state | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/oci-container-driver-live-activation/attempt-7.diff |
| 2026-07-15T05:59:08.535Z | oci-container-driver-live-activation-durable-state | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/oci-container-driver-live-activation/attempt-7.diff |
