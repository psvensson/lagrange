# Rule index (generated — do not edit)

One line per rule in `rules.json`. To read a rule in full with its source
citations: `npm run rule -- --id <ID>` (or `--tag`, `--domain`,
`--strength`, or free-text terms). Regenerate with
`node scripts/lookup-rule.js --write-index`.

Total rules: 425 (421 masters + 4 cross-domain aliases; alias rows say "alias of <ID>" and are suppressed from the per-domain packs, so pack banners count masters only). machine_check names the command that enforces the rule, or —.

## Source roles

Every configured source has one explicit generator role. `packed` sources
contribute binding rules to a complete domain pack; `direct-load` sources
are read under their load condition; `reference-only` sources are nonbinding.

| source | role | domain | masters | aliases | load condition / reason |
| --- | --- | --- | ---: | ---: | --- |
| system-guidelines.md | packed | architecture | 51 | 2 | — |
| runtime-contracts.md | packed | architecture | 67 | 0 | — |
| doctrine/owner-boundaries.md | packed | architecture | 11 | 0 | — |
| doctrine/single-path.md | packed | architecture | 7 | 0 | — |
| doctrine/state-encoding.md | packed | architecture | 26 | 1 | — |
| doctrine/decision-experiments.md | packed | architecture | 15 | 0 | — |
| operational-ground-truth.md | direct-load | testing | 0 | 0 | Before distributed-harness or convergence work. |
| testing-guidelines/harness.md | packed | testing | 8 | 0 | — |
| testing-guidelines/fixtures.md | packed | testing | 22 | 0 | — |
| testing-guidelines/regression-policy.md | packed | testing | 34 | 0 | — |
| testing-guidelines/release-gate.md | packed | testing | 13 | 0 | — |
| testing-guidelines/proof-ladders.md | packed | testing | 14 | 1 | — |
| code-style.md | packed | style | 14 | 0 | — |
| roadmap.md | packed | governance | 13 | 0 | — |
| memory-boundary.md | packed | governance | 6 | 0 | — |
| audience-boundary.md | reference-only | governance | 0 | 0 | Doc-audience zoning doctrine; enforced mechanically by audit:doc-audience, so agents need the pointer, not packed rules. |
| workflow-guidelines/lifecycle.md | reference-only | governance | 0 | 0 | Convenience lifecycle summary; solver-quests.md owns the binding workflow contract. |
| workflow-guidelines/validators.md | packed | governance | 4 | 0 | — |
| workflow-guidelines/quest-artifacts.md | packed | governance | 3 | 0 | — |
| workflow-guidelines/closure.md | packed | governance | 1 | 0 | — |
| workflow-guidelines/subagents.md | packed | governance | 5 | 0 | — |
| workflow-guidelines/solver-quests.md | packed | governance | 105 | 0 | — |
| findings/2026-06-17-workflow-linking-and-memory-loop-promoted-findings-must-be-normative.md | packed | governance | 1 | 0 | — |
| findings/2026-06-17-steering-doc-clarity-repro-at-correct-altitude.md | packed | testing | 1 | 0 | — |
| findings/2026-06-17-steering-doc-clarity-deterministic-first-repro.md | packed | testing | 1 | 0 | — |
| findings/2026-06-30-adversarially-vet-hypotheses-before-presenting.md | packed | governance | 1 | 0 | — |
| findings/2026-06-30-read-freshest-precomputed-artifact-first.md | packed | governance | 1 | 0 | — |
| findings/2026-06-30-correctness-over-fewest-lines.md | packed | governance | 1 | 0 | — |
| findings/2026-06-30-plan-requests-stay-plan-only.md | packed | governance | 1 | 0 | — |
| findings/2026-07-05-prefer-machine-checks-over-prose.md | packed | governance | 1 | 0 | — |
| findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md | packed | testing | 2 | 0 | — |
| findings/2026-07-10-reuse-comparison-before-new-machinery.md | packed | governance | 2 | 0 | — |

## Rules

