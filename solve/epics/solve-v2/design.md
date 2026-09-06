# solve-v2 — phase 0 inventory and design note

Measured on 2026-09-06 at 14df53ccc. Window: the last 90 days (2026-06-08 to
2026-09-06) unless stated. Sources: `solve/log/*.ndjson` (14,911 entries in
the window across 811 quest logs; 935 older entries ignored), every Claude
session transcript for this repository in the window (31 transcripts across
five project directories, counting `scripts/solve.js <verb>` invocations),
`git log`, and `scripts/checks/solve-v2-budget.js --phase-0`.

## 0. Amendments approved 2026-09-06 (operator review of this note)

1. **`start` refuses a green probe.** `start` measures the `doneWhen` probe
   and refuses to seal unless the metric is red (above target), recording the
   seal-time value in the log so `probe` shows the delta. Probes, including
   the new `script` probe, live under `scripts/checks/`, are deterministic,
   and emit an exit code plus exactly one numeric metric on stdout.
2. **`land` honors the last verdict.** Verifier rejections were the one stop
   that changed outcomes (435 in the window). `land` refuses when the newest
   `verification` entry is a rejection and no `attempt` entry is newer than
   it. Static quality (lint, literal and boundary audits, ratchets) stays as a
   `land` check.
3. **Phase 1 gate corrected.** The 20 MB target is unmeetable in phase 1
   (`solve/changes` keeps 64 MiB of tracked text after the tarballs and the
   16 large files go). Phase 1 gate: no tarball tracked, no file > 1 MB under `solve/`, the
   pre-commit check in place. The 20 MB target moves to the end of phase 2,
   where the directory collapse deletes `changes/` for closed quests (their
   diffs are the commits).
4. **File-count criterion replaced.** `git ls-files solve < 400` conflicts
   with keeping 859 quests losslessly. New criterion: a closed quest keeps
   exactly `quest.json` + `log.ndjson`; an open quest adds only `evidence/`;
   no other files under `solve/quests/`. The budget script measures this
   as the number of non-conforming quest directories.
5. **Migration accounts for every entry.** The migration script emits a
   mapping report: 23 old entry types → 4 new, 82 finding-kind strings → 5,
   with counts summing to the log total (14,911 in the window; 15,846 in all)
   and zero rows in "unmapped". Anything that does not map cleanly goes into
   `quest.json.legacy.unmapped` with a reason (amendment 4 forbids extra files).
6. **Multi-frontier quests.** Frontiers are split into child quests only for
   the open ones (3 of the 9: `release-0-2-verification-v2` ×3,
   `oci-container-driver-live-activation` ×5, `restore-deterministic-cloud-gate`
   ×3). Of the other 30, the 28 closed multi-frontier quests keep their frontier
   data as a `legacy.frontiers` field in `quest.json` and the 2 undeclared
   drafts (`cell-invocation-backpressure`,
   `comparative-efficiency-movielens-measured-p0-campaign`) are deleted under
   amendment 7; no child quests are manufactured.
7. **Orphans and drafts.** The 9 open quests get epics derived from the
   roadmap row or plan document they already carry (table below). Of the 44
   undeclared drafts (quest files with no log), 3 carry a roadmap row and become one-line entries in
   the relevant epic; the other 41 are deleted.
8. **`rules.md` is seeded from evidence.** Seed = the 39 rule ids cited in
   commit messages in the window (51 citations on 38 commit lines; 8 ids
   cited at least twice: ARCH-0013 ×5, STYLE-0012 ×3, TEST-0022, TEST-0001,
   GOV-0079, GOV-0076, ARCH-0094, ARCH-0009 ×2) plus the 4 rules that name a
   checker script (`scripts/check-*.js`: STYLE-0008, STYLE-0011, TEST-0050,
   TEST-0119). The seed is 43; it is cut to 25 by citation count, ties broken
   by transcript and log mention counts. Everything else is archived.
