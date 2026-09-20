ROUND 2 VERDICT: REJECT. Freeze judgment: NO at staged tree e1dfc98e831117b87421fe8bf8f4c31a03097e4b.

There are two blocking defects. Both are ordinary; neither is architectural. No inherited fact was found false. The subject tree is byte-identical after verification: `git write-tree` = e1dfc98e831117b87421fe8bf8f4c31a03097e4b, no unstaged or untracked paths, no freeze manifest present. All mutation was done in fixture copies under scratchpad/verifier2/fx; the scripts are in scratchpad/verifier2/ (h.mjs, emit.mjs, a.mjs, a2–a5.mjs, c.mjs, d1.mjs, d2.mjs, d3.mjs, pin.mjs, fr.mjs, pb.mjs, h2.mjs, fuzz.mjs, diff.mjs, suite.mjs).

The freeze digest I computed over the subject matches hand-over: 723b0902…5aaa1. I am not issuing it as an approval token because the verdict is reject.

As a baseline I regenerated the receipt store myself by running the five measuring tests in a fixture. That produced 212 receipts, canonically identical to the committed store, with validator green, emission check green and pin green.

## Blocking defects

### BLOCKING-1 (ordinary): the B1 root survives one level up

The literal round-1 exploits are refused without the pin. The next generation is not. Receipts no longer echo the matrix, but every field the validator matches a measurement against (producers, producerOperationTypes, partitionClass, admissionClasses, the pinned witness pointers) is declared by the row itself. None of them is bound to a mechanical census except against producer removal. A row that edits its own structural fields takes another row's measurement. The validator and the emission check stay green, and one such edit set moves a gate item to demonstrated.

**Literal X1 and X2, run as a regenerating attacker with the pin out of the picture.**

- X1: the ledger hand-off row claims producerReachable yes and cites the drive on sql_transactions-p1. Validator RED: "and was driven on a partition this row covers: ledger-relocation-handoff-overlap / sql_transactions-p1".
- X2: the receipts and disposition are swapped, producers untouched. Validator RED: "this row's producers can produce the operation the slice is restricted to: five-establishing-window-unminted-cure-add / REPLACE".
- X2 with REPLACE added to the types only. Validator RED: "and that producer is one THIS row declares: … / follow-up-unhealthy-source-replace".
- When the rows touched are id-guarded, the inherited measuring test overflow-budget-mintable-five-routes also fails in the fixture ("'does_not_depend' - 'depends'").

**Next generation.** Each row edits its own producers (adds follow-up-unhealthy-source-replace), its producerOperationTypes (adds REPLACE), sets admissionClasses to [], takes the new subject, and cites the hand-off receipts.

- Every one of the 18 rows that are not proved-unreachable, including five-minted-spread-cure-add, passes the validator individually. All 18 runs: GREEN.
- A4 targets gate item 4. Four rows are re-pointed (five-paired-relocation-replace, ledger-paired-relocation-replace, five-under-representation-add, ledger-under-representation-add) with their types set to ["REPLACE"]. The two census-disagreement rows' types become ["ADD","REPLACE"], so item 4 no longer selects them. Result: validator GREEN and emission check GREEN.
  - Item 4 goes from not-yet to DEMONSTRATED.
  - The regenerated gate markdown reads "demonstrated: 1" and prints item 4 as demonstrated directly above two "open finding" lines.
  - Only the pin refuses ("the inherited content of this row is unchanged: five-under-representation-add"), along with a snapshot assertion in overflow-budget-derived-truth.test.js:125 (`promotedItems == []`). That assertion is the same kind of thing a re-audit re-takes, and it is not one of the three freeze gates.
  - This is a literal violation of owner §5 ("substitute another row's evidence" may not demonstrate an item) and of §2 ("a receipt for row A never satisfies row B").
- Mass variants were refused only by accident.
  - Moving all 17 still-unclassified rows: validator GREEN, items 1 and 4 demonstrated; the emission check refuses because the admitted-case-grid measuring test does not pass in the fixture ("the measuring test runs and passes: test/partition/overflow-budget-admitted-case-grid.test.js false !== true").
  - Moving the four REPLACE-only still-unclassified rows: validator GREEN, item 4 demonstrated; the emission check refuses through the chain test, whose id-suffix assertions on the census-disagreement rows (overflow-budget-unhealthy-source-replace.test.js:375-403) fail with "'proved-unreachable' - 'still-unclassified'".

