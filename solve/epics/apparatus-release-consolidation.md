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
  - script-reachability-cull
  - workflow-budget
  - ratchet-realignment
  - epic-board-curation
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
is unpublished.

**formation-health-verdicts** — the nightly workflow produces measuring
verdicts: `UNKNOWN` fails the job loudly instead of appending a non-verdict,
and `data/formation-health/trend.ndjson` is committed (compact text, one
record per run) so the release notes and this epic read the same file.
Probe: script, unmet until three consecutive scheduled records measure.

**public-claims-match-shipped-bytes** — the README's install line names the
version npm actually serves, the cluster-scale claim quotes the latest measured
formation verdict with its date, and the changelog's newest entry has a
receipt. Probe: script comparing README, CHANGELOG and `data/releases`.

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
