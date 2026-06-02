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
2. [GOV-0004] Do not treat symptom movement as SOLVED. _(see workflow-guidelines/closure.md:51)_
3. [GOV-0005] Delegated agents do not decide whether the Quest is solved. _(see workflow-guidelines/subagents.md:18)_
4. [GOV-0006] The worker must not report done: true as proof. _(see workflow-guidelines/subagents.md:45)_
5. [GOV-0007] The Solver never trusts an agent's claim that work succeeded. _(see workflow-guidelines/validators.md:18)_
6. [GOV-0008] The report projection must not invent terminal status, synthetic attempts, or unmeasured progress. _(see workflow-guidelines/validators.md:42)_
7. [GOV-0011] Broad rows must gain a linked spec or architecture document before active implementation starts. _(see roadmap.md:107)_
8. [GOV-0013] Do not move goalposts in place. _(see workflow-guidelines/solver-quests.md:33)_
9. [GOV-0014] An invalid sample is an honest no-measurement: it never counts as progress, never satisfies doneWhen, breaks the consecutive-pass streak, and climbs the strategy ladder like any other stall. _(see workflow-guidelines/solver-quests.md:60)_
10. [GOV-0015] Never treat a blocked or incomplete run as a metric floor. _(see workflow-guidelines/solver-quests.md:60)_
11. [GOV-0016] Do not revive sprint/package theory state as active authority. _(see workflow-guidelines/solver-quests.md:124)_
12. [GOV-0017] If the verifier finds issues, fix them or record a finding that explains why the Quest must continue; do not proceed to git handoff from an unresolved verifier finding. _(see workflow-guidelines/solver-quests.md:186)_
13. [GOV-0018] Do not include unrelated dirty worktree entries from another Quest. _(see workflow-guidelines/solver-quests.md:197)_
14. [GOV-0019] Do not rely on solve/state/ as durable memory. _(see workflow-guidelines/solver-quests.md:258)_
15. [GOV-0021] constraints[]: optional hard limits the agent must preserve. _(see workflow-guidelines/solver-quests.md:53)_
16. [GOV-0023] model: selected frontier theory, active system theory, and --modelRef or --modelNotApplicable required. _(see workflow-guidelines/solver-quests.md:134)_
17. [GOV-0025] THEORY_REQUIRED: the selected rung needs system or frontier theory before another attempt; record the theory and resume instead of patching through it. _(see workflow-guidelines/solver-quests.md:243)_
18. [GOV-0027] Durable conclusions must be recorded with node scripts/solve.js finding before they are relied on by later attempts. _(see workflow-guidelines/subagents.md:50)_
19. [GOV-0028] Later attempts must use the same sealed goalposts. _(see workflow-guidelines/validators.md:37)_
20. [GOV-0030] The verifier must inspect the Quest intent, touched source diff, system guidelines, and applicable doctrine. _(see workflow-guidelines/solver-quests.md:174)_

### Readiness & Health Contracts

21. [GOV-0029] Every Quest that changes source code must spawn a subagent verifier after the final source diff is ready and before node scripts/solve.js audit --id <id> is used for handoff. _(see workflow-guidelines/solver-quests.md:174)_

### Testing & Harness Guidelines

22. [GOV-0024] change-approach: selected frontier theory remains required; model evidence is not required unless this rung explicitly returns to a model test. _(see workflow-guidelines/solver-quests.md:136)_
23. [GOV-0026] Use source, test, architecture, and steering files for the implementation or documentation changes required by the Quest. _(see workflow-guidelines/quest-artifacts.md:49)_

### Governance & Scope Controls

24. [GOV-0001] Roadmap corrections discovered during implementation should land with the Quest changes that discovered them. Do not leave truth repair as chat-only memory. _(see roadmap.md:128)_
25. [GOV-0002] Do not use roadmap state to claim Quest closure. Closure requires Solver terminal evidence. _(see roadmap.md:131)_
26. [GOV-0009] The Quest must cite or encode enough scope context to prevent local invention. _(see roadmap.md:76)_
27. [GOV-0010] The row must be in scope for this repository under ../../edition-matrix.md. _(see roadmap.md:106)_
28. [GOV-0012] The Quest must name the roadmap row, approved maintenance scope, or explicit user request that makes it valid. _(see roadmap.md:111)_
29. [GOV-0020] Such examples must not define implementation tasks in this repository unless the active Quest explicitly limits the work to AGPL-owned substrate and excludes paid-only behavior, operator flows, and control surfaces. _(see roadmap.md:96)_
30. [GOV-0022] widen-scope: selected frontier theory required. _(see workflow-guidelines/solver-quests.md:133)_