| id | strength | domain | source [role] | machine_check | summary |
| --- | --- | --- | --- | --- | --- |
| ARCH-0001 | must_not | architecture | system-guidelines.md:102 [packed] | — | docs/ holds documentation, never active work definition: end-user and operator-facing doc… |
| ARCH-0002 | must_not | architecture | system-guidelines.md:106 [packed] | — | Model choice notes are advisory only. They never replace validation, delegated review, So… |
| ARCH-0003 | must_not | architecture | system-guidelines.md:123 [packed] | — | If the existing owner lacks one capability, extend that owner. Do not fork a feature-loca… |
| ARCH-0004 | must_not | architecture | system-guidelines.md:125 [packed] | — | Callers submit intent to owners. They do not reproduce owner logic locally. |
| ARCH-0005 | must_not | architecture | system-guidelines.md:135 [packed] | — | Forbidden: duplicate helpers, wrappers, caches, snapshots, fields, or aliases for the sam… |
| ARCH-0006 | must_not | architecture | system-guidelines.md:137 [packed] | — | Forbidden: shadow state for owner-managed lifecycle or readiness |
| ARCH-0007 | must_not | architecture | system-guidelines.md:138 [packed] | — | Forbidden: fallback paths that reconstruct owner decisions from secondary evidence |
| ARCH-0008 | must_not | architecture | system-guidelines.md:139 [packed] | — | Forbidden: transitional delegators without a removal task and structural guard |
| ARCH-0009 | must_not | architecture | system-guidelines.md:149 [packed] | — | Runtime logic consumes normalized state; it must not reopen raw storage, transport, boots… |
| ARCH-0010 | must_not | architecture | system-guidelines.md:160 [packed] | — | Forbidden: "try the new path, then the old path" logic |
| ARCH-0011 | must_not | architecture | system-guidelines.md:161 [packed] | — | Forbidden: feature flags that keep two implementations alive for one semantic |
| ARCH-0012 | must_not | architecture | system-guidelines.md:162 [packed] | — | Forbidden: decision branches that mix cache and SQL as equivalent truth for one meaning |
| ARCH-0013 | must_not | architecture | system-guidelines.md:163 [packed] | — | Forbidden: bags of independent if statements around readiness, admission, retry, phase, l… |
| ARCH-0014 | must_not | architecture | system-guidelines.md:177 [packed] | — | null and undefined MUST NOT encode runtime or domain state. Use an explicit named state v… |
| ARCH-0015 | must_not | architecture | system-guidelines.md:180 [packed] | — | Each concept has one name. Do not add synonyms for existing concepts. _(alias of STYLE-0003)_ |
| ARCH-0016 | must_not | architecture | system-guidelines.md:183 [packed] | — | Do not introduce ordinal, segment, or grab-bag source filenames such as part-2, segment, … _(alias of STYLE-0001)_ |
| ARCH-0017 | must_not | architecture | system-guidelines.md:221 [packed] | — | INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/statu… |
| ARCH-0018 | must_not | architecture | system-guidelines.md:228 [packed] | — | Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from… |
| ARCH-0019 | must_not | architecture | system-guidelines.md:246 [packed] | — | Events may enqueue owner-key work; they must not execute long-running progression inline. |
| ARCH-0020 | must_not | architecture | system-guidelines.md:253 [packed] | — | Phase completion removes temporary scaffolding only, never the sole live dissemination, o… |
| ARCH-0021 | must_not | architecture | system-guidelines.md:271 [packed] | — | Timeout budgets are canonical: nested work derives from remaining budget and never starts… |
| ARCH-0022 | must_not | architecture | system-guidelines.md:276 [packed] | — | Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow b… |
| ARCH-0023 | must_not | architecture | system-guidelines.md:289 [packed] | — | Throughput may fall under pressure; correctness must not. |
| ARCH-0024 | must_not | architecture | system-guidelines.md:290 [packed] | — | Operations must not fail, return incorrect results, leak memory, or silently drop work be… |
| ARCH-0025 | must_not | architecture | system-guidelines.md:294 [packed] | — | Callers must not discover overload only through timeout expiry. |
| ARCH-0026 | must_not | architecture | system-guidelines.md:295 [packed] | — | Control-plane pressure must not cause query/data-plane correctness failures. |
| ARCH-0027 | must_not | architecture | system-guidelines.md:311 [packed] | — | Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin… |
| ARCH-0028 | must_not | architecture | system-guidelines.md:336 [packed] | — | Users do not directly manage partitions, replicas, placement, leader election, message gr… |
| ARCH-0029 | must_not | architecture | system-guidelines.md:204 [packed] | — | Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse th… |
| ARCH-0030 | must_not | architecture | system-guidelines.md:232 [packed] | — | Non-forced readers do not repair authoritative state on the hot path. |
| ARCH-0031 | must_not | architecture | system-guidelines.md:238 [packed] | — | Steady-state correctness must not depend on phase-owned wiring after phase completion. |
| ARCH-0032 | must_not | architecture | runtime-contracts.md:39 [packed] | — | Temporary delegators may forward to the owner, but must not add a second decision path. |
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
| ARCH-0046 | must_not | architecture | runtime-contracts.md:121 [packed] | — | Reader-local caches do not memoize stale or deferred blocked answers as fresh observation… |
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
| ARCH-0062 | must_not | architecture | runtime-contracts.md:282 [packed] | — | Participant executors emit outcomes and do not persist owner-managed phase transitions di… |
| ARCH-0063 | must_not | architecture | runtime-contracts.md:305 [packed] | — | Forbidden patterns: ad-hoc cross-owner write ordering to emulate atomicity |
| ARCH-0064 | must_not | architecture | runtime-contracts.md:306 [packed] | — | Forbidden patterns: sequential fallback branches for atomic topology cut points |
| ARCH-0065 | must_not | architecture | runtime-contracts.md:307 [packed] | — | Forbidden patterns: a second control-plane workflow engine when DurableWorkflowCoordinato… |
| ARCH-0066 | must_not | architecture | runtime-contracts.md:324 [packed] | — | Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked ent… |
| ARCH-0067 | must_not | architecture | runtime-contracts.md:343 [packed] | — | Do not pre-slice candidates to the requested replica count before admission. |
| ARCH-0068 | must_not | architecture | runtime-contracts.md:362 [packed] | — | Forbidden patterns: grouped-path diagnostics while grouped mode is disabled |
| ARCH-0069 | must_not | architecture | runtime-contracts.md:363 [packed] | — | Forbidden patterns: status checks that bypass declared active/terminal sets |
| ARCH-0070 | must_not | architecture | runtime-contracts.md:364 [packed] | — | Forbidden patterns: expiry sweeps that rewrite another owner's terminal workflow outcome |
| ARCH-0071 | must_not | architecture | runtime-contracts.md:381 [packed] | — | Forbidden patterns: nested waits using fresh full budgets after time has already elapsed |
| ARCH-0072 | must_not | architecture | runtime-contracts.md:382 [packed] | — | Forbidden patterns: generic timeout strings for semantic control-plane outcomes |
| ARCH-0073 | must_not | architecture | runtime-contracts.md:383 [packed] | — | Forbidden patterns: treating routine timeout under moderate load as operational tuning |
| ARCH-0074 | must_not | architecture | runtime-contracts.md:405 [packed] | — | Forbidden patterns: unbounded in-flight work |
| ARCH-0075 | must_not | architecture | runtime-contracts.md:406 [packed] | — | Forbidden patterns: hidden local priority queues outside the shared pressure contract |
| ARCH-0076 | must_not | architecture | runtime-contracts.md:407 [packed] | — | Forbidden patterns: callers discovering overload only by timeout |
| ARCH-0077 | must_not | architecture | runtime-contracts.md:408 [packed] | — | Forbidden patterns: resource cleanup that depends on process lifetime or scenario end |
| ARCH-0078 | must_not | architecture | runtime-contracts.md:426 [packed] | — | Forbidden patterns: direct local handler calls, ad-hoc sockets, admin forwarding, or serv… |
| ARCH-0079 | must_not | architecture | runtime-contracts.md:428 [packed] | — | Forbidden patterns: non-replicated fast paths for performance |
| ARCH-0080 | must_not | architecture | runtime-contracts.md:429 [packed] | — | Forbidden patterns: hard query failure while retryable replicas exist |
| ARCH-0081 | must_not | architecture | runtime-contracts.md:430 [packed] | — | Forbidden patterns: indefinite query queues waiting for topology transitions |
| ARCH-0082 | must_not | architecture | runtime-contracts.md:445 [packed] | — | Forbidden patterns: receiver logic that depends on caller discipline to avoid duplicates |
| ARCH-0083 | must_not | architecture | runtime-contracts.md:446 [packed] | — | Forbidden patterns: retryable paths that use non-idempotent counters or append-only write… |
| ARCH-0084 | must | architecture | system-guidelines.md:223 [packed] | — | CDC-replicated row mutation must be primary-key addressed. |
| ARCH-0085 | must | architecture | system-guidelines.md:243 [packed] | — | Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling c… |
| ARCH-0086 | must | architecture | system-guidelines.md:360 [packed] | — | Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin,… |
| ARCH-0087 | must | architecture | system-guidelines.md:362 [packed] | — | Before closure, perform the affected-area deep dive required by workflow-guidelines/INDEX… |
| ARCH-0088 | must | architecture | system-guidelines.md:365 [packed] | — | Known in-scope doctrine or system-guideline violations in the affected area must be fixed… |
| ARCH-0089 | must | architecture | system-guidelines.md:373 [packed] | — | Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active… |
| STYLE-0001 | must_not | style | code-style.md:66 [packed] | — | Do not create new files with ordinal, segment, or grab-bag names such as part-2, segment,… |
| STYLE-0002 | must_not | style | code-style.md:89 [packed] | `npm run audit:guideline:literals` | Do not inline domain/runtime scalars when an owner constant or explicit state variant sho… |
| STYLE-0003 | must_not | style | code-style.md:101 [packed] | — | Do not introduce synonyms for an existing concept. |
| STYLE-0004 | must_not | style | code-style.md:109 [packed] | — | Do not expose semantic policy through combinable booleans when one named mode constant se… |
| STYLE-0005 | must_not | style | code-style.md:116 [packed] | — | Do not leak raw storage or transport field shapes into runtime model names or contracts. |
| TEST-0001 | must_not | testing | testing-guidelines/fixtures.md:23 [packed] | — | When the mutation is lifecycle-related, assert both: - the initial row exists with canoni… |
| TEST-0002 | must_not | testing | testing-guidelines/fixtures.md:35 [packed] | — | Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism |
| TEST-0003 | must_not | testing | testing-guidelines/fixtures.md:36 [packed] | — | Do not comment out tests to avoid running them |
| TEST-0004 | must_not | testing | testing-guidelines/fixtures.md:37 [packed] | — | If a test is failing, fix the code or the test - do not skip it |
| TEST-0005 | must_not | testing | testing-guidelines/fixtures.md:54 [packed] | — | It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment check… |
| TEST-0006 | must_not | testing | testing-guidelines/fixtures.md:56 [packed] | — | It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only … |
| TEST-0007 | must_not | testing | testing-guidelines/fixtures.md:58 [packed] | — | It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization pat… |
| TEST-0008 | must_not | testing | testing-guidelines/fixtures.md:60 [packed] | — | It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test … |
| TEST-0009 | must_not | testing | testing-guidelines/fixtures.md:62 [packed] | — | It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. |
| TEST-0010 | must_not | testing | testing-guidelines/fixtures.md:120 [packed] | — | Do not land a test-only change that leaves a known System Guidelines violation in the cod… |
| TEST-0011 | must_not | testing | testing-guidelines/proof-ladders.md:25 [packed] | — | A Quest must not report SOLVED until its required validation has passed. |
| TEST-0012 | must_not | testing | testing-guidelines/proof-ladders.md:115 [packed] | — | Static guardrail proof is required even when focused unit and integration tests pass. Gre… |
| TEST-0013 | must_not | testing | testing-guidelines/regression-policy.md:56 [packed] | — | Combine before creating - If two existing pieces almost solve the problem, combine them. … |
| TEST-0014 | must_not | testing | testing-guidelines/regression-policy.md:141 [packed] | — | Do not close the second bug with only a local patch if the porous boundary remains unchan… |
| TEST-0015 | must_not | testing | testing-guidelines/regression-policy.md:197 [packed] | — | Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execu… |
| TEST-0016 | must_not | testing | testing-guidelines/release-gate.md:32 [packed] | — | Do not claim SOLVED on local green proof alone while the reference scenario still fails f… |
| TEST-0017 | must_not | testing | testing-guidelines/release-gate.md:92 [packed] | — | A lever that passes its own unit DT but never moves the real observable is NOT proven; do… |
| TEST-0018 | must_not | testing | testing-guidelines/release-gate.md:109 [packed] | — | Do not treat a baseline increase lacking both same-commit artifacts as a judgment call; i… |
| TEST-0019 | must_not | testing | testing-guidelines/release-gate.md:111 [packed] | — | Tighten a baseline in the same change that removes violations whenever the measured count… |
| TEST-0020 | must_not | testing | testing-guidelines/regression-policy.md:376 [packed] | — | Do not ignore a failing test. A failing test indicates broken functionality and must be t… |
| TEST-0021 | must_not | testing | testing-guidelines/regression-policy.md:377 [packed] | — | Do not defer the failure. When the failure is in the touched area, or was surfaced by the… |
| TEST-0022 | must_not | testing | testing-guidelines/regression-policy.md:407 [packed] | — | Do not mark the bug closed just because the baseline rerun happens to pass. Closure requi… |
| TEST-0023 | must_not | testing | testing-guidelines/regression-policy.md:413 [packed] | — | Treat timeouts as hard correctness failures by default. Do not raise product, harness, or… |
| ARCH-0090 | must_not | architecture | runtime-contracts.md:223 [packed] | — | Bootstrap, join, and recovery phases must not remain the steady-state owner after the pha… |
| ARCH-0091 | must_not | architecture | runtime-contracts.md:412 [packed] | — | During splits, moves, and leader elections, queries may be slower but must not fail becau… |
| ARCH-0092 | must | architecture | system-guidelines.md:92 [packed] | — | All non-trivial implementation work MUST follow the Quest workflow. |
| ARCH-0093 | must | architecture | system-guidelines.md:115 [packed] | — | Every state transition, lifecycle decision, data transformation, cache view, diagnostic g… |
| ARCH-0094 | must | architecture | system-guidelines.md:143 [packed] | — | Any runtime function or semantic concern MUST have one active path after input normalizat… |
| ARCH-0095 | must | architecture | system-guidelines.md:231 [packed] | — | Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner… |
| ARCH-0096 | must | architecture | system-guidelines.md:284 [packed] | — | The system must remain correct under contention, topology change, recovery, and control-p… |
| ARCH-0097 | must | architecture | system-guidelines.md:319 [packed] | — | All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps. |
| ARCH-0098 | must_not | architecture | doctrine/decision-experiments.md:87 [packed] | — | Broad ideas must not go straight into code. |
| ARCH-0099 | must_not | architecture | doctrine/decision-experiments.md:98 [packed] | — | Do not treat a Quest as SOLVED when only the hot path is fixed. A Quest is complete only … |
| ARCH-0100 | must_not | architecture | doctrine/state-encoding.md:20 [packed] | — | A phase must not tear down the only live runtime path. |
| ARCH-0101 | must_not | architecture | doctrine/state-encoding.md:31 [packed] | — | Pressure must not become hidden drops, memory growth without bounds, or correctness failu… |
| ARCH-0102 | must_not | architecture | doctrine/state-encoding.md:104 [packed] | — | Contradictory — authoritative or equivalent signals disagree; produces reconciliation wit… |
| ARCH-0103 | must_not | architecture | doctrine/state-encoding.md:131 [packed] | — | Inferences — derived signals such as error-string matching or absence of a row. An infere… |
| GOV-0001 | must_not | governance | findings/2026-07-10-reuse-comparison-before-new-machinery.md:7 [packed] | — | Parallel or duplicated machinery discovered on contact MUST be recorded as a consolidatio… |
| GOV-0002 | must_not | governance | roadmap.md:135 [packed] | — | Roadmap corrections discovered during implementation should land with the Quest changes t… |
| GOV-0003 | must_not | governance | roadmap.md:138 [packed] | — | Do not use roadmap state to claim Quest closure. Closure requires Solver terminal evidenc… |
| STYLE-0006 | must_not | style | code-style.md:44 [packed] | — | NEVER introduce eslint override comments. |
| STYLE-0007 | must_not | style | code-style.md:151 [packed] | — | The root .eslintrc.json is the legacy-format file and is NOT read by the npm run lint scr… |
| TEST-0024 | must_not | testing | findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:5 [packed] | — | NEVER ship a change to a hot failure-handling path (retry, recovery, failure-classificati… |
| TEST-0025 | must_not | testing | findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:7 [packed] | — | You MUST NOT convert a defer/backoff on a hot failure path into advance-now work (extra r… |
| TEST-0026 | must_not | testing | testing-guidelines/fixtures.md:28 [packed] | — | Do not rely on a broad scenario test alone when the bug is in a narrow system-table write… |
| TEST-0027 | must_not | testing | testing-guidelines/fixtures.md:45 [packed] | — | Production code must never contain alternate code paths, branches, or special-case logic … |
| TEST-0028 | must_not | testing | testing-guidelines/fixtures.md:104 [packed] | — | Mechanical test edits (renames, import updates, timeout adjustments, formatting) do NOT t… |
| TEST-0029 | must_not | testing | testing-guidelines/harness.md:56 [packed] | — | Do not reclassify a slow unit test as "integration" to dodge the hard error — move the fi… |
| TEST-0030 | must_not | testing | testing-guidelines/harness.md:64 [packed] | — | When a test exceeds its duration limit (2 seconds for a unit test, 30 seconds for an inte… |
| TEST-0031 | must_not | testing | testing-guidelines/harness.md:68 [packed] | — | Do NOT reach for unref() on awaited sleeps — that lets the process exit mid-await and has… |
| TEST-0032 | must_not | testing | testing-guidelines/regression-policy.md:382 [packed] | — | A test that fails because behavior regressed MUST be fixed (in the code or the test), and… |
| TEST-0033 | must_not | testing | testing-guidelines/regression-policy.md:388 [packed] | — | Work must not close while the touched area remains red. |
| GOV-0004 | must_not | governance | memory-boundary.md:29 [packed] | — | Session/narrative state (current blocker, handoff notes, working hypotheses) stays in ext… |
| ARCH-0104 | must | architecture | runtime-contracts.md:35 [packed] | — | Components constructed with owner dependencies must route owned behavior through those de… |
| ARCH-0105 | must | architecture | runtime-contracts.md:41 [packed] | — | A transitional delegator must have a removal task, target owner, and structural guard pre… |
| STYLE-0008 | must | style | code-style.md:58 [packed] | `npm run audit:file-size` | New or newly edited source-code files must finish within the per-scope thresholds owned b… |
| STYLE-0009 | must | style | code-style.md:62 [packed] | — | New source-code files must be named for the semantic responsibility they own, not for the… |
| STYLE-0010 | must | style | code-style.md:84 [packed] | — | Shared domain literals belong in their canonical owner module and must be imported from t… |
| TEST-0034 | must | testing | testing-guidelines/proof-ladders.md:22 [packed] | — | The active Quest must define the required validation surface. |
| TEST-0035 | must | testing | testing-guidelines/proof-ladders.md:23 [packed] | — | Tests added during the change must match the Quest concern rather than an unrelated umbre… |
| TEST-0036 | must | testing | testing-guidelines/proof-ladders.md:28 [packed] | — | After the Quest validation surface is green, perform the required closure deep dive acros… |
| TEST-0037 | must | testing | testing-guidelines/proof-ladders.md:38 [packed] | — | When residual closure moves to a follow-on Quest or frontier, the original Quest must sto… |
| TEST-0038 | must | testing | testing-guidelines/proof-ladders.md:132 [packed] | `npm run audit:file-size` | New or newly edited source-code files must finish within the per-scope thresholds owned b… _(alias of STYLE-0008)_ |
| TEST-0039 | must | testing | testing-guidelines/proof-ladders.md:133 [packed] | — | If a Quest touches an inherited oversized source-code file, it must extract or refactor t… |
| TEST-0040 | must | testing | testing-guidelines/regression-policy.md:22 [packed] | — | The test must fail with the current code |
| TEST-0041 | must | testing | testing-guidelines/regression-policy.md:143 [packed] | — | The next regression in that area must prove the reduced boundary, not only the immediate … |
| TEST-0042 | must | testing | testing-guidelines/release-gate.md:36 [packed] | — | A scenario-driven Quest that changes runtime meaning, decision meaning, or shared reporti… |
| TEST-0043 | must | testing | testing-guidelines/regression-policy.md:352 [packed] | — | Pressure tests MUST respect the standard duration limits (2s unit, 30s integration). Use … |
| ARCH-0106 | must_not | architecture | doctrine/decision-experiments.md:30 [packed] | — | Do not respond to repeated distributed failures by adding more scattered local special ca… |
| ARCH-0107 | must_not | architecture | doctrine/decision-experiments.md:134 [packed] | — | Do not treat hot-path green tests as analysis closure while the original scenario now fai… |
| ARCH-0108 | must_not | architecture | doctrine/decision-experiments.md:137 [packed] | — | Quests must never close from symptom movement alone (such as changed timeout durations, t… |
| ARCH-0109 | must_not | architecture | doctrine/owner-boundaries.md:24 [packed] | — | Callers do not reproduce the owner's logic locally, and callers do not keep shadow state … |
| ARCH-0110 | must_not | architecture | doctrine/owner-boundaries.md:28 [packed] | — | A new owner left running alongside the old path it was meant to replace is an unfinished … |
| ARCH-0111 | must_not | architecture | doctrine/owner-boundaries.md:53 [packed] | — | Do not keep patching symptoms while leaving the boundary porous. |
| ARCH-0112 | must_not | architecture | doctrine/owner-boundaries.md:68 [packed] | — | Do not let diagnostics views, retained owner state, bootstrap-normalized ingress state, o… |
| ARCH-0113 | must_not | architecture | doctrine/owner-boundaries.md:91 [packed] | — | Do not let old migration history or several optional delegated findings create competing … |
| ARCH-0114 | must_not | architecture | doctrine/single-path.md:17 [packed] | — | There may be multiple semantic owners, but there must not be many equivalent runtime ingr… |
| ARCH-0115 | must_not | architecture | doctrine/single-path.md:37 [packed] | — | Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime disse… |
| ARCH-0116 | must_not | architecture | doctrine/single-path.md:55 [packed] | — | Do not let observed, published, retained, cached, repaired, or fast-path variants drift i… |
| ARCH-0117 | must_not | architecture | doctrine/single-path.md:75 [packed] | — | Do not let row nullability, protocol-specific fields, or bootstrap-only shapes become sem… |
| ARCH-0118 | must_not | architecture | doctrine/single-path.md:89 [packed] | — | Do not encode semantic policy as independent booleans that callers can combine into overl… |
| ARCH-0119 | must_not | architecture | doctrine/state-encoding.md:28 [packed] | — | The system must not become less correct. |
| ARCH-0120 | must_not | architecture | doctrine/state-encoding.md:38 [packed] | — | The owner outcome must not degrade into empty collections, null-shaped absence, or timeou… |
| ARCH-0121 | must_not | architecture | doctrine/state-encoding.md:50 [packed] | — | Callers may consume or propagate that deferred outcome, but they must not silently reinte… |
| ARCH-0122 | must_not | architecture | doctrine/state-encoding.md:55 [packed] | — | Readers must not run synchronous multi-table authoritative repair inline on the hot read … |
| ARCH-0123 | must_not | architecture | doctrine/state-encoding.md:92 [packed] | — | Collectors may fetch, retry, and annotate evidence, but they do not emit the final verdic… |
| ARCH-0124 | must_not | architecture | doctrine/state-encoding.md:107 [packed] | — | Never let degraded evidence promote a blocked entity to ready or admitted. _(alias of ARCH-0066)_ |
| ARCH-0125 | must_not | architecture | doctrine/state-encoding.md:109 [packed] | — | Policy targets must not be rewritten from the survivors observed during one attempt. |
| ARCH-0126 | must_not | architecture | doctrine/state-encoding.md:161 [packed] | — | Do not force readers to reconstruct progress from object existence, local booleans, times… |
| ARCH-0127 | must_not | architecture | runtime-contracts.md:265 [packed] | — | Forbidden patterns: allowing a publication recovery producer to stall or wait on unknown … |
| ARCH-0128 | must_not | architecture | runtime-contracts.md:329 [packed] | — | Use ControlPlaneReadinessService as the readiness owner (node readiness and planning surf… |
| GOV-0005 | must_not | governance | roadmap.md:87 [packed] | — | docs/ holds documentation, never active work definition: user/operator-facing docs, the a… |
| GOV-0006 | must_not | governance | roadmap.md:149 [packed] | — | Tests never pin a flag (see testing-guidelines/fixtures.md "No Flag-Coupled Tests"). |
| GOV-0007 | must_not | governance | workflow-guidelines/solver-quests.md:48 [packed] | — | after audit passes, commit every Quest-scoped change (the Solver never pushes; see "Regul… |
| GOV-0008 | must_not | governance | workflow-guidelines/solver-quests.md:144 [packed] | — | Hypotheses = theory records (falsifiable, supersedable), never fields of the sealed file. |
| GOV-0009 | must_not | governance | memory-boundary.md:3 [packed] | — | The in-repo and external memory systems have different jobs and MUST NOT duplicate each o… |
| ARCH-0129 | must | architecture | runtime-contracts.md:101 [packed] | — | Shared truth surfaces such as startup, readiness, admin snapshot, service discovery, and … |
| ARCH-0130 | must | architecture | runtime-contracts.md:202 [packed] | — | Runtime shared-metadata access must cross canonical ingress owners. |
| ARCH-0131 | must | architecture | system-guidelines.md:352 [packed] | — | Quest validation must prove the owner path and affected tail consumers. Concretely: when … |
| ARCH-0132 | must | architecture | system-guidelines.md:367 [packed] | — | Scenario-driven Quests must prove what the original scenario does next: representative gr… |
| GOV-0010 | must_not | governance | workflow-guidelines/solver-quests.md:1128 [packed] | — | THEORY_REQUIRED / recoverable BLOCKED: return the typed judgment action to the external d… |
| STYLE-0011 | must_not | style | code-style.md:91 [packed] | — | JavaScript-language primitives are NOT domain scalars and do not need named constants: ty… |
| STYLE-0012 | must_not | style | code-style.md:102 [packed] | — | terminalize is not a word: in NEW or newly edited identifiers, comments, commit messages,… |
| TEST-0044 | must_not | testing | testing-guidelines/fixtures.md:83 [packed] | — | A test MUST assert the real, unconditional production behavior, and MUST NEVER set, branc… |
| TEST-0045 | must_not | testing | testing-guidelines/fixtures.md:87 [packed] | — | Production feature flags are within-session scaffolds only — NO flag survives the session… |
| TEST-0046 | must_not | testing | testing-guidelines/fixtures.md:109 [packed] | — | Identify the audit scope: the production files exercised by the new or modified test plus… |
| TEST-0047 | must_not | testing | testing-guidelines/harness.md:125 [packed] | — | Invoke targeted tests via the committed runner or tap directly - npm run test:file -- <te… |
| TEST-0048 | must_not | testing | testing-guidelines/regression-policy.md:99 [packed] | — | Soft-warning two-strikes. The SAME soft warning (a load-flake, a tolerated timeout, a "kn… |
| TEST-0049 | must_not | testing | testing-guidelines/release-gate.md:104 [packed] | — | An upward re-anchor MUST satisfy all of: the gate was silently red (never ran clean befor… |
| ARCH-0133 | must | architecture | runtime-contracts.md:387 [packed] | — | The system may slow under pressure, but it must remain correct. |
| GOV-0011 | must_not | governance | workflow-guidelines/closure.md:61 [packed] | — | Do not treat symptom movement as SOLVED. |
| GOV-0012 | must_not | governance | workflow-guidelines/subagents.md:18 [packed] | — | Delegated agents do not decide whether the Quest is solved. |
| GOV-0013 | must_not | governance | workflow-guidelines/subagents.md:45 [packed] | — | The worker must not report done: true as proof. |
| GOV-0014 | must_not | governance | workflow-guidelines/validators.md:18 [packed] | — | The Solver never trusts an agent's claim that work succeeded. |
| GOV-0015 | must_not | governance | workflow-guidelines/validators.md:51 [packed] | — | The report projection must not invent terminal status, synthetic attempts, or unmeasured … |
| ARCH-0134 | must | architecture | doctrine/single-path.md:24 [packed] | — | Query-plane traffic may use a separate ingress from metadata/control-plane traffic, but b… |
| ARCH-0135 | must | architecture | doctrine/state-encoding.md:21 [packed] | — | A phase-scoped bridge must either become a runtime-owned bridge or be replaced before tea… |
| ARCH-0136 | must | architecture | doctrine/state-encoding.md:23 [packed] | — | Completion of a phase must reduce temporary machinery, not strand it. |
| ARCH-0137 | must | architecture | doctrine/state-encoding.md:30 [packed] | — | Pressure must become admission, defer, reject, or coalescing signals. |
| ARCH-0138 | must | architecture | doctrine/state-encoding.md:124 [packed] | — | Actuals — observed state: a raft-observed leader, an active service row, a committed oper… |
| GOV-0016 | must | governance | findings/2026-07-10-reuse-comparison-before-new-machinery.md:5 [packed] | — | Every fix design and quest report MUST carry a visible REUSED vs EXTENDED vs NEW comparis… |
| GOV-0017 | must | governance | roadmap.md:82 [packed] | — | A Quest must cite or encode enough scope context to prevent local invention. |
| GOV-0018 | must | governance | roadmap.md:113 [packed] | — | The row must be in scope for this repository under the repo-root edition-matrix.md. |
| GOV-0019 | must | governance | roadmap.md:114 [packed] | — | Broad rows must gain a linked spec or architecture document before active implementation … |
| GOV-0020 | must | governance | roadmap.md:118 [packed] | — | The Quest must name the roadmap row, approved maintenance scope, or explicit user request… |
| STYLE-0013 | must | style | code-style.md:41 [packed] | — | All code must be written with ESLint rules in mind from the start. |
| TEST-0050 | must | testing | testing-guidelines/fixtures.md:33 [packed] | — | Every test that exists must run and pass. |
| TEST-0051 | must | testing | testing-guidelines/fixtures.md:48 [packed] | — | Tests must exercise the real production code paths. |
| TEST-0052 | must | testing | testing-guidelines/fixtures.md:73 [packed] | — | The test suite must prove that production code works — not that a test-friendly fork of i… |
| TEST-0053 | must | testing | testing-guidelines/harness.md:105 [packed] | — | Timeouts in control-plane logic are hard correctness bugs and must be tested as typed out… |
| TEST-0054 | must | testing | testing-guidelines/proof-ladders.md:71 [packed] | — | Every non-trivial Quest must prove that it did not increase architecture drift while fixi… |
| TEST-0055 | must | testing | testing-guidelines/regression-policy.md:17 [packed] | — | All bug fixes MUST be preceded by a failing test that reproduces the bug. |
| TEST-0056 | must | testing | testing-guidelines/regression-policy.md:122 [packed] | — | When the second correctness bug appears at the same architectural boundary in one work cy… |
| TEST-0057 | must | testing | testing-guidelines/regression-policy.md:148 [packed] | — | When a bug involves component ownership, lifecycle persistence, or system-table row mutat… |
| TEST-0058 | must | testing | testing-guidelines/regression-policy.md:173 [packed] | — | When a change touches shared metadata reads or writes, tests and CI checks must prove the… |
| TEST-0059 | must | testing | testing-guidelines/regression-policy.md:189 [packed] | — | When a change touches control-plane progression (dispatch, rebalance, split, admission pr… |
| TEST-0060 | must | testing | testing-guidelines/regression-policy.md:239 [packed] | — | When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, … |
| TEST-0061 | must | testing | testing-guidelines/release-gate.md:18 [packed] | — | When a Quest exists because a distributed, integration, load, or scenario failure must be… |
| TEST-0062 | must | testing | testing-guidelines/release-gate.md:42 [packed] | — | If the fixture contract was correct, the next attempt must target the runtime owner bound… |
| TEST-0063 | must | testing | testing-guidelines/release-gate.md:83 [packed] | — | A deterministic proof MUST move the real in-cluster binding observable that the doneWhen … |
| TEST-0064 | must | testing | testing-guidelines/release-gate.md:114 [packed] | — | When a delegated worker reviews a scenario Quest, it must compare current probe evidence … |
| TEST-0065 | must | testing | testing-guidelines/regression-policy.md:275 [packed] | — | When an owner path is intentionally unresolved under pressure, publication establishment,… |
| TEST-0066 | must | testing | testing-guidelines/regression-policy.md:297 [packed] | — | When a change touches startup, readiness, admin snapshot, service discovery, or another s… |
| TEST-0067 | must | testing | testing-guidelines/regression-policy.md:318 [packed] | — | Tests MUST verify this property at the unit and integration layers, not only in the distr… |
| TEST-0068 | must | testing | testing-guidelines/regression-policy.md:371 [packed] | — | Failures discovered in the touched area, or discovered by the test runs chosen for the cu… |
| GOV-0021 | must_not | governance | workflow-guidelines/solver-quests.md:34 [packed] | — | Link the earlier evidence as provenance; do not backdate it as a Quest attempt. |
| GOV-0022 | must_not | governance | workflow-guidelines/solver-quests.md:51 [packed] | — | Do not move goalposts in place. |
| GOV-0023 | must_not | governance | workflow-guidelines/solver-quests.md:117 [packed] | — | Do not embed a diagnosed ROOT narrative in the statement: put causal roots, suspected mec… |
| GOV-0024 | must_not | governance | workflow-guidelines/solver-quests.md:120 [packed] | — | When a root is falsified mid-Quest, record the superseding finding — never edit the seale… |
| GOV-0025 | must_not | governance | workflow-guidelines/solver-quests.md:163 [packed] | — | solve lint --all is the read-only legacy census and never rewrites historical Quest files… |
| GOV-0026 | must_not | governance | workflow-guidelines/solver-quests.md:166 [packed] | — | Drafts remain visible and separately tallied, but do not enter the active open-work ratio… |
| GOV-0027 | must_not | governance | workflow-guidelines/solver-quests.md:169 [packed] | — | These stages do not add or rewrite a store-level Quest status. |
| GOV-0028 | must_not | governance | workflow-guidelines/solver-quests.md:191 [packed] | — | Two legitimate Quest shapes have different closure bars; do not conflate them. |
| GOV-0029 | must_not | governance | workflow-guidelines/solver-quests.md:215 [packed] | — | An invalid sample is an honest no-measurement: it never counts as progress, never satisfi… |
| GOV-0030 | must_not | governance | workflow-guidelines/solver-quests.md:222 [packed] | — | The retry is bounded by CANNOT_MEASURE_RETRY_BUDGET: once that many consecutive samples o… |
| GOV-0031 | must_not | governance | workflow-guidelines/solver-quests.md:226 [packed] | — | Never treat a blocked or incomplete run as a metric floor. |
| GOV-0032 | must_not | governance | workflow-guidelines/solver-quests.md:228 [packed] | — | When a frontier has already parked as cannot_measure (its samples never measured), the ve… |
| GOV-0033 | must_not | governance | workflow-guidelines/solver-quests.md:238 [packed] | — | An exhausted park had at least one honestly-measured sample but the metric never moved — … |
| GOV-0034 | must_not | governance | workflow-guidelines/solver-quests.md:239 [packed] | — | A cannot_measure park had only non-measuring samples — the harness itself never produced … |
| GOV-0035 | must_not | governance | workflow-guidelines/solver-quests.md:245 [packed] | — | Fix the harness (or change the attempt evidence) before reopening again, so reopen and pa… |
| GOV-0036 | must | governance | memory-boundary.md:20 [packed] | — | A lesson that should bind future work for everyone MUST be promoted into in-repo steering… |
| GOV-0037 | must | governance | memory-boundary.md:31 [packed] | — | Durable operational ground truth has exactly one canonical home, operational-ground-truth… |
| GOV-0038 | must_not | governance | workflow-guidelines/solver-quests.md:265 [packed] | — | Never place a runner under test/: knip's entry patterns cover scripts/ but not test/ runn… |
| GOV-0039 | must_not | governance | workflow-guidelines/solver-quests.md:267 [packed] | — | Do not copy the runner path from an old verification receipt; receipts are history, not p… |
| GOV-0040 | must_not | governance | workflow-guidelines/solver-quests.md:324 [packed] | — | Do not keep patching under a theory whose owner path is no longer current. |
| GOV-0041 | must_not | governance | workflow-guidelines/solver-quests.md:336 [packed] | — | Their authored inputs remain counted and their freshness gates still fail closed; mechani… |
| GOV-0042 | must_not | governance | workflow-guidelines/solver-quests.md:345 [packed] | — | A Quest must not accumulate an unrecoverable dirty tree, but recording an attempt or find… |
| GOV-0043 | must_not | governance | workflow-guidelines/solver-quests.md:363 [packed] | — | The Solver NEVER pushes: no subcommand, loop, or handoff runs git push (autoCommitQuest a… |
| GOV-0044 | must_not | governance | workflow-guidelines/solver-quests.md:374 [packed] | — | Detectors fire only on real recorded events and never touch the sealed doneWhen. |
| ARCH-0139 | should | architecture | system-guidelines.md:340 [packed] | — | New features should strengthen tables, services, policies, and canonical execution paths … |
| GOV-0045 | must_not | governance | roadmap.md:104 [packed] | — | Such examples must not define implementation tasks in this repository unless the active Q… |
| GOV-0046 | must_not | governance | workflow-guidelines/solver-quests.md:542 [packed] | — | Do not revive sprint/package theory state as active authority. |
| GOV-0047 | must_not | governance | workflow-guidelines/solver-quests.md:607 [packed] | — | Parallelism MUST NOT be applied to the proof path: subagent verification before handoff, … |
| GOV-0048 | must_not | governance | workflow-guidelines/solver-quests.md:652 [packed] | — | A green DT on an injected seam is not sufficient on its own — two wrong legs on this repo… |
| GOV-0049 | must_not | governance | workflow-guidelines/solver-quests.md:688 [packed] | — | Do not drip-feed another applicable checklist after a verdict. |
| GOV-0050 | must_not | governance | workflow-guidelines/solver-quests.md:726 [packed] | — | Until replacement, checkpoint and terminal handoff remain blocked; next asks for the repl… |
| GOV-0051 | must_not | governance | workflow-guidelines/solver-quests.md:752 [packed] | — | Do not include unrelated dirty worktree entries from another Quest. |
| GOV-0052 | must_not | governance | workflow-guidelines/solver-quests.md:754 [packed] | — | Do not push (see "Regular Commit (No Push)" above). |
| GOV-0053 | must_not | governance | workflow-guidelines/solver-quests.md:759 [packed] | — | It derives the in-scope set purely from the Quest's sealed solve/ artifacts plus the sour… |
| GOV-0054 | must_not | governance | workflow-guidelines/solver-quests.md:762 [packed] | — | The handoff command is a dry run by default; --commit executes the printed git add/commit… |
| GOV-0055 | must_not | governance | workflow-guidelines/solver-quests.md:816 [packed] | — | A per-frontier investigation budget (INVESTIGATION_BUDGET) caps how many distinct theorie… |
| GOV-0056 | must_not | governance | workflow-guidelines/solver-quests.md:818 [packed] | — | A confirmed or refuted discrimination is investigative progress only; it never satisfies … |
| GOV-0057 | must_not | governance | workflow-guidelines/solver-quests.md:924 [packed] | — | A guard never silently halts a run. |
| ARCH-0140 | must_not | architecture | doctrine/decision-experiments.md:101 [packed] | — | Do not begin a new local patch on the same architectural boundary while the current Quest… |
| ARCH-0141 | must_not | architecture | doctrine/decision-experiments.md:111 [packed] | — | Use the model ledger as an advisory feedback loop for future model, reasoning-effort, and… |
| ARCH-0142 | must_not | architecture | doctrine/state-encoding.md:127 [packed] | — | Targets — intent: replica_count, planned placement, configured cohort sizes. A target mus… |
| GOV-0058 | must_not | governance | workflow-guidelines/solver-quests.md:1015 [packed] | — | The override changes the response to a recorded signal; it never mutates a detector verdi… |
| GOV-0059 | must_not | governance | workflow-guidelines/solver-quests.md:1072 [packed] | — | Reflection is additive and reversible: it produces a recorded note and resets a cadence c… |
| GOV-0060 | must_not | governance | workflow-guidelines/solver-quests.md:1110 [packed] | — | Advisories are read-only and never block; they fire on the same conditions the autonomous… |
| GOV-0061 | must_not | governance | workflow-guidelines/solver-quests.md:1161 [packed] | — | Their presence, mtime, or bytes MUST NOT gate next, audit, checkpoint, or terminal handof… |
| GOV-0062 | must_not | governance | workflow-guidelines/solver-quests.md:1180 [packed] | — | When an epic decision changes, record the dated decision and its explicit target link; ne… |
| GOV-0063 | must_not | governance | workflow-guidelines/solver-quests.md:1195 [packed] | — | Derived epic stage keys ONLY on explicit planning references and projected Quest state — … |
| GOV-0064 | must_not | governance | workflow-guidelines/solver-quests.md:1196 [packed] | — | The consistency gate separately checks structural contract fields and the presence of the… |
| TEST-0069 | must_not | testing | testing-guidelines/release-gate.md:67 [packed] | — | The expensive non-deterministic statistical gate (the docker rolling-restart stat-gate an… |
| TEST-0070 | must_not | testing | testing-guidelines/release-gate.md:98 [packed] | — | Committed static-gate baselines — the BASELINE_COUNT constants in scripts/check-complexit… |
| GOV-0065 | must_not | governance | memory-boundary.md:40 [packed] | — | Metadata is part of the diff. When you substantively change a memory file, refresh its fr… |
| ARCH-0143 | must | architecture | doctrine/decision-experiments.md:52 [packed] | — | Scenario-driven Quests must maintain scenario causal closure across the whole chain, not … |
| ARCH-0144 | must | architecture | doctrine/owner-boundaries.md:17 [packed] | — | Every durable concern must have one semantic owner. |
| ARCH-0145 | must | architecture | doctrine/owner-boundaries.md:27 [packed] | — | Introducing a new owner is a cutover, not an addition: the prior authority for that conce… |
| ARCH-0146 | must | architecture | doctrine/owner-boundaries.md:52 [packed] | — | After repeated bugs at one boundary, the next fix must reduce the number of paths, states… |
| ARCH-0147 | must | architecture | doctrine/owner-boundaries.md:80 [packed] | — | An active Quest may have several frontiers, but each attempt must start from one selected… |
| ARCH-0148 | must | architecture | doctrine/owner-boundaries.md:94 [packed] | — | If the semantic owner, owner boundary, or next required action changes, record a finding … |
| ARCH-0149 | must | architecture | doctrine/single-path.md:58 [packed] | — | The "consumer set" and "forbidden reinterpretations" bullets above overlap by design with… |
| ARCH-0150 | must | architecture | doctrine/state-encoding.md:17 [packed] | — | Bootstrap, join, and recovery phases may initialize runtime mechanisms, but they must han… |
| ARCH-0151 | must | architecture | doctrine/state-encoding.md:36 [packed] | — | When an owner-path read or write is unresolved because pressure, authority establishment,… |
| ARCH-0152 | must | architecture | doctrine/state-encoding.md:61 [packed] | — | Critical convergence traffic must keep stricter admission than diagnostics, observability… |
| ARCH-0153 | must | architecture | doctrine/state-encoding.md:62 [packed] | — | In practice, node-state publication, membership publication, and authoritative operation … |
| ARCH-0154 | must | architecture | doctrine/state-encoding.md:115 [packed] | — | State names are boundary-specific but must distinguish static exclusion, missing discover… |
| GOV-0066 | must | governance | workflow-guidelines/solver-quests.md:109 [packed] | — | constraints[]: optional hard limits the agent must preserve. In version 1, each entry has… |
| GOV-0067 | must | governance | workflow-guidelines/solver-quests.md:552 [packed] | — | widen-scope: selected frontier theory required. |
| GOV-0068 | must | governance | workflow-guidelines/solver-quests.md:553 [packed] | — | model: selected frontier theory, active system theory, and --modelRef or --modelNotApplic… |
| GOV-0069 | must | governance | workflow-guidelines/solver-quests.md:555 [packed] | — | change-approach: selected frontier theory remains required; model evidence is not require… |
| ARCH-0155 | must_not | architecture | runtime-contracts.md:190 [packed] | — | The services row is the canonical example of non-overlapping field owners on one row: ide… |
| ARCH-0156 | must_not | architecture | runtime-contracts.md:195 [packed] | — | Retry is not fallback: routing MAY retry or redirect to another live replica or a new lea… |
| GOV-0070 | must | governance | workflow-guidelines/solver-quests.md:881 [packed] | — | THEORY_REQUIRED (non-terminal): the selected rung needs system or frontier theory before … |
| ARCH-0157 | should | architecture | system-guidelines.md:305 [packed] | — | All service communication that should be a message goes through the MessageRouter. |
| TEST-0071 | must | testing | testing-guidelines/proof-ladders.md:110 [packed] | — | Existing violations in touched files must be fixed when they are part of the same semanti… |
| TEST-0072 | must | testing | testing-guidelines/regression-policy.md:114 [packed] | — | Live-refutation two-strikes. When live/measured evidence contradicts a sealed statement o… |
| GOV-0071 | must | governance | workflow-guidelines/quest-artifacts.md:51 [packed] | — | Use source, test, architecture, and steering files for the implementation or documentatio… |
| GOV-0072 | must | governance | workflow-guidelines/subagents.md:52 [packed] | — | Durable conclusions must be recorded with node scripts/solve.js finding before they are r… |
| GOV-0073 | must | governance | workflow-guidelines/validators.md:40 [packed] | — | Later attempts must use the same sealed goalposts. |
| TEST-0073 | must | testing | testing-guidelines/regression-policy.md:332 [packed] | — | Slow-dependency resilience — inject artificial latency into a dependency (mock that resol… |
| GOV-0074 | must_not | governance | workflow-guidelines/solver-quests.md:68 [packed] | — | solve start --id <id> runs doctor, optionally creates a linked draft when authoring flags… |
| GOV-0075 | must_not | governance | workflow-guidelines/solver-quests.md:71 [packed] | — | solve continue --id <id> executes only structured begin-step, commit-step, or replacement… |
| GOV-0076 | must_not | governance | workflow-guidelines/solver-quests.md:76 [packed] | — | solve land --id <id> --verifier <id> --verdict approve\|reject --fingerprint <sha256> vali… |
| GOV-0077 | must_not | governance | workflow-guidelines/solver-quests.md:199 [packed] | — | A building-block Quest — landing a safe mechanism validated behind a temporary lever — cl… |
| GOV-0078 | must_not | governance | workflow-guidelines/solver-quests.md:383 [packed] | — | Oscillation detection: returning the frontier to a previously-abandoned blocker (owner / … |
| GOV-0079 | must_not | governance | workflow-guidelines/solver-quests.md:397 [packed] | — | Measured promotion only: a theory is promoted exclusively by a measured post-patch eviden… |
| GOV-0080 | must_not | governance | workflow-guidelines/solver-quests.md:445 [packed] | — | Gradient refinement of the sealed metric: a frontier metric may be sharpened from the sca… |
| GOV-0081 | must_not | governance | workflow-guidelines/solver-quests.md:452 [packed] | — | Harness-not-measuring gate (rr-G): a run that did not measure the system under test — a d… |
| ARCH-0158 | may | architecture | system-guidelines.md:128 [packed] | — | A shared row may have several field owners only when the owned subsets are explicit and n… |
| ARCH-0159 | may | architecture | system-guidelines.md:155 [packed] | — | Collectors may gather evidence; one canonical adjudicator emits the final ready, admit, s… |
| ARCH-0160 | may | architecture | system-guidelines.md:226 [packed] | — | Consumers may not maintain parallel system-data caches outside the declared owner or Syst… |
| ARCH-0161 | may | architecture | system-guidelines.md:248 [packed] | — | For one owner key, at most one reconcile execution may be in flight. |
| GOV-0082 | must_not | governance | workflow-guidelines/solver-quests.md:869 [packed] | — | EXHAUSTED (terminal): every frontier is parked as exhausted, either by the finite strateg… |
| GOV-0083 | must_not | governance | workflow-guidelines/solver-quests.md:884 [packed] | — | BLOCKED (non-terminal): a recoverable precondition gate (scope pressure, regression-resto… |
| ARCH-0162 | may | architecture | system-guidelines.md:338 [packed] | — | Internal machinery may appear in diagnostics, but not as ordinary user-facing control sur… |
| GOV-0084 | must_not | governance | workflow-guidelines/solver-quests.md:1006 [packed] | — | Override-tagged advisories are excluded from soft-first quorum counting (the GUARD_QUORUM… |
| GOV-0085 | must | governance | workflow-guidelines/solver-quests.md:20 [packed] | — | A Quest is also required up front for live/distributed work, cross-session investigation,… |
| GOV-0086 | must | governance | workflow-guidelines/solver-quests.md:31 [packed] | — | If it produces a failed measurement, expands beyond the original bounded owner scope, or … |
| GOV-0087 | must | governance | workflow-guidelines/solver-quests.md:84 [packed] | — | Automation MUST dispatch only on code and validated payload. |
| GOV-0088 | must | governance | workflow-guidelines/solver-quests.md:85 [packed] | — | new, lint, next, step, finding, audit, checkpoint, and handoff remain component commands … |
| GOV-0089 | must | governance | workflow-guidelines/solver-quests.md:127 [packed] | — | Product quests must carry at least one planning link at creation: planDoc for the epic/sp… |
| GOV-0090 | must | governance | workflow-guidelines/solver-quests.md:605 [packed] | — | Work MUST be serialized only when one step's output feeds another, or when workers would … |
| GOV-0091 | must | governance | workflow-guidelines/solver-quests.md:631 [packed] | — | The artifact must live under solve/changes/<questId>/, end in .diff, and contain a unifie… |
| GOV-0092 | must | governance | workflow-guidelines/solver-quests.md:674 [packed] | — | Its first two checks are ratcheted and must be green. |
| GOV-0093 | must | governance | workflow-guidelines/solver-quests.md:686 [packed] | — | The verifier must inspect that complete manifest, the exact patch, Quest seal, relevant s… |
| STYLE-0014 | should | style | code-style.md:111 [packed] | — | When a boundary already owns a named mode vocabulary, call sites and tests should use tha… |
| TEST-0074 | should | testing | testing-guidelines/proof-ladders.md:61 [packed] | — | leftover scaffolds — a flag, test-only path, or dead branch the change should have remove… |
| TEST-0075 | should | testing | testing-guidelines/regression-policy.md:23 [packed] | — | The test should capture the exact failure scenario from the bug report |
| TEST-0076 | should | testing | testing-guidelines/regression-policy.md:27 [packed] | — | The failure message should match the reported error |
| TEST-0077 | should | testing | testing-guidelines/regression-policy.md:31 [packed] | — | The fix should make the failing test pass |
| TEST-0078 | should | testing | testing-guidelines/regression-policy.md:82 [packed] | — | Is the current problem a repeated pattern? If so, is there a shared abstraction that shou… |
| GOV-0094 | must | governance | workflow-guidelines/solver-quests.md:859 [packed] | — | For any other open choice the agent MUST pick a sensible default, record a finding, and c… |
| ARCH-0163 | must | architecture | doctrine/decision-experiments.md:91 [packed] | — | Every active Quest must name its residual-closure inventory before code is treated as com… |
| GOV-0095 | must | governance | workflow-guidelines/solver-quests.md:1056 [packed] | — | EXHAUST-and-pivot to a higher-altitude Quest/epic is a legitimate, encouraged outcome of … |
| GOV-0096 | must | governance | workflow-guidelines/solver-quests.md:1164 [packed] | — | A projection-retention migration MUST classify exact paths before removal, record base co… |
| TEST-0079 | must | testing | testing-guidelines/fixtures.md:101 [packed] | — | When adding a new test file, or making a behavior-meaningful change to an existing test —… |
| TEST-0080 | must | testing | testing-guidelines/regression-policy.md:217 [packed] | — | When a bug depends on stale cache truth, stale routing, delayed authoritative visibility,… |
| GOV-0097 | must_not | governance | workflow-guidelines/solver-quests.md:217 [packed] | — | Climbing a rung is a response to a measured stall — a trustworthy observation that the cu… |
| GOV-0098 | must_not | governance | workflow-guidelines/solver-quests.md:230 [packed] | — | The reopen is evidence-gated: it is refused unless at least one contributing attempt re-c… |
| GOV-0099 | must_not | governance | workflow-guidelines/solver-quests.md:255 [packed] | — | A later regression-resolution finding with resolution explained may discharge the restore… |
| GOV-0100 | must_not | governance | workflow-guidelines/solver-quests.md:364 [packed] | — | Pushing is a separate, outward-facing action — for Quest and ad-hoc work alike, a never-b… |
| ARCH-0164 | may | architecture | system-guidelines.md:237 [packed] | — | Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may initialize … |
| GOV-0101 | must_not | governance | workflow-guidelines/solver-quests.md:833 [packed] | — | When a finding materially falsifies or constrains ANOTHER declared quest's premise, route… |
| GOV-0102 | must_not | governance | workflow-guidelines/solver-quests.md:909 [packed] | — | Provenance honesty (mirroring CLOSURE_MEASURED vs CLOSURE_DECISION): a ladder park is a M… |
| GOV-0103 | must_not | governance | workflow-guidelines/solver-quests.md:1063 [packed] | — | The production reflection path runs only when the executor exposes a reflect() method (th… |
| GOV-0104 | must_not | governance | workflow-guidelines/solver-quests.md:1080 [packed] | — | A supervised driver — a human, or any agent that drives the Solver through individual sub… |
| TEST-0081 | should | testing | testing-guidelines/regression-policy.md:32 [packed] | — | No other tests should break |
| ARCH-0165 | should | architecture | doctrine/decision-experiments.md:88 [packed] | — | Active implementation should target one executable concern per Quest. |
| ARCH-0166 | should | architecture | doctrine/decision-experiments.md:89 [packed] | — | Quest status should live in the Solver event log and report rather than in parallel track… |
| TEST-0082 | should | testing | testing-guidelines/proof-ladders.md:17 [packed] | — | All non-trivial implementation work should have validation owned by its active Quest. |
| TEST-0083 | should | testing | testing-guidelines/proof-ladders.md:123 [packed] | — | Runtime Quests that touch already oversized files should record whether they are adding l… |
| TEST-0084 | should | testing | testing-guidelines/regression-policy.md:168 [packed] | — | These tests should be small and targeted. |
| TEST-0085 | should | testing | testing-guidelines/release-gate.md:115 [packed] | — | The review should produce candidate findings or risks; the Solver still owns terminal sta… |
| GOV-0105 | must | governance | roadmap.md:145 [packed] | — | Before the landing session ends, the flag MUST be resolved: validate the change (determin… |
| GOV-0106 | must | governance | roadmap.md:152 [packed] | — | Flags inherited from before this rule are recorded debt, not license: retire or promote e… |
| GOV-0107 | must | governance | workflow-guidelines/solver-quests.md:102 [packed] | — | class: "product" (default) or "process". Product goals must be MEASURED against a real ar… |
| GOV-0108 | must | governance | workflow-guidelines/solver-quests.md:432 [packed] | — | Regression-restore gate: once a measured run records an invariant regression, the very ne… |
| GOV-0109 | must_not | governance | findings/2026-06-17-workflow-linking-and-memory-loop-promoted-findings-must-be-normative.md:5 [packed] | — | Findings promoted into steering MUST be written as a normative sentence containing a reco… |
| GOV-0110 | must_not | governance | findings/2026-06-30-plan-requests-stay-plan-only.md:5 [packed] | — | When the user asks for a plan, design, or review with no implementation-truth change requ… |
| TEST-0086 | must_not | testing | findings/2026-06-17-steering-doc-clarity-deterministic-first-repro.md:5 [packed] | — | A convergence bug MUST be reproduced deterministically in-process BEFORE changing code; t… |
| TEST-0087 | must_not | testing | findings/2026-06-17-steering-doc-clarity-repro-at-correct-altitude.md:5 [packed] | — | A convergence-bug repro MUST exercise the layer where the invariant is produced or violat… |
| GOV-0111 | must | governance | workflow-guidelines/solver-quests.md:931 [packed] | — | explore: open a bounded free-explore rung. A missing theory maps here: the run keeps thin… |
| TEST-0088 | may | testing | testing-guidelines/harness.md:27 [packed] | — | Only return to suite-local fixes after the shared runner boundary is shown stable. |
| TEST-0089 | may | testing | testing-guidelines/harness.md:46 [packed] | — | Only restore higher parallelism after the aggregate gate is proven stable at the new boun… |
| TEST-0090 | may | testing | testing-guidelines/regression-policy.md:86 [packed] | — | Are multiple recent bugs clustering around the same boundary or component? That may indic… |
| ARCH-0167 | should | architecture | doctrine/decision-experiments.md:49 [packed] | — | Runtime Quests that follow such a model should cite it as their scope basis and proof sur… |
| ARCH-0168 | should | architecture | doctrine/decision-experiments.md:80 [packed] | — | Implementation work should be as explicit and bounded as the runtime design. |
| ARCH-0169 | should | architecture | doctrine/owner-boundaries.md:99 [packed] | — | Optional real sub-agents should accelerate this sequence, not replace it. |
| GOV-0112 | should | governance | workflow-guidelines/solver-quests.md:496 [packed] | — | Frontier theory: why the next local intervention should move the selected frontier metric. |
| GOV-0113 | must | governance | workflow-guidelines/solver-quests.md:174 [packed] | — | Therefore, when authoring a quest whose defect class is visible in a live surface (demo, … |
| GOV-0114 | must | governance | workflow-guidelines/solver-quests.md:290 [packed] | — | A resume-critical result (a newly pinned binding head, a decided next move) must therefor… |
| GOV-0115 | should | governance | workflow-guidelines/solver-quests.md:828 [packed] | — | optional rulesOut text for approaches that should not be retried. |
| GOV-0116 | must | governance | workflow-guidelines/solver-quests.md:647 [packed] | — | For a source-changing attempt whose proof depends on a live/distributed precondition, the… |
| GOV-0117 | must | governance | workflow-guidelines/solver-quests.md:848 [packed] | — | The default execution posture for a non-trivial Quest is autonomous: the agent SHOULD dri… |
| GOV-0118 | must | governance | workflow-guidelines/solver-quests.md:854 [packed] | — | The agent MUST stop and request user input only on one of the four canonical core.md stop… |
| GOV-0119 | must | governance | workflow-guidelines/solver-quests.md:901 [packed] | — | Guards: the command refuses without a prior reflect --altitude on the quest (the frame-qu… |
| GOV-0120 | should | governance | workflow-guidelines/subagents.md:51 [packed] | — | The review should return findings, candidate risks, or suggested frontiers. |
| ARCH-0170 | may | architecture | doctrine/state-encoding.md:98 [packed] | — | Authoritative — owned by the same semantic owner and plane; may directly admit or reject. |
| ARCH-0171 | may | architecture | doctrine/state-encoding.md:100 [packed] | — | Equivalent — another access path to the same owner and plane; may confirm or refute only … |
| GOV-0121 | may | governance | roadmap.md:116 [packed] | — | A row may move to active implementation only when the intended behavior is sharp enough t… |
| TEST-0091 | may | testing | testing-guidelines/fixtures.md:78 [packed] | — | The test-only-paths rule and this flag-coupling rule together close the loop — neither te… |
| TEST-0092 | may | testing | testing-guidelines/harness.md:143 [packed] | — | Only run the complete test suite (npm test) at: - Checkpoint tasks explicitly marked in t… |
| TEST-0093 | may | testing | testing-guidelines/regression-policy.md:316 [packed] | — | System guideline §9 (Load May Slow The System, Not Break It) requires that all subsystems… |
| GOV-0122 | should | governance | workflow-guidelines/solver-quests.md:299 [packed] | — | Record a separate explicit finding only when an operator or agent learned a durable concl… |
| GOV-0123 | should | governance | workflow-guidelines/solver-quests.md:339 [packed] | — | Scope pressure is advisory rather than terminal, but a high-severity signal should usuall… |
| GOV-0124 | must | governance | findings/2026-06-30-adversarially-vet-hypotheses-before-presenting.md:5 [packed] | — | Before presenting any hypothesis, root-cause theory, or proposed lever to the operator, y… |
| GOV-0125 | must | governance | findings/2026-06-30-read-freshest-precomputed-artifact-first.md:5 [packed] | — | Before re-deriving an expensive analysis by hand, you MUST first sort the candidate artif… |
| GOV-0126 | must | governance | findings/2026-07-05-prefer-machine-checks-over-prose.md:5 [packed] | — | Any steering rule that can be enforced by a machine check (lint rule, ratchet, guard scri… |
| GOV-0127 | should | governance | workflow-guidelines/solver-quests.md:600 [packed] | — | Independent work within a Quest SHOULD run concurrently: batch independent reads, fan out… |
| GOV-0128 | should | governance | workflow-guidelines/solver-quests.md:602 [packed] | — | Broad mechanical sweeps SHOULD use the Workflow harness to pipeline the work-list. |
| GOV-0129 | should | governance | workflow-guidelines/solver-quests.md:851 [packed] | — | Longer work SHOULD use run --keep-alive to replay progress-bearing MAX_CYCLES; the extern… |
| ARCH-0172 | should | architecture | doctrine/decision-experiments.md:82 [packed] | — | A human idea should first become the smallest sufficient form: - direct bounded work with… |
| GOV-0130 | should | governance | memory-boundary.md:9 [packed] | — | In-repo steering (docs/steering/, the generated packs under docs/steering/llm/, rules.jso… |
| ARCH-0173 | may | architecture | doctrine/state-encoding.md:27 [packed] | — | Under load, the system may slow down, defer work, or reject new edge work with structured… |
| GOV-0131 | may | governance | workflow-guidelines/solver-quests.md:939 [packed] | — | terminal: reserved strictly for SOLVED and honest EXHAUSTED. An unmapped or deliberately … |
| GOV-0132 | may | governance | workflow-guidelines/quest-artifacts.md:40 [packed] | — | The derived cache is git-ignored and may be rebuilt from the Quest plus event log. |
| GOV-0133 | may | governance | workflow-guidelines/validators.md:43 [packed] | — | One sanctioned exception: a frontier metric may be sharpened to a strictly harder gradien… |
| ARCH-0174 | should | architecture | doctrine/decision-experiments.md:71 [packed] | — | Classification-only is a valid result only when the causal chain is still explicit, the f… |
| GOV-0134 | may | governance | workflow-guidelines/solver-quests.md:254 [packed] | — | Only a genuinely broken or disconnected harness is globally invalid/non-measuring. |
| GOV-0135 | may | governance | workflow-guidelines/solver-quests.md:318 [packed] | — | When a metric does not improve but the blocker moves owner, boundary, or mechanism, the s… |
| GOV-0136 | may | governance | roadmap.md:103 [packed] | — | Architecture documents may mention Pro or Enterprise services only as examples of externa… |
| GOV-0137 | may | governance | workflow-guidelines/solver-quests.md:542 [packed] | — | The archived theory ledger may be imported only as archive memory; imported archive theor… |
| GOV-0138 | may | governance | workflow-guidelines/solver-quests.md:560 [packed] | — | A configured agent executor may still use autonomous run; supervised step is the componen… |
| GOV-0139 | may | governance | workflow-guidelines/solver-quests.md:675 [packed] | — | The census is absolute and may carry inherited drift: compare its listed sites against th… |
| GOV-0140 | should | governance | workflow-guidelines/subagents.md:57 [packed] | — | Adversarial verification prompts (design vets, implementation verifiers) SHOULD include t… |
| GOV-0141 | may | governance | workflow-guidelines/solver-quests.md:1158 [packed] | — | Projected state under solve/state/ is local cache and may be rebuilt from the Quest plus … |
| GOV-0142 | should | governance | workflow-guidelines/solver-quests.md:1043 [packed] | — | Altitude (framing) reflection (altitudeReflectionDue) — the step-back that questions the … |
| GOV-0143 | should | governance | findings/2026-06-30-correctness-over-fewest-lines.md:5 [packed] | — | When choosing how to solve a problem, you SHOULD prioritize correctness and systemic, own… |
| GOV-0144 | may | governance | workflow-guidelines/solver-quests.md:1002 [packed] | — | Only overridable continuation codes are accepted: BLOCKED_THEORY and BLOCKED_SCOPE. The c… |
