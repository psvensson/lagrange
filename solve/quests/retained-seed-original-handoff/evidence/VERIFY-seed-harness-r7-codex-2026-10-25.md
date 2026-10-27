# Independent seed-harness repair review: APPROVE

This is the delta continuation of the c261 **REVISE** review at
`/tmp/session-worktree-saQRzz/tree/review-seed-r6/REVIEW.md`. It reuses that report's
complete owner-interaction, harness-fidelity, retry, recovery and admission
checklists, raw63-file lab classification, custody/classifier evidence and
declared service ceilings. No fixed extra review round or broad corpus repetition
is imposed. Final source identity and verdict are recorded at the end of this
document after candidate binding.

Review work was isolated in snapshots `/tmp/session-worktree-Im5H3y/tree` and
`/tmp/session-worktree-gPyRqA/tree`. Neither author nor integration source was
modified. The reviewer added only evidence under `review-seed-r7`. The first
snapshot contains F1/F2; the second adds the remaining factor-reader migrations
and null-safe factor access. A final formation witness delta is reviewed
separately below. The current steering and owner contracts read in r6 remain the
review authority; no policy is inferred from a passing test.

## F1 closed: invocation authority survives suspension

`acquireSeedStartupAuthority` now captures both the own-property decision and the
value for `dataDirectoryProcessOwner` before awaiting. It likewise captures the
explicit membership outcome before awaiting storage admission. No replacement
authority is minted for an explicit null, undefined or refused outcome. The
membership read remains within the acquired-owner cleanup try/catch.

The **same independent r6 tests**, unchanged except their evidence-directory
location, now pass both hostile mutations: delete the membership outcome after
calling the async factory, and replace a supplied live SQLite directory owner
with null. The service retains the original exact objects. `authority-custody.log`
also remeasures failed-cleanup retention and same-owner retry: lock/sentinel remain
through injected failure, a competing acquisition refuses, successful retry
releases/removes, and a duplicate shutdown does not rerun cleanup. Four node:test
cases pass. The classifier lattice is unchanged and remains green.

`adversarial-boundary.test.js` adds a different failure edge: an explicit outcome
getter throws during initial capture. The exact thrown error survives, the getter
is read once on that failure path, and the fixture-acquired lock is released so
the same directory can be acquired afterward. No supplied lock is released by
the fixture. This closes the acquired-resource exception boundary; it does not
claim all arbitrary user option getters throughout BootstrapService are hardened.

The committed hostile witness now includes a real supplied directory owner in
addition to its existing membership mutation. Its cleanup awaits service shutdown
before releasing caller-owned directory handles.

## F2 closed: one leaf computes effective case and file budgets

`scripts/test-machine-factor.js` owns the factor normalization and scaling. It
imports nothing. The old integration helper is deleted; the old runner export
and implementation are removed. Runtime tests, static declaration extraction and
runner diagnostics consume the same leaf. Existing caller multiplications remain
unchanged; neither a protocol deadline nor the 10000ms seed reference is raised.

The timeout extractor recognizes a one-argument call only when the callee is a
named import of `scaleByMachineFactor` from that exact owner path. It resolves
numeric input by the existing static arithmetic rules and invokes the known
scaler with the child environment's normalized factor. It does not execute an
arbitrary source function. Named-import renaming is permitted; wrappers,
namespaces, other exports, unrelated modules, shadowed bindings and extra
arguments do not acquire this privilege. The conservative whole-file shadow
refusal is explicit and fails closed.

Independent probes measure the effective **TAP test-context timeout**, not merely
the arithmetic expression or a printed constant:

| Declared factor | Three-seed case | Eight-seed case | Containing probe file cap |
| --- | ---: | ---: | ---: |
| 1 | 30000ms | 80000ms | 80s |
| 1.4 | 42000ms | 112000ms | 112s |
| 3 | 90000ms | 240000ms | 240s |

Each probe has six green runner assertions. The actual production test sources
are also extracted at all three factors: the phase file yields80/112/240s, while
the return-value file yields120s at all three because its unchanged join
declaration dominates the scaled seed declaration. This agrees with the actual
case timers; it no longer confuses whole-file elapsed time with the seed timer.

`adversarial-boundary.test.js` passes14 additional provenance/call/shadow negative
forms, invalid factor normalization (absent, empty, text, zero, negative zero,
negative, NaN, infinities, below1), finite-factor overflow refusal and canonical
alias acceptance. The existing/expanded runner tests independently exercise an
explicit `options.env` factor different from the parent, caller TAP_TIMEOUT
precedence, the lane floor, unchanged numeric declarations and engaged negative
fixtures. They pass62 runner assertions; the loader regression passes10 in the
same canonical invocation. See `canonical-focused.log` (72 total).