9. **Evidence pre-release, two checks first.** `release.yml` triggers only on
   `push.tags: ["v*"]`; the `solve-evidence` tag cannot fire it (verified
   2026-09-06; no other workflow has a tag trigger). `evidence add` verifies
   every upload by re-downloading and re-hashing before writing the log
   entry, and names assets `<quest-id>--<original-name>`.
10. **History purge deferred, not denied.** Not scheduled. Phase 1 documents
    `git clone --filter=blob:none` in the runbook instead: once the tarballs
    are out of the tree, a partial clone never fetches them. Section 5 now
    records that `filter-repo` rewrites every SHA the 859 quests reference
    (`draftedAtCommit`, `sealedAt`, `changeRef`) and would need a commit-map
    pass over all records; decision after phase 4.

### Proposed epic per open quest (amendment 7)

| open quest | carries | proposed epic |
| --- | --- | --- |
| managed-split-cutover-handoff-closure | RM-0.2-five-node-convergence | `release-0-2-five-node-convergence` (certification epic, phase 4) |
| release-0-2-verification-v2 | RM-0.2-release-verification | superseded: `RELEASE.md` replaced the ladder on 2026-09-05; recorded `superseded`, no epic |
| rolling-restart-representative-certification | RM-0.1-fs-rolling-restart | `rolling-restart-certification` (new, `proof: certification`) |
| runtime-service-affinity-observer-intent-parity | planDoc topology-convergence-hardening | `topology-convergence-hardening` |
| ordinary-placement-ready-lease-candidate-admission | planDoc topology-convergence-hardening | `topology-convergence-hardening` |
| public-path-multinode-baseline | planDoc pilot-readiness-and-public-proof | `pilot-readiness-and-public-proof` |
| movielens-parallel-reduce-result-chronology | planDoc service-data-affinity-placement | `service-data-affinity-placement` |
| oci-container-driver-live-activation | planDoc solve/specs/service-portability-ladder/tasks.md (5 frontiers) | `service-portability-ladder` (new; the spec moves under it); split into 5 child quests |
| restore-deterministic-cloud-gate | none (3 frontiers, last touched 2026-08-30) | `deterministic-cloud-gate` (new) or `superseded` at phase-2 triage; split into 3 child quests if kept |

Drafts kept as one-line epic entries: `publication-readiness-churn-liveness-closure`
and `service-plane-replication-authority-inventory` (RM-0.2-five-node-convergence),
`lagrange-devops-onboarding` (RM-0.5-cde-helm-chart).

## 1. Inventory

### 1.1 Log entries by type (23 types; v2 has 4)

| type | count | v2 disposition |
| --- | --- | --- |
| finding | 4520 | `finding` (82 distinct `kind` strings today plus untyped; v2 allows theory, altitude-check, decision, ruled-out, evidence) |
| evidence-ingested | 2523 | `finding kind: evidence` written by `note --evidence` / `evidence add` |
| attempt | 1294 | `attempt` |
| quest (terminal status) | 1147 | `terminal` |
| gate-decision | 1101 | removed (see 1.4) |
| solved (per-frontier) | 963 | folded into `terminal`; frontiers removed |
| quest-declared | 781 | `start` seals `quest.json` (`sealedAt`); no log entry type |
| theory-result | 703 | removed; theories are `finding kind: theory` with a status |
| guard-override | 401 | removed with the gates |
| reflection | 357 | `finding kind: altitude-check` |
| theory-option-declared / theory-selected / theory-system-declared / theory-superseded | 257 / 238 / 122 / 8 | `finding kind: theory`, `status: active|supported|falsified|superseded` |
| park | 217 | `terminal` (`exhausted`/`superseded`) or `blocked` |
| violation | 179 | removed (attempt-integrity 102, goalposts 23, regression 20, theory-gate 7); `probe` refuses a stale doneWhen instead |
| invariant.evaluated / quest-amended / rejection-decomposition / non-measurement / quest-upgraded / frontier-reopened / attempt-base-corrected | 37 / 26 / 15 / 10 / 8 / 3 / 1 | removed; the concepts they serve go with them |

