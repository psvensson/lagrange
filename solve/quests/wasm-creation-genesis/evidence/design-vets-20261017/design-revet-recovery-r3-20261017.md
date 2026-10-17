# Design re-vet R3: Revision 3 of RECOVERY-DESIGN-20261017

Subject: `solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` lines 753-879
("Revision 3") in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
at `381750de2` (file untracked; `src/`/`test/` clean). Read-only; nothing touched; no lab.
Every `file:line` re-read from this tree or carried from the three earlier vets on the same
tree. Sealed bar applied; retry-loops once, out of bar.

Read this round: Revision 3 in full; the census of every `OUTCOME.UNKNOWN` producer on the
bound path (`service-consensus-creation-intent.js:79,107,113,134,136,144,157,166`,
`service-consensus-bootstrap.js:108,132,135,165`, `wasm-creation-genesis.js:38,88`,
`wasm-creation-publication.js:34,39,72,77`, `wasm-creation-retirement.js:59,61`,
`runtime-service-bound-creation-route.js:44,72,194,358,411`); `decideResume :66-69`,
`resumeCode :71-73`, `RESUME_OUTCOME :43-44`; the wake detail reaching the handler
(`wasm-creation-wake.js:27-30`, `wasm-creation-reconciliation.js:92-94`);
`instanceFailure :107-109`; the one witness pinning `startReplica`'s diagnostic code
(`wasm-service-lifecycle.test.js:493`). Withheld: nothing new.

## Verdict: REVISE (narrow; one required change that must land before implementation, R35; precisions R34, R36; recorded N16-N18)

B7 and R28-R33 are closed in mechanism. R3-A's bound holds for the serving-unconfirmed
instance it names, but Revision 2's R2-C put two HELD reopened founders in the same raft
group as that serving leader, and those followers now apply the leader's committed user
writes: they are bound (HELD), they admit every APPLIED_PROGRESS, they run genesis plus a
grant attempt per committed write while the owner is down, and each run's
GRANT_HELD(UNAVAILABLE) wake schedules an immediate handler re-entry because R3-A rule 3
exempts SERVING instances only. The storm R17/B7 bounded on the leader moves to the followers.
Two predicate widenings close it; everything else in Revision 3 stands.

---

