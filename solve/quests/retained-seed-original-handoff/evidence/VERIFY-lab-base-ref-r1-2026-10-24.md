---
audience: development
documentClass: evidence
---

# VERIFY lab-base-ref r1 (2026-10-24)

**Verdict: APPROVE for keeping 52588ce06.** No gate gets weaker against what that gate declares it proves. Four advisories follow (A1-A4). None of them blocks.

**Identity.** Commit 52588ce062a4d5f7cdb1bd2846497ef65b3b18d5 ("wip: lab base ref"), parent a334068f3, on work/lab-placement-base-ref-20261024 (also refs/wip/lab-baseref-1). It touches 11 files (+229/-55). The verifier is independent: I did not write it. I ran everything in detached scratch worktrees at 52588ce06 and at a334068f3 under `.../scratchpad/lbr-verify/`, with node_modules symlinked and the import graph regenerated. Both worktrees are removed and pruned. I edited, committed and pushed nothing, and did not touch the primary checkout.

## (A) The gate question: the range walked before and after, per caller

Before the change there were two resolutions of the base:

- **The CLI** (`main` in both checks) used `baseFromArgv || resolvedCheckBase()`, so it already honoured `LAGRANGE_CHECK_BASE`.
- **The library default** (`options.base || publicationBase(root)`, check-closed-quest-shape.js:226 and check-quest-log-append-only.js:269 in the old text) ignored it. That library default is what tests reach:
  - closed-quest-shape.test.js:188, "repository itself is clean".
  - solve-footprint-accounting.test.js, through solve-v2-budget.js:207-208 `questDirectoriesOffShape()`.

After the change both paths consume `repositoryCheckBase(root)` (changed-paths.js:209-212). Its result is the declared env base when root is this script's own repository root, and `publicationBase(root)` otherwise.

| Caller (sets base) | CLI audit, before → after | Library default (tests), before → after | Weaker? |
|---|---|---|---|
| **solve land**: commands.js:345-350 sets `LAGRANGE_CHECK_BASE=HEAD` | HEAD..HEAD, empty → empty (unchanged) | merge-base(local origin/main, HEAD)..HEAD (the whole unpublished branch: 1265 commits here, 309 s measured at the parent with env=HEAD) → HEAD..HEAD, empty (1 s measured) | See below: weaker only against an incidental check that was never the land's declared proof |
| **pre-push, pushing main**: pre-push:376-381 exports `MAIN_REMOTE_SHA` | remote..HEAD → same | merge-base(local origin/main)..HEAD → remote..HEAD (exactly the pushed range) | No. The pushed range is fully walked. Before, it was a superset only when the local origin/main was stale. |
| **pre-push, non-main push or manual run** | ambient env, else publication base → same | publication base → ambient env if set, else publication base | Only under an ambient env (A2). With no env it is unchanged. |
| **CI push to main**: ci.yml:102-119 sets base=`before` | before..HEAD → same | merge-base(origin/main = the pushed sha, HEAD) = HEAD, so **empty** → before..HEAD | No: **stronger** |
| **CI pull_request**: base.sha | base..head → same | merge-base(origin/main, head)..head, equivalent → base..head | No |
| **Lab placed run / `lab test`**: probe.js:2433, lagrange-lab.js:512 | (n/a) | the lab clone's own stale origin/main (55d6cabdc, about 1270 commits) → the controller's resolved base | No. The walk now equals the controller's declared range, where before it was a range nobody named. |

**The land question, precisely.**

1. **Yes, the land used to walk the whole branch.** Before the change, every land that touched a quest directory selected closed-quest-shape.test.js and solve-footprint-accounting.test.js. I checked this with a simulated land (one quest log appended and staged, then `LAGRANGE_CHECK_BASE=HEAD select-change-tests --list`): both tests and check-quest-log-append-only.test.js were in the 80 selected (`lbr-verify/land-sim-list.txt`). Those library calls walked merge-base(origin/main)..HEAD. At the parent with env=HEAD the test took 309 s, which proves the env was ignored (`logs/parent-shape-env-HEAD.log`).
2. **Now that history walk at land is empty.** Shape composition (the closed quests in the working tree: unrequired or missing files) is still checked. The append-only working-tree edge (HEAD → working tree, check-quest-log-append-only.js:252-263) is still checked, and it covers the land's own staged log change.
3. **The lost part is outside the land's declared proof.** The lost part is the re-check of already-committed branch commits for mutations of closed quests' required artifacts, and for append-only violations on those commits. The land's declared contract is "the quest delta, not the branch" (commands.js:47-59; solver-runbook.md:233-243: "The branch-vs-remote range is the push gate's proof"). The CLI audit under the same env already walked nothing at land, so the library now agrees with the declared range instead of contradicting it.
4. **Every published commit is still walked.** The push gate to main walks remote..HEAD. CI walks before..HEAD on a push and base..head on a PR. A non-main push with no env still walks the publication range.
5. **I judge this not a REQUIRED CHANGE.** No property loses its enforcing gate: the push gate and CI hold it over exactly the published range.
6. **A pre-existing gap, not introduced here (A1).** The land's own staged mutation of a closed quest's required artifact is caught at land neither before nor after. Composition checks existence, not bytes (check-closed-quest-shape.js:141-150), and the mutation walk covers commits only (quest-record-transitions.js:91-101). It is caught first at the push gate.