Verification today is a `finding` of kind `verifier-approval` (982) or
`verifier-rejection` (435); v2 makes it the `verification` entry type.

### 1.2 Solver commands (43 verbs in `scripts/solve.js` COMMANDS; v2 has 4 + `evidence add` + `board`)

Invocations counted with `grep -oh -E 'scripts/solve\.js [a-z-]+'` over the
31 transcripts modified in the window.

| verb | invocations | verb | invocations | verb | invocations |
| --- | --- | --- | --- | --- | --- |
| land | 1414 | audit | 50 | reopen | 30 |
| continue | 1087 | reflect | 49 | handoff | 30 |
| finding | 359 | step | 48 | health | 28 |
| next | 256 | doctor | 43 | trace | 26 |
| start | 217 | promote-finding | 24 | preflight | 25 |
| ingest-evidence | 202 | frontier | 20 | reattempt | 14 |
| status | 176 | decompose-rejection | 20 | inherit-candidate | 12 |
| checkpoint | 128 | correct-attempt-base | 17 | cost | 12 |
| override | 127 | meta-friction | 10 | portfolio | 9 |
| attempt | 104 | meta-ratio | 6 | step-pending | 5 |
| theory | 101 | overview | 4 | rebase-epoch | 4 |
| lint | 95 | upgrade | 4 | invariants | 2 |
| new | 93 | scaffold-harness | 1 | run / probe | 59 / 56 |
| amend | 73 | report | 72 | park | 68 |

Structured actions dispatched by `continue`/`step` in the window (counted
with `grep -oh -E 'executed: [a-z-]+(:[a-z]+)?'` over the six transcripts of
the current project directory, the only ones that print the action code):
`begin-step` 90, `record-attempt` 100, `replace-rejected-attempt` 59. Every one of them is
"make and test the change"; 0 % were anything else. The brief's 10 % bar for
keeping the dispatch machinery is not met: `continue`, `step`, the dossier and
`next`-as-dispatcher are removed.

### 1.3 Stop types and park kinds

| gate code | decisions | blocked | overridden | real outcome changed |
| --- | --- | --- | --- | --- |
| blocked-scope | 461 | 217 | 318 guard-override entries | 3 scope splits landed (`scope-split-landed` 1, `scope-pressure-resolution` 2) |
| blocked-theory | 320 | 70 parks + 201 theory-required | 54 guard-override entries | replaced by the altitude rule; no split, park or fix is attributable to a theory demand as opposed to the reflection it forced |
| blocked-unrecorded-evidence | 136 | 136 | — | bookkeeping: evidence existed, the ingest command had not run |
| blocked-static-quality | 127 | 117 | 10 guard-override entries | real: lint/ratchet repairs before landing; kept as `land` checks, not a stop type |
| blocked-rejection-escalation | 40 | 25 | 18 guard-override entries | the verifier's rejection, not the gate, changed the outcome |
| blocked-regression / -measurement / -metric-projection | 13 / 2 / 2 | 17 | — | `probe` prints the metric; a regression is visible without a gate |

Parks: 217; the park entry's `kind` is the park kind (`exhausted` 214,
`cannot_measure` 3) and provenance is `operator` 192 / absent 25, so the kind
× provenance matrix has three populated cells out of its vocabulary. Quest terminal
statuses: solved 931, exhausted 216. Kept: `solved`, `exhausted`,
`superseded`, and one non-terminal `blocked` naming `nextOwner`. Dropped:
`MAX_CYCLES` (`max-cycles` outcome: 0 entries), `THEORY_REQUIRED`,
`supervisor-budget`, `supervisor-paused-measurement`, the park matrix.

### 1.4 Rules cited

