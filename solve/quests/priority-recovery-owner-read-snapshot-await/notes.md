# priority-recovery-owner-read-snapshot-await: notes

Implementer: claude (Opus), worktree lagrange-nav-prfix-20261108, branch
work/code-navigability-prfix-20261108, HEAD f90eed0bd (seal, sealedAt
8d792cca5 = the epic stream aligned with PR #201). Working notes for the
verifier; append-only from here on.

## 1. The re-scope

The original quest (sealed 1b0c5e362, candidate 1d3903d5d) was overtaken by
PR #201: its canonical planning reader `readPriorityRecoveryPlanningAnswerSync`
(src/control-plane/priority-recovery-planning-answer-origin.js) already gives
`ReplicaOperationRepository.resolvePriorityRecoveryPlanningSnapshotForOwnerRead`
a settled planning answer (alignment table row
`replica-operation-repository-visibility-methods.js`,
solve/epics/code-navigability-and-mistake-resistance/pr201-alignment-notes.md).
The re-scoped statement (quest.json, binding) keeps two claims:

1. a committed witness that owner-read deferral is active exactly when the
   settled planning snapshot says so, for the synchronous pressure helper and
   the asynchronous owner reads;
2. the last BestEffort planning alias `getPriorityRecoveryPlanningSnapshotBestEffort`
   (module function, readiness-service delegator, three src consumers, two of
   them behind `typeof` probes) deleted, every consumer reading the one
   canonical planning answer, every test fake stating that answer.

The saved candidate patch (scratchpad `prfix-overtaken-candidate.patch`) was
used for reference only: its two witness tests and evidence script were
reused (headers updated to the re-scope); its src edits were not applied (the
PR had already done the owner-read part, and the AVAILABLE surface order it
deleted no longer exists on the stream).

## 2. Witness 1: owner-read deferral reads a settled snapshot

`test/rebalancer/priority-recovery-owner-read-settled-snapshot.test.js`
(receipt `owner-read-deferral-reads-a-settled-snapshot`). Real
`ControlPlaneReadinessService` from `test/helpers/readiness-service-fixture.js`
over a membership-publication double whose latest publication is
ESTABLISHING (recovery active) or PUBLISHED (not active); the repository's own
clock. Cases: the owner read answers a settled object (no `then`) carrying the
publication status; the sync pressure helper
(`resolvePriorityRecoveryPlanningEvidence`) reads `recoveryActive`
true/false; the three async owner reads (`queryIncompleteOperations` failure,
`queryAuthoritativeOperationVisibilityObservation` failure and empty read,
`getOperationsByEntityAuthoritativeObservation` slow empty read) defer while
ESTABLISHING and do not when PUBLISHED.

At the seal it passes (23 assertions): PR #201 already made it correct.
Non-vacuity by mutation of `resolvePriorityRecoveryPlanningSnapshotForOwnerRead`
(src/rebalancer/replica-operation-repository-visibility-methods.js), each
restored after:

| mutation | result | assertions that die |
| --- | --- | --- |
| return `Promise.resolve(<canonical answer>)` | 11 of 18 top-level assertions fail | `the snapshot is settled, not a Promise`; `...planning answer for the latest publication`; `an ESTABLISHING publication reads as active`; `a ESTABLISHING publication reads recoveryActive=true` (sync helper); `the failed read is a deferred outcome` + `the deferral names the authoritative-read failure` (incomplete read); both visibility sources' `deferred, not confirmed missing` + `names its cause`; `the slow empty read is deferred` (entity read) |
| return `null` | the same 11 fail (first one is `the owner read answers a snapshot`) | as above |
| `isPriorityRecoveryOwnerReadActive` answers true for any snapshot | 5 fail, all PUBLISHED-side | `a PUBLISHED publication reads recoveryActive=false`; `with a PUBLISHED publication the same failure does not defer`; both visibility `with a PUBLISHED publication nothing defers`; `with a PUBLISHED publication the slow empty read is an answer` |

So the witness pins "exactly when": both the active side and the inactive
side die under a mutation.

## 3. Witness 2: the alias family is gone

`test/rebalancer/priority-recovery-planning-best-effort-alias-collapsed.test.js`
(receipt `best-effort-alias-family-collapsed`): static scan of src/ for any
`\w*Planning\w*BestEffort` identifier, plus the readiness prototype has no
`Planning*BestEffort` member and still has
`getPriorityRecoveryPlanningAnswerSync`. Run against the seal tree (git
archive of HEAD + this test): 2 of 3 assertions fail (alias names in src/; the
delegator on the prototype). Passes on the candidate.

## 4. The deletion and the consumer table

Deleted: `getPriorityRecoveryPlanningSnapshotBestEffort` module function and
export (control-plane-readiness-publication-planning-snapshot.js; its doc
comment's consistency-mode history moved onto
`getPriorityRecoveryPlanningAnswerSync`), the class delegator
(control-plane-readiness-service.js), and
`hasAvailablePriorityRecoveryPlanningProvider` (the typeof probe in
priority-recovery-planning-read.js) with its two importers' guards.

On the real service the alias was
`async (n, t) => service.getPriorityRecoveryPlanningAnswerSync(n, t)`: the
canonical answer, the same object, one microtask later.

| consumer | before | after | behaviour |
| --- | --- | --- | --- |
| `readAvailablePriorityRecoveryPlanningSnapshot` (priority-recovery-planning-read.js), reached from `PriorityPublicationSafetyRows.readAvailablePriorityRecoveryPlanningSnapshot` and `UnifiedRebalancerAvailableNodes.readAvailablePriorityRecoveryPlanningSnapshot` | `hasAvailable...Provider` typeof probe, then `normalize(await service.BestEffort(n, t))` | `readPriorityRecoveryPlanningAnswerSync(service, n, t)` (absent service -> null, non-object -> null) | unchanged value: same answer object, same null cases on the real service; the owner methods stay `async`, so every caller still awaits. The probe's only other outcome (a service without the member -> null) is unreachable in production (one readiness class, validated collaborator); a fake without it now gets the fixture's neutral `getPriorityRecoveryPlanningAnswerSync` (null). |
| `getStartupAuthoritySnapshot` (control-plane-readiness-startup-authority-health.js) | `readPlanningAnswer = service.BestEffort` | `service.getPriorityRecoveryPlanningAnswerSync` | unchanged: `resolveStartupAuthoritySnapshotFromPlanningRead` awaits the read inside its try, so the value and the catch (a sync throw is caught by the same try) are identical. |
| `readPublicationPlanningSnapshot` (membership-publication-coordinator-planning.js) | `typeof service.BestEffort === 'function' ? await service.BestEffort(...) : null` | `readPriorityRecoveryPlanningAnswerSync(service, ...)` | unchanged on the real service and with no service (null both). The readiness service is optional on this coordinator; the canonical reader handles null. |

No rebalancer decision changes in production from the deletion (each consumer
received the identical object). The one timing difference is one microtask
fewer before the answer is available to the already-awaiting caller; no
consumer orders work on that tick (all local and lab suites below).

`behaviour-change-named` (decisions that change when deferral reads active):
these changed with PR #201's canonical reader, not here, and are each covered
by witness 1: incomplete-operation read-failure deferral, single-operation
visibility read failure/empty deferral (which is also the read
`reconcileReservations` uses for its orphan arm, see section 6), entity
slow-empty deferral, and the pressure helper's `recoveryActive` (the emergency
priority-recovery lane classification in
`buildPriorityAddAdmissionPressureEvidence`).

