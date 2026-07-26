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

> **Complete selectively loaded pack.** All 171 architecture master rules are included below (174 incl. cross-domain aliases; alias rows are marked in `rules-index.md`).

## Rules

### General Guidelines

1. [ARCH-0001] docs/ holds documentation, never active work definition: end-user and operator-facing docs, the agent steering tree under docs/steering/, and internal engineering plans. Active work definition lives under solve/quests/. _(see system-guidelines.md:103)_
2. [ARCH-0002] Model choice notes are advisory only. They never replace validation, delegated review, Solver attempts, or terminal reports. _(see system-guidelines.md:107)_
3. [ARCH-0005] Forbidden: duplicate helpers, wrappers, caches, snapshots, fields, or aliases for the same semantic concern _(see system-guidelines.md:136)_
4. [ARCH-0008] Forbidden: transitional delegators without a removal task and structural guard _(see system-guidelines.md:140)_
5. [ARCH-0010] Forbidden: "try the new path, then the old path" logic _(see system-guidelines.md:161)_
6. [ARCH-0011] Forbidden: feature flags that keep two implementations alive for one semantic _(see system-guidelines.md:162)_
7. [ARCH-0014] null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant. _(see system-guidelines.md:178)_
8. [ARCH-0023] Throughput may fall under pressure; correctness must not. _(see system-guidelines.md:290)_
9. [ARCH-0024] Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load. _(see system-guidelines.md:291)_
10. [ARCH-0026] Control-plane pressure must not cause query/data-plane correctness failures. _(see system-guidelines.md:296)_
11. [ARCH-0027] Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses. _(see system-guidelines.md:312)_
12. [ARCH-0029] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments. _(see system-guidelines.md:205)_
13. [ARCH-0030] Non-forced readers do not repair authoritative state on the hot path. _(see system-guidelines.md:233)_
14. [ARCH-0039] Forbidden patterns: recreating missing rows inside updater code _(see runtime-contracts.md:70)_
15. [ARCH-0046] Reader-local caches do not memoize stale or deferred blocked answers as fresh observations. _(see runtime-contracts.md:121)_
16. [ARCH-0047] Forbidden patterns: snapshot repair consuming the same effective lane as critical convergence _(see runtime-contracts.md:138)_
17. [ARCH-0049] Forbidden patterns: reopening broad repair from readers on the same stressed path needed to finish convergence _(see runtime-contracts.md:140)_
18. [ARCH-0050] Forbidden patterns: deriving canonical leader identity from replica row iteration order _(see runtime-contracts.md:156)_
19. [ARCH-0055] Forbidden patterns: bootstrap helper paths reachable from steady-state runtime code _(see runtime-contracts.md:218)_
20. [ARCH-0056] Forbidden patterns: tearing down the only live subscriber, bridge, dissemination path, or repair route _(see runtime-contracts.md:235)_
21. [ARCH-0061] Forbidden patterns: proving the producer and consumer with separate focused tests while no replayable handoff fixture or missing-edge probe covers their interaction _(see runtime-contracts.md:263)_
22. [ARCH-0064] Forbidden patterns: sequential fallback branches for atomic topology cut points _(see runtime-contracts.md:306)_
23. [ARCH-0065] Forbidden patterns: a second control-plane workflow engine when DurableWorkflowCoordinator owns the contract _(see runtime-contracts.md:307)_
24. [ARCH-0067] Do not pre-slice candidates to the requested replica count before admission. _(see runtime-contracts.md:343)_
25. [ARCH-0068] Forbidden patterns: grouped-path diagnostics while grouped mode is disabled _(see runtime-contracts.md:362)_
26. [ARCH-0069] Forbidden patterns: status checks that bypass declared active/terminal sets _(see runtime-contracts.md:363)_
27. [ARCH-0071] Forbidden patterns: nested waits using fresh full budgets after time has already elapsed _(see runtime-contracts.md:381)_
28. [ARCH-0074] Forbidden patterns: unbounded in-flight work _(see runtime-contracts.md:405)_
29. [ARCH-0075] Forbidden patterns: hidden local priority queues outside the shared pressure contract _(see runtime-contracts.md:406)_
30. [ARCH-0077] Forbidden patterns: resource cleanup that depends on process lifetime or scenario end _(see runtime-contracts.md:408)_
31. [ARCH-0078] Forbidden patterns: direct local handler calls, ad-hoc sockets, admin forwarding, or service-to-service in-process bypasses for data-plane traffic _(see runtime-contracts.md:426)_
32. [ARCH-0079] Forbidden patterns: non-replicated fast paths for performance _(see runtime-contracts.md:428)_
33. [ARCH-0080] Forbidden patterns: hard query failure while retryable replicas exist _(see runtime-contracts.md:429)_
34. [ARCH-0081] Forbidden patterns: indefinite query queues waiting for topology transitions _(see runtime-contracts.md:430)_
35. [ARCH-0082] Forbidden patterns: receiver logic that depends on caller discipline to avoid duplicates _(see runtime-contracts.md:445)_
36. [ARCH-0083] Forbidden patterns: retryable paths that use non-idempotent counters or append-only writes without deduplication _(see runtime-contracts.md:446)_
37. [ARCH-0087] Before closure, perform the affected-area deep dive required by workflow-guidelines/INDEX.md and testing-guidelines/INDEX.md. _(see system-guidelines.md:363)_
38. [ARCH-0089] Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active spec or architecture note with a removal checkpoint. _(see system-guidelines.md:374)_
39. [ARCH-0091] During splits, moves, and leader elections, queries may be slower but must not fail because topology is transient. _(see runtime-contracts.md:412)_
40. [ARCH-0092] All non-trivial implementation work MUST follow the Quest workflow. _(see system-guidelines.md:93)_
41. [ARCH-0094] Any runtime function or semantic concern MUST have one active path after input normalization. _(see system-guidelines.md:144)_
42. [ARCH-0096] The system must remain correct under contention, topology change, recovery, and control-plane pressure. _(see system-guidelines.md:285)_
43. [ARCH-0097] All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps. _(see system-guidelines.md:320)_
44. [ARCH-0098] Broad ideas must not go straight into code. _(see doctrine/decision-experiments.md:87)_
45. [ARCH-0099] Do not treat a Quest as SOLVED when only the hot path is fixed. A Quest is complete only when the hot path, tail consumers, diagnostics or reporting, deletion work, and required proof are all closed. _(see doctrine/decision-experiments.md:98)_
46. [ARCH-0101] Pressure must not become hidden drops, memory growth without bounds, or correctness failures. _(see doctrine/state-encoding.md:31)_
47. [ARCH-0102] Contradictory — authoritative or equivalent signals disagree; produces reconciliation with explicit reasons, never a local exemption. _(see doctrine/state-encoding.md:104)_
48. [ARCH-0103] Inferences — derived signals such as error-string matching or absence of a row. An inference may trigger a re-read of actuals; it must never be the witness itself. _(see doctrine/state-encoding.md:131)_
49. [ARCH-0106] Do not respond to repeated distributed failures by adding more scattered local special cases. _(see doctrine/decision-experiments.md:30)_
50. [ARCH-0107] Do not treat hot-path green tests as analysis closure while the original scenario now fails for a different named reason. _(see doctrine/decision-experiments.md:134)_
51. [ARCH-0111] Do not keep patching symptoms while leaving the boundary porous. _(see doctrine/owner-boundaries.md:53)_
52. [ARCH-0113] Do not let old migration history or several optional delegated findings create competing active interpretations of the same blocker. _(see doctrine/owner-boundaries.md:91)_
53. [ARCH-0114] There may be multiple semantic owners, but there must not be many equivalent runtime ingress paths. _(see doctrine/single-path.md:17)_
54. [ARCH-0116] Do not let observed, published, retained, cached, repaired, or fast-path variants drift into several interchangeable authorities. _(see doctrine/single-path.md:55)_
55. [ARCH-0117] Do not let row nullability, protocol-specific fields, or bootstrap-only shapes become semantic runtime contracts inside the system. _(see doctrine/single-path.md:75)_
56. [ARCH-0118] Do not encode semantic policy as independent booleans that callers can combine into overlapping or contradictory behavior. _(see doctrine/single-path.md:89)_
57. [ARCH-0119] The system must not become less correct. _(see doctrine/state-encoding.md:28)_
58. [ARCH-0121] Callers may consume or propagate that deferred outcome, but they must not silently reinterpret it as success, empty visibility, or unknown absence. _(see doctrine/state-encoding.md:50)_
59. [ARCH-0122] Readers must not run synchronous multi-table authoritative repair inline on the hot read path. _(see doctrine/state-encoding.md:55)_
60. [ARCH-0123] Collectors may fetch, retry, and annotate evidence, but they do not emit the final verdict. _(see doctrine/state-encoding.md:92)_
61. [ARCH-0125] Policy targets must not be rewritten from the survivors observed during one attempt. _(see doctrine/state-encoding.md:109)_
62. [ARCH-0126] Do not force readers to reconstruct progress from object existence, local booleans, timestamps, or log strings. _(see doctrine/state-encoding.md:161)_
63. [ARCH-0127] Forbidden patterns: allowing a publication recovery producer to stall or wait on unknown publication deficits when a downstream active-gate reconcile handoff is already pending, as this introduces structural deadlocks during rolling restarts under pressure. _(see runtime-contracts.md:265)_
64. [ARCH-0130] Runtime shared-metadata access must cross canonical ingress owners. _(see runtime-contracts.md:202)_
65. [ARCH-0132] Scenario-driven Quests must prove what the original scenario does next: representative green, same frontier, reduced, migrated, classification-only, architecture gap, autonomous architecture experiment, or human-only escalation for blocked/contradictory evidence. _(see system-guidelines.md:368)_
66. [ARCH-0133] The system may slow under pressure, but it must remain correct. _(see runtime-contracts.md:387)_
67. [ARCH-0134] Query-plane traffic may use a separate ingress from metadata/control-plane traffic, but both planes must share the same pressure/admission contract. _(see doctrine/single-path.md:24)_
68. [ARCH-0137] Pressure must become admission, defer, reject, or coalescing signals. _(see doctrine/state-encoding.md:30)_
69. [ARCH-0138] Actuals — observed state: a raft-observed leader, an active service row, a committed operation read back from the authority. A gate must consume actuals only. _(see doctrine/state-encoding.md:124)_
70. [ARCH-0139] New features should strengthen tables, services, policies, and canonical execution paths before introducing new user-visible concepts. _(see system-guidelines.md:341)_
71. [ARCH-0141] Use the model ledger as an advisory feedback loop for future model, reasoning-effort, and output-profile choice when a Quest produces useful evidence. Output profile controls final-response and handoff verbosity, not reasoning depth. It must not replace validation, review, sequencing, or closure proof. _(see doctrine/decision-experiments.md:111)_
72. [ARCH-0142] Targets — intent: replica_count, planned placement, configured cohort sizes. A target must never gate liveness: it legitimately exceeds placed reality on single-node and degraded clusters, so a target-built gate rejects correct work. _(see doctrine/state-encoding.md:127)_
73. [ARCH-0143] Scenario-driven Quests must maintain scenario causal closure across the whole chain, not only the current first frontier. _(see doctrine/decision-experiments.md:52)_
74. [ARCH-0146] After repeated bugs at one boundary, the next fix must reduce the number of paths, states, or owners that can cross it. _(see doctrine/owner-boundaries.md:52)_
75. [ARCH-0152] Critical convergence traffic must keep stricter admission than diagnostics, observability, or broad repair. _(see doctrine/state-encoding.md:61)_
76. [ARCH-0153] In practice, node-state publication, membership publication, and authoritative operation visibility must be allowed to keep progressing under pressure conditions that may defer snapshot repair or admin reads. _(see doctrine/state-encoding.md:62)_
77. [ARCH-0157] All service communication that should be a message goes through the MessageRouter. _(see system-guidelines.md:306)_
78. [ARCH-0158] A shared row may have several field owners only when the owned subsets are explicit and non-overlapping. _(see system-guidelines.md:129)_
79. [ARCH-0162] Internal machinery may appear in diagnostics, but not as ordinary user-facing control surfaces unless explicitly designed as such. _(see system-guidelines.md:339)_
80. [ARCH-0165] Active implementation should target one executable concern per Quest. _(see doctrine/decision-experiments.md:88)_
81. [ARCH-0166] Quest status should live in the Solver event log and report rather than in parallel trackers. _(see doctrine/decision-experiments.md:89)_
82. [ARCH-0168] Implementation work should be as explicit and bounded as the runtime design. _(see doctrine/decision-experiments.md:80)_
83. [ARCH-0169] Optional real sub-agents should accelerate this sequence, not replace it. _(see doctrine/owner-boundaries.md:99)_
84. [ARCH-0173] Under load, the system may slow down, defer work, or reject new edge work with structured retry semantics. _(see doctrine/state-encoding.md:27)_
85. [ARCH-0174] Classification-only is a valid result only when the causal chain is still explicit, the focused probe command and artifact are named, the bounded-progress proof has an observable transition and bound, and the stop condition says why no local runtime patch should continue in that Quest. _(see doctrine/decision-experiments.md:71)_

