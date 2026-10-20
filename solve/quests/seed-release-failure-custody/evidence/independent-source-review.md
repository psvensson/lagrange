---
audience: development
documentClass: evidence
---

# Independent seed failure custody source review

Date: 2026-10-20.
Reviewer: `subagent:/root/control_source_review`.
Comparison: frozen working source against
`63420a1a5d6ec3564027275ddf35369edb128983`.
The reviewer read source, witnesses, contracts and existing run artifacts;
no source or test edits, tests, staging or commits were performed.

## Exact reviewed files

| File | SHA-256 |
| --- | --- |
| `src/bootstrap/bootstrap-service-runtime-methods.js` | `d1fe96117414f9049e3247dff6820e817030024482efcc507c541d3e160feb69` |
| `src/bootstrap/bootstrap-service-seed-delegates.js` | `5f84fcff07fa1736d6ed08c90ba29dc269a83e748e9d494cf86150a83691445f` |
| `src/bootstrap/bootstrap-service-seed-workflow.js` | `c3086b9191aa8e9bf0e9353907dea2b84fe003276212481d308a0e8b01d04504` |
| `src/bootstrap/owners/seed-runtime-bridge-owner.js` | `48e322311703f199bc050d1c9d7de9cfe536077720984f7a4847f7fa92966844` |
| `src/bootstrap/phases/seed-cleanup-handler.js` | `c17a66322ae947cfa8d303aa7b2318a37fac9f268b41d53ab60b018d648e0cf9` |
| `src/bootstrap/pipeline/seed-startup-plan.js` | `f4a18a1fce24d98c64fa3366be19fc2a5620eb08be836a33b135a4f30b02d947` |
| `test/shards/impact-contracts.json` | `787f25166201a7d05e596913a9165ab310c361c1a4b9aaa2c5baa12a1962f3c4` |

**Verdict: APPROVE for the declared repaired-candidate measurement.**
There are no actionable source findings in this complete review round.
This approval is conditional on the exact candidate's positive native and
focused results, engaged semantic negatives, unchanged-owner regression
checks and applicable gates. It is not Quest closure or release acceptance.

The source patch follows the previously reviewed bounded design:

- Registration now acquires CDC, state machine, SQL and handler, and performs
  participant release inside the actual registration phase callback.
- Failure returns and the FAILED event expose the same frozen cleanup
  observation alongside the unchanged primary error.
- Cleanup attempts a captured service-map cohort, retains failed entries,
  and discharges only an entry still naming the successfully closed object.
  Message-group handler retirement follows that object's successful shutdown.
- SQL shutdown retains its captured references on failure and discharges
  bootstrap, bridge and captured CDC references by exact engine identity.
- Bootstrap shutdown joins its current attempt, retains fulfilled completion,
  and clears only its own rejected attempt for a subsequent caller.

## Complete operation

Actual BootstrapService startup remains the trigger. Existing virgin or
retained admission, current control release, native committed origin,
membership and placement remain the authoritative facts. The permitted
change is cleanup accounting and continuation, not serving admission.

The native application transaction still owns ENABLE's durable origin.
Expiry still refuses the unfinished release; cleanup does not cancel that
origin. Failed shutdown leaves the exact native object and connection with
existing lifecycle custody. A later top-level shutdown invokes those same
owners after the underlying close becomes possible. Retained startup must
still acquire current membership and SERVICES authority before reaching
release recovery; missing SERVICES remains an explicit frontier.

## Category-complete source assessment

Each numbered item corresponds to its declared verification template.
Paths abbreviated below are under `src/bootstrap/` unless otherwise stated.
The exact baseline witness assessment is in `independent-witness-review.md`.

### Admission and gating

1. No new precheck or placement enforcer is introduced. The real retained
   read and refused creation remain exercised by
   `test/bootstrap/seed-release-failure-custody.test.js:174-198`.
2. Release refusal remains the primary failure at
   `bootstrap-service-runtime-methods.js:166-217`; cleanup outcome is an
   additional observation, not a transient-to-success classification.
3. `pipeline/seed-startup-plan.js:33-48` moves the existing operation without
   changing its 3000 ms release budget. The native witness asserts that bound
   at lines 70-89; no new wait or timeout is added.
4. `phases/seed-cleanup-handler.js:181-185` uses existing CLEANUP_RESULT
   values and freezes the result and step map. Runtime lines 195-216 forward
   the same value to the FAILED event and failure result; native lines
   110-123 assert both boundaries.
5. Restored native close followed by a new explicit shutdown call releases
   cleanup custody through runtime lines 389-435. This is not OPEN admission;
   native lines 142-160 assert cleanup only.
6. Service deletion rechecks identity after awaited shutdown/retirement at
   cleanup lines 612-633. SQL reference release rechecks each identity at
   lines 594-597, delegates lines 393-395 and bridge lines 69-70.
7. Existing per-service warning records retain replicaId and original error
   at cleanup lines 624-629; the AggregateError retains all failed errors.
   A remaining current map produces explicit pending cleanup even without a
   thrown old-close error. It does not claim which successor caused it.

### Recovery and replay

1. The patch creates no recovered rows, registry or authority. Successful
   old completion cannot delete a replacement map object (cleanup 618-619)
   or engine reference (cleanup 594-597; delegates 393-395; bridge 69-70).
2. Same-instance shutdown retry is distinguished by the current promise,
   not a restart claim (runtime 389-435). Actual restarted construction
   remains separately measured by native test 174-198.
