# Closeout plan: steps from the current lanes to a main merge (2026-10-17)

Status snapshot and work ordering requested by the owner on 2026-10-17; not a
new authority, acceptance change or completion receipt. Binding sources it
orders, never rewrites: the epic's completion criteria (parts a, b, c), the
owner rulings of 2026-10-04 (closeout) and 2026-10-05 (integration order,
certification, closeout shape), the alpha single-path decision of 2026-10-13,
and the sealed oracle `solve/oracle/raft-rs-full-cutover.json` (metric 8,
target 0, status `transport-predecessor-in-progress`). This file is updated
by appending dated status lines under "Tracking"; earlier lines stand.

## 1. Where the work is (measured 2026-10-17)

`origin/main` has moved only by nightly formation-trend records since the
rs-raft lanes forked (merge-base of the creation lane with main is
`d60c30921`, 2026-10-04; main is 13 inert commits ahead of it). The cutover
therefore lives in branches that have diverged from EACH OTHER:

| Branch (origin unless noted) | Role | Relation to the creation lane `work/rs-raft-event-reconciliation-20261016` (89e70949f) |
| --- | --- | --- |
| `finalize/zero-liferaft-2026-10-02` (PR #73 to main, draft; head 6df3ec5e1) | the zero-Liferaft integration PR, exact-SHA qualified 2026-10-07 | 12 commits NOT in the lane (merge-base 26bdc07e3) |
| `integration/rs-raft-candidate-20261011` | candidate: FreshMG C1/C2 + TX1 increments 1-4 + C0 record reconciliation + ratchet repairs | 59 commits NOT in the lane; lane 381 ahead of their common base |
| `integrate/rs-raft-contract-first-20261008` (PR #104) | C0 contract-first canonical continuation | 9 commits NOT in the lane; lane 528 ahead |
| creation stack PRs #127-#134 (this lane) | service-instance selection, creation intent, bound bootstrap, genesis, event reconciliation, serving/publication/retirement | contains `handoff/rs-raft-safety-first-20261010`, `work/freshmg-registered-learner-read-20261009`, `resume/rs-raft-runtime-recovery-20261012`, `continue/rs-raft-control-pause-census-20261014` |
| `integrate/rs-raft-2026-09-30` (LOCAL only, primary checkout, another agent's 18 staged paths) | replica-lifecycle r8 D1-D11 integration from 2026-09-30 | 311 commits not on main, forked before every lane above (merge-base e0b0854f3); not pushed; must not be touched by this lane |

Open quests in the epic: 23 (board 2026-10-17). The long poles by attempt
count: `zero-liferaft-active-runtime` (77), `message-group-fresh-identity-membership`
(50), `replicated-transaction-decision-and-apply` (47). `cutover-transition-authority-review`
(C0) last stood REJECT (truncated fork; canonical continuation = PR #104).

## 2. What "mergeable" means here (the bar, not restated)

- Epic part a: every active consensus group rs-raft; no selector/fallback;
  old durable state refused; message groups/worker/WASM rs-raft or removed;
  measured election settings enabled and re-certified; runtime blast radius
  owned; snapshot/recovery rs-raft; old files and dependency gone; zero-reference
  ratchet green; exact-main release proof durable; Q0 READY; fresh-identity
  message-group ADD/promotion proven and mg-1 replicated off the seed.
- Closeout shape (ruling 11): integrated PR head, each merged quest SHA,
  verifier verdicts, static/integration/lab results, exact certification
  topology, release blockers vs follow-ups, three consecutive certification
  formations passing at one frozen SHA (five distinct machines, host-level
  spread, any spent wait fails, durable per-run evidence with digests).
- Merge mechanics: independent verification before merge; the owner's
  authenticated GitHub approval plus an append-only quest-log decision naming
  the exact merge SHA; a GitHub-merged head has no corpus proof until
  `npm run publish -- --post-merge <sha>`; then the parked governance quests
  A and B land on the new main.
- Part c stays separate: PG-wire DML row counts, `RETURNING`, 2PC atomicity
  at split/merge, in-place upgrade from builds that moved message groups. An
  epic-level "no regression from main" never clears one of them.

## 3. Steps, in order, with the acceptance each must show

### Step 1. Finish the creation lane to a bounded closure (owner: this lane)

- 1a DONE 2026-10-17: serving grant, receiver-local publication,
  RETIRED-before-CLOSED (89e70949f; verified APPROVE; lab-accepted).
- 1b IN FLIGHT: amendment A2/A2' bounded owner-side re-decide for slot
  transitions (owner decision 2026-10-17; vetted; Opus implementer running).
- 1c discovery stage: endpoint/services-row/ACTIVE projection and role/leader
  publication for bound replicas with the instance-qualified identity; the
  production `creationWake` consumer wired into the operation owner; F-M1/F-W2
  witnesses; `CONSUMER_ABSENT` observability.
- 1d recovery stage: COMPLETED-row re-entry, restart-scan retirement custody
  (`service-lifecycle-recovery.js` generic rows), intact restart with metadata
  unavailable, by-path tombstone `storage` field.
- 1e terminal landing of `wasm-creation-genesis` with its eight receipts
  (`contract-approved`, `creation-native`, `recreation-mutation`,
  `async-custody`, `process-recovery`, `writer-completion`, `static-cone`,
  `independent-final-review`) through `solve land`.
- Acceptance: quest probe done; retained lab selection green at the exact tip;
  the three lane reds recorded 2026-10-17 (`durable-commit-replica-kinds`,
  `wasm-service-group-on-raft-rs`, `wasm-service-replica` unit) owned and
  fixed or formally parked by their owners before step 2 completes.

### Step 2. Compose ONE integration candidate (owner: integration lead; start as soon as 1b lands)

- Branch `integration/rs-raft-candidate-<date>` from the creation lane tip;
  merge in this order, one merge per commit, hooks enabled, no `--no-verify`:
  (i) PR #73 head (12 commits; exact-SHA qualified), (ii) the 2026-10-11
  candidate (59 commits: FreshMG C2 component, TX1 increments, C0 record
  reconciliation, ratchet repairs), (iii) contract-first (9 commits).
- Quest logs: union append-only per quest (the TX1 and C0 logs forked; the
  codex union recipe is recorded in the 2026-10-12 handover); never truncate.
- Conflicts resolved through the owning module, by the owner's reading, never
  by taking one side wholesale; every resolution a named finding.
- Regenerate metadata, owner-debt inventory and import-graph seal; ratchets
  tightened on hints, never raised; literal/complexity/duplication reds repaired
  at their owner.
- OWNER DECISION NEEDED before (iv): whether the local
  `integrate/rs-raft-2026-09-30` work (replica-lifecycle r8 D1-D11, 311
  commits, unpushed, another agent's staged paths) is composed, superseded by
  the later lanes, or archived as a preservation ref. This lane will not touch
  it; the question is raised here and in the owner's next session.
- Acceptance: one pushed candidate head; retained lab selections of every
  merged lane green at that head; full corpus on the lab (all shards, one
  frozen SHA) with every red classified at base; static gates green.

### Step 3. Close or park the epic's open quests on the candidate head (owners: each quest)

Required to close (part a and rulings): fresh-identity message-group
ADD/promotion with mg-1 replicated off the seed (MG1); TX1 with all eight
receipts and the alpha single-path deletions (no sessionId transport fallback,
no local BEGIN/PREPARE/COMMIT engine, no competing prepared-state
reconstruction); C0 authority review to APPROVE on the canonical continuation;
snapshot-receiver-admission and snapshot-lifecycle-staging-boundary;
replica-opening-history; startup-refusal-cleanup-custody;
replica-cleanup-host-custody; zero-liferaft-active-runtime (zero-reference
ratchet, old files and dependency deleted); measured election settings
(`pre_vote`, `check_quorum`) enabled and the disruption matrix re-run through
the production port; runtime failure isolation proven or bounded and approved.
The remaining open quests (seed-release and participant-release family,
inbound liveness/extent, storage reservation lost-outcome, wasm-writer-slots,
alpha single-path, ordering completion consumer, control proof amortization)
close, fold into one of the above by owner decision, or park with a recorded
reason. The follow-up quests of part b (`message-group-foreign-replica-startup-sweep`
REQUIRED before any in-place upgrade claim; `move-replica-handoff-deletion`;
`group-retirement-operator-retirement-fact`; `single-unresolved-operation-owner`)
stay follow-ups unless an owner ruling pulls one in.
Acceptance: epic oracle metric 0; Q0 READY for core convergence.

### Step 4. Prove the frozen candidate head (owner: integration lead; lab)

- Full corpus on the lab at the exact head (lab-first; placement by
  discovery, never hardcoded hosts; thermal gates; one exact PID per kill).
- Static gates and ratchets green (`npm run test:static` set).
- Three consecutive certification formations at the SAME frozen SHA on five
  distinct eligible machines with host-level spread, publication convergence
  independently observed with the stability window, any spent wait = FAIL,
  manifest/verdict/gates committed per run with node-log digests recorded on
  the quest log.
- Acceptance: three passes in a row; a red restarts from run 1 after its fix.

### Step 5. Closeout report and independent verification of the integrated head

- Report in the ruling's three parts: conditions met (with the merged quest
  SHAs and verifier verdicts), follow-up quests created, release blockers that
  remain (part c, each with its owner).
- One independent verifier (verification protocol v2, category-complete) over
  the integrated head and the report; REJECT names every finding in one round.
- Acceptance: APPROVE recorded on the epic's quest records.

### Step 6. Merge and publish

- PR to main from the candidate (supersedes PR #73 or fast-forwards it), draft
  removed only after step 5.
- Owner's authenticated GitHub approval + append-only quest-log decision
  naming the exact merge SHA; receipt-route authorisation finding on top of
  the merge.
- After the GitHub merge: `npm run publish -- --post-merge <sha>` so the
  corpus proof binds the merged head; then land the parked governance quests
  (A `src-changes-land-through-the-solver`, B `verification-binds-and-classes`)
  on the new main in that order with fresh approvals.
- Release 0.3 is a separate gate: part c items are fixed or excluded by the
  supported-contract documentation before any release claim.

## 4. Rules that govern every step

Systemic, never local (census consumers, one owner per subsystem and per
interaction); lab-first for suites and batches; independent verifier before
any src lands; one writer per worktree; preservation pushes for every unit;
no baseline raises; first failures preserved; read the owner's code in full
before changing it; red signatures matched against the base before being
called known.

## 5. Tracking (append dated lines; do not edit earlier ones)

- 2026-10-17 plan written; step 1a done (89e70949f); step 1b in flight;
  owner question for step 2 (the local 2026-09-30 integrate work) open.
- 2026-10-17 step 2 conflict probe (scratch worktree at 89e70949f, each merge
  aborted): PR #73 head merges clean (12 commits: CI release-proof delegation,
  PR73 metadata/seal refresh, two test conformances; 3 files); contract-first
  merges clean (9 commits, contracts/docs/analysis; 8 files); the 2026-10-11
  candidate conflicts in 9 files (src/raft: committed-membership-context,
  committed-membership-read, operation-port, peer-identity + constants,
  runtime-owner; src/rebalancer: message-group membership authorization and
  permit; test/shards/impact-contracts.json) with 131 clean changes. None of
  PR #73's 12 commits is in the candidate. Composition order stands: lane tip
  -> #73 -> contract-first -> candidate (conflicts through the raft port and
  message-group membership owners).
- 2026-10-17 step 2 conflict analysis (Opus analysis agent, read-only; full
  report `composition-conflict-analysis-2026-10-17.md`, scratch resolutions
  under the session scratchpad `compose/m3/`). Finding, systemic: eight of the
  nine conflicts have one cause. The creation lane took its FreshMG content
  from the unreviewed preservation snapshot 4151a3ab4 (byte-identical for
  these files to `checkpoint/rs-raft-preservation-20261012T040836Z/freshmg-wip`
  bfd5611e7), an unreviewed child of the candidate's reviewed C2 commit
  50a003b86 that implements "option D" (a stored apply-time PROMOTE fact in a
  new `promotion_admission` peer-reservation column, `design-promotion-history-2026-10-11.md`).
  The snapshot copied 11 of option D's 19 source files and none of the new C2
  files (learner-catch-up acknowledgement, learner-join, CREATE-admission
  handler). With the helper missing, the lane quest
  `message-group-c2-orphan-removal-alpha` (406ceac1c, 3 of 5 receipts) judged
  the promotion/successor code unreachable and deleted it with its exports in
  the membership authorization and permit modules, keeping the raft-side half
  of option D. In the candidate that code is the reviewed C2 component and is
  reachable. Consequences in the lane today (unverified by the lead, inferred
  by the analysis from code): the raft-side option-D fragment has no witness on
  either branch; once C2 can promote, every snapshot image taken after a
  managed PROMOTE is refused by the exact-key reservation check, the port
  throws `PROMOTION_ADMISSION_CONFLICT` on a folded managed PROMOTE without a
  stored fact, and an `ALTER TABLE` migration exists that the alpha
  single-path decision forbids. Recommended resolution (option A): the
  candidate's reviewed C1/C2 wins (keep theirs for the four raft identity
  files and the two membership modules; combine the operation port and
  runtime owner keeping only the lane's own opening-history/APPLIED_PROGRESS/
  close work; union `impact-contracts.json`; revert two cleanly merged files
  that still carry option-D bytes), and option D returns to the
  `message-group-fresh-identity-membership` quest from bfd5611e7 as design
  work. Expected reds after composition: the membership branch-authorization
  O1 key-order negative (take theirs for two fixture lines), the committed-
  membership census (two lane readers to justify), ratchets to repair without
  raising. Both-touched source files to review by owner: message-group
  consensus port and service state, replica-create-admission owner, status
  observation, snapshot-install; possible R01 gap (learner CREATE path outside
  the lane's host cleanup-custody owner).
- 2026-10-17 OWNER DECISION NEEDED (2): option A contradicts the sealed lane
  quest `message-group-c2-orphan-removal-alpha`. Under R09 it needs an explicit
  supersession entry (or owner retirement) with the reason that its premise
  (unreachability) came from the incomplete snapshot. Until ruled, step 2
  composes #73 and contract-first (clean) and stops before the candidate.
- 2026-10-17 lead check of the analysis' lane claims (grep, existence only):
  the option-D fragments exist in the lane's five raft files
  (`raft-rs-committed-membership-context.js`, `-read.js`, `raft-rs-operation-port.js`,
  `raft-rs-peer-identity.js`, `-constants.js`); `PROMOTION_ADMISSION_CONFLICT`
  is thrown at `raft-rs-peer-identity.js:77,268` and `raft-rs-operation-port.js:267`;
  no test mentions `promotionAdmission` (unwitnessed, confirmed). The
  "ALTER TABLE migration" claim is NOT confirmed in the lane (`promotion_admission`
  appears in no schema or migration file there); it may describe bfd5611e7's
  own files. The orphan-removal quest's statement itself names the ephemeral
  snapshot as the island's origin, which supports the analysis' root cause.
- 2026-10-17 OWNER DECISION (1) RULED: "absolutely go for the bound version
  for wasm". The bound creation route is THE formation path for every
  `wasm_component` runtime service; the unbound WASM group formation (bootstrap
  membership from observed services rows, `createReplica`/`startReplica`
  unbound branch for wasm_component) is deleted in stage 1c with its witnesses
  superseded by appending. Recorded in the stage-1c design (D0) and the quest log.
- 2026-10-17 OWNER DECISION (2) RULED: option A. The candidate's reviewed
  C1/C2 wins at composition; `message-group-c2-orphan-removal-alpha` is
  superseded by `message-group-fresh-identity-membership` (decision entries
  appended to both quest logs; the terminal SUPERSEDED entry is written by the
  composition step once `audit:closed-quest-shape` is satisfied); option D
  returns to the FreshMG quest as design work. Step 2 now composes lane tip ->
  #73 -> contract-first -> candidate with the analysis' resolutions, after
  stage 1b lands.
- 2026-10-17 stage-1c design vet: REVISE (B1-B9 blocking, R1-R24 required; report
  retained under the quest's `evidence/design-vets-20261017/`). Lead resolution:
  scope split. The sealed CONTRACT-R2 (:217-220) and the quest statement keep
  `wasm-creation-genesis` at embedding scope; Revision 1 of the design re-scopes
  stage 1c to the node-side bound CREATE/REMOVE routes, the discovery rows and
  the node-local wake consumer in embedding (the C6 handler integration), and
  routes the production items (B1 journal wiring, B2 node owners, B3 slot read,
  B5 planner discriminator, B9 held-CREATE time budget, R14 cross-node wake, B8
  deletion unit, R1-R3/R6-R8/R17-R19/R24) to a new quest whose charter is
  `activation-quest-charter-2026-10-17.md`. OWNER DECISIONS NEEDED (3): (a)
  confirm the split (or widen the sealed contract instead); (b) B9 held-CREATE
  time budget (recommended: a real HELD workflow step with its own owner timeout
  constant); (c) B8: delete the unbound replica shape as its own unit after
  activation (recommended) or keep it for tests.
- 2026-10-17 stage-1c re-vet of Revision 1: REVISE (RB1-RB5 blocking, RR1-RR11
  required; scope split CONFIRMED sound). Revision 2 appended resolving each:
  journal-only `readRetainedCreation` for REMOVE recovery (never the reserving
  recover), `resumeConsensusCreation` = recover + bootstrap, CREATE route order
  recover -> bound / classify the row -> generic path untouched for native_js,
  Cells and built-ins, bound-class = wasm_component AND not Cell AND not
  META_SERVICE_ID, binding-first remover deriving the physical endpoint id,
  address from the node's `nodeAddress` through the WASM dependency owner,
  PRESENT hop named (driver `markServicesRowPresent`), `ReplicaStatus.HELD`
  fail-closed, writer answers mapped to PUBLISHED_UNPROJECTED, C6 fixture
  prerequisites listed (handler cache + CDC, replica cache + CDC, no injected
  role writers, real emitter, request-literal owner), cells (a)-(i) and five
  mutations. Focused re-vet of Revision 2 launched.
- 2026-10-17 stage-1c focused re-vet of Revision 2: REVISE (F2 blocking: the
  address owner's value is a `host:port` string, the endpoint/services address
  is a host; F1/F3-F10 required). Revision 3 appended: `endpointHost` derived
  by the existing `resolveEndpointAddress` owner, deferral = existing FAILED +
  `deferRetry` + code with the honest coordinator statement, result-shape
  tables for resume and REMOVE, token-keyed PRESENT mark, HELD re-entry guard,
  shared-enum witness superseded, singleton cache fallback kept. Implementation
  proceeds from Revisions 1-3 with the three vet reports binding; the verifier
  judges. D0's "deleted in stage 1c" superseded by a lead decision entry under
  the owner's unattended directive (decision (c) still open to the owner).
- 2026-10-17 composition (step 2) hand-back: merges i (#73) and ii
  (contract-first) committed on `integration/rs-raft-candidate-20261017`
  (HEAD d5fdaa312); merge iii (candidate 10c2f0610) resolved per option A and
  STAGED, refused by the pre-commit hook on six guideline hits inherited from
  the parents (literal + two silent catches in the membership owner-claim
  module; three decision boundaries in the raft runtime owner and snapshot
  install). Lead ruling: repair at the owner inside the merge, no bypass, no
  baseline raise. Also found: the candidate closes the C0 quest
  (`cutover-transition-authority-review` solved 2026-10-11; the plan's "last
  stood REJECT" is stale for the composed tree); the orphan-removal quest's
  terminal SUPERSEDED entry plus the closed-quest-shape deletion of 95 files
  causes two `documentation-current` reds in another quest's evidence (owner
  to settle); the committed-membership census is red at both parents (union);
  `participant-release-native-application-order` hung once in 8 composed runs
  (lab repeat batch owed); unused-export 1447/1415 (all lane entries),
  duplication 26393/26345, complexity 1798/1755 inherited; five both-touched
  src files unreviewed semantically; the analysis' R01 risk unchecked.
- 2026-10-17 composition COMMITTED: `integration/rs-raft-candidate-20261017`
  @ `99d145ace64c5725a9777fe136a3dab8d8bedb84` (merge iii of 10c2f0610 on
  d5fdaa312; hooks enabled; nothing bypassed; pushed by the lead). Six
  inherited guideline hits repaired at their owners inside the merge
  (`ROW_PREDICATE_CONJUNCTION`; two empty catches record through the existing
  `noteUncertainMembershipWrite`, recorder moved into owner-claim and
  re-exported by authorization to avoid a cycle; named empty states
  `NO_STATUS_OBSERVATION`, `NO_RUNTIME_REPLACEMENT_FAILURE`,
  `NO_RECEIVER_LIFECYCLE_INSPECTION` keeping the value null). Post-commit:
  quest-log append-only clean against both parents, fast-static ok, shards OK,
  impact contracts PASS, option-D grep 0. Owning witnesses 24/27 green; the
  three reds (`partition-write-leadership-transfer-committed`,
  `settled-replay-preserves-result`, `operation-port-boundary` subtest 2) are
  lane-inherited (green or differently red at the candidate). C0
  (`cutover-transition-authority-review`) is SOLVED in the composed tree
  (candidate 2026-10-11); the earlier "last stood REJECT" line is superseded.
  Report retained: `composition-report-2026-10-17.md`. Open: the
  `documentation-current` conflict (two evidence files of
  `participant-release-held-recovery-continuation` cite the deleted
  `message-group-c2-orphan-removal-alpha/evidence/independent-implementation-review.md`
  by sha256; the blob survives at c6006c745; owner of that quest to add a
  preservation pointer); the census red (union of both parents); R01 learner
  CREATE path vs host cleanup custody; five both-touched src files unreviewed
  semantically. Next: lab (108 files, four hosts) + repeat batch of the
  once-hanging `participant-release-native-application-order`, then an
  independent verifier of the composition.
- 2026-10-17 proposal for the `documentation-current` conflict (owner to rule;
  no edit made): the `documentation-current` audit refuses any backticked
  repository path that no longer exists (`scripts/check-documentation-current-state.js:300`),
  and `closed-quest-shape` refuses non-minimal files in the closed
  orphan-removal quest, so neither restoring the file there nor keeping the
  citation can satisfy both. The C2 independent review is evidence of the
  superseding quest: move
  `solve/quests/message-group-c2-orphan-removal-alpha/evidence/independent-implementation-review.md`
  (blob preserved at c6006c745, sha256 `0429ae58...`) to
  `solve/quests/message-group-fresh-identity-membership/evidence/` unchanged,
  and repoint the two citations in
  `participant-release-held-recovery-continuation/evidence/integrated-composition-content-review-v1.md:17`
  and `integrated-composition-evidence-review-v2.md:21` to the new path with
  the same digest (a path change only; the cited bytes and digest stand).
  Lab on the candidate (#145-#150) and the independent composition verifier
  are in flight.
- 2026-10-17 candidate lab (99d145ace, 108 files, four hosts, #145-#148):
  91/108 green; 17 red files; the once-hanging
  `participant-release-native-application-order` passed both repeat runs
  (#149, #150). Ten of the reds were already classified lane-inherited by the
  composer or the stage-1 record (replica unit, durable-commit-replica-kinds,
  wasm-service-group-on-raft-rs, settled-replay-preserves-result,
  partition-write-leadership-transfer-committed, operation-port-boundary,
  committed-membership-census, replica-create-admission-recovery,
  native-custody-handoff, evidence-o1-static). Seven are unclassified and
  under parent controls (#151 lane tip, #152 candidate-20261011 tip):
  `fresh-join-registration-runtime-replacement.integration` and
  `leader-metadata-validation.integration` ("seed bootstrap should succeed"),
  `node-bootstrap-consistency.property` (timeout), `write-exactly-once-schedules`
  (c1), `unknown-outcome-same-entry` (W1), `message-group-learner-promotion-selection-guards.integration`
  (subtest 12), `message-group-membership-claim-cache.integration`. Any of
  these green at both parents is composition-caused and blocks step 2.
- 2026-10-17 independent verification of the composition at 99d145ace
  (Fable; `composition-verifier-verdict-2026-10-17.md`): PROVISIONAL REJECT,
  narrow. Byte-faithful on every conflicted path (keep-theirs blobs equal the
  candidate's; the two combined files reproduced by an independent three-way
  merge; impact-contracts a true union; FreshMG and C0 quest logs unions with
  nothing dropped; append-only clean against all parents), the five
  both-touched files judged compatible with their owning witnesses green, the
  six guideline repairs behaviour-preserving with no baseline change, the
  orphan-removal terminal entry and shape audit correct, every lab red
  classified: 16 lane-inherited (13 confirmed by own runs at c6006c745), the
  census inherited from both parents, and ONE composition-caused red (F1):
  `message-group-learner-promotion-selection-guards.integration` subtests
  12-14, whose fixture injects `PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE`,
  a constant the lane deleted (d35d8828c) with its retryable class; a variant
  with a currently retryable error passes 22/22, so the pinned property holds.
  Fix (test-only, two lines) sent to the composer. F2 = the
  documentation-current conflict (owner item, proposal above). F3 = R01: the
  learner CREATE path's failure cleanup runs outside the host custody owner
  (inert today: no production root composes the join host; owner check before
  one does). Parent controls #151/#152 pending; APPROVE expected after the F1
  fix is re-verified.
- 2026-10-17 F1 fixed by the composer as a separate commit `1efdfc723` on
  `integration/rs-raft-candidate-20261017` (pushed by the lead): the
  promotion-selection-guards fixture now injects `ERRORS.NO_HANDLER_FOR_ADDRESS`
  (the only entry of `RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS` on the
  composed tree) with a supersession comment citing lane commit d35d8828c;
  19/22 -> 22/22 locally; lab confirmation of the two composition-touched
  witnesses submitted at 1efdfc723. Parent controls #151/#152 still running.
- 2026-10-17 F1 confirmed on the lab at 1efdfc723 (#153: promotion-selection-guards
  22/22, membership-branch-authorization 115/115). The first parent controls
  (#151/#152) were REFUSED by the bridge with SOURCE_FILE_UNAVAILABLE because
  the 17-file red list mixed files that exist at only one parent (the
  promotion-selection-guards file is absent at the lane; native-custody-handoff
  is absent at the candidate); resubmitted filtered per parent as #154 (16 files,
  lane tip) and #155 (16 files, candidate tip). Lesson for the bridge recipe:
  a control request must contain only files present at its exact SHA.
- 2026-10-17 parent controls landed (#154 lane tip b3793c7e5 on tv-dator, #155
  candidate 10c2f0610 on adam-laptop; records retained): at the lane ALL 16
  red files are red; at the candidate 14 of 16 are GREEN (red only the
  committed-membership census and operation-port-boundary, which are red at
  both). No red at the composed head is green at both parents: the
  composition is faithful and F1 was its only own red. SYSTEMIC FINDING for
  step 3: the creation lane carries 14 files that the reviewed 2026-10-11
  candidate has green, i.e. regressions introduced in the lane's own history
  after the common base e7c89f4b5 (2026-10-12; 293 first-parent commits):
  `fresh-join-registration-runtime-replacement.integration`,
  `leader-metadata-validation.integration`,
  `message-group-membership-claim-cache.integration` (all three: "Seed
  participant release failed" in the seed's partition phase),
  `node-bootstrap-consistency.property` (timeout), `settled-replay-preserves-result`
  (W1 setup write), `partition-write-leadership-transfer-committed`,
  `unknown-outcome-same-entry` (W1), `write-exactly-once-schedules` (c1),
  `replica-create-admission-recovery`, `message-group-native-custody-handoff`,
  `evidence-o1-static`, `durable-commit-replica-kinds`,
  `wasm-service-group-on-raft-rs`, `wasm-service-replica` unit. Prime suspect
  by size and subject: lane commit d35d8828c (2026-10-13, "remove legacy
  transaction engine; retain rs-raft recovery HOLD", 239 files). Localization
  probes submitted: the 16 files at d35d8828c^ (`probe/lane-red-before-d35d8828c`)
  and at d35d8828c (`probe/lane-red-at-d35d8828c`). Repair belongs to the
  owners of each failing path (seed participant release, writer codec, replica
  unit effects, exactly-once write schedule), on the composed candidate.
- 2026-10-17 STEP 2 COMPOSED AND VERIFIED: final independent verdict on
  `integration/rs-raft-candidate-20261017` @ `1efdfc723a41b81209ba62e72c625f2b96b5b23a`
  = APPROVE (`composition-verifier-verdict-2026-10-17.md`, three dated
  sections: the narrow REJECT on 99d145ace, the F1 re-verification, the final
  verdict). Faithful composition on every conflicted path; every red at the
  head inherited from a parent (16 lane-inherited confirmed at the exact lane
  tip with identical failing subtests and first errors; the census from both);
  F1 resolved by the test-only supersession; F2 (documentation-current) and F3
  (learner CREATE cleanup custody) recorded as owner items. The candidate is
  the head on which step 3 proceeds; the lane's 14 regressions versus the
  reviewed 2026-10-11 candidate are step 3's first work item (probes #156/#157
  localizing the introducing commit).
- 2026-10-17 OWNER RULINGS on the seven decisions presented ("i go with your
  recommendations"): (1) scope split confirmed; (2) HELD workflow step with its
  own owner timeout (activation quest); (3) deletion of the unbound shape as
  its own reviewed unit after activation; (4) move the C2 review file into the
  FreshMG quest's evidence and repoint the two citations (applied on the
  candidate by the lead); (5) justify the two lane readers in the
  committed-membership census (step 3, on the candidate); (6) learner CREATE
  cleanup custody = activation-quest precondition; (7) repair the 14 lane
  regressions at their owners on the composed candidate after the probes
  localize the introducing commits.
- 2026-10-17 lane-regression probes (#156 at d35d8828c^ = e6d43bc1a on
  tv-dator, #157 at d35d8828c on lenovo-laptop; 15 files each, identical
  results): 12 of the 16 are ALREADY red at both, so the legacy-engine removal
  is not their introducer; they entered between the common base e7c89f4b5
  (2026-10-12) and e6d43bc1a (150 first-parent commits). Three are green at
  both and red at the lane tip (`operation-port-boundary`,
  `wasm-service-group-on-raft-rs`, `wasm-service-replica`): introduced between
  d35d8828c and c6006c745 (142 commits). Two lab-driven first-parent
  bisections launched (scratchpad `bisect/bisect-lab.sh`; probe branches
  `probe/bisect-setA-<n>` on lenovo-laptop, `probe/bisect-setB-<n>` on
  tv-dator); results to `bisect/setA.result`, `bisect/setB.result`. Decision 5
  (census readers) delegated to an Opus agent on the candidate (brief
  `briefs/census-readers-20261017.md`). Decision 4 applied and pushed on the
  candidate as 68de6d1f6.
- 2026-10-17 decision 5 applied on the candidate: `e7a3525a5` (pushed; test-only
  + regenerated metadata) makes `committed-membership-census` green 9/9 by
  justifying, with records, the readers the census did not know: the bound
  WASM genesis WITNESS read (`wasm-creation-genesis.js`; GENESIS-CONNECTION
  acceptance, design section 1, D6'/N16), the participant release facts'
  WITNESS/RETIREMENT reads (`partition-participant-transaction-pause.js`;
  cutover-interaction proposal rows accepted 2026-10-11, owner-cycle-removal
  design 19f3f09c9; caveat: the source first appeared in the ephemeral snapshot
  4151a3ab4), the candidate's registered-learner read
  (`message-group-membership-recipient.js`; contract
  `message-group-registered-learner-read.md`); ST4 stamp origins gain the
  learner recorder and the genesis validator; ST5/V1a follow the
  `partition-reopen-options.js` extraction. Every list stays an exact
  `deepEqual` of named files. Commits 68de6d1f6 and e7a3525a5 are docs/test-only
  after the APPROVED 1efdfc723 and are covered by the next independent
  verification of the candidate (with the lane-regression repairs).
- 2026-10-17 stage 1c round-1 verification (Fable, verify-1c at 04f1a9112):
  PROVISIONAL / REJECT narrow. Required V-F1: a CREATE under a different
  operation id for a HELD replica re-entered the request's id and its refusal
  overwrote the creation-naming memo, so the next REMOVE orderly-stopped the
  bound replica generically while its slot stayed ADMITTED (the orphan vet's
  B4). Nine notes V-N2..V-N10 (wake-token honesty, CLOSED-wake re-entry,
  PRESENT latch unwitnessed, fixture leftovers, stale literal baseline outside
  the diff, REMOVE journal dependency, no coupled pair). Lead ruling: in scope;
  design Revision 5 (RV5.1-RV5.7) appended; quest log carries attempt (round
  2), verification reject (subagent:a20413205d1d4bd1c) and the decision;
  round-1 evidence retained under
  `evidence/activation-discovery-20261017/verifier-1c-round1/` (184 files).
  Round 3 (corrective) delegated to the Opus implementer (brief
  `briefs/implementer-stage1c-r3.md`); then narrow re-verification + a
  changed-cone lab run at the round-3 snapshot; the round-2 85-file lab run
  (#161-#163) stands as the classification of the unchanged files.
- 2026-10-17 ~16:05Z LAB BLOCKED (owner action needed): lab job #159 (the
  owner's Harnessd PR proof) is UNCERTAIN (v0.1.6 TAP count classification, lab
  issue #165); the bridge holds every later source job in WAITING_APPROVAL
  (`LOCAL_PAUSE_OR_UNCERTAIN_PRIOR_EXECUTION`): stage-1c #161-#163, bisection
  good-end jobs #164 (set B) and #166 (set A). Requests expire 3 h after
  submission. Bisection B's waiter timed out (script exit 2); relaunch with
  `bisect/bisect-lab-v3.sh` and `REUSE_good=<request_id>` once the lab resumes.
- 2026-10-17 stage 1c round 3 (corrective, Opus) handed back: RV5.1-RV5.6
  applied in the lane worktree (uncommitted); six new unit witnesses red first
  on the round-2 source; nine mutations killed (VM01, VM11, VA7, VA8 + four by
  mechanism); statics 0 new vs base; U 33 / N 3 / lifecycle 62 / handler 38 /
  publication 25 green locally. Snapshot `9f83c7be34e19e47feebe44a8daddee6030f4df1`
  = `wip/rs-raft-serving-publication-4` (pushed). Changed-cone lab job #167
  (request 9ea4b1bffc92426389ab5c9124248dcb, 18 files, lenovo-laptop, 12 h
  expiry) queued behind the owner's reconciliation. Narrow re-verification
  requested from the round-1 Fable verifier (same agent, context intact;
  verdict -> scratchpad `verify-1c/verdict-r3.md`). Implementer F-items for the
  verifier to judge: F-r3-1 `events` kept (shared helper writes it), F-r3-2
  HELD memo without operationId falls back to the request id (reachability?),
  F-r3-4 new contract `runtime-service-bound-creation-route` rather than
  widening the retained-bootstrap one, F-r3-5 lifecycle witness uses a stand-in
  consensusCreation; F-r3-3 was a path typo in the brief.
- 2026-10-17 stage 1c round-3 verification (same Fable verifier, verify-1c at
  9f83c7be3): REJECT narrow. RV5.1, RV5.3-RV5.6 hold; V-F1 closed for HELD.
  V-F2: the handler's unconditional CREATING tracking write is a second writer
  of the memo and drops the creation link of a named deferral (FAILED +
  operationId) or a REMOVING memo (closed:false); the next REMOVE goes generic
  (P6: REMOVE_COMPLETED with the slot ADMITTED; P5: REMOVE_FAILED forever on a
  half-retired replica). Notes V-N11 (nameless-HELD fallback should fail
  closed), V-N12 (`events` stays), V-N13-15 accepted shapes. Lead ruling: root =
  two writers of one link; design Revision 6 (RV6.1 single writer, RV6.2 named
  deferral re-enters like HELD, RV6.3 named REMOVING -> typed deferral
  RETIREMENT_IN_PROGRESS, RV6.4 nameless HELD fails closed CORRUPT_LOCAL_MEMO,
  RV6.5, RV6.6 proof). Quest log: attempt r3, verification reject, decision.
  Evidence retained under `evidence/activation-discovery-20261017/verifier-1c-round3/`
  (115 files). Round 4 sent to the same Opus implementer (context intact).
