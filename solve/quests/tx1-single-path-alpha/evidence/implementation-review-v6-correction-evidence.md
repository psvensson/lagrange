# Independent V6 corrective-evidence review

**APPROVE the reviewed corrective content and its bounded behavioral evidence for non-main WIP preservation with honest HOLD. Whole deletion Quest approval, landing, main integration and publication remain WITHHELD.** The exact correction now has meaningful source-only falsifiers and current retry/public-seam regressions. Existing V5 recovery and other acceptance reds remain open. This is a new evidence review; no prior report is altered or reinterpreted.

No production, tests, registry, baseline or Git edits; no tests/lab execution, manual status poke or extra release was performed by this reviewer. This report is the only write. The complete seven-category item review remains incorporated from `implementation-review-consumer-correction-frozen.md`, verified SHA256 **`d64aa2e45e5970d82fac43f8b61fd664bcbc59dd030393fbee5901ac95b9229f`**. Its actual full V1 citation and append-only historical census correction remain binding.

## Exact input and treatment check

| Treatment | Immutable path | HEAD / tree |
| --- | --- | --- |
| Candidate V3 | `/tmp/session-worktree-a1ayrY/tree` | `57f98ca76d948e3a8f0d9e4dbe63992d68bde987` / `5404bba10d321c6b5ac50c438f69c3c782ea73ec` |
| Source V2 control | `/tmp/session-worktree-IG0jGz/tree` | `204364d3c720bbb97c12b996918a6f7646194a6d` / `9562e94d5f9ece68f12996ef6343eb6328fb1080` |

Git object comparison proves the entire test tree is identical: `573270a14b4bb939865bac1abc54231b61ef35bf`. Exactly eight paths differ between the pair and all are under `src`: the six necessary consumer corrections and two comment-only ownership corrections identified in the prior review. There is no signature/test/registry/script/environment-file treatment difference. Control `src` is `8b6ea2b7b686ea6af345f08923022d9f33e42d84`, identical to V5/V2 source `59e022721a94b449aa0d1ee47a441db29fb5f8d7`; candidate `src` is `349653ba1e7b572065ae2de213654aa7785f2331`.

Candidate all37 entries match `source-review-manifest-v3.json`, SHA256 **`7c7b498fc6f3e0433cb40ed57e874989c5a73af650b48f61f731a0122cde8d4a`**, zero hash/status mismatches. Independent comparison of every tracked non-shard `src`/`test` file in that snapshot to the live frozen worktree finds zero differences. The only later metadata change is the explicit impact-contract registration described below; the four generated metadata files remain identical to the tested snapshot. That metadata delta must be included in the eventual preservation commit/manifest; this report does not invent its new committed SHA.

Reached unchanged witness hashes: no-handler retry `748f992cc0b2748e40804011a2676255efe8126d3bf6b4e132030e2eaf66f3cc`; classifier `d7a196ce9f789d83f50c2a2ea3b26d83c403f6497aa7be0f7896e0207d0c8bd9`; public facade `a270a1bab77f16b11dbb7dd1f1cda4f41d79436f5cd5a62f5fc54423e1d7e00b`. Runtime and alpha witnesses still match respectively `8f63c5e1ba41b8973a8a90f79c94eb33bffef8f65706e21ad4457cbe1ff65124` and `b96160819b027fe98396a4786460247762a17dc63078e69bacfa388ab501bdd0`.

## Behavioral negatives and positives

The retained lab placement log names `tv-dator` and the exact HEAD before each treatment (`frozen-v6-correction-ab.log:1-16,526-541`). Both runs finished, attempt1, with no retry. Control exits1 with0/2 files; candidate exits0 with2/2. Each reports122 runner assertions, split53 classifier/69 query. Raw failure content and per-file NDJSON were read, not only the aggregate status.

1. **Retired phrase negative engages the real classifier.** Control reaches `control-plane-error-classification.test.js:199`; expected false, actual true for the retired English phrase (`ab.log:71-99`), subtest duration19.695ms. Typed pressure/transport/write-kernel/hard-validation/aggregate controls in the same file pass. This is the removed semantic interpretation, not an import/setup or missing-symbol failure.
2. **Typed-only delivery negative engages the normal delivered-response seam.** Control reaches `no-handler-repair.test.js:1185`; the NOT_LEADER answer has generic QUERY_FAILED text and no defer/retry-after marker, but `codedResult.success` is false instead of true (`ab.log:306-347`). The exact delivery assertion at:1189 also fails: the first leader response has no fallback delivery, yielding `[leader, leader, fallback]` rather than `[leader, fallback, leader, fallback]` (`:348-379`). The full typed CUTOVER_PAUSED second request succeeds in that same subtest (`:347`), so the classifier method signature, fixture and general retry setup are engaged. The failing subtest is14.763ms (`:381`), well before a healthy operation deadline. The candidate passes the unchanged full files (`:542-547`).

