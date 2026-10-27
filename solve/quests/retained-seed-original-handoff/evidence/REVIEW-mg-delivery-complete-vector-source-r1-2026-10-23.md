# Independent review: complete-vector source R1

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **REVISE the composed source**. The three-file R4 delta implements the
approved complete-vector binding, digest-bound coverage and owned I-to-N-to-I
translation on source inspection. Four finite findings remain at its consumed
input and committed-application boundaries. They must be repaired at their
existing owners; narrowing the intrinsic/data-only claim does not make those
pre-effect safeguards correct. None requires another identity scheme, ledger,
retry owner, producer protocol, payload cap or normalization policy.

This is a source-only independent review, not measured failure or acceptance.
No runtime, test, production source, metadata, Quest log, commit, push or lab
action was performed. This review is the only write. The source counterexamples
below are control-path deductions; their paired measured witnesses remain due.

## Exact reviewed bytes and authority

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Bundle: `/tmp/mg-complete-vector-r4-20261023`.

| Artifact | SHA256 |
| --- | --- |
| R4 manifest | `2265783f06d86df77e5d5bec61f27a141d2653f491bb7af817a1b22e2a081bbc` |
| Author NOTES | `7ee8a1803883dc20f958fa2f22f622d0a2cb64348566551180dd890777337485` |
| R4 patch | `31a64ec685a4c803c502c690012557c2dd3daebcc967ee90d4f7fda62445fe30` |
| Final static report | `f335e224775f265d10d2a8620c46ef255627e7f5c584d8211e4aea3cc75593c7` |
| Static import/custody comparison | `c9e046fadc0e28e5d1085e7f88f08729e2f7ab7bc041c3ecd7cc12cdfe0af22a` |
| Approved R2 design | `7ccbad6c08aebc6275a400f80fe7f6eb2007094479116cddb5b2d28f61b7a76c` |
| Independent R2 design approval | `9a745248900ea63f25ea6bf1767be4f342a3a5781704f6d51df925e703734247` |
| Governing interaction contract | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| Original root source review | `b404fadb31060fad56944dbd4c05603f7fa8d0ecc70ff92193ef7a83d235ca7a` |
| Approved R1/R6 native custody manifest | `b12b52a4885a3dff2de1c9c867a13c43ced0650222ed4df4144c44da0077f046` |

I independently checked every manifest artifact and authority hash. All three
frozen after files match their live files, and all before files match the
manifest. The native helper before file is exactly the reviewed R1/R6 revision.

| R4 source | SHA256 |
| --- | --- |
| `src/cdc/cdc-delivery-outcome.js` | `cc8c406bc09059ee12f8819f2b3aee0fe2e65e8807a6ce1117f393c39b22260c` |
| `src/cdc/cdc-event-envelope.js` | `77477cfc01232da5feec9bb77fb310290583911e1754953a7c893424f5f56660` |
| `src/message-group/message-group-cdc-committed-acceptance.js` | `7bb0595056b206384a9128773b53291ddeef11b66c6b7921b6ce78f9837fb5ae` |

The findings also bind these exact consumed owners at inspection:

| Consumed source | SHA256 |
| --- | --- |
| `src/partition/cdc-event-buffer.js` | `73cb6facf886a2b5e77d9933bd30509f8fc04a0fbb64f064665ad08ea095d4e6` |
| `src/cdc/cdc-source-scope-evidence.js` | `596d5851d9f5cd8e7e42d10a49d572daa4afbc46737ec2c0076dc3ad35efe5b1` |
| `src/utils/canonical-json-data.js` | `6108d474b4337e3e840068aa69bf73d934b1f575cf72108ce5b4d41b25483caa` |
| `src/utils/strict-own-data.js` | `2959845c9671dc783685d4758bcfc6b5b2d8ed57782c12a2eeece4a92fbba12f` |
| `src/message-group/message-group-service-raft-timing.js` | `02454ed3e4f4a8b1d7d0d16015b950538b9782a659387ca906ecbea01192dda7` |
| `src/message-group/message-group-committed-command-admission.js` | `eae5ab78f0ac64075e2731dec7261ddf4bb453aa54b193ee943a692d9bc15f3c` |