## Migration and factor policy disposition

All old helper import consumers move to the new leaf. The ten straightforward
consumer diffs change only import paths. Two older IIFEs in raft-leader-election
and preflight-critical-path-hops were found by the independent census and now
consume the owner reader while retaining their existing multiplications. There
is no compatibility file or re-export at the deleted helper path.

The formation-verdict reader required an explicit policy correction: its private
`>0` parser admitted factors below1, whereas the shared test-factor owner uses a
floor of1. The author recorded the correction rather than claiming equivalence.
This review accepts that unification under the existing test-factor floor: the
formation source explicitly describes this as the same hardware-relative budget,
the established shared test reader already floors at1, and the census found no
below1 test-factor producer. The separate capped distributed calibration owner
uses `LAGRANGE_MACHINE_FACTOR`; its closed epic is historical design context,
not direct authority to silently change the test environment's policy.

This **does change observable behavior below1**. An independent exact-source
c261/current comparison with6000ms unexplained blocking over100s changes factor0.5
from a5000ms budget and `seedStarved=true` to a10000ms budget and
`seedStarved=false`. The failure reason changes from seed starvation to schema
admission blocked; admission remains denied and the overall formation verdict
remains FAIL. `scripts/checks/run-formation-seed-budget.js` consumes seedStarved as
a local gate, so this is also a local diagnostic-gate correction, not just a
cosmetic report change. See the retained `formation-policy.log` in the second
review snapshot. Factors1,1.4,3,5 retain identical budgets; the percent limit and
reference are unchanged. Explicit `environment=null` keeps its previous
reference-budget behavior through optional access in the sole reader.

The final author witness makes this semantic difference concrete with7500ms over
100s, checks the normalized floor and diagnostic outcome, and adds null handling.
Current61 assertions pass; the same test on c261 fails the actual below1 owner
and diagnostic leaves. That expected-negative sample is evidence of the treatment,
not part of a positive certification population. No past physical result is
reinterpreted under the changed policy.

## Selection, graph and static boundaries

The new leaf is covered by the publisher's `test-runner` full-corpus trigger.
The independent probe calls the actual `fullCorpusTriggers` owner and receives
`changed test-runner: scripts/test-machine-factor.js`. A preceding reviewer probe
incorrectly expected the lower-level `selectChangedTests` API to expose that
publisher decision; it instead correctly refused the pre-refresh snapshot's
observation drift. That is retained in `selection-path.log` as a verifier API
selection error, not a product regression. `publisher-selection.log` is the
correct owner-path measurement.

The cycle ratchet passes0/0 (`cycles.log`). Added imports target an import-free
leaf, and the actual formation-sim loader test passes, so the fixture no longer
loads the runner graph through machine-factor scaling. Final generated metadata
must remove references to the deleted helper and bind to the committed source;
the final identity record below records that check.

The preservation hook reports inherited complexity debt. Independent ESLint
comparison against c261 finds exactly the same four scoped violations and values
17,13,15,16 before and after, with line shifts only
(`complexity-comparison.log`). This delta does not raise their baseline or
silently repair unrelated complex functions. Full-corpus and publication checks
remain the integration owner's responsibility; source review approval does not
waive the new full-corpus trigger.

## Checklist deltas and continued applicability

