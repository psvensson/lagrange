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
is a retired v1 operation. The landing guard itself answers, read-only, whether
every production-surface (`src/`, `vendor/`) change a range brings is a solver landing, which is what the main
push gate asks: `node scripts/solve/guards.js admit --base <sha> --head <sha>`.

`note` takes exactly one of `--finding`, `--attempt`, `--verification`,
`--blocked`, `--exhausted` or `--superseded`. A verification also takes
`--verifier subagent:<id>` and `--verdict approve|reject`. Production-surface
changes cannot land without an approving verification newer than the last attempt.

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
docs or tooling change, anything you would report as done - commit it. A
production-surface change (`src/`, `vendor/`) is committed only by `land`, however small: the main push
gate refuses a direct one, naming the commit and its paths. Do not
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

## Authorizing An Outward Action

An action that cannot be taken back, or that leaves this repository, is
performed only where the operator's authority for it already exists (R26). One
component decides that, and every such action in this repository's own code
asks it before acting. What it wants is what you supplied, never what the
command could work out for itself:

| Action | What authorizes it |
| --- | --- |
| publishing a landed head | the standing authority to publish what has landed; nothing to pass |
| pushing onto a red shared branch | `--fixes-red <the head it is red at> --reason "<why>"` |
| routing a push to another runner | the marker in the reviewed head commit *and* `--runner` |
| gating without the dataset | `--allow-missing-data` |
| replacing a published evidence asset | `evidence add --replace`; without it the upload does not clobber |
| publishing the package | `--authorize-version <version>`, which must equal the version about to go out |
| creating cloud hosts | `LAGRANGE_AUTHORIZE_CLOUD_PROJECT=<project>`, which must equal the project being provisioned |

A refusal names what it wanted. Naming the wrong version, the wrong project or
the wrong head is a refusal, not a warning: authorizing one thing never
authorizes another.

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
`--runner self-hosted`; publish validates the marker and never amends; when
origin/main advanced only by inert data commits (the nightly formation trend)
it rebases the local commits over them, refusing on a dirty tracked tree or a
conflict. Direct branch pushes are preservation actions. A normal `git push` to one or
more non-`main` branch refs skips the local proof gate so a committed WIP can
always be preserved remotely; that remote branch is not Quest-land, merge,
release or publication approval. Set `LAGRANGE_PUSH_PROVE_BRANCH=1` when you
deliberately want the full local push gate on a feature branch.

Pushes that update `main` still take the full gate. If that exact tree already
passed `test:gate:postpush`, `LAGRANGE_PUSH_SKIP_TESTS=1 git push` skips only
the repeated test stage; static checks still run. `--no-verify` skips every
gate and is emergencies-only.

Whichever path runs the hook, it proves the pushed sha and nothing else: outside
an exact checkout it materialises the first pushed local sha once into a
throwaway worktree under `test-output/push-gate-worktrees/` (workspace
injections declared, the pushed ref lines forwarded) and re-runs every stage
there; an uncommitted edit in the working tree is invisible to the gate, and a
stage that mutates the checkout refuses the push. A manual invocation gates
`HEAD`. The stages and the tree each reads are declared in
`test/manifests/pre-push-stages.json`; the selection also widens to every test
that observes a changed path without importing it (a fixture read through fs,
a listed directory, a spawned script), from the observation census in
`test/shards/subsystem-classes.json`, and refuses when that census has drifted
(`node scripts/generate-test-subsystem-classes.js` regenerates it).

`LAGRANGE_SKIP_PRECOMMIT=1` skips the pre-commit guard. It is for a work-in-
progress branch only, never for a commit that lands source on the shared
branch: skipping a gate to obtain a green state is exactly what R23 forbids.

The pre-push hook is fast-fail ordered: unused files, tracked-file lint,
duplication/file-size ratchets, cycles, unused exports, then the test stage:
the focused contracts and audits, and last the change proof - the same
`npm test` selection CI runs, fed the remote sha of main as its base - or the
whole corpus when that proof cannot stand for it (a refused selection, a change
to the selection machinery, runner, hook or package manifests, a cone above
half the corpus, no committed range, or `LAGRANGE_PUSH_FULL_CORPUS=1`). The
stage prints which it chose and why. When the gate proved a cone, the
publisher then proves the rest of the corpus for that commit locally, detached
and placed across the lab machines, and records the whole-corpus receipt when it
is green; the next publish reports a red one first (`publish: !!! the local
corpus was RED`). The hosted `full-corpus-canary` runs only by hand. Fix one-way
ratchets rather than raising their baselines.

