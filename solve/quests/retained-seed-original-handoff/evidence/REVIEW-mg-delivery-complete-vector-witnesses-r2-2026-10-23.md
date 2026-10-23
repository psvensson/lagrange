# Independent rereview: complete-vector semantic witnesses R2

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **APPROVE the exact R2 test for its pure semantic-component scope**.
W1 and W2 from the preserved R1 review are resolved. No new blocking premise or
assertion defect was established in this bounded delta.

This is static test review. Runtime remains unexecuted. The approval does not
certify production, native application, source ACK, the full MG interaction,
protected activation, retained-classification authority, durable transfer,
composed two-start acceptance or merge. Only this new evidence file was written;
no production/test/metadata/log/commit/push/lab action was performed.

## Exact reviewed bytes

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Test: `test/cdc/cdc-delivery-complete-vector.test.js`.
Frozen bundle: `/tmp/mg-complete-vector-witnesses-r2-20261023`.

| Material | SHA256 |
| --- | --- |
| R2 live/frozen test, 184 lines | `c7f6647b6829824ae16b2a460807111955248238a891bb8b3a7d09ce6d262915` |
| Original R1 test, 124 lines | `47fdbebc0b924a478ca47c5ea6d6fb8d0b03c583f0f12a7f601fd7d3ce85f2ee` |
| R2 manifest | `482afebf1ee4d482b4757e4fda3a29ac0e34908f471b081d52f1b54719d57bf7` |
| R2 delta | `176ad2b4d1e023be3cc9ca25dfd4eb8234afa7458969edd90c83c0627ce953ba` |
| Author notes | `e8575595323fb25d83fe15ee4a2dfff6187ee830ee31ba5298b3b45a37502b65` |
| Preserved R1 review | `2593b758e6a672fce6b0b457c74f7f45db1ecf4b25532d5f9ce93704224348bf` |
| Approved complete-vector design R2 | `7ccbad6c08aebc6275a400f80fe7f6eb2007094479116cddb5b2d28f61b7a76c` |
| Independent design approval | `9a745248900ea63f25ea6bf1767be4f342a3a5781704f6d51df925e703734247` |

All six bundle artifact hashes match the manifest. The live test equals the
frozen after copy byte-for-byte, and the before copy is the exact reviewed R1
test. The delta preserves the original seven tests and assertions, adds one
ordinary-member alternative and matching positives, and adds six tests through
the existing two-kind matrix. Thirteen is an authored test count, not a runner
result. The only new import is the actual exported `CDC_COMPLETION` constant.

## W1 resolved: independent coverage binding and sibling branches

The new four-kind matrix at lines 118-149 constructs each wrong source and
wrong target with the real builder and `observeCdcCoverage` for its own changed
vector. It keeps one observation and the expected vector matching while only
the other observation differs. All seven alternatives are exercised in both
directions. The observations are valid semantic inputs, not a malformed target
standing in for a correspondence failure.

The helper at lines 110-116 requires the exact canonical UNKNOWN response from
composition and UNCOVERED from the direct coverage API with an explicit expected
digest. Lines 142-145 additionally require mismatches to refuse when the expected
argument is omitted. A source-only digest check therefore cannot satisfy the
wrong-target control, and choosing the first observation's digest cannot skip
checking later observations.

Lines 128-134 pair the legitimate omitted-argument and exact-argument positives
with explicit `undefined`, `null`, empty-string and boolean invalid arguments.
The test distinguishes those invalid explicit inputs from the optional-argument
fallback. This follows the existing API rather than introducing a new binding
or result schema in the test.

The two zero-target tests at lines 151-165 preserve the complete source vector
for both native and provisional kinds. They require a matching positive, both
directions of changed-vector refusal and successful same-vector composition for
each changed source. Empty targets cannot erase source correspondence.

## W2 resolved: identical ordinary multiplicity stays meaningful

Line 34 adds `[D,U,U]` to the same alternatives consumed by both result kinds,
the old aggregation matrix, the independent source/target matrix and zero-target
tests. A projection that collapses identical ordinary members would now fail
the cross-vector negatives.

Lines 60-61 require every changed vector, including `[D,U,U]`, to validate
against its own built result. Lines 161-162 require matching observed coverage
for it to compose. These controls prevent a blanket duplicate-ordinary refusal
from satisfying the requested distinction. The one durable source occurrence
remains unchanged; no duplicate durable identity is being declared legal.

## Static verification and limits

Independent `node --check`, scoped ESLint with complexity 12 and explicit
trailing-whitespace checks pass on the exact R2 bytes. The new named import was
checked at its defining export. No test or production module was executed.
The observed outcome, envelope and canonical JSON source hashes remain exactly
those recorded in the R1 review; observing those bytes is not source approval.

The R1 nonblocking limits remain unchanged: the inherited-digest control also
has a rejected custom prototype, durable invalid-stamp refusal is generic
`assert.throws`, and this pure file does not establish all ordinary timestamp
forms, input preservation, actual stamp assignment or effect timing. Its fixed
positions and builder-created replies remain validator fixtures only.

Actual I-to-N normalization, retained native command/application, afterCommit,
forwarded reply/lifetime preservation, rollback, capacity, provisional source
progress and source CDC_DELIVERED/ACK still require their separate source review
and measured witnesses. This exact test is approved to join that candidate;
component-test approval does not close those gates.
