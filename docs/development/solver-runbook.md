---
audience: development
---

# Solver Operator Runbook

Example-oriented operator aid for landing, publishing and repairing. It defines
no policy and no second boot sequence: the load order is owned by
[`AGENTS.md`](../../AGENTS.md), the binding workflow by
[`solver-quests.md`](../steering/workflow-guidelines/solver-quests.md), and the
generated CLI reference by
[`solve-commands.md`](../steering/generated/solve-commands.md).

## Complete Quest Example

First choose the [direct or Quest route](../steering/workflow-guidelines/solver-quests.md#choosing-the-unit).
An eligible direct change records scope, applicable checks and required review
in its existing PR/review record, then commits and publishes. It needs no Quest
solely for independent review. The example below is for work requiring a Quest.

Prepare `solve/quests/<id>/quest.json` and a newline-delimited assignment file
containing exact repository-relative paths or directory prefixes ending in `/`,
including generated outputs. Then use the supported commands:

```sh
quest_id='<quest-id>'
paths_file='/path/to/reviewed-paths.txt'
node scripts/solve.js start --id "$quest_id"  # requires a measuring red probe
node scripts/solve.js note --id "$quest_id" --assignment '<bounded scope>' \
  --paths-file "$paths_file" --authority '<existing task/scope authorization>'
```

Implement and measure the bounded change, retain its evidence, and refresh the
required generated outputs with their existing producers (for example,
`npm run steering:generate` for generated steering). Isolate unrelated changes
and record the completed attempt before independent review:

```sh
node scripts/solve.js note --id "$quest_id" --attempt '<change and measurement>'
node scripts/solve.js probe --id "$quest_id"  # measures; submits no test job
```

Have an independent reviewer inspect the complete candidate and acceptance
inputs. Only after that review, record its actual verdict. An approval example is:

```sh
node scripts/solve.js note --id "$quest_id" --verification '<review and evidence>' \
  --verifier 'subagent:<reviewer-id>' --verdict approve
node scripts/solve.js land --id "$quest_id"  # rechecks, proves and commits
npm run publish                             # within existing publication authority
```

A repair after review requires a new attempt and affected re-review before
landing. `land` collects all changes and never pushes. The
[validator owner](quest-validators.md#required-conduct-and-executable-coverage)
describes scope and content-binding checks; the
[publication section](#publish-and-git-exceptions) describes the exact-candidate
route and its documentation-only proof scope.

Use the generated [command reference](../steering/generated/solve-commands.md)
for every supported `note` disposition and flag. `board` projects open work;
`evidence add` verifies custody before recording an upload. Its current
[hold-clearing side effect](quest-lifecycle.md#current-vocabulary) still requires
re-recording an unresolved hold. Older frontier, rung, `run`/`step` and generic
executor instructions are retired.

## After A Rejection

Use [bounded independent review](quest-subagents.md#bounded-independent-review)
for scope, consolidated findings and applicability on re-review. Record the
actual rejection with `note --verification ... --verdict reject`, answer the
findings, and record the repair with `note --attempt`. A standing rejection
blocks landing; where review is required, obtain current independent approval
after the last attempt. Re-review the repairs and what they invalidate rather
than silently widening acceptance or restarting unaffected review.

## When Landing Refuses

`land` refuses before it commits anything, and the refusal names the guard:

| Refusal | What it means |
| --- | --- |
| `doneWhen is not green` | the sealed probe does not yet measure success |
| `doneWhen differs from the sealed probe` | the acceptance criterion was edited after sealing; it is immutable, so supersede the quest instead |
| assignment or epic scope refusal | record the missing package assignment, isolate unrelated paths or append an authorized amendment within the epic's outer scope; ask only if authority is missing |
| a verification entry is required | source landing lacks the required current independent approval; the note must identify reviewed content and evidence |
| `the newest verification is a rejection` | repair and record a newer attempt first |
| altitude-check budget exceeded | more than three attempts since the last altitude check need a recorded reassessment before landing; this is not a human-approval gate |

None of these is worked around. Each names the thing to fix.

## Deciding Without Asking

Use the [existing delivery roles](quest-subagents.md#roles-and-concurrency) and
[publication authority](../steering/workflow-guidelines/solver-quests.md#publication-authority).
Routine diagnosis, audit repair and authorized landing remain agent decisions.
Resolve existing authority before asking for a missing product/scope decision;
a new session, review rejection or repeated symptom is not itself a user stop.

When evidence refutes a hypothesis, reconsider its owner, witness and scope.
Record an `altitude-check` finding when the landing guard requires it (more than
three attempts since the last such finding), or earlier when useful. Amend a
necessary scope under existing authority; explicitly supersede a changed sealed
premise. Route a separate owner defect to its own unit.

## Repair Acceptance And Current State

Use [Separate Acceptance Claims](../../test/guidelines/release-gate.md#separate-acceptance-claims)
before sealing. A completed repair can integrate while a separately recorded
cause keeps the service milestone red; do not reinterpret a broader seal.
Resume from the epic's [current work](documentation-lifecycle.md#current-summaries-and-steering-revisions),
which links authoritative records and next actions. A standalone `class: fix`
uses its existing Quest record and log, without a new summary epic.

## Commit On Completion

When a unit of work is complete and coherent - a quest terminal, a bug fix, a
docs or tooling change, anything you would report as done - commit it. Do not
leave finished work sitting uncommitted waiting to be asked. Committing
completed work is durably authorised; a never-before-authorised push or publish
is not, and stays an authority boundary under R26.

Scope every commit to the work at hand, never sweeping unrelated dirty worktree
entries. `land` collects staged, unstaged and nonignored untracked paths and
checks the current package assignment plus applicable epic scope. It does not
select the assignment's files out of a mixed worktree. Keep unrelated work
isolated and include required generated outputs in the reviewed assignment.
Ad-hoc commits need the same deliberate scope control.

## Choosing What To Run In Parallel

Follow [Roles And Concurrency](quest-subagents.md#roles-and-concurrency): one
writer per changing interaction, independent investigation/review in parallel,
and serialized dependent integration. Proof can run concurrently only when its
inputs and required capacity are independent. Sequence work sharing mutable
state and prove the composed candidate through its existing gates.

## Proof Cost And Waiting For Capacity

Use the smallest existing proof that discriminates the suspected owner defect,
then the affected interaction proof. Reuse accepted evidence only when the
existing selection and receipt rules establish its applicability, including
dependencies, callers, configuration and environment. A passing old run or
unchanged file name is insufficient. Run the missing or invalidated proof;
retain exact-candidate final gates and the milestone's public scenario checks.

Shared-runner waits are work state, not completion. Record the actual submitted
request or run id, revision, workload, status and owner or mechanism that will
observe completion and resume. If no request was accepted, say "not submitted"
and name the next action. If there is no active continuation, say so. `probe`
reads evidence and cannot submit or resume a run. Do not invent a queue, status
or background supervisor that the current tools do not implement.

When delays recur, retain request, start and finish times from existing run
artifacts and review/integration records. Use those timings to distinguish
waiting for capacity, execution, repeated review and integration delay before
changing scheduling or buying more capacity. Keep this evidence with the
current work rather than creating a second tracking system.

## Authorizing An Outward Action

An action that cannot be taken back, or that leaves this repository, needs the
operator's existing authority under the
[workflow policy](../steering/workflow-guidelines/solver-quests.md#publication-authority).
Standing publication authority applies only to the authorized task and
destination, subject to current user restrictions. Do not ask again for that
same authority or infer it from a successful command.

The action owner checks registered command inputs. The
[known coverage gaps](../steering/router.md#known-owner-gap) remain real:
workflow publication and some Git operations are not automatically guarded.
Their executability is not authorization. Registered inputs include:

| Action | What authorizes it |
| --- | --- |
| publishing a landed head | existing standing authority for this task and destination; the command takes no extra authorization flag |
| pushing onto a red shared branch | `--fixes-red <the head it is red at> --reason "<why>"` |
| routing a push to another runner | the marker in the reviewed head commit *and* `--runner` |
| gating without the dataset | `--allow-missing-data` |
| replacing a published evidence asset | `evidence add --replace`; without it the upload does not clobber |
| publishing the package | `--authorize-version <version>`, which must equal the version about to go out |
| creating cloud hosts | `LAGRANGE_AUTHORIZE_CLOUD_PROJECT=<project>`, which must equal the project being provisioned |

A refusal names what it wanted. Naming the wrong version, the wrong project or
the wrong head is a refusal, not a warning: authorizing one thing never
authorizes another.

## Documentation-Only Publication

For documentation-only planning, roadmap and policy changes, apply the
[documentation-only proof scope](../../test/guidelines/release-gate.md#documentation-only-changes).
Commit the reviewed candidate to a branch and use a GitHub PR for publication.
Before merging, verify the actual candidate, applicable documentation, rule-set,
link and generated-consistency checks, required independent review, and ordinary
GitHub required checks and merge controls. Existing task and destination authority
still governs the action. Record the merged SHA and the actual check outcomes.

The current `npm run publish` has no documentation-only mode: it runs runtime
gates and can schedule remaining corpus work. The PR route satisfies the scoped
documentation policy without invoking that extra runtime work. It does not
bypass a required check, authorize a different execution substrate, or create
or transfer a runtime/corpus receipt. Accompanying executable behavior or
acceptance-predicate changes retain their own proof and publication requirements.

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

Select the authorized execution route before publication under
[home-lab workload policy](home-lab.md#workload-capability-and-continuation).
The publisher's current default CI route is GitHub-hosted; selecting self-hosted
CI requires `[ci:self-hosted]` in the already-reviewed HEAD commit message and
`--runner self-hosted`. The publisher validates the marker and never amends it.
This CI switch alone does not place every preparation or local gate stage on the
lab. Do not invoke a default or fallback that violates the current work's runner
restriction; inspect the installed route and record any capability gap with its
existing owner.

When origin/main advances only by inert data commits (the nightly formation
trend), the publisher rebases local commits over them, refusing a dirty tracked
tree or conflict. Direct non-`main` branch pushes are preservation actions: the
hook skips the local proof gate so committed WIP can be retained remotely. That
branch is not Quest-land, merge, release or publication approval.
`LAGRANGE_PUSH_PROVE_BRANCH=1` requests the full branch push gate only where its
execution route is authorized.

Pushes that update `main` still take the full gate. If that exact tree already
passed `test:gate:postpush`, the existing proof owner must establish receipt
applicability before the supported repeated-test-stage reuse is used; required
static and exact-candidate publication checks still run. A skip flag is not
evidence. `--no-verify` bypasses every gate and is not an acceptance or emergency
publication route under R23.

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

WIP preservation never supplies missing pre-commit, review or publication
evidence. Before accepted integration, satisfy the applicable guards on the
actual candidate; skipping a gate to obtain a green state is what R23 forbids.

The pre-push hook is fast-fail ordered: unused files, tracked-file lint,
duplication/file-size ratchets, cycles, unused exports, then the test stage
(`npm run test:static` executes ~30 static checkers in parallel waves via
`scripts/checks/run-static-audits.js`, while the pre-commit and pre-push
preflight tiers remain the fastest inner-loop checks):
the focused contracts and audits, and last the change proof - the same
`npm test` selection CI runs, fed the remote sha of main as its base - or the
whole corpus when that proof cannot stand for it (a refused selection, a change
to the selection machinery, runner, hook or package manifests, a cone above
half the corpus, no committed range, or `LAGRANGE_PUSH_FULL_CORPUS=1`). The
stage prints which it chose and why. The current publisher can then start a
detached remainder-corpus run placed across local/lab machines; the next publish
reports a recorded red result first (`publish: !!! the local corpus was RED`).
This behavior is subject to the authorized substrate and
[proof coordination and custody](home-lab.md#proof-coordination-and-custody)
requirements. A process exit or receipt file alone does not establish every
required invocation and its retained evidence. The hosted `full-corpus-canary`
is a manual capability, not authority to use hosted execution. Fix one-way
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
`placement: host-thermal-unfit NAME`. Keep the refusal and unexecuted invocations
visible; re-place only work that did not execute, on another authorized host,
under the same coordinator and plan. A current runner that falls back to the
controller cannot be used that way for lab-only work. A lab shard also caps every
lane at the host's own processor count less one (`LAGRANGE_LANE_JOBS_CAP`, shown
in its `placement-env` line). `LAGRANGE_SKIP_THERMAL_GATE=1` is carried by an
already-gated batch to avoid gating a nested runner twice; it is not permission
for an operator to bypass thermal admission.

Lab hosts are shared by agents across projects through one machine-wide lock
per host and a holder record beside it (`docs/development/home-lab.md`,
"Sharing the lab between agents and projects"). Heavy work reaches a lab host
only through `lab test`, placement or `lab harness run` - never a raw ssh
runner invocation, which takes no lock and which no other agent can see. A
placed shard waits for a held host no longer than its own estimate (at most
30 minutes); still held, the host is reported as
`placement: host-busy NAME held-by AGENT since STARTED`. Waiting or refused work
does not become a completed sample, and later placement follows the same
authorized-substrate and invocation-accounting rules as a thermal refusal.
`lab fleet` shows who holds each machine; set `LAGRANGE_LAB_AGENT` (for example
`claude:SESSION`) to name yourself in the record.

For documentation-only changes, use the
[scoped PR route](#documentation-only-publication) above.

For changes that require corpus proof, a head merged through GitHub met neither
this hook nor the publisher, so it has NO corpus proof until
`npm run publish -- --post-merge <sha>` has run for it.
That arm refuses a sha that is not on the first-parent history of origin/main
or that already holds the whole-corpus receipt, then starts the same detached
local corpus - the whole corpus, since no local gate proved a cone - which
records the receipt when green; it pushes, stages and amends nothing. Prefer
landing source changes through the publisher. The generated test metadata,
the owner-debt inventory and the src directory indexes carry
`merge=lagrange-generated` in `.gitattributes`, a driver `npm run hooks:install`
configures: a merge keeps ours instead of conflicting, and the merged tree owes
`npm run -s test:metadata:refresh` and
`node scripts/generate-global-owner-debt-inventory.js` (`--refresh` when its
inputs are absent), then `npm run generate:source-owner-index`, before it is
pushed.

`solve land` measures the Quest delta with the change-proof base pinned to
`HEAD`: the index it is about to commit differs from HEAD by the staged Quest
scope, and the log announces that base. The branch-vs-remote range remains the
push gate's separate composition proof. Retain applicable earlier evidence
through the existing proof owner without replacing exact-candidate requirements.

Some current entrypoints still request standalone retries through
`LAGRANGE_RETRY_FAILED_ONCE=1`. That implementation behavior does not authorize
retry-to-green acceptance. Apply the
[proof result and custody requirements](home-lab.md#proof-coordination-and-custody):
retain the first unexpected failure or interruption, give a justified later
attempt its own identity, and keep every observed outcome. A combined receipt
that hides an earlier required failure or missing invocation cannot establish
acceptance. Record and repair any such enforcement gap through the existing
proof/publication owner; a documentation revision does not repair that code.

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

Upload evidence with `node scripts/solve.js evidence add <path> --id <id>`;
the record is written only after the asset is downloaded again and re-hashed.

Bulk evidence that is already committed (lab logs, TAP, large JSON dumps,
archives; the threshold is in
[`quest-artifacts.md`](quest-artifacts.md#bulk-evidence-goes-to-the-store))
leaves the tree as one verified bundle per quest:

```sh
node scripts/solve.js evidence relocate --id <quest> --paths-file <list> \
  --source-commit <pushed sha> [--record-to <quest>] [--label <name>] --dry-run
node scripts/solve.js evidence relocate --id <quest> --paths-file <list> \
  --source-commit <pushed sha> [--record-to <quest>] [--label <name>]
```

The dry run prints the plan (files, bytes, bundle name) and touches nothing.
The real run uploads through `evidence add` (no overwrite; a closed quest
takes no entry, so name an open `--id`), downloads the bundle again, hashes
every member against its manifest and the blob at the source commit, writes
the inventory shard and the verification record to
`solve/changes/evidence-relocation/<record-to quest>/` (never under a quest's
`evidence/`, so closing the record quest keeps it on shape), and stages the
removals with `git rm`. Commit them, records included, with the hooks
running; the inventory maps each old path to its bundle.