### Ownership & Authority Policies

86. [ARCH-0003] If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation. _(see system-guidelines.md:124)_
87. [ARCH-0004] Callers submit intent to owners. They do not reproduce owner logic locally. _(see system-guidelines.md:126)_
88. [ARCH-0006] Forbidden: shadow state for owner-managed lifecycle or readiness _(see system-guidelines.md:138)_
89. [ARCH-0007] Forbidden: fallback paths that reconstruct owner decisions from secondary evidence _(see system-guidelines.md:139)_
90. [ARCH-0019] Events may enqueue owner-key work; they must not execute long-running progression inline. _(see system-guidelines.md:247)_
91. [ARCH-0022] Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions. _(see system-guidelines.md:277)_
92. [ARCH-0032] Temporary delegators may forward to the owner, but must not add a second decision path. _(see runtime-contracts.md:39)_
93. [ARCH-0033] Forbidden runtime patterns: local replacement logic when a composition-root owner is available _(see runtime-contracts.md:46)_
94. [ARCH-0034] Forbidden runtime patterns: owner-unavailable branches that reconstruct equivalent decisions _(see runtime-contracts.md:47)_
95. [ARCH-0042] Forbidden patterns: ad-hoc Maps, Sets, or objects that cache system data outside the declared owner or SystemTableCache _(see runtime-contracts.md:93)_
96. [ARCH-0043] Forbidden patterns: copying owner-managed fields from cache into unrelated write paths _(see runtime-contracts.md:95)_
97. [ARCH-0051] Forbidden patterns: treating replica rows as alternative truth when the owner row is present _(see runtime-contracts.md:157)_
98. [ARCH-0052] Forbidden patterns: collapsing owner-row mismatch and replica-role mismatch into one generic error _(see runtime-contracts.md:158)_
99. [ARCH-0053] Forbidden patterns: raw system-table mutation helper calls from runtime feature code when a gateway owner exists _(see runtime-contracts.md:215)_
100. [ARCH-0057] Forbidden patterns: hiding missing handoff ownership behind fallback reads, broad repairs, or timeout inflation _(see runtime-contracts.md:237)_
101. [ARCH-0060] Forbidden patterns: letting a consumer select, repair, or admit from an owner stream that has not published the required durable handoff edge _(see runtime-contracts.md:261)_
102. [ARCH-0062] Participant executors emit outcomes and do not persist owner-managed phase transitions directly. _(see runtime-contracts.md:282)_
103. [ARCH-0063] Forbidden patterns: ad-hoc cross-owner write ordering to emulate atomicity _(see runtime-contracts.md:305)_
104. [ARCH-0070] Forbidden patterns: expiry sweeps that rewrite another owner's terminal workflow outcome _(see runtime-contracts.md:364)_
105. [ARCH-0085] Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling created by a phase must transfer to an explicit runtime owner before the phase completes. _(see system-guidelines.md:244)_
106. [ARCH-0090] Bootstrap, join, and recovery phases must not remain the steady-state owner after the phase completes. _(see runtime-contracts.md:223)_
107. [ARCH-0093] Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource MUST have one semantic owner. _(see system-guidelines.md:116)_
108. [ARCH-0095] Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner outcomes or diagnostics. _(see system-guidelines.md:232)_
109. [ARCH-0104] Components constructed with owner dependencies must route owned behavior through those dependencies. _(see runtime-contracts.md:35)_
110. [ARCH-0105] A transitional delegator must have a removal task, target owner, and structural guard preventing new callers from binding to it. _(see runtime-contracts.md:41)_
111. [ARCH-0108] Quests must never close from symptom movement alone (such as changed timeout durations, timing offsets, or message counts); they must prove the named contract transition or owner-boundary correctness. _(see doctrine/decision-experiments.md:137)_
112. [ARCH-0109] Callers do not reproduce the owner's logic locally, and callers do not keep shadow state for the same concern. _(see doctrine/owner-boundaries.md:24)_
113. [ARCH-0110] A new owner left running alongside the old path it was meant to replace is an unfinished cutover, not a second owner — record it as incomplete, never as done. _(see doctrine/owner-boundaries.md:28)_
114. [ARCH-0112] Do not let diagnostics views, retained owner state, bootstrap-normalized ingress state, or cache-local observations drift into a second operational authority by convention. _(see doctrine/owner-boundaries.md:68)_
115. [ARCH-0115] Bootstrap may hydrate initial state, but bootstrap code must not remain the runtime dissemination owner. _(see doctrine/single-path.md:37)_
116. [ARCH-0120] The owner outcome must not degrade into empty collections, null-shaped absence, or timeout-only silence. _(see doctrine/state-encoding.md:38)_
117. [ARCH-0128] Use ControlPlaneReadinessService as the readiness owner (node readiness and planning surfaces). The snapshot/watch surface — control snapshot, service discovery, freshness and observation state — has a DISTINCT owner, ControlPlaneSnapshotOwner. Readiness and snapshot ownership are two separate components; do not conflate "readiness owner" with "snapshot/watch owner". _(see runtime-contracts.md:329)_
118. [ARCH-0129] Shared truth surfaces such as startup, readiness, admin snapshot, service discovery, and harness convergence must have one snapshot owner. _(see runtime-contracts.md:101)_
119. [ARCH-0131] Quest validation must prove the owner path and affected tail consumers. Concretely: when a change alters the SHAPE of a boundary-crossing string (a new SQL statement variant, message payload type, log-message format matched elsewhere, or address format), enumerate every parser/matcher of that shape BEFORE landing — grep for the statement prefix regexes and startsWith classifiers. (Witnessed: an INSERT OR IGNORE variant broke one of eight SQL-text parsers and emitted '?'-placeholder garbage rows cluster-wide; a two-minute parser sweep would have caught it statically.) _(see system-guidelines.md:353)_
120. [ARCH-0144] Every durable concern must have one semantic owner. _(see doctrine/owner-boundaries.md:17)_
121. [ARCH-0145] Introducing a new owner is a cutover, not an addition: the prior authority for that concern must be retired in the same body of work. _(see doctrine/owner-boundaries.md:27)_
122. [ARCH-0147] An active Quest may have several frontiers, but each attempt must start from one selected frontier and one semantic owner boundary. _(see doctrine/owner-boundaries.md:80)_
123. [ARCH-0148] If the semantic owner, owner boundary, or next required action changes, record a finding and add or author the frontier that owns the new boundary. _(see doctrine/owner-boundaries.md:94)_
124. [ARCH-0149] The "consumer set" and "forbidden reinterpretations" bullets above overlap by design with owner-boundaries §14 ("Shared Surfaces Must Name Consumers", see owner-boundaries.md). _(see doctrine/single-path.md:58)_
125. [ARCH-0151] When an owner-path read or write is unresolved because pressure, authority establishment, or recovery completion is still in flight, the owner must emit one structured deferred outcome. _(see doctrine/state-encoding.md:36)_
126. [ARCH-0154] State names are boundary-specific but must distinguish static exclusion, missing discovery or owner proof, equivalent-confirmation wait, admission, reconciliation, and hard rejection. _(see doctrine/state-encoding.md:115)_
127. [ARCH-0156] Retry is not fallback: routing MAY retry or redirect to another live replica or a new leader within the caller budget (for example QueryExecutorWriteRetryRouting); it MUST NOT reconstruct an owner decision from secondary evidence when the owner is unavailable. _(see runtime-contracts.md:195)_
128. [ARCH-0160] Consumers may not maintain parallel system-data caches outside the declared owner or SystemTableCache. _(see system-guidelines.md:227)_
129. [ARCH-0161] For one owner key, at most one reconcile execution may be in flight. _(see system-guidelines.md:249)_
130. [ARCH-0163] Every active Quest must name its residual-closure inventory before code is treated as complete. At minimum that inventory must cover: - owner-path cutovers; - direct and tail consumers; - status, diagnostics, and reporting surfaces; - deletion of superseded paths or stale vocabulary; - required proof layers _(see doctrine/decision-experiments.md:91)_
131. [ARCH-0170] Authoritative — owned by the same semantic owner and plane; may directly admit or reject. _(see doctrine/state-encoding.md:98)_
132. [ARCH-0171] Equivalent — another access path to the same owner and plane; may confirm or refute only the equivalence declared by the governing contract. _(see doctrine/state-encoding.md:100)_

