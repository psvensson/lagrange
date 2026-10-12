# Independent design review, round 1: participant release model reduction (2026-10-12)

Subject: `solve/quests/replicated-transaction-decision-and-apply/design-participant-release-reduction-2026-10-12.md`
on worktree `/mnt/data/peter/projects/.worktrees/activation-reduction-20261012` (HEAD 72f329a30 at the end of this
review = 14fac7d6e + six doc/log/evidence commits; `git diff --stat 14fac7d6 HEAD -- src test` is empty and the design
note is unchanged since 009419129, so every `file:line` below is the held source and the note as committed).
Read-only. No cluster run.

Parallel artifacts: `startup-admission-census.md` arrived while this review was being written (archived on the
branch at `solve/quests/replicated-transaction-decision-and-apply/evidence/activation-reduction-2026-10-12/startup-admission-census.md`,
commit abef00ee8); its sections A.2, C.2, D.2, E.1, E.3, F and G are consumed below and marked [census]. The live
trace `activation-trace-14fac7d6.md` was still ABSENT (the scratchpad holds its brief, the instrumentation diff and one
raw run log `oracle-run-1.log`). Every claim the design marks (T) therefore stays unconfirmed by a live trace; where
`diagnostic.json` or the source alone settles a (T), I say so.

The predecessor design the note cites by bare filename (line 11) is not part of 14fac7d6; it was read at
`/mnt/data/peter/projects/.worktrees/rs-raft-startup-activation-20261011/solve/quests/replicated-transaction-decision-and-apply/design-participant-release-activation-authority-2026-10-11.md`
(4193 lines) and is now retained on the branch as
`evidence/activation-reduction-2026-10-12/predecessor-design-participant-release-activation-authority-2026-10-11-d00c8f3e9.md`
(commit 1e3374fce, sha256 `9c716e2603f6a20d...`, byte-identical to the lane copy). The note's citation predates
that commit and still names a file the branch does not carry under that name (L7).

## Verdict: REVISE

