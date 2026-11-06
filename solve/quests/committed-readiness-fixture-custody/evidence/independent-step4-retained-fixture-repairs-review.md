# Independent Verification: Follow-Up Test Fixture and Machine-Factor Timeout Adjustments

- **Verdict**: `APPROVE`
- **Verifier**: `subagent:b53f502d-cb6d-4d3b-b17c-9e51dbbbcf82`
- **Worktree / Base Commit**: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103` at `af6c25132afd193494cf2ed9ff709f3cb6cfa338`
- **Rule-Set Revision**: 5 (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)

---

## 1. Exact SHA-256 Verification of Modified Files

Zero production (`src/`) files are modified. The 7 modified test/helper files and their SHA-256 digests are:
- `5fca9a0e9a4136d75e386d6cba40a23604ece87f0cf1da2c4f6eae7eeb6903d2  test/rebalancer/test-helpers.js`
- `4ff87071e5665ad2411cdd18844119252228794544674213ad1c03dc020d010d  test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js`
- `dbd01c7450901cf4184cd95087e3e65ab28f0a723af2428abfb08db331e8cb2b  test/raft/raft-rs-backend/single-path-partition-cutover.test.js`
- `e86e0f316576bd84d9f409b89fec7292434ec08eafbe6d66f080270307263657  test/test-helpers/seed-release-failure-custody-fixture.js`
- `7e9e3d72fad48010d943ac0b70ac9571ca3731b7827d80f983448e51c4fd1100  test/bootstrap/retained-seed-original-handoff.integration.test.js`
- `32aedd08c2fa85157cf8e01f21517086c368f052c79b02613288e7ec9db0955f  test/bootstrap/fresh-seed-activation.integration.test.js`
- `a8e4068c391b792a87e6abc101d1c155e39379c80754b5c686f6202b8f1060d2  test/integration/critical-replica-placement-causal-trace.integration.test.js`

---

## 2. Verification of Checklist Items

1. **`test/rebalancer/test-helpers.js` (`5fca9a0e9a4136d75e386d6cba40a23604ece87f0cf1da2c4f6eae7eeb6903d2`)**:
   - Extracts `matchesFixtureClaimOperationTarget(operation, payload)` (lines 505-510) from `isFixtureClaimOperationTerminalFailed(operation, payload, precondition)` (lines 512-524) with zero semantic change, reducing cyclomatic complexity below 12 so whole-tree `npm run test:complexity` satisfies `1719/1719` (`BASELINE_COUNT = 1719`).

2. **`test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js` (`4ff87071e5665ad2411cdd18844119252228794544674213ad1c03dc020d010d`)**:
   - Aligns `definition()` and `createProductionPlacementFixture()` with the canonical definition-authority contract from `04459151a`: derives `BINDING_VERSION_ID`, `SERVICE_ID`, and `bindingDigest = deriveBindingDeclarationDigest(declaration)`, sets `status: 'active'` on `definitionRow`, and supplies `controlPlaneSystemTableGateway.readAuthoritativeRows` returning `[definitionRow]` for `SERVICE_ID`.

3. **Machine-Factor Timeout and Seed-Release Budget Scaling (`scaleByMachineFactor`)**:
   - `test/raft/raft-rs-backend/single-path-partition-cutover.test.js` (`dbd01c7450901cf4184cd95087e3e65ab28f0a723af2428abfb08db331e8cb2b`): applies `{timeout: scaleByMachineFactor(SEED_TEST_TIMEOUT_MS)}` and `leadershipWaitTimeoutMs: scaleByMachineFactor(12000)` on the seed bootstrap subtest.
   - `test/test-helpers/seed-release-failure-custody-fixture.js` (`e86e0f316576bd84d9f409b89fec7292434ec08eafbe6d66f080270307263657`): sets `const SEED_RELEASE_BUDGET_MS = scaleByMachineFactor(15000);`.
   - `test/bootstrap/retained-seed-original-handoff.integration.test.js` (`7e9e3d72fad48010d943ac0b70ac9571ca3731b7827d80f983448e51c4fd1100`): keeps `const TEST_TIMEOUT_MS = 180000;` literal for static AST extraction and passes `{timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}` to all `test(...)` declarations.
   - `test/bootstrap/fresh-seed-activation.integration.test.js` (`32aedd08c2fa85157cf8e01f21517086c368f052c79b02613288e7ec9db0955f`): keeps `const TEST_TIMEOUT_MS = 240000;` literal for static AST extraction and passes `{timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}` to all `test(...)` declarations.
   - `test/integration/critical-replica-placement-causal-trace.integration.test.js` (`a8e4068c391b792a87e6abc101d1c155e39379c80754b5c686f6202b8f1060d2`): removes the 2s `leadershipWaitTimeoutMs: 2000` override so `TEST_CONFIG.bootstrap`'s standard `15000ms` leadership wait applies, and passes `{timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}` to `test('critical placement causal trace', ...)`.