### Lifecycle & State Machine Rules

133. [ARCH-0013] Forbidden: bags of independent if statements around readiness, admission, retry, phase, lifecycle, or outcome classification _(see system-guidelines.md:164)_
134. [ARCH-0017] INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/status mutation of existing system rows. _(see system-guidelines.md:222)_
135. [ARCH-0018] Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code. _(see system-guidelines.md:229)_
136. [ARCH-0020] Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path. _(see system-guidelines.md:254)_
137. [ARCH-0031] Steady-state correctness must not depend on phase-owned wiring after phase completion. _(see system-guidelines.md:239)_
138. [ARCH-0036] Forbidden runtime patterns: shadow state for lifecycle, readiness, admission, leader, or routing truth _(see runtime-contracts.md:49)_
139. [ARCH-0037] Forbidden patterns: INSERT OR REPLACE for steady-state lifecycle/status updates _(see runtime-contracts.md:68)_
140. [ARCH-0038] Forbidden patterns: full-row replacement for existing lifecycle rows _(see runtime-contracts.md:69)_
141. [ARCH-0041] Forbidden patterns: one persisted field carrying unrelated claim, lease, workflow, and entity lifecycle semantics _(see runtime-contracts.md:72)_
142. [ARCH-0100] A phase must not tear down the only live runtime path. _(see doctrine/state-encoding.md:20)_
143. [ARCH-0135] A phase-scoped bridge must either become a runtime-owned bridge or be replaced before teardown. _(see doctrine/state-encoding.md:21)_
144. [ARCH-0136] Completion of a phase must reduce temporary machinery, not strand it. _(see doctrine/state-encoding.md:23)_
145. [ARCH-0150] Bootstrap, join, and recovery phases may initialize runtime mechanisms, but they must hand off to steady-state owners before phase completion. _(see doctrine/state-encoding.md:17)_
146. [ARCH-0155] The services row is the canonical example of non-overlapping field owners on one row: identity, lifecycle (ReplicaStateMachine), and raft_role (PartitionService / MessageGroupService) are written by different components on disjoint field subsets — permitted precisely because the subsets do not overlap. _(see runtime-contracts.md:190)_

