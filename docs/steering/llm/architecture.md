---
scope: architecture
status: compiled
always_load: false
source_of_truth: docs/steering/ (see llm-pack.config.json sources for architecture)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `docs/steering/`.

# Architecture Steering Pack

Load for bootstrap/join/rebalance/control-plane/runtime ownership and lifecycle work.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

> **Complete selectively loaded pack.** All 306 architecture master rules are included below (309 incl. cross-domain aliases; alias rows are marked in `rules-index.md`).

## Rules

### General Guidelines

1. [ARCH-0001] 1. Work Starts From One Bounded Quest — Required contract: Model choice notes are advisory only. They never replace validation, delegated review, Solver attempts, or terminal reports. _(see system-guidelines.md:106)_
2. [ARCH-0004] Forbidden: duplicate helpers, wrappers, caches, snapshots, fields, or aliases for the same semantic concern _(see system-guidelines.md:135)_
3. [ARCH-0007] Forbidden: transitional delegators without a removal task and structural guard _(see system-guidelines.md:139)_
4. [ARCH-0009] Forbidden: "try the new path, then the old path" logic _(see system-guidelines.md:160)_
5. [ARCH-0010] Forbidden: feature flags that keep two implementations alive for one semantic _(see system-guidelines.md:161)_
6. [ARCH-0015] 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: forbidden reinterpretations _(see system-guidelines.md:201)_
7. [ARCH-0023] 9. Load May Slow The System, Not Break It — Required contract: Throughput may fall under pressure; correctness must not. _(see system-guidelines.md:289)_
8. [ARCH-0024] 9. Load May Slow The System, Not Break It — Required contract: Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load. _(see system-guidelines.md:290)_
9. [ARCH-0026] 9. Load May Slow The System, Not Break It — Required contract: Control-plane pressure must not cause query/data-plane correctness failures. _(see system-guidelines.md:295)_
10. [ARCH-0027] 10. Communication Has One Replicated Data Path — Required contract: Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses. _(see system-guidelines.md:311)_
11. [ARCH-0029] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments. _(see system-guidelines.md:204)_
12. [ARCH-0030] Non-forced readers do not repair authoritative state on the hot path. _(see system-guidelines.md:232)_
13. [ARCH-0039] Forbidden patterns: recreating missing rows inside updater code _(see runtime-contracts.md:70)_
14. [ARCH-0046] Snapshot Readers And Repair — Required patterns: Reader-local caches do not memoize stale or deferred blocked answers as fresh observations. _(see runtime-contracts.md:121)_
15. [ARCH-0047] Forbidden patterns: snapshot repair consuming the same effective lane as critical convergence _(see runtime-contracts.md:138)_
16. [ARCH-0049] Forbidden patterns: reopening broad repair from readers on the same stressed path needed to finish convergence _(see runtime-contracts.md:140)_
17. [ARCH-0050] Forbidden patterns: deriving canonical leader identity from replica row iteration order _(see runtime-contracts.md:156)_
18. [ARCH-0055] Forbidden patterns: bootstrap helper paths reachable from steady-state runtime code _(see runtime-contracts.md:218)_
19. [ARCH-0056] Forbidden patterns: tearing down the only live subscriber, bridge, dissemination path, or repair route _(see runtime-contracts.md:235)_
20. [ARCH-0061] Forbidden patterns: proving the producer and consumer with separate focused tests while no replayable handoff fixture or missing-edge probe covers their interaction _(see runtime-contracts.md:263)_
21. [ARCH-0065] Forbidden patterns: sequential fallback branches for atomic topology cut points _(see runtime-contracts.md:306)_
22. [ARCH-0066] Forbidden patterns: a second control-plane workflow engine when DurableWorkflowCoordinator owns the contract _(see runtime-contracts.md:307)_
23. [ARCH-0068] Do not pre-slice candidates to the requested replica count before admission. _(see runtime-contracts.md:343)_
24. [ARCH-0069] Forbidden patterns: grouped-path diagnostics while grouped mode is disabled _(see runtime-contracts.md:362)_
25. [ARCH-0070] Forbidden patterns: status checks that bypass declared active/terminal sets _(see runtime-contracts.md:363)_
26. [ARCH-0072] Forbidden patterns: nested waits using fresh full budgets after time has already elapsed _(see runtime-contracts.md:381)_
27. [ARCH-0075] Forbidden patterns: unbounded in-flight work _(see runtime-contracts.md:405)_
28. [ARCH-0076] Forbidden patterns: hidden local priority queues outside the shared pressure contract _(see runtime-contracts.md:406)_
29. [ARCH-0078] Forbidden patterns: resource cleanup that depends on process lifetime or scenario end _(see runtime-contracts.md:408)_
30. [ARCH-0079] Forbidden patterns: direct local handler calls, ad-hoc sockets, admin forwarding, or service-to-service in-process bypasses for data-plane traffic _(see runtime-contracts.md:426)_
31. [ARCH-0080] Forbidden patterns: non-replicated fast paths for performance _(see runtime-contracts.md:428)_
32. [ARCH-0081] Forbidden patterns: hard query failure while retryable replicas exist _(see runtime-contracts.md:429)_
33. [ARCH-0082] Forbidden patterns: indefinite query queues waiting for topology transitions _(see runtime-contracts.md:430)_
34. [ARCH-0083] Forbidden patterns: receiver logic that depends on caller discipline to avoid duplicates _(see runtime-contracts.md:445)_
35. [ARCH-0084] Forbidden patterns: retryable paths that use non-idempotent counters or append-only writes without deduplication _(see runtime-contracts.md:446)_
36. [ARCH-0086] 1. Work Starts From One Bounded Quest — Required contract: Bounded implementation work runs from one Quest under solve/quests/. _(see system-guidelines.md:97)_
37. [ARCH-0088] 1. Work Starts From One Bounded Quest — Required contract: Quest progress is recorded by Solver attempts and findings, not parallel status files. _(see system-guidelines.md:100)_
38. [ARCH-0089] 1. Work Starts From One Bounded Quest — Required contract: Quest closure is SOLVED or EXHAUSTED in the Solver report. _(see system-guidelines.md:108)_
39. [ARCH-0094] 3. One Path Per Semantic Decision — Required contract: Normalize boundary input once at ingress. _(see system-guidelines.md:148)_
40. [ARCH-0095] 3. One Path Per Semantic Decision — Required contract: Semantic mode is represented by one named mode set, not by combinable booleans or tri-state option bags. _(see system-guidelines.md:151)_
41. [ARCH-0096] 3. One Path Per Semantic Decision — Required contract: Multi-signal outcomes use one evidence snapshot, one state model or decision table, and one canonical outcome with reasons. _(see system-guidelines.md:153)_
42. [ARCH-0104] 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: canonical evidence inputs _(see system-guidelines.md:198)_
43. [ARCH-0105] 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: canonical state or outcome vocabulary _(see system-guidelines.md:199)_
44. [ARCH-0106] 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: allowed consumers _(see system-guidelines.md:200)_
45. [ARCH-0115] 8. Control-Plane Work Uses Shared Primitives — Required contract: Topology-changing operations use one durable monotonic workflow contract. _(see system-guidelines.md:264)_
46. [ARCH-0116] 8. Control-Plane Work Uses Shared Primitives — Required contract: Atomic multi-row authoritative updates commit through the shared transaction coordinator. _(see system-guidelines.md:265)_
47. [ARCH-0120] 8. Control-Plane Work Uses Shared Primitives — Required contract: Runtime shared-metadata access crosses canonical read/write gateways. _(see system-guidelines.md:275)_
48. [ARCH-0122] 10. Communication Has One Replicated Data Path — Required contract: Query/data-plane traffic uses Message Group transport. _(see system-guidelines.md:310)_
49. [ARCH-0123] 10. Communication Has One Replicated Data Path — Required contract: If performance is insufficient, optimize inside the canonical transport path instead of adding a non-replicated path. _(see system-guidelines.md:314)_
50. [ARCH-0124] 11. Mutations Are Idempotent — Required contract: State-mutating operations carry unique operation identity. _(see system-guidelines.md:324)_
51. [ARCH-0125] 11. Mutations Are Idempotent — Required contract: State transitions are monotonic. _(see system-guidelines.md:325)_
52. [ARCH-0126] 11. Mutations Are Idempotent — Required contract: Row creation uses insert-if-not-exists semantics or equivalent. _(see system-guidelines.md:326)_
53. [ARCH-0127] 11. Mutations Are Idempotent — Required contract: Replaying an already-applied transition is a no-op or the same deterministic outcome, not a second mutation. _(see system-guidelines.md:327)_
54. [ARCH-0131] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active spec or architecture note with a removal checkpoint. _(see system-guidelines.md:373)_
55. [ARCH-0132] 1. Work Starts From One Bounded Quest — Required contract: docs/ holds documentation, never active work definition: end-user and operator-facing docs, the agent steering tree under docs/steering/, and internal engineering plans. Active work definition lives under solve/quests/. _(see system-guidelines.md:102)_
56. [ARCH-0135] During splits, moves, and leader elections, queries may be slower but must not fail because topology is transient. _(see runtime-contracts.md:412)_
57. [ARCH-0136] All non-trivial implementation work MUST follow the Quest workflow. _(see system-guidelines.md:92)_
58. [ARCH-0138] Any runtime function or semantic concern MUST have one active path after input normalization. _(see system-guidelines.md:143)_
59. [ARCH-0140] The system must remain correct under contention, topology change, recovery, and control-plane pressure. _(see system-guidelines.md:284)_
60. [ARCH-0141] All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps. _(see system-guidelines.md:319)_
61. [ARCH-0142] Broad ideas must not go straight into code. _(see doctrine/decision-experiments.md:87)_
62. [ARCH-0143] Do not treat a Quest as SOLVED when only the hot path is fixed. A Quest is complete only when the hot path, tail consumers, diagnostics or reporting, deletion work, and required proof are all closed. _(see doctrine/decision-experiments.md:98)_
63. [ARCH-0145] Pressure must not become hidden drops, memory growth without bounds, or correctness failures. _(see doctrine/state-encoding.md:31)_
64. [ARCH-0147] Contradictory — authoritative or equivalent signals disagree; produces reconciliation with explicit reasons, never a local exemption. _(see doctrine/state-encoding.md:104)_
65. [ARCH-0168] Runtime Shared-Metadata Gateways — Required patterns: Semantic owners submit shared-metadata writes through one canonical runtime mutation gateway. _(see runtime-contracts.md:206)_
66. [ARCH-0174] Producer Consumer Handoff Invariants — Required patterns: The producer declares its durable outcome, revision, freshness, and acknowledgement vocabulary. _(see runtime-contracts.md:248)_
67. [ARCH-0176] Producer Consumer Handoff Invariants — Required patterns: The handoff exposes one freshness, revision, or acknowledgement edge that proves the consumer is not reading pre-handoff truth. _(see runtime-contracts.md:252)_
68. [ARCH-0177] Producer Consumer Handoff Invariants — Required patterns: Diagnostics serialize both sides of the handoff and the deciding edge in one grammar. _(see runtime-contracts.md:254)_
69. [ARCH-0180] Deterministic Control-Plane Progression — Required patterns: Broad polling is recovery-only. _(see runtime-contracts.md:281)_
70. [ARCH-0181] Durable Workflow And Transaction Boundaries — Required patterns: Step transitions persist previous step, next step, reason, and timestamp. _(see runtime-contracts.md:295)_
71. [ARCH-0182] Durable Workflow And Transaction Boundaries — Required patterns: Atomic multi-row authoritative updates commit through the shared DistributedTransactionCoordinator. _(see runtime-contracts.md:296)_
72. [ARCH-0184] Durable Workflow And Transaction Boundaries — Required patterns: Existing shared workflow primitives are extended when a capability is missing. _(see runtime-contracts.md:300)_
73. [ARCH-0189] Modes And Status Taxonomy — Required patterns: Gate by configured mode first. _(see runtime-contracts.md:354)_
74. [ARCH-0190] Modes And Status Taxonomy — Required patterns: Execute only prerequisites for the active mode. _(see runtime-contracts.md:355)_
75. [ARCH-0191] Modes And Status Taxonomy — Required patterns: Publish reason codes valid for the active mode. _(see runtime-contracts.md:356)_
76. [ARCH-0192] Modes And Status Taxonomy — Required patterns: Active/terminal predicates consume canonical status sets. _(see runtime-contracts.md:357)_
77. [ARCH-0193] Modes And Status Taxonomy — Required patterns: Terminal success is monotonic and not rewritten by unrelated sweeps. _(see runtime-contracts.md:358)_
78. [ARCH-0199] Pressure, Backpressure, And Resource Lifetime — Required patterns: Queues have capacity limits and structured rejection outcomes. _(see runtime-contracts.md:391)_
79. [ARCH-0200] Pressure, Backpressure, And Resource Lifetime — Required patterns: Downstream pressure propagates upstream with queue depth, retry-after, or equivalent structured context. _(see runtime-contracts.md:392)_
80. [ARCH-0201] Pressure, Backpressure, And Resource Lifetime — Required patterns: Load is shed at ingress when accepting work would produce deep-stack failure. _(see runtime-contracts.md:394)_
81. [ARCH-0202] Pressure, Backpressure, And Resource Lifetime — Required patterns: Control-plane and query-plane paths have explicit priority or capacity isolation when they share resources. _(see runtime-contracts.md:396)_
82. [ARCH-0204] Pressure, Backpressure, And Resource Lifetime — Required patterns: Diagnostics can prove plateau under repeated join, restart, recovery, or load cycles. _(see runtime-contracts.md:400)_
83. [ARCH-0210] Idempotency — Required patterns: Use operation IDs, idempotency keys, or equivalent unique identity. _(see runtime-contracts.md:438)_
84. [ARCH-0212] Idempotency — Required patterns: Use write-if-not-exists semantics for creation. _(see runtime-contracts.md:440)_
85. [ARCH-0213] Idempotency — Required patterns: Make replayed transitions no-ops or deterministic equivalent outcomes. _(see runtime-contracts.md:441)_
86. [ARCH-0214] Do not respond to repeated distributed failures by adding more scattered local special cases. _(see doctrine/decision-experiments.md:30)_
87. [ARCH-0215] Do not treat hot-path green tests as analysis closure while the original scenario now fails for a different named reason. _(see doctrine/decision-experiments.md:134)_
88. [ARCH-0219] Do not keep patching symptoms while leaving the boundary porous. _(see doctrine/owner-boundaries.md:53)_
89. [ARCH-0221] Do not let old migration history or several optional delegated findings create competing active interpretations of the same blocker. _(see doctrine/owner-boundaries.md:91)_
90. [ARCH-0222] There may be multiple semantic owners, but there must not be many equivalent runtime ingress paths. _(see doctrine/single-path.md:17)_
91. [ARCH-0224] Do not let observed, published, retained, cached, repaired, or fast-path variants drift into several interchangeable authorities. _(see doctrine/single-path.md:55)_
92. [ARCH-0225] Do not let row nullability, protocol-specific fields, or bootstrap-only shapes become semantic runtime contracts inside the system. _(see doctrine/single-path.md:75)_
93. [ARCH-0226] Do not encode semantic policy as independent booleans that callers can combine into overlapping or contradictory behavior. _(see doctrine/single-path.md:89)_
94. [ARCH-0227] The system must not become less correct. _(see doctrine/state-encoding.md:28)_
95. [ARCH-0229] Callers may consume or propagate that deferred outcome, but they must not silently reinterpret it as success, empty visibility, or unknown absence. _(see doctrine/state-encoding.md:50)_
96. [ARCH-0230] Readers must not run synchronous multi-table authoritative repair inline on the hot read path. _(see doctrine/state-encoding.md:55)_
97. [ARCH-0231] Collectors may fetch, retry, and annotate evidence, but they do not emit the final verdict. _(see doctrine/state-encoding.md:92)_
98. [ARCH-0233] Policy targets must not be rewritten from the survivors observed during one attempt. _(see doctrine/state-encoding.md:109)_
99. [ARCH-0234] Do not force readers to reconstruct progress from object existence, local booleans, timestamps, or log strings. _(see doctrine/state-encoding.md:161)_
100. [ARCH-0235] Forbidden patterns: allowing a publication recovery producer to stall or wait on unknown publication deficits when a downstream active-gate reconcile handoff is already pending, as this introduces structural deadlocks during rolling restarts under pressure. _(see runtime-contracts.md:265)_
101. [ARCH-0239] Runtime shared-metadata access must cross canonical ingress owners. _(see runtime-contracts.md:202)_
102. [ARCH-0242] 12. User-Facing Model Stays Small — Required contract: Runtime kinds such as native JS, WebAssembly components, and OCI containers are service implementation choices, not separate ontology categories unless the architecture explicitly says otherwise. _(see system-guidelines.md:342)_
103. [ARCH-0244] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Before closure, perform the affected-area deep dive required by [workflow-guidelines/INDEX.md](workflow-guidelines/INDEX.md) and [testing-guidelines/INDEX.md](testing-guidelines/INDEX.md). _(see system-guidelines.md:362)_
104. [ARCH-0245] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Scenario-driven Quests must prove what the original scenario does next: representative green, same frontier, reduced, migrated, classification-only, architecture gap, autonomous architecture experiment, or human-only escalation for blocked/contradictory evidence. _(see system-guidelines.md:367)_
105. [ARCH-0247] The system may slow under pressure, but it must remain correct. _(see runtime-contracts.md:387)_
106. [ARCH-0248] 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: the end-to-end phases of the scenario _(see doctrine/decision-experiments.md:41)_
107. [ARCH-0249] 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: the entities and cross-entity waits that form the critical path _(see doctrine/decision-experiments.md:42)_
108. [ARCH-0250] 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: the nested budgets, retry windows, and deadlines that bound progress _(see doctrine/decision-experiments.md:43)_
109. [ARCH-0252] 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: the normalized failure classes observed in reports, diagnostics, and logs _(see doctrine/decision-experiments.md:45)_
110. [ARCH-0253] Query-plane traffic may use a separate ingress from metadata/control-plane traffic, but both planes must share the same pressure/admission contract. _(see doctrine/single-path.md:24)_
111. [ARCH-0256] Pressure must become admission, defer, reject, or coalescing signals. _(see doctrine/state-encoding.md:30)_
112. [ARCH-0257] 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canonical vocabulary for the boundary, such as: outcome or completion state _(see doctrine/state-encoding.md:44)_
113. [ARCH-0258] 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canonical vocabulary for the boundary, such as: reason code set _(see doctrine/state-encoding.md:45)_
114. [ARCH-0259] 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canonical vocabulary for the boundary, such as: bounded retry delay _(see doctrine/state-encoding.md:46)_
115. [ARCH-0262] 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, retry registry, deferred-work map, or single-flight registry must have: one capacity or bounding rule _(see doctrine/state-encoding.md:73)_
116. [ARCH-0263] 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, retry registry, deferred-work map, or single-flight registry must have: one teardown or expiry rule _(see doctrine/state-encoding.md:74)_
117. [ARCH-0264] 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, retry registry, deferred-work map, or single-flight registry must have: one diagnostic surface _(see doctrine/state-encoding.md:75)_
118. [ARCH-0265] 12. User-Facing Model Stays Small — Required contract: New features should strengthen tables, services, policies, and canonical execution paths before introducing new user-visible concepts. _(see system-guidelines.md:340)_
119. [ARCH-0267] Use the model ledger as an advisory feedback loop for future model, reasoning-effort, and output-profile choice when a Quest produces useful evidence. Output profile controls final-response and handoff verbosity, not reasoning depth. It must not replace validation, review, sequencing, or closure proof. _(see doctrine/decision-experiments.md:111)_
120. [ARCH-0268] 10. Normalize Evidence Before Adjudicating Decisions — Every input to a liveness or safety gate must be classified before use: Targets — intent: replica_count, planned placement, configured cohort sizes. A target must never gate liveness: it legitimately exceeds placed reality on single-node and degraded clusters, so a target-built gate rejects correct work. _(see doctrine/state-encoding.md:127)_
121. [ARCH-0269] 10. Normalize Evidence Before Adjudicating Decisions — Every input to a liveness or safety gate must be classified before use: Inferences — derived signals such as error-string matching or absence of a row. An inference may trigger a re-read of actuals; it must never be the witness itself. _(see doctrine/state-encoding.md:131)_
122. [ARCH-0272] After repeated bugs at one boundary, the next fix must reduce the number of paths, states, or owners that can cross it. _(see doctrine/owner-boundaries.md:52)_
123. [ARCH-0278] Critical convergence traffic must keep stricter admission than diagnostics, observability, or broad repair. _(see doctrine/state-encoding.md:61)_
124. [ARCH-0279] In practice, node-state publication, membership publication, and authoritative operation visibility must be allowed to keep progressing under pressure conditions that may defer snapshot repair or admin reads. _(see doctrine/state-encoding.md:62)_
125. [ARCH-0283] All service communication that should be a message goes through the MessageRouter. _(see system-guidelines.md:305)_
126. [ARCH-0286] 12. User-Facing Model Stays Small — Required contract: Internal machinery may appear in diagnostics, but not as ordinary user-facing control surfaces unless explicitly designed as such. _(see system-guidelines.md:338)_
127. [ARCH-0289] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: which blockers are known downstream and why they are not first frontier yet _(see doctrine/decision-experiments.md:58)_
128. [ARCH-0290] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: the missing causal edge that still needs proof _(see doctrine/decision-experiments.md:59)_
129. [ARCH-0291] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: the focused probe command and artifact path that prove the missing edge _(see doctrine/decision-experiments.md:60)_
130. [ARCH-0293] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: the expected observable transition, maximum progress bound, and same-frontier fallback for retryable or backpressure states _(see doctrine/decision-experiments.md:64)_
131. [ARCH-0294] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: when repeated crossings of the same boundary require escalation to causal analysis or architecture work _(see doctrine/decision-experiments.md:66)_
132. [ARCH-0295] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: whether the result is a runtime fix, a classification-only closure, an architecture gap, a migration, or a contradiction _(see doctrine/decision-experiments.md:68)_
133. [ARCH-0297] 10. Normalize Evidence Before Adjudicating Decisions — Every input to a liveness or safety gate must be classified before use: Actuals — observed state: a raft-observed leader, an active service row, a committed operation read back from the authority. A gate must consume actuals only. _(see doctrine/state-encoding.md:124)_
134. [ARCH-0299] Active implementation should target one executable concern per Quest. _(see doctrine/decision-experiments.md:88)_
135. [ARCH-0300] Quest status should live in the Solver event log and report rather than in parallel trackers. _(see doctrine/decision-experiments.md:89)_
136. [ARCH-0303] Implementation work should be as explicit and bounded as the runtime design. _(see doctrine/decision-experiments.md:80)_
137. [ARCH-0304] Sub-agents are optional for research, implementation, and additional attempt review; they should accelerate this sequence, not replace it. _(see doctrine/owner-boundaries.md:99)_
138. [ARCH-0308] Under load, the system may slow down, defer work, or reject new edge work with structured retry semantics. _(see doctrine/state-encoding.md:27)_
139. [ARCH-0309] Classification-only is a valid result only when the causal chain is still explicit, the focused probe command and artifact are named, the bounded-progress proof has an observable transition and bound, and the stop condition says why no local runtime patch should continue in that Quest. _(see doctrine/decision-experiments.md:71)_

