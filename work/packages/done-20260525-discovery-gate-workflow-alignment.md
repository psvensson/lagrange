# Discovery gate workflow alignment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow-steering",
    "boundary": "discovery-gate-holistic-problem-solving",
    "currentState": "Workflow docs provide Core Logic Brief, Decision Experiment Gate, theory ledger, current blocker, and Execution Evidence structures, but do not define a package-local Discovery Gate for LLM lateral analysis before implementation scope hardens.",
    "nextAction": "Add Discovery Gate guidance that maps lateral LLM analysis into existing package, theory ledger, current blocker, and execution evidence structures without creating a parallel workflow.",
    "dominantReason": "llm-lateral-problem-solving-structure"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "work/README.md",
      ".kiro/steering/workflow-guidelines/closure.md",
      ".kiro/steering/workflow-guidelines/packages.md",
      ".kiro/steering/workflow-guidelines/subagents.md",
      ".kiro/steering/workflow-guidelines/INDEX.md",
      "work/templates/work-package-template.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/packages/done-20260525-discovery-gate-workflow-alignment.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/manifest.json",
      ".kiro/steering/llm/rules.json"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/RULES.md",
      "work/README.md",
      ".kiro/steering/workflow-guidelines/closure.md",
      ".kiro/steering/workflow-guidelines/packages.md",
      ".kiro/steering/workflow-guidelines/subagents.md",
      ".kiro/steering/workflow-guidelines/INDEX.md",
      "work/templates/work-package-template.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/llm/manifest.json",
      "work/packages/done-20260525-discovery-gate-workflow-alignment.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the active sprint goal of reliable LLM handoff and execution by adding a bounded way to perform lateral problem framing without creating a parallel workflow or weakening package validation."
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run steering:llm:pack",
        "npm run work:validate -- --entry work/packages/done-20260525-discovery-gate-workflow-alignment.md",
        "npm run work:validate -- --pre-impl work/packages/done-20260525-discovery-gate-workflow-alignment.md",
        "npm run work:validate -- --closure work/packages/done-20260525-discovery-gate-workflow-alignment.md",
        "git diff --check -- work/RULES.md work/README.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/workflow-guidelines/packages.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/INDEX.md work/templates/work-package-template.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260525-discovery-gate-workflow-alignment.md"
      ]
    }
  }
}
-->

## Why

LLMs are useful at lateral problem framing, but the current workflow only names
durable package, theory ledger, current-blocker, and proof surfaces. This
package adds one bounded Discovery Gate that tells future agents when broad
problem framing is package-local scratch and when it must promote into an
experiment, current-blocker change, or theory ledger entry.

## Scope Basis

Approved workflow-steering maintenance scope. The package changes only process
docs, workflow templates, generated steering packs, and this package record.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Discovery Gate

- Symptom / decision question: The workflow needs a way to use LLM lateral
  problem framing without turning exploratory thinking into conflicting package,
  ledger, current-blocker, or sub-agent truth.
- Current evidence: Existing docs define Core Logic Brief, Decision Experiment
  Gate, theory ledger, current-blocker, Execution Evidence, and optional
  support roles, but none define one package-local discovery surface.
- Candidate owners / boundaries: `work/RULES.md` owns binding process rules;
  `work/README.md` owns operating guidance; `.kiro/steering/workflow-guidelines/*`
  owns generated governance steering; package templates own future package shape.
- Competing hypotheses: add a new lane; add more theory-ledger use; add a
  package-local gate that promotes only when durable route truth changes.
- Cheapest discriminator: choose the option that preserves existing validation
  authority and does not create a second status or ledger system.
- Do not edit yet: runtime files, tests, roadmap status, active blocker routing
  beyond this package, or theory ledger entries.
- Selected route: add a package-local Discovery Gate and explicitly map its
  promotion paths to experiment/probe packages, current-blocker/successor truth,
  theory ledger, and Execution Evidence provenance.