**Other requested field edits.** All four are validator GREEN, emission GREEN, every cheap suite test green, and refused by the pin only.

- p1: a ledger row claims the five's partition class plus producerReachable yes through the sql_transactions-p1 drive, and drops its declared discrepancy.
- p2 / p2b: a row drops partitions so its coverage is smaller.
- p3: a still-unclassified depends row moves to proved-unreachable under guard-admission-state by re-pointing partitionClass to services-p1. This works after a sibling row adds its producer so the census still sees coverage.
- p4: a depends ADD row flips to does_not_depend with no disposition change, by adding REPLACE and the follow-up producer.

The only census refusal I observed was p5, replacing producers rather than extending them: "every producer crossed with every budget-evaluated partition it reaches has a row: planner-paired-relocation-replace x control_plane_publications-p1".

**Which inherited mechanical census guards each field.**

- producers: the add-like census (overflow-budget-add-like-producer-census.test.js:162-178) checks membership in matrix.producers and that each producer × evaluated partition has at least one row. Removal is guarded. Addition is unguarded.
- producerOperationTypes: nothing. It is never compared with matrix.producers[].addLikeTypes.
- partitionClass: only union coverage in the validator (step 2), the same "at least one row" census, and the subject's budget-evaluated check. Shrinking, growing and merging are unguarded.
- admissionClasses: the admitted-case grid (overflow-budget-admitted-case-grid.test.js:221-258) checks that every class has at least one claimant, that depends implies a non-empty list, and that op-less classes belong only to -operation-not-visible rows. Emptying a row that others also cover is unguarded.
- Pinned witness pointers: nothing but the pin. c8 re-pointed a ledger row's guard witness at the grid test and dropped its discrepancy; validator GREEN.
- Some rows are additionally guarded by inherited hard-coded id assertions in measuring tests (mintable-five-routes; the chain test's handoff and census-disagreement suffixes). That is a row-id convention, not structure.

**Suggested repair, inside the validator's scope.**

- Require producerOperationTypes to equal the union of the declared producers' censused addLikeTypes.
- Require the slice's operationType to cover every type the row declares when it claims does_not_depend or the authority subject.
- Make the census coverage type-aware: a producer × partition pair is covered only by a row whose classification speaks for that producer's type.
- Refuse two rows that state the same (producers, partitions, slice) proposition.
- Bind ownerNamedPartition rows to exactly that partition.

### BLOCKING-2 (ordinary, for freeze): B2 regressed elsewhere in the same document

overflow-budget-decision-matrix.md prints "  - resolved only by owner-repair-quest at undefined" 11 times, at lines 1269, 1275, 1281, 1285, 1288, 1291, 1294, 1297, 1300, 1303 and 1309. overflow-budget-audit-render.js:709-710 reads `finding.resolution.artifact`, but the field is `resolution.path`.

The validator's placeholder guard (`PLACEHOLDER_IN_MARKDOWN`, validator lines 169 and 1138-1143) is anchored to ": undefined" at end of line, so it misses "at undefined".

B3 is gone: gate md line 44 now reads "byDisposition: explicit-authority-required (at least 1 row(s))". It is rendered from the contract and validated equal.

## The eight reports

### 1. D1 — PASS

- Literal round-3 attack: RED "no required artifact declares its own existence: authorization-identity-and-evaluation-quest".
- Stripping resolution and gateItems: RED "a gate-blocking finding names where its resolution would be".
- Deleting blocking findings: RED "gate item 2 cites an existing finding".
- These matrix-only edits all left every status unchanged:
  - declared satisfied/resolved/approved fields;
  - a path pointed at an existing genuinely solved quest (action-authority-owner, copied in);
  - a path at THIS quest, at the epic directory, or by path traversal to the real repo;
  - a changed kind; a renamed artifact id.
- A forged quest naming another finding, substring-only naming, a quest not closed, a quest rejected afterwards, and a corrupt log: no gain.
- Item 8 stayed not-yet under every audit-metadata edit.
- Single-path fuzz of the real derivation: 76,041 mutants, 0 improvements.
- A fully forged quest directory (quest.json with resolvesFindings or satisfiesGateRequirements, plus a log with a seal, an approval and a terminal solved entry) demonstrates item 6 or item 8. That is forging the solver's record, outside audit metadata. I judge it the legitimate satisfaction form, not a hole.
- Non-blocking holes:
  - observeExternalArtifact uses `entry.ts > approval.ts` (observation.js:93-95), so a rejection appended later with an earlier ts is ignored. Item 6 was demonstrated that way.
  - The validator accepts stray truthy fields under names other than open/exists. `resolution.resolved=true` also passes the pin, because `resolution` is excluded from it.

### 2. D2 — literal attacks PASS, binding FAILS (see BLOCKING-1)

- Flip citing an unrelated test: RED "the witness file … carries the named test".
- Claim producerReachable yes: RED "a producer-reachable row cites one drive … 0 !== 1". With the receipt added: RED "the drive is of a producer THIS row declares".
- Store hand-edits:
  - Changed numbers: RED "a cited measurement proves what its group claims … null !== 'depends'".
  - Kind/slice rewrite: RED at the validator.
  - A fake ledger drive receipt, a deleted uncited receipt, an edited slice-registry copy, edited producerFacts, false provenance facts, and a witness pointer moved elsewhere: all validator GREEN, all refused by the emission check ("the committed receipt file is what the measuring tests emitted…").
- The emission comparison does run inside the binding test, and it compares the whole store.
- With LAGRANGE_AUDIT_RECEIPT_EMIT_DIR set, measuring tests write instead of compare. The emission check overrides that variable itself.
- The numbers are produced by the loops: counters are incremented at the evaluation sites and the kind is derived from the numbers.
- Non-blocking:
  - The emission check discovers which witnesses to run from the store it is checking (evidence-binding.test.js:224-229). Deleting every receipt of one witness and downgrading the citing rows came out green/green. That is a downgrade only.
  - slice-provenance facts are neither asserted true by the emitter nor required true by the validator. They are true today.
  - The producer-not-driven receipt's measuredPartitions are read from matrix.producers[].partitionScope, and UNDRIVEN_PRODUCERS is typed. That is a small echo.

### 3. D3 — PASS

- Both rows are proved-unreachable with subject budget-dependent-authority-requirement, dependency does_not_depend, guardReachable yes, producerReachable yes (five) / unproven (ledger), proposed kind none, no admission classes, remainsReachable operation + guard-state, slice relocation-handoff.
- Differential, from my own regenerated receipts, per partition: 720 states, 720 evaluations with the actual budget, 720 with it forced to zero, 0 differences, consulted in 720, budget non-zero in 540. It is non-vacuous and complete over the registered slice.
- Ledger sentence verbatim at matrix md line 621 and in the JSON.
- No ledger authority: kinds proposed are {critical_spread_cure, none}, and there is no ledger repair quest.
- The spread-owner finding is kept, with doesNotImply no-row-requires-authority and the justification "two modules decide the same spread-recovery semantic".
- Item 3 is derived: it selects 1 row, the pin's 3→1 is declared as a correction, and the status follows from the derivation.

### 4. Cross-subject — owner's seven PASS, escape hatch FAILS

- All seven owner mutants plus eleven of mine were refused with specific messages, for example:
  - "this subject rests on that dependency …";
  - "and on that guard reachability … 'no' !== 'yes'";
  - "a class measured does_not_depend may not also require an explicit authority";
  - "only a proved-unreachable row states an unreachable subject".
- A prose rephrase ("This relocation can never happen.") passes. Structure governs, so that is acceptable.
- No D3 row id appears in the deciding modules. The inherited MINTS_TODAY constant and the byId selector for item 9 remain.
- The new subject IS usable as an escape hatch by any other row. See BLOCKING-1.

### 5. Preservation of the 25 inherited rows — PASS

- My own diff against the budget-audit index: 77 paths. Changed values are exactly two dispositions plus gate[3].rowSelection and gate[3].rows (derived). Everything else is additive or a removed boolean (17 `open`, 1 `exists`).
- The epoch inventory JSON and markdown are identical to inherited.
- My recomputation of the pin over the inherited matrix: 0 mismatches across 27 rows and 20 sections.
- The pin test writes nothing, so it is not self-fulfilling.
- Twelve pin attacks were all refused, including an added field, an added or removed row, a new section, a gate note, and an edit to another field of a D3 row.

### 6. Chained-REPLACE witness — PASS

- The diff of the chain test is imports, constants, two unused counters and the appended emission. No drive, state or assertion was altered.
- The assertions at lines 232-235 (ACTIVE suppresses), 241-243 (SYNCING creates the second REPLACE) and 281-288 (budget present grants, budget zero refuses) are untouched.
- It ran green in my fixture, and the facts it emitted are identical to the committed ones.

### 7. Nine gate statuses — equal to round 3, monotonicity FAILS under multi-field substitution

- My derivation: 1:not-yet, 2:not-yet, 3:blocked, 4:not-yet, 5:blocked, 6:not-yet, 7:not-yet, 8:not-yet, 9:not-yet.
- That equals both the inherited statuses and the recorded ones.
- It fails under multi-field substitution. See A4 in BLOCKING-1.

### 8. No production change — PASS

0 paths under src, examples, .github or .githooks against main and against sealedAt, and 0 in the working tree. No change to package.json or any workflow.

## A–H

**A.** Covered under BLOCKING-1.

**B. Slice registry.**

- The predicates are structural.
- The validator reads them from code through sliceDescriptor.
- The grid uses them through sliceMatcher (unmintable-partitions.test.js:81-84, 277-296).
- The store carries a copy of the predicates that the emission check compares. They are not rendered in either markdown; only the slice id appears on the two D3 rows.
- relocation-handoff is the REPLACE half (720 states) of round 3's 1440-state set. The other 720 are producer-add-at-target.
- The test still asserts 0 differences over the full 1440 (`isHandoffState`, lines 370-374), so the claim is sharpened, not weakened.
- The pinned prose still describes the superset.
- The census-conditional evidence is truthful about its scope by slice id. It is broader than the row's prose on one side: census-moved covers any operation type and any ownership. It is narrower on the other: independence is proved only at voters == target with an owned ADD.

**C. Guard-reachability discipline.**

- Two discrepancies is the true set.
- Both directions are enforced (c1–c6, c9 and c10 refused).
- Not refused: a discrepancy for an unknown row, duplicate entries, and deleting two of the three inheritedWeaknesses. Only the vacuous-arithmetic entry is derived and required.
- The three weaknesses are truthful and unrepaired. None is rendered in either markdown, so the gate document shows open findings under items 2 to 4 without saying they do not gate.

**D.** Covered under BLOCKING-2. Nothing else in either document is false.

**E. Measuring-test diffs.**

- Every hunk is imports, constants, counters or appended emission.
- mintable-five-routes's runChain is an order-preserving refactor.
- The enumerated domain is unchanged: 30240 states per partition, 151200 over the five.
- There are dead counters and one stale comment ("so the receipt below states how many ran"). Both are non-blocking.

**F.** Covered under report 1.

**G. Freeze mechanism.**

- Refused:
  - no approval;
  - approval without a token;
  - a token for other bytes;
  - a rejection with a later ts after the approval;
  - a rejection that quotes the token;
  - a wrong token appearing first in the approval text;
  - bytes changed after approval;
  - a manifest with an edited digest, a dropped file, or an unknown verifier;
  - bytes that violate the pin (GATES_RED).
- The writer does re-run the validator, the pin and the emission check.
- Non-blocking defects:
  - The corrective attempt's claim that file order decides a later rejection is FALSE. evidence-support.js:426-427 compares ts. A rejection appended later with an earlier ts, no ts, or the same ts still produced a WRITTEN manifest, and checkFreezeManifest still returned ok.
  - `options.gatesHold: true` bypasses the three gates.
  - Digest omissions that carry meaning:
    - overflow-budget-admitted-case-grid.test.js, which now emits 20 receipts;
    - overflow-budget-audit-support.js, the guard-driving harness;
    - overflow-budget-evidence-support.js;
    - overflow-budget-round3-pin.test.js.

**H. Prose-blind reader.**

- The validator is green over the prose-blind projection.
- The proposition and its evidence are structural for the 9 proved rows and for the mint row.
- The 17 still-unclassified rows' triggering conditions and reasons live only in prose. Three of them (five-establishing-window-unminted-cure-add, five-undeclared-partition-row-unminted-cure-add, five-minted-authorization-stale-at-promotion) share producers, partitions, dependency and disposition.
- Because of BLOCKING-1, a reader cannot tell that a row's evidence is about that row's states rather than a sibling's.

## Other non-blocking items

- Stale "receipt names the row" comments in the evidence-binding.test.js header, and stale receipt descriptions in the quest-evidence script.
- The render.js openGateFindings doc comment is stale.