The falsifier is largely right and the direction (per-dependent cycles, observe-first, retirement only on
replacement paths, drain vs catch-up) is the correct reduction. It cannot be implemented as written because four of
its load-bearing claims contradict the source it cites: (1) deleting SHARE while declaring the dispatch fence
"unchanged" makes every dependent FINALIZE/CONFIRM refuse at `participant_release_local_hold`, because the fence
compares the leader's local CURRENT authorization with the command's and only SHARE ever made them equal; (2) the
restart witness W-D's positive branch is unreachable, because every target entry anchors on the boot incarnation and
two process-local counters, so "its targets equal the current population" is false by construction after a
restart, and the only way to green it is the old-incarnation combination the owner forbade; (3) "control consumed,
never re-run" hands the control's release to a recovery owner that cannot run it (no origin, not local leader, or
admission already OPEN) and has no remote wake, leaving `control_release_pending` without a driver; (4) the budget
change replaces one 30 s invocation deadline by `ceil(N/4)` waves of 30 s attempts without saying what bounds the
seed, which is either a disguised raise or a no-op. The design also silently drops three of round ten's six
required witnesses (the owner's "submission, transport ack and a runtime turn do not establish commitment" proofs)
and 10 of the 14 accepted-input clauses it supersedes are not named as superseded. The startup census, read after the
first draft of this review, strengthens (2) and (3) rather than relieving them: the authorization id is minted per seed
invocation, and release authority tokens do not cross nodes.

## Evidence base

Read in order: CLAUDE.md, rules.md, router.md; the five templates; the subject; predecessor rounds 10, 11, 13, 14
(`rs-raft-startup-activation-20261011` copy, 4193 lines) and the round-3 independent review; v10 section 11.3 incl.
L6/0.0.14; owner-decisions row "The release obligation"; `diagnostic.json`; the 20 source files named in the brief
plus `partition-participant-transaction-cutover-constants.js`, `partition-service-raft-init-base.js:440-480`,
`replica-handler-create-methods.js:395-430`, `partition-committed-command-admission.js`,
`partition-participant-transaction-connection.js`, `partition-service-cdc-stream-base.js:330-382`,
`raft-rs-conf-state-key.js`, `seed-startup-session-store.js:184-200`, `config-definitions.js:61`.

## Section 1 (falsifier): attribution of F1..F7

| Defect | Verdict | Evidence | What is wrong or unconfirmed |
| --- | --- | --- | --- |
| F1 one slot | CORRECT, incomplete | `transaction-store.js:114-124,168-177`; `release-apply.js:152-159` (CONFIRMED absent from the refusal list, so a dependent RESERVE overwrites it), `:398-404` (RETIRED(X) refuses RETIRE(Y)) | Unlisted fourth sub-defect: a RETIRE(Y) applied on CONFIRMED(X) is admitted (`:399-400` exempts CONFIRMED) and `:450-462` writes a fresh RETIRED(Y) record with `active=null`, destroying a complete authorization by a foreign retirement. |
| F2 one projection | CORRECT | RESUME publishes CURRENT `participant-release.js:307-308`; SHARE publishes CURRENT `:179-181`; consumers `lifecycle-retirement.js:135`, `release-dispatch-admission.js:59` | - |
| F3 attempt changes what it proves | PARTLY | `participant-cutover.js:590`; `transaction-pause.js:38-41` (`raiseParticipantCutoverPause` returns the existing CLOSED admission unchanged; `newPause` only when OPEN) | "every retry is a new cycle" holds only for a service OPEN at attempt start (the control re-cycles, F7). A CLOSED dependent's retry rebuilds byte-identical RESERVE/PAUSE and replays (`release-request.js:69-78,106-114`). F3 and F7 are one defect (re-pausing an OPEN partition), not two. Citation `release-local-current.js:102-112` is wrong (file is 57 lines; the obligation move is `:22-32`). |
| F4 two paths | CORRECT, understated | `participant-cutover.js:265-275` (observe only when a control leader is LOCAL), `:259-260,273` (no local control leader: `requestParticipantRelease` to the remote node, i.e. a full remote control cutover with NO observe at all) | The design should state that any dependent whose node does not host the control leader always re-runs the control cutover. |
| F5 drain vs catch-up | CORRECT | `release-facts.js:65-70`; `diagnostic.json.firstRefusal` (followers applied=commit=2, last=3, all work counters zero) | - |
| F5 (addendum) | CONFIRMED by census F | `proposals`/`pendingOutcomes` are transiently non-zero "on the leader after any append until quorum commit and apply; on a learner until caught up"; the leader's PAUSE is settled before DRAIN is evaluated (`release-request.js:84-88`) | Consistent with `diagnostic.json.firstRefusal` (leader 3/3/3, followers 2/2/3). |
| F6 one budget | CORRECT | `bootstrap-service-seed-workflow.js:270-313` (serial loop, one `deadlineAtMs`), `seed-startup-session-store.js:199` (`deadlineAtMs = startedAt + timeoutMs`), `:414` (`timeoutMs: leadershipWaitTimeoutMs`), `config-definitions.js:61` (30000). `oracle-run-1.log` line 7: `servicesCreated:138` = 46 partitions x 3 | - |
| F7 no idempotent observation | CORRECT, uncited surface | `runCutoverAttempt` pauses first (`:590`) so an OPEN partition gets `wasClosed=false` and never reaches `continueDurableRelease` | `continueDurableRelease` (`:441-530`) IS an existing partial observe path for the CLOSED-with-record case (`:596-600`, `:608-610`). Section 3 does not cite it; Observe must replace it, not sit beside it (R11). |

(T)-marked rows of the trace table:

- idx 38 / idx 31 "SHARE overwrote the member's local CURRENT ... retires dependent #1's authorization" (T):
  DERIVABLE WITHOUT THE TRACE. The RETIRE at idx 31 carries `authorizationId 075bdebe` (`diagnostic.json`,
  `leaderReleaseCommands[9]`). The only two obligation sources are local CURRENT (`lifecycle-retirement.js:135,143`)
  and `reconstructDurableRetirement`, which uses the control's own RESUME record `controlAuthorizationId`
  (`:60,84`) = `b24ae48e`. Only SHARE (`participant-release.js:179-181`) ever publishes a dependent's id as the control
  member's CURRENT. Confirmed by exclusion.
- idx 31 "`observeCurrentControlOwner` returned null (T: which check)": UNCONFIRMED. By source the probable
  early return is `releaseCensusDefect(...) !== null` at `participant-cutover.js:314-315`, with
  `releaseFactsDefect` answering `DRAIN_PENDING` (`release-contract.js:102` via `release-facts.js:65-70`) because the
  census is read immediately after CONFIRM (idx 30) committed on the leader and before the followers' commitIndex
  advanced. If so, F5 is the trigger of F4 in the trace, not an independent transient, and the design should say so.
  Both the retained log and the scratch `oracle-run-1.log` contain exactly 6 `current_control_owner_fact` and 3
  `release_drain_pending` occurrences, which is consistent with nested control attempts failing their post-ENABLE
  census, but does not attribute the idx-31 null. Other candidates: `facts.paused === true` on a member (`:305`),
  `QUERY_DRAIN_PENDING` (`release-contract.js:106-115`, `originRequired` defaults true in observe).
- idx 32-45 "overwrote the slot that held dependent #1's CONFIRMED record": IMPRECISE. idx 31 had already turned
  CONFIRMED(075bdebe) into RETIRED(075bdebe) (`release-apply.js:450-462`, `active = existing`); idx 32 overwrote a
  RETIRED slot (`:152-159` admits a different id on RETIRED). The destruction of #1's complete authorization is idx
  31, by round eleven's own whole-slot terminalization rule.
- idx 60-278: CONFIRMED FROM SOURCE. Obligation null and not retained -> `reconstructDurableRetirement`
  (`lifecycle-retirement.js:140-145`), current target != retired target because the leader's admission generation
  moved at the previous nested attempt's `newPause`; RETIRE(b24ae48e) -> `applyRetire` STALE (`:398-404`: RETIRED
  (f1aa6015), different id, not CONFIRMED) -> throw (`:170-172`) -> `runParticipantCutover` catch -> UNAVAILABLE
  (`participant-cutover.js:785-786`) -> seed retry after 100 ms (`seed-workflow.js:305-313`) -> `propose` finds no
  pending outcome (`release-request.js:33-34`) and appends the same entryId again (219 entries).
- UNEXPLAINED by the design: why dependent #3's first nested control attempt, after RETIRE idx 59 succeeded, did
  not continue to RESERVE(b24ae48e) at revision 54 (the slot RETIRED(f1aa6015) would have admitted it,
  `:152-159`) but fell back to the reconstruct loop. Some refusal occurred between idx 59 and 60 (probably the
  post-PAUSE/post-ENABLE census, again F5). The trace must name it; the table skips it.

## Section 2 (reduced model)

### 2(a) Deleting CLAIM/SHARE