Other existing budget tests deliberately emit `wait_bound_spent` in the control's raw output (`ab.log:439-522`); those are separate injected failure/budget assertions which pass. They are not the cause of either new behavioral negative, and do not excuse any healthy spent bound. The host's automatic placement scaling reports factor1.3 then1.4; therefore this pair is correctness evidence, not a precise performance comparison. The immediate named assertion mechanism is independent of an expiry-order change.

The candidate corrective cohort on `adam-laptop` passes9/9 files and1003 runner assertions (`frozen-v6-corrective-cohort.log:13-25`, per-file NDJSON). All nine entries report attempt1/no retry. It includes session pin/build SQL, provisioning, repository retry/session/budget, lost-outcome storage-reservation, CDC typed retry, CL-036 activation, dispatch requeue, metadata-owner retry and bootstrap control-lane behavior. The retained thermal hold precedes execution (`:11-12`); it is not reported as semantic test runtime. No existing timeout/retry limit was changed to produce these results.

These observations close the corrective classifier/typed-delivery/retired-double proof gaps only. They do not remeasure every original alpha/native/crash/release control on V3, or prove the unrelated unknown-outcome/recovery obligations by aggregate success.

## Qualified public facade evidence

`lenovo-laptop` runs the exact candidate in the exclusive lane, one file, no parallel cluster (`frozen-v6-facade.log:1-20`). Exit0,1/1 file,58 runner assertions; raw TAP explicitly reports50/50 leaf assertions. Those counts describe different runner/TAP accounting and are not combined or presented as58 leaf checks.

The raw TAP reaches all seven current subtests: committed two-participant callback/readable rows; later/first/caught failure absence; reserved raw COMMIT; concurrent one-winner/one-refused; and no public topology/session leakage. The conflict subtest proves fulfilled/rejected outcomes, current public INTERNAL_ERROR mapping, exact new owner-derived message, no deferred/retry-after claim and no loser rows (`facade.tap:49-59`; unchanged source facade:226-259). This validates the actual public error seam rather than predicting its shape from a private helper. It remains single-runtime coordinator-visible semantics and does not certify distributed durability or atomic cross-partition visibility.

**Formation is slow and must be reported explicitly.** Runner duration279572ms, TAP outer duration277419.764ms. Formation reports active126652ms, nodeStart126600ms, then first served application write10852ms later, one attempt (`facade.tap:3,85-89`). No outer harness/test bound was exhausted in this retained run. The unchanged harness owns a150000ms reference total formation bound, scaled per host, and passes its remaining total budget to the seed start (`embedded-cluster-harness.js:51-67,524-547`); the logged host factor is2.6, giving390000ms total, versus about137504ms observed through the first write. The unchanged public test declaration is600000ms (`public-application-database-shape.js:33-34`). These files are byte-identical to e6. No budget was enlarged by this correction.

This is a green bounded semantic run, not startup/formation performance certification or evidence that every internal startup wait is healthy. Embedded internal owner traces are not included in the retained TAP, no same-host predecessor facade performance comparison is provided, and the long formation cannot close M1 or an unrelated healthy timeout. The existing three-runtime/FreshMG/replicated-apply obligations remain open.

## Metadata correction independently checked

The existing `partition-write-answer-retry-classification` contract now names query-executor-shared, partition-delivery and write-retry-routing in its owners (`impact-contracts.json:704-714`) and the same current retry consumer endpoint (`:1655-1674`). The strengthened typed-only no-handler witness occurs in both contract tests and coupled witnessTests (`:721,1683`). This is the existing interaction, with unchanged write-kernel/errors authority and no duplicated classifier or new competing contract. Including shared is appropriate because it owns the named retry decision vocabulary across this seam.

Final live impact-contracts SHA256 is **`a8cb1761634196cb563da89206776001863ef138ad93f771cde7c8cc5110095c`**. Generated graph/primary/resource/subsystem files remain respectively `031f78a4fadea3268b1e929b94c46ab515e80d42c3e2832c9eca56d9cf01620c`, `d2877e7a11aad7c0f81b8d4332ff4c4d176c4e06a42a261a5be10f82df809d1b`, `6e5ba8de8420d39bf18cbf4ebb67e996ca7463c2b9ea4871f325d6d32811a074`, `519f43d0a27c320a2ed24d304c604edcdbf734bd3f347a8b6bfd658964163633`, verified identical to candidate snapshot. Writer reports canonical refresh once, impact audit62/33 and shard audit2366 pass. Semantic content gap in owner-interaction item10 is closed; exact final snapshot/guard binding remains required.

