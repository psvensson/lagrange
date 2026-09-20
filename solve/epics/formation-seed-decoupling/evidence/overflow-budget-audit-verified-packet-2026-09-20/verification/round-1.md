VERIFICATION REPORT - overflow-budget-audit-evidence-binding (independent adversarial verifier)

OVERALL VERDICT: REJECT. One blocking defect in D2 / cross-subject substitution, plus two blocking-for-freeze errors in the documents that would be frozen. All three are ORDINARY, repairable inside the narrow validator/freeze scope; nothing needs production or architecture work. The content is sound: the D3 classification is right and genuinely measured, the literal round-3 attacks are all refused for structural reasons, the 25 inherited rows are provably unchanged, all nine gate statuses equal round 3, and there is no production change.

Subject `git write-tree` at the end: 4d353db0c4e4c9ea7a088cbd9abcad36afc4d404, identical to hand-over. `git status` shows only the staged set, no unstaged or untracked files. I wrote nothing in the subject. All mutation ran in fixture trees under scratchpad/verifier/fx, driven by scripts in scratchpad/verifier: h.mjs, d1.mjs, d1b.mjs, d2.mjs, d3.mjs, x1.mjs, emit.mjs, fuzz.mjs, pin.mjs, fr.mjs, suite.mjs. Every validator run is the REAL test/rebalancer/overflow-budget-matrix-validator.test.js over a mutated copy, with the markdown re-rendered and the gate re-derived, i.e. an attacker who regenerates.

Baseline measured:
- The validator is green on the unmutated copy.
- A fresh emission from the four measuring tests produces 36 receipts and is byte-identical (cmp) to the committed overflow-budget-evidence-receipts.json.
- Successor tests run in a fixture: d3-correction 2/2, derived-truth 5/5, round3-pin 2/2, evidence-binding 4/4, matrix-validator 1/1, inherited-receipts 1/1 (the 12 recorded commands re-run), freeze 3/4. The red freeze test is the manifest receipt, red by design.

======== THE BLOCKING DEFECT (B1), stated once; it affects reports 2, 3 and 4 ========

Receipt ROW identity, KIND, DOMAIN and PRODUCER identity are not produced by the measurement. Each measuring test loops over matrix.rows and stamps a receipt onto whichever rows point at it.
- unmintable-partitions.test.js gridReceipts, about lines 90-146: the row is chosen by `rowDependencyWitnessFile(row) === THIS_FILE`. The KIND is chosen from which of the row's pointer fields are non-null. The DOMAIN (ordinary-handoff-v1 vs whole-stated-grid-v1) is chosen from that kind.
- unhealthy-source-replace.test.js section 9, lines ~409-478: rows are chosen by the witness-file pointer. producerId is a constant. The facts attached are chosen by `row.id.endsWith(HANDOFF_SUFFIX)`, a row-id naming convention in NEW code.
- mintable-five-routes.test.js route 9: producerId is chosen by `row.producers.includes(EXPAND_PRODUCER)`, i.e. read from the matrix row. The validator then checks `row.producers.includes(receipt.producerId)`, which is circular.
- add-like-producer-census.test.js: `producerDriven: false` and the zero counts are typed constants, emitted for any row whose pointers are null.

The measurements are per partition class, not per row. In the committed store, 7 `depends` receipts are identical in everything but rowId (151200 states, 55200 differences). So are 4 ledger `depends` receipts, 6 guard-unreachability receipts and 4 guard-reachability receipts. The 4 guard-reachability receipts, and the real-chain `budget-dependence` receipt for ledger-relocation-census-disagreement-overlap, are stamped onto LEDGER rows (replica_operations-p1). The single drive is on PARTITION_ID = 'sql_transactions-p1' (unhealthy-source-replace.test.js:75). No receipt carries the driven partition, and nothing checks it against row.partitionClass.

Exploits actually run. Both passed the validator AND the sealed emission check; only the round-3 pin refused them.

