# Independent review: bounded canonical JSON cut

Reviewer: subagent:/root/takeover_cdc. Verdict: **APPROVE by source for the
six-path cut**, with exact-candidate physical proof and generated metadata still
open. This is not a test pass, merge approval, Quest closure or release claim.
No production edits, tests, syntax checks, static checks or generators were run
by this reviewer.

## Reviewed identity and scope

Effective base: live main `49fba99e1ad27acf83a75fdcee1f89a061377de4`.
The initial inspection used ef93af85; the intervening 32 changed paths are
documentation/Quest changes, and the exact six-path code/test patch hash is
unchanged after the worktree fast-forward. Applicable updated solver workflow,
code-style, owner-interaction and epic/CDC continuation guidance was read.
Frozen patch SHA256:
`ea1ac29c03c622a3eff3ace5e1c1d1d8727a1f62096b1dbee337ec9232afde4f`.
The patch hash was read and matched. The worktree's six source/test changes match
this surface: canonical-json-data; two direct diagnostics import consumers; the
deleted diagnostics forwarding module; the serializer test; and the calculator
functional test. The draft Quest and this review are separate review records.

The causal repair is nested serializer admission, cycle refusal and owned option
reads in the existing serializer. It does not introduce captureJsonData, export
an error class, add system-row ownership, or import any CDC, lifecycle, authority
or storage changes. The private CanonicalJsonDataError preserves the existing
TypeError/message contract rather than exposing a new protocol.

The current source confirms that the former diagnostics module only forwarded
functions from canonical-json-data. Both production consumers and its functional
test now import the same owner directly. A full textual caller census found no
remaining executable reference to the deleted module. The only remaining current
references are generated subsystem observation metadata and the diagnostics
INDEX; those are owed generator outputs, not compatibility callers.

## Consolidated contract and hostile-input review

| Check | Source evidence and outcome |
| --- | --- |
| One admission/serialization owner | serializeJsonData, serializeDataValue, serializeArrayData and serializeRecordData remain one recursive algorithm in src/utils/canonical-json-data.js. No fallback serializer or forwarding facade remains. |
| Nested array authenticity | serializeArrayData calls the existing isDenseDataArray before any indexed value read. That predicate rejects proxies before reflection, requires the canonical array prototype and own length, and checks every own key as an enumerable data index. Holes, extra fields, symbols and accessors cannot be silently serialized. |
| Record/own-property discipline | serializeRecordData keeps the existing isRecord predicate. It accepts only ordinary or null-prototype records with own enumerable string-keyed data properties. Inherited fields cannot become record data. |
| Accessors and coercion | Arrays and records are validated before value reads. No callback is invoked while traversing accepted containers, so the synchronous validate-then-read span does not expose a callback-driven TOCTOU. Exotic boxed values and functions are refused. Primitive strings alone reach captured JSON.stringify; finite numeric values alone reach numeric string conversion. |
| Options | serializeJsonData first validates options with isRecord, then reads spacing and sortKeys from captured own-property descriptors. Absent fields do not consult Object.prototype; present accessors and proxy option carriers are rejected. The default record is frozen and owns both fields. Existing ordinary literal call sites remain valid. |
| Mutable intrinsics | Array, object, proxy, finite-number and stringify primitives were already captured. The added WeakSet constructor and add/has/delete methods are captured at module evaluation. Traversal uses indexed loops, not array iterator hooks or mutable collection methods. |
| Cycles versus repeated subtrees | The WeakSet contains only the active ancestor path. It is updated before descent and cleared in finally. A back edge fails with the canonical TypeError; a shared acyclic child is serialized at each occurrence. The set is invocation-local and escapes nowhere. |
| Numeric edge lattice | The serializer retains its existing finite-number policy, including normalization of negative zero to the same bytes as zero. It does not perform arithmetic or acquire an integer-range authority; MAX_SAFE_INTEGER policy remains with callers that require it. Non-finite numbers, BigInt, symbols and boxed numeric objects remain refused. |
| Error and recovery behavior | Invalid input throws the existing typed refusal; there is no success substitute, retry loop, timer or retained registration. finally removes active ancestors even on failure. Later calls start with an independent set; the positive controls exercise useful serialization after refusal. |
| Resource lifetime | One WeakSet per serialization; only active ancestors are retained, and traversal remains synchronous. Recursion depth and output allocation are unchanged host-resource limits, not newly claimed bounded-input or denial-of-service guarantees. |
| Caller closure | Diagnostics changes import paths only. Existing serialization/digest consumers include CDC event identity, source-scope digests, transport encoding and benchmark records; the canonical selector must retain their registered coverage. Unchanged predicate-only consumers acquire no new behavior from this patch. |
| Treatment fidelity | The fourteen new controls preserve actual nested getters/holes/hooks/proxies/cycles/options and ordinary positive cases. The only removed test asserted identity of the deleted forwarding facade. Existing digest/serialization, record/array admission, strict-copy and calculator functional assertions remain. |

No blocking source defect was found in this bounded surface. Additional owner
state, retries, distributed release ordering and native storage behavior are
inapplicable to this synchronous utility change; they remain in their separate
Quests rather than becoming acceptance conditions invented here.