## Seven-category disposition and remaining gates

The complete per-item review in the incorporated hash remains in force; no checklist item is waived by the following measured update.

| Category | V6 disposition |
| --- | --- |
| admission-gating | APPROVE bounded corrected transient/terminal and reason-shape evidence. Typed-only/full deferred controls and current refusal seam are nonvacuous. Original collision/removal/hold/current identity proof stays retained; current healthy release-liveness proof remains HOLD. |
| recovery-replay | APPROVE unchanged correction content and current lost-outcome cohort. Same-entry/CAS/rollback owners are not changed or replaced; V5 actual healed release continuation remains RED. Current application snapshot/enlistment/full crash certification remains unclaimed. |
| sweep-timer | APPROVE unchanged budgets/current cadence and deliberate repository expiry controls. No new timer/driver/jitter or increased wait. Slow facade is qualified; no waiver of V5/W1/M1 healthy exhausted bounds. |
| concurrency-serialization | APPROVE explicit routing/session preservation, route-only implicit rotation and actual public conflict/no-loser evidence. Existing single-flight/write identity and unknown-outcome same-address owner remain the only owners; no forced route/release bypass. |
| owner-interaction | APPROVE six necessary consumer corrections and final same-contract endpoint/witness content. Corrective A/B binds actual source hashes and unchanged witnesses. Whole exact-HEAD, original regression cone, broad/static and final scope/guard gates remain HOLD. |
| harness-fidelity | APPROVE two engaged behavioral source-revert falsifiers, current corrective cohort and actual single-runtime public seam at their stated ceiling. No absent import/signature/setup red, no larger budget or fabricated state; no cluster/crash/performance extrapolation. |
| adversarial-js-intrinsics | APPROVE unchanged strict input/identity content and removal of absent-value coercion. V3 identity/numeric/inherited/getter/prototype/digest/array controls retain the original reviewed algorithms; this correction adds no validator or ambient helper. Their full original exact-head proof is not inferred from the two retry files. |

Read V6 fast-static raw: it stops at the same three dependency violations (missing C2 acknowledgement import, two current release ownership cycles) over5299 modules/22405 edges; no fast-static green is claimed. Root reports remaining cheap/scoped/ESLint checks pass separately; that is not inferred from the stopped chained log. Full guideline reports remain red with318 literal,42 decision and3 silent-catch findings; root reports matching e6 counts with location normalization still needed for an unchanged function. Equality of counts alone is not a waiver or a source-by-source proof. Production duplication passes47/47 groups and1462/1462 lines; test duplication remains RED at697 groups/26415 lines versus26369 allowed,46 lines over, unchanged from V2 (`frozen-v6-duplication.log:2,5`). No ratchet increase is authorized.

V5 deferred singleton release remains19/20 under both source treatments with the actual10000ms post-heal body bound spent. Prior W1 unknown-phase30s, M1 healthy1000ms and broad1146-file92-red taxonomy/control obligations remain open. Current snapshot, FreshMG, CDC/full integrated crash and all eight parent receipts remain outside a bounded green claim. The deletion Quest stays HOLD; non-main WIP preservation may retain the coherent independently reviewed content with explicit red gates and exact SHA evidence. This report grants no whole-Quest acceptance, main merge or publish authority.

## Evidence fingerprints

```text
frozen-v6-inputs.json b6e6ac0db6ce3ce6b1b87ade69ea6f4a150b565a4048fcb438054b3f368a6b96
frozen-v6-correction-ab-status.json 2200e339088022fd3cb5f7ff559260022a1735f81b8a0e6e04bb8d1a53a1431a
frozen-v6-correction-ab.log 3ced81c23b4a751f6eb4c2b43ce9714647e01ffedfcf3f99aa6799213172d7b6
frozen-v6-corrective-cohort.log b15905764982f2903c979ddf7d1dc69ec559d639c0f5811f2c54e4e68df2c83e
frozen-v6-facade.log 09adf899c85b59f6ee302cec2dab1122603aa9d17d2c7aa8a74b95fdbb27a93b
frozen-v6-facade/facade.tap 50a6749eb00ec37828e234e93a6b31674d999e28777237dc28d120fb79ef0c00
```

Artifacts are under `test-output/alpha-single-path-20261013/` in the live review worktree. Inputs, source and test fingerprint comparisons were read before and checked again at report completion. No measured run is relabelled or historical report overwritten.
