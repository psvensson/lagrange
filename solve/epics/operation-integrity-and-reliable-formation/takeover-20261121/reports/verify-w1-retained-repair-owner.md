# Verification: W1 retained placement repair owner, head f42102c84

Verifier: independent, read-only. Nothing was executed; no test ran on this machine. Evidence labels:
**VERIFIED** = read in the code at the named ref, or read in a retained lab output (directory named);
**INFERRED** = derived by reading a path end to end, not executed.

Subject: `work/retained-ledger-observation-repair-20261121` at `f42102c84`. Merge base with the integration
line `23344cddc` = `812dd3a1b`. Line numbers are at `f42102c84` unless a ref is named. Short file names:
`repair.js` = `src/rebalancer/replica-operation-repository-retained-placement-repair.js`; `authority.js`,
`ingress.js`, `wake.js`, `read-retry.js`, `record.js`, `answer.js`, `reply.js`, `observation.js` =
`src/rebalancer/replica-operation-retained-repair-<name>.js`.

## Verdict

**APPROVE-WITH-CONDITIONS** for merging into the integration line. **Not ready** for the three-node
acceptance run until conditions C1-C6 hold.

Why approve the merge: the integration line already carries an older sibling draft of this owner
(`e9de22eb1`) with the defects this branch removes: the role-keyed notified-row wake that production rows
never satisfy (`23344cddc:repair.js:74-77`, `row.raft_role === RAFT_ROLE.LEADER`) and the any-leader read
acceptance (`23344cddc:authority.js:41`, `expectedOwner === null`). VERIFIED. The branch is strictly better on
both. I found no path where the owner proposes on evidence it should not have, apart from F3 (a redundant
proposal that native apply still judges).

Why conditions: five defects found by reading (F1-F5), one unfenced consumer (F8, known to the author), and
the author's "all 30 cone reds are pre-existing" claim does not hold against the merge target (F9).

## Findings

### F1. A continuation that owes only ROUTE fires once and does nothing (liveness). INFERRED
`repair.js:145`: `if (mode === MODE.HANDOFF && !changed && kinds === OBSERVATION.ROUTE) return false;`
The guard does not distinguish a publication hint from an owed revalidation.

Minimal interleaving:
1. Record blocked or pinned, binding A, `owed = NONE`, continuation IDLE.
2. Route publication A to B: drain takes `kinds = ROUTE`, mode HANDOFF, binding changed, read fails
   (`READ_FAILED`). `oweRetainedRepair(attempt, ROUTE, READ_FAILED)` (`repair.js:155`) sets `owed = ROUTE`
   and arms the timer.
3. Timer fires (`read-retry.js:46-51`): continuation OPEN, wake with `owed = ROUTE`.
4. Drain: `kinds = ROUTE`, HANDOFF, binding unchanged (B was stored in step 2), early return. No read, no
   re-arm. Continuation stays OPEN with no timer; `owed` stays ROUTE.

Result: the "read unavailable, then recovery with NO other event" cell (table 10.6 "timer fires") is not
implemented for a handoff. A delegated sender whose custody was voided by the same rebind
(`repair.js:134-137`) is left with neither custodian nor timer. No witness covers a transient read failure on
a route change with no later event.

### F2. The bound resets on every qualified read, so send-side failures retry forever at 100 ms. INFERRED
`repair.js:157` calls `satisfyRetainedRepairRevalidation` (`read-retry.js:56-59`: `owed = NONE`, continuation
IDLE, window discarded) before the entry is presented. If the presentation then fails, `oweRetainedRepair`
arms from IDLE: a fresh 300 s window and `delayMs = max(100, 0 * 2) = 100` (`read-retry.js:32-43`).

Schedule: persistent uncommitted BACKPRESSURE/RESERVED (trigger LEDGER_COMMIT, `repair.js:408-411`), or a
remote disclaim after a successful read (`repair.js:399-402`), or a repeatedly lost answer
(`repair.js:372-375`). Each cycle is: read ok, present, fail, fresh window. One read plus one native
presentation every 100 ms per record, no backoff, never SPENT, never reported.

