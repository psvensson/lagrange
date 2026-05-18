# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "lane": "scenario-release-gate",
  "scenario": "scenario-name",
  "artifact": "path/to/latest.report.json",
  "playback": "path/to/playback",
  "owner": "current_semantic_owner",
  "boundary": "current_owner_boundary",
  "dominantReason": "current_dominant_reason",
  "currentState": "one-line current state",
  "nextAction": "focused missing-edge probe",
  "proof": [
    "missing-edge probe",
    "focused owner tests",
    "affected presentation tests",
    "representative scenario rerun"
  ],
  "writeScope": [
    "src/example.js",
    "test/example.test.js"
  ],
  "handoffFiles": [
    "path/to/latest.report.json",
    "path/to/playback"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/example.js",
    "test/example.test.js",
    "work/packages/active-YYYYMMDD-package.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "causal model contradicts package hypothesis",
      "new owner boundary becomes dominant",
      "implementation requires unrelated owners"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If this package is correct, the named causal edge will reduce, migrate, or converge.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- path/to/latest.report.json",
    "expectedCausalModelChange": "edge disappears, reduced evidence, named migration, or contradiction",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "residual scenario debt",
    "crossBoundaryReview": "required-before-implementation"
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "named scenario or focused blocker probe",
    "phaseChain": [
      "phase one",
      "phase two"
    ],
    "currentFirstFrontier": "owner / boundary / reason",
    "knownDownstreamBlockers": [
      "downstream owner / boundary / reason"
    ],
    "missingCausalEdge": "unproven handoff, wake, retry, visibility, or budget edge",
    "missingCausalEdgeProbe": "npm test -- path/to/focused-probe.test.js",
    "boundedProgressProof": "focused proof of wake/retry/timeout/reconcile/drain progress",
    "boundedProgressProofArtifact": "path/to/focused-probe.test.js",
    "expectedObservableTransition": "before state -> after state or named classification",
    "maxProgressBound": "maximum retry/timer/dispatch bound before fallback",
    "sameFrontierFallback": "same-frontier action",
    "expectedNextFrontier": "expected next owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "most recent owner / boundary / result",
      "previous related owner / boundary / result"
    ],
    "oscillationCheck": "state whether the frontier returned to or alternated with a recently closed related boundary",
    "handoffInvariant": "producer outcome + consumer precondition + freshness/revision/ack edge"
  },
  "predecessor": "work/packages/done-predecessor.md"
}
-->

## Why

Describe the representative blocker and why this package owns the current first
frontier.

## Lane

- Selected lane: scenario/release-gate
- Representative scenario or blocker probe:
- Current owner:
- Current boundary:
- Current dominant reason:

## Core Logic Brief

- Canonical outcome:
- Inputs/signals:
- State model or invariant:
- Non-goals and forbidden interpretations:
- Proof mapping:
- Wrong-slice trigger:

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits:
   `npm run work:package:doctor -- --suggest <package>`,
   `npm run work:package:doctor -- --fix-dry-run <package>`,
   `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence:
   `npm run work:evidence-summary -- <artifact>` plus any focused extractor
   for this failure class.
3. Owner discovery:
   `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing:
   `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup:
   `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## Classification-Only Fast Path

Use when focused proof classifies the current edge and no runtime, test, script,
or report edit is justified.

- Metadata result: `classification-only`
- `writeScope` / `commitScope`: package, sprint, tracker, ledger, or handoff
  docs only
- Possible implementation files: `candidateRuntimeFiles`
- Proof cap: two or three canonical commands
- Subagents/static runtime guardrails: optional until implementation write
  scope is promoted
- Reuse of the same unchanged artifact: close and rerun evidence, or escalate
  if owner/boundary, package class, or stop condition did not change

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason:
- Artifact budget: `one-artifact`
- Proof command budget: `two-or-three-canonical-commands`
- Commands:
  1. Representative evidence or route command
  2. Focused extractor/probe
  3. Validation or causal-model proof
- Decision record:
- Successor action:
- Runtime promotion rule: stable owner/boundary local-fix routes open a
  `runtime-owner-boundary` successor; do not open another classifier from the
  same unchanged artifact.

## Expected Representative Delta

- Baseline artifact:
- Expected metric, owner, boundary, dominant reason, or route delta:
- Local proof class:
- Representative proof class:
- Stop if unchanged:

## Rerun Decision Gate

- Source artifact:
- Route owner:
- Route boundary:
- Route dominant reason:
- Route causal outcome:
- Stop mode:
- Next lane:
- Required after rerun: route-after-rerun, Sprint Strategy Brief update,
  Current Edge Card update, `npm run work:current-blocker -- --write`, and
  `npm run work:validate -- --pre-impl`.

## Scope

In scope:

1. Current missing causal edge.
2. Focused owner proof.
3. Affected presentation proof.
4. Representative proof after focused proof.

Out of scope:

1. Downstream blockers until the current first frontier reduces or migrates.
2. Presentation-only relabeling that hides owner-boundary evidence.
3. Pro or Enterprise behavior unless explicitly AGPL-scoped.

## Subagent Sequencing Ledger

Required before implementation starts.
Use `npm run work:validate -- --pre-impl` before implementation and
`npm run work:validate -- --closure` before close/commit. Before closure only,
unavailable delegation may be recorded as `human-waived`,
`tool-unavailable`, or `blocked-by-environment-policy` with `reason: ...`;
closure still requires complete real proof unless human policy explicitly
changes the package.

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed <predecessor package>;
      result `<clean|fixes-required>`.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed <predecessor package>, or `not-needed`
      only when review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented <this package>;
      parent revalidated focused proof: yes.

## Subagent Progress Ledger

Required with the sequencing ledger. Each real subagent appends one checked
update after every completed subtask; the Sequencing Ledger remains the
role-completion proof.

- [ ] Agent <name> (<agent-id>) <role> context loaded: scope and blocker confirmed; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> probe complete: state/cause confirmed or contradicted; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> validation complete: package proof refreshed; evidence: commands and results; next: final handoff or successor action.

## Subagent Attempt Ledger

Required with the sequencing ledger. Every real subagent attempt records the
latest checkpoint, validation state, parent action, and recovery decision.
Interrupted or partial-unvalidated attempts must be followed by a checked
superseded/discarded/revalidated line before closure.

- [ ] Agent <name> (<agent-id>) <role> attempt: status: <started|running|interrupted|partial-unvalidated|validated|superseded>; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> attempt: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Static Drift Ledger

Preflight:

- [ ] Relevant owner-boundary guardrails selected and recorded.
- [ ] Inherited write-scope debt classified.

Closure:

- [ ] Same guardrails rerun.
- [ ] No relevant guardrail count increased.

## Causal Governance

- Causal hypothesis:
- Stop-condition check:
- Expected causal-model change:
- Representative outcome:
- Causal debt:
- Cross-boundary review:

## Scenario Causal Closure

- Reference scenario/probe:
- Phase chain:
- Current first frontier:
- Known downstream blockers:
- Missing causal edge:
- Missing causal edge probe:
- Bounded progress proof:
- Bounded progress proof artifact:
- Expected observable transition:
- Max progress bound:
- Same-frontier fallback:
- Expected next frontier:
- Result classification:
- Stop condition:

## Validation

1. Evidence summary:
2. Causal model check:
3. Missing-edge probe:
4. Focused owner tests:
5. Affected presentation tests:
6. Static guardrails:
7. Representative scenario or blocker probe:

## Commit And Push Ledger

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`