## (B) One owner of "the base"

Every remaining caller goes through changed-paths.js:

- `resolvedCheckRange` / `resolvedCheckBase`: check-fast-static.js:183, select-change-tests.js:589, push-gate-change-proof.js:368, run-static-audits.js:117.
- `resolvedCheckBaseCommit`: probe.js:2433, lagrange-lab.js:512.
- `repositoryCheckBase`: the two checks.

The remaining `origin/main` and merge-base uses:

- **Range owner:** changed-paths.js:85, :163-166 (`publicationBase`).
- **"Is published" question:** push-gate-change-proof.js:114, :302 (`commitIsPublished`, `--is-ancestor`).
- **Publish-head remote owner:** publish-head.js:313 and its messages.
- **Release preflight:** release-preflight.js:167, its own remote-main question.
- **Lab clone fast-forward:** probe.js:848 (FETCH_HEAD).
- **Prose:** lagrange-lab.js:76 (usage text).
- **Tests:** test/scripts hits are fixtures or owner tests (check-base-range, publish-head, release-preflight, push-gate, pre-push, lab-test-base, home-lab-cli-guidelines).

No second resolution remains.

## (C) The fixture-root rule

`REPOSITORY_ROOT` is computed from changed-paths.js's own URL (changed-paths.js:93-94). The checks' `REPO_ROOT` is computed the same way, so within one checkout the two always match, including a linked worktree. Results from `lbr-verify/resolve.mjs`, run in the linked scratch worktree:

- **Linked worktree with env = sha:** returns the declared sha. Without env it returns that worktree's publication base. env=HEAD gives the commit id. A bogus ref is refused: "the declared check base does not name a commit here".
- **Same worktree with a trailing slash:** honoured (`path.resolve` normalises it).
- **Same worktree through a symlink:** the declared base is **ignored** and the publication base is used.
- **The primary checkout's root, called from the linked worktree's scripts:** the declared base is ignored, because a different worktree root counts as "another root".

Neither ignored case is reached by any current caller: every repository caller omits `root`, and Node gives `import.meta.url` as a realpath. When it does happen, the fallback is the broader walk (slower), never a narrower one. See A3.

## (D) Lab forwarding

1. `--base-sha` is resolved by `resolvedCheckBaseCommit` in `commit.gitRoot` (lagrange-lab.js:512) and passed to `runLabTest({checkBase})` (probe.js:2885).
2. From there it goes to `forwardedPolicy(env, checkBase)` (probe.js:1739-1745). In `startLabShare`, a remote share gets it as the 9th positional argument (`forwardedArgs`, probe.js:1747-1750, :2181). The controller share gets it through `runLocalChild(files, {onLine, checkBase})` (probe.js:2818, :2397-2398).
3. The lab shell exports it, or **unsets** it when it is empty (probe.js:1939-1940), and prints it on `placement-env= ... base:` (probe.js:1949).
4. For a placed `npm test`: `deps.checkBase()` is the controller's resolved base (probe.js:2433). It is resolved after discovery, and a throw returns `local("the check base a lab machine would be handed is unresolved: <reason>")` (probe.js:1678-1683). The reason is printed, never dropped silently. test-placement.test.js asserts this, and the `base:` line too (passes 26/26).
5. In `lab test`, an unresolvable `--base-sha` throws before any share starts, so it is refused, not run locally. That is correct for an explicit operator request.
6. Live evidence: lbr/lab-after.log:11 `placement-env=... base:a334068f3...`.

## (E) What I ran

