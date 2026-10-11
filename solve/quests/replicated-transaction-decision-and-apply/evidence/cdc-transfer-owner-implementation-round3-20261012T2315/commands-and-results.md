# PO-5 commands and results

Working directory:
`/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

Selected executable: `/tmp/cdc-node-cap-20261012/node`, SHA-256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.

## Retained and new adversarial schedules

```sh
/tmp/cdc-node-cap-20261012/node --expose-gc \
  solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-round3-20261012T2315/owner-counterexamples.mjs
/tmp/cdc-node-cap-20261012/node \
  solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-round3-20261012T2315/descriptor-boundaries.mjs
/tmp/cdc-node-cap-20261012/node \
  solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-round3-20261012T2315/capture-reentry.mjs
```

All commands exit 0. The first reports ten PASS observations. The descriptor
program refuses all nine invalid boundaries. The capture program reports
eleven PASS schedules and writes structured `capture-reentry.json`.

## Registered tests

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
```

Exit 0: one file, 171 assertions (`selected-runtime-test.txt`).

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js \
  test/cdc/cdc-coverage-reconcile-owner.test.js \
  test/cdc/cdc-authoritative-coverage-reconciliation.test.js \
  test/partition/partition-cdc-source-coverage.test.js \
  test/integration/cdc-coverage-rejoin-formation.integration.test.js
```

Exit 0: five files, 495 assertions (`cumulative-owner-tests.txt`).

## Static and metadata checks

```sh
npx eslint src/cdc/cdc-coverage-transfer-owner.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
npm run audit:impact-contracts
npm run audit:shards
```

All exit 0. Impact contracts report 59 contracts and 30 coupled pairs. Shards
report 2,349 tests, 22 subsystems and current generated metadata.

Whitespace was checked against the round-two preserved Git object for each
changed untracked file with `git diff --check --no-index`; each returned the
expected diff status 1 with no whitespace diagnostic. The tracked metadata
check returned 0. `diff-check.txt` records the result.