3. Cleanup snapshots every current entry at cleanup 612. Empty completed
   cleanup remains legal; positive original native inventory and actual
   origin exclude an empty release fixture (native test 70-107).
4. Underlying shutdown owners retain their existing idempotence. The
   bootstrap promise keeps fulfilled completion, while failed attempts
   retry the retained object. Focused shutdown test 92-127 measures joining
   and completed idempotence; lines 131-165 measure old/successor discharge.
5. A nonempty retained store without SERVICES remains refused in native
   test 174-198. Neither a frozen cleanup result nor STOPPED becomes proof
   of durable absence or authorization to reopen.

### Retry and re-drive

1. Runtime 427-434 removes the permanently cached rejection only when it
   still names that attempt. Native test 142-158 demands the restored close
   actually execute through a subsequent top-level call.
2. No polling loop or evidence-based retry budget is added. One explicit
   call admits at most one current cleanup attempt.
3. Success emits SHUTDOWN after cleanup; failure rethrows the exact error
   (runtime 423-434). Failed-bootstrap cleanup reports per-step ERROR while
   continuing later steps (cleanup 153-156 and step catch blocks).
4. Retry does not wait for serving, CDC propagation or SERVICES publication.
   It directly calls the existing cleanup owner; automatic retained startup
   still has a separate unsatisfied authority prerequisite.
5. Concurrent callers share the in-flight attempt (runtime 389-391);
   there is no new timer or automatic retry storm. The explicit caller can
   request another attempt only after rejection has settled.
6. Late success discharges exact identities, not names alone. Focused
   shutdown test 131-165 and 205-238 cover old completion and replacement.
7. Transport acknowledgement does not reset anything. Only awaited native
   cleanup success permits object discharge; only full cleanup fulfillment
   remains cached as top-level completion.

### Transport and delivery

1. No ACK classifier is changed. The native witness requires OBSERVED with
   matching native origin before treatment (test 78-85).
2. No response waiter, cancellation or late-response path is changed.
   Original committed origin remains intact across the refused attempt.
3. Added cleanup shape is local result/event observation; it is not a router
   delivery outcome and is not passed off as DELIVERED or retry permission.
4. Message-group retirement invokes the existing exact retirement owner at
   cleanup 648-654. That helper requires a valid retirement outcome at
   `shared/message-group-transport-handler.js:44-60`; refusal is retained as
   cleanup failure rather than swallowed.
5. The native fixture uses the real router and original delivery once, as
   recorded in the approved witness review. The phase/single-flight tests
   intentionally measure local owner mechanics, not network delivery.

### Sweep and timer

1. No timer or sweep is introduced. Runtime 397-415 preserves existing
   deferred-start cancellation and event-loop yield.
2. No role, quorum or release authority test is weakened. Cleanup cannot
   create an origin or grant serving admission.
3. Only the failed current shutdown promise is cleared; native owner state
   is not reset to simulate successful close (runtime 430-434).
4. The phase move preserves the original release-bound computation and
   participant deadlines. Native expiry remains a handler-clock treatment;
   the run is not an elapsed startup performance proof.
5. Cleanup calls native lifecycle and exact handler owners directly; it does
   not add a CDC/readiness-dependent sweep that could wait on itself.

### Concurrency and serialization

1. Runtime assigns the in-flight promise before yielding control to another
   ordinary caller. The focused test explicitly gates cleanup and joins
   concurrent shutdown callers (test 92-127).
2. After awaits, map and all three engine discharges compare captured
   identity. Message-group retirement also consumes the captured service's
   exact handler and lane (`shared/message-group-transport-handler.js:44-59`).
3. The change introduces no new claimant of release or physical shutdown.
   Bootstrap orchestrates existing lifecycle owners and joins one attempt.
4. Existing release recovery can interleave until the handler's canonical
   shutdown stops it. No new timer invokes cleanup; the native witness
   records unrelated traffic without confusing it with the selected attempt.
5. Promise scope is one BootstrapService, map discharge is exact object
   within replicaId, and SQL discharge is exact engine. Those scopes match
   the resources this patch actually owns.

### Formation circularity

1. Acquisition/release now run in the existing registration phase callback
   (plan 33-48), before registration metadata publication. This intentionally
   changes the scheduler and event boundary, not the underlying authority.
2. Cleanup retry needs neither completed SERVICES registration nor full
   serving readiness. The retained-bootstrap refusal remains independently
   recorded rather than bypassed.
3. Expired bootstrap still fails; no new client operation is admitted during
   this window. Native test 91 and 174-198 cover closed admission and restart
   refusal.
4. The source adds no new budget. Baseline's real seed elapsed 118 ms and
   forced handler expiry prove ordering, not natural startup margin.
5. Source census of `workClassScheduler` in bootstrap/node/partition/
   transport finds this BootstrapService scheduler used at executePhase
   (`bootstrap-service-seed-workflow.js:574`), with its construction at
   `bootstrap-service.js:238`; NodeJoining has its own default scheduler.
   Release/native paths do not enqueue back into that BootstrapService
   scheduler. No second authority is introduced to break a hypothetical
   cycle.

### Harness fidelity

1. Baseline 63420a1a5 reaches named phase and cached-rejection failures after
   real native engagement. Later assertions in the first failing child are
   not retrospectively counted as baseline measurements.
