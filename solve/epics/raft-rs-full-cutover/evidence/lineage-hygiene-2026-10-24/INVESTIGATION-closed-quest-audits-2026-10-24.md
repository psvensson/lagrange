---
audience: development
documentClass: evidence
---

# Investigation: closed-quest-shape and solve-footprint reds (2026-10-24)

Read-only. Subject: worktree `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`, branch
`work/mg-delivery-resume-r2-20261023`, HEAD `deef6b41c` (pushed; on `origin/work/mg-delivery-resume-r2-20261023`).
Publication base (merge-base with origin/main) `d60c309216`; 1222 commits ahead (968 first-parent).
origin/main as fetched: `40795f7d2` (2026-10-24 03:44Z), 22 commits past the merge base. Nothing edited, nothing committed.

## Summary

- The two reds are **separate problems with almost no overlap**.
  - closed-quest-shape: exactly **22 files / 559,078 bytes in ONE closed quest**,
    `seed-participant-release-native-startup-census` (terminal `superseded`, appended in `c447019c2`, 2026-10-13).
    All 22 are `is not required by the sealed terminal claim`, all `at: working tree`. **0 MISSING, 0 MUTATED** across all 1222 admitted edges.
    This matches the lab log exactly (22 unique paths; the TAP diff prints each twice, hence 44 lines).
  - footprint: active bytes **119,698,677** against a budget of **20,971,520** (5.7x). History is 31,587,033.
    Subtest 1 fails on `history > active` (solve-footprint-accounting.test.js:39-40); subtest 3 fails on `active.ok`
    (:59). Closed quests are only 3.5 MB of quest-directory bytes (mostly their own `quest.json`). **107.3 MB is
    evidence in OPEN quests**, which the closed-quest rule does not cover.
- No checker defect found. Both checkers do what their sealed quests say.
- origin/main is clean under both: active 11,787,308 B (11.24 MB) < 20 MB with history 29,765,938 > active;
  closed-quest composition is 900 closed quests and 0 offences. **Both reds come from this lineage.**