708 machine-extracted rules (architecture 315, governance 209, testing 170,
style 14). Cited in 27 of 2,624 commits in the window (1.0 %; 51 citations of 39
distinct ids on 38 message lines). Top transcript mentions (`grep -oh -E '\b(ARCH|GOV|TEST|STYLE)-[0-9]{4}\b'`
over the same 31 transcripts): GOV-0053 14, STYLE-0012 12, ARCH-0139 11; top
log mentions (same pattern over `solve/log`): TEST-0022 19, STYLE-0011 14. `npm run rule -- --id` lookups in
the window: 0. The rules that were cited at all are the candidates for the
25 hand-written rules in `docs/steering/rules.md`; each must link a machine
check or a witness test.

### 1.5 Reachability of `scripts/solve/`

115 files, 34,604 lines (`wc -l`): `solve.js` 1,540, plus 97 files / 28,845
lines reachable from it and 18 files / 4,219 lines not reachable:
candidate-content-identity, candidate-workspace, committed-content-guard,
declared-probe-evidence, historical-artifact-{batch-scope, batch-v2, census,
migration-v2, migration-v2-constants, root-digest}, historical-oracle-archive,
ledger-consistency (test-only), machine-lock, proof-artifact-{census,
census-constants, migration}, red-main-exemption, terminal-readiness.
Largest reachable: work-package-schema 1577, verification 1554, loop 1278,
handoff 979, theory 841, store 759, change-artifact 718.

### 1.6 Weight and shape

| item | value |
| --- | --- |
| solve/ tracked files / size | 4,947 files / 326 MB (changes 260 MB, artifacts 25 MB, report 20 MB, log 29 MB, specs 7.4 MB) |
| tarballs | 33, 180.6 MB; 16 tracked files > 1 MB (largest 51.8 MB run-state) |
| quests | 859 json (607 solved, 196 exhausted, 44 undeclared drafts, 9 open, 3 logs with findings but no `quest-declared` entry) |
| multi-frontier quests | 33 of 859 (19×2, 6×3, 5×4, 3×5): 30 closed, 3 open |
| declared in window | 509 product, 270 process, 1 model |
| docs/steering | 22,316 lines (`wc -l`); llm/ 15,446 of which rules.json 12,462 |
| findings | 11 dated entries by file name (2026-06-17 ×3, 06-30 ×4, 07-05, 07-10 ×2, 09-03) plus README and template |
| operational-ground-truth.md | 207 lines, 11 trap bullets |
| evidence store | GitHub release assets only (`gh release upload` in release.yml); no bucket configured in `.env.example` |

## 2. Proposed v2

### 2.0 Shape (the operator brief of 2026-09-06, restated so this note stands alone)

- **Epic** `solve/epics/<id>.md`: YAML front-matter `id`, `status`
  (open | done | superseded), `doneWhen {probe, args}`, `proof`
  (deterministic | simulation | certification), `quests` (ordered child ids),
  `authorizes` (owner boundaries the epic may change; the landing guard reads
  cross-owner scope from here, not from the quest); body <= 150 lines. Only a
  `proof: certification` epic may cite a live run as terminal evidence.
- **Quest** `solve/quests/<id>/`: `quest.json` (`id`, `statement`, `epic`
  required unless `class: fix`, `doneWhen {probe, args}`, `constraints[]`,
  `sealedAt` commit, no frontiers: several surfaces are several quests under
  one epic), `log.ndjson` (append-only; entry types `finding`, `attempt`,
  `verification`, `terminal`; a finding may carry `kind: theory |
  altitude-check | decision | ruled-out | evidence`, theories carry `status:
  active | supported | falsified | superseded`), `evidence/` (text only,
  <= 200 KB per file; binaries live in the evidence store and are referenced
  by sha256 + URL in a log entry).
- **Fix**: no record; a single-sitting change with an obvious proof commits
  directly and the commit message names the witness test.
- **States**: `open` -> `solved` | `exhausted` | `superseded`; one
  non-terminal stop `blocked` naming `nextOwner` (judgment | verification |
  authorization) in a terminal-shaped log entry.