X1 (the round-3 D2 attack #2, with a regenerating attacker):
- Edit: ledger-relocation-handoff-overlap.producerReachable.value 'unproven' -> 'yes', add receipt id producer-reachability/ledger-relocation-handoff-overlap, regenerate the store by running the measuring tests.
- Result: the real-chain test EMITTED that receipt, with producerId follow-up-unhealthy-source-replace, REPLACE facts and an operationId, although it never drove the ledger and round 3 held this as unproven.
- Validator GREEN. "the committed receipts are the ones the measuring tests emit" GREEN. Pin RED: "the inherited content of this row is unchanged: ledger-relocation-handoff-overlap".

X2 (the escape hatch through the new subject):
- Rows: five-under-representation-add, five-row-rematerialization, five-initial-provisioning-add. These are ADD producers, `depends`, still-unclassified.
- Edit: moved to does_not_depend + proved-unreachable + unreachableSubject budget-dependent-authority-requirement, by matrix edits alone. The independence pointer was set to the grid test, the guard witness to the chain test, the domainQualification copied, and the store regenerated.
- Result: the grid test emitted a genuine budget-independence-differential receipt for each (ordinary-handoff-v1, 7200 states, 0 differences). The REPLACE chain test emitted a guard-reachability receipt for each of these ADD rows.
- Validator GREEN, emission check GREEN, pin RED.
- With 4 and with 10 rows the attack failed only because inherited measuring tests hard-assert 'still-unclassified' for particular row ids. That is incidental, not the binding.

Why this is blocking:
- Owner direction section 2 requires that "a real-chain receipt identifies the row whose producer was driven, and the real-chain test itself emits/asserts the row identity" and that nothing rests on naming conventions.
- Verification targets 3 and 4 and addendum 3 ("required evidence derives from the subject") require the binding to hold in the validator and receipts, not only in a byte pin. The pin is exactly what has to be legitimately re-taken when the audit is re-run after the owner repairs (step 5 of "after approval"). At that moment the validator and emission are the only guard, and any row can then acquire any kind, domain or reachability receipt by pointing at a test.
- Root cause: nothing structural ties a row to its domain or to a drive. The row-to-domain relation is prose (triggeringState) plus a self-declared domainId.

Repair sketch (ordinary):
- Receipts carry what the run itself observed: driven partition id, operation type / moveType, the producer identity taken from the driven owner, and the measured partition ids.
- The validator requires drivenPartition ∈ row.partitionClass, observed operation type ∈ row.producerOperationTypes, and observed producer ∈ row.producers.
- The emitters stop reading kind, domain, producer and facts from the matrix and from id suffixes.
- Consequence to expect: the ledger rows lose their real-chain guard-reachability receipt because no ledger drive exists. The ledger D3 row then needs a guard-grid-based guard-state receipt. The grid does cover it; see D3.

======== 1. D1 - verdict: PASS. Holds against every audit-metadata edit tried; design weaknesses are non-blocking. ========

Literal round-3 attack:
- Edit: open:false, gateItems [] on honoured-does-not-include-the-bound and on the item 6/7 findings, plus exists:true on item 8's artifact.
- Result: RED "no required artifact declares its own existence: authorization-identity-and-evaluation-quest true !== false". Statuses unchanged.

Other metadata attacks:
- Unlink every finding and delete every resolution key: RED "a gate-blocking finding names its resolution artifact: cross-partition-coupling-is-legacy".
- Delete the gate-blocking findings and every required artifact: RED "gate item 2 cites an existing finding: spread-recovery-decision-has-two-owners".
- Resolution artifact with result.resolved false; another finding's artifact at this finding's path; path repointed to another finding's artifact; artifact of the wrong kind: validator green with NO status change. Items 6 and 8 stay not-yet, so nothing is gained.
- External artifact path pointed at THIS quest (copied into the fixture): item 8 stays not-yet. The quest is not closed or approved, and its quest.json does not contain the id.
- A grep of solve/quests/*/quest.json finds no existing quest naming authorization-identity-and-evaluation-quest, so pointing at any existing solved quest fails namesRequirement.
- Artifact kind changed to 'document' and pointed at design.md: not-yet.

Fuzz: 71,213 single-path mutants of the matrix JSON (delete, null, [], {}, booleans, enum strings) through the real deriveGateStatus. 0 improvements.

Legitimate satisfaction versus hole:
- A NEW well-formed file resolutions/<finding>.json {schema, findingId, kind, result:{resolved:true}} makes item 6 DEMONSTRATED with the validator green. This is the designed legitimate path, and it meets the letter of owner section 3.
- It is thin, though. It is a hand-written boolean moved to a sibling file, with no binding to a sealed or approved quest.
- `resolution.kind` is a free string. Editing it in the matrix and the artifact together (d1-kind_edited_both) also demonstrates item 6.
- A forged quest dir (quest.json containing the id as a substring anywhere, a 3-line log with `seal:{}`, an approve entry and a terminal solved entry) plus a forged resolution file makes item 8 DEMONSTRATED. This needs files created outside the audit's data, so it does not violate "no metadata edit within the audit".
- Non-blocking, ordinary recommendations: bind a resolution artifact to a sealed+approved+solved quest the way external artifacts are; make kind a closed enum; replace the JSON.stringify(quest).includes(id) substring match with a declared field.

Item 8 stayed not-yet under every audit-metadata edit.

======== 2. D2 - verdict: FAIL (B1). The literal attacks and the owner's mutants are refused structurally; the regenerating attacker succeeds. ========

Literal round-3 attack 1 (flip five-under-representation-add to does_not_depend):
- Citing an unrelated existing test: RED "the receipt is the measurement round 3 recorded for: five-under-representation-add".
- Borrowing the hand-off receipt: RED "receipt budget-independence-differential/five-relocation-handoff-overlap is bound to this row and no other".

Literal round-3 attack 2 (claim producerReachable yes citing the real-chain five-routes file):
- No receipt cited: RED "a producer-reachable row carries one real-chain receipt: ... 0 !== 1".
- Borrowing another row's receipt: RED "... is bound to this row and no other".

Other attacks:
- Two rows citing one receipt: RED, same binding message.
- Delete a receipt: RED "references a known receipt".
- Change the store's producerId: RED "the receipt names a producer THIS row declares".
- Swap the domain in the store only: RED "in the domain its receipt was taken in".

Hand-edits the VALIDATOR ALONE accepts, caught only by the emission check (RED "the committed receipt file is what the measuring tests emitted"):
- numbers edited consistently (7200 -> 7000);
- a receipt nobody emits;
- producerFacts edited;
- the domain swapped on both the row and the receipt;
- a new domain added to the store's own registry. The validator trusts store.domains, not the code registry, and the emission check compares only `receipts`, never `domains`.

Verdict on the two layers: adequate against hand-editing, NOT against X1/X2. There the emission itself is the hole.

Emission check facts:
- It really runs the four measuring tests in child processes with LAGRANGE_AUDIT_RECEIPT_EMIT_DIR set and deep-compares. I confirmed independently that it is byte-identical.
- With that env var set ambiently, a measuring test skips its own comparison and writes files. The evidence-binding check still compares. Non-blocking.

Are the numbers run-produced?
- Grid counters are incremented at the evaluation sites: yes.
- The hand-off evaluation counters are incremented beside handoffStates, so they are equal by construction. They are honest but add nothing.
- Real-chain receipts: `partitionsMeasured` and `statesEnumerated` are typed constants (1).
- The not-driven kind is entirely typed.
- Mixed definitions inside one receipt: the whole-grid `decisionDifferences` counts refusal OR cap differences, while the hand-off and census-moved counts are refusal-only. budgetAdmittedStates (22080) is a whole-grid number printed inside hand-off receipts whose statesEnumerated is 7200. Non-blocking, but confusing to the prose-blind reader.

Leftover in a sealed test, evidence-binding.test.js:163-166: a `censusRefined` clause still accepts a plain `depends` receipt for a census-moved row when the prose field is present. The validator does not have it. Non-blocking.

======== 3. D3 - verdict: PASS on content; two document defects (B2, B3) and the ledger guard receipt (B1) noted. ========

Both rows:
- proved-unreachable, unreachableSubject budget-dependent-authority-requirement, does_not_depend, guardReachable yes, admissionClasses [], proposed kind none.
- Producer reachability as inherited: five yes, ledger unproven.
- The qualification carries the owner's sentence. The ledger row carries the owner's ledger sentence verbatim, pinned by value.
- No ledger authority anywhere. I searched the JSON: the only 'ledger-local' hits are the owner's sentence and an inherited six-answers line.

Differential, measured by me with a patched SCRATCH copy of the grid test:
- 1440 hand-off states per partition; 7200 for the five, 1440 for the ledger. Every state was evaluated with the actual budget and with zero.
- 0 refusal differences.
- NON-VACUOUS: the budget is non-zero in 1080 of the 1440 hand-off states on sql_transactions-p1 and on replica_operations-p1 (0 of 1440 on nodes-p1, as expected). All 1440 are granted either way.
- The domain is a superset of the REPLACE hand-off (half the states are ADD-typed), which is stronger.
- The non-vacuity number is NOT in the receipt. The validator uses budget-evaluated set membership as the proxy, which is what addendum 2 asked for.

The four facts without prose:
- Transition exists: the five row's producer-reachability receipt (moveType REPLACE, operationId). For the ledger row this is 'unproven', inherited.
- Guard-visible state exists: the guard-reachability receipt. It is genuine for the five. For the ledger it is stamped from a drive on another partition (B1). My grid measurement shows the ledger hand-off states ARE guard-visible and budget-evaluated, so the fact is true but the receipt proving it is not the ledger's.
- Admission independent of the budget: genuine for both rows.

Spread-owner finding:
- Kept open. It gains `justification` "two modules decide the same spread-recovery semantic" and a `doesNotImply` field.
- Neither field is rendered in the markdown, and neither is validated.

Gate item 3:
- Derived. It selects 1 row; the contract minimum 3 -> 1 is recorded in correctionToRound3 and in the pin's declaredGateDifferences. Status blocked-on-owner-decision, unchanged.

B2 (blocking for freeze, ordinary):
- overflow-budget-decision-matrix.md lines 339 and 615 print "- **unreachable subject**: **undefined**" for exactly the two D3 rows.
- Cause: overflow-budget-audit-render.js:293 reads `qualification.subject`, which does not exist. The field is `unreachable`.
- The seven inherited rows' unreachableSubject is not rendered at all.

B3 (blocking for freeze, ordinary):
- The gate document's item 3 reads "row selection: byDisposition: explicit-authority-required (at least 3 row(s))" directly above "matrix rows: five-minted-spread-cure-add" and "what is missing: nothing".
- That string is hand-written, pinned inherited prose in gate[3].rowSelection. It now contradicts the contract (minimum 1). It should be rendered from the contract.
- Both would be frozen byte-for-byte on the very subject of this quest.

======== 4. Cross-subject substitution - verdict: owner's seven mutants PASS; the escape hatch FAILS (B1/X2). ========

All refused by the real validator:
- Inherited row -> new subject, with and without a copied qualification: "this subject rests on that dependency: owner-partition-nodes / budget-dependent-authority-requirement".
- Hand-off row -> old subject, with and without removing the qualification: same message, reversed.
- Guard-unreachability receipt on the authority row, and independence receipt on a guard row: "a receipt's value follows from its own kind and result".
- guardReachable yes under the old subject: "'yes' !== 'no'". guardReachable no under the new: "'no' !== 'yes'".
- Ledger authority required: "a class measured does_not_depend may not also require an explicit authority", with and without stripping the subject.
- Ledger proposes a kind: "and proposes no authorization kind".

Mine, all refused: subject missing; unknown subject; subject on an unclassified row; qualification disagreeing with the row; remainsReachable without 'operation'; vacuous receipt (0 states); partitions not budget-evaluated; admission class claimed; hand-off row set to depends.

Validator-green and harmless:
- Qualification prose rewritten to "This relocation can never happen; the REPLACE is dead code." The forbidden-phrase scan is a 4-phrase lexical list, but the structure still says the operation is reachable.
- correctionToRound3 deleted.
- Ledger sentence changed. The pin and the d3 test catch that one.

Discipline selection: it is table-driven by subject, with no hand-off id in the deciding modules. However:
- "There is no branch on a row id anywhere in this file" (validator comment, lines 168-171) is literally false. `row.id === MINTS_TODAY` at validator:840 and render:167 is inherited.
- The NEW emission code branches on the id suffix HANDOFF_SUFFIX. The implementer's grep checks only full ids in four modules, so it misses this.
- Consistent rename WITH a fresh emission (the implementer's rename test never re-emits): the chain test FAILS "1 !== 2" (the inherited handoffRows.length assertion), only 28 receipts are emitted, and the validator goes RED. So "renaming a row changes nothing" is true of the validator only.

The seven inherited rows' checks are unchanged: their discipline entry reproduces the round-3 rules, and their digests match (report 5).

======== 5. Preservation of the 25 inherited rows - verdict: PASS. ========

My own structural diff of the matrix JSON against the index of the budget-audit worktree gave 77 paths.

In rows:
- enforcementDisposition changed on the two D3 rows only;
- domainQualification added on those two;
- ledgerAuthorityResult added on the ledger row;
- receipts added on all 27;
- unreachableSubject added on the 9 proved rows;
- NO other row field changed, removed or added. The D3 rows' evidence arrays are untouched.

Findings:
- `open` removed on all 17.
- `resolution` added on exactly the 11 that were open:true.
- justification and doesNotImply added on the spread finding.

Gate:
- item 3 rows 3 -> 1;
- item 8 artifact: exists removed, kind and path added.

Also: new section correctionToRound3; the epoch inventory JSON is byte-identical (cmp).

Pin:
- I recomputed round3PinDigests over the INHERITED matrix with the pin's exclusions: 0 mismatches over 27 rows and 20 sections.
- The pin's by-value gate, finding and artifact records equal the inherited values.
- So the pin really pins round 3, not the successor.
- It is a static JSON the test only reads, so it is not self-fulfilling.
- It fails on altered pinned values; see the X1/X2 refusals.

Exclusion list:
- The excluded row fields are presence-constrained per row by assertOnlyDeclaredFieldsWereAdded.
- `justification` and `doesNotImply` are excluded for ALL findings, so either could be added to any finding unseen. They are unrendered prose, so this is harmless.
- resolution.kind and resolution.artifact are unpinned; see D1.

Non-blocking defect: the second pin test ("no production file changed") is FAIL-OPEN. Run outside a git repo it printed "fatal: not a git repository" twice and PASSED. It will also pass vacuously once landed, because the merge-base is then HEAD. I verified the underlying fact independently (report 8).

======== 6. The real chained-REPLACE witness - verdict: PASS. ========

Diff of overflow-budget-unhealthy-source-replace.test.js against the inherited version. The hunks are:
- imports;
- constants;
- two counter increments placed after the two runPromotionGuard calls;
- an appended section 9 that emits receipts.

No drive, state or assertion was altered. It is still one unstitched drive on sql_transactions-p1:
- an ACTIVE prior target suppresses the second REPLACE (priorTargetActiveSuppresses);
- a SYNCING prior target permits it;
- it is granted with the budget and refused at zero (would_exceed_target_replica_count, cap target+1);
- the hand-off is granted at zero.

The test passes under fresh emission. The five-routes and census diffs are likewise imports, counters and appended emission only; runChain's return value was refactored to expose the counters without changing behaviour. Section 9's defects are B1.

======== 7. All nine gate statuses - verdict: PASS. ========

Derived by me through deriveGateStatus against a fixture root:
- 1 not-yet, 2 not-yet, 3 blocked-on-owner-decision, 4 not-yet, 5 blocked-on-owner-decision, 6 not-yet, 7 not-yet, 8 not-yet, 9 not-yet.
- This equals the recorded statuses and equals the inherited round-3 matrix.

Monotonicity:
- 0 of 71,213 fuzz mutants produced an improvement.
- The owner's nine cases either go RED in the validator or leave the status no better; see reports 1 and 2.
- The store never feeds the derivation, so receipt removal can only turn the validator red.

INHERITED WEAKNESS, reported prominently and not fixed:
- The contract for items 2, 3 and 4 lists blockingFindings, but their `requires` omit namedFindingsResolved.
- In my d1-reclassify run the derivation gave "4:demonstrated" and "1:demonstrated" while item 4's two blocking findings were still open. The validator was RED for another reason ("and is still-unclassified: five-paired-relocation-replace").
- This is unchanged from round 3 apart from minimumRowCount. No status is false today; all stay not-yet because rows are unclassified.
- The "open finding" lines on items 2 and 4 are decorative for the status, and that will matter after the re-audit.

======== 8. No production change - verdict: PASS. ========

- `git diff --cached --name-status main` and the same against HEAD, over src, examples, .github and .githooks: empty.
- No unstaged changes and no untracked files.
- Staged paths lie only under test/, solve/ and scripts/quest-evidence/ (one script).
- package.json is untouched: no new npm script and no workflow.
- The test/shards edits are classification registrations.

======== Extra judgments ========

Prose-blind invariant: PARTIALLY met.

What the implementation proves:
- The VALIDATOR and the gate derivation are independent of prose: they stay green with every declared free-text value replaced by a placeholder. I re-ran this.
- That is weaker than the owner's READER invariant.

Where the reader invariant holds:
- The seven guard-admission-state rows: subject, structured grid domain (ranges, state counts, partitions), receipt.

Where it does not fully hold:
- The two D3 rows: subject and receipts are structural, but the DOMAIN is an opaque id, ordinary-handoff-v1. Its definition exists only as a prose sentence, which the projection neutralises, and as isHandoffState() in test code.
- All rows: which states a row covers is prose (triggeringState). That is why X2 works.

Census-conditional kind:
- "census moved" in the receipt is `state.voters > state.target`. This is the same condition as the row's "meets the guard at target+2 or beyond".
- `statesWhenCensusNotMoved` is NOT the complement. It is the hand-off restriction: 7200 states, against 64800 non-moved states.
- By my arithmetic 22080 - 17980 = 4100 refusal differences lie in states where the census has not moved. Those belong to other rows' classes.
- The name overstates. "Only when the census moved" is proven for the producer's own state, not for "only".
- Non-blocking; rename the field and state the scope.

Freeze writer and checker:
- Refuses with no approval.
- Refuses an approval followed by a rejection.
- Writes after a reject followed by an approve.
- The check refuses an unknown verifier ("the manifest names a verification recorded in the log") and refuses after one byte is appended to the matrix ("a frozen file is byte-identical to what was frozen: ...").
- It binds the prose-blind (validator) invariant: a matrix failing the validator gives "freeze refused: the structured matrix and receipts do not determine every row's proposition without its prose".

Defects, ordinary and non-blocking, to fix with the rest:
- (a) The manifest does not bind the approval to the bytes that were VERIFIED. After an approval I rewrote the qualification prose to "The relocation can never happen." and the writer WROTE a manifest naming that approval. The approval entry should carry the verified digests or tree hash, and the writer and checker should compare them.
- (b) The writer runs neither the pin nor the emission check.
- (c) A rejection entry without ts, or one appended later in the file with an earlier ts, is ignored: WRITTEN in both cases. File order should win.
- (d) What is digested: six data and markdown files. Omitted:
  - the pin;
  - render.js, which holds GATE_CONTRACT, i.e. the meaning of every status;
  - receipt-emission.js, which holds RESULT_DISCIPLINE and the domain registry;
  - the validator;
  - the measuring tests.
  The frozen markdown and store indirectly constrain most of this through validator and emission equality. But the contract's minimumRowCount and blockingFindings-versus-requires are invisible in the frozen bytes. I judge omitting render.js and receipt-emission.js a non-blocking defect; include them.

Architectural results: kept as results. The architecturalResults section digest equals round 3. No guard-visible producer identity was invented and no timing attribution. However, receipts now assert a producerId the drive did not itself report (B1).

Taxonomy: no new disposition, dependency value, admission class, row or authorization kind. The admissionClasses, producers and rows sections are pinned, and there are 27 rows.

Inherited facts found false: none. Two inherited weaknesses reported:
- the ledger rows' guard and dependence witness is a drive on sql_transactions-p1;
- the missing namedFindingsResolved on items 2 and 4.

======== Defect classification ========

BLOCKING, ordinary:
- B1: receipt row, kind, domain and producer identity echoed from the matrix (X1, X2; ledger receipts stamped from a five-partition drive; id-suffix convention in new emission code).
- B2: "unreachable subject: undefined" in the matrix markdown (render.js:293).
- B3: the stale "(at least 3 row(s))" on gate item 3 in the gate document.

NON-BLOCKING, ordinary:
- resolution artifacts are self-declared and `kind` is a free string;
- the requirement match is a substring match;
- the validator trusts the store's own domain registry, and `domains` is not covered by the emission check;
- the censusRefined leftover in evidence-binding.test.js;
- mixed difference definitions and the misnamed statesWhenCensusNotMoved / budgetAdmittedStates in receipts;
- the fail-open no-production test;
- freeze items (a) to (d);
- the false "no branch on a row id" comment;
- justification and doesNotImply unrendered and unvalidated.

ARCHITECTURAL: none required. One consequence to expect from repairing B1: there is no real-chain drive of the ledger partition, so the ledger rows' guard-state evidence must become grid-based or a ledger drive must be added. That is test-side, not production.

FREEZE JUDGMENT: NO. The matrix and gate document cannot be frozen as trustworthy evidence at tree 4d353db0c4e4c9ea7a088cbd9abcad36afc4d404.
- The classifications themselves are correct, and I would uphold them.
- But the frozen bytes would contain two wrong statements on the D3 subject (B2, B3).
- And the evidence bindings being frozen are stamps: a regenerating editor can re-point them at any row with the validator and the emission check green (B1).
- Repair B1 to B3 inside this quest and re-verify. Have the approval record the verified digests so the manifest is provably written from the verified artifacts.