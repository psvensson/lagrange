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

1. [GOV-0003] Session/narrative state (current blocker, handoff notes, working hypotheses) stays in external memory and MUST NOT be copied into in-repo steering. _(see memory-boundary.md:23)_
2. [GOV-0004] Seal the goal. Define doneWhen before implementation begins. Do not change it after the first attempt has been recorded. _(see workflow-guidelines/lifecycle.md:22)_
3. [GOV-0005] They have different jobs and MUST NOT duplicate each other; duplication is how the same "truth" drifts into three conflicting copies. _(see memory-boundary.md:3)_
4. [GOV-0006] Override-tagged advisories are excluded from soft-first quorum counting, so an override never silently spends the quorum ramp. _(see workflow-guidelines/solver-quests.md:584)_
5. [GOV-0007] Do not treat symptom movement as SOLVED. _(see workflow-guidelines/closure.md:51)_
6. [GOV-0008] Delegated agents do not decide whether the Quest is solved. _(see workflow-guidelines/subagents.md:18)_
7. [GOV-0009] The worker must not report done: true as proof. _(see workflow-guidelines/subagents.md:45)_
8. [GOV-0010] The Solver never trusts an agent's claim that work succeeded. _(see workflow-guidelines/validators.md:18)_
9. [GOV-0011] The report projection must not invent terminal status, synthetic attempts, or unmeasured progress. _(see workflow-guidelines/validators.md:42)_
10. [GOV-0014] Broad rows must gain a linked spec or architecture document before active implementation starts. _(see roadmap.md:107)_
11. [GOV-0016] Do not move goalposts in place. _(see workflow-guidelines/solver-quests.md:33)_
12. [GOV-0017] An invalid sample is an honest no-measurement: it never counts as progress, never satisfies doneWhen, and breaks the consecutive-pass streak. _(see workflow-guidelines/solver-quests.md:60)_
13. [GOV-0018] Never treat a blocked or incomplete run as a metric floor. _(see workflow-guidelines/solver-quests.md:60)_
14. [GOV-0021] A cannot_measure park had only non-measuring samples — the harness itself never produced a valid measurement, so the fix is the measurement infrastructure, not the solution space. _(see workflow-guidelines/solver-quests.md:87)_
15. [GOV-0022] An exhausted park had at least one honestly-measured sample but the metric never moved — no honest move remains. _(see workflow-guidelines/solver-quests.md:87)_
16. [GOV-0023] Fix the harness (or change the attempt evidence) before reopening again, so reopen and park can never oscillate forever. _(see workflow-guidelines/solver-quests.md:87)_
17. [GOV-0025] A Quest must not accumulate an unrecoverable dirty tree. _(see workflow-guidelines/solver-quests.md:153)_
18. [GOV-0027] Detectors fire only on real recorded events and never touch the sealed doneWhen. _(see workflow-guidelines/solver-quests.md:168)_
19. [GOV-0028] A lesson that should bind future work for everyone MUST be promoted into in-repo steering via node scripts/solve.js promote-finding (see findings/README.md), NOT left only in external memory. _(see memory-boundary.md:20)_
20. [GOV-0029] Durable operational ground truth has exactly one canonical home, operational-ground-truth.md. AGENTS.md and the external auto-memory MUST link to it rather than restate it. _(see memory-boundary.md:25)_
21. [GOV-0030] Do not revive sprint/package theory state as active authority. _(see workflow-guidelines/solver-quests.md:336)_

### Ownership & Authority Policies

22. [GOV-0024] Do not keep patching under a theory whose owner path is no longer current. _(see workflow-guidelines/solver-quests.md:137)_

### Readiness & Health Contracts

23. [GOV-0020] When a frontier has already parked as cannot_measure (its samples never measured), the verdict rests on untrustworthy data. _(see workflow-guidelines/solver-quests.md:77)_

### Timeouts & Budget Management

24. [GOV-0019] The retry is bounded by CANNOTMEASURERETRYBUDGET: once that many consecutive samples on a frontier fail to measure, the frontier parks as cannotmeasure (a harness verdict), never as exhausted. _(see workflow-guidelines/solver-quests.md:60)_

### Governance & Scope Controls

25. [GOV-0001] Roadmap corrections discovered during implementation should land with the Quest changes that discovered them. Do not leave truth repair as chat-only memory. _(see roadmap.md:128)_
26. [GOV-0002] Do not use roadmap state to claim Quest closure. Closure requires Solver terminal evidence. _(see roadmap.md:131)_
27. [GOV-0012] The Quest must cite or encode enough scope context to prevent local invention. _(see roadmap.md:76)_
28. [GOV-0013] The row must be in scope for this repository under ../../edition-matrix.md. _(see roadmap.md:106)_
29. [GOV-0015] The Quest must name the roadmap row, approved maintenance scope, or explicit user request that makes it valid. _(see roadmap.md:111)_
30. [GOV-0026] Each auto-commit refuses when audit does not pass, stages only the Quest's in-scope pathspec (never the dirty-tree shape), and carries the Co-authored-by: Copilot trailer. _(see workflow-guidelines/solver-quests.md:153)_
