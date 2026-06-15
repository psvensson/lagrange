---
scope: architecture
status: compiled
always_load: false
source_of_truth: steering/ (see pack.config.json sources for architecture)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `steering/`.

# Architecture Steering Pack

Load for ownership, lifecycle, runtime-contract, and state-machine work.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

## Rules

### General Guidelines

1. [ARCH-0001] Model choice notes are advisory only. They never replace validation, delegated review, Solver attempts, or terminal reports. _(see system-guidelines.md:92)_
2. [ARCH-0005] null and undefined MUST NOT encode runtime or domain state. Use an explicit named state variant. _(see system-guidelines.md:164)_
3. [ARCH-0006] Each concept has one name. Do not add synonyms for existing concepts. _(see system-guidelines.md:167)_
4. [ARCH-0007] Do not introduce ordinal, segment, or grab-bag source filenames such as part-2, segment, misc, helpers, or utils unless that name is an established domain concept. _(see system-guidelines.md:170)_
5. [ARCH-0014] Throughput may fall under pressure; correctness must not. _(see system-guidelines.md:278)_
6. [ARCH-0015] Operations must not fail, return incorrect results, leak memory, or silently drop work because the system is under load. _(see system-guidelines.md:279)_
7. [ARCH-0018] Do not add alternate fast paths such as direct local handler calls, ad-hoc sockets, admin API forwarding, or service-to-service in-process bypasses. _(see system-guidelines.md:301)_
8. [ARCH-0020] Diagnostics, admin, harness, and reporting surfaces that consume a boundary must reuse the same grammar or declare a bounded view role, and must not invent a new dominant reason by reassembling lower-layer fragments. _(see system-guidelines.md:191)_
9. [ARCH-0021] Non-forced readers do not repair authoritative state on the hot path. _(see system-guidelines.md:219)_
10. [ARCH-0028] DO NOT pre-slice candidates to the requested count before admission; do not prematurely narrow inputs before the authoritative decision. _(see runtime-contracts.md:296)_
11. [ARCH-0029] Terminal success is monotonic and MUST NOT be rewritten by unrelated sweeps. _(see runtime-contracts.md:312)_
12. [ARCH-0030] Every state-mutating operation against a stored record must be addressed by the record's stable identity, not by positional or incidental lookup. _(see system-guidelines.md:210)_
13. [ARCH-0036] Architectural exceptions must be explicit, owned, time-bounded, and recorded in an active spec or architecture note with a removal checkpoint. _(see system-guidelines.md:356)_
14. [ARCH-0039] All non-trivial implementation work MUST follow the Quest workflow. _(see system-guidelines.md:80)_

### Ownership & Authority Policies

15. [ARCH-0002] If the existing owner lacks one capability, extend that owner. Do not fork a feature-local implementation. _(see system-guidelines.md:109)_
16. [ARCH-0003] Callers submit intent to owners. They do not reproduce owner logic locally. _(see system-guidelines.md:111)_
17. [ARCH-0010] Events may enqueue owner-key work; they must not execute long-running progression inline. _(see system-guidelines.md:234)_
18. [ARCH-0013] Missing owner dependencies fail loudly with typed errors. They do not synthesize "allow by default" or equivalent fallback decisions. _(see system-guidelines.md:265)_
19. [ARCH-0023] Temporary delegators MAY forward to the owner, but MUST NOT add a second decision path. _(see runtime-contracts.md:41)_
20. [ARCH-0025] The owner record for an identity owns that identity; supporting rows do not. _(see runtime-contracts.md:152)_
21. [ARCH-0026] Participant executors emit outcomes and MUST NOT persist owner-managed phase transitions directly. _(see runtime-contracts.md:244)_
22. [ARCH-0031] Subscribers, bridges, queues, retry loops, cache hydration paths, and repair scheduling created by a phase must transfer to an explicit runtime owner before the phase completes. _(see system-guidelines.md:231)_
23. [ARCH-0032] Quest validation must prove the owner path and affected tail consumers. _(see system-guidelines.md:342)_
24. [ARCH-0037] Bootstrap, join, and recovery phases MUST NOT remain the steady-state owner after the phase completes. _(see runtime-contracts.md:184)_
25. [ARCH-0040] Every state transition, lifecycle decision, data transformation, cache view, diagnostic grammar, and runtime resource MUST have one semantic owner. _(see system-guidelines.md:101)_

### Lifecycle & State Machine Rules

26. [ARCH-0008] Blind full-record overwrite is forbidden for steady-state lifecycle/status mutation of existing records. _(see system-guidelines.md:208)_
27. [ARCH-0009] Bootstrap shortcuts are phase-scoped exceptions only; they must not remain reachable from steady-state runtime code. _(see system-guidelines.md:216)_
28. [ARCH-0011] Phase completion removes temporary scaffolding only, never the sole live dissemination, observation, admission, or repair path. _(see system-guidelines.md:241)_
29. [ARCH-0022] Steady-state correctness must not depend on phase-owned wiring after phase completion. _(see system-guidelines.md:225)_

### Readiness & Health Contracts

30. [ARCH-0027] Degraded or cross-source evidence MAY explain or defer, but MUST NOT upgrade a blocked entity to ready or admitted. _(see runtime-contracts.md:281)_

### Caching & Observation Rules

31. [ARCH-0004] Runtime logic consumes normalized state; it must not reopen raw storage, transport, bootstrap, cache, or wire shapes. _(see system-guidelines.md:135)_
32. [ARCH-0019] Users do not directly manage internal scheduling, work distribution, transport, or cache-hydration machinery. _(see system-guidelines.md:327)_
33. [ARCH-0024] Reader-local caches MUST NOT memoize stale or deferred blocked answers as fresh observations. _(see runtime-contracts.md:125)_
34. [ARCH-0038] During transient internal reconfiguration (migrations, failovers, cache rebuilds), requests MAY be slower but MUST NOT fail because state is transient. _(see runtime-contracts.md:365)_

### Background & Maintenance Work

35. [ARCH-0017] Background/maintenance work pressure must not cause foreground request correctness failures. _(see system-guidelines.md:284)_
36. [ARCH-0033] Static guardrail proof is required for touched runtime, background-work, diagnostics, admin, harness, or shared test infrastructure boundaries. _(see system-guidelines.md:343)_

### Timeouts & Budget Management

37. [ARCH-0012] Timeout budgets are canonical: nested work derives from remaining budget and never starts with a fresh default full budget. _(see system-guidelines.md:260)_
38. [ARCH-0016] Callers must not discover overload only through timeout expiry. _(see system-guidelines.md:283)_

### Testing & Harness Guidelines

39. [ARCH-0034] Before closure, perform the affected-area deep dive required by workflow/INDEX.md and testing/INDEX.md. _(see system-guidelines.md:345)_

### Governance & Scope Controls

40. [ARCH-0035] Known in-scope doctrine or system-guideline violations in the affected area must be fixed before Quest closure. _(see system-guidelines.md:348)_