| Applicable category/items | Current evidence and disposition |
| --- | --- |
| Owner interaction1-3,7,9 | One factor leaf and one original-hold classifier. Explicit original authorities preserve identity across await (two formerly-red probes green). No fallback startup authority, direct raw durable-state read or alternate cleanup path added. Old helper/export and duplicate IIFEs removed; all related import migrations inspected. |
| Owner interaction4-6 | Temporal option mutation now preserves invocation authority. Classifier remains uncached. Real shutdown fault/retry preserves and then releases custody. No automatic retry/wake or public-service continuation capability is introduced or claimed. |
| Owner interaction8 | Original F1 negatives turn green on repaired source. New scaling runtime probes engage factors1/1.4/3; spoof calls are refused. Exactc261 formation witness fails named behavioral leaves. Earlier owner-dropped nine-leaf mutation remains applicable: this delta does not change hold-classification or property acceptance logic. |
| Owner interaction10 | Changed factor owner is in publisher full-corpus trigger; actual trigger function measured. Original retained-history pair endpoints/semantics remain unchanged. Final metadata consistency checked at candidate binding. |
| Harness fidelity1-2 | F1 probes use actual fixture/readers/SQLite ownership. Cleanup failure injected at real cleanup boundary. Static call tests do not execute supplied code. The one mistaken selection probe is explicitly classified as verifier error. |
| Harness fidelity3-5 | Case timer and file cap measured separately at three factors; reference/count unchanged. Actual test declarations measured. No pre-existing join success-vacuity is claimed fixed. No red startup characterizations are relabeled service success. |
| Harness fidelity6-8 | Production BootstrapService/original preparation and same shutdown owner remain reachable. C261 lab63-red leaf audit remains retained history; it is not exact-repaired-head lab evidence. Local probes/canonical72 and author dependent tests support this bounded repair, not a physical or public serving claim. |
| Retry1-8 | No retry loop introduced. Same shutdown promise rejects observably, resets after rejection, preserves custody and retries the same obligation; post-success duplicate call is idempotent. No timer cadence/storm or autonomous progress promise added. Prior r6 evidence remeasured in authority-custody.log; service progress remains unavailable. |
| Recovery1-6 | No retained-history write, replay, registry or generation replacement added. Captured live owner cannot be swapped during await. Explicit refusal/absence does not become authority. Cleanup resumes after finite injected failure; fresh/retained startup recovery is still outside the bounded claim. |
| Admission1-2,4-8 | New factor leaf grants no product admission. Original error code/reason classification unchanged. Temporal authority failure repaired without weakening original hold. Formation below1 diagnostic policy correction is explicit and tested; local gate effect named. |
| Admission3 | Count x measured reference x existing machine factor agrees at runtime/static/runner; no protocol deadline or reference raise; explicit caller cap still wins. |

The adversarial-JavaScript checklist also applies narrowly to the new static
call-recognition boundary. Numeric normalization/overflow, import provenance,
accessor-failure custody and binding shadows are explicitly probed. Source files
are parsed into Espree ASTs, and arbitrary function bodies are never evaluated.
The new interface does not accept arbitrary boxed budget objects, arrays,
serialization payloads or digest inputs: unsupported AST operand/call shapes
refuse. Path/ambient-intrinsic handling beyond the changed provenance code stays
under the existing tooling owner (its scoped ambient-intrinsic audit is green);
this review does not claim generalized resilience to malicious mutation of all
JavaScript intrinsics. No new digest/coercion contract or source-code execution
surface is added.

The prior report's retained-fixture startup-decision omissions, designed-null
negative scope, unserved continuation holds and unrelated lab failures remain
explicit limitations. Neither an example timeout-policy correction nor a green
fixture classifier supplies fresh-seed activation, retained service recovery,
native replicated application, W7/W9, distributed physical failure-domain proof,
publication, merge readiness or release acceptance.

## Final binding

**APPROVE the bounded seed-harness repair at
`69d125051628ee5630f7ac7d7ddf7c961f057136`.** Base is
`c261ff1b4b0dd5c643133fd031b00cde71e2a405`.

Final isolated reviewer tree: `/tmp/session-worktree-oTBvrI/tree`.
The final-byte comparison covers every changed path. Relative to the census
snapshot, only the inspected formation test additions, the append-only attempt
record and three generated metadata artifacts changed. Every implementation
source byte matches the already-reviewed census snapshot. Relative to the first
snapshot, the additional reader migrations and null-safe access are explicitly
reviewed above; unchanged measured source evidence is reused on that basis.

On exact committed69d12505, independent final runs pass formation61 assertions,
adversarial boundary4 cases, and effective factor3 budgets6 runner assertions.
The subsystem metadata checker passes2452 tests/22 subsystems with digest
`fnv1a32-9fc27657`. Impact registry validation passes71 contracts/44 coupled pairs
with digest`5e7b3f654356993d0ee73bd388fc3394fdcfbe6ddc545057108414321626334d`.
The generated inventory and subsystem observations no longer refer to the deleted
helper. Only reviewer evidence files are untracked; all candidate tracked bytes
remain clean at the final SHA.

The root's full complexity measurements record1766 against baseline1755 on both
c261 and the repaired candidate. This is an inherited red, not a passing global
static gate; no baseline was raised. Independent scoped source comparison confirms
no new violations in the affected runner/extractor functions. The normal hook
preserved the candidate and generated metadata without bypassing the hook.

There are no remaining required corrections in this bounded review. This approval
allows the integration owner to compose these reviewed bytes. The old c261 lab
run remains historical; no new exact69d12505 physical full-corpus run was performed
by this reviewer. Full-corpus/publication and current service/release gates remain
outstanding under their owners. Approval is not a claim of public serving,
retained-service recovery, release certification or broad-corpus green.
