---
id: apparatus-release-consolidation
status: open
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/apparatus-release-consolidation-budget.js --metric
quests:
  - consolidation-budget-check
  - release-pipeline-dry-run
  - formation-health-verdicts
  - public-claims-match-shipped-bytes
  - publish-gate-hygiene
  - lean-push-gate
  - script-reachability-cull
  - workflow-budget
  - epic-board-curation
  - ratchet-realignment
  - test-file-content-receipts
  - raft-ownership
  - proof-authority-integrity
  - gate-work-consolidation
  - single-metric-production
  - land-proves-the-quest-delta
  - convergence-probe-class-observed
  - test-runner-loader-diet
  - lane-dispatch-lpt-order
  - land-retry-parity
  - wait-definite-negative
  - static-test-hygiene
  - lane-parallelism-measurement
  - canary-on-lab-node
authorizes:
  - scripts
  - test
  - .github
  - .githooks
  - docs
  - data
  - solve/epics
  - README.md
  - RELEASE.md
  - CHANGELOG.md
  - CLAUDE.md
  - package.json
  - package-lock.json
  - src/raft
---

# Apparatus and release consolidation

The September 2026 reviews (6th and 12th) produced a list of improvements.
solve-v2 delivered the quest-system half; this epic holds everything still
open on the product side of the line: a release pipeline that ships, public
claims that match shipped bytes, an apparatus that stops growing, source-shape
ratchets that stop producing worse code, an epic board that means something,
and a Raft implementation the project owns. Formation is **not** here — it is
`formation-seed-decoupling`, a certification epic with its own proof shape.

`doneWhen` is the budget script: it prints the number of unmet budgets and
the epic is done at zero. Every budget below is numeric and read from the
tree; the two that need evidence from outside the tree (a release receipt, a
formation trend) read compact text files that their quests commit.

## Budgets (measured by `scripts/checks/apparatus-release-consolidation-budget.js`)

| Budget | Now (2026-09-12) | Target |
| --- | --- | --- |
| Newest release receipt: npm, Docker, Helm, GitHub all published | none | present |
| Formation trend: last 3 scheduled verdicts measuring (no `UNKNOWN`) | untracked, 0/0 | 3 |
| README documents only a published version and a measured formation claim | stale | 0 offences |
| Loose top-level files in `scripts/` | 380 | ≤ 80 |
| `scripts/` total lines | 149,650 | ≤ 90,000 |
| `scripts/checks/` files | 185 | ≤ 190 |
| `.github/workflows/` total lines | 925 | ≤ 500 |
| `release.yml` named steps | 21 | ≤ 12 |
| Gate chains (`check`, `test:static`, attempt preflight) reference the literals checker | yes | 0 |
| Gate chains reference the file-length audit | yes | 0 (function-length instead) |
| `src/**/*-methods.js` files | 160 | ≤ 160 (no growth) |
| Open epics (incl. this one and formation) | 26 (10 on 2026-09-13) | ≤ 12 (owner decision 2026-09-13: the remaining open epics all carry live quests; a target met only by closing live work is a wrong number) |
| Open epics still `legacy: true` | 20 (0 on 2026-09-13) | 0 |
| Open epics without a `doneWhen` | 20 (0 on 2026-09-13) | 0 |
| `solve/epics/` total lines | 39,181 | ≤ 6,000 |
| `liferaft` in `package.json` dependencies | yes | absent |
| `CLAUDE.md` is a pointer to `AGENTS.md` | 75-line copy | ≤ 3 lines |
| Gate stages reading anything but the pushed sha | 0 (2026-09-14) | 0 |
| Tests whose observation census has drifted | 0 (2026-09-14) | 0 |
| Falsifier classes without a receipt bound to its witness | 0 (2026-09-14) | 0 |
| Whole-tree metric productions beyond the first, per metric | 12 (owned by `single-metric-production`) | 0 |
| Tests in both fixed lists (spine and focused contracts) | 0 (2026-09-14) | 0 |
| Import-graph seal readers beyond one | 0 (2026-09-14) | 0 |
| Whole-tree checks with no declared input trigger | 0 (2026-09-14) | 0 |
| ESLint runs off the pushed range | 0 (2026-09-14) | 0 |
| `repository-health.yml` still separate from the exact-sha run | 0 (2026-09-14) | 0 |
| Workflows without a concurrency group | 0 (2026-09-14) | 0 |
| Workflow jobs whose runner or timeout is not plan-driven | 0 (2026-09-14) | 0 |
| Canary running after a run that already proved the corpus | 0 (2026-09-14) | 0 |

