# Independent Verification: `scaleByMachineFactor` Import Specifier Fix

- **Verdict**: `APPROVE`
- **Verifier**: `subagent:b53f502d-cb6d-4d3b-b17c-9e51dbbbcf82`
- **Worktree / Base Commit**: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103` at `3ef020d0328c07afb9ed608fb78229c79acfba87`
- **Rule-Set Revision**: 5 (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)

## Exact SHA-256 Verification

All 5 modified test/helper files import `scaleByMachineFactor` from `scripts/test-machine-factor.js` (`../../../scripts/test-machine-factor.js` or `../../scripts/test-machine-factor.js` relative to each file's directory) with zero production changes:

- `1572dd597751fff6262836572ed6b19cf3925c6a6704fe26669ce4b818daf67d  test/raft/raft-rs-backend/single-path-partition-cutover.test.js`
- `68168f983ae4ddcb95aefaf424856149340b67903f9af6eeb34fe7d999aa9101  test/test-helpers/seed-release-failure-custody-fixture.js`
- `014f1bb2b49b3d5442fcaaab6e2ae3032a941dbddc8f09c2de821419aab160eb  test/bootstrap/retained-seed-original-handoff.integration.test.js`
- `a543c476b7dc1d2c9add28d4133c7adb204bb9b9c8fcdc2dac6ca60242128cfa  test/bootstrap/fresh-seed-activation.integration.test.js`
- `3affe2a79156164db0b8616e669ffc64edfb988e603cd2a0cc3141c4dc813993  test/integration/critical-replica-placement-causal-trace.integration.test.js`
