---
scope: architecture
status: compiled
always_load: false
source_of_truth: .kiro/steering/ (see llm-pack.config.json sources for architecture)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `.kiro/steering/`.

# Architecture Steering Pack

Load for bootstrap/join/rebalance/control-plane/runtime ownership and lifecycle work.

Generated rules: 40
Estimated tokens: 1742
Domains: architecture

## Rules

### General Guidelines

1. [ARCH-0002] Package status lives in the filename: idea-, todo-, active-, done-, or superseded-. Do not create a second status system. _(see system-guidelines.md:85)_
2. [ARCH-0003] The model ledger is advisory only for model, reasoning-effort, and output-profile choice. It never replaces validation, review sub-agents, package sequencing, closure proof, or focused commits. _(see system-guidelines.md:89)_
3. [ARCH-0007] null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant. _(see system-guidelines.md:162)_
4. [ARCH-0008] Each concept has one name. Do not add synonyms for existing concepts. _(see system-guidelines.md:165)_
5. [ARCH-0009] Do not introduce ordinal, segment, or grab-bag source filenames such as part-2, segment, misc, helpers, or utils unless that name is an established domain concept. _(see system-guidelines.md:168)_
6. [ARCH-0016] Throughput may fall under pressure; correctness must not. _(see system-guidelines.md:274)_
7. [ARCH-0017] Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load. _(see system-guidelines.md:275)_
8. [ARCH-0019] Control-plane pressure must not cause query/data-plane correctness failures. _(see system-guidelines.md:280)_
9. [ARCH-0020] Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses. _(see system-guidelines.md:296)_
10. [ARCH-0022] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments. _(see system-guidelines.md:189)_
11. [ARCH-0029] Do not pre-slice candidates to the requested replica count before admission. _(see runtime-contracts.md:296)_
12. [ARCH-0037] Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active spec or architecture note with a removal checkpoint. _(see system-guidelines.md:351)_
13. [ARCH-0039] During splits, moves, and leader elections, queries may be slower but must not fail because topology is transient. _(see runtime-contracts.md:365)_
14. [ARCH-0040] All non-trivial implementation work MUST follow the repository work-tracking workflow. _(see system-guidelines.md:75)_
15. [ARCH-0042] Any runtime function or semantic concern MUST have one active path after input normalization. _(see system-guidelines.md:128)_

### Ownership & Authority Policies

16. [ARCH-0001] Lightweight maintenance: use one focused package and focused proof. Do not require causal ledgers, representative reruns, or delegated role provenance unless runtime ownership or shared contracts can change. _(see system-guidelines.md:59)_
17. [ARCH-0004] If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation. _(see system-guidelines.md:108)_
18. [ARCH-0005] Callers submit intent to owners. They do not reproduce owner logic locally. _(see system-guidelines.md:110)_
19. [ARCH-0012] Events may enqueue owner-key work; they must not execute long-running progression inline. _(see system-guidelines.md:231)_
20. [ARCH-0015] Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions. _(see system-guidelines.md:261)_
21. [ARCH-0027] Participant executors emit outcomes and do not persist owner-managed phase transitions directly. _(see runtime-contracts.md:243)_
22. [ARCH-0030] Read/review/doc-only: answer questions or edit explanatory docs. No work package is required unless implementation truth, roadmap status, or architecture ownership changes. _(see system-guidelines.md:56)_
23. [ARCH-0032] Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling created by a phase must transfer to an explicit runtime owner before the phase completes. _(see system-guidelines.md:228)_
24. [ARCH-0033] Package validation must prove the owner path and affected tail consumers. _(see system-guidelines.md:337)_
25. [ARCH-0038] Bootstrap, join, and recovery phases must not remain the steady-state owner after the phase completes. _(see runtime-contracts.md:183)_
26. [ARCH-0041] Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource MUST have one semantic owner. _(see system-guidelines.md:100)_

### Lifecycle & State Machine Rules

27. [ARCH-0010] INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/status mutation of existing system rows. _(see system-guidelines.md:206)_
28. [ARCH-0011] Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code. _(see system-guidelines.md:213)_
29. [ARCH-0013] Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path. _(see system-guidelines.md:238)_
30. [ARCH-0024] Steady-state correctness must not depend on phase-owned wiring after phase completion. _(see system-guidelines.md:222)_

### Readiness & Health Contracts

31. [ARCH-0028] Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked entity to ready or admitted. _(see runtime-contracts.md:281)_

### Change Data Capture (CDC) Policies

32. [ARCH-0031] CDC-replicated row mutation must be primary-key addressed. _(see system-guidelines.md:208)_

### Caching & Observation Rules

33. [ARCH-0006] Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes. _(see system-guidelines.md:134)_
34. [ARCH-0021] Users do not directly manage partitions, replicas, placement, leader election, message groups, cache hydration, or rebalance workflows. _(see system-guidelines.md:321)_
35. [ARCH-0026] Reader-local caches do not memoize stale or deferred blocked answers as fresh observations. _(see runtime-contracts.md:121)_

### Timeouts & Budget Management

36. [ARCH-0014] Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget. _(see system-guidelines.md:256)_
37. [ARCH-0018] Callers must not discover overload only through timeout expiry. _(see system-guidelines.md:279)_

### Testing & Harness Guidelines

38. [ARCH-0034] Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin, harness, or shared test infrastructure boundaries. _(see system-guidelines.md:338)_
39. [ARCH-0035] Before closure, perform the affected-area deep dive required by workflow-guidelines.md and testing-guidelines.md. _(see system-guidelines.md:340)_

### Governance & Scope Controls

40. [ARCH-0036] Known in-scope doctrine or system-guideline violations in the affected area must be fixed before package closure. _(see system-guidelines.md:343)_
