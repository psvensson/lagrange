# Design re-vet R2: Revision 2 of SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017

Subject: `solve/quests/wasm-creation-genesis/SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md`
"Revision 2" (lines 385-686) at `2e82c7aef`, worktree
`/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
(`src/`, `test/` identical to lab-accepted `35d533b6b`). Both vet reports in
`evidence/design-vets-20261017/` read in full. Every `file:line` below re-read
from this tree. Read-only; nothing in any worktree touched.

## Verdict: REVISE (blocking: N1-N4; required: N5-N16)

Revision 2 closes the mechanism refutations of both vets (grant inside the keyed
continuation, READY fence, retirement intent, retire-by-token, RELEASING,
typed wake, no projections, IN_PROGRESS row). It introduces four new defects of
its own: the proof plan contradicts D1' (N1), the single-fire latch is the wrong
predicate (N2), the new RELEASING transition regresses CLOSED slots (N3), and
retirement custody is keyed by the logical serviceId, which the successor
overwrites (N4). None needs a new architecture; each needs a sentence-level
change to the mechanism and the plan.

---

## Part 1. Disposition of every A/B refutation

Legend: CLOSED (mechanism changed; clause), DEFERRED (owner + stage named;
legitimacy judged against CONTRACT-R2 / HANDOFF / R16-R17), OPEN (not or
wrongly addressed). "-> Nk" points at a new finding in Part 2.

### Vet A

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| S1-1 production endpoint/services writers | DEFERRED, legitimate | 7' discovery stage; D3' `publishesServicesRow`; D7' writes nothing. Supersedes CONTRACT-R2 "Services/endpoints carry B" and HANDOFF "returns the endpoint intent" FOR THIS STAGE, recorded under "Superseded clauses" (R09 satisfied). Not a silent narrowing: quest receipts stay `fail` (`evidence/receipt.json`), no existing witness asserts an endpoint for a bound replica (all assert `publications === []`: retained `:24,58,75,104,113,129,217,237,288,297`, genesis `:39,147`, reconciliation `:36,59`). |
| S1-2 frozen C1 witness | OPEN (wrongly addressed) | 6' adopts C1 with only `retire()` superseded; C1 is red for three other reasons -> N6 |
| S1-3 missing surfaces | PARTLY OPEN | `CONSENSUS_BOOTSTRAP.PUBLISHED`, manager bound STOP branch, retire-by-token, driver retention, wake consumer now named. Owner modules for the new codes (`LOCAL_GRANT_NOT_RECORDED`, `CREATION_RETIRED`, `CLOSE_UNRESOLVED`, `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`, `SERVING_ENABLE_FAILED`, `CREATION_STORAGE_MISSING`, wake outcomes) still unnamed (R06). The "result on an IN_PROGRESS row" journal write has no owner SQL (`transitionOperation` is state-changing only, `operation-lifecycle.js:127-175`) -> N14 |
| S1-4 second paths | CLOSED / DEFERRED | admin ENROLL/RECYCLE row in 3'; restart scan into bound stop deferred to recovery stage (7') |
| D1-1 recheck after every await | CLOSED | D1' "each await followed by the exact recheck"; (d)->(e) is synchronous so one recheck covers both |
| D1-2 two concurrent publishes | CLOSED | D1' in-key single flight (`enqueue :225-236` merge, `_deferInFlightItem :589-599`) |
| D1-3 publishReplica visibility | CLOSED as decision; shape conflict | public, token-validated; return shape vs frozen fixture -> N6 |
| D2-1 identity projection | CLOSED | D2' seven fields, `exactFields` + canonical re-encode |
| D2-2 tombstoned path blocks slot reuse | DEFERRED, legitimate (R17) | D2' last paragraph + 7' |
| D2-3 db-not-open silent skip | CLOSED, with caveat | D4' step 4 typed `RETIREMENT_BLOCKED_CLEANUP_REQUIRED` / by-path; decidability -> N8 |
| D2-4 local write throws after CAS | CLOSED as edge; liveness gap | 3' row 2 single code; event-run has no owned re-entry -> N7 |
| B2 admission not closed at fence | CLOSED | D3' READY term; existing unit witnesses turn red -> N5 |
| D3-1 consumers enumerated | CLOSED | D3' two predicates |
| B1 no retirement discriminator | CLOSED | D4' `shutdown({retirement})` captured at `:234`; join of an in-flight orderly stop falls through to by-path |
| B3 custody unreachable | PARTLY OPEN | in-process path named (retire-by-token, driver retention, manager STOP branch); restart half DEFERRED legitimately (7'); but the in-process custody key is wrong -> N4 |
| D4-1 token reachability in driver.stop | CLOSED | D7' driver passes the retained token |
| D4-2 retire vs orderly stop / two retires | CLOSED, with caveat | 3' rows; second retire's RELEASING can regress a CLOSED slot -> N3 |
| D4-3 port release before CLOSED / endpoint id | DEFERRED | endpoint identity in 7' |
| D4-4 ordering claim irrelevant | CLOSED | D3' is the fence |
| D5-1 RELEASING | CLOSED, with caveat | D5' non-blocking attempt; owner has no RELEASING guard -> N3 |
| D6-1 wake shape/vocab/consumer/re-entrancy | CLOSED (re-entrancy answered here, not in the text) | `RECONCILE_REASON` members, `wake.outcome` in results, `_wakeRebalancer` named. Re-entrant `request()` from inside the run is deferred, not deadlocked: new pending item -> microtask drain -> `_claimPendingItem :496-498` -> `_deferInFlightItem` -> runs after; emits a `STALE_CLAIM_IN_FLIGHT` diagnostic (`:601-617`) -> N13 |
| B5 PUBLISHED on shape | CLOSED | D7' re-resolve; residual -> N9 |
| B6 COMPLETED row | CLOSED | D7' IN_PROGRESS; HANDOFF clause explicitly superseded (R09) |
| D7-1 `_removeEndpoint`/STOPPED vs CLOSED | CLOSED by deferral | D7' performs neither for bound |
| D7-2 STARTING->RUNNING re-flips; `founder-N` key | OPEN (documentation) | R2 silent |
| D7-3 generic STOP rows in recovery scan | DEFERRED, legitimate | 7' recovery stage |
| D8-1 sentinel consumer sites | OPEN | D8 "stands" unchanged; `:143,:175,:197,:202` not adjusted -> N14 |
| Section 3 rows 1-5,7-13,15 | CLOSED | 3' table |
| Section 3 row 6 (copied-file identity row) | OPEN (minor) | covered by D2' text, no table row |
| Section 3 row 14 (endpoint write fails) | n/a | endpoint deferred |
| S6-1 claims without witness | CLOSED except timers | P12 order, P5b, P6a, P8 no explicit call; no positive witness that timers/broadcasts run after `enableServing` on the leader (B rows 21/22) |
| S6-2 mutations | CLOSED | M4 retargeted, P11/M9 forged |
| S6-3 coverage vs TEST-PLAN | CLOSED | C1 adopted (see N6); C9 crash halves implicitly deferred in 7' |
| S6-4 sinks | CLOSED | consistent with deferral |
| R1-R8, R11-R13 | CLOSED | as above |
| R9 (D8 sites), R10 (code owners) | OPEN | -> N14 |
| R14 | CLOSED | frozen witness cited; writers named as deferred |

### Vet B

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| R1 unjoined publish | CLOSED | D1' in key; `retire :107` `awaitCurrentWorkIdle` joins it; db closed only at `:196` after the join |
| R2 wake predicate / latch / unbind | CLOSED in shape; predicate wrong | -> N2; unbind after PUBLISHED does not cover reopen -> N16 |
| R3 admission at fence | CLOSED | D3' |
| R4 successor on the file | CLOSED | D4' successor fence on `retiringReplicas` (bound only) |
| R5 STOP custody path | CLOSED | D4' manager bound STOP branch (surface gap -> N14) |
| R6 cross-node wake | CLOSED | scoped in-process, production path named, cross-node deferred |
| R7 role/leader publication | CLOSED | `publishesServicesRow` keeps it disabled for bound |
| R8 reopen serves before re-grant | CLOSED | D2' open-time metadata check; P6b |
| H1 undeliverable throws | CLOSED | fixture wrapper answers `{acknowledged:true, noHandler:true}`; faithful to `message-router-inbound-dispatch.js:435-457` (ACK, then SERVICE_RESPONSE `{noHandler:true, error}`) and to the client shape `transport-semantic-outcome.js:224-251`; must not throw |
| H2 selection mid-CAS | CLOSED | P3a/P3b `holdNext` |
| H3 CLOSE UNKNOWN | CLOSED, realistic | `gateway.readAuthoritativeRows` is already a fixture-assigned function (`service-instance-creation-sqlite-fixture.js:101-102`); faulting it -> `readState :32` UNAVAILABLE -> `commitState :66-71` UNKNOWN |
| H4 inert publication | CLOSED | disabled + throwing sinks |
| H5 WAL witness | CLOSED | P4 second connection |
| H6 delayed-wake bypass | CLOSED | P1 automatic, no explicit re-entry, count |
| H7 second endpoint write | CLOSED | "no metadata mutation" |
| N1 tenure term | CLOSED by deferral | bound leader-node publication disabled |
| N2 reconstructTimers idempotence | DEFERRED, legitimate | 7' timer owner; latch itself -> N2 (mine) |
| N3 LEADER->FOLLOWER->LEADER across held grant | OPEN (uncovered) | no P; cells 3-6, 17, 19 |
| N4 ACK on null port | OPEN (R17 record missing) | not in 7' |
| N5, N6 | CLOSED / n/a | |
| Coverage cells 1,2,7,9,10,11,20,24,26,27,30,32,35,37,41,43 | CLOSED | P1, P9, P10, P4, P5b, P6b, H1, M7 |
| Cells 3,4,5,6,17,19 (role events MID grant/enable) | OPEN | uncovered (B-N3) |
| Cell 14 (grant lost reply) | OPEN | no `loseReply` on the grant UPDATE in the plan |
| Cell 15 (metadata unavailable at grant) | OPEN | no P; and no owned continuation -> N7 |
| Cells 21, 22 (timer fire / broadcast tick after enable) | OPEN | no positive effect witness |
| Cell 29 (late apply between RETIRED and port.close) | OPEN (benign) | design should argue |
| Cell 33 (RETIRED write fails) | OPEN | 3' row, no P |
| Cell 39 (OBSERVED from waited START must not wake) | OPEN | predicate stated, no witness; M7 removes the latch not the waiter term |
| Cell 44 (consumer absent) | OPEN | 3' row, no P |

---

## Part 2. New refutations introduced by Revision 2

### N1 (BLOCKING, NEW SHAPE; harness-fidelity #1, R19, R09, R21) D1' flips every retained OBSERVED witness and 6' says they stay green

- Evidence: D1' "after `progressWasmCreationGenesis` answers OBSERVED, the same run continues with the grant"; the retained fixtures use the production owner (`wasm-retained-bootstrap-fixture.js:94` `serviceDefinitionsOwner: metadata.primary`), so the grant lands. Witnesses that assert the pre-R2 outcome: `wasm-creation-genesis.integration.test.js:58-59, 85, 90, 105, 113, 179, 198, 217, 313` (`status === 'BOOTSTRAPPED_HELD'`, `genesis.outcome === 'GENESIS_OBSERVED'`), `assertHeld :39-46` (`heldCreationRefusal().reason === 'WRITER_NOT_READY'`, every slot ADMITTED|CLOSED); `wasm-creation-reconciliation.integration.test.js:45-66` (automatic: HELD, WRITER_NOT_READY, no PUBLISHED slot) and `assertNoServing :35-41`. 6' "Neighbours: retained 21 files ... must run green"; both files are in `lab-test-files.txt` (evidence/event-reconciliation-20261016/).
- Scenario: implement D1' exactly; run the lane. Every explicit START whose `request()` reaches OBSERVED returns `{started:true, status: PUBLISHED}`; `heldCreationRefusal()` is null; slots are PUBLISHED.
- Wrong output: either the lab-accepted witnesses are rewritten to pass (R21 forbids rewriting recorded witnesses silently) or the implementer adds a fixture seam that withholds the grant (R11: a quieter alternative path).
- Change: 6' must name these witnesses, record their supersession (expected result HELD/OBSERVED -> PUBLISHED where INIT is recorded and membership covered; `assertHeld` becomes "held until covered, then served"), and state which assertions remain (no sink calls, one operation row). Append; do not rewrite history.

### N2 (BLOCKING, NEW SHAPE; owner-interaction #6, R07) The single-fire latch is the wrong predicate

- Evidence: D1' "effects run only on the ADMITTED -> PUBLISHED transition this process performed, never on a re-entry that finds PUBLISHED already recorded"; D6' "the latch is the durable phase". Contradicted by 3' row 3 "`enableServing` throws after local PUBLISHED | re-entry replays effects", and by D2' "metadata ADMITTED with local PUBLISHED is HELD (re-grant on re-entry)".
- Scenario A: run writes local PUBLISHED, `enableServing` throws (`SERVING_ENABLE_FAILED`). Local is PUBLISHED, subscriptions are now retired (D6' unbind after local PUBLISHED). Re-entry finds PUBLISHED -> by D1' no effects, by D6' no wake. Scenario B (D2' own path): open with local PUBLISHED, metadata ADMITTED -> HELD; LEADER event suppressed while HELD (`onBecameLeader :545` via `serving`); re-grant lands metadata PUBLISHED; local already PUBLISHED -> no transition -> no `reconstructTimers`, no `_startSafetyBroadcasts`, no wake.
- Wrong output: a leader that admits user work with no timers and no safety broadcasts; a manager never woken for a replica that became served autonomously.
- Change: the latch for effects and for the wake is the PROCESS-LOCAL `servingState` edge HELD -> SERVING on this instance (an in-memory per-instance flag), set by the run that performs it (grant or re-grant) or by the open-time check; the durable phase is the RESTART latch only (a restart re-enters explicitly through the recovery scan of the IN_PROGRESS row and collects its own result, so no wake is right there). Re-entry replays effects iff `servingState !== SERVING`. The wake predicate: this run flipped `servingState` to SERVING AND the run's reasons carry no `PROGRESS_RECONCILE` waiter. Restate 3' row 3 and D2' accordingly.

### N3 (BLOCKING, NEW MECHANISM; recovery-replay #4, R14) RELEASING has no allowed-from guard in the owner; a CLOSED slot regresses

- Evidence: `service-instance-state.js:251-269`: guards exist only for `phase === PUBLISHED` (`:256-264`); for any other target phase `:265-268` answers idempotently on equality and otherwise sets `resource.phase = phase`. D4' step 3 `releaseInstanceResource` -> `transitionInstanceResource(..., RELEASING)` therefore moves ADMITTED, PUBLISHED AND CLOSED to RELEASING. `outstanding :38-41` counts RELEASING.
- Scenario: 3' "two retires racing: second joins the first's settlement". Retire#2 joins in step 2, resumes after retire#1's step 5 CLOSED, runs its own step 3 -> slot CLOSED -> RELEASING -> `outstanding(retiring)` true -> J's grant `PREDECESSOR_OUTSTANDING`, a third selection `TRANSITION_HELD`, until retire#2's step 5. Same for "an explicit re-stop re-enters `retireReplica` by token" if it re-runs step 3 (the text "redoes only the CAS" is ambiguous).
- Wrong output: a closed slot's phase regresses (contract: slots are monotonic after closure); J is held by a slot that was already closed.
- Change: `changeResourceState` must allow RELEASING only from ADMITTED|PUBLISHED and answer `{outcome: CLOSED, phase: CLOSED}` (idempotent) on a CLOSED slot; re-stop by token skips step 3; add the row to the owner's component table.

### N4 (BLOCKING, NEW MECHANISM; owner-interaction #1/#9, recovery-replay #3) Retirement custody is keyed by the logical serviceId, which the successor overwrites

- Evidence: D4' "the driver keeps `_prepared`/`_lifecycles` for the serviceId (retains the token)"; `wasm-component-driver.js:379, 422-423` `_prepared.set(serviceId, definition)`; `activeReplicas` keyed by serviceId (`wasm-service-lifecycle.js:245`); D4' step 1 "Resolve the registered replica for `serviceId`. If one exists, require its `consensusCreation.token` to equal the given token (else CONTENT_CONFLICT)".
- Scenario: I's retire ends `CLOSE_UNRESOLVED` (P5b): custody = driver `_prepared[S]` = I's token, I's slot PUBLISHED/RELEASING. J is selected; J's CREATE reaches the same node (same logical S): `driver.prepare` -> `_prepared.set(S, J)` overwrites I's token; `createReplica` registers J under S (I is out of `retiringReplicas`, `stopOwnedReplica :531`). Re-stop of I: the driver no longer has I's token; even with the token supplied, step 1 finds J's replica -> token mismatch -> CONTENT_CONFLICT -> "nothing runs".
- Wrong output: I's slot never CLOSED; J `PREDECESSOR_OUTSTANDING` forever on every host; the contract's "fail-closed without an owned continuation is not completion" is violated in-process, not only across restart.
- Change: custody keyed by the resource token / creation `operationId` (the manager's creation row `admission_json` already holds it in-process), never by S; step 1 matches the registered replica by `instanceDigest(consensusCreation)` and, on mismatch, falls to by-path retirement (not CONTENT_CONFLICT); `retireReplica` must receive the creation descriptor (binding + slot request), because the file path derives from `runtimeServiceConsensusIdentity(binding, slotRequest)` (`runtime-service-replica-identity.js:78-88`, `getWasmServiceDbPath :192-202`), not from the token's five fields.

### N5 (REQUIRED, NEW SHAPE; harness-fidelity #1, R19) D3' census: existing unit witnesses turn red for a fixture reason

- Evidence: `test/wasm-service/wasm-service-replica.test.js:95-99` builds unbound replicas without `initialize()` (`lifecycleState` CREATED) and drives user paths: `proposeEntry` `:273` (expects proposal), `:291` (expects `PROPOSAL_REFUSED`), `:306` (order-dependent); `onBecameLeader` `:389, :405, :427-430` (expects timers/broadcasts); `handleMessage` `:439` (served read), `:462` (forwarded read), `:480` (forwarded write). Under D3' `serving` is false for CREATED, so all return the `SERVICE_NOT_READY` shape; `:683` passes vacuously. `wasm-writer-completion-v1.test.js:53` already sets `lifecycleState = STATE.READY` and is unaffected; timer-manager tests use mock replicas.
- Judgment: the red is a correct refusal in production terms (no port, no READY) and a fixture gap in the witness. Change: 6' must list these cases and the honest repair (the unit helper sets READY, as the completion test does), so the lane is green for the right reason.

### N6 (REQUIRED, NEW SHAPE; R09/R21) C1 adoption is under-specified

- Evidence: `wasm-creation-bound-native-fixture.js:308` builds INIT with nonce `'22'.repeat(32)`; the bound root requires `binding.requestId.nonce` (`boundWasmInitialization :60-66`), so `classify :149-150` answers CONFLICT and `:312` (`RECORDED`) is red at the current tip, before Revision 2. `:313` ENROLL before publish is refused by `admitWasmBootstrapCommand :63-66` (HANDOVER.md:131 already records "required order is INIT -> publish -> ENROLL"). `:315-316` asserts `published.started === true`, while D1' says `publishReplica` "returns `request()`'s result" (reconcile vocabulary, no `started`). 6' records only `retire()` as superseded and requires the file green.
- Change: define `publishReplica`'s return as the same mapped start shape as `startReplica`'s bound branch; record supersession of `initializeAndPublish` (rely on the autonomous bound INIT or use `initialization(binding)`; ENROLL after PUBLISHED); keep the C1 discriminator (old INIT/ENROLL/WRITE refused on J).

### N7 (REQUIRED, NEW SHAPE; owner-interaction #6, R11) An event-run grant failure has no owned continuation in this stage

- Evidence: autonomous triggers are only native events (`wasm-creation-reconciliation.js:46-49`); after INIT is recorded no user write is admitted, so APPLIED_PROGRESS stops unless leadership changes; D6' fires the wake only on the local transition; the original D6 (wake on OBSERVED) is superseded.
- Scenario: autonomous run reaches OBSERVED; `grantInstanceResource` answers UNAVAILABLE/UNKNOWN (gateway down) or `commitDurably` throws (`LOCAL_GRANT_NOT_RECORDED`). Result HELD, no waiter, no wake, no further event.
- Wrong output: a replica with recorded genesis stays HELD indefinitely in this stage; the only re-entries are an operator START or a restart. Safe, but "fail-closed without an owned continuation is not completion".
- Change: either fire a typed HELD wake (`CREATION_GRANT_HELD` reason, bounded by the metadata outcome) so the operation owner re-enters, or name the production cadence (`RECONCILE_REASON.RUNTIME_SERVICE_DESIRED_STATE` periodic reconcile) as the owned continuation and record that the fixture has none; add the metadata-unavailable-at-grant case (B cell 15) with the chosen behaviour.

### N8 (REQUIRED, NEW SHAPE; R07) `RETIREMENT_BLOCKED_CLEANUP_REQUIRED` is not decidable from the lifecycle state

- Evidence: CLEANUP_REQUIRED is set by `retireReplica :201` on ANY failure (unsubscribe, handler retirement, port/kv/db close, activity stop) and by `openReplica :115`; whether handles are open is `replica.db?.open` (`closeWasmServiceConsensus :252-257` nulls `replica.db` only after a successful close). A CLEANUP_REQUIRED replica stays in `retiringReplicas` and `activeReplicas` (`stopOwnedReplica :531-534` unreached on throw) and is `live` (`isLiveWasmServiceReplica :55-59`), so D4' step 2 re-enters `shutdown()` (allowed by `:223-230`), a second retirement attempt the design does not define.
- Answer to the brief: a second better-sqlite3 connection to the WAL file in the same process cannot corrupt it; `commitDurably`'s pragma is per connection; blocking is bounded by the default busy timeout; the data-directory owner (`data-directory-process-owner.js:32-62`) is a per-directory lock, so "under this node's process owner" is trivially true in-process and says nothing per file.
- Change: decide on `replica.db?.open` (and the open connection, when live), name the second-attempt semantics (re-run `retireReplica` with intent RETIRE; a failed second attempt stays CLEANUP_REQUIRED, custody retained, no CLOSED).

### N9 (minor) D7' re-resolve TOCTOU and what it proves

- A slot can be CLOSED/RELEASING between the grant and the manager's re-resolve only through a concurrent retire; "retire by token" then joins the in-flight retirement or answers ALREADY/CLOSED idempotently (3' rows): right consequence, no wrong output. Residual: metadata PUBLISHED does not prove local serving (`LOCAL_GRANT_NOT_RECORDED` + forged PUBLISHED -> RUNNING on a non-serving replica). Acceptable because RUNNING is presentation and the real lifecycle never emits that pair; the manager should also require `started === true` of the mapped result and say so.

### N10 (REQUIRED, NEW SHAPE; R07) The continuation must be total

- Evidence: a thrown `reconcileFn` rejects the waiter (`owner-key-reconcile-queue.js:537-549`, default retry classifier false), so `request()` rejects and `startReplica :354` throws past the port-release/diagnostic path (`:332-342` catches only `initialize`); an event run's throw is only `logger.warn(DRAIN_ERROR)`. `progressWasmCreationGenesis :83-86` already catches everything; the grant steps (`commitDurably`, `enableServing`) must be wrapped the same way and mapped to the 3' codes, or N7's silent class widens to any exception.

### N11 (REQUIRED, harness) P4's READ/ASYNC injection point and consistency mode

- The retained origin's definition is `writeConsistency: 'strong'` (`service-instance-creation-sqlite-fixture.js:27-28`), bound into `definitionDigest`; an ASYNC write needs a distinct origin or a direct `proposeEntry` call. The READ/ASYNC write must be issued in the same synchronous turn as the stop initiation (before `retireReplicaTransportHandler :185`), via `replica.handleMessage`/`_handleRead`, otherwise the refusal comes from the retired handler (fixture noHandler) and M4 stays green for the wrong reason.

### N12 (minor, harness #5) P12 vacuity

- P12 passes if no user message is ever admitted; it must also assert that one message WAS admitted and served after the phase read.

### N13 (minor) Reasons and diagnostics the implementation must carry

- `reconcileFn` ignores reasons today (`wasm-creation-reconciliation.js:24-25`); D6' needs them. A wake-driven `request()` that re-enters while the run is in flight records `STALE_CLAIM_IN_FLIGHT` (`:601-617`) and bumps `_staleInFlightDeferralCount`; P1 must not assert zero stale-claim diagnostics. D6' should state the deferral explicitly (A-D6-1 asked for it).

### N14 (minor, R06/R07) Surfaces still unlisted

- D8's four consumer sites (A-D8-1) remain unaddressed; owner modules for the new codes unnamed; the manager bound STOP branch needs a journal write "result on an IN_PROGRESS row" that `transitionOperation :127-175` does not offer.

### N15 (minor, R09) Tombstone position vs the sealed order

- CONTRACT-R2: "closes native port and local handles, then durably marks its local resource RETIRED before acknowledging CLOSED". D4' step 4 writes RETIRED before `releaseWasmServiceReplicaConsensus`. The intent (RETIRED durable before CLOSED) is preserved and the choice is better (no reopen by path on the live path), but it is a reinterpretation of sealed wording; record it as a supersession.

### N16 (REQUIRED, NEW SHAPE; retry-loops) Reopen SERVING re-binds the events D6' retired

- D6' unbinds after local PUBLISHED. On reopen (D2' SERVING at open), `openReplica :99` calls `bind()` unconditionally; thereafter every committed user write emits APPLIED_PROGRESS -> `current()` true -> `reconcile` -> genesis reads -> OBSERVED -> idempotent grant CAS = one metadata READ per committed entry for the replica's lifetime (B's interleaving B returns for every reopened replica). Change: do not bind (or unbind at once) when the open-time state is SERVING; `current()` false once `servingState === SERVING`.

---

## Part 3. Answers to the brief's attack questions

- D1' inside the queue: a thrown run rejects the START (N10); the key is held for the gateway's own budget (CDC routed mutation: `CDC_DEFAULTS.RETRY_MAX_ATTEMPTS` 6 x `RETRY_DELAY_MS` 100 ms with a per-attempt floor of 1000 ms, `cdc-constants.js:28-29`, `cdc-routed-mutation-readiness.js:64-65`), so `awaitCurrentWorkIdle` (`retire :107`, no timeout) waits that bound, not forever; native wakes cannot pile up (one pending item per key, `enqueue :225-236`; the deferred claim does not busy-loop, `_schedulePendingDrainIfAvailable :563-576` returns while in flight). The run never starts inside a native callback: the listener only enqueues (`:46-49`), the drain is a microtask (`defaultDrainScheduler :95-97`), `announce` runs synchronously inside `drainReady` (`raft-rs-runtime-owner.js:1210-1212, 1264-1305`). A wake fired from inside `reconcile()` whose consumer re-enters `request()` is deferred to a new item and runs after (N13), never deadlocked. `commitDurably` cannot meet an open transaction: `apply` is one synchronous transaction, no await straddles it.
- D3' census: N5 (unit witnesses), plus `wasm-strong-write-native-fixture.js`/genesis/retained use initialized replicas and stay green except as N1 states.
- D4' by-path: N8; path derivation N4.
- D4' step 3 RELEASING: per-slot semantics are right (a RELEASING slot refuses only ITS re-publish; other slots of the selected instance still publish, `changeResourceState :256-264` reads `resource.phase` of the token's slot), `outstanding()` and J's admission treat RELEASING exactly like PUBLISHED (`:38-41`, `:161`, `:261-263`); `resolveRetainedAdmission :159` (`LIVE_PHASES :36` = ADMITTED|PUBLISHED) answers RESOURCE_CLOSED for RELEASING, so a re-entered CREATE during retirement is typed. The missing guard is N3.
- D6' latch: N2 (restart: right, because the recovery scan re-enters and collects; HELD->PUBLISHED failing between CAS and local write: right, no transition, re-entry retries; the failing case is effects/wake on re-grant and after `SERVING_ENABLE_FAILED`).
- D7' re-resolve: N9.
- 7' deferral: no existing witness asserts an endpoint or ACTIVE for a bound replica (Part 1, S1-1); `quest.json` receipts are all `fail`; TEST-PLAN C1 needs direct `handleMessage`, not an endpoint; adopting C1 with superseded `retire()` contradicts no sealed receipt, but the adoption itself is under-specified (N6).
- 6' vacuity: P1 vacuous if the consumer's re-run is itself what publishes (excluded by `automaticReconciliation: true` + "no explicit re-entry" + wake count); P2 vacuous if J's slot is never ADMITTED (assert reservation first); P3b vacuous unless the hold is on the grant UPDATE (`holdNext('owner-a')` matches `/service_instances/`, `service-instance-creation-sqlite-fixture.js:61-79`: fine); P4 N11; P5b realistic (H3); P6a vacuous if the reopen never reaches `enableServing`'s leader path (assert serving by a served read); P8 vacuous if the test calls J's bootstrap (plan excludes); P9 needs the hold on the grant UPDATE and an assertion on `_safetyBroadcastTimer === null` and `activeTimers.size === 0`; P10 fine; P11 fine; P12 N12. M1-M9 bind to real seams; M7 does not test the waiter term (cell 39).

## Part 4. Template pass (only what A/B did not already say)

- owner-interaction #5 (pressure): the in-key grant serializes native wakes behind a metadata CAS of up to several seconds; state the bound in D1' (R13). #6: N7. #9 (escape hatch): N4 (CONTENT_CONFLICT at step 1 is a dead end, not a continuation).
- admission-gating #1: D4' step 1's token precheck does not consult the state the by-path enforcer would (N4). #5 (hold release): after `CLOSE_UNRESOLVED`, the release observable is an explicit re-stop; no cadence in this stage (record).
- recovery-replay #4: N3 (RELEASING is not idempotent against CLOSED).
- concurrency-serialization #2: D7' re-resolve (N9), step 1 vs successor registration (N4). #4 (timers): `enableServing`'s `reconstructTimers` schedules `setTimeout` handlers whose `onTimerFired` runs `proposeEntry` through `serving` (gated after STOPPING by D3'): correct.
- transport-delivery #5: the fixture wrapper must answer, never throw, and carry `acknowledged:true, noHandler:true` (shape at `transport-semantic-outcome.js:224-251`); raft send never depends on it.
- harness-fidelity #1/#5: N1, N5, N6, N11, N12.
- formation-circularity: the local stop never waits on metadata (RELEASING non-blocking, CLOSED after the tombstone): correct. D2' deepens the reopen dependency on a live metadata read that CONTRACT-R2 B1 forbids; it is recorded in 7', but the recovery stage must now undo a decision this stage adds (liability, not a refutation).

---

## Verdict: REVISE (blocking)

Blocking: N1 (plan contradicts D1'), N2 (latch predicate), N3 (RELEASING regresses CLOSED), N4 (custody key). Required with the next revision: N5, N6, N7, N8, N10, N11, N16; record N9, N12-N15; add witnesses for B cells 3-6/17/19, 14, 15, 21/22, 33, 39, 44 or record them uncovered.

What an implementer must still not do: do not start source changes from Revision 2 as written. Do not rewrite the lab-accepted genesis/reconciliation witnesses to PUBLISHED without an appended supersession record, and do not add a fixture seam that withholds the grant to keep them green. Do not implement the single-fire latch on the durable phase; do not write RELEASING through `changeResourceState` until it refuses CLOSED -> RELEASING; do not key retirement custody or the by-path tombstone on the logical serviceId or on the driver's `_prepared` map; do not make `retireReplica(serviceId, token)` the only entry when no replica is live (it cannot derive the file path). Do not let the continuation throw. Do not adopt the frozen C1 file with only `retire()` superseded. Do not bind native events on a replica that opens SERVING.
