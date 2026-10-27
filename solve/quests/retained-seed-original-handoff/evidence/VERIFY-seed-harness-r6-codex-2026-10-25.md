# Seed-harness final delta review: REVISE

Candidate: `c261ff1b4b0dd5c643133fd031b00cde71e2a405`. Delta baseline:
`d52288be1` (r5 plus lineage composition); delta commits `80fd39085`, `c261ff1b4`.
Independent reviewer: `/root/seed_harness_review`. Review tree:
`/tmp/session-worktree-saQRzz/tree`, created with the repository's session-worktree
snapshot tool from the clean candidate. All tracked source bytes are restored to
the candidate. No author/integration source, Quest seal, commit, push or merge was
changed. Artifacts below are relative to this report's directory.

Steering was read in the requested integration tree at source
`bbc703d8f66d50e1b193f6b6f6c7574da9973703`, after the review packet, in the prescribed
AGENTS -> rules -> router order. The rules/router revision says 2026-10-26; its
Git source, rather than that forward-looking date, identifies the authority read.
Applicable fixtures, harness, architecture, runtime/recovery contracts and the
owner-interaction, harness-fidelity, admission, retry and recovery checklists were
consulted. This report separates a bounded fixture repair from public-service,
physical-failure-domain, publication and release acceptance.

## Required corrections, consolidated

### F1. Capture both supplied startup authorities before awaiting

`test/integration/helpers/cluster-test-helpers.js:290-315` records whether
`membershipOwnerOutcome` and `dataDirectoryProcessOwner` are own properties, but
reads their values after awaited owner operations. Caller mutation can therefore
replace the very authority whose presence was decided before the await.

The exact-candidate physical lab already catches one instance. In `lab-6b.log`
lines 7950-8000, `node-bootstrap-consistency.property.test.js:545` fails
`own-present authority retains its exact captured pre-await value`: the expected
explicit invalid-outcome object becomes `null`. This is independent of the same
file's earlier continuation holds. The supplied classification's whole-file
`RED/CONT` label concealed this fixture defect.

The isolated `authority-capture.test.js` independently reproduces both members of
the interaction in 1.185 seconds through the real fixture and real SQLite owner:

* Delete `options.membershipOwnerOutcome` immediately after calling the async
  fixture: the service receives null instead of the originally supplied object.
* Replace `options.dataDirectoryProcessOwner` with null at the same boundary:
  the caller's original live lock remains held, but the service receives null.

Both behavioral assertions fail; neither is an import/setup/timeout failure.
See `authority-capture.log`. The second case also proves the caller still owns
release of its supplied lock. This is one systematic cause, not two unrelated
patches. Capture the own-property decisions and corresponding values together
before the first await, preserving explicit null/undefined, inherited-as-absent,
object identity, directory identity and the caller's release responsibility.
Keep the existing hostile witness and cover the directory-authority counterpart.
Do not derive replacement authority when an explicit supplied value is refused.