HIGH H1. **The dispatch fence contradiction.** `admitParticipantReleaseProposalDispatch`
(`release-dispatch-admission.js:59-65`) refuses FINALIZE/CONFIRM with `participant_release_local_hold` unless
`readParticipantReleaseLocalCurrent(service).authorizationId === command.authorizationId`. On the control leader,
CURRENT equals a dependent's authorization only because SHARE wrote it there (`participant-release.js:179-181`): that
is exactly F2. With SHARE deleted and CURRENT meaning "my own authorization" (fact 6), the leader's CURRENT is its own
cycle's id and every dependent FINALIZE/CONFIRM is refused before proposal. The design states the fence is
"unchanged" three times (section 2 "keep the dispatch-admission fence", section 5 row 2, section 7 row 2) and lists
no fence change in section 9. Close: re-key the fence to the per-dependent cycle (the row's expected revision and the
leader's own lifecycle facts, not CURRENT equality), name it in sections 3 and 9, and keep the existing witness
`participant-release-protocol.test.js:491` through the retirement map with its new key.

What the vouch protected (so the design can say what it drops): (i) the fence precondition above; (ii) each control
member's own incarnation facts bound into the record before FINALIZE (`release-apply.js:89-106`
`completeCurrentClaims`), so a control member's HOLD between RESERVE and FINALIZE is a deterministic STALE on
FINALIZE (`applyRetire` marks the claim RETIRED only in state RESERVED, `:405-427`; witness `:457`); (iii) round
ten's "every exact CURRENT claim and share revision" and R2-6's control-population reservation. Dropping (ii)/(iii) is
defensible: the dependent's admission is bound by its own targets through RESUME/RECEIPT and the control's role is
serialization, which the Raft commit under `committed.committedConfiguration` (`:58-63`) already provides. But it is
a supersession of an accepted clause and must be written as one (section 7 list, S3/S4/S14), and `:457` loses its
subject (M2).

### 2(b) Per-dependent cycle keying and the two orderings

MEDIUM M2. **Two RETIRE semantics under one name; no row element to mark before receipts.** Section 2 defines
`RETIRE(dependent, gen, reason)` as cycle-level supersession (terminalizes a non-terminal cycle) and
`RETIRE(dependent, gen, target)` as receipt-level ("marks that target's receipt RETIRED; cycle stays CONFIRMED").
Receipts exist only after RESUME. For a target retirement arriving while the cycle is RESERVED or AUTHORIZED there
is nothing to mark, so the retire-before-FINALIZE ordering the design says it "keeps" has no apply predicate. Round
eleven resolved this by terminalizing the whole cycle on any retirement; the design contradicts that without naming
it. Close: one RETIRE shape with a typed `scope` (`cycle` | `target`), and an explicit apply table per cycle state
(RESERVED/AUTHORIZED: target RETIRE terminalizes the cycle; CONFIRMED: marks the receipt). R07/R08.

MEDIUM M2b. **RETIRE for an older generation is untyped.** Section 5 row 3 says absence of the row is `INVALID` and
"already retired" is success. A row that moved to gen+1 is neither; inferring "already retired" from a different
cycle's state re-creates F1 (R07). The lifecycle owner must receive a typed terminal answer (e.g. `cycle_superseded`)
to clear its obligation before publishing a successor (owner 20:32 last row). Add the edge to section 4.

LOW L6. **What the dependent's FINALIZE binds about the control is unstated.** "Control consumed" is checked at
request time (INSPECT). At apply, FINALIZE binds the control's committed configuration (`release-apply.js:58-63`)
but not the control's own cycle `(gen, revision)` nor `targetBuildDigest`. State the binding or state why committed
configuration suffices.

"At most one unresolved cycle per dependent" holds trivially (PRIMARY KEY = one row). Supersession overwrites the
CONFIRMED history row; the owner's "preserve the committed decision" is then carried only by fact 3 on the dependent.
Acceptable, but say it.

### 2(c) Observe-first from a stale, foreign or recreated record

HIGH H2. **The restart positive branch cannot exist.** Observe reopens without commands only if the record's
"targets equal the current population". A target entry carries `ownerIncarnation` = the node's boot incarnation
(`replica-handler-runtime-metadata-methods.js:552`, documented "This node's boot" at
`message-group-service-handler.js:75`, compared with `row.boot_incarnation` at `replica-create-admission-owner.js:463`),
`connectionGeneration` = a process-wide counter of opened connections (`partition-participant-transaction-connection.js:22-33`),
`admissionGeneration` = a process-wide counter of pauses (`transaction-pause.js:20-27`), plus `lifecycleIncarnation`
and `runtimeGeneration` from the live raft status (`release-facts.js:72-79`; shape `release-command.js:46-50`). After
a restart every stored target differs from every current one by construction (the boot incarnation alone guarantees
it), so Observe always answers `target_generation_changed` and takes the supersession path (RETIRE, PAUSE, RESERVE
gen+1). Consequences: W-D's "restart with existing storage: no PAUSE/RESERVE/RETIRE" is unreachable; F6's "the
REGISTRATION checkpoint is resumable because Observe answers already-released partitions without commands" is false
for a restarted seed; `resumeParticipantCutoverAdmission` (`transaction-pause.js:111-122`) would equally refuse. The
only way to green W-D is to drop the incarnation fields from the comparison, which is precisely the "partial approval
from an old incarnation ... combine with new observations" the owner forbade (18:32). Close: either (a) state that a
restart always starts a new cycle (then rewrite W-D and the F6 claim, and accept that fact 3 "valid across restart"
means only that it authorizes a supersession, not a reopen), or (b) split the record into a persisted decision
(release identity, control cycle coordinates, population by replica identity) and per-incarnation observations
(the five incarnation fields), reopen only after the incarnation observations are re-established by a committed
RESUME. (b) is what 18:32 literally asks for; the design's fact 3 conflates both.

[census D.2] A second, independent restart blocker: the FRESH_SEED authorization id hashes
`[authorityId, invocationId, bootIncarnation, deadlineAtMs, targetBuildDigest]` (`authorization-owner.js:34-38`) and
every seed boot writes a new `startupInvocation` with a fresh `invocationId` and deadline
(`seed-startup-session-store.js:198-239`), so `H(root, releaseId)` differs per boot; the recovery driver's root is
`existing:<releaseId>` (`participant-cutover.js:448-450`), which never equals a FRESH_SEED-rooted record either. Today
that is why `continueDurableRelease` returns null on every seed restart and the full cycle re-runs for every partition
(census D.2); under the design, Observe's "the same authorization id/revision" can never hold for a restarted seed
even if the incarnation fields were set aside. The design keeps `authorizationId = H(root, releaseId)` (section 2
fact 4) and compares it in Observe: the restart reopen is doubly unreachable.

