# Independent corrected transfer-owner review commands

Date: 2026-10-12 Europe/Stockholm. Working tree:
`/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

## Input identity

`source-ledger.json` binds the three exact source/test/metadata subjects plus
unchanged navigation. `git-object-checks.json` compares all three with snapshot
`7a8dfa2822c15dd6ee497933669d835da832c561`; all match. The author's 19 packet
entries match in `packet-checks.json`. No frozen product or evidence file was
changed.

The prior diagnostic programs were copied byte-for-byte from independent
round-one evidence. They also match the author's copies. They import the
current frozen source by absolute path and write outputs beside themselves.

```sh
/tmp/cdc-node-cap-20261012/node --expose-gc /mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-transfer-owner-source-round2-independent/owner-counterexamples.mjs
/tmp/cdc-node-cap-20261012/node /mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-transfer-owner-source-round2-independent/descriptor-boundaries.mjs
```

Both exit 0. All ten previous observations pass. All nine descriptor boundary
observations now refuse invalid evidence, including negative zero and inherited
fields. Output: counterexamples.txt/json and descriptor-boundaries.txt/json.

## Whole capture-to-transfer interaction

```sh
/tmp/cdc-node-cap-20261012/node /mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-transfer-owner-source-round2-independent/capture-reentry.mjs
```

Exits 1: three counterexamples and four positive observations. Descriptor
Proxy, options.descriptor getter and options.terminalize getter each complete
the old claim and reserve a successor inside input capture. The outer call
then calls terminalize again and throws on a null pool. The successor remains
intact and completes through the real API after that failure in all cases.
The shutdownRecord getter ordering control refuses safely; a throwing Proxy
capture retains the original claim for a valid retry; ordinary Proxy fields
are captured once; registering a callback during a wake does not expand the
current notification snapshot. No source model or intrinsic patch is used.

The final diagnostic adds the paired successor-completion witness to the same
schedule. Only its final script and corresponding raw/structured outputs are
retained. No source correction or passing future treatment is claimed.

## Existing registered cumulative tests

```sh
/tmp/cdc-node-cap-20261012/node scripts/run-classified-test-files.js \
  test/cdc/cdc-coverage-lifecycle-owner.test.js \
  test/cdc/cdc-coverage-reconcile-owner.test.js \
  test/cdc/cdc-authoritative-coverage-reconciliation.test.js \
  test/partition/partition-cdc-source-coverage.test.js \
  test/integration/cdc-coverage-rejoin-formation.integration.test.js
```

Exit 0. Ordinary lane: 4 files, 430 assertions. Exclusive lane: 1 file,
8 assertions. Combined: **5 files, 438 assertions**, including 114 in the
focused lifecycle-owner file. Raw output: cumulative-tests.txt.

```sh
npm run audit:impact-contracts
npm run audit:shards
```

Both exit 0; raw outputs audit-impact.txt and audit-shards.txt. Audits only;
no metadata regeneration was run by the reviewer.

`metadata-comparison.json` directly compares the new subsystem file with the
rejected predecessor snapshot: both contain 2,349 classes, with no added,
removed or changed classifications. The observation digest and two observed
dependency imports change, matching the retained metadata-delta.patch. The
author's prose about 11 omitted tests is not established by this delta or the
retained initial audit (which reports ordering/metadata drift).

## Runtime boundary

The selected executable remains Node 22.22.0 / libuv 1.51.0 Linux x64, SHA
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
Its exact signed-source correspondence was independently checked in round one
and is unchanged. No native coefficient, distribution certificate, transport
or startup proof was repeated or newly claimed here.