This contradicts brief B4 and ruling Q1 ("re-arm until first unavailable read + budget, then exactly one
`wait_bound_spent`"). The stated bound holds only for consecutive read failures. The Q8 BACKPRESSURE witness
passes because its backpressure clears.

### F3. A delegated sender that becomes ledger leader proposes without a contention read (A2 residual). INFERRED
`joinRetainedRepairDecision` (`repair.js:167-172`) binds, then presents UNFENCED with no read. If the binding
resolves LOCAL, `completeNativeRetainedRepair` skips the term check for UNFENCED (`ingress.js:88`) and calls
`submitNative`.

Interleaving: sender delegated to remote A; the local ledger replica becomes leader
(`resolveActiveLocalLedgerLeaderService` is true as soon as `service.isLeader`, creation-support `:220-231`);
before the scheduled activation queues ROUTE (`wake.js:152-156`), a caller or a blocker CDC row arrives with
CLEARING. Mode is JOIN (custody still DELEGATED at mode selection, `repair.js:105-106`), the rebind voids
custody, and one native proposal is made with unchanged BUSY. This is the "one redundant BUSY refusal per
route flap" of brief A2, through JOIN instead of HANDOFF. W3 and the blind-handoff mutant cover HANDOFF only.

### F4. A stale OPEN window makes a later transient failure SPENT at once. INFERRED
After the timer fires the continuation is OPEN and keeps its window. A decision that then ends on a
non-continuation reason (`ROUTE_UNAVAILABLE`, `UNQUALIFIED_BINDING`, `INVALID_ROW`, or F1's early return)
neither cancels nor re-arms (`repair.js:267-274`). A trigger arriving after the old deadline whose read fails
transiently reuses that window (`read-retry.js:32-33`), finds `now >= deadlineAt`, and goes SPENT with one
report and zero retries. This contradicts Q1 ("a fresh bounded window with its own single report").

### F5. The no-binding path hides the real reason and arms nothing. VERIFIED (code)
`confirmUnboundRetainedRepair` (`repair.js:191-200`) maps every outcome other than EXACT/CHANGED to
`ROUTE_UNAVAILABLE`, which `oweRetainedRepair` neither logs nor times (`repair.js:271`). So with no binding:
- `INVALID_ROW` and `UNQUALIFIED_SHAPE` are invisible (brief B4 requires them visible);
- a transient `READ_FAILED` on a present row gets no continuation, so the dispatch stays withheld until a
  route publication or another caller.

### F6. A table cell marked impossible is possible: G (DELEGATED) with an armed timer. VERIFIED (code)
Table 10.5 "timer fires: impossible I-T (the custodian owns the continuation)". At a REMOTE binding an
uncommitted native answer can carry custody: the receiver attaches it to any answer while it holds the
entry (`ingress.js:80-81`), the sender records it (`repair.js:331-333`), then
`retainUncommittedRepairAnswer` arms the sender's continuation for LEDGER_COMMIT (`repair.js:408-411`).
The sender is DELEGATED and ARMED; the receiver arms its own through the same line. Two continuations
re-present one entry. Safe (replay by entry id) but it is the second mechanism B1 forbids, and combined
with F2 both sides loop.

### F7. Custody's ledger term is attested and never used by the sender. VERIFIED (code)
`custody.ledgerTerm` is stored (`repair.js:366`) and only checked for positivity (`answer.js:77`). The binding
has no term (`replica-placement-owner-retained-repair-routing.js:64-73`). A tenure that ends by term only
(same replica demoted and re-elected, or A to B to A coalesced in the cache before the drain runs) releases
the receiver's ingress record (`wake.js:171-175`) while the sender stays DELEGATED: every later ledger
publication is a HANDOFF with an unchanged binding and returns at `repair.js:145`. Only a caller ends it, and
for an absent row the workflow lanes do not re-enter (gate comment, `operation-workflow-dispatch-reservation-gate.js:70-75`).
This is inside ruling Q2 as written (disclaim, route change, published incarnation change), so it is a
residual of the ruling, not a deviation; it should be decided explicitly.

### F8. Zero-row update arm: a deposed leader's presence becomes REINSERTED. INFERRED (schedule), VERIFIED (code paths)
Consumer: `replica-operation-repository-mutation-update-methods.js:593-600`.
EXACT needs `createdAt` equal and the desired update already satisfied (`repair.js:468-469`), so the stale
row must hold the post-update state. Schedule:
1. L1 (term 1) commits update U of operation X (S1 to S2, an operation without create admission or
   membership, e.g. REMOVE); the reply is lost.
2. L2 is elected; L1 is partitioned and has not stepped down.
3. On L2 the row of X is deleted or lost (the arm only runs when the authority read sees no row, `:569`).
4. The origin retries U: commits on L2 with zero rows; its authority read shows no row; the arm calls
   `repairRetainedOperation(X@S2)`.
5. The origin's cached ledger route is unpublished or ambiguous (likely during this very election):
   NO_BINDING. The gateway read reaches L1, which answers as leader with commit == applied; floors are 0 for
   a fresh record (`authority.js:74-79`). Row X@S2 is present: EXACT, `true`, REINSERTED, `persisted: true`,
   no write.

Consequence: the origin continues from S2 (for REMOVE, towards the physical dispatch) on an operation the
current ledger does not hold, and it skipped the native repair's contention and capacity evaluation that
the honest path (bound read ABSENT, then PLACEMENT_REPAIR) would have run. Not a duplicate ledger write; an
effect outside the ledger's exclusion, for as long as L1 answers.

Compared with base `0993265e5`: **better (narrower)**. The base accepted any leader for every fresh record,
route published or not (`0993265e5:record.js:16` `expectedOwner: null`, `0993265e5:authority.js:41-45`).
VERIFIED. Head accepts it only with no binding, and refuses OTHER_REPLICA. Compared with the intermediate
`1ede7a19d` (which read nothing when unbound): worse, as the author states. A stale binding that still names
L1 accepts the same read at every ref.

The author's proposed fence (the arm passes the witness position of its own absence read into the record's
floors, so an older presence fails `UNQUALIFIED_POSITION`) is sound for this schedule.

Dispatch gate consumer: the target's create admission is a CAS through the gateway on
(operation, SENDING, `updated_at`, `completed_at` NULL, no prior admission)
(`src/node/replica-create-admission-owner.js:547-576`), adopted only from a matching row (`:582-592`).
VERIFIED. The coordinator's own claim write passes through the zero-row arm, where a step-advancing update
reads CHANGED on a lagging replica and is refused, so that route does not reopen F8. INFERRED.

### F9. "All 30 cone reds are pre-existing" is established only against the draft tip. VERIFIED (lab outputs)
The comparison ref `0993265e5` is the unexecuted 14-commit draft of this same owner, not the merge target.
Spot check of six of the 30 in `w1-s2c-run4-cone97-a10a9cae3` and `w1-s2b-cone-attr-0993265e5-try2`: the
first failing case title is identical in both (reservation-file-backed-restart 25, replace-named-handoff 1,
replica-operation-repository 1, reservation-fail-closed-dispatch-gate 5,
coordinator-created-operation-progress 5, replace-real-group-scheduling 7). The author's claim is confirmed
as stated.

But `w2-final-23344cddc-focused` (the integration line itself) covers 14 of the 30, and five are **green**
there and red at head:
- `test/rebalancer/replica-operation-repository.test.js` (head: "divergence path recovers by re-inserting",
  `refused` instead of `reinserted`: the zero-row arm's own test)
- `test/rebalancer/replace-named-handoff-attempt.test.js`
- `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
- `test/partition/placement-founding-and-runtime-service-admission.test.js`
- `test/partition/placement-creation-terminal-replay.test.js`

Four of these test files were changed on the integration side after the merge base, so they may simply be
fixed there. `placement-creation-terminal-replay.test.js` is unchanged on both sides, so its difference is in
`src`. I could not attribute any of the five. Two more head reds are withheld dispatches through this
owner's gate ("restored authority dispatches exactly once through the existing gate": `[]` instead of
`[op-gate]`, in reservation-fail-closed-dispatch-gate and reservation-file-backed-restart); no
integration-line result exists for them in the retained outputs.

### F10. Evidence at the head sha
- Only the mirror file ran at `f42102c84` (`w1-s2c-run5-f42102c84/selection.json`). The retained set was
  last run at `a10a9cae3` (`w1-s2c-run3-a10a9cae3`). `a10a9cae3..f42102c84` changes one test file plus
  generated files, no `src`. VERIFIED. The evidence carries by that diff.
- Five of the six mechanism mutants were built on `d427d14ff` and not re-run on the head (stated by the
  author). The mutant commits exist locally and each changes only its stated site. VERIFIED.

### F11. Smaller items. VERIFIED (code)
- Null and undefined sentinels remain: `lastAnswer` can be `null` (`repair.js:319`, `:324`, `?.` at `:174`);
  the send port answers `null` for "no route"; `decideIncomingRetainedRepair` returns `undefined` as
  "record replaced" (`ingress.js:147`, `:121`); the route resolver returns one `null` for four causes
  (`replica-placement-owner-transport.js:28-43`), so the record cannot say why a route is unavailable.
- `lastDecision` is not reset when a decision starts. A joiner of an overlapping proposing decision that set
  none (a preparation refusal, `repair.js:290-298`) is answered with an earlier turn's value, possibly
  UNAVAILABLE (`ingress.js:105-107`). Edge of C1.
- `satisfyRetainedRepairRevalidation` clears all of `owed` after any qualified read, not the bits that read
  covered (B3 as written). It works by mode priority; an ENTRY bit combined with CLEARING is resolved later
  through `repair.js:228-239`.
- The send re-resolves the route (`rebalance-coordinator-operation-creation-support.js:290-299`) instead of
  using the decision's binding. A change between bind and send is handled as a non-matching answer, so it is
  safe, but there are two resolutions per decision.
- Table 10.2 says a PENDING reply without custody leaves the sender "owing CLEARING"; the code owes nothing
  (`repair.js:528-529`).

## 1. Required corrections

| Item | Status | Where |
| --- | --- | --- |
| A1 route from the cache; port required | done | `repair.js:132-141`, `wake.js:75-81`, `repair.js:44-59` (typed `retained_placement_repair_port_missing`) |
| A2 handoff evaluates contention | partly | HANDOFF at LOCAL reads CURRENT (`repair.js:151-152`); JOIN at LOCAL proposes blind (F3) |
| A3 custody tenure | partly | boot incarnation + SERVICES `created_at` + ledger term (`ingress.js:164-178`, `answer.js:68-78`); cleared on disclaim (`repair.js:365-367`, `:399-402`); term unused at the sender (F7) |
| A5 no classifier mutation | done | binding written only at `repair.js:139` and `ingress.js:129`; observers only queue (`observation.js:32-34`) |
| B1 one continuation | done, with F6 | the record's timer (`read-retry.js:26-53`) is the only timer in the owner; G+ARMED duplicates it across sender and receiver |
| B2 trigger not overwritten | done | `repair.js:263-276` |
| B3 clear only satisfied bits | partly | F11 |
| B4 typed, bounded, visible | partly | reasons `authority.js:25-35`; bound `read-retry.js:34-40`; F2, F4, F5 |
| B5 cancel on retirement, shutdown | done | `repair.js:253-258`, `:533-541`; `replica-operation-repository.js:557-560`; `wake.js:171-180`. No replacement path exists |
| C1 no reuse of UNAVAILABLE | done, edge in F11 | `ingress.js:99-123` |
| C4 joiner inherits only proposing modes | done | `record.js:15-16`, `repair.js:78-85`, `:167-186` |
| Record shape | partly | named states in `record.js:61-73`; sentinels in F11 |
| Fixtures | partly | one witness drives the real publishers through a real `CDCHandler`, with a store double and synchronous delivery (`test/partition/placement-retained-real-publication.test.js:32-53`); its conformance assertion checks the leader sequence and "no leader role", not deep-equal rows as ruling Q7 asked (`:108-113`); no `raft_role: 'leader'` partition row remains in the retained fixtures |

## 2. State/event table

| Cell | Code | Result |
| --- | --- | --- |
| route change during a decision | queued, applied by the next decision (`wake.js:109-121`) | implemented; lab W9 green |
| read unavailable, recovery, no other event | CLEARING owed: implemented (W6 green). ROUTE-only owed: not implemented | F1 |
| disclaim, unchanged route tuple | reply without custody gives SELF + continuation; NOT_LEADER at REMOTE is the disclaim | implemented; unbounded after a successful read (F2) |
| retirement or shutdown with an armed continuation | cancel at every retire and at shutdown; callback fenced by handle and record identity (`read-retry.js:47`) | implemented; W8, B5 green |
| real release during an outage | trigger untouched, events decide at once | implemented; W7 x3 green |
| queued LEADER observation during backoff | never diverted (`observation.js:38-42`) | implemented; Q9 green |
| impossible cell that is possible | G + timer fires | F6 |

## 3. Presence/absence rule

(a) Consumers: dispatch gate fenced (F8, last paragraph). Zero-row arm not fenced; schedule, consequence and
comparison in F8.

(b) CHANGED with no binding: no durable effect and no proposal, so it is safe. It does retire the record on a
read that may come from a lagging replica: an older version of the same row reads as CHANGED
(`repair.js:468-470`), the record is dropped, and nothing is left owed to the route. Equal to the base.
Liveness only. A tighter rule would settle CHANGED without a binding only on a `createdAt` mismatch.

(c) Liveness with no binding: yes, an unlucky steady state keeps the route unresolved indefinitely, for
example two ACTIVE ledger endpoint rows for the leader node, or a leader whose endpoint row never arrives
(`replica-placement-owner-transport.js:33-41`). Only presence settles; an absent row is never repaired from a
remote origin. The only wakes are a ledger PARTITIONS/SERVICES publication that resolves the route, or local
leadership start. No timer, no report, no log. Callers re-read but cannot settle absence.

(d) `UNQUALIFIED_BINDING`: the obligation survives (`owed |= kinds | ROUTE`, record kept,
`repair.js:269-270`). It is **not bounded and not visible**: no timer, no log, no spent-bound report. The
read is routed by the control-plane gateway, not by the cached route
(`replica-operation-repository-read-methods.js:133-141`), so the two can disagree in either direction. When
the cache is right and the read was served elsewhere, no publication follows; only a caller ends it.

## 4. Custody and tenure

Identity: bound node and replica, the node's published boot incarnation, the replica's SERVICES
`created_at`, the receiver's ledger term. All existing identities, none coined. VERIFIED.
Receiver restart with an unchanged tuple: a NODES row with another boot incarnation queues ROUTE
(`wake.js:78-80`), the binding differs, custody is voided, the entry is re-presented. Lab: "W5 a receiver
restart on the same node, replica and address" ok 2 in `w1-s2c-run3-a10a9cae3`, red in
`w1-witness-run2-8eba5f745`. VERIFIED. Not confirmed: which member discriminates in that witness; the author
states both boot incarnations are `null` in these fixtures, so the boot member is exercised by no witness.

## 5. Timers and retries

| Mechanism | Bound | Cancelled |
| --- | --- | --- |
| record continuation (`read-retry.js:46`) | 100 ms doubling to 1 s inside a 300 s window, then SPENT and one report | retirement, tenure release, shutdown, any qualified read. Defects F1, F2, F4 |
| preparation delivery (`replica-placement-owner-retained-repair-routing.js:15`) | 5 s | by the transport |
| repair delivery (creation-support `:296-298`) | 5 s | by the transport |
| drain loop (`wake.js:109-121`) | one decision per record per pass; stops at shutdown | no spin found; the one self-wake (`repair.js:405-407`) needs a real release in flight |
| caller and ingress re-entry (`repair.js:84`, `ingress.js:109`, `:122`) | each pass awaits one decision | fenced by shutdown |

Nothing fires after shutdown: timers cleared, wakes unbound, map cleared, every post-await step fenced
(`repair.js:247-250`). VERIFIED (code).

## 6. Probes and silent defaults

Inside the owner's files: none beyond the author's census (grep VERIFIED): the construction check
(`repair.js:51`), the unbind lookup (`wake.js:208`), the gate's optional logger
(`operation-workflow-gate-operation-row-repair.js:19`).

Outside, affecting this owner in production wiring:
- the gate's `catch` turns any throw inside the owner into "withhold", logged only if a logger exists;
- `resolvePlacementLedgerRoute` returns no route for a missing cache; a router without `deliver` means no
  route (`replica-placement-owner-transport.js:29`, `:48`);
- `membershipOwnerBootIncarnation` falls back to `null` (`rebalance-coordinator-lifecycle.js:361-362`) and the
  sender's snapshot to `null` without a NODES row: `null === null` matches custody without a boot member.

The `onCacheChange` probe (`rebalance-coordinator-lifecycle.js:534-539`) does not affect production (the real
cache has it) but 139 test files use `createMockCache`, which has none, so they run with no ROUTE or own-row
wakes. I could not determine whether any passes only for that reason; that needs execution.

## 7. Witnesses and mutants (retained lab outputs)

| Required witness | Test | Red on | Green on |
| --- | --- | --- | --- |
| 1 A-B-A stale notification | publication 1 | guard; lost-wake mutant `80826174e` kills publication 2 and real-publication (`w1-s2b-mutant-lost-wake-a1`) | `w1-s2c-run3-a10a9cae3` 6/6 |
| 2 publication orders, ambiguous | publication 2-4 | same mutant | same |
| 3 unchanged BUSY, zero proposals | publication 5 | `w1-witness-run2-8eba5f745` | same |
| 4 visible winner | leadership 4 | guard | 5/5 |
| 5 restart, disclaim | continuation 1-3 | 1-2 red on `8eba5f745` | ok 1-3 |
| 6 transient and permanent failure | continuation 4-5 | permanent red on `8eba5f745`; transient is a guard | ok 4-5 |
| 7 trigger unchanged, three paths | continuation 6-8 | red on `8eba5f745` | ok 6-8 |
| 8 retirement, shutdown | continuation 9-10, B5 (21) | guards; uncancelled-timer mutant kills B5 | ok |
| 9 queued observation joins | publication 6 | red on `8eba5f745` | ok |

Mutants, each confirmed in its output directory: lost wake, blind handoff, reused unavailable, overwritten
trigger, uncancelled timer (on `d427d14ff`), stale custody (`308a8e348` on `551c574ec`), presence from another
replica (`30619e5e7`: mirror 5 and 6 red), absence from another replica (`c79fb9f02` on `f42102c84`: mirror 6
red). Head mirror run: ok 1-7, 9, 10; not ok 8 (the re-drive, by design).

Missing: no negative witness for NO_BINDING presence from a deposed leader (accepted by design, F8); no
witness for F1, F2, F3, F4.

## 8. Re-drive gap

The gate (`operation-workflow-dispatch-reservation-gate.js:136-143`) skips on `false` and holds nothing. The
branch does not change that file, so the gap is the same at `0993265e5` and at the merge base. VERIFIED (diff).

What the retained owner should expose, without becoming a scheduler: one edge-triggered notification at the
single retirement site (`retireRetainedRepair`, `repair.js:253-258`), carrying the operation identity
(`operationId`, `createdAt`) and a named outcome: CONFIRMED (EXACT) or UNCONFIRMED with its reason (CHANGED,
definite refusal, permanent refusal). Emit it only for a CALLER-origin record that has answered `false` to a
caller, once per record, synchronously, with no timer and no retry. Not on shutdown, not on tenure release
of ingress records, not on SPENT (that is not a settlement). The workflow owner's fenced per-operation entry
decides whether to dispatch.

## 9. Merge risk

Both lines changed 12 source files since `812dd3a1b`. The integration side's changes to the owner come from
`e9de22eb1` and `e833efd56`; the draft composed equivalents (`533a861b0` names `e833efd56`).

1. `src/rebalancer/replica-operation-repository.js`: integration (`2f4089f1b`, `16300e756`) made the
   structured mutation port required and removed the SQL constants and the ingress check; the branch adds
   nine lines (drain, release sequence, continuation policy). **Keep the integration file and add the nine
   lines.** Taking the branch file reverts the required mutation port. The branch's 22 bare-repository test
   fixtures need both port sets.
2. `repair.js` with `authority.js`, `ingress.js`, `record.js`, `observation.js`: integration has `e9de22eb1`
   (outward custody pin, older draft with the role-keyed wake); the branch rewrites them. Take the branch.
3. `src/partition/partition-placement-admission.js` (W1b's file): integration moved the pause check after
   the settled-entry replay (6 lines); the branch's draft removed about 127 lines and already has that order
   (`f42102c84:` leadership at `:120`, pause at `:134`). W1b's own branch also changes it: a three-way merge
   that W1b should own.

`replica-placement-owner-transport.js` and `rebalance-coordinator-operation-creation-support.js` are
identical on both sides. `replica-operation-repository-mutation-update-methods.js` (the zero-row arm) changed
only on the integration side (135 lines); it still calls `repairRetainedOperation`
(`23344cddc:` `:578`), so F8 applies after the merge.

## Conditions before the three-node acceptance run

- C1. Repair F1: an owed ROUTE must reach a read; the unchanged-binding shortcut applies only to a pure hint.
- C2. Repair F2 and F4: one window per episode of unavailability, not reset by a read that is followed by a
  failed presentation, and reset on every exit that leaves the continuation OPEN.
- C3. Repair F3 (JOIN at a LOCAL binding reads contention first) and add its counted witness.
- C4. Decide F8 (fence the zero-row arm with the position of its own absence read) and F7 (term-only tenure
  end) explicitly; decide whether F5 and 3(d) need one report when a record stays route-owed past the budget.
- C5. After the merge, run the 97-file cone on the merged head and compare with `w2-final-23344cddc-focused`:
  no file green there may be red. Attribute the five in F9 and the two withheld-dispatch reds.
- C6. Re-run the six retained files and the six mechanism mutants on the merged head.

## Author claims I could not confirm

- "None of the 30 cone reds was introduced": true against `0993265e5` only (F9).
- That W5 restart discriminates through the boot incarnation (section 4).
- That no `createMockCache` test passes only because a wake is absent (section 6).
- That `service.isLeader` is already false when the leadership sink is driven on demotion (I read the drive,
  not the assignment).
- The first-bad attribution of the four stage-2c regressions to `95ee6ee4a` (I read the head results, not the
  bisect outputs).
