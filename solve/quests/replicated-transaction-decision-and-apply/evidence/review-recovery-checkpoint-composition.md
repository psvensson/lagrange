# Independent recovery checkpoint composition review

Reviewer: `subagent:/root/review_checkpoint_composition`  
Date: 2026-10-11  
Author: `checkpoint_implementation_56`

## Verdicts

- **REJECT the 65-path composition as a coherent source foundation.** The reviewed bytes are retained, but their selected dependencies introduce an unusable coordinator-table apply path, remove an existing pinned-command check, omit the receiver for the new settlement protocol, and break the actual participant fixture. This is more than an unfinished startup acceptance test.
- **APPROVE the two adapted marker branches, narrowly:** an invalid contender cannot overwrite an existing install marker/staging artifact, and a fresh post-rename image mismatch retains conflict rather than replacing the marker with REJECTED. This is a source adaptation approval, not approval of the full a287 image/recovery implementation, ordinary startup, or replacement acceptance.
- The historical a01 binding approval and 20b test-only approval remain separately identified inputs. They do not certify transplant compatibility or close the retained release-reply finding F5 below.

No source/test/Quest-log edits, commit, merge, publication, or cluster start were performed. Diagnostic artifacts were written only under the central ignored evidence directory.

## Exact input and retained evidence

Worktree W: `/mnt/data/peter/projects/.worktrees/rs-raft-recovery-chain-20261011`.
Branch: `checkpoint/rs-raft-recovery-chain-20261011`.
Base/HEAD: `10c2f0610f2924b8e7773497b03ac95fa4f42e58`.
Staged tree: `be8cd676baf918aa39e721ebde2678930e93ca4a`.
All 65 entries in `test-output/recovery-checkpoint-20261011/content-manifest.sha256` verified; manifest SHA256 `5dc24bb961339ee788871a1079016cd920f9423be84116a20c942bd363be799e`.
README SHA256 `822730de6db74102704205042891cfb3a1ad3c53af612cd73b388e816b529262` is retained unchanged; its claim that the omitted durable CDC obligation dependency is rejected C17 cache hydration is incorrect.

Provenance read:

- Production correction: a01eff86f387367226e1b2ae08574a084fa16d56, nineteen exact files, independent `review-c56-transaction-binding-round2-fresh56.md`, SHA256 `cc6b0e9809ee1b9ed522e0869899602b03f3d77d748d1a5bf9a19b92a5dbf08c`. That review explicitly requires the captured dependencies and explicitly does not approve a nineteen-file transplant.
- Test-only supplement: 20b6355f1d866c1f20d97c64b166734fe9bf0065, `transaction-evidence-binding-production.test.js`, independent `review-tx1-evidence-matrix.md`, SHA256 `6a6ca0381274eed44877f5cea3fe5cacc0cb69649c0226512e6303abc8679c17`.
- Marker origin: a287c9ff560889daae7e13e5b5d8c7c5fe4ca031, `review-freshmg-marker-correction.md`, SHA256 `d7160f1459af49fe1b804d276a07106c2e72b94c341a83360ac7813ecf611c41`. Adapted source SHA256 `bab76ee45d80cbdd274ca83cf5856bf36013f6c62d570aa45bc95cc57c458bdc`; adapted witness `5fc0eae78abea99b07e2d807cf2c21b53ea51338b7146e46b1ce463d2ec352f4`.
- Thirty-eight adjacent a01 files are unapproved dependencies. No blanket source approval is inferred from exact byte identity.

Evidence E: `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/checkpoint-composition-review/`.

Independent local measurements:

