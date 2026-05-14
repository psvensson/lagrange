# Governance Steering Pack

Load for roadmap and edition-scope checks.

Generated rules: 50
Estimated tokens: 2083
Domains: governance

## Rules

1. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
2. [GOV-0002] Do not create a new package solely for changed artifact timestamps, epochs, node ids, counters, or presentation-only shape.
3. [GOV-0003] Parent-session notes, local/manual session labels, and arbitrary text without a real agent id do not satisfy review, fix, or implementation roles unless the user explicitly disables sub-agents for that task.
4. [GOV-0004] Escalate to causal analysis when repeated local fixes or classifications do not make the representative gate pass.
5. [GOV-0005] Do not create heading, directory, checkbox, or sidecar status systems that contradict the filename.
6. [GOV-0006] Do not archive package files into a second package-status directory.
7. [GOV-0007] Do not open a new package merely because artifact epoch, node ids, counts, timestamps, or presentation shape changed.
8. [GOV-0008] Sprint files do not replace work packages.
9. [GOV-0009] docs/ is reserved for end-user or operator-facing documentation. Internal planning, work-package execution, and sprint tracking must not live there.
10. [GOV-0010] This lane is valid for small internal docs, workflow, template, and tooling changes that do not change runtime ownership or shared runtime contracts.
11. [GOV-0011] Do not invent historical proof.
12. [GOV-0012] Do not start a second active package on the same architectural boundary while the first has unresolved in-scope residuals.
13. [GOV-0013] Do not close if relevant guardrail counts increase.
14. [GOV-0014] Do not hide failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.
15. [GOV-0015] work/sprints/current-blocker.json is generated handoff state, but it must not be stale.
16. [GOV-0016] Parent-session notes, local/manual labels, and arbitrary text without a real agent id do not satisfy review, fix, or implementation roles at closure.
17. [GOV-0017] Roadmap status must not outrun representative evidence.
18. [GOV-0018] The row must be in scope for this repository under ../../edition-matrix.md.
19. [GOV-0019] Broad rows must gain a linked spec or architecture document before active implementation starts.
20. [GOV-0020] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
21. [GOV-0021] Direct work packages must cite the roadmap row they belong to, or the already-approved maintenance/refactor scope that makes them valid without a roadmap change.
22. [GOV-0022] If a broad row is marked complete but still has known guardrail failures in the owner path it claims to close, the row must either name the remaining guardrail package or be downgraded to a capability-only status.
23. [GOV-0023] Keep artifact-derived evidence attached to the current package while the semantic owner, owner boundary, and next required action remain the same.
24. [GOV-0024] The main package owner must reconcile sub-agent results into one package status update rather than creating parallel status narratives.
25. [GOV-0025] Such examples must not define implementation tasks in this repository unless the active package explicitly limits the work to AGPL-owned substrate and excludes paid-only behavior, operator flows, and control surfaces.
26. [GOV-0026] Escalate to scenario/release-gate when the work is driven by a failing representative artifact or must prove what that scenario does next.
27. [GOV-0027] Completed work packages are renamed to done-... in the filename, then committed and pushed as a focused package slice before the next slice starts. Packages closed under the current tracker workflow carry a Commit And Push Ledger naming the focused package commit SHA, pushed remote/branch, and package-only commit confirmation. Historical closed-package proof must not be backfilled by invention; if a package is reopened, migrated, or closed again, the current proof rules apply.
28. [GOV-0028] Scenario-driven sprint files must keep a compact current blocker snapshot near the top of the document.
29. [GOV-0029] The snapshot must identify the latest artifact, representative gate, current representative package, owner boundary, canonical blocker, prior blocker status, subordinate evidence, and next focused proof surface.
30. [GOV-0030] Residual packages that are not currently being executed must be renamed to todo-... or superseded-... unless they are actively worked with explicitly disjoint owner and file scope.
31. [GOV-0031] Roadmap status must be reconciled with current work-tracker and representative scenario evidence.
32. [GOV-0032] This lane is required when runtime behavior, shared metadata, control-plane progression, owner contracts, diagnostics grammar, guardrails, or affected runtime consumers can change.
33. [GOV-0033] Representative scenario proof is required when a scenario artifact drove the work; otherwise focused proof may be sufficient.
34. [GOV-0034] This lane is required when work is driven by a distributed, integration, load, or release-gate artifact.
35. [GOV-0035] This lane is required when the representative gate remains red after repeated related local fixes or classification-only reductions.
36. [GOV-0036] Every completed work-package slice MUST end in a focused commit and push before the next slice starts.
37. [GOV-0037] Stop for human direction when package-owned and unrelated changes cannot be separated safely, when no push target exists, or when credentials/policy prevent the required push.
38. [GOV-0038] The active scenario package owner and boundary must appear in scenarioCausalClosure.currentFirstFrontier.
39. [GOV-0039] If a package discovers that a completed roadmap row still has an active representative blocker, the package must classify the mismatch as one of: - capability-complete but gate-open; - status-overstated and requiring roadmap correction; - new maintenance concern outside the original row
40. [GOV-0040] LLM-driven work across all packages and sub-agent tasks must use canonical workflow and artifact tools before raw JSON or log slicing: work:llm-start, work:evidence-summary, work:package:doctor -- --suggest, work:package:schema, work:package:new, analyze:owner-files, focused scenario extractors such as analyze:priority-recovery-residuals, work:subagent-prompt, and work:oversized-next.
41. [GOV-0041] A row may move to active implementation only when the intended behavior is sharp enough to produce tasks without inventing scope locally.
42. [GOV-0042] A roadmap row may be treated as complete only when no active package or active sprint is still fixing the same declared exit criterion.
43. [GOV-0043] A sprint may not close while ../../roadmap.md says a relevant exit criterion is complete and the sprint's current package says that same criterion still fails.
44. [GOV-0044] Use validation phases deliberately: npm run work:validate -- --entry for package shape, --pre-impl when review/fix proof is complete and implementation may still be pending, and --closure before close/commit.
45. [GOV-0045] At most one package in a sprint may own the current representative re-entry gate.
46. [GOV-0046] A package may not close with open in-scope residuals.
47. [GOV-0047] Before closure, an implementation environment may record human-waived, tool-unavailable, or blocked-by-environment-policy with a reason: ... note so unavailable delegation is explicit instead of disguised as agent proof.
48. [GOV-0048] Architecture documents may mention Pro or Enterprise services only as examples of external consumers of AGPL substrate.
49. [GOV-0049] Use explicit metadata scope fields for new packages: writeScope for files the package may edit, handoffFiles for read-only context, generatedFiles for deterministic outputs, candidateRuntimeFiles for files gated by a focused probe, and commitScope for focused commit containment. touchedFiles is legacy compatibility only.
50. [GOV-0050] A package may diverge only when it records metadata ownerBoundaryMigrationProof with concrete from/to owner and boundary, reason, and focused evidence proving a bounded diagnostic/support role or owner-boundary migration.
