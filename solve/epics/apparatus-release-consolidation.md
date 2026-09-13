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
| Open epics (incl. this one and formation) | 26 | ≤ 8 |
| Open epics still `legacy: true` | 20 | 0 |
| Open epics without a `doneWhen` | 20 | 0 |
| `solve/epics/` total lines | 39,181 | ≤ 6,000 |
| `liferaft` in `package.json` dependencies | yes | absent |
| `CLAUDE.md` is a pointer to `AGENTS.md` | 75-line copy | ≤ 3 lines |

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
