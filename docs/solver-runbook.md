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

## Verify And Checkpoint Source Work

After a source attempt, run the cheap attempt checks and the read-only
hypothetical checkpoint before delegating review:

```sh
npm run audit:attempt-preflight
node scripts/solve.js checkpoint --id my-quest --dry-run
node scripts/solve.js next --id my-quest --json
```

The checkpoint output may refuse on the intentionally missing approval, but its
verification preflight must say the candidate will be checkpoint-landable after
the required approval. That projection applies the same narrow integrity,
change-artifact, and exact-verification checks as checkpoint. Otherwise record
the same-frontier/same-base canonical
replacement and complete path superset it names first. `solve next` supplies the
exact attempt/base/path dossier, older uncheckpointed receipts, replacement
obligations, aggregate context, and applicable templates. Give that whole first
pass to an independent subagent, then record its exact approval:

```sh
node scripts/solve.js finding --id my-quest --frontier my-quest-main \
  --kind verifier-approval \
  --claim "Independent verification passed" \
  --evidence subagent:<id> \
  --verification-scope attempt \
  --verification-fingerprint sha256:<attempt-fingerprint>

node scripts/solve.js checkpoint --id my-quest
```

The finding is append-only and has no commit side effect. Checkpoint immediately
after approval; until then, treat the complete covered path union as frozen.
`checkpoint` refuses if the patch or its current path-limited Git delta changed
after approval. It commits only the Quest scope and never pushes.

## Terminal Verification And Handoff

At SOLVED or EXHAUSTED, source-changing work needs a fresh approval of the
aggregate fingerprint that `solve next` prints. A single canonical attempt may
use `--verification-scope both` only when the attempt and aggregate fingerprints
are identical.

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