- Promotion rule: no theory-ledger or current-blocker update is needed because
  this package only clarifies future workflow behavior and does not change a
  runtime route or representative blocker.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow-steering`
- Route boundary: `discovery-gate-holistic-problem-solving`
- Route dominant reason: `llm-lateral-problem-solving-structure`
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

1. work/RULES.md
2. work/README.md
3. .kiro/steering/workflow-guidelines/closure.md
4. .kiro/steering/workflow-guidelines/packages.md
5. .kiro/steering/workflow-guidelines/subagents.md
6. .kiro/steering/workflow-guidelines/INDEX.md
7. work/templates/work-package-template.md
8. work/templates/runtime-owner-package.md
9. work/templates/scenario-closure-package.md
10. work/packages/done-20260525-discovery-gate-workflow-alignment.md
11. .kiro/steering/llm/governance.md
12. .kiro/steering/llm/manifest.json
13. .kiro/steering/llm/rules.json

## Out Of Scope

1. src/
2. test/

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/RULES.md`, `work/README.md`, `.kiro/steering/workflow-guidelines/closure.md`, `.kiro/steering/workflow-guidelines/packages.md`, `.kiro/steering/workflow-guidelines/subagents.md`, `.kiro/steering/workflow-guidelines/INDEX.md`, `work/templates/work-package-template.md`, `work/templates/runtime-owner-package.md`, `work/templates/scenario-closure-package.md`, `work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `.kiro/steering/llm/governance.md`, `.kiro/steering/llm/manifest.json`, `.kiro/steering/llm/rules.json`
- Forbidden files: `src/`, `test/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run steering:llm:pack`, `npm run work:validate -- --entry work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `npm run work:validate -- --closure work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `git diff --check -- work/RULES.md work/README.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/workflow-guidelines/packages.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/INDEX.md work/templates/work-package-template.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260525-discovery-gate-workflow-alignment.md`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow-steering; files-changed: `work/RULES.md`, `work/README.md`, `.kiro/steering/workflow-guidelines/closure.md`, `.kiro/steering/workflow-guidelines/packages.md`, `.kiro/steering/workflow-guidelines/subagents.md`, `.kiro/steering/workflow-guidelines/INDEX.md`, `work/templates/work-package-template.md`, `work/templates/runtime-owner-package.md`, `work/templates/scenario-closure-package.md`, `.kiro/steering/llm/governance.md`, `.kiro/steering/llm/manifest.json`, `.kiro/steering/llm/rules.json`, `work/packages/done-20260525-discovery-gate-workflow-alignment.md`; validation: `npm run steering:llm:pack`, `npm run work:validate -- --entry work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `git diff --check -- work/RULES.md work/README.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/workflow-guidelines/packages.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/INDEX.md work/templates/work-package-template.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260525-discovery-gate-workflow-alignment.md`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow-steering; files-changed: none after verification; validation: `npm run work:validate -- --entry work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `npm run work:validate -- --pre-impl work/packages/done-20260525-discovery-gate-workflow-alignment.md`, `git diff --check -- work/RULES.md work/README.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/workflow-guidelines/packages.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/INDEX.md work/templates/work-package-template.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260525-discovery-gate-workflow-alignment.md`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `work/packages/done-20260525-discovery-gate-workflow-alignment.md`; validation: `npm run work:repair`; outcome: validated.
- theory ledger: no ledger update; reason: package-local workflow guidance did not create durable runtime route knowledge.

## Validation

1. npm run steering:llm:pack
2. npm run work:validate -- --entry work/packages/done-20260525-discovery-gate-workflow-alignment.md
3. npm run work:validate -- --pre-impl work/packages/done-20260525-discovery-gate-workflow-alignment.md
4. npm run work:validate -- --closure work/packages/done-20260525-discovery-gate-workflow-alignment.md
5. git diff --check -- work/RULES.md work/README.md .kiro/steering/workflow-guidelines/closure.md .kiro/steering/workflow-guidelines/packages.md .kiro/steering/workflow-guidelines/subagents.md .kiro/steering/workflow-guidelines/INDEX.md work/templates/work-package-template.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md .kiro/steering/llm/governance.md .kiro/steering/llm/rules.json .kiro/steering/llm/manifest.json work/packages/done-20260525-discovery-gate-workflow-alignment.md
