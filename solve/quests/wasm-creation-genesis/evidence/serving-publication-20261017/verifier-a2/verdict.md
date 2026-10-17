# Verifier verdict: amendment A2/A2' (bounded owner-side re-decide for slot transitions)

Subject: `git diff 89e70949f 8ec78a5e09cffa661acc249d576d25997adef9d1` minus the lead's appends
(design note A2/A2', `log.ndjson`, `design-vet-A2-20261017.md`, the epic pointer and
`closeout-plan-2026-10-17.md`). Verify worktree `/mnt/data/peter/projects/.worktrees/verify-a2`,
detached at `8ec78a5e09cffa661acc249d576d25997adef9d1` (= `refs/heads/wip/rs-raft-serving-publication-2`).
Independent adversarial verification under verification protocol v2 (property first, owner-scoped
proof, evidence-author mode, category-complete, mutation by mechanism, evidence path per finding).
Worktree state at hand-back: `git status --short` = ` M test/shards/impact-graph-seal.json` only
(digest-only diff of `sourceDigest`, `producerInputDigest`, `snapshotDigest`; `resolverStateDigest`
unchanged: the lead's import-graph refresh). Every file I mutated was restored and proven
byte-identical (digests below). Nothing committed, staged, pushed, rebased, reset, stashed; no ref
touched; nothing run on a lab host; no other worktree touched. Scratch:
`/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify-a2/`
(`baseline/`, `mutations/`, `static/`, `tools/mutate.py`, `tools/probes.js`, `pristine-sha256.txt`).

Read in full (R18): CLAUDE.md, rules.md, router.md, authority-and-recovery.md, CONTRACT-R2.md,
INSTANCE-CAS-STAGE-ACCEPTANCE/REVIEW-20261016.md, the design note (original, Revision 2, Revision 3,
A1, A2, A2'), the A2 vet report, the stage-1 verifier verdict, the stage-1 lab acceptance record,
the implementer's A2 report, the eight verification templates in the quest's sealed bar plus
retry-loops, `service-instance-metadata.js`, `service-instance-state.js`,
`service-instance-contract.js`, `system-metadata-owner-base.js`,
`control-plane-system-table-gateway-mutation-contracts.js`, `constants/service-instance.js`,
`wasm-creation-publication.js`, `wasm-creation-retirement.js`, `wasm-creation-reconciliation.js`,
the CAS test, selection-admission test, sqlite fixture, publication integration test and
retained-bootstrap fixture (all in full), every diffed file, `quest.json`, the quest-log appends.

## Verdict: APPROVE (no blocking finding). Mechanism correct and provably bound; eight
## non-blocking findings for the lead in one round (three design-text precisions, one
## component-level witness to add, one unreachable uncovered cell, three R09/R17 record items).

---

## Phase 0: the frozen claim

A2'.0 (wins over A2.0): a resource-slot transition (reserve, grant to PUBLISHED, release to
RELEASING, close to CLOSED) whose exact prior-state UPDATE returns a successful envelope with a
NUMERIC zero affected-row count has definitively not applied; the owner observes the row again,
decides again from that fresh observation and submits one new exact-predicate UPDATE, for at most
`SERVICE_INSTANCE_LIMIT.RESOURCES` (9) submissions in total per call; the cause of the lost CAS is
never classified; STATE_CHANGED is the typed answer only when the bound is exhausted; UNKNOWN
(lost reply, thrown or failed envelope, absent count) stays single-shot with one authoritative
resolution and never a resubmission; selection never calls `mutateResource`, so the loop lives in
`mutateResource` and nowhere else. A2'.3 typed states: re-observation failure after a definitive
zero answers UNAVAILABLE / CORRUPT_STATE, never UNKNOWN; NEVER_CREATED on re-observation answers
CORRUPT_STATE; CAPACITY_EXHAUSTED from encoding `change.next` is a pre-submission sealed refusal
that ends the loop; each attempt decides on the NEW observation's state object and submits that
observation's `row.state` bytes; the re-observation is the same `readByPrimaryKeyObservation`.
A2'.4 owned consequence: N7 unchanged, one `CREATION_GRANT_HELD` wake per held run carrying
STATE_CHANGED at bound exhaustion; re-driver per verb (grant: consumer; close: CLOSE_UNRESOLVED +
re-stop; release: recorded `release.outcome`; reserve: typed non-ADMITTED + re-START); the
"no CLOSE_UNRESOLVED on group retirement" claim holds for at most RESOURCES concurrent retirements.

Oracle: the row's canonical state read by a second connection (`f.state()`, `f.row()`,
`slotPhase`), the fixture write log `f.writes` with `changes` per writer, the typed results.
Excluded (brief): selection (single-shot), the UNKNOWN path (single-shot), the production
absent-versus-zero distinction (component boundary), per-slot rows, lifecycle changes.

---

## Coverage model (decisions x state x events x temporal)

Legend: CAS = `test/control-plane/service-instance-creation-cas.test.js`; SEL =
`service-instance-selection-admission.test.js`; P-n = `wasm-creation-publication.integration.test.js`;
PX-n = my temporary probe (`tools/probes.js`, run on the pristine source, restored; NOT a committed
witness); PARTIAL = state reached, named output not asserted raced; UNCOVERED = no committed witness.

