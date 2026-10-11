# Corrected transfer-owner commands and results

Working directory:
`/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

Selected executable:
`/tmp/cdc-node-cap-20261012/node`, SHA-256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
`selected-runtime.txt` records Node 22.22.0, V8 12.4.254.21-node.33,
libuv 1.51.0, Linux x64.

## Reviewer counterexamples

The two round-one diagnostic programs were copied byte-for-byte into this
directory before execution. Their hashes are in `packet-sha256.txt`.

```sh
/tmp/cdc-node-cap-20261012/node --expose-gc \
  solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-round2-20261011T2255/owner-counterexamples.mjs
/tmp/cdc-node-cap-20261012/node \
  solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-round2-20261011T2255/descriptor-boundaries.mjs
```

Both exit 0. All ten owner observations print `PASS`. The descriptor lattice
refuses NaN, infinities, negative, unsafe, boxed and string numbers, negative
zero, and a descriptor with no own fields. Full structured results are
`counterexamples.json` and `descriptor-boundaries.json`.

## Focused and cumulative tests

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
```

Exit 0: one file, 114 assertions. Output: `selected-runtime-test.txt`.

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js \
  test/cdc/cdc-coverage-reconcile-owner.test.js \
  test/cdc/cdc-authoritative-coverage-reconciliation.test.js \
  test/partition/partition-cdc-source-coverage.test.js \
  test/integration/cdc-coverage-rejoin-formation.integration.test.js
```

Exit 0: five files; 438 assertions. Output: `cumulative-owner-tests.txt`.

## Static and generated metadata

```sh
npx eslint src/cdc/cdc-coverage-transfer-owner.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
npm run audit:impact-contracts
npm run audit:shards
```

ESLint and impact contracts pass. The first shard audit found that the
cumulative Quest's generated subsystem census omitted 11 already present
tests, including this transfer-owner test. Its exact failed output is retained
as `shards.txt`. The existing metadata owner was refreshed with:

```sh
node scripts/generate-test-subsystem-classes.js
npm run audit:shards
```

The refreshed audit passes for 2,349 tests and 22 subsystems; output is
`shards-after-refresh.txt`. No primary/resource/impact registry change was
needed. The generated subsystem file is part of this review subject.

```sh
git diff --check -- \
  src/cdc/cdc-coverage-transfer-owner.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js \
  test/shards/subsystem-classes.json
```

Exit 0 with empty output in `diff-check.txt`.