- **Altitude rule**: after more than three `attempt` entries with no `finding
  kind: altitude-check` between them, `land` refuses until one is recorded stating
  whether the quest can succeed at its altitude (phase 2 measures attempts,
  not metric movement, because the migrated logs carry no seal-time metric;
  the rule is enforced at `land`, and `probe` shows the running count); if
  the answer is no, the quest goes `superseded` and the agent authors the
  epic or quest at the right altitude first.
- **Commands** (`scripts/solve.js`): `start <id>` validates, measures the
  probe (must be red), seals `quest.json`, opens the log; `note <id> --type
  finding|attempt|verification --text ... [--kind ...] [--evidence ref]`;
  `probe <id> [--epic]` runs `doneWhen`, prints the metric, the seal-time
  value and the last three entries, read-only; `land <id>` runs `probe`,
  refuses a `src/` diff without a `verification` entry, refuses when the newest
  verification is a rejection with no newer attempt, runs `npm test`
  (`select-change-tests.js`) and the coupled-pair landing guard plus the
  static-quality checks, scopes and makes the commit, writes `terminal`.
  Plus `evidence add <path> --quest <id>` and `board` (section 2, added
  concepts). `continue`, `step`, `next`-as-dispatcher and the dossier are
  removed (section 1.2).
- **Evidence store**: binaries never enter git; `evidence add` uploads,
  verifies by re-download and re-hash, records sha256, size and URL as a
  `finding kind: evidence`; a pre-commit check rejects any file > 1 MB under
  `solve/`.
- **Nothing generated is committed**: `FRONTIER.generated.md` goes; `board`
  prints open epics and quests on demand.

### 2.1 Decisions the brief left open

- **Probe kinds** stay `test-receipt` (deterministic: a named test file or
  anchored test name), `scenario-harness` (a live report; terminal only for an
  epic with `proof: certification`), `oracle` (a JSON metric file; process
  quests only), and `script` (a command whose exit code is the metric, used by
  the `solve-v2` epic itself). `start --class process` defaults to
  `test-receipt`; the probe is immutable after `start`.
- **Evidence store**: a dedicated GitHub pre-release `solve-evidence` (created
  once, never the version tag) holds binaries as release assets; `solve
  evidence add` uploads with `gh release upload solve-evidence <file>`,
  records sha256, size and URL in a `finding kind: evidence`. The 33 tarballs
  are moved there in phase 1. A pre-commit check refuses any file > 1 MB under
  `solve/`.
- **Added concepts and what they replace**: `evidence add` replaces
  `ingest-evidence`, `solve/artifacts/`, `solve/changes/**/*.tar.gz` and the
  attempt change artifacts (the commit itself is the change record);
  `board` replaces `FRONTIER.generated.md`, `status`, `report`, `frontier`
  and `health`. No other concept is added.
- **Verification** is one log entry `{type: verification, verifier:
  subagent:<id>, verdict: approve|reject, findings[]}`; `land` refuses a
  `src/` diff without one.
- **`land`** keeps calling `npm test` (`select-change-tests.js`) and the
  coupled-pair landing guard (`landingUnionGuardProblems` and the
  `coupledPairs` audit in `scripts/checks/impact-contract-registry.js`); the
  epic's `authorizes` list is the cross-owner scope, the quest carries none.

## 3. Exact deletion list

