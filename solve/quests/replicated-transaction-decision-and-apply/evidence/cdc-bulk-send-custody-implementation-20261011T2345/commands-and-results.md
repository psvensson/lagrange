# Commands and results

All commands ran in `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011` against the exact files in `source-sha256.txt`.

## Focused and cumulative behavior

```sh
node scripts/run-classified-test-files.js \
  test/transport/bulk-transfer-lane-isolation.test.js \
  test/transport/bulk-channel-identify-incarnation.test.js \
  test/transport/bulk-registry-bootstrap.test.js \
  test/raft/bulk-transfer-socket-adapter.test.js \
  test/raft/snapshot-multichunk-transfer.test.js \
  test/raft/snapshot-offer-router.test.js \
  test/raft/snapshot-transfer-protocol.test.js \
  test/raft/snapshot-dispatcher-wiring.test.js \
  test/raft/snapshot-recorded-gaps.test.js
```

Result: exit 0; 9 files passed; 305 assertions. Exact output: `focused-tests.txt`.

## Declared diff quality gates

```sh
npx eslint \
  src/constants/transport.js \
  src/raft/bulk-connection-transfer-socket.js \
  src/transport/bulk-transfer-channel.js \
  src/transport/inproc-transport.js \
  test/raft/bulk-transfer-socket-adapter.test.js \
  test/raft/snapshot-recorded-gaps.test.js \
  test/transport/bulk-channel-identify-incarnation.test.js \
  test/transport/bulk-transfer-lane-isolation.test.js
```

Result: exit 0. Exact output: `eslint.txt`.

```sh
npm run test:complexity:scoped -- \
  src/transport/bulk-transfer-channel.js \
  src/transport/inproc-transport.js \
  src/raft/bulk-connection-transfer-socket.js \
  src/constants/transport.js
npm run test:complexity:cognitive:scoped -- <same four files>
```

Result: exit 0; zero cyclomatic and cognitive violations. Exact outputs: `complexity.txt`, `cognitive-complexity.txt`.

```sh
node scripts/check-file-size-thresholds.js \
  src/transport/bulk-transfer-channel.js \
  src/transport/inproc-transport.js \
  src/raft/bulk-connection-transfer-socket.js \
  src/constants/transport.js \
  test/raft/bulk-transfer-socket-adapter.test.js \
  test/raft/snapshot-recorded-gaps.test.js \
  test/transport/bulk-channel-identify-incarnation.test.js \
  test/transport/bulk-transfer-lane-isolation.test.js
```

Result: exit 0; no declared source file exceeds 800 lines and no declared test exceeds 1500. Exact output: `file-size-declared.txt`.

```sh
node scripts/check-guideline-literals.js <four declared production files>
node scripts/check-guideline-hot-path-diagnostics.js <three changed owner files>
node scripts/check-guideline-deferred-outcomes.js <three changed owner files>
node scripts/check-guideline-silent-catch.js <three changed owner files>
```

Result: all exit 0 with zero scoped violations. Exact outputs use the corresponding command names.

```sh
npm run audit:impact-contracts
npm run audit:shards
```

Result: both exit 0; 59 impact contracts/30 pairs and 2349 classified tests across 22 subsystems. Exact outputs: `impact-contracts.txt`, `shards.txt`.

```sh
git diff --check 758b32e733754b2fb67da7953899a2c4a55765dc -- <eight declared paths>
```

Result: exit 0. Exact output: `git-diff-check.txt`.

## Whole-tree ratchets

These commands include concurrent repository WIP outside this slice and remain truthfully red:

```sh
npm run audit:file-size
npm run audit:guidelines
npm run test:duplication
npm run test:unused:ratchet
```

Results:

- file size: exit 1, 30/27 source and 21/21 test files over thresholds. All eight declared paths pass the scoped check.
- guidelines: exit 1 at the first whole-tree literal gate with 304 new violations. The four declared production paths have zero.
- duplication: exit 1 for tests at 698/697 clone groups and 26410/26369 duplicated lines; source+scripts passes 47/47 and 1473/1473. The report contains zero clone groups involving any of the four declared tests (`duplication-declared-census.txt`).
- unused exports: exit 1 at 1467/1416. This slice adds no export declaration (`unused-export-declared-census.txt`).

Exact broad outputs are `file-size-whole-tree.txt`, `guidelines-whole-tree.txt`, `duplication.txt`, and `unused-export-ratchet.txt`. The red counts are not waived or presented as passing.

## Source and runtime traces

```sh
rg -n 'sendControl\(' src test/raft test/transport -g '*.js'
rg -n 'bulkConnectionTransferSocket|createBulkTransferChannelRegistry|createInProcWebSocketPair' src -g '*.js'
```

Result: retained in `send-caller-census.txt`.

```sh
node -p process.versions
sha256sum "$(node -p process.execPath)"
node -p 'require("ws/package.json").version'
```

Result: local Linux x64 Node 22.23.2, executable SHA-256 `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`, ws 8.21.0. Exact output: `runtime-fingerprint.txt`. This is local implementation evidence, not release-profile certification.
