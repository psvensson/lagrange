# Governance Steering Pack

Load for roadmap and edition-scope checks.

Generated rules: 80
Estimated tokens: 3459
Domains: governance

## Rules

1. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
2. [GOV-0002] Do not create a new package solely for changed artifact timestamps, epochs, node ids, counters, or presentation-only shape.
3. [GOV-0003] Parent-session notes, local/manual session labels, and arbitrary text without a real agent id do not satisfy review, fix, or implementation roles unless the user explicitly disables sub-agents for that task.
4. [GOV-0004] Escalate to causal analysis when repeated local fixes or classifications do not make the representative gate pass.
5. [GOV-0005] Non-goals and forbidden interpretations: meanings, consumers, owner boundaries, or downstream symptoms this package must not treat as authority.
6. [GOV-0006] Do not create heading, directory, checkbox, or sidecar status systems that contradict the filename.
7. [GOV-0007] Do not archive package files into a second package-status directory.
8. [GOV-0008] Run validation before committing so current-blocker never points at a missing active-... package.
9. [GOV-0009] Do not open a new package merely because artifact path, epoch, node ids, counts, attempts, timings, timestamps, or presentation shape changed.
10. [GOV-0010] Two focused fixes in adjacent owner boundaries are green locally but do not produce representative green or monotonic representative reduction.
11. [GOV-0011] Do not create another classification-only package from the same unchanged artifact unless owner/boundary, package class, or stop condition changes. Close, rerun fresh evidence, or escalate.
12. [GOV-0012] If the fixture/probe is missing, create the fixture/probe or stop as evidence-incomplete. Do not patch runtime from a representative red run alone.
13. [GOV-0013] Refresh the sprint gate card whenever the representative artifact, canonical owner boundary, or required action changes.
14. [GOV-0014] Sprint files do not replace work packages.
15. [GOV-0015] docs/ is reserved for end-user or operator-facing documentation. Internal planning, work-package execution, and sprint tracking must not live there.
16. [GOV-0016] This lane is valid for small internal docs, workflow, template, and tooling changes that do not change runtime ownership or shared runtime contracts.
17. [GOV-0017] Do not invent historical proof.
18. [GOV-0018] Do not leave the repository between package states.
19. [GOV-0019] Do not start a second active package on the same architectural boundary while the first has unresolved in-scope residuals.
20. [GOV-0020] Do not close if relevant guardrail counts increase.
21. [GOV-0021] Do not hide failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.
22. [GOV-0022] Do not open another classification package from the same unchanged artifact.
23. [GOV-0023] For LLMs, "do not edit" boundaries are higher-signal than a long positive scope list.
24. [GOV-0024] Do not name new representative rerun outputs with placeholder timestamps such as T000000Z; placeholder names make lineage ambiguous and can hide accidental overwrite.
25. [GOV-0025] work/sprints/current-blocker.json is generated handoff state, but it must not be stale.
26. [GOV-0026] Parent-session notes, local/manual labels, and arbitrary text without a real agent id do not satisfy review, fix, or implementation roles at closure.
27. [GOV-0027] The row must be in scope for this repository under ../../edition-matrix.md.
28. [GOV-0028] Broad rows must gain a linked spec or architecture document before active implementation starts.
29. [GOV-0029] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
30. [GOV-0030] Direct work packages must cite the roadmap row they belong to, or the already-approved maintenance/refactor scope that makes them valid without a roadmap change.
31. [GOV-0031] If a broad row is marked complete but still has known guardrail failures in the owner path it claims to close, the row must either name the remaining guardrail package or be downgraded to a capability-only status.
32. [GOV-0032] Keep artifact-derived evidence attached to the current package while the semantic owner, owner boundary, and next required action remain the same.
33. [GOV-0033] The main package owner must reconcile sub-agent results into one package status update rather than creating parallel status narratives.
34. [GOV-0034] Roadmap status must not outrun representative evidence.
35. [GOV-0035] Such examples must not define implementation tasks in this repository unless the active package explicitly limits the work to AGPL-owned substrate and excludes paid-only behavior, operator flows, and control surfaces.
36. [GOV-0036] Escalate to scenario/release-gate when the work is driven by a failing representative artifact or must prove what that scenario does next.
37. [GOV-0037] Classification and implementation gates before runtime edits: canonical extractors must agree on owner/boundary/cause, then the package must name exact candidate runtime files and focused proof.
38. [GOV-0038] If the same owner, boundary, and required action remain selected, keep the same package active and update its Current Edge Card instead of closing it.
39. [GOV-0039] Create or activate the successor only when canonical evidence changed owner, boundary, required action, or the work is intentionally finished.
40. [GOV-0040] Completed work packages are renamed to done-... in the filename, then committed and pushed as a focused package slice before the next slice starts. Packages closed under the current tracker workflow carry a Commit And Push Ledger naming the focused package commit SHA, pushed remote/branch, and package-only commit confirmation. Historical closed-package proof must not be backfilled by invention; if a package is reopened, migrated, or closed again, the current proof rules apply.
41. [GOV-0041] If the same owner boundary and next required action remain dominant, append normalized evidence to the current package and update the sprint blocker snapshot.
42. [GOV-0042] Canonical extractors agree on the first frontier, owner boundary, cause, and next required action, or the sprint records the exact extractor conflict.
43. [GOV-0043] roadmap-sharpening-required: the proposed reset is real but too broad for a bounded runtime package and must be converted into roadmap/spec/architecture scope first.
44. [GOV-0044] The gate cannot replace canonical extractor evidence, package closure, required sub-agent sequencing, validation, or focused commit and push proof.
45. [GOV-0045] Scenario-driven sprint files must keep a compact current blocker snapshot near the top of the document.
46. [GOV-0046] The snapshot must identify the latest artifact, representative gate, current representative package, owner boundary, canonical blocker, prior blocker status, subordinate evidence, and next focused proof surface.
47. [GOV-0047] Residual packages that are not currently being executed must be renamed to todo-... or superseded-... unless they are actively worked with explicitly disjoint owner and file scope.
48. [GOV-0048] Roadmap status must be reconciled with current work-tracker and representative scenario evidence.
49. [GOV-0049] Runtime owner-boundary, scenario/release-gate, and causal-escalation packages must carry a ## Core Logic Brief before implementation starts.
50. [GOV-0050] This lane is required when runtime behavior, shared metadata, control-plane progression, owner contracts, diagnostics grammar, guardrails, or affected runtime consumers can change.
51. [GOV-0051] Representative scenario proof is required when a scenario artifact drove the work; otherwise focused proof may be sufficient.
52. [GOV-0052] This lane is required when work is driven by a distributed, integration, load, or release-gate artifact.
53. [GOV-0053] This lane is required when the representative gate remains red after repeated related local fixes or classification-only reductions.
54. [GOV-0054] Every completed work-package slice MUST end in a focused commit and push before the next slice starts.
55. [GOV-0055] Stop for human direction when package-owned and unrelated changes cannot be separated safely, when no push target exists, or when credentials/policy prevent the required push.
56. [GOV-0056] Same-owner reductions stay in the current package unless the required action changes.
57. [GOV-0057] requiredRefreshCommands must cite route-after-rerun, Sprint Strategy Brief update, Current Edge Card update, current-blocker regeneration, and pre-implementation validation.
58. [GOV-0058] Packages must state the expected representative delta before implementation: what metric, owner, boundary, dominant reason, or route is expected to change.
59. [GOV-0059] Active runtime owner-boundary, scenario/release-gate, and causal-escalation packages must carry a compact ## Decision Experiment Gate before implementation starts.
60. [GOV-0060] Scenario-driven packages and active sprint snapshots must include a compact Current Edge Card that an LLM can keep in working memory without rereading the full package history.
61. [GOV-0061] That fast path should avoid a broad package unless canonical evidence changes owner, boundary, or required action.
62. [GOV-0062] Representative artifacts must use real unique timestamps or otherwise unique run identifiers.
63. [GOV-0063] The review may cite runtime/static proof as required later; implementation and parent revalidation run it.
64. [GOV-0064] When sub-agent sequencing is required, the package's Subagent Progress Ledger is the in-flight communication channel.
65. [GOV-0065] interrupted and partial-unvalidated attempts must be followed by a checked superseded/discarded/revalidated line before closure.
66. [GOV-0066] The active scenario package owner and boundary must appear in scenarioCausalClosure.currentFirstFrontier.
67. [GOV-0067] Review agents do not run focused runtime tests, npm run test:static, broad extractor stacks, raw report JSON, raw logs, or older handoff-file archaeology unless the capped commands contradict package routing, scope, stale blocker state, or metadata shape.
68. [GOV-0068] If a worker goes silent after a checkpoint or stops with edited files and no validation, record the attempt as partial-unvalidated or interrupted, discard or supersede that patch, and do not commit subagent runtime edits until local proof passes.
69. [GOV-0069] If a package discovers that a completed roadmap row still has an active representative blocker, the package must classify the mismatch as one of: - capability-complete but gate-open; - status-overstated and requiring roadmap correction; - new maintenance concern outside the original row
70. [GOV-0070] Final classification: representative-green, reduced, same-frontier, migrated, classification-only, architecture-gap, contradictory, or human-only escalation for blocked/contradictory evidence. Reduced requires a concrete metric delta; classification-only must name the accepted bounded/backpressure state and stop reason.
71. [GOV-0071] Split one follow-on package only when canonical extraction shows semantic movement: first-frontier edge, semantic owner, owner boundary, or next required action changes. A dominant reason change qualifies only when it changes the next required action.
72. [GOV-0072] Use npm run work:subagent-prompt -- --role <role> --package <package> to prepare bounded sub-agent tasks; the generated text assists the real sub-agent sequence but does not replace real returned agent ids. The prompt must carry the package Model Fit output profile so sub-agents know expected response verbosity separately from model or reasoning effort.
73. [GOV-0073] status: required means the tracker has enough evidence to stop and request concrete choices. status: presented means choices are visible but no route has been selected. Both states fail pre-implementation validation for active runtime/scenario work.
74. [GOV-0074] status: selected names the selected choice and opens the bounded route for the next package or new sprint. For architecture gaps and unchanged same-frontier/no-reduction evidence, the default selected route is architecture-package, implemented as an autonomous architecture experiment. The selected route still must carry normal owner, boundary, scope, proof, sub-agent, validation, commit, and push evidence.
75. [GOV-0075] Wrong-slice trigger: the concrete signal that should stop, split, or migrate the package instead of continuing locally.
76. [GOV-0076] If the same two boundaries alternate again without representative green or monotonic reduction, the next validation surface must be a replayable handoff fixture or missing-edge probe that includes both owners before more runtime edits start.
77. [GOV-0077] LLM-driven work across all packages and sub-agent tasks must use canonical workflow and artifact tools before raw JSON or log slicing: work:llm-start, work:evidence-summary, work:package:doctor -- --suggest, work:package:schema, work:package:new, analyze:owner-files, focused scenario extractors such as analyze:priority-recovery-residuals, work:subagent-prompt, and work:oversized-next.
78. [GOV-0078] A row may move to active implementation only when the intended behavior is sharp enough to produce tasks without inventing scope locally.
79. [GOV-0079] A roadmap row may be treated as complete only when no active package or active sprint is still fixing the same declared exit criterion.
80. [GOV-0080] A sprint may not close while ../../roadmap.md says a relevant exit criterion is complete and the sprint's current package says that same criterion still fails.
