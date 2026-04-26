# Architecture Steering Pack

Load for bootstrap/join/rebalance/control-plane/runtime ownership and lifecycle work.

Generated rules: 140
Estimated tokens: 4891
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
9. [ARCH-0009] Do not hide guardrail failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.
10. [ARCH-0010] No inline domain scalars. Do not write raw string, number, null, or undefined values directly in domain logic, runtime/exported structures, or semantic decisions.
11. [ARCH-0011] Absence is not state. null and undefined must not encode runtime/domain state. Use an explicit named variant instead.
12. [ARCH-0012] If a scalar or state has no clear owner, stop and define the owner first. Do not inline it “for now”.
13. [ARCH-0013] Shared contract surfaces must declare: - semantic owner; - canonical evidence inputs; - canonical state or outcome vocabulary; - allowed consumers; - forbidden reinterpretations
14. [ARCH-0014] Do not expose semantic mode through combinable boolean or tri-state option bags. If callers are choosing between policy variants, define one explicit named mode set and make invalid combinations unrepresentable.
15. [ARCH-0015] Do not introduce a second cache, snapshot, field, or helper for the same concern unless the role boundary is explicit and non-overlapping.
16. [ARCH-0016] If it exists, use it. Do not create a second version.
17. [ARCH-0017] If it exists but needs modification, modify the original. Do not fork it.
18. [ARCH-0018] If you are unsure whether something already exists, search first. Do not guess.
19. [ARCH-0019] Callers must not assemble semantic behavior by toggling combinations of booleans that route into overlapping owner behavior.
20. [ARCH-0020] INSERT OR REPLACE or full-row replacement is FORBIDDEN for steady-state lifecycle/status mutation of existing system rows.
21. [ARCH-0021] Non-forced readers MUST NOT perform synchronous multi-table authoritative repair on the hot path.
22. [ARCH-0022] Reader-local caches MUST NOT memoize stale or deferred blocked answers as if they were fresh observations.
23. [ARCH-0023] If they share a row, field subsets must be explicitly partitioned by owner and never reused across concern boundaries.
24. [ARCH-0024] Expiry/recovery sweep logic may act only on rows/fields owned by that sweep owner; it must not rewrite terminal workflow outcomes from another owner.
25. [ARCH-0025] Any status transition to terminal success must be monotonic and must not be rewritten to failure by unrelated expiry logic.
26. [ARCH-0026] Phase completion must remove only temporary scaffolding, never the sole live dissemination, observation, or admission path.
27. [ARCH-0027] Collectors fetch evidence and diagnostics, but do not emit the final admit, ready, or select verdict.
28. [ARCH-0028] Equivalent evidence may clear only the blocker classes explicitly declared by spec. Degraded or cross-plane evidence may explain or defer, but it must not upgrade a blocked entity to admitted or ready.
29. [ARCH-0029] Wire the owner from the composition root (ControlPlaneSetup, bootstrap setup, or equivalent). Do not create local replacement logic in consumers.
30. [ARCH-0030] Keep exactly one decision path for one semantic. Do not add local "owner-unavailable" alternate logic that reconstructs equivalent decisions from secondary data.
31. [ARCH-0031] Events may enqueue owner-key work, but they MUST NOT execute long-running progression inline.
32. [ARCH-0032] Broad polling loops are recovery-only tools. They MUST NOT be the steady-state primary progression mechanism.
33. [ARCH-0033] participant executors emit outcomes and do not persist owner-managed phase transitions directly
34. [ARCH-0034] cache visibility, timer age, or incidental row observation do not prove executor-owned phase completion
35. [ARCH-0035] Do not implement ad-hoc cross-owner write ordering to emulate atomicity.
36. [ARCH-0036] Do not retain sequential fallback branches for atomic topology cut points.
37. [ARCH-0037] Do not create a second workflow engine for control-plane operations when DurableWorkflowCoordinator already owns the workflow contract.
38. [ARCH-0038] A single decision path MUST NOT mix cache and SQL fallbacks for the same semantic meaning.
39. [ARCH-0039] Cache visibility MUST NOT complete an executor-owned topology phase on its own.
40. [ARCH-0040] If an existing primitive is missing one capability, extend the primitive. Do not fork the logic into a feature-local implementation.
41. [ARCH-0041] Nested operations MUST derive from remaining budget; they MUST NOT start with fresh default full budgets.
42. [ARCH-0042] Operations MUST NOT fail, return incorrect results, or silently drop work because the system is under load.
43. [ARCH-0043] Control-plane pressure (splits, rebalance, leader elections) MUST NOT cause data-plane or query-plane failures. The query path may slow down while the control plane is busy, but it must not break.
44. [ARCH-0044] Readiness, admission, and routing decisions MUST remain correct during topology transitions. Transient internal state lag (cache propagation delay, lease expiry race) MUST NOT surface as user-visible errors.
45. [ARCH-0045] Bounded retry window — query-path retries MUST be bounded by the caller's timeout budget. Do not retry indefinitely.
46. [ARCH-0046] Write-if-not-exists for creation — row creation MUST use insert-if-not-exists semantics (or equivalent) so duplicate creation attempts do not corrupt existing state.
47. [ARCH-0047] Do not create ad-hoc Maps, Sets, or objects that cache system data outside the system cache. If you need system data, read it from the cache or SQL.
48. [ARCH-0048] Do not create direct function calls between services that bypass the router for operations that should be messages.
49. [ARCH-0049] Do not add alternate fast paths for query/data-plane traffic (direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses).
50. [ARCH-0050] If performance is insufficient, optimize inside that path. Do not introduce a second non-replicated path.
51. [ARCH-0051] Do not write raw string, number, null, or undefined values directly in domain logic, runtime/exported structures, or semantic decisions.
52. [ARCH-0052] File-local named constants are allowed and required for values private to one file. Do not force private helper enums, trace labels, or internal-only scalar vocabulary into shared constants modules.
53. [ARCH-0053] null and undefined must not encode runtime/domain state. If raw external input physically arrives with those values, normalize it immediately at ingress and return an explicit variant/state instead.
54. [ARCH-0054] Test files do not need exhaustive hoisting of one-off fixture literals. Hoist repeated or semantically important suite-local values; do not force a test to turn every single literal into ceremony.
55. [ARCH-0055] If a scalar has no clear owner yet, stop and define the owner first. Do not inline it “for now”.
56. [ARCH-0056] Outside the canonical owner module, reuse the exported constant. Do not duplicate the literal under a second name.
57. [ARCH-0057] When one semantic outcome depends on multiple signals, the code must not use a bag of independent if statements.
58. [ARCH-0058] Each concept gets ONE name. Do not introduce synonyms.
59. [ARCH-0059] If the codebase calls it type, do not also call it operation or kind.
60. [ARCH-0060] If the codebase calls it nodeId, do not also accept node_id or id.
61. [ARCH-0061] Do NOT use try/catch for control flow or conditional logic.
62. [ARCH-0062] Caught errors MUST be either re-thrown or clearly logged. Never swallowed.
63. [ARCH-0063] NEVER add eslint-disable comments. Not inline, not file-level. Never.
64. [ARCH-0064] NEVER modify the ESLint configuration.
65. [ARCH-0065] Planning must not be allowed to fragment into several parallel tracking systems any more than runtime logic is.
66. [ARCH-0066] Roadmap status must not outrun current representative evidence.
67. [ARCH-0067] Users do not directly manage partitions, replicas, placement, or rebalancing.
68. [ARCH-0068] External simplicity — do not introduce unnecessary new user-visible concepts.
69. [ARCH-0069] No machinery leakage — internal mechanisms must not become accidental user-facing concepts unless explicitly designed as such.
70. [ARCH-0070] Do not generalize this exception into ad-hoc "try cache then try SQL" patterns.
71. [ARCH-0071] They must NOT maintain their own copy, shadow, or derived version of that state.
72. [ARCH-0072] It must NOT silently recreate the row inside an updater.
73. [ARCH-0073] A single persisted field MUST NOT carry multiple lifecycle semantics for different owners.
74. [ARCH-0074] Bootstrap, join, and recovery phases may initialize runtime mechanisms, but steady-state correctness must not depend on phase-owned wiring after completion.
75. [ARCH-0075] Queries may be slower but MUST NOT fail due to transient topology state.
76. [ARCH-0076] Bootstrap-only write exceptions must NOT leak into steady-state runtime paths.
77. [ARCH-0077] If owner references can refresh at runtime, route refresh through the canonical setter path (for example setRebalanceCoordinator) so child dependencies resync; do not mutate coordinator/owner fields directly.
78. [ARCH-0078] Do not introduce new user-visible entity categories unless explicitly required by the platform design.
79. [ARCH-0079] It is FORBIDDEN to expose internal implementation concepts as ordinary user-facing control surfaces unless explicitly intended by the architecture.
80. [ARCH-0080] Users may observe diagnostics about these mechanisms, but must not be required to manage them directly in ordinary workflows.
81. [ARCH-0081] Do not add APIs that require users to directly assign partitions, leaders, replicas, or rebalance targets.
82. [ARCH-0082] Do not fragment the service model into multiple incompatible conceptual categories unless explicitly designed and documented as such.
83. [ARCH-0083] Broad or scope-changing ideas MUST sharpen ../../roadmap.md before active implementation starts.
84. [ARCH-0084] In-scope bounded work MUST be executed from a work package in work/packages/.
85. [ARCH-0085] Active code changes MUST be driven by an active-... work package, unless the immediate change is the roadmap-sharpening step that creates the package.
86. [ARCH-0086] docs/ is reserved for end-user or operator-facing documentation. Internal planning and execution material MUST live under work/.
87. [ARCH-0087] Every active package must carry an explicit residual-closure inventory in the package file.
88. [ARCH-0088] If two packages must be worked in parallel on the same broad area, they must have explicitly disjoint file and owner scope, or one umbrella package must define the sequencing and completion contract for both.
89. [ARCH-0089] Package progress notes must distinguish clearly between: - landed hot-path changes; - remaining residual closures; - proof already run; - proof still required
90. [ARCH-0090] The package must name: - semantic owner; - canonical contract shape or vocabulary; - allowed consumers; - prohibited reinterpretations; - primary diagnostics and proof surfaces
91. [ARCH-0091] If the concern has several views, the package must state which view is: - operational authority; - diagnostics-only observation; - owner-internal retained state
92. [ARCH-0092] The active package must name the current dominant blocker for the scenario it is trying to close.
93. [ARCH-0093] Package progress notes must distinguish clearly between: - the blocker that was just reduced; - the blocker that now dominates; - the hypothesis for why the new blocker remained latent
94. [ARCH-0094] If the concern has several axes, the package must name the axes explicitly instead of collapsing them into one local boolean bag.
95. [ARCH-0095] Diagnostics, admin, harness, and reporting surfaces that consume that boundary must reuse the same grammar or declare a bounded view role.
96. [ARCH-0096] The ledger must distinguish: - inherited repo-wide debt outside the package boundary; - inherited debt in touched files; - new debt introduced by the package; - debt removed by the package
97. [ARCH-0097] If a guardrail fails repo-wide before work begins, the package must still run the narrowest file-scoped guard for touched files before and after the change and record both results.
98. [ARCH-0098] A sprint must name one representative gate before broad execution starts.
99. [ARCH-0099] A package must name one primary architectural boundary and one primary semantic owner.
100. [ARCH-0100] When an LLM sprint repeatedly exposes new blockers at the same boundary, the next package must reduce the boundary surface area before adding more symptom-specific behavior.
101. [ARCH-0101] Any given runtime function or semantic concern MUST have one active code path once policy has been normalized.
102. [ARCH-0102] Boundary normalization happens once at ingress. Runtime logic must consume the normalized state rather than reopening raw storage or transport shapes. at a time.
103. [ARCH-0103] A phase must not tear down the only live runtime path.
104. [ARCH-0104] Pressure must not become hidden drops, memory growth without bounds, or correctness failures.
105. [ARCH-0105] Never let degraded evidence promote a blocked entity to ready or admitted.
106. [ARCH-0106] Broad ideas must not go straight into code.
107. [ARCH-0107] Do not treat a package as complete when only the hot path is fixed. A package is complete only when the hot path, tail consumers, diagnostics or reporting, deletion work, and required proof are all closed.
108. [ARCH-0108] one declared list of forbidden reinterpretations
109. [ARCH-0109] Initial creation must write the full canonical row shape.
110. [ARCH-0110] Later lifecycle changes must use partial updates only.
111. [ARCH-0111] When cache evidence is insufficient, readers MUST consume the owner outcome directly as fresh, stale-but-usable, deferred-refresh, or failed instead of reopening broad repair locally.
112. [ARCH-0112] Background or deferred repair MUST be scheduled through the owner-held reconcile path rather than through reader-local retry loops.
113. [ARCH-0113] Forced repair, when a boundary explicitly allows it, MUST still route through the same owner and bounded budget rather than bypassing it with a second repair path.
114. [ARCH-0114] Any "is active" predicate must gate on the canonical active status set.
115. [ARCH-0115] Any sweep that expires entries must skip canonical terminal statuses.
116. [ARCH-0116] Evaluate canonical admission owner (storageAdmissionService) per candidate until the required minimum cohort is satisfiable.
117. [ARCH-0117] If a phase establishes a subscriber, bridge, queue, retry loop, or cache hydration path needed by steady state, ownership must transfer explicitly to a runtime owner before phase completion.
118. [ARCH-0118] Handoff completion must be represented by one owner transition, not inferred from phase timers or "good enough" cache visibility.
119. [ARCH-0119] Policy targets such as strict cohort size or parity must remain owned by explicit policy, not be rewritten opportunistically from the survivors of a local fallback branch.
120. [ARCH-0120] Capacity reservations or priority isolation must be expressed through the shared pressure contract, not through hidden local queues.
121. [ARCH-0121] The same spec or task list that introduces a transitional delegator must include its removal task and the target canonical owner.
122. [ARCH-0122] A structural guard (CI audit, import guard, or equivalent) must prevent new call sites from binding to the transitional path.
123. [ARCH-0123] The delegator must preserve one semantic owner. It may forward, but it may not add a second decision path.
124. [ARCH-0124] Search for phase-scoped runtime subscribers, bridges, or retry loops that remain required after phase completion.
125. [ARCH-0125] For a given owner key, there MUST be at most one reconcile execution in flight.
126. [ARCH-0126] Multiple triggers for the same concern (event, cache update, timer) MUST converge into the same reconcile queue and owner path.
127. [ARCH-0127] Step transitions MUST be persisted durably with previous step, next step, reason, and timestamp.
128. [ARCH-0128] A transition that requires atomic multi-row authoritative updates MUST commit through the shared DistributedTransactionCoordinator.
129. [ARCH-0129] Cache divergence recovery MUST re-enter the same owner-key reconcile queue rather than a direct mutation fallback path.
130. [ARCH-0130] Cache/authoritative divergence must be surfaced as typed diagnostics and invariants, not hidden by silent fallback behavior.
131. [ARCH-0131] New topology workflows and control-plane features MUST be composed from the shared primitives first.
132. [ARCH-0132] Every top-level control-plane operation MUST start with one canonical timeout budget.
133. [ARCH-0133] Control-plane owners MUST emit structured invariant results. Hard invariant breaches MUST fail deterministic test gates and remain serializable into diagnostics and harness artifacts.
134. [ARCH-0134] Bounded queues with rejection — work queues MUST have a capacity limit. When full, new work MUST be rejected with a structured reason, not silently dropped or left to time out.
135. [ARCH-0135] Retry to available replicas — when a partition leader is unavailable during a topology transition, the query router MUST retry to another replica or the new leader rather than returning a hard failure.
136. [ARCH-0136] Stale routing tolerance — the routing layer MUST tolerate briefly stale partition maps during topology changes. A query routed to a stale leader MUST be redirected, not failed.
137. [ARCH-0137] Unique operation identity — state-mutating operations MUST carry a unique identifier (operation ID, idempotency key, or equivalent) so duplicate applications can be detected.
138. [ARCH-0138] Monotonic transitions — state transitions MUST be monotonic. Replaying a transition that has already been applied MUST be a no-op, not a second mutation.
139. [ARCH-0139] Deterministic outcomes — given the same inputs and current state, an operation MUST produce the same outcome regardless of how many times it executes.
140. [ARCH-0140] All nodes must have at least one Message Group replica, but can host more to let sparse message groups form quorum.
