# Independent LOCAL constructor dependency audit review

Verdict: **APPROVE** exact clean candidate `edfcd02b6aee218d8ca7467fd37e22fbc8317e20`, bounded to the successor LOCAL contract. No required corrections found. This supersedes neither the prior provider-purity REVISE nor any runtime/fresh activation gate. Review completed 2026-10-25T10:12Z by `/root/fresh_seed_review`.

## Candidate and authority

Author tree: `/mnt/data/peter/projects/.worktrees/codex-seed-constructor-audit-20261025`; isolated review: `/tmp/session-worktree-FKtowI/tree`. Candidate tracked clean before snapshot and after verification. Rule revision 2026-10-26 loaded through target AGENTS -> rules -> router. New sealed `solve/quests/local-constructor-dependency-audit/{quest.json,DESIGN.md}` explicitly supersedes `seed-constructor-injection-audit`; its append-only terminal retains the rejected claim and source checkpoint. Integration owner accepted the LOCAL boundary recommendation. No provider purity is inferred by this approval.

All 16 changed-path identities and three source hashes verified against the author manifest SHA256 `3b2f41dfebf5ea0e96e4fcae8cd0e735dc3ad534250f562fd7808dbf2aefc094`; review `snapshot-manifest.json` SHA256 `6eaf01fa579865df75fd2e59521155f5d52eb8ce19f49aacb3db4761c7c16386`. No `src/` or baseline delta versus `af8a0381be10bebbb3daf78bd331f7aa3fcacbbf`. The old provider helper, external context/root API, and obsolete transitive tests are deleted with no current source callers. Old reports and counterexamples remain in the author's preserved evidence; deletion of the old mutable DESIGN is accompanied by its exact archived bytes and predecessor checkpoint, not a changed seal.

## Causal boundary and source verdict

`passiveConstructionOccurrences` remains the only occurrence-policy owner. The added 83 lines at `scripts/checks/decision-boundary-construction.js:252-340` classify reference values in static constructor options and close backwards over simple const aliases. They do not inspect providers or execute user source. A separate forwarding WeakSet prevents syntax labels from satisfying alias use closure. An alias needs a real value-reference use; every use must be forwarded. Assignment, update, binding conflicts, unknown escapes and nested function/class uses retain source evidence. Noncomputed member paths and optional chains intentionally remain syntactic references, even when runtime accessors might run.

The collector consumes that occurrence set at `scripts/check-guideline-decision-boundaries.js:395-434`; it does not manufacture a second policy or external capability. The surviving constructor/publication logic is byte-equivalent to the predecessor. All 183 prior assertions remain unchanged; 94 new authored assertions append to the existing file. No allowlist, whole subtree exclusion, getter-name waiver, product rearrangement, baseline increase or alternate fallback was introduced. Compared with af8, the collector's only text delta is line wrapping.

Maintainability is acceptable for this bounded grammar: one owner, finite AST roles, no filesystem provider graph or symbolic JavaScript interpreter. Alias closure terminates because every successful round removes declarations, and an unsuccessful round stops. State is per-function and discarded after classification; iteration can be polynomial in syntax size, and no large-source performance claim was measured. This is an approximate identifier-based audit: it does not establish arbitrary type, callee or effect properties, and pre-existing string-literal-name blind spots are not made safe by a zero finding.

## Independent measured evidence

Commands used the ordinary classified runner, `LAGRANGE_RETRY_FAILED_ONCE=0 LAGRANGE_LANE_JOBS_CAP=1`, normal thermal checks, no retry or gate bypass.

- `existing-and-author.tap`: 277 assertions pass (all 183 existing plus 94 new), 2104 ms. CPU 60 C / NVMe 68 C.
- `independent-final.tap`: 58 assertions pass, 334 ms. CPU 54 C / NVMe 68 C. Reviewer source retained as `independent-probes.js` and removed from test discovery afterward.
- The independent lattice exercises computed selection, optional calls, tagged templates, spread/await escape, returned closures, nested constructor callbacks, class fields/static blocks, deletion, Object.assign, update/compound assignment, destructuring writes, for-of writes, conditions, raw object/sequence returns, escaped fields, catch/callback shadowing and computed constructors. Eight positives cover multiple sinks, multihop aliases, static member reference aliases, optional references, labels unrelated to value identity and unknown constructor identity under the explicit LOCAL ceiling.
- Actual source probes in createBootstrapPartitionReplica, createMigrationWorkflowOwners and registerLiveQuery prove exact insertion engagement, unchanged-source classification and a forwarded-handle-then-active-read counterpart. Opaque caller forwarding and an independently flagged provider body are measured in the same fixture.
- `final-census.json`: actual filesystem `collectDecisionBoundaryViolations(['src'])` on the same candidate production bytes, once using exact af8 audit source in control tree `/tmp/session-worktree-1H5fgs/tree`, once using candidate audit. Both scan 1964 files; mixed findings 295 -> 292; exactly three removed and no additions: createBootstrapPartitionReplica, registerLiveQuery, createMigrationWorkflowOwners. This also supplies the exact source-bound before/after discriminator for the original constructor-composition finding.