The wiped-and-recreated variant of W-D is sound at the dependent (its own record names a generation the new
incarnation cannot have). The foreign-record case at the control is M6 below.

### 2(d) The drain/catch-up split

MEDIUM M1. **`proposals`/`pendingOutcomes` are every pending committed write, not the protocol's own.**
`service.proposalQueue` and `service.pendingWriteOutcomes` (`partition-service-core-base.js:169-170`) are populated by
the write kernel for every committed write ("one handed to consensus may still commit",
`partition-service-cdc-stream-base.js:330-355,364-382`). Moving them from the pre-ENABLE drain to post-ENABLE
`catch_up_pending` means `reopenCohort` -> `reopenReplica` (`participant-release.js:98-119`) can `service.shutdown()`
with client writes proposed before the PAUSE still in flight (the parked writer is answered
`partition_write_service_shutdown`, quest log 2026-10-11 08:09). That drops an acknowledged obligation (R12) and
breaks L6's "no old committed obligation is discarded". [census A.2, F] The counters are not even "the protocol's own" on a fresh seed: CDC_DELIVERED
(`CDC_DELIVERY_OWNER`), COORDINATOR_SETTLEMENT (`COORDINATOR_OWNER`), participant PREPARE/DECISION and
GENERATION_ORIGIN replays (`TRANSACTION_OWNER`) all bypass the pause and are proposed while CLOSED
(`partition-committed-command-admission.js:66-72`; census A.2 bypass list; census F "CDC_DELIVERED (E.3a)" in
`proposals`), and the seed's CDC subscribers attach before the release loop (`seed-workflow.js:340`). There is no per-origin accounting of these counters; the
design cites none (template section 1: a surface it must create). Close: keep `proposals === 0 && pendingOutcomes ===
0` in the pre-reopen drain, or add an owner-level count of release-owner proposals and subtract only those.

### 2(e) "Control consumed, never re-run": liveness

HIGH H3. **Nobody can drive the control release on the paths the design routes to the recovery owner.**
`reconcile` (`replica-handler-release-recovery.js:70-98`) (i) requires a LOCAL leader of the partition (`:72-77`,
otherwise it re-enqueues locally and nothing reaches the node that hosts the control leader); (ii) returns
immediately when admission is OPEN (`:79`), so "control cycle absent or stale" while the control's local projection is
OPEN is never acted on; (iii) answers `OPERATOR_REQUIRED` when the origin is null (`:80-84`), so on a fresh seed or a
fresh create the control's FIRST release cannot come from recovery at all. `enqueue` also requires the partition to
be hosted locally (`:49`). There is no remote wake surface in the tree. Today the dependent-run nested cutover is the
only carrier of the seed/operator authority to the control (`participant-cutover.js:270-275`,
`participant-release-authorization-owner.js:60-67` `authorizeControlFrom`); the design deletes it and names no
replacement. [census C.2, G.5] The authority cannot be forwarded either: a release authorization token is a process-local
WeakMap key (`authorization-owner.js:17-24`) that does not travel; on another node `reference(token)` is null and the
root collapses to `existing:<releaseId>` (`participant-cutover.js:342-343,448-450,624-625`), and a remote leader whose
origin is null answers `OPERATOR_REQUIRED` (`:577-584`). So "a token-bearing request routed to the control leader's
node" is not available as a closure without a transferable (durable or signed) authority, which the design does not
define. Result: `control_release_pending` with `retryAfterMs` and no driver, a typed livelock until the
dependent's deadline. The seed order saves the seed's happy path only. Close: name the owner that performs the
control's own release when a dependent finds it absent (a token-bearing request routed to the control leader's node
through the existing RELEASE route, or an explicit remote recovery wake), and give `reconcile` a typed path for
"OPEN locally but cycle absent/stale".

### 2(f) Seed concurrency

MEDIUM M5. **Two dependent leaders racing at the control flip-flop instead of blocking.** RUNS (`:763-794`) is
per handler per partition, so an old (deposed) leader's attempt on node A and the new leader's on node B both reach
the control. The control-side AUTHORIZE validates the dependent census it is handed (`participant-release.js:195-205`),
not the dependent attempt's currency. With one slot the second RESERVE is refused until the first cycle ends
(`release-apply.js:153`); with per-dependent supersession "from live facts" the new leader retires the old leader's
non-terminal cycle, the old leader's FINALIZE goes STALE, the old leader's retry supersedes back, and so on while both
live. Close: bind the dependent attempt `(term, leaderReplicaId)` into the cycle row and refuse a RESERVE/RETIRE whose
dependent term is lower than the row's; or require the control to re-INSPECT the dependent leader before ordering a
supersession.

MEDIUM M13. **Two drivers with two roots on one partition.** [census D.2, G.6] The seed loop (root =
FRESH_SEED token, retry 100 ms) and the recovery loop (root = `existing:<releaseId>`, armed by
`subscribeServiceChanges`/`consensusEvents` as soon as the handler registers the partitions, `release-recovery.js:124-134`,
one 30 s attempt per wake, 1 s re-enqueue) derive different `authorizationId`s for the same dependent. Today RUNS
refuses the second as `different_release_request_in_flight` (`participant-cutover.js:780-783`) and the single slot
blocks a second RESERVE. Under per-dependent supersession "from live facts", whichever driver finds the other's
non-terminal cycle with a different authorization id will order `RETIRE(dependent, gen)` and reserve gen+1, and the
other will do the same on its next wake: the same flip-flop as M5 but between the seed and the recovery owner on one
node. F6 makes it worse by routing seed dependents "through the recovery owner's existing bound" without saying which
root they carry. Close: one root per partition per boot (the recovery owner consumes the seed's durable
`participantReleaseCommand` record rather than minting `existing:`), or the cycle row binds the root and a RESERVE with
a different root for a non-terminal cycle is `HELD`, never a supersession.