## First-red applicability and proof limits

The original serializer blob is
`bdb5d91cd65fecff3a415f118e54616cf4793614` in both this base and the preserved
`9248b188c796a2e58b8b319871bad9d0c1d88982` control tree. The shared hostile helper
is `ccf13a5be19794dacb10af4e257380904a889c64` in both. The fourteen new serializer
control bodies in the extracted cut retain those in the original control tree.
This establishes source/test applicability for those controls; it does not infer
what lab job 3194 actually observed. Its complete original stream still must be
read and attributed before writing a measured-red claim. A broad-tree pass is
not this standalone cut's exact-candidate acceptance.

The relevant historical owner path is the canonical JSON extraction retained in
54dd2d7ce and the earlier diagnostics verification work in f84153e56/4c78c7435.
The existing module comment records repeated hostile-input review as the reason
for the shared owner. This patch corrects the remaining nested array and options
seams in that owner rather than adding another caller-specific validator.

Primary language semantics were checked at:

- https://tc39.es/ecma262/2025/multipage/structured-data.html#sec-serializejsonproperty
- https://tc39.es/ecma262/2025/multipage/indexed-collections.html#sec-array.prototype.every

The former distinguishes primitive quoting from object serialization hooks and
uses an ancestor stack for cyclic JSON structures. The latter skips missing
array elements, explaining why callback-based traversal alone is not a dense
own-data admission proof. These sources motivate the algorithm; only repository
controls establish the implementation's behavior.

## Lean physical-lab plan using current repository commands

Run on the standalone cut, never on the composed epic tree. The lab coordinator
owns all dispatch. Pin the exact candidate commit/tree, base, Node version,
command list and original full streams. Do not use automatic retries or replace
first failures. The six changed semantic paths include the deletion; static
lint/metric arguments include only extant files.

1. Prepare generated material on one physical checkout using the canonical
   producers, sequentially:

   ```sh
   npm run test:metadata:refresh
   npm run generate:source-owner-index
   ```

   Preserve the complete binary patch, source/tree identity and generator output.
   Source semantics must remain the frozen six-path patch. Reconcile and freeze
   generated output before exact-head acceptance; do not silently absorb broad
   epic metadata or hand-edit the stale facade references. If unrelated baseline
   drift appears, preserve and disposition it rather than increasing a baseline.

2. Obtain the canonical selection and reasons on that exact standalone tree:

   ```sh
   npm test -- --base 49fba99e1ad27acf83a75fdcee1f89a061377de4 --list --explain
   ```

   This current API is list-only. It retains the vanished facade's old semantic
   path and the safety spine. canonical-json-data is already an endpoint of the
   cdc-source-native-delivery impact contract, so a small source diff can still
   owe its registered witnesses. Do not replace that result with a hand-picked
   five-root acceptance claim or prune the contract merely to shorten the run.
   REFUSED or WIDENED output must keep the existing proof-owner consequence.

3. Run the selected unique roots through the canonical test:file entry point in
   disjoint lab lanes. For early useful measurements, the two direct roots are:

   ```sh
   npm run test:file -- test/utils/canonical-json-data.test.js test/diagnostics/comparative-efficiency-opportunity-calculator.test.js
   ```

   A disjoint direct-serialization caller lane can contain:

   ```sh
   npm run test:file -- test/partition/cdc-event-buffer.test.js test/partition/cdc-event-buffer.property.test.js test/transport/message-router-cdc-encoding.test.js
   ```

   The coordinator must reconcile these against the canonical selection, then
   schedule every remaining selected root once. These focused measurements are
   not substitutes for the selected cone. Any reuse across a generated-only
   freeze needs explicit source/test/tree provenance through the existing proof
   owner, rather than silently calling it exact-head proof.

4. Static proof uses the existing bounded route plus the index and strict metric
   checks, on the physical lab only:

   ```sh
   node scripts/check-fast-static.js --base 49fba99e1ad27acf83a75fdcee1f89a061377de4 --explain
   npm run audit:source-owner-index
   npm run test:metrics:scoped:strict -- src/utils/canonical-json-data.js src/diagnostics/comparative-efficiency-opportunity-calculator.js src/diagnostics/comparative-efficiency-opportunity-input-validation.js
   ```

   fast-static already runs impact/shard audits, dependency checks, lint for the
   five extant changed JavaScript files and its scoped metric report. The final
   strict command supplies the three extant changed production files. The
   deleted facade stays in change/selection provenance but cannot be passed to
   ESLint as an extant target. No checker, threshold, baseline or CI workflow is
   changed by this plan. Publication and release gates remain separately owed.


## Base reconciliation

The source approval above binds the unchanged ea1ac29c patch on live main49fba,
not a stale local main. Both original serializer/helper blobs were re-read at
the new HEAD and remain bdb5d91c/ccf13a5b. The updated owner guidance explicitly
requires existing API/caller census, material counterexamples and independent
review; those are included above and in the author's current review-scope table.
The new main CDC continuation is an unsealed proposal and does not make its
preserved WIP source-image implementation available on main or supersede the
original CDC seal. That reconciliation belongs to the CDC cut map.