The author's earlier `finding-delta.json` reports a smaller 1948-file / 291 -> 288 census, with the same three removals. The independent actual-collector result is the measured final census; the earlier input selection was queried with the author and remains labeled as their evidence, not silently replaced or used for our counts.

## Failure disposition

The first independent run had one failed expectation in 58 assertions: literal `owner["cache"]` / `owner["db"]` was expected to supply identifier evidence. `literal-control.json` confirms predecessor 0 and candidate 0; this is a verifier expectation error, because the pre-existing heuristic only visits Identifier nodes and constructor option keys were already labels. First source and full TAP are preserved as `independent-probes-first-source.js` / `independent-probes.tap`. The corrected probe uses actual cache/db Identifier receivers with computed access and passes; no product fix or claimed regression is attached to that limitation.

Author first-red and label-alias-red streams are copied, preserved and remain red evidence. All old transitive-provider review counterexamples remain findings against the explicitly retired larger claim, not passing runtime safety assertions.

## Applicable verification checklist

| Category / items | Evidence and verdict |
| --- | --- |
| Audit admission 1, 6, 7 | PASS: pure-source and filesystem collectors share the same occurrence owner; fresh parsed AST and exact per-function WeakSets, no cached proof; source occurrence diagnostic retained. Source at policy252-349 and collector395-434; final census and authored filesystem witness. |
| Audit admission 2-5, 8 | Runtime transient/terminal reasons, waits, held obligations and release latency are inapplicable to this synchronous source classifier. Local progress is removal of the demonstrated false finding with active counterpart retained, measured by census and actual-method probes. |
| Harness fidelity 1-2, 5-6 | PASS: real parser, actual source collector, exact source mutation sites and real repository methods; no mocked classifier or provider execution. Baseline source census refutes the old local classification. Nonvacuity, aliases and syntax labels measured. |
| Harness fidelity 3-4 | No compressed clocks or runtime rows. Source text is parsed by the production parser; no hand-built AST substitute. |
| Harness fidelity 7-8 | Deterministic local static evidence only. First verifier error preserved and classified; no native, filesystem durability, physical failure domain or runtime progress claim. |
| Owner interaction 1-3, 7-9 | PASS: sole occurrence policy, collector consumes only WeakSet membership; positive forwarding and hostile local-use counterparts share real collector. No external provider context, fallback or runtime authority. |
| Owner interaction 4-6 | No durable state, queues, wakes or cross-turn cache introduced. Per-call rebuild and bounded syntax closure replace the removed persistent provider source context; runtime replay/backpressure contracts unchanged. |
| Owner interaction 10 | Scope is the sealed local audit contract plus existing audit test file. Registered participant-release interaction in impact-contracts includes the collector but its completion policy is unchanged byte-for-byte; no new runtime pair or registry contract is changed. |
| Hostile JS intrinsic template 1-8 | This input boundary accepts source text parsed by Espree, not arbitrary AST/object instances or executable providers; no source getters are executed, no numeric runtime fields, digests, arrays or user coercion contract is added. The removed hostile-provider API has no caller. Intrinsic tampering of the audit process itself is not a new claim. Hostile source syntax is exercised by the independent lattice. |
| Retry, transport, sweep, recovery, concurrency, formation | Inapplicable: no runtime transitions or resource lifecycle changed. No native or long-running execution required for this source classifier. |

## Consumable dependency and remaining boundary

`consumable-audit-dependency.patch` is the exact three-file audit/test delta against af8 (SHA256 `b9bf7804d809f7dba087b73c4330fa7b6a23ef51df4750746f7e76a61330cfa7`). It contains only the local policy, appended tests and harmless collector line wrap. It does not carry rejected provider implementation history or product changes. Preserve/supersede the Quest history separately through the integration owner and regenerate derived inventory/test metadata through existing producers. The patch is a handoff artifact, not an applied integration or landing.

Final source SHA256 values:

- `scripts/check-guideline-decision-boundaries.js`: `f93294b9b41f517dbd92277dbe6b3bfedc55d634909e3b1169ad82b44997bb56`
- `scripts/checks/decision-boundary-construction.js`: `dbc6b0a1e2eb8d5414849b16198b5dc66431ac317e9214385e5f8d2c3c7c0598`
- `test/scripts/check-guideline-decision-boundaries.test.js`: `79c01a570d3a0ef3e6275f74ddb01590bbccb7b72302940ecbad1f5fb2f8b544`

This approval permits the integration owner to consume this bounded audit dependency. It does not approve a new fresh activation source delta, create a canonical fresh receipt, land a Quest, publish or merge. Bind the later clean fresh candidate to the previously approved production hashes once its author supplies that freeze. No source edits, commits, pushes, seals or receipt mutations were made by this review.

Raw evidence hashes are in `evidence-hashes.json`; snapshot identity is in `snapshot-manifest.json`.
