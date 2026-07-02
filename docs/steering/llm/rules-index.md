# Rule index (generated — do not edit)

One line per rule in `rules.json`. To read a rule in full with its source
citations: `npm run rule -- --id <ID>` (or `--tag`, `--domain`,
`--strength`, or free-text terms). Regenerate with
`node scripts/lookup-rule.js --write-index`.

Total rules: 318

| id | strength | domain | summary |
| --- | --- | --- | --- |
| ARCH-0001 | must_not | architecture | docs/ holds documentation, never active work definition: end-user and operator-facing doc… |
| ARCH-0002 | must_not | architecture | Model choice notes are advisory only. They never replace validation, delegated review, So… |
| ARCH-0003 | must_not | architecture | If the existing owner lacks one capability, extend that owner. Do not fork a feature-loca… |
| ARCH-0004 | must_not | architecture | Callers submit intent to owners. They do not reproduce owner logic locally. |
| ARCH-0005 | must_not | architecture | Runtime logic consumes normalized state; it must not reopen raw storage, transport, boots… |
| ARCH-0006 | must_not | architecture | null and undefined MUST NOT encode runtime or domain state. Use an explicit named state v… |
| ARCH-0007 | must_not | architecture | Each concept has one name. Do not add synonyms for existing concepts. |
| ARCH-0008 | must_not | architecture | Do not introduce ordinal, segment, or grab-bag source filenames such as part-2, segment, … |
| ARCH-0009 | must_not | architecture | INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/statu… |
| ARCH-0010 | must_not | architecture | Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from… |
| ARCH-0011 | must_not | architecture | Events may enqueue owner-key work; they must not execute long-running progression inline. |
| ARCH-0012 | must_not | architecture | Phase completion removes temporary scaffolding only, never the sole live dissemination, o… |
| ARCH-0013 | must_not | architecture | Timeout budgets are canonical: nested work derives from remaining budget and never starts… |
| ARCH-0014 | must_not | architecture | Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow b… |
| ARCH-0015 | must_not | architecture | Throughput may fall under pressure; correctness must not. |
| ARCH-0016 | must_not | architecture | Operations must not fail, return incorrect results, leak memory, or silently drop work be… |
| ARCH-0017 | must_not | architecture | Callers must not discover overload only through timeout expiry. |
| ARCH-0018 | must_not | architecture | Control-plane pressure must not cause query/data-plane correctness failures. |
| ARCH-0019 | must_not | architecture | Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin… |
| ARCH-0020 | must_not | architecture | Users do not directly manage partitions, replicas, placement, leader election, message gr… |
| ARCH-0021 | must_not | architecture | Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse th… |
| ARCH-0022 | must_not | architecture | Non-forced readers do not repair authoritative state on the hot path. |
| ARCH-0023 | must_not | architecture | Steady-state correctness must not depend on phase-owned wiring after phase completion. |
| ARCH-0024 | must_not | architecture | Temporary delegators may forward to the owner, but must not add a second decision path. |
| ARCH-0025 | must_not | architecture | Reader-local caches do not memoize stale or deferred blocked answers as fresh observation… |
| ARCH-0026 | must_not | architecture | Participant executors emit outcomes and do not persist owner-managed phase transitions di… |
| ARCH-0027 | must_not | architecture | Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked ent… |
| ARCH-0028 | must_not | architecture | Do not pre-slice candidates to the requested replica count before admission. |
| ARCH-0029 | must | architecture | CDC-replicated row mutation must be primary-key addressed. |
| ARCH-0030 | must | architecture | Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling c… |
| ARCH-0031 | must | architecture | Quest validation must prove the owner path and affected tail consumers. |
| ARCH-0032 | must | architecture | Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin,… |
| ARCH-0033 | must | architecture | Before closure, perform the affected-area deep dive required by workflow-guidelines/INDEX… |
| ARCH-0034 | must | architecture | Known in-scope doctrine or system-guideline violations in the affected area must be fixed… |
| ARCH-0035 | must | architecture | Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active… |
| STYLE-0001 | must_not | style | Do not create new files with ordinal, segment, or grab-bag names such as part-2, segment,… |
| STYLE-0002 | must_not | style | Do not inline domain/runtime scalars when an owner constant or explicit state variant sho… |
| STYLE-0003 | must_not | style | Do not introduce synonyms for an existing concept. |
| STYLE-0004 | must_not | style | Do not expose semantic policy through combinable booleans when one named mode constant se… |
| STYLE-0005 | must_not | style | Do not leak raw storage or transport field shapes into runtime model names or contracts. |
| TEST-0001 | must_not | testing | When the mutation is lifecycle-related, assert both: - the initial row exists with canoni… |
| TEST-0002 | must_not | testing | Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism |
| TEST-0003 | must_not | testing | Do not comment out tests to avoid running them |
| TEST-0004 | must_not | testing | If a test is failing, fix the code or the test - do not skip it |
| TEST-0005 | must_not | testing | It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment check… |
| TEST-0006 | must_not | testing | It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only … |
| TEST-0007 | must_not | testing | It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization pat… |
| TEST-0008 | must_not | testing | It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test … |
| TEST-0009 | must_not | testing | It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. |
| TEST-0010 | must_not | testing | Do not land a test-only change that leaves a known System Guidelines violation in the cod… |
| TEST-0011 | must_not | testing | A Quest must not report SOLVED until its required validation has passed. |
| TEST-0012 | must_not | testing | Static guardrail proof is required even when focused unit and integration tests pass. Gre… |
| TEST-0013 | must_not | testing | Combine before creating - If two existing pieces almost solve the problem, combine them. … |
| TEST-0014 | must_not | testing | Do not close the second bug with only a local patch if the porous boundary remains unchan… |
| TEST-0015 | must_not | testing | Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execu… |
| TEST-0016 | must_not | testing | Do not claim SOLVED on local green proof alone while the reference scenario still fails f… |
| TEST-0017 | must_not | testing | A lever that passes its own unit DT but never moves the real observable is NOT proven; do… |
| TEST-0018 | must_not | testing | Do not ignore a failing test. A failing test indicates broken functionality and must be t… |
| TEST-0019 | must_not | testing | Do not defer the failure. When the failure is in the touched area, or was surfaced by the… |
| TEST-0020 | must_not | testing | Do not mark the bug closed just because the baseline rerun happens to pass. Closure requi… |
| TEST-0021 | must_not | testing | Treat timeouts as hard correctness failures by default. Do not raise product, harness, or… |
| ARCH-0036 | must_not | architecture | Bootstrap, join, and recovery phases must not remain the steady-state owner after the pha… |
| ARCH-0037 | must_not | architecture | During splits, moves, and leader elections, queries may be slower but must not fail becau… |
| ARCH-0038 | must | architecture | All non-trivial implementation work MUST follow the Quest workflow. |
| ARCH-0039 | must | architecture | Every state transition, lifecycle decision, data transformation, cache view, diagnostic g… |
| ARCH-0040 | must | architecture | Any runtime function or semantic concern MUST have one active path after input normalizat… |
| ARCH-0041 | must | architecture | Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner… |
| ARCH-0042 | must | architecture | The system must remain correct under contention, topology change, recovery, and control-p… |
| ARCH-0043 | must | architecture | All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps. |
| ARCH-0044 | must_not | architecture | Broad ideas must not go straight into code. |
| ARCH-0045 | must_not | architecture | Do not treat a Quest as SOLVED when only the hot path is fixed. A Quest is complete only … |
| ARCH-0046 | must_not | architecture | A phase must not tear down the only live runtime path. |
| ARCH-0047 | must_not | architecture | Pressure must not become hidden drops, memory growth without bounds, or correctness failu… |
| ARCH-0048 | must_not | architecture | Never let degraded evidence promote a blocked entity to ready or admitted. |
| GOV-0001 | must_not | governance | Roadmap corrections discovered during implementation should land with the Quest changes t… |
| GOV-0002 | must_not | governance | Do not use roadmap state to claim Quest closure. Closure requires Solver terminal evidenc… |
| STYLE-0006 | must_not | style | NEVER introduce eslint override comments. |
| STYLE-0007 | must_not | style | The root .eslintrc.json is the legacy-format file and is NOT read by the npm run lint scr… |
| TEST-0022 | must_not | testing | Do not rely on a broad scenario test alone when the bug is in a narrow system-table write… |
| TEST-0023 | must_not | testing | Production code must never contain alternate code paths, branches, or special-case logic … |
| TEST-0024 | must_not | testing | Do not reclassify a slow unit test as "integration" to dodge the hard error — move the fi… |
| TEST-0025 | must_not | testing | When a test exceeds its duration limit (2 seconds for a unit test, 30 seconds for an inte… |
| TEST-0026 | must_not | testing | Do NOT reach for unref() on awaited sleeps — that lets the process exit mid-await and has… |
| TEST-0027 | must_not | testing | A gate must never be the iteration loop: do not gate to see whether a change helped, to d… |
| TEST-0028 | must_not | testing | A test that fails because behavior regressed MUST be fixed (in the code or the test), and… |
| TEST-0029 | must_not | testing | Work must not close while the touched area remains red. |
| GOV-0003 | must_not | governance | Session/narrative state (current blocker, handoff notes, working hypotheses) stays in ext… |
| ARCH-0049 | must | architecture | Components constructed with owner dependencies must route owned behavior through those de… |
| ARCH-0050 | must | architecture | A transitional delegator must have a removal task, target owner, and structural guard pre… |
| ARCH-0051 | must | architecture | Forbidden patterns: letting a consumer select, repair, or admit from an owner stream that… |
| GOV-0004 | must_not | governance | Seal the goal. Define doneWhen before implementation begins. Do not change it after the f… |
| STYLE-0008 | must | style | New or newly edited source-code files must finish within the per-scope thresholds owned b… |
| STYLE-0009 | must | style | New source-code files must be named for the semantic responsibility they own, not for the… |
| STYLE-0010 | must | style | Shared domain literals belong in their canonical owner module and must be imported from t… |
| TEST-0030 | must | testing | The active Quest must define the required validation surface. |
| TEST-0031 | must | testing | Tests added during the change must match the Quest concern rather than an unrelated umbre… |
| TEST-0032 | must | testing | After the Quest validation surface is green, perform the required closure deep dive acros… |
| TEST-0033 | must | testing | When residual closure moves to a follow-on Quest or frontier, the original Quest must sto… |
| TEST-0034 | must | testing | New or newly edited source-code files must finish within the per-scope thresholds owned b… |
| TEST-0035 | must | testing | If a Quest touches an inherited oversized source-code file, it must extract or refactor t… |
| TEST-0036 | must | testing | The test must fail with the current code |
| TEST-0037 | must | testing | The next regression in that area must prove the reduced boundary, not only the immediate … |
| TEST-0038 | must | testing | A scenario-driven Quest that changes runtime meaning, decision meaning, or shared reporti… |
| TEST-0039 | must | testing | Pressure tests MUST respect the standard duration limits (2s unit, 30s integration). Use … |
| ARCH-0052 | must_not | architecture | Do not respond to repeated distributed failures by adding more scattered local special ca… |
| ARCH-0053 | must_not | architecture | Do not treat hot-path green tests as analysis closure while the original scenario now fai… |
| ARCH-0054 | must_not | architecture | Quests must never close from symptom movement alone (such as changed timeout durations, t… |
| ARCH-0055 | must_not | architecture | Callers do not reproduce the owner's logic locally, and callers do not keep shadow state … |
| ARCH-0056 | must_not | architecture | A new owner left running alongside the old path it was meant to replace is an unfinished … |
| ARCH-0057 | must_not | architecture | Do not keep patching symptoms while leaving the boundary porous. |
| ARCH-0058 | must_not | architecture | Do not let diagnostics views, retained owner state, bootstrap-normalized ingress state, o… |
| ARCH-0059 | must_not | architecture | Do not let old migration history or several optional delegated findings create competing … |
| ARCH-0060 | must_not | architecture | There may be multiple semantic owners, but there must not be many equivalent runtime ingr… |
| ARCH-0061 | must_not | architecture | Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime disse… |
| ARCH-0062 | must_not | architecture | Do not let observed, published, retained, cached, repaired, or fast-path variants drift i… |
| ARCH-0063 | must_not | architecture | Do not let row nullability, protocol-specific fields, or bootstrap-only shapes become sem… |
| ARCH-0064 | must_not | architecture | Do not encode semantic policy as independent booleans that callers can combine into overl… |
| ARCH-0065 | must_not | architecture | The system must not become less correct. |
| ARCH-0066 | must_not | architecture | The owner outcome must not degrade into empty collections, null-shaped absence, or timeou… |
| ARCH-0067 | must_not | architecture | Callers may consume or propagate that deferred outcome, but they must not silently reinte… |
| ARCH-0068 | must_not | architecture | Readers must not run synchronous multi-table authoritative repair inline on the hot read … |
| ARCH-0069 | must_not | architecture | Do not force readers to reconstruct progress from object existence, local booleans, times… |
| ARCH-0070 | must_not | architecture | Use ControlPlaneReadinessService as the readiness owner (node readiness and planning surf… |
| GOV-0005 | must_not | governance | docs/ holds documentation, never active work definition: user/operator-facing docs, the a… |
| GOV-0006 | must_not | governance | Tests never pin a flag (see testing-guidelines/fixtures.md "No Flag-Coupled Tests"). |
| GOV-0007 | must_not | governance | after audit passes, commit every Quest-scoped change (the Solver never pushes; see "Regul… |
| GOV-0008 | must_not | governance | They have different jobs and MUST NOT duplicate each other; duplication is how the same "… |
| GOV-0009 | must_not | governance | Override-tagged advisories are excluded from soft-first quorum counting, so an override n… |
| ARCH-0071 | must | architecture | Shared truth surfaces such as startup, readiness, admin snapshot, service discovery, and … |
| ARCH-0072 | must | architecture | Runtime shared-metadata access must cross canonical ingress owners. |
| ARCH-0073 | must | architecture | Scenario-driven Quests must prove what the original scenario does next: representative gr… |
| STYLE-0011 | must_not | style | JavaScript-language primitives are NOT domain scalars and do not need named constants: ty… |
| STYLE-0012 | must_not | style | terminalize is not a word: in NEW or newly edited identifiers, comments, commit messages,… |
| TEST-0040 | must_not | testing | A test MUST assert the real, unconditional production behavior, and MUST NEVER set, branc… |
| TEST-0041 | must_not | testing | Production feature flags are within-session scaffolds only — NO flag survives the session… |
| ARCH-0074 | must | architecture | The system may slow under pressure, but it must remain correct. |
| GOV-0010 | must_not | governance | Do not treat symptom movement as SOLVED. |
| GOV-0011 | must_not | governance | Delegated agents do not decide whether the Quest is solved. |
| GOV-0012 | must_not | governance | The worker must not report done: true as proof. |
| GOV-0013 | must_not | governance | The Solver never trusts an agent's claim that work succeeded. |
| GOV-0014 | must_not | governance | The report projection must not invent terminal status, synthetic attempts, or unmeasured … |
| ARCH-0075 | must | architecture | Query-plane traffic may use a separate ingress from metadata/control-plane traffic, but b… |
| ARCH-0076 | must | architecture | A phase-scoped bridge must either become a runtime-owned bridge or be replaced before tea… |
| ARCH-0077 | must | architecture | Completion of a phase must reduce temporary machinery, not strand it. |
| ARCH-0078 | must | architecture | Pressure must become admission, defer, reject, or coalescing signals. |
| GOV-0015 | must | governance | The Quest must cite or encode enough scope context to prevent local invention. |
| GOV-0016 | must | governance | The row must be in scope for this repository under the repo-root edition-matrix.md. |
| GOV-0017 | must | governance | Broad rows must gain a linked spec or architecture document before active implementation … |
| GOV-0018 | must | governance | The Quest must name the roadmap row, approved maintenance scope, or explicit user request… |
| STYLE-0013 | must | style | All code must be written with ESLint rules in mind from the start. |
| TEST-0042 | must | testing | Every test that exists must run and pass. |
| TEST-0043 | must | testing | Tests must exercise the real production code paths. |
| TEST-0044 | must | testing | The test suite must prove that production code works — not that a test-friendly fork of i… |
| TEST-0045 | must | testing | When adding new tests or changing existing tests for production code, you must also audit… |
| TEST-0046 | must | testing | Timeouts in control-plane logic are hard correctness bugs and must be tested as typed out… |
| TEST-0047 | must | testing | Every non-trivial Quest must prove that it did not increase architecture drift while fixi… |
| TEST-0048 | must | testing | All bug fixes MUST be preceded by a failing test that reproduces the bug. |
| TEST-0049 | must | testing | When the second correctness bug appears at the same architectural boundary in one work cy… |
| TEST-0050 | must | testing | When a bug involves component ownership, lifecycle persistence, or system-table row mutat… |
| TEST-0051 | must | testing | When a change touches shared metadata reads or writes, tests and CI checks must prove the… |
| TEST-0052 | must | testing | When a change touches control-plane progression (dispatch, rebalance, split, admission pr… |
| TEST-0053 | must | testing | When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, … |
| TEST-0054 | must | testing | When an owner path is intentionally unresolved under pressure, publication establishment,… |
| TEST-0055 | must | testing | When a Quest exists because a distributed, integration, load, or scenario failure must be… |
| TEST-0056 | must | testing | If the fixture contract was correct, the next attempt must target the runtime owner bound… |
| TEST-0057 | must | testing | A deterministic proof MUST move the real in-cluster binding observable that the doneWhen … |
| TEST-0058 | must | testing | When a delegated worker reviews a scenario Quest, it must compare current probe evidence … |
| TEST-0059 | must | testing | When a change touches startup, readiness, admin snapshot, service discovery, or another s… |
| TEST-0060 | must | testing | Tests MUST verify this property at the unit and integration layers, not only in the distr… |
| TEST-0061 | must | testing | Failures discovered in the touched area, or discovered by the test runs chosen for the cu… |
| GOV-0019 | must_not | governance | Do not move goalposts in place. |
| GOV-0020 | must_not | governance | Two legitimate Quest shapes have different closure bars; do not conflate them. |
| GOV-0021 | must_not | governance | An invalid sample is an honest no-measurement: it never counts as progress, never satisfi… |
| GOV-0022 | must_not | governance | The retry is bounded by CANNOT_MEASURE_RETRY_BUDGET: once that many consecutive samples o… |
| GOV-0023 | must_not | governance | Never treat a blocked or incomplete run as a metric floor. |
| GOV-0024 | must_not | governance | When a frontier has already parked as cannot_measure (its samples never measured), the ve… |
| GOV-0025 | must_not | governance | An exhausted park had at least one honestly-measured sample but the metric never moved — … |
| GOV-0026 | must_not | governance | A cannot_measure park had only non-measuring samples — the harness itself never produced … |
| GOV-0027 | must_not | governance | Fix the harness (or change the attempt evidence) before reopening again, so reopen and pa… |
| GOV-0028 | must_not | governance | Do not keep patching under a theory whose owner path is no longer current. |
| GOV-0029 | must_not | governance | A Quest must not accumulate an unrecoverable dirty tree. |
| GOV-0030 | must_not | governance | The Solver NEVER pushes: no subcommand, loop, or handoff runs git push (autoCommitQuest a… |
| GOV-0031 | must_not | governance | Detectors fire only on real recorded events and never touch the sealed doneWhen. |
| GOV-0032 | must | governance | A lesson that should bind future work for everyone MUST be promoted into in-repo steering… |
| GOV-0033 | must | governance | Durable operational ground truth has exactly one canonical home, operational-ground-truth… |
| GOV-0034 | must_not | governance | Do not revive sprint/package theory state as active authority. |
| GOV-0035 | must_not | governance | Parallelism MUST NOT be applied to the proof path: subagent verification before handoff, … |
| GOV-0036 | must_not | governance | If the verifier finds issues, fix them or record a finding that explains why the Quest mu… |
| GOV-0037 | must_not | governance | Do not include unrelated dirty worktree entries from another Quest. |
| GOV-0038 | must_not | governance | Do not push (see "Regular Commit (No Push)" above). |
| GOV-0039 | must_not | governance | It is a dry run by default; --commit executes the printed git add/commit for the in-scope… |
| ARCH-0079 | should | architecture | New features should strengthen tables, services, policies, and canonical execution paths … |
| GOV-0040 | must_not | governance | Such examples must not define implementation tasks in this repository unless the active Q… |
| GOV-0041 | must_not | governance | A per-frontier investigation budget (INVESTIGATION_BUDGET) caps how many distinct theorie… |
| GOV-0042 | must_not | governance | A confirmed or refuted discrimination is investigative progress only; it never satisfies … |
| GOV-0043 | must_not | governance | A guard never silently halts a run. |
| GOV-0044 | must_not | governance | The override changes the response to a recorded signal; it never mutates a detector verdi… |
| GOV-0045 | must_not | governance | Reflection is additive and reversible: it produces a recorded note and resets a cadence c… |
| GOV-0046 | must_not | governance | Advisories are read-only and never block; they fire on the same conditions the autonomous… |
| GOV-0047 | must_not | governance | Every supervisor outcome is NON-terminal: the supervisor never closes a quest, only hones… |
| GOV-0048 | must_not | governance | Do not rely on solve/state/ as durable memory. |
| ARCH-0080 | must_not | architecture | Do not begin a new local patch on the same architectural boundary while the current Quest… |
| ARCH-0081 | must_not | architecture | Use the model ledger as an advisory feedback loop for future model, reasoning-effort, and… |
| GOV-0049 | must_not | governance | Metadata is part of the diff. When you substantively change a body / decision-log (a memo… |
| ARCH-0082 | must | architecture | Scenario-driven Quests must maintain scenario causal closure across the whole chain, not … |
| ARCH-0083 | must | architecture | Every durable concern must have one semantic owner. |
| ARCH-0084 | must | architecture | Introducing a new owner is a cutover, not an addition: the prior authority for that conce… |
| ARCH-0085 | must | architecture | After repeated bugs at one boundary, the next fix must reduce the number of paths, states… |
| ARCH-0086 | must | architecture | An active Quest may have several frontiers, but each attempt must start from one selected… |
| ARCH-0087 | must | architecture | If the semantic owner, owner boundary, or next required action changes, record a finding … |
| ARCH-0088 | must | architecture | The "consumer set" and "forbidden reinterpretations" bullets above overlap by design with… |
| ARCH-0089 | must | architecture | Bootstrap, join, and recovery phases may initialize runtime mechanisms, but they must han… |
| ARCH-0090 | must | architecture | When an owner-path read or write is unresolved because pressure, authority establishment,… |
| ARCH-0091 | must | architecture | Critical convergence traffic must keep stricter admission than diagnostics, observability… |
| ARCH-0092 | must | architecture | In practice, node-state publication, membership publication, and authoritative operation … |
| GOV-0050 | must | governance | constraints[]: optional hard limits the agent must preserve. |
| GOV-0051 | must | governance | widen-scope: selected frontier theory required. |
| GOV-0052 | must | governance | model: selected frontier theory, active system theory, and --modelRef or --modelNotApplic… |
| GOV-0053 | must | governance | change-approach: selected frontier theory remains required; model evidence is not require… |
| ARCH-0093 | must_not | architecture | Do not treat this pointer as a co-equal source of architecture policy. |
| GOV-0054 | must | governance | THEORY_REQUIRED (non-terminal): the selected rung needs system or frontier theory before … |
| ARCH-0094 | must_not | architecture | The services row is the canonical example of non-overlapping field owners on one row: ide… |
| ARCH-0095 | must_not | architecture | Retry is not fallback: routing MAY retry or redirect to another live replica or a new lea… |
| GOV-0055 | must | governance | MAX_CYCLES / THEORY_REQUIRED / recoverable BLOCKED: the executor can act on these, so the… |
| ARCH-0096 | should | architecture | All service communication that should be a message goes through the MessageRouter. |
| TEST-0062 | must | testing | Existing violations in touched files must be fixed when they are part of the same semanti… |
| GOV-0056 | must | governance | Use source, test, architecture, and steering files for the implementation or documentatio… |
| GOV-0057 | must | governance | Durable conclusions must be recorded with node scripts/solve.js finding before they are r… |
| GOV-0058 | must | governance | Later attempts must use the same sealed goalposts. |
| TEST-0063 | must | testing | Slow-dependency resilience — inject artificial latency into a dependency (mock that resol… |
| GOV-0059 | must_not | governance | A building-block Quest — landing a safe mechanism validated behind a temporary lever — cl… |
| GOV-0060 | must_not | governance | Oscillation detection: returning the frontier to a previously-abandoned blocker (owner / … |
| GOV-0061 | must_not | governance | Measured promotion only: a theory is promoted exclusively by a measured post-patch eviden… |
| GOV-0062 | must_not | governance | Gradient refinement of the sealed metric: a frontier metric may be sharpened from the sca… |
| GOV-0063 | must_not | governance | Harness-not-measuring gate (rr-G): a run that did not measure the system under test — a d… |
| GOV-0064 | must_not | governance | EXHAUSTED (terminal): every frontier is parked as exhausted — each had at least one hones… |
| GOV-0065 | must_not | governance | BLOCKED (non-terminal): a recoverable precondition gate (scope pressure, regression-resto… |
| ARCH-0097 | may | architecture | A shared row may have several field owners only when the owned subsets are explicit and n… |
| ARCH-0098 | may | architecture | Collectors may gather evidence; one canonical adjudicator emits the final ready, admit, s… |
| ARCH-0099 | may | architecture | Consumers may not maintain parallel system-data caches outside the declared owner or Syst… |
| ARCH-0100 | may | architecture | For one owner key, at most one reconcile execution may be in flight. |
| ARCH-0101 | may | architecture | Internal machinery may appear in diagnostics, but not as ordinary user-facing control sur… |
| GOV-0066 | must | governance | --keep-alive is required for an autonomous agent: without it, run returns at the first NO… |
| GOV-0067 | must | governance | Work MUST be serialized only when one step's output feeds another, or when workers would … |
| GOV-0068 | must | governance | Every Quest that changes source code must spawn a subagent verifier after the final sourc… |
| GOV-0069 | must | governance | The verifier must inspect the Quest intent, touched source diff, system guidelines, and a… |
| GOV-0070 | must | governance | For any other open choice the agent MUST pick a sensible default, record a finding, and c… |
| GOV-0071 | must | governance | EXHAUST-and-pivot to a higher-altitude Quest/epic is a legitimate, encouraged outcome of … |
| STYLE-0014 | should | style | When a boundary already owns a named mode vocabulary, call sites and tests should use tha… |
| TEST-0064 | should | testing | leftover scaffolds — a flag, test-only path, or dead branch the change should have remove… |
| TEST-0065 | should | testing | The test should capture the exact failure scenario from the bug report |
| TEST-0066 | should | testing | The failure message should match the reported error |
| TEST-0067 | should | testing | The fix should make the failing test pass |
| TEST-0068 | should | testing | Is the current problem a repeated pattern? If so, is there a shared abstraction that shou… |
| ARCH-0102 | must | architecture | Every active Quest must name its residual-closure inventory before code is treated as com… |
| TEST-0069 | must | testing | When a bug depends on stale cache truth, stale routing, delayed authoritative visibility,… |
| GOV-0072 | must_not | governance | Climbing a rung is a response to a measured stall — a trustworthy observation that the cu… |
| GOV-0073 | must_not | governance | The reopen is evidence-gated: it is refused unless at least one contributing attempt re-c… |
| GOV-0074 | must_not | governance | Each auto-commit refuses when its gate is not met — the mid-quest checkpoint gate require… |
| GOV-0075 | must_not | governance | Pushing is a separate, outward-facing action — for Quest and ad-hoc work alike, a never-b… |
| GOV-0076 | must_not | governance | It runs the audit and refuses on failure, derives the in-scope set purely from the Quest'… |
| GOV-0077 | must_not | governance | The production reflection path runs only when the executor exposes a reflect() method (th… |
| GOV-0078 | must_not | governance | A supervised driver — a human, or any agent that drives the Solver through individual sub… |
| ARCH-0103 | may | architecture | Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may initialize … |
| GOV-0079 | must_not | governance | It keys ONLY on structured fields (status, probe type, oracle done, state questStatus) — … |
| TEST-0070 | should | testing | No other tests should break |
| ARCH-0104 | should | architecture | A human idea should first become either: - a sharpened roadmap item; - or a bounded Quest |
| ARCH-0105 | should | architecture | Active implementation should target one executable concern per Quest. |
| ARCH-0106 | should | architecture | Quest status should live in the Solver event log and report rather than in parallel track… |
| TEST-0071 | should | testing | All non-trivial implementation work should have validation owned by its active Quest. |
| TEST-0072 | should | testing | Runtime Quests that touch already oversized files should record whether they are adding l… |
| TEST-0073 | should | testing | These tests should be small and targeted. |
| TEST-0074 | should | testing | The review should produce candidate findings or risks; the Solver still owns terminal sta… |
| GOV-0080 | must | governance | Before the landing session ends, the flag MUST be resolved: validate the change (determin… |
| GOV-0081 | must | governance | Flags inherited from before this rule are recorded debt, not license: retire or promote e… |
| GOV-0082 | must | governance | class: "product" (default) or "process". Product goals must be MEASURED against a real ar… |
| GOV-0083 | must | governance | Regression-restore gate: once a measured run records an invariant regression, the very ne… |
| GOV-0084 | must_not | governance | Findings promoted into steering MUST be written as a normative sentence containing a reco… |
| GOV-0085 | must_not | governance | When the user asks for a plan, design, or review with no implementation-truth change requ… |
| TEST-0075 | must_not | testing | A convergence bug MUST be reproduced deterministically in-process BEFORE changing code; t… |
| TEST-0076 | must_not | testing | A convergence-bug repro MUST exercise the layer where the invariant is produced or violat… |
| GOV-0086 | must | governance | explore: open a bounded free-explore rung. A missing theory maps here: the run keeps thin… |
| TEST-0077 | may | testing | Only return to suite-local fixes after the shared runner boundary is shown stable. |
| TEST-0078 | may | testing | Only restore higher parallelism after the aggregate gate is proven stable at the new boun… |
| TEST-0079 | may | testing | Are multiple recent bugs clustering around the same boundary or component? That may indic… |
| ARCH-0107 | should | architecture | Runtime Quests that follow such a model should cite it as their scope basis and proof sur… |
| ARCH-0108 | should | architecture | Implementation work should be as explicit and bounded as the runtime design. |
| ARCH-0109 | should | architecture | Optional real sub-agents should accelerate this sequence, not replace it. |
| GOV-0087 | should | governance | Frontier theory: why the next local intervention should move the selected frontier metric. |
| GOV-0088 | should | governance | optional rulesOut text for approaches that should not be retried. |
| GOV-0089 | must | governance | The default execution posture for a non-trivial Quest is autonomous: the agent SHOULD dri… |
| GOV-0090 | must | governance | The agent MUST stop and request user input only on one of the four canonical core.md stop… |
| GOV-0091 | should | governance | The review should return findings, candidate risks, or suggested frontiers. |
| GOV-0092 | may | governance | A row may move to active implementation only when the intended behavior is sharp enough t… |
| TEST-0080 | may | testing | The two together close the loop — neither tests nor production may smuggle a flag into th… |
| TEST-0081 | may | testing | Only run the complete test suite (npm test) at: - Checkpoint tasks explicitly marked in t… |
| TEST-0082 | may | testing | System guideline §9 (Load May Slow The System, Not Break It) requires that all subsystems… |
| GOV-0093 | should | governance | It is advisory rather than terminal, but a high-severity signal should usually produce a … |
| GOV-0094 | should | governance | Reach for step only for human-paced or exploratory work — an autonomous agent should almo… |
| GOV-0095 | should | governance | Independent work within a Quest SHOULD run concurrently: batch independent reads, fan out… |
| GOV-0096 | should | governance | Broad mechanical sweeps SHOULD use the Workflow harness to pipeline the work-list. |
| GOV-0097 | must | governance | Before presenting any hypothesis, root-cause theory, or proposed lever to the operator, y… |
| GOV-0098 | must | governance | Before re-deriving an expensive analysis by hand, you MUST first sort the candidate artif… |
| GOV-0099 | should | governance | Longer work SHOULD use run --keep-alive so the loop survives those gates. |
| GOV-0100 | should | governance | In-repo steering (docs/steering/, the generated packs under docs/steering/llm/, rules.jso… |
| ARCH-0110 | may | architecture | Under load, the system may slow down, defer work, or reject new edge work with structured… |
| GOV-0101 | may | governance | terminal: reserved strictly for SOLVED and honest EXHAUSTED. An unmapped or deliberately … |
| GOV-0102 | may | governance | It is git-ignored and may be rebuilt from the Quest plus event log. |
| GOV-0103 | may | governance | One sanctioned exception: a frontier metric may be sharpened to a strictly harder gradien… |
| ARCH-0111 | should | architecture | Classification-only is a valid result only when the causal chain is still explicit, the f… |
| GOV-0104 | may | governance | When a metric does not improve but the blocker moves owner, boundary, or mechanism, the s… |
| GOV-0105 | may | governance | The archived theory ledger may be imported only as archive memory; imported archive theor… |
| GOV-0106 | may | governance | Architecture documents may mention Pro or Enterprise services only as examples of externa… |
| GOV-0107 | may | governance | Projected state under solve/state/ is local cache and may be rebuilt from the Quest plus … |
| GOV-0108 | should | governance | Altitude (framing) reflection (altitudeReflectionDue) — the step-back that questions the … |
| GOV-0109 | may | governance | Illustrative example — may be stale, not policy. The following is a concrete > worked exa… |
| GOV-0110 | may | governance | Only overridable continuation codes are accepted: BLOCKED_THEORY and BLOCKED_SCOPE. The c… |
| GOV-0111 | should | governance | When choosing how to solve a problem, you SHOULD prioritize correctness and systemic, own… |
