---
id: solver-streamlining-spec
status: open
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests:
  - solver-streamlining-2026-09
authorizes: []
legacyStatus: active
---

# Solver streamlining — corrected specification (independent design review)

Reviewed against worktree `.claude/worktrees/solver-streamlining` at `0ecb49863`
(read-only; `test/solve/landing-preflight-retry.test.js` run green as an
environment check). Line numbers below are from that tree. The measured
friction was re-derived from the recorded event logs of
`readiness-planning-generation-granularity-v2` / `-v3` (read-only grep of the
main tree's `solve/log/`), which changes two of the seven diagnoses
(P5 and P7a) and adds one new owner (P8).

Verdict per proposal: **P1 changed (narrowed)**, **P2 changed (re-shaped as an
epoch boundary, not a re-pin)**, **P3 changed (compose with `solve preflight`,
not `continue`)**, **P4 kept with a fail-closed rule + companion cap fix**,
**P5 changed (board claim wrong; foreign-quest bookkeeping is the real owner)**,
**P6 kept (with a zero-test honesty guard)**, **P7a changed (wrong mechanism;
the real defect is non-transactional consumption)**, **P7b kept**, **P7c kept
(narrowed to fail-fast)**, **P8 added (stall theory gate over-fires on
replacement attempts)**.

---

## P1 — Delta-scoped re-verification after a rejection

### What the code does today
- Every `land` without a verdict mints a fresh manifest
  (`review-request.js:214 createReviewRequest` → `currentReviewManifest`
  `:135-198`). The manifest binds `candidate`/`aggregate` receipts
  (fingerprint, base, paths, attempt range — `receipt()` `:70-79`), never
  candidate bytes, and carries **no relation to the previous rejected review**.
- `requiredReviewTemplates` (`:98-131`) = sealed bar ∪ mechanical suggestions
  over **every attempt's whole diff** (`suggestVerificationTemplates`,
  `verification-template-suggest.js:161-176`: keyword regex over changed paths
  plus changed `+/-` lines; `harness-fidelity` for any `test/` path).
- Verdict accounting is exact both ways: missing or extra category →
  `TEMPLATE_MISMATCH_PROBLEM` (`verifier-verdict.js:160-185`); template items
  are `{category, evidencePaths}` with `ownKeysExactly` (`:117-123`).
- So a round-4 verifier receives a 49-path candidate and a 10-category bar with
  nothing telling it that only one method and one rig changed since the
  rejected fingerprint. That is the whole cost driver.

### Invariant analysis
- Exact-fingerprint approval: unaffected either way (approval stays bound to
  the new aggregate fingerprint).
- "Require only the template categories whose paths intersect the delta" would
  make the keyword heuristic load-bearing. The module documents it as advisory
  with acceptable false negatives (`verification-template-suggest.js:17-19`),
  and templates are cross-cutting (a one-method change can add a race). A
  machine waiver of sealed categories therefore **weakens the sealed bar** and
  must be dropped.
- Byte-identity "attestation for the rest" is fine as *machine-computed
  dossier content*; it must not become an approval surrogate.

### Kept, narrowed: machine-frozen review delta; verifier-owned scoping
**v1 (recommended first; no verdict-schema change).**
1. Manifest schema 4: add `candidate.pathDigests` (`{path: sha256(git diff
   <base> -- <path>)}`) at mint (one `git diff` per path, or split the existing
   canonical diff on `diff --git` headers — `withoutGeneratedOutputSections`
   already does that split). Hash cost is negligible.
2. Add `manifest.reviewDelta` when the quest has an unresolved candidate
   rejection whose review manifest exists under `solve/state/reviews/`:
   `{priorReviewId, priorCandidateFingerprint, priorRejectionFindingCategories,
   changedPaths, unchangedPaths, deltaDiffPath, deltaTemplateHits}` where
   `unchangedPaths` are paths whose digest equals the prior manifest's,
   `deltaDiffPath` is a written `solve/state/reviews/<id>.delta.diff`
   (candidate content restricted to `changedPaths`), and `deltaTemplateHits` =
   `suggestVerificationTemplates(root, deltaDiff)` categories.
3. `requiredReviewTemplates[i]` gains `deltaRelevance: 'delta' |
   'unchanged'` (informational; sources unchanged).
4. Dossier/next text: `land` prints `review delta: N changed / M unchanged
   paths since <priorReviewId>; templates hit by the delta: [...]`.
5. Steering: "Source Change Verification" — one paragraph: the verifier still
   completes every required category; for categories the delta does not hit it
   may scope inspection to the delta plus the prior verdict's evidence, and
   must say so in the item's evidence file.

**v2 (only if v1 measurably leaves rounds long).** Optional
`completedTemplateItems[].carriedFrom = {reviewId, verdictSha256}` accepted
only when: `reviewId === manifest.reviewDelta.priorReviewId`, the category is
`unchanged` in `deltaRelevance`, the category is not in
`priorRejectionFindingCategories`, and the prior verdict file at that sha
completed the same category. `evidencePaths` stays mandatory. Fail-closed on
every mismatch. This is recorded provenance, not a waiver; still, it is the one
judgment call in this document — v1 preserves the bar with zero ambiguity.

### Implementation shape
- `scripts/solve/review-request.js`: `receipt()` (+pathDigests),
  `currentReviewManifest()` (+reviewDelta), `SCHEMA_VERSION = 4`; new helper
  `priorRejectedReview(root, quest, state, log)` reading the rejection's
  `verification.reviewEnvelope.reviewId` (written by `operator-workflow.js:456`).
- `scripts/solve/verification-template-suggest.js`: export a
  `suggestForPaths(root, diffContent, paths)` wrapper (filter sections by path).
