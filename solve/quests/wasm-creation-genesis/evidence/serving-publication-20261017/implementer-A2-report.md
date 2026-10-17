# Implementer report: amendment A2 / A2' (bounded owner-side re-decide for slot transitions)

Worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, branch
`work/rs-raft-event-reconciliation-20261016` at `89e70949f`. Nothing was committed, staged, stashed,
reset or checked out, and no refs were touched. All my changes are uncommitted edits to 5 files.
Nothing ran on a lab host. Only single-file `npm run test:file` runs, one at a time, each native
run gated on `node scripts/checks/wait-for-thermal-headroom.js` (cpu 47-61C, nvme 68C, every gate ok).
This is NOT a "done" claim: the lead and an independent verifier decide.

SCRATCH = `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad`

## Files changed (and why)

1. `src/control-plane/owners/service-instance-metadata.js` (184 -> 240 lines)
   - Header supersession (R09): the old sentence "Transport retries reuse the exact predicate; no
     semantic CAS loop." is quoted as superseded for slot transitions and cites A2' (A2'.0, A2'.3).
   - Split `commitState` into `submitState` (one exact-predicate submission, returning the named
     state `SUBMISSION.{APPLIED, NOT_APPLIED, UNKNOWN, CAPACITY_EXHAUSTED}`; NOT_APPLIED only for a
     numeric 0, UNKNOWN for a thrown/failed envelope or an absent/other count, A2'.1) and
     `settleSubmission` (the existing single authoritative resolution, behaviour unchanged).
     `commitState` = submit + settle and is still the only path for `selectConsensusInstance`
     (selection keeps zero-row -> one resolution -> history or STATE_CHANGED).
   - The line-63 comment is superseded in place in `settleSubmission`: "never another rewritten
     mutation" quoted as no longer covering a definitive zero-row slot answer (A2'.0).
   - `mutateResource` is the bounded loop: observe; `boundedChange(decide(fresh state), submissions)`;
     return a result with no `next`; submit; on any answer other than NOT_APPLIED go to
     `settleSubmission` (APPLIED -> result, CAPACITY_EXHAUSTED -> sealed refusal ends the loop,
     UNKNOWN -> the existing one-resolution path, no resubmission); on NOT_APPLIED `observeAgain`
     (the same `readByPrimaryKeyObservation`) and loop. Each attempt decides on the NEW observation's
     freshly decoded state object and submits that observation's `row.state` bytes (F4). The bound is
     `SERVICE_INSTANCE_LIMIT.RESOURCES` submissions in total (`boundedChange` answers STATE_CHANGED
     when a change still needs a mutation after 9 submissions). No new constant, timer, lock, cache,
     log line, logger dependency, or `attempts` field (A2'.5).
   - `observeAgain`: a failed re-read after a definitive zero propagates as a typed contract error,
     and the existing `instanceFailure` in the caller maps it to UNAVAILABLE / CORRUPT_STATE, never
     UNKNOWN. A NEVER_CREATED re-observation answers CORRUPT_STATE (A2'.3).
2. `test/control-plane/service-instance-creation-cas.test.js`: added CAS-A1, A1b, A1c, A2, A3, A4,
   A5a, A5b, A6, A7 (A2'.7) plus helpers `updatesSince` (per-writer UPDATE `changes` list from
   `f.writes`), `reservedSlots` and `enteredBefore` (the publication file's pattern: a hold that is
   never entered fails typed instead of hanging; added after the first red run hung on CAS-A1b).
   Imports `SERVICE_INSTANCE_LIMIT` for the bound.
3. `test/control-plane/service-instance-selection-admission.test.js` (:206-223): superseded by
   appending a comment that quotes the sealed name "closed-slot contention reports STATE_CHANGED and
   caller replay closes only its exact token" and cites A2'. The test is renamed, and it now asserts
   the held close answers `{CLOSED, CLOSED, token}` in the same call, slot 0 CLOSED, slot 1 ADMITTED,
   and that a repeat close is idempotent. The INSERT witness at :53-63 is unchanged.
4. `test/wasm-service/wasm-retained-bootstrap-fixture.js`: `reenterOnWake` loses its STATE_CHANGED
   re-drive branch. Every GRANT_HELD wake is now recorded only, while OBSERVED and CLOSED wakes still
   re-enter once. The comment quotes the superseded sentence and cites A2'.4/A2'.7. The now-unused
   `SERVICE_INSTANCE_OUTCOME` import is removed.
5. `test/wasm-service/wasm-creation-publication.integration.test.js`:
   - `assertOneOwnerWake` now requires exactly one wake, and it must be OBSERVED (A2'.7; this also
     settles F-W2 for this case). The old comment is quoted as superseded.
   - P1: the per-host "published inside an event run" check is now unconditional (every founder),
     and the redundant `some(OBSERVED)` assertion is removed. `reentries === 1` stands.
   - P13: F-M1 assertion added: every held host still has
     `creationReconciliation.subscriptions.length > 0` before the fault clears.
   - P15: adds `reentries === 1`.
   - P18: drops the `STATE_CHANGED` branch and asserts every host is SERVING with no held refusal,
     `CONSUMER_ABSENT` on every decisive run, and `host.result.status === BOOTSTRAPPED_HELD`. It
     then retires `f.hosts[0]`. The superseded sentence is quoted in a comment.
   - P19 (new): `Promise.all` retirement of all founders of a published group. Each result is
     `closed`, outcome CLOSED (no CLOSE_UNRESOLVED), `release.outcome` RELEASING or CLOSED,
     tombstone ALREADY plus local record RETIRED, slot CLOSED, and exactly one
     CREATION_RESOURCE_CLOSED wake per founder. The race is shown to have ENGAGED: a zero-change
     `UPDATE service_instances` occurs within the retirement window (F11). The order needed no
     followers-first fallback: leader and followers retire concurrently.
   - P20 (new): the metadata gateway answers zero rows for `service_instances` while the group forms.
     It asserts `zeroRowAnswers === grants * RESOURCES` (the bound measured through the lifecycle).
     Every host is HELD, with one GRANT_HELD(STATE_CHANGED) wake per held run, `reentries === 0`,
     slot ADMITTED and local record ADMITTED. After the override is removed, an explicit START per
     host publishes.

Not changed: selection, the UNKNOWN path, lifecycle/driver/manager/runtime, the production wake
consumer, log levels, `test/shards/impact-contracts.json` (the vet did not ask; the description has
no STATE_CHANGED claim), and generated metadata (no test file was added).

## Red-first (before the source change; outputs kept)

Logs, TAP and failure summaries: `SCRATCH/red-A2/`.
- CAS file: 6 red, 14 green.
  - CAS-A1 `A_SIBLING_GRANT_DEFEATED_THE_CALLERS_OWN_SLOT`.
  - CAS-A1b `NO_RE_DECIDED_SUBMISSION_AFTER_THE_FIRST_LOSS` (expected 'entered', actual 'settled').
  - CAS-A1c expected ADMITTED, actual STATE_CHANGED.
  - CAS-A2 `A_SIBLING_CLOSE_LEFT_THE_CALLERS_SLOT_UNRESOLVED`.
  - CAS-A3 `NOT_THE_DECLARED_SUBMISSION_BOUND` 9 vs 1.
  - CAS-A7 `A_DEFINITIVE_ZERO_WAS_REPORTED_AS_UNKNOWN`.
  - CAS-A4, A5a, A5b and A6 were green before the change, by design: they guard behaviour A2 must
    not alter and exist for MA2/MA4/MA5/MA6.
  - The very first red run hung on CAS-A1b (a hold that was never entered). That run's output was
    overwritten by the rerun after I added `enteredBefore`; the rerun is the kept red.
- Selection-admission: 1 red, the superseded witness (deepEqual `{CLOSED...}` vs `{STATE_CHANGED}`).
- Publication file: 13 of 23 red.
  - P1, P4, P5a, P5b, P5c, P6a, P6b, P10, P16 and P19 fail in `publishedGroup`: "host-3 did not
    publish" (HELD; the fixture no longer re-drives STATE_CHANGED).
  - P15 `A_LOST_GRANT_WAS_MUTATED_TWICE` 3 vs 2.
  - P18 "host-3 was held by a sibling".
  - P20 `NOT_THE_DECLARED_SUBMISSION_BOUND_PER_GRANT` 27 vs 3.
  - P13 (F-M1) was green before the change, as expected (the source was already correct).

## Green (after the source change; final source sha256 62cb2191...8793)

Logs and TAP: `SCRATCH/green-A2/`. CAS 20/20, selection-admission 23/23, publication 23/23 (plus 2
describes). The publication file passed on every run after the change (green runs plus the
MA5/MA7 mutation runs, where it is unaffected). The first green attempt had one red, P19
`tombstone.outcome` expected RETIRED, actual ALREADY; see open finding 1.

## Mutations (tests unchanged; source restored in `finally`; sha256 and `cmp` byte-identical after every one)

Driver `SCRATCH/tools/mutate.py`; logs `SCRATCH/mutations-A2/<id>.log`, `driver-output.txt`,
`summary-all.json`, pristine copy `service-instance-metadata.js.pristine`. Every mutation ran CAS,
selection-admission and publication, except MA1r (publication only). First failing assertion per file:

| Mutation | CAS | selection-admission | publication |
|---|---|---|---|
| MA1 single-shot restored | CAS-A1 `A_SIBLING_GRANT_DEFEATED_THE_CALLERS_OWN_SLOT` (also A1b, A1c, A2, A3, A7) | superseded :206 witness (CLOSED vs STATE_CHANGED) | P1 "host-3 did not publish" (P19 also red, but in its `publishedGroup` setup) |
| MA1r single-shot for RELEASING/CLOSED only (added; see finding 2) | not run | not run | P19 only: `closed` false, `{"outcome":"CLOSE_UNRESOLVED", "release":{"outcome":"STATE_CHANGED"}, "close":{"outcome":"STATE_CHANGED"}}` |
| MA2 resubmit (stale bytes) after UNKNOWN | CAS-A4 `AN_UNKNOWN_ANSWER_WAS_RESUBMITTED` | green | P5b expected UNKNOWN, actual UNAVAILABLE |
| MA3a bound RESOURCES-1 | CAS-A3 9 vs 8 | green | P20 27 vs 24 |
| MA3b bound RESOURCES+1 | CAS-A3 9 vs 10 | green | P20 27 vs 30 |
| MA4 resubmit the stale bytes (re-decide on a re-decode of the old row) | first red is the existing cross-slot same-target race (TARGET_ALREADY_OWNED vs STATE_CHANGED); CAS-A1 `A_SIBLING_GRANT_DEFEATED_THE_CALLERS_OWN_SLOT` | selection-overtaking witness STALE_BINDING vs STATE_CHANGED | P1 HELD; P3b STALE_BINDING vs STATE_CHANGED |
| MA5 re-decide reaches selection | CAS-A6 `A_SELECTION_WAS_RE_DECIDED` | green (INSERT witness green) | green |
| MA6 re-decide on the retained mutated state object | first red is the existing cross-slot race (ADMITTED vs TARGET_ALREADY_OWNED); CAS-A1 `NOT_ONE_RE_DECIDED_SUBMISSION_AFTER_THE_DEFINITIVE_ZERO` (caller told PUBLISHED with one zero UPDATE, the F4 wrong output) | selection-overtaking witness STALE_BINDING vs PUBLISHED | P3b; P19 CLOSED vs PUBLISHED; P20 |
| MA7 re-read failure after zero answered UNKNOWN | CAS-A7 `A_DEFINITIVE_ZERO_WAS_REPORTED_AS_UNKNOWN` | green | green |

All named witnesses of A2'.8 went red under their mutation: MA1 -> CAS-A1, A2, P1 (P19 via MA1r);
MA2 -> CAS-A4; MA3 -> CAS-A3; MA4 -> CAS-A1; MA5 -> CAS-A6 with the INSERT witness green; MA6 ->
CAS-A1; MA7 -> CAS-A7.

`SCRATCH/mutations-A2/superseded-run1/` holds the first full mutation run on the pre-refactor source
(before the `boundedChange` extraction, finding 6), plus an INVALID first MA1r attempt
(`MA1r-INVALID-first-attempt-OUTCOME.RELEASING-undefined.log`: my mutation compared against
`OUTCOME.RELEASING`, which does not exist, so it was inert; corrected to `PHASE.RELEASING`).

## Static (logs `SCRATCH/static-A2/`)

- `node scripts/check-fast-static.js --base 89e70949f --explain`: ok in 10.7 s; 10 changed paths
  (5 JavaScript). test:deps, audit:shards, test:metrics:scoped, audit:current-capabilities,
  eslint(5 changed), audit:runtime-grammar, audit:doc-ascii, test:metadata-gateway:audit,
  audit:impact-contracts, audit:roadmap-authority, audit:doc-audience, audit:cli-docs,
  audit:service-portability-claims and audit:closure-ledger were all ok.
- `check-guideline-decision-boundaries.js --json` on the owner file: totalViolationCount 0,
  inherited 0, baseline 806 unchanged. My first loop draft had 1 new R07 violation (finding 6),
  which I fixed.
- `npx eslint` on the 5 touched files: clean.
- `check-complexity.js --scoped` on the 5 files: 0 violations (threshold 12).
  `check-cognitive-complexity.js --scoped`: 0 (threshold 20).
- Scoped literals / silent-catch / decision-boundaries: 0 violations each, baselines unchanged
  (1286 / 94 / 806). These checkers scan `src` only; the test files report scannedFileCount 0.
- `audit:runtime-grammar`: 0 violations, state-machine pressure pass. `audit:shards`: OK (2405
  tests). `audit:file-size`: exit 0 (owner file 240 lines; publication test about 990 of 1500).
- Whole-corpus `audit:guideline:literals`, `:silent-catch` and `:decision-boundaries` exit 1. None
  of my files appears in their lists, and the scoped runs above are 0. Inherited; see finding 7.
- `npm run -s test:duplication` (the memory rule): the src+scripts ratchet is OK at 47/1462. The
  [test] ratchet FAILS at 698 clone groups / 26458 lines against a baseline of 697 / 26369. None of
  my 4 test files appears in any clone group of the jscpd report
  (`test-output/analysis/jscpd-test/jscpd-report.json`), so this is not caused by these edits, but
  I could not measure the base tree (finding 7). No baseline was raised.

## Multi-file selection for the lead (lab)

Changed files:
- test/control-plane/service-instance-creation-cas.test.js
- test/control-plane/service-instance-selection-admission.test.js
- test/wasm-service/wasm-creation-publication.integration.test.js

Direct consumers of the changed fixture `reenterOnWake` and of the slot-transition owner path
(not run by me):
- test/wasm-service/wasm-creation-reconciliation.integration.test.js
- test/wasm-service/wasm-retained-bootstrap.integration.test.js
- test/wasm-service/wasm-creation-genesis.integration.test.js
- test/wasm-service/wasm-creation-bound-native.test.js
- test/wasm-service/wasm-creation-local-record.test.js
- test/service/service-consensus-creation-intent.test.js
- test/service/service-consensus-creation-recovery.integration.test.js
- test/control-plane/system-metadata-owner-modules.test.js

## Open findings (surprises and deviations)

1. P19 oracle deviation from the vet/A2'.7: "`tombstone.outcome === 'RETIRED'`" is wrong for a
   live replica. The in-path tombstone on the open connection inside the shutdown (N15/A1) already
   recorded RETIRED, so the by-path step answers `ALREADY` (in `RETIRED_LOCALLY`). P19 therefore
   asserts `tombstone.outcome === 'ALREADY'` plus the durable oracle `localRecord(path).phase ===
   'RETIRED'` through a second connection. Lead to confirm.
2. MA1 against P19: with global single-shot, P19 goes red only in its `publishedGroup` setup (the
   grant races hold host-3), never on its retirement assertions. To show that P19 itself measures
   the retirement re-decide, I added MA1r (single-shot for RELEASING/CLOSED only), which turns P19
   red at `closed === false` / CLOSE_UNRESOLVED.
3. MA2 is implemented as "resubmit the same stale predicate once after UNKNOWN". A re-decide after
   UNKNOWN cannot produce a second UPDATE, because `decide` on the fresh state answers SAME. The
   vet's own description ("a second owner-a UPDATE with changes 0") is this form. MA2 also turns
   P5b red.
4. MA3 "bound removed" was not measured: it is an unbounded async loop that would hang the runner.
   Both off-by-one directions were measured instead (red in CAS-A3 and P20).
5. MA5 is implemented as "selection re-enters its own decision after a zero-row STATE_CHANGED with
   the row present", the vet's F7 scenario (the loop made reachable from selection), rather than a
   literal code move into `commitState`. CAS-A6 red, INSERT witness green.
6. My first loop draft (with an inline `if (submissions === RESOURCES) return {outcome:
   STATE_CHANGED}`) raised a NEW decision-boundary violation (R07 independent_if_semantic_returns
   in `mutateResource`). I replaced it with the named decision `boundedChange`, re-ran the three
   files green and re-measured every mutation on the final source.
7. Whole-corpus red I did not cause and could not attribute to the base: literals (320 "new"),
   silent-catch (4), decision-boundaries (40), and the test-duplication ratchet (+1 group / +89
   lines). None of them involve the touched files. I did not measure them at `89e70949f` because
   that would need a checkout or a second worktree, which the brief forbids.
8. A stale comment outside scope (R17, not edited):
   `test/wasm-service/wasm-creation-reconciliation.integration.test.js:94` and `:122` say "the
   operation owner consumes the wakes (it re-drives a sibling-raced grant)". This is no longer true
   after the fixture change. Lead's call whether to supersede it with an A2' citation.
9. During my run (13:46) `solve/epics/raft-rs-full-cutover.md` became modified and
   `solve/epics/raft-rs-full-cutover/closeout-plan-2026-10-17.md` appeared untracked. I did not
   write either; I left them, and the design note, log.ndjson and vet report, untouched.
10. Recorded limit (A2'.1): the component fixture's `affectedRows` is better-sqlite3 `changes`, so
    the production distinction between an absent and a zero count is not witnessed by these files.
    P20 and CAS-A3 use gateway overrides returning `{success: true, affectedRows: 0}`.