1. Four selected query files: **46 reported tests, 46 pass**, log `review-checkpoint-transaction.log`, SHA256 `30103ad319925b0c605fd9278bd209bedaf239a68f2206b6fded029920b57ab4`. Command: `node --test test/query/transaction-review-adversarial.test.js test/query/transaction-coordinator-participant-protocol.test.js test/query/transaction-release-settlement.test.js test/query/transaction-evidence-binding-production.test.js`. Scripted participant/application seams remain the stated ceiling.
2. Adapted image witness: **67 TAP leaf assertions pass**, plus its parent container (the prior runner's 68 count), `review-checkpoint-marker.log`, SHA256 `6691e1e6941383007f0008d398a83a4b3ac89141596a447fd90be61d55381acc`. Command: `node test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js`.
3. Actual participant application/image case: one pass, `review-checkpoint-apply-composed.log`, SHA256 `eb83c7c33026c175747257a5c2a3a5a79a31efcb32da0d385377fffd22369855`. Command: `node --test --test-name-pattern='participant row and the write generation' test/partition/partition-participant-transaction-apply.test.js`.
4. Actual participant pinned-admission case, same host: base passes, composition fails in fixture release setup. Logs `review-checkpoint-participant-base.log` (`9028d21e4bfdd76619b7bd8d7dde8231298b2779b09dad38a0c693a20116b416`) and `review-checkpoint-participant-composed.log` (`abe7f6d975c079a0af41eaa81fb832bfa7c866dcc7f0ee23f7153f515d26a9b5`). Command: `node --test --test-name-pattern='image of a partition|admission owner admits every' test/partition/partition-participant-transaction-apply.test.js`; only the second alternative selects a case. Both runs finish within the outer 30-second diagnostic cap.
5. `node E/owner-probe.mjs` run separately from W and the exact candidate-base worktree. Script SHA256 `337f5cf609d9a9aab0db94cfc2cef3ac4e77fa10404f2de4d6a0c9261a7a4569`. Base JSON `b2b1e0e727b9f91b307d20f075fb9f827513c40ca404c0c034fbf2eaa7f7e911`; composition JSON `14d26ccc86ff72c306b9f2cbca2e294493ea6b0605f393a656f7d70823a1198f`. These use actual command admission, actual PartitionService committed apply, real SQLite, and the actual application-message dispatcher. They are owner diagnostics, not node startup or physical crash tests.
6. `node E/release-answer-probe.mjs` from W. Script `d5c110b679e9f58f81ff737b6cbc1519827b7516c69a56537e85a0917214defa`, result `399d8c7450e633c4e86276209add11d06d3ac5645fae2d213980141c6393992b`. It preserves complete before/after SQLite rows, exact supplied reply and unchanged decision bytes. Scripted delivery and direct application-owner seam are explicit.
7. `git diff --cached --check` and `node scripts/checks/impact-contract-registry.js` pass; registry: 63 contracts, 34 coupled pairs, digest `f27c47743245b4b0c73174cedae7b6e2891916ce4f3ec2837b5d8c2087da8edb`. Generated metadata freshness had author evidence; this review does not turn registry consistency into runtime proof.

## Complete findings

### F1 — introduced: coordinator-table committed writes require an enforcer no producer installs

`src/partition/partition-statement-admission.js:378-380` now calls `assertTransactionSchemaWriteEnforced` whenever a write origin exists. `distributed-transaction-schema-enforcement.js:90-103` refuses unless the trigger is installed. However the retained candidate `partition-participant-transaction-apply.js:582-600` records the generation origin without installing it. The composition has no production call to `installTransactionSchemaEnforcement` at all; the only hits are its definition/export.

The owner probe starts a real sql_transactions replica using its current schema, applies the normal generation origin, then a valid initial INSERT (including `participant_set_text: '[]'` where that column exists). Base: origin 2, INSERT succeeds, row retained. Composition: origin 2, no triggers, `partition_committed_statement_environment_failed`, no row. This isolates an introduced functional regression from the inherited incomplete transaction tests. Replaying the old origin cannot repair it.

**Repair boundary:** committed generation-origin application and the schema enforcement consumer must land together. The missing a01 apply dependency contains precisely the installer. It also contains durable CDC obligation capture; those obligations belong to transaction committed apply and cannot be discarded merely because C17 cache hydration is under review. A whole-file copy needs its actual dependency closure and review, not an import-only check.

### F2 — introduced: pinned PREPARE/DECISION admission loses required envelope validation

The transplanted `partition-participant-transaction-bytes.js:322-338` removes `isExecutionEnvelope` from both command predicates. The unchanged request owner still stamps it (`partition-participant-transaction-request.js:154-157`), apply still records its diagnostic (`partition-participant-transaction-apply.js:610-612`), and the candidate's independent admission witness still requires its shape (`partition-participant-transaction-apply.test.js:140-182`).

Same-host owner probe: the valid command is admitted on both; missing PREPARE envelope and an empty decision `sqliteVersion` are rejected by base with `partition_write_transaction_command_invalid`, but both are admitted by composition. This is an actual admission delta, independent of F4's fixture failure.

The sealed v10 design (`design-leg-a-v10-2026-10-10.md:366-382,1105-1128,1676-1695`) and owner decision `owner-decisions-2026-10-10.md:233` make an **already committed mismatch diagnostic**. They retain the carried envelope and pre-proposal contract. No authority superseding pinned envelope shape was found. Restore that admission contract in the same bytes owner while preserving the new canonical decision validation; do not restore an apply-side mismatch stall.

### F3 — incomplete new protocol: release settlement has no production receiver/apply owner

`distributed-transaction-release-settlement.js:93-103` sends `COORDINATOR_SETTLEMENT` and requires a committed typed result. The composition adds its constants and query settlement algorithm, but omits `partition-coordinator-settlement.js`, `partition-coordinator-settlement-command.js` and their request/apply integration. The actual dispatcher (`partition-service-entry-apply-base.js:357-389`) returns `acknowledged:false, error:'Unknown message type: COORDINATOR_SETTLEMENT'`; the owner probe retains that answer.

The green release test supplies `handleApplicationMessage` itself and directly calls `applyTransactionSettlement` (`transaction-release-settlement.test.js:49-54`). That is a truthful component test, but cannot establish this composed interaction. This is a missing new half of the protocol, not an inherited failure of an already supported candidate request.

**Required coherent boundary:** query coordinator/participant wire, committed participant/schema application, and the fixed release settlement request/admission/application/result interaction. At minimum F1/F3 require reviewing participant apply; entry-apply; coordinator settlement and command modules; committed-command admission; retained statement outcome/result constants and implementation; coordinator table-column/open wiring. If importing the current apply versions, include their durable CDC obligation owner and existing commit/ACK wiring coherently. Pause admission also needs its existing ordinary-write and participant-request consumers, not unused pause helpers. This is a lower bound on the repair scope, not a claim that an unchecked file list is a complete closure. Candidate C2 membership bytes must be preserved/reconciled at their owner.

### F4 — introduced harness incompatibility hides the actual participant admission witness

The exact a01 participant fixture adds release resume to `startLeader` (`participant-transaction-fixture.js:415-445`) and requires status fields such as `configurationKey`, applied index and lifecycle/runtime generation through `partition-participant-release-facts.js:88-105`. The candidate's unchanged `controllable-consensus-port.js:225-241` does not emit the fields that the a01 version added. The composed admission case therefore throws `fixture participant release refused: release_fact_unavailable` before its behavioral assertion; base passes the same test on the same host. The general participant application/image case passes, so not every participant use is broken.

Compose the fixture with its matching status contract (including its declared committed-membership evidence), or adapt it through the existing fixture owner without bypassing admission. The previous whole-file hang and seven seam-falsifier failures are not all classified as new production regressions: some falsifiers intentionally carry old incomplete protocol fixtures. F1/F2 have separate direct semantic evidence; F4 is explicitly a setup defect, never their red-on-revert proof.

### F5 — retained source defect, not caused by transplant: release accepts a weaker terminal reply than the canonical protocol

`distributed-transaction-release-settlement.js:142-146` validates identity through `participantAnswerSnapshotOf` but then checks only COMMIT outcome or ROLLBACK state. It does not consume `committedAnswerOf` / `rolledBackAnswerOf` and does not require durable terminal tuples. `SQLQueryEngine.deliverTransactionOperation` (`sql-query-engine.js:429-490`) checks binding and success, but the stronger canonical tuple validator is installed only in the normal coordinator callbacks (`sql-query-engine-instance-initializer.js:213-233`). Release calls delivery directly.

The retained diagnostic supplies a well-bound COMMIT reply with `success:true, durable:false, state:'ACTIVE', outcome:'COMMITTED'`. The canonical validator refuses it. Release settlement accepts it, produces a terminal result, and advances real SQLite from COMMITTING/COMMIT to COMMITTED/COMMIT; exact decision text/digest remain unchanged. Thus it falsely discharges an obligation without reversing the decision. Existing positive release fixtures omit `durable` altogether (`transaction-release-settlement.test.js:60-106`).

This exact file belongs to the historical a01 approved manifest. The new counterexample limits that historical verdict: identity binding is retained, but the complete terminal evidence contract is not shared here. F3 currently prevents the real candidate release dispatcher from completing this path; the counterexample is a reachable algorithmic defect once that missing receiver is composed, not proof that current normal startup falsely activates. Route the correction to the existing participant wire owner; add refusal and legitimate redrive evidence at this consumer. No second validator or decision algorithm is needed.

## Marker adaptation scope

`src/raft/snapshot-install.js:547-577` synchronously checks the fixed marker and staging paths, then exclusively creates only a new rejection marker through `writeExclusiveDurable` (`oci-host-agent-durable-files.js:114`). EEXIST becomes conflict; non-EEXIST IO failures remain explicit. `snapshot-install.js:668-674` retains fresh post-rename mismatches instead of falling into replacement/removal. Neither changed branch has an await/check-act gap or releases an obligation on invalid evidence.

The adapted witness reaches a real post-rename STAGED marker, hashes it and the installed target around the invalid contender (`replica-image-checkpoint-transfer.test.js:338-371`), corrupts a real reservation and checks retained conflict (`:380-403`), then restores authority and completes the real owner recovery (`:404-424`). Independent positive run passed. The author's retained README describes four candidate-source negative failures engaging these assertions; this review did not rerun or independently attest that negative tree. Its limitation is explicit.

The candidate still has the older surrounding image validation and STAGING disposition: `resolvePendingSnapshotInstall:729-739` removes owned STAGING and reports NO_INSTALL; its STAGED image validator is narrower than the full a287 dependency tree. No claim is made that all a287 behavior was transplanted. Normal init calls the synchronous resolver without CREATE authority (`partition-service-raft-init-base.js:338-345`); automatic recovery integration remains open. This approval covers the two changed safety branches only.

## Category-complete checklist

Notation: W paths above; `Wire` = `src/query/sql-query-engine-participant-wire.js`; `Decision` = `src/query/distributed/distributed-transaction-decision-protocol.js`; `Recovery` = `src/query/distributed/distributed-transaction-recovery.js`; `I` = `src/raft/snapshot-install.js`; `T` = adapted image test. PASS means bounded evidence for the stated composition delta; OPEN/FAIL never implies full acceptance.

### Admission (7)

| Item | Disposition and concrete evidence |
|---|---|
| A1 | FAIL F1/F2/F3: new coordinator apply enforcement has no installing origin; pinned bytes and receiver contract split. Same-owner predicates are demonstrated by E owner probes. |
| A2 | PASS normal transaction binding at Wire:142-155,220-306 and Decision:236-264; F5 fails release terminal evidence. Known uncertain-BEGIN classification remains open at persistence:204-218. |
| A3 | PASS no new numeric budget in composition. Coordinator:267-273 reuses one transaction budget; protocol retry uses existing attempt cap. Full startup/manifest pressure budget not certified. |
| A4 | PASS marker frozen outcome fields consumed by init:341; FAIL release receiver returns unknown message (F3), and terminal tuple weakened (F5). |
| A5 | OPEN: Recovery:159-168 re-enters the session FIFO; I:760 recovery API exists, but init:338 lacks its authorized caller. No lifecycle progress claim. |
| A6 | PASS normal request binding Wire:142-155; immutable BEGIN fields persistence:56-63. Known incomplete/wrong-key readback collision gap remains at :209-218; not newly introduced by composition. |
| A7 | PASS changed marker conflict reports contender validation without inventing held identity (I:549-571); normal retry diagnostics include tx/session/partition at protocol retry. Generic marker detail is not generation-rich evidence. |

### Retry (7)

| Item | Disposition and concrete evidence |
|---|---|
| Y1 | OPEN: Recovery:204-269 retains sweeps; actual release retry cannot succeed against F3. No assertion that copied retry code proves production wake wiring. |
| Y2 | PASS fixed transaction deadline in coordinator:267; unavailable recovery returns held at recovery-authority:83-104. Manifest backlog and total retry memory bounds remain known open work. |
| Y3 | PASS normal transaction failed participant result stays COMMITTING, Decision:253-264; marker REJECTED/CONFLICT/IO throw explicit, I:549-577. F3 is loud refusal, not a hang. |
| Y4 | FAIL F1/F3 can prevent the ledger/release machinery from restoring its own prerequisites. No new global readiness barrier was added, and no broader startup circularity proof is asserted. |
| Y5 | OPEN resource claim: stage retries bounded by coordinator constants MAX_RETRIES=3, delay 10..250ms; Recovery single-flight :204-226. Participant arrays/manifests still fully materialize; no aggregate bound approval. |
| Y6 | PASS normal same decision bound fanout Decision:247-251, exact decision CAS in transaction persistence, marker exclusive conflict I:558-571. F5 wrong terminal progress is separate. |
| Y7 | OPEN known BEGIN gap: durable-workflow-coordinator:61-70 removes an uncertain record and persistence:215 labels mismatches collision. No approval of remint/uncertainty supplement. |

### Transport (5)

| Item | Disposition and concrete evidence |
|---|---|
| T1 | PASS Wire:143-146 requires acknowledged and rejects noHandler; FAIL F5 requires canonical operation tuple at the release consumer too. |
| T2 | PASS expected operation/partition/transaction/participant at Wire:149-153, normal matrix foreign-reply controls; no shared-session fallback. |
| T3 | PASS normal participant dispositions from Wire:165-180; F3 unknown message is not committed settlement. Pause helper/code consumer closure remains incomplete, not certified. |
| T4 | PASS actual missing settlement handler returns bounded negative immediately (E owner probe), but this is a functional failure F3. No missing JS module was encountered in reviewed imports. |
| T5 | FAIL F4 real participant fixture cannot reach assertion; query 46-green uses scripted participant. Release test directly applies owner algorithm instead of real dispatcher (F3/F5); ceilings explicit. |

### Sweep/timer (5)

| Item | Disposition and concrete evidence |
|---|---|
| S1 | PASS coordinator injects now; Recovery:352-363 interval is unref'd. Marker delta adds no timer. |
| S2 | PASS Decision:236-264 never converts committed COMMIT to rollback; actual request owner leadership checks remain. F5 falsely marks terminal, not opposite decision. |
| S3 | PASS bounded no-clobber at durable-workflow-coordinator:613-630 and retained decision rebuilding; F1 means real startup/application closure still absent. |
| S4 | PASS post-COMMIT skips request budget only for forward completion at Decision:251; failures retain COMMITTING. No new legal-hold timeout is introduced. |
| S5 | FAIL F1/F3 current recovery dependencies cannot satisfy the new enforcement/settlement path. Pause-independent normal service is not established by the isolated timer. |

### Recovery (5)

| Item | Disposition and concrete evidence |
|---|---|
| R1 | PASS known workflow is not replaced, durable-workflow-coordinator:613-630; matching advanced BEGIN uses existing recovery callback, coordinator:294-304. Known uncertain descriptor gap remains distinct. |
| R2 | PASS recovered IDs and recoveryDiscovered select authoritative restore (Recovery:79-99); retained image CREATE takeover exercised T:373-424. Normal lifecycle caller still OPEN. |
| R3 | PASS canonical participant manifest :10-21 rejects malformed/unknown bytes, and recovery-validation has exact decision membership. Resource bounds on valid large manifests remain OPEN. |
| R4 | PASS generic real participant image/apply test, retained command outcomes, canonical decision retries; F2 weakens pre-proposal shape. Marker actual post-rename recovery passes T:418-424. |
| R5 | PASS missing/invalid authority returns held (recovery-authority:83-104), fresh image integrity conflict I:668; known BEGIN wrong/incomplete row mismatch is not accepted collision evidence. |

### Concurrency (5)

| Item | Disposition and concrete evidence |
|---|---|
| C1 | PASS session FIFO transaction-statement:22-33 and synchronous marker exclusive create I:558. Async row observation is not the only serialization mechanism. |
| C2 | PASS marker changed paths have no awaits; CREATE swap inside commitSnapshotInstall I:499-505. Release census remote freshness is acknowledged open work in release-pause:62-80, not re-certified here. |
| C3 | PASS immutable decision conditional update and readback in transaction persistence; marker EEXIST loses without mutation. F1/F3 prevent composed completion, not multiple winners. |
| C4 | PASS Recovery:204 single-flight plus session FIFO :259; no new marker timer/reentry path. Actual whole startup interleavings remain OPEN. |
| C5 | PASS session scheduling key is distinct from durable transaction ID, transaction-statement:22 and workflow maps; physical marker root/CREATE authority remain install owners I:463-484. |

### Formation (5)

| Item | Disposition and concrete evidence |
|---|---|
| F1 | FAIL F1 ledger writes require missing schema install; F3 release writes require omitted settlement receiver. Marker recovery reads CREATE authority through existing owner (I:760). |
| F2 | OPEN normal init:338 synchronous resolver lacks current CREATE authorization. Query recovery priority routing sql-query-engine:348-354 exists, but no new startup proof. |
| F3 | OPEN: existing query budgets retained; actual valid new ledger INSERT fails F1. Component greens do not prove formation clients eventually resume. |
| F4 | N/A to preservation claim: no full formation-window latency claimed or measured. Local 46/67 results are explicitly component evidence. |
| F5 | FAIL split producer/consumer at F1/F3; do not remove enforcer or fake settlement ACK to obtain green. Durable CDC obligations must remain with committed apply. |

### Harness (6)

| Item | Disposition and concrete evidence |
|---|---|
| H1 | PASS independent semantic base/composition probes F1/F2. F4 is setup red explicitly. Marker author negative is reported with independent-provenance ceiling, not rerun certification. |
| H2 | PASS source-owner diagnostics use real PartitionService/SQLite; release F5 deliberately scripted delivery/application boundary. New fixture's incomplete status contract FAILS F4. |
| H3 | PASS T:338 actual rename before injected interruption; no timer compression introduced. This is not power-loss durability or restart through startLagrangeRuntime. |
| H4 | PASS E owner probe emits complete attempted creation row with new manifest when applicable; PREPARE/reply matrix uses full identities. F4 port lacks required status fields. |
| H5 | PASS F1 attempts a concrete INSERT, F5 before/after nonempty COMMIT decision row and one participant; marker target/reservation exists before mutation T:338-403. |
| H6 | PASS scope honesty: all65 bytes and staged tree named; generic application pass versus fixture failure versus scripted green separated. Prior whole-test hang/7-fail does not become new semantic proof. |

### Owner interaction (10)

| Item | Disposition and concrete evidence |
|---|---|
| O1 | PASS normal decisions remain coordinator-owned and actual data apply participant-owned; FAIL F5 duplicates weaker reply acceptance within release. |
| O2 | FAIL F1/F3: exact imported helpers do not form matching committed schema/settlement contracts with candidate. Constants alone are not implementation. |
| O3 | PASS malformed/foreign refusal plus legitimate retries in the same 46-test composition; real ledger insertion/release halves fail F1/F3. Marker refusal+recovery paired in T:338-424. |
| O4 | PASS marker restores unavailable owner read then recovers same install T:404-424; normal transaction valid followup controls are green. F5 false terminal tuple must be refused then legitimate redrive tested. |
| O5 | OPEN manifest JSON.parse/full arrays at participant-manifest:10-21; source fingerprint also collects content buffers. These imported resource bounds are not approved by preservation. No bypass proposed. |
| O6 | OPEN Recovery retains IDs on authority failure; real release consumer absent F3, automatic snapshot entry absent init:338. No timer-only/global-barrier repair accepted. |
| O7 | PASS immutable decision/canonical row, not status projection, authorizes normal fanout (decision.js:recordTransactionDecision). F5 incorrectly treats incomplete terminal response as discharge evidence. |
| O8 | PASS F1/F2 source-bound same-host probes; logs kept separate from green population. Marker negative received from author only, limitation retained. |
| O9 | FAIL new producer/old consumer pairing F1/F3 is not repaired by fallback. Reviewer introduced no bypass. Actual participant recovery and CDC must be composed under existing owners. |
| O10 | PASS structural registry: new pair has existing paths and named tests, independent registry audit green; existing snapshot contract includes installer. Test classifications do not fix F4 or certify all65 runtime behavior. |

### JavaScript input (8)

| Item | Disposition and concrete evidence |
|---|---|
| J1 | PASS reviewed PREPARE positive safe integers, prepare-evidence:9-22; birth epoch rejects -0/unsafe in constants/transactions:27. Other retained deadline/manifest numeric domains are not blanket certified. |
| J2 | PASS Wire:143 strict own-data copy and prepare-evidence:18; settlement:98-107 strict command. Disk marker exact own keys I:120-133. |
| J3 | PASS expected replies captured once before evidence retention (Wire:142-155); F5 is semantic tuple weakness after capture. Direct arbitrary helper getters are not newly certified. |
| J4 | PASS existing strict boundary defenses retained; no new prototype hardening claim for private snapshot fs helpers or imported canonical JSON algorithms. Actual serialized transport is stated threat boundary. |
| J5 | PASS Wire primitive identity/digest checks and strict record capture; settlement command primitive epoch/id checks :104-106. No added boxed-object acceptance in marker delta. |
| J6 | N/A for expanded arbitrary trusted-host intrinsic replacement: marker delta uses existing fs/JSON owner, not a new hostile-host promise. Prior strict reply defenses retained; no waiver of existing tests. |
| J7 | PASS canonical decision string roundtrip and digest in participant-bytes:158-176; marker writes owner-produced canonical bytes. F2 required envelope field loss is independently recorded. |
| J8 | OPEN aggregate bounds: participant-manifest JSON.parse and array materialization precede bounds; settlement result uses copyDenseOwnDataArray. No claim of bounded whole-operation materialization. |

## Required next checkpoint

Preserve this rejected staged composition and its exact provenance if useful, but do not describe it as the coherent implementation foundation requested by the user. Repair the complete owned interaction identified in F1/F3, restore F2's sealed admission contract, align F4's fixture with the actual port contract, and close F5 through the canonical reply owner. Verify the new composition with actual participant request/apply and settlement receiver paths, retaining the scripted binding matrix as complementary evidence.

The already-open BEGIN uncertainty supplement, activation authorization and remote freshness, manifest memory budget, C17 hydration, durable CDC restart/ACK proof, automatic snapshot startup, two replacements, seed-storage loss, and exact-candidate static/corpus/physical gates remain outside this verdict. No main merge readiness is asserted.

## F5 terminal/outcome class supplement (same frozen tree)

The category pass was extended across both release terminal operations and their canonical outcome reader before delivering this report. Evidence `E/release-answer-matrix.mjs` SHA256 `edcbda380d91f0e1fe0262377b54ddc9d0f643f313264804d549a6d84af6a388`; full row/command/reply output `E/release-answer-matrix.json` SHA256 `d2cafbda52c0782be82c87e1a6236b2257bf3ad5e65fbb97a65fb74442a32f42`. Run from W with `node E/release-answer-matrix.mjs`.

| Reply/control | Canonical tuple validator | Release result and durable progress |
|---|---|---|
| COMMIT, `durable:false, ACTIVE/COMMITTED` | Refuses | Incorrectly emits PROGRESS; COMMITTING/COMMIT becomes COMMITTED/COMMIT |
| COMMIT, `durable:true, COMMITTED/COMMITTED` | Accepts | Correct control: same COMMIT becomes terminal |
| ROLLBACK, `durable:false, ROLLED_BACK/COMMITTED` | Refuses | Incorrectly emits PROGRESS; ROLLING_BACK/ROLLBACK becomes ROLLED_BACK/ROLLBACK |
| ROLLBACK, `durable:true, ROLLED_BACK/NOT_COMMITTED` | Accepts | Correct control: same ROLLBACK becomes terminal |
| ROLLBACK, `durable:true, REFUSED/NOT_COMMITTED` | Accepts | Incorrect permanent hold at this consumer: no PROGRESS, ROLLING_BACK retained |
| Valid COMMIT tuple with foreign transaction, foreign participant, or wrong operation | Tuple validator alone accepts; binding predicate must refuse | Release correctly refuses each; no PROGRESS and COMMITTING retained |

Every case emits one attempted participant decision delivery using the original decision identity/text/digest. No case emits DECIDE or FREEZE, inserts a new transaction, changes decision bytes, or emits the opposite decision. The bad tuples nevertheless generate false terminal discharge. The REFUSED rollback is a legitimate production response: `partition-participant-transaction-apply.js:476-488` answers a rollback of a durably REFUSED participant successfully with its retained REFUSED/NOT_COMMITTED row. Canonical `rolledBackAnswerOf` intentionally accepts it; the release's state-only predicate does not.

The separate normal outcome reader accepts durable COMMITTED/COMMITTED, durable PREPARED/UNKNOWN and volatile ABSENT/UNKNOWN, and refuses volatile ACTIVE/COMMITTED and durable ROLLED_BACK/COMMITTED. Actual outcome-read callbacks go through `transactionOutcomeAnswerOf` in `sql-query-engine-instance-initializer.js:233-246`, after delivery identity binding. Release settlement has no separate outcome-read fallback. No new defect was found in that normal outcome classification path; accepted UNKNOWN remains nonterminal. These probes extend F5, not its production-startup proof ceiling. F5's correction should consume the existing canonical terminal validators and preserve durable decision/identity while refusing invalid evidence and accepting the valid REFUSED rollback recovery case.