### Ownership & Authority Policies

140. [ARCH-0002] 2. One Semantic Owner Per Concern — Required contract: If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation. _(see system-guidelines.md:123)_
141. [ARCH-0003] 2. One Semantic Owner Per Concern — Required contract: Callers submit intent to owners. They do not reproduce owner logic locally. _(see system-guidelines.md:125)_
142. [ARCH-0005] Forbidden: shadow state for owner-managed lifecycle or readiness _(see system-guidelines.md:137)_
143. [ARCH-0006] Forbidden: fallback paths that reconstruct owner decisions from secondary evidence _(see system-guidelines.md:138)_
144. [ARCH-0017] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: Consumers may not maintain parallel system-data caches outside the declared owner or SystemTableCache. _(see system-guidelines.md:226)_
145. [ARCH-0019] 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Events may enqueue owner-key work; they must not execute long-running progression inline. _(see system-guidelines.md:246)_
146. [ARCH-0022] 8. Control-Plane Work Uses Shared Primitives — Required contract: Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions. _(see system-guidelines.md:276)_
147. [ARCH-0032] Owner And Path Detail — Required runtime patterns: Temporary delegators may forward to the owner, but must not add a second decision path. _(see runtime-contracts.md:39)_
148. [ARCH-0033] Forbidden runtime patterns: local replacement logic when a composition-root owner is available _(see runtime-contracts.md:46)_
149. [ARCH-0034] Forbidden runtime patterns: owner-unavailable branches that reconstruct equivalent decisions _(see runtime-contracts.md:47)_
150. [ARCH-0042] Forbidden patterns: ad-hoc Maps, Sets, or objects that cache system data outside the declared owner or SystemTableCache _(see runtime-contracts.md:93)_
151. [ARCH-0043] Forbidden patterns: copying owner-managed fields from cache into unrelated write paths _(see runtime-contracts.md:95)_
152. [ARCH-0051] Forbidden patterns: treating replica rows as alternative truth when the owner row is present _(see runtime-contracts.md:157)_
153. [ARCH-0052] Forbidden patterns: collapsing owner-row mismatch and replica-role mismatch into one generic error _(see runtime-contracts.md:158)_
154. [ARCH-0053] Forbidden patterns: raw system-table mutation helper calls from runtime feature code when a gateway owner exists _(see runtime-contracts.md:215)_
155. [ARCH-0057] Forbidden patterns: hiding missing handoff ownership behind fallback reads, broad repairs, or timeout inflation _(see runtime-contracts.md:237)_
156. [ARCH-0060] Forbidden patterns: letting a consumer select, repair, or admit from an owner stream that has not published the required durable handoff edge _(see runtime-contracts.md:261)_
157. [ARCH-0062] Deterministic Control-Plane Progression — Required patterns: Events enqueue owner-key work; they do not execute long-running progression. _(see runtime-contracts.md:277)_
158. [ARCH-0063] Deterministic Control-Plane Progression — Required patterns: Participant executors emit outcomes and do not persist owner-managed phase transitions directly. _(see runtime-contracts.md:282)_
159. [ARCH-0064] Forbidden patterns: ad-hoc cross-owner write ordering to emulate atomicity _(see runtime-contracts.md:305)_
160. [ARCH-0071] Forbidden patterns: expiry sweeps that rewrite another owner's terminal workflow outcome _(see runtime-contracts.md:364)_
161. [ARCH-0087] 1. Work Starts From One Bounded Quest — Required contract: One Quest owns one sealed doneWhen, one primary owner boundary, and one focused proof surface. _(see system-guidelines.md:98)_
162. [ARCH-0090] 2. One Semantic Owner Per Concern — Required contract: Search before adding a function, helper, field, state value, cache, snapshot, queue, retry map, or decision path. _(see system-guidelines.md:120)_
163. [ARCH-0091] 2. One Semantic Owner Per Concern — Required contract: If the responsibility already exists, use the existing owner. _(see system-guidelines.md:122)_
164. [ARCH-0092] 2. One Semantic Owner Per Concern — Required contract: Injected owners are mandatory dependencies when owned behavior executes. Accepting an owner and bypassing it is an architecture violation. _(see system-guidelines.md:126)_
165. [ARCH-0093] 2. One Semantic Owner Per Concern — Required contract: Repeated bugs at one boundary require boundary reduction, not another local symptom patch. _(see system-guidelines.md:130)_
166. [ARCH-0097] 4. Scalars, State, And Naming Have Owners — Required contract: Shared domain value: import the canonical constants-owner value. _(see system-guidelines.md:172)_
167. [ARCH-0101] 4. Scalars, State, And Naming Have Owners — Required contract: If a scalar or state has no clear owner, stop and define the owner first. _(see system-guidelines.md:179)_
168. [ARCH-0102] 4. Scalars, State, And Naming Have Owners — Required contract: New source-code files use semantic names for the owner boundary, decision, contract, state model, or consumer role they own. _(see system-guidelines.md:181)_
169. [ARCH-0103] 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: semantic owner _(see system-guidelines.md:197)_
170. [ARCH-0107] 5. Shared Runtime Contracts Have One Shape — Shared contract surfaces MUST declare: operational authority versus diagnostics-only or owner-internal views _(see system-guidelines.md:202)_
171. [ARCH-0108] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: System-table row creation, lifecycle updates, and deletion route through the canonical owner for that row or field subset. _(see system-guidelines.md:217)_
172. [ARCH-0112] 7. Phase Code Must Hand Off To Runtime Owners — Required contract: For one owner key, at most one reconcile execution may be in flight. _(see system-guidelines.md:248)_
173. [ARCH-0113] 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Event, cache, and timer triggers for one concern converge into the same owner path. _(see system-guidelines.md:249)_
174. [ARCH-0117] 8. Control-Plane Work Uses Shared Primitives — Required contract: Executor-owned phase progression requires durable participant acknowledgement before the owner advances. _(see system-guidelines.md:267)_
175. [ARCH-0118] 8. Control-Plane Work Uses Shared Primitives — Required contract: Readiness, admission, placement, and cohort selection consume canonical owner snapshots and policy, not helper-local booleans. _(see system-guidelines.md:269)_
176. [ARCH-0121] 9. Load May Slow The System, Not Break It — Required contract: Backpressure is structured and explicit: bounded queues, retry/defer outcomes, rejection reasons, retry-after data, or equivalent owner outcomes. _(see system-guidelines.md:292)_
177. [ARCH-0134] Bootstrap, join, and recovery phases must not remain the steady-state owner after the phase completes. _(see runtime-contracts.md:223)_
178. [ARCH-0137] Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource MUST have one semantic owner. _(see system-guidelines.md:115)_
179. [ARCH-0139] Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner outcomes or diagnostics. _(see system-guidelines.md:231)_
180. [ARCH-0148] Owner And Path Detail — Required runtime patterns: Callers submit intent to the owner and consume the owner outcome. _(see runtime-contracts.md:34)_
181. [ARCH-0149] Owner And Path Detail — Required runtime patterns: Components constructed with owner dependencies must route owned behavior through those dependencies. _(see runtime-contracts.md:35)_
182. [ARCH-0150] Owner And Path Detail — Required runtime patterns: A transitional delegator must have a removal task, target owner, and structural guard preventing new callers from binding to it. _(see runtime-contracts.md:41)_
183. [ARCH-0153] System-Table Row Lifecycle — Required patterns: Lifecycle updates write only fields owned by that lifecycle owner. _(see runtime-contracts.md:60)_
184. [ARCH-0154] System-Table Row Lifecycle — Required patterns: Missing rows route through the canonical creation owner or fail loudly. _(see runtime-contracts.md:61)_
185. [ARCH-0157] Cache And Read Models — Required patterns: CDC-propagated metadata decisions read from the cache unless the boundary explicitly declares another owner-fed read model. _(see runtime-contracts.md:82)_
186. [ARCH-0159] Cache And Read Models — Required patterns: Cache divergence recovery re-enters the owner reconcile path. _(see runtime-contracts.md:86)_
187. [ARCH-0162] Snapshot Readers And Repair — Required patterns: Non-forced readers consume owner outcomes such as fresh, stale-but-usable, deferred-refresh, or failed. _(see runtime-contracts.md:115)_
188. [ARCH-0163] Snapshot Readers And Repair — Required patterns: Non-forced readers schedule repair through the owner reconcile path instead of doing synchronous repair on the hot path. _(see runtime-contracts.md:117)_
189. [ARCH-0164] Snapshot Readers And Repair — Required patterns: Forced repair, when allowed, still routes through the same owner and bounded budget. _(see runtime-contracts.md:119)_
190. [ARCH-0165] Canonical Owner Rows — Required precedence: partitions.leader_node_id owns partition leader identity. _(see runtime-contracts.md:149)_
191. [ARCH-0166] Canonical Owner Rows — Required precedence: message_groups.leader_node_id owns message-group leader identity. _(see runtime-contracts.md:150)_
192. [ARCH-0167] Canonical Owner Rows — Required precedence: services owns replica-only fields such as replica role, status, and address. _(see runtime-contracts.md:151)_
193. [ARCH-0169] Runtime Shared-Metadata Gateways — Required patterns: Semantic decisions use one canonical read gateway or one declared owner-fed read model. _(see runtime-contracts.md:208)_
194. [ARCH-0171] Bootstrap And Phase Handoff — Required patterns: A phase-created subscriber, bridge, queue, retry loop, cache hydration path, or repair route transfers to a runtime owner before phase completion. _(see runtime-contracts.md:228)_
195. [ARCH-0173] Bootstrap And Phase Handoff — Required patterns: Handoff completion is represented by one owner transition. _(see runtime-contracts.md:231)_
196. [ARCH-0178] Deterministic Control-Plane Progression — Required patterns: For one owner key, at most one reconcile execution is in flight. _(see runtime-contracts.md:278)_
197. [ARCH-0179] Deterministic Control-Plane Progression — Required patterns: Event, cache update, and timer triggers converge into the same reconcile queue and owner path. _(see runtime-contracts.md:279)_
198. [ARCH-0203] Pressure, Backpressure, And Resource Lifetime — Required patterns: Runtime collections have owner, bound, expiry/teardown rule, and diagnostic surface. _(see runtime-contracts.md:398)_
199. [ARCH-0216] Quests must never close from symptom movement alone (such as changed timeout durations, timing offsets, or message counts); they must prove the named contract transition or owner-boundary correctness. _(see doctrine/decision-experiments.md:137)_
200. [ARCH-0217] Callers do not reproduce the owner's logic locally, and callers do not keep shadow state for the same concern. _(see doctrine/owner-boundaries.md:24)_
201. [ARCH-0218] A new owner left running alongside the old path it was meant to replace is an unfinished cutover, not a second owner — record it as incomplete, never as done. _(see doctrine/owner-boundaries.md:28)_
202. [ARCH-0220] Do not let diagnostics views, retained owner state, bootstrap-normalized ingress state, or cache-local observations drift into a second operational authority by convention. _(see doctrine/owner-boundaries.md:68)_
203. [ARCH-0223] Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime dissemination owner. _(see doctrine/single-path.md:37)_
204. [ARCH-0228] The owner outcome must not degrade into empty collections, null-shaped absence, or timeout-only silence. _(see doctrine/state-encoding.md:38)_
205. [ARCH-0236] Use ControlPlaneReadinessService as the readiness owner (node readiness and planning surfaces). The snapshot/watch surface — control snapshot, service discovery, freshness and observation state — has a DISTINCT owner, ControlPlaneSnapshotOwner. Readiness and snapshot ownership are two separate components; do not conflate "readiness owner" with "snapshot/watch owner". _(see runtime-contracts.md:329)_
206. [ARCH-0237] 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling created by a phase must transfer to an explicit runtime owner before the phase completes. _(see system-guidelines.md:243)_
207. [ARCH-0238] Shared truth surfaces such as startup, readiness, admin snapshot, service discovery, and harness convergence must have one snapshot owner. _(see runtime-contracts.md:101)_
208. [ARCH-0241] 9. Load May Slow The System, Not Break It — Required contract: Every queue, buffer, subscription registry, deferred-work map, retry registry, or single-flight registry has one owner, one bound, one teardown rule, and diagnostics that can prove plateau. _(see system-guidelines.md:299)_
209. [ARCH-0243] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Quest validation must prove the owner path and affected tail consumers. Concretely: when a change alters the SHAPE of a boundary-crossing string (a new SQL statement variant, message payload type, log-message format matched elsewhere, or address format), enumerate every parser/matcher of that shape BEFORE landing — grep for the statement prefix regexes and startsWith classifiers. (Witnessed: an INSERT OR IGNORE variant broke one of eight SQL-text parsers and emitted '?'-placeholder garbage rows cluster-wide; a two-minute parser sweep would have caught it statically.) _(see system-guidelines.md:352)_
210. [ARCH-0246] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: If a representative blocker returns to a recently closed owner boundary, stop local patching and add or author a frontier that models the cross-boundary handoff. _(see system-guidelines.md:375)_
211. [ARCH-0260] 5. Slower Under Pressure, Never Less Correct — That deferred outcome must carry the canonical vocabulary for the boundary, such as: authority, readiness, or recovery witness that explains why the owner is still deferred _(see doctrine/state-encoding.md:47)_
212. [ARCH-0261] 7. Resource Lifetime Must Be Owned And Bounded — Every queue, buffer, subscriber set, retry registry, deferred-work map, or single-flight registry must have: one owner _(see doctrine/state-encoding.md:72)_
213. [ARCH-0270] Every durable concern must have one semantic owner. _(see doctrine/owner-boundaries.md:17)_
214. [ARCH-0271] Introducing a new owner is a cutover, not an addition: the prior authority for that concern must be retired in the same body of work. _(see doctrine/owner-boundaries.md:27)_
215. [ARCH-0273] An active Quest may have several frontiers, but each attempt must start from one selected frontier and one semantic owner boundary. _(see doctrine/owner-boundaries.md:80)_
216. [ARCH-0274] If the semantic owner, owner boundary, or next required action changes, record a finding and add or author the frontier that owns the new boundary. _(see doctrine/owner-boundaries.md:94)_
217. [ARCH-0275] The "consumer set" and "forbidden reinterpretations" bullets above overlap by design with owner-boundaries §14 ("Shared Surfaces Must Name Consumers", see [owner-boundaries.md](owner-boundaries.md)). _(see doctrine/single-path.md:58)_
218. [ARCH-0277] When an owner-path read or write is unresolved because pressure, authority establishment, or recovery completion is still in flight, the owner must emit one structured deferred outcome. _(see doctrine/state-encoding.md:36)_
219. [ARCH-0280] State names are boundary-specific but must distinguish static exclusion, missing discovery or owner proof, equivalent-confirmation wait, admission, reconciliation, and hard rejection. _(see doctrine/state-encoding.md:115)_
220. [ARCH-0282] Retry is not fallback: routing MAY retry or redirect to another live replica or a new leader within the caller budget (for example QueryExecutorWriteRetryRouting); it MUST NOT reconstruct an owner decision from secondary evidence when the owner is unavailable. _(see runtime-contracts.md:195)_
221. [ARCH-0284] 2. One Semantic Owner Per Concern — Required contract: A shared row may have several field owners only when the owned subsets are explicit and non-overlapping. _(see system-guidelines.md:128)_
222. [ARCH-0287] 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: the stop conditions for continuing local fixes, migrating owner boundary, widening architecture work, or stopping for human direction _(see doctrine/decision-experiments.md:46)_
223. [ARCH-0296] Every active Quest must name its residual-closure inventory before code is treated as complete. At minimum that inventory must cover: - owner-path cutovers; - direct and tail consumers; - status, diagnostics, and reporting surfaces; - deletion of superseded paths or stale vocabulary; - required proof layers _(see doctrine/decision-experiments.md:91)_
224. [ARCH-0301] Owner And Path Detail — Required runtime patterns: A shared row may have multiple owners only when field subsets are explicit and non-overlapping. _(see runtime-contracts.md:37)_
225. [ARCH-0305] Authoritative — owned by the same semantic owner and plane; may directly admit or reject. _(see doctrine/state-encoding.md:98)_
226. [ARCH-0306] Equivalent — another access path to the same owner and plane; may confirm or refute only the equivalence declared by the governing contract. _(see doctrine/state-encoding.md:100)_