- `scripts/solve/verifier-verdict.js` (v2 only): optional key list in
  `assertTemplateItemShape`; carried validation next to `validateTemplateItems`.
- `scripts/solve/preflight.js:115 templateNotes`: print `deltaRelevance`.
- Tests: `test/solve/landing-envelope-contract.test.js` (+"review delta freezes
  per-path digests and names unchanged paths"), `test/solve/operator-workflow.test.js`
  (extend "land rejects drift and records rejection without committing" with a
  second mint that carries `reviewDelta`; v2: "carriedFrom refused for a
  delta-hit or previously-found category"), `test/solve/verification-template-suggest.test.js`
  (+per-path wrapper).
- Docs: `solver-quests.md` "Source Change Verification"; `governance.md`
  GOV-0095 text regenerates via `npm run steering:llm:pack`.

Size: v1 ≈ 120 lines src + 120 tests; v2 +80/+60. Risk: low (v1), medium (v2).
Value: high — rounds 2–5 today re-read 49 paths each; the delta was 2 paths.

---

## P2 — Re-pin the source epoch instead of resealing

### What the code does today
- Epoch = base of the first uncheckpointed v2 source attempt
  (`verification.js:848-867 activeSourceEpoch`); drift = `git diff --name-only
  <base>..HEAD -- <reviewed ∪ new source paths>` (`:869-886`); any drift throws
  `sourceEpochDriftProblem` at begin (`step.js:80-86, 232`), at commit
  (`step.js:369-374`) and in the attempt wrapper (`attempt.js:171-178`). Only a
  `checkpoint(quest): <id>:` commit or a landing ends an epoch
  (`latestCheckpointCommit` `:669-686`, `attemptIsAfterCheckpoint` `:688-710`).
- `correct-attempt-base` (`attempt-base-correction.js:70-92 requireMatchingDelta`)
  moves an attempt's base only when the delta is byte-identical at both bases —
  i.e. exactly when the intervening range touched **no** attempt path. Drift is
  the complementary case, so it cannot help.
- `base_unreachable` transfers a standing rejection to a reachable base via
  "live-base-coverage" (`candidateRejectionProblem` `:1000-1044`,
  `resolveStepBaseCommit` `pending-step.js:99-118`): nothing waived, fresh
  approval of current bytes over every rejected path.
- v2 → v3 reseal cost (log): park v2 (`09:06:31`, "Base drift: the v2 source
  epoch (a6d99aa3d) predates two landed commits"), `new` v3, scope gate +
  override again (`09:08:07`/`:32`), re-recording three `out-of-bar:` slugs
  that had already been recorded once in v2, and the amendment budget reset.

### Why a literal re-pin is impossible
Attempt artifacts are fingerprinted as `sha256(git diff <base> -- paths)`
(`canonicalSourceDelta` `:513-560`). If the intervening commits touched those
paths, the same artifact does **not** reproduce at the new base; rewriting
`workspaceBaseCommit` would rename the reviewed delta (the very thing
`correct-attempt-base` refuses at `:117-123`). The aggregate anchors at the
earliest contracted base (`aggregateSourceFingerprint` `:619-666`); keeping the
old-base attempts live after a rebase would pull the intervening commits'
content into the "reviewed" aggregate — laundering foreign work.

### Changed: `rebase-epoch` = recorded epoch boundary + covering attempt
`node scripts/solve.js rebase-epoch --id <q> --to <commit> --reason "<why>"`
1. Refuse when: a step is pending (`loadPending`), the quest is terminal-landed,
   `--to !== HEAD` (the verb never runs git; the operator rebases/merges first),
   `--to` is not an ancestor of `refs/remotes/origin/main` (`git merge-base
   --is-ancestor <to> origin/main`; the ref is recorded, never fetched), or
   `git rev-list <fromBase>..<to>` is empty (nothing to rebase).
2. Append `epoch-rebased` (`constants.js` `EVENT_EPOCH_REBASED`):
   `{fromBase, toBase, remoteMain, interveningCommits, driftPaths,
   retiredPaths (the retired epoch's review-path union),
   retiredAttemptIndexes, reason}`.
3. Semantics (all in `verification.js`):
   - `activeSourceEpoch`, `buildLandingCandidate` (`:782-841`) and
     `aggregateSourceFingerprint` select only attempts with
     `index > lastEpochRebasedEventIndex` (companion to
     `attemptIsAfterCheckpoint`). Retired attempts stay reported in the dossier
     (like dead-base attempts) and never count as verification.
   - A standing obligation `epoch rebase requires a covering attempt at <to>
     over: <retiredPaths>` is emitted in `verificationState.attemptProblems`
     until the new epoch's path union ⊇ `retiredPaths`; `next` reuses the
     existing `REPLACE_REJECTED_ATTEMPT` action with `payload.bases=[to],
     requiredPaths` (`next.js:113-125` already renders that shape).
   - Standing rejections recorded at `fromBase`: generalize
     `rejectedBaseDead` (`:1013-1017`) to `rejectedBaseRetired = dead ||
     retiredByEpochRebase(log, base)`; resolution then follows the existing
     live-base-coverage rule (later changed-fingerprint candidate at a
     reachable base covering every remaining rejected path + its own exact
     approval). Same for `unresolvedRejectionEntry` (`:1049-1071`) and
     `resolveStepBaseCommit` (pin falls through to HEAD = `to`).
   - Decomposition coverage (`rejectionDecompositionCoverage`) keeps working:
     it re-validates at its own recorded base.
4. Preserved: scope authorization (path-signature keyed,
   `scopeSignatureHasAuthorization`) survives; out-of-bar slugs and the
   amendment budget continue in the same log (governance-positive versus a
   reseal, which reset both in v3).
5. Drop from the proposal: "refuse when intervening commits touch a standing
   rejection's paths" — with the transfer rule the rejection stays binding at
   the new base; refusing would leave the operator with no path but reseal.

### Implementation shape
- New `scripts/solve/epoch-rebase.js` (`runRebaseEpochCommand(root, args)`),
  register in `scripts/solve.js` `COMMANDS` and
  `docs/steering/solve-commands.json` (`gen-solve-commands-index.js` renders
  `(undocumented)` otherwise).
- `verification.js`: `latestEpochRebaseIndex(log)`, `attemptInLiveEpoch`,
  `retiredByEpochRebase`, obligation in `verificationState`.
- `next.js:240-262`: emit the covering action while the obligation stands.
- `checkpoint-preflight.js`: list retired attempts in the dossier.
- Tests: `test/solve/verification-handoff.test.js` (beside "a raw source commit
  cannot split a rejected attempt source epoch" `:286` and "source epoch blocks
  a different-base replacement before preflight" `:422`): "rebase-epoch retires
  the epoch and demands a covering attempt", "standing rejection transfers to
  the new base and still needs its own approval", "refuses --to off
  origin/main", "refuses with a pending step", "aggregate anchors at the new
  base only"; `test/solve/next.test.js` (+action); `test/solve/cli.test.js`
  (+registration).
- Docs: `solver-quests.md` "Source Change Verification" (epoch paragraph) and
  "Git Handoff"; runbook "Continue Source Work" (+ when to rebase-epoch vs
  reseal); pack regen.

Size ≈ 260 lines src + 250 tests. Risk: medium-high (owner of the one-base
invariant; mitigated by reusing the dead-base transfer path verbatim). Value:
one reseal per drifted quest-day (~45 min plus bar/amendment reset). Do this
last: P1/P7a/P8 shorten the window during which main drifts.

---

## P3 — One preflight mirroring landing + publish gates at attempt seal

### Corrected description of who runs what
| Stage | Checkers | Where |
| --- | --- | --- |
| attempt seal (`continue --summary`, `attempt`) | file-size admission vs base, ESLint, literal-guideline audit, ambient-intrinsics — changed linted paths only; overridable | `static-gate.js:82-124`, called `step.js:397`, `attempt.js:196` |
| `checkpoint --dry-run` + `npm run audit:attempt-preflight` | file-size, STYLE vocabulary, step-coverage census, whole-repo duplication (~90 s) | `package.json:164`; canon `solver-quests.md:737-760` |
| `solve preflight` (already exists, read-only, no log event, no override) | audit, landing-union, untracked-intent, generated-outputs, file-size, review-templates | `preflight.js:1-15, 126-137` |
| `land` review preflight (mint **and** verdict) | import-closure gaps, canonical import-graph verify (30 s ×2), `staticQualityProblems` again, silent-catch; cached by digest | `landing-preflight.js:301-336`, `silentCatchProblems :143-167` |
| pre-commit hook | file-size, hot-path diagnostics, staged constant names, literals, decision-boundaries, ambient-intrinsics, silent-catch, `check-complexity.js --scoped` (report-only), doc-ascii, inventory regen | `.githooks/pre-commit:74-127` |
| publish / pre-push | unused files, lint, duplication + file-size ratchets, cycles, unused exports, `run-static-audits.js` (complexity, cognitive, 20 audits), test corpus | `.githooks/pre-push`, `scripts/checks/run-static-audits.js:32-53` |

Gaps that cost gate time (memory 2026-09-04): **complexity and cognitive
ratchets are in no Solver stage before publish**; silent-catch and
decision-boundaries first bite at land/commit, not at seal.

### Invariant analysis
Adding checkers never weakens anything. Putting the *whole* union into
`continue --summary` would add ~2 min per attempt (duplication, import-graph,
whole-repo ratchets) and duplicate `solve preflight`, which was built exactly
as the batch surface. `preflight` and `reattempt` are currently
`(undocumented)` in `docs/steering/llm/solve-commands.md:60-61`.

### Changed: extend the seal gate with cheap per-path checkers; extend `preflight` with the publish statics
1. `static-gate.js staticQualityProblems`: add silent-catch and
   decision-boundaries (same `runChecker` shape; both accept file lists per the
   pre-commit hook), and a new `complexityAdmissionProblems(root, baseCommit,
   jsPaths)` (new `scripts/solve/complexity-admission.js`, modelled on
   `file-size-admission.js`): run `check-complexity.js --scoped` and
   `check-cognitive-complexity.js --scoped` over the changed paths at the
   working tree and at `baseCommit` (via `git show` into a temp dir, as the
   file-size admission does) and block only on **new** violations. Still
   overridable (`CONTINUATION_BLOCKED_STATIC_QUALITY`).
2. `preflight.js`: new section `publish-static` (`--full`): duplication ratchet,
   unused exports, cycles, `run-static-audits.js` subset; default run stays
   cheap. `next` after a terminal attempt prints
   `node scripts/solve.js preflight --id <id> --full`.
3. `land` preflight already reuses `staticQualityProblems`, so it inherits 1.
4. Sidecar entries for `preflight` and `reattempt`.

### Tests / docs
- `test/solve/static-gate.test.js` (+"new complexity violation blocks,
  pre-existing does not", +"silent-catch/decision-boundary block with bounded
  output"); `test/solve/solver-preflight.test.js` (+"--full adds publish
  statics"); `test/solve/landing-preflight-retry.test.js` untouched.
- `solver-quests.md` "Source Change Verification" (`:816-819` list of seal
  checkers), runbook "Continue Source Work"; pack regen.

Size ≈ 200 lines src + 120 tests. Risk: low. Value: high (each miss costs a
13–25 min gate run).

---

## P4 — Finding severity

### What the code does today
- Findings are strictly `{category, summary}`: CLI parse
  (`rejection-findings.js:57-77`), verdict file (`verifier-verdict.js:49
  REQUIRED_FINDING_FIELDS`, `ownKeysExactly` at `:190-206` refuses any extra
  key). No severity exists.
- Bar rule (`rejectionFindingBarProblem :118-141`): with a sealed bar, a
  category outside it must be written `out-of-bar:<slug>`; every prior
  `out-of-bar:` slug in any verifier-rejection finding of the quest log
  (`priorOutOfBarCategories :97-112`) makes a repeat refuse until
  `amend --kind verification-bar-expansion`. Counting is per slug per quest
  log ("recorded once"), regardless of how many findings carried it in that
  round.
- Amendment budget `QUEST_AMENDMENT_LIMIT = 2` is shared by all five kinds
  (`amend.js:74`, `:363-371`). v3 log: round 2 recorded three `out-of-bar:`
  slugs; at round 3 (`09:54:28`) both lifetime amendments were spent on
  `recovery-replay` and `transport-delivery` so later rounds could name them
  again; round 4 then listed 11 categories including both.

### Invariant analysis
"A real defect is never waived" (`solver-quests.md:815-822`). A severity that
"never counts toward the bar" lets a verifier mislabel a defect as an
observation and skip the bar entirely. Narrow, fail-closed variant:

### Kept with a fail-closed rule
1. `severity: 'defect' | 'observation'` (default `defect`). CLI: repeatable
   `--observation "<category>: <summary>"` beside `--finding`; verdict file:
   optional `findings[].severity` (extend `ownKeysExactly` optional list).
2. Rules: observations are recorded verbatim on the finding event
   (`verification.findings[]` with `severity`), never enter
   `priorOutOfBarCategories`, never trigger the bar problem, and may use any
   slug (no `out-of-bar:` prefix needed). **A rejection must carry at least
   one defect finding** — a rejection whose findings are all observations is
   refused (`land` and `finding`), so a defect cannot hide as an observation
   without the round being an approval. Defects keep today's exact bar rule.
3. `theory option --from-rejection` (`theory.js:532-583`) pre-fills from
   defects only.
4. Companion (P4b): monotone amendment kinds (`verification-bar-expansion`,
   `receipt-bar-strengthen`) can only make the quest harder, so the "3rd
   correction is drift" argument (`amend.js:70-74`) does not apply. Give them a
   separate `MONOTONE_AMENDMENT_LIMIT = 4` and exclude them from
   `QUEST_AMENDMENT_LIMIT`. Not a weakening: the sealed probe/metrics remain
   immutable and every expansion still needs a verifier reference.

### Implementation shape
- `rejection-findings.js`: `parseRejectionFindings(raw, {severity})`,
  `rejectionFindingBarProblem` filters `severity === 'defect'`,
  `priorOutOfBarCategories` ignores observations; export
  `requireDefectFinding(findings)`.
- `verifier-verdict.js validateFindings`: optional `severity`; reject-verdict
  requires ≥ 1 defect.
- `scripts/solve.js cmdFinding :620-670` and `operator-workflow.js
  landQuestWorkflow :428-440`: parse `--observation`, apply the rule.
- `verification.js buildVerificationFinding`: carry `severity`.
- `amend.js runAmendCommand`: per-kind cap.
- Tests: `test/solve/rejection-findings.test.js` ("bar problems: in-bar passes,
  out-of-bar passes once, repeat refused" → add observation cases;
  "parseRejectionFindings parses and fails closed" → severity),
  `test/solve/landing-envelope-contract.test.js` ("verdict ingestion refuses
  links, excess fields…" → severity accepted, all-observation reject refused),
  `test/solve/amend.test.js` and `rejection-repair-amendment-path.test.js`
  (monotone cap), `test/solve/operator-workflow.test.js` (+1).
- Docs: `solver-quests.md:806-822` (category paragraph), sidecar `amend`,
  `finding`, `land` usages; pack regen.

Size ≈ 130 lines src + 120 tests. Risk: low-medium. Value: high (two
amendments and one out-of-bar round measured today).

---

## P5 — Auto-exclude regenerated projections and other quests' `solve/` trees

### Corrected mechanism (the board claim is wrong)
- `createAutoDiffChangeRef` (`auto-diff.js:129-207`) discovers paths with
  `git diff HEAD -- . :(exclude)solve/FRONTIER.generated.md :(exclude)solve/artifacts
  :(exclude)solve/state :(exclude)solve/log :(exclude)solve/report
  :(exclude)<owner inventories>` (`AUTO_DIFF_EXCLUDED_BOOKKEEPING_PATHSPECS :61-69`,
  present since f1d56ba6f, 2026-07-10) plus registered generated outputs under
  the collateral contract. **The frontier board is already excluded**; `start`/
  `park` dirtying it is harmless (it is also in `questArtifactPaths.files`
  `handoff.js:178-190`, so commits take it as own scope, and
  `scope-pressure.js:38` ignores it). The runbook's "restore … the frontier
  board with `git checkout`" (`solver-runbook.md:189-192`) is stale.
- The only per-quest filter is `isForeignQuestEvidence` (`change-artifact.js:411-416`
  via `evidenceOwnerQuestId :397-409`), which recognises **only**
  `solve/evidence/<other>.receipt.json` and `solve/evidence/<other>/…`.
  Anything else another quest dirtied — `solve/quests/<other>.json`,
  `solve/evidence/<other>.dep-scope.md` (the draft in today's main-tree
  status), `solve/oracle/<other>…`, `solve/changes/<other>/…` — is captured,
  classified `workflow` by the bare `solve/` prefix
  (`WORKFLOW_PATH_PREFIXES :166-178`, `classifyPath :423-443`) and refuses the
  product quest with `invalid changeRef: workflow changes must be recorded in a
  workflow/Quest tooling Quest` (`LOCAL_STR_PROBLEM_WORKFLOW_SCOPE :120`,
  thrown at `step.js:373-377`). **The message names no path.**

### Invariant analysis
Excluding another quest's own-id bookkeeping from this quest's sealed
artifact reviews nothing away (those bytes belong to, and are reviewed in, the
other quest); the landing union guard looks only outside `solve/`, and
`classifyDirtyPaths` keeps them out of the commit. Shared planning documents
(`solve/epics`, `solve/specs`, quest-independent files) must **not** be
auto-excluded: their edits are real workflow changes the operator must own.

### Changed
1. Generalise `isForeignQuestEvidence` → `isForeignQuestBookkeeping(filePath,
   questId)`: owner id parsed from `solve/<subtree>/<id>[.suffix|/...]` for
   `SOLVE_BOOKKEEPING_SUBTREES` (`:135-144`), same "unknown owner is never
   foreign" rule; keep the old name as an alias for the two existing callers.
2. `auto-diff.js`: apply it, and print one notice line
   `auto-diff: excluded another quest's bookkeeping: <paths>` (stdout, like
   `reattempt`'s action lines) — never silent.
3. `change-artifact.js`: append the offending paths to
   `LOCAL_STR_PROBLEM_WORKFLOW_SCOPE` / `LOCAL_STR_PROBLEM_RUNTIME_SCOPE`
   (`: solve/specs/x.md, …`).
4. Runbook `:187-195`: replace the board sentence with "other quests'
   bookkeeping is excluded automatically and named; shared planning files under
   `solve/epics|specs` still need a decision".

### Tests / docs
- `test/solve/solver-capture-foreign-evidence-exclusion.test.js`: extend the
  existing seven (`foreign-receipt-excluded-from-auto-capture`, …) with
  `foreign-dep-scope-and-quest-file-excluded`, `shared-planning-doc-still-refused-and-named`,
  `notice-lists-excluded-paths`.
- `test/solve/step-auto-diff.test.js`: message names paths.

Size ≈ 50 lines src + 60 tests. Risk: very low. Value: high per cost (fires in
every shared worktree; the operator today `git checkout`s files by trial).

---

## P6 — Receipts naming a TAP subtest; harness scaffold at `new`

### What exists today
- `test-receipt/1` (`probes/test-receipt.js`): receipts `{id, passed,
  command, detail}`; the probe checks only that `command` is a non-empty string
  and counts required ids with `passed !== true` (`:81-118`). Any command shape
  is admissible.
- Harness runtime (`scripts/quest-evidence-harness-runtime.js`): `testFile`
  receipts run `npm run test:file -- <file>` (whole file through the classified
  runner, `:55-72`); `command` receipts run a verbatim `/bin/sh -c` with a
  600 s default timeout (`:77-100`). **Subtest selection already exists by
  precedent**: `scripts/quest-evidence-readiness-planning-verified-snapshot-identity-owner.js:78-82`
  builds `node --test --test-name-pattern="^<name>" <file>` shell receipts —
  bypassing the classified runner (`run-test-files.js` has only a file
  `--filter`, `:53-60`, no test-name passthrough).
- No scaffold exists: `new --from` copies and retargets `doneWhen`
  (`quest-derivation.js:51-85 applySiblingSkeleton`) but never writes a
  harness; harness scripts are hand-written (`grep -l quest-evidence-harness-runtime
  scripts/` lists 20+).

### Honesty hole to close with 6a
`node --test --test-name-pattern` with a pattern that matches nothing exits 0
with zero tests — a receipt would go green on a typo. Any first-class subtest
receipt must parse the TAP summary (`# tests N`) and fail when `N === 0`
(and, for strictness, when `N > 1` unless `--allow-multiple`).

### Kept
**6a** Runtime: accept `{id, testFile, testNamePattern, detail}`; run
`node --test --test-name-pattern=<anchored> <file>` (require `^…$` anchoring,
refuse otherwise); parse `# tests`/`# pass`; `passed = exit 0 && tests >= 1 &&
fail === 0`; `command` string recorded verbatim (probe contract). Document
that this runs outside the classified lanes (unit/witness files only); a later
step can add `--test-name-pattern` passthrough to `run-test-files.js` /
`run-classified-test-files.js` for integration files.

**6b** Scaffold: `solve scaffold-harness --id <id>` (component verb) and an
automatic call from `start` when `doneWhen.probe === 'test-receipt'` and
`scripts/quest-evidence-<id>.js` is absent: write the file from a template with
one `{id, testFile: null /* TODO */, testNamePattern: null, detail: '<TODO:
one-line claim>'}` per `doneWhen.args.requiredReceipts`, `git add -N` it (as
`reattempt.js:47-60` does), print the path. Never overwrite; never seal
anything. Quest lint gains a warning (not error) when a test-receipt quest has
no harness file.

### Implementation shape / tests / docs
- `scripts/quest-evidence-harness-runtime.js`: `runSubtestReceipt`, TAP summary
  parse, pattern validation. `scripts/solve/harness-scaffold.js` (new);
  `scripts/solve.js` `COMMANDS` + sidecar; `operator-workflow.startQuestWorkflow`
  hook; `quest-lint.js` warning.
- Tests: extend `test/solve/solver-capture-foreign-evidence-exclusion.test.js`
  (already hosts the harness `--output` cases) or add
  `test/solve/quest-evidence-harness-runtime.test.js`:
  `subtest-receipt-runs-exactly-one-named-test`,
  `subtest-receipt-fails-on-zero-selected-tests`, `unanchored-pattern-refused`;
  `test/solve/quest-sibling-derivation.test.js` / `cli.test.js` for the
  scaffold; `test/solve/test-receipt-probe.test.js` unchanged (contract holds).
- Docs: runbook "Author And Validate A Draft" (+scaffold), `solver-quests.md`
  "Evidence And Change References" (+subtest receipts + zero-test rule); pack.

Size: 6a ≈ 70 src + 80 tests; 6b ≈ 130 src + 80 tests. Risk: low. Value:
medium (3 of 16 ids imprecise today; ~20 min per new quest for the scaffold).

---

## P7a — One override per whole `continue --summary`

### Corrected mechanism (measured in the v3 log)
- Overrides are consumed **per gate site that bypasses**, by appending the
  consuming ADVISORY gate-decision immediately (`gate.js:288-299`), before the
  run knows whether it will record an attempt. Within one logical run a
  `createRunAuthorizations()` map (`gate.js:143-145`) lets later sites reuse the
  bypass. Maps are created in `commitPendingAttempt` (`step.js:357`),
  `runAttemptCommand` (`attempt.js`), and the loop (`loop.js:1033`);
  `stepBegin`'s health gate calls `resolveGateDecision` **without** a map
  (`step.js:218-222`), and the REPLACE_REJECTED begin+commit pair runs two
  separate `runStep` calls (`operator-workflow.js:141-149`) with two maps.
- What actually burned four overrides for one attempt (v3, `10:18:33`–`10:19:49`):
  override(escalation) → commit-phase advisory consumed it (`10:18:35`) → the
  **later theory gate blocked the same run** (`10:18:36`, "system theory
  required after repeated same-frontier stalls") → no attempt recorded, override
  spent. Second run: escalation blocked again (`10:18:51`); override; consumed
  (`10:19:09`); theory blocked again (`10:19:10`). Third run: two overrides
  (`10:19:46/47`) → attempt (`10:19:49`). Root cause: consumption is not
  transactional with the run's outcome, and gates are evaluated one at a time so
  the operator learns each block one run later. (P8 removes the second gate's
  reason to fire at all.)

### Invariant analysis
"An override authorizes exactly one subsequent bypass" (`solver-quests.md:1147-1150`).
A bypass that admits no attempt bypassed nothing; leaving the override
unconsumed does not let it authorize a second admitted attempt. Auditability
is kept because the blocking gate-decision itself is recorded.

### Changed: transactional consumption + all-gates-in-one-pass
1. `gate.js`: `createRunAuthorizations()` returns `{held: Map, pending: []}`
   (or a Map with a symbol-keyed pending list). `resolveOverrideAdvisoryDecision`
   with a map **defers** the consuming `appendEvent` into `pending` and returns
   the advisory. New `commitRunAuthorizations(root, questId, run)` appends the
   pending records in order. Callers without a map keep immediate consumption
   (unchanged semantics for legacy paths).
2. Run owners flush immediately before recording: `commitPendingAttempt`
   before `finalizeAttempt` (`step.js:471`), `runAttemptCommand` before
   `finalizeAttempt` (`attempt.js:281`), the loop cycle before its record.
   `latestAttemptAdmissionWasOverridden` (`gate.js:243-266`) keeps working
   because flushed advisories precede the attempt event.
3. Share one map across the begin+commit pair: `operator-workflow.js:141-149`
   creates it and passes `options.runAuthorizations` to both `runStep` calls;
   `stepBegin` threads it into its health-gate context.
4. One-pass reporting: `commitPendingAttempt` evaluates scope, escalation,
   static, and theory gates into a list before deciding; if any blocks, throw
   one error naming every blocked code/problem (each still records its
   gate-decision; the tail-dedupe at `gate.js:352-372` prevents duplicates on
   re-run). `next`/`continue` output lists the exact `override` commands.
5. Steering: bullet 1 of "Recorded-Reason Override Escape Hatch": "consumed
   when the run it authorized records its attempt; a run that stops at a later
   gate leaves it unconsumed."

### Tests
- `test/solve/gate.test.js` ("recorded-reason override escape hatch" → +"deferred
  consumption is not charged when the run aborts", +"flush charges exactly
  once and marks reuse").
- `test/solve/rejection-escalation.test.js` ("a fourth-round attempt is gated
  toward reframing" → +"a run blocked by the theory gate after an escalation
  bypass leaves the override active").
- `test/solve/operator-workflow.test.js` ("one continue summary begins and
  captures a rejected replacement" → begin+commit share one authorization).
- `test/solve/step-theory-gates.test.js` (+one-pass problem list).

Size ≈ 90 lines src + 110 tests. Risk: low-medium. Value: high (3 of 5
overrides and 2 of 3 runs in v3 were this).

---

## P7b — Land's import-graph verify should wait for load headroom

### Fact
`landing-preflight.js:48 IMPORT_GRAPH_VERIFY_TIMEOUT_MS = 30_000`;
`canonicalImportGraphProblem(root, timeout = 30_000, spawn = spawnSync)`
`:230-259` spawns `generate-global-owner-debt-inventory.js --verify-import-graph`
with `timeout` + `SIGKILL`, retries exactly once on `ETIMEDOUT` (C7), then
reports "timed out twice (first and retry) at 30000 ms". It is called from
`landingReviewPreflight :311`, which runs at **both** mint
(`createReviewRequest`) and verdict (`assertReviewCurrent →
currentReviewManifest`); `prepareCandidateProofInputs :274-297` also refreshes
with a 30 s no-retry timeout. Nothing consults load; the only staging gate in
the repo is thermal (`scripts/checks/wait-for-thermal-headroom.js`, used by
`demo:movielens`).

### Kept (not an invariant)
1. New `scripts/checks/wait-for-load-headroom.js` exporting
   `waitForLoadHeadroom({maxWaitMs, threshold = 0.75 × cores, sample})`
   (poll `os.loadavg()[0]`, print `waiting for load < X (now Y)`), skip via
   `LAGRANGE_SKIP_LOAD_GATE=1`; called before the verify spawn and the refresh.
2. `LAGRANGE_IMPORT_GRAPH_VERIFY_TIMEOUT_MS` env override (default unchanged).
3. Message: add "measured ~22 s idle" hint and the env knob.
- Tests: `test/solve/landing-preflight-retry.test.js` (+"load gate is consulted
  before the first spawn" with an injected sampler); unit test for the
  sampler module under `test/scripts/`.
- Docs: runbook "Terminal Verification And Handoff"; memory note already
  records the trap.

Size ≈ 80 lines + 40 tests. Risk: low. Value: medium (10–25 min per miss).

---

## P7c — Publish gate should state that it links `data/`

### Fact
`publish-head.js:105-109` already links `node_modules` **and** `data` from the
caller root into the temp worktree; `linkWorkspaceDependencies :224-234`
silently `continue`s when the source directory is missing. A fresh quest
worktree has no `data/` (gitignored, populated by the MovieLens fetch), so the
gate fails ~15 min in.

### Kept, narrowed to fail-fast
Before `git worktree add`: resolve both sources, print
`publish: linking node_modules -> <path>, data -> <path>`, and when `data` is
absent exit with `publish: data/ is absent in <root>; symlink it from the main
checkout (ln -s <main>/data data) or run the MovieLens fetch, or pass
--allow-missing-data`. No gate semantics change.
- `test/scripts/publish-head.test.js` (+missing-data fail-fast, +notice line).
- Runbook "Publish And Git Exceptions" one sentence.

Size ≈ 25 lines + 30 tests. Risk: very low. Value: low-medium (once per new
worktree, but each miss is a full gate run).

---

## P8 (added) — Stall theory gate over-fires on rejection-replacement attempts

### Fact
`theory.js:299-311`: `systemTheoryRequired` when
`noProgressAttemptCount(log, frontier) >= SYSTEM_THEORY_STALL_THRESHOLD`
(`= RUNG_INDEX_MODEL = 3`, `constants.js:155-162, 198`).
`noProgressAttemptCount :172-180` counts attempts with `metricAfter >=
metricBefore`. A replacement of a rejected candidate on a SOLVED frontier
starts at metric 0 and ends at 0 — it can never "progress" — so the third
replacement trips "system theory required after repeated same-frontier
stalls" (v3 `10:18:36`, `10:19:10`; needed a `blocked-theory` override
`10:19:47`). The gate is convergence-forcing (`SOFT_FIRST_EXCLUDED_PROBLEM`,
`gate.js:78`), so it cannot soften.

### Fix (narrow)
Exclude from `noProgressAttemptCount` attempts recorded while a candidate
rejection stood (attempt index after the latest `verifier-rejection` finding on
that frontier with no later approval/decomposition-discharge) — the same
window `candidateRejectionFingerprintsSinceApproval` (`gate.js:205-227`)
already computes. A corrective attempt demanded by a verifier is not a stall;
the escalation gate (P7a) is the guard that owns repeated rejection rounds.
- `theory.js` (+helper reusing gate.js's rejection window, or move the window
  helper to `rejection-findings.js` to avoid a theory→gate import).
- Tests: `test/solve/step-theory-gates.test.js` / `test/solve/theory.test.js`
  (+"replacement attempts after a rejection do not count as stalls",
  +"ordinary non-progress still counts").
- Docs: `solver-quests.md` "Convergence Guards" one sentence.

Size ≈ 25 lines + 40 tests. Risk: low. Value: high per cost.

---

## Ranked implementation order (value ÷ cost)

1. **P5** foreign-quest bookkeeping exclusion + path-naming refusal (≈50 src).
2. **P8** stall-gate exclusion for replacement attempts (≈25 src).
3. **P7a** transactional override consumption + one-pass gate report (≈90 src).
4. **P4 + P4b** finding severity (fail-closed) + monotone amendment cap (≈130 src).
5. **P3** seal-gate additions (complexity/cognitive admission, silent-catch,
   decision-boundaries) + `preflight --full` + sidecar docs (≈200 src).
6. **P7c** publish `data/` fail-fast (≈25 src).
7. **P7b** load-headroom before the import-graph verify (≈80 src).
8. **P1 v1** frozen review delta in the manifest (≈120 src); **P1 v2**
   `carriedFrom` only if rounds stay long after v1.
9. **P6a** subtest receipts with the zero-test guard (≈70 src); **P6b**
   harness scaffold (≈130 src).
10. **P2** `rebase-epoch` as a recorded epoch boundary with covering
    obligation and rejection transfer (≈260 src) — last, after 3/8 shrink the
    drift window; it touches the one-base owner.

Every item composes with an existing mechanism rather than duplicating it:
P5 → `isForeignQuestEvidence`; P7a → `createRunAuthorizations`; P8 →
`candidateRejectionFingerprintsSinceApproval`; P4b → `receipt-bar-strengthen`'s
monotone precedent; P3 → `solve preflight` + `file-size-admission`; P1 →
`suggestVerificationTemplates` + review manifests; P6 → the
`--test-name-pattern` precedent; P2 → `base_unreachable` live-base-coverage.
None duplicates `decompose-rejection` or `correct-attempt-base`; P2 is the
complement of `correct-attempt-base` (drift touched attempt paths).

Cross-cutting: every command addition needs a `docs/steering/solve-commands.json`
entry and `npm run steering:llm:pack`; `test/solve/steering-canon.test.js`
pins some canon wording, so run it after the `solver-quests.md` edits.

---

## Explicit facts (a)–(f)

**(a) Fixed 30 s import-graph verify at land.** Yes.
`scripts/solve/landing-preflight.js:48` `IMPORT_GRAPH_VERIFY_TIMEOUT_MS = 30_000`;
`canonicalImportGraphProblem(root, timeout = …, spawn = spawnSync)` `:230-259`
(`spawnSync(process.execPath, [producer, '--verify-import-graph'], {timeout,
killSignal: 'SIGKILL'})`, one retry on `error.code === 'ETIMEDOUT'`, then
"import-graph verification timed out twice (first and retry) at 30000 ms");
invoked from `landingReviewPreflight :311`, itself run by
`review-request.js:198` for both mint and verdict; the refresh in
`prepareCandidateProofInputs :274-297` uses `IMPORT_GRAPH_REFRESH_TIMEOUT_MS =
30_000` (`:50`) with no retry. Not load-aware.

**(b) `continue --summary` vs `solve/FRONTIER.generated.md` and other quests'
`solve/` files.** `operator-workflow.js:99-113` maps a summary to
`autoDiff`; `step.js:280-283` → `auto-diff.js:129 createAutoDiffChangeRef`.
The board and `solve/{artifacts,state,log,report}` are excluded by pathspec
(`auto-diff.js:61-69`) — no refusal comes from the board. Other quests'
`solve/evidence/<id>.receipt.json` / `solve/evidence/<id>/…` are filtered by
`isForeignQuestEvidence` (`change-artifact.js:411-416`). Any other
another-quest `solve/` path (`solve/quests/<id>.json`,
`solve/evidence/<id>.dep-scope.md`, `solve/oracle/<id>…`) is captured,
classified `workflow` (`classifyPath :423-443`, prefix list `:166-178`), and
`inspectChangeArtifact :594-620` refuses a product quest with
`workflow changes must be recorded in a workflow/Quest tooling Quest`
(`:120-121`), surfaced as `invalid changeRef: …` from `step.js:373-377`. The
message does not name the path.

**(c) Override consumption per phase.** Consumption is per *gate site*, recorded
immediately as an ADVISORY gate-decision (`gate.js:288-299`), deduplicated
within one run only through a `createRunAuthorizations()` map (`:143-145`,
`:271-286`). `stepBegin` runs its health gate without a map
(`step.js:218-222`); `commitPendingAttempt` creates its own (`:357`); the
REPLACE_REJECTED begin+commit pair is two `runStep` calls with two maps
(`operator-workflow.js:141-149`). So an override is not shared across begin and
commit, and — the measured defect — an override consumed by a gate in a run
that a later gate then blocks is spent without recording an attempt (v3 log
`10:18:35` → `10:18:36`).

**(d) Out-of-bar accounting and severity.** `rejection-findings.js:118-141`:
with a sealed bar (`sealedVerificationTemplates :83-94` = declaration ⊕
`verification-bar-expansion` amendments), an out-of-bar category must be
prefixed `out-of-bar:`; `priorOutOfBarCategories :97-112` collects every such
slug from every prior `verifier-rejection` finding in the quest log, so a slug
passes once per quest log regardless of how many findings carry it in that
round, and a repeat is refused until `amend --kind verification-bar-expansion`
(lifetime cap `QUEST_AMENDMENT_LIMIT = 2` across all kinds, `amend.js:74`).
Findings carry no severity: `{category, summary}` only, enforced by
`ownKeysExactly` in `verifier-verdict.js:190-206` (`REQUIRED_FINDING_FIELDS :49`)
and by the CLI parser `rejection-findings.js:57-77`.

**(e) `requiredReviewTemplates` derivation.** `review-request.js:98-131`:
`sealed` entries from `sealedVerificationTemplates(quest, log)` (source
`sealed`), plus `mechanical` entries from
`suggestVerificationTemplates(root, attempt.inspection.content)` for **each**
`state.attempts[i]` (source `mechanical`), merged by category and sorted.
The mechanical rule (`verification-template-suggest.js:161-176`) is a keyword
regex over changed paths and changed `+/-` lines of an attempt's whole diff
(generated-output sections dropped, `harness-fidelity` for any `test/` path).
There is no persisted per-path template map, but the suggester is a pure
function of diff text and already splits per `diff --git` section
(`withoutGeneratedOutputSections :141-159`), so a per-path or delta-only
mapping can be derived by feeding it filtered sections (P1 v1). Verdict items
are matched to these categories exactly (`verifier-verdict.js:160-185`).

**(f) `test-receipt/1` and subtest filters.** The probe
(`scripts/solve/probes/test-receipt.js:81-118`) accepts any receipt with a
non-empty `command` string and a boolean `passed`; it does not care what the
command was. The runtime (`scripts/quest-evidence-harness-runtime.js:55-72`)
runs `testFile` receipts as `npm run test:file -- <file>` (whole file, classified
lanes) and `command` receipts verbatim through `/bin/sh -c` with a 600 s
default timeout (`:77-100`). No first-class subtest field exists, and the
classified runner has only a file `--filter` (`run-test-files.js:53-60`, no
`--test-name-pattern` passthrough), but subtest receipts already exist by
precedent as shell commands: `scripts/quest-evidence-readiness-planning-verified-snapshot-identity-owner.js:78-82`
runs `node --test --test-name-pattern="^<scenario>" <file>` per receipt
(outside the classified lanes; a non-matching pattern exits 0 with zero tests,
which is the honesty hole P6a must close).
