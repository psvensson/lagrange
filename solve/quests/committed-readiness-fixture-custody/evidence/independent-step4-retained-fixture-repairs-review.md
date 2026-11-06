# Independent Review: Step 4 Retained Source-Cone Fixture and Host-Factor Repairs

## Verdict

APPROVE

## Scope Reviewed

- Worktree: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103`
- Base Commit: `6317f224bf356aa390af83f64bb34ff855264025`
- Quest: `committed-readiness-fixture-custody` (`16585233eecd880b75f10e9e60a8689d7cdd8f2058c58ef207223ed26c82dc05`)
- Rule-Set Revision: 5 (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)

## Findings

1. Zero Production Changes:
   No files under `src/` are modified. All changes are strictly bounded to test/helper fixtures and epic progress documentation.

2. Explicit Single-Node RF1 Seed Fixture Configuration:
   - `test/integration/helpers/cluster-test-helpers.js` (`a0b4daa3c4499fce8c43f9dbe63e4585a88d7c9e5f5ef9a90a96e0d9c00727c0`) forwards `options.partition` to `ConfigurationManager.getInstance().initialize(...)` only when explicitly provided.
   - `test/raft/raft-rs-backend/single-path-partition-cutover.test.js` (`569d9a0698fcca62e2e53d98c0fb980b604e9957a655c972ae840a1de5a00fef`), `test/integration/seed-migration-cutover-persisted.integration.test.js` (`89223ae6cdaef266b05086e5ef34422034fbdb0a76e804eeb197b41be01a5ea6`), and `test/test-helpers/fresh-seed-activation-public-child.js` (`6989d1f01309c230c578802232de2a567892d66a1b0e8d6d3bd657b8a131ae4a`) explicitly declare `partition: {defaultReplicaCount: 1}` for single-node seed tests while preserving default RF3 production semantics.

3. Owner-Clock Committed Readiness Fixture in `replace-source-removal-owner.test.js`:
   - `test/rebalancer/replace-source-removal-owner.test.js` (`776ffa1617f992fa24c3d91146a3fd621102926f23b063aefe71283aef5226a8`) passes `readinessFixture` with `now: () => Date.now() + clock.offsetMs` and committed active/ready node rows for `SOURCE_NODE_ID`, `TARGET_NODE_ID`, and `PEER_NODE_ID` through the single fixture construction owner (`createMockControlPlaneReadinessService`).

4. Causal Trace Readiness Port and E1 Deferred-Provisioning Alignment:
   - `test/integration/critical-replica-placement-causal-trace.integration.test.js` (`820b5d48be45105e0f1d6c3fb5759d1eb561f22d3309b03800bf553f5bcb9ba5`) wires `controlPlaneReadinessService: bootstrapService.controlPlaneReadinessService` into `SQLQueryEngine`, accepts either immediate creation or the E1 deferred initial-provisioning envelope (`contractState === 'deferred' && errorCode === 'PROVISIONING_UNAVAILABLE'`), and checks `row.table_name === CONTROL_TABLE_NAME || row.table_id === CONTROL_TABLE_NAME` when locating the provisioned partition row.

5. Host-Factor Suite Timeout Scaling in `membership-consistency.integration.test.js`:
   - `test/integration/membership-consistency.integration.test.js` (`e1a28b478ab1df3be912447f21a1277591b6f2bba6c2d2b18c0c58694a2c3e89`) scales its existing `240000` reference suite timeout via `scaleByMachineFactor(SUITE_TIMEOUT_MS)` in the AST-resolvable form required by `scripts/checks/test-timeout-declarations.js` without changing any internal protocol bounds or subtest assertions.