### Lifecycle & State Machine Rules

227. [ARCH-0012] Forbidden: bags of independent if statements around readiness, admission, retry, phase, lifecycle, or outcome classification _(see system-guidelines.md:163)_
228. [ARCH-0016] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/status mutation of existing system rows. _(see system-guidelines.md:221)_
229. [ARCH-0018] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code. _(see system-guidelines.md:228)_
230. [ARCH-0020] 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path. _(see system-guidelines.md:253)_
231. [ARCH-0031] Steady-state correctness must not depend on phase-owned wiring after phase completion. _(see system-guidelines.md:238)_
232. [ARCH-0036] Forbidden runtime patterns: shadow state for lifecycle, readiness, admission, leader, or routing truth _(see runtime-contracts.md:49)_
233. [ARCH-0037] Forbidden patterns: INSERT OR REPLACE for steady-state lifecycle/status updates _(see runtime-contracts.md:68)_
234. [ARCH-0038] Forbidden patterns: full-row replacement for existing lifecycle rows _(see runtime-contracts.md:69)_
235. [ARCH-0041] Forbidden patterns: one persisted field carrying unrelated claim, lease, workflow, and entity lifecycle semantics _(see runtime-contracts.md:72)_
236. [ARCH-0109] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: Initial row creation writes the full canonical row shape. Later lifecycle changes use partial updates only. _(see system-guidelines.md:219)_
237. [ARCH-0114] 7. Phase Code Must Hand Off To Runtime Owners — Required contract: Broad polling loops are recovery tools only, not steady-state primary progression. _(see system-guidelines.md:251)_
238. [ARCH-0144] A phase must not tear down the only live runtime path. _(see doctrine/state-encoding.md:20)_
239. [ARCH-0151] System-Table Row Lifecycle — Required patterns: Initial creation writes the full canonical row shape. _(see runtime-contracts.md:58)_
240. [ARCH-0152] System-Table Row Lifecycle — Required patterns: Later lifecycle changes use partial updates only. _(see runtime-contracts.md:59)_
241. [ARCH-0155] System-Table Row Lifecycle — Required patterns: CDC-replicated row mutations are addressed by canonical primary key. _(see runtime-contracts.md:62)_
242. [ARCH-0156] System-Table Row Lifecycle — Required patterns: Multi-row transitions either transition rows one by one by primary key or use an explicit transaction wrapper that preserves row identity. _(see runtime-contracts.md:63)_
243. [ARCH-0170] Runtime Shared-Metadata Gateways — Required patterns: Bootstrap-only shortcuts remain phase-scoped and unreachable from steady-state runtime code. _(see runtime-contracts.md:210)_
244. [ARCH-0172] Bootstrap And Phase Handoff — Required patterns: Phase completion removes temporary scaffolding only. _(see runtime-contracts.md:230)_
245. [ARCH-0183] Durable Workflow And Transaction Boundaries — Required patterns: Executor-owned phase progression waits for durable participant acknowledgement. _(see runtime-contracts.md:298)_
246. [ARCH-0211] Idempotency — Required patterns: Make lifecycle transitions monotonic. _(see runtime-contracts.md:439)_
247. [ARCH-0251] 9. Escalate Repeated Scenario Failures Into Causal Analysis — A causal model must name: the invariants that must hold at each phase boundary _(see doctrine/decision-experiments.md:44)_
248. [ARCH-0254] A phase-scoped bridge must either become a runtime-owned bridge or be replaced before teardown. _(see doctrine/state-encoding.md:21)_
249. [ARCH-0255] Completion of a phase must reduce temporary machinery, not strand it. _(see doctrine/state-encoding.md:23)_
250. [ARCH-0276] Bootstrap, join, and recovery phases may initialize runtime mechanisms, but they must hand off to steady-state owners before phase completion. _(see doctrine/state-encoding.md:17)_
251. [ARCH-0281] The services row is the canonical example of non-overlapping field owners on one row: identity, lifecycle (ReplicaStateMachine), and raft_role (PartitionService / MessageGroupService) are written by different components on disjoint field subsets — permitted precisely because the subsets do not overlap. _(see runtime-contracts.md:190)_
252. [ARCH-0288] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: the full phase chain from the scenario/probe through the current first frontier _(see doctrine/decision-experiments.md:56)_

