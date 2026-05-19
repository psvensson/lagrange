# Core Steering Pack

Manual always-load operating contract for LLM work in this repository.

Use this before domain packs. Domain packs and source steering documents provide
detail; this file carries the shape that should stay active in memory.

## North Star

Preserve the highest-level owner boundary, choose the lightest process that
proves the boundary was not weakened, and do not locally patch symptoms when
the owner contract is porous.

## Process Weight

Use the lightest valid lane:

- Read/review/doc-only: answer or edit docs; no package unless implementation
  truth changes.
- Lightweight maintenance: use a focused package and focused proof; omit causal
  ledgers and sub-agent sequencing unless runtime ownership can change.
- Runtime owner-boundary work: use the full package lane with owner contract,
  static guardrails, focused tests, and affected consumers.
- Scenario or release-gate work: use the full package lane with sequential
  sub-agents, causal ledger, focused owner proof, and representative rerun.

When uncertain, choose the heavier lane only if runtime ownership, shared
contracts, or representative scenario evidence can change.

Runtime owner-boundary, scenario/release-gate, and causal-escalation packages
must include a Core Logic Brief before implementation: canonical outcome,
inputs/signals, state model or invariant, non-goals, proof mapping, and
wrong-slice trigger. Small docs and lightweight maintenance may record
`not-needed` when no runtime, scenario, or shared contract decision changes.

Before implementation, strict runtime/scenario/causal packages must also carry
a Decision Experiment Gate: decision question, architecture review, competing
hypotheses, pre-edit focused probe, success metrics, representative rerun, and
kill rule. The gate is not required for classification-only fast paths or
lightweight maintenance unless implementation scope is promoted.

Active scenario-driven, release-gate, and causal-escalation sprints must keep a
Sprint Strategy Brief near the top of the sprint file: goal state, current
causal thesis, competing hypotheses, confidence and evidence, expected green
path, wrong-direction signals, next best package, and stop or escalate rule.
Update it when owner/boundary selection changes, evidence contradicts the
thesis, several material packages close, or frontier oscillation appears.

Classification-only packages use the fast path only when metadata records
`classification-only` and `writeScope`/`commitScope` contain no runtime, test,
script, or report paths. Keep possible implementation files in
`candidateRuntimeFiles`, cap proof to two or three canonical commands, and skip
subagent sequencing/static runtime guardrails until implementation scope is
promoted.

Review subagents are capped route and predecessor gates by default. They should
not run focused runtime tests, `npm run test:static`, broad extractor stacks,
raw report JSON, raw logs, or older handoff-file archaeology unless the capped
review commands contradict package routing, scope, stale blocker state, or
metadata shape.

## Rules

1. Start from `npm run work:context` for non-trivial implementation work; use
   `npm run work:llm-start` when the next step needs package doctor, dirty
   scope, model-ledger, or artifact summary context. Keep the named owner,
   boundary, proof ladder, and out-of-scope list in view.
2. Work one bounded concern at a time. Do not let a package become a bucket for
   unrelated guardrail, runtime, presentation, or roadmap changes.
3. For scenario-driven packages, keep the Current Edge Card in view before
   editing: artifact, first frontier, owner, boundary, selected cause, allowed
   edits, forbidden edits, first proof, and stop modes. Runtime edits require a
   Core Logic Brief, classification gate, and implementation gate.
4. Do not locally patch symptoms. Identify the semantic owner boundary, reduce
   duplicate paths, prove the owner contract, and record what the representative
   scenario does next.
5. One concern has one semantic owner. Callers submit intent to the owner and
   consume owner outcomes; they do not reproduce owner logic locally.
6. One semantic decision has one path after ingress normalization. Avoid
   fallback branches, helper-local verdicts, and combinable boolean policy.
7. Runtime scalars and states have named owners. Do not use raw strings,
   numbers, `null`, or `undefined` as domain/runtime state.
8. Cache observes; owners decide. Cache visibility, elapsed time, and incidental
   rows do not prove owner-managed phase completion.
9. Phase code hands off completely. Bootstrap, join, recovery, split, and
   rebalance phases must not leave steady state dependent on phase-owned wiring.
10. Pressure may slow, defer, reject, or coalesce work; it must not produce
   hidden drops, unbounded growth, incorrect results, or timeout-only failure.
