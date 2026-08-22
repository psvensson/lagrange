# Rule index (generated — do not edit)

One line per rule in `rules.json`. To read a rule in full with its source
citations: `npm run rule -- --id <ID>` (or `--tag`, `--domain`,
`--strength`, or free-text terms). Regenerate with
`node scripts/lookup-rule.js --write-index`.

Total rules: 689 (685 masters + 4 cross-domain aliases; alias rows say "alias of <ID>" and are suppressed from the per-domain packs, so pack banners count masters only). machine_check names the command that enforces the rule, or —.

## Source roles

Every configured source has one explicit generator role. `packed` sources
contribute binding rules to a complete domain pack; `direct-load` sources
are read under their load condition; `reference-only` sources are nonbinding.

| source | role | domain | masters | aliases | load condition / reason |
| --- | --- | --- | ---: | ---: | --- |
| system-guidelines.md | packed | architecture | 98 | 2 | — |
| runtime-contracts.md | packed | architecture | 131 | 0 | — |
| doctrine/owner-boundaries.md | packed | architecture | 17 | 0 | — |
| doctrine/single-path.md | packed | architecture | 7 | 0 | — |
| doctrine/state-encoding.md | packed | architecture | 34 | 1 | — |
| doctrine/decision-experiments.md | packed | architecture | 28 | 0 | — |
| operational-ground-truth.md | direct-load | testing | 0 | 0 | Before distributed-harness or convergence work. |
| testing-guidelines/harness.md | packed | testing | 18 | 0 | — |
| testing-guidelines/fixtures.md | packed | testing | 26 | 0 | — |
| testing-guidelines/regression-policy.md | packed | testing | 77 | 0 | — |
| testing-guidelines/release-gate.md | packed | testing | 17 | 0 | — |
| testing-guidelines/proof-ladders.md | packed | testing | 24 | 1 | — |
| code-style.md | packed | style | 14 | 0 | — |
| roadmap.md | packed | governance | 20 | 0 | — |
| agpl-feature-map.md | direct-load | governance | 0 | 0 | When changing product scope, resolving roadmapRow, or selecting or authoring a product Quest. |
| memory-boundary.md | packed | governance | 7 | 0 | — |
| audience-boundary.md | reference-only | governance | 0 | 0 | Doc-audience zoning doctrine; enforced mechanically by audit:doc-audience, so agents need the pointer, not packed rules. |
| workflow-guidelines/lifecycle.md | reference-only | governance | 0 | 0 | Convenience lifecycle summary; solver-quests.md owns the binding workflow contract. |
| workflow-guidelines/validators.md | packed | governance | 9 | 0 | — |
| workflow-guidelines/quest-artifacts.md | packed | governance | 7 | 0 | — |
| workflow-guidelines/closure.md | packed | governance | 2 | 0 | — |
| workflow-guidelines/subagents.md | packed | governance | 15 | 0 | — |
| workflow-guidelines/solver-quests.md | packed | governance | 126 | 0 | — |
| findings/2026-06-17-workflow-linking-and-memory-loop-promoted-findings-must-be-normative.md | packed | governance | 1 | 0 | — |
| findings/2026-06-17-steering-doc-clarity-repro-at-correct-altitude.md | packed | testing | 1 | 0 | — |
| findings/2026-06-17-steering-doc-clarity-deterministic-first-repro.md | packed | testing | 1 | 0 | — |
| findings/2026-06-30-adversarially-vet-hypotheses-before-presenting.md | packed | governance | 2 | 0 | — |
| findings/2026-06-30-read-freshest-precomputed-artifact-first.md | packed | governance | 1 | 0 | — |
| findings/2026-06-30-correctness-over-fewest-lines.md | packed | governance | 1 | 0 | — |
| findings/2026-06-30-plan-requests-stay-plan-only.md | packed | governance | 1 | 0 | — |
| findings/2026-07-05-prefer-machine-checks-over-prose.md | packed | governance | 1 | 0 | — |
| findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md | packed | testing | 2 | 0 | — |
| findings/2026-07-10-reuse-comparison-before-new-machinery.md | packed | governance | 2 | 0 | — |

## Rules

