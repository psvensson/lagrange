# Governance Steering Pack

Load for roadmap and edition-scope checks.

Generated rules: 57
Estimated tokens: 2491
Domains: governance

## Rules

1. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
2. [GOV-0002] Do not create a new package solely for changed artifact timestamps, epochs, node ids, counters, or presentation-only shape.
3. [GOV-0003] Parent-session notes, local/manual session labels, and arbitrary text without a real agent id do not satisfy review, fix, or implementation roles unless the user explicitly disables sub-agents for that task.
4. [GOV-0004] Escalate to causal analysis when repeated local fixes or classifications do not make the representative gate pass.
5. [GOV-0005] Do not create heading, directory, checkbox, or sidecar status systems that contradict the filename.
6. [GOV-0006] Do not archive package files into a second package-status directory.
7. [GOV-0007] Do not open a new package merely because artifact path, epoch, node ids, counts, attempts, timings, timestamps, or presentation shape changed.
8. [GOV-0008] Two focused fixes in adjacent owner boundaries are green locally but do not produce representative green or monotonic representative reduction.
9. [GOV-0009] Sprint files do not replace work packages.
10. [GOV-0010] docs/ is reserved for end-user or operator-facing documentation. Internal planning, work-package execution, and sprint tracking must not live there.
11. [GOV-0011] This lane is valid for small internal docs, workflow, template, and tooling changes that do not change runtime ownership or shared runtime contracts.
12. [GOV-0012] Do not invent historical proof.
13. [GOV-0013] Do not start a second active package on the same architectural boundary while the first has unresolved in-scope residuals.
14. [GOV-0014] Do not close if relevant guardrail counts increase.
15. [GOV-0015] Do not hide failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.
16. [GOV-0016] work/sprints/current-blocker.json is generated handoff state, but it must not be stale.
17. [GOV-0017] Parent-session notes, local/manual labels, and arbitrary text without a real agent id do not satisfy review, fix, or implementation roles at closure.
18. [GOV-0018] Roadmap status must not outrun representative evidence.
19. [GOV-0019] The row must be in scope for this repository under ../../edition-matrix.md.
20. [GOV-0020] Broad rows must gain a linked spec or architecture document before active implementation starts.
21. [GOV-0021] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
22. [GOV-0022] Direct work packages must cite the roadmap row they belong to, or the already-approved maintenance/refactor scope that makes them valid without a roadmap change.
23. [GOV-0023] If a broad row is marked complete but still has known guardrail failures in the owner path it claims to close, the row must either name the remaining guardrail package or be downgraded to a capability-only status.
24. [GOV-0024] Keep artifact-derived evidence attached to the current package while the semantic owner, owner boundary, and next required action remain the same.
25. [GOV-0025] The main package owner must reconcile sub-agent results into one package status update rather than creating parallel status narratives.
26. [GOV-0026] Such examples must not define implementation tasks in this repository unless the active package explicitly limits the work to AGPL-owned substrate and excludes paid-only behavior, operator flows, and control surfaces.
27. [GOV-0027] Escalate to scenario/release-gate when the work is driven by a failing representative artifact or must prove what that scenario does next.
28. [GOV-0028] Completed work packages are renamed to done-... in the filename, then committed and pushed as a focused package slice before the next slice starts. Packages closed under the current tracker workflow carry a Commit And Push Ledger naming the focused package commit SHA, pushed remote/branch, and package-only commit confirmation. Historical closed-package proof must not be backfilled by invention; if a package is reopened, migrated, or closed again, the current proof rules apply.
29. [GOV-0029] If the same owner boundary and next required action remain dominant, append normalized evidence to the current package and update the sprint blocker snapshot.
30. [GOV-0030] Scenario-driven sprint files must keep a compact current blocker snapshot near the top of the document.
31. [GOV-0031] The snapshot must identify the latest artifact, representative gate, current representative package, owner boundary, canonical blocker, prior blocker status, subordinate evidence, and next focused proof surface.
32. [GOV-0032] Residual packages that are not currently being executed must be renamed to todo-... or superseded-... unless they are actively worked with explicitly disjoint owner and file scope.
33. [GOV-0033] Roadmap status must be reconciled with current work-tracker and representative scenario evidence.
34. [GOV-0034] This lane is required when runtime behavior, shared metadata, control-plane progression, owner contracts, diagnostics grammar, guardrails, or affected runtime consumers can change.
35. [GOV-0035] Representative scenario proof is required when a scenario artifact drove the work; otherwise focused proof may be sufficient.
36. [GOV-0036] This lane is required when work is driven by a distributed, integration, load, or release-gate artifact.
37. [GOV-0037] This lane is required when the representative gate remains red after repeated related local fixes or classification-only reductions.
38. [GOV-0038] Every completed work-package slice MUST end in a focused commit and push before the next slice starts.
39. [GOV-0039] Stop for human direction when package-owned and unrelated changes cannot be separated safely, when no push target exists, or when credentials/policy prevent the required push.
40. [GOV-0040] The active scenario package owner and boundary must appear in scenarioCausalClosure.currentFirstFrontier.
41. [GOV-0041] If a package discovers that a completed roadmap row still has an active representative blocker, the package must classify the mismatch as one of: - capability-complete but gate-open; - status-overstated and requiring roadmap correction; - new maintenance concern outside the original row
42. [GOV-0042] Split one follow-on package only when canonical extraction shows semantic movement: first-frontier edge, semantic owner, owner boundary, or next required action changes. A dominant reason change qualifies only when it changes the next required action.
43. [GOV-0043] Use npm run work:subagent-prompt -- --role <role> --package <package> to prepare bounded sub-agent tasks; the generated text assists the real sub-agent sequence but does not replace real returned agent ids. The prompt must carry the package Model Fit output profile so sub-agents know expected response verbosity separately from model or reasoning effort.
44. [GOV-0044] If the same two boundaries alternate again without representative green or monotonic reduction, the next validation surface must be a replayable handoff fixture or missing-edge probe that includes both owners before more runtime edits start.
45. [GOV-0045] LLM-driven work across all packages and sub-agent tasks must use canonical workflow and artifact tools before raw JSON or log slicing: work:llm-start, work:evidence-summary, work:package:doctor -- --suggest, work:package:schema, work:package:new, analyze:owner-files, focused scenario extractors such as analyze:priority-recovery-residuals, work:subagent-prompt, and work:oversized-next.
46. [GOV-0046] A row may move to active implementation only when the intended behavior is sharp enough to produce tasks without inventing scope locally.
47. [GOV-0047] A roadmap row may be treated as complete only when no active package or active sprint is still fixing the same declared exit criterion.
48. [GOV-0048] A sprint may not close while ../../roadmap.md says a relevant exit criterion is complete and the sprint's current package says that same criterion still fails.
49. [GOV-0049] Use validation phases deliberately: npm run work:validate -- --entry for package shape, --pre-impl when review/fix proof is complete and implementation may still be pending, and --closure before close/commit.
50. [GOV-0050] At most one package in a sprint may own the current representative re-entry gate.
51. [GOV-0051] A package may not close with open in-scope residuals.
52. [GOV-0052] If an active package is already in the causal-escalation lane, it may continue only when it explicitly owns that handoff, names the missing cross-boundary causal edge, and keeps same-owner evidence in the same package.
53. [GOV-0053] No further runtime patch in either oscillating boundary may start until that handoff package identifies the failing causal edge.
54. [GOV-0054] Before closure, an implementation environment may record human-waived, tool-unavailable, or blocked-by-environment-policy with a reason: ... note so unavailable delegation is explicit instead of disguised as agent proof.
55. [GOV-0055] Architecture documents may mention Pro or Enterprise services only as examples of external consumers of AGPL substrate.
56. [GOV-0056] Use explicit metadata scope fields for new packages: writeScope for files the package may edit, handoffFiles for read-only context, generatedFiles for deterministic outputs, candidateRuntimeFiles for files gated by a focused probe, and commitScope for focused commit containment. touchedFiles is legacy compatibility only.
57. [GOV-0057] A package may diverge only when it records metadata ownerBoundaryMigrationProof with concrete from/to owner and boundary, reason, and focused evidence proving a bounded diagnostic/support role or owner-boundary migration.
