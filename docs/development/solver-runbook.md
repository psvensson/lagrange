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

`evidence add <path> --id <id>` uploads a file too large for git and records it
only after re-download and re-hash (`evidence relocate` moves already committed
bulk evidence the same way, see below); `board` lists open epics and quests.
Consult the generated reference for supported operations. Older frontier,
strategy-rung, `run`/`step` and generic executor instructions are retired.

`note` takes exactly one of `--finding`, `--attempt`, `--verification`,
`--blocked`, `--exhausted` or `--superseded`. A verification also takes
`--verifier subagent:<id>` and `--verdict approve|reject`. Changes under `src/`
cannot land without an approving verification newer than the last attempt.
The workflow's review requirement also covers changes to proof and acceptance
semantics; see [Workflow Validators](quest-validators.md#evidence-applicability-and-review)
for the distinction between that policy and the current automatic trigger.

## After A Rejection

Agree the candidate, affected interaction, acceptance and review scope before
review. The reviewer returns every reachable material finding together,
separating blocking defects from optional improvements and unrelated work.
Record rejection with `--verdict reject`, answer the complete set, and record
the next attempt with `note --attempt`. A rejection stands until an attempt
is newer than it; source landing then needs current independent approval.

Re-review the repairs and what they invalidate. Preserve applicable unaffected
findings and evidence; do not restart the entire review or widen its acceptance
for each round. A newly discovered concrete safety defect still needs a
disposition. Repeated rejection is a reason to reassess the design, evidence,
owner or review scope, without a fixed round count or an automatic human stop.

## When Landing Refuses

`land` refuses before it commits anything, and the refusal names the guard:

| Refusal | What it means |
| --- | --- |
| `doneWhen is not green` | the sealed probe does not yet measure success |
| `doneWhen differs from the sealed probe` | the acceptance criterion was edited after sealing; it is immutable, so supersede the quest instead |
| `paths outside epic ... authorizes` | a changed path is not authorised by the epic; record a justified scope decision under existing authority or leave it out; ask only if authority is missing |
| a verification entry is required | source landing lacks the required current independent approval; the note must identify reviewed content and evidence |
| `the newest verification is a rejection` | repair and record a newer attempt first |
| altitude-check budget exceeded | more than three attempts since the last altitude check need a recorded reassessment before landing; this is not a human-approval gate |

None of these is worked around. Each names the thing to fix.

## Deciding Without Asking

Existing authority in the session, quest and owning epic persists. The author
chooses routine diagnosis and implementation; an independent reviewer verifies;
the integration owner coordinates proof, acceptance and authorized landing or
publication. Make reasonable implementation choices and record material ones
as findings. Audit repair, review rejection or terminal landing does not by
itself transfer judgment to the user.

Ask the user when a product tradeoff, genuine scope change or outward action
needs authority that is absent. First resolve what existing decisions and
evidence already allow, then present the concrete remaining choice. Do not
ask again merely because a new agent or session takes over.

Reassess the lever when evidence stops supporting it: inspect the failing
interaction, ruled-out causes and missing observation before another patch.
Record an `altitude-check` finding when the existing landing guard requires
it (more than three attempts since the last such finding), or earlier when
useful. Repetition alone neither requires a new quest nor authorizes rewriting
its acceptance. A changed scope needs an explicit decision; a changed sealed
premise needs explicit supersession. Route a separate owner defect to its own
unit instead of enlarging the current repair indefinitely.

## Repair Acceptance And Current State

Before sealing, distinguish the bounded repair from the distributed service
milestone and from release acceptance. The repair's reproducer and affected
interaction determine its acceptance; the milestone keeps its public scenario
requirements; the publisher and release process keep their exact-candidate
gates. A repair that satisfies its sealed acceptance can close and integrate
while a wider scenario remains red for a different recorded cause. Link that
remaining cause and its owner. Do not reinterpret an already-sealed broad
predicate as a local one to declare success.

The integration owner keeps one mutable current summary in the existing epic.
Link the accepted baseline and evidence, current blocker and interaction owner,
work awaiting review/test/integration, and next action. Quest logs retain the
append-only history; contracts and receipts retain acceptance authority. This
summary replaces duplicate status prose, not those records. Start a later
session from it and follow only the links needed for the next action.
A standalone `class: fix` uses its existing quest record and log; do not create
an epic solely to hold a summary.

## Commit On Completion

When a unit of work is complete and coherent - a quest terminal, a bug fix, a
docs or tooling change, anything you would report as done - commit it. Do not
leave finished work sitting uncommitted waiting to be asked. Committing
completed work is durably authorised; a never-before-authorised push or publish
is not, and stays an authority boundary under R26.

Scope every commit to the work at hand, never sweeping unrelated dirty worktree
entries. `land` considers the changed paths in the worktree and enforces the
epic's authorised scope; keep unrelated work isolated rather than assuming it
will be ignored. Ad-hoc commits need the same deliberate scope control.

## Choosing What To Run In Parallel

Use one writer per changing interaction and one integration owner. An
interaction includes both sides of a coupled owner boundary and its contract;
separate files or worktrees alone do not make it independent. Investigations,
focused reviews and independent interactions can proceed concurrently. Count
items awaiting review, test and integration as WIP before admitting more work
that competes for the same owner or scarce runner. There is no fixed agent
count or project-wide ban on independent work.

Proof can run concurrently when its inputs and required capacity are independent.
Sequence dependent changes, measurements that share mutable state, and final
integration of one candidate. Consolidate reviewer findings before repair, and
prove the composed candidate through its existing interaction and publication
gates. Prefer completing an accepted repair over accumulating more unintegrated
patches on the same interaction.

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

A routing marker does not establish an installed trusted executor, write
credentials or native proof custody. Work authorized for physical lab execution
must establish that delivery path before publishing; a lab command's completion
alone is not a GitHub check or a native proof receipt. CI's proof range is the
event's actual push or pull-request base. Manual dispatch requires `base_sha`,
an exact commit already present in the checkout. An absent, zero or unreachable
base refuses the gate.

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

Every declared preparation producer is required in both local and placed exact
checkouts. A missing producer refuses before the gate or runner starts. This
supersedes the older-commit absence applicability recorded by
`clean-worktree-generated-import-graph`; its sealed history remains intact.
The exact gate owns preparation and command cancellation together: it preserves
the first observed nonzero exit or interruption, closes the acquired child and process
group, then checks integrity and finalizes diagnostic custody. Synchronous
retention and removal can still fail the overall run; they are not claimed to
be interruptible filesystem operations. Failed retention or uncertain child
cleanup keeps the original checkout. A Git removal refusal stops cleanup; it
never invokes prune, repeated force or recursive session-parent deletion.
The failure names the attempted path and leaves remaining evidence for inspection.

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
required invocation and its retained evidence.

Every exact-head corpus attempt has one retained record,
claimed before its files or log are opened. A repeated publish cannot restart a
red, lost or otherwise recorded attempt at the same SHA. A newer source keeps
its own obligation and does not cancel an older run. Reporting preserves all
records and first failures. Failed gate diagnostics remain under
`test-output/push-gate/`; repeated diagnostics use distinct directories and
routine output pruning does not remove them. If diagnostic retention fails,
the original checkout remains and the failure is explicit.
The local-corpus record owner reads an immutable admitted `<sha>.json` base and
at most two complete predecessor-bound successor files. The base is not a
mutable current-state mirror. All reporting, execution and reconciliation use
the same current-state reader. A stale writer loses the no-replace successor
claim and cannot replace a terminal outcome or start another execution.
Private `.corpus-transition-*` directories retain unsuccessful or uncertain
transition proposals; they are evidence, never an alternate state or receipt
reader. Each completed proposal has exclusive metadata naming its destination,
writer PID and exact byte digest. Discovery reports partial or unavailable private
evidence without adopting it or vetoing unrelated transitions. Committed records
are decoded as strict UTF-8 and predecessor identity hashes their original bytes.
A committed successor survives its writer's death without a persistent
lock to reclaim. Link, directory-flush and cleanup outcomes remain distinct;
an uncertain write never authorizes rollback, replay or receipt fabrication.
Only the creating invocation removes its successful staging. Retain other
staging and every committed node. Before using the new owner in an existing
shared state directory, establish closure of old mutable-record writers;
historical terminal records remain inert and reportable. This supplies no new
authority to restart an abandoned STARTING obligation or to equate a receipt
effect with an atomic terminal-state commit.
Reconciliation distinguishes a missing process from unavailable inspection.
Linux uses its proc command record and macOS uses a bounded system `ps` query;
failure of either observer never selects the other. A denied signal-zero probe,
failed command read, invalid recorded PID or unsupported observer is reported as
`observation UNAVAILABLE` while the running record remains unchanged. Other
records are still reconciled, and the next invocation observes the process
afresh. Only confirmed absence or a successfully observed non-corpus command
can mark the recorded process lost; observation never stops or replays it.
The hosted `full-corpus-canary` is a manual capability, not authority to use
hosted execution. Fix one-way
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
such a host as `placement: host-thermal-unfit NAME`; its assigned files remain
unmeasured and the run cannot pass. No other host or controller reruns them.
The local corpus records the refusal as lost, not red. A lab shard also caps every
lane at the host's own processor count less one (`LAGRANGE_LANE_JOBS_CAP`,
shown in its `placement-env` line). `LAGRANGE_SKIP_THERMAL_GATE=1` is carried
by an already-gated batch to avoid gating a nested runner twice; it is not
permission for an operator to bypass thermal admission.

