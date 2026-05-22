# Experiment Theory Ledger Foundation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-22",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "experiment_theory_memory",
  "dominantReason": "theories_are_scattered_across_packages",
  "currentState": "Central experiment and theory memory is implemented in the current worktree, with focused validation and a separate verifier-fixer pass green.",
  "nextAction": "Formally close the ledger packages or activate the runtime successor after a focused commit/closure decision; do not redo the ledger implementation unless validation regresses.",
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "stabilityCredit": "instrumentation-only",
  "whyHighestLeverageNow": "This advances the sprint goal of universal owner-contract completion by making experiment and theory memory findable before more representative stability work accumulates.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260522-experiment-theory-ledger-foundation.md",
    "git diff --check -- work/packages/active-20260522-experiment-theory-ledger-foundation.md work/theory-ledger.md work/templates/theory-ledger-entry.md work/README.md"
  ],
  "writeScope": [
    "work/theory-ledger.md",
    "work/templates/theory-ledger-entry.md",
    "work/README.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/theory-ledger.md",
    "work/templates/theory-ledger-entry.md",
    "work/README.md",
    "work/packages/active-20260522-experiment-theory-ledger-foundation.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "predecessor": "work/packages/done-20260522-node-failure-rebalance-acceptance-hardening.md"
}
-->

## Why

The work tracker preserves theories today, but they are scattered across sprint
briefs, package metadata, current-blocker snapshots, artifacts, and model
ledger notes. That makes agents rediscover prior experiments instead of
starting from the best current causal model. This package owns the simple
central memory shape for experiments and theories.

## Scope Basis

Current sprint focus: universal owner-contract completion and representative
stability. This is lightweight workflow maintenance: it creates a navigation
ledger and template, while packages and artifacts remain the source of truth.

## Ledger Plan

1. Create `work/theory-ledger.md` as an evidence-linked index, not an authority.
2. Use compact entries with: theory id, status, scenario/gate, owner/boundary,
   hypothesis, probe command, artifact/result, representative movement, linked
   packages, supersedes/superseded-by, and next implication.
3. Accepted statuses: `active`, `supported`, `falsified`, `superseded`,
   `stale`, and `needs-rerun`.
4. Update only at package closure, representative rerun routing, architecture
   gate decisions, or deliberate seed/backfill packages.
5. Prefer supersession over rewriting history; stale or contradicted theories
   remain findable with evidence links.
6. Add `work/templates/theory-ledger-entry.md` so agents have one concrete
   entry shape.

## Detailed Execution Contract

1. Add the ledger file with an explicit non-authority contract: package files,
   artifacts, and current-blocker remain canonical.
2. Add an entry template that is short enough for agents to fill during package
   closure.
3. Document the update points and staleness rules in `work/README.md`.
4. Do not seed historical theories in this package; seeding is handled by the
   later initial-seed package to keep foundation review simple.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: A central evidence-linked ledger and entry template exist, with an explicit rule that they index package/artifact truth rather than replacing it.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `experiment_theory_memory`
- Route dominant reason: `theories_are_scattered_across_packages`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/theory-ledger.md
2. work/templates/theory-ledger-entry.md
3. work/README.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `small`
- Owned files: `work/theory-ledger.md`, `work/templates/theory-ledger-entry.md`, `work/README.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260522-experiment-theory-ledger-foundation.md`, `git diff --check -- work/packages/active-20260522-experiment-theory-ledger-foundation.md work/theory-ledger.md work/templates/theory-ledger-entry.md work/README.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: added `work/theory-ledger.md`, `work/templates/theory-ledger-entry.md`, and `work/README.md`; ran `npm run work:validate -- --entry work/packages/active-20260522-experiment-theory-ledger-foundation.md` and `git diff --check -- work/packages/active-20260522-experiment-theory-ledger-foundation.md work/theory-ledger.md work/templates/theory-ledger-entry.md work/README.md`; parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: Curie verifier-fixer found no blocking issues and reran `npm run work:theory-ledger -- validate`, targeted ledger tests, and five-package pre-impl validation successfully; changed files: none; parent revalidated focused proof: yes; next: closure decision.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after ledger refs landed; parent revalidated focused proof: yes; next: validation.

## Validation

1. npm run work:validate -- --entry work/packages/active-20260522-experiment-theory-ledger-foundation.md
2. git diff --check -- work/packages/active-20260522-experiment-theory-ledger-foundation.md work/theory-ledger.md work/templates/theory-ledger-entry.md work/README.md