The defect exists in the composed full unit and predates the two final delta
commits; it still invalidates the unit's explicit-authority fidelity claim.
The existing witness arrived in `406ceac1c`; the subsequent authority composition
must continue satisfying it. The broader source contracts require preservation
of authority and identity across asynchronous boundaries (R03/R08). This timing
is ordinary async behavior: Await suspends the callee and returns execution to
its caller before later continuation. See the primary [ECMAScript Await
algorithm](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#await).
The exact installed runtime probes, not the external specification alone, are the
failure evidence.

### F2. Restore exactly-once hardware scaling at the test budget boundary

The count reduction and reference are sound: three seed classes, ten assertions
on each, `3 * 10000` for that seed case; eight actual seed constructions and
`8 * 10000` for the phase file. No production seed timeout was raised. The join
case's literal 120000 is pre-existing at the delta baseline.

However, c261 removes the scaling and does not replace it elsewhere.
`scripts/run-test-files.js:326-334,369-385` extracts the largest declaration and
sets `TAP_TIMEOUT` without multiplying. Its machine-factor reader at 595 is used
for timeout diagnostics; the comment at 112-116 explicitly delegates scaling to
the integration budget helper. `src/test-helpers/tap.js` exports unmodified tap.
The static declaration extractor resolves arithmetic/imported numeric constants,
not runtime hardware factors.

`effective-budget.test.js`, run by the committed runner with
`LAGRANGE_TEST_MACHINE_FACTOR=3`, uses the same imported numeric reference and
same three declarations. It measures:

| Boundary | Actual | Required by the count/reference/hardware contract |
| --- | ---: | ---: |
| Three-seed case | 30000 ms | 90000 ms |
| Eight-seed phase declaration | 80000 ms | 240000 ms |
| File TAP_TIMEOUT, lifted by unchanged join declaration | 120 s | unscaled today |

The two scaling assertions are red; the actual-value assertions and environment
engagement checks are green (`effective-budget.log`, 5/7 leaf assertions green,
10 runner assertions including parents). This explains why the root's 31.8-second
whole-file property run can pass: the file cap is 120 seconds, while its seed
subtest still has a 30-second timer. That run does not prove hardware scaling.

Correct the narrow owned budget/declaration interaction with an engaged
non-1.0-factor witness. Retain the seed count and observed reference; do not raise
10000 or restore an unexplained large seed constant. Avoid importing the runtime
test-runner graph through cluster-test-helpers: that already deadlocked tap's
mock loader in 80fd39085. Both the case timer and containing file cap must agree
with the selected hardware factor; ensure exactly-once scaling rather than
globally multiplying already-scaled tests. No protocol/production deadline needs
to change for this repair.

### Evidence correction attached to F1/F2

Replace the all-file CONT interpretation with the retained failed leaves. The
review produced `lab-leaves.json` and `lab-classification.tsv` for all 63 failing
files, with original line numbers. They deliberately distinguish first observed
startup refusal, subsequent invalid scenario expectations, independent fixture
failures and unproved causes. Do not reclassify a failing assertion solely because
CONT appears elsewhere in its file. This is an evidence repair, not authority to
absorb unrelated product work into the fixture change.

## Positive findings and evidence retained

| Claim | Result and evidence |
| --- | --- |
| RC-B1 single owned virgin-seed fixture | Closed in source: `cluster-test-helpers.js:416-420` delegates to the existing fixture and binds exactly one `t.after` shutdown. Both characterizations and the four recommended related consumers migrate. Prepared consumers register shutdown before `prepareOriginalSeedAttempt`, which also protects preparation failures. Local node:test runtime-identity suite passes 3 cases. |
| RC-B2 owner hold classifier | Closed: the one pure `isOriginalAllocationHold(error, reason?)` lives beside `originalAllocationError` at constants:64. The migrated per-test curried functions only forward; they no longer derive code/reason logic. `custody-and-predicate.test.js` checks every declared reason, wrong code, absent value, string/object-shape mismatch, unrelated TypeError, and stale-then-fresh mutation. |
| Narrow production delta | `git diff d52288be1 c261ff1b4 -- src` changes only the constants owner (+9/-1), adding the pure classifier/export; no startup hold or native transition is changed. |
| Custody until successful shutdown | Independently measured: inject one rejection in the real service's `seedCleanupHandler.cleanup`; the owned after callback rejects with that exact error, SQLite ownership remains current, a second acquisition is refused, and a sentinel remains on disk. Clear the fault and invoke the same callback: cleanup retries, lock releases, fixture-owned directory is removed. Another call is idempotent. `custody-and-predicate.log`, two node:test cases green. Source: fixture:259-267 and runtime-methods:415-459. |
| Three classes and ten assertions | Source `return-value-completeness.property.test.js:124-199` composes wsPort/no-wsPort/short-timeout once each, then applies every shape to all three. Seed budget count has its own equality assertion. Every success-only shape accepts a failed result only for owner CONTINUATION_UNAVAILABLE. This is explicitly example coverage while startup remains held, not randomized successful-service coverage. |
| Nonvacuity under fixture failure | Independently mutate only fixture owner acquisition to null. All three seeds return `original-allocation-directory-custody-unavailable` at not_started via the real preparation owner; three success shapes x three classes = nine failing leaves. 32/41 leaf assertions remain green (53 runner assertions), exit 1. `owner-dropped.log`, patch and source-blob fingerprints retained; exact original fixture restored. Thus unrelated failure is not silently accepted as CONT. |
| c261 runner import boundary | Local canonical run passes `formation-sim-bootstrap-owner-entry` 10 assertions in 7.787s and runtime-identity 3 in 7.377s. Exact lab c261 also passes formation fixture 10 assertions in 16.229s. No fixture import of test-machine-factor/run-test-files remains. |
| Characterization red mechanism | Re-executed the prior review's three source-bound site probes against exact c261. Both all-stubbed seed shapes stop at cache_hydration with owner CONT via `assertOriginalSeedContinuation`; injected partition failure stops at partitions with the injected error. The real directory owner is held before bootstrap and absent after successful shutdown in every case. `characterization-causes.log`. |
| Existing focused native-owner evidence | Root exact-c261 canonical run records allocation-store34, custody4, preparation29, opening-authority24 = 91 green runner assertions. This is retained evidence from the root run, not a claimed rerun by this reviewer. |
| Ratchets | Source tightens test duplication 658/24752 to 657/24730; no raised unused-export baseline. I did not rerun broad static audits after the demonstrated REVISE findings. |

The factory's after hook is compatible with the documented Node22 context hook
and the installed tap path. Node documents `context.after` as a hook after the
current test, accepting an async function ([Node22 test
API](https://nodejs.org/docs/latest-v22.x/api/test.html#contextafterfn-options)).
The probe explicitly exercises the callback and its retained-resource effects;
runtime-identity exercises actual node:test hook registration.

## Exact-source lab disposition

The supplied physical run binds `placement-head` to the full candidate SHA on
tv-dator, factor 1.4, base `2216d82536f979a40927c7a0f5984007f3d6eaff`.
It reports 432 files: 369 pass, 63 fail, 9328 runner assertions, exit 1. These are
physical test-host measurements, not a distributed public-service certificate.
The final property has 53 green runner assertions in 21.796s. Phase ordering has
282 runner assertions with five failed leaves: three bootstrap-success predicates
and the missing final COMPLETE event/nodeId. Join characterization has 86 runner
assertions with two bootstrap-success failures. The independent site probe binds
those failures to the actual continuation hold. These remain red and establish
neither COMPLETE nor successful public admission.

The cold founder test is CLASSIFICATION_UNAVAILABLE before its intended mapped
founder check. Seed-release custody stops before the expected first non-control
ENABLE. Fresh-seed positives R1-R5 are held and its two engaged negatives pass.
No target-not-reached case becomes a positive witness.

Further classification corrections in the TSV:

* The temporal-authority failure in node-bootstrap consistency is an independent
  fixture failure and blocks this unit (F1).
* PG-wire command tags and public binding each first log startup CONT, then fail
  with `Cannot add property tapCaught, object is not extensible`. This is an
  additional reporting/harness symptom, not a successful service observation.
* Charged simulation includes `formation attribution already has an active
  window` after its first CONT. Membership consistency reaches a removed
  `getPublishedActiveNodeIdSet` method after failed startup. Failure-scenarios has
  isolated SQL-result failures in cases3/5/11 as well as seed-dependent failures.
  These are carried as mixed, not erased by a file-level CONT label.
* Native cleanup/opening tests have missing `release` handles and unengaged
  controlled refusals; reseed durability has SQLITE_BUSY; transfer-drain has
  three mid-turn oracle mismatches. Static census/enum/epoch/feature-token tests
  have their literal reported mismatches. They are separate owners, not seed
  continuation failures; this review does not independently certify the author's
  assertion that every one was already red on the lineage predecessor.
* Three-node rebalance's retained excerpt shows failed join/readiness/rebalance
  leaves without the claimed cause. It remains NO_CAUSE_PROVED in this exact
  artifact. Prior r4 local CONT evidence is historical, not a replacement for an
  absent c261 causal observation.

These out-of-scope failures stay with the integration, native-recovery,
simulation, API-harness and static-owner queues. They are not newly expanded
implementation requests and do not change the two causal repair requirements.
The TSV is a complete index of all63 red-file blocks; the raw leaf JSON retains
the specific assertions and error/reason excerpts. It is not a claim to have
independently rerun or fully diagnosed all63 scenarios.

## Applicability and complete checklist

Evidence keys: **S** = exact candidate source paths above; **P** =
`custody-and-predicate.test.js/.log`; **A** = `authority-capture.test.js/.log`;
**B** = `effective-budget.test.js/.log`; **M** = owner-dropped mutation artifacts;
**C** = characterization-causes.log; **L** = full lab and per-leaf artifacts;
**R** = root exact-source focused log; **H** = prior r4/r5 report plus source
history. N/A below means no new behavior in this unit, not that the broader
service obligation is fulfilled.

### Owner interaction (all10 items)

| Item | Judgment, invariant and evidence |
| --- | --- |
| 1 single semantic owner | PASS for classification: constants owner mints/classifies; no consumer-derived reason logic in migrated callers (S/P). Directory/membership/storage owners remain real; fixture supplies intent. F1 is the preservation failure, not permission to mint a new owner. |
| 2 typed boundary | REVISE F1: supplied authority identity must cross admission unchanged (S/A/L leaf21). Storage admission and returned original hold remain typed (S/C/P). |
| 3 paired invariant/ping-pong | PASS for safe startup custody + honest result: C observes hold with actual lock held, successful cleanup releases; P combines failure-retains and retry-releases in one witness; M restoring missing owner makes nine shape leaves red. F1 shows supplied-handle pairing is not yet sound. |
| 4 stale then fresh | Classifier re-evaluates each call (P); supplied-option temporal preservation fails (A). No cached startup verdict is added. |
| 5 pressure/backoff | No retry/force/admission bypass added (S pure classifier/fixture diff); budgets require F2 (B). Native backpressure/liveness is not claimed. |
| 6 wake/release | Shutdown rejection retains actual resource, later same-owner retry releases after fault clears (P). Original continuation's service release is unavailable/unchanged (C/L); not a progress claim. |
| 7 projection authority | WeakMap `seedStartupAuthorityOf` is read-back only; classification checks owner error, not durable permission (S/P). No projection opens startup. |
| 8 treatment fidelity | M edits actual acquisition, preserves patch and original/mutated blob IDs, logs actual DIR failure, and restores source. Negative samples are not positive certification. |
| 9 escape hatch search | No duplicate createOwnedSeed or new raw authority read found in touched callers. Existing curried wrappers delegate classifier. Known `seed-original-attempt-lifetime` local hold check and three preparation-owner inline checks remain declared unchanged debt; no seal mutation authorized. F1 is required. |
| 10 registry/proof alignment | `original-retained-history-observation` and coupled original-preparation/native-retained-record retain live endpoints and cold-inspection/opening-authority/lifetime witnesses (impact-contracts:1293,2820). Only their error-predicate consumers migrate; no owner algorithm/decision table/registry semantics change. R/L supply current owner witness results; no new pair claimed green. |

### Harness fidelity (all8 items)

| Item | Judgment, invariant and evidence |
| --- | --- |
| 1 red for right reason | A and B fail named behavioral requirements after setup; M fails nine shapes on typed DIR; C differentiates CONT from injected partitions failure. Initial ad-hoc probe was refused as unclassified by test:file (focused.log); rerun through committed run-test-files is explicitly recorded, not miscalled product failure. |
| 2 stub honesty | Characterizations stub phases and two registration acquisitions through one shared installer; no positive owner outcome is forged (S/C/H). P injects cleanup failure at real cleanup boundary, not a fake directory lock. |
| 3 time fidelity | REVISE F2 (B). Seed class leadership durations unchanged; these end before serving under CONT. No ordering assertion is excused by elapsed-time tolerance. |
| 4 field fidelity | Real membership/storage readers and original preparation used (S/C). Explicit null/undefined/inherited fields remain meaningful; temporal loss violates A. |
| 5 nonvacuity | M discriminates unrelated seed failures across all3 classes. Success shapes still await future successful seeds; join success-only vacuity is pre-existing and explicitly unclaimed. L's target-not-reached cases stay red. |
| 6 entry path | Fixture reaches production BootstrapService -> original preparation and real startup owners (S/C). Retained fixture omits production expectedClusterId/peer probe/FAIL-mode handling and incarnation fences; H records these unchanged fidelity limits. No public-startup equivalence is claimed. |
| 7 ceiling | P/A use actual local SQLite ownership and Node22, controlled cleanup failure; C has stubbed phases; M real preparation plus deliberately absent lock; L is physical tv-dator test process. No independent distributed failure-domain/native/public service acceptance follows. |
| 8 failure/progress | F1 fixture, F2 harness budget, CONT/CLASS product refusal, metadata/census/native failures separately classified (L). P measures finite-failure cleanup recovery and resource release, not service activation. |

### Retry/re-drive (all8 items)

| Item | Judgment, invariant and evidence |
| --- | --- |
| 1 retry fires | No timer/retry registration introduced (S). Shutdown has explicit same-owner retry after rejection; P measures invocation, rejection reset and second successful cleanup. |
| 2 bound from frozen evidence | No row-driven retry loop added; original handle/sentinel retained under failure (P). Test budget scaling itself fails B. |
| 3 every stop observable | Cleanup rejects exact injected error; original startup returns typed hold; no swallowed shutdown error (P/C/S). |
| 4 mutual suppression | No second retry owner added. Same shutdownPromise serializes active cleanup and clears rejected attempt (runtime-methods415-459; P). |
| 5 storm ceiling | No autonomous retries: P uses one failed call, one successful retry, one idempotent repeat. Broader retry storm bounds unchanged, N/A to added pure predicate/helper (S). |
| 6 duplicate effects | After successful cleanup, repeated after callback leaves cleanup call count2, not3 (P); directory owner's release is idempotent (storage owner). |
| 7 reset semantics | Only rejected shutdownPromise resets; successful promise remains, preserving duplicate safety (S/P). No transport ACK or counter reset added. |
| 8 finite failure recovery | Same owned cleanup succeeds after injected fault removed; resources release only then (P). Caller supplies retry; no unattended automatic recovery claimed. Original held startup does not prove useful service progress (C/L). |

### Recovery/replay (all6 items)

| Item | Judgment, invariant and evidence |
| --- | --- |
| 1 stale cannot clobber live | No recovery write/replacement added. F1 violates preservation of current supplied authority across an await and is rejected (A). |
| 2 restart vs live | Virgin/retained adapters consume durable SERVICES admission; no heuristic mode replacement added (S). H's retained-startup decision omissions remain evidence limitations, not newly repaired recovery. |
| 3 lost enlistment | No participant registry/enrollment change (S pure production diff); existing designed-null/rights negatives remain at actual original owner (L/R), not replaced by fixture success. |
| 4 replay idempotence | No command replay implementation changed. P verifies cleanup retry/repeat, not replicated replay; retained native application is outside this repair. |
| 5 absence proves nothing | Explicit missing/invalid outcomes remain refusal, not new authority; A must fix late substitution. Original CLASS/CONT refusal retained (S/C/L). |
| 6 useful recovery | Cleanup's finite fault clears and same owner completes it (P). Retained/fresh service recovery remains held/target-not-reached (C/L); no eventual serving claim. |

### Admission/classification (all8 items)

| Item | Judgment, invariant and evidence |
| --- | --- |
| 1 precheck/enforcement | New function classifies an error, grants no permission; production enforcers unchanged (S). |
| 2 transient/terminal | Consumers match exact owner code/reason and no fallback success; P tests all reasons and M shows unrelated hold rejected. No new retry classification emitted. |
| 3 governing budget | F2 requires count x measured reference x existing machine factor; no new production wait (B/S). |
| 4 reason shape | P checks object/string mismatch and owner-created Errors; migrated callers pass Error cause, not rendered message (S). |
| 5 hold release | Unchanged original continuation is still unavailable; no release latency claimed (C/L). Cleanup release path measured separately (P). |
| 6 freshness | Classifier reads every time (P); supplied authority capture must preserve invocation value (A). |
| 7 honest message | Original error reason and phase preserved; independent probe records not_started/DIR vs cache_hydration/CONT vs partitions/injected (M/C). |
| 8 progress after release | No new service-release implementation; explicit evidence ceiling (C/L). Same resource owner resumes cleanup after fault clears (P). |

## Reuse, limitations and handoff

The r4/r5 report is project history, not a fixed-round gate. Its unchanged
production hold path, retained-fixture limitations, null-negative scope and
join-vacuity caveat remain applicable after source comparison. I did not reuse
its false implication that every node-bootstrap failure was CONT; the current
leaf audit refutes that. Its r5 nonvacuity conclusion was remeasured because the
property changed from ten runs to three shared examples. Its loader result was
remeasured because c261 explicitly repaired that dependency boundary. Cleanup
custody was independently attacked because premature release would invalidate
the fixture's safety even if focused tests passed.

No broad corpus was repeated: existing exact-source lab evidence suffices to
demonstrate these blockers, and lab capacity is reserved by the root. No final
static/landing/publication gate, post-merge corpus, fresh-seed activation, retained
service recovery, W7/W9 certificate or five-host release was executed or claimed.
After F1/F2, reverify their changed interactions and exact-source dependent tests;
reuse unaffected evidence through the proof owner. There is no fixed additional
review-round requirement. The fresh-seed implementer may not compose this
candidate as approved on the strength of urgency.

Final verdict: **REVISE**, with F1 (supplied authority capture), F2 (effective
hardware budget scaling), and the attached leaf-level evidence correction.
