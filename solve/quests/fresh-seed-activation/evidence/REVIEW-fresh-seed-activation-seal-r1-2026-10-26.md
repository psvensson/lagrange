---
audience: development
documentClass: evidence
---

# REVIEW: fresh-seed-activation seal, round 1 (2026-10-26)

Independent reviewer: Fable (subagent). Read-only. Nothing in any repository worktree
was edited, committed or pushed. Quest branch `work/fresh-seed-activation-quest-20261026`
HEAD `313fda10e` (seal `e67eff9e4`, scaffolding finding `313fda10e`), composed onto lineage
head `work/mg-delivery-resume-r2-20261023` = `085df889d` (merge of 313fda10e; `src/`
byte-identical to the seal base `a51f49929`: `git diff --stat a51f49929 085df889d -- src/`
is empty). All file:line references below are at `085df889d`.

## Verdict: ACCEPT the seal

The sealed statement, the `test-receipt` probe form and the seven receipt ids cover owner
decision 2's outcome and five requirements, claim no recovery, and are red for the truthful
reason (the O3 continuation hold). Nothing found requires a supersession under R09: the
statement needs no change and no receipt id is wrong or missing. Four conditions must be
recorded as findings (and the design amended) before the first attempt; they are design and
witness corrections inside the sealed scope, not seal changes:

1. **C1 (design, required):** the existing sealed negative
   `test/bootstrap/seed-original-attempt-lifetime.test.js:403-435` asserts that
   `startDeferredBootstrapReplicaElections` on a LIVE_ISSUER attempt rejects with
   `CONTINUATION_UNAVAILABLE` (`:413-414, :422`). Requirement 1 makes that exact assertion
   false. The design (§2 row 1, §5 "not weakened") is silent on it. Record which sealed
   negatives change meaning and how (mode-keyed: LIVE_ISSUER admits only admitted openings;
   COLD_RECOVERY / null hold; registration and admission entries hold for a rights reason,
   not a mode reason), so the attempt's edit of that witness is a recorded correspondence
   update, not a silent weakening (R09/R17, constraint `protections-preserved`).
2. **C2 (design, required):** name the engaged negatives that let the receipts discriminate
   the ordered decisions from a mutant that merely deletes the throw at
   `src/bootstrap/seed-original-allocation-startup.js:111` (see §2.4): the witness's R1 and
   R3 observations are positive-only and structurally satisfied on a fresh seed.
3. **C3 (design, required):** the writer `scripts/quest-evidence/fresh-seed-activation.js`
   does not exist (§1.4). State now how receipts 6 and 7 are expressed in
   `scripts/quest-evidence/harness-runtime.js` terms (testFile / anchored testNamePattern /
   shell `command`), or that receipt 7 is hand-recorded with the verification entry's
   identity, which has precedent. Add the writer in attempt 1 before any receipt flips.
4. **C4 (witness, recommended before the first green):** the §2.5 hardening items: sampling
   cost (141 uncached `SELECT *` per macrotask), `opened == declared`, bracketed admission
   samples, and the probe target bound to the configured host.

