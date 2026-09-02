# Transport / Delivery / Wake Semantics Verification

date: 2026-09-01
review: review-bed793daf9a46c5afcd45eb5
candidate: sha256:9ff24e4e856cedd0ed418ad3e19c2f11d15f2df3401289af71173331d8591518
template: docs/steering/verification-templates/transport-delivery.md

Scope checked: the post-approval delta in `src/partition/managed-merge-workflow.js`, `src/partition/managed-merge-workflow-topology-bindings.js`, `src/node/replica-recovery-service.js`, and regenerated shard/seal files. The candidate changes replica placement/recovery policy authority and a topology binding extraction; it does not change message-router delivery outcome contracts.

## Checklist

1. **ACK is not processed.** N/A. The delta does not consume router delivery outcomes and does not branch on `acknowledged`. Grep over the changed runtime files found no `acknowledged` or `noHandler` references. The recovery service passes `deliveryPriority: 'critical'` into control-plane system-table mutation options; it does not interpret that as proof of handler processing.

2. **Late responses.** N/A. The delta does not add or modify `SERVICE_RESPONSE` waiters, waiter retirement, late-honor paths, or ambiguous row-invisible redrive logic. Grep over the changed runtime files found no `SERVICE_RESPONSE` references.

3. **Outcome classification.** N/A. No new transport response shape is introduced. The changed files do not call or modify `classifyTransportDeliveryOutcome`, `deferRetry`, or `retryAfterMs` handling.

4. **Undeliverable never hangs.** N/A. The delta does not introduce a missing-handler/no-connection await path. `managed-merge-workflow-topology-bindings.js` preserves the pre-existing inert `deliverReplicaRemoval` fallback shape as `async () => null`, and the recovery scanner refactor triggers control-plane gateway mutations rather than message-router delivery waits.

5. **Stub fidelity.** N/A. The delta does not add or change message-router stubs. The relevant tests use recovery gateway fixtures and merge topology callbacks; they do not stub router delivery semantics or need `createContractMessageRouterStub`.

Template verdict: no transport-delivery finding. The overall delta verdict is recorded in `solve/evidence/behaviour-changing-consumer-convergence.verifier-verdict.md`; it rejects the delta for a stale generated `test/shards/impact-graph-seal.json`, not for transport-delivery behavior.