2. Native BootstrapService, router, SQL/CDC and SQLite are actual owners.
   Focused engine and scheduler doubles are explicitly narrower mechanism
   witnesses; their positive results cannot substitute for the native child.
3. Original 3000 ms budget remains unchanged; only the handler clock changes
   after real ENABLE. This does not certify natural timeout frequency.
4. Actual release requests and retained storage readers supply their fields;
   no origin, admission or SERVICES record is authored by the witness.
5. Real nonempty inventory, committed origin, close calls and retained open
   native DB precede the semantic assertions (native test 70-107).
6. The complete live observable is BootstrapService entry on the locked
   native run. Public entrypoint/process-lock custody, cross-host quorum and
   automatic partial-seed recovery remain outside the measured claim.

### Owner interaction

1. Bootstrap cleanup owns orchestration/discharge; native lifecycle owns
   physical close; release admission and SERVICES placement retain their
   existing sole owners.
2. Frozen CLEANUP_RESULT is an observation of step results. Existing
   AggregateError and exact underlying failures retain pending custody;
   no boolean option or parallel completion algorithm is introduced.
3. The paired native witness combines immutable origin, refused release,
   failed cleanup and successful same-owner retry. Repaired green and
   controlled negatives remain required; baseline alone is insufficient.
4. Restored close must replace the stale rejected-promise veto through the
   same shutdown path (native test 142-158), without treating later teardown
   as proof of that assertion.
5. Existing single-flight and native failure deferral remain binding.
   No force option, extra timer, deadline extension or admission bypass exists.
6. The real environmental change is close becoming possible; explicit
   top-level shutdown is the canonical retrigger. A retained-store startup
   cannot substitute for completing old cleanup.
7. Failure result, FAILED event, cleanup summary and STOPPED remain
   projections. None is consumed as permission to reopen or delete files.
8. Baseline source/test fingerprints and named failures are preserved in the
   companion review. Exact repaired-source negatives remain unexecuted at
   this review and must not enter the positive population.
9. The touched callers add no raw origin read, placement synthesis, force
   flag or alternate retry loop. Existing lower-owner witness teardown is
   explicitly excluded from the top-level retry proof.
10. The existing runtime/application interaction registry adds all six
    changed owners (workflow was already present), the four bounded
    witnesses and the cleanup/restart description in contract and pair.
    This rides with the product Quest; it does not redefine prior U1 seals.

## Boundaries retained by this approval

The snapshot/map identity check prevents successful old completion from
deleting a successor; it is not independent custody for an old failed object
if an unauthorized writer replaces its only map entry. Existing admission
must continue to prohibit that replacement. Likewise SQL identity checks do
not authorize engine acquisition during shutdown.

Message-group close rejection now prevents that object's following
retirement/discharge while other captured entries are still attempted.
Retirement refusal retains the closed object for retry. Existing exact
handler-owner regressions are required along with the changed cleanup tests;
this source review does not invent a new physical MG failure measurement.

The failure observation is deliberately bounded to step outcomes and leaves
the original primary error unchanged. It is not a durable recovery record
or a complete inventory of arbitrary asynchronous failures.

No automatic reopening, original seed latency cure, complete static/corpus
gate, U1/TX1/FreshMG closure, production deployment or release certification
is approved here.

## Final naming delta and static boundary

The reviewer independently rehashed the two final changed files:

| File | Superseding SHA-256 |
| --- | --- |
| `src/bootstrap/bootstrap-service-seed-workflow.js` | `4d4f439ca2a098d21f8e52b5c82713e879e1acea2ace6fe021af9d416fa3f202` |
| `src/bootstrap/phases/seed-cleanup-handler.js` | `9fbb5f957f67610a162f61c18acd4fe83800bb1c6c2d91e87d688c2aeaf04b7e` |

The other five fingerprints in this review are unchanged. The workflow
hoists its two existing error strings into private named constants with
byte-identical values. The cleanup helper renames its exception vector from
`failures` to `closeErrors`; it still carries the same exceptions into the
same AggregateError and leaves CLEANUP_RESULT as the explicit outcome.
Neither change adds a decision, changes an await or broadens authority.
The workflow references above describe the initially reviewed bytes; its
later lines shift by four with the constant declaration.

**APPROVE these final bytes for the declared locked measurement.**
The nine-category assessment and its proof limitations remain applicable.
This approval does not approve or waive a static gate.

The reviewer read `evidence/static-review/inherited-decision-findings.json`.
It records matching base/current violation identities for the existing
workflow local retry loop (base line 321, current line 325) and SQL engine
constructor wiring (bridge lines 51/65), with no baseline change. The diff
preserves both underlying blocks. That attribution does not make either
finding resolved; the decision audit remains red.

`docs/development/solver-runbook.md:167` explicitly limits
`LAGRANGE_SKIP_PRECOMMIT=1` to work-in-progress branches and forbids using it
for source landing on the shared branch. Under the existing operator
preservation authorization, recording the actual normal-hook failure and
then preserving an explicitly RED, unlanded WIP checkpoint fits that
boundary. It supplies no clean-gate, Solver-land, main-merge or publication
receipt. This review neither executes that exception nor predicts the
normal hook's outcome.

## Repaired locked measurement: e29e46abf