Why not SUPERSEDE: the only candidate seal defect I examined in depth, constraint
`public-admission-after-handoff` naming "the transport WebSocket listener", is consistent
with this lineage: the bootstrap router is created without `wsPort`
(`src/bootstrap/phases/seed-infrastructure-phase.js:223-238` passes none to
`MessageRouterSetup.create`, so `message-router-setup.js:197` takes the `startServer:false`
branch at `:231`), the listener first starts in `startWebSocketServer`
(`src/bootstrap/bootstrap-service-runtime-methods.js:316`) after `bootstrap()` returns
(`src/lagrange-runtime-startup.js:466-504`), and the sealed negative at
`seed-original-attempt-lifetime.test.js:426-427` already asserts `server === null` and no
self-connection while held. The comment at `runtime-methods.js:295` ("the server is already
started") is stale. Why not REJECT: the witness enters the real public path, replaces no
owner, fails today exactly at the hold, and refuses under the probe mark (measured, §5).

## 0. What I read

`docs/steering/rules.md`; `docs/steering/workflow-guidelines/solver-quests.md`;
`test/guidelines/{fixtures,harness,proof-ladders,regression-policy,release-gate,INDEX}.md`;
`solve/epics/raft-rs-full-cutover/evidence/owner-review-2026-10-26/OWNER-REVIEW-2026-10-26.md:16-27`
(decision 2 verbatim), `:58-63`; `solve/quests/retained-seed-original-handoff/quest.json`;
`.../evidence/INVESTIGATION-original-allocation-custody-unavailable-2026-10-25.md` (§5-§7);
`.../evidence/DESIGN-original-allocation-lifecycle-owner-boundary-2026-10-24.md:288-297`
(Q3/Q4); the contract draft at `a8905df35^` `:120-130, :210-222, :238-270`; the quest's
`quest.json`, `log.ndjson`, `evidence/receipt.json`, `DESIGN-fresh-seed-activation.md`;
`test/bootstrap/fresh-seed-activation.integration.test.js`;
`test/test-helpers/fresh-seed-activation-public-child.js`; the parent witness and child
(`test/bootstrap/retained-seed-original-handoff.integration.test.js:1-140`,
`test/test-helpers/retained-seed-public-child.js`); `scripts/solve/{probes,schema,guards}.js`;
`scripts/quest-evidence/harness-runtime.js`; and every src site the design cites (§3).

## 1. Statement and receipts against owner decision 2

### 1.1 Coverage matrix

| Owner text (OWNER-REVIEW `:16-27`) | Receipt(s) | Measured by | Verdict |
|---|---|---|---|
| "completes protected activation" | `protected-activation-admitted-openings-only` | witness R1 `assertProtectedActivation` (test `:121-138`) over the production core-entry seam (`src/raft/raft-rs-runtime-owner.js:354-359`, `create_node` at `:512`, `campaign` at `:1503`) | covered, positive-only (C2) |
| "durably transfers its original registration and cluster-identity rights" | `original-rights-durable-monotonic-transfer` | witness R2 `assertRightSequences` (`:141-154`) + parent's post-exit durable read `readDurableRights` (`:98-117`) through the store owner `originalAllocationRow` (`store.js:19-29`) | covered |
| "reaches normal service through the supported startup path" | `public-write-and-read-served` (+ `public-admission-closed-until-handoff` "serves after") | child `openApplicationDatabase` CREATE/INSERT/SELECT (`child.js:219-224`); `/readyz` 200 within 30s (`:170-177`) | covered; "public" = the supported embedded facade (`src/query/application-database.js:612-618`), not network ingress (§6) |
| Req 1 "live original issuer only, for openings admitted under its exact allocation" | R1 + receipt 6 negative "COLD_RECOVERY asked to continue still throws" (DESIGN §4) | R1 cannot tell a mode-keyed decision from an unconditional allow (§2.4); the negative can | covered only with C2 |
| Req 2 "UNUSED -> SUBMITTED durably before submission, SUBMITTED -> TRANSFERRED after an exact authoritative committed read" | R2 | sequence exactly `[UNUSED, SUBMITTED, TRANSFERRED]` per right, sampled per macrotask (§2.3); durable TRANSFERRED after exit | covered |
| Req 3 "a missing answer never resets a right" | R2 + receipt 6 (`test/raft/raft-rs-original-allocation-store.test.js:35-66`: SUBMITTED->UNUSED, TRANSFERRED->UNUSED refused without a write) | measurable at the durable writer today. The live-owner half ("resolved by an exact read in the same live owner; timeout or absence never re-arms the INSERT", DESIGN §2 row 3) has NO named witness: no lost answer is induced anywhere | partially covered; C2 names the lost-answer negative (after Q3 places the writer) |
| Req 4 "public admission opens only after the handoff completes, internal activation narrowly authorized" | `public-admission-closed-until-handoff` | R3 `assertAdmissionFence` (`:157-165`): every accepted probe has all rights TRANSFERRED; `/readyz` 200 after return | covered, positive-only: on this lineage both listeners start after `bootstrap()` returns, so phase order alone satisfies R3; a consumer that never asks the decision passes (contract `:254` forbids exactly that) (C2) |
| Req 5 "retained, partial, uncertain and cold mid-handoff states keep their protections and COLD_RECOVERY is never silently authorized" | `retained-partial-uncertain-cold-states-keep-hold` | existing owner witnesses listed in DESIGN §4 (all exist: `test/bootstrap/seed-original-attempt-lifetime.test.js`, `test/raft/raft-rs-original-*.test.js` x7, `test/bootstrap/seed-retained-effects*.test.js` x3) + one new COLD_RECOVERY negative | covered; C1 applies (one of those witnesses changes meaning) |
| "The restart obligations stay visible in the final acceptance" | `same-data-restart-served-or-typed-hold` | R5 (`:208-224`): served row or `code === ORIGINAL_ALLOCATION_HOLD`, rights byte-identical | covered, visible, no recovery claim |
| "Harness reports distinguish harness defects resolved / startup assertions still blocked / fresh-seed acceptance demonstrated" | `independent-verification-and-applicable-gates` detail (DESIGN §4 last row) + constraint `restart-obligation-visible` | report format, not a test | covered as a reporting obligation |

"No more": the statement claims activation, transfer and service; constraint
`owner-decision-2-2026-10-26` and `restart-obligation-visible` disclaim recovery,
two-start and retained-handoff; `receipt.json` `limits` repeats it. No receipt counts for the
parent (`DESIGN §0`). Correct.

"No less": measurable gaps are the two in C2 (lost answer in the live owner; decision vs
phase-order discrimination). Both are measured-by additions under existing receipt ids, so
the seal's receipt list stands.

### 1.2 Probe form and R27

`doneWhen.probe = test-receipt` reads `evidence/receipt.json` and counts required ids whose
`passed !== true` (`scripts/solve/probes.js:86-104`); `done` also needs `status: "pass"`.
It performs no action. `node scripts/solve.js probe --id fresh-seed-activation` in my
scratch worktree: `metric 7 target 0 done=false measuring=true` (log `probe.out`).

The author's R27 reason holds: a script probe would have to run the witness, which starts a
seed. The child calls `refuseUnderProbe('a fresh seed runtime')` at
`fresh-seed-activation-public-child.js:23`, after its imports and before any effect.
Measured: `LAGRANGE_PROBE=1 node test/test-helpers/fresh-seed-activation-public-child.js ...`
exits 1 with `refused under LAGRANGE_PROBE=1: a probe never starts a fresh seed runtime`
and leaves the given directory empty (`r27-child.out`); the witness under `LAGRANGE_PROBE=1`
fails with `fresh-seed child initial exited before report` and the same refusal in the child
output (`r27-witness.out`). Compliant.

### 1.3 Seal-time receipt shape

`receipt.json` is hand-written (`measuredAt`, `reason`, `limits` keys), not produced by
`harness-runtime.js` (which writes `quest`, `testFileDigests`, `generatedAt`,
per-receipt `command`/`failure`). The probe accepts both. The parent's seal-time receipt has
the same hand-written shape and no writer at all (`grep -rl retained-seed-original-handoff
scripts/` is empty).

### 1.4 Receipt writer convention (C3)

In the five other `test-receipt` quests I sampled, the writer and `quest.json` were added in
the same commit (`raft-rs-operation-port-boundary` f4f5b5a6e,
`raft-rs-single-path-partition-cutover` 1aea11baf, `replicated-transaction-decision-and-apply`
0a25d29bd, `partition-replication-restart-attempt-handoff` c280049f7,
`message-group-fresh-identity-membership` 0b205d0d2). So writer-at-seal is the convention and
its absence here is a gap, though the parent set the precedent of deferring it. Constraint
`proof-and-review` makes the writer part of the sealed contract ("recorded into the receipt
by a quest-evidence writer on canonical lab execution with retries 0"), and DESIGN §4 says
attempts add it. Acceptable before the first attempt only if nothing flips to `passed:true`
by hand first.

Two receipts are not expressible as one `testFile` receipt: receipt 6 spans many files
(express as a shell `command` running the list, `harness-runtime.js:200-222`), and receipt 7
(independent verification + land gates) is not a test. Precedent for a hand-recorded
independent-review receipt exists (`solve/quests/participant-control-refusal-provenance/
evidence/receipt.json` `independent-source-and-harness-review: passed: true`;
`cleanup-exception-audit-correspondence` cites evidence files). `harness-runtime.js:6-8`
warns against trusting claims; the land guard independently requires the verification entry
(`scripts/solve/guards.js` `requiresVerification`). Decide the expression now (C3): a
`scripts/checks/` script reading the quest log for an approving `subagent:` verification newer
than the last attempt would be R27-safe and runnable as a shell receipt.

## 2. Witness fidelity

### 2.1 Entry is the production path

`startLagrangeRuntime` (`child.js:194-207`) -> `acquireDataDirectoryProcessOwner`
(`src/lagrange-runtime-startup.js:719-723`), threaded at `:427`, `prepareOriginalSeedAttempt`
awaited at `:438-439`, `bootstrap()` at `:466`. No owner, grant, admission or delegate is
replaced; `createPreparedVirginSeedBootstrapService` is indeed absent from this base. The O1/O2/O4
harness gaps of the investigation cannot apply. Confirmed by the run: the first gate hit is O3
at `seed-partitions-phase.js:388` via `bootstrap-service-seed-delegates.js:77` and
`bootstrap-service-runtime-methods.js:63`, after prepare() issued 47 groups x 3 members.

### 2.2 Observation is passive in semantics

- Core entries: `setActualCoreEntryObserver` (`raft-rs-runtime-owner.js:2070-2072`) is the
  production seam; every `invokeCore` reports `{sequence, operation, groupId,
  runtimeGeneration}` (`:354-359`); `invokeCoreAt` routes through it (`:418-424`). Complete,
  not sampled. `groupId` is the request's `GROUP_ID`, which the preparation owner binds to
  `member.groupId` (`raft-rs-original-allocation-preparation.js:416`), so the comparison with
  `declaration.members[].groupId` is on the owner's own identifier.
- Durable rights: `originalAllocationRow` (store owner) over read-only handles
  (`child.js:81-103`), WAL mode (`raft-rs-durable-store.js:14-19`) so readers never block the
  writer and each `get()` is a fresh read transaction.
- Admission: external TCP connect to the transport port and HTTP `/readyz` from the child's
  own event loop (`:129-168`); BootstrapAPI binds `0.0.0.0` first
  (`bootstrap-api-server-methods.js:55`, `src/constants/network.js:3`), so `127.0.0.1` is
  reachable. `/readyz` is 200 iff the readiness owner's snapshot is ready
  (`src/bootstrap/owners/bootstrap-readiness-owner.js:106-115`).

### 2.3 Can the witness pass while a requirement is violated?

- **Macrotask sampling missing a transient SUBMITTED.** `UNUSED->SUBMITTED` is a durable
  commit (`commitAndReadback`, store `:31-50`) followed by the raft submission, which awaits
  at least one I/O macrotask before `SUBMITTED->TRANSFERRED`. So SUBMITTED is observed. If an
  implementation did the whole sequence without yielding, the sequence would read
  `[UNUSED, TRANSFERRED]` and the witness FAILS (false red, not false pass). A reset
  (`TRANSFERRED->UNUSED->...`) inside one macrotask would be missed; it would need a second
  writer bypassing `ORIGINAL_RIGHT_SUCCESSOR` (`constants.js:49-52`), which the store tests
  refuse (`store.test.js:54-66`), and the post-exit durable read still requires TRANSFERRED.
  Acceptable.
- **Admission probe racing.** Pre-return, no listener exists on this lineage (§ verdict), so
  the transport TCP probe is vacuous today and the race is moot; `/readyz` cannot answer
  before `bootstrapAPI.initialize()` at `startup.js:478`, after registration. The residual
  race (kernel accept before TRANSFERRED, JS callback after) can only appear once a listener
  precedes registration; recommend bracketing each probe with a pre-sample and reporting
  ambiguous brackets (C4) so a future reordering cannot pass silently.
- **A campaign on an undeclared group between samples.** Not possible to miss: the seam is
  complete. An undeclared group cannot even be opened natively without an opening
  (`preparation.js:149-170`, NATIVE refusal). Gap: `assertProtectedActivation` compares
  `campaigned` to declared but not `opened` to declared (`test.js:127-137`); add
  `opened == declaredGroups` (C4).
- **A restart that serves without the retained path.** R5's served branch cannot tell a
  legitimate retained-path serve from a bypass that skips classification; only rights
  byte-identity constrains it (`:223-224`). Receipt 6's existing negatives
  (`seed-original-attempt-lifetime.test.js:385` "a later attempt holds a retained
  declaration") carry that protection, as the design intends. Acceptable; the report must
  say which branch R5 took.

### 2.4 Positive-only observations (C2)

A mutant that replaces the throw at `seed-original-allocation-startup.js:111` with `return`
passes R1 (every campaign is on a declared, opened group because the opening gate already
guarantees it) and passes R3 (listeners open after `bootstrap()` by ordering). The design's
only negative is "a COLD_RECOVERY preparation asked to continue still throws". Name, in the
receipt rows: (a) null/unknown mode holds; (b) a LIVE_ISSUER replica whose opening was not
admitted or consumed is refused (the design says the decision is per replica); (c) with any
right not TRANSFERRED, `startWebSocketServer`, `openExternalTransportAdmission`,
`completeSuccessfulBootstrap` and `/readyz` refuse (the template is
`seed-original-attempt-lifetime.test.js:403-435`, see C1); (d) a lost answer after SUBMITTED
leaves the right SUBMITTED, issues no second INSERT, and an exact read resolves it. (d) is
Q3-dependent and can be specified now.

### 2.5 Fidelity cost and hardening (C4)

- The poll `pollRights` re-arms `setImmediate` forever (`child.js:112-116`) and on every
  macrotask runs `originalAllocationRow` for all 141 members, each a fresh `db.prepare(...)`
  with `SELECT *` plus a `JSON.stringify(member)` comparison (`store.js:9-29`). That is
  hundreds of statement compilations per event-loop turn on the runtime's own thread during
  startup. The observer is passive in semantics but not in cost; on a slow lab host this can
  push the seed into its own deadlines (30s leadership waits, readiness). Measure the cost in
  attempt 1; cache one prepared statement per handle; consider a bounded interval; once Q3
  places the writer, an event observer seam on the rights transition (like
  `setActualCoreEntryObserver`) would make R2 exact and free, with the post-exit durable read
  as the authority.
- `loadDeclaration` (`child.js:63-79`) restates the anchor-row query of
  `preparation.readDeclaration` (`preparation.js:214-219`) because that owner method needs
  directory custody the child cannot hold. Recorded by the author (DESIGN §5). A custody-free
  reader exported by the store (used by both) would satisfy R03; small, Q3-independent.
- No hand-written double of an owner shape: values compared are the owner's constants
  (`STATE`, `COLUMN`, `HISTORY`), rows are read by the owner's reader, the declaration is the
  owner's JSON. No hidden fallback: every observer error is recorded and asserted empty
  (`test.js:183, :213`); a non-returning runtime fails the test; `cleanupError` must be null.
- The admin WebSocket surface (`startup.js:558`) is not probed; the owner decision names
  BootstrapAPI readiness and transport admission, so this is a limit, not a defect.
- Child log noise observed: `MaxListenersExceededWarning ... [BootstrapReadinessState]`
  (`run1-artifacts/initial-child-output.log:1`), pre-existing, not caused by the witness.

### 2.6 Today's measurement (one run, local, thermal ok)

`not ok 1` at `fresh-seed-activation.integration.test.js:179:10`:
`startup refused ORIGINAL_ALLOCATION_HOLD/original-handoff-continuation-unavailable`.
Stack: `seed-original-allocation-startup.js:111` <- `bootstrap-service-runtime-methods.js:63`
<- `bootstrap-service-seed-delegates.js:77` <- `seed-partitions-phase.js:388`
(`startDeferredBootstrapReplicaElections`) <- `:187` (`phasePartitions`) <-
`bootstrap-service-seed-workflow.js:556`. `rightSequences`: 141 SERVICES rights + 1 anchor
identity right (`services-p1-r1`), every one `["UNUSED"]`; `admission: []`;
`observerErrors: []`; `cleanupError: null`; `returnedRuntime: false`; duration 4.2s
(partitions phase 1272ms). Identical to the author's seal-time record (DESIGN §1).

## 3. Design mapping check

Every cited site exists and says what the design says (verified at 085df889d):
`seed-original-allocation-startup.js:106-112` (unconditional throw at `:111`), `:63-69`
(classification HOLD, AUTHORITY); `raft-rs-original-allocation-preparation.js:257`
(LIVE_ISSUER) and `:287` (COLD_RECOVERY), `:352-387` `admitReplica`, `:374-376`
`deferElection`, `:389-396` `#assertCurrent`, `:409-` cold validation, `:149-170` opening
consumption; `seed-partitions-phase.js:338, :388`; `seed-message-groups-phase.js:231`;
`seed-registration-phase.js:107, :653` and the cluster-id CONFIG INSERT at `:629-645`
(nothing consumes `IDENTITY_RIGHT`); `raft-rs-original-allocation-store.js:109-127`
`transitionOriginalRight` (no src caller); `bootstrap-service-runtime-methods.js:299, :339`;
`bootstrap-service-seed-workflow.js:217`; `lagrange-runtime-startup.js:427, :438-439,
:719-723`.

Owners: requirement 1 to the preparation owner's mode (right: `#openingMode` is set only by
`prepare()`/`inspect()`); 2a/2b/3 to the rights writer, placement by Q3/Q4 (right: the boundary
design's Q3/Q4 at `DESIGN-original-allocation-lifecycle-owner-boundary-2026-10-24.md:296-297`
are exactly the writer and the census); 4 to one startup admission decision consumed by the
existing ingress owners (right in principle). Decision-free vs Q3/Q4 split is right for
requirements 1 and 4 and for the writer placement. Gaps to record:

- **G1 (= C1).** `seed-original-attempt-lifetime.test.js:403-435` changes meaning under
  requirement 1; unaddressed.
- **G2.** Requirement 4's decision needs a reader of "every declared right is TRANSFERRED".
  The design names the consumers but not the reader. On this lineage it is the preparation
  owner (it holds the declaration and custody); if Q3 gives the lifecycle owner a read
  operation, the admission decision consumes that. Say so, so the decision is not re-derived
  by an ingress owner (R01/R03).
- **G3.** "The caller sites stay the same" vs "the decision is asked per replica"
  (DESIGN §2 row 1): `startDeferredBootstrapReplicaElections` asks once at `:388` before its
  loop. Per replica means asking inside the loop (and at `:338`/`:231` with
  `options.replicaId`), i.e. the sites do move slightly. Minor.
- **G4.** DESIGN §2 says "`bootstrapOrExit` stays (it has a live caller)"; the investigation
  (§2) and my grep find no caller outside `bootstrap-service.js:709`. One of the two documents
  is wrong; the design should cite the caller or drop the claim (no-legacy directive).

## 4. Quest hygiene

- `quest.json`: `schema solve-quest/2`, `class product`, `epic raft-rs-full-cutover`
  (required unless `fix`, `schema.js:93`), six named constraints `{id, statement}`,
  `sealedAt a51f4992965d...` (40-hex), probe valid. `node scripts/solve.js probe` accepts it.
  The epic's `quests:` front-matter list (`solve/epics/raft-rs-full-cutover.md:11-22`) omits
  this quest (and the parent); `board` computes membership from `quest.json`
  (`commands.js:675-687`), so this is navigation debt, not a validity problem.
- Verification templates: all seven exist in
  `docs/development/verification-templates/INDEX.md:18-26` and fit (admission, recovery/replay
  for the restart, retry loops for the lost answer, concurrency for single submission,
  formation circularity, harness fidelity, owner interaction).
- Log: three findings, all `kind: decision`; `git diff e67eff9e4 313fda10e -- log.ndjson`
  removes nothing. Append-only.
- R17 finding (duplicated fork-and-report scaffolding vs the parent's frozen witness):
  acceptable to leave. The parent's `public-red-before-production` constraint freezes that
  witness; extracting a shared helper would change its digest and is outside this scope
  (R16). Route it to the doubles-migration Quest (owner decision 6) or widen explicitly in
  attempt 1. Note the copies are not owner-shaped doubles, so the fixtures rule's
  "one fixture" clause is not strictly engaged; the no-legacy directive is.
- Duplication ratchet measured unchanged in the scratch worktree:
  `[src+scripts] 46/46 groups, 1439/1439 lines; [test] 679/679 groups, 25717/25717 lines`
  (`duplication.out`), matching the author's record.
- Inherited complexity excess (1773 vs 1755) recorded by the author as inherited at
  a51f49929; the new files contribute none. Not re-measured here.

## 5. What I ran (scratchpad `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/freshseed/`)

- Detached scratch worktree `wt/` at `085df889d`, `node_modules` symlinked to the main
  checkout; removed at the end of this review.
- `probe.out`: `node scripts/solve.js probe --id fresh-seed-activation` -> metric 7, measuring.
- `duplication.out`: `node scripts/check-duplication.js` -> both ratchets unchanged.
- `r27-child.out`, `r27-witness.out`: `LAGRANGE_PROBE=1` child and witness -> refused, no seed.
- `run1.driver.log`: thermal gate `node scripts/checks/wait-for-thermal-headroom.js`. A first
  attempt (19:24) held at CPU 80-89C for 10 polls while two other sessions' test batches ran;
  I stopped that chain (it would have run after exhaustion) and re-ran a gated chain at 19:30:
  `thermal: ok cpu 71C nvme 68C`, no other heavy processes, then
  `LAGRANGE_PLACEMENT=local npm run -s test:file -- test/bootstrap/fresh-seed-activation.integration.test.js`
  -> exit 1 in 5s.
- `run1.tap`: the TAP stream (16.6 KB) with the child's settlement diagnostic;
  `run1-artifacts/initial-child-output.log`: the child's log copied from the witness's
  retained directory `/tmp/fresh-seed-activation-BhP8S3` (removed after copying).

## 6. Limits

- One local run, not canonical lab execution; the result is deterministic at this gate (the
  hold is thrown before any election) and matches the author's record, but the fidelity-cost
  concern in §2.5 is argued from the code and the 141-member cohort, not timed.
- I did not run the receipt-6 witness files or the parent's witness.
- "Public" in R4 is the supported embedded facade; no PG-wire, REST SQL or remote transport
  request is attempted. The owner's "normal service" may or may not require network ingress;
  flagged, not judged.
- The `localhost` resolution on this host is `::1` first (`dns.getDefaultResultOrder() ===
  'verbatim'`); irrelevant today because the REST API binds `0.0.0.0` and the transport
  listener never exists pre-return, but a probe target should be bound to the configured host
  before the witness is relied on across lab hosts (C4).
- No subagents were used; no files outside the scratchpad were written.