- The first commit to break the footprint budget is `4151a3ab4` (2026-10-12, "Ephemeral exact-byte proof snapshot
  only; not reviewed or landed"). It took active bytes from 16.55 MB to 49.87 MB, added 1159 files / 34.9 MB under
  `replicated-transaction-decision-and-apply`, and brought in all 5 files over 1 MB (tarballs).

## 1. The rules

### closed-quest-shape (`npm run audit:closed-quest-shape`, owner `terminal-proof`, router.md:20)
- The invariant is at `scripts/checks/check-closed-quest-shape.js:12-14`: a closed quest holds exactly `quest.json`,
  `log.ndjson`, and the proof artifacts its sealed `doneWhen` requires. Those artifacts may be neither deleted nor
  modified after closure.
- "Required" is derived structurally by `requiredProofArtifacts(quest.doneWhen)` (`scripts/solve/probes.js`). Only
  paths inside the quest's own directory count (`:94-107`). Prose or filenames grant nothing (`:21-25`; test :140-155).
- Composition (`:143-154`) checks the working tree: anything not allowed is UNREQUIRED, and any required path that is
  absent is MISSING. Immutability (`:160-180`, `:224-240`) checks each admitted edge base..HEAD, using closure as it
  stood at the edge's parent.
- The offence strings are at `:59-63`. The remediation text at `:67-69` reads: "Remove what the claim does not need;
  never remove or rewrite what it does."
- Origin: quest `closed-quest-shape-amendment`, commit `60bd588f5` (2026-09-06). It replaced solve-v2 Amendment 4's
  rigid two-file shape (closed = quest.json + log.ndjson). Later edits: `0538db5c7` (publication merge-base default)
  and `6b305a2fa` (batched blob reads).
- The failing subtest is `test/scripts/closed-quest-shape.test.js:157-162`. It asserts
  `closedQuestShapeOffences()` deep-equals `[]` for the real repository.

### footprint (`scripts/checks/solve-v2-budget.js`, sealed by quest `solve-footprint-accounting`, `7448761b5`, 2026-09-06)
- Inputs are the tracked files under `solve/` (`git ls-files -z solve`, :147-152), sized by `fs.stat` (:154-159).
- **History** is exactly the paths `isQuestLogPath` accepts (`scripts/solve/store.js:301-308`): only
  `solve/quests/<id>/log.ndjson`. **Active** is every other tracked path under `solve/`. That includes `quest.json`,
  everything in `evidence/`, quest-root `.md` files, `solve/epics/**`, `solve/specs/**` and `solve/changes/**`
  (:161-176).
- Budget: `ACTIVE_FOOTPRINT_BUDGET_BYTES = 20 * MEGABYTE` (:70), strictly less-than (:236-238). Total and history
  are reported only and never gated (:227-235).
- Origin of 20 MB: the solve-v2 epic acceptance metrics (`solve/epics/solve-v2.md:68,83`, "active v2 footprint < 20
  MB", gate due at the end of phase 2). The phase 2 report (:132-158) measured 8,974,688 B at landing. The test pins
  the number on purpose (solve-footprint-accounting.test.js:55-57: "the original target is unchanged"). Raising it
  would breach the one-way ratchet rule (AGENTS.md) and R23 (rules.md:175).
- Subtest 1 also asserts `history > active` (:39-40). In practice that is a second ceiling, active < 31.6 MB, and it
  is weaker than the 20 MB one.
- Runtime: `measureSolveV2Budget` also calls `closedQuestShapeOffences()` (:208-210, `quest-dirs-off-shape` row).
  The ~7 minutes is the per-edge walk over 1222 admitted edges, not the footprint sum. Locally the full shape check
  took 295 s; my footprint sum took about 1 s.
- Related row not asserted by the test: `solve-files-over-1mb` is 5 on HEAD (budget 0). There are also 29 lineage
  archives (`.tar.gz`/`.gz`) tracked under `solve/`. The pre-commit binary guard (`check-solve-binary-guard.js`)
  forbids both; it checks staged ACMR paths only, so hook-skipped WIP commits let them in (`8b3638233` says
  "pre-commit skipped"; I could not determine this for `4151a3ab4`).

### R20 vs R21 and how the owners reconcile them
- R20 (rules.md:153-159, owner `terminal-proof`): a closed unit keeps the evidence its claim needs "and nothing
  else".
- R21 (rules.md:161-167, owner `record-history` = `audit:quest-log-append-only`): recorded findings, attempts,
  verdicts and terminal entries are never rewritten, relocated or deleted. Its checker covers only canonical
  `log.ndjson` paths (check-quest-log-append-only.js header; `isQuestLogPath`).
- **Reconciliation, by the owners' own boundaries:** evidence files are not recorded entries. Deleting or relocating
  an evidence file therefore breaks no R21 entry, as long as every log line is kept byte-for-byte and any correction
  is appended as a new entry.
- Precedent for relocating evidence: solve-v2 phases 1 and 2 (`solve/epics/solve-v2.md:118-140`). Phase 1 moved 38
  binaries to the `solve-evidence` pre-release. Phase 2 moved 3,003 files in one 29.7 MB bundle. Each was recorded as
  a `finding kind: evidence` with sha256, size and URL after re-download.
- `docs/development/quest-closure.md` does **not** say how to prune a closed quest. It only defines
  SOLVED/EXHAUSTED/MAX_CYCLES and was last reviewed 2026-07-10, before v2. quest-artifacts.md:34-36 says to track
  `evidence/` "when they document committed Quest progress or closure", and is just as silent on pruning. The only
  prescription is the checker's remediation string (:67-69).
- **Gap:** a terminal quest takes no entries (`scripts/solve/commands.js:137`, `openState` refuses). So the record of
  pruning a CLOSED quest cannot go on that quest. It has to go on an open quest: the remediation quest, or the open
  successor `seed-participant-release-applied-position-barrier`.
- R26 (rules.md:197): uploading to the shared release is an outward action. The code asks the authority only for
  `--replace` and for delete (`scripts/solve/evidence-store.js:101-106,143-148`). A plain upload is not gated in code,
  but under R26 it still needs operator authority.

## 2. Inventory (measured locally on HEAD deef6b41c)

Raw outputs are in the scratch dir `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/hygiene/`:
- `shape-offences.json`: the real checker, `closedQuestShapeOffences()` with the default base. 22 offences, 295 s.
- `composition.json`: composition only, with sizes and tracked flags.
- `active-files.tsv`: every active file, by size.
- `per-quest.tsv`: bytes, files and open/closed status per quest directory.
- `evidence-by-quest.tsv`: evidence bytes per quest, with cumulative sums.
- `eviction-candidates.tsv`: 6190 files. These are the lineage-added `evidence/` files minus any path some `doneWhen`
  requires.
- `bytes-by-commit.tsv`: which commits added how many bytes.
- `required-artifacts.tsv`: every `doneWhen`-required path, with its size.

The helper scripts are in `scripts/` under the same dir.

### 2a. closed-quest-shape: quest `seed-participant-release-native-startup-census` (superseded; all tracked; all added in `77e091f64`, terminal appended in `c447019c2`)
Required and present: `quest.json`, `log.ndjson`, `evidence/receipt.json` (1,865 B; `doneWhen` test-receipt).
Unrequired (reason `is not required by the sealed terminal claim`, at `working tree`), 22 files, 559,078 B:

| path (under the quest dir) | bytes |
| --- | --- |
| checkpoint-hold.md | 4708 |
| evidence/receipt-initial-v1.json | 1865 |
| evidence/startup-source-ordering-diagnosis-v2.md | 7860 |
| evidence/startup-source-ordering-diagnosis-v3.md | 10951 |
| evidence/startup-trace-independent-review-v2.md | 7378 |
| evidence/startup-trace-result-v2.json | 3792 |
| evidence/startup-trace-v2-adam-laptop.raw.err | 0 |
| evidence/startup-trace-v2-adam-laptop.raw.log | 132227 |
| evidence/startup-trace-v2-adam-laptop.status.json | 36 |
| evidence/startup-trace-v2-fleet.json | 12696 |
| evidence/startup-trace-v2-input.json | 650 |
| evidence/startup-trace-v2-lab.log | 132986 |
| evidence/startup-trace-v2-result.json | 62 |
| evidence/startup-trace-v2-test-results.ndjson | 266 |
| evidence/trace-excerpt-records-v2.json | 203492 |
| evidence/trace-input-v2.json | 653 |
| evidence/trace-preflight-v1.md | 4959 |
| evidence/trace-preflight-v2.md | 4290 |
| evidence/trace-v1-hashes.json | 366 |
| evidence/trace-v1.diff | 11183 |
| evidence/trace-v2-hashes.json | 366 |
| evidence/trace-v2.diff | 18292 |

### 2b. footprint
| quantity | bytes |
| --- | --- |
| tracked files under solve/ | 8,938 |
| total | 151,285,710 |
| history (canonical logs) | 31,587,033 |
| active | 119,698,677 |
| budget | 20,971,520 |
| minimum to remove | 98,727,158 |
| active bytes of files already present at the merge base | 11,805,762 |
| lineage-added active bytes | 107,892,915 (6,470 files) |
| of which quest `evidence/` | 103,480,188 (6,229 files) |
| of which other quest-dir files (design.md, checkpoint .md, etc.) | 3,009,627 (113) |
| of which epics/specs/changes | 1,259,783 (89) |
| of which new quest.json | 143,317 (39) |

Bytes by extension (lineage evidence): .json 28.9 MB, .tar.gz 18.9 MB, .log 17.4 MB, .txt 12.8 MB, .md 12.7 MB,
.tap 5.9 MB, .patch 1.3 MB, .json.gz 1.1 MB.

The top 16 quests by lineage evidence bytes are below. All are **open**; the last column is active bytes after
evicting the cumulative set.

| quest | evidence bytes | files | active after evicting rows 1..n |
| --- | --- | --- | --- |
| replicated-transaction-decision-and-apply | 39149610 | 1541 | 80549067 |
| wasm-creation-genesis | 20737275 | 1442 | 59811792 |
| seed-participant-release-applied-position-barrier | 6070064 | 770 | 53741728 |
| seed-control-current-proof-amortization | 6040160 | 392 | 47701568 |
| retained-seed-original-handoff | 5922519 | 352 | 41779049 |
| tx1-single-path-alpha | 5910480 | 144 | 35868569 |
| runtime-captured-inbound-extent | 4932401 | 212 | 30936168 |
| decision-audit-dependency-construction | 1973286 | 55 | 28962882 |
| message-group-fresh-identity-membership | 1711035 | 172 | 27251847 |
| participant-release-completion-owner | 1520041 | 53 | 25731806 |
| participant-release-held-recovery-continuation | 1391102 | 200 | 24340704 |
| cleanup-exception-audit-correspondence | 1311625 | 48 | 23029079 |
| runtime-ordering-completion-consumer-proof | 1175009 | 77 | 21854070 |
| participant-control-refusal-provenance | 744777 | 41 | 21109293 |
| seed-release-failure-custody | 733490 | 71 | 20375803 |
| seed-participant-release-failure-projection-alpha | 704866 | 176 | 19670937 |

The largest files are below. The first five are the only files over 1 MB, all `.tar.gz`, all from `4151a3ab4`.

| bytes | path |
| --- | --- |
| 6076300 | solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-resource-round12-independent-f6802647/diagnostics.tar.gz |
| 4358951 | solve/quests/replicated-transaction-decision-and-apply/evidence/begin-resource-round9-independent-92b86663/diagnostics.tar.gz |
| 2448667 | solve/quests/replicated-transaction-decision-and-apply/evidence/activation-final-engine-08719586/pgwire-final-recovery-owner-durable-first-failure.tar.gz |
| 2254031 | solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-resource-round10-independent-81881308/diagnostics.tar.gz |
| 2075129 | solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-resource-round11-independent-24c5c10a/diagnostics.tar.gz |
| 969449 | solve/quests/wasm-creation-genesis/evidence/recovery-20261017/verifier-recovery-u1-cloud/static-prereq-reruns/jscpd-test-summary.json |
| 905900 | solve/quests/tx1-single-path-alpha/evidence/frozen-v3-broad-adam-laptop.log |
| 899587 | solve/quests/wasm-creation-genesis/evidence/recovery-20261017/verifier-recovery-u1-cloud/static-prereq-reruns/jscpd-src-scripts.json |
| 880323 | solve/quests/tx1-single-path-alpha/evidence/frozen-v3-red-controls/adam-laptop/raw.log |
| 860059 | solve/quests/runtime-captured-inbound-extent/evidence/remaining-adams-gamla/run.log.txt |
| 787377 | solve/quests/replicated-transaction-decision-and-apply/evidence/activation-final-engine-08719586/startup-success-db-r1-10b485de.tar.gz |
| 779532 | solve/quests/runtime-captured-inbound-extent/evidence/remaining-tv-dator/run.log.txt |

## 3. Classification

- **closed quest, 22 files: remove from the tree (R20).** None is derived from the sealed `doneWhen`. That includes
  `receipt-initial-v1.json` (a predecessor receipt) and `checkpoint-hold.md` (a quest-root note). This is not a
  checker defect: the rule and its fixture tests (closed-quest-shape.test.js:89-108) refuse exactly this shape on
  purpose.
  - The bytes stay reachable at `77e091f64` and `c447019c2`, both ancestors of a pushed branch. The terminal entry
    itself says "preserved at 77e091f64".
  - An upload to `solve-evidence` is optional extra insurance, in case the lineage branch is later squashed or
    deleted. It is about 560 KB of text.
  - The open successor `seed-participant-release-applied-position-barrier` cites only this quest's `log.ndjson`
    (3 references in its log). That file is kept.
- **footprint, 6,190 files / 103,380,017 B: move to the canonical evidence release (bundle per quest), then remove
  from the tree.** These are open-quest evidence, so R20 does not apply. They are governed by the 20 MB budget and,
  for the 29 archives, by the phase-1 rule that binaries never enter git.
  - Keep in the tree every `doneWhen`-required file: 39 lineage files, 100,171 B (`required-artifacts.tsv`). Also keep
    `quest.json`, `log.ndjson` and the receipts that `scripts/quest-evidence/*.js` read.
  - After that eviction: active **16,318,660 B** (headroom 4,652,860), and history 31.6 MB > active, so subtests 1
    and 3 go green.
  - Evicting fewer quests does not get there. Even the top 14 quests leave 21.1 MB. In effect all lineage evidence
    must go, or at least the top 15 or 16 quests' evidence.
- **Checker defects: none found.**
  - Observation only, not a red cause: the closed-quest checker requires a SUPERSEDED or EXHAUSTED quest's `doneWhen`
    artifacts just like a SOLVED one's. Whether a superseded "sealed terminal claim" should still pin a failing
    receipt is an owner question, but keeping it is the conservative reading.
  - Doc defect: `docs/development/solver-runbook.md:23,262` say `evidence add <path> --quest <id>`, but the CLI reads
    `--id` (`scripts/solve.js:12,115`).

## 4. Which commits and quests introduced the bytes

Attribution is by the first add in d60c309216..HEAD of each currently-present active file. That covers 106.1 MB over
322 commits.

| commit | date | bytes added (still present) | subject |
| --- | --- | --- | --- |
| 4151a3ab4 | 2026-10-12 | 34931714 | Ephemeral exact-byte proof snapshot only; not reviewed or landed |
| f5717e6f5 | 2026-10-18 | 6106846 | handover: preserve independent U1 rejection and cloud restart evidence |
| d35d8828c | 2026-10-13 | 5943504 | WIP: remove legacy transaction engine; retain rs-raft recovery HOLD |
| c6006c745 | 2026-10-17 | 4862081 | WIP: bounded owner-side re-decide for slot transitions (amendment A2', stage 1b, verified, lab-accep |
| c3c9154b3 | 2026-10-15 | 4572019 | docs(raft): preserve W07 correction evidence and F1 ordering hold |
| 381750de2 | 2026-10-17 | 3175726 | stage 1c (wasm-creation-genesis): node-side bound CREATE/REMOVE routes, discovery rows, PRESENT mark |
| 108282c80 | 2026-10-15 | 3075621 | docs: preserve native release fencing owner packet and rejected review |
| 681da1dc1 | 2026-10-23 | 2571530 | wip: preserve rs-raft delivery draft at user stop |
| dbf2e0f3f | 2026-10-14 | 1612879 | wip: preserve applied-position v2 and v4 control evidence |
| b7266f3b8 | 2026-10-17 | 1518430 | docs: preserve all event-reconciliation evidence and next-agent handover; no merge approval |
| 89e70949f | 2026-10-17 | 1504760 | WIP: serving grant, receiver-local publication and RETIRED-before-CLOSED through the existing owners |
| a251ce4fd | 2026-10-17 | 1435709 | handover: recovery-stage design (Revisions 1-5, APPROVED after six vet rounds) + UNVERIFIED recovery |
| c447019c2 | 2026-10-13 | 1285528 | WIP: preserve qualified native release source red and approved barrier design |
| 0aa3807bc | 2026-10-12 | 1226534 | WIP rs-raft: preserve refined shared-replacement proof and all audit outcomes |
| 9e32db444 | 2026-10-12 | 1211176 | WIP rs-raft: retain exact shared-replacement source and all positive and negative evidence |
| d9b687263 | 2026-10-16 | 1123851 | evidence(raft-rs): preserve ordering and consumer proof with explicit holds |
| e6f0b1bf7 | 2026-10-15 | 1050004 | docs: preserve ordered release recovery design and evidence |
| 84ef2c883 | 2026-10-14 | 1031464 | wip: preserve reviewed release source and first exact candidate failures |
| 2e229bd6f | 2026-10-21 | 986833 | docs: preserve complete raw completion audit census |
| 3ebc7da41 | 2026-10-13 | 824985 | wip(rs-raft): preserve rejected observer V1 and exact review evidence |

- The closed-quest offences all come from `77e091f64` (files) plus `c447019c2` (the terminal entry), both 2026-10-13.
  Both are WIP commits that bypassed `solve land`. A land would have run this guard.
- Bisect over first-parent history: the footprint budget first fails at `4151a3ab4`. Its parent `e7c89f4b5` was
  16.55 MB, so the lineage was already near the limit.

## 5. Remediation plan (for an implementer; needs the owner decisions in 5.0 first)

5.0 Owner (human) decisions required:
- (D1) Authorize evicting about 103 MB of evidence from OPEN quests that this session is still working, including
  the lead's own `retained-seed-original-handoff` (5.9 MB; it holds the very lab logs that measured these reds).
  Other large ones are `replicated-transaction-decision-and-apply`, `wasm-creation-genesis`, `tx1-single-path-alpha`
  and `seed-control-current-proof-amortization`.
- (D2) Authorize the outward upload of about 20 bundles (around 100 MB, before compression) to the public
  `solve-evidence` pre-release (R26). It currently holds 125 assets / 472 MB. Alternatively, accept git history
  (pushed SHA `deef6b41c`, or whatever pre-eviction head) as the only retention. That is weaker if the branch is ever
  squashed or deleted.
- (D3) Confirm that removing the 22 files from the superseded census quest is wanted, given that its terminal text
  says the evidence is "retained" (in git at `77e091f64`).
- (D4) Note, not required: if this lineage is merged into main, its history carries these blobs forever (blobless
  clone is the documented mitigation, solver-runbook.md "Partial clones"). Rewriting history is deferred per
  solve-v2 design section 5.

5.1 Unit of work: one Quest (it changes an owner-boundary state and needs a measured proof). Example:
`lineage-solve-footprint-and-closed-shape`, under the rs-raft epic or a hygiene epic, with
`doneWhen = {probe: script, command: "node scripts/checks/solve-v2-budget.js --metric solve-active-bytes,quest-dirs-off-shape,solve-files-over-1mb"}`.
It is red now with value 3 (assumed; I have not run `--metric`). Seal it with `node scripts/solve.js start --id <id>`
in its own worktree (one worktree per quest).

5.2 Record the pre-eviction head: P = HEAD at start, which must be pushed. Every evicted byte stays reachable at P.

5.3 For each open quest Q in the eviction set (`eviction-candidates.tsv`, grouped by quest):
- a. Build `scratch/<Q>-lineage-evidence-<date>.tar.gz` from exactly Q's candidate paths. Put a
  `MANIFEST.json` inside it with path, bytes, sha256 and adding commit (`git log --diff-filter=A --format=%h -- <path>`)
  for each file. Keep the manifest out of the tree: it would cost active bytes, and the headroom is only 4.6 MB.
- b. Run `node scripts/solve.js evidence add <bundle> --id <Q> --text "lineage evidence evicted from tree for the 20 MB active budget; byte-identical at <P>; manifest inside"`.
  The CLI uploads, re-downloads, re-hashes and appends the `evidence` finding (sha256, bytes, asset, url). Q is open,
  so this is allowed. Use a unique basename; a non-`--replace` upload refuses to clobber.
  Assets larger than GitHub's per-asset limit: none expected; the largest quest is about 39 MB raw.
- c. `git rm -r --cached` + delete exactly those paths. Never touch `log.ndjson`, `quest.json` or any
  `required-artifacts.tsv` path.

5.4 Closed quest `seed-participant-release-native-startup-census`:
- a. Optional: bundle its 22 files and upload with `--id <remediation quest>`. A terminal quest takes no entries
  (commands.js:137).
- b. `git rm` the 22 paths. Keep `quest.json`, `log.ndjson` and `evidence/receipt.json`.
- c. Append a finding on the remediation quest:
  `note --id <remediation> --finding "... 22 unrequired files of closed seed-participant-release-native-startup-census removed per R20; byte-identical at 77e091f64/<P>; asset <name>"`.
  Do not hand-append anything to the closed quest's log.

5.5 Optional, not gated: epic prose in `solve/epics/**` (17 files) cites evicted evidence paths. Leave it, or append
a pointer to the asset. Do not rewrite recorded logs. Nothing link-checks these paths: no check under
`scripts/checks` scans them, and only receipts and one comment in `test/` and `scripts/` reference quest evidence.

5.6 Commit order:
- (i) evict + finding per quest, either one commit per quest or one commit total;
- (ii) the closed-quest prune;
- (iii) `solve land`.

Do not skip pre-commit. The binary guard only inspects ACMR paths, so deletions pass.

5.7 Cheap proof, local, about 5 minutes total:
- `node scripts/checks/check-closed-quest-shape.js` must print `closed-quest shape: clean`.
- `node scripts/checks/solve-v2-budget.js` must show:
  - `solve-active-bytes` ok (expected about 16.3 MB);
  - `solve-files-over-1mb` 0;
  - `quest-dirs-off-shape` 0.
- `npm run audit:quest-log-append-only` must be clean (only appends).
- `npm run -s test:duplication`.

5.8 Then the two tests, once each, sequentially (about 7 min each, lab-first per memory):
- `node --test test/scripts/closed-quest-shape.test.js`
- `node --test test/scripts/solve-footprint-accounting.test.js`

Both must be fully green: 9/9 and 4/4.

## 6. origin/main
Reasoned from tree listings (`git ls-tree -r -l`), without running the tests on main:
- footprint: 2,433 tracked solve files, active 11,787,308 B (< 20,971,520), history 29,765,938 B (> active), and 0
  files over 1 MB.
- closed-quest composition (the same derivation run against main's blobs): 917 quest dirs, 900 closed, **0
  offences**.
- The mutation part has no edges when HEAD == origin/main.

**origin/main is clean under both tests.** The merge base d60c309216 is also clean (active 11.76 MB).

## Unknowns
- Whether `4151a3ab4`/`77e091f64` skipped the pre-commit hook. The messages do not say; `8b3638233` does.
- The exact `--metric` seal-time value for the proposed quest. I did not run it.
- Whether the owner wants eviction from quests still in flight (D1), or wants an approach of the form "close or
  supersede the finished quests first, then prune them under R20". The second still leaves open-quest bytes over
  budget unless they move.