Adjust a number in the script and here together; never in one place.

## Quests, in order

**consolidation-budget-check** — land the budget script (adapted to the
repository's own checkers) and a test that runs it against a fixture tree.
Probe: test-receipt for that test. Red at seal because the script does not
exist on `main`.

**release-pipeline-dry-run** — the release workflow publishes end to end on a
throwaway pre-release tag before any further `v0.2.x` is cut, and the workflow
writes a compact publication receipt to `data/releases/<tag>.json` (tag, sha,
each artifact's published state and URL). No forward-patch release until this
is green. Probe: script reading the newest receipt, unmet while any artifact
is unpublished. Finding (2026-09-12): `data/` is gitignored (`.gitignore:14`),
so `data/releases/<tag>.json` and `data/formation-health/trend.ndjson` cannot
be committed as written; the quest that first writes a receipt owns the
`.gitignore` negation for exactly those two paths. The pipeline has no
prerelease awareness today - npm publish takes `latest`, Docker `latest`
moves, the GitHub release is created `--latest`, and the identity step needs
`package.json` equal to the tag - so a prerelease semver tag is one contract:
npm under a `next` dist-tag, Docker tagged with the version only, the GitHub
release marked pre-release, the identity step accepting the suffix. That
contract is this quest's first red test; `v0.2.4-rc.0` is then the dry run
on the production path.

**formation-health-verdicts** — the nightly workflow produces measuring
verdicts: `UNKNOWN` fails the job loudly instead of appending a non-verdict,
and `data/formation-health/trend.ndjson` is committed (compact text, one
record per run) so the release notes and this epic read the same file.
Probe: script, unmet until three consecutive scheduled records measure.

**public-claims-match-shipped-bytes** — the README's install line stays
unpinned (`npm install --global lagrange-server` installs what npm serves as
`latest`; demanding a pinned version was the budget's error, relaxed
2026-09-13), the cluster-scale claim quotes the latest measured
formation verdict with its date, and the changelog's newest entry has a
receipt. Probe: script comparing README, CHANGELOG and `data/releases`.

**Decision (2026-09-12, lean-push-gate).** The pre-push gate proves a push by
its change, not by the corpus. The postpush manifest's last command is
`scripts/checks/push-gate-change-proof.js`: the `npm test` plan against the
remote sha of main (the hook exports it as `LAGRANGE_CHECK_BASE`), or
`test:all` when the proof cannot stand for it - a refused selection, a change
to the selection machinery, runner, generated selection state, hook or package
manifests, a cone above half the corpus, no committed range, or
`LAGRANGE_PUSH_FULL_CORPUS=1`. The fixture hole the 2026-09-05 latent red went
through (a6d99aa3d) is closed by selection: changed non-test JavaScript under
`test/` or `src/test-helpers/` also selects every test whose import closure
reaches it, from the sealed import graph, and refuses without it. The whole
corpus runs on main after every push in `full-corpus-canary.yml`, which gates
nothing and has no schedule. The corpus ratchets run in place inside the
exact-HEAD worktree. Review findings not adopted here, carried as follow-ups:
`npm run check` in CI refusing on a real dependency-graph bump (CI should run
`test:all` on `RELEASE_PROOF_REQUIRED` rather than go red); `audit:file-size`
and `model:contracts` re-running in repository-health after the gate; and the
release proof re-running a corpus CI already proved for the exact sha
(release-tooling recommendation 4, now `test-file-content-receipts` v2).

**Finding (2026-09-13, releasing 0.2.4).** The GCP proof runner is about 2.4x
slower single-threaded than the reference machine and lands on a different
host per start (idle auto-stop, tmpfs workspace). Two integration files
carried fixed wall-clock budgets - a 12 s seed bootstrap and a 100 ms
heartbeat against a 200 ms ready lease - that passed the rc.2 proof by margin
and failed the 0.2.4 proof twice on 57e6940c7; reproduced over ssh on the
runner, exonerating the tree (rc.2's own tree failed there too). Fixed by
scaling work-bound budgets with `LAGRANGE_TEST_MACHINE_FACTOR` through
`test/integration/helpers/test-machine-factor.js` (c6e80ec05); validated on
the slow host at factor 3 and locally at 1 and 3. The lean gate's full-corpus
branch also surfaced a corpus test writing a tracked artifact (d66ab73c1).
Rule carried: an integration failure only on the proof runner with "timed out
after" or an empty published set is a budget, not a regression.

**Outcome (2026-09-13).** `v0.2.4` was tagged on the proven 4f7af546d and the
tagged run refused at the release identity step: git's default version sort
ranks `v0.2.4-rc.2` above `v0.2.4`, so the first release after a candidate
read as "moving latest backward". Tags are immutable, so 0.2.4 joins the
never-published list and the fix (`versionsort.suffix=-`, pinned by a
hardening assertion) ships as 0.2.5 on a new proof.

**Rule (2026-09-13, owner).** No further quest enters this epic if it adds a
script or a workflow: the budgets this epic exists to drive down moved the
wrong way in its first 36 hours (workflows 925 to 1,137 lines with the canary,
`scripts/checks` at its cap of 190, loose scripts 380 to 383). Next in order:
`formation-health-verdicts`, then `script-reachability-cull` and
`workflow-budget`. `test-file-content-receipts` is parked (superseded on its
log): a content-keyed skip cache over the whole corpus is a large correctness
surface in the layer that silently failed twenty coupled pairs, and the
non-gating full-corpus canary already covers what it would optimise.

**Notes from formation-health-verdicts and the next contract (2026-09-13).**
The nightly workflow commits the trend to `main` with the workflow token, so
`npm run publish` refuses fast-forward until the operator rebases onto the
night's bot commit: a daily `git pull --ff-only` before publishing. Records
the runner kept locally before the trend was tracked are not migrated; they
live in the earlier runs' uploaded artifacts. Budget probes name rows with
underscores for spaces (`--rows open_legacy_epics`) because a script probe
splits on whitespace, and an unknown row name is unmet. The npm `next`
contract is max(latest, newest prerelease); the move needs an
`NPM_DIST_TAG_TOKEN` secret (owner action - trusted publishing authenticates
`publish` only); until it exists, 0.2.5's `next` still names 0.2.4-rc.2 and
`npm dist-tag add lagrange-server@0.2.5 next` is the manual move.

**Verifier notes recorded (2026-09-13, second brief).** The publisher's one
rewrite is the inert-data rebase (CLAUDE.md, runbook). The budget row "npm
next lags latest" is a release-time snapshot; the release owner clears it
with `release-publication-receipt.js --reobserve-next` after the manual move
(RELEASE.md), locally or through the release workflow's manual
`move-next` dispatch job - a deliberate exception to "no token in CI": the
`NPM_TOKEN` secret already existed unused, the job runs only by hand and
nothing moves automatically (owner, 2026-09-13). `--bot-commits` trusts the
workflow's committer identity
(`formation-health`); a workflow committing as `github-actions[bot]` is
outside it by design (e81dbf3a6 is such a pre-existing commit).
`split-merge-transition-integrity` carries `authorizes: []` and no `legacy`
flag, so `managed-split-cutover-handoff-closure` cannot land source until that
epic's scope is sealed - the next `epic-board-curation` item. The formation
seam's `FORMATION_OWNER` enumerates four owners against the design note's
nine; the calibration probe's zero means coverage only once the contract
grows to the nine - the first attempt of `formation-calibration-run` owns that. Receipt order
falls back to string order between two prereleases of one core, so an
`rc.10` would sort before `rc.9`; theoretical at this cadence, recorded so
nobody rediscovers it.

**publish-gate-hygiene** — `npm run publish` and the pre-push hook refuse
empty-subject commits and zero-byte untracked files; the human path uses the
same gate the solver uses. Probe: test-receipt for the refusal tests.
Routed here from consolidation-budget-check (2026-09-12): `solve land` takes
every path differing from HEAD, untracked included, as the change set; it must
scope to the quest's authorized paths and refuse with a list when untracked
files sit outside them, rather than sweep or block on them.

**script-reachability-cull** — every file under `scripts/` is reachable from
`package.json`, a workflow, `.githooks`, or `scripts/solve*`; everything else
is deleted (git keeps it). `npm run commands` is the only catalogue. Probe:
script printing the unreachable count, target 0; the loose-file and line
budgets above follow. First step, before the budget bites anyone: move the
`scripts/quest-evidence-*.js` receipt harnesses into `scripts/quest-evidence/`,
since the current convention grows the loose-file count by one per quest
(consolidation-budget-check moved it 380 to 381).

**workflow-budget** — workflows under 500 lines total, the release job under
12 named steps, each step one npm script; the three "proof authority"
surfaces collapse to one command with one receipt. Probe: script.

**ratchet-realignment** — remove `check-guideline-literals` from the `check`
chain; replace `check-file-size-thresholds` with a function-length and
complexity checker at zero baseline; add the sealed per-quest allowance that
`audit-file-size` consumed so that a cohesive edit to a grandfathered file is a
recorded decision rather than a split. Probe: test-receipt for the new
checker plus the chain check above. Routed here from
consolidation-budget-check: one unclassified test file fails
`audit:impact-contracts` for every coupled pair (twenty unrelated witnesses
reported "not primary-classified"); the failure should name the unclassified
file, not the pairs.

**epic-board-curation** — every open epic has a sealed `doneWhen` and at
least one quest or is `done`/`superseded`; `solve-v2` goes `done` (its budget
reads 0); the migration JSON under `solve/epics/solve-v2/` moves to the
evidence store; each of the 19 quest-less legacy epics is dispositioned
(below). Probe: script.

**proof-authority-integrity** — the correctness prerequisite for every
further narrowing or caching of the gate (owner brief, 2026-09-14). Today only
the corpus ratchets run against the pushed SHA (`push-gate-corpus-worktree.js
--ref`); unused-files, eslint, cycles, unused-exports and the whole test stage
read the working tree (`.githooks/pre-push:150-235`), so a direct push proves
whatever is on disk, and the selection's only authorities are the source
taxonomy, the impact-contract registry and the import graph
(`change-selection.js:18-23`), which by its own admission
(`helper-import-closure.js:21-24`) cannot see a fixture read through fs, a
globbed directory (`test/contract/callback-axis-accretion.test.js` reads all
of `src/` and is classified architecture-governance), a spawned script named
as a string literal, or an environment variable; 123 test files read files,
20 read directories, 56 spawn, 21 read env. Nothing plants a defect and
proves the gate selects a test that goes red. The quest owns: exact
pushed-SHA/ref identity for every gate stage (the hook materialises the
pushed SHA once and runs every stage in that immutable checkout, naming the
pushed ref and the remote base in the receipt); non-import observation
dependencies as a declared, censused selection authority (fixtures,
directories, spawned scripts, env) so a change to an observed surface selects
its observers or escalates when undeclared; an observation-surface census
whose undeclared count is a budget row; observation-aware selection consuming
the census; and adversarial falsifiers that plant defects in an observed
surface and in behavioural source and prove detection end to end. It adds no
script and no workflow: the census lives in the selection owner, the falsifiers
are tests, the rows are on the budget script, and the falsifier receipt lives
beside the other gate manifests (`test/manifests/`) because a closed quest
keeps only its record and log (R20). Probe: budget rows
`gate_stages_off_pushed_sha`, `undeclared_observation_surfaces`,
`falsifier_classes_unproven`, target 0. Until they read zero no further
narrowing or caching enters the gate.

**gate-work-consolidation** — the efficiency work, sealed only after
`proof-authority-integrity` lands (owner brief, 2026-09-14). It owns: single
production of every repository-health metric (complexity, cognitive
complexity, cycles, duplication, file-size, unused exports are each computed
twice in `repository-health.yml` - once by the owner-debt refresh, once by
`test:static` - and up to four times per push cycle across the hook, the
gate and CI); elimination of the duplicate fixed-test lists (three of the
nine focused contracts are also safety-spine members and run twice in one
gate) and duplicate file-size executions; canonical import-graph inputs
(four resolvers - dependency-cruiser twice, knip, madge - over four file
universes, and two independent `sealBindsGraph` readers); input-triggered
whole-tree checks in the shape of `FULL_CORPUS_TRIGGER_RULES`; ESLint over the
pushed range at the pushed SHA (nothing lints pushed blobs today); coalescing
`repository-health.yml` into the exact-SHA ci run or removing it; a
proof-obligation registry extending `test/shards/impact-contracts.json` as the
one place an obligation is declared; plan-driven CI resources
(`scripts/plan-test-lane.js` lanes, timings, runner size) instead of fixed
per-workflow values; and safe behavioural-canary activation and concurrency
(`ci.yml` and `repository-health.yml` have no concurrency group; the canary
runs only when the cone did not already run the corpus). No new script, no
new workflow; the workflow-line and step budgets above follow. Probe: budget
rows for duplicate metric productions, duplicate fixed-test runs, import-graph
readers, unconditional whole-tree checks, eslint off the pushed range and
workflows without concurrency, target 0.

**raft-ownership** — vendor `@markwylde/liferaft` into `src/raft/vendor/`
with a conformance suite (the etcd/raft scenarios translate directly) and
remove the dependency. Sequenced last and never concurrent with a
`formation-seed-decoupling` quest that touches `src/raft`. Probe: script (the
dependency is absent) plus test-receipt for the conformance suite.

Decision (2026-09-12, after `release-pipeline-dry-run`): a release proof is
a proof of shipped logic, so it binds to a *release proof identity* - the
tracked tree minus what cannot change behaviour (`solve/`, `data/releases/`,
`CHANGELOG.md`) with the release version string masked in the five version
authorities (`scripts/release-proof-identity.js`) - and not only to the exact
commit. Receipts carry the identity and are indexed under
`refs/lagrange-proofs/<proof>/identity/<digest>`; `proof-authority check`
resolves an exact receipt first and otherwise the identity receipt of the
checked-out subject, reporting which (`resolution`, `provenBy`), and never
guesses from a tree it does not have checked out. `proof-authority index`
backfills the identity ref of an older receipt. Consequence: a version bump
alone - the rc-to-release step, a forward patch with no logic change - needs
no new GCP proof; any shipped byte still does. `release:preflight` requires
the tagged SHA to be proven and on `origin/main` history, no longer the
remote tip, so landings publish behind a running proof. Both are the lean
answer to a day spent re-proving identical bytes.

## Testing time (2026-09-17)

**Decision (owner, 2026-09-17).** Test time is a budget of this epic. The
measurement that opened it: three `solve land` proofs in one day, ~50 min
each, for two one-file repairs. Where the minutes went, measured on the
shared machine (load ~3), from `.tap/test-results` of the day (1963 results,
2809 s of test bodies):

- The plan was 1926 of 2109 tests for a change in `src/rebalancer`. Not
  because of impact selection: `npm test` resolves its base to the
  MERGE-BASE WITH `origin/main` (`scripts/checks/changed-paths.js`,
  decision 0538db5c7 for `npm run check`), and `solve land` runs plain
  `npm test`, so every land proves the whole branch since main. The same
  tree with `LAGRANGE_CHECK_BASE=HEAD` - the quest delta, which is exactly
  land's change set - plans 568 tests: ~9 min modelled against ~46.
- Unit files: 1727 files, median body 140 ms, 1481 of 1963 under 500 ms; the
  lane took 24 min at `--jobs=4`, ~2.5 s of overhead per file under load.
  Idle start-up per process is ~470 ms, of which `@tapjs/typescript` +245 ms
  and `@tapjs/processinfo` +135 ms serve nothing: no `.ts` file exists,
  coverage is off, nothing reads `.tap/processinfo`. Module graphs add
  200-400 ms (`src/rebalancer/index.js`, `bootstrap-service.js`).
- Integration: 55 files, 1037 s serial, median 13.7 s; lanes run one after
  another by primary class, and only 4 integration files scale their budgets
  by `LAGRANGE_TEST_MACHINE_FACTOR` - the rest are literals.
- Reds are the expensive files: the seven-node convergence probe burned
  346 s per run waiting for placed `sys-postgres-wire` replicas that meta
  services (shipped at `replica_count 0`) never place; the solve footprint
  test hit its 600 s file timeout because a checker spawned git twice per
  closed quest per unpublished commit (114 s; batched to 10 s, 6b305a2fa)
  and the test computes the budget four times.
- Land runs without `LAGRANGE_RETRY_FAILED_ONCE`, CI with it; a flake costs
  a whole re-land.

Rejected on the record: reviving `test-file-content-receipts` (the 2026-09-13
rule above stands, and its eligibility excludes the slow files anyway - the
140 ms files cost start-up, not body); in-process batching of tap files (tap
21 is one process per file by design and the tests assume process-global
state); a new epic (the board must shrink, and nothing here moves another
epic's budget). Every quest below edits existing files: no new script, no
new workflow.

**land-proves-the-quest-delta** - `solve land` proves the quest delta
(index vs HEAD) plus the spine; the branch-vs-remote range stays the push
gate's and the canary's proof. The chosen base is printed as an explicit
range source, never silent. Owner: `scripts/solve/commands.js`,
`scripts/checks/changed-paths.js`; witness `test/scripts/check-base-range.test.js`;
runbook. Saving: ~35 min per land on a multi-quest branch; 0 on a branch
fresh off main. First in order: it is the largest cause and the smallest
change.

**convergence-probe-class-observed** - the `convergence-probe` class
(`test/shards/convergence-probes.txt`, 3 files) is excluded by the planner
and the classified runner, not only by `test:all` (decision 6fcb63299 was
half-implemented: land ran them, no CI corpus ever did), it gets a
non-gating home as a canary step, and the multi-join probe is re-expressed
for `replica_count 0` (the runtime-owned endpoint contract of PR #30/#42)
or retired. Saving: 346 s on every land touching transport-messaging,
bootstrap-membership or cdc-metadata; the probes finally get observed.

**test-runner-loader-diet** - `scripts/run-test-files.js` drops the
typescript and processinfo loaders (mock stays: two files use
`t.mockImport`); `NODE_COMPILE_CACHE` is evaluated on the canary first,
because `--no-compilation-cache` was added for a V8 crash class (3bac105f1).
Saving: 3 min idle, 5-8 min under load on a full plan. A runner edit trips
the full-corpus trigger once.

**lane-dispatch-lpt-order** - lanes dispatch longest-first from the last
results instead of alphabetical 100-file chunks (simulated on today's
timings: 911 s to 746 s on the ordinary lane); `test/shards/timings.json`,
which nothing reads, is retired. Same set, order only.

**land-retry-parity** - land's proof runs with the recorded retry policy
(`LAGRANGE_RETRY_FAILED_ONCE=1`, reported and capped, as CI does) and
dispatches previously red files first, so a persisting red refuses in
minutes and a flake does not cost a re-land. Local becomes equal to CI,
not weaker.

**wait-definite-negative** - `waitFor` in the cluster test helpers accepts a
definite-negative predicate, and the integration waits that keep polling
after a structural fact has decided the outcome use it (the multi-join
probe polled 5 x 30 s per node, then the next node). Restricted to catalog
facts: a wrong "definite" predicate would red a slow but correct
convergence.

**static-test-hygiene** - the solve footprint test measures the budget once;
`check-fast-static.test.js` fingerprints the tree once; the complexity
ratchet closure test stops re-running both whole-repo sweeps that
pre-commit already runs. ~1.5 min of worker time.

**lane-parallelism-measurement** - measure-first, on the lab node, against
serial pass rates: the bootstrap class (181 files, median 128 ms, ~6 min
serial) at jobs=2, and the exclusive lane overlapped with the ordinary
lane. `.taprc` records the 2026-08-01 jobs=8 crash and the harness
guideline says lower jobs first; SLO budgets are literals and thermal
discipline forbids two heavy runs, so nothing becomes a local default
without the measurement. Potential: 3 min (bootstrap) to 12-20 min
(overlap) on branch plans.

**canary-on-lab-node** - the full-corpus canary runs on the home-lab runner
(`runs-on` edit, push-to-main only; `ci.yml` already reasons the
public-repo self-hosted rule), once `scripts/lab.js` is on this line.
Post-push corpus ~75 min to ~30 min; it is what makes the delta-only land
comfortable.

### Measured 2026-09-17 (lane-parallelism-measurement, first half)

Bootstrap class, 181 files, `TAP_TIMEOUT_FLOOR=120`, no retry policy, on
three hosts (dev = this machine, tv-dator and lenovo-laptop = lab nodes
provisioned that day):

| Host | jobs=1 | jobs=2 | jobs=4 |
| --- | --- | --- | --- |
| dev, 20 threads | 279 s, 264 s (2/2 green) | 139 s, 139 s, 194 s (2/3) | - |
| tv-dator, 12 threads | 300, 291, 291 s (3/3) | 182, 183, 181 s (3/3) | - |
| lenovo, 8 threads | - | 245, 244, 251, 253, 248, 250, 250 s (7/7) | 169, 168, 168 s (3/3) |

jobs=2 halves the lane on the dev box and takes 1.6x off the lab nodes;
13 jobs=2 runs, 12 green. The one red was
`test/bootstrap/fresh-join-via-non-seed-node.integration.test.js` hitting
its 120 s timeout after 22 s and 21 s in the sibling runs; the repository
already records it as "pre-existing flaky at 1 in 6 on HEAD"
(`formation-sim-production-replica-composition` log) and 8/8 standalone
repeats passed, so the observation matches the recorded base rate, not
contention. jobs=4 held 3/3 on 8 threads. No default is changed here; the
serial primary classes still decide the lane.

The overlap half is NOT answered: tv-dator's serial arm was 978 s ordinary
plus 1774 s exclusive (2752 s total), and the overlapped arm aborted - see
the runner defect below - so its 1895 s is not comparable. A lab node needs
the canary's own prerequisites (helm, wasm-tools, a psql client, the pinned
MovieLens dataset) or five files red for setup reasons.

### Found while measuring (2026-09-17), each its own owner

**runner-output-bound** - `finalizeTestRun` in `scripts/run-test-files.js`
(line ~301) reads a test's whole stdout AND stderr into strings. Under lane
overlap on tv-dator,
`test/integration/message-group-multi-join-formation.integration.test.js`
wrote a 608,651,868-byte `.tap` file, past V8's string cap, so the runner
died with `ERR_STRING_TOO_LONG` and took the whole exclusive lane (220 of
262 files) with it. A pathological output must not be able to destroy a
lane's results: read bounded (the analysis and the time tail only need the
head and tail) and report the file instead of throwing. The same test's
output is 89 KB on the dev box, so the storm is contention-dependent and
its diagnostic loop is a second, separate defect.

**canary-proof-reuse** - the canary's `decide` job skips the corpus only
when the ci run uploaded a `proof-scope` artifact carrying the same sha with
`fullCorpus:true`. On 0f93df70c the ci gate refused early
(RELEASE_PROOF_REQUIRED for the lockfile) and uploaded nothing, so the
canary re-proved a corpus the local push gate had already proved on that
exact sha: 74 min of duplicate work. Two parts: `decide` consults the
sha-keyed proof authority (`scripts/proof-authority.js`, today one contract
`release-full-v1` read only by the release path) rather than a CI artifact
alone, and a refusing gate still publishes its scope so "unproved" is
distinguishable from "never ran".

Out of this epic, recorded so it is not lost: the 196 s
`test/simulation/formation-sim-charged-seed-host.test.js` (three charged
simulator runs) belongs to `formation-seed-decoupling`.

## Fixes, no quest

- `CLAUDE.md` becomes one line: `See AGENTS.md.`
- `solve/specs/` stays: 143 epic and quest records reference it.
- The history purge stays deferred; `git clone --filter=blob:none` is already
  in the runbook.

## Disposition of the quest-less legacy epics

Done or superseded by this epic or by solve-v2: `strategy-gate-and-altitude-teeth`
and `architecture-altitude-review` (the altitude rule now exists),
`convergence-loop-and-workflow-overhead`, `solver-streamlining-spec`,
`release-process-simplification` (this epic), `roadmap-integrity-wave-0`.
Superseded by `formation-seed-decoupling`: `formation-complexity-consolidation`,
`publication-readiness-churn-liveness-closure`, `hysteresis-consolidation`.
Keep and seal a `doneWhen` or close: `developer-velocity-maintainability-and-product-readiness`,
`owner-boundary-hardening-and-unification`, `control-plane-truth-local-converged-read`,
`core-logic-live-validation`, `lagrange-aware-callback-shared-context`,
`lagrange-devops-onboarding`, `pilot-readiness-and-public-proof` (the outside-user
proof belongs here — seal it, do not duplicate it). Each disposition is a
`decision` finding in `epic-board-curation`.

## Guardrails

- No `v0.2.x` tag until `release-pipeline-dry-run` is solved.
- No new baseline, no raised baseline. A blocked cohesive edit stops and
  records; it does not split.
- Do not touch `src/` outside `src/raft`; formation-path owners belong to
  `formation-seed-decoupling`.
- Independent verification before landing any `src/`, `.github/` or
  `.githooks/` change.
