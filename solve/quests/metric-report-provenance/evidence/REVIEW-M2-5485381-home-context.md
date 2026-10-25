# Independent metric provenance review: required correction

**Verdict: REVISE** exact candidate `5485381b70d7c963f30e1468c5e8ca17d156f569`, parent `c95ec0abe2361c3c31a471f024442a330b6095e2`.

Reviewer: `subagent:/root/metric_review`. Review date: 2026-10-25.

The previously untested home-directory hypothesis is now a demonstrated provenance defect. The shared reader accepts an old zero-cycle report after the actual resolver's home-derived search context changes. An immediate measurement by the unchanged canonical producer finds one cycle under that new context. This blocks the complete-input freshness claim of the metric repair. It does not assert that the integration repository currently contains an overlooked cycle or that the original rejected candidate was correct.

The review used a separate, clean clone at `/workspace/scratch/285a938494ce/metric-review`. No production source, test source, integration checkout, branch, receipt or sealed acceptance rule was modified. The only addition within the review clone is an ignored dependency symlink to the integration clone's installed dependencies. Both lockfile SHA256 values are `8fb1a612db45cac0a61e281b41fd60da315f916b7aeb52046bcbe3e7b8d61ecd`. All eleven frozen JavaScript hashes and all six installed analyzer entry hashes match the preserved author manifest.

## M2. The seal omits the resolver's effective home directory

Severity: required/high for the provenance and reuse contract. Violated claim: the metric-report-provenance Quest's complete measured-source/configuration binding; R03, R05, R08 and R22.

The causal path is explicit:

1. `scripts/metric-report-inputs.js:110-121` records executable bytes, arguments, Node/platform identities, NODE_OPTIONS, NODE_PATH, locale, language and timezone. It omits the effective home directory.
2. Installed `resolve@1.22.11`, `lib/sync.js:15-20`, captures `getHomedir()` and constructs default `.node_modules` and `.node_libraries` search roots from that value. `lib/homedir.js` uses `os.homedir` on this runtime. `filing-cabinet` passes no overriding `paths` value for the supported CommonJS/ESM route.
3. `scripts/metric-cycle-analyzer.js:81-90` injects filesystem observations into that actual resolver. This correctly binds the paths it visited in the first context, but does not bind the context selecting those paths.
4. `cycleInputsAreCurrent` at `scripts/metric-cycle-input-facts.js:106-116` replays the previously observed paths. Those paths and all their contents can remain unchanged when the home directory changes.
5. The current reader at `scripts/metric-report-provenance.js:56-72` therefore accepts the old seal; `ensureMetricReports` at lines 75-89 skips the actual producer on that accepted result.

The dependency adapter is not asked to interpret a second resolution policy. The missing fact belongs in the existing input/provenance owner.

### Actual producer and reader discriminator

The exact script is `metric-home-context-review.mjs`, preserved adjacent to this review. Its first invocation was blocked by sandbox subprocess creation (`spawnSync node EPERM`); that unavailable-execution record is retained in `home-context-5485381/produce-home-a.json`. It is not a product result.

The same script was then run with approved subprocess capability:

```sh
node metric-home-context-review.mjs /workspace/scratch/285a938494ce/metric-review-evidence/home-context-5485381-r2
```

The script creates one tiny project using the committed metric fixture and two separate scratch home directories. Both homes and both dependency files exist before the first measurement. The source requires a bare module from `.node_libraries`. Home A's module has no back edge; Home B's same-named module requires the source, forming one cycle. No source or dependency byte changes between observations; only the child process's HOME context changes. The real user or parent process HOME is not changed.

| Observation | Actual result |
| --- | --- |
| Canonical `scripts/check-circular-dependencies.js`, Home A | Exit 0; sealed cycle count 0 |
| Shared reader, Home A | Accepted; cycle count 0 |
| Shared reader, Home B, before refresh | **Accepted; stale cycle count 0** |
| Same canonical producer, Home B | Exit 1 under unchanged zero-cycle ratchet; sealed cycle count 1 |
| Shared reader, Home B, after refresh | Accepted; cycle count 1 |

Both measured seals' `provenance.inputs` are byte-equivalent as JSON. The old manifest records an actual content read from Home A, and the new manifest records an actual content read from Home B. The three relevant file hashes remain identical throughout. Thus this is not an unresolved import, skipped traversal, changed source, fake report, parser refusal, timeout, missing package, altered ratchet or vacuous assertion.

The two producer invocations each took less than one second. All five children terminated normally with no signal. The script synchronously confirmed completion before removing only its allocated fixture roots. There is no retained process or cleanup uncertainty.

Complete commands, contexts, stdout/stderr, statuses, source hashes, both sealed reports and summary are in `home-context-5485381-r2/`. The summary's `staleZeroAccepted` is true. `source-and-artifact-manifest.json` binds the review inputs and retained artifacts.

### Required repair and proof