The reviewer independently inspected
`test-output/seed-release-custody/repaired-e29e46abf/` for exact candidate
`e29e46abf6c5daf506d8c0500b5a9a1d16c2bcd6`.
The input names `adam-laptop` with retries disabled. Controller line 4
records the same placement head, line 8 records retry zero, and its thermal
hold is followed by the normal thermal admission. The twelve structured
result rows are all first-attempt passes, totaling 329 runner-reported
assertions; exit status is zero. The bootstrap lane has nine files and the
exclusive lane three files.

| Packet file | SHA-256 |
| --- | --- |
| `input.json` | `070160a642e01b8194abf102021f665431a83e0e4a67d6b3072ce8c35c1e440f` |
| `exit.json` | `a570bcf4494f671c5b57805cd66f0c61ace157ea3de5d4e3a29c3cc3e7b84a82` |
| `results.ndjson` | `8cf2a55bb4fe449c522ae4c5cc7fd110ea5b9018391c6eee4d4ecb9f5a006715` |
| `controller.log` | `f6bb0698ad879851e236b5d5b52ab460253de63bbf4f9cbe5d66eb9416fb084f` |

All seven source/registry hashes match the final approved fingerprints.
The five modified/new witness and helper hashes match the approved witness
review. Independent comparison of Git blobs confirms all twelve measured
test files are byte-identical between baseline `63420a1a5` and repaired
`e29e46abf`; no assertion was relaxed to obtain this result.

The native custody file passes all four runner-reported tests. With its
unchanged sequential test body, this establishes that the native engagement
checks and all three child assertions completed successfully:

- Real ENABLE commits before the handler-only expiry treatment, admission
  remains closed, and the original release refuses at its deadline.
- Registration cleanup reports the primary refusal and frozen ERROR
  observation, retains the failed exact native owner, and performs SQL/CDC
  cleanup in the asserted order.
- Restoring the original native close allows another top-level shutdown to
  re-enter existing custody, close the same DB, and discharge its retained
  owner rather than replay the old cached rejection.
- The subsequent actual retained-store startup consumes readable nonempty
  storage without SERVICES rows, reaches its real typed creation refusal,
  and preserves the committed origin.

The successful controller output contains file-level summaries rather than
the full native child diagnostics. These conclusions are therefore bound to
the exact passing assertions and reviewed fixture. This assessment does not
assign a positive-run partition, numeric origin, deadline or elapsed value
by copying the baseline's diagnostic values.

The focused phase, cleanup and shutdown/SQL tests also pass. Existing
cleanup ordering/property, startup pipeline, release-failure projection,
startup-session, runtime custody, native startup cleanup and opening-history
tests pass on the same candidate. This is the declared focused composition,
not a whole-repository corpus result.

**Result assessment: the repaired candidate has a valid focused positive
for the reviewed cleanup interaction.** Exact source-only semantic controls
remain pending at this assessment. The inherited static findings remain
unresolved; no static-gate, landing, main/publication or release approval is
given. The previous scope exclusions remain unchanged.

## Isolated source-only semantic controls: pre-execution review

Both controls derive from exact positive candidate
`e29e46abf6c5daf506d8c0500b5a9a1d16c2bcd6`. The reviewer read each complete
source diff and the unchanged engagement, assertion and teardown paths.
These are deliberately defective diagnostic branches and must not merge.
No negative execution occurred as part of this review.

The phase control at `diagnostic/seed-custody-phase-negative-20261020`
moves acquisition and release back into the checkpoint callback, outside
`executePhase`, and restores the registration callback to metadata only.
The two error constants and every other repair remain intact:

| File | Mutant SHA-256 |
| --- | --- |
| `src/bootstrap/bootstrap-service-seed-workflow.js` | `d7a6cea593672d838f5db82cbefd589b628354cf57f8d6ba3f399b2c3d739405` |
| `src/bootstrap/pipeline/seed-startup-plan.js` | `3f7009251e1f81a97d5a8e6d80cc3568b61d160369be3665366e1a61cccfa19c` |

The retry control at `diagnostic/seed-custody-retry-negative-20261020`
removes only the rejected-attempt reset and its catch/rethrow scaffold.
It retains `this.shutdownPromise = attempt; return await attempt;`.
The runtime file's SHA-256 is
`ce54e0c1ac4b11afe6c41f3800d3b00bfa08be24a818f9e92d8da813a1d624b4`;
the exact source patch hashes to
`604a9f5f433786dc460f39f06e6a8ccc0f4e234d4ff7527506c6236cfff49074`.
It changes neither initial single-flight nor original error propagation.

Both test trees remain unchanged against the positive candidate. In
particular the native witness, fixture and focused shutdown hashes remain
`5c82b732...`, `f15ac20c...` and `9d1df4d0...` as recorded in full above and
in the companion witness review. No deadlines or pass criteria change.

### Expected discriminators and interpretation

For the phase control, the focused phase test must reach the actual class A
scheduler and then fail its acquisition/release sequence assertion at
`test/bootstrap/pipeline/seed-registration-phase-custody.test.js:83-86`.
Its explicit settlement race prevents a missing release callback from
becoming a hanging test. The native witness must pass its real ENABLE,
origin, deadline and native-close engagement checks, then fail the first
child at line 111: `partitions` versus `registration`. The repaired
top-level retry and retained-startup refusal children should remain positive.
This restores the old placement of the whole acquisition/release operation;
it is not a phase-label-only mutation.

