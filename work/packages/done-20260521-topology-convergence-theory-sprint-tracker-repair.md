# Topology Convergence Theory Sprint Tracker Repair

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "lane": "mechanical-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "work_tracker",
  "boundary": "topology_convergence_track_truth",
  "dominantReason": "stale_active_sprint_and_package_pointers",
  "currentState": "Topology convergence release and track pointers still name closed or missing active execution; the first theory-ladder sprint/probe is not yet attached.",
  "nextAction": "Repair stale topology-convergence release/track pointers and activate the first rolling-restart theory sprint/probe.",
  "proof": [
    "npm run work:tracks",
    "npm run work:validate -- --entry work/packages/done-20260521-topology-convergence-theory-sprint-tracker-repair.md",
    "npm run work:validate -- --probe work/packages/done-20260521-rolling-restart-theory-baseline-probe.md"
  ],
  "writeScope": [
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md",
    "work/sprints/active-2026-q2-topology-convergence-theory-ladder.md",
    "work/packages/done-20260521-rolling-restart-theory-baseline-probe.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md",
    "work/sprints/active-2026-q2-topology-convergence-theory-ladder.md",
    "work/packages/done-20260521-topology-convergence-theory-sprint-tracker-repair.md",
    "work/packages/done-20260521-rolling-restart-theory-baseline-probe.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "mechanical edits only; no behavior or ownership decisions",
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
      "Keep docs/templates/schema metadata edits in this Spark-safe package.",
      "Split any runtime or test behavior into a separate package before execution."
    ]
  },
  "closed": "2026-05-21",
  "commitAndPushLedgerRequired": true
}
-->

## Why

`work:context` correctly reports no active package, but release and track
planning still contain stale active topology-convergence pointers. This package
repairs that tracker truth and attaches the first theory-ladder probe so the
next work starts from a falsifiable rolling-restart experiment instead of
another symptom-fix sprint.

## Scope Basis

Approved maintenance scope: work-tracker truth repair for the AGPL
topology-convergence track and roadmap Phase `0.1 - Internal Coherence`.

## Workflow Lane

- Selected lane: `mechanical-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `work_tracker`
- Route boundary: `topology_convergence_track_truth`
- Route dominant reason: `stale_active_sprint_and_package_pointers`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `mechanical-maintenance`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/releases/0.1-dependency-map.md
2. work/releases/0.1-stabilization.md
3. work/tracks/topology-convergence.md
4. work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md
5. work/sprints/active-2026-q2-topology-convergence-theory-ladder.md
6. work/packages/done-20260521-rolling-restart-theory-baseline-probe.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `mechanical-maintenance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Ambiguity score: `1`
- Owned files: `work/releases/0.1-dependency-map.md`, `work/releases/0.1-stabilization.md`, `work/tracks/topology-convergence.md`, `work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md`, `work/sprints/active-2026-q2-topology-convergence-theory-ladder.md`, `work/packages/done-20260521-rolling-restart-theory-baseline-probe.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:tracks`, `npm run work:validate -- --entry work/packages/done-20260521-topology-convergence-theory-sprint-tracker-repair.md`, `npm run work:validate -- --probe work/packages/done-20260521-rolling-restart-theory-baseline-probe.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: mechanical edits only; no behavior or ownership decisions
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep docs/templates/schema metadata edits in this Spark-safe package.
2. Split any runtime or test behavior into a separate package before execution.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `npm run work:tracks` shows only `active-2026-q2-topology-convergence-theory-ladder` active for topology-convergence; `npm run work:validate -- --entry work/packages/done-20260521-topology-convergence-theory-sprint-tracker-repair.md` passed; `npm run work:validate -- --probe work/packages/done-20260521-rolling-restart-theory-baseline-probe.md` passed; parent revalidated focused proof: yes; next: close this temporary tracker repair package and continue with the baseline probe.
- [x] verification-fix: status: validated; evidence: second local verification reran `npm run work:repair` and `npm run work:context`, confirming the active blocker is now `work/packages/done-20260521-rolling-restart-theory-baseline-probe.md`; changed files: work/releases/0.1-dependency-map.md, work/releases/0.1-stabilization.md, work/tracks/topology-convergence.md, work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md, work/sprints/active-2026-q2-topology-convergence-theory-ladder.md, work/packages/done-20260521-rolling-restart-theory-baseline-probe.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm run work:tracks
2. npm run work:validate -- --entry work/packages/done-20260521-topology-convergence-theory-sprint-tracker-repair.md
3. npm run work:validate -- --probe work/packages/done-20260521-rolling-restart-theory-baseline-probe.md