11. Events enqueue owner-key work. Long-running progression belongs in the
    deterministic owner reconcile path with one in-flight execution per owner
    key.
12. Shared runtime contracts declare owner, evidence inputs, vocabulary,
    allowed consumers, and forbidden reinterpretations. Diagnostics and reports
    reuse that grammar.
13. Tests prove the owner path and affected consumers, not only eventual local
    convergence.
14. Build or identify the replayable owner-decision fixture or narrow blocker
    probe before runtime edits. If the selected edge cannot be represented,
    stop as evidence-incomplete or create tooling instead of patching from a
    representative red run alone.
15. Use canonical workflow and artifact extractors before raw JSON slicing:
    `work:evidence-summary`, `analyze:owner-files`,
    `analyze:priority-recovery-residuals`, `work:package:doctor -- --suggest`,
    `work:package:schema`, `work:package:new`, `work:subagent-prompt`, and
    `work:oversized-next`. Ad hoc `jq` is a fallback only when no extractor
    exists or the extractor output is insufficient, and that reason must be
    recorded in the package.
16. New package metadata uses explicit scope fields: `writeScope`,
    `handoffFiles`, `generatedFiles`, `candidateRuntimeFiles`, and
    `commitScope`. `touchedFiles` is legacy compatibility, not a write or
    subagent ownership contract.
17. Validate at the right phase: `--entry` for shape, `--pre-impl` when
    review/fix proof is clean and implementation is next, and `--closure`
    before closing or committing.
18. Static guardrails are architecture evidence. Do not weaken scripts,
    allowlists, scan scope, or lint rules to make a package pass.
19. Scenario artifacts migrate only when normalized evidence changes owner,
    boundary, or next required action; new counts, node ids, epochs, or timing
    alone do not justify package churn.
20. Same-owner/same-action reductions stay in the current package. Smaller
    counts, narrower node sets, better coverage, or clearer evidence update the
    Current Edge Card unless owner, boundary, required action, or stop state
    changes.
21. Fixture-first is a package phase, not automatically a package boundary.
    Split fixture-only work only when it changes the selected edge, proves no
    runtime edit is justified, or creates reusable tooling.
22. Package closure is atomic: rename/status, commit ledger, successor or
    intentional no-active state, `current-blocker`, validation, commit, and push
    must move together. A `current-blocker` that points at a missing active
    package is a closure defect.
23. When one node remains, use a remaining-node fast path: target node,
    required action, runtime-promotion flag, goal, and forbidden edits.
24. Representative rerun artifacts use real unique timestamps or run ids, not
    placeholder names such as `T000000Z`.
25. If a representative frontier returns to a recently closed related owner
    boundary or alternates between two related boundaries, stop local runtime
    patching and open a causal-escalation handoff package.
26. A package is not done while in-scope residuals, tail consumers, guardrail
    drift, or unnamed scenario migration evidence remain.
27. Sub-agents are mandatory for runtime owner-boundary and scenario/release-gate
    packages; they are optional for read/review/doc-only and lightweight
    maintenance lanes unless the package declares otherwise. If the host cannot
    expose delegation before implementation, record `human-waived`,
    `tool-unavailable`, or `blocked-by-environment-policy` with a reason; do
    not use that as closure proof.
    When sub-agents run, each completed subtask gets one checked Subagent
    Progress Ledger update with real agent identity, `evidence: ...`, and
    `next: ...` or `blocker: ...`; this progress ledger does not replace the
    Subagent Sequencing Ledger role proof. Each attempt also records a checked
    Subagent Attempt Ledger checkpoint with status, last checkpoint, parent
    action, evidence, and next/blocker. Interrupted or partial-unvalidated
    attempts must be superseded/discarded/revalidated before closure, and
    implementation completion requires parent local proof rerun with
    `parent revalidated focused proof: yes`.
28. Commit and push focused package slices before starting the next package.
    Use `npm run work:sprint:push -- <git-push-args>` for sprint pushes so the
    remaining sprint package list prints after a successful push. Do not sweep
    unrelated dirty worktree changes into the slice.
29. If a local fix feels hard because the boundary is porous, reduce the
    boundary or raise the abstraction instead of adding another symptom patch.