Phase 1 (weight): the 33 tarballs and the 16 files > 1 MB after upload;
`solve/FRONTIER.generated.md` (`OVERVIEW.generated.md` is already untracked),
`solve/artifacts/` (343 content-addressed diffs: the commits carry them),
`solve/report/` (32 files, 20 MB), `solve/changes/` (2,379 files: attempt
diffs and live-ab bundles; text evidence a quest still cites is moved to its
`evidence/` first), `solve/oracle/` for terminal quests, `solve/oracles/`,
`solve/migrations/`, `solve/autonomous/`,
`solve/release-0-1-0-alpha-readiness.json` (folded into a done epic),
`solve/specs/` entries not referenced by an open epic or quest (25 files, 38
references to check).
Phase 2 (cutover): `scripts/solve/` (115 files), `test/solve/` (all),
`solve/theory-ledger.md`, `solve/log/`, `solve/quests/*.json` (after
migration to `solve/quests/<id>/`), `solve/evidence/` (moved per quest).
Phase 3 (steering): `docs/steering/llm/rules.json`, `rules-index.md`,
`tools-index.md`, `solve-commands.md`, `manifest.json`, the pack generator
and its config, `docs/steering/findings/` (archived or promoted),
`CLAUDE.md` content (one-line pointer).

## 4. Migration plan (phase 2, lossless)

Amendment 4 allows nothing but `quest.json` + `log.ndjson` (+ `evidence/`
while open) under a quest directory, so legacy material lives in fields, not
files; amendment 6 keeps closed frontiers as `legacy.frontiers`. Where the
brief's guardrail said "keep the original under `legacy/`", the amendment
wins and the original is kept verbatim inside `quest.json.legacy`.

1. For every `solve/quests/<id>.json`: create `solve/quests/<id>/quest.json`
   with `id`, `statement`, `epic`, `doneWhen`, `constraints`, `sealedAt` (the
   `quest-declared` timestamp and `draftedAtCommit`), `class`, and a `legacy`
   field holding the untouched v1 record (`links`, `frontiers`,
   `verificationTemplates`, `landingRequirements`, everything else). `epic`
   comes from `links.planDoc` when it names an epic, else from the epic
   derived in amendment 7; a closed quest with neither cites the single
   done epic `solve/epics/legacy.md` (`epic: legacy`) so the `epic` field is
   never null and no `class: fix` is manufactured.
2. `doneWhen`: the sealed quest-level `doneWhen` verbatim. Closed
   multi-frontier quests keep their frontier metrics in `legacy.frontiers`;
   the 3 open multi-frontier quests are split into child quests under their
   epic before the old CLI is deleted.
3. Copy `solve/log/<id>.ndjson` verbatim to `solve/quests/<id>/log.ndjson`.
   v2 readers classify every v1 entry through the mapping report (amendment
   5): 23 old types → 4 new (`finding` ← finding, evidence-ingested,
   reflection, theory-*; `attempt` ← attempt; `verification` ← finding kinds
   verifier-approval/-rejection; `terminal` ← quest, park, solved) and 82
   finding-kind strings → 5; the report's counts must sum to every entry
   (14,911 in the window, 15,846 in all) with zero unmapped rows. Entry types
   that carry no v2 meaning (gate-decision, guard-override, violation,
   invariant.evaluated, quest-amended, rejection-decomposition,
   non-measurement, quest-upgraded, frontier-reopened,
   attempt-base-corrected) stay verbatim in the log and are listed in the
   report under "kept verbatim, no v2 meaning" — that is a mapped row, not an
   unmapped one.
4. Text evidence under `solve/evidence/<id>*` and cited text under
   `solve/changes/<id>/` moves to `solve/quests/<id>/evidence/` for OPEN
   quests only (<= 200 KB each; larger text is uploaded as evidence and
   referenced); for closed quests it is uploaded to the evidence store and
   referenced from a `finding kind: evidence`, keeping the directory on shape.
5. `solve/theory-ledger.md`: each entry becomes a `finding kind: theory` in
   the quest it cites; entries citing no quest become findings of a legacy
   quest `solve/quests/theory-ledger/` (a conforming quest directory under
   the `legacy` epic).
6. Any record that cannot be represented keeps its original bytes inside
   `quest.json.legacy.unmapped` with a `finding kind: decision` saying why.
7. The 9 open quests are migrated first and re-probed under v2 before the
   old CLI is deleted.

## 5. History purge (phase 1, proposed only)

After the tarballs are in the evidence store and phase 1 is landed:

