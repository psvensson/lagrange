---
scope: testing
status: compiled
always_load: false
source_of_truth: docs/steering/ (see llm-pack.config.json sources for testing)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `docs/steering/`.

# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

> **Priority subset — showing 35 of 98 testing rules** (99 incl. cross-domain aliases; alias rows are marked in `rules-index.md`) (capped per `maxRules` in `llm-pack.config.json`). The IDs below are NOT gapless: 63 lower-priority rules are omitted. For every testing rule, see [`rules-index.md`](rules-index.md) or run `npm run rule -- --domain testing`.

## Rules

### General Guidelines

1. [TEST-0002] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism _(see testing-guidelines/fixtures.md:35)_
2. [TEST-0003] Do not comment out tests to avoid running them _(see testing-guidelines/fixtures.md:36)_
3. [TEST-0005] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests. _(see testing-guidelines/fixtures.md:54)_
4. [TEST-0007] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call. _(see testing-guidelines/fixtures.md:58)_
5. [TEST-0009] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. _(see testing-guidelines/fixtures.md:62)_
6. [TEST-0011] A Quest must not report SOLVED until its required validation has passed. _(see testing-guidelines/proof-ladders.md:25)_
7. [TEST-0013] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both. _(see testing-guidelines/regression-policy.md:56)_
8. [TEST-0014] Do not close the second bug with only a local patch if the porous boundary remains unchanged. _(see testing-guidelines/regression-policy.md:141)_
9. [TEST-0015] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline. _(see testing-guidelines/regression-policy.md:197)_
10. [TEST-0016] Do not claim SOLVED on local green proof alone while the reference scenario still fails for a different named reason. _(see testing-guidelines/release-gate.md:32)_
11. [TEST-0017] A lever that passes its own unit DT but never moves the real observable is NOT proven; do NOT advance it to a gate. Reproduce the observable deterministically in-process first. _(see testing-guidelines/release-gate.md:92)_
12. [TEST-0019] Do not defer the failure. When the failure is in the touched area, or was surfaced by the runs you chose to perform, you must resolve it before closing the current task. _(see testing-guidelines/regression-policy.md:377)_
13. [TEST-0020] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop. _(see testing-guidelines/regression-policy.md:407)_
14. [TEST-0021] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists. _(see testing-guidelines/regression-policy.md:413)_
15. [TEST-0022] NEVER ship a change to a hot failure-handling path (retry, recovery, failure-classification, backoff) without a controlled live A/B: N≥2 runs fixed vs N≥2 reverted, comparing aggregate error counts and outcome. _(see findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:5)_
16. [TEST-0023] You MUST NOT convert a defer/backoff on a hot failure path into advance-now work (extra reads, re-inserts) without that live A/B proof — a defer during churn is often the load-shedding that lets prerequisites settle. _(see findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:7)_
17. [TEST-0025] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass. _(see testing-guidelines/fixtures.md:45)_
18. [TEST-0029] Do NOT reach for unref() on awaited sleeps — that lets the process exit mid-await and has broken suites before. _(see testing-guidelines/harness.md:68)_
19. [TEST-0031] Work must not close while the touched area remains red. _(see testing-guidelines/regression-policy.md:388)_
20. [TEST-0032] The active Quest must define the required validation surface. _(see testing-guidelines/proof-ladders.md:22)_
21. [TEST-0076] Live-refutation two-strikes. When live/measured evidence contradicts a sealed statement or a fix claim TWICE, the framing — not the next patch — is what must change: EXHAUST and re-author, widen the class, or escalate altitude (affinity-demo runs 25/26: two live refutations of green-DT closures exposed a mechanism the framing had missed). _(see testing-guidelines/regression-policy.md:114)_

### Ownership & Authority Policies

22. [TEST-0001] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row _(see testing-guidelines/fixtures.md:23)_
23. [TEST-0012] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard. _(see testing-guidelines/proof-ladders.md:111)_

### Testing & Harness Guidelines

24. [TEST-0004] If a test is failing, fix the code or the test - do not skip it _(see testing-guidelines/fixtures.md:37)_
25. [TEST-0006] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic. _(see testing-guidelines/fixtures.md:56)_
26. [TEST-0008] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up. _(see testing-guidelines/fixtures.md:60)_
27. [TEST-0010] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested. _(see testing-guidelines/fixtures.md:120)_
28. [TEST-0018] Do not ignore a failing test. A failing test indicates broken functionality and must be treated as a stop-the-line signal for the touched area. _(see testing-guidelines/regression-policy.md:376)_
29. [TEST-0024] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path. _(see testing-guidelines/fixtures.md:28)_
30. [TEST-0026] Mechanical test edits (renames, import updates, timeout adjustments, formatting) do NOT trigger this gate. _(see testing-guidelines/fixtures.md:104)_
31. [TEST-0027] Do not reclassify a slow unit test as "integration" to dodge the hard error — move the file into the integration set only if it genuinely needs the integration harness. _(see testing-guidelines/harness.md:56)_
32. [TEST-0028] When a test exceeds its duration limit (2 seconds for a unit test, 30 seconds for an integration test) you must not accept it as passing; remediate before proceeding by identifying the root cause and then resolving it. _(see testing-guidelines/harness.md:64)_
33. [TEST-0030] A test that fails because behavior regressed MUST be fixed (in the code or the test), and MUST NEVER be deleted or skipped to make the suite green; deletion is reserved for behavior that was intentionally removed. _(see testing-guidelines/regression-policy.md:382)_

### Code Style & Formatting Guidelines

34. [TEST-0052] Soft-warning two-strikes. The SAME soft warning (a load-flake, a tolerated timeout, a "known transient") appearing in two consecutive runs of the same scenario MUST be treated as a failing assertion, not background noise: before the third run, open a finding and either fix the cause, re-derive the threshold with evidence, or promote it to a hard failure — NEVER carry the same "proceeding anyway" past run 2. Strike identity is precise: the same warning CODE (a softBreaches[].reasonCode/invariantId or an assertion-policy softWarnings[].code such as insufficient_evidence) plus the same scenario id, in the two most recent consecutive runs of that scenario, regardless of which session produced them; a code absent from either of those two runs does not strike. The machine check is npm run analyze:soft-warning-strikes (optionally -- --scenario <id>): it scans the run-report corpus and exits nonzero naming each striking code+scenario. _(see testing-guidelines/regression-policy.md:99)_

### Governance & Scope Controls

35. [TEST-0033] Tests added during the change must match the Quest concern rather than an unrelated umbrella scope. _(see testing-guidelines/proof-ladders.md:23)_
