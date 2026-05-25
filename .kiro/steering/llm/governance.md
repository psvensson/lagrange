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

Generated rules: 30
Estimated tokens: 992
Domains: governance

## Rules

### General Guidelines

1. [GOV-0002] Do not create a new package solely for changed artifact timestamps, epochs, node ids, counters, or presentation-only shape.
2. [GOV-0005] Escalate to causal analysis when repeated local fixes or classifications do not make the representative gate pass.
3. [GOV-0006] Do not create heading, directory, checkbox, or sidecar status systems that contradict the filename.
4. [GOV-0007] Do not archive package files into a second package-status directory.
5. [GOV-0008] Run validation before committing so current-blocker never points at a missing active-... package.
6. [GOV-0009] If the fixture/probe is missing, create the fixture/probe or stop as evidence-incomplete. Do not patch runtime from a representative red run alone.
7. [GOV-0011] Do not open a new package merely because artifact path, epoch, node ids, counts, attempts, timings, timestamps, or presentation shape changed.
8. [GOV-0013] Sprint files do not replace work packages.
9. [GOV-0014] docs/ is reserved for end-user or operator-facing documentation. Internal planning, work-package execution, and sprint tracking must not live there.
10. [GOV-0015] Do not open another classification package from the same unchanged artifact.
11. [GOV-0017] Do not invent historical proof.
12. [GOV-0018] Do not leave the repository between package states.
13. [GOV-0021] They do not replace the implementation and verification-fix closure roles.
14. [GOV-0022] work/sprints/current-blocker.json is generated handoff state, but it must not be stale.
15. [GOV-0024] Do not name new representative rerun outputs with placeholder timestamps such as T000000Z; placeholder names make lineage ambiguous and can hide accidental overwrite.
16. [GOV-0025] Do not close if relevant guardrail counts increase.
17. [GOV-0028] Broad rows must gain a linked spec or architecture document before active implementation starts.

### Ownership & Authority Policies

18. [GOV-0003] Non-goals and forbidden interpretations: meanings, consumers, owner boundaries, or downstream symptoms this package must not treat as authority.
19. [GOV-0004] Do not create another classification-only package from the same unchanged artifact unless owner/boundary, package class, or stop condition changes. Close, rerun fresh evidence, or escalate.
20. [GOV-0010] Refresh the sprint gate card whenever the representative artifact, canonical owner boundary, or required action changes.
21. [GOV-0012] Two focused fixes in adjacent owner boundaries are green locally but do not produce representative green or monotonic representative reduction.
22. [GOV-0016] This lane is valid for small internal docs, workflow, template, and tooling changes that do not change runtime ownership or shared runtime contracts.

### Readiness & Health Contracts

23. [GOV-0030] Direct work packages must cite the roadmap row they belong to, or the already-approved maintenance/refactor scope that makes them valid without a roadmap change.

### Testing & Harness Guidelines

24. [GOV-0026] Do not hide failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.

### Governance & Scope Controls

25. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
26. [GOV-0019] Do not start a second active package on the same architectural boundary while the first has unresolved in-scope residuals.
27. [GOV-0020] Roadmap status must not outrun representative evidence.
28. [GOV-0023] For LLMs, "do not edit" boundaries are higher-signal than a long positive scope list.
29. [GOV-0027] The row must be in scope for this repository under ../../edition-matrix.md.
30. [GOV-0029] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