For the retry control, focused shutdown lines 105-115 must first establish
one concurrent attempt and the exact original rejection for both callers.
Lines 123-124 then detect the retained rejection and call count one instead
of two. In the native file, the registration/custody child should pass; the
retry child should fail at line 152 only after the initial native failure
and restoration of the real close. The subsequent retained-store refusal
child should remain positive after the explicitly labeled existing-owner
teardown.

The fixture's teardown at
`test/test-helpers/seed-release-failure-custody-fixture.js:257-291` restores
substitutions, invokes existing owners, and requires every captured native
DB closed before deleting its supplied directory. A cleanup error is
retained together with the primary error at lines 323-332. Teardown is not
evidence that the mutated top-level retry succeeded. An import/setup failure,
unengaged timeout or teardown-only failure is not an intended semantic kill.

### All nine categories rechecked

The numbered census in the full source assessment remains binding. For
these two controlled deltas every item was reconsidered:

| Category and items | Control-specific assessment and evidence |
| --- | --- |
| Admission 1-7 | 1 and 6: actual initial/retained readers and placement enforcement are unchanged (native test 70-89, 174-198). 2 and 4: original primary refusal and cleanup shapes remain unchanged; phase changes which existing cleanup steps are selected. 3: original 3000 ms budget remains asserted at line 72. 5: only the retry control deliberately removes the canonical cleanup retrigger (runtime reset); it does not reopen admission. 7: native target and retained-store refusal diagnostics remain actual-owner observations. |
| Recovery 1-5 | 1: exact-map and engine discharge repairs remain in both controls. 2: native restart still constructs a new BootstrapService through real retained readers. 3: nonempty real inventory and actual release engagement remain mandatory at native lines 70-107. 4: origin rereads and successful native close remain unchanged. 5: readable nonempty/no-SERVICES refusal remains asserted at lines 174-198; neither mutation grants absence-based permission. |
| Retry 1-7 | 1 and 4: the retry mutation specifically restores the permanently cached rejection; focused 123-124 and native 152 detect the dead retrigger. 2 and 5: no timer, loop or budget is added; initial concurrent joining remains. 3: original error is still propagated by `return await attempt`. 6: all lower-owner idempotence and exact identity guards remain. 7: no transport ACK or failed observation resets a retry counter. |
| Transport 1-5 | 1: real OBSERVED and matching native origin are still required before treatment. 2: no late-response handler or waiter changes. 3: no delivery classifier or reply shape changes. 4: bounded existing release transport remains unchanged. 5: real router and one original delivery remain in the unchanged fixture. The phase mutation relocates entry, not transport implementation. |
| Timer 1-5 | 1: no timer is added or altered. 2: no role/authority fact changes. 3: retry intentionally retains only the rejected JS promise; native state is untouched. 4: handler-only expiry follows the actual settled ENABLE under the same absolute deadline. 5: neither control adds a read-through sweep or new dependency; the phase control reverses the reviewed scheduler boundary. |
| Concurrency 1-5 | 1: first-attempt synchronous joining remains in both controls. 2: exact post-await map and engine checks are unchanged. 3: no new claimant is introduced. 4: existing recovery traffic remains allowed and attempt-scoped by the witness. 5: retry mutation affects the same BootstrapService promise only; phase mutation affects its registration callback only. Focused joining and phase gate assertions establish those scopes. |
| Formation 1-5 | 1: phase control restores acquisition/release before actual registration phase entry, the exact defect being tested. 2: retry control deliberately leaves stale rejection as the veto; no substitute rescue is claimed. 3: native failure still precedes serving admission. 4: neither changes release budget or asserts natural startup margin. 5: no synthetic SERVICES, origin, control fact or alternative admission path is added. |
| Harness 1-6 | 1: only the named post-engagement phase/retry assertions qualify as kills. 2: native owners and narrower focused doubles are unchanged. 3: time treatment/budgets are unchanged. 4: requests and retained records remain produced by actual owners. 5: original positive engagement prevents empty-cohort or no-effect success. 6: exact e29 positive and isolated mutant fingerprints bind the comparison; the claim remains BootstrapService/native-local, not public-process or cross-host certification. |
| Interaction 1-10 | 1-2: existing owners and typed boundaries remain; mutations deliberately violate only phase custody or retry continuation. 3: one native sequence still checks origin, custody, retry and retained refusal, with the expected child distinguished. 4: restored native close is fresh evidence that the retry mutant wrongly fails to reconsider. 5: no new amplification/backoff bypass. 6: explicit top-level shutdown remains the tested trigger. 7: diagnostics never become authority. 8: source-only fingerprints and unchanged witnesses establish treatment fidelity; actual kills remain pending. 9: lower-owner teardown stays excluded from retry proof. 10: the existing product contract and positive candidate stay unchanged; diagnostic branches are excluded from landing and positive certification. |

**Verdict: APPROVE both isolated controls for the declared locked
measurements.** No actionable findings remain in this pre-execution round.
Record exact committed diagnostic heads and actual failures separately.
This approval does not certify the anticipated result, resolve the inherited
static findings or authorize merging either mutant.

## Retry control result: 8be74d3a6

The reviewer independently inspected
`evidence/retry-negative-8be74d3a6/` for exact diagnostic head
`8be74d3a62b625ebcb330724bcaf0a1596ae0a9a`.
Its runtime Git blob has the approved mutant hash `ce54e0c1...`.
Both measured tests and the native helper are byte-identical to their
`e29e46abf` blobs. The only executable difference is the reviewed runtime
mutation; the other changed file is the diagnostic description.

