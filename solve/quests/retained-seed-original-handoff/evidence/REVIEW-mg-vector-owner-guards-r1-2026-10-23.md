# Independent guard correction review R1

Reviewer: `/root`, independent of author `/root/mg_delivery_design`.
Verdict: **REVISE V2; V1, V3 and V4 corrections are sound on source inspection.**
No runtime result or composed acceptance is asserted.

Exact bundle `/tmp/mg-vector-owner-guards-r1-20261023`, manifest
`f6d1d1b1c9d8ec53accdcd926bf91f82029f7d9452c7a46de78e02db2d942b8d`,
patch `c1c3bd28f69e3d2949a37241a9caa860fd4e326db5e6b83e905b592daa31f508`.
All five live paths, before/after snapshots, listed artifact hashes and the two
unchanged R4 dependencies were independently matched. The original R4 review,
author scope extension, full patch, affected owner bodies and actual envelope,
discriminator and committed-application call chain were read.

## V2 residuals in the same guard category

`src/cdc/cdc-source-scope-evidence.js:positiveVersion` captures Number, but
Number still performs mutable object-to-primitive conversion. A source-bound
counterexample is a valid version-1 scope whose two version fields become empty
arrays while Array.prototype.toString returns `1`. Rebuilding converts both to
1 and compares only descriptorDigest and scopeId. The original invalid arrays
can therefore pass the captured-envelope scope predicate. This is a static
counterexample; it has not been measured in a runtime job.

The predicate also reads required evidence fields without requiring own data
properties. Even after canonical envelope capture, missing authority, IDs or
versions can come from a polluted Object.prototype. A record carrying the two
matching digest fields can then rebuild using inherited metadata. The envelope's
subsequent source-partition comparison reads the same inherited partitionId.
Freezing the record and pinning Set membership do not address that boundary.

Required repair: distinguish canonical evidence, which is produced by this
owner, from the builder's accepted descriptor-input conversions. Validate the
evidence's complete own data representation and primitive canonical versions
before rebuilding or hashing. Preserve supported authorities, ordinary builder
primitive conversion forms and existing descriptor correspondence. Do not add a
second coercion framework or fix individual consumers with local guards.

## Remaining category census

V1 now uses the captured own-key primitive for durable identity and exclusion
from row coalescing. Its three primitive strings use the existing canonical JSON
serializer, preserving tuple order/escaping and avoiding inherited toJSON. The
actual envelope validates a data record before calling this identity owner;
direct ordinary buffer behavior is not relabeled a hostile-object interface.

V3 checks captured Node proxy identity before array/record reflection, including
revoked and nested proxies. The explicitly authorized early discriminator also
refuses proxy vectors/members before its first own-key inspection. Dense arrays,
own enumerable data, numeric/string canonicalization and ordinary non-proxy
classification retain their existing owners. An early durable member still
routes all later siblings through whole-vector capture before effects.

V4 uses indexed traversal of the actual captured committed vector. The full
vector therefore reaches applyCommittedCdcChange independently of a replaced
array iterator. Native acceptance registration remains after application and
executes only through the transaction's afterCommit owner. The unchanged
announcement callback mechanism is not used as native receipt authority.

Numeric, own-property, accessor, prototype, boxed-value, intrinsic, coercion and
array-authenticity categories were considered together. The two V2 findings
above are the remaining failures of this bounded delta. No new lifetime, retry,
pressure, publication or recovery authority is introduced. Existing R1/R6
queue/cleanup and R4 full-vector binding remain required composition evidence.

The author's syntax/static results are retained, but no local runtime was run.
The correction needs independent review and exact-SHA locked-lab controls for
the actual admission/native paths and shared canonical consumers before any
runtime or integration claim. Quest, classification and merge remain open.
