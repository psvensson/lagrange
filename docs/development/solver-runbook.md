---
audience: development
---

# Solver Operator Runbook

This is an example-oriented operator aid. It does not define policy or a second
boot sequence. Load order is owned by [`AGENTS.md`](../../AGENTS.md), executable
orientation by [`boot.md`](../steering/llm/boot.md), and the binding workflow by
[`solver-quests.md`](../steering/workflow-guidelines/solver-quests.md). The complete
generated CLI reference is [`solve-commands.md`](../steering/llm/solve-commands.md).

## Primary Three-Verb Workflow

```sh
# Existing Quest: read-only doctor + lint + structured next action.
node scripts/solve.js start --id my-quest

# New Quest: create and validate the linked draft, but do not seal it.
node scripts/solve.js start --id my-quest \
  --statement "The named scenario passes three consecutive fresh runs." \
  --spec-ref solve/specs/my-feature/requirements.md#acceptance

# Begin, then summarize one proved change; capture is automatic.
node scripts/solve.js continue --id my-quest
node scripts/solve.js continue --id my-quest \
  --summary "route the decision through its owner"

# At terminal, issue an immutable review id, then record its verdict.
node scripts/solve.js land --id my-quest
node scripts/solve.js land --id my-quest --review review-<hex> \
  --verifier <stable-id> --verdict approve --receipt <ref>
```

`continue` executes only trusted structured begin/record-attempt, replacement, and
ready-checkpoint codes. It never runs
the rendered command text, captures against the active source epoch only when a
commit summary is supplied, and stops on verification, repair, or judgment
actions. `land` validates current
bytes before recording the verdict; rejection never commits, approval uses the
existing full audit and scope-safe commit, and neither path pushes.

The remaining sections document component commands for diagnostics, explicit
durability boundaries, and exceptional operations.

## Publish And Git Exceptions

Normal publication is one command after Solver has landed every intended commit:

```sh
npm run publish
```

It runs the pre-push gate against the exact committed `HEAD` in a clean temporary
worktree, checks that the gate did not mutate tracked content, pushes without
force, verifies the remote SHA, prints the CI URL when available, and stores a
HEAD-bound receipt below the Git common directory. The gate reads the caller
worktree's `node_modules` and gitignored `data/` through symlinks; publish
prints `publish: linking node_modules -> ..., data -> ...` first and fails fast
when `data/` is absent (a fresh quest worktree: `ln -s <main>/data data`, run
the MovieLens fetch, or pass `--allow-missing-data` deliberately).

If the exact push repairs the current red main, attribute that exception:

```sh
npm run publish -- --fixes-red <origin-main-sha> --reason "<why this fixes red>"
```

The default runner is GitHub-hosted. Self-hosted routing requires
`[ci:self-hosted]` in the already-reviewed HEAD commit message and
`--runner self-hosted`; publish validates the marker and never amends. Direct
`git push` remains an advanced escape hatch. If the exact tree already passed
`test:gate:postpush`,
`LAGRANGE_PUSH_SKIP_TESTS=1 git push` skips only the repeated test stage; static
checks still run. `--no-verify` skips every gate and is emergencies-only.

The pre-push hook is fast-fail ordered: unused files, tracked-file lint,
duplication/file-size ratchets, cycles, unused exports, then the long post-push
test corpus. Fix one-way ratchets rather than raising their baselines.

## Orient Without Mutation

```sh
node scripts/solve.js doctor
node scripts/solve.js doctor --json
```

`doctor` reports Git state, agent-adapter capability, local attribution, and the
runnable supervised or autonomous mode. A missing config, `enabled: false`, an
unexecutable command, or the no-op example adapter never masquerades as a live
autonomous capability. Copy
[`solve/config.example.json`](../../solve/config.example.json) to the ignored
machine-local sibling `config.json`, and set `enabled: true` only after
replacing the placeholder with a live executable.

For component-level diagnosis, inspect the same projection directly:

```sh
node scripts/solve.js next --id <quest>
node scripts/solve.js next --id <quest> --json
```

The action is typed as `executable-command`, `command-template`,
`manual-action`, or `terminal`.

## Author And Validate A Draft

Normally use `start`; the component form is:

```sh
node scripts/solve.js new --id my-quest \
  --statement "The named scenario passes three consecutive fresh runs." \
  --spec-ref solve/specs/my-feature/requirements.md#acceptance \
  --closes-cl CL-42
node scripts/solve.js lint --id my-quest
```