Ratchets: `owner_port_feature_detection` 2041 -> 2039 and `typeof_dual_paths`
604 -> 603 (baselines tightened with `--update-baseline` on the checker's
hint; the removed entries are `hasAvailablePriorityRecoveryPlanningProvider`
and `readPublicationPlanningSnapshot`, the rest is line drift). Pilot row
`owner_port_feature_detection_pilot_owners`: 59 / 0 at the seal and 59 / 0
now: neither removed probe is in a pilot file (pilot = control-plane-readiness-*,
partition-service*, the repository visibility methods, unified-rebalancer-available-nodes).

## 5. Test fakes

Every `getPriorityRecoveryPlanningSnapshotBestEffort` in test/ (about 96
occurrences, 42 files) now states the canonical answer:

- 61 definitions that sat beside a `getPriorityRecoveryPlanningAnswerSync`
  returning the same thing (identical body, or `return
  this.getPriorityRecoveryPlanningAnswerSync(...)`) were deleted (scripted,
  each pair compared; listed by `git diff --cached`). Includes the shared
  `createMockControlPlaneReadinessService` in test/rebalancer/test-helpers.js.
- Fakes that stated only the alias were renamed to the sync member (no
  `async`, `Promise.resolve` unwrapped): rebalance-coordinator-operation-ownership-tail-more-test-cases.js (3),
  quorum-conditioned-remove-safety-tail-test-cases.js (1),
  coordinator-created-operation-progress-remote-handoff-priority-recovery-test-cases.js (9 assignments),
  membership-publication-candidate-planning-surface.test.js (also routed
  through `partialReadinessFake`).
