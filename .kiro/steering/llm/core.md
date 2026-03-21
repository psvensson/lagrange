# Core Steering Pack

Always-load compact rules for ownership, safety, scope, and quality baseline.

Generated rules: 45
Estimated tokens: 1391
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
29. [TEST-0001] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
30. [TEST-0002] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
31. [TEST-0003] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
32. [TEST-0004] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
33. [TEST-0005] STOP - Do not accept the test as passing
34. [TEST-0006] Do not use higher values like numRuns: 100 or the default
35. [TEST-0007] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
36. [TEST-0008] Do not comment out tests to avoid running them
37. [GOV-0001] ../../product-roadmap.md is visibility-only and must not be used as an implementation source here.
38. [STYLE-0001] NEVER introduce eslint override comments!
39. [STYLE-0002] Do not defer guideline conformance to a follow-up.
40. [STYLE-0003] All code must be written with ESLint rules in mind from the start.
41. [STYLE-0004] There must be just one way of doing something.
42. [STYLE-0005] There must be no legacy or fallback code.
43. [STYLE-0006] Every completed change must pass a self-review against doctrine.md and the system guidelines (system guidelines.md).
44. [GOV-0002] ../../roadmap.md is the only roadmap that may drive specs, tasks, or code in this repository.
45. [GOV-0003] Any feature whose Implementation home is not AGPL repo in ../../edition-matrix.md is out of scope for implementation in this repository.