### Readiness & Health Contracts

253. [ARCH-0059] Forbidden patterns: treating producer publication and consumer readiness as independently fixed when representative evidence alternates between them _(see runtime-contracts.md:259)_
254. [ARCH-0067] Admission, Readiness, And Multi-Signal Decisions — Required patterns: Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked entity to ready or admitted. _(see runtime-contracts.md:324)_
255. [ARCH-0146] Degraded — weaker, indirect, or cross-plane; may explain, defer, or improve diagnostics, but must not promote a blocked entity to ready. _(see doctrine/state-encoding.md:102)_
256. [ARCH-0175] Producer Consumer Handoff Invariants — Required patterns: The consumer declares the precondition that makes the producer outcome admissible for selection, activation, repair, readiness, or publication. _(see runtime-contracts.md:250)_
257. [ARCH-0185] Admission, Readiness, And Multi-Signal Decisions — Required patterns: Collectors fetch evidence and diagnostics. _(see runtime-contracts.md:317)_
258. [ARCH-0186] Admission, Readiness, And Multi-Signal Decisions — Required patterns: One normalized per-entity snapshot records authoritative, equivalent, and degraded evidence. _(see runtime-contracts.md:318)_
259. [ARCH-0187] Admission, Readiness, And Multi-Signal Decisions — Required patterns: One canonical adjudicator derives final state, verdict, retryability, and reason codes. _(see runtime-contracts.md:320)_
260. [ARCH-0188] Admission, Readiness, And Multi-Signal Decisions — Required patterns: Equivalent evidence clears only the blocker classes declared equivalent by spec. _(see runtime-contracts.md:322)_
261. [ARCH-0285] 3. One Path Per Semantic Decision — Required contract: Collectors may gather evidence; one canonical adjudicator emits the final ready, admit, select, retryable, terminal, or blocked verdict. _(see system-guidelines.md:155)_
262. [ARCH-0298] Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may initialize runtime mechanisms. _(see system-guidelines.md:237)_

