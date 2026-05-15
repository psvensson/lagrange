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

## Rules

1. Start from `npm run work:context` for non-trivial implementation work; use
   `npm run work:llm-start` when the next step needs package doctor, dirty
   scope, model-ledger, or artifact summary context. Keep the named owner,
   boundary, proof ladder, and out-of-scope list in view.
2. Work one bounded concern at a time. Do not let a package become a bucket for
   unrelated guardrail, runtime, presentation, or roadmap changes.
3. Do not locally patch symptoms. Identify the semantic owner boundary, reduce
   duplicate paths, prove the owner contract, and record what the representative
   scenario does next.
4. One concern has one semantic owner. Callers submit intent to the owner and
   consume owner outcomes; they do not reproduce owner logic locally.
5. One semantic decision has one path after ingress normalization. Avoid
   fallback branches, helper-local verdicts, and combinable boolean policy.
6. Runtime scalars and states have named owners. Do not use raw strings,
   numbers, `null`, or `undefined` as domain/runtime state.
7. Cache observes; owners decide. Cache visibility, elapsed time, and incidental
   rows do not prove owner-managed phase completion.
8. Phase code hands off completely. Bootstrap, join, recovery, split, and
   rebalance phases must not leave steady state dependent on phase-owned wiring.
9. Pressure may slow, defer, reject, or coalesce work; it must not produce
   hidden drops, unbounded growth, incorrect results, or timeout-only failure.
10. Events enqueue owner-key work. Long-running progression belongs in the
    deterministic owner reconcile path with one in-flight execution per owner
    key.
11. Shared runtime contracts declare owner, evidence inputs, vocabulary,
    allowed consumers, and forbidden reinterpretations. Diagnostics and reports
    reuse that grammar.
12. Tests prove the owner path and affected consumers, not only eventual local
    convergence.
13. Use canonical workflow and artifact extractors before raw JSON slicing:
    `work:evidence-summary`, `analyze:owner-files`,
    `analyze:priority-recovery-residuals`, `work:package:doctor -- --suggest`,
    `work:package:schema`, `work:package:new`, `work:subagent-prompt`, and
    `work:oversized-next`. Ad hoc `jq` is a fallback only when no extractor
    exists or the extractor output is insufficient, and that reason must be
    recorded in the package.
14. New package metadata uses explicit scope fields: `writeScope`,
    `handoffFiles`, `generatedFiles`, `candidateRuntimeFiles`, and
    `commitScope`. `touchedFiles` is legacy compatibility, not a write or
    subagent ownership contract.
15. Validate at the right phase: `--entry` for shape, `--pre-impl` when
    review/fix proof is clean and implementation is next, and `--closure`
    before closing or committing.
16. Static guardrails are architecture evidence. Do not weaken scripts,
    allowlists, scan scope, or lint rules to make a package pass.
17. Scenario artifacts migrate only when normalized evidence changes owner,
    boundary, or next required action; new counts, node ids, epochs, or timing
    alone do not justify package churn.
18. If a representative frontier returns to a recently closed related owner
    boundary or alternates between two related boundaries, stop local runtime
    patching and open a causal-escalation handoff package.
19. A package is not done while in-scope residuals, tail consumers, guardrail
    drift, or unnamed scenario migration evidence remain.
20. Sub-agents are mandatory for runtime owner-boundary and scenario/release-gate
    packages; they are optional for read/review/doc-only and lightweight
    maintenance lanes unless the package declares otherwise. If the host cannot
    expose delegation before implementation, record `human-waived`,
    `tool-unavailable`, or `blocked-by-environment-policy` with a reason; do
    not use that as closure proof.
21. Commit and push focused package slices before starting the next package.
    Do not sweep unrelated dirty worktree changes into the slice.
22. If a local fix feels hard because the boundary is porous, reduce the
    boundary or raise the abstraction instead of adding another symptom patch.
