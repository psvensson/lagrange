# Solver Operator Runbook

This is an example-oriented operator aid. It does not define policy or a second
boot sequence. Load order is owned by [`AGENTS.md`](../AGENTS.md), executable
orientation by [`boot.md`](steering/llm/boot.md), and the binding workflow by
[`solver-quests.md`](steering/workflow-guidelines/solver-quests.md). The complete
generated CLI reference is [`solve-commands.md`](steering/llm/solve-commands.md).

## Orient Without Mutation

```sh
node scripts/solve.js doctor
node scripts/solve.js doctor --json
```

`doctor` reports Git state, agent-adapter capability, local attribution, and the
runnable supervised or autonomous mode. A missing config, `enabled: false`, an
unexecutable command, or the no-op example adapter never masquerades as a live
autonomous capability. `solve/config.json` is machine-local and ignored by Git.
Copy [`solve/config.example.json`](../solve/config.example.json) locally and set
`enabled: true` only after replacing the placeholder with a live executable.

For an existing Quest, do not infer the next command from prose:

```sh
node scripts/solve.js next --id <quest>
node scripts/solve.js next --id <quest> --json
```

The action is typed as `executable-command`, `command-template`,
`manual-action`, or `terminal`.

## Author And Validate A Draft

```sh
node scripts/solve.js new --id my-quest \
  --statement "The named scenario passes three consecutive fresh runs." \
  --spec-ref solve/specs/my-feature/requirements.md#acceptance \
  --closes-cl CL-42
node scripts/solve.js lint --id my-quest
```

Useful authoring flags are `--class product|process`, `--plan-doc`,
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

## Terminal Verification And Handoff

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
  `solve/changes/`, and terminal/in-progress `solve/report/` artifacts.
- Treat `solve/state/` as regenerable local cache.
- Keep `solve/config.json` local.
- Regenerate the full CLI and steering indexes with
  `npm run steering:llm:pack` after command or steering-source changes.