MEDIUM M4. **PAUSE identity is leader/term-bound, and PAUSE apply deletes fact 3.** `buildParticipantAdmissionPauseCommand`
hashes `leaderReplicaId, leaderTerm` (`release-command.js:155-166`); `applyParticipantAdmissionPause` bumps
`pauseGeneration` and NULLs `participant_release_authorization_*` (`transaction-store.js:143-158`). So any new
leader's first attempt commits a new PAUSE, clears the persisted decision and makes the prior cycle's RESUME record
unreplayable (`expectedPauseGeneration`). The design's fact 2 ("an attempt never advances it merely by starting") and
section 6 ("moves only on a committed PAUSE apply or a local HOLD") are literally true and miss this: W-C holds for
"same incarnations" only, and section 5 omits fact 3 from the views a committed PAUSE invalidates. Close: either drop
leader/term from the PAUSE body (round eleven's concern) or state that a leader change is a supersession and
witness it.

Shared state otherwise: the row CAS is the single-winner on durable state and RUNS is the synchronous gate per
dependent leader (template C1/C3 satisfied at that scope); authorization tokens are per partition and keyed by the
invocation (`authorization-owner.js:27-38`), no TOCTOU found there.

### 2(g) Is the budget change a disguised raise?

HIGH H4. **Under-specified; as written either a raise or a no-op.** The seed invocation deadline is `startedAt +
leadershipWaitTimeoutMs` = 30 s (`seed-startup-session-store.js:199`, `seed-workflow.js:414`,
`config-definitions.js:61`) and the fresh-seed authorization token binds that exact deadline (`authorization-owner.js:33`
`proof.deadlineAtMs === deadlineAtMs`; `runCutoverAttempt` refuses at `request.deadlineAtMs`, `:562-566`). The design
gives each attempt `DRAIN_DEADLINE_MS` = 30 s (`cutover-constants.js:35`) under `MAX_CONCURRENT_ATTEMPTS = 4`
(`release-recovery.js:17`). With 45-46 partitions that is `ceil(46/4) = 12` waves; "bounded by the slowest partition,
not the sum" is false for N > 4, and the worst case (12 x 30 s) exceeds the seed deadline twelvefold. Either the seed
deadline is raised (forbidden: "never raise a budget to get green"), or the attempts stay bounded by the invocation
deadline and nothing changes for the wedge. The formation template's window arithmetic (item 4) is absent; W-H has no
pass/fail criterion ("inside the per-attempt bound" is undefined at seed level). Close: state the seed-level bound
(the unchanged 30 s invocation), the measured per-attempt cost after the model change, and the concurrency that makes
`waves x cost < 30 s` with margin; W-H then becomes a red/green witness.

### 2(h) Control leader unavailable or elsewhere at observe time

MEDIUM M3. **INSPECT does not return what Observe needs; the existing second path is uncited.** The INSPECT action
answers `readParticipantReleaseFacts` only (`participant-release.js:383-387`; fields `release-facts.js:106-116`): no
control record, no authorization text, no cycle row. "A dependent asks the control leader (INSPECT) for the control's
own CONFIRMED cycle" and Observe's "the control leader reports cycle (dependent, gen) CONFIRMED with the same
authorization id/revision" consume a surface that does not exist and is not in section 3's create list. Redirect to
the current leader exists only for `ACTION.RELEASE` (`participant-release-client.js:63-70`) and the two-hop route in
`currentControlRoute` (`lifecycle-retirement.js:92-127`); an INSPECT to a non-leader must be typed (today it is an
OBSERVED answer with `leaderReplicaId !== generation.replicaId`). Also uncited: `continueDurableRelease` (F7 row above)
and `retainedAuthorizationMatches` (`participant-release.js:59-72`), the control-side replay of AUTHORIZE for a retained
dependent authorization, which the cycle table supersedes.

## Sections 3-6 by template category

### Consumed surfaces (section 3)

- LOW L1. Wrong citations: `release-identity.js:149-157` and `:149-163` (file is 28 lines in this worktree and in
  `rs-raft-startup-activation-20261011`; `releaseIdentityOf` is `:12-20`); `release-local-current.js:93-96` and
  `:102-112` (57 lines; publish `:13-16`, invalidate `:22-32`). Used in F2, F3, Observe, section 3 row 5 and section 6
  row 1. "Cite or it doesn't exist" fails for these two rows until corrected.
- MEDIUM M3 (above): INSPECT-returns-cycle-row, `continueDurableRelease`, `retainedAuthorizationMatches` uncited.
- MEDIUM M1 (above): per-origin proposal accounting is a surface to create, unlisted.
- HIGH H1 (above): the dispatch fence re-key is a surface to change, unlisted.
- LOW L7. The note cites its subject's predecessor as `design-participant-release-activation-authority-2026-10-11.md`
  (line 11) and, for the owner contract, "recorded on this quest's log"; at 14fac7d6 neither file is on the branch. The
  predecessor was retained later (commit 1e3374fce) under `evidence/activation-reduction-2026-10-12/predecessor-...-d00c8f3e9.md`.
  Cite the retained path and sha256 so the design-vet reads what the branch carries (R22 by analogy: a claim names the
  exact artifact it is true of).
- LOW L5. `authorizeControlFrom` (`authorization-owner.js:60-67`) and the dependent-side use of the RELEASE route's
  NOT_LEADER redirect become dead with the nested cutover deleted; the unused-exports ratchet will catch the former.
  Section 3 row "client route ... unchanged" is partly false.

### Typed failure edges (section 4)

- MEDIUM M11. Missing edges, each a decision today made by inference: (1) fact 3 current, cycle AUTHORIZED with
  partial receipts (the `continueDurableRelease` case): the next transition is "continue the cycle", not a typed
  mismatch; (2) fact 3 current, cycle row ABSENT at the control (history lost vs never reserved): section 5 types this
  only for retirement (`INVALID`); (3) admission OPEN with a proof that does not match fact 3; (4) INSPECT answered by
  a non-leader; (5) RETIRE for an older gen (M2b); (6) `control_release_pending` when no owner can run the control
  release on this path (H3) must fail closed with a reason that names the owner, not loop.
- Reason-shape fidelity (admission template item 4): the design reuses `release_generation_changed` (the existing
  `OUTCOME.STALE`, `cutover-constants.js:24`) with a new `reason` sub-field for two different states
  (`release_identity_changed`, `target_generation_changed`). Consumers today branch on `outcome` and `missingFact`
  (`release-recovery.js:58-60`, seed `:302-303`); state which field carries the new discriminators and that every
  consumer reads it.

### Cached-view audit (section 5)

- MEDIUM M10. **The pending-outcome map and the STALE re-proposal amplifier are missing.** A STALE apply is
  `RECORDED_ONLY` (no row change) and `getPendingCommittedWriteOutcome` clears on settlement
  (`cdc-stream-base.js:364-382`, `release-request.js:33-34`), so every retry of a command whose answer is STALE appends a
  new log entry; `retireParticipantRelease` has no row pre-check (`release-request.js:217-223`). This is the 219-entry
  mechanism and survives the model change unless every typed STALE is answered from the row before proposing.
- MEDIUM M4 (above): fact 3 is wiped by a committed PAUSE; not listed.
- HIGH H2 (above): the process-local counters `nextAdmissionGeneration` and `openedConnections` are identity sources
  that restart at 0 and can collide with stored values; not listed as views at all.
- Section 5 row "control INSPECT answer used by Observe": "a stale CONFIRMED leads to a RESUME whose apply binds
  expectedPauseGeneration and the configuration" is correct (`release-apply.js:491-498`) but RESUME apply does not
  check `controlAuthorizationId`/revision against anything (`:499-512` records them); the only place that binds the
  dependent's decision to the control's committed cycle is CONFIRM at the control. Say so.

### Identity anchoring (section 6)

- HIGH H2 (above): the target entry's anchors are boot/process-local and the design treats them as restart-stable.
- MEDIUM M6. **No history anchor for the control's cycle table.** `releaseId` is a content hash of partition, build,
  `configurationKey` (voter/learner id lists, `raft-rs-conf-state-key.js:4-13`) and `membershipGenerationIndex`
  (`release-identity.js:12-20`); the recovery root is `existing:${releaseId}` (`participant-cutover.js:342-343,448-450`),
  so `authorizationId` is reproducible. A control partition wiped and recreated with the same ids starts at gen 0 with
  the same release and authorization ids. A dependent's lifecycle owner carrying `RETIRE(dependent, gen 0, target)` from
  the old history, or a delayed old CONFIRM, matches the new history's row when gen/revision coincide, and "apply checks
  only the row and the command bytes" admits it. Round thirteen's established-history HOLD (approved sub-scope in the
  round-3 review) covered this; the design drops it ("no history id ... is needed") without a falsifier. Close: either
  anchor the cycle table on the control's origin `(originIndex, originTerm)` (fact 1, already durable) and bind it
  into every cycle command, or write the falsifier that shows the cross-history match is impossible.