| # | Cell | Witness and assertion |
|---|---|---|
| 1 | grant, first attempt, own slot ADMITTED, one row | P1/P17 (`PUBLISHED`, local PUBLISHED), CAS phase table :263 |
| 2 | grant, sibling slot grant lands between read and submit | CAS-A1 `A_SIBLING_GRANT_DEFEATED_THE_CALLERS_OWN_SLOT`, `[0, 1]`, row slot 0 PUBLISHED (`CALLER_TOLD_PUBLISHED_WHILE_THE_ROW_IS_NOT`), slot 1 PUBLISHED; P1/P15/P18 every founder SERVING, `assertOneOwnerWake` (exactly one, OBSERVED), `reentries === 1` |
| 3 | grant, two consecutive losses (between read/submit and re-read/resubmit) | CAS-A1b `enteredBefore` guard `NO_RE_DECIDED_SUBMISSION_AFTER_THE_FIRST_LOSS`, `[0, 0, 1]`, three slots PUBLISHED |
| 4 | grant, selection of J lands between read and submit | CAS-A5a `{STALE_BINDING}`, `[0]`; SEL :188 `STALE_BINDING` + zero-change UPDATE; P3b `GRANT_CAS_NEVER_ATTEMPTED` guard then STALE_BINDING, local ADMITTED |
| 5 | grant, same slot RELEASING by another caller between read and submit | CAS-A5b `{RESOURCE_CLOSED}` "the sealed N3 order stands", `[0]` |
| 6 | grant, same slot CLOSED by another caller | sequential: CAS :137, :269 (RESOURCE_CLOSED); raced variant PARTIAL (same decision row `publicationRefusal :264-265` as cell 5) |
| 7 | grant, retiring outstanding | P2 (`PREDECESSOR_OUTSTANDING` held, `reentries === 0`), CAS :238; re-decision can only flip true -> false (vet 3; `RESOURCE_PHASE_FROM`, `reserveResourceState :225`) |
| 8 | grant, zero-row forever (bound) | CAS-A3 `{STATE_CHANGED}`, `submissions === 9` `NOT_THE_DECLARED_SUBMISSION_BOUND`, row unchanged; P20 `zeroRowAnswers === grants * 9`, every host HELD, one GRANT_HELD(STATE_CHANGED) wake per held run, `reentries === 0`, slot/local ADMITTED, explicit START publishes |
| 9 | grant, zero then re-read fails | CAS-A7 `{UNAVAILABLE}` `A_DEFINITIVE_ZERO_WAS_REPORTED_AS_UNKNOWN`, `submissions === 1`, row unchanged. CORRUPT_STATE variant UNCOVERED (SEL :95 covers CORRUPT_STATE on the first read only); unreachable NEVER_CREATED re-observation UNCOVERED (rows never deleted) |
| 10 | grant, thrown envelope (lost reply) | CAS-A4 `[1]`, `appliedLostReplies.length === 1` `AN_UNKNOWN_ANSWER_WAS_RESUBMITTED`; P15 `A_LOST_GRANT_WAS_MUTATED_TWICE` (3 one-row mutations), one OBSERVED wake, `reentries === 1`; SEL :155 |
| 11 | grant, ABSENT count (success envelope, no `affectedRows`) | UNCOVERED by any committed witness (finding F-2); PX2 probe green on the implementation (`{UNKNOWN}`, one submission, row unchanged) |
| 12 | grant, CAPACITY_EXHAUSTED before submission | UNCOVERED, unreachable by construction (finding F-3; VA2 silent) |
| 13 | grant, read unavailable before the first attempt | P13 (`UNAVAILABLE` held runs, one wake per held run, `THE_LIFECYCLE_RETRIED_A_HELD_GRANT_BY_ITSELF`, F-M1 `subscriptions.length > 0`) |
| 14 | reserve, sibling reserve of a different replica on another slot | CAS-A1c both ADMITTED, two non-CLOSED slots, `[0, 1]` |
| 15 | reserve, sibling reserve of the SAME replica on another slot | CAS :149 `TARGET_ALREADY_OWNED` + zero-change UPDATE (sealed refusal from the re-decision; MA4/MA6/VA4 flip it) |
| 16 | reserve, SAME slot raced by another operation (g+1) | UNCOVERED by a committed witness; PX3 probe green (`CONFLICT` with `winnerToken`, `[0]`, slot holds the winner) |
| 17 | reserve, lost reply | CAS :168 (UNKNOWN/ADMITTED, exact ordinal replay) |
| 18 | reserve, selection of J between read and submit | UNCOVERED raced (deterministic `reserveResourceState :225` STALE_BINDING through the same loop path as cell 4) |
| 19 | release, cross-slot sibling release/close (group retirement) | P19 every `closed === true`, `outcome CLOSED` `A_CONCURRENT_RETIREMENT_LEFT_CLOSE_UNRESOLVED`, `release.outcome` RELEASING or CLOSED, tombstone ALREADY + second-connection RETIRED, slot CLOSED, one CLOSED wake per founder, race ENGAGED (`THE_CONCURRENT_RETIREMENT_RACE_NEVER_ENGAGED`) |
| 20 | release, same slot CLOSED by another caller | CAS-A5b second half `{CLOSED, CLOSED, token}` `RELEASING_REGRESSED_A_CLOSED_SLOT`, `[0]`, slot CLOSED |
| 21 | release, sibling slot grant lands between read and submit | UNCOVERED by a committed witness; PX4 probe green (`RELEASING`, `[0, 1]`, sibling PUBLISHED) |
| 22 | release, first attempt (order) | P4 `release.outcome RELEASING`, `['release', 'close']`, `TOMBSTONE_PRECEDED_RELEASING`, `CLOSED_REQUESTED_BEFORE_LOCAL_RETIRED` (A1 order unchanged under A2) |
| 23 | close, sibling close lands between read and submit | CAS-A2 `{CLOSED, CLOSED, token}` `A_SIBLING_CLOSE_LEFT_THE_CALLERS_SLOT_UNRESOLVED`, `[0, 1]`, both CLOSED, J's grant then PUBLISHED ("the last CLOSED lifts the predecessor hold"); P19 |
| 24 | close, sibling reserve lands between read and submit | SEL :212 (superseded witness) `{CLOSED, CLOSED, token}` in the same call, slot 0 CLOSED, slot 1 ADMITTED, repeat close idempotent deepEqual |
| 25 | close, same slot RELEASING by another caller | UNCOVERED by a committed witness; PX1 probe green (`CLOSED`, `[0, 1]`) |
| 26 | close, same slot already CLOSED | P5b re-stop `RE_STOP_MUTATED_A_CLOSED_SLOT` (no mutation), CAS :282-286 (no SQL for a CLOSED slot): decided SAME/CLOSED before any submit; raced variant PARTIAL (same `resourceTransition :276-277` row as cell 20) |
| 27 | close, lost reply | P5a (`closed`, `appliedLostReplies === 1`, one wake); SEL :163 |
| 28 | close, lost reply + read fault | P5b `close.outcome UNKNOWN`, `CLOSE_UNRESOLVED`, custody (`THE_BOUND_STOP_WROTE_A_GENERIC_STOP_ROW`), no wake; re-stop resolves without mutation |
| 29 | close/release at the bound | PARTIAL: CAS-A3 is the grant verb; `mutateResource` is verb-agnostic (`transitionInstanceResource :218-226` passes `changeResourceState` for all three phases), so the bound is shared; no native 10-way retirement exists |
| 30 | selection, zero-row INSERT / zero-row UPDATE / thrown | SEL :53 `STATE_CHANGED`, `attempts === 1`; CAS-A6 `{STATE_CHANGED}` `A_SELECTION_WAS_RE_DECIDED`, `[0]`, version 1, slot PUBLISHED, repeat SELECTED; SEL :65/:120 UNKNOWN; C3/C4 |
| 31 | temporal: sibling lands BEFORE the first read | first decision answers the sealed/own result without a race: CAS phase table, P2, CAS :211 |
| 32 | temporal: sealed change lands after the LAST submission | PX6 probe: answer `{STALE_BINDING}` after 9 submissions, not STATE_CHANGED (finding F-1; no committed witness) |
| 33 | lifecycle: N7 wake carries STATE_CHANGED at the bound; consumer never re-drives GRANT_HELD | P20 (wake reason/outcome, `A_GRANT_HELD_WAKE_WAS_RETRIED_BY_THE_CONSUMER`), P2/P13 `reentries === 0` |
| 34 | lifecycle: shutdown join and fences across a (now longer) grant | P9 (`holdNext afterApply` is still the FIRST attempt under FIFO holds; `GENESIS_HELD/WRITER_SHUTDOWN`, slot CLOSED, no leaked interval), P10 (`A_SECOND_INSTANCE_OPENED_THE_RETIRING_FILE`), P14 (effects replayed once across a held grant) |
| 35 | harness: hold FIFO, afterApply, lost reply + onLost, override counting | fixture :68-104 (holds `findIndex` first match = FIFO; `afterApply` applies then holds; `loseReply` applies, runs `onLost`, throws); `runRetryableControlPlaneWrite :160-162` returns any `success !== false` result without retry, so override counts are exact |

