---
audience: development
documentClass: evidence
---

# VERIFY pgwire tag-first r1 (2026-10-27)

## Verdict: REQUIRED CHANGES (one, derived-file only). Both commits are otherwise approved to keep.

The required change: **316d18ac3 commits a stale `solve/changes/global-owner-debt-inventory/inventory.json`.**
Regenerate it from 316d18ac3's tree with a fresh jscpd-test report, then commit the 3-line delta. Either amend 316d18ac3
or add a follow-up commit. The expected delta, from my hook replay (`verify-r1-logs/hook-head-inventory-drift.diff`):
- `inputs[test-output/analysis/jscpd-test/jscpd-report.json].sha256` and `reconciliation.duplication...sha256`: `d962df29…cd410` → `27d0b8a7…10885`
- `inputDigest`: `99f758f4…bed569b` → `8cb6394a…f222202d7`

The composing merge onto the lineage head regenerates the inventory anyway (see E). So if the commits are merged right away, that regeneration satisfies this item, and the merge commit must carry it.

## Identity
- Worktree `/mnt/data/peter/projects/.worktrees/pgwire-lifecycle-tag-first-20261026`, branch work/pgwire-lifecycle-tag-first-20261026.
- 589e7c604, parent 319c4c6ac. `refs/wip/lab-pgw-1` = 7fe25f26b, parent 319c4c6ac. It differs from 589e7c604 only in `inventory.json` (the hook regeneration).
- 316d18ac3, parent 589e7c604.
- Lineage head: `work/mg-delivery-resume-r2-20261023` = `origin/...` = 794b3e6a7 (fetched). The merge-base with 316d18ac3 is 319c4c6ac, and the lineage head is 7 commits ahead of it.
- I worked in scratch worktrees: base=319c4c6ac, c1=589e7c604, head=316d18ac3 and merge=794b3e6a7, with node_modules symlinked and the import graph generated. All of them were removed at the end. The primary checkout was not touched, and nothing was edited, committed or pushed in the subject worktree.

