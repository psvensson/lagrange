# Commands and results

Working directory:
`/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

```sh
sha256sum /tmp/cdc-node-cap-20261012/node
/tmp/cdc-node-cap-20261012/node --version
/tmp/cdc-node-cap-20261012/node -p \
  "JSON.stringify({v8:process.versions.v8,uv:process.versions.uv,platform:process.platform,arch:process.arch})"
```

Result: executable SHA-256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`;
Node 22.22.0; V8 12.4.254.21-node.33; libuv 1.51.0; Linux x64.

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
```

Result: exit 0; one file passed; 64 assertions passed. Full stdout/stderr is
`selected-runtime-test.txt`.

```sh
npx eslint src/cdc/cdc-coverage-transfer-owner.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js
```

Result: exit 0 with empty stdout/stderr, retained as `eslint.txt`.

```sh
git diff --check -- \
  src/cdc/cdc-coverage-transfer-owner.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js \
  solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md
```

Result: exit 0 with empty stdout/stderr. The source and test are untracked in
this cumulative Quest worktree, so the independent reviewer must also inspect
their exact hashes in `source-sha256.txt` rather than treating an empty Git
diff as evidence of absence.