### Readiness & Health Contracts

147. [ARCH-0059] Forbidden patterns: treating producer publication and consumer readiness as independently fixed when representative evidence alternates between them _(see runtime-contracts.md:259)_
148. [ARCH-0066] Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked entity to ready or admitted. _(see runtime-contracts.md:324)_
149. [ARCH-0159] Collectors may gather evidence; one canonical adjudicator emits the final ready, admit, select, retryable, terminal, or blocked verdict. _(see system-guidelines.md:156)_
150. [ARCH-0164] Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may initialize runtime mechanisms. _(see system-guidelines.md:238)_

### Change Data Capture (CDC) Policies

151. [ARCH-0040] Forbidden patterns: broad UPDATE or DELETE statements as the primary CDC mutation path _(see runtime-contracts.md:71)_
152. [ARCH-0084] CDC-replicated row mutation must be primary-key addressed. _(see system-guidelines.md:224)_

### Caching & Observation Rules

153. [ARCH-0009] Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes. _(see system-guidelines.md:150)_
154. [ARCH-0012] Forbidden: decision branches that mix cache and SQL as equivalent truth for one meaning _(see system-guidelines.md:163)_
155. [ARCH-0028] Users do not directly manage partitions, replicas, placement, leader election, message groups, cache hydration, or rebalance workflows. _(see system-guidelines.md:337)_
156. [ARCH-0035] Forbidden runtime patterns: feature-local implementations of existing cache/read/write/retry primitives _(see runtime-contracts.md:48)_
157. [ARCH-0044] Forbidden patterns: completing executor-owned topology phases from cache visibility alone _(see runtime-contracts.md:96)_
158. [ARCH-0045] Forbidden patterns: mixing cache and SQL fallbacks inside one semantic decision path _(see runtime-contracts.md:97)_
159. [ARCH-0048] Forbidden patterns: treating mild pressure as permission to publish cache-only emptiness _(see runtime-contracts.md:139)_
160. [ARCH-0054] Forbidden patterns: second runtime read ingress with equivalent cache/SQL decisions _(see runtime-contracts.md:217)_
161. [ARCH-0058] Forbidden patterns: inferring handoff from elapsed time or "good enough" cache visibility _(see runtime-contracts.md:239)_

