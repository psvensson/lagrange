# How to register a cross-boundary interaction witness (read-only finding, 2026-11-21)

Source: a read-only helper of the stopped W1 writer; paths relative to the repository root. Not executed.

- `test/shards/impact-contracts.json`: keys `contracts` and `coupledPairs` (71 pairs). A pair needs a matching
  entry in `contracts`. Pair shape: `description`, exactly two `endpoints` (`id`, non-empty `owners`), `contract`,
  `witnessTests`; optional `harnessSeam`. Closest model: `committed-node-floor-and-retained-wake` (contract
  `serve-eligibility-committed-epoch`); also `priority-services-row-publication-census`.
- Nothing covers `src/raft/replica-leadership-state.js` or `src/rebalancer/replica-placement-owner-transport.js`
  today; the retained-repair files are covered only by `replica-operation-state` (stems
  `src/rebalancer/replica-operation-`, `operation-workflow`). A new contract plus the pair is needed.
- Validator: `scripts/checks/impact-contract-registry.js` via `npm run audit:impact-contracts` (in `test:static`
  and `scripts/check-fast-static.js`). Rules: live repo-relative paths (a path without trailing `/` may be a stem
  prefix); two endpoints whose owners do not cover each other; every endpoint owner covered by the contract's
  `owners`; each witness an exact `.test.js` listed in `test/shards/primary-classes.json` and in the contract's
  `tests`. The harness test `test/distributed/harness/__tests__/owner-interaction-model.test.js` imports every
  owner module. `scripts/solve/guards.js:221-260` blocks landing on an incomplete edge.
- Selection: the quest proof cone (`scripts/select-proof-cone.js`) selects a pair's witnesses when either endpoint
  is touched; `npm test` selection (`scripts/select-change-tests.js`) selects the CONTRACT's `tests` by owner
  prefix, and for a pair adds the opposite endpoint's subsystem, not its witness tests. So the witness must be in
  the contract's `tests`.
- Side effects: `src/raft/` is a core-metadata prefix (a producer change forces the full suite in the cone
  selector anyway); `impact-contracts.json` is a selector self-path, so the commit that adds a pair selects the
  whole corpus.
- Nothing is generated from `impact-contracts.json`. The pre-commit hook does NOT run `audit:impact-contracts`:
  run it explicitly.
- Pre-commit hook (`.githooks/pre-commit:145-200`): when staged files touch `src/`, `scripts/` or `test/` it runs
  `generate-global-owner-debt-inventory.js`, `generate-priority-recovery-owner-inventory.js`,
  `npm run -s test:metadata:refresh`, `generate-source-owner-index.js --write` and stages the results; it refuses
  with unstaged or untracked files under those directories. This is the heavy local job that locked the
  workstation when five writers committed at once; it must run under the shared local-heavy lock, one at a time.
- Conventions: `docs/development/verification-templates/owner-interaction.md` (item 10): the registry entry goes
  in the same product Quest as the owner change; contract, model and witness change together.