- Anchor-moves-mid-operation paragraph: "a member's generation => that member's RESUME/RECEIPT is STALE and its
  target is retired" is right for receipts; for the RESERVE->FINALIZE window see M2.

### Formation circularity (templates: formation-circularity, admission-gating item 5)

- MEDIUM M12. The census the design defers to is absent, so the self-dependency inventory is not in evidence. One
  entry is already visible and unaddressed: the control's first release is the only way to its origin
  (`transaction-request.js:636-673`), and the recovery owner refuses to run without that origin
  (`release-recovery.js:80-84`), so "control first, by consumption" through recovery is circular on a fresh seed (H3).
- [census E.1, G.3] A control follower that needs a snapshot during formation runs `beforeServiceReplacement`
  -> `retireParticipantReleaseBeforeReplacement`; with no local CURRENT and no retained obligation it calls
  `reconstructDurableRetirement`, which THROWS "retirement route unavailable" when the durable record exists but the
  topology route does not (`lifecycle-retirement.js:79-82,148-150`; the route falls back to published SERVICES rows
  that are written only after release, `:45-55`), and the install aborts `RETIREMENT_FAILED`
  (`snapshot-catchup.js:369-376`). The follower then cannot reach `applied == commit == last`, and the control's
  own release (drain or `catch_up_pending`) never completes: a circular wait the design inherits. Under the reduced
  model a replacement that never published an own authorization owes no retirement (obligation 7 exists only when
  fact 6 is invalidated); the design must state that `beforeServiceReplacement` with no own authorization is a typed
  no-op that needs no route, and that the durable record alone never creates an obligation.
- [census E.3b, G.1] A seed restart with HELD `sql_transactions` rows holds at `QUERY_DRAIN_PENDING` until the
  invocation deadline if the provisional engine cannot route to a local leader before CACHE_HYDRATION (which runs
  after REGISTRATION). The design keeps settlement "unchanged" (section 3), so this formation-window risk is
  untouched; it should be recorded as out of scope with its owner, not left implicit.
- Window arithmetic absent (H4). Formation-window clients: W-F's client transaction during dependents' release is
  the right probe but see L4.

## Section 7: accepted-input clauses the design supersedes

Explicitly superseded (named in section 2, but S3/S4 are missing from the section 7 mapping table):

1. S1 Round 10: "The control generation row remains the sole durable authorization owner" -> new table
   `_participant_release_cycles` (fact 4).