Bind the **effective** home-derived resolution context through the existing shared input owner, using the platform's actual home-directory semantics. Recording only raw Linux HOME is insufficient as a portable statement of that semantic input. Keep the analyzer as resolution authority and keep the filesystem-observation manifest; do not add a second resolver, disable legitimate analyzer paths, or make consumers force-refresh indiscriminately.

Retain a permanent regression through real producer and shared-reader paths. It should prove unchanged-context reuse; changed-context invalidation without any file mutation; a new actual measurement detecting the alternate dependency/cycle; and reuse after that refresh. Existing source/config/tool identity and semantic-inventory identity witnesses must remain applicable. A correction needs its own exact source binding and independent delta verdict before composition.

## Remaining scoped review

I inspected the full six-production-file correction, all five changed/new test files, their author evidence, the installed analyzer source, and direct report consumers. The exact delta has 25 paths; the other paths are evidence, Quest history, generated inventory and metadata. I found no second concrete defect in that inspected surface.

The older M1 rejection remains historical. Its two causes are addressed in current source: `.cache` is no longer excluded, and actual analyzer content/resolution observations cover imported dependencies outside declared entry roots. The new reader binds the observation manifest to the payload checksum and refuses the old schema. Those original regression tests remain in `metric-report-inputs.test.js`. Their reported success is author evidence; this reviewer did not rerun the seven-file regression suite.

The bounded adapter retains one actual resolver. It captures precinct content reads and resolve filesystem hooks, checks graph-node and edge coverage, checks skipped-resolution coverage, and refuses unbound/custom/AMD/TypeScript routes. The generic route is tied to the inspected installed-source digest. Observer cleanup restores the exact cabinet export and resolver function in `finally`; the disabled captured wrapper delegates; cached dependency-tree reuse is refused. These are source findings supported by the committed custody tests, not independently rerun custody-test claims.

The shared reader remains the reuse owner for inventory and the complexity closure oracle. There is no new raw-reader or unsealed-report fallback. Local provenance remains excluded from semantic inventory identities. The revision does not change metric thresholds or production/runtime behavior. Full cyclomatic status remains the author-reported inherited 1765/1755, not an independent broad measurement by this reviewer.

## Checklist disposition

`SOURCE` means inspected source/test design, not execution. The tiny actual analyzer experiment is measured evidence. No native, physical service, full-corpus, broad analyzer, hook, publication or release gate ran in this review.

| Applicable checklist area | Disposition and evidence |
| --- | --- |
| Owner 1-2: one decision owner and shared seam | SOURCE: shared `metric-report-provenance` reader; analyzer supplies facts. M2 is a missing semantic input, not a need for another owner. |
| Owner 3-4: paired freshness/reuse and stale-to-fresh progression | FAIL M2 before refresh; measured success after explicit canonical refresh. Both contexts use the same source and real tools. |
| Owner 5-6: bounded demand, invalidation and recovery | SOURCE: sequential stale-only refresh remains unchanged. M2 prevents required invalidation. No new retry or backpressure policy. |
| Owner 7: projection authority | FAIL M2: the accepted projection can describe an older resolution context. |
| Owner 8: controlled negative | MEASURED: same-source, changed-context negative; fresh producer positive control; exact candidate/source/tool hashes. Historical M1 is not reused as current failure evidence. |
| Owner 9-10: no alternate path and contract/proof alignment | SOURCE: no bypass found in direct consumers. Quest complete-input claim fails M2. |
| Harness 1-2: intended cause and honest seam | MEASURED: actual Madge/resolve, canonical producer, shared reader; initial and fresh count/exit controls. |
| Harness 3-5: timing, fields and nonvacuity | MEASURED: no compressed timeout, real generated reports, exact content invariance, actual home dependency reads and nonzero fresh cycle. |
| Harness 6-8: entry path, ceiling, failure attribution | MEASURED report-owner boundary, SOURCE inventory reachability. EPERM is separated from the completed analyzer result. No product runtime or physical claim. |
| Admission 1, 5-6, 8: authority/freshness/release/progress | FAIL M2: old-path facts do not predict current analyzer enforcement after context change. Canonical remeasurement restores current evidence. |
| Admission 2-4, 7: refusal, budget, shape and message | SOURCE: stale reports regenerate, refresh failures throw; no new deadline or ambiguous success path introduced. |
| Concurrency and resource custody | SOURCE: dedicated one-measurement process, restored export/function, synchronous atomic final report rename; quiescent inputs remain assumed. No hostile in-process mutation or concurrent stress claim. MEASURED: all experiment children terminated and fixture roots were removed afterward. |
| Hostile JavaScript inputs | N/A arbitrary accessors, prototype mutation and replaced intrinsics: this is trusted in-process producer data plus parsed local JSON, not a new public hostile-JavaScript boundary. Existing checksum/malformed-report tests remain author evidence. |

## Disposition

Return the one demonstrated M2 correction to the author and then review its changed input/context seam. Preserve the author results and original M1 history. The complete metric repair remains unapproved; this review supplies a specific reason rather than treating the previously interrupted review as a verdict. No additional merge blocker beyond this metric repair's existing acceptance claim is introduced.