```sh
git clone --mirror git@github.com:psvensson/lagrange.git lagrange-mirror.git
cd lagrange-mirror.git
git filter-repo --invert-paths --path-glob 'solve/**/*.tar.gz' \
  --path-glob 'solve/**/*.gz' --path-glob 'solve/artifacts/'
git push --force --mirror
```

Every clone and worktree must be re-cloned afterwards. Deferred (amendment
10): `filter-repo` rewrites every SHA the 859 quests reference
(`draftedAtCommit`, `sealedAt`, `changeRef`), so running it needs a commit-map
pass over every record first. Decision after phase 4. Until then the runbook
documents `git clone --filter=blob:none`, which never fetches the purged
blobs once they are out of the tree.

## 6. Judgment calls

- v1 trap met while opening phase 0: an `oracle` probe reading 0 at
  declaration seals the quest solved in the same command, and a solved quest
  cannot record the attempt that covers its own script, so `land` refuses
  it. v2's `start` seals the statement only; `probe` reads the metric and
  `land` records the terminal entry, never `start`.

- `solver-friction-2026-09-06` (seven v1 gate fixes, verifier round 3 in
  flight when the brief arrived) is parked, not landed: phase 2 deletes every
  file it touches. Its lessons are carried into v2 (probe at declaration,
  no theory rung, scope counted as authored files, no `+++`/comment
  heuristics: a diff on a runtime path is runtime scope, full stop).
- `critical-topology-readiness-under-source-change` keeps its falsifier
  finding; it is re-expressed in phase 4 under the
  `release-0-2-five-node-convergence` epic.
- `solve/state/` (untracked, 23 MB: reviews, inventories, session registry)
  is not tracked today and is not a phase-1 target; v2 keeps review records
  under the quest's `evidence/` as text.
- `scripts/checks/solve-v2-budget.js` is committed in phase 0 so the
  baseline row is reproducible; it is the only script phase 0 adds.

### 7.6 The size gate measures two different things

The v1 logs that phase 2 copies verbatim total 27.3 MB (825 files at the
pre-migration commit). A single raw-directory gate cannot separate that
immutable historical payload from the active v2 footprint, so the only ways
to satisfy it are destroying evidence or moving the number. Phase 2 splits
the measurement instead:

- the migration owner emits `solve/epics/solve-v2/migration-inventory.json`,
  recording per migrated quest the exact length and sha256 of its v1 log at
  the pre-migration commit. It is derived from that commit, never
  hand-maintained;
- `solve-active-bytes` is tracked bytes under `solve/` minus that corpus,
  budgeted at 20 MB. Entries appended to a migrated log after the migration
  count here, as active footprint;
- `legacy-corpus-drift` re-hashes each recorded prefix and must be 0. The
  corpus is frozen evidence: it cannot shrink to make the budget pass, and
  the losslessness of the migration becomes a standing mechanical invariant
  rather than a one-time verifier claim.

Archival and history-retention policy stays a separate decision after
phase 4.

### 7.7 The change proof proves the tree that will be committed

The first landing was refused by its own proof: a taxonomy liveness rule
reads the repository through `git ls-files`, and `land` ran the proof before
staging, so the index still described the pre-cutover tree. `land` now stages
the change set before proving it and gives the index back when the proof or
the commit is refused. Consumers that ask git what the repository contains
therefore see exactly what the landing will commit.

### 7.8 Phase 2 outcome

Measured after the cutover: active v2 footprint 8,974,688 of 20,971,520
bytes; grandfathered corpus 27,337,660 bytes across 825 migrated logs with
zero drift; 0 files over 1 MB; 0 quest directories off shape; solver 3,151
lines; tests 886 lines. The mapping report sums to 15,902 entries with an
empty unmapped table; one v1 type (`goal-declared`, one entry) was missing
from the 23-type inventory and is kept verbatim. The archive bundle holds
3,003 files (29.7 MB) on the evidence store.