## V1 — Durable identity admission still delegates to mutable guards

Severity: high. Categories: admission, adversarial JS intrinsics, owner interaction.

`cdc-event-envelope.js:63-71,132-145` correctly retains its own property and
collection operations, but asks `cdc-event-buffer.js:38-52` to validate the
durable key/partition and encode the duplicate identity. That owner still calls
live `Object.hasOwn` and `JSON.stringify`.

A post-import replacement of `Object.hasOwn` that reports no eventKey makes
`buildEventIdentity` take its ordinary branch. The envelope's captured predicate
still sees the durable key, so the mandatory string/nonempty validation is
skipped while the event stays durable. An own empty or non-string eventKey or
sourcePartition can pass capture with otherwise canonical data and timestamp.
The later semantic projection repeats that same dependency rather than repairing
the guard. Receipt binding compares those values for equality; it is not a second
durable-identity validator and must not become one.

Independently, a replacement `JSON.stringify` that returns different strings for
the same durable tuple defeats the capture's duplicate-occurrence Set. The
outcome owner's captured canonical serializer correctly rejects duplicate
bindings later (`cdc-delivery-outcome.js:264-288`), but that is after admission.
The actual proposal gate (`message-group-committed-command-admission.js:64-77`)
admits by command type, not by recapturing event identity. The native path can
therefore propose the invalid vector. If the replacement remains active, the
committed batch's capture repeats the defect before application; if it has been
restored, a now-invalid command can instead fail committed application. Later
UNKNOWN/receipt refusal cannot undo either erroneous native admission. No
duplicate-receipt success is claimed for this second counterexample.

Required correction: make the existing durable identity owner's own-key check,
type validation and tuple encoding stable against these replacements. Preserve
its exact existing durable tuple representation and the separate ordinary
identity behavior. Do not reproduce this decision in the envelope or outcome.

Required paired proof: with each replacement installed after import, malformed
durable key/partition and duplicate source occurrence refuse before native
proposal and before provisional apply. Restore the replacement in `finally`.
Valid distinct durable occurrences, ordinary fallback identity and unchanged
durable identity bytes remain positive controls. Include the actual admission
path, not only direct outcome predicates.

## V2 — Source-scope validation consumes a mutable authority membership check

Severity: high for the declared input contract. Categories: admission,
adversarial JS intrinsics, semantic ownership.

`cdc-event-envelope.js:150-156` delegates optional scope validity to
`cdc-source-scope-evidence.js:22-58`. Both the builder and validator call live
`AUTHORITIES.has`; version normalization also calls live `Number` and
`Number.isSafeInteger`. A post-import `Set.prototype.has` replacement returning
true admits an unsupported authority label when supplied with the corresponding
canonical descriptor and scope digests. The envelope then accepts it as source
scope. Those hashes prove content correspondence, not membership in the owner's
two supported authority names.

The author disclosed this dependency accurately, but it is a live pre-effect
guard, not only a limit on a whole-program intrinsic-independence statement.
Repair its primitive/membership operations at this existing evidence owner and
preserve the existing admitted version-normalization domain. Do not add an MG
authority whitelist or change scope evidence into a recovery/activation grant.
This finding does not establish a protected-activation bypass: the inspected
scope is metadata and is not itself that authority.

Required paired proof: unsupported authority with otherwise correctly computed
digests refuses under replaced Set membership; malformed/nonpositive/unsafe
versions remain refused under replaced numeric guards. Existing supported
genesis/workflow descriptors and their accepted version representation still
produce identical evidence. An envelope carrying refused scope must produce no
proposal or provisional application.

## V3 — Canonical record/array admission can execute proxy traps

Severity: high for data-only capture. Categories: admission, accessors/TOCTOU,
adversarial JS intrinsics.

The capture says it accepts data without invoking caller accessors and detaches
every descendant (`cdc-event-envelope.js:101-129`). Its actual `isRecord` and
`isDenseDataArray` owners (`canonical-json-data.js:115-131,149-175`) perform
prototype/key/descriptor reflection before excluding Proxy objects; there is no
Proxy exclusion. Those operations can execute caller traps. A proxy around an
otherwise ordinary event, nested data record or dense array can report valid
data descriptors, then execute another trap or return a different value at the
subsequent indexed/property read (`:186-190`, envelope `:122`). Freezing the later
owned copy does not retroactively make the capture data-only.

