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

> **Priority subset — showing 40 of 165 architecture rules** (168 incl. cross-domain aliases; alias rows are marked in `rules-index.md`) (capped per `maxRules` in `llm-pack.config.json`). The IDs below are NOT gapless: 125 lower-priority rules are omitted. For every architecture rule, see [`rules-index.md`](rules-index.md) or run `npm run rule -- --domain architecture`.

## Rules

### General Guidelines

1. [ARCH-0001] docs/ holds documentation, never active work definition: end-user and operator-facing docs, the agent steering tree under docs/steering/, and internal engineering plans. Active work definition lives under solve/quests/. _(see system-guidelines.md:102)_
2. [ARCH-0002] Model choice notes are advisory only. They never replace validation, delegated review, Solver attempts, or terminal reports. _(see system-guidelines.md:106)_
3. [ARCH-0005] Forbidden: duplicate helpers, wrappers, caches, snapshots, fields, or aliases for the same semantic concern _(see system-guidelines.md:135)_
4. [ARCH-0008] Forbidden: transitional delegators without a removal task and structural guard _(see system-guidelines.md:139)_
5. [ARCH-0010] Forbidden: "try the new path, then the old path" logic _(see system-guidelines.md:160)_
6. [ARCH-0011] Forbidden: feature flags that keep two implementations alive for one semantic _(see system-guidelines.md:161)_
7. [ARCH-0014] null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant. _(see system-guidelines.md:177)_
8. [ARCH-0023] Throughput may fall under pressure; correctness must not. _(see system-guidelines.md:289)_
9. [ARCH-0024] Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load. _(see system-guidelines.md:290)_
10. [ARCH-0026] Control-plane pressure must not cause query/data-plane correctness failures. _(see system-guidelines.md:295)_
11. [ARCH-0027] Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses. _(see system-guidelines.md:311)_
12. [ARCH-0029] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments. _(see system-guidelines.md:204)_
13. [ARCH-0030] Non-forced readers do not repair authoritative state on the hot path. _(see system-guidelines.md:232)_
14. [ARCH-0039] Forbidden patterns: recreating missing rows inside updater code _(see runtime-contracts.md:70)_

### Ownership & Authority Policies

15. [ARCH-0003] If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation. _(see system-guidelines.md:123)_
16. [ARCH-0004] Callers submit intent to owners. They do not reproduce owner logic locally. _(see system-guidelines.md:125)_
17. [ARCH-0006] Forbidden: shadow state for owner-managed lifecycle or readiness _(see system-guidelines.md:137)_
18. [ARCH-0007] Forbidden: fallback paths that reconstruct owner decisions from secondary evidence _(see system-guidelines.md:138)_
19. [ARCH-0019] Events may enqueue owner-key work; they must not execute long-running progression inline. _(see system-guidelines.md:246)_
20. [ARCH-0022] Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions. _(see system-guidelines.md:276)_
21. [ARCH-0032] Temporary delegators may forward to the owner, but must not add a second decision path. _(see runtime-contracts.md:39)_
22. [ARCH-0033] Forbidden runtime patterns: local replacement logic when a composition-root owner is available _(see runtime-contracts.md:46)_
23. [ARCH-0034] Forbidden runtime patterns: owner-unavailable branches that reconstruct equivalent decisions _(see runtime-contracts.md:47)_
24. [ARCH-0042] Forbidden patterns: ad-hoc Maps, Sets, or objects that cache system data outside the declared owner or SystemTableCache _(see runtime-contracts.md:93)_

### Lifecycle & State Machine Rules

25. [ARCH-0013] Forbidden: bags of independent if statements around readiness, admission, retry, phase, lifecycle, or outcome classification _(see system-guidelines.md:163)_
26. [ARCH-0017] INSERT OR REPLACE and full-row replacement are forbidden for steady-state lifecycle/status mutation of existing system rows. _(see system-guidelines.md:221)_
27. [ARCH-0018] Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code. _(see system-guidelines.md:228)_
28. [ARCH-0020] Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path. _(see system-guidelines.md:253)_
29. [ARCH-0031] Steady-state correctness must not depend on phase-owned wiring after phase completion. _(see system-guidelines.md:238)_
30. [ARCH-0036] Forbidden runtime patterns: shadow state for lifecycle, readiness, admission, leader, or routing truth _(see runtime-contracts.md:49)_
31. [ARCH-0037] Forbidden patterns: INSERT OR REPLACE for steady-state lifecycle/status updates _(see runtime-contracts.md:68)_
32. [ARCH-0038] Forbidden patterns: full-row replacement for existing lifecycle rows _(see runtime-contracts.md:69)_
33. [ARCH-0041] Forbidden patterns: one persisted field carrying unrelated claim, lease, workflow, and entity lifecycle semantics _(see runtime-contracts.md:72)_

### Change Data Capture (CDC) Policies

34. [ARCH-0040] Forbidden patterns: broad UPDATE or DELETE statements as the primary CDC mutation path _(see runtime-contracts.md:71)_

### Caching & Observation Rules

35. [ARCH-0009] Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes. _(see system-guidelines.md:149)_
36. [ARCH-0012] Forbidden: decision branches that mix cache and SQL as equivalent truth for one meaning _(see system-guidelines.md:162)_
37. [ARCH-0028] Users do not directly manage partitions, replicas, placement, leader election, message groups, cache hydration, or rebalance workflows. _(see system-guidelines.md:336)_
38. [ARCH-0035] Forbidden runtime patterns: feature-local implementations of existing cache/read/write/retry primitives _(see runtime-contracts.md:48)_

### Timeouts & Budget Management

39. [ARCH-0021] Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget. _(see system-guidelines.md:271)_
40. [ARCH-0025] Callers must not discover overload only through timeout expiry. _(see system-guidelines.md:294)_