### Change Data Capture (CDC) Policies

263. [ARCH-0040] Forbidden patterns: broad UPDATE or DELETE statements as the primary CDC mutation path _(see runtime-contracts.md:71)_
264. [ARCH-0110] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: CDC-replicated row mutation must be primary-key addressed. _(see system-guidelines.md:223)_
265. [ARCH-0161] Cache And Read Models — Required patterns: New system tables are classified in exactly one of CDC_PROPAGATED_TABLES or CDC_NON_PROPAGATED_TABLES. _(see runtime-contracts.md:88)_

### Caching & Observation Rules

266. [ARCH-0008] 3. One Path Per Semantic Decision — Required contract: Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes. _(see system-guidelines.md:149)_
267. [ARCH-0011] Forbidden: decision branches that mix cache and SQL as equivalent truth for one meaning _(see system-guidelines.md:162)_
268. [ARCH-0028] 12. User-Facing Model Stays Small — Required contract: Users do not directly manage partitions, replicas, placement, leader election, message groups, cache hydration, or rebalance workflows. _(see system-guidelines.md:336)_
269. [ARCH-0035] Forbidden runtime patterns: feature-local implementations of existing cache/read/write/retry primitives _(see runtime-contracts.md:48)_
270. [ARCH-0044] Forbidden patterns: completing executor-owned topology phases from cache visibility alone _(see runtime-contracts.md:96)_
271. [ARCH-0045] Forbidden patterns: mixing cache and SQL fallbacks inside one semantic decision path _(see runtime-contracts.md:97)_
272. [ARCH-0048] Forbidden patterns: treating mild pressure as permission to publish cache-only emptiness _(see runtime-contracts.md:139)_
273. [ARCH-0054] Forbidden patterns: second runtime read ingress with equivalent cache/SQL decisions _(see runtime-contracts.md:217)_
274. [ARCH-0058] Forbidden patterns: inferring handoff from elapsed time or "good enough" cache visibility _(see runtime-contracts.md:239)_
275. [ARCH-0111] 6. Tables, Cache, And Metadata Follow One Authority Chain — Required contract: SystemTableCache is a read model, not an authoritative reconstruction source. _(see system-guidelines.md:224)_
276. [ARCH-0158] Cache And Read Models — Required patterns: SQL reads for equivalent semantics are limited to authoritative writes, explicit recovery sweeps, and diagnostics reconciliation. _(see runtime-contracts.md:84)_
277. [ARCH-0160] Cache And Read Models — Required patterns: Cache/authoritative divergence is surfaced as typed diagnostics. _(see runtime-contracts.md:87)_

