---
scope: governance
status: compiled
always_load: false
source_of_truth: docs/steering/ (see llm-pack.config.json sources for governance)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `docs/steering/`.

# Governance Steering Pack

Load for roadmap and edition-scope checks.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

> **Priority subset — showing 30 of 125 governance rules** (capped per `maxRules` in `llm-pack.config.json`). The IDs below are NOT gapless: 95 lower-priority rules are omitted. For every governance rule, see [`rules-index.md`](rules-index.md) or run `npm run rule -- --domain governance`.

## Rules

### General Guidelines

1. [GOV-0001] Parallel or duplicated machinery discovered on contact MUST be recorded as a consolidation candidate, never silently worked around. _(see findings/2026-07-10-reuse-comparison-before-new-machinery.md:7)_
2. [GOV-0004] Session/narrative state (current blocker, handoff notes, working hypotheses) stays in external memory and MUST NOT be copied into in-repo steering. _(see memory-boundary.md:29)_
3. [GOV-0005] docs/ holds documentation, never active work definition: user/operator-facing docs, the agent steering tree under docs/steering/, and internal engineering plans. _(see roadmap.md:84)_
4. [GOV-0006] Tests never pin a flag (see testing-guidelines/fixtures.md "No Flag-Coupled Tests"). _(see roadmap.md:146)_
5. [GOV-0007] after audit passes, commit every Quest-scoped change (the Solver never pushes; see "Regular Commit (No Push)" below). _(see workflow-guidelines/solver-quests.md:41)_
6. [GOV-0008] Hypotheses = theory records (falsifiable, supersedable), never fields of the sealed file. _(see workflow-guidelines/solver-quests.md:106)_
7. [GOV-0009] The in-repo and external memory systems have different jobs and MUST NOT duplicate each other; duplication is how the same "truth" drifts into three conflicting copies. _(see memory-boundary.md:3)_
8. [GOV-0010] Do not treat symptom movement as SOLVED. _(see workflow-guidelines/closure.md:61)_
9. [GOV-0011] Delegated agents do not decide whether the Quest is solved. _(see workflow-guidelines/subagents.md:18)_
10. [GOV-0012] The worker must not report done: true as proof. _(see workflow-guidelines/subagents.md:45)_
11. [GOV-0013] The Solver never trusts an agent's claim that work succeeded. _(see workflow-guidelines/validators.md:18)_
12. [GOV-0014] The report projection must not invent terminal status, synthetic attempts, or unmeasured progress. _(see workflow-guidelines/validators.md:51)_
13. [GOV-0015] Every fix design and quest report MUST carry a visible REUSED vs EXTENDED vs NEW comparison: which existing mechanism each piece rides, and for anything NEW, evidence that no existing mechanism already covers it. _(see findings/2026-07-10-reuse-comparison-before-new-machinery.md:5)_
14. [GOV-0018] Broad rows must gain a linked spec or architecture document before active implementation starts. _(see roadmap.md:111)_
15. [GOV-0020] Do not move goalposts in place. _(see workflow-guidelines/solver-quests.md:44)_
16. [GOV-0021] Do not embed a diagnosed ROOT narrative in the statement: put causal roots, suspected mechanisms, and next-leg rationale in findings, planDoc, or Quest-native theory records, where they stay falsifiable. _(see workflow-guidelines/solver-quests.md:79)_
17. [GOV-0022] When a root is falsified mid-Quest, record the superseding finding — never edit the sealed statement or doneWhen. _(see workflow-guidelines/solver-quests.md:82)_
18. [GOV-0023] Two legitimate Quest shapes have different closure bars; do not conflate them. _(see workflow-guidelines/solver-quests.md:139)_
19. [GOV-0024] An invalid sample is an honest no-measurement: it never counts as progress, never satisfies doneWhen, and breaks the consecutive-pass streak. _(see workflow-guidelines/solver-quests.md:163)_
20. [GOV-0026] Never treat a blocked or incomplete run as a metric floor. _(see workflow-guidelines/solver-quests.md:174)_
21. [GOV-0027] When a frontier has already parked as cannot_measure (its samples never measured), the verdict rests on untrustworthy data. _(see workflow-guidelines/solver-quests.md:176)_
22. [GOV-0028] An exhausted park had at least one honestly-measured sample but the metric never moved — no honest move remains. _(see workflow-guidelines/solver-quests.md:186)_
23. [GOV-0029] A cannot_measure park had only non-measuring samples — the harness itself never produced a valid measurement, so the fix is the measurement infrastructure, not the solution space. _(see workflow-guidelines/solver-quests.md:187)_
24. [GOV-0030] Fix the harness (or change the attempt evidence) before reopening again, so reopen and park can never oscillate forever. _(see workflow-guidelines/solver-quests.md:193)_

### Timeouts & Budget Management

25. [GOV-0025] The retry is bounded by CANNOT_MEASURE_RETRY_BUDGET: once that many consecutive samples on a frontier fail to measure, the frontier parks as cannot_measure (a harness verdict), never as exhausted. _(see workflow-guidelines/solver-quests.md:170)_

### Governance & Scope Controls

26. [GOV-0002] Roadmap corrections discovered during implementation should land with the Quest changes that discovered them. Do not leave truth repair as chat-only memory. _(see roadmap.md:132)_
27. [GOV-0003] Do not use roadmap state to claim Quest closure. Closure requires Solver terminal evidence. _(see roadmap.md:135)_
28. [GOV-0016] The Quest must cite or encode enough scope context to prevent local invention. _(see roadmap.md:79)_
29. [GOV-0017] The row must be in scope for this repository under the repo-root edition-matrix.md. _(see roadmap.md:110)_
30. [GOV-0019] The Quest must name the roadmap row, approved maintenance scope, or explicit user request that makes it valid. _(see roadmap.md:115)_