Assertion-weakening check: none weakened. SEL :212 moved from `equal(outcome)` to full-shape
`deepEqual` plus two slot phases and an idempotent repeat; `assertOneOwnerWake` tightened from
"OBSERVED or GRANT_HELD(STATE_CHANGED)" to "exactly one wake and it is OBSERVED"; P1's per-host
event-run check became unconditional (the removed `some(OBSERVED)` is implied per host); P15 gained
`reentries === 1`; P18 replaced a conditional STATE_CHANGED branch by "every host SERVING, refusal
null"; P13 gained the F-M1 assertion; the ten pre-existing CAS cases are byte-unchanged (the diff
adds only the import and the new cases); `SETUP_ROUNDS`, `ELECTION_ROUNDS`, timeouts and every
ratchet baseline are unchanged. P19 proves the race ENGAGED: `THE_CONCURRENT_RETIREMENT_RACE_NEVER_ENGAGED`
requires a zero-change `UPDATE service_instances` inside the retirement window, and MA1r shows both
verbs raced in the current schedule (`release` AND `close` answer STATE_CHANGED under single-shot).

---

## Findings (category-complete; each NEW MECHANISM / NEW SHAPE, scenario -> output, required change, evidence)

### Mechanism (the loop)

Verified by reading and by probe: the loop lives only in `mutateResource`
(`service-instance-metadata.js:180-197`); `commitState :98-101` = `submitState` + `settleSubmission`
and is the only path of `selectConsensusInstance :129`; `submitState :55-77` classifies one
submission as APPLIED (numeric 1) / NOT_APPLIED (numeric 0) / UNKNOWN (absent count or thrown,
`submitted = null`) / CAPACITY_EXHAUSTED (encode failure before any SQL); only NOT_APPLIED
continues the loop (`:188`); APPLIED returns `change.result`, CAPACITY_EXHAUSTED returns the sealed
refusal, UNKNOWN takes the unchanged one-resolution path (`settleSubmission :84-97`, the callback
`:189-193` is byte-identical to the old one); each iteration decides on the NEW observation's
decoded object and submits that observation's `row.state` (`:185`, `:67`, `:195`); `observeAgain
:164-168` is the same `readState` -> `readByPrimaryKeyObservation`, its failure propagates to the
callers' `instanceFailure` (`:203-204`, `:223-224`) as UNAVAILABLE or CORRUPT_STATE and a
NEVER_CREATED re-observation throws CORRUPT_STATE; the bound is `boundedChange :171-174` on
`LIMIT.RESOURCES` counting SUBMISSIONS (a decision with `next` at `submissions === 9` becomes
STATE_CHANGED; the trace is 9 submissions, confirmed by CAS-A3/P20 and MA3a/MA3b/VA3/VA8). No new
state, timer, lock, flag, cache, log line, logger dependency or `attempts` field; `SUBMISSION` is a
file-local frozen vocabulary (R07 named states, A2'.3), never crossing the boundary. Each
submission is its own `executeMutation` call and so runs under a freshly minted `writeIdentity`
(`system-metadata-owner-base.js:430-432`, `retryable-control-plane-write.js:120-129`,
`control-plane-write-identity.js:389-397`); no caller passes `writeIdentity`/`idempotencyKey`
(`wasm-creation-publication.js:33`, `wasm-creation-retirement.js:115, :129`,
`service-consensus-creation-intent.js:129`), so re-decided attempts never share a dedup key, and
gateway coalescing keys on content (`buildMutationOptions :386-388` adds a key for UPSERT only), so
two different predicates never join. Sealed answers survive the re-decision unchanged: STALE_BINDING
before any phase (CAS-A5a, SEL :188, phase table :289), RESOURCE_CLOSED for a grant on
RELEASING/CLOSED (CAS-A5b), CLOSED monotonic (CAS-A5b, phase table :282), TARGET_ALREADY_OWNED (CAS
:149), CONFLICT with `winnerToken` (PX3), HISTORY_UNAVAILABLE (CAS :141-144), PREDECESSOR_OUTSTANDING
(CAS-A2, P2).

F-1 (NEW SHAPE in the design TEXT, non-blocking). The implementation performs one more
re-observation and decision after the RESOURCES-th definitive zero: `observeAgain` runs at the end
of the ninth iteration and the tenth `decide` either returns a no-`next` result (the caller's own
sealed answer or SAME) or is bounded to STATE_CHANGED. So per call: at most 9 submissions (as
specified) but up to RESOURCES re-decisions and RESOURCES+1 authoritative reads, where A2'.0 says
"the first plus at most RESOURCES-1 re-decisions" and A2'.6 says "bounded by RESOURCES x (one
authoritative read + one routed write)". Scenario -> output: zero nine times, then J is selected ->
`{STALE_BINDING}` (PX6), not `{STATE_CHANGED}`; cost at exhaustion 10 reads + 9 writes (PX5). Not a
wrong output (the extra decision can only replace STATE_CHANGED by a more faithful sealed answer;
no submission follows it), and no witness is contradicted. Required change: the lead amends A2'.0
and A2'.6 to "at most RESOURCES submissions; the decision after the last definitive zero is taken
on a fresh observation but never submitted; cost at exhaustion RESOURCES+1 reads + RESOURCES
writes" (preferred; I would not trade the sealed answer for one saved read), OR the implementer
returns STATE_CHANGED without the final re-observation. Evidence: `service-instance-metadata.js:184-196`;
probes PX5 (`reads === 10`, `submissions === 9`) and PX6 green in
`verify-a2/mutations/PX-probes-on-pristine-source.log` (26 assertions, exit 0).

F-2 (coverage gap, component level, non-blocking; required witness). A2'.0's "absent count stays
single-shot" has no witness in any file, and "thrown envelope stays single-shot" is distinguishable
from a re-decide only through the read-failure typing. Measured: VA1 (UNKNOWN routed into the loop,
`if (submission === APPLIED || submission === CAPACITY_EXHAUSTED)`) leaves CAS 20/20 and SEL 23/23
green (after a lost-but-applied reply the fresh decision answers SAME, so one UPDATE and PUBLISHED
either way) and is caught only by native P5b (`UNAVAILABLE` where `UNKNOWN` is expected). With an
ABSENT count on an unapplied write the two paths diverge in output (`{UNKNOWN}` vs a second real
submission and PUBLISHED), and nothing committed measures it. Required change: add CAS-A8 = my PX2
(gateway `updateSystemTableRow` override answers `{success: true}` once; expect `{outcome: 'UNKNOWN'}`,
exactly one submission, `f.row()` unchanged); under VA1 it goes red
`PX2_AN_ABSENT_COUNT_WAS_NOT_UNKNOWN` (`verify-a2/mutations/VA1-with-probes.log`). The mechanism
is correct as implemented (PX2 green on the pristine source); the finding is that the declared
proof does not pin this clause at the component level.

F-3 (UNCOVERED, unreachable by construction, record only). "CAPACITY_EXHAUSTED ends the loop"
(A2'.3) has no witness: VA2 (CAPACITY_EXHAUSTED routed into the loop) leaves all three files
green. No valid canonical state can exceed `STATE_BYTES` (CONTRACT-R2: constituents 100352 of
131072 with structural cap checks), so `encodeInstanceJson(change.next, LIMIT.STATE_BYTES)` cannot
fail from valid input; a witness would have to monkeypatch the encoder. Required change: none
(record in A2'.7 as uncovered-unreachable); the code path is three lines (`:57-61`, `:87`).

### Typed states and failure edges

No defect. UNAVAILABLE after a zero: CAS-A7 (`submissions === 1`, row unchanged); MA7 (answer
UNKNOWN instead) red at CAS-A7. CORRUPT_STATE after a zero: by `observeAgain :166` and `readState
:39, :43-44` through `instanceFailure`; raced variant UNCOVERED (cell 9), deterministic. UNKNOWN
path: unchanged and still single-shot (CAS-A4, SEL :155, P5a/P5b/P15; MA2 red at CAS-A4 and P5b).
`CLOSE_UNRESOLVED` owner outcomes after A2 (`closeRetired`, `wasm-creation-retirement.js:131-136`):
UNKNOWN (P5b), UNAVAILABLE (read failure before or after a zero; `settleOwner :56-63` wraps a
thrown owner into UNKNOWN+reason, but `transitionInstanceResource` never throws: it returns typed),
STATE_CHANGED (MA1r/VA8 show the shape `{outcome: CLOSE_UNRESOLVED, close: {outcome: STATE_CHANGED}}`),
HISTORY_UNAVAILABLE/CONTENT_CONFLICT. The held-grant shape `held(outcome)` and the N7 wake carry
STATE_CHANGED unchanged (`wasm-creation-publication.js:47-50, :77`; `wasm-creation-reconciliation.js:92-94`;
P20).

### Concurrency / serialization

No defect. The CAS predicate is the whole canonical state (`:67`); every check-then-act across an
await is re-validated by the predicate (a change between read and submit yields zero rows, cells
2-5, 23-24; between re-read and resubmit, cell 3). Progress: a definitive zero means another
caller's UPDATE applied, so each loop round is global progress; with at most 2 x 9 slot callers plus
one selection on a row the loop is bounded by RESOURCES regardless (CAS-A3). No lock, no timer, no
reentrancy. Worst-case product (retry-loops item 5): 9 submissions x the gateway's own routed-write
budget per submission (`DEFAULT_RETRY_TIMEOUT_MS` 30 s under retryable faults) + 10 reads before
STATE_CHANGED; under A1 the live retirement's tombstone/port/db close waits for that RELEASING
attempt: the design accepted this cost (A2'.6, F9) and P4's order is unchanged; no witness measures
the worst case (needs retryable faults), recorded.

### Owner interaction (sealed bar: owner-interaction)

Single semantic question "did my slot transition apply, and what is my slot's decision now?" is
answered only by `mutateResource`; consumers (`resolveGrant`, `settleOwner`) do not re-derive it
(`resolveGrant`'s extra read on UNKNOWN is stage-1 F-A2, unchanged). The amendment REMOVES a
second progression algorithm from the fixture consumer (`reenterOnWake` no longer re-drives
STATE_CHANGED), which is the R01/R11 direction. One canonical shape `{outcome, phase, token}`
(R08; no `attempts`). Paired invariants green in one deterministic witness: P15 (one host's grant
reply lost -> UNKNOWN resolution, siblings racing -> re-decide; `A_LOST_GRANT_WAS_MUTATED_TWICE`
= 3 one-row mutations, every host SERVING, one OBSERVED wake each); restoring the old shortcut
(MA1) reddens P1/P15/P19/CAS-A1/A2/SEL :212, and the opposite shortcut (MA2/VA1) reddens CAS-A4/P5b.
Stale-then-fresh: the consumer re-enters the canonical owner path (`observeAgain`), never keeps
the stale object (MA6 red at CAS-A1 `NOT_ONE_RE_DECIDED_SUBMISSION_AFTER_THE_DEFINITIVE_ZERO`,
SEL :188 `PUBLISHED` instead of STALE_BINDING, P3b, P19). Pressure/backoff: every submission goes
through `executeMutation` -> `runRetryableControlPlaneWrite` (owner-owned retry preserved); a
readiness refusal / `success:false` throws and takes the UNKNOWN path with no resubmission
(`system-metadata-owner-base.js:441-446`, `:69-71`). Wake/release path: STATE_CHANGED at the bound
-> N7 wake (P20) / CLOSE_UNRESOLVED custody / recorded `release.outcome`; released by explicit
START (P20) or re-stop (P5b class).

### Admission / gating (sealed bar)

Every emitted outcome is classified where consumers branch: all non-PUBLISHED grant outcomes map to
HELD + `grant.outcome` (`wasm-creation-publication.js:77`) and are re-drivable by START; close
non-CLOSED -> CLOSE_UNRESOLVED (re-stop); shapes are `{outcome}` objects throughout; the governing
budget is the existing gateway routed-write budget per submission (no new budget, no raise);
evaluation freshness is per attempt (`observeAgain`); the hold at the bound is released by the
explicit START (P20 `startAndDeliver` -> PUBLISHED). Message honesty: STATE_CHANGED carries no
attempt count by decision (A2'.5; operator visibility in the gateway ledger).

### Recovery / replay (sealed bar)

Replay idempotence: a re-decided attempt can never re-apply its own effect; `decide` answers SAME /
the recorded result when the effect already landed (`changeResourceState :292-293`,
`reserveResourceState :218-223`; A2'.1). Absence proves nothing: a NEVER_CREATED re-observation is
CORRUPT_STATE, never success or terminal (`:166`). Restart custody is unchanged (deferred, 7').

### Transport / delivery (sealed bar)

Outcome classification: numeric 1 -> APPLIED, numeric 0 -> NOT_APPLIED (the gateway classifier's
`OBSERVED_STATE_CHANGED`, `mutation-contracts.js:59-61`, is the same fact), absent/thrown ->
UNKNOWN, `success:false` -> thrown -> UNKNOWN; undeliverable never hangs (each submission bounded by
the retry wrapper's deadline, the loop by RESOURCES). The premise "numeric zero is definitive" I
spot-checked at three links beyond the vet's report: `normalizeLocalSystemTableWriteResult`
(`cdc-integration-service-authoritative-read-flow.js:385-401`) maps `affectedRows` only from a
numeric `changes`; `sumAffectedRowCounts`/`affectedRowsField` (`application-database-result.js:164-184`)
make any unknown part an ABSENT field; `settledAppliedResult` (`partition-committed-statement-outcome.js:155-163`)
answers a replay with no `changes` when the count is not retained; the classifier's
`UNKNOWN_AFFECTED_ROWS` (`control-plane-mutation-outcome-classifier.js:26-32`) is `present: false`
("never zero rows"). Formation-circularity: not applicable (metadata owner, no formation path).

### Harness fidelity (sealed bar)

Red for the right reason: the implementer's red-first failures (`red-A2/*.failures.txt`) and my MA1
re-run are behavioural assertions (CAS-A1 STATE_CHANGED vs PUBLISHED; A1b the typed `entered` vs
`settled` guard, not a hang; A1c ADMITTED vs STATE_CHANGED; A2; A3 `9 vs 1`; A7 UNAVAILABLE vs
UNKNOWN; SEL :212 shape; P15 `3 vs 2`; P18 "held by a sibling"; P20 `27 vs 3`; P1 "did not
publish" IS P1's behavioural assertion, and for P4-P16 it is the shared `publishedGroup` setup,
which is why MA1r exists for P19). Stub honesty: the `updateSystemTableRow` override bypasses CDC
and tests the owner's classification of `{success: true, affectedRows: 0}`, not CDC's production of
that shape; the real zero-row path is exercised by every `holdNext` case through gateway + CDC +
the fixture engine's `affectedRows: result.changes` (fixture :104), i.e. better-sqlite3's count;
production reads `partitionResult.affectedRows` (owner `:47-49`) - the recorded component boundary
(A2'.1, stage-1 F-H1 (i)). What it could hide: a production envelope that reported a predicate miss
with an ABSENT count would route to UNKNOWN (fail-closed, A2's benefit lost, no wrong output); the
traced chain above says it reports numeric 0. Time fidelity: no time constants in the owner;
holds are promise gates. Field fidelity: the owner branches on `affectedRows` only. Vacuity: every
new assertion has a non-vacuity guard (`[0, 1]` exact write lists, `enteredBefore`, `submissions ===
9`, P19 ENGAGED, P20 `grants > 0` and `heldRuns.length > 0`, P18 `decisive.length > 0`).

### R06 / R07 / R08 / R09 / R11 / R23

No defect. New named states live in the owner (`SUBMISSION`), file-local as code-style allows;
`boundedChange` is a named decision (the implementer's first inline `if` was an R07 violation,
fixed; decision-boundaries 0/0 on the owner file, baseline 806 unchanged). No baseline, threshold,
timeout or budget raised. Supersessions recorded, not rewritten: header `:1-7` and the line-63
comment (now `:78-83`) quote the old sentences and cite A2'.0/A2'.3; SEL :206-211 quotes the
sealed title and cites A2'.0/A2'.7 (the test is renamed; the old title is retained in the comment);
`reenterOnWake` :55-65 quotes the removed branch and cites A2'.4/A2'.7; `assertOneOwnerWake`
:188-195 quotes and cites A2'.7/F-W2; P18 :866-868 quotes and cites; P13 cites F-M1/D6'; P19/P20
headers cite A2'.4/A2'.7.

F-4 (R09/R17 record items, non-blocking, for the lead at commit). (a) P1's body edit (the
unconditional event-run check and the removed `NO_REPLICA_PUBLISHED_FROM_NATIVE_EVENTS`
assertion, `:263-266`) carries no in-file supersession quote; it is subsumed by the
`assertOneOwnerWake` comment and is a tightening, so a one-line citation suffices. (b) Stale
comments that still describe the consumer re-driving a sibling-raced grant: 
`test/wasm-service/wasm-creation-reconciliation.integration.test.js:94` and `:122` (implementer
finding 8) AND `test/wasm-service/wasm-creation-bound-native-fixture.js:313-314` ("or as the grant
of one whose event-run CAS lost to a sibling slot's concurrent grant"), which the implementer did
not list; both should be superseded with an A2' citation. (c) `test/shards/impact-contracts.json`
`service-consensus-retained-native-bootstrap` still says "attempts metadata RELEASING without
blocking" (stage-1/A1 wording, not A2's); no STATE_CHANGED claim there, so no A2 change is owed.

F-5 (design-text correction, non-blocking; implementer finding 1 judged). A2'.7's P19 oracle
"`tombstone.outcome === 'RETIRED'`" is wrong for a live replica: the in-path tombstone (N15/A1,
`tombstoneRetiringReplica`, `wasm-service-replica-lifecycle.js:234-243`) writes RETIRED on the open
connection, and `retireLocally` then verifies by path (`wasm-creation-retirement.js:120-125`),
which answers ALREADY; the existing stage-1 witness P5b already asserts `second.tombstone.outcome ===
'ALREADY'` (:492) and P6b asserts `RETIRED` only for a never-live file (:573). The implementer's
oracle (`ALREADY` plus the local record RETIRED through a second connection, the durable oracle) is
right; the lead amends A2'.7.

F-6 (implementer finding 2 judged). P19's retirement assertions are pinned: MA1r (single-shot for
RELEASING/CLOSED only) reddens P19 at `closed === false` with
`{release: STATE_CHANGED, close: STATE_CHANGED}`; VA8 (bound 2) reddens P19 at
`release.outcome === STATE_CHANGED`; MA1 reddens it earlier in `publishedGroup`. Accepted.

F-7 (implementer findings 3-4 judged). MA2 as "resubmit the stale predicate once after UNKNOWN"
is the vet's own description and the only form that produces a second UPDATE; the complementary
form (UNKNOWN re-decided) is my VA1 (F-2). MA5 as "selection re-decides after a zero-row
STATE_CHANGED with the row present" is the vet's F7 scenario and the only expressible form without
changing `commitState`'s signature; CAS-A6 catches it with the INSERT witness green. MA3 "bound
removed" is an unbounded async loop (not measurable); both off-by-one directions, VA3 (bound
counted in re-decisions = 10 submissions) and VA8 (bound 2) were measured instead. The
`boundedChange` extraction (finding 4) is the correct R07 repair; the superseded run is retained.

F-8 (inherited whole-corpus statics; see Static). Attributed by restoring the five diffed JS files
to the base inside my worktree and re-running: see the Static section for the numbers.

---

## Mutations (source restored in `finally`, every file proven byte-identical)

Driver `verify-a2/tools/mutate.py`; logs `verify-a2/mutations/<id>.log`, `summary-all.json`,
`driver-output.txt`. Every run: `node scripts/checks/wait-for-thermal-headroom.js` then
`npm run test:file -- <file>`, one file at a time. Baseline (no edit): CAS 20/20 (873 ms), SEL
23/23 (771 ms), PUB 25/25 (3967 ms) - `verify-a2/baseline/baseline.log`. Pristine digests
(`pristine-sha256.txt`): owner `62cb2191...8793`, CAS `eb0bad39...e7b2`; after every mutation the
driver logged `byte-identical=True` (15 owner restores, 2 CAS restores) and `git status --short`
is the seal only.

| Id | Mutation (mechanism) | CAS | SEL | PUB | Engaged |
|---|---|---|---|---|---|
| MA1 | single-shot restored | A1 `A_SIBLING_GRANT_DEFEATED_THE_CALLERS_OWN_SLOT`; A1b, A1c, A2, A3 `9 vs 1`, A7 | :212 shape | P1 "host-3 did not publish" (behavioural for P1; setup for P4-P16), P15 `3 vs 2`, P18, P19 (setup), P20 | yes (matches implementer) |
| MA1r | single-shot for RELEASING/CLOSED only | - | - | P19 `closed === false`, `{release: STATE_CHANGED, close: STATE_CHANGED}` | yes |
| MA2 | resubmit stale bytes after UNKNOWN | A4 `AN_UNKNOWN_ANSWER_WAS_RESUBMITTED` | green | P5b `UNAVAILABLE` vs `UNKNOWN` | yes |
| MA3a | bound RESOURCES-1 | A3 `9 vs 8` | green | P20 `27 vs 24` | yes |
| MA3b | bound RESOURCES+1 | A3 `9 vs 10` | green | P20 `27 vs 30` | yes |
| MA4 | re-read skipped (stale predicate re-decoded) | :149 `STATE_CHANGED` vs TARGET_ALREADY_OWNED; A1, A1b, A1c, A2, A5a, A5b, A7 | :188 STATE_CHANGED vs STALE_BINDING; :212 | P1, P3b STATE_CHANGED vs STALE_BINDING, P4-P16, P15 | yes |
| MA5 | selection re-decides after zero-row STATE_CHANGED | A6 `A_SELECTION_WAS_RE_DECIDED` | green (INSERT witness :53 green) | green | yes |
| MA6 | re-decide on the retained, mutated state object | :149 ADMITTED vs TARGET_ALREADY_OWNED; A1 `NOT_ONE_RE_DECIDED_SUBMISSION_AFTER_THE_DEFINITIVE_ZERO`; A1b, A1c, A2, A3, A5a, A5b | :188 PUBLISHED vs STALE_BINDING; :212 ADMITTED vs CLOSED | P3b, P19 PUBLISHED vs CLOSED, P20 | yes |
| MA7 | re-read failure after a zero answered UNKNOWN | A7 `A_DEFINITIVE_ZERO_WAS_REPORTED_AS_UNKNOWN` | green | green | yes |
| VA1 (new) | UNKNOWN (thrown or absent count) re-decided in the loop | green | green | P5b `UNAVAILABLE` vs `UNKNOWN` | native only -> F-2 |
| VA1+PX2 | same, with probe PX2 appended to CAS | PX2 `PX2_AN_ABSENT_COUNT_WAS_NOT_UNKNOWN` | - | - | the proposed CAS-A8 catches it |
| VA2 (new) | CAPACITY_EXHAUSTED retried in the loop | green | green | green | NOT engaged -> F-3 (unreachable) |
| VA3 (new) | bound counted in re-decisions (`submissions - 1`) | A3 `9 vs 10` | green | P20 `27 vs 30` | yes |
| VA4 (new) | return `change.result` on a zero (lie) | :149 ADMITTED vs TARGET_ALREADY_OWNED; A1 write count; A1b, A1c, A2, A3, A5a, A5b, A7 | :188, :212 | P3b, P19 RELEASING vs CLOSED, P20 | yes |
| VA8 (new) | bound of two (the vet's "why not 2") | A1b `STATE_CHANGED` vs PUBLISHED (the third submission is pinned); A3 `9 vs 2` | green | P19 `release STATE_CHANGED`; P20 `27 vs 6` | yes |
| PX (probes) | six temporary cases appended to CAS, pristine source | 26/26 green: PX1 close vs same-slot release -> CLOSED `[0, 1]`; PX2 absent count -> `{UNKNOWN}`, 1 submission; PX3 same-slot raced reserve -> CONFLICT `[0]`; PX4 release vs sibling grant -> RELEASING `[0, 1]`; PX5 exhaustion = 9 submissions, 10 reads; PX6 sealed change after the last submission -> `{STALE_BINDING}` | - | - | coverage probes (cells 11, 16, 21, 25, 32; F-1, F-2) |

---

## Static (verbatim summaries, verify worktree)

- `check-guideline-decision-boundaries.js --json src/control-plane/owners/service-instance-metadata.js`:
  `scannedFileCount 1, totalViolationCount 0, rawViolationCount 0, inheritedViolationCount 0,
  baselineViolationCount 806` (`static/decision-boundaries-owner.json`).
- `npx eslint` on the five touched JS files: exit 0, no output.
- `check-complexity.js --scoped` (5 files): `0 violation(s) in 5 target(s) (threshold: 12)`;
  `check-cognitive-complexity.js --scoped`: `0 violation(s) in 5 target(s) (threshold: 20)`.
- `check-guideline-literals.js` (owner file): 0 new, 0 inherited; `check-guideline-silent-catch.js`
  (owner file): 0 new, 0 inherited; `check-runtime-grammar-contracts.js` (owner file): 0.
- `node scripts/check-fast-static.js --base 89e70949f --explain`: `fast-static: ok in 10670ms`,
  EXIT 0; `changed paths: 11 (5 JavaScript)`; every stage ok: test:deps, audit:shards,
  test:metrics:scoped, audit:runtime-grammar, audit:current-capabilities, eslint(5 changed),
  audit:doc-ascii, test:metadata-gateway:audit, audit:impact-contracts, audit:roadmap-authority,
  audit:doc-audience, audit:cli-docs, audit:closure-ledger, audit:service-portability-claims
  (`static/heavy-statics.log`).
- `npm run audit:shards`: `curated test shards: current`; primary 2405 (unit 2090, integration 103,
  bootstrap 205, probe 3, packaging 4) OK; resource `fnv1a32-cde2f51e`; subsystem `fnv1a32-a8783cea`
  (no new test file, so the classes are unchanged in digest; the seal diff is the lead's refresh).
- `npm run audit:file-size`: EXIT 0; the oversized list is unchanged and names none of the touched
  files (owner file 240 lines; publication test 971 of 1500).
- `check-runtime-grammar-contracts.js` whole: `0 violations`.
- Whole-corpus reds, all INHERITED (verified at the base by restoring the five diffed JS files to
  `89e70949f` inside my worktree and re-running, then restoring to HEAD and proving every digest
  equal to `pristine-sha256.txt`): `test:duplication` `[test] FAILED: 698 clone group(s) and 26458
  duplicated line(s) exceed the current baseline of 697 / 26369` with an identical ten-file tail
  (all `test/distributed/harness/...` and `test/rebalancer/...`, none touched) at snapshot and base;
  `check-guideline-literals.js` `Matched 1264 inherited` plus new hits only in
  `cdc-event-buffer.js`, `partition-participant-transaction-topology-fence.js`,
  `distributed-transaction-recovery-authority.js` (identical at base);
  `check-guideline-silent-catch.js` `Matched 90 inherited` plus new hits only in
  `replica-operation-message-group-membership-owner-claim.js`,
  `raft-rs-membership-transition-runtime.js`, `service-consensus-creation-intent.js` (identical at
  base; the creation-intent hit predates A2 and is not in the diff); `check-guideline-decision-boundaries.js`
  `Matched 753 inherited` plus five new hits in `src/node` and `src/partition` files (identical at
  base). These are the lane's debt at `89e70949f` (R17: recorded for their owners, not absorbed);
  nothing in the A2 diff adds to or removes from them, and no baseline was raised (F-8).
- Expected worktree modification: `test/shards/impact-graph-seal.json` digests only
  (`sourceDigest 0d97cb46.. -> 817d0f37..`, `producerInputDigest 9f4c6283.. -> 09db31c1..`,
  `snapshotDigest 54dbd136.. -> 1db64fbc..`; `resolverStateDigest` unchanged); no module entered or
  left the graph (no new file), so this is the content refresh of the five changed JS files.

---

## Lab (raw records read; nothing re-run; the lead's message matched)

| Request | Issue / host | `placement-head` (executor.log) | `result.json` | `sha256sum executor.log` |
|---|---|---|---|---|
| `955f96cb8a33499686a6ed8b4d3c0683` | #142 lenovo-laptop | line 3: `8ec78a5e09cffa661acc249d576d25997adef9d1` (exactly one) | `outcome PASS, exit_code 0, source_sha 8ec78a5e0..., log_bytes 2267, log_sha256 ce12a951...162e, tail_truncated false` | `ce12a951dbb1e4bb1d5226027b7b867145febc5f30fb7d85176788d8e7dc162e` (2267 bytes) = match |
| `efc3102ee259460fa3d0483321e6fc64` | #143 adam-laptop | line 3: `8ec78a5e09cffa661acc249d576d25997adef9d1` (exactly one) | `outcome PASS, exit_code 0, source_sha 8ec78a5e0..., log_bytes 2009, log_sha256 009078c0...5c0d, tail_truncated false` | `009078c05990d0ae1f12154cfc20ee45ce5bfcb55b6f749e8fc86b33692a5c0d` (2009 bytes) = match |

lenovo-laptop (speed x2.18, `retry:0`, thermal ok 55 C / 46 C): 9/9 PASS, 263 assertions:
selection-admission 23, creation-intent 24, CAS 20, request-binding-compilation guard 4,
reconciliation unit 8, single-contract guard 4, system-metadata-owner-modules 146, local-record 9,
publication integration 25 (15156 ms, exclusive lane). adam-laptop (speed x1.96, `retry:0`, one
30 s thermal hold at 77 C then ok): 8/8 PASS, 242 assertions: runtime-lifecycle 82, driver 61,
wasm-service-lifecycle 60, C1 bound-native 3, creation-recovery 2, genesis 14, reconciliation
integration 4, retained-bootstrap 16. First failures: none (no `not ok` in either log). The three
pre-existing lane reds of `SERVING-PUBLICATION-STAGE1-LAB-ACCEPTANCE-20261017.md` (durable-commit-
replica-kinds, wasm-service-group-on-raft-rs, wasm-service-replica unit) were not in this selection
and none of them consumes the metadata owner (their failures are in the writer codec and the unit
model, per the stage-1 classification); the selection covers the changed files plus every direct
consumer of `reenterOnWake` and of the slot-transition path named by the implementer. The lab
assertion counts equal my local counts (CAS 20, SEL 23, publication 25).

---

## What I did not read or run (bounded, counted)

Not read in full: `control-plane-write-identity.js` beyond :1-90 and :340-397 (the named-write
instance machinery; the per-call minted identity makes it moot for A2),
`control-plane-system-table-gateway-mutation-submission.js` beyond :300-340,
`retryable-control-plane-write.js` beyond :100-195, `control-plane-system-table-gateway-request-coalescing.js`
(the vet's content-key reading :160-240 is relied on), `cdc-integration-service-mutation-operations.js`,
`distributed-write-coordinator.js` (the vet's :341-348 reading is relied on; I spot-checked three
other links of the chain), `wasm-service-replica-lifecycle.js` beyond the `metadataRelease` sites,
`wasm-service-lifecycle.js`, `owner-key-reconcile-queue.js`, `service-consensus-bootstrap.js`,
`service-consensus-creation-intent.js` beyond grep, `test/wasm-service/wasm-creation-reconciliation.integration.test.js`
beyond :80-130, `wasm-creation-bound-native-fixture.js` beyond :300-330, the design vets A/B and
the re-vet, HANDOFF-INTERFACES.md, the four templates not in the sealed bar (sweep-timer,
adversarial-js-intrinsics, design-note-template) beyond their index entries, `closeout-plan-2026-10-17.md`
beyond its A2 line, the implementer's `superseded-run1/` logs beyond the report's description,
the lab `checkout/` and `inventory/` directories. Not run: the multi-file selection (lab's; read),
`npm run audit:impact-contracts` and `test:deps` on their own (covered by fast-static), any
whole-repo gate beyond those listed, the corpus, `solve land`, `test:metadata:refresh`, nothing on
a lab host. Mutations not run: "bound removed" (unbounded, would hang), a CORRUPT_STATE
re-observation (needs a corrupt row written mid-loop; deterministic by `readState :43-44`), a
NEVER_CREATED re-observation (rows are never deleted), a literal relocation of the loop into
`commitState` (not expressible without a signature change; MA5 covers the semantic class).
