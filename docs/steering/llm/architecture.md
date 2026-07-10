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

> **Priority subset — showing 40 of 111 architecture rules** (capped per `maxRules` in `llm-pack.config.json`). The IDs below are NOT gapless: 71 lower-priority rules are omitted. For every architecture rule, see [`rules-index.md`](rules-index.md) or run `npm run rule -- --domain architecture`.

## Rules

### General Guidelines

1. [ARCH-0001] docs/ holds documentation, never active work definition: end-user and operator-facing docs, the agent steering tree under docs/steering/, and internal engineering plans. Active work definition lives under solve/quests/. _(see system-guidelines.md:102)_
2. [ARCH-0002] Model choice notes are advisory only. They never replace validation, delegated review, Solver attempts, or terminal reports. _(see system-guidelines.md:106)_
3. [ARCH-0006] null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant. _(see system-guidelines.md:177)_
4. [ARCH-0015] Throughput may fall under pressure; correctness must not. _(see system-guidelines.md:289)_
5. [ARCH-0016] Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load. _(see system-guidelines.md:290)_
6. [ARCH-0018] Control-plane pressure must not cause query/data-plane correctness failures. _(see system-guidelines.md:295)_
7. [ARCH-0019] Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses. _(see system-guidelines.md:311)_
8. [ARCH-0021] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments. _(see system-guidelines.md:204)_
9. [ARCH-0022] Non-forced readers do not repair authoritative state on the hot path. _(see system-guidelines.md:232)_
10. [ARCH-0028] Do not pre-slice candidates to the requested replica count before admission. _(see runtime-contracts.md:343)_
11. [ARCH-0034] Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active spec or architecture note with a removal checkpoint. _(see system-guidelines.md:373)_
12. [ARCH-0036] During splits, moves, and leader elections, queries may be slower but must not fail because topology is transient. _(see runtime-contracts.md:412)_
13. [ARCH-0037] All non-trivial implementation work MUST follow the Quest workflow. _(see system-guidelines.md:92)_
14. [ARCH-0039] Any runtime function or semantic concern MUST have one active path after input normalization. _(see system-guidelines.md:143)_
15. [ARCH-0041] The system must remain correct under contention, topology change, recovery, and control-plane pressure. _(see system-guidelines.md:284)_
16. [ARCH-0042] All state-mutating operations MUST be safe under retry, redelivery, and recovery sweeps. _(see system-guidelines.md:319)_

### Ownership & Authority Policies

17. [ARCH-0003] If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation. _(see system-guidelines.md:123)_
18. [ARCH-0004] Callers submit intent to owners. They do not reproduce owner logic locally. _(see system-guidelines.md:125)_
19. [ARCH-0011] Events may enqueue owner-key work; they must not execute long-running progression inline. _(see system-guidelines.md:246)_
20. [ARCH-0014] Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions. _(see system-guidelines.md:276)_
21. [ARCH-0024] Temporary delegators may forward to the owner, but must not add a second decision path. _(see runtime-contracts.md:39)_
22. [ARCH-0026] Participant executors emit outcomes and do not persist owner-managed phase transitions directly. _(see runtime-contracts.md:282)_
23. [ARCH-0030] Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling created by a phase must transfer to an explicit runtime owner before the phase completes. _(see system-guidelines.md:243)_
24. [ARCH-0035] Bootstrap, join, and recovery phases must not remain the steady-state owner after the phase completes. _(see runtime-contracts.md:223)_
25. [ARCH-0038] Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource MUST have one semantic owner. _(see system-guidelines.md:115)_
26. [ARCH-0040] Cache divergence, stale reads, missing rows, and repair needs must surface as typed owner outcomes or diagnostics. _(see system-guidelines.md:231)_

### Lifecycle & State Machine Rules

27. [ARCH-0009] INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/status mutation of existing system rows. _(see system-guidelines.md:221)_
28. [ARCH-0010] Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code. _(see system-guidelines.md:228)_
29. [ARCH-0012] Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path. _(see system-guidelines.md:253)_
30. [ARCH-0023] Steady-state correctness must not depend on phase-owned wiring after phase completion. _(see system-guidelines.md:238)_

### Readiness & Health Contracts

31. [ARCH-0027] Degraded or cross-plane evidence may explain or defer, but must not upgrade a blocked entity to ready or admitted. _(see runtime-contracts.md:324)_

### Change Data Capture (CDC) Policies

32. [ARCH-0029] CDC-replicated row mutation must be primary-key addressed. _(see system-guidelines.md:223)_

### Caching & Observation Rules

33. [ARCH-0005] Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes. _(see system-guidelines.md:149)_
34. [ARCH-0020] Users do not directly manage partitions, replicas, placement, leader election, message groups, cache hydration, or rebalance workflows. _(see system-guidelines.md:336)_
35. [ARCH-0025] Reader-local caches do not memoize stale or deferred blocked answers as fresh observations. _(see runtime-contracts.md:121)_

### Timeouts & Budget Management

36. [ARCH-0013] Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget. _(see system-guidelines.md:271)_
37. [ARCH-0017] Callers must not discover overload only through timeout expiry. _(see system-guidelines.md:294)_

### Testing & Harness Guidelines

38. [ARCH-0031] Static guardrail proof is required for touched runtime/control-plane, diagnostics, admin, harness, or shared test infrastructure boundaries. _(see system-guidelines.md:360)_
39. [ARCH-0032] Before closure, perform the affected-area deep dive required by workflow-guidelines/INDEX.md and testing-guidelines/INDEX.md. _(see system-guidelines.md:362)_

### Governance & Scope Controls

40. [ARCH-0033] Known in-scope doctrine or system-guideline violations in the affected area must be fixed before Quest closure. _(see system-guidelines.md:365)_
