# Architecture Steering Pack

Load for bootstrap/join/rebalance/control-plane/runtime ownership and lifecycle work.

Generated rules: 140
Estimated tokens: 4630
Domains: architecture

## Rules

1. [ARCH-0001] If it exists, use it. Do not create a second version.
2. [ARCH-0002] If it exists but needs modification, modify the original. Do not fork it.
3. [ARCH-0003] If you are unsure whether something already exists, search first. Do not guess.
4. [ARCH-0004] INSERT OR REPLACE or full-row replacement is FORBIDDEN for steady-state lifecycle/status mutation of existing system rows.
5. [ARCH-0005] If they share a row, field subsets must be explicitly partitioned by owner and never reused across concern boundaries.
6. [ARCH-0006] Expiry/recovery sweep logic may act only on rows/fields owned by that sweep owner; it must not rewrite terminal workflow outcomes from another owner.
7. [ARCH-0007] Any status transition to terminal success must be monotonic and must not be rewritten to failure by unrelated expiry logic.
8. [ARCH-0008] Phase completion must remove only temporary scaffolding, never the sole live dissemination, observation, or admission path.
9. [ARCH-0009] Wire the owner from the composition root (ControlPlaneSetup, bootstrap setup, or equivalent). Do not create local replacement logic in consumers.
10. [ARCH-0010] Keep exactly one decision path for one semantic. Do not add local "owner-unavailable" alternate logic that reconstructs equivalent decisions from secondary data.
11. [ARCH-0011] Events may enqueue owner-key work, but they MUST NOT execute long-running progression inline.
12. [ARCH-0012] Broad polling loops are recovery-only tools. They MUST NOT be the steady-state primary progression mechanism.
13. [ARCH-0013] Executors such as ReplicaHandler and PartitionService are participants. They emit typed acknowledgements or outcomes and MUST NOT persist owner-owned phase transitions directly.
14. [ARCH-0014] Cache visibility, timer age, or incidental row observation MUST NOT be used as proof that an executor-owned phase completed.
15. [ARCH-0015] Do not implement ad-hoc cross-owner write ordering to emulate atomicity.
16. [ARCH-0016] Do not retain sequential fallback branches for atomic topology cut points.
17. [ARCH-0017] Do not create a second workflow engine for control-plane operations when DurableWorkflowCoordinator already owns the workflow contract.
18. [ARCH-0018] A single decision path MUST NOT mix cache and SQL fallbacks for the same semantic meaning.
19. [ARCH-0019] Cache visibility MUST NOT complete an executor-owned topology phase on its own.
20. [ARCH-0020] EligibilitySnapshot One immutable decision object for readiness/admission semantics so serve, repair, split admission, and provisioning do not invent separate truth.
21. [ARCH-0021] If an existing primitive is missing one capability, extend the primitive. Do not fork the logic into a feature-local implementation.
22. [ARCH-0022] Nested operations MUST derive from remaining budget; they MUST NOT start with fresh default full budgets.
23. [ARCH-0023] Operations MUST NOT fail, return incorrect results, or silently drop work because the system is under load.
24. [ARCH-0024] Control-plane pressure (splits, rebalance, leader elections) MUST NOT cause data-plane or query-plane failures. The query path may slow down while the control plane is busy, but it must not break.
25. [ARCH-0025] Readiness, admission, and routing decisions MUST remain correct during topology transitions. Transient internal state lag (cache propagation delay, lease expiry race) MUST NOT surface as user-visible errors.
26. [ARCH-0026] Bounded retry window — query-path retries MUST be bounded by the caller's timeout budget. Do not retry indefinitely.
27. [ARCH-0027] Write-if-not-exists for creation — row creation MUST use insert-if-not-exists semantics (or equivalent) so duplicate creation attempts do not corrupt existing state.
28. [ARCH-0028] Do not create ad-hoc Maps, Sets, or objects that cache system data outside the system cache. If you need system data, read it from the cache or SQL.
29. [ARCH-0029] Do not create direct function calls between services that bypass the router for operations that should be messages.
30. [ARCH-0030] Do not add alternate fast paths for query/data-plane traffic (direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses).
31. [ARCH-0031] If performance is insufficient, optimize inside that path. Do not introduce a second non-replicated path.
32. [ARCH-0032] NEVER use string or number literals directly in code ("magic values").
33. [ARCH-0033] Test files do not need exhaustive hoisting of one-off fixture literals. Hoist repeated or semantically important suite-local values; do not force a test to turn every single literal into ceremony.
34. [ARCH-0034] Outside the canonical owner module, reuse the exported constant. Do not duplicate the literal under a second name.
35. [ARCH-0035] Do not force purely private, non-exported, file-local helper enums or trace labels into shared constants modules when they are only used inside one file.
36. [ARCH-0036] Each concept gets ONE name. Do not introduce synonyms.
37. [ARCH-0037] If the codebase calls it type, do not also call it operation or kind.
38. [ARCH-0038] If the codebase calls it nodeId, do not also accept node_id or id.
39. [ARCH-0039] Do NOT use try/catch for control flow or conditional logic.
40. [ARCH-0040] Caught errors MUST be either re-thrown or clearly logged. Never swallowed.
41. [ARCH-0041] NEVER add eslint-disable comments. Not inline, not file-level. Never.
42. [ARCH-0042] NEVER modify the ESLint configuration.
43. [ARCH-0043] Users do not directly manage partitions, replicas, placement, or rebalancing.
44. [ARCH-0044] External simplicity — do not introduce unnecessary new user-visible concepts.
45. [ARCH-0045] No machinery leakage — internal mechanisms must not become accidental user-facing concepts unless explicitly designed as such.
46. [ARCH-0046] Do not generalize this exception into ad-hoc "try cache then try SQL" patterns.
47. [ARCH-0047] They must NOT maintain their own copy, shadow, or derived version of that state.
48. [ARCH-0048] It must NOT silently recreate the row inside an updater.
49. [ARCH-0049] A single persisted field MUST NOT carry multiple lifecycle semantics for different owners.
50. [ARCH-0050] Bootstrap, join, and recovery phases may initialize runtime mechanisms, but steady-state correctness must not depend on phase-owned wiring after completion.
51. [ARCH-0051] Queries may be slower but MUST NOT fail due to transient topology state.
52. [ARCH-0052] Bootstrap-only write exceptions must NOT leak into steady-state runtime paths.
53. [ARCH-0053] If owner references can refresh at runtime, route refresh through the canonical setter path (for example setRebalanceCoordinator) so child dependencies resync; do not mutate coordinator/owner fields directly.
54. [ARCH-0054] Do not introduce new user-visible entity categories unless explicitly required by the platform design.
55. [ARCH-0055] It is FORBIDDEN to expose internal implementation concepts as ordinary user-facing control surfaces unless explicitly intended by the architecture.
56. [ARCH-0056] Users may observe diagnostics about these mechanisms, but must not be required to manage them directly in ordinary workflows.
57. [ARCH-0057] Do not add APIs that require users to directly assign partitions, leaders, replicas, or rebalance targets.
58. [ARCH-0058] Do not fragment the service model into multiple incompatible conceptual categories unless explicitly designed and documented as such.
59. [ARCH-0059] It is FORBIDDEN to:
60. [ARCH-0060] Initial creation must write the full canonical row shape.
61. [ARCH-0061] Later lifecycle changes must use partial updates only.
62. [ARCH-0062] Any "is active" predicate must gate on the canonical active status set.
63. [ARCH-0063] Any sweep that expires entries must skip canonical terminal statuses.
64. [ARCH-0064] Evaluate canonical admission owner (storageAdmissionService) per candidate until the required minimum cohort is satisfiable.
65. [ARCH-0065] If a phase establishes a subscriber, bridge, queue, retry loop, or cache hydration path needed by steady state, ownership must transfer explicitly to a runtime owner before phase completion.
66. [ARCH-0066] Handoff completion must be represented by one owner transition, not inferred from phase timers or "good enough" cache visibility.
67. [ARCH-0067] Capacity reservations or priority isolation must be expressed through the shared pressure contract, not through hidden local queues.
68. [ARCH-0068] The same spec or task list that introduces a transitional delegator must include its removal task and the target canonical owner.
69. [ARCH-0069] A structural guard (CI audit, import guard, or equivalent) must prevent new call sites from binding to the transitional path.
70. [ARCH-0070] The delegator must preserve one semantic owner. It may forward, but it may not add a second decision path.
71. [ARCH-0071] slower under pressure, never less correct
72. [ARCH-0072] A phase must not tear down the only live runtime path.
73. [ARCH-0073] Pressure must not become hidden drops, memory growth without bounds, or correctness failures.
74. [ARCH-0074] Search for phase-scoped runtime subscribers, bridges, or retry loops that remain required after phase completion.
75. [ARCH-0075] For a given owner key, there MUST be at most one reconcile execution in flight.
76. [ARCH-0076] Multiple triggers for the same concern (event, cache update, timer) MUST converge into the same reconcile queue and owner path.
77. [ARCH-0077] Step transitions MUST be persisted durably with previous step, next step, reason, and timestamp.
78. [ARCH-0078] A transition that requires atomic multi-row authoritative updates MUST commit through the shared DistributedTransactionCoordinator.
79. [ARCH-0079] Cache divergence recovery MUST re-enter the same owner-key reconcile queue rather than a direct mutation fallback path.
80. [ARCH-0080] Cache/authoritative divergence must be surfaced as typed diagnostics and invariants, not hidden by silent fallback behavior.
81. [ARCH-0081] New topology workflows and control-plane features MUST be composed from these shared primitives first.
82. [ARCH-0082] Every top-level control-plane operation MUST start with one canonical timeout budget.
83. [ARCH-0083] Control-plane owners MUST emit structured invariant results. Hard invariant breaches MUST fail deterministic test gates and remain serializable into diagnostics and harness artifacts.
84. [ARCH-0084] Bounded queues with rejection — work queues MUST have a capacity limit. When full, new work MUST be rejected with a structured reason, not silently dropped or left to time out.
85. [ARCH-0085] Retry to available replicas — when a partition leader is unavailable during a topology transition, the query router MUST retry to another replica or the new leader rather than returning a hard failure.
86. [ARCH-0086] Stale routing tolerance — the routing layer MUST tolerate briefly stale partition maps during topology changes. A query routed to a stale leader MUST be redirected, not failed.
87. [ARCH-0087] Unique operation identity — state-mutating operations MUST carry a unique identifier (operation ID, idempotency key, or equivalent) so duplicate applications can be detected.
88. [ARCH-0088] Monotonic transitions — state transitions MUST be monotonic. Replaying a transition that has already been applied MUST be a no-op, not a second mutation.
89. [ARCH-0089] Deterministic outcomes — given the same inputs and current state, an operation MUST produce the same outcome regardless of how many times it executes.
90. [ARCH-0090] All nodes must have at least one Message Group replica, but can host more to let sparse message groups form quorum.
91. [ARCH-0091] There must be NO other caches of system information. None. Zero.
92. [ARCH-0092] Any new system table MUST be classified in exactly one of CDCPROPAGATEDTABLES or CDCNONPROPAGATED_TABLES.
93. [ARCH-0093] These bypasses MUST be removed immediately after bootstrap completes.
94. [ARCH-0094] If bootstrap or join establishes a runtime CDC bridge, subscription, or propagation path, ownership must hand off explicitly to a steady-state runtime owner before phase teardown.
95. [ARCH-0095] ALL query/data-plane traffic MUST use Message Group transport.
96. [ARCH-0096] Query requests, query responses, and data-plane coordination messages MUST be sent through the owning Message Group (replicated path), not a direct best-effort path.
97. [ARCH-0097] There must be one data-plane transport path only: Message Group transport.
98. [ARCH-0098] ALL scalars must be defined as named constants in dedicated constants files and imported where needed.
99. [ARCH-0099] Required language or runtime syntax that cannot be imported from a constants module, such as a Unix shebang line, is exempt from this rule.
100. [ARCH-0100] When accessing a property, there must be exactly one way to get it.
101. [ARCH-0101] Examples of forbidden overloading:
102. [ARCH-0102] When a subsystem exposes explicit configured modes (for example grouped vs safe), the configured mode is canonical and MUST NOT be overwritten by precondition checks from a disabled mode path.
103. [ARCH-0103] Node readiness decisions MUST NOT be driven by one stale signal (for example observer-side lease expiry) when stronger live transport evidence is available.
104. [ARCH-0104] Control-plane and query-plane isolation — control-plane pressure (split, rebalance, leader election) MUST NOT starve query-plane resources. If they share execution resources, explicit priority or capacity reservation MUST prevent mutual starvation.
105. [ARCH-0105] Runtime shared-metadata writes MUST enter through the owning semantic component and the canonical runtime mutation gateway. Raw runtime writes via ad-hoc SQL helpers or direct CDC helper calls are forbidden when the gateway owner exists.
106. [ARCH-0106] Runtime shared-metadata reads for one semantic decision MUST use one declared ingress path only: either the canonical read gateway or the declared owner-fed read model. Do not mix raw cache, SQL, and helper reads for one decision path.
107. [ARCH-0107] A file-local private constant MAY be defined in the module that exclusively owns and uses it when the value is not a shared cross-file concept, public API token, schema contract, or reused domain vocabulary. Do not promote purely local helper values into global constants files just to satisfy style.
108. [ARCH-0108] Therefore, all generated code MUST preserve the following architectural intent:
109. [ARCH-0109] Every piece of logic, every state transition, every data transformation, every decision MUST have exactly ONE owning component.
110. [ARCH-0110] Before writing ANY new function, method, class, or code block, you MUST:
111. [ARCH-0111] There must be exactly ONE code path for any given operation.
112. [ARCH-0112] Other components that need that state MUST read it from the owner.
113. [ARCH-0113] If a component is constructed with an owner dependency such as replicaStateMachine, serviceLifecycleManager, failureDetector, or another explicit owner, that component MUST route the owned behavior through it.
114. [ARCH-0114] For every system-table-backed entity, exactly one component must own the row lifecycle:
115. [ARCH-0115] For shared system-table rows, field ownership must be explicit and non-overlapping.
116. [ARCH-0116] Initial row creation and subsequent lifecycle updates are different operations and MUST remain separate.
117. [ARCH-0117] If a row is expected to exist and does not, the code must either:
118. [ARCH-0118] When leader identity or group state is needed, the canonical owner row MUST be consulted before any supporting replica rows.
119. [ARCH-0119] A new raft-backed runtime service MUST be built by extending existing shared runtime owners, not by copying an older service and editing it in place.
120. [ARCH-0120] When constants define active/terminal status sets, decision logic MUST consume those sets directly.
121. [ARCH-0121] For control-plane provisioning (table bootstrap, split child provisioning, rebalance add/replace), admission decisions must be made against a candidate pool, not a pre-truncated first target.
122. [ARCH-0122] System-table mutations that flow through CDC MUST be row-addressed by canonical primary key.
123. [ARCH-0123] Runtime access to shared metadata must cross canonical ingress owners rather than raw helper calls.
124. [ARCH-0124] When more than one correctness bug appears at the same architectural boundary, the next fix must reduce the number of runtime paths through that boundary.
125. [ARCH-0125] Separate planes may keep separate ingress owners, but they must reuse the same pressure/admission contract.
126. [ARCH-0126] Every queue, buffer, subscription registry, deferred-work map, retry registry, or single-flight registry must have one owner and one bounding rule.
127. [ARCH-0127] They do not reproduce the owner's logic locally, and they do not keep shadow state for the same concern.
128. [ARCH-0128] There may be multiple semantic owners, but there must not be many equivalent runtime ingress paths.
129. [ARCH-0129] Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime dissemination owner.
130. [ARCH-0130] It must not become less correct.
131. [ARCH-0131] Do not keep patching symptoms while leaving the boundary porous.
132. [ARCH-0132] Do not respond to repeated distributed failures by adding more scattered local special cases.
133. [ARCH-0133] Control-plane concerns (dispatch, rebalance progression, split progression, admission progression) MUST execute through a deterministic owner-key reconcile path.
134. [ARCH-0134] Topology-changing operations MUST use one durable monotonic workflow contract and one transactional contract.
135. [ARCH-0135] Each decision path MUST declare exactly one canonical read model for its semantics.
136. [ARCH-0136] When control-plane logic becomes hard to reason about, the required fix is to raise the abstraction level, not to scatter more one-off line fixes across workflow code.
137. [ARCH-0137] Required building blocks for topology and control-plane work:
138. [ARCH-0138] Every subsystem MUST continue to function correctly under load.
139. [ARCH-0139] When a subsystem is overloaded, it MUST apply explicit backpressure rather than silently dropping work or letting callers time out.
140. [ARCH-0140] During partition splits, moves, or leader elections, the query path MUST remain functional.
