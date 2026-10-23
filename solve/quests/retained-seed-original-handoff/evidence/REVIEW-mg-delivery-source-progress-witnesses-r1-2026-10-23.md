# Source-progress component witness review, revision 1

Verdict: **APPROVE for the stated source-component witness scope**. This is an
independent source review of the test, not runtime evidence, production approval,
native acceptance proof, or closure of the composed S2/W7 requirement. No material
test defect was found in the frozen candidate. Runtime and semantic mutation
measurements remain required before claiming the corresponding behavior proved.

Reviewer: `subagent:/root/retained_effects_tests`. Author: root. The reviewer did
not author this test. Review was read-only except for this new evidence record;
no tests, source, metadata, lab requests, or commits were changed.

## Frozen scope and authority

- Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
- Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a` plus the explicitly dirty
  implementation candidate; base HEAD alone does not identify the reviewed source.
- Test: `test/partition/partition-cdc-delivery-progress.test.js`, 242 lines,
  SHA256 `c526bf87363a7d4e22733576a077929ec99814d2088d1b6773c6bb36ad1e8eb6`.
- Design: `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`, approved SHA256
  `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`, especially
  lines 944-1051 and 1053-1114: exact weak/native coverage, currentness, fair
  continuation, discard on weak release, and debt remaining until source apply.
- Syntax, normal ESLint and complexity-12 success are author-reported. This
  reviewer ran no runtime or static executable checks; inspection verified the
  frozen hash and the owner call paths below.

Relevant source bytes observed during review:

| Path | SHA256 |
| --- | --- |
| `src/partition/partition-cdc-obligation-delivery.js` | `ed2af6e5f1569e5b8bfda670f5caf2a3e9d3376edbae25d0988ed7579e716d53` |
| `src/partition/partition-cdc-obligation-progress.js` | `8dace6bd5df8783054cfa010cc0914537063d6cfcdb2835c060d0893f22b8fbf` |
| `src/partition/partition-cdc-delivery.js` | `b75ef5ef010b68524735c549389160f9f739f2e4ff23da7b5ea6e1afe170851e` |
| `src/cdc/cdc-delivery-invocation.js` | `227f1320c10c1a553e3b2f0bf8237d09932acfd13c856da47eeb8c1844211d21` |
| `src/bootstrap/shared/partition-cdc-propagation-subscriber.js` | `de52f294d0746f880215cfc9eb83bf28844afccede214a192d3af022e24bb243` |
| `test/test-helpers/participant-transaction-fixture.js` | `48c385ffd2ac0df93214af165feb608e679c566faa09b41f473f4a688e5a3e53` |
| `test/test-helpers/controllable-consensus-port.js` | `8072274aa39775f8d4a6b57e242f11d859737ff9f064d3e97ce24f426ca12221` |

## Setup and exact delegation

The source rows at test lines 52-59 use `committedQueryOf` and the existing
controlled committed-entry seam, rather than directly inserting obligation rows.
`ControllableConsensusPort.commit` (lines 121-132) calls
`applyCommandThroughApplicationOwner` (lines 54-73), which round-trips the actual
proposal codec and uses `applyCommittedEntryTransaction` with the actual durable
store. The application creates data and CDC debt together; the ordinary source
recording owner is `partition-cdc-obligation.js:123-168`. This is faithful controlled
application evidence. It does not prove ordinary `executeQuery` admission or real
consensus commitment. The file states that limitation at lines 1-3 and 46-49.

The existing leader fixture performs its controlled membership/release setup
(`participant-transaction-fixture.js:433-447,488-530`). The test then uses the
controllable port's actual role event, not direct mutation of a production lane,
to become follower before subscribing and applying all initial rows (85-100).
Actual demotion/leadership minting is wired through
`replica-leadership-state.js:62-102,153-178`. Handshakes are genuine
`subscribeToCDCWithHandshake` calls; they run while follower and before those rows.
No subscription driver can capture an incomplete initial tail in this setup.

I specifically checked the possible hidden first subscriber visit on reentry to
leader. The existing fixture retains three configured `replicaIds`
(`participant-transaction-fixture.js:61,379-388`); its controlled committed
membership facts do not replace that array. Accordingly leader activation is not
the single-replica immediate path
(`partition-service-leader-activation-methods.js:90-119`). The nonzero holdoff
runs on the supplied delayed clock (`leader-activation-gate.js:82-90`), whose
scheduler is never advanced. Thus the `LEADER_ELECTED` drive at
`partition-cdc-delivery.js:134-136` does not secretly advance the cursor before
the first explicit test drive. This initially suspected defect is ruled out for
the frozen fixture. Changing the cohort or activation schedule requires revisiting
this setup; the literal expected callback sequence is sensitive to that change.

The subscribers at test lines 61-83 use the actual shared factory, wrapper,
handshake state and source drive. Only selection/readiness and recipient semantic
answers are controlled. The factory calls the controlled propagation callback
with the genuine private invocation (shared subscriber lines 228-246); it validates
the answer before committed completion hooks. No transport or native response is
fabricated as production evidence. The selected recipient objects remain stable.

The SQL instrumentation at lines 192-209 delegates the original `prepare` and
`statement.all` with the original receivers and arguments, then records only
limit/count. It changes neither rows nor SQL and restores the method in teardown.
It observes the actual owner query `SELECT_OWED_AFTER`; it is not a whole-process
heap or alternate-query detector. The metadata-cell sentinel assertion likewise
checks this retained cell, not every indirect object reachable in the process.

## Witness schedules and meaningful controls

1. **Fair continuation and actual-clock expiry (117-153).** Subscriber 0 supplies
   valid weak coverage while live. Subscriber 1 advances the observed clock by
   the entire remaining duration, with timer callbacks withheld. Its answer must
   not add coverage. Subsequent manual owner drives must give subscriber 2 a
   turn, revisit expired subscriber 1 while live, and hold later row B until the
   last uncovered branch supplies weak coverage. The exact visit vectors, no-B
   assertions, hook count, pending-ACK count and actual ledger counts jointly
   prevent a mere fulfilled callback from becoming coverage or delivery. The
   expected sequence follows `nextCdcSubscriber` (progress owner 59-63), actual
   clock checks in invocation `run`, and `deliverObligation` (464-488).
2. **Mixed coverage, fresh rescan and source apply (155-190).** One controlled
   committed branch runs its hook/tracking; weak branches do not. Aggregate
   delivered metrics and ACK state remain unchanged. Weak release discards the
   cell; a fresh pass must invoke all three branches again. Fully committed
   controlled answers only queue the source ACK. The real ACK command is obtained
   from the proposal owner, ledger debt is asserted before apply, and controlled
   application of that exact command is the point at which delivered rows change.
   `flushCdcAcknowledgements` and `proposePendingAcknowledgement` (delivery owner
   312-391) are not replaced. The phrase "native" in this test name denotes the
   controlled canonical native-result category; it is not a measured MG commit.
3. **One payload, finite scheduling quantum and tail (211-242).** The initial
   ledger contains 257 actual application-created rows. During the first callback,
   another actual committed QUERY appends a late row. Reads are observed to request
   one payload, the first explicit drive yields at 256 visits, the second completes
   the captured tail without the new row, and the ordinary next scan reaches it.
   The application-triggered nested drive follows the real single-flight path;
   it is not a second harness loop. All rows remain owed. This is a finite-prefix
   and read-shape witness, not a maximum total debt or event-size restriction.

The following are source-semantic negative controls to measure, not measured
mutation results from this review:

| Mutation | Required behavioral discriminator |
| --- | --- |
| Trust timeout callback alone and accept subscriber 1's expired answer | First test's later visits differ; late coverage avoids the required live revisit. |
| Restart each attempt at subscriber zero / lose continuation | First test's exact second and third visit vectors fail; the later branch loses its turn. |
| Treat an unknown/unvisited branch as weak coverage | B appears before `releaseLast`, or debt/pending-ACK assertions fail. |
| Run committed hooks/tracking for provisional answers | Hook count or per-subscriber last-delivered assertions fail. |
| Retain mixed receipts after weak scan release | Fresh-pass callback sequence or null-cell assertion fails. |
| Mark delivered on canonical completion or proposal before source apply | The actual owed/delivered ledger assertions before apply fail. |
| Hydrate a page of 256 event bodies before awaits | Recorded SQL limit/count fails against one-row assertions. |
| Recompute/extend the pass tail when the late row commits | The second drive includes the late row or exceeds the expected 257 callbacks. |

These controls must reach their named semantic assertion. Setup/import failures
or an outer timeout are not a valid red measurement.

## Nine-category disposition

1. **Admission / gating:** component scope is explicit. Actual follower role holds
   automatic initial delivery; controlled selection readiness is a test input,
   not an original-opening grant. Row and ACK application use the real owner.
   Public ordinary SQL admission and protected activation remain outside this test.
2. **Recovery / replay:** the second test proves required *attempted* fresh rescan
   and no volatile weak/native progress promoted to durable completion. It does
   not simulate a process restart, native replay or ledger unreadability; those
   are not claimed. Source-owned owed rows remain the authority throughout.
3. **Owner interaction:** actual application -> ledger -> delivery -> shared
   subscriber -> controlled canonical result -> actual source ACK application is
   connected in the same witness. The test does not implement a second semantic
   validator. Expected visit order and durable counts are independent behavioral
   assertions; direct private-cell reads supplement rather than replace them.
4. **Harness fidelity:** controlled consensus/recipient boundaries are named;
   complete source rows, HLC and event identity come from the application. Timer
   starvation is deliberate and does not shorten any production response budget.
   The three-replica delayed-activation premise was traced above. Runtime is still
   required to confirm engagement and the exact schedule.
5. **Transport / delivery / wake:** no router stub, ACK wrapper, local-handler
   transport or remote clock is modeled. Canonical answers are explicit inputs.
   The test proves neither transport timeout nor automatic wake/retry firing.
   Manual calls enter the real `driveCdcObligations` operation rather than a private
   alternate retry implementation.
6. **Concurrency / serialization:** each propagation callback asserts no open
   SQLite transaction. Late-row application during a callback exercises actual
   reentrant drive admission (delivery owner 642-670), while response awaits use
   the actual invocation. Held raw children, tenure replacement and independent
   topology waves remain other witnesses' obligations.
7. **Formation circularity:** A/B are an abstract ordering witness only. A's final
   uncovered branch prevents B; complete weak coverage lets B run without source
   ACK. There is no claim that B actually repairs a missing native route or that
   a real formation cycle closes. That remains S2/W7 native composition.
8. **Retry loops:** multiple direct drives demonstrate fair metadata reuse, weak
   release and fresh rescan. Timers are deliberately not fired; retry cadence,
   suppression and event-driven eventual release are not measured. No timeout or
   iteration limit is raised, and no new retry owner is introduced by the test.
9. **Sweep / timer:** the clock deliberately separates elapsed time from callback
   execution, so late fulfillment cannot rely on a timer having fired. All timers
   are cleared through their creating clock. Test teardown calls the existing
   aggregate-error-preserving `shutdownAll` (fixture 790-802); production shutdown
   retires invocation/lane, awaits pending CDC work and closes persistence
   (`partition-service-lifecycle-methods.js:159-220`). Recipient promises are
   finite here, so the fixture does not leave an intentionally held child behind.

## Remaining evidence

The author may proceed to the exact reviewed runtime candidate without changing
the witness scope. No current runtime, native acceptance, semantic mutation kill,
full source/transport approval, S2/W7 composition, Quest landing or merge conclusion
is established by this review. Source/test changes affecting these seams require
appropriate delta review and newly identified runtime bytes.
