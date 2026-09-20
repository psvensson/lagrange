# Owner direction: the audit's narrow successor (owner, 2026-09-20)

**Status: binding scope for one successor quest,
`overflow-budget-audit-evidence-binding`.** Recorded after round 3 of
`critical-spread-overflow-budget-audit` was rejected on three ordinary defects
(D1 hand-written finding and artifact truth, D2 unbound receipts, D3 two
hand-off rows misclassified) and the owner's stopping condition was met. The
original audit is superseded, not reopened. The matrix is not frozen by hand,
and the epoch, membership-transition, owner-repair and enforcement work does
not begin until the successor is approved.

The purpose of the successor is only to make the almost-finished audit
trustworthy enough to freeze.

## Scope

Exactly:

1. Correct the two D3 hand-off rows.
2. Make evidence receipts structurally bound to the matrix row and value they
   prove.
3. Make finding resolution and required external-artifact existence derive
   from checkable artifacts rather than hand-written booleans.
4. Independently verify those changes.
5. Freeze the matrix and gate document if verification succeeds.

No production code changes. No new matrix classes. No re-audit of the 25 upheld
rows. No attempt to close the epoch domain. No membership-ceiling or
transition-object work. No owner repair. No enforcement work. Round 3's upheld
evidence is inherited evidence unless the successor's verifier falsifies it.

## 1. D3, exactly and narrowly

Rows `five-relocation-handoff-overlap` and `ledger-relocation-handoff-overlap`
are measured `does_not_depend` across their complete stated hand-off domains,
so they must not also be `explicit-authority-required`. The operation itself
remains reachable and legitimate. The statement is:

> Within the stated ordinary hand-off domain, no admission depends on the
> compatibility overflow budget; therefore removing that budget creates no
> missing authority requirement for this class.

Use the existing allowed disposition that fits the schema, with the domain
qualification explicit. If that is `proved-unreachable`, state precisely what
is unreachable:

> a budget-dependent authority requirement is unreachable within this hand-off
> domain.

Never write or imply that the relocation operation is unreachable. Preserve
the separate architectural finding that ADD and REPLACE contain duplicated
spread-recovery decision ownership and should later be unified; that finding
does not turn a budget-independent hand-off into an authority requirement. For
the ledger: its ordinary +1 relocation is admitted by the replacement
allowance; no ledger-local overflow authority has been demonstrated; create no
ledger authority. Gate item 3 is recomputed from the corrected rows, never
edited directly.

## 2. Row-bound receipts

A path to a test file is not evidence. Each structural receipt asserts what it
measured and binds at least: matrix row id; receipt kind; classification
field; expected value; stated domain or domain id where applicable;
test/witness identity; the result that test produced. The validator requires
the binding, not the existence of the referenced test. A receipt for row A
never satisfies row B; a receipt proving `depends` never satisfies
`does_not_depend`; a real-chain receipt identifies the row whose producer was
driven, and the real-chain test itself emits/asserts the row identity and the
producer/transition facts it proves. No dependence on filename conventions or
prose inside a test.

Mutants, each failing structurally: swap a receipt between two rows; change
the row id; change the expected dependency value; cite a valid unrelated
differential test; cite a valid real-chain test for another producer; remove
the row binding; change the claimed domain; point to an unknown receipt.

## 3. Finding resolution is an artifact, never a boolean

`finding.open = false` cannot constitute resolution. A blocking finding
becomes resolved only through a checkable resolution artifact: the finding
identifies its required resolution evidence, the artifact exists on disk, the
artifact states which finding it resolves, and the validator verifies that
relationship. A finding with no valid resolution artifact is open regardless
of metadata.

Mutants, none of which may let a gate item become demonstrated: flip `open`;
delete the resolution artifact; substitute another finding's artifact; change
the finding id inside the artifact; leave the path valid but make the asserted
result incompatible.

## 4. External artifacts are observed, not declared

No hand-written `exists: true`. Satisfaction of a required external artifact
derives from the repository/worktree state: it exists, is of the required
kind, identifies the gate requirement it satisfies and, where appropriate,
carries an approved/sealed verification result. A matrix edit cannot invent
one. Gate item 8's identity/evaluation artifact does not exist today, so item
8 stays `not-yet` and no metadata edit within the audit may change that.

## 5. Monotonic gate derivation

Keep the six existing monotonicity mutants and add the D1/D2 cases.

> Removing, invalidating or disconnecting evidence can never improve a gate
> status.

None of these may demonstrate an item: remove a supporting row; remove a
receipt; break a row/receipt binding; remove a required artifact; remove a
finding; falsely mark a finding closed; falsely mark an external artifact
present; substitute another row's evidence; substitute another gate
requirement's evidence. Gate status is a pure derivation from validated
evidence.

## 6. Round-3 architectural results stand

Producer identity is not visible to the guard; producer attribution for the
lab's ledger and operation-less cases cannot be recovered from the recorded
logs. Keep both as architectural findings. Invent no guard-visible producer
identity; infer no attribution from timing. Explicit producer/transition
identity belongs after the freeze.

## 7. The 25 upheld rows are inherited

Pin their round-3 verified content and fail if they change. Likewise
preserve: the genuine chained-REPLACE real-chain witness; ACTIVE prior target
suppresses the second REPLACE; SYNCING prior target permits it; budget present
grants that second transition and budget zero refuses it; producer attribution
rules; per-machine lab counts; the epoch inventory's explicitly incomplete
status; no second REPLACE authority kind; no ledger authority; unminted-cure
rows still unclassified; repair proposals grouped by semantic cause; all nine
gate statuses except what mechanically follows from D3. If the successor's
verifier finds an inherited fact false, stop and report; do not silently
expand the successor.

## 8. Verification target

An independent verifier establishes all of:

1. D3 corrected without changing unrelated matrix content.
2. Every dependency receipt is row/value/domain bound.
3. Every producer-reachability receipt is row/producer bound.
4. No valid unrelated receipt can satisfy another row.
5. Finding resolution requires a real resolution artifact.
6. External artifact satisfaction is derived from repository state.
7. Gate derivation is monotonic under evidence removal/corruption.
8. All inherited round-3 matrix values unchanged except the D3 corrections.
9. No production file changed.
10. The matrix and gate document can be frozen as trustworthy evidence.

Adversarial mutations again: the result that matters is that the three round-3
attacks no longer work, not that the validator is green.

## 9. If the successor fails

The original audit is not reopened for an attempt 4. An ordinary defect in
this narrow validator/freeze mechanism is repaired inside the successor and
reverified. If trustworthy row-bound evidence cannot be represented with the
current audit machinery without a larger architecture change, stop and report
that as the successor's result. Never widen into production authority work to
make the evidence framework pass.

## 10. After approval

Freeze the corrected matrix, the gate document, its validated evidence
bindings and the surviving architectural findings. Then:

1. close the version/epoch domain;
2. investigate authoritative membership identities and explicit transition
   representation, rather than starting by proving a count formula;
3. define complete authorization identity/evaluation so `honoured` is the
   whole result;
4. design semantic-owner repairs;
5. rerun the read-only audit against those repairs;
6. author enforcement;
7. certification.

At step 2 the recorded external-systems hypothesis is retained:

> the stronger long-term primitive may be an explicit per-partition membership
> transition with identities, roles, generation and permitted steps, making
> numeric overflow/ceiling values derived observations rather than primary
> authority.

None of that is pulled into the successor.