| id | strength | domain | source [role] | machine_check | summary |
| --- | --- | --- | --- | --- | --- |
| ARCH-0001 | must_not | architecture | system-guidelines.md:106 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: Model choice notes are advisor… |
| ARCH-0002 | must_not | architecture | system-guidelines.md:123 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: If the existing owner lacks one ca… |
| ARCH-0003 | must_not | architecture | system-guidelines.md:125 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: Callers submit intent to owners. T… |
| ARCH-0004 | must_not | architecture | system-guidelines.md:135 [packed] | — | Forbidden: duplicate helpers, wrappers, caches, snapshots, fields, or aliases for the sam… |
| ARCH-0005 | must_not | architecture | system-guidelines.md:137 [packed] | — | Forbidden: shadow state for owner-managed lifecycle or readiness |
| ARCH-0006 | must_not | architecture | system-guidelines.md:138 [packed] | — | Forbidden: fallback paths that reconstruct owner decisions from secondary evidence |
| ARCH-0007 | must_not | architecture | system-guidelines.md:139 [packed] | — | Forbidden: transitional delegators without a removal task and structural guard |
| ARCH-0008 | must_not | architecture | system-guidelines.md:149 [packed] | — | 3. One Path Per Semantic Decision — Required contract: Runtime logic consumes normalized … |
| ARCH-0009 | must_not | architecture | system-guidelines.md:160 [packed] | — | Forbidden: "try the new path, then the old path" logic |
| ARCH-0010 | must_not | architecture | system-guidelines.md:161 [packed] | — | Forbidden: feature flags that keep two implementations alive for one semantic |
| ARCH-0011 | must_not | architecture | system-guidelines.md:162 [packed] | — | Forbidden: decision branches that mix cache and SQL as equivalent truth for one meaning |
| ARCH-0012 | must_not | architecture | system-guidelines.md:163 [packed] | — | Forbidden: bags of independent if statements around readiness, admission, retry, phase, l… |
| ARCH-0013 | must_not | architecture | system-guidelines.md:177 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: null and undefined MUST NO… |
| ARCH-0014 | must_not | architecture | system-guidelines.md:180 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: Each concept has one name.… _(alias of STYLE-0003)_ |
| ARCH-0015 | must_not | architecture | system-guidelines.md:201 [packed] | — | 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: forbi… |
| ARCH-0016 | must_not | architecture | system-guidelines.md:221 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: INSERT OR … |
| ARCH-0017 | must_not | architecture | system-guidelines.md:226 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: Consumers … |
| ARCH-0018 | must_not | architecture | system-guidelines.md:228 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: Bootstrap … |
| ARCH-0019 | must_not | architecture | system-guidelines.md:246 [packed] | — | 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Events may enqueue own… |
| ARCH-0020 | must_not | architecture | system-guidelines.md:253 [packed] | — | 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Phase completion remov… |
| ARCH-0021 | must_not | architecture | system-guidelines.md:271 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Timeout budgets are can… |
| ARCH-0022 | must_not | architecture | system-guidelines.md:276 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Missing owner dependenc… |
| ARCH-0023 | must_not | architecture | system-guidelines.md:289 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Throughput may fall under … |
| ARCH-0024 | must_not | architecture | system-guidelines.md:290 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Operations must not fail, … |
| ARCH-0025 | must_not | architecture | system-guidelines.md:294 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Callers must not discover … |
| ARCH-0026 | must_not | architecture | system-guidelines.md:295 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Control-plane pressure mus… |
| ARCH-0027 | must_not | architecture | system-guidelines.md:311 [packed] | — | 10. Communication Has One Replicated Data Path — Required contract: Do not add alternate … |
| ARCH-0028 | must_not | architecture | system-guidelines.md:336 [packed] | — | 12. User-Facing Model Stays Small — Required contract: Users do not directly manage parti… |
| ARCH-0029 | must_not | architecture | system-guidelines.md:204 [packed] | — | Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse th… |
| ARCH-0030 | must_not | architecture | system-guidelines.md:232 [packed] | — | Non-forced readers do not repair authoritative state on the hot path. |
| ARCH-0031 | must_not | architecture | system-guidelines.md:238 [packed] | — | Steady-state correctness must not depend on phase-owned wiring after phase completion. |
| ARCH-0032 | must_not | architecture | runtime-contracts.md:39 [packed] | — | Owner And Path Detail — Required runtime patterns: Temporary delegators may forward to th… |
| ARCH-0033 | must_not | architecture | runtime-contracts.md:46 [packed] | — | Forbidden runtime patterns: local replacement logic when a composition-root owner is avai… |
| ARCH-0034 | must_not | architecture | runtime-contracts.md:47 [packed] | — | Forbidden runtime patterns: owner-unavailable branches that reconstruct equivalent decisi… |
| ARCH-0035 | must_not | architecture | runtime-contracts.md:48 [packed] | — | Forbidden runtime patterns: feature-local implementations of existing cache/read/write/re… |
| ARCH-0036 | must_not | architecture | runtime-contracts.md:49 [packed] | — | Forbidden runtime patterns: shadow state for lifecycle, readiness, admission, leader, or … |
| ARCH-0037 | must_not | architecture | runtime-contracts.md:68 [packed] | — | Forbidden patterns: INSERT OR REPLACE for steady-state lifecycle/status updates |
| ARCH-0038 | must_not | architecture | runtime-contracts.md:69 [packed] | — | Forbidden patterns: full-row replacement for existing lifecycle rows |
| ARCH-0039 | must_not | architecture | runtime-contracts.md:70 [packed] | — | Forbidden patterns: recreating missing rows inside updater code |
| ARCH-0040 | must_not | architecture | runtime-contracts.md:71 [packed] | — | Forbidden patterns: broad UPDATE or DELETE statements as the primary CDC mutation path |
| ARCH-0041 | must_not | architecture | runtime-contracts.md:72 [packed] | — | Forbidden patterns: one persisted field carrying unrelated claim, lease, workflow, and en… |
| ARCH-0042 | must_not | architecture | runtime-contracts.md:93 [packed] | — | Forbidden patterns: ad-hoc Maps, Sets, or objects that cache system data outside the decl… |
| ARCH-0043 | must_not | architecture | runtime-contracts.md:95 [packed] | — | Forbidden patterns: copying owner-managed fields from cache into unrelated write paths |
| ARCH-0044 | must_not | architecture | runtime-contracts.md:96 [packed] | — | Forbidden patterns: completing executor-owned topology phases from cache visibility alone |
| ARCH-0045 | must_not | architecture | runtime-contracts.md:97 [packed] | — | Forbidden patterns: mixing cache and SQL fallbacks inside one semantic decision path |
| ARCH-0046 | must_not | architecture | runtime-contracts.md:121 [packed] | — | Snapshot Readers And Repair — Required patterns: Reader-local caches do not memoize stale… |
| ARCH-0047 | must_not | architecture | runtime-contracts.md:138 [packed] | — | Forbidden patterns: snapshot repair consuming the same effective lane as critical converg… |
| ARCH-0048 | must_not | architecture | runtime-contracts.md:139 [packed] | — | Forbidden patterns: treating mild pressure as permission to publish cache-only emptiness |
| ARCH-0049 | must_not | architecture | runtime-contracts.md:140 [packed] | — | Forbidden patterns: reopening broad repair from readers on the same stressed path needed … |
| ARCH-0050 | must_not | architecture | runtime-contracts.md:156 [packed] | — | Forbidden patterns: deriving canonical leader identity from replica row iteration order |
| ARCH-0051 | must_not | architecture | runtime-contracts.md:157 [packed] | — | Forbidden patterns: treating replica rows as alternative truth when the owner row is pres… |
| ARCH-0052 | must_not | architecture | runtime-contracts.md:158 [packed] | — | Forbidden patterns: collapsing owner-row mismatch and replica-role mismatch into one gene… |
| ARCH-0053 | must_not | architecture | runtime-contracts.md:215 [packed] | — | Forbidden patterns: raw system-table mutation helper calls from runtime feature code when… |
| ARCH-0054 | must_not | architecture | runtime-contracts.md:217 [packed] | — | Forbidden patterns: second runtime read ingress with equivalent cache/SQL decisions |
| ARCH-0055 | must_not | architecture | runtime-contracts.md:218 [packed] | — | Forbidden patterns: bootstrap helper paths reachable from steady-state runtime code |
| ARCH-0056 | must_not | architecture | runtime-contracts.md:235 [packed] | — | Forbidden patterns: tearing down the only live subscriber, bridge, dissemination path, or… |
| ARCH-0057 | must_not | architecture | runtime-contracts.md:237 [packed] | — | Forbidden patterns: hiding missing handoff ownership behind fallback reads, broad repairs… |
| ARCH-0058 | must_not | architecture | runtime-contracts.md:239 [packed] | — | Forbidden patterns: inferring handoff from elapsed time or "good enough" cache visibility |
| ARCH-0059 | must_not | architecture | runtime-contracts.md:259 [packed] | — | Forbidden patterns: treating producer publication and consumer readiness as independently… |
| ARCH-0060 | must_not | architecture | runtime-contracts.md:261 [packed] | — | Forbidden patterns: letting a consumer select, repair, or admit from an owner stream that… |
| ARCH-0061 | must_not | architecture | runtime-contracts.md:263 [packed] | — | Forbidden patterns: proving the producer and consumer with separate focused tests while n… |
| ARCH-0062 | must_not | architecture | runtime-contracts.md:277 [packed] | — | Deterministic Control-Plane Progression — Required patterns: Events enqueue owner-key wor… |
| ARCH-0063 | must_not | architecture | runtime-contracts.md:282 [packed] | — | Deterministic Control-Plane Progression — Required patterns: Participant executors emit o… |
| ARCH-0064 | must_not | architecture | runtime-contracts.md:305 [packed] | — | Forbidden patterns: ad-hoc cross-owner write ordering to emulate atomicity |
| ARCH-0065 | must_not | architecture | runtime-contracts.md:306 [packed] | — | Forbidden patterns: sequential fallback branches for atomic topology cut points |
| ARCH-0066 | must_not | architecture | runtime-contracts.md:307 [packed] | — | Forbidden patterns: a second control-plane workflow engine when DurableWorkflowCoordinato… |
| ARCH-0067 | must_not | architecture | runtime-contracts.md:324 [packed] | — | Admission, Readiness, And Multi-Signal Decisions — Required patterns: Degraded or cross-p… |
| ARCH-0068 | must_not | architecture | runtime-contracts.md:343 [packed] | — | Do not pre-slice candidates to the requested replica count before admission. |
| ARCH-0069 | must_not | architecture | runtime-contracts.md:362 [packed] | — | Forbidden patterns: grouped-path diagnostics while grouped mode is disabled |
| ARCH-0070 | must_not | architecture | runtime-contracts.md:363 [packed] | — | Forbidden patterns: status checks that bypass declared active/terminal sets |
| ARCH-0071 | must_not | architecture | runtime-contracts.md:364 [packed] | — | Forbidden patterns: expiry sweeps that rewrite another owner's terminal workflow outcome |
| ARCH-0072 | must_not | architecture | runtime-contracts.md:381 [packed] | — | Forbidden patterns: nested waits using fresh full budgets after time has already elapsed |
| ARCH-0073 | must_not | architecture | runtime-contracts.md:382 [packed] | — | Forbidden patterns: generic timeout strings for semantic control-plane outcomes |
| ARCH-0074 | must_not | architecture | runtime-contracts.md:383 [packed] | — | Forbidden patterns: treating routine timeout under moderate load as operational tuning |
| ARCH-0075 | must_not | architecture | runtime-contracts.md:405 [packed] | — | Forbidden patterns: unbounded in-flight work |
| ARCH-0076 | must_not | architecture | runtime-contracts.md:406 [packed] | — | Forbidden patterns: hidden local priority queues outside the shared pressure contract |
| ARCH-0077 | must_not | architecture | runtime-contracts.md:407 [packed] | — | Forbidden patterns: callers discovering overload only by timeout |
| ARCH-0078 | must_not | architecture | runtime-contracts.md:408 [packed] | — | Forbidden patterns: resource cleanup that depends on process lifetime or scenario end |
| ARCH-0079 | must_not | architecture | runtime-contracts.md:426 [packed] | — | Forbidden patterns: direct local handler calls, ad-hoc sockets, admin forwarding, or serv… |
| ARCH-0080 | must_not | architecture | runtime-contracts.md:428 [packed] | — | Forbidden patterns: non-replicated fast paths for performance |
| ARCH-0081 | must_not | architecture | runtime-contracts.md:429 [packed] | — | Forbidden patterns: hard query failure while retryable replicas exist |
| ARCH-0082 | must_not | architecture | runtime-contracts.md:430 [packed] | — | Forbidden patterns: indefinite query queues waiting for topology transitions |
| ARCH-0083 | must_not | architecture | runtime-contracts.md:445 [packed] | — | Forbidden patterns: receiver logic that depends on caller discipline to avoid duplicates |
| ARCH-0084 | must_not | architecture | runtime-contracts.md:446 [packed] | — | Forbidden patterns: retryable paths that use non-idempotent counters or append-only write… |
| ARCH-0085 | must | architecture | system-guidelines.md:96 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: Broad or scope-changing work s… |
| ARCH-0086 | must | architecture | system-guidelines.md:97 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: Bounded implementation work ru… |
| ARCH-0087 | must | architecture | system-guidelines.md:98 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: One Quest owns one sealed done… |
| ARCH-0088 | must | architecture | system-guidelines.md:100 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: Quest progress is recorded by … |
| ARCH-0089 | must | architecture | system-guidelines.md:108 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: Quest closure is SOLVED or EXH… |
| ARCH-0090 | must | architecture | system-guidelines.md:120 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: Search before adding a function, h… |
| ARCH-0091 | must | architecture | system-guidelines.md:122 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: If the responsibility already exis… |
| ARCH-0092 | must | architecture | system-guidelines.md:126 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: Injected owners are mandatory depe… |
| ARCH-0093 | must | architecture | system-guidelines.md:130 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: Repeated bugs at one boundary requ… |
| ARCH-0094 | must | architecture | system-guidelines.md:148 [packed] | — | 3. One Path Per Semantic Decision — Required contract: Normalize boundary input once at i… |
| ARCH-0095 | must | architecture | system-guidelines.md:151 [packed] | — | 3. One Path Per Semantic Decision — Required contract: Semantic mode is represented by on… |
| ARCH-0096 | must | architecture | system-guidelines.md:153 [packed] | — | 3. One Path Per Semantic Decision — Required contract: Multi-signal outcomes use one evid… |
| ARCH-0097 | must | architecture | system-guidelines.md:172 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: Shared domain value: impor… |
| ARCH-0098 | must | architecture | system-guidelines.md:173 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: File-private value: define… |
| ARCH-0099 | must | architecture | system-guidelines.md:174 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: Test-private value: define… |
| ARCH-0100 | must | architecture | system-guidelines.md:176 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: Raw external input: normal… |
| ARCH-0101 | must | architecture | system-guidelines.md:179 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: If a scalar or state has n… |
| ARCH-0102 | must | architecture | system-guidelines.md:181 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: New source-code files use … |
| ARCH-0103 | must | architecture | system-guidelines.md:197 [packed] | — | 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: seman… |
| ARCH-0104 | must | architecture | system-guidelines.md:198 [packed] | — | 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: canon… |
| ARCH-0105 | must | architecture | system-guidelines.md:199 [packed] | — | 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: canon… |
| ARCH-0106 | must | architecture | system-guidelines.md:200 [packed] | — | 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: allow… |
| ARCH-0107 | must | architecture | system-guidelines.md:202 [packed] | — | 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: opera… |
| ARCH-0108 | must | architecture | system-guidelines.md:217 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: System-tab… |
| ARCH-0109 | must | architecture | system-guidelines.md:219 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: Initial ro… |
| ARCH-0110 | must | architecture | system-guidelines.md:223 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: CDC-replic… |
| ARCH-0111 | must | architecture | system-guidelines.md:224 [packed] | — | 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: SystemTabl… |
| ARCH-0112 | must | architecture | system-guidelines.md:248 [packed] | — | 7. Phase Code Must Hand Off To Runtime Owners — Required contract: For one owner key, at … |
| ARCH-0113 | must | architecture | system-guidelines.md:249 [packed] | — | 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Event, cache, and time… |
| ARCH-0114 | must | architecture | system-guidelines.md:251 [packed] | — | 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Broad polling loops ar… |
| ARCH-0115 | must | architecture | system-guidelines.md:264 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Topology-changing opera… |
| ARCH-0116 | must | architecture | system-guidelines.md:265 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Atomic multi-row author… |
| ARCH-0117 | must | architecture | system-guidelines.md:267 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Executor-owned phase pr… |
| ARCH-0118 | must | architecture | system-guidelines.md:269 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Readiness, admission, p… |
| ARCH-0119 | must | architecture | system-guidelines.md:273 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Exact-boundary timeout … |
| ARCH-0120 | must | architecture | system-guidelines.md:275 [packed] | — | 8. Control-Plane Work Uses Shared Primitives — Required contract: Runtime shared-metadata… |
| ARCH-0121 | must | architecture | system-guidelines.md:292 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Backpressure is structured… |
| ARCH-0122 | must | architecture | system-guidelines.md:310 [packed] | — | 10. Communication Has One Replicated Data Path — Required contract: Query/data-plane traf… |
| ARCH-0123 | must | architecture | system-guidelines.md:314 [packed] | — | 10. Communication Has One Replicated Data Path — Required contract: If performance is ins… |
| ARCH-0124 | must | architecture | system-guidelines.md:324 [packed] | — | 11. Mutations Are Idempotent — Required contract: State-mutating operations carry unique … |
| ARCH-0125 | must | architecture | system-guidelines.md:325 [packed] | — | 11. Mutations Are Idempotent — Required contract: State transitions are monotonic. |
| ARCH-0126 | must | architecture | system-guidelines.md:326 [packed] | — | 11. Mutations Are Idempotent — Required contract: Row creation uses insert-if-not-exists … |
| ARCH-0127 | must | architecture | system-guidelines.md:327 [packed] | — | 11. Mutations Are Idempotent — Required contract: Replaying an already-applied transition… |
| ARCH-0128 | must | architecture | system-guidelines.md:360 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Static guardrai… |
| ARCH-0129 | must | architecture | system-guidelines.md:365 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Known in-scope … |
| ARCH-0130 | must | architecture | system-guidelines.md:371 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: If a Quest disc… |
| ARCH-0131 | must | architecture | system-guidelines.md:373 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Architectural e… |
| STYLE-0001 | must_not | style | code-style.md:66 [packed] | — | Do not create new files with ordinal, segment, or grab-bag names such as part-2, segment,… |
| STYLE-0002 | must_not | style | code-style.md:89 [packed] | `npm run audit:guideline:literals` | Do not inline domain/runtime scalars when an owner constant or explicit state variant sho… |
| STYLE-0003 | must_not | style | code-style.md:101 [packed] | — | Do not introduce synonyms for an existing concept. |
| STYLE-0004 | must_not | style | code-style.md:109 [packed] | — | Do not expose semantic policy through combinable booleans when one named mode constant se… |
| STYLE-0005 | must_not | style | code-style.md:116 [packed] | — | Do not leak raw storage or transport field shapes into runtime model names or contracts. |
| TEST-0001 | must_not | testing | testing-guidelines/fixtures.md:23 [packed] | — | When the mutation is lifecycle-related, assert both: - the initial row exists with canoni… |
| TEST-0002 | must_not | testing | testing-guidelines/fixtures.md:39 [packed] | — | Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism |
| TEST-0003 | must_not | testing | testing-guidelines/fixtures.md:40 [packed] | — | Do not comment out tests to avoid running them |
| TEST-0004 | must_not | testing | testing-guidelines/fixtures.md:41 [packed] | — | If a test is failing, fix the code or the test - do not skip it |
| TEST-0005 | must_not | testing | testing-guidelines/fixtures.md:58 [packed] | — | It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment check… |
| TEST-0006 | must_not | testing | testing-guidelines/fixtures.md:60 [packed] | — | It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only … |
| TEST-0007 | must_not | testing | testing-guidelines/fixtures.md:62 [packed] | — | It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization pat… |
| TEST-0008 | must_not | testing | testing-guidelines/fixtures.md:64 [packed] | — | It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test … |
| TEST-0009 | must_not | testing | testing-guidelines/fixtures.md:66 [packed] | — | It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. |
| TEST-0010 | must_not | testing | testing-guidelines/fixtures.md:124 [packed] | — | System Guideline Conformance Gate for New and Behavior-Meaningful Tests — Required workfl… |
| TEST-0011 | must_not | testing | testing-guidelines/proof-ladders.md:25 [packed] | — | Quest-Driven Validation Policy — Required workflow: A Quest must not report SOLVED until … |
| TEST-0012 | must_not | testing | testing-guidelines/proof-ladders.md:115 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: Static guardrail proof… |
| TEST-0013 | must_not | testing | testing-guidelines/regression-policy.md:56 [packed] | — | Combine before creating - If two existing pieces almost solve the problem, combine them. … |
| TEST-0014 | must_not | testing | testing-guidelines/regression-policy.md:141 [packed] | — | Bug-Cluster Escalation Policy — Required workflow: Do not close the second bug with only … |
| TEST-0015 | must_not | testing | testing-guidelines/regression-policy.md:197 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Enqueue-only triggers -… |
| TEST-0016 | must_not | testing | testing-guidelines/release-gate.md:32 [packed] | — | Reference Scenario Policy — Required workflow: Do not claim SOLVED on local green proof a… |
| TEST-0017 | must_not | testing | testing-guidelines/release-gate.md:91 [packed] | — | A lever that passes its own unit DT but never moves the real observable is NOT proven; do… |
| TEST-0018 | must_not | testing | testing-guidelines/release-gate.md:108 [packed] | — | Do not treat a baseline increase lacking both same-commit artifacts as a judgment call; i… |
| TEST-0019 | must_not | testing | testing-guidelines/release-gate.md:110 [packed] | — | Tighten a baseline in the same change that removes violations whenever the measured count… |
| TEST-0020 | must_not | testing | testing-guidelines/regression-policy.md:407 [packed] | — | Do not mark the bug closed just because the baseline rerun happens to pass. Closure requi… |
| TEST-0021 | must_not | testing | testing-guidelines/regression-policy.md:413 [packed] | — | Treat timeouts as hard correctness failures by default. Do not raise product, harness, or… |
| ARCH-0132 | must_not | architecture | system-guidelines.md:102 [packed] | — | 1. Work Starts From One Bounded Quest — Required contract: docs/ holds documentation, nev… |
| ARCH-0133 | must_not | architecture | system-guidelines.md:183 [packed] | — | 4. Scalars, State, And Naming Have Owners — Required contract: Do not introduce ordinal, … _(alias of STYLE-0001)_ |
| ARCH-0134 | must_not | architecture | runtime-contracts.md:223 [packed] | — | Bootstrap, join, and recovery phases must not remain the steady-state owner after the pha… |
| ARCH-0135 | must_not | architecture | runtime-contracts.md:412 [packed] | — | During splits, moves, and leader elections, queries may be slower but must not fail becau… |
| ARCH-0136 | must | architecture | system-guidelines.md:92 [packed] | — | All non-trivial implementation work MUST follow the Quest workflow. |
| ARCH-0137 | must | architecture | system-guidelines.md:115 [packed] | — | Every state transition, lifecycle decision, data transformation, cache view, diagnostic g… |
| ARCH-0138 | must | architecture | system-guidelines.md:143 [packed] | — | Any runtime function or semantic concern MUST have one active path after input normalizat… |
| ARCH-0139 | must | architecture | system-guidelines.md:231 [packed] | — | Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner… |
| ARCH-0140 | must | architecture | system-guidelines.md:284 [packed] | — | The system must remain correct under contention, topology change, recovery, and control-p… |
| ARCH-0141 | must | architecture | system-guidelines.md:319 [packed] | — | All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps. |
| ARCH-0142 | must_not | architecture | doctrine/decision-experiments.md:87 [packed] | — | Broad ideas must not go straight into code. |
| ARCH-0143 | must_not | architecture | doctrine/decision-experiments.md:98 [packed] | — | Do not treat a Quest as SOLVED when only the hot path is fixed. A Quest is complete only … |
| ARCH-0144 | must_not | architecture | doctrine/owner-boundaries.md:139 [packed] | — | Model checks — models/ indexed by models/CL-INDEX.md: design-class liveness bugs (circula… |
| ARCH-0145 | must_not | architecture | doctrine/owner-boundaries.md:157 [packed] | — | Argue the fix against the artifact's invariants and extend the artifact in the same chang… |
| ARCH-0146 | must_not | architecture | doctrine/state-encoding.md:20 [packed] | — | A phase must not tear down the only live runtime path. |
| ARCH-0147 | must_not | architecture | doctrine/state-encoding.md:31 [packed] | — | Pressure must not become hidden drops, memory growth without bounds, or correctness failu… |
| ARCH-0148 | must_not | architecture | doctrine/state-encoding.md:102 [packed] | — | Degraded — weaker, indirect, or cross-plane; may explain, defer, or improve diagnostics, … |
| ARCH-0149 | must_not | architecture | doctrine/state-encoding.md:104 [packed] | — | Contradictory — authoritative or equivalent signals disagree; produces reconciliation wit… |
| GOV-0001 | must_not | governance | findings/2026-07-10-reuse-comparison-before-new-machinery.md:7 [packed] | — | Parallel or duplicated machinery discovered on contact MUST be recorded as a consolidatio… |
| GOV-0002 | must_not | governance | roadmap.md:144 [packed] | — | Roadmap State Policy — Required workflow: Roadmap corrections discovered during implement… |
| GOV-0003 | must_not | governance | roadmap.md:147 [packed] | — | Roadmap State Policy — Required workflow: Do not use roadmap state to claim Quest closure… |
| STYLE-0006 | must_not | style | code-style.md:44 [packed] | — | NEVER introduce eslint override comments. |
| STYLE-0007 | must_not | style | code-style.md:151 [packed] | — | The root .eslintrc.json is the legacy-format file and is NOT read by the npm run lint scr… |
| TEST-0022 | must_not | testing | findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:5 [packed] | — | NEVER ship a change to a hot failure-handling path (retry, recovery, failure-classificati… |
| TEST-0023 | must_not | testing | findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:7 [packed] | — | You MUST NOT convert a defer/backoff on a hot failure path into advance-now work (extra r… |
| TEST-0024 | must_not | testing | testing-guidelines/fixtures.md:28 [packed] | — | Do not rely on a broad scenario test alone when the bug is in a narrow system-table write… |
| TEST-0025 | must_not | testing | testing-guidelines/fixtures.md:49 [packed] | — | Production code must never contain alternate code paths, branches, or special-case logic … |
| TEST-0026 | must_not | testing | testing-guidelines/fixtures.md:108 [packed] | — | Mechanical test edits (renames, import updates, timeout adjustments, formatting) do NOT t… |
| TEST-0027 | must_not | testing | testing-guidelines/harness.md:56 [packed] | — | Do not reclassify a slow unit test as "integration" to dodge the hard error — move the fi… |
| TEST-0028 | must_not | testing | testing-guidelines/harness.md:64 [packed] | — | When a test exceeds its duration limit (2 seconds for a unit test, 30 seconds for an inte… |
| TEST-0029 | must_not | testing | testing-guidelines/harness.md:68 [packed] | — | Do NOT reach for unref() on awaited sleeps — that lets the process exit mid-await and has… |
| TEST-0030 | must_not | testing | testing-guidelines/regression-policy.md:382 [packed] | — | A test that fails because behavior regressed MUST be fixed (in the code or the test), and… |
| TEST-0031 | must_not | testing | testing-guidelines/regression-policy.md:388 [packed] | — | Work must not close while the touched area remains red. |
| GOV-0004 | must_not | governance | memory-boundary.md:29 [packed] | — | Session/narrative state (current blocker, handoff notes, working hypotheses) stays in ext… |
| ARCH-0150 | must | architecture | runtime-contracts.md:34 [packed] | — | Owner And Path Detail — Required runtime patterns: Callers submit intent to the owner and… |
| ARCH-0151 | must | architecture | runtime-contracts.md:35 [packed] | — | Owner And Path Detail — Required runtime patterns: Components constructed with owner depe… |
| ARCH-0152 | must | architecture | runtime-contracts.md:41 [packed] | — | Owner And Path Detail — Required runtime patterns: A transitional delegator must have a r… |
| ARCH-0153 | must | architecture | runtime-contracts.md:58 [packed] | — | System-Table Row Lifecycle — Required patterns: Initial creation writes the full canonica… |
| ARCH-0154 | must | architecture | runtime-contracts.md:59 [packed] | — | System-Table Row Lifecycle — Required patterns: Later lifecycle changes use partial updat… |
| ARCH-0155 | must | architecture | runtime-contracts.md:60 [packed] | — | System-Table Row Lifecycle — Required patterns: Lifecycle updates write only fields owned… |
| ARCH-0156 | must | architecture | runtime-contracts.md:61 [packed] | — | System-Table Row Lifecycle — Required patterns: Missing rows route through the canonical … |
| ARCH-0157 | must | architecture | runtime-contracts.md:62 [packed] | — | System-Table Row Lifecycle — Required patterns: CDC-replicated row mutations are addresse… |
| ARCH-0158 | must | architecture | runtime-contracts.md:63 [packed] | — | System-Table Row Lifecycle — Required patterns: Multi-row transitions either transition r… |
| ARCH-0159 | must | architecture | runtime-contracts.md:82 [packed] | — | Cache And Read Models — Required patterns: CDC-propagated metadata decisions read from th… |
| ARCH-0160 | must | architecture | runtime-contracts.md:84 [packed] | — | Cache And Read Models — Required patterns: SQL reads for equivalent semantics are limited… |
| ARCH-0161 | must | architecture | runtime-contracts.md:86 [packed] | — | Cache And Read Models — Required patterns: Cache divergence recovery re-enters the owner … |
| ARCH-0162 | must | architecture | runtime-contracts.md:87 [packed] | — | Cache And Read Models — Required patterns: Cache/authoritative divergence is surfaced as … |
| ARCH-0163 | must | architecture | runtime-contracts.md:88 [packed] | — | Cache And Read Models — Required patterns: New system tables are classified in exactly on… |
| ARCH-0164 | must | architecture | runtime-contracts.md:115 [packed] | — | Snapshot Readers And Repair — Required patterns: Non-forced readers consume owner outcome… |
| ARCH-0165 | must | architecture | runtime-contracts.md:117 [packed] | — | Snapshot Readers And Repair — Required patterns: Non-forced readers schedule repair throu… |
| ARCH-0166 | must | architecture | runtime-contracts.md:119 [packed] | — | Snapshot Readers And Repair — Required patterns: Forced repair, when allowed, still route… |
| ARCH-0167 | must | architecture | runtime-contracts.md:149 [packed] | — | Canonical Owner Rows — Required precedence: partitions.leader_node_id owns partition lead… |
| ARCH-0168 | must | architecture | runtime-contracts.md:150 [packed] | — | Canonical Owner Rows — Required precedence: message_groups.leader_node_id owns message-gr… |
| ARCH-0169 | must | architecture | runtime-contracts.md:151 [packed] | — | Canonical Owner Rows — Required precedence: services owns replica-only fields such as rep… |
| ARCH-0170 | must | architecture | runtime-contracts.md:206 [packed] | — | Runtime Shared-Metadata Gateways — Required patterns: Semantic owners submit shared-metad… |
| ARCH-0171 | must | architecture | runtime-contracts.md:208 [packed] | — | Runtime Shared-Metadata Gateways — Required patterns: Semantic decisions use one canonica… |
| ARCH-0172 | must | architecture | runtime-contracts.md:210 [packed] | — | Runtime Shared-Metadata Gateways — Required patterns: Bootstrap-only shortcuts remain pha… |
| ARCH-0173 | must | architecture | runtime-contracts.md:228 [packed] | — | Bootstrap And Phase Handoff — Required patterns: A phase-created subscriber, bridge, queu… |
| ARCH-0174 | must | architecture | runtime-contracts.md:230 [packed] | — | Bootstrap And Phase Handoff — Required patterns: Phase completion removes temporary scaff… |
| ARCH-0175 | must | architecture | runtime-contracts.md:231 [packed] | — | Bootstrap And Phase Handoff — Required patterns: Handoff completion is represented by one… |
| ARCH-0176 | must | architecture | runtime-contracts.md:248 [packed] | — | Producer Consumer Handoff Invariants — Required patterns: The producer declares its durab… |
| ARCH-0177 | must | architecture | runtime-contracts.md:250 [packed] | — | Producer Consumer Handoff Invariants — Required patterns: The consumer declares the preco… |
| ARCH-0178 | must | architecture | runtime-contracts.md:252 [packed] | — | Producer Consumer Handoff Invariants — Required patterns: The handoff exposes one freshne… |
| ARCH-0179 | must | architecture | runtime-contracts.md:254 [packed] | — | Producer Consumer Handoff Invariants — Required patterns: Diagnostics serialize both side… |
| ARCH-0180 | must | architecture | runtime-contracts.md:278 [packed] | — | Deterministic Control-Plane Progression — Required patterns: For one owner key, at most o… |
| ARCH-0181 | must | architecture | runtime-contracts.md:279 [packed] | — | Deterministic Control-Plane Progression — Required patterns: Event, cache update, and tim… |
| ARCH-0182 | must | architecture | runtime-contracts.md:281 [packed] | — | Deterministic Control-Plane Progression — Required patterns: Broad polling is recovery-on… |
| ARCH-0183 | must | architecture | runtime-contracts.md:295 [packed] | — | Durable Workflow And Transaction Boundaries — Required patterns: Step transitions persist… |
| ARCH-0184 | must | architecture | runtime-contracts.md:296 [packed] | — | Durable Workflow And Transaction Boundaries — Required patterns: Atomic multi-row authori… |
| ARCH-0185 | must | architecture | runtime-contracts.md:298 [packed] | — | Durable Workflow And Transaction Boundaries — Required patterns: Executor-owned phase pro… |
| ARCH-0186 | must | architecture | runtime-contracts.md:300 [packed] | — | Durable Workflow And Transaction Boundaries — Required patterns: Existing shared workflow… |
| ARCH-0187 | must | architecture | runtime-contracts.md:317 [packed] | — | Admission, Readiness, And Multi-Signal Decisions — Required patterns: Collectors fetch ev… |
| ARCH-0188 | must | architecture | runtime-contracts.md:318 [packed] | — | Admission, Readiness, And Multi-Signal Decisions — Required patterns: One normalized per-… |
| ARCH-0189 | must | architecture | runtime-contracts.md:320 [packed] | — | Admission, Readiness, And Multi-Signal Decisions — Required patterns: One canonical adjud… |
| ARCH-0190 | must | architecture | runtime-contracts.md:322 [packed] | — | Admission, Readiness, And Multi-Signal Decisions — Required patterns: Equivalent evidence… |
| ARCH-0191 | must | architecture | runtime-contracts.md:354 [packed] | — | Modes And Status Taxonomy — Required patterns: Gate by configured mode first. |
| ARCH-0192 | must | architecture | runtime-contracts.md:355 [packed] | — | Modes And Status Taxonomy — Required patterns: Execute only prerequisites for the active … |
| ARCH-0193 | must | architecture | runtime-contracts.md:356 [packed] | — | Modes And Status Taxonomy — Required patterns: Publish reason codes valid for the active … |
| ARCH-0194 | must | architecture | runtime-contracts.md:357 [packed] | — | Modes And Status Taxonomy — Required patterns: Active/terminal predicates consume canonic… |
| ARCH-0195 | must | architecture | runtime-contracts.md:358 [packed] | — | Modes And Status Taxonomy — Required patterns: Terminal success is monotonic and not rewr… |
| ARCH-0196 | must | architecture | runtime-contracts.md:372 [packed] | — | Timeout And Invariant Rules — Required patterns: Top-level operations start with one cano… |
| ARCH-0197 | must | architecture | runtime-contracts.md:373 [packed] | — | Timeout And Invariant Rules — Required patterns: Nested operations derive from remaining … |
| ARCH-0198 | must | architecture | runtime-contracts.md:374 [packed] | — | Timeout And Invariant Rules — Required patterns: Timeout classifications are typed outcom… |
| ARCH-0199 | must | architecture | runtime-contracts.md:375 [packed] | — | Timeout And Invariant Rules — Required patterns: Exact-boundary timeout clusters require … |
| ARCH-0200 | must | architecture | runtime-contracts.md:376 [packed] | — | Timeout And Invariant Rules — Required patterns: Owners emit structured invariant results… |
| ARCH-0201 | must | architecture | runtime-contracts.md:391 [packed] | — | Pressure, Backpressure, And Resource Lifetime — Required patterns: Queues have capacity l… |
| ARCH-0202 | must | architecture | runtime-contracts.md:392 [packed] | — | Pressure, Backpressure, And Resource Lifetime — Required patterns: Downstream pressure pr… |
| ARCH-0203 | must | architecture | runtime-contracts.md:394 [packed] | — | Pressure, Backpressure, And Resource Lifetime — Required patterns: Load is shed at ingres… |
| ARCH-0204 | must | architecture | runtime-contracts.md:396 [packed] | — | Pressure, Backpressure, And Resource Lifetime — Required patterns: Control-plane and quer… |
| ARCH-0205 | must | architecture | runtime-contracts.md:398 [packed] | — | Pressure, Backpressure, And Resource Lifetime — Required patterns: Runtime collections ha… |
| ARCH-0206 | must | architecture | runtime-contracts.md:400 [packed] | — | Pressure, Backpressure, And Resource Lifetime — Required patterns: Diagnostics can prove … |
| ARCH-0207 | must | architecture | runtime-contracts.md:417 [packed] | — | Query Routing And Transport — Required patterns: Retry or redirect to available replicas … |
| ARCH-0208 | must | architecture | runtime-contracts.md:418 [packed] | — | Query Routing And Transport — Required patterns: Return structured retryable outcomes whe… |
| ARCH-0209 | must | architecture | runtime-contracts.md:420 [packed] | — | Query Routing And Transport — Required patterns: Bound retries by the caller timeout budg… |
| ARCH-0210 | must | architecture | runtime-contracts.md:421 [packed] | — | Query Routing And Transport — Required patterns: Tolerate briefly stale partition maps. |
| ARCH-0211 | must | architecture | runtime-contracts.md:422 [packed] | — | Query Routing And Transport — Required patterns: Route query/data-plane traffic through M… |
| ARCH-0212 | must | architecture | runtime-contracts.md:438 [packed] | — | Idempotency — Required patterns: Use operation IDs, idempotency keys, or equivalent uniqu… |
| ARCH-0213 | must | architecture | runtime-contracts.md:439 [packed] | — | Idempotency — Required patterns: Make lifecycle transitions monotonic. |
| ARCH-0214 | must | architecture | runtime-contracts.md:440 [packed] | — | Idempotency — Required patterns: Use write-if-not-exists semantics for creation. |
| ARCH-0215 | must | architecture | runtime-contracts.md:441 [packed] | — | Idempotency — Required patterns: Make replayed transitions no-ops or deterministic equiva… |
| STYLE-0008 | must | style | code-style.md:58 [packed] | `npm run audit:file-size` | New or newly edited source-code files must finish within the per-scope thresholds owned b… |
| STYLE-0009 | must | style | code-style.md:62 [packed] | — | New source-code files must be named for the semantic responsibility they own, not for the… |
| STYLE-0010 | must | style | code-style.md:84 [packed] | — | Shared domain literals belong in their canonical owner module and must be imported from t… |
| TEST-0032 | must | testing | testing-guidelines/fixtures.md:122 [packed] | — | System Guideline Conformance Gate for New and Behavior-Meaningful Tests — Required workfl… |
| TEST-0033 | must | testing | testing-guidelines/harness.md:23 [packed] | — | Runner Stability Boundary Policy — Required workflow: Confirm whether the failing files a… |
| TEST-0034 | must | testing | testing-guidelines/harness.md:24 [packed] | — | Runner Stability Boundary Policy — Required workflow: Prefer a shared runner or bootstrap… |
| TEST-0035 | must | testing | testing-guidelines/harness.md:25 [packed] | — | Runner Stability Boundary Policy — Required workflow: If the crash traces point to Node/V… |
| TEST-0036 | must | testing | testing-guidelines/harness.md:41 [packed] | — | Runner Parallelism Budget Policy — Required workflow: Confirm that the same suites pass i… |
| TEST-0037 | must | testing | testing-guidelines/harness.md:42 [packed] | — | Runner Parallelism Budget Policy — Required workflow: Check shared machine budget signals… |
| TEST-0038 | must | testing | testing-guidelines/harness.md:44 [packed] | — | Runner Parallelism Budget Policy — Required workflow: Prefer lowering the shared TAP jobs… |
| TEST-0039 | must | testing | testing-guidelines/harness.md:110 [packed] | — | Timeout Budget and Classification Policy — Required behavior: Add tests that assert remai… |
| TEST-0040 | must | testing | testing-guidelines/harness.md:112 [packed] | — | Timeout Budget and Classification Policy — Required behavior: Add tests that assert timeo… |
| TEST-0041 | must | testing | testing-guidelines/harness.md:115 [packed] | — | Timeout Budget and Classification Policy — Required behavior: Include timeout class and b… |
| TEST-0042 | must | testing | testing-guidelines/proof-ladders.md:22 [packed] | — | Quest-Driven Validation Policy — Required workflow: The active Quest must define the requ… |
| TEST-0043 | must | testing | testing-guidelines/proof-ladders.md:23 [packed] | — | Quest-Driven Validation Policy — Required workflow: Tests added during the change must ma… |
| TEST-0044 | must | testing | testing-guidelines/proof-ladders.md:26 [packed] | — | Quest-Driven Validation Policy — Required workflow: If validation reveals a second concer… |
| TEST-0045 | must | testing | testing-guidelines/proof-ladders.md:31 [packed] | — | Quest-Driven Validation Policy — Required workflow: If that deep dive finds mistakes, irr… |
| TEST-0046 | must | testing | testing-guidelines/proof-ladders.md:36 [packed] | — | Quest-Driven Validation Policy — Required workflow: A Quest is not validation-complete wh… |
| TEST-0047 | must | testing | testing-guidelines/proof-ladders.md:76 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: Before editing product… |
| TEST-0048 | must | testing | testing-guidelines/proof-ladders.md:102 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: After implementation a… |
| TEST-0049 | must | testing | testing-guidelines/proof-ladders.md:130 [packed] | — | File-Size Ratchet Policy — Required workflow: Run npm run audit:file-size for broad runti… |
| TEST-0050 | must | testing | testing-guidelines/proof-ladders.md:132 [packed] | `npm run audit:file-size` | File-Size Ratchet Policy — Required workflow: New or newly edited source-code files must … _(alias of STYLE-0008)_ |
| TEST-0051 | must | testing | testing-guidelines/proof-ladders.md:133 [packed] | — | File-Size Ratchet Policy — Required workflow: If a Quest touches an inherited oversized s… |
| TEST-0052 | must | testing | testing-guidelines/proof-ladders.md:136 [packed] | — | File-Size Ratchet Policy — Required workflow: New source-code files over their scope thre… |
| TEST-0053 | must | testing | testing-guidelines/proof-ladders.md:138 [packed] | — | File-Size Ratchet Policy — Required workflow: Use npm run audit:file-size:strict only for… |
| TEST-0054 | must | testing | testing-guidelines/regression-policy.md:22 [packed] | — | The test must fail with the current code |
| TEST-0055 | must | testing | testing-guidelines/regression-policy.md:137 [packed] | — | Bug-Cluster Escalation Policy — Required workflow: Name the shared boundary explicitly in… |
| TEST-0056 | must | testing | testing-guidelines/regression-policy.md:138 [packed] | — | Bug-Cluster Escalation Policy — Required workflow: Add a targeted regression for the curr… |
| TEST-0057 | must | testing | testing-guidelines/regression-policy.md:139 [packed] | — | Bug-Cluster Escalation Policy — Required workflow: Add or update an architectural task/sp… |
| TEST-0058 | must | testing | testing-guidelines/regression-policy.md:143 [packed] | — | Bug-Cluster Escalation Policy — Required workflow: The next regression in that area must … |
| TEST-0059 | must | testing | testing-guidelines/regression-policy.md:161 [packed] | — | Owner-Path Regression Policy — Required coverage: Missing-row behavior - Add a test provi… |
| TEST-0060 | must | testing | testing-guidelines/regression-policy.md:178 [packed] | — | Gateway Boundary Regression Policy — Required coverage: Add or update a regression provin… |
| TEST-0061 | must | testing | testing-guidelines/regression-policy.md:180 [packed] | — | Gateway Boundary Regression Policy — Required coverage: If a semantic owner exists above … |
| TEST-0062 | must | testing | testing-guidelines/regression-policy.md:182 [packed] | — | Gateway Boundary Regression Policy — Required coverage: Add or update a structural guard … |
| TEST-0063 | must | testing | testing-guidelines/regression-policy.md:184 [packed] | — | Gateway Boundary Regression Policy — Required coverage: Prefer import-boundary or API-bou… |
| TEST-0064 | must | testing | testing-guidelines/regression-policy.md:195 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Single in-flight reconc… |
| TEST-0065 | must | testing | testing-guidelines/regression-policy.md:199 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: No dual mutation paths … |
| TEST-0066 | must | testing | testing-guidelines/regression-policy.md:201 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Monotonic workflow tran… |
| TEST-0067 | must | testing | testing-guidelines/regression-policy.md:203 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Stale-fence rejection -… |
| TEST-0068 | must | testing | testing-guidelines/regression-policy.md:224 [packed] | — | Temporal Witness Replay Policy — Required coverage: Capture at least one stale or degrade… |
| TEST-0069 | must | testing | testing-guidelines/regression-policy.md:226 [packed] | — | Temporal Witness Replay Policy — Required coverage: Capture the newer runtime or authorit… |
| TEST-0070 | must | testing | testing-guidelines/regression-policy.md:228 [packed] | — | Temporal Witness Replay Policy — Required coverage: Assert the owner emits the canonical … |
| TEST-0071 | must | testing | testing-guidelines/regression-policy.md:230 [packed] | — | Temporal Witness Replay Policy — Required coverage: Assert the caller or consumer does no… |
| TEST-0072 | must | testing | testing-guidelines/regression-policy.md:233 [packed] | — | Temporal Witness Replay Policy — Required coverage: Prefer focused unit or integration re… |
| TEST-0073 | must | testing | testing-guidelines/regression-policy.md:245 [packed] | — | Continuity And Lifetime Regression Policy — Required coverage: Phase completion continuit… |
| TEST-0074 | must | testing | testing-guidelines/regression-policy.md:247 [packed] | — | Continuity And Lifetime Regression Policy — Required coverage: Restart continuity - Prove… |
| TEST-0075 | must | testing | testing-guidelines/regression-policy.md:249 [packed] | — | Continuity And Lifetime Regression Policy — Required coverage: Failover continuity - Prov… |
| TEST-0076 | must | testing | testing-guidelines/release-gate.md:28 [packed] | — | Reference Scenario Policy — Required workflow: Keep one named reference scenario or block… |
| TEST-0077 | must | testing | testing-guidelines/release-gate.md:29 [packed] | — | Reference Scenario Policy — Required workflow: Run focused owner tests before broad repre… |
| TEST-0078 | must | testing | testing-guidelines/release-gate.md:30 [packed] | — | Reference Scenario Policy — Required workflow: If the reference scenario still fails afte… |
| TEST-0079 | must | testing | testing-guidelines/release-gate.md:34 [packed] | — | Reference Scenario Policy — Required workflow: If the Quest records repeated material blo… |
| TEST-0080 | must | testing | testing-guidelines/regression-policy.md:251 [packed] | — | Continuity And Lifetime Regression Policy — Required coverage: Bounded lifetime - Prove l… |
| TEST-0081 | must | testing | testing-guidelines/regression-policy.md:253 [packed] | — | Continuity And Lifetime Regression Policy — Required coverage: Typed handoff diagnostics … |
| TEST-0082 | must | testing | testing-guidelines/regression-policy.md:267 [packed] | — | Bounded-Memory Regression Policy — Required coverage: Assert owned resource metrics such … |
| TEST-0083 | must | testing | testing-guidelines/regression-policy.md:269 [packed] | — | Bounded-Memory Regression Policy — Required coverage: If the distributed harness reported… |
| TEST-0084 | must | testing | testing-guidelines/regression-policy.md:290 [packed] | — | Structured Deferred-Outcome Regression Policy — Required coverage: When diagnostics or re… |
| TEST-0085 | must | testing | testing-guidelines/regression-policy.md:292 [packed] | — | Structured Deferred-Outcome Regression Policy — Required coverage: If the same hotspot fa… |
| TEST-0086 | must | testing | testing-guidelines/regression-policy.md:306 [packed] | — | Read-Side Repair Separation Regression Policy — Required coverage: Add a regression showi… |
| TEST-0087 | must | testing | testing-guidelines/regression-policy.md:308 [packed] | — | Read-Side Repair Separation Regression Policy — Required coverage: If the caller caches t… |
| TEST-0088 | must | testing | testing-guidelines/regression-policy.md:352 [packed] | — | Pressure tests MUST respect the standard duration limits (2s unit, 30s integration). Use … |
| ARCH-0216 | must_not | architecture | doctrine/decision-experiments.md:30 [packed] | — | Do not respond to repeated distributed failures by adding more scattered local special ca… |
| ARCH-0217 | must_not | architecture | doctrine/decision-experiments.md:134 [packed] | — | Do not treat hot-path green tests as analysis closure while the original scenario now fai… |
| ARCH-0218 | must_not | architecture | doctrine/decision-experiments.md:137 [packed] | — | Quests must never close from symptom movement alone (such as changed timeout durations, t… |
| ARCH-0219 | must_not | architecture | doctrine/owner-boundaries.md:24 [packed] | — | Callers do not reproduce the owner's logic locally, and callers do not keep shadow state … |
| ARCH-0220 | must_not | architecture | doctrine/owner-boundaries.md:28 [packed] | — | A new owner left running alongside the old path it was meant to replace is an unfinished … |
| ARCH-0221 | must_not | architecture | doctrine/owner-boundaries.md:53 [packed] | — | Do not keep patching symptoms while leaving the boundary porous. |
| ARCH-0222 | must_not | architecture | doctrine/owner-boundaries.md:68 [packed] | — | Do not let diagnostics views, retained owner state, bootstrap-normalized ingress state, o… |
| ARCH-0223 | must_not | architecture | doctrine/owner-boundaries.md:91 [packed] | — | Do not let old migration history or several optional delegated findings create competing … |
| ARCH-0224 | must_not | architecture | doctrine/single-path.md:17 [packed] | — | There may be multiple semantic owners, but there must not be many equivalent runtime ingr… |
| ARCH-0225 | must_not | architecture | doctrine/single-path.md:37 [packed] | — | Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime disse… |
| ARCH-0226 | must_not | architecture | doctrine/single-path.md:55 [packed] | — | Do not let observed, published, retained, cached, repaired, or fast-path variants drift i… |
| ARCH-0227 | must_not | architecture | doctrine/single-path.md:75 [packed] | — | Do not let row nullability, protocol-specific fields, or bootstrap-only shapes become sem… |
| ARCH-0228 | must_not | architecture | doctrine/single-path.md:89 [packed] | — | Do not encode semantic policy as independent booleans that callers can combine into overl… |
| ARCH-0229 | must_not | architecture | doctrine/state-encoding.md:28 [packed] | — | The system must not become less correct. |
| ARCH-0230 | must_not | architecture | doctrine/state-encoding.md:38 [packed] | — | The owner outcome must not degrade into empty collections, null-shaped absence, or timeou… |
| ARCH-0231 | must_not | architecture | doctrine/state-encoding.md:50 [packed] | — | Callers may consume or propagate that deferred outcome, but they must not silently reinte… |
| ARCH-0232 | must_not | architecture | doctrine/state-encoding.md:55 [packed] | — | Readers must not run synchronous multi-table authoritative repair inline on the hot read … |
| ARCH-0233 | must_not | architecture | doctrine/state-encoding.md:92 [packed] | — | Collectors may fetch, retry, and annotate evidence, but they do not emit the final verdic… |
| ARCH-0234 | must_not | architecture | doctrine/state-encoding.md:107 [packed] | — | Never let degraded evidence promote a blocked entity to ready or admitted. _(alias of ARCH-0067)_ |
| ARCH-0235 | must_not | architecture | doctrine/state-encoding.md:109 [packed] | — | Policy targets must not be rewritten from the survivors observed during one attempt. |
| ARCH-0236 | must_not | architecture | doctrine/state-encoding.md:161 [packed] | — | Do not force readers to reconstruct progress from object existence, local booleans, times… |
| ARCH-0237 | must_not | architecture | runtime-contracts.md:265 [packed] | — | Forbidden patterns: allowing a publication recovery producer to stall or wait on unknown … |
| ARCH-0238 | must_not | architecture | runtime-contracts.md:329 [packed] | — | Use ControlPlaneReadinessService as the readiness owner (node readiness and planning surf… |
| GOV-0005 | must_not | governance | roadmap.md:96 [packed] | — | docs/ holds documentation, never active work definition: user/operator-facing docs, the a… |
| GOV-0006 | must_not | governance | roadmap.md:158 [packed] | — | Tests never pin a flag (see testing-guidelines/fixtures.md "No Flag-Coupled Tests"). |
| GOV-0007 | must_not | governance | workflow-guidelines/solver-quests.md:48 [packed] | — | Operating Contract — A Quest must: after audit passes, commit every Quest-scoped change (… |
| GOV-0008 | must_not | governance | memory-boundary.md:3 [packed] | — | The in-repo and external memory systems have different jobs and MUST NOT duplicate each o… |
| ARCH-0239 | must | architecture | system-guidelines.md:243 [packed] | — | 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Subscribers, bridges, … |
| ARCH-0240 | must | architecture | runtime-contracts.md:101 [packed] | — | Shared truth surfaces such as startup, readiness, admin snapshot, service discovery, and … |
| ARCH-0241 | must | architecture | runtime-contracts.md:202 [packed] | — | Runtime shared-metadata access must cross canonical ingress owners. |
| ARCH-0242 | must | architecture | system-guidelines.md:296 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Query routing during topol… |
| ARCH-0243 | must | architecture | system-guidelines.md:299 [packed] | — | 9. Load May Slow The System, Not Break It — Required contract: Every queue, buffer, subsc… |
| ARCH-0244 | must | architecture | system-guidelines.md:342 [packed] | — | 12. User-Facing Model Stays Small — Required contract: Runtime kinds such as native JS, W… |
| ARCH-0245 | must | architecture | system-guidelines.md:352 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Quest validatio… |
| ARCH-0246 | must | architecture | system-guidelines.md:362 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Before closure,… |
| ARCH-0247 | must | architecture | system-guidelines.md:367 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Scenario-driven… |
| ARCH-0248 | must | architecture | system-guidelines.md:375 [packed] | — | 13. Closure Requires Proof, Review, And Truth Repair — Required contract: If a representa… |
| GOV-0009 | must_not | governance | workflow-guidelines/solver-quests.md:1244 [packed] | — | THEORY_REQUIRED / recoverable BLOCKED: return the typed judgment action to the external d… |
| STYLE-0011 | must_not | style | code-style.md:91 [packed] | — | JavaScript-language primitives are NOT domain scalars and do not need named constants: ty… |
| STYLE-0012 | must_not | style | code-style.md:102 [packed] | — | terminalize is not a word: in NEW or newly edited identifiers, comments, commit messages,… |
| TEST-0089 | must_not | testing | testing-guidelines/fixtures.md:87 [packed] | — | A test MUST assert the real, unconditional production behavior, and MUST NEVER set, branc… |
| TEST-0090 | must_not | testing | testing-guidelines/fixtures.md:91 [packed] | — | Production feature flags are within-session scaffolds only — NO flag survives the session… |
| TEST-0091 | must_not | testing | testing-guidelines/fixtures.md:113 [packed] | — | System Guideline Conformance Gate for New and Behavior-Meaningful Tests — Required workfl… |
| TEST-0092 | must_not | testing | testing-guidelines/harness.md:125 [packed] | — | Invoke targeted tests via the committed runner or tap directly - npm run test:file -- <te… |
| TEST-0093 | must_not | testing | testing-guidelines/regression-policy.md:99 [packed] | — | Soft-warning two-strikes. The SAME soft warning (a load-flake, a tolerated timeout, a "kn… |
| TEST-0094 | must_not | testing | testing-guidelines/release-gate.md:103 [packed] | — | An upward re-anchor MUST satisfy all of: the gate was silently red (never ran clean befor… |
| ARCH-0249 | must | architecture | runtime-contracts.md:387 [packed] | — | The system may slow under pressure, but it must remain correct. |
| GOV-0010 | must_not | governance | workflow-guidelines/closure.md:27 [packed] | — | The optional report may be generated and cited for convenience, but its presence is never… |
| GOV-0011 | must_not | governance | workflow-guidelines/closure.md:66 [packed] | — | Do not treat symptom movement as SOLVED. |
| GOV-0012 | must_not | governance | workflow-guidelines/subagents.md:18 [packed] | — | Delegated agents do not decide whether the Quest is solved. |
| GOV-0013 | must_not | governance | workflow-guidelines/subagents.md:45 [packed] | — | The worker must not report done: true as proof. |
| GOV-0014 | must_not | governance | workflow-guidelines/subagents.md:71 [packed] | — | Verification rounds MUST be category-complete: instruct the verifier to enumerate every f… |
| GOV-0015 | must_not | governance | workflow-guidelines/subagents.md:82 [packed] | — | If independent-agent capability is unavailable at a mandatory boundary, do not substitute… |
| GOV-0016 | must_not | governance | workflow-guidelines/validators.md:18 [packed] | — | The Solver never trusts an agent's claim that work succeeded. |
| GOV-0017 | must_not | governance | workflow-guidelines/validators.md:51 [packed] | — | The report projection must not invent terminal status, synthetic attempts, or unmeasured … |
| TEST-0095 | must_not | testing | testing-guidelines/regression-policy.md:376 [packed] | — | Fix Failing Tests Immediately — When you discover failing or timing-out tests you must ad… |
| TEST-0096 | must_not | testing | testing-guidelines/regression-policy.md:377 [packed] | — | Fix Failing Tests Immediately — When you discover failing or timing-out tests you must ad… |
| ARCH-0250 | must | architecture | doctrine/decision-experiments.md:41 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: t… |
| ARCH-0251 | must | architecture | doctrine/decision-experiments.md:42 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: t… |
| ARCH-0252 | must | architecture | doctrine/decision-experiments.md:43 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: t… |
| ARCH-0253 | must | architecture | doctrine/decision-experiments.md:44 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: t… |
| ARCH-0254 | must | architecture | doctrine/decision-experiments.md:45 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: t… |
| ARCH-0255 | must | architecture | doctrine/single-path.md:24 [packed] | — | Query-plane traffic may use a separate ingress from metadata/control-plane traffic, but b… |
| ARCH-0256 | must | architecture | doctrine/state-encoding.md:21 [packed] | — | A phase-scoped bridge must either become a runtime-owned bridge or be replaced before tea… |
| ARCH-0257 | must | architecture | doctrine/state-encoding.md:23 [packed] | — | Completion of a phase must reduce temporary machinery, not strand it. |
| ARCH-0258 | must | architecture | doctrine/state-encoding.md:30 [packed] | — | Pressure must become admission, defer, reject, or coalescing signals. |
| ARCH-0259 | must | architecture | doctrine/state-encoding.md:44 [packed] | — | 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canon… |
| ARCH-0260 | must | architecture | doctrine/state-encoding.md:45 [packed] | — | 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canon… |
| ARCH-0261 | must | architecture | doctrine/state-encoding.md:46 [packed] | — | 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canon… |
| ARCH-0262 | must | architecture | doctrine/state-encoding.md:47 [packed] | — | 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canon… |
| ARCH-0263 | must | architecture | doctrine/state-encoding.md:72 [packed] | — | 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, ret… |
| ARCH-0264 | must | architecture | doctrine/state-encoding.md:73 [packed] | — | 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, ret… |
| ARCH-0265 | must | architecture | doctrine/state-encoding.md:74 [packed] | — | 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, ret… |
| ARCH-0266 | must | architecture | doctrine/state-encoding.md:75 [packed] | — | 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, ret… |
| GOV-0018 | must | governance | findings/2026-07-10-reuse-comparison-before-new-machinery.md:5 [packed] | — | Every fix design and quest report MUST carry a visible REUSED vs EXTENDED vs NEW comparis… |
| GOV-0019 | must | governance | roadmap.md:89 [packed] | — | A Quest must cite or encode enough scope context to prevent local invention. |
| GOV-0020 | must | governance | roadmap.md:122 [packed] | — | The row must be in scope for this repository under the repo-root edition-matrix.md. |
| GOV-0021 | must | governance | roadmap.md:123 [packed] | — | Broad rows must gain a linked spec or architecture document before active implementation … |
| GOV-0022 | must | governance | roadmap.md:127 [packed] | — | The Quest must name the roadmap row, approved maintenance scope, or explicit user request… |
| GOV-0023 | must | governance | roadmap.md:136 [packed] | — | Roadmap State Policy — Required workflow: Treat agpl-feature-map.md as the stable AGPL fe… |
| GOV-0024 | must | governance | roadmap.md:138 [packed] | — | Roadmap State Policy — Required workflow: Treat solve/quests/ and Solver reports as activ… |
| GOV-0025 | must | governance | roadmap.md:139 [packed] | — | Roadmap State Policy — Required workflow: A roadmap row marked available means the capabi… |
| GOV-0026 | must | governance | roadmap.md:141 [packed] | — | Roadmap State Policy — Required workflow: If implementation proves a roadmap row is absen… |
| STYLE-0013 | must | style | code-style.md:41 [packed] | — | All code must be written with ESLint rules in mind from the start. |
| TEST-0097 | must | testing | testing-guidelines/fixtures.md:33 [packed] | — | Every test selected by the relevant targeted or suite command must run and pass; no selec… |
| TEST-0098 | must | testing | testing-guidelines/fixtures.md:52 [packed] | — | Tests must exercise the real production code paths. |
| TEST-0099 | must | testing | testing-guidelines/fixtures.md:77 [packed] | — | The test suite must prove that production code works — not that a test-friendly fork of i… |
| TEST-0100 | must | testing | testing-guidelines/harness.md:105 [packed] | — | Timeouts in control-plane logic are hard correctness bugs and must be tested as typed out… |
| TEST-0101 | must | testing | testing-guidelines/proof-ladders.md:71 [packed] | — | Every non-trivial Quest must prove that it did not increase architecture drift while fixi… |
| TEST-0102 | must | testing | testing-guidelines/regression-policy.md:17 [packed] | — | All bug fixes MUST be preceded by a failing test that reproduces the bug. |
| TEST-0103 | must | testing | testing-guidelines/regression-policy.md:122 [packed] | — | When the second correctness bug appears at the same architectural boundary in one work cy… |
| TEST-0104 | must | testing | testing-guidelines/regression-policy.md:148 [packed] | — | When a bug involves component ownership, lifecycle persistence, or system-table row mutat… |
| TEST-0105 | must | testing | testing-guidelines/regression-policy.md:173 [packed] | — | When a change touches shared metadata reads or writes, tests and CI checks must prove the… |
| TEST-0106 | must | testing | testing-guidelines/regression-policy.md:189 [packed] | — | When a change touches control-plane progression (dispatch, rebalance, split, admission pr… |
| TEST-0107 | must | testing | testing-guidelines/regression-policy.md:239 [packed] | — | When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, … |
| TEST-0108 | must | testing | testing-guidelines/release-gate.md:18 [packed] | — | When a Quest exists because a distributed, integration, load, or scenario failure must be… |
| TEST-0109 | must | testing | testing-guidelines/release-gate.md:42 [packed] | — | If the fixture contract was correct, the next attempt must target the runtime owner bound… |
| TEST-0110 | must | testing | testing-guidelines/release-gate.md:82 [packed] | — | A deterministic proof MUST move the real in-cluster binding observable that the doneWhen … |
| TEST-0111 | must | testing | testing-guidelines/release-gate.md:113 [packed] | — | When a delegated worker reviews a scenario Quest, it must compare current probe evidence … |
| TEST-0112 | must | testing | testing-guidelines/regression-policy.md:275 [packed] | — | When an owner path is intentionally unresolved under pressure, publication establishment,… |
| TEST-0113 | must | testing | testing-guidelines/regression-policy.md:297 [packed] | — | When a change touches startup, readiness, admin snapshot, service discovery, or another s… |
| TEST-0114 | must | testing | testing-guidelines/regression-policy.md:318 [packed] | — | Tests MUST verify this property at the unit and integration layers, not only in the distr… |
| TEST-0115 | must | testing | testing-guidelines/regression-policy.md:371 [packed] | — | Failures discovered in the touched area, or discovered by the test runs chosen for the cu… |
| GOV-0027 | must_not | governance | workflow-guidelines/solver-quests.md:34 [packed] | — | Link the earlier evidence as provenance; do not backdate it as a Quest attempt. |
| GOV-0028 | must_not | governance | workflow-guidelines/solver-quests.md:51 [packed] | — | Do not move goalposts in place. |
| GOV-0029 | must_not | governance | workflow-guidelines/solver-quests.md:98 [packed] | — | JSON failures use {ok:false,error:{code,category,message, requiresJudgment,repair}}; repa… |
| GOV-0030 | must_not | governance | workflow-guidelines/solver-quests.md:103 [packed] | — | Persisted commit-step actions remain accepted as a compatibility alias but are never emit… |
| GOV-0031 | must_not | governance | workflow-guidelines/solver-quests.md:117 [packed] | — | Checkpoints and refused landings do not refresh them. |
| GOV-0032 | must_not | governance | workflow-guidelines/solver-quests.md:154 [packed] | — | Do not embed a diagnosed ROOT narrative in the statement: put causal roots, suspected mec… |
| GOV-0033 | must_not | governance | workflow-guidelines/solver-quests.md:157 [packed] | — | When a root is falsified mid-Quest, record the superseding finding — never edit the seale… |
| GOV-0034 | must_not | governance | workflow-guidelines/solver-quests.md:200 [packed] | — | solve lint --all is the read-only legacy census and never rewrites historical Quest files… |
| GOV-0035 | must_not | governance | workflow-guidelines/solver-quests.md:203 [packed] | — | Drafts remain visible and separately tallied, but do not enter the active open-work ratio… |
| GOV-0036 | must_not | governance | workflow-guidelines/solver-quests.md:206 [packed] | — | These stages do not add or rewrite a store-level Quest status. |
| GOV-0037 | must_not | governance | workflow-guidelines/solver-quests.md:228 [packed] | — | Two legitimate Quest shapes have different closure bars; do not conflate them. |
| GOV-0038 | must | governance | memory-boundary.md:31 [packed] | — | Durable operational ground truth has exactly one canonical home, [operational-ground-trut… |
| TEST-0116 | must | testing | testing-guidelines/harness.md:113 [packed] | — | Timeout Budget and Classification Policy — Required behavior: Treat exact-boundary timeou… |
| TEST-0117 | must | testing | testing-guidelines/regression-policy.md:159 [packed] | — | Owner-Path Regression Policy — Required coverage: Field ownership protection - Add a regr… |
| GOV-0039 | must_not | governance | workflow-guidelines/solver-quests.md:252 [packed] | — | An invalid sample is an honest no-measurement: it never counts as progress, never satisfi… |
| GOV-0040 | must_not | governance | workflow-guidelines/solver-quests.md:259 [packed] | — | The retry is bounded by CANNOT_MEASURE_RETRY_BUDGET: once that many consecutive samples o… |
| GOV-0041 | must_not | governance | workflow-guidelines/solver-quests.md:263 [packed] | — | Never treat a blocked or incomplete run as a metric floor. |
| GOV-0042 | must_not | governance | workflow-guidelines/solver-quests.md:265 [packed] | — | When a frontier has already parked as cannot_measure (its samples never measured), the ve… |
| GOV-0043 | must_not | governance | workflow-guidelines/solver-quests.md:275 [packed] | — | An exhausted park had at least one honestly-measured sample but the metric never moved — … |
| GOV-0044 | must_not | governance | workflow-guidelines/solver-quests.md:276 [packed] | — | A cannot_measure park had only non-measuring samples — the harness itself never produced … |
| GOV-0045 | must_not | governance | workflow-guidelines/solver-quests.md:282 [packed] | — | Fix the harness (or change the attempt evidence) before reopening again, so reopen and pa… |
| GOV-0046 | must_not | governance | workflow-guidelines/solver-quests.md:302 [packed] | — | Never place a runner under test/: knip's entry patterns cover scripts/** but not test/** … |
| GOV-0047 | must_not | governance | workflow-guidelines/solver-quests.md:304 [packed] | — | Do not copy the runner path from an old verification receipt; receipts are history, not p… |
| GOV-0048 | must_not | governance | workflow-guidelines/solver-quests.md:361 [packed] | — | Do not keep patching under a theory whose owner path is no longer current. |
| GOV-0049 | must_not | governance | workflow-guidelines/solver-quests.md:373 [packed] | — | The authored inputs for those generated projections remain counted and their freshness ga… |
| GOV-0050 | must_not | governance | workflow-guidelines/solver-quests.md:405 [packed] | — | The Solver NEVER pushes: no subcommand, loop, or handoff runs git push (autoCommitQuest a… |
| GOV-0051 | must_not | governance | workflow-guidelines/solver-quests.md:424 [packed] | — | Detectors fire only on real recorded events and never touch the sealed doneWhen. |
| ARCH-0267 | should | architecture | system-guidelines.md:340 [packed] | — | 12. User-Facing Model Stays Small — Required contract: New features should strengthen tab… |
| GOV-0052 | must_not | governance | roadmap.md:113 [packed] | — | Such examples must not define implementation tasks in this repository unless the active Q… |
| GOV-0053 | must_not | governance | workflow-guidelines/solver-quests.md:588 [packed] | — | Do not revive sprint/package theory state as active authority. |
| GOV-0054 | must_not | governance | workflow-guidelines/solver-quests.md:654 [packed] | — | Parallelism MUST NOT be applied to the proof path: subagent verification before handoff, … |
| GOV-0055 | must_not | governance | workflow-guidelines/solver-quests.md:699 [packed] | — | A green DT on an injected seam is not sufficient on its own — two wrong legs on this repo… |
| GOV-0056 | must_not | governance | workflow-guidelines/solver-quests.md:794 [packed] | — | Until replacement or full recorded coverage, checkpoint and terminal handoff remain block… |
| GOV-0057 | must_not | governance | workflow-guidelines/solver-quests.md:814 [packed] | — | The supervised sealing paths also run a changed-path static gate (ESLint plus the literal… |
| GOV-0058 | must_not | governance | workflow-guidelines/solver-quests.md:838 [packed] | — | A base_unreachable receipt leaves live recompute and ancestry scope because its exact del… |
| GOV-0059 | must_not | governance | workflow-guidelines/solver-quests.md:868 [packed] | — | Do not include unrelated dirty worktree entries from another Quest. |
| GOV-0060 | must_not | governance | workflow-guidelines/solver-quests.md:870 [packed] | — | Do not push (see "Regular Commit (No Push)" above). |
| GOV-0061 | must_not | governance | workflow-guidelines/solver-quests.md:875 [packed] | — | It derives the in-scope set purely from the Quest's sealed solve/ artifacts plus the sour… |
| GOV-0062 | must_not | governance | workflow-guidelines/solver-quests.md:878 [packed] | — | The handoff command is a dry run by default; --commit executes the printed git add/commit… |
| GOV-0063 | must_not | governance | workflow-guidelines/solver-quests.md:932 [packed] | — | A per-frontier investigation budget (INVESTIGATION_BUDGET) caps how many distinct theorie… |
| GOV-0064 | must_not | governance | workflow-guidelines/solver-quests.md:934 [packed] | — | A confirmed or refuted discrimination is investigative progress only; it never satisfies … |
| GOV-0065 | must | governance | workflow-guidelines/validators.md:23 [packed] | — | Probe-Owned Truth — Required validation: doneWhen is evaluated by a real probe. |
| GOV-0066 | must | governance | workflow-guidelines/validators.md:24 [packed] | — | Probe-Owned Truth — Required validation: Frontier metrics are evaluated by real probes. |
| GOV-0067 | must | governance | workflow-guidelines/validators.md:25 [packed] | — | Probe-Owned Truth — Required validation: The post-attempt metric is finite when progress … |
| GOV-0068 | must | governance | workflow-guidelines/validators.md:26 [packed] | — | Probe-Owned Truth — Required validation: The configured metric direction is lower-is-bett… |
| GOV-0069 | must | governance | workflow-guidelines/validators.md:27 [packed] | — | Probe-Owned Truth — Required validation: The attempt changeRef resolves to an existing di… |
| ARCH-0268 | must_not | architecture | doctrine/decision-experiments.md:101 [packed] | — | Do not begin a new local patch on the same architectural boundary while the current Quest… |
| ARCH-0269 | must_not | architecture | doctrine/decision-experiments.md:111 [packed] | — | Use the model ledger as an advisory feedback loop for future model, reasoning-effort, and… |
| ARCH-0270 | must_not | architecture | doctrine/state-encoding.md:127 [packed] | — | 10. Normalize Evidence Before Adjudicating Decisions — Every input to a liveness or safet… |
| ARCH-0271 | must_not | architecture | doctrine/state-encoding.md:131 [packed] | — | 10. Normalize Evidence Before Adjudicating Decisions — Every input to a liveness or safet… |
| GOV-0070 | must_not | governance | workflow-guidelines/solver-quests.md:1131 [packed] | — | The override changes the response to a recorded signal; it never mutates a detector verdi… |
| GOV-0071 | must_not | governance | workflow-guidelines/solver-quests.md:1188 [packed] | — | Reflection is additive and reversible: it produces a recorded note and resets a cadence c… |
| GOV-0072 | must_not | governance | workflow-guidelines/solver-quests.md:1226 [packed] | — | Advisories are read-only and never block; they fire on the same conditions the autonomous… |
| TEST-0118 | must_not | testing | testing-guidelines/release-gate.md:67 [packed] | — | The expensive non-deterministic statistical gate (the docker rolling-restart stat-gate an… |
| TEST-0119 | must_not | testing | testing-guidelines/release-gate.md:97 [packed] | — | Committed static-gate baselines — the BASELINE_COUNT constants in scripts/check-complexit… |
| GOV-0073 | must_not | governance | workflow-guidelines/solver-quests.md:1277 [packed] | — | The presence, mtime, or bytes of ignored projections MUST NOT gate next, audit, checkpoin… |
| GOV-0074 | must_not | governance | workflow-guidelines/solver-quests.md:1297 [packed] | — | When an epic decision changes, record the dated decision and its explicit target link; ne… |
| GOV-0075 | must_not | governance | workflow-guidelines/solver-quests.md:1321 [packed] | — | Derived epic stage keys ONLY on explicit planning references and projected Quest state — … |
| GOV-0076 | must_not | governance | workflow-guidelines/solver-quests.md:1322 [packed] | — | The consistency gate separately checks structural contract fields and the presence of the… |
| GOV-0077 | must_not | governance | memory-boundary.md:34 [packed] | — | When external memory and in-repo steering disagree, in-repo steering wins for rules and g… |
| GOV-0078 | must_not | governance | memory-boundary.md:43 [packed] | — | Metadata is part of the diff. When you substantively change a memory file, refresh its fr… |
| ARCH-0272 | must | architecture | doctrine/owner-boundaries.md:17 [packed] | — | Every durable concern must have one semantic owner. |
| ARCH-0273 | must | architecture | doctrine/owner-boundaries.md:27 [packed] | — | Introducing a new owner is a cutover, not an addition: the prior authority for that conce… |
| ARCH-0274 | must | architecture | doctrine/owner-boundaries.md:52 [packed] | — | After repeated bugs at one boundary, the next fix must reduce the number of paths, states… |
| ARCH-0275 | must | architecture | doctrine/owner-boundaries.md:80 [packed] | — | An active Quest may have several frontiers, but each attempt must start from one selected… |
| ARCH-0276 | must | architecture | doctrine/owner-boundaries.md:94 [packed] | — | If the semantic owner, owner boundary, or next required action changes, record a finding … |
| ARCH-0277 | must | architecture | doctrine/owner-boundaries.md:121 [packed] | — | A seam where two owners meet is itself a concern, and it must have one owner and one chec… |
| ARCH-0278 | must | architecture | doctrine/owner-boundaries.md:165 [packed] | — | A Quest whose scope crosses owners must seal the interaction artifact as a closure requir… |
| ARCH-0279 | must | architecture | doctrine/single-path.md:58 [packed] | — | The "consumer set" and "forbidden reinterpretations" bullets above overlap by design with… |
| ARCH-0280 | must | architecture | doctrine/state-encoding.md:17 [packed] | — | Bootstrap, join, and recovery phases may initialize runtime mechanisms, but they must han… |
| ARCH-0281 | must | architecture | doctrine/state-encoding.md:36 [packed] | — | When an owner-path read or write is unresolved because pressure, authority establishment,… |
| ARCH-0282 | must | architecture | doctrine/state-encoding.md:61 [packed] | — | Critical convergence traffic must keep stricter admission than diagnostics, observability… |
| ARCH-0283 | must | architecture | doctrine/state-encoding.md:62 [packed] | — | In practice, node-state publication, membership publication, and authoritative operation … |
| ARCH-0284 | must | architecture | doctrine/state-encoding.md:115 [packed] | — | State names are boundary-specific but must distinguish static exclusion, missing discover… |
| GOV-0079 | must | governance | workflow-guidelines/solver-quests.md:40 [packed] | — | Operating Contract — A Quest must: declare a single sealed doneWhen predicate up front; |
| GOV-0080 | must | governance | workflow-guidelines/solver-quests.md:41 [packed] | — | Operating Contract — A Quest must: define one or more independent frontiers[]; |
| GOV-0081 | must | governance | workflow-guidelines/solver-quests.md:42 [packed] | — | Operating Contract — A Quest must: measure progress with lower-is-better probe metrics; |
| GOV-0082 | must | governance | workflow-guidelines/solver-quests.md:43 [packed] | — | Operating Contract — A Quest must: record every attempt through the Solver event log; |
| GOV-0083 | must | governance | workflow-guidelines/solver-quests.md:47 [packed] | — | Operating Contract — A Quest must: close only through a Solver terminal state; |
| GOV-0084 | must | governance | workflow-guidelines/solver-quests.md:146 [packed] | — | constraints[]: optional hard limits the agent must preserve. In version 1, each entry has… |
| GOV-0085 | must_not | governance | findings/2026-06-30-adversarially-vet-hypotheses-before-presenting.md:9 [packed] | — | If independent-agent capability is unavailable, state that verification is unavailable an… |
| GOV-0086 | must | governance | workflow-guidelines/solver-quests.md:598 [packed] | — | widen-scope: selected frontier theory required. |
| GOV-0087 | must | governance | workflow-guidelines/solver-quests.md:599 [packed] | — | model: selected frontier theory, active system theory, and --modelRef or --modelNotApplic… |
| GOV-0088 | must | governance | workflow-guidelines/solver-quests.md:601 [packed] | — | change-approach: selected frontier theory remains required; model evidence is not require… |
| ARCH-0285 | must_not | architecture | runtime-contracts.md:190 [packed] | — | The services row is the canonical example of non-overlapping field owners on one row: ide… |
| ARCH-0286 | must_not | architecture | runtime-contracts.md:195 [packed] | — | Retry is not fallback: routing MAY retry or redirect to another live replica or a new lea… |
| GOV-0089 | must | governance | workflow-guidelines/solver-quests.md:997 [packed] | — | THEORY_REQUIRED (non-terminal): the selected rung needs system or frontier theory before … |
| ARCH-0287 | should | architecture | system-guidelines.md:305 [packed] | — | All service communication that should be a message goes through the MessageRouter. |
| TEST-0120 | must | testing | testing-guidelines/fixtures.md:117 [packed] | — | System Guideline Conformance Gate for New and Behavior-Meaningful Tests — Required workfl… |
| TEST-0121 | must | testing | testing-guidelines/fixtures.md:129 [packed] | — | System Guideline Conformance Gate for New and Behavior-Meaningful Tests — Required workfl… |
| TEST-0122 | must | testing | testing-guidelines/proof-ladders.md:28 [packed] | — | Quest-Driven Validation Policy — Required workflow: After the Quest validation surface is… |
| TEST-0123 | must | testing | testing-guidelines/proof-ladders.md:33 [packed] | — | Quest-Driven Validation Policy — Required workflow: If a Quest changes a shared contract,… |
| TEST-0124 | must | testing | testing-guidelines/proof-ladders.md:38 [packed] | — | Quest-Driven Validation Policy — Required workflow: When residual closure moves to a foll… |
| TEST-0125 | must | testing | testing-guidelines/proof-ladders.md:78 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: Choose guardrails by b… |
| TEST-0126 | must | testing | testing-guidelines/proof-ladders.md:92 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: If a repo-wide guard a… |
| TEST-0127 | must | testing | testing-guidelines/proof-ladders.md:104 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: A Quest cannot close w… |
| TEST-0128 | must | testing | testing-guidelines/proof-ladders.md:110 [packed] | — | Static Guardrail Preflight And Closure Policy — Required workflow: Existing violations in… |
| TEST-0129 | must | testing | testing-guidelines/regression-policy.md:114 [packed] | — | Live-refutation two-strikes. When live/measured evidence contradicts a sealed statement o… |
| TEST-0130 | must | testing | testing-guidelines/regression-policy.md:153 [packed] | — | Owner-Path Regression Policy — Required coverage: Injected owner usage - If setup injects… |
| TEST-0131 | must | testing | testing-guidelines/regression-policy.md:156 [packed] | — | Owner-Path Regression Policy — Required coverage: Create-vs-update separation - Add cover… |
| TEST-0132 | must | testing | testing-guidelines/regression-policy.md:164 [packed] | — | Owner-Path Regression Policy — Required coverage: Primary-key mutation path - For CDC-pro… |
| TEST-0133 | must | testing | testing-guidelines/regression-policy.md:205 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Acknowledgement-before-… |
| TEST-0134 | must | testing | testing-guidelines/regression-policy.md:208 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Readiness-dimension ver… |
| TEST-0135 | must | testing | testing-guidelines/regression-policy.md:211 [packed] | — | Deterministic Control-Loop Regression Policy — Required coverage: Cache observation bound… |
| TEST-0136 | must | testing | testing-guidelines/release-gate.md:36 [packed] | — | Reference Scenario Policy — Required workflow: A scenario-driven Quest that changes runti… |
| GOV-0090 | must | governance | workflow-guidelines/quest-artifacts.md:51 [packed] | — | Use source, test, architecture, and steering files for the implementation or documentatio… |
| GOV-0091 | must | governance | workflow-guidelines/subagents.md:55 [packed] | — | Durable conclusions must be recorded with node scripts/solve.js finding before they are r… |
| GOV-0092 | must | governance | workflow-guidelines/validators.md:40 [packed] | — | Later attempts must use the same sealed goalposts. |
| TEST-0137 | must | testing | testing-guidelines/regression-policy.md:263 [packed] | — | Bounded-Memory Regression Policy — Required coverage: Add a deterministic unit or integra… |
| TEST-0138 | must | testing | testing-guidelines/regression-policy.md:281 [packed] | — | Structured Deferred-Outcome Regression Policy — Required coverage: Assert the canonical d… |
| TEST-0139 | must | testing | testing-guidelines/regression-policy.md:284 [packed] | — | Structured Deferred-Outcome Regression Policy — Required coverage: Assert that callers pr… |
| TEST-0140 | must | testing | testing-guidelines/regression-policy.md:303 [packed] | — | Read-Side Repair Separation Regression Policy — Required coverage: Add a regression showi… |
| TEST-0141 | must | testing | testing-guidelines/regression-policy.md:310 [packed] | — | Read-Side Repair Separation Regression Policy — Required coverage: If the same boundary a… |
| TEST-0142 | must | testing | testing-guidelines/regression-policy.md:332 [packed] | — | Slow-dependency resilience — inject artificial latency into a dependency (mock that resol… |
| TEST-0143 | must | testing | testing-guidelines/regression-policy.md:378 [packed] | — | Fix Failing Tests Immediately — When you discover failing or timing-out tests you must ad… |
| TEST-0144 | must | testing | testing-guidelines/regression-policy.md:379 [packed] | — | Fix Failing Tests Immediately — When you discover failing or timing-out tests you must ad… |
| TEST-0145 | must | testing | testing-guidelines/regression-policy.md:380 [packed] | — | Fix Failing Tests Immediately — When you discover failing or timing-out tests you must ad… |
| GOV-0093 | must_not | governance | workflow-guidelines/solver-quests.md:69 [packed] | — | solve start --id <id> runs doctor, optionally creates a linked draft when authoring flags… |
| GOV-0094 | must_not | governance | workflow-guidelines/solver-quests.md:72 [packed] | — | solve continue --id <id> executes only structured begin-step, record-attempt, replacement… |
| GOV-0095 | must_not | governance | workflow-guidelines/solver-quests.md:89 [packed] | — | solve land --id <id> freezes the exact terminal candidate and aggregate manifest only aft… |
| GOV-0096 | must_not | governance | workflow-guidelines/solver-quests.md:175 [packed] | — | When a quest is drafted as the successor of a parked/exhausted one, the same statement-is… |
| GOV-0097 | must_not | governance | workflow-guidelines/solver-quests.md:176 [packed] | — | When a quest is drafted as the successor of a parked/exhausted one, the same statement-is… |
| GOV-0098 | must_not | governance | workflow-guidelines/solver-quests.md:181 [packed] | — | When a quest is drafted as the successor of a parked/exhausted one, the same statement-is… |
| GOV-0099 | must_not | governance | workflow-guidelines/solver-quests.md:183 [packed] | — | When a quest is drafted as the successor of a parked/exhausted one, the same statement-is… |
| GOV-0100 | must_not | governance | workflow-guidelines/solver-quests.md:236 [packed] | — | A building-block Quest — landing a safe mechanism validated behind a temporary lever — cl… |
| GOV-0101 | must_not | governance | workflow-guidelines/solver-quests.md:427 [packed] | — | Oscillation detection: returning the frontier to a previously-abandoned blocker (owner / … |
| GOV-0102 | must_not | governance | workflow-guidelines/solver-quests.md:441 [packed] | — | Measured promotion only: a theory is promoted exclusively by a measured post-patch eviden… |
| GOV-0103 | must_not | governance | workflow-guidelines/solver-quests.md:490 [packed] | — | Gradient refinement of the sealed metric: a frontier metric may be sharpened from the sca… |
| GOV-0104 | must_not | governance | workflow-guidelines/solver-quests.md:497 [packed] | — | Harness-not-measuring gate (rr-G): a run that did not measure the system under test — a d… |
| GOV-0105 | must_not | governance | workflow-guidelines/solver-quests.md:632 [packed] | — | Record attempt: node scripts/solve.js step --id <id> --commit --changeRef diff:<path> --s… |
| ARCH-0288 | may | architecture | system-guidelines.md:128 [packed] | — | 2. One Semantic Owner Per Concern — Required contract: A shared row may have several fiel… |
| ARCH-0289 | may | architecture | system-guidelines.md:155 [packed] | — | 3. One Path Per Semantic Decision — Required contract: Collectors may gather evidence; on… |
| GOV-0106 | must_not | governance | workflow-guidelines/solver-quests.md:985 [packed] | — | EXHAUSTED (terminal): every frontier is parked **as exhausted**, either by the finite str… |
| ARCH-0290 | may | architecture | system-guidelines.md:338 [packed] | — | 12. User-Facing Model Stays Small — Required contract: Internal machinery may appear in d… |
| GOV-0107 | must_not | governance | workflow-guidelines/solver-quests.md:1000 [packed] | — | BLOCKED (non-terminal): a recoverable precondition gate (scope pressure, regression-resto… |
| GOV-0108 | must_not | governance | workflow-guidelines/solver-quests.md:1044 [packed] | — | A guard never silently halts a run. Every blocking continuation is mapped, through a reve… |
| GOV-0109 | must_not | governance | workflow-guidelines/solver-quests.md:1045 [packed] | — | A guard never silently halts a run. Every blocking continuation is mapped, through a reve… |
| GOV-0110 | must_not | governance | workflow-guidelines/solver-quests.md:1047 [packed] | — | A guard never silently halts a run. Every blocking continuation is mapped, through a reve… |
| GOV-0111 | must_not | governance | workflow-guidelines/solver-quests.md:1051 [packed] | — | A guard never silently halts a run. Every blocking continuation is mapped, through a reve… |
| GOV-0112 | must_not | governance | workflow-guidelines/solver-quests.md:1055 [packed] | — | A guard never silently halts a run. Every blocking continuation is mapped, through a reve… |
| GOV-0113 | must_not | governance | workflow-guidelines/solver-quests.md:1122 [packed] | — | Override-tagged advisories are excluded from soft-first quorum counting (the GUARD_QUORUM… |
| GOV-0114 | must | governance | workflow-guidelines/solver-quests.md:20 [packed] | — | A Quest is also required up front for live/distributed work, cross-session investigation,… |
| GOV-0115 | must | governance | workflow-guidelines/solver-quests.md:31 [packed] | — | If it produces a failed measurement, expands beyond the original bounded owner scope, or … |
| GOV-0116 | must | governance | workflow-guidelines/solver-quests.md:100 [packed] | — | Automation MUST dispatch only on code and validated payload. |
| GOV-0117 | must | governance | workflow-guidelines/solver-quests.md:104 [packed] | — | new, lint, next, step, finding, audit, checkpoint, and handoff remain component commands … |
| GOV-0118 | must | governance | workflow-guidelines/solver-quests.md:164 [packed] | — | Product quests must carry at least one planning link at creation: planDoc for the epic/sp… |
| GOV-0119 | must | governance | workflow-guidelines/solver-quests.md:652 [packed] | — | Work MUST be serialized only when one step's output feeds another, or when workers would … |
| GOV-0120 | must | governance | workflow-guidelines/solver-quests.md:678 [packed] | — | The artifact must live under solve/changes/<questId>/, end in .diff, and contain a unifie… |
| STYLE-0014 | should | style | code-style.md:111 [packed] | — | When a boundary already owns a named mode vocabulary, call sites and tests should use tha… |
| TEST-0146 | should | testing | testing-guidelines/proof-ladders.md:61 [packed] | — | leftover scaffolds — a flag, test-only path, or dead branch the change should have remove… |
| TEST-0147 | should | testing | testing-guidelines/regression-policy.md:23 [packed] | — | The test should capture the exact failure scenario from the bug report |
| TEST-0148 | should | testing | testing-guidelines/regression-policy.md:27 [packed] | — | The failure message should match the reported error |
| TEST-0149 | should | testing | testing-guidelines/regression-policy.md:31 [packed] | — | The fix should make the failing test pass |
| TEST-0150 | should | testing | testing-guidelines/regression-policy.md:82 [packed] | — | Is the current problem a repeated pattern? If so, is there a shared abstraction that shou… |
| GOV-0121 | must | governance | workflow-guidelines/solver-quests.md:975 [packed] | — | For any other open choice the agent MUST pick a sensible default, record a finding, and c… |
| ARCH-0291 | must | architecture | doctrine/decision-experiments.md:46 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: t… |
| ARCH-0292 | must | architecture | doctrine/decision-experiments.md:56 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0293 | must | architecture | doctrine/decision-experiments.md:58 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0294 | must | architecture | doctrine/decision-experiments.md:59 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0295 | must | architecture | doctrine/decision-experiments.md:60 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0296 | must | architecture | doctrine/decision-experiments.md:61 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0297 | must | architecture | doctrine/decision-experiments.md:64 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0298 | must | architecture | doctrine/decision-experiments.md:66 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0299 | must | architecture | doctrine/decision-experiments.md:68 [packed] | — | 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must… |
| ARCH-0300 | must | architecture | doctrine/decision-experiments.md:91 [packed] | — | Every active Quest must name its residual-closure inventory before code is treated as com… |
| ARCH-0301 | must | architecture | doctrine/owner-boundaries.md:144 [packed] | — | Coupled-pair registry — coupledPairs in test/shards/impact-contracts.json: a change cross… |
| ARCH-0302 | must | architecture | doctrine/owner-boundaries.md:159 [packed] | — | Hold every gate to the default liveness invariant: an engaged hold, gate, or fence must h… |
| ARCH-0303 | must | architecture | doctrine/state-encoding.md:124 [packed] | — | 10. Normalize Evidence Before Adjudicating Decisions — Every input to a liveness or safet… |
| GOV-0122 | must | governance | workflow-guidelines/solver-quests.md:1172 [packed] | — | EXHAUST-and-pivot to a higher-altitude Quest/epic is a legitimate, encouraged outcome of … |
| TEST-0151 | must | testing | testing-guidelines/fixtures.md:105 [packed] | — | When adding a new test file, or making a behavior-meaningful change to an existing test —… |
| TEST-0152 | must | testing | testing-guidelines/harness.md:155 [packed] | — | Only run the complete suite (npm run check:release) at: - Checkpoint tasks explicitly mar… |
| TEST-0153 | must | testing | testing-guidelines/regression-policy.md:217 [packed] | — | When a bug depends on stale cache truth, stale routing, delayed authoritative visibility,… |
| GOV-0123 | must | governance | workflow-guidelines/solver-quests.md:1281 [packed] | — | A projection-retention migration MUST classify exact paths before removal, record base co… |
| GOV-0124 | must | governance | memory-boundary.md:20 [packed] | — | A lesson that should bind future work for everyone MUST be promoted into in-repo steering… |
| TEST-0154 | must | testing | testing-guidelines/fixtures.md:126 [packed] | — | System Guideline Conformance Gate for New and Behavior-Meaningful Tests — Required workfl… |
| GOV-0125 | must_not | governance | workflow-guidelines/solver-quests.md:254 [packed] | — | Climbing a rung is a response to a measured stall — a trustworthy observation that the cu… |
| GOV-0126 | must_not | governance | workflow-guidelines/solver-quests.md:267 [packed] | — | The reopen is evidence-gated: it is refused unless at least one contributing attempt re-c… |
| GOV-0127 | must_not | governance | workflow-guidelines/solver-quests.md:292 [packed] | — | A later regression-resolution finding with resolution explained may discharge the restore… |
| GOV-0128 | must_not | governance | workflow-guidelines/solver-quests.md:406 [packed] | — | Pushing is a separate, outward-facing action — for Quest and ad-hoc work alike, a never-b… |
| GOV-0129 | must_not | governance | workflow-guidelines/solver-quests.md:421 [packed] | — | The CONVERGENCE_GUARDS map is a source-owned compile-time policy surface, not a runtime f… |
| ARCH-0304 | may | architecture | system-guidelines.md:237 [packed] | — | Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may initialize … |
| GOV-0130 | must_not | governance | workflow-guidelines/solver-quests.md:784 [packed] | — | When the quest declaration seals a verificationTemplates array, those categories are the … |
| GOV-0131 | must_not | governance | workflow-guidelines/solver-quests.md:845 [packed] | — | The reproducibility of recorded artifact bytes from reachable commits may be measured wit… |
| GOV-0132 | must_not | governance | workflow-guidelines/solver-quests.md:949 [packed] | — | When a finding materially falsifies or constrains ANOTHER declared quest's premise, route… |
| GOV-0133 | must_not | governance | workflow-guidelines/solver-quests.md:1025 [packed] | — | Provenance honesty (mirroring CLOSURE_MEASURED vs CLOSURE_DECISION): a ladder park is a M… |
| GOV-0134 | must_not | governance | workflow-guidelines/solver-quests.md:1179 [packed] | — | The production reflection path runs only when the executor exposes a reflect() method (th… |
| GOV-0135 | must_not | governance | workflow-guidelines/solver-quests.md:1196 [packed] | — | A supervised driver — a human, or any agent that drives the Solver through individual sub… |
| TEST-0155 | should | testing | testing-guidelines/regression-policy.md:32 [packed] | — | No other tests should break |
| ARCH-0305 | should | architecture | doctrine/decision-experiments.md:88 [packed] | — | Active implementation should target one executable concern per Quest. |
| ARCH-0306 | should | architecture | doctrine/decision-experiments.md:89 [packed] | — | Quest status should live in the Solver event log and report rather than in parallel track… |
| TEST-0156 | should | testing | testing-guidelines/proof-ladders.md:17 [packed] | — | All non-trivial implementation work should have validation owned by its active Quest. |
| TEST-0157 | should | testing | testing-guidelines/proof-ladders.md:123 [packed] | — | Runtime Quests that touch already oversized files should record whether they are adding l… |
| TEST-0158 | should | testing | testing-guidelines/regression-policy.md:168 [packed] | — | These tests should be small and targeted. |
| TEST-0159 | should | testing | testing-guidelines/release-gate.md:114 [packed] | — | The review should produce candidate findings or risks; the Solver still owns terminal sta… |
| ARCH-0307 | may | architecture | runtime-contracts.md:37 [packed] | — | Owner And Path Detail — Required runtime patterns: A shared row may have multiple owners … |
| GOV-0136 | must | governance | roadmap.md:154 [packed] | — | Before the landing session ends, the flag MUST be resolved: validate the change (determin… |
| GOV-0137 | must | governance | roadmap.md:161 [packed] | — | Flags inherited from before this rule are recorded debt, not license: retire or promote e… |
| GOV-0138 | must | governance | workflow-guidelines/solver-quests.md:44 [packed] | — | Operating Contract — A Quest must: accumulate version 2 source attempts into one exact la… |
| GOV-0139 | must | governance | workflow-guidelines/solver-quests.md:139 [packed] | — | class: "product" (default) or "process". Product goals must be MEASURED against a real ar… |
| GOV-0140 | must | governance | workflow-guidelines/solver-quests.md:477 [packed] | — | Regression-restore gate: once a measured run records an invariant regression, the very ne… |
| GOV-0141 | must_not | governance | findings/2026-06-17-workflow-linking-and-memory-loop-promoted-findings-must-be-normative.md:5 [packed] | — | Findings promoted into steering MUST be written as a normative sentence containing a reco… |
| GOV-0142 | must_not | governance | findings/2026-06-30-plan-requests-stay-plan-only.md:5 [packed] | — | When the user asks for a plan, design, or review with no implementation-truth change requ… |
| TEST-0160 | must_not | testing | findings/2026-06-17-steering-doc-clarity-deterministic-first-repro.md:5 [packed] | — | A convergence bug MUST be reproduced deterministically in-process BEFORE changing code; t… |
| TEST-0161 | must_not | testing | findings/2026-06-17-steering-doc-clarity-repro-at-correct-altitude.md:5 [packed] | — | A convergence-bug repro MUST exercise the layer where the invariant is produced or violat… |
| GOV-0143 | should | governance | workflow-guidelines/subagents.md:26 [packed] | — | Worker Dossier — Every delegated worker should receive: Quest id and statement; |
| GOV-0144 | should | governance | workflow-guidelines/subagents.md:27 [packed] | — | Worker Dossier — Every delegated worker should receive: selected frontier; |
| GOV-0145 | should | governance | workflow-guidelines/subagents.md:28 [packed] | — | Worker Dossier — Every delegated worker should receive: current strategy rung; |
| GOV-0146 | should | governance | workflow-guidelines/subagents.md:29 [packed] | — | Worker Dossier — Every delegated worker should receive: metric name and metric history; |
| GOV-0147 | should | governance | workflow-guidelines/subagents.md:30 [packed] | — | Worker Dossier — Every delegated worker should receive: evidence paths from prior attempt… |
| GOV-0148 | should | governance | workflow-guidelines/subagents.md:31 [packed] | — | Worker Dossier — Every delegated worker should receive: durable findings and ruled-out ap… |
| GOV-0149 | should | governance | workflow-guidelines/subagents.md:32 [packed] | — | Worker Dossier — Every delegated worker should receive: hard constraints. |
| TEST-0162 | may | testing | testing-guidelines/harness.md:27 [packed] | — | Runner Stability Boundary Policy — Required workflow: Only return to suite-local fixes af… |
| TEST-0163 | may | testing | testing-guidelines/harness.md:46 [packed] | — | Runner Parallelism Budget Policy — Required workflow: Only restore higher parallelism aft… |
| TEST-0164 | may | testing | testing-guidelines/regression-policy.md:86 [packed] | — | Are multiple recent bugs clustering around the same boundary or component? That may indic… |
| GOV-0150 | must | governance | workflow-guidelines/subagents.md:60 [packed] | — | Adversarial verification prompts (design vets, implementation verifiers) MUST include eve… |
| ARCH-0308 | should | architecture | doctrine/decision-experiments.md:49 [packed] | — | Runtime Quests that follow such a model should cite it as their scope basis and proof sur… |
| ARCH-0309 | should | architecture | doctrine/decision-experiments.md:80 [packed] | — | Implementation work should be as explicit and bounded as the runtime design. |
| ARCH-0310 | should | architecture | doctrine/owner-boundaries.md:99 [packed] | — | Sub-agents are optional for research, implementation, and additional attempt review; they… |
| GOV-0151 | must | governance | workflow-guidelines/solver-quests.md:211 [packed] | — | Therefore, when authoring a quest whose defect class is visible in a live surface (demo, … |
| GOV-0152 | should | governance | workflow-guidelines/solver-quests.md:542 [packed] | — | Frontier theory: why the next local intervention should move the selected frontier metric. |
| GOV-0153 | must | governance | workflow-guidelines/solver-quests.md:327 [packed] | — | A resume-critical result (a newly pinned binding head, a decided next move) must therefor… |
| GOV-0154 | should | governance | workflow-guidelines/solver-quests.md:944 [packed] | — | optional rulesOut text for approaches that should not be retried. |
| GOV-0155 | must | governance | workflow-guidelines/solver-quests.md:694 [packed] | — | For a source-changing attempt whose proof depends on a live/distributed precondition, the… |
| GOV-0156 | must | governance | workflow-guidelines/solver-quests.md:724 [packed] | — | The first two checks and the duplication ratchet are ratcheted and must be green (the dup… |
| GOV-0157 | must | governance | workflow-guidelines/solver-quests.md:841 [packed] | — | The landing candidate and the terminal aggregate anchor at a reachable recorded base whil… |
| GOV-0158 | must | governance | workflow-guidelines/solver-quests.md:964 [packed] | — | The default execution posture for a non-trivial Quest is autonomous: the agent SHOULD dri… |
| GOV-0159 | must | governance | workflow-guidelines/solver-quests.md:970 [packed] | — | The agent MUST stop and request user input only on one of the four canonical core.md stop… |
| GOV-0160 | should | governance | workflow-guidelines/subagents.md:51 [packed] | — | The review should return findings, candidate risks, or suggested frontiers. |
| GOV-0161 | must | governance | workflow-guidelines/solver-quests.md:1017 [packed] | — | Guards: the command refuses without a prior reflect --altitude on the quest (the frame-qu… |
| ARCH-0311 | may | architecture | doctrine/state-encoding.md:98 [packed] | — | Authoritative — owned by the same semantic owner and plane; may directly admit or reject. |
| ARCH-0312 | may | architecture | doctrine/state-encoding.md:100 [packed] | — | Equivalent — another access path to the same owner and plane; may confirm or refute only … |
| GOV-0162 | may | governance | roadmap.md:125 [packed] | — | A row may move to active implementation only when the intended behavior is sharp enough t… |
| TEST-0165 | may | testing | testing-guidelines/fixtures.md:82 [packed] | — | The test-only-paths rule and this flag-coupling rule together close the loop — neither te… |
| TEST-0166 | may | testing | testing-guidelines/regression-policy.md:316 [packed] | — | System guideline §9 (Load May Slow The System, Not Break It) requires that all subsystems… |
| GOV-0163 | should | governance | workflow-guidelines/solver-quests.md:336 [packed] | — | Record a separate explicit finding only when an operator or agent learned a durable concl… |
| GOV-0164 | should | governance | workflow-guidelines/solver-quests.md:376 [packed] | — | Scope pressure is advisory rather than terminal, but a high-severity signal should usuall… |
| GOV-0165 | may | governance | workflow-guidelines/quest-artifacts.md:31 [packed] | — | Runtime Artifacts — The Solver may create: solve/log/<id>.ndjson |
| GOV-0166 | may | governance | workflow-guidelines/quest-artifacts.md:32 [packed] | — | Runtime Artifacts — The Solver may create: solve/state/<id>.json |
| GOV-0167 | may | governance | workflow-guidelines/quest-artifacts.md:33 [packed] | — | Runtime Artifacts — The Solver may create: solve/report/<id>.md |
| GOV-0168 | may | governance | workflow-guidelines/quest-artifacts.md:34 [packed] | — | Runtime Artifacts — The Solver may create: solve/changes/<id>/... |
| GOV-0169 | must | governance | findings/2026-06-30-adversarially-vet-hypotheses-before-presenting.md:5 [packed] | — | Before presenting any non-trivial implementation hypothesis, root-cause theory, or propos… |
| GOV-0170 | must | governance | findings/2026-06-30-read-freshest-precomputed-artifact-first.md:5 [packed] | — | Before re-deriving an expensive analysis by hand, you MUST first sort the candidate artif… |
| GOV-0171 | must | governance | findings/2026-07-05-prefer-machine-checks-over-prose.md:5 [packed] | — | Any steering rule that can be enforced by a machine check (lint rule, ratchet, guard scri… |
| GOV-0172 | should | governance | workflow-guidelines/solver-quests.md:647 [packed] | — | Independent work within a Quest SHOULD run concurrently: batch independent reads, fan out… |
| GOV-0173 | should | governance | workflow-guidelines/solver-quests.md:649 [packed] | — | Broad mechanical sweeps SHOULD use the Workflow harness to pipeline the work-list. |
| GOV-0174 | should | governance | workflow-guidelines/solver-quests.md:967 [packed] | — | Longer work SHOULD use run --keep-alive to replay progress-bearing MAX_CYCLES; the extern… |
| ARCH-0313 | should | architecture | doctrine/decision-experiments.md:82 [packed] | — | A human idea should first become the smallest sufficient form: - direct bounded work with… |
| GOV-0175 | should | governance | memory-boundary.md:9 [packed] | — | In-repo steering (docs/steering/**, the generated packs under docs/steering/llm/, rules.j… |
| ARCH-0314 | may | architecture | doctrine/state-encoding.md:27 [packed] | — | Under load, the system may slow down, defer work, or reject new edge work with structured… |
| GOV-0176 | may | governance | workflow-guidelines/quest-artifacts.md:40 [packed] | — | The derived cache is git-ignored and may be rebuilt from the Quest plus event log. |
| ARCH-0315 | should | architecture | doctrine/decision-experiments.md:71 [packed] | — | Classification-only is a valid result only when the causal chain is still explicit, the f… |
| GOV-0177 | may | governance | workflow-guidelines/solver-quests.md:291 [packed] | — | Only a genuinely broken or disconnected harness is globally invalid/non-measuring. |
| GOV-0178 | may | governance | workflow-guidelines/solver-quests.md:355 [packed] | — | When a metric does not improve but the blocker moves owner, boundary, or mechanism, the s… |
| GOV-0179 | should | governance | workflow-guidelines/solver-quests.md:1164 [packed] | — | Mandatory Step-Back Reflection Turn — Altitude (framing) reflection (altitudeReflectionDu… |
| GOV-0180 | should | governance | workflow-guidelines/solver-quests.md:1167 [packed] | — | Mandatory Step-Back Reflection Turn — Altitude (framing) reflection (altitudeReflectionDu… |
| GOV-0181 | should | governance | workflow-guidelines/solver-quests.md:1169 [packed] | — | Mandatory Step-Back Reflection Turn — Altitude (framing) reflection (altitudeReflectionDu… |
| GOV-0182 | may | governance | roadmap.md:112 [packed] | — | Architecture documents may mention Pro or Enterprise services only as examples of externa… |
| GOV-0183 | may | governance | workflow-guidelines/solver-quests.md:588 [packed] | — | The archived theory ledger may be imported only as archive memory; imported archive theor… |
| GOV-0184 | may | governance | workflow-guidelines/solver-quests.md:606 [packed] | — | A configured agent executor may still use autonomous run; supervised step is the componen… |
| GOV-0185 | may | governance | workflow-guidelines/solver-quests.md:728 [packed] | — | The census is absolute and may carry inherited drift: compare its listed sites against th… |
| GOV-0186 | should | governance | workflow-guidelines/subagents.md:76 [packed] | — | Design vets SHOULD receive a design note structured by [design-note-template.md](../verif… |
| GOV-0187 | may | governance | roadmap.md:105 [packed] | — | AGPL Preparatory Work — Shared substrate work may happen in this repository only when all… |
| GOV-0188 | may | governance | roadmap.md:107 [packed] | — | AGPL Preparatory Work — Shared substrate work may happen in this repository only when all… |
| GOV-0189 | may | governance | roadmap.md:109 [packed] | — | AGPL Preparatory Work — Shared substrate work may happen in this repository only when all… |
| GOV-0190 | may | governance | workflow-guidelines/solver-quests.md:1274 [packed] | — | Projected state under solve/state/ is local cache and may be rebuilt from the Quest plus … |
| GOV-0191 | should | governance | findings/2026-06-30-correctness-over-fewest-lines.md:5 [packed] | — | When choosing how to solve a problem, you SHOULD prioritize correctness and systemic, own… |
| GOV-0192 | may | governance | workflow-guidelines/solver-quests.md:1118 [packed] | — | Only overridable continuation codes are accepted: BLOCKED_THEORY and BLOCKED_SCOPE. The c… |
| GOV-0193 | may | governance | workflow-guidelines/validators.md:43 [packed] | — | One sanctioned exception: a frontier metric may be sharpened to a strictly harder gradien… |
| GOV-0194 | may | governance | workflow-guidelines/solver-quests.md:400 [packed] | — | Only a passing final landing refreshes the shared deterministic owner inventories; the re… |