## Per-claim table
| Claim | Result | Evidence |
|---|---|---|
| (1) The tag is derived before any row frame. An untaggable result gets one XX000 PGWIRE_UNKNOWN_STATEMENT_TYPE with zero row frames | CONFIRMED | `src/runtime/pgwire-protocol-handler.js:652-654` (the old call before `readExecutedStatementType` is removed). The witness at `test/runtime/pgwire-result-mapper.test.js:296-311` is red on base: actual types `[84,68,68,69,90]` = T,D,D,E,Z. It is green at c1: E,Z. SQLSTATE is XX000 and the message ends `(statement kind: null)` (`pgwire-result-mapper.js:35-38,105-116`). |
| (1') No other observable change | CONFIRMED | `deriveCommandTag` is pure: it reads `statementType` plus `rows.length`/affected count and does not mutate `result`. A throw still goes to the same `catch → _answerFailure`. For taggable results the order is unchanged: T, D*, notice, C. The early-return paths (provisioning, empty, `success:false`) come before the new line and are untouched. The only other effect is that a DML result with rows but no affected count (PGWIRE_MISSING_AFFECTED_ROW_COUNT) is also refused before rows now. That is the same fail-closed improvement. Both callers (simple at :597, extended via `pgwire-extended-query-handler.js:184`) share this one path. |
| (2) The double uses the owner's builder and command constants | CONFIRMED | `test/integration/service-install-lifecycle-cli-pgwire.integration.test.js:17-23,153-165` imports `withExecutedStatementType` (`src/query/application-database-result.js:130`) and `SERVICE_LIFECYCLE_COMMAND` (`src/service/service-lifecycle-command-contract.js:5-14`: install_service/remove_service/show_services/show_service). It does not hand-copy the field name. Unknown SQL stays unstamped (`:161-163`). |
| (2') Stamping the P0001 rejection is right | CONFIRMED (stamping) | The real owner catches every failure and *returns* `failureResult(...)` (`service-lifecycle-command-owner.js:316-345`). The engine then stamps that returned value too (`sql-query-engine-service-lifecycle-execution.js:151-157`). So a rejected lifecycle statement is stamped in production, and the double matches. On the wire the stamp has no effect here, because `success:false` throws before tagging (`pgwire-protocol-handler.js:642-650`). See F2 on the rejection body itself. |
| (2'') The file goes 2/4 → 4/4. The L2 pins are exact | CONFIRMED | base: 2/4 (leaves 1 and 3 red). c1: 4/4. Merged tree: 4/4. Mutation test: leaving SHOW_ONE unstamped turns leaf 2 red with `...rejected (XX000)`. The old `/not found|empty|status/` regex would have passed that, because "status" is in the CLI prefix. "status returned no service" is at `src/cli/service-lifecycle-command.js:245`, and the "(P0001)" format is at `src/cli/service-lifecycle-sql-client.js:34-37`. |
| (3) steering-diet starts git through `execGit` | CONFIRMED | `test/scripts/steering-diet.test.js:14,227-228`. `execGit` = `execFileSync('git', args, {...rest, maxBuffer: bound})` (`scripts/checks/git-invocation.js:67-75,101-111`). `GIT_OUTPUT_BOUND.COMMAND` = 64 MiB, the same as the deleted constant. stdout and the nonzero-exit throw are the same. The only difference is that overflow throws the typed `GitOutputTooLargeError` instead of raw ENOBUFS, which is stricter. Guard leaf 5 at c1 is red with `steering-diet.test.js:228` (2 entries). At head it is `[]`: git-invocation-owner 6/6, steering-diet 13/13, rule-set-revision 20/20. |
| Lab 338 files: 326/12, all reds pre-existing | NOT RE-RUN | The implementer's log `compose/pgw/lab-pgw-1.log` shows `total=338 pass=326 fail=12`. It ran on the pre-hook snapshot, not on 316d18ac3. Locally I confirmed one of the reds named as pre-existing: the two pgwire-result-mapper leaves fail identically at base, c1, head and the merged tree, on `TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE` ("Distributed transaction state cannot be persisted by this engine"). |

## Findings
- **F1 (REQUIRED, derived file): inventory drift in 316d18ac3.** I replayed the hook on 316d18ac3's staged tree (soft reset to 589e7c604 in scratch, then `bash .githooks/pre-commit`). The re-staged `inventory.json` differs from the committed one in the jscpd-test digest. The cause is deterministic: steering-diet.test.js lost 1 line and 14 tokens, so the jscpd-test statistics went from 907048/7426572 to 907047/7426558. The implementer's `hook2.log` shows that the hook took the non-refresh path: no "import graph stale - refreshing" line, unlike `hook.log`. That path reused the on-disk jscpd-test report from the earlier commit (dup.log, 20:27). The same replay on 589e7c604 had zero drift: the index equalled the commit tree and the working tree was clean.
- **F2 (record, not blocking; fixtures.md "Test Doubles Consume the Owner" rule 3): the double's rejection body is a hand-written owner answer.** It reads `{detail:{code:'service_lifecycle_service_not_found'}, error, sqlState:'P0001', success:false}`, at `:144-150` (pre-existing, moved only). The real owner answer comes from the exported `failureResult` (`src/service/service-lifecycle-command-failure.js:178-199,207`) and carries `errorCode` and `detail` but no `sqlState`. No `src/` code emits P0001. So in production the same rejection reaches the wire as XX000 (`resolveFailureSqlState`, `pgwire-result-mapper.js:130-134`), and the CLI would print "(XX000)". 589e7c604 now pins `\(P0001\)` exactly, which makes an invented SQLSTATE load-bearing. The fix belongs at the owner: build the rejection through `failureResult(new ServiceLifecycleCommandError(...), SHOW_ONE)`. Whether a typed lifecycle rejection should carry a named SQLSTATE instead of XX000 is an owner decision (R07). Record it as a unification finding (R17), not in this unit's scope.
- **F3 (record, tooling): the pre-commit hook trusts a stale on-disk report.** Its non-refresh branch (`.githooks/pre-commit:160-171`) regenerates the inventory from `test-output/analysis/*` reports without proving they match the staged tree. F1 is an instance of this. This is a systemic gap in the hook and inventory producer.
- **F4 (inherited, informational).** The full `test:complexity` ratchet fails with 1773 > 1755, identically at base 319c4c6ac and head, so it is not caused by these commits. The cognitive ratchet prints a tighten hint (152 → 151).

## What I ran (logs in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/compose/pgw/verify-r1-logs/`)
- I ran the thermal gate (`wait-for-thermal-headroom.js`) before each heavy batch. It held at the start (CPU 77-83C) until it reached 74C.
- Witness: `witness-base.tap` (base with c1's test file: 16/3, the new leaf red with T,D,D,E,Z) and `witness-c1.tap` (17/2, both remaining reds pre-existing).
- L2: `l2-base.tap` 2/4, `l2-c1.tap` 4/4, mutation `l2-mut-unstamped-status.tap` (leaf 2 red with XX000).
- Git owner: `c1-*` and `head-*` for git-invocation-owner (5/1 → 6/0), steering-diet 13/13 and rule-set-revision 20/20.
- Hook replay: `hook-c1.log` (exit 0, zero drift) and `hook-head.log` (exit 0, inventory drift in `hook-head-inventory-drift.diff`).
- Statics at head:
  - `eslint-head.log`: clean on the 4 changed JS files. `node --check` passes on all 4.
  - `filesize-head.log`: 24/27 src, 21/21 test. pgwire-result-mapper.test.js has 558 lines.
  - `complexity-scoped-{base,head}.log`: `_executeAndSend` is 17 at :619 on base and :621 at head, so only the line shifted.
  - `complexity-full-{base,head}.log`: F4.
  - `cog-head.log`: OK.
  - `unused-ratchet-head.log`: 1412/1412.
  - `unused-{base,head}.log`: identical. The 2 unused raft-rs child files and 4 unlisted workflow binaries are pre-existing.
  - `dup-head.log`: 46/46 + 1439, 679/679 + 25717.
  - `cycles-head.log`: 0/0.
  - `impact-head.log`: PASS (71 contracts, sha256:5e7b3f65…).
  - `shards-{c1,head}.log`: classification OK (2468 tests) with no working-tree change.
- Merge (E): `merge.log`. `git merge --no-commit --no-ff 316d18ac3` onto 794b3e6a7 had **no conflicts**. The merge driver kept ours for `test/shards/subsystem-classes.json` and `test/shards/impact-graph-seal.json`, and the merged tree owes `npm run -s test:metadata:refresh` plus an inventory regeneration (with `--refresh` when inputs are absent). On the merged tree: mapper 17/2 (the same pre-existing pair), L2 4/4, git-invocation-owner 6/6, steering-diet 13/13 (`merge-*.tap`).

## Limits
- I did not re-run the lab suite (338 files). The 12 reds that the implementer calls pre-existing are taken from their log, except the mapper pair, which I confirmed myself.
- I did not run full eslint on src/test, `npm test` or the publisher. Statics other than the hook replay and shards were run at head only. For c1, only its delta files are shared with head, and the hook replay covered c1's staged tree.
- The merged tree's regenerated metadata and inventory were not produced, because that is the composer's merge-commit duty.
- I did not characterize F2 in production beyond reading the code (`resolveFailureSqlState`). I did not run a real-owner lifecycle rejection over the wire.