All logs are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/lbr-verify/logs/`. The thermal gate was ok (64-66 C) before each heavy step, and the heavy runs were serial.

| Run | Result |
|---|---|
| check-base-range.test.js | 11/11 |
| test-placement.test.js | 26/26, 48 s |
| lab-test-base.test.js | 4/4 |
| check-quest-log-append-only.test.js | 18/18 |
| closed-quest-shape.test.js, env=HEAD / env=HEAD~30 | 10/10 in 1 s / 28 s |
| solve-footprint-accounting.test.js, env=HEAD / env=HEAD~30 | 4/4 in 1 s / 28 s |
| CLI shape: no env / env=HEAD~30 / `--base` HEAD~30 | clean 316 s / clean 28 s / clean 29 s |
| CLI append-only: no env / env / flag | clean 9 s / 1 s / 1 s |
| Both CLIs with a bogus env | exit 1 with a git "unknown revision" error (fail-closed) |
| Parent a334068f3, CLI env=9ac58247 | clean 28 s: identical to after, so CLI behaviour is unchanged |
| Parent, shape test with env=HEAD | 9/9 in 309 s: the old library ignored the env |
| `node --check` and eslint on the 9 changed .js files | clean |
| test:cycles | 0/0 |
| audit:file-size | rc 0; test-placement.test.js is 1499 lines |
| test:duplication | OK. The "tighten 47→46 / 1462→1439" hint appears identically at the parent, so it is pre-existing. |
| Pre-commit hook | lbr/commit3.log shows a pass, with the scoped complexity ratchet within budget. commit2.log shows the earlier file-size failure at 1501 lines. |

## (F) Spot-check of the red classification

1. **The 8 `Not a valid object name origin/main` lines are noise.** Both logs have exactly 8. In pfix/lab-run-2.log (4036-4043) they sit between the closed-quest-shape and solve-footprint results. In ratchet-src/lab-tv-dator-1.log (13210-13217) they follow the shape test's output. That fits fixture repos with no remote. **Confirmed.**
2. **Shape and footprint reds come from the full-history walk and from snapshot evidence.**
   - adam-laptop (lab-run-2.log:4033, :4044): both files were killed at the 600 s budget with 0 assertions. ENOBUFS appears at :3277.
   - tv-dator (lab-tv-dator-1.log:12805, :12876): footprint failed at 545 s ("active footprint meets the 20 MB budget") and shape failed at 530 s. The shape failure was the "repository itself is clean" test, with UNREQUIRED offences in seed-participant-release-native-startup-census, which is the snapshot-evidence class.
   - **Confirmed:** timeouts and walk cost on the slower host, (c)-class evidence on tv-dator.
   - Implementer before/after on lenovo (lbr/lab-before.log:187-188 vs lab-after.log:143,164): 532/528 s → 2.1/2.4 s. The only red is git-invocation-owner in both. Confirmed.

## Per-claim table

| # | Claim | Status |
|---|---|---|
| 1 | origin/main exists on lab clones; the `fatal` lines are fixture noise | Noise part confirmed from the logs. The lab-clone ref state was not re-probed by ssh (UNKNOWN, taken from the implementer). |
| 2 | Lab reds are (c)-class plus walk timeouts; the library ignored the env | Confirmed (F; parent 309 s run) |
| 3 | One owner, at changed-paths.js | Confirmed (B) |
| 4 | Without the env the primary behaves as before; with it the walk is the declared range | Confirmed (E). The CLI is unchanged, and the library now matches the CLI. |
| 5 | New tests | Present and passing. Gap: no unit test covers `runLabTest` checkBase forwarding (A4). |
| 6 | Local no-env runs green, shape 346 s / footprint 326 s | Mostly. lbr/local-after.log also shows test-placement red ("the controller child runs with placement switched off", lines 160-185) during a thermal hold at 77-85 C. That red is environmental: the same file passes 26/26 in my run and on lenovo. The implementer's summary omits it. |
| 7 | Lab after 192/193 | Confirmed from lab-after.log:299 |
| 8 | Hook passed, file trimmed to 1499 lines | Confirmed |

## Advisories (not blocking)

- **A1 (pre-existing gap):** at land, a staged rewrite of a closed quest's required artifact is checked by nothing until push. This is not introduced here. If land should catch it, the shape check needs a HEAD → working-tree mutation edge, as append-only has.
- **A2 (pre-existing, now reaches the library tests too):** pre-push keeps an ambient `LAGRANGE_CHECK_BASE` for non-main pushes (pre-push:376-381 overrides only for main). A stale `=HEAD` in the shell now empties the library walk, as it already emptied the selector and the CLI. Consider clearing the ambient base in the hook for every push.
- **A3:** `repositoryCheckBase` compares roots with `path.resolve` only. Using `fs.realpathSync` on both sides would make a symlinked root count as the same repository. Today the effect is only a slower, broader walk.
- **A4:** add a unit assertion that `runLabTest({checkBase})` hands the base to both the remote share's `forward` and the controller's `runLocalChild` options. Today only the live lab-after run proves that path.

Also: the commit subject "wip: lab base ref" should become a real message before publication.

## Limits and unknowns

- I did not run a lab placement myself and did not ssh to the lab. The lab-clone origin/main state (55d6cabdc) is UNKNOWN to me and taken from the implementer.
- I did not run the full pre-push gate or CI.
- The CI push-to-main "before" behaviour assumes actions/checkout with fetch-depth 0 creates refs/remotes/origin/main at the pushed sha. That is the standard behaviour, but I did not verify it on a runner.