A `test-receipt` draft gets its evidence harness skeleton
(`scripts/quest-evidence-<id>.js`, one placeholder per required receipt id)
from `solve start`, or explicitly from `solve scaffold-harness --id <id>`;
fill each placeholder's test file or anchored test name before the receipts
can pass. Useful authoring flags are `--class product|process`, `--plan-doc`,
`--parent-quest`, `--roadmap-row`, `--spec-ref`, repeatable `--closes-cl`, and
`--inherit-rulesout-from`. New drafts carry `authoringContractVersion: 1` and
`links.draftedAtCommit`. They are sealed only when the first execution command
passes lint and appends the declaration.

The corpus census is read-only:

```sh
node scripts/solve.js lint --all
node scripts/solve.js lint --all --json
```

It reports versioned and legacy Quests; it does not migrate or rewrite them.

## Drive One Supervised Attempt

Normally use `continue`; the component form is:

```sh
node scripts/solve.js step --id my-quest

# Make one bounded change and refresh the configured evidence.

node scripts/solve.js step --id my-quest --commit --auto-diff \
  --summary "route the decision through its owner"
```

An explicit artifact is also accepted:

```sh
git add -N path/to/new-file.js
git diff --binary --full-index --no-ext-diff <base> -- <quest-paths> \
  > solve/changes/my-quest/attempt-1.diff
node scripts/solve.js step --id my-quest --commit \
  --changeRef diff:solve/changes/my-quest/attempt-1.diff \
  --summary "route the decision through its owner"
```

`step --commit` records the measured attempt; it does not make a Git commit.
Use `step --abort` to discard a pending pin without recording an attempt.

## Continue Source Work; Verify Only At A Durability Boundary

Version 2 attempts accumulate without individual review. Keep following
`solve next` until terminal unless a real durability boundary requires a commit.
At that boundary, run the cheap checks and project the one current candidate:

```sh
npm run audit:attempt-preflight
node scripts/solve.js checkpoint --id my-quest --dry-run --reason milestone
node scripts/solve.js next --id my-quest --json
```

When `continue` refuses with "source epoch changed reviewed path(s) in an
intervening commit" and the intervening commits are already on `origin/main`,
rebase or merge the branch, then record the boundary with
`node scripts/solve.js rebase-epoch --id my-quest --to HEAD --reason "<why>"`
and follow `next`: it demands one covering attempt at the new base over the
retired epoch's paths. Reseal (park + `new --from`) only when the quest's
statement or bar must change.

Before requesting the verifier round on a terminal candidate, run
`node scripts/solve.js preflight --id my-quest --full`: the default preflight
is cheap and read-only; `--full` adds the publish-gate statics (duplication,
unused exports, cycles, aggregate complexity) that no earlier Solver stage
runs, so a ratchet miss costs one edit instead of a gate run.

The dry run must say the candidate will be checkpoint-landable after one exact
approval. Give its common-base/current-union dossier and applicable templates to
an independent verifier, then record the exact candidate verdict:

```sh
node scripts/solve.js finding --id my-quest --frontier my-quest-main \
  --kind verifier-approval \
  --claim "Independent verification passed" \
  --evidence subagent:<id> \
  --verification-scope candidate \
  --verification-fingerprint sha256:<candidate-fingerprint>

node scripts/solve.js checkpoint --id my-quest --reason milestone
```

The finding has no commit side effect. The checkpoint records the durability
reason, refuses any candidate drift, commits only Quest scope, and never pushes.
Routine work skips this section entirely and goes straight to terminal review.

## Foreign Dirty Files And Commits Under A Lease

The attempt capture sweeps the working tree. Another declared Quest's
bookkeeping (its quest file, evidence receipt, dep-scope note, oracle, or
attempt diffs under its own `solve/` id) is excluded from the capture
automatically and named on stdout
(`auto-diff: excluded another quest's bookkeeping from the attempt: ...`);
it stays dirty in the tree, untouched. The owner is resolved against the
declared ids under `solve/quests/`, so an undeclared name is never treated
as foreign and stays inside the attempt. Shared planning documents
(`solve/epics/`, `solve/specs/`) have no owner: a shared spec edit still
refuses a product Quest and the refusal names the path. Restore such a
shared file with `git checkout -- <path>` before `continue --summary`. Never
set aside a Quest's own `solve/log/` file by checking it out — the log is
append-only and the events are lost. Record the attempt before committing
anything else while a step is pending; a commit between begin-step and
record-attempt moves the attempt base away from the step pin and the
candidate becomes unlandable.