Lab hosts are shared by agents across projects through one machine-wide lock
per host and a holder record beside it (`docs/development/home-lab.md`,
"Sharing the lab between agents and projects"). Heavy work reaches a lab host
only through `lab test`, placement or `lab harness run` - never a raw ssh
runner invocation, which takes no lock and which no other agent can see. A
placed shard waits for a held host no longer than its own estimate (at most
30 minutes); still held, the host is reported as
`placement: host-busy NAME held-by AGENT since STARTED`, and the assigned shard
remains unavailable. Initial placement uses current ready hosts; a failed or
refused assignment never moves elsewhere within that proof. `lab fleet` shows who holds each
machine; set `LAGRANGE_LAB_AGENT` (for example `claude:SESSION`) to name
yourself in the record.
Waiting or refused work does not become a completed sample.

A failed, unavailable or interrupted placed attempt retains its original
checkout, TAP and acquired source inputs. A new attempt never purges an older
scope, and a colliding attempt identity refuses before overwriting it. Only a
known closed, successful attempt removes its own checkout through Git; removal
refusal makes that attempt unavailable and preserves its remaining evidence.
Placement logs and retained placement/planning worktrees are reserved from
generic age pruning. Planning release is attempted once; a later request gets
the same result, and cleanup cannot replace an earlier error or nonzero exit.