- Null-only alias stubs on membership-publication coordinators were deleted
  and the fakes routed through the readiness fixture (`partialReadinessFake`,
  whose neutral planning answer is null): owner-handoff-reconcile (2),
  tail-final-test-cases (2).
- coordinator-created-operation-progress-remote-handoff-fixture-builders.js:
  the planning snapshot is passed to `createMockControlPlaneReadinessService`
  as its `membershipPublicationPlanningSnapshot` (one version of the fake).
- unified-rebalancer-replica-state-management-node-state-change.test.js: the
  fake had different sync/async call recorders; one recorder now, and the
  assertion states that the async and the sync blocker reads each consult the
  one answer (`['node-local', 'node-local']`). Observable change of the
  test's own bookkeeping only; both answers already equal.
- Direct alias calls in tests: readiness-fixture-custody.test.js (3),
  control-plane-readiness-service-planning-snapshot-support.js (2; the
  "compatibility surface" test is now "the AVAILABLE planning read answers
  the canonical answer" through the read-policy owner),
  readiness-planning-consistency-mode.test.js (the latency-shape tests read
  through `readAvailablePriorityRecoveryPlanningSnapshot`; the "never
  delays" test asserts a settled value).
- Fakes that never stated the alias but sit on a canonical-reader path:
  before, the alias `typeof` probes answered null for a hand fake without
  the member; the canonical reader calls the member (the readiness service
  is the one class), so such a fake now throws `readinessService[...] is not
  a function`. Found by the local suites, routed through
  `partialReadinessFake` (neutral planning answer null = the old outcome):
  membership-publication-coordinator-tail-more-test-cases.js (2),
  -tail-final-test-cases.js (3), -candidate-convergence.js (1) (tests 45,
  89, 90, 91, 100 of membership-publication-coordinator.test.js: red on the
  first candidate, base green, 376/376 now), and
  rebalance-coordinator-outcome-routing.test.js (subtests 2, 3: red on the
  first candidate, base green, green now; subtest 1 is base-red, see 8).
- Convergence fixtures, see section 6.

## 6. Finding (R17): the hold-engagement fixture states two planning answers

`test/convergence/operation-ledger-self-move-hold-engagement-witness-fixture.js`
installed the scenario planning answer (`getPlanningAnswer`) on the owner read
and on the alias, while the service's synchronous answer stayed the real
derivation over the injected publication row. Production cannot disagree
there (one answer). Two ways to state one answer were measured:

- scenario answer as the sync answer too: `dt6-operation-ledger-self-move-holder-release`
  subtest 5 fails: the target's `reconcileReservations` releases 0 orphans
  (expected > 0), because the repository owner read now reads recovery active
  and the visibility read behind the orphan arm defers.
- real derivation for the AVAILABLE reads too: `dt6-priority-recovery-drain-parked-self-move`
  6 of 8 subtests fail (the drain reads `evidence_unavailable`).

Neither is this quest's scope (R16), so the injection moved to the
read-policy boundary with exactly the old reach: the workflow owner's
`readAvailablePriorityRecoveryPlanningSnapshot` answers the scenario answer
for a priority-control-plane partition (gated by
`resolvePriorityRecoveryPlanningReadContext`, normalized as the owner does),
and `priority-recovery-drain-parked-self-move-witness-fixture.js` wraps that
owner read instead of the alias. holder-release 8/8 and drain-parked 8/8
pass. Route to the convergence fixture owner: the fixture should state one
planning answer; under one answer the holder-release reservation probe says
that orphan reservation release defers while priority recovery is active
(decide whether that is the intended production outcome).

## 7. Local tests (controller, thermal-gated runner)

- `npm run test:file` over every `test/rebalancer/*.test.js` and
  `test/control-plane/*.test.js` plus the touched test files and the two dt6
  witnesses of the touched convergence fixtures (snapshot r3): 488+ files in
  six batches. Reds: 27 files. Re-run on the seal tree (detached worktree of
  f90eed0bd, same controller): 26 are red there with the same failing
  subtests (subtest-name diff empty) - base-red, not this change. The one
  candidate-only red, `membership-publication-coordinator.test.js`, plus two
  candidate-only subtests of `rebalance-coordinator-outcome-routing.test.js`
  (2, 3) were hand fakes without the planning member (section 5); fixed in
  r4: 376/376 and subtests 2, 3 green (subtest 1 base-red).
- dt6 witnesses: holder-release 8/8, drain-parked 8/8 (base 8/8 each).
  `dt6-operation-ledger-self-move-hold-engagement` and `-hold-fairness` do
  not finish within 400 s locally on the seal tree or the candidate (exit 124
  both, no subtest reported), and time out at 600 s on tv-dator for both
  base and candidate: pre-existing.
- The touched-file reds that remain (formation-ledger-spread-voter-ready-readiness
  3 subtests, ledger-quorum-spread-hold-cure-drain-admission 2 subtests) are
  red on the seal tree with the same subtests.

## 8. Lab (tv-dator, holder claude:nav-prfix, one host)

Snapshots are commit objects on no branch (`git commit-tree` of the staged
tree, parent f90eed0bd); nothing committed or pushed.

| run | sha | base-sha | files | result |
| --- | --- | --- | --- | --- |
| candidate r3 | 71f74e26e59f3d15173ddcacbeb180f25e70850d | 8d792cca5 | 1150 | 1107 pass / 43 fail |
| base (same cone) | 4e07be85591d6d19e1387a7c1511eea3aafc6d5e = seal tree + the two new witness tests, metadata refreshed | ace7313388cf75b8ace44b03f59f362701ed8271 (r4) | 1150 | 1105 pass / 45 fail |

Classification of the 43 candidate reds against the base run on the same
host: 42 are red on base too (replace-*, committed-node-remove-safety*,
remove-safety-*, dt6 hold-engagement / hold-fairness (600 s timeouts),
dt-formation-*, integration three-node-seed-rebalance /
authoritative-discovery-repair-pressure / lagrange-server-npm-package,
raft committed-membership-census, simulation formation-sim-attribution-isolation,
scripts solve-footprint-accounting / check-operation-dispatch-completion-owner,
active-gate, node replica-handler, bootstrap join-resume, etc.). The one
candidate-only red is `test/control-plane/membership-publication-coordinator.test.js`
(fixed in r4, section 5). Base-only reds: the alias witness (expected: the
alias exists at the seal) and two scripts tests
(check-benchmark-history-append-only, closed-quest-shape) green on the
candidate.

r4 (ace7313388cf75b8ace44b03f59f362701ed8271) differs from r3 only by four
test files (the fixture routing in section 5), notes and the import-graph
seal; it was verified locally, not re-run on the lab: the owner constrained
lab traffic (one host, narrow cones, no full suites) during this work.

## 9. Gates

node --check and eslint on every changed .js (0 errors);
`LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit` exit 0 (after keeping
the engagement fixture at 1499 lines under the 1500 test file-size cap);
`npm run test:duplication` OK (42/42, 649/649); `audit:guideline:navigability`
0 violations; `test:metadata:refresh` run and staged; evidence receipt
regenerated by `node scripts/quest-evidence/priority-recovery-owner-read-snapshot-await.js`
(status pass, 2/2); `node scripts/solve.js probe --id priority-recovery-owner-read-snapshot-await`
metric 0 target 0 done=true.

## 10. Verifier's model

- Witness 1 holds at the seal (PR #201) and dies under the three mutations in
  section 2; re-run them on
  `resolvePriorityRecoveryPlanningSnapshotForOwnerRead` /
  `isPriorityRecoveryOwnerReadActive`.
- `rg -n "Planning\w*BestEffort" src test scripts` -> only the alias witness.
- Each consumer row in section 4: the alias body was
  `return service.getPriorityRecoveryPlanningAnswerSync(n, t)`; confirm each
  new call passes the same node and time.
- Fake deletions: each deleted alias member returned the same expression as
  its sibling sync member (or delegated to it); spot-check with
  `git diff --cached -U6 -- test`.
- Section 6 is a test-fixture finding, not a production change; the
  production composition never had two answers.

## round 2 (stale-snapshot witness)

Repair for verifier verdict B1 (subagent:prfix-verify-r1, REJECT, evidence
only) and N1. Test and ratchet changes only; src is unchanged from round 1.

- `test/rebalancer/priority-recovery-owner-read-settled-snapshot.test.js`:
  the publication double now reads a mutable status, and
  `createRepository({statusDuringRead})` changes it inside the authoritative
  read. Four new currency cases, each run in both directions
  (ESTABLISHING -> PUBLISHED: no deferral; PUBLISHED -> ESTABLISHING:
  deferral). Each case first captures a planning answer through the sync
  pressure helper, then flips the status during the read:
  sync helper (recoveryActive before and after the read), failed
  incomplete-operation read, single-operation visibility read (failure and
  empty), and slow empty entity read. The status flips through the read path
  (the verifier's tests 2 and 3 shape). Its test 1 shape, a flip between two
  direct owner reads with no read in between, is not used: the readiness
  planning memo keeps that answer, which is the readiness owner's memo
  contract. 9 tests, 41 assertions, green on the candidate.
- Mutation table (`resolvePriorityRecoveryPlanningSnapshotForOwnerRead` /
  `isPriorityRecoveryOwnerReadActive`, the verifier's mutate.py, each
  restored by `git checkout` after its run):

  | mutation | round 1 (leaf / top) | round 2 (leaf / top of 9) | new currency tests failing |
  | --- | --- | --- | --- |
  | Promise.resolve(answer) | 11 / 5 | 17 / 9 | 4 / 4 |
  | null | 11 / 5 | 17 / 9 | 4 / 4 |
  | always active | 5 / - | 11 / 8 | 4 / 4 |
  | stale-per-repo (first answer served forever) | 0 / 0 (survived) | 10 / 4 | 4 / 4 |
  | stale-process (one answer across repositories) | 5 / - | 11 / 8 | 4 / 4 |
  | stale-clock (observedAt 0) | 0 / 0 | 0 / 0 (survives) | 0 / 4 |

  stale-clock is the verifier's N2 (out of bar: planning currency is owned
  by the readiness memo). It is not a target of this repair.
- N1: `npm run test:duplication` hint applied; the test baseline in
  scripts/check-duplication.js goes from 629/23624 to 627/23539 (one-way).
  The re-run prints no further hint (src+scripts 37/37, 1187/1187; test
  627/627, 23539/23539). This corrects the figures in section 9.
- N5: `getPriorityRecoveryPlanningSnapshotBestEffort` added to
  DELETED_RUNTIME_TERMS in
  test/scripts/spec-led-runtime-legacy-deletion-guard.test.js (15/15 green).
- Receipt regenerated by
  `node scripts/quest-evidence/priority-recovery-owner-read-snapshot-await.js`:
  pass, 2/2. Settled-snapshot test digest 36cd1e93...; the alias witness is
  unchanged (f7176893...).
- Local runs (thermal-gated, no lab): the witness pair 45/45; dt6
  holder-release 8/8 and drain-parked 8/8. test/rebalancer/*.test.js
  (271 files, 4 batches, LAGRANGE_PLACEMENT=local) had 28 red files.
  26 match the verifier's red set, which is base-red. The other two,
  existing-group-add-topology-guard and interlock-skip-label-fidelity, took
  35-41 s under batch load and pass 2/2 in isolation (about 2 s). They are
  contention reds.
