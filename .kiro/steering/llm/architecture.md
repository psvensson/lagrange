# Architecture Steering Pack

Load for bootstrap/join/rebalance/control-plane/runtime ownership and lifecycle work.

Generated rules: 140
Estimated tokens: 4919
Domains: architecture

## Rules

1. [ARCH-0001] Work packages MUST be one executable concern per file. Do not mix unrelated concerns into one package.
2. [ARCH-0002] Do not create a second status system in headings, directories, or sidecar trackers when the filename already carries status.
3. [ARCH-0003] Close a completed package by renaming its file from active-... to done-.... Do not create a second closure marker inside another tracker to compensate for a stale filename.
4. [ARCH-0004] If a package is not being executed yet, rename it to todo-...; do not leave dormant work in active-....
5. [ARCH-0005] Do not archive package files into a second package-status directory. Package status is carried by the filename; sprint archival is the exception used to keep the live sprint root small and readable.
6. [ARCH-0006] Do not leave known doctrine or system-guideline violations in the affected area behind as "follow-up cleanup" while still closing the package.
7. [ARCH-0007] Do not start a second active package on the same architectural boundary while the first package still has unresolved in-scope residuals.
8. [ARCH-0008] Do not close a scenario-driven package or sprint on “hot path fixed” while the original scenario still fails and the new dominant blocker is unnamed.
9. [ARCH-0009] Do not open a new package merely because a fresh artifact has a different epoch, node id set, count, timestamp, or presentation shape while the same semantic owner and boundary still dominate.
10. [ARCH-0010] Do not hide guardrail failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.
11. [ARCH-0011] Long migration history belongs below the snapshot as a ledger. It must not force readers or sub-agents to reconstruct the current blocker from old package narratives.
12. [ARCH-0012] Sub-agents may run in parallel only for independent sidecar questions with disjoint owner or file scope. They must not each chase separate interpretations of the same current blocker.
13. [ARCH-0013] Runtime edits must not start from a sub-agent until the current blocker snapshot names the canonical owner boundary and the smallest focused proof surface.
14. [ARCH-0014] No inline domain scalars. Do not write raw string, number, null, or undefined values directly in domain logic, runtime/exported structures, or semantic decisions.
15. [ARCH-0015] Absence is not state. null and undefined must not encode runtime/domain state. Use an explicit named variant instead.
16. [ARCH-0016] If a scalar or state has no clear owner, stop and define the owner first. Do not inline it “for now”.
17. [ARCH-0017] Shared contract surfaces must declare: - semantic owner; - canonical evidence inputs; - canonical state or outcome vocabulary; - allowed consumers; - forbidden reinterpretations
18. [ARCH-0018] Do not expose semantic mode through combinable boolean or tri-state option bags. If callers are choosing between policy variants, define one explicit named mode set and make invalid combinations unrepresentable.
19. [ARCH-0019] Do not introduce a second cache, snapshot, field, or helper for the same concern unless the role boundary is explicit and non-overlapping.
20. [ARCH-0020] If it exists, use it. Do not create a second version.
21. [ARCH-0021] If it exists but needs modification, modify the original. Do not fork it.
22. [ARCH-0022] If you are unsure whether something already exists, search first. Do not guess.
23. [ARCH-0023] Callers must not assemble semantic behavior by toggling combinations of booleans that route into overlapping owner behavior.
24. [ARCH-0024] INSERT OR REPLACE or full-row replacement is FORBIDDEN for steady-state lifecycle/status mutation of existing system rows.
25. [ARCH-0025] Non-forced readers MUST NOT perform synchronous multi-table authoritative repair on the hot path.
26. [ARCH-0026] Reader-local caches MUST NOT memoize stale or deferred blocked answers as if they were fresh observations.
27. [ARCH-0027] If they share a row, field subsets must be explicitly partitioned by owner and never reused across concern boundaries.
28. [ARCH-0028] Expiry/recovery sweep logic may act only on rows/fields owned by that sweep owner; it must not rewrite terminal workflow outcomes from another owner.
29. [ARCH-0029] Any status transition to terminal success must be monotonic and must not be rewritten to failure by unrelated expiry logic.
30. [ARCH-0030] Phase completion must remove only temporary scaffolding, never the sole live dissemination, observation, or admission path.
31. [ARCH-0031] Collectors fetch evidence and diagnostics, but do not emit the final admit, ready, or select verdict.
32. [ARCH-0032] Equivalent evidence may clear only the blocker classes explicitly declared by spec. Degraded or cross-plane evidence may explain or defer, but it must not upgrade a blocked entity to admitted or ready.
33. [ARCH-0033] Wire the owner from the composition root (ControlPlaneSetup, bootstrap setup, or equivalent). Do not create local replacement logic in consumers.
34. [ARCH-0034] Keep exactly one decision path for one semantic. Do not add local "owner-unavailable" alternate logic that reconstructs equivalent decisions from secondary data.
35. [ARCH-0035] Events may enqueue owner-key work, but they MUST NOT execute long-running progression inline.
36. [ARCH-0036] Broad polling loops are recovery-only tools. They MUST NOT be the steady-state primary progression mechanism.
37. [ARCH-0037] participant executors emit outcomes and do not persist owner-managed phase transitions directly
38. [ARCH-0038] cache visibility, timer age, or incidental row observation do not prove executor-owned phase completion
39. [ARCH-0039] Do not implement ad-hoc cross-owner write ordering to emulate atomicity.
40. [ARCH-0040] Do not retain sequential fallback branches for atomic topology cut points.
41. [ARCH-0041] Do not create a second workflow engine for control-plane operations when DurableWorkflowCoordinator already owns the workflow contract.
42. [ARCH-0042] A single decision path MUST NOT mix cache and SQL fallbacks for the same semantic meaning.
43. [ARCH-0043] Cache visibility MUST NOT complete an executor-owned topology phase on its own.
44. [ARCH-0044] If an existing primitive is missing one capability, extend the primitive. Do not fork the logic into a feature-local implementation.
45. [ARCH-0045] Nested operations MUST derive from remaining budget; they MUST NOT start with fresh default full budgets.
46. [ARCH-0046] Operations MUST NOT fail, return incorrect results, or silently drop work because the system is under load.
47. [ARCH-0047] Control-plane pressure (splits, rebalance, leader elections) MUST NOT cause data-plane or query-plane failures. The query path may slow down while the control plane is busy, but it must not break.
48. [ARCH-0048] Readiness, admission, and routing decisions MUST remain correct during topology transitions. Transient internal state lag (cache propagation delay, lease expiry race) MUST NOT surface as user-visible errors.
49. [ARCH-0049] Bounded retry window — query-path retries MUST be bounded by the caller's timeout budget. Do not retry indefinitely.
50. [ARCH-0050] Write-if-not-exists for creation — row creation MUST use insert-if-not-exists semantics (or equivalent) so duplicate creation attempts do not corrupt existing state.
51. [ARCH-0051] Do not create ad-hoc Maps, Sets, or objects that cache system data outside the system cache. If you need system data, read it from the cache or SQL.
52. [ARCH-0052] Do not create direct function calls between services that bypass the router for operations that should be messages.
53. [ARCH-0053] Do not add alternate fast paths for query/data-plane traffic (direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses).
54. [ARCH-0054] If performance is insufficient, optimize inside that path. Do not introduce a second non-replicated path.
55. [ARCH-0055] Do not write raw string, number, null, or undefined values directly in domain logic, runtime/exported structures, or semantic decisions.
56. [ARCH-0056] File-local named constants are allowed and required for values private to one file. Do not force private helper enums, trace labels, or internal-only scalar vocabulary into shared constants modules.
57. [ARCH-0057] null and undefined must not encode runtime/domain state. If raw external input physically arrives with those values, normalize it immediately at ingress and return an explicit variant/state instead.
58. [ARCH-0058] Test files do not need exhaustive hoisting of one-off fixture literals. Hoist repeated or semantically important suite-local values; do not force a test to turn every single literal into ceremony.
59. [ARCH-0059] If a scalar has no clear owner yet, stop and define the owner first. Do not inline it “for now”.
60. [ARCH-0060] Outside the canonical owner module, reuse the exported constant. Do not duplicate the literal under a second name.
61. [ARCH-0061] When one semantic outcome depends on multiple signals, the code must not use a bag of independent if statements.
62. [ARCH-0062] Each concept gets ONE name. Do not introduce synonyms.
63. [ARCH-0063] If the codebase calls it type, do not also call it operation or kind.
64. [ARCH-0064] If the codebase calls it nodeId, do not also accept node_id or id.
65. [ARCH-0065] Do NOT use try/catch for control flow or conditional logic.
66. [ARCH-0066] Caught errors MUST be either re-thrown or clearly logged. Never swallowed.
67. [ARCH-0067] NEVER add eslint-disable comments. Not inline, not file-level. Never.
68. [ARCH-0068] NEVER modify the ESLint configuration.
69. [ARCH-0069] Planning must not be allowed to fragment into several parallel tracking systems any more than runtime logic is.
70. [ARCH-0070] Roadmap status must not outrun current representative evidence.
71. [ARCH-0071] Users do not directly manage partitions, replicas, placement, or rebalancing.
72. [ARCH-0072] External simplicity — do not introduce unnecessary new user-visible concepts.
73. [ARCH-0073] No machinery leakage — internal mechanisms must not become accidental user-facing concepts unless explicitly designed as such.
74. [ARCH-0074] Do not generalize this exception into ad-hoc "try cache then try SQL" patterns.
75. [ARCH-0075] They must NOT maintain their own copy, shadow, or derived version of that state.
76. [ARCH-0076] It must NOT silently recreate the row inside an updater.
77. [ARCH-0077] A single persisted field MUST NOT carry multiple lifecycle semantics for different owners.
78. [ARCH-0078] Bootstrap, join, and recovery phases may initialize runtime mechanisms, but steady-state correctness must not depend on phase-owned wiring after completion.
79. [ARCH-0079] Queries may be slower but MUST NOT fail due to transient topology state.
80. [ARCH-0080] Bootstrap-only write exceptions must NOT leak into steady-state runtime paths.
81. [ARCH-0081] If owner references can refresh at runtime, route refresh through the canonical setter path (for example setRebalanceCoordinator) so child dependencies resync; do not mutate coordinator/owner fields directly.
82. [ARCH-0082] Do not introduce new user-visible entity categories unless explicitly required by the platform design.
83. [ARCH-0083] It is FORBIDDEN to expose internal implementation concepts as ordinary user-facing control surfaces unless explicitly intended by the architecture.
84. [ARCH-0084] Users may observe diagnostics about these mechanisms, but must not be required to manage them directly in ordinary workflows.
85. [ARCH-0085] Do not add APIs that require users to directly assign partitions, leaders, replicas, or rebalance targets.
86. [ARCH-0086] Do not fragment the service model into multiple incompatible conceptual categories unless explicitly designed and documented as such.
87. [ARCH-0087] Broad or scope-changing ideas MUST sharpen ../../roadmap.md before active implementation starts.
88. [ARCH-0088] In-scope bounded work MUST be executed from a work package in work/packages/.
89. [ARCH-0089] Active code changes MUST be driven by an active-... work package, unless the immediate change is the roadmap-sharpening step that creates the package.
90. [ARCH-0090] docs/ is reserved for end-user or operator-facing documentation. Internal planning and execution material MUST live under work/.
91. [ARCH-0091] Every active package must carry an explicit residual-closure inventory in the package file.
92. [ARCH-0092] If two packages must be worked in parallel on the same broad area, they must have explicitly disjoint file and owner scope, or one umbrella package must define the sequencing and completion contract for both.
93. [ARCH-0093] Package progress notes must distinguish clearly between: - landed hot-path changes; - remaining residual closures; - proof already run; - proof still required
94. [ARCH-0094] The package must name: - semantic owner; - canonical contract shape or vocabulary; - allowed consumers; - prohibited reinterpretations; - primary diagnostics and proof surfaces
95. [ARCH-0095] If the concern has several views, the package must state which view is: - operational authority; - diagnostics-only observation; - owner-internal retained state
96. [ARCH-0096] The active package must name the current dominant blocker for the scenario it is trying to close.
97. [ARCH-0097] Package progress notes must distinguish clearly between: - the blocker that was just reduced; - the blocker that now dominates; - the hypothesis for why the new blocker remained latent
98. [ARCH-0098] Open or activate a new package only when the canonical owner boundary, current semantic owner, or required next action changes materially.
99. [ARCH-0099] If the concern has several axes, the package must name the axes explicitly instead of collapsing them into one local boolean bag.
100. [ARCH-0100] Diagnostics, admin, harness, and reporting surfaces that consume that boundary must reuse the same grammar or declare a bounded view role.
101. [ARCH-0101] The ledger must distinguish: - inherited repo-wide debt outside the package boundary; - inherited debt in touched files; - new debt introduced by the package; - debt removed by the package
102. [ARCH-0102] If a guardrail fails repo-wide before work begins, the package must still run the narrowest file-scoped guard for touched files before and after the change and record both results.
103. [ARCH-0103] A sprint must name one representative gate before broad execution starts.
104. [ARCH-0104] A package must name one primary architectural boundary and one primary semantic owner.
105. [ARCH-0105] When an LLM sprint repeatedly exposes new blockers at the same boundary, the next package must reduce the boundary surface area before adding more symptom-specific behavior.
106. [ARCH-0106] A contraction package must define the smallest replayable owner-decision fixture or blocker probe before runtime behavior changes begin.
107. [ARCH-0107] Every active scenario-driven sprint must keep a compact current blocker snapshot near the top of the sprint document.
108. [ARCH-0108] A sprint continuation must start by refreshing or confirming the current blocker snapshot before runtime implementation resumes.
109. [ARCH-0109] Sub-agent work inside a sprint must be sequential at owner boundaries: first extract canonical evidence from the latest artifact, then map the owner path and smallest proof surface, then implement the bounded change.
110. [ARCH-0110] When starting or continuing package execution in a sprint, the first sub-agent task must review the most recently executed package on the same sprint or owner boundary.
111. [ARCH-0111] If that review finds actionable problems, the next sub-agent task must be a bounded fix for those problems before any new package implementation begins.
112. [ARCH-0112] A phase must not tear down the only live runtime path.
113. [ARCH-0113] Pressure must not become hidden drops, memory growth without bounds, or correctness failures.
114. [ARCH-0114] Never let degraded evidence promote a blocked entity to ready or admitted.
115. [ARCH-0115] Broad ideas must not go straight into code.
116. [ARCH-0116] Do not treat a package as complete when only the hot path is fixed. A package is complete only when the hot path, tail consumers, diagnostics or reporting, deletion work, and required proof are all closed.
117. [ARCH-0117] one declared list of forbidden reinterpretations
118. [ARCH-0118] Any given runtime function or semantic concern MUST have one active code path once policy has been normalized.
119. [ARCH-0119] Boundary normalization happens once at ingress. Runtime logic must consume the normalized state rather than reopening raw storage or transport shapes. at a time.
120. [ARCH-0120] Initial creation must write the full canonical row shape.
121. [ARCH-0121] Later lifecycle changes must use partial updates only.
122. [ARCH-0122] When cache evidence is insufficient, readers MUST consume the owner outcome directly as fresh, stale-but-usable, deferred-refresh, or failed instead of reopening broad repair locally.
123. [ARCH-0123] Background or deferred repair MUST be scheduled through the owner-held reconcile path rather than through reader-local retry loops.
124. [ARCH-0124] Forced repair, when a boundary explicitly allows it, MUST still route through the same owner and bounded budget rather than bypassing it with a second repair path.
125. [ARCH-0125] Any "is active" predicate must gate on the canonical active status set.
126. [ARCH-0126] Any sweep that expires entries must skip canonical terminal statuses.
127. [ARCH-0127] Evaluate canonical admission owner (storageAdmissionService) per candidate until the required minimum cohort is satisfiable.
128. [ARCH-0128] If a phase establishes a subscriber, bridge, queue, retry loop, or cache hydration path needed by steady state, ownership must transfer explicitly to a runtime owner before phase completion.
129. [ARCH-0129] Handoff completion must be represented by one owner transition, not inferred from phase timers or "good enough" cache visibility.
130. [ARCH-0130] Policy targets such as strict cohort size or parity must remain owned by explicit policy, not be rewritten opportunistically from the survivors of a local fallback branch.
131. [ARCH-0131] Capacity reservations or priority isolation must be expressed through the shared pressure contract, not through hidden local queues.
132. [ARCH-0132] The same spec or task list that introduces a transitional delegator must include its removal task and the target canonical owner.
133. [ARCH-0133] A structural guard (CI audit, import guard, or equivalent) must prevent new call sites from binding to the transitional path.
134. [ARCH-0134] The delegator must preserve one semantic owner. It may forward, but it may not add a second decision path.
135. [ARCH-0135] Search for phase-scoped runtime subscribers, bridges, or retry loops that remain required after phase completion.
136. [ARCH-0136] For a given owner key, there MUST be at most one reconcile execution in flight.
137. [ARCH-0137] Multiple triggers for the same concern (event, cache update, timer) MUST converge into the same reconcile queue and owner path.
138. [ARCH-0138] Step transitions MUST be persisted durably with previous step, next step, reason, and timestamp.
139. [ARCH-0139] A transition that requires atomic multi-row authoritative updates MUST commit through the shared DistributedTransactionCoordinator.
140. [ARCH-0140] Cache divergence recovery MUST re-enter the same owner-key reconcile queue rather than a direct mutation fallback path.
