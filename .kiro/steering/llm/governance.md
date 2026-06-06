---
scope: governance
status: compiled
always_load: false
source_of_truth: .kiro/steering/ (see llm-pack.config.json sources for governance)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `.kiro/steering/`.

# Governance Steering Pack

Load for roadmap and edition-scope checks.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

## Rules

### General Guidelines

1. [GOV-0003] Seal the goal. Define doneWhen before implementation begins. Do not change it after the first attempt has been recorded. _(see workflow-guidelines/lifecycle.md:22)_
2. [GOV-0004] Override-tagged advisories are excluded from soft-first quorum counting, so an override never silently spends the quorum ramp. _(see workflow-guidelines/solver-quests.md:584)_
3. [GOV-0005] Do not treat symptom movement as SOLVED. _(see workflow-guidelines/closure.md:51)_
4. [GOV-0006] Delegated agents do not decide whether the Quest is solved. _(see workflow-guidelines/subagents.md:18)_
5. [GOV-0007] The worker must not report done: true as proof. _(see workflow-guidelines/subagents.md:45)_
6. [GOV-0008] The Solver never trusts an agent's claim that work succeeded. _(see workflow-guidelines/validators.md:18)_
7. [GOV-0009] The report projection must not invent terminal status, synthetic attempts, or unmeasured progress. _(see workflow-guidelines/validators.md:42)_
8. [GOV-0012] Broad rows must gain a linked spec or architecture document before active implementation starts. _(see roadmap.md:107)_
9. [GOV-0014] Do not move goalposts in place. _(see workflow-guidelines/solver-quests.md:33)_
10. [GOV-0015] An invalid sample is an honest no-measurement: it never counts as progress, never satisfies doneWhen, and breaks the consecutive-pass streak. _(see workflow-guidelines/solver-quests.md:60)_
11. [GOV-0016] Never treat a blocked or incomplete run as a metric floor. _(see workflow-guidelines/solver-quests.md:60)_
12. [GOV-0019] A cannot_measure park had only non-measuring samples — the harness itself never produced a valid measurement, so the fix is the measurement infrastructure, not the solution space. _(see workflow-guidelines/solver-quests.md:87)_
13. [GOV-0020] An exhausted park had at least one honestly-measured sample but the metric never moved — no honest move remains. _(see workflow-guidelines/solver-quests.md:87)_
14. [GOV-0021] Fix the harness (or change the attempt evidence) before reopening again, so reopen and park can never oscillate forever. _(see workflow-guidelines/solver-quests.md:87)_
15. [GOV-0023] A Quest must not accumulate an unrecoverable dirty tree. _(see workflow-guidelines/solver-quests.md:153)_
16. [GOV-0025] Detectors fire only on real recorded events and never touch the sealed doneWhen. _(see workflow-guidelines/solver-quests.md:168)_
17. [GOV-0026] Do not revive sprint/package theory state as active authority. _(see workflow-guidelines/solver-quests.md:336)_
18. [GOV-0027] If the verifier finds issues, fix them or record a finding that explains why the Quest must continue; do not proceed to git handoff from an unresolved verifier finding. _(see workflow-guidelines/solver-quests.md:399)_
19. [GOV-0028] Do not include unrelated dirty worktree entries from another Quest. _(see workflow-guidelines/solver-quests.md:410)_
20. [GOV-0029] A confirmed or refuted discrimination is investigative progress only; it never satisfies doneWhen and never substitutes for measured product progress. _(see workflow-guidelines/solver-quests.md:457)_

### Ownership & Authority Policies

21. [GOV-0022] Do not keep patching under a theory whose owner path is no longer current. _(see workflow-guidelines/solver-quests.md:137)_

### Readiness & Health Contracts

22. [GOV-0018] When a frontier has already parked as cannot_measure (its samples never measured), the verdict rests on untrustworthy data. _(see workflow-guidelines/solver-quests.md:77)_

### Timeouts & Budget Management

23. [GOV-0017] The retry is bounded by CANNOTMEASURERETRYBUDGET: once that many consecutive samples on a frontier fail to measure, the frontier parks as cannotmeasure (a harness verdict), never as exhausted. _(see workflow-guidelines/solver-quests.md:60)_
24. [GOV-0030] A per-frontier investigation budget (INVESTIGATION_BUDGET) caps how many distinct theories can hold a rung before the ladder resumes climbing, so investigation can never become its own infinite loop. _(see workflow-guidelines/solver-quests.md:457)_

### Governance & Scope Controls

25. [GOV-0001] Roadmap corrections discovered during implementation should land with the Quest changes that discovered them. Do not leave truth repair as chat-only memory. _(see roadmap.md:128)_
26. [GOV-0002] Do not use roadmap state to claim Quest closure. Closure requires Solver terminal evidence. _(see roadmap.md:131)_
27. [GOV-0010] The Quest must cite or encode enough scope context to prevent local invention. _(see roadmap.md:76)_
28. [GOV-0011] The row must be in scope for this repository under ../../edition-matrix.md. _(see roadmap.md:106)_
29. [GOV-0013] The Quest must name the roadmap row, approved maintenance scope, or explicit user request that makes it valid. _(see roadmap.md:111)_
30. [GOV-0024] Each auto-commit refuses when audit does not pass, stages only the Quest's in-scope pathspec (never the dirty-tree shape), and carries the Co-authored-by: Copilot trailer. _(see workflow-guidelines/solver-quests.md:153)_