This is reachable with a plain outer request containing a proxied member or
descendant. F3's strict outer-wrapper admission does not recursively exclude it.
Remote JSON cannot carry a Proxy; the same-process input boundary can. The
finding is specifically about that boundary, not a claim that wire decoding
manufactures proxies or that every captured value remains mutable afterward.

The project already has the needed mechanism in `strict-own-data.js:8,26-30,
61-69`: a captured Node `types.isProxy` check before reflection. Repair or reuse
that mechanism at the existing canonical admission owner; do not add another
CDC-only schema. A revoked proxy must likewise refuse without trap/reflection
execution escaping the typed capture boundary. Keep ordinary plain and
null-prototype records and standard dense arrays supported.

Required paired proof: counted proxy traps at outer vector, event, nested data
record and nested array cause refusal with zero trap execution, zero native or
provisional effects and released reservation. Include revoked proxies, ordinary
accessor controls, valid restored data, and both direct capture and actual
recipient admission. No standalone manufactured receipt can prove this.

## V4 — Committed batch application still trusts the mutable array iterator

Severity: high. Categories: complete-vector delivery, adversarial JS intrinsics,
owner interaction.

The exact sister application owner captures the complete durable/mixed vector
then traverses it using `for (const event of events)`
(`message-group-service-raft-timing.js:64-79`). The resulting owned frozen array
still inherits `Array.prototype[Symbol.iterator]`. A post-import replacement can
return only the first member of `[D, ordinary-U]`, or no members, while indexed
capture and digest paths continue to see the complete vector.

`applyCommittedEntry:202-205` then registers acceptance for the unchanged full
committed command. `message-group-cdc-committed-acceptance.js:274-288` correctly
builds and validates the full N digest and durable receipts in afterCommit, but
it has no evidence that the skipped ordinary member was dispatched to the
application owner. The new canonical N answer can therefore describe the whole
vector while committed application skipped a member. Use an iterator replacement
specific to arrays of CDC members to isolate this path without changing the
transaction effect runner's unrelated arrays. This is a direct control-path
counterexample, not an executed lab result.

Required correction: apply the owned captured vector by its actual indexed
membership at the existing committed-application owner, preserving order and
normal application/transaction effects. Do not have the receipt owner perform
cache mutations or add a second application audit ledger. The current indexed
provisional loop is already the correct corresponding boundary.

Required paired proof: actual native mixed command with iterator replacement
must apply every distinct row before a successful afterCommit result. Ordinary
and durable stamps and retained command order must stay unchanged. A controlled
restoration of the former iterator traversal must expose the omitted member;
receipts alone are insufficient. Include actual rollback/failure and no-early-
receipt controls, then ordinary unmodified native and provisional positives.

## Correct R4 mechanisms retained by this verdict

The response correction uses one existing `cdcCommitWaitIdentity` owner and the
canonical prefixed digest (`cdc-delivery-outcome.js:224-249,291-321`). Both native
and provisional forms require own core fields and the complete request digest.
Per-durable exact receipts still enforce source identity, semantic event digest,
recipient group and positive native index/term. An ordinary-only result is not
native or provisional durable coverage. Contradictory fields and local-versus-
transport requirements remain distinct.

Coverage retains its validated digest (`:343-355`). `cdcCoverageState` rejects
missing/mixed bindings and explicitly supplied undefined/null expected identity
(`:361-380`). `completeCdcPropagation` supplies the actual expected whole vector
before constructing any result (`:383-393`), including zero targets. It cannot
relabel `[D,U1]` observations as `[D,U2]`, omit/reorder/duplicate U, or replace a
native source receipt with a newly invented one. Root's reviewed progress and
topology consumers pass their cell binding into the predicate; that currentness
work remains separately reviewed, not inferred from digest equality.

`reserveCdcWait` reserves the existing queue slot before capture/normalization
(`message-group-cdc-committed-acceptance.js:109-139`). Its original budget starts
before that work. Input I is captured and digested, ordinary members each pass
the existing normalizer once, only its timestamp is adopted, and N is captured
as the exact waiter/command vector (`:79-106`). Assigned ordinary timestamps,
durable timestamps, supported envelope metadata and shared immutable data are
preserved. Missing/undefined/null/empty/non-string ordinary stamps use the
approved existing assignment policy; no new coercion policy or stamp journal is
introduced. Durable members bypass stamp assignment.