### Timeouts & Budget Management

162. [ARCH-0021] Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget. _(see system-guidelines.md:272)_
163. [ARCH-0025] Callers must not discover overload only through timeout expiry. _(see system-guidelines.md:295)_
164. [ARCH-0072] Forbidden patterns: generic timeout strings for semantic control-plane outcomes _(see runtime-contracts.md:382)_
165. [ARCH-0073] Forbidden patterns: treating routine timeout under moderate load as operational tuning _(see runtime-contracts.md:383)_
166. [ARCH-0076] Forbidden patterns: callers discovering overload only by timeout _(see runtime-contracts.md:407)_

### Testing & Harness Guidelines

167. [ARCH-0086] Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin, harness, or shared test infrastructure boundaries. _(see system-guidelines.md:361)_

### Governance & Scope Controls

168. [ARCH-0088] Known in-scope doctrine or system-guideline violations in the affected area must be fixed before Quest closure. _(see system-guidelines.md:366)_
169. [ARCH-0140] Do not begin a new local patch on the same architectural boundary while the current Quest still has unresolved in-scope residuals. Either finish the residuals in the current Quest or author a new Quest/frontier before moving on. _(see doctrine/decision-experiments.md:101)_
170. [ARCH-0167] Runtime Quests that follow such a model should cite it as their scope basis and proof surface. _(see doctrine/decision-experiments.md:49)_
171. [ARCH-0172] A human idea should first become the smallest sufficient form: - direct bounded work with an obvious deterministic proof; - an optional epic while cross-Quest options remain unresolved; - a sharpened roadmap/specification contract for broad scope; - or a bounded Quest when the Quest threshold is met _(see doctrine/decision-experiments.md:82)_