### Routing & Message Dissemination

278. [ARCH-0205] Query Routing And Transport — Required patterns: Retry or redirect to available replicas or new leaders when possible. _(see runtime-contracts.md:417)_
279. [ARCH-0206] Query Routing And Transport — Required patterns: Return structured retryable outcomes when no replica can serve within the caller budget. _(see runtime-contracts.md:418)_
280. [ARCH-0207] Query Routing And Transport — Required patterns: Bound retries by the caller timeout budget. _(see runtime-contracts.md:420)_
281. [ARCH-0208] Query Routing And Transport — Required patterns: Tolerate briefly stale partition maps. _(see runtime-contracts.md:421)_
282. [ARCH-0209] Query Routing And Transport — Required patterns: Route query/data-plane traffic through Message Group transport. _(see runtime-contracts.md:422)_
283. [ARCH-0240] 9. Load May Slow The System, Not Break It — Required contract: Query routing during topology transitions retries, redirects, or returns a structured retryable outcome within the caller budget; it does not return a hard failure while retryable replicas or leaders exist. _(see system-guidelines.md:296)_

### Timeouts & Budget Management

284. [ARCH-0021] 8. Control-Plane Work Uses Shared Primitives — Required contract: Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget. _(see system-guidelines.md:271)_
285. [ARCH-0025] 9. Load May Slow The System, Not Break It — Required contract: Callers must not discover overload only through timeout expiry. _(see system-guidelines.md:294)_
286. [ARCH-0073] Forbidden patterns: generic timeout strings for semantic control-plane outcomes _(see runtime-contracts.md:382)_
287. [ARCH-0074] Forbidden patterns: treating routine timeout under moderate load as operational tuning _(see runtime-contracts.md:383)_
288. [ARCH-0077] Forbidden patterns: callers discovering overload only by timeout _(see runtime-contracts.md:407)_
289. [ARCH-0119] 8. Control-Plane Work Uses Shared Primitives — Required contract: Exact-boundary timeout clusters are correctness evidence, not operational noise. _(see system-guidelines.md:273)_
290. [ARCH-0194] Timeout And Invariant Rules — Required patterns: Top-level operations start with one canonical timeout budget. _(see runtime-contracts.md:372)_
291. [ARCH-0195] Timeout And Invariant Rules — Required patterns: Nested operations derive from remaining budget. _(see runtime-contracts.md:373)_
292. [ARCH-0196] Timeout And Invariant Rules — Required patterns: Timeout classifications are typed outcomes with budget context. _(see runtime-contracts.md:374)_
293. [ARCH-0197] Timeout And Invariant Rules — Required patterns: Exact-boundary timeout clusters require deterministic regression coverage. _(see runtime-contracts.md:375)_
294. [ARCH-0198] Timeout And Invariant Rules — Required patterns: Owners emit structured invariant results that serialize into diagnostics and harness artifacts. _(see runtime-contracts.md:376)_
295. [ARCH-0292] 9. Escalate Repeated Scenario Failures Into Causal Analysis — Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. Each Quest must keep enough evidence for a new agent to understand: the bounded-progress mechanism for retryable or backpressure states, including wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded progress _(see doctrine/decision-experiments.md:61)_