All four packet hashes in `sha256.json` were independently checked against
the actual files. The controller hash is
`e6df9b349228fa60d99c16c63f45d25dc4c1ece4403ca9601533c176a9b43979`.
Input and placement agree on the diagnostic head and `adam-laptop`, with
retry zero. Both files fail on attempt one, with 36 total runner-reported
assertions. This expected-negative sample is excluded from positives.

The focused test first passes its concurrent single-attempt, exact-error
identity and still-shutting-down assertions (controller lines 25-30).
It then fails the intended lines 123 and 124: the new shutdown returns the
old error, and cleanup count remains one rather than two (controller
lines 31-79). This is the reviewed missing-retrigger mechanism.

The native test reaches real committed-origin expiry and passes the entire
registration cleanup/custody child. Its retry child alone fails with
`Replica handler still owns failed runtime shutdowns` after the test restores
the real close and invokes shutdown again. The retained-origin restart
child subsequently passes after the explicitly labeled teardown
(controller lines 137-156 and 298-304). The native diagnostic records
`artifact_payload_chunks-p1-r1`, origin index 2/term 1, the original
3000 ms bound, failure phase `registration`, and ERROR cleanup with
registration/partition errors and successful message-group/infrastructure
steps (line 316).

**Classification: valid engaged semantic kill of the rejected-attempt
reset.** Phase accounting, exact retained cleanup observation and
authoritative restart refusal remain positive in the same mutated native
sequence. The result is not an import, setup or timeout failure, and
teardown is not credited as top-level retry success.

The separate phase control and newly identified message-group cleanup
correspondence/regression obligations are still pending at this assessment.
Receipt `semantic-negatives-and-unchanged-owner-regressions` remains open;
this negative does not resolve static gates or authorize landing.

## Phase control result: d23a24a82

The reviewer independently inspected the complete local packet at
`test-output/seed-release-custody/phase-negative-d23a24a82/` for diagnostic
head `d23a24a8243d3a45d4f7cfd50505e8efa775b2fb`. Both source blobs match
the approved mutant hashes `d7a6cea5...` and `3f700925...`. Both executable
tests, the native fixture and the impact contract are byte-identical to
`e29e46abf`. The additional committed differences are diagnostic prose and
generated inventory/seal digest changes; no additional runtime behavior or
test assertion changes were found.

| Packet file | SHA-256 |
| --- | --- |
| `input.json` | `65b2f28dfd0a36774dd2967e42b5d9ad25565b6a0f02305915ff630331de8352` |
| `exit.json` | `950e8b800437285210983f185696e5176c22281d05a741f991f87d008cb24fc1` |
| `results.ndjson` | `e8ee1bc8ccf61703952ce61e6dd47e4992b86159123e1037771211149e23d4ec` |
| `controller.log` | `ffa82a0ecc9c130fb6bdbf1d074f76e247d1e256abbb1d76bb625ba51aaf7549` |

Input and placement identify the same diagnostic head on `adam-laptop`
with retry zero. Both files fail on their first attempt, with five total
runner-reported tests/assertions. The focused phase witness reaches its
actual scheduler boundary, then fails at line 83 because the phase directly
calls metadata registration without enclosing CDC/state/SQL/handler
acquisition and release (controller lines 17-52). This is the declared
behavioral sequence failure, not a timeout caused by the missing callback.

The native engagement checks complete before child 1 fails at the intended
phase comparison: actual `partitions`, expected `registration` (controller
lines 70-88). The top-level native shutdown retry child passes at lines
102-103; the actual retained-startup refusal child passes at lines 249-255.
The diagnostic at line 267 records origin index 2/term 1 for
`artifact_payload_chunks-p1-r1`, the original 3000 ms bound, the selected
`observe_applied_position` deadline refusal, and a cleanup observation whose
step map begins at partitions and omits registration. Assertions later in
the failing first child are not credited as executed.

**Classification: valid engaged semantic kill of the registration phase
acquisition/release move.** The independent retry and retained-startup
protections remain positive in this mutated native sequence. Together with
the retry negative, the two controls distinguish the two repairs without
altering their witnesses or lowering their budgets. Neither diagnostic
branch belongs in the positive or landing population.

The message-group orchestration witness and owner-regression correspondence
remain outstanding at this assessment. Receipt 4 therefore remains open,
and the unresolved static gate still prevents landing approval.

## Message-group cleanup correspondence and component witness review

The additional unchanged owner-regression measurement has a narrower result
than the earlier twelve-file positive. The reviewer read the structured
packets under `test-output/seed-release-custody/owner-baseline-63420a1a5/`
and `owner-repaired-e29e46abf/`, and the repaired controller output.
Baseline passes three of four files; repaired passes two of four, both with
172 runner-reported assertions. The exact-handler API and executor activation
files pass in both. The replica-transport-handler identity file fails in
both with the same first typed-retirement refusal. That inherited failure
remains an obligation; this review does not repair or waive its fixture.

In the repaired bootstrap activation-boundary file, all eleven behavioral
subtests pass. The only new failures are the census assertions prohibiting
the MESSAGE_GROUP address constant and requiring two direct batch-retirement
calls. Source inspection confirms the new address is passed to the existing
singular exact owner, and both cleanup entries now share one captured-object
cleanup helper. These observations justify a correspondence update without
changing the original exact-handler safety requirement.

The reviewer independently read and hashed the frozen proposed test changes:

| File | SHA-256 |
| --- | --- |
| `test/bootstrap/seed-message-group-cleanup-custody.test.js` | `5baad40fab86f349f431439a47ab2b6357242c7efbf08c23e8c566b81eaddcd9` |
| `test/bootstrap/message-group-activation-handler-boundary.test.js` | `c61d3c839dcb86fc5ccf3c0788ede5cc72e8ab0883cd81ae724761f0c7ebdd7c` |
| `test/shards/impact-contracts.json` | `8831a8ac4fa514a4ead51430ec1f6fd1b8c621a3ab77d5fdd38d78e79d49bce8` |

**Verdict: APPROVE these test/registry bytes for locked measurement.** No
actionable finding remains in this complete review round. Product source
does not change. Native execution, the exact new composition and outstanding
inherited failures remain separate obligations.

The census diff leaves all eleven behavioral cases unchanged, retains the
raw-removal site list and canonical helper's lane/exact-identity assertions,
and explicitly prohibits raw unregister calls in seed cleanup. Per-method
checks bind both `_cleanupMessageGroups` and `cleanup` to the shared path,
then bind its captured service/router arguments and the shutdown, retirement,
identity-checked map-discharge ordering. The new registry entries add the two
witnesses to the same existing contract and coupled pair; no authority or
acceptance statement changes.

The six new cases parameterize three attacks over actual failed-bootstrap
MG step and actual graceful cleanup. They use a real BootstrapService,
MessageRouter, registration helper and exact-retirement owner, with explicit
service shutdown doubles. The exact API observer either calls its original
once or throws the selected exact error before the original call. It never
forges an absent-handler result.

### Nine-category review of the added witness and census

All items in the previously enumerated category census were reconsidered;
line references here name the new component file unless otherwise stated.

| Category and items | Evidence and limits |
| --- | --- |
| Admission 1-7 | 1/6: actual current map and exact registered callback are read at136-144; no placement gate is substituted. 2/4: failed step returns ERROR, graceful cleanup retains AggregateError/error identity at119-133. 3: no new timer/budget or compressed timeout. 5: clear the injected fault, then call the same actual owner at254-259 and280-286. 7: assertions identify the actual replica, service and handler, not presence at a generic address. |
| Recovery 1-5 | 1: old-success/current-successor map and handler survive at289-317. 2: this is same-instance cleanup, explicitly not restarted native recovery. 3: each case registers a positive service; failed shutdown includes a healthy second entry at235-252. 4: retirement retry uses the same closed double, with completion count one at282-284. 5: failed close/retirement cannot discharge map custody; empty map is asserted only after original exact API success. |
| Retry 1-7 | 1: both actual cleanup entries are called again after treatment removal. 2/5: no polling or automatic retry loop; finite explicit attempts. 3: ERROR/rejection versus successful completion is asserted at119-175. 4: explicit cleanup does not wait on serving/readiness. 6: same closed double is not physically re-created; controlled old-success/successor case verifies no successor close on the first attempt. 7: only original exact API processing, never ACK, supplies retirement evidence. |
| Transport 1-5 | 1: original `unregisterExact` return is recorded at70-73. 2: delayed old completion is tested with a real successor callback at302-311. 3: retirement throw reaches actual cleanup handling; no delivery classification is fabricated. 4: no network wait is introduced. 5: real MessageRouter registry and production registration/retirement helpers are used at31-104; shutdown alone is a double. |
| Timer 1-5 | 1: explicit gates replace timing guesses; no new timers. 2: no Raft role or authorization is modeled. 3: the test does not claim crash equivalence. 4: gate entry races actual attempt settlement at293-297 rather than a fixed microtask count. 5: no enforced subsystem is used to poll itself. |
| Concurrency 1-5 | 1: each case invokes the actual existing cleanup owner; this file does not claim a new concurrent single-flight proof. 2: old shutdown is held while successor map/handler changes, then exact old retirement and no successor shutdown are asserted. 3: controlled host replacement is explicitly a post-await identity test, not replacement permission. 4: no timer reentrancy is introduced. 5: the contended identities are one replicaId, exact service and exact handler; original API invocation proves the intended sink was engaged. |
| Formation 1-5 | 1: no formation metadata/CDC dependency is introduced. 2: retry directly re-enters cleanup. 3: no serving operation is asserted. 4: no startup window or native performance claim. 5: no origin, SERVICES row, authority grant or alternative completion owner is supplied. The structural census keeps the existing no-raw-removal rule. |
| Harness 1-6 | 1: native/phase negatives are separate; these component cases require actual shutdown/retirement engagement before custody assertions. 2: real router plus explicit shutdown doubles are honestly scoped. 3: no compressed native budget. 4: actual registration creates the callback identity; tests do not hand-author a retirement outcome. 5: call counts, originalCalls, completed ordering and healthy second entry exclude vacuous success at152-165,235-317. 6: only component orchestration/exact router identity is claimed; native MG close and cross-host behavior remain unmeasured by this file. |
| Interaction 1-10 | 1/2: Bootstrap cleanup orchestrates; exact handler owner decides retirement. 3: failed close, failed retirement and successor survival each coexist with same-owner successful continuation. 4: fault removal is followed by a fresh actual owner call. 5: no new loops, force flags or backoff bypass. 6: explicit retry is the release trigger. 7: passive event traces are assertions, never authority. 8: this witness has no executed result yet; pending measurement cannot count as proof. 9: teardown uses existing cleanup, restores exact descriptor, releases gates and aggregates primary/cleanup errors at178-232. 10: census and both existing interaction registry lists include the component witness without changing the eleven activation cases. |