## Part 1. Disposition

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| B7 starvation | CLOSED | R3-A rules 1-2: APPLIED_PROGRESS admitted while genesis is unobserved (the APPLICATION_NOT_COVERED sub-case, `observeMembership :53-55`); every K-th admitted while serving-unconfirmed; the confirming run fires the one OBSERVED wake; B9 recorded as the outer bound. See Part 2 for the quiet-group statement (R34) and the follower gap (R35). |
| R28 post-retained UNAVAILABLE | CLOSED | R3-B keeps `{outcome: UNKNOWN, reason: UNAVAILABLE}` -> `RESUME_OUTCOME :44` DEFERRED, named with `deferRetry` (RV7.1); the bare UNAVAILABLE stays the pre-retained UNROUTED row. Producer census in Part 2 confirms every `UNKNOWN{...}` that reaches `decideResume` is a deferral and every status-bearing answer wins first (`RESUME_STATUS` before `RESUME_OUTCOME`). |
| R29 closed code set | CLOSED | R3-C: five codes as outcome, UNAVAILABLE as UNKNOWN, everything else today's throw. One witness census owed at landing (N18). |
| R30 CANCELLED -> REMOVE_COMPLETED | CLOSED | R3-D. |
| R31 named manager method | CLOSED | R3-E `resolveRetainedReservation(operationId)`, no runtime policy, CANCELLED in the same call. |
| R32 crash window + P-R12c | CLOSED | R3-E. |
| R33 journal-corrupt split | CLOSED | R3-F (`reentry: false`; handler logs typed, schedules nothing; the REMOVE of such a row is REMOVE_FAILED through `readRetainedCreation`'s own CORRUPT_STATE). |
| N14 HELD-leader degradation | recorded | R3-G. |
| N15 shape-pinning witnesses | recorded | R3-B/R3-C. |

## Part 2. The three attacks

### R3-A rule 2: the per-instance in-process counter

- Right owner? Yes. The count is a disposable trigger cadence, not a fact anyone recovers
  (authority-and-recovery: "recompute disposable schedules"); the reconciliation adapter is
  already the volatile trigger owner of this replica (`wasm-creation-reconciliation.js:1-6`);
  the constant `UNCONFIRMED_RECONFIRM_EVERY_WRITES` lives there (R06). The counter is read
  and written only inside the subscription callback (`bind :60-66`, synchronous,
  single-threaded) and resets with the instance; a restart restarts the count. Nothing else
  needs it. HOLDS.
- Fewer than K writes after the owner returns: then no admitted event occurs; a settled group
  emits no formation events; the GRANT_HELD(UNAVAILABLE) wake was RECORDED; there is no
  cadence. The window is then bounded only by (i) a REMOVE, (ii) a restart, (iii) B9's
  held-CREATE re-dispatch in production (charter item 6), or (iv) an explicit re-entry in the
  embedding. Acceptable to state, and it must be stated: safety is intact (the replica serves
  on its durable local grant, B1 :156-159; the HELD followers serve nothing), the cost is a
  stale discovery projection and an ADD workflow parked at CREATING/HELD. R3-A rule 4 says
  "the production trigger that bounds the window from outside is ... B9"; it does not say
  that a quiet group confirms ONLY through B9 (production) or an explicit re-entry
  (embedding), and P-R3 as written drives K writes, so the quiet case is unwitnessed. Add the
  sentence and a P-R3 variant "fewer than K writes, owner back: unconfirmed until an explicit
  re-entry; the re-entry confirms" (R34). Not a mechanism defect: a quest whose scope excludes
  production wiring cannot own B9, and the embedding has no coordinator.
- Second genesis/grant writer? No. The admitted event enqueues on the same per-replica key
  (`enqueue :63`) and coalesces with any waited START (`enqueueAndWait :73`, reasons merged
  per run `:77-91`); the run is the one `reconcile` -> `progressWasmCreationGenesis` ->
  `publishWasmCreation`. INIT is submitted only when `classify` answers NEW and the instance
  leads (`progressWasmCreationGenesis :74-78`); a reopened instance's INIT is RECORDED, so no
  second INIT. The grant is one owner CAS per run, idempotent once PUBLISHED (SAME,
  `resourceTransition :275-281`). `grantConfirmation`'s one writer is the publication run on
  GRANTED (R2-D). HOLDS.
- THE GAP (R35, NEW SHAPE, retry-loops #5, owner-interaction #5): R3-A rule 2 bounds "the
  instance [that] is serving-unconfirmed". Under R2-C the group also contains HELD reopened
  founders (local ADMITTED, owner down). A HELD instance is bound (`openReplicaResources
  :129`: binds for `servingState !== SERVING`), `admitsNativeWake :44-46` admits every
  `WAKE_EVENTS :20-23` member for it, APPLIED_PROGRESS included, and as a raft follower it
  APPLIES every user write the serving-unconfirmed leader commits (apply does not consult
  serving). Stage 1's premise that "after INIT is recorded no user write is admitted, so
  APPLIED_PROGRESS stops" (re-vet R2 N7 evidence) held because a HELD replica never shared a
  group with a serving one; R2-C created exactly that configuration. Per committed user
  write, on each of the two followers: one run (`progressWasmCreationGenesis` ->
  `observeMembership` OBSERVED -> `publishWasmCreation` -> `resolveGrant :32-40` -> owner
  UNAVAILABLE -> `held()`), one `CREATION_GRANT_HELD` wake (`publish :92-94`, not waited),
  and at the handler `findWakeTarget :316-333` -> memo HELD -> `WAKE_TARGET.HELD` ->
  `scheduleBoundReentry :141-149` -> `resumeConsensusCreation` (journal read, policy, owner
  read, adapter create/start no-op, a second waited run with another genesis read and grant
  attempt), because R3-A rule 3 records GRANT_HELD(UNAVAILABLE) without re-entry "for a
  SERVING instance" only, and the handler cannot see serving at all: what it sees is the wake
  detail `{grant: {outcome}}` (`wasm-creation-wake.js:29`, `publish :94`). Unbounded while
  the owner is down and writes flow, on two of three replicas.
  Change: widen both predicates to the fact that actually matters, which both owners can
  see. Rule 2: the K-th admission applies to every instance whose genesis is OBSERVED in this
  process and whose last grant attempt answered UNAVAILABLE (serving-unconfirmed or HELD);
  before the first UNAVAILABLE answer a HELD instance keeps today's behaviour (nothing to
  bound: the first run after formation is the one that learns the owner is down). Rule 3: the
  handler RECORDS every `CREATION_GRANT_HELD` wake whose `grant.outcome` is UNAVAILABLE
  (keyed on the wake detail, not on serving), for any memo; a re-entry on that wake would
  only re-read the same unavailable owner, and the owner's return is re-observed by rule 2's
  K-th run (which, on a HELD instance, lands the grant and fires the OBSERVED wake as D1'/N7
  already define). Witness P-R3f: two HELD reopened founders beside one serving-unconfirmed
  leader, N committed writes, owner down -> at most ceil(N/K) runs per follower, zero handler
  re-entries; owner back -> within K writes each follower grants, one OBSERVED wake each,
  three ACTIVE. Mutations: "K-th bound applied to serving instances only" and "RECORDED
  limited to serving instances" each redden P-R3f.

### R3-B: every producer of `UNKNOWN{reason}` that can reach `decideResume`

`decideResume :66-69` consults `RESUME_STATUS` first (HELD / PUBLISHED_UNPROJECTED /
PUBLISHED, and after R1-C PUBLISHED_UNCONFIRMED), then `RESUME_OUTCOME :43-44`
(INTENT_NOT_FOUND -> UNROUTED, UNAVAILABLE -> UNROUTED, UNKNOWN -> DEFERRED), else FAILED;
`resumeCode :71-73` reads `reason ?? outcome`. Producers:

1. `service-consensus-creation-intent.js:134` (`unresolvedResult`, owner read UNAVAILABLE in
   `reserveAndRetain :146` or, before R2-B, `resolveRetainedAdmission :168`) -> `UNKNOWN{UNAVAILABLE}`
   -> DEFERRED named. After R2-B the resolve path answers ADMISSION_RETAINED{phase:
   UNAVAILABLE} instead; the reserve path (a PENDING row re-entered with the owner down)
   keeps this shape: consistent (a PENDING row cannot open without its reservation).
2. `:136` a sealed owner refusal passed through as-is (CONFLICT, STALE_BINDING, ...) ->
   FAILED permanent (RV3.3). Unchanged.
3. `:144` reserve threw -> `{outcome: UNKNOWN}` -> DEFERRED, code UNKNOWN. Unchanged.
4. `:166` resolve threw -> R2-B folds it into the UNAVAILABLE class (phase UNAVAILABLE).
   Consistent.
5. `service-consensus-bootstrap.js:108` (`retireConsensusCreation` catch) -> REMOVE path
   (`RETIREMENT_DECISIONS :352-359` HELD), never `decideResume`.
6. `:132` CONTRADICTED -> `UNKNOWN{CONTENT_CONFLICT, retirement}` -> DEFERRED; RV3.3 accepted
   this ("the next resume answers RESOURCE_CLOSED -> FAILED: convergence"). Unchanged.
7. `:135` UNRESOLVED -> `UNKNOWN{reason: current.outcome ?? UNKNOWN}`. For a plain PUBLISHED
   answer (owner reachable at open, unreachable at confirm: a flap) this is
   `UNKNOWN{UNAVAILABLE}` -> DEFERRED, while R1-C 5 maps the same condition on a
   PUBLISHED_UNCONFIRMED answer to HELD. Both are re-enterable and custody-equivalent (named
   memo either way); the executor outcome differs (CREATE_FAILED + deferRetry vs CREATE_HELD)
   for one condition, "serving, operation unconfirmed because the owner is unreachable".
   RV3.2's honest statement is HELD. Map UNRESOLVED-with-UNAVAILABLE on a serving PUBLISHED
   answer to PUBLISHED_UNCONFIRMED too, or record the two-shape asymmetry (R36, minor).
8. `:165` (`continueRetainedCreation` catch) -> `UNKNOWN{reason: failure.outcome}`: the
   designated carrier of open-time UNAVAILABLE after R3-C returns it from
   `confirmConsensusBootstrapResult` (then `:158` returns it without the catch). Also the
   catch-all for every other throw in the adapter chain: `instanceFailure :107-109` answers
   UNAVAILABLE for any non-contract error, so a `lifecycleRefusal` thrown from
   `createReplica :238-241` (REPLICA_LIVE at create, not start) or a driver prepare failure
   surfaces as `UNKNOWN{UNAVAILABLE}` today and after Revision 3. Not a regression and still a
   deferral, but `reason: UNAVAILABLE` does not mean "the owner was unavailable"; record it
   (N17) and do not build a witness on the reason's meaning beyond "deferred".
9. `wasm-creation-genesis.js:38, :88` and `wasm-creation-publication.js:39, :72, :77` ->
   run outcomes inside a START answer whose STATUS is HELD (`boundStartResult :110-115`):
   `RESUME_STATUS` wins; never reach the UNKNOWN row.
10. `wasm-creation-retirement.js:59, :61` -> REMOVE path.
11. Handler `:194` (route catch) -> DEFERRED with `error.code ?? UNKNOWN`; `:358, :411` ->
    REMOVE HELD.

Conclusion: R3-B's reliance is sound. Every `UNKNOWN{...}` that reaches `decideResume` is
the DEFERRED-named decision RV3.3 already sealed; the five permanent codes bypass it as
outcomes; the bare UNAVAILABLE row stays pre-retained. The two UNAVAILABLE witnesses
(`runtime-service-bound-route.test.js:234-243`, `:277-282, :311-314`) stand. One
asymmetry (R36) and one ambiguity (N17), neither a custody defect.

### Nothing else regressed

- R3-C: `startReplica :378-381` reading `cause.outcome ?? cause.code` changes the recorded
  start diagnostic for a contract-error refusal from `consensus_start_refused` to the
  outcome string. One committed witness pins the old value
  (`wasm-service-lifecycle.test.js:493` `result.diagnostic.code === 'consensus_start_refused'`);
  whether its refusal is a contract error or a generic one decides if it flips. Census and
  supersede by appending if it does (N18).
- R3-A rule 1 for a HELD instance in a group with no serving leader (J's founders held
  PREDECESSOR_OUTSTANDING while I serves): J's founders are in J's own group, so I's writes
  never reach them; APPLIED_PROGRESS stops after INIT as before. Unchanged.
- R3-D/R3-E/R3-F: consistent with the reader census of the R1 and R2 re-vets; a
  `TERMINAL_OPERATION` answer from `reserveAndRetain :155` during the REMOVE-time resolution
  (the row went terminal meanwhile) is covered by R3-D's TERMINAL mapping; `INVALID_EXPECTED_STATE`
  from a slot reused at a higher ordinal (`reserveResourceState :226`) is a sealed refusal
  -> CANCELLED, correct (the request can never apply).
- The claim, the owner map, the identity anchoring and the C9 harness are untouched by
  Revision 3.

## Part 3. Owner uniqueness

Unchanged. The K-th counter and its constant belong to the reconciliation adapter; the
handler keys its RECORDED rule on the wake detail it already receives; no second writer of
genesis, grant, `grantConfirmation` or the memo link appears (R35 widens two predicates, it
adds no owner).

## Part 4. Proof plan

P-R3 (K writes), P-R3c (bound), P-R3e (replay-lagging START), P-R12c (crash window) stand.
Add: P-R3 quiet-group variant (R34); P-R3f two HELD followers beside a serving-unconfirmed
leader, owner down then back (R35), with the two mutations named above; the diagnostic-code
witness census (N18).

---

## Required changes

Must land before implementation:

- R35 R3-A rule 2's K-th admission applies to every instance whose genesis is observed and
  whose last grant attempt answered UNAVAILABLE (HELD or serving-unconfirmed); rule 3's
  RECORDED applies to every GRANT_HELD wake whose `grant.outcome` is UNAVAILABLE, keyed on the
  wake detail; witness P-R3f with its two mutations.

Required precisions:

- R34 State that a group committing fewer than K writes after the owner returns confirms only
  through B9 (production) or an explicit re-entry (embedding), safety intact; add the P-R3
  quiet-group variant.
- R36 UNRESOLVED-with-UNAVAILABLE at `confirmPublishedAuthority :135` on a serving PUBLISHED
  answer: map to PUBLISHED_UNCONFIRMED (one shape for one condition) or record the asymmetry.

Recorded:

- N16 `UNCONFIRMED_RECONFIRM_EVERY_WRITES` has a name and an owner but no value in the design;
  the value is the owner's (R06), chosen at implementation with P-R3c's bound stated in terms
  of it.
- N17 `instanceFailure`'s UNAVAILABLE fallback makes `reason: UNAVAILABLE` at
  `continueRetainedCreation :165` mean "deferred", not "the owner was unavailable"; no
  witness may read more into it.
- N18 `wasm-service-lifecycle.test.js:493` pins `consensus_start_refused`; census whether
  R3-C flips it and supersede by appending if so.

What the implementer must not do from Revision 3: do not limit the K-th bound or the
RECORDED rule to serving instances; do not key the handler's RECORDED rule on a serving state
it cannot observe; do not let a HELD follower in a group with a serving leader run genesis per
committed write while the owner is down; do not assert P-R3's confirmation for a group that
committed fewer than K writes without an explicit re-entry.

This is the vet's verdict only; nothing is reported done on the lead's behalf.
