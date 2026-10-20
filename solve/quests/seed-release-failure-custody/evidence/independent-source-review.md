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