The registration helper receives no `resolveLane` in this component fixture.
Accordingly these cases do not themselves prove activation-effect
serialization; the original unchanged behavioral activation cases provide
that separate owner evidence. Likewise `closed` and completion counters
describe shutdown doubles, not physical SQLite/native closure.

Whole-router shutdown after successful graceful cleanup may legitimately
remove node-lifetime handlers. The failure/successor assertions occur while
the retained-map rejection stops that later stage, so router-wide teardown
cannot make the exact-retirement assertions pass. Finally cleanup attempts
all restorations and owners and retains errors; it is not used as proof that
the earlier semantic assertion succeeded.

Receipt 4 remains open. Passing this correspondence/component measurement
will not by itself resolve the unchanged inherited identity-file failure,
the static gate or any broader release obligation.

## Final focused composition and partial receipt assessment

The reviewer independently inspected the input, exit, structured results and
controller output in
`test-output/seed-release-custody/composed-e0e93bf70/` for exact candidate
`e0e93bf70776e1f1daeb149e5a3e9f14a1332464`.
Input and controller placement agree on that head, `adam-laptop` and retry
zero. The ledger contains seventeen first-attempt results: sixteen files
pass, one fails, and the runner reports 511 assertions. Exit status remains
one. This is a red focused composition, not an all-green run.

| Packet file | SHA-256 |
| --- | --- |
| `input.json` | `ef6a30af7639999062d88c25993ede6d72d984f066403ec90a569a6e9ffef3d6` |
| `exit.json` | `950e8b800437285210983f185696e5176c22281d05a741f991f87d008cb24fc1` |
| `results.ndjson` | `d5833be72f223b3d8ab52bb3b5b9ad38be7af20bc50f06eecd51dd917d59a95b` |
| `controller.log` | `f502d7d36a7c72267a2a5d3de8e1a913c5550f07a1a6b2ae7903fab541322e5d` |

The entire `src` tree is `00b72e3dfe4f9738fe4163383c141f55a07ef1f0`,
identical to the earlier repaired `e29e46abf` source tree. The reviewer
verified all fifteen composed file blob IDs and SHA-256 values in
`evidence/candidate-identities.json` directly against the committed Git
objects. All twelve original positive test files remain byte-identical to
`e29e46abf` and pass again here. The new MG component and corrected census
files match the approved hashes above. Generated classification changes
register the additional test and corresponding derived digests; they do
not alter executable pass criteria.

The three native custody children and focused phase/SQL/map assertions pass
in this exact composition. The six MG component cases pass through both
actual cleanup entries. The updated activation-boundary file passes its
75 runner-reported assertions, retaining the eleven existing behavioral
cases and the corrected structural correspondence. The canonical exact API
and message-group executor activation files pass with 36 and 43 reported
assertions respectively. These are component/router and native-partition
claims at the previously stated ceilings; they do not turn shutdown doubles
into native MG failure proof.

The sole failed file is
`test/node/replica-transport-handler-identity.test.js` (22 reported
assertions). Its partition, message-group and WASM subcases each receive
`refused_transport_without_handler_identity` as a returned promise rejection
at the existing canonical retirement owner. The three paths are visible in
controller lines 44-183. Its Git blob is unchanged across `63420a1a5`,
`e29e46abf` and this composed candidate; the same earlier same-host packets
retain those failures. Classification as inherited does not waive their
remaining owner/test-contract obligation, and this review does not silently
rewrite their expected result.

Both earlier semantic controls remain valid targeted evidence: their
mutated owner blocks derive from the same repaired source, and their
executable witnesses/helpers are unchanged in this composition. The
diagnostic source is not merged or counted in the positive population.

The proposed exact-candidate partial receipt values are consistent:

| Receipt | Passed | Evidence and remaining limit |
| --- | --- | --- |
| `actual-seed-committed-origin-expiry-and-registration-cleanup` | true | Unchanged actual native entry and registration-cleanup child pass on this candidate; phase control has its engaged semantic kill. |
| `native-cleanup-custody-and-top-level-retry` | true | Exact native close rejection, retained owner and restored same-owner retry pass; retry control has its engaged semantic kill. |
| `retained-origin-and-authoritative-restart-frontier` | true | Actual retained-reader bootstrap preserves origin and refuses absent SERVICES authority; this is a measured frontier, not automatic restart success. |
| `semantic-negatives-and-unchanged-owner-regressions` | false | Both negatives and new MG correspondence/component checks are valid, but the required inherited identity-file regression remains red. |
| `independent-review-and-applicable-gates` | false | Independent review is complete for these bytes; the two scoped inherited static findings and unpassed broader gates remain unresolved. |

Overall receipt status must remain `fail`, with the Quest open and
unlanded. This reviewer recommends bounded non-main preservation of the
measured work and its complete red/positive/control history. There is no
additional source/test binding issue identified in this assessment.

A later documentation-only preservation commit must name this measured
execution candidate and retain these source/test identities; it is not
itself a newly measured runtime head. Any changed executable byte or test
criterion needs the applicable renewed review and measurement. No automatic
partial-seed recovery, public process-lock reentry, complete corpus/static
green, U1/TX1/FreshMG acceptance, main merge or release is certified here.