2. S2 Round 11: single-slot cycle predecessor, `pauseInvocationId`/`authorizationId` v2 -> per-dependent
   `cycle_generation` (section 2 "Supersession").
3. S3 Round 10: "Its finalization command binds ... every exact CURRENT claim and share revision" -> CLAIM/SHARE
   deleted (section 2 "What is deleted"; absent from the section 7 table).
4. S4 Round 11: "Retirement of any required CURRENT claim or receipt ... terminalizes the whole cycle as RETIRED" ->
   receipt-level RETIRED, cycle stays CONFIRMED (contradicted, not named).

Silently superseded or dropped:

5. S5 Round 10 required witnesses 2, 3 and the inverse controls of 6 (follower forwarding / runtime-turn success
   without leader append records nothing; leader append followed by uncommitted suffix replacement; the same for
   OPENED confirmation) are absent from W-A..W-I. These are the proofs of the 20:32 row "submission, transport ack
   and a runtime turn do not establish commitment".
6. S6 Round 10 "Restart begins locally closed and reconstructs the control-row/current-generation state; a volatile
   observation or reconnect is never enough to open admission" -> Observe reopens from fact 3 plus a remote INSPECT
   read (and per H2 the path is in fact always a new cycle).
7. S7 Round 13 AC12-1 durable pre-submit candidate custody (approved sub-scope, round-3 review) -> dropped; "retain
   the exact identity" now means rebuilding bytes from live facts, which after a restart yields different bytes (H2).
8. S8 Round 13 AC12-2 immutable supersession body / execution-envelope split (approved for established history) ->
   `RETIRE(reason)` decided from live facts at request time.
9. S9 Round 13 AC12-3 / Round 14 history identity and incompatible-history HOLD (approved established-history
   sub-scope) -> "no history id or terminal exclusion concept is needed" (M6).
10. S10 Round 14 AC13-3 / Round 10 "original deadline captured once and never moves; no reply renews it" -> per-attempt
    `DRAIN_DEADLINE_MS` for seed attempts while the fresh-seed token binds the invocation deadline (H4).
11. S11 v10 11.3 L6 "the disposition of retained legacy protocol work and log entries is proven, and no old committed
    obligation is discarded" -> at risk by moving `proposals`/`pendingOutcomes` out of the pre-reopen drain (M1); not
    named.
12. S12 v10 11.3 landing gate items 2 and 5 (retirement map for every superseded 9.2 row; real three-replica A1-A5 and
    the persisted-migration M1) -> section 9 names a retirement map for release tests only and no A1-A5/M1. An
    omission rather than a claimed supersession; it must be stated as kept.
