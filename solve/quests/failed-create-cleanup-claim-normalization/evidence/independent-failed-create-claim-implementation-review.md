# Independent Implementation Review: `failed-create-cleanup-claim-normalization`

## Verdict

APPROVE

## Scope Reviewed

- Worktree: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103`
- Base Commit: `e8fd1cc6e6717a6321ece53873f60fdc5e70c31f`
- Quest: `solve/quests/failed-create-cleanup-claim-normalization/quest.json` (`ea22327f18ec86e264dd3a0f5a49bd5efc236be525e4a75c4b8b1032c9b6d42e`)
- Rule-Set Revision: 5 (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)

## Implementation Findings

1. Strict Non-Null Cleanup Token Precondition Restored:
   - `src/node/replica-handler-remove-request-methods.js` (`3a2872026dacd2040b23e452e37858a2d660e6b6d59a205bec59fc82bc7f528b`) restores `isFailedCreateCleanupToken(precondition.cleanup_token)` in `hasValidFailedCreateCleanupPrecondition`.
   - `src/rebalancer/operation-workflow-terminal-transition-repair.js` (`6e46364603fa783e8a82fe19272ff85e5774993060da9042d3ef8c0da2396522`) restores `isFailedCreateCleanupToken(precondition?.cleanup_token)` in `isTerminalFailedCreateCleanupRemove`.

2. Participant-Owned Single-Writer Claim Normalization:
   - `src/constants/messages.js` (`cc1cfc7819afd07eb8e625d7b6cfe9b0a2970519c3879e745a8496cb4956e426`) and `src/rebalancer/replica-operation-constants.js` (`fb9614c80e26364be25e62c3d26bc7a2b94531424fbaeabd207b3d6acbcc0cb3`) define `CLAIM_FAILED_CREATE_CLEANUP`.
   - `src/node/replica-handler-lifecycle-methods.js` (`527952fe7bcbb489e3c532394c73f323b647e421805bb0130d42561a489f1621`) and `src/node/replica-handler-failed-create-publication.js` (`dfa56ca8c46188af733174f05085c1c85ee5eca0971b6c000d065c7440b9c62b`) implement `handleClaimFailedCreateCleanup` / `claimTerminalFailedCreateTargetCleanup` under `ReplicaCreateAdmissionOwner.runExclusive(operationId)`, verifying the authoritative terminal `FAILED` operation row in `REPLICA_OPERATIONS` and claiming the exact `FAILED` generation via `ReplicaStateMachine.claimFailedCreateCleanup(precondition, buildFailedCreateCleanupToken(operationId))`.
   - `src/node/replica-handler-create-admission-methods.js` (`7417b995b418fa2f912c6ed0c9b326645b2a7c3fce72e64926c127a12a00ace3`) and `src/node/replica-create-admission-retained-recovery.js` (`d7a66b543a65f4860531cdcc74b72212f1fdf2fd36817f5dc5ecfc92b1ba7347`) opportunistically normalize unclaimed `FAILED` rows during late create replay (`terminalFailedCreateResponse`) and retained create admission recovery (`recoverRetainedCreateAdmissionRow`).

3. Coordinator Resolution and Rebalancer Claim Tracking:
   - `src/rebalancer/operation-workflow-replace-terminal-admission.js` (`125f921db8e7d3a6f1a80d64c90ba9bd7a98dac80399a7d17ceda1818b5cfc33`) requires `cleanup_token === expectedCleanupToken` in `matchesFailedCreatePreconditionTokens` and `matchesDelayedFailedCreateTargetPrecondition`, and normalizes unclaimed `FAILED` rows of terminal `FAILED` create operations via `deliverClaimFailedCreateCleanup` followed by an authoritative re-observation (`allowCacheFallback: false`).
   - `src/rebalancer/unified-rebalancer-failed-create-cleanup.js` (`11a8233655fe8af3bea039aa002ef0300bfe577e9d9154ae1e9f489ae28943ea`) records normalized non-null claims in `terminalFailedCreateTargetClaimByReplicaId` and `failedCreateTargetCleanupPreconditionByReplicaId`.

4. Test Coverage and Receipt Discipline:
   - `test/node/replica-failed-create-cleanup-generation.test.js` (`dd07fd1dbcc43749fa720f40ec91b570c5f4bf676b176182f91df0282c23acc9`), `test/rebalancer/terminal-failed-add-target-cleanup.test.js` (`e7d7228830bd1bdad76639b974eb1c9936add9fc0705fd934b3f0cc83d5bba96`), and `test/rebalancer/test-helpers.js` (`7f24e7e06963bdeb95e4fc686fb5d27b26d6a5232bc276e78e0e45dd76fc83c7`) cover both the strict non-null precondition enforcement and participant claim normalization.
   - `solve/quests/failed-create-cleanup-claim-normalization/evidence/receipt.json` (`62a7677d21bafbc855a48eff527a3c1aebf53564ae6597dcb93aacef3072a643`) remains `status: "fail"` prior to frozen proof.
