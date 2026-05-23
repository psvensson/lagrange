# Architecture Steering Pack

Load for bootstrap/join/rebalance/control-plane/runtime ownership and lifecycle work.

Generated rules: 107
Estimated tokens: 3674
Domains: architecture

## Rules

1. [ARCH-0001] Lightweight maintenance: use one focused package and focused proof. Do not require causal ledgers, representative reruns, or sub-agent sequencing unless runtime ownership or shared contracts can change.
2. [ARCH-0002] Package status lives in the filename: idea-, todo-, active-, done-, or superseded-. Do not create a second status system.
3. [ARCH-0003] The model ledger is advisory only for model, reasoning-effort, and output-profile choice. It never replaces validation, review sub-agents, package sequencing, closure proof, or focused commits.
4. [ARCH-0004] If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation.
5. [ARCH-0005] Callers submit intent to owners. They do not reproduce owner logic locally.
6. [ARCH-0006] Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes.
7. [ARCH-0007] null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant.
8. [ARCH-0008] Each concept has one name. Do not add synonyms for existing concepts.
9. [ARCH-0009] Do not introduce ordinal, segment, or grab-bag source filenames such as part-2, segment, misc, helpers, or utils unless that name is an established domain concept.
10. [ARCH-0010] INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/status mutation of existing system rows.
11. [ARCH-0011] Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code.
12. [ARCH-0012] Events may enqueue owner-key work; they must not execute long-running progression inline.
13. [ARCH-0013] Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path.
14. [ARCH-0014] Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget.
15. [ARCH-0015] Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions.
16. [ARCH-0016] Throughput may fall under pressure; correctness must not.
17. [ARCH-0017] Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load.
18. [ARCH-0018] Callers must not discover overload only through timeout expiry.
19. [ARCH-0019] Control-plane pressure must not cause query/data-plane correctness failures.
20. [ARCH-0020] Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses.
21. [ARCH-0021] Users do not directly manage partitions, replicas, placement, leader election, message groups, cache hydration, or rebalance workflows.
22. [ARCH-0022] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments.
23. [ARCH-0023] Non-forced readers do not repair authoritative state on the hot path.
24. [ARCH-0024] Steady-state correctness must not depend on phase-owned wiring after phase completion.
25. [ARCH-0025] Temporary delegators may forward to the owner, but must not add a second decision path.
26. [ARCH-0026] Reader-local caches do not memoize stale or deferred blocked answers as fresh observations.
27. [ARCH-0027] Participant executors emit outcomes and do not persist owner-managed phase transitions directly.
28. [ARCH-0028] Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked entity to ready or admitted.
29. [ARCH-0029] Do not pre-slice candidates to the requested replica count before admission.
30. [ARCH-0030] Read/review/doc-only: answer questions or edit explanatory docs. No work package is required unless implementation truth, roadmap status, or architecture ownership changes.
31. [ARCH-0031] CDC-replicated row mutation must be primary-key addressed.
32. [ARCH-0032] Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling created by a phase must transfer to an explicit runtime owner before the phase completes.
33. [ARCH-0033] Package validation must prove the owner path and affected tail consumers.
34. [ARCH-0034] Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin, harness, or shared test infrastructure boundaries.
35. [ARCH-0035] Before closure, perform the affected-area deep dive required by workflow-guidelines.md and testing-guidelines.md.
36. [ARCH-0036] Known in-scope doctrine or system-guideline violations in the affected area must be fixed before package closure.
37. [ARCH-0037] Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active spec or architecture note with a removal checkpoint.
38. [ARCH-0038] Bootstrap, join, and recovery phases must not remain the steady-state owner after the phase completes.
39. [ARCH-0039] During splits, moves, and leader elections, queries may be slower but must not fail because topology is transient.
40. [ARCH-0040] All non-trivial implementation work MUST follow the repository work-tracking workflow.
41. [ARCH-0041] Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource MUST have one semantic owner.
42. [ARCH-0042] Any runtime function or semantic concern MUST have one active path after input normalization.
43. [ARCH-0043] Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner outcomes or diagnostics.
44. [ARCH-0044] The system must remain correct under contention, topology change, recovery, and control-plane pressure.
45. [ARCH-0045] All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps.
46. [ARCH-0046] A phase must not tear down the only live runtime path.
47. [ARCH-0047] Pressure must not become hidden drops, memory growth without bounds, or correctness failures.
48. [ARCH-0048] Never let degraded evidence promote a blocked entity to ready or admitted.
49. [ARCH-0049] Broad ideas must not go straight into code.
50. [ARCH-0050] Do not treat a package as complete when only the hot path is fixed. A package is complete only when the hot path, tail consumers, diagnostics or reporting, deletion work, and required proof are all closed.
51. [ARCH-0051] Components constructed with owner dependencies must route owned behavior through those dependencies.
52. [ARCH-0052] A transitional delegator must have a removal task, target owner, and structural guard preventing new callers from binding to it.
53. [ARCH-0053] Forbidden patterns: letting a consumer select, repair, or admit from an owner stream that has not published the required durable handoff edge
54. [ARCH-0054] Callers do not reproduce the owner's logic locally, and callers do not keep shadow state for the same concern.
55. [ARCH-0055] There may be multiple semantic owners, but there must not be many equivalent runtime ingress paths.
56. [ARCH-0056] Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime dissemination owner.
57. [ARCH-0057] The system must not become less correct.
58. [ARCH-0058] The owner outcome must not degrade into empty collections, null-shaped absence, or timeout-only silence.
59. [ARCH-0059] Callers may consume or propagate that deferred outcome, but they must not silently reinterpret it as success, empty visibility, or unknown absence.
60. [ARCH-0060] Readers must not run synchronous multi-table authoritative repair inline on the hot read path.
61. [ARCH-0061] Do not keep patching symptoms while leaving the boundary porous.
62. [ARCH-0062] Do not respond to repeated distributed failures by adding more scattered local special cases.
63. [ARCH-0063] Do not let observed, published, retained, cached, repaired, or fast-path variants drift into several interchangeable authorities.
64. [ARCH-0064] Do not let row nullability, protocol-specific fields, or bootstrap-only shapes become semantic runtime contracts inside the system.
65. [ARCH-0065] Do not encode semantic policy as independent booleans that callers can combine into overlapping or contradictory behavior.
66. [ARCH-0066] Do not let diagnostics views, retained owner state, bootstrap-normalized ingress state, or cache-local observations drift into a second operational authority by convention.
67. [ARCH-0067] Do not force readers to reconstruct progress from object existence, local booleans, timestamps, or log strings.
68. [ARCH-0068] Do not treat hot-path green tests as analysis closure while the original scenario now fails for a different named reason.
69. [ARCH-0069] Sprints and packages must never close from symptom movement alone (such as changed timeout durations, timing offsets, or message counts); they must prove the named contract transition or owner-boundary correctness.
70. [ARCH-0070] Do not let old migration history, stale residual packages, or several sub-agents create competing active interpretations of the same blocker.
71. [ARCH-0071] Parent-session notes, local/manual labels, and arbitrary text without a real agent id do not satisfy these roles unless the user explicitly disables sub-agents for that task.
72. [ARCH-0072] Shared truth surfaces such as startup, readiness, admin snapshot, service discovery, and harness convergence must have one snapshot owner.
73. [ARCH-0073] Runtime shared-metadata access must cross canonical ingress owners.
74. [ARCH-0074] Scenario-driven packages must prove what the original scenario does next: representative green, same frontier, reduced, migrated, classification-only, architecture gap, autonomous architecture experiment, or human-only escalation for blocked/contradictory evidence.
75. [ARCH-0075] The system may slow under pressure, but it must remain correct.
76. [ARCH-0076] Query-plane traffic may use a separate ingress from metadata/control-plane traffic, but both planes must share the same pressure/admission contract.
77. [ARCH-0077] A phase-scoped bridge must either become a runtime-owned bridge or be replaced before teardown.
78. [ARCH-0078] Completion of a phase must reduce temporary machinery, not strand it.
79. [ARCH-0079] Pressure must become admission, defer, reject, or coalescing signals.
80. [ARCH-0080] New features should strengthen tables, services, policies, and canonical execution paths before introducing new user-visible concepts.
81. [ARCH-0081] Do not begin the next package on the same architectural boundary while the current package still has unresolved in-scope residuals. Either finish the residuals in the current package or split them explicitly into a new package before moving on.
82. [ARCH-0082] Use the model ledger as an advisory feedback loop for future model, reasoning-effort, and output-profile choice when a package produces useful evidence. Output profile controls final-response and handoff verbosity, not reasoning depth. It must not replace validation, review, sequencing, or closure proof.
83. [ARCH-0083] Every durable concern must have one semantic owner.
84. [ARCH-0084] Bootstrap, join, and recovery phases may initialize runtime mechanisms, but they must hand off to steady-state owners before phase completion.
85. [ARCH-0085] When an owner-path read or write is unresolved because pressure, authority establishment, or recovery completion is still in flight, the owner must emit one structured deferred outcome.
86. [ARCH-0086] Critical convergence traffic must keep stricter admission than diagnostics, observability, or broad repair.
87. [ARCH-0087] In practice, node-state publication, membership publication, and authoritative operation visibility must be allowed to keep progressing under pressure conditions that may defer snapshot repair or admin reads.
88. [ARCH-0088] After repeated bugs at one boundary, the next fix must reduce the number of paths, states, or owners that can cross it.
89. [ARCH-0089] Scenario-driven sprints and packages must maintain scenario causal closure across the whole chain, not only the current first frontier.
90. [ARCH-0090] An active sprint may have a long history, but execution must start from one current blocker snapshot.
91. [ARCH-0091] If the semantic owner, owner boundary, or next required action changes, split or activate one new representative package and make the old boundary historical.
92. [ARCH-0092] All service communication that should be a message goes through the MessageRouter.
93. [ARCH-0093] A shared row may have several field owners only when the owned subsets are explicit and non-overlapping.
94. [ARCH-0094] Collectors may gather evidence; one canonical adjudicator emits the final ready, admit, select, retryable, terminal, or blocked verdict.
95. [ARCH-0095] Consumers may not maintain parallel system-data caches outside the declared owner or SystemTableCache.
96. [ARCH-0096] For one owner key, at most one reconcile execution may be in flight.
97. [ARCH-0097] Internal machinery may appear in diagnostics, but not as ordinary user-facing control surfaces unless explicitly designed as such.
98. [ARCH-0098] Every active package must name its residual-closure inventory before code is treated as complete. At minimum that inventory must cover: - owner-path cutovers; - direct and tail consumers; - status, diagnostics, and reporting surfaces; - deletion of superseded paths or stale vocabulary; - required proof layers
99. [ARCH-0099] Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may initialize runtime mechanisms.
100. [ARCH-0100] A human idea should first become either: - a sharpened roadmap item; - or a bounded work package
101. [ARCH-0101] Active implementation should target one executable concern per work package.
102. [ARCH-0102] Work-package status should live in the filename under work/ rather than in several parallel trackers.
103. [ARCH-0103] Runtime packages that follow such a model should cite it as their scope basis and proof surface.
104. [ARCH-0104] Implementation work should be as explicit and bounded as the runtime design.
105. [ARCH-0105] Real sub-agents should accelerate this sequence, not replace it.
106. [ARCH-0106] Under load, the system may slow down, defer work, or reject new edge work with structured retry semantics.
107. [ARCH-0107] Classification-only is a valid result only when the causal chain is still explicit, the focused probe command and artifact are named, the bounded-progress proof has an observable transition and bound, and the stop condition says why no local runtime patch should continue in that package.
