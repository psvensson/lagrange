---
audience: development
---

# Solver Operator Runbook

Example-oriented operator aid for landing, publishing and repairing. It defines
no policy and no second boot sequence: the load order is owned by
[`AGENTS.md`](../../AGENTS.md), the binding workflow by
[`solver-quests.md`](../steering/workflow-guidelines/solver-quests.md), and the
complete generated CLI reference by
[`solve-commands.md`](../steering/generated/solve-commands.md).

## The Four Verbs

```sh
node scripts/solve.js start --id <id>       # seals against a red probe
node scripts/solve.js note  --id <id> --attempt "<what changed>"
node scripts/solve.js probe --id <id>       # measures doneWhen, changes nothing
node scripts/solve.js land  --id <id>       # guards, tests, commits; never pushes
```

Two more exist: `evidence add <path> --quest <id>` uploads a file too large for
git and records it only after re-download and re-hash, and `board` lists open
epics and quests. There are no others; anything else you have seen written down
is a retired v1 operation.

`note` takes exactly one of `--finding`, `--attempt`, `--verification`,
`--blocked`, `--exhausted` or `--superseded`. A verification also takes
`--verifier subagent:<id>` and `--verdict approve|reject`. Changes under `src/`
cannot land without an approving verification newer than the last attempt.

## After A Rejection

Record the rejection as a verification with `--verdict reject`, repair, then
record the next attempt with `note --attempt`. A rejection stands until an
attempt is newer than it; there is no separate corrective verb.

## When Landing Refuses

`land` refuses before it commits anything, and the refusal names the guard:

| Refusal | What it means |
| --- | --- |
| `doneWhen is not green` | the sealed probe does not yet measure success |
| `doneWhen differs from the sealed probe` | the acceptance criterion was edited after sealing; it is immutable, so supersede the quest instead |
| `outside the scope of <epic>` | a staged path is not authorised by the epic; widen the epic explicitly or leave the change out |
| a verification entry is required | an independent verifier has not approved this tree |
| `the newest verification is a rejection` | repair and record a newer attempt first |

None of these is worked around. Each names the thing to fix.

## Deciding Without Asking

Relocated from the retired always-load pack, whose "Default Posture: Autonomy"
stated it. R16 says which actions need authority you do not already have.
Everything outside that is autonomous: choose the obvious default, record a
finding stating the choice and why, and keep going. Surface the decisions in
the final report, not mid-run. Pausing on a question the repository, the quest
or a sensible default already answers costs more than a recorded wrong guess
about how, which the next attempt corrects.

Questioning a quest's altitude is not pausing and is not moving goalposts. When
the evidence says the real lever is an owner boundary the sealed scope cannot
touch, record the insight, end the quest honestly, and author the higher one.

## Commit On Completion

Relocated from the retired always-load pack, whose "Default Posture: Commit On
Completion" and must-not #16 stated it. It applies to ad-hoc work as much as to
a quest, so it needs a home that ad-hoc work reaches.

When a unit of work is complete and coherent - a quest terminal, a bug fix, a
docs or tooling change, anything you would report as done - commit it. Do not
leave finished work sitting uncommitted waiting to be asked. Committing
completed work is durably authorised; a never-before-authorised push or publish
is not, and stays an authority boundary under R16.

Scope every commit to the work at hand, never sweeping unrelated dirty worktree
entries. For a quest the landing guard already does this by staging only the
quest's own scope; ad-hoc work has to do it deliberately.

## Choosing What To Run In Parallel

Also relocated from the retired pack. Independent sub-tasks run concurrently:
batch independent reads and searches into one step, verify N independent
findings with N concurrent verifiers, and use the workflow harness for broad
mechanical sweeps. Serialize only when outputs feed each other or when workers
would mutate the same files, in which case isolate them in worktrees or order
the writes. Parallelism applies to the work, never to the proof: verification,
measurement and one-quest-per-commit stay serial.

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

`LAGRANGE_SKIP_PRECOMMIT=1` skips the pre-commit guard. It is for a work-in-
progress branch only, never for a commit that lands source on the shared
branch: skipping a gate to obtain a green state is exactly what R23 forbids.

The pre-push hook is fast-fail ordered: unused files, tracked-file lint,
duplication/file-size ratchets, cycles, unused exports, then the long post-push
test corpus. Fix one-way ratchets rather than raising their baselines.

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