While this worktree holds a Quest lease the pre-commit hook refuses any
source-changing commit that the Quest has not authorized
(`scripts/solve/commit-authorization.js`). There is no bypass lane. For a
source change that genuinely belongs outside the Quest, release the lease,
commit, and let the next Solver verb re-claim it:

```sh
node scripts/solve/session-registry.js release --quest <id>
git commit -m "<message>"
node scripts/solve.js next --id <id>
```

Or make the change in a second worktree. `LAGRANGE_SKIP_PRECOMMIT=1` is for
WIP branches only and never for a commit that lands source on the release
branch. Documentation and `solve/` records are not source and commit normally.

## Terminal Verification And Handoff

Normally pass the independent verdict to `land`; the component form is:

At SOLVED or EXHAUSTED, source-changing work needs a fresh approval of the
aggregate fingerprint that `solve next` prints. `both` is valid only when the
candidate and aggregate base, paths, range, and fingerprint are identical.

```sh
node scripts/solve.js report --id my-quest
node scripts/solve.js audit --id my-quest
node scripts/solve.js handoff --id my-quest
node scripts/solve.js handoff --id my-quest --commit
```

Terminal handoff requires the terminal state, aggregate approval when
applicable, a passing full audit, and scope-pressure admission. The dry run
lists both included and excluded dirty paths. No Solver command pushes.

The landing preflight's import-graph verify (~22 s idle, 30 s budget, one
retry) waits for one-minute load headroom before it spawns (`load-gate:` lines
on stderr; skip with `LAGRANGE_SKIP_LOAD_GATE=1`); a machine that stays loaded
still runs the verify and reports the timeout with the
`LAGRANGE_IMPORT_GRAPH_VERIFY_TIMEOUT_MS` knob.

## Autonomous Mode

Use the agent executor only when `doctor` reports it available:

```sh
node scripts/solve.js run --id my-quest --executor agent --yes --keep-alive
```

The supervisor automatically replays only a MAX_CYCLES stop that made durable
progress. THEORY_REQUIRED, measurement repair, recoverable BLOCKED, and an
unchanged MAX_CYCLES return once with their typed next action. The default
`dry` executor is a test skeleton and makes no real edits.

## Theory, Evidence, And Diagnostics

When `next`, `health`, or the dossier requests theory, use the generated command
reference for the full argument grammar. Common read-only commands are:

```sh
node scripts/solve.js health --id my-quest
node scripts/solve.js theory list --id my-quest
node scripts/solve.js status --id my-quest
node scripts/solve.js audit --id my-quest
npm run quest:context -- --id my-quest
```

Record durable learning with `finding`; record causal hypotheses and their
results with `theory`. Probe evidence and metric movement, not agent self-report,
decide progress and closure.

## Stored And Generated Artifacts

- Track authored `solve/quests/`, append-only `solve/log/`, explanatory
  `solve/changes/`, and non-regenerable report evidence.
- Treat `solve/state/`, ordinary `solve/report/<quest-id>.md`, and
  `OVERVIEW.generated.md` as regenerable local projections. Use `report`
  or `overview --write` only when a human wants that view; audit and handoff do
  not require either file.
- Keep the machine-local `config.json` beside the tracked example and out of
  Git.
- Regenerate the full CLI and steering indexes with
  `npm run steering:llm:pack` after command or steering-source changes.

## Partial clones (solve-v2 phase 1)

Binary evidence (run-state and log tarballs, raw evidence bundles) lives in
the `solve-evidence` GitHub pre-release, never in git; the pre-commit guard
`scripts/checks/check-solve-binary-guard.js` refuses any archive or file over
1 MB under `solve/`. History still carries the old tarballs, so clone with

```sh
git clone --filter=blob:none git@github.com:psvensson/lagrange.git
```

A blobless partial clone fetches file contents lazily and never downloads
blobs that no checked-out tree references, so the purged evidence costs
nothing. Rewriting history to drop it (`git filter-repo`) is deferred: it
would change every SHA the quest records cite (`draftedAtCommit`, `sealedAt`,
`changeRef`) and needs a commit-map pass first (design note
`solve/epics/solve-v2/design.md`, section 5).

Upload evidence with `node scripts/solve.js evidence add <path> --quest <id>`;
the record is written only after the asset is downloaded again and re-hashed.
