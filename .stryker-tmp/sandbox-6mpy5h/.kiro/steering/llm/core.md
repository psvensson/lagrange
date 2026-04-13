# Core Steering Pack

Always-load compact rules for ownership, safety, scope, and quality baseline.

Generated rules: 48
Estimated tokens: 1433
Domains: architecture, governance, style, testing

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
13. [ARCH-0013] participant executors emit outcomes and do not persist owner-managed phase transitions directly
14. [ARCH-0014] cache visibility, timer age, or incidental row observation do not prove executor-owned phase completion
15. [ARCH-0015] Do not implement ad-hoc cross-owner write ordering to emulate atomicity.
16. [ARCH-0016] Do not retain sequential fallback branches for atomic topology cut points.
17. [ARCH-0017] Do not create a second workflow engine for control-plane operations when DurableWorkflowCoordinator already owns the workflow contract.
18. [ARCH-0018] A single decision path MUST NOT mix cache and SQL fallbacks for the same semantic meaning.
19. [ARCH-0019] Cache visibility MUST NOT complete an executor-owned topology phase on its own.
20. [ARCH-0020] If an existing primitive is missing one capability, extend the primitive. Do not fork the logic into a feature-local implementation.
21. [ARCH-0021] Nested operations MUST derive from remaining budget; they MUST NOT start with fresh default full budgets.
22. [ARCH-0022] Operations MUST NOT fail, return incorrect results, or silently drop work because the system is under load.
23. [ARCH-0023] Control-plane pressure (splits, rebalance, leader elections) MUST NOT cause data-plane or query-plane failures. The query path may slow down while the control plane is busy, but it must not break.
24. [ARCH-0024] Readiness, admission, and routing decisions MUST remain correct during topology transitions. Transient internal state lag (cache propagation delay, lease expiry race) MUST NOT surface as user-visible errors.
25. [ARCH-0025] Bounded retry window — query-path retries MUST be bounded by the caller's timeout budget. Do not retry indefinitely.
26. [ARCH-0026] Write-if-not-exists for creation — row creation MUST use insert-if-not-exists semantics (or equivalent) so duplicate creation attempts do not corrupt existing state.
27. [ARCH-0027] Do not create ad-hoc Maps, Sets, or objects that cache system data outside the system cache. If you need system data, read it from the cache or SQL.
28. [ARCH-0028] Do not create direct function calls between services that bypass the router for operations that should be messages.
29. [STYLE-0001] Do not introduce synonyms for an existing concept.
30. [TEST-0001] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
31. [TEST-0002] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
32. [TEST-0003] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
33. [TEST-0004] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
34. [TEST-0005] STOP - Do not accept the test as passing
35. [TEST-0006] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
36. [TEST-0007] Do not comment out tests to avoid running them
37. [TEST-0008] If a test is failing, fix the code or the test - do not skip it
38. [STYLE-0002] NEVER introduce eslint override comments.
39. [STYLE-0003] Shared domain literals belong in their canonical owner module and must be imported from there.
40. [GOV-0001] The row must be in scope for this repository under ../../edition-matrix.md.
41. [GOV-0002] Broad rows must gain a linked spec or architecture document before active implementation starts.
42. [STYLE-0004] All code must be written with ESLint rules in mind from the start.
43. [GOV-0003] The implementation home remains AGPL repo, or the user explicitly asks for AGPL-scoped preparatory work only.
44. [GOV-0004] The work does not implement paid-only behavior, paid-only operator flows, or paid-only control surfaces in this repository.
45. [GOV-0005] A row may move to active implementation only when the intended behavior is sharp enough to produce tasks without inventing scope locally.
46. [STYLE-0005] Indentation: Use 2 spaces (not tabs)
47. [STYLE-0006] Quotes: Use single quotes for strings
48. [GOV-0006] Shared substrate work may happen in this repository only when all of the following are true:
