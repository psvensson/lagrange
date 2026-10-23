# Independent review: complete-vector semantic witnesses R1

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **REVISE the bounded pure-test coverage** for W1 and W2 below.
The existing assertions and fixture premises are sound for their stated
component scope. The requested changes close two specific holes in the approved
whole-vector contract; they do not require production changes or a new fixture.

No runtime was executed. This review is not native application, source ACK,
production acceptance, full-interaction acceptance or merge approval. The only
write made for this review is this evidence file. The reviewed test, production,
metadata, Quest log and all earlier evidence remain unchanged.

## Exact reviewed material

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Test: `test/cdc/cdc-delivery-complete-vector.test.js`, 124 lines, seven generated
top-level tests: two canonical result kinds, four source/target kind pairs and
one capture/stamp test.

| Material | SHA256 |
| --- | --- |
| Reviewed test | `47fdbebc0b924a478ca47c5ea6d6fb8d0b03c583f0f12a7f601fd7d3ce85f2ee` |
| Approved R4 design R2 | `7ccbad6c08aebc6275a400f80fe7f6eb2007094479116cddb5b2d28f61b7a76c` |
| Independent design approval R2 | `9a745248900ea63f25ea6bf1767be4f342a3a5781704f6d51df925e703734247` |
| Observed outcome owner | `1a90b9799e839c0aeda6a18170d9fcbf70849482e3e5202397c23de89666f0a3` |
| Observed envelope owner | `77477cfc01232da5feec9bb77fb310290583911e1754953a7c893424f5f56660` |
| Observed canonical JSON owner | `3a850f1c2ce950367fc5918d54d7fa7a406344a941d573dfa1f9d8cb250dafb7` |
| Adjacent outcome tests | `36840c75759db3456132855cc1bbb239dd3f3c81d13d4da3c8d403ecd7bcacb1` |
| Adjacent envelope tests | `482e1d0a5a07d0682a437faa9171e0203d7e4e242ab2150efec2fc09cc7728b0` |

Source hashes identify the observation cut used to trace the tests, not source
approval. The exact test hash was rechecked at review completion. The current
outcome owner checks every coverage digest; no production defect is asserted
by either missing-test finding.

## W1: source and target binding are never varied independently

At lines 84-87 both source and target observations are created for the same
original vector. All changed-vector composition controls at lines 94-99 then
change the expected vector while keeping *both* observations on that old vector.
The direct missing-target-digest control at lines 101-102 tests shape absence,
but not a well-formed, different target binding.

A faulty consumer that validates the source against the expected vector, checks
only that targets have well-formed digests and then aggregates their states can
pass this matrix. It would reject every current changed-input control because
the source is wrong, and reject the missing-digest control because the target
is malformed. It could still accept source coverage for `[D,U1]` together with
target coverage for `[D,U2]`. That is exactly the D2 correspondence the approved
design requires at every covered source and target.

Required finite correction: for each existing native/provisional source/target
pair, construct genuine semantic observations separately for the original and
changed vectors. Keep the expected input and one observation matching while
only the other observation belongs to the changed vector. Test both directions
through `completeCdcPropagation` and `cdcCoverageState`, requiring no committed
or provisional success and UNCOVERED respectively. Include the direct
`cdcCoverageState` call without its optional expected argument: omission may
use the first binding but must still reject a different later binding.

The same bounded coverage-owner matrix should distinguish an omitted expected
argument from explicitly supplied `undefined` and `null`; both explicit invalid
bindings must refuse. Add a mixed-vector zero-target positive and its changed-
expected-vector negative for native and provisional source observations. These
are the sibling public branches of the same binding owner, not additional
native or topology proof. The adjacent outcome test covers zero targets only
with a durable-only request and does not cover this mixed correspondence.

## W2: ordinary-member multiplicity has no identical-member control

The alternatives at lines 28-38 change, omit, append a *different* ordinary
member, reorder, change operation and change timestamp. None repeats the same
ordinary member. A semantic projection that deduplicates identical ordinary
members before computing the vector identity could pass those controls while
equating `[D,U]` and `[D,U,U]`. The approved design explicitly binds multiplicity,
and duplicate ordinary members are not duplicate durable source identities.

Required finite correction: add `[D,U,U]` to the existing alternatives and let
the two validator directions and four aggregation combinations exercise it.
Retain the legitimate mixed-vector positives. This is not permission to reject
the duplicate-ordinary input globally; a canonical answer for that complete
vector must still validate for itself while failing against the shorter vector.

## Sound existing coverage and premises

The fixed position is visibly a pure builder input. No fixture reports it as a
real committed frontier and no production receipt or source ACK is injected.
The test header explicitly states that limitation. All imported operations
exist at the actual semantic owners; no stub replaces their guard, capture,
digest or composition decisions. Configuration, native startup, clocks and
transport are intentionally absent from this pure scope.

The two result-kind tests require a matching positive, the canonical prefixed
lowercase digest shape and exact identity-owner equality. Their two-direction
changed-vector controls are useful: shared omission of ordinary-body semantics
by builder and validator would make the negative assertions fail. Missing,
null, empty, bare, uppercase and wrong-digest controls are independent response
mutations. The accessor control requires zero getter calls. The inherited
digest example also has an unaccepted custom prototype; it verifies refusal of
that input, but does not separately isolate pollution of `Object.prototype` on
an otherwise admitted plain record.

The four coverage positives correctly allow mixed native/provisional coverage
to return provisional and require all-native coverage for committed success.
The existing altered-expected-vector controls prevent laundering all old
observations into a new input merely by rebuilding a fresh output digest.

The capture test keeps the durable stamp exact, shows the ordinary missing,
empty, null, numeric and boolean stamps becoming absent, and distinguishes an
assigned ordinary stamp in the request digest. Its generic `assert.throws`
proves refusal for invalid durable stamps, not the precise typed refusal or
pre-effect boundary. Explicit own `undefined`, a whitespace-only nonempty
ordinary string, full caller-input preservation and the MG owner's real stamp
assignment are not proved here. These remain limits of this pure test; actual
entry/native witnesses own the latter effects and normalization correspondence.

## Static checks and remaining proof boundary

`node --check` and scoped ESLint with explicit complexity 12 pass for the exact
test. Relative named imports were inspected against the defining exports and
the existing constants barrel; the adjacent outcome/envelope tests were read
and the test tree searched for the two coverage APIs. No adjacent direct test
closes W1 or W2. No test module or production module was executed.

After the finite test correction, a new exact-hash rereview is required. Pure
green would still not demonstrate I-to-N normalization, native afterCommit,
forwarded reply/lifetime preservation, rollback, capacity, source membership,
provisional progress, source CDC_DELIVERED application or ACK. Those are separate
reviewed-source and measured-witness obligations. Protected activation, durable
transfer, original-seed classification authority and the composed two-start
acceptance gate remain outside this test review.