### Testing & Harness Guidelines

296. [ARCH-0099] 4. Scalars, State, And Naming Have Owners — Required contract: Test-private value: define one suite-local named constant when repeated or semantically important. _(see system-guidelines.md:174)_
297. [ARCH-0128] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin, harness, or shared test infrastructure boundaries. _(see system-guidelines.md:360)_

### Code Style & Formatting Guidelines

298. [ARCH-0013] 4. Scalars, State, And Naming Have Owners — Required contract: null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant. _(see system-guidelines.md:177)_
299. [ARCH-0098] 4. Scalars, State, And Naming Have Owners — Required contract: File-private value: define one top-level named constant in that file. _(see system-guidelines.md:173)_
300. [ARCH-0100] 4. Scalars, State, And Naming Have Owners — Required contract: Raw external input: normalize it at ingress before runtime logic sees it. _(see system-guidelines.md:176)_

### Governance & Scope Controls

301. [ARCH-0085] 1. Work Starts From One Bounded Quest — Required contract: Broad or scope-changing work sharpens agpl-feature-map.md before code. _(see system-guidelines.md:96)_
302. [ARCH-0129] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: Known in-scope doctrine or system-guideline violations in the affected area must be fixed before Quest closure. _(see system-guidelines.md:365)_
303. [ARCH-0130] 13. Closure Requires Proof, Review, And Truth Repair — Required contract: If a Quest discovers roadmap or architecture truth drift, repair the roadmap or architecture record with the same Quest changes. _(see system-guidelines.md:371)_
304. [ARCH-0266] Do not begin a new local patch on the same architectural boundary while the current Quest still has unresolved in-scope residuals. Either finish the residuals in the current Quest or author a new Quest/frontier before moving on. _(see doctrine/decision-experiments.md:101)_
305. [ARCH-0302] Runtime Quests that follow such a model should cite it as their scope basis and proof surface. _(see doctrine/decision-experiments.md:49)_
306. [ARCH-0307] A human idea should first become the smallest sufficient form: - direct bounded work with an obvious deterministic proof; - an optional epic while cross-Quest options remain unresolved; - a sharpened roadmap/specification contract for broad scope; - or a bounded Quest when the Quest threshold is met _(see doctrine/decision-experiments.md:82)_