Cancellation distinguishes the placement shell PID, lock waiter PID and
acquired preparation/runner group. The shell has one 2-second TERM stage and
one 2-second forced-closure stage within the existing 5-second abort grace;
repeated signals do not extend it. Signal delivery alone does not prove
closure. Lost acquired formation holds are adverse. The streaming controller
and capture wait for their owned pipes on ordinary completion; capture expiry
explicitly reports incomplete output and unconfirmed group closure within its
existing bound. Harness cleanup attempts every acquired release and preserves
the primary outcome through later disposal or reporting failures.
This supersedes the active all-exits deletion and next-attempt purge policies
from the older placement work while preserving its sealed history and bounds.

Documentation-only planning, roadmap and policy changes use the
[documentation-only proof scope](../../test/guidelines/release-gate.md#documentation-only-changes).
Their approval requires the applicable documentation checks and review, not a
new runtime or whole-corpus run. It does not create or transfer a runtime receipt.

For changes that require corpus proof, a head merged through GitHub met neither
this hook nor the publisher, so it has NO corpus proof until
`npm run publish -- --post-merge <sha>` has run for it.
That arm refuses a sha that is not on the first-parent history of origin/main,
already holds the whole-corpus receipt, or already has any corpus attempt
record, then starts the same detached
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

Land, CI, the push gate and detached corpus now execute each scheduled file
once. A failed command,
failed file, zero-assertion file or missing result blocks acceptance; later
green output cannot erase it. A release-proof obligation remains a refusal of
the change proof until its canonical owner satisfies it.

The user-authorized `publication-single-pass-evidence` Quest supersedes the
active retry and corpus supersession policies formerly proved by
`land-retry-parity` and `local-corpus-canary`, plus the last-verdict-wins and
retry-green omission policies in `failed-gate-keeps-evidence`. The latter's
single retention owner and synchronous runner constraints remain applicable.
Their sealed historical records remain unchanged. A repaired source SHA
receives a fresh measurement; separate
diagnostic measurements retain their own evidence and cannot replace the
original failed or uncertain attempt.

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