The actual canonical N result is validated after native/forward/provisional
delivery, and only the same live admission replaces its digest with retained I
(`:202-228,243-249`). It rechecks current service/port/lifetime/parent/budget and
preserves all receipts and other result fields. Unknown, partial, wrong-vector
or contradictory replies do not acquire success through translation. Later hops
receive already assigned N stamps; a separate admission remains free to apply
its existing missing-ordinary-stamp policy without reminting durable identity.

R1/R6 raw custody is preserved: `ownOperation` plus parent `ownChild` precedes
the actual native operation (`:142-169`), response retirement does not close raw
work, and queue entry identity/lifetime still fences settlement. afterCommit and
rollback registration use canonical append rather than mutable push
(`:274-288`). The extra retained state is I's digest, not an input-body history.
No new source/recipient cap, timeout renewal or independent retry mechanism was
found in this delta.

## Category-complete disposition and historical grounding

| Applicable review category | Source disposition / remaining proof |
| --- | --- |
| Admission and hold | Capacity precedes capture and ordinary normalization; V1-V3 leave raw input admission incomplete. Refused work must leave no native/provisional effect and must release its reservation. |
| Semantic delivery / owner interaction | Whole-vector digest and I/N translation resolve the original R4 collision; V4 prevents approving full command-to-application correspondence. Native plus remote plus source-ACK paired witnesses remain unexecuted. |
| Retry, timer and currentness | Original budget, exact N key, parent grant and service/port lifetime are retained. Expiry or replacement must refuse late translation while actual raw work stays charged. No timer-policy change is requested. |
| Concurrency and resource lifetime | Existing queue reservation and R1/R6 custody preserved; no second queue or payload history. Held raw native work and eventual cleanup still require their measured controls. |
| Recovery/formation | Provisional is weak coverage, never source ACK. The approved source progress owner may release the scan only after complete current provisional/native leaf coverage. This delta adds no original-seed classification or activation authority. |
| Intrinsics numeric/own/exotic fields | New guard references are captured and require own enumerable data. Position and receipt numbers stay primitive/safe; canonical JSON supplies existing numeric serialization. V1/V2 are live external predicate/serialization dependencies. |
| Intrinsics descriptors/prototypes/arrays | New indexed construction avoids map/filter/species/prototype setters. V3 exposes canonical reflection to proxies; V4 re-enters iterator-based application after capture. Both require the existing owner correction and paired mutation controls. |
| Harness / proof / registry | No runtime or test was executed in this review. Builder replies prove only the pure contract. Actual native application, source debt/ACK and exact checkpoint lab proof remain required. `cdc-source-native-delivery` already names the outcome/envelope/raft-timing interaction; final added helper/test/dependency registration remains root-owned. |

These are systematic owner-bound findings, not grounds for CDC-local fallbacks.
The shared canonical utility was introduced by
`f84153e5654f4dcf72fd2bb1299ea453d0c46dab` after the project's repeated hostile-
intrinsic verification failures; its source header records the same lesson.
The current verification template explicitly requires stable mutable intrinsic
operations and array membership independent of iterators. The separate strict-
own-data owner already supplies proxy rejection before reflection. Those actual
project mechanisms provide the finite repair direction; their existence is not
proof that the current CDC composition already consumes them correctly.

The author static artifacts report passing syntax, scoped ESLint, explicit
complexity-12, literal, decision-boundary and whitespace checks, and resolve 54
relative named imports without executing source. I inspected those reports and
the actual imports/owners. They do not prove native mechanism engagement. The
three-file manifest and every frozen revision remain preserved without edits.

Complete V1-V4 as one bounded owner correction, preserve all positive domain and
custody invariants above, obtain independent source re-review, then measure the
canonical, native, forwarding, delayed/expired and source-ACK witnesses on one
exact candidate. Protected activation, durable transfer, original classification,
composed two-start acceptance, Quest landing, publication and merge remain open.
