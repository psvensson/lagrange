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

1. [GOV-0003] Do not create a new package solely for changed artifact timestamps, epochs, node ids, counters, or presentation-only shape. _(see roadmap.md:187)_
2. [GOV-0005] Escalate to causal analysis when repeated local fixes or classifications do not make the representative gate pass. _(see workflow-guidelines/lifecycle.md:37)_
3. [GOV-0006] Do not create heading, directory, checkbox, or sidecar status systems that contradict the filename. _(see workflow-guidelines/packages.md:25)_
4. [GOV-0007] Do not archive package files into a second package-status directory. _(see workflow-guidelines/packages.md:28)_
5. [GOV-0008] Run validation before committing so current-blocker never points at a missing active-... package. _(see workflow-guidelines/packages.md:79)_
6. [GOV-0009] If the fixture/probe is missing, create the fixture/probe or stop as evidence-incomplete. Do not patch runtime from a representative red run alone. _(see workflow-guidelines/subagents.md:244)_
7. [GOV-0012] Do not open a new package merely because artifact path, epoch, node ids, counts, attempts, timings, timestamps, or presentation shape changed. _(see workflow-guidelines/closure.md:494)_
8. [GOV-0014] Sprint files do not replace work packages. _(see roadmap.md:97)_
9. [GOV-0015] docs/ is reserved for end-user or operator-facing documentation. Internal planning, work-package execution, and sprint tracking must not live there. _(see roadmap.md:112)_
10. [GOV-0017] If the system theory cannot select a slice, do not open another local runtime patch. _(see workflow-guidelines/closure.md:166)_
11. [GOV-0019] Do not invent historical proof. _(see workflow-guidelines/packages.md:53)_
12. [GOV-0020] Do not leave the repository between package states. _(see workflow-guidelines/packages.md:66)_
13. [GOV-0024] freshness-review is different: parent-session, local/manual, or generic Codex labels do not satisfy it. _(see workflow-guidelines/subagents.md:42)_
14. [GOV-0025] These optional roles do not replace the freshness-review, implementation, and verification-fix roles when those roles are required. _(see workflow-guidelines/subagents.md:71)_
15. [GOV-0026] work/sprints/current-blocker.json is generated handoff state, but it must not be stale. _(see workflow-guidelines/subagents.md:204)_
16. [GOV-0028] Do not close if relevant guardrail counts increase. _(see workflow-guidelines/validators.md:35)_
17. [GOV-0030] Do not open another classification package from the same unchanged artifact. _(see workflow-guidelines/closure.md:300)_

### Ownership & Authority Policies

18. [GOV-0004] Non-goals and forbidden interpretations: meanings, consumers, owner boundaries, or downstream symptoms this package must not treat as authority. _(see workflow-guidelines/closure.md:29)_
19. [GOV-0010] Do not create another classification-only package from the same unchanged artifact unless owner/boundary, package class, or stop condition changes. Close, rerun fresh evidence, or escalate. _(see workflow-guidelines/closure.md:267)_
20. [GOV-0011] Refresh the sprint gate card whenever the representative artifact, canonical owner boundary, or required action changes. _(see workflow-guidelines/closure.md:418)_
21. [GOV-0013] Escalate to causal analysis when two focused fixes in adjacent owner boundaries are green locally but do not produce representative green or monotonic representative reduction. _(see workflow-guidelines/closure.md:536)_
22. [GOV-0018] Use the lightweight maintenance lane for small internal docs, workflow, template, and tooling changes that do not change runtime ownership or shared runtime contracts. _(see workflow-guidelines/lifecycle.md:69)_
23. [GOV-0021] Do not create new headings, sidecar files, ledger rows, or current-blocker edits from discovery thinking unless the selected route changes owner, boundary, required action, stop condition, successor, or durable theory. _(see workflow-guidelines/packages.md:87)_

### Readiness & Health Contracts

24. [GOV-0002] Do not use roadmap state to close packages, close sprints, or claim release readiness. Those claims require the relevant package, sprint, release, and track evidence. _(see roadmap.md:173)_
25. [GOV-0016] Do not treat those packages as pre-implementation ready unless they record both systemTheory and sliceTheory with the fields below. _(see workflow-guidelines/closure.md:129)_

### Testing & Harness Guidelines

26. [GOV-0029] Do not hide failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths. _(see workflow-guidelines/validators.md:35)_

### Governance & Scope Controls

27. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item. _(see roadmap.md:170)_
28. [GOV-0022] Do not start a second active package on the same architectural boundary while the first has unresolved in-scope residuals. _(see workflow-guidelines/packages.md:135)_
29. [GOV-0023] Representative evidence must not be reclassified as roadmap truth when it belongs to the release, track, sprint, or package layer. _(see workflow-guidelines/packages.md:168)_
30. [GOV-0027] For LLMs, "do not edit" boundaries are higher-signal than a long positive scope list. _(see workflow-guidelines/subagents.md:230)_