Thermal headroom is the classified runner's to gate
(`scripts/run-classified-test-files.js`), on every host it runs on - the
controller, the local corpus and every placed lab shard alike. Before each lane
batch it asks the one thermal owner, `scripts/checks/wait-for-thermal-headroom.js`
(lm-sensors, else the Linux sysfs; Intel or AMD, each temperature named by
the source that answered), and prints its decision in the run's stream, which
a placed run relays: `thermal: ok cpu 61C (k10temp/Tctl) nvme 66C
(nvme/Sensor 2)`, `thermal: hold ... waiting 30s` (the batch waits),
`thermal: unmeasurable (no sensors)` (said once; the run proceeds). A host
that measures only one of the two gates on that one. A host still hot after the owner's twenty polls ends
the run with the typed refusal `thermal-headroom-exhausted`: exit 75, no batch
started hot, and a summary line naming every file not run. Placement reports
such a host as `placement: host-thermal-unfit NAME` and sends its unproved
files on as it does a held host's: to the next ready host the run has not
tried, else the controller, never again to that host in the same run; the
local corpus records the refusal as lost, not red. A lab shard also caps every
lane at the host's own processor count less one (`LAGRANGE_LANE_JOBS_CAP`,
shown in its `placement-env` line). `LAGRANGE_SKIP_THERMAL_GATE=1` is the one
skip, and every gated batch carries it so a runner nested in a test does not
gate twice.

Lab hosts are shared by agents across projects through one machine-wide lock
per host and a holder record beside it (`docs/development/home-lab.md`,
"Sharing the lab between agents and projects"). Heavy work reaches a lab host
only through `lab test`, placement or `lab harness run` - never a raw ssh
runner invocation, which takes no lock and which no other agent can see. A
placed shard waits for a held host no longer than its own estimate (at most
30 minutes); still held, the host is reported as
`placement: host-busy NAME held-by AGENT since STARTED`, and the shard goes to
the next ready host, then to the controller - the one re-placement a hot host
gets too. `lab fleet` shows who holds each
machine; set `LAGRANGE_LAB_AGENT` (for example `claude:SESSION`) to name
yourself in the record.

A head merged through GitHub met neither this hook nor the publisher, so it has
NO corpus proof until `npm run publish -- --post-merge <sha>` has run for it.
That arm refuses a sha that is not on the first-parent history of origin/main
or that already holds the whole-corpus receipt, then starts the same detached
local corpus - the whole corpus, since no local gate proved a cone - which
records the receipt when green; it pushes, stages and amends nothing. Prefer
landing source changes through the publisher. The generated test metadata and
the owner-debt inventory carry `merge=lagrange-generated` in `.gitattributes`,
a driver `npm run hooks:install` configures: a merge keeps ours instead of
conflicting, and the merged tree owes `npm run -s test:metadata:refresh` and
`node scripts/generate-global-owner-debt-inventory.js` (`--refresh` when its
inputs are absent) before it is pushed.

A merge that brings unlanded production-surface commits to `main`, or changes
that surface itself (anything but a path only the other side changed), needs an
exact-commit receipt for the merge commit BEFORE the push: build the merge locally, run
`npm run check:release` on it, and record what it prints,
`node scripts/proof-authority.js record release-full-v1 <merge sha>`. That is
the only honest producer for a sha not yet on `main`; the publisher records
after a push. An emergency revert of a red `main` is no exception: it is a
quest whose probe is the red witness, landed with the revert as its change.
The code on the remote `main` judges a main push; if that code itself fails,
every main push is refused, and the one way past is the documented emergency
`git push --no-verify` (it skips every stage) with the owner's authorisation,
pushing the repair. An exact-SHA owner authorisation for a materially stale
branch merge has no recording owner yet: `scripts/action-authority.js` decides
registered actions and writes no record, and registers no merge action (the
follow-up quest `stale-branch-authority-drift` adds it).

`solve land` proves the quest delta, not the branch: its `npm test` runs with
the change-proof base pinned to `HEAD` (the index it is about to commit
differs from HEAD by exactly the staged quest scope), and it announces that
base in its log. The branch-vs-remote range is the push gate's proof above,
which is where two landed quests' interaction is proved. Before this
(2026-09-17) a land on a branch carrying earlier quests proved them all
again every time - 1927 tests for a one-file repair. The same proof runs
under the retry policy CI records (`LAGRANGE_RETRY_FAILED_ONCE=1`): a failed
file is rerun once standalone, the rerun is reported and capped at five
files, a standalone failure stays red. A flake no longer costs a re-land,
and a persisting red still refuses.

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