13. S13 Existing witnesses `participant-release-protocol.test.js:343` ("dependent release stays closed without a
    reconstructed current control owner fact") and `:352` ("consumes an exact remotely routed current control owner
    fact"): the remote-control semantics change (no nested run, INSPECT-based) and neither is in W-E's adapted list
    nor in a retirement map.
14. S14 Round 3 R2-6 "Current control population reservation and consume" -> deleted with CLAIM.

Kept and correctly mapped: owner-decisions "pause new mutation admission before draining" (PAUSE first); 0.0.14 reopen
of legacy-served connections before enable (`participant-release.js:98-127`, `transaction-request.js:659-662`); round
10's local HOLD + ordered retirement + deterministic apply over row and bytes; round 11's same-attempt post-ENABLE
catch-up; 18:32's persisted decision vs observations as a goal (but see H2 for the record shape).

Count: 14 clauses superseded or dropped, 4 named (2 of those missing from the section 7 table), 10 silent.

## Sections 8-9: witnesses and implementation order

- W-A: discriminating (RED by the oracle); cannot be stubbed inside the protocol. Sound.
- W-B: MEDIUM M8. Asserts "3xRESUME" on the control log; RESUME is one command per partition
  (`participant-cutover.js:409-415`, one proposal; the cohort RESUME is a read, `participant-release.js:293-299`) and the
  design's own table has idx 13-16 = RESUME + 3xRECEIPT. A witness written to the text would be red against a correct
  implementation. W-B also lacks its paired refusal (control cycle absent -> dependent stays CLOSED with
  `control_release_pending`); without it a control-first stub that skips INSPECT greens the log-shape assertion.
- W-C: MEDIUM M7. Its RED claim rests on F3; for a CLOSED dependent the retry replays by identity today
  (`release-request.js:106-114`, `transaction-pause.js:38-41`), so interruptions before RESUME are probably already
  green at 14fac7d6 and the witness is not discriminating there. State the interruption points that are red today
  (after the leader's RESUME, i.e. OPEN at retry; and the control partition itself) and keep the eight points as
  positive controls.
- W-D: HIGH H2. The positive branch is unreachable as specified; greening it requires dropping incarnation fields
  from the comparison, i.e. a stub of the forbidden kind. The wiped-replica variant is sound.
- W-E: MEDIUM M2. `:369,:395,:419` adapt to receipt-level cycles; `:457` (claim-level retire-before-finalize) has no
  subject after CLAIM deletion and must go through the retirement map, not "adapted"; `:491` must be re-keyed with
  the fence (H1).
- W-F: LOW L4. "a client transaction on sql_transactions during dependents' release succeeds" is not discriminating
  at 14fac7d6: the re-pause answers `WRITE_CUTOVER_PAUSED` with `deferRetry: true, retryAfterMs: 100`
  (`transaction-pause.js:134-140`), so an eventually-successful transaction passes. Assert "without a cutover-paused
  deferral" (or zero PAUSE applies on the control after its own release, which the first half already does).
- W-G: discriminating (idx 2 refusal) and stub-resistant (a renamed refusal still fails "completes without a retry
  cycle"). Sound.
- W-H: HIGH H4. No pass criterion at seed level; cannot be red or green.
- W-I: out of this increment; fine to list.

Implementation order: MEDIUM M9. "One increment, reviewed as one" hides at least six separately falsifiable
changes none of which is named: the dispatch-fence re-key (H1); the INSPECT extension to carry cycle rows (M3); a
remote recovery wake or token-carrying control request (H3); per-origin accounting of proposals or keeping them in
the drain (M1); the seed-level budget rule and its arithmetic (H4); the retirement map covering `:457`, `:343`,
`:352`, `:491` (M2, S13). Step 1 (store + apply + command bodies) is independently witnessable through the fixture
and is the natural first increment; steps 2-4 depend on the H1/H3/H4 decisions. Recommend two increments: (1) store,
apply, commands, fence re-key, fixture witnesses W-E/W-G and the paired refusal for W-B; (2) attempt, lifecycle,
drivers, W-B/W-C/W-D (rewritten)/W-F/W-H.

## Scoped positives (sound; preserve)

- F1, F2, F4, F5, F6 diagnoses are correct and evidence-backed; the idx-31 source is provable from the diagnostic by
  exclusion; the 60-278 loop is fully explained by the source.
- Per-dependent cycle rows with CAS on `(dependent, gen, revision)` and deterministic apply over row + command bytes:
  the right reduction of round eleven's single slot.
- Observe-first idempotence, "control consumed never re-run", retirement only on replacement paths, and
  `catch_up_pending` as a named state waited inside the attempt (round eleven kept) are the right goals.
- Deleting DISPATCH as a separate state is sound (AUTHORIZED already means "may resume"; the fence can key on it).
- Keeping fact 3 (the RESUME record) as the persisted decision and the dependent-side RESUME/RECEIPT/CONFIRM shapes
  unchanged (`release-apply.js:475-522,524-615`) is sound.
- Deleting CLAIM/SHARE is semantically defensible once (H1) is fixed and (S3/S4/S14) are written as supersessions.
- W-A and W-G are discriminating as written.

## Findings index

| Id | Sev | Section | One line |
| --- | --- | --- | --- |
| H1 | HIGH | 2a, 3, 5, 7, 9 | SHARE deleted but the dispatch fence "unchanged": every dependent FINALIZE/CONFIRM refused `local_hold` (`release-dispatch-admission.js:59-65`) |
| H2 | HIGH | 2c, 6, 8 (W-D) | target entries anchor on boot incarnation + process counters AND the authorization id is per seed invocation [census D.2]; restart reopen unreachable; only a forbidden stub greens W-D |
| H3 | HIGH | 2e, formation | recovery owner cannot run the control release (not local leader / OPEN / no origin, `release-recovery.js:72-84`); no remote wake; tokens do not travel [census C.2]; `control_release_pending` undriven |
| H4 | HIGH | 2g, 8 (W-H) | seed bound unstated; `ceil(46/4)` waves x 30 s vs a 30 s token-bound invocation deadline; "slowest partition" false for N > 4 |
| H5 | HIGH | 7, 8 | round-10 witnesses 2, 3, 6-inverse (ack/runtime-turn/append are not commitment) dropped from W-A..W-I |
| M1 | MED | 2d, 4 | `proposals`/`pendingOutcomes` are all pending writes; moving them post-ENABLE lets reopen shut down in-flight client writes (L6, R12) |
| M2 | MED | 2b, 4, 8 | two RETIRE semantics under one name; nothing to mark in RESERVED/AUTHORIZED; older-gen RETIRE untyped; `:457` loses its subject |
| M3 | MED | 2h, 3 | INSPECT carries no cycle row; `continueDurableRelease` and `retainedAuthorizationMatches` uncited (R11) |
| M4 | MED | 2f, 5, 6 | PAUSE identity is leader/term-bound and PAUSE apply wipes fact 3; W-C "same incarnations" only |
| M5 | MED | 2f | old vs new dependent leader flip-flop at the control; attempt term not bound into the row |
| M6 | MED | 6, 7 | no history anchor; releaseId/authorizationId reproducible after a control wipe; approved round-13 HOLD dropped silently |
| M7 | MED | 1 (F3), 8 (W-C) | "every retry is a new cycle" holds only for OPEN services; W-C red attribution unverified |
| M8 | MED | 8 (W-B) | "3xRESUME" contradicts the source and the design's own table; no paired refusal |
| M9 | MED | 9 | six hidden changes inside "one increment" |
| M10 | MED | 5 | STALE re-proposal amplifier and the pending map not audited; RETIRE has no row pre-check |
| M11 | MED | 4 | six missing typed edges (continue-cycle, row absent, proof mismatch, non-leader INSPECT, older-gen RETIRE, undriven control) |
| M12 | MED | formation | control-origin circularity (recovery needs the origin only the control release creates); snapshot-install retirement route throws and aborts the install [census E.1/G.3]; HELD-rows restart hold [census E.3b/G.1] |
| M13 | MED | 2f | seed driver (FRESH_SEED root) vs recovery driver (`existing:` root) on one partition flip-flop under per-dependent supersession [census D.2] |
| L1 | LOW | 3 | two wrong citations (`release-identity.js`, `release-local-current.js`) |
| L2 | LOW | 1 (F1) | RETIRE(Y) on CONFIRMED(X) overwrites a complete authorization; idx 32 row imprecise |
| L3 | LOW | 1 | the idx 59->60 refusal is unattributed; logs show 6x `current_control_owner_fact`, 3x `release_drain_pending` |
| L4 | LOW | 8 (W-F) | eventual success under `deferRetry` is not discriminating |
| L5 | LOW | 3 | `authorizeControlFrom` and the dependent NOT_LEADER redirect go dead; "client route unchanged" partly false |
| L6 | LOW | 2b, 6 | what a dependent FINALIZE binds about the control at apply is unstated |
| L7 | LOW | header, 3 | predecessor cited by a bare name the branch did not carry at the design commit; cite the retained evidence path + sha |